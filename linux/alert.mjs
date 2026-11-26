#!/usr/bin/env node
// linux/alert.mjs -- send a FAIL (or a recovery) out of the box over HTTPS. No SMTP, no server of ours.
//
//   node linux/alert.mjs fail <job> <detail...>     a job failed
//   node linux/alert.mjs ok <job> [detail...]        a job recovered (sent only if a fail was sent before)
//   node linux/alert.mjs unit-failed <unit>          from systemd OnFailure=: <unit> is e.g. pexi-backup.service
//   node linux/alert.mjs test                        send a test fail then an ok, to prove the route works
//
// Routes (either or both; at least one is required, else this exits 3 and says so):
//   SHIN_HC_PING_KEY  Healthchecks.io project ping key. Each job is its own check, created on first use:
//                     POST https://hc-ping.com/<key>/pexi-<job>/fail?create=1 (body = the detail).
//                     Healthchecks emails when a check goes down and again after it recovers. This is the
//                     service scripts/deadman-probe.mjs already uses.
//   SHIN_ALERT_URL    any HTTPS endpoint that accepts a POST with a text body, e.g. https://ntfy.sh/<topic>
//                     (Title and Priority headers are sent, which ntfy understands).
//
// Exit: 0 delivered on every configured route, 1 a configured route failed, 3 no route configured.
// A local flag <health dir>/<job>.alerted records that a fail went out, so `ok` is silent (and costs no
// network call) unless there is something to clear.

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const JOB = /^[a-z][a-z0-9-]{0,40}$/;

/** `pexi-backup.service` -> `backup`; anything else is lower-cased and made safe. */
export function jobFromUnit(unit) {
  const base = String(unit).replace(/\.(service|timer)$/, '').replace(/^pexi-/, '');
  return base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'unit';
}

export function flagDir(env = process.env) {
  return env.SHIN_HEALTH_DIR || join(env.SHIN_DATA_DIR || '/var/lib/pexi', 'health');
}

/**
 * The HTTPS requests one alert makes. Pure: no network, no files.
 * @returns {{ route: string, url: string, init: RequestInit }[]}
 */
export function buildRequests({ job, ok, detail = '', env = process.env, host = hostname() }) {
  if (!JOB.test(job)) throw new Error(`bad job name: ${job}`);
  const text = (ok ? `RECOVERED ${job} on ${host}` : `FAILED ${job} on ${host}: ${detail}`).slice(0, 10_000);
  const reqs = [];
  const key = (env.SHIN_HC_PING_KEY || '').trim();
  if (key) {
    const url = `https://hc-ping.com/${encodeURIComponent(key)}/pexi-${job}${ok ? '' : '/fail'}?create=1`;
    reqs.push({ route: 'healthchecks', url, init: { method: 'POST', body: text, headers: { 'content-type': 'text/plain' } } });
  }
  const alertUrl = (env.SHIN_ALERT_URL || '').trim();
  if (alertUrl) {
    if (!alertUrl.startsWith('https://')) throw new Error('SHIN_ALERT_URL must be https://');
    reqs.push({ route: 'url', url: alertUrl, init: { method: 'POST', body: text, headers: { 'content-type': 'text/plain', Title: `Pexi ${ok ? 'recovered' : 'FAILED'}: ${job}`, Priority: ok ? 'default' : 'high', Tags: ok ? 'white_check_mark' : 'rotating_light' } } });
  }
  return reqs;
}

/** One request, three tries, 10 s each. Healthchecks answers 200 "OK"; any 2xx counts. */
async function post(req, fetchFn, sleepMs) {
  let last = 'no attempt';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetchFn(req.url, { ...req.init, signal: AbortSignal.timeout(10_000) });
      if (r.status >= 200 && r.status < 300) return { ok: true };
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (i < 2 && sleepMs) await new Promise((res) => setTimeout(res, sleepMs));
  }
  return { ok: false, why: last };
}

/**
 * Send one alert. `ok` is silent unless a fail was sent before (the flag file).
 * @returns {Promise<{ code: number, message: string }>}
 */
export async function sendAlert({ job, ok, detail = '', env = process.env, fetchFn = fetch, retryMs = 2000, force = false }) {
  const dir = flagDir(env);
  const flag = join(dir, `${job}.alerted`);
  if (ok && !force && !existsSync(flag)) return { code: 0, message: `${job}: nothing to clear` };
  const reqs = buildRequests({ job, ok, detail, env });
  if (!reqs.length) return { code: 3, message: `NO ALERT ROUTE: set SHIN_HC_PING_KEY or SHIN_ALERT_URL in /etc/pexi/pexi.env (could not report ${ok ? 'recovery' : 'failure'} of ${job}: ${detail})` };
  const bad = [];
  for (const r of reqs) {
    const res = await post(r, fetchFn, retryMs);
    if (!res.ok) bad.push(`${r.route}: ${res.why}`);
  }
  if (bad.length) {
    // A route that failed leaves the flag unset on a fail, so the next failure tries again from scratch.
    return { code: 1, message: `alert for ${job} not delivered on: ${bad.join('; ')}` };
  }
  try {
    mkdirSync(dir, { recursive: true });
    if (ok) rmSync(flag, { force: true });
    else writeFileSync(flag, `${new Date().toISOString()} ${String(detail).slice(0, 500)}\n`);
  } catch { /* the flag is an optimisation; the alert itself was delivered */ }
  return { code: 0, message: `${ok ? 'recovery' : 'FAIL'} for ${job} sent via ${reqs.map((r) => r.route).join(' + ')}` };
}

/** What systemd knows about a failed unit: its last journal lines, for the body of the alert. */
function unitDetail(unit) {
  const r = spawnSync('journalctl', ['-u', unit, '-n', '15', '--no-pager', '-o', 'cat'], { encoding: 'utf8', timeout: 15_000 });
  const tail = (r.stdout || '').trim().split('\n').slice(-12).join(' | ');
  return `${unit} failed. Last log lines: ${tail || '(none readable)'}`;
}

async function main(argv) {
  const [cmd, a, ...rest] = argv;
  let res;
  if (cmd === 'fail' && a) res = await sendAlert({ job: a, ok: false, detail: rest.join(' ') || 'no detail' });
  else if (cmd === 'ok' && a) res = await sendAlert({ job: a, ok: true, detail: rest.join(' ') });
  else if (cmd === 'unit-failed' && a) res = await sendAlert({ job: jobFromUnit(a), ok: false, detail: unitDetail(a) });
  else if (cmd === 'test') {
    const first = await sendAlert({ job: 'alert-test', ok: false, detail: 'test alert from linux/alert.mjs: if you can read this, FAIL alerts reach you' });
    console.log(first.message);
    if (first.code !== 0) return first.code;
    res = await sendAlert({ job: 'alert-test', ok: true, force: true });
  } else {
    console.error('usage: alert.mjs fail <job> <detail...> | ok <job> | unit-failed <unit> | test');
    return 2;
  }
  (res.code === 0 ? console.log : console.error)(res.message);
  return res.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  // Read an env file named by PEXI_ENV_FILE when run by hand (systemd has already loaded it for units).
  const f = process.env.PEXI_ENV_FILE;
  if (f && existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(`alert.mjs: ${e.message}`); process.exitCode = 1; });
}
