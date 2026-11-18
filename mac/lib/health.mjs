// mac/lib/health.mjs
//
// The one place every Mac job reports "I worked" or "I failed" so a failure is
// never only a line in a log (FIX-BRIEF: unattended jobs fail loudly).
//
// What it writes, per job (names: backup, offsite, restore-test, integrity, disk,
// certs, checker, logrotate):
//   <health dir>/<job>.json     {"job","ok","at","detail","host"}   always rewritten
//   <health dir>/<job>.FAILED   exists ONLY while the job is failing (text: time + detail)
//   <state dir>/shin-<job>-failed   the same flag in ~/.worker-state, the folder the Mac's
//                                   health email script (outside this repo) already reads
//                                   for shin-checker-stopped
// and, on the first failure of a streak, one mailbox message to the PC (best effort,
// 60 s limit, never blocks or fails the job that called it).
//
// Health dir: SHIN_HEALTH_DIR, else $SHIN_DATA_DIR/health, else ~/shin-data/health.
// The server's /api/health handler (fix-watch lane) reads this folder: any *.FAILED file
// means red; <job>.json "at" older than the job's period means the job stopped running.
//
// CLI:  node health.mjs ok <job> [detail...]
//       node health.mjs fail <job> [detail...]
//       node health.mjs status            prints every job's last line, exits 1 if any FAILED

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const JOB = /^[a-z][a-z0-9-]{0,31}$/;

export function healthDir(env = process.env) {
  return env.SHIN_HEALTH_DIR || join(env.SHIN_DATA_DIR || join(homedir(), 'shin-data'), 'health');
}

export function stateDir(env = process.env) {
  return env.WORKER_STATEDIR || join(homedir(), '.worker-state');
}

function atomicWrite(file, text) {
  const tmp = `${file}.tmp${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function defaultNotify(job, detail, env) {
  if (env.SHIN_HEALTH_MAIL === 'off') return 'mail off';
  const mailbox = env.SHIN_MAILBOX_DIR || join(homedir(), 'claude-mailbox');
  const mail = join(mailbox, 'mail.mjs');
  if (!existsSync(mail)) return 'no mailbox';
  const r = spawnSync(process.execPath, [mail, 'send', '--to', 'pc', '--subject', `MAC JOB FAILED: ${job}`, '--body', detail.slice(0, 1500)], {
    timeout: 60e3,
    stdio: 'ignore',
  });
  return r.status === 0 ? 'mailed' : `mail failed (${r.status ?? r.signal})`;
}

/**
 * Record one result. Returns { wasFailed, notified }.
 * A failure writes the marker BEFORE trying to mail, so a broken mailbox never hides it.
 */
export function record({ job, ok, detail = '', extra = null, env = process.env, now = new Date(), notify = defaultNotify }) {
  if (!JOB.test(job)) throw new Error(`bad job name: ${job}`);
  const dir = healthDir(env);
  const flagDir = stateDir(env);
  mkdirSync(dir, { recursive: true });
  const failedFile = join(dir, `${job}.FAILED`);
  const flag = join(flagDir, `shin-${job}-failed`);
  const wasFailed = existsSync(failedFile);
  const at = now.toISOString();
  atomicWrite(join(dir, `${job}.json`), JSON.stringify({ job, ok: !!ok, at, detail: String(detail).slice(0, 2000), host: hostname(), ...(extra ?? {}) }) + '\n');
  let notified = null;
  if (ok) {
    rmSync(failedFile, { force: true });
    rmSync(flag, { force: true });
  } else {
    atomicWrite(failedFile, `${at} ${job} FAILED: ${detail}\n`);
    try {
      mkdirSync(flagDir, { recursive: true });
      atomicWrite(flag, `${at} ${detail}\n`);
    } catch {}
    if (!wasFailed) {
      try {
        notified = notify(job, detail, env);
      } catch (e) {
        notified = `notify threw: ${e.message}`;
      }
    }
  }
  return { wasFailed, notified };
}

export function status(env = process.env) {
  const dir = healthDir(env);
  const rows = [];
  if (!existsSync(dir)) return rows;
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      rows.push({ ...j, failed: existsSync(join(dir, `${j.job}.FAILED`)) });
    } catch {
      rows.push({ job: f.replace(/\.json$/, ''), ok: false, at: null, detail: 'unreadable marker', failed: true });
    }
  }
  return rows;
}

function main(argv) {
  const [cmd, job, ...rest] = argv;
  if (cmd === 'status') {
    const rows = status();
    for (const r of rows) console.log(`${r.failed ? 'FAILED' : 'ok    '} ${r.job.padEnd(14)} ${r.at ?? '-'} ${r.detail ?? ''}`);
    if (!rows.length) console.log('no markers yet');
    return rows.some((r) => r.failed) ? 1 : 0;
  }
  if ((cmd === 'ok' || cmd === 'fail') && job) {
    const r = record({ job, ok: cmd === 'ok', detail: rest.join(' ') });
    if (cmd === 'fail') console.error(`health: ${job} FAILED recorded (${r.notified ?? 'already failing, not re-mailed'})`);
    return 0;
  }
  console.error('usage: health.mjs ok|fail <job> [detail...] | status');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
