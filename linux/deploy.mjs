// linux/deploy.mjs -- the deploy checker for the Linux server (twin of mac/deploy/checker.mjs + deployer.mjs).
//
// Run every 30 s by pexi-deploy.timer (one at a time: the unit wraps it in flock). One run:
//   1. write the `checker` heartbeat marker (the server's /api/health reads it: no heartbeat for 30 min = a warning)
//   2. ask the remote what main is. Same as the commit running live, held, or already failed: stop there.
//   3. stage: fetch, check the commit out in /opt/pexi/stage, `npm ci` where a lockfile changed, build the camera
//      bundle, run THE SAME gate the Mac runs (gateJobs from mac/deploy/lib.mjs: app tests, typecheck, spine,
//      identify, catalogue, price, bench, and the three script folders). Red: live is not touched, the commit is
//      remembered as failed (not retried by itself), and a FAIL goes out over HTTPS.
//   4. green: check the same commit out in /opt/pexi/live, install and build there, restart pexi-server, then
//      require what the Mac requires (healthy from a process started after the restart, the same process 30 s
//      later, one real catalogue search inside 5 s, the public address showing the same process when
//      SHIN_DEPLOY_CHECK_PUBLIC=1, live at the expected commit, the server running from live/app).
//      Anything fails: live goes back to the last good commit, the server restarts on it, and a FAIL goes out.
//   5. success: the commit becomes `last-good` (state/last-good); the one before it is kept as `previous`.
//
// Hold: `touch /opt/pexi/state/HOLD` stops deploys (you are changing the server by hand); remove it to resume.
// Force a retry of a failed commit: `rm /opt/pexi/state/failed.json`.
//
// Environment: NOT the server's. The children (npm, tests) get a bare environment so no test can see live data
// paths or a secret. This file reads only PORT, SHIN_TUNNEL_HOSTNAME, SHIN_INVITE_CODE/SHIN_INVITES,
// SHIN_DEPLOY_REMOTE and SHIN_DEPLOY_CHECK_PUBLIC from /etc/pexi/pexi.env, plus the alert keys for the FAIL message.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { failingTests, gateJobs, healthGood, searchAnswered, summarizeFailures } from '../mac/deploy/lib.mjs';
import { record } from '../mac/lib/health.mjs';

const ENV_FILE = process.env.PEXI_ENV_FILE || '/etc/pexi/pexi.env';
const ROOT = process.env.PEXI_ROOT || '/opt/pexi';
const LIVE = join(ROOT, 'live');
const STAGE = process.env.SHIN_STAGE_DIR || join(ROOT, 'stage');
const STATE = join(ROOT, 'state');
const DATA = process.env.PEXI_DATA || '/var/lib/pexi';
const OVERLAY = join(DATA, 'deploy', 'repo-overlay');
const UNIT = 'pexi-server.service';
const PACKAGES = ['spine', 'catalogue', 'identify', 'price', 'app'];

// The Mac's timeouts (mac/deploy/deployer.mjs), unchanged.
const T = { fetch: 120e3, npmCi: 15 * 60e3, eye: 6 * 60e3, test: 8 * 60e3, typecheck: 5 * 60e3, pkgTest: 4 * 60e3, scriptTest: 12 * 60e3, restart: 30e3, localHealth: 120e3, tunnelHealth: 60e3, settle: 30e3, warmSearch: 240e3 };
// The box has 4 cores and 8 GB: the Mac ran the whole gate side by side; here two jobs at a time.
const GATE_PARALLEL = Number(process.env.PEXI_GATE_PARALLEL || 2);

const short = (s) => String(s ?? '').slice(0, 8);
const stamp = () => new Date().toISOString();
const log = (m) => console.log(`${stamp()} ${m}`);

/** Parse the KEY=VALUE env file (the same plain format systemd reads). Never logs a value. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function readConfig() {
  let all = {};
  try { all = parseEnv(readFileSync(ENV_FILE, 'utf8')); } catch (e) { throw new Error(`cannot read ${ENV_FILE}: ${e.message}`); }
  const keep = ['PORT', 'SHIN_TUNNEL_HOSTNAME', 'SHIN_INVITE_CODE', 'SHIN_INVITES', 'SHIN_DEPLOY_REMOTE', 'SHIN_DEPLOY_CHECK_PUBLIC', 'SHIN_HC_PING_KEY', 'SHIN_ALERT_URL', 'SHIN_HEALTH_DIR'];
  const cfg = {};
  for (const k of keep) if (all[k] !== undefined) cfg[k] = all[k];
  return cfg;
}

// ---- state files -------------------------------------------------------------------------------------------------
const stateFile = (n) => join(STATE, n);
function readState(name, fallback = null) {
  try { return readFileSync(stateFile(name), 'utf8').trim(); } catch { return fallback; }
}
function writeState(name, text) {
  mkdirSync(STATE, { recursive: true });
  writeFileSync(stateFile(name), `${text}\n`);
}
const readFailed = () => { try { return JSON.parse(readFileSync(stateFile('failed.json'), 'utf8')); } catch { return {}; } };
function markFailed(sha, why) {
  const f = readFailed();
  f[sha] = { at: stamp(), why: String(why).slice(0, 500) };
  writeState('failed.json', JSON.stringify(f));
}

// ---- running things ----------------------------------------------------------------------------------------------
/** A bare environment for children: nothing from pexi.env, nothing secret (twin of mac/deploy/util.mjs childEnv). */
function childEnv(extra = {}) {
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME || '/home/pexi', LANG: 'C.UTF-8', CI: '1', NO_COLOR: '1' };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  return { ...env, ...extra };
}

/** Run a command with a hard timeout (kills the process group). Output goes to logFile; the tail comes back. */
export function run(cmd, args, { cwd, timeoutMs = 120e3, logFile, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: env ?? childEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const take = (b) => {
      const s = b.toString();
      out = (out + s).slice(-65536);
      if (logFile) { try { appendFileSync(logFile, s); } catch { /* the log is a convenience */ } }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 127, out: String(e.message), timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out, timedOut }); });
  });
}

async function git(dir, args, ms = 60e3) {
  const r = await run('git', ['-C', dir, ...args], { timeoutMs: ms });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.out.trim().slice(-200)}`);
  return r.out.trim();
}

// ---- prepare a checkout (stage or live): install where the lockfile changed, build the camera bundle -----------
const lockHash = (dir, pkg) => { try { return createHash('sha1').update(readFileSync(join(dir, pkg, 'package-lock.json'))).digest('hex'); } catch { return null; } };
const stampFile = (dir, pkg) => join(dir, pkg, 'node_modules', '.pexi-deploy-lock');
export function needInstall(dir) {
  return PACKAGES.filter((p) => {
    const h = lockHash(dir, p);
    if (!h) return false;
    try { return readFileSync(stampFile(dir, p), 'utf8').trim() !== h; } catch { return true; }
  });
}

async function prepare(dir, label, runDir) {
  for (const p of needInstall(dir)) {
    log(`${label}: npm ci in ${p} (lockfile changed)`);
    const r = await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: join(dir, p), timeoutMs: T.npmCi, logFile: join(runDir, `${label}-npm-ci-${p}.log`) });
    if (r.code !== 0) throw new Error(`${label}: npm ci in ${p} ${r.timedOut ? 'timed out' : 'failed'}`);
    mkdirSync(join(dir, p, 'node_modules'), { recursive: true });
    writeFileSync(stampFile(dir, p), lockHash(dir, p));
  }
  const r = await run('node', ['app/scripts/build-eye.mjs'], { cwd: dir, timeoutMs: T.eye, logFile: join(runDir, `${label}-build-eye.log`) });
  if (r.code !== 0) throw new Error(`${label}: camera bundle build ${r.timedOut ? 'timed out' : 'failed'}`);
  // Files a clean clone lacks and no build makes (detector model, offline packs, the embedding model cache):
  // copied in without overwriting. Without the embedding model the server crashes seconds after starting.
  if (existsSync(OVERLAY)) cpSync(OVERLAY, dir, { recursive: true, force: false, errorOnExist: false });
}

/** live/app/data/photos is a link to the data folder's photos (the Mac does the same). */
function linkPhotos() {
  const link = join(LIVE, 'app', 'data', 'photos');
  try {
    if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) return;
    if (existsSync(link)) return; // a real folder: leave it, the operator decides
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(join(DATA, 'photos'), link);
  } catch (e) {
    log(`could not link photos: ${e.message}`);
  }
}

// ---- the gate ----------------------------------------------------------------------------------------------------
async function gate(runDir) {
  const g = gateJobs(T);
  const exec = async (j) => ({ j, r: await run(j.cmd, j.args, { cwd: join(STAGE, j.cwd), timeoutMs: j.t, logFile: join(runDir, `test-${j.name.replace(/ /g, '-')}.log`) }) });
  // The app suite runs alone first (its teardown snapshots every package's data folder), exactly as on the Mac.
  const results = [await exec(g.first)];
  const queue = [...g.rest];
  const workers = Array.from({ length: Math.max(1, GATE_PARALLEL) }, async () => {
    while (queue.length) results.push(await exec(queue.shift()));
  });
  await Promise.all(workers);
  const red = results.filter((x) => x.r.code !== 0);
  if (!red.length) {
    const pass = (out) => Number((out.match(/^[ℹ#] pass (\d+)/m) ?? [])[1] ?? 0);
    return { ok: true, summary: `${results.reduce((n, x) => n + pass(x.r.out), 0)} tests passed, typecheck clean` };
  }
  return { ok: false, summary: red.map((x) => (x.r.timedOut ? `${x.j.name} timed out` : `${x.j.name}: ${summarizeFailures(failingTests(x.r.out), 3)}`)).join('; ') };
}

// ---- restart and verify (twin of restartAndCheck in mac/deploy/deployer.mjs) -------------------------------------
async function getJson(url, ms = 8e3, headers = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'cache-control': 'no-cache', ...headers } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function inviteCode(cfg) {
  const shared = cfg.SHIN_INVITE_CODE?.trim();
  if (shared) return shared;
  for (const part of (cfg.SHIN_INVITES ?? '').split(',')) {
    const i = part.indexOf(':');
    if (i > 0 && part.slice(i + 1).trim()) return part.slice(i + 1).trim();
  }
  return null;
}

async function systemctlShow(prop) {
  const r = await run('systemctl', ['show', UNIT, `--property=${prop}`, '--value'], { timeoutMs: 10e3 });
  return r.out.trim();
}

async function restartAndCheck(cfg, sha) {
  const local = `http://127.0.0.1:${cfg.PORT || 4173}/api/health`;
  const before = await getJson(local, 5e3);
  const restartAt = Date.now();
  const k = await run('sudo', ['-n', '/usr/bin/systemctl', 'restart', UNIT], { timeoutMs: T.restart + 10e3 });
  if (k.code !== 0) return { ok: false, reason: `systemctl restart failed: ${k.out.trim().slice(-150)}` };
  const waitHealthy = async () => {
    const until = Date.now() + T.localHealth;
    while (Date.now() < until) {
      await sleep(2000);
      const b = await getJson(local);
      if (healthGood(b, restartAt, before)) return b;
    }
    return null;
  };
  const first = await waitHealthy();
  if (!first) return { ok: false, reason: 'local health not good within 120 s' };
  // Healthy once, then crashed seconds later has happened (2026-09-14): the same process must still answer 30 s on.
  await sleep(T.settle);
  let s = null;
  for (let i = 0; i < 3 && !s; i++) s = await getJson(local, 10e3);
  if (!s || s.ok !== true || s.startedAt !== first.startedAt) {
    const res = await systemctlShow('Result');
    return { ok: false, reason: `server did not stay up for 30 s after its first healthy answer (systemd result: ${res || 'unknown'})` };
  }
  let note = 'catalogue not attached, no search check';
  if (first.catalogueUp === true) {
    const until = Date.now() + T.warmSearch;
    const code = inviteCode(cfg);
    let answered = null;
    let last = 'no answer';
    while (Date.now() < until && !answered) {
      const b = await getJson(`http://127.0.0.1:${cfg.PORT || 4173}/api/search?q=milk&limit=1`, 20e3, code ? { 'x-shin-invite': code } : {});
      if (searchAnswered(b)) answered = b; else { last = b ? `search took ${b.ms} ms` : 'no answer'; await sleep(5000); }
    }
    if (!answered) return { ok: false, reason: `no catalogue search answered within ${T.warmSearch / 1000} s (last: ${last})` };
    note = `catalogue search answered in ${answered.ms} ms`;
  }
  if (cfg.SHIN_DEPLOY_CHECK_PUBLIC === '1' && cfg.SHIN_TUNNEL_HOSTNAME) {
    let ok = false;
    const until = Date.now() + T.tunnelHealth;
    while (Date.now() < until && !ok) {
      const b = await getJson(`https://${cfg.SHIN_TUNNEL_HOSTNAME}/api/health`, 15e3);
      if (b && b.ok === true && b.startedAt === first.startedAt) ok = true; else await sleep(3000);
    }
    if (!ok) return { ok: false, reason: 'public address did not show the new process within 60 s' };
  }
  const head = await git(LIVE, ['rev-parse', 'HEAD']);
  const dirty = await git(LIVE, ['status', '--porcelain', '--untracked-files=no']);
  const pid = Number(await systemctlShow('MainPID'));
  let cwd = null;
  try { cwd = pid ? readlinkSync(`/proc/${pid}/cwd`) : null; } catch { /* not readable */ }
  if (head !== sha) return { ok: false, reason: `live is at ${short(head)}, expected ${short(sha)}` };
  if (dirty) return { ok: false, reason: 'live has modified tracked files' };
  if (cwd !== join(LIVE, 'app')) return { ok: false, reason: `server process runs from ${cwd ?? 'unknown'}, not ${join(LIVE, 'app')}` };
  return { ok: true, detail: `healthy, ${note}, pid ${pid} from live at ${short(sha)}` };
}

// ---- one deploy --------------------------------------------------------------------------------------------------
async function deploy(cfg, sha) {
  const runDir = join(STATE, 'runs', `${stamp().replace(/[:.]/g, '-')}-${short(sha)}`);
  mkdirSync(runDir, { recursive: true });
  const prev = readState('last-good');
  const subject = await git(STAGE, ['log', '-1', '--format=%s', sha]).catch(() => '');
  log(`deploying ${short(sha)} "${subject.slice(0, 60)}" (live is ${short(prev)})`);
  try {
    await git(STAGE, ['checkout', '--force', '--detach', sha], T.fetch);
    await prepare(STAGE, 'stage', runDir);
    const t = await gate(runDir);
    if (!t.ok) {
      markFailed(sha, t.summary);
      record({ job: 'deploy', ok: false, detail: `${short(sha)} red in stage, live untouched: ${t.summary}` });
      return;
    }
    log(`stage green: ${t.summary}`);
  } catch (e) {
    markFailed(sha, e.message);
    record({ job: 'deploy', ok: false, detail: `${short(sha)} could not be tested, live untouched: ${e.message}` });
    return;
  }
  // The holds are files, so a hold placed while tests ran is honoured before live is touched.
  if (existsSync(stateFile('HOLD'))) { log('tests green but HOLD is set; waiting for the next check'); return; }
  let liveTouched = false;
  try {
    liveTouched = true;
    await git(LIVE, ['fetch', 'origin', '--prune'], T.fetch);
    await git(LIVE, ['checkout', '--force', '--detach', sha], T.fetch);
    await prepare(LIVE, 'live', runDir);
    linkPhotos();
    const r = await restartAndCheck(cfg, sha);
    if (!r.ok) throw new Error(r.reason);
    if (prev && prev !== sha) writeState('previous', prev);
    writeState('last-good', sha);
    record({ job: 'deploy', ok: true, detail: `live ${short(sha)}: ${r.detail}` });
    log(`LIVE ${short(sha)}: ${r.detail}`);
    // The deploy checker cannot reload systemd (no root). Say so when the unit files changed.
    if (prev) {
      const changed = await git(LIVE, ['diff', '--name-only', prev, sha, '--', 'linux/systemd', 'linux/logrotate.conf']).catch(() => '');
      if (changed) record({ job: 'units-drift', ok: false, detail: `unit files changed in this deploy (${changed.split('\n').join(', ')}): run sudo bash ${LIVE}/linux/install-units.sh` });
    }
  } catch (e) {
    markFailed(sha, e.message);
    let tail = 'no earlier good commit to go back to';
    if (liveTouched && prev) {
      try {
        await git(LIVE, ['checkout', '--force', '--detach', prev], T.fetch);
        await prepare(LIVE, 'rollback', runDir);
        const rb = await restartAndCheck(cfg, prev);
        tail = rb.ok ? `rolled back to ${short(prev)}, server healthy` : `rolled back to ${short(prev)} but it is unhealthy too: ${rb.reason}`;
      } catch (e2) {
        tail = `ROLLBACK FAILED: ${e2.message}`;
      }
    }
    record({ job: 'deploy', ok: false, detail: `${short(sha)} failed after tests: ${e.message}; ${tail}` });
  }
}

// ---- the checker -------------------------------------------------------------------------------------------------
export async function main() {
  const cfg = readConfig();
  if (cfg.SHIN_HEALTH_DIR) process.env.SHIN_HEALTH_DIR = cfg.SHIN_HEALTH_DIR;
  for (const k of ['SHIN_HC_PING_KEY', 'SHIN_ALERT_URL']) if (cfg[k]) process.env[k] = cfg[k];
  process.env.SHIN_DATA_DIR ||= DATA;
  mkdirSync(STATE, { recursive: true });

  for (const d of [LIVE, STAGE]) {
    if (!existsSync(join(d, '.git'))) {
      record({ job: 'checker', ok: false, detail: `${d} is not a git clone: linux/CUTOVER.md step 3` });
      throw new Error(`${d} is not a git clone`);
    }
  }
  // First run on a box that was set up by hand: whatever live has checked out is the starting point.
  if (!readState('last-good')) writeState('last-good', await git(LIVE, ['rev-parse', 'HEAD']));

  const remote = cfg.SHIN_DEPLOY_REMOTE ? ['ls-remote', cfg.SHIN_DEPLOY_REMOTE, 'refs/heads/main'] : ['ls-remote', 'origin', 'refs/heads/main'];
  const ls = await run('git', ['-C', STAGE, ...remote], { timeoutMs: 45e3 });
  const head = ls.code === 0 ? ls.out.split(/\s/)[0] : '';
  if (!/^[0-9a-f]{40}$/.test(head)) {
    // A network blip is not an outage of the checker: it backs off by simply trying again in 30 s. Ten in a row (5 min) is loud.
    const n = Number(readState('ls-remote-fails', '0')) + 1;
    writeState('ls-remote-fails', String(n));
    record({ job: 'checker', ok: n < 10, detail: `git ls-remote failed ${n} time(s) in a row: ${ls.out.trim().slice(-120)}` });
    return;
  }
  writeState('ls-remote-fails', '0');
  record({ job: 'checker', ok: true, detail: `checked ${short(head)} at ${stamp()}`, extra: { live: readState('last-good'), lastCheckAt: stamp() } });

  const live = readState('last-good');
  if (head === live) return;
  if (existsSync(stateFile('HOLD'))) { log(`HOLD is set; main is ${short(head)}, live ${short(live)}`); return; }
  if (readFailed()[head]) return; // failed once: not queued again by itself
  // A deploy outlasts the 30-minute heartbeat limit the server enforces, so the heartbeat continues while it runs.
  const beat = setInterval(() => {
    try { record({ job: 'checker', ok: true, detail: `deploying ${short(head)}`, extra: { live, lastCheckAt: stamp() } }); } catch { /* heartbeat only */ }
  }, 60e3);
  try {
    await git(STAGE, ['fetch', 'origin', '--prune'], T.fetch);
    await deploy(cfg, head);
  } finally {
    clearInterval(beat);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    // Loud: the marker and the HTTPS alert, then a non-zero exit so the journal shows it too.
    try { record({ job: 'deploy', ok: false, detail: `deploy.mjs crashed: ${e.message}` }); } catch { /* nothing more can be done */ }
    console.error(`${stamp()} deploy.mjs crashed: ${e.stack || e.message}`);
    process.exitCode = 1;
  });
}
