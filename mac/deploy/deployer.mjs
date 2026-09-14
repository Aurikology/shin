// mac/deploy/deployer.mjs
//
// Started by the checker when the queue is non-empty and no deployer runs.
// Takes queue items one at a time, in order:
//   stage: fetch, check out, npm ci where a lockfile changed, build eye, tests + typecheck
//   red   -> live untouched, failing names posted
//   green -> (wait out any hold) live: check out, install, build, restart,
//            health locally + through the tunnel + running commit
//   unhealthy -> live back to the previous commit, restart, post that
// Every step is posted to the page as it happens.
//
//   node deployer.mjs              process the queue
//   node deployer.mjs --prepare DIR   install + build a clone (used at setup)

import { createHash } from 'node:crypto';
import { constants, cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { clean, expire, failingTests, finishDeploy, healthGood, itemLabel, searchAnswered, short, summarizeFailures, addLog } from './lib.mjs';
import { syncPage } from './sync.mjs';
import { PACKAGES, PATHS, existsSync, git, logTo, readConfig, run, sleep, tryLock, withState } from './util.mjs';

const OWNER = 'deployer';
const log = logTo('deployer');
const cfg = readConfig(['PORT', 'SHIN_TUNNEL_HOSTNAME', 'SHIN_INVITE_CODE', 'SHIN_INVITES']);
const UID = process.getuid();
const SERVER = `gui/${UID}/com.shin.server`;
// Gitignored files a clean clone lacks and no build step makes, laid out as
// repo paths: the optional detector model and the catalogue offline packs.
const OVERLAY = join(homedir(), 'shin-data', 'deploy', 'repo-overlay');

const T = {
  fetch: 120e3,
  npmCi: 15 * 60e3,
  eye: 6 * 60e3,
  test: 8 * 60e3,
  typecheck: 5 * 60e3,
  pkgTest: 4 * 60e3,
  restart: 30e3,
  localHealth: 120e3,
  tunnelHealth: 60e3,
  settle: 30e3,
  warmSearch: 240e3,
};

class StepFail extends Error {}

async function post(item, rawText, { logLine = true, app, restartWindow = false } = {}) {
  const text = clean(rawText, 220);
  log(`${itemLabel(item)}: ${text}`);
  await withState(OWNER, (st) => {
    const q = st.queue[0];
    if (!q || q.id !== item.id) return;
    q.step = text;
    if (item.resolved) q.resolved = item.resolved;
    if (app) st.app = app;
    if (restartWindow) st.restartWindowUntil = Date.now() + 6 * 60e3;
    if (logLine) addLog(st, Date.now(), `${q.who}'s deploy ${itemLabel(q)} · ${text}`);
  });
  await syncPage({ owner: OWNER, log });
}

const lockHash = (dir, pkg) => {
  try {
    return createHash('sha1').update(readFileSync(join(dir, pkg, 'package-lock.json'))).digest('hex');
  } catch {
    return null;
  }
};
const stampFile = (dir, pkg) => join(dir, pkg, 'node_modules', '.shin-deploy-lock');

/** Packages whose lockfile differs from what node_modules was installed from. */
export function needInstall(dir) {
  return PACKAGES.filter((p) => {
    const h = lockHash(dir, p);
    if (!h) return false;
    try {
      return readFileSync(stampFile(dir, p), 'utf8').trim() !== h;
    } catch {
      return true;
    }
  });
}

async function prepare(dir, label, runDir, item) {
  const pkgs = needInstall(dir);
  if (pkgs.length) {
    if (item) await post(item, `${label}: installing ${pkgs.join(', ')} (lockfile changed)`);
    for (const p of pkgs) {
      const r = await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: join(dir, p), timeoutMs: T.npmCi, logFile: join(runDir, `${label}-npm-ci-${p}.log`) });
      if (r.code !== 0) throw new StepFail(`${label}: npm ci in ${p} ${r.timedOut ? 'timed out' : 'failed'}`);
      mkdirSync(join(dir, p, 'node_modules'), { recursive: true });
      writeFileSync(stampFile(dir, p), lockHash(dir, p));
    }
  }
  if (item) await post(item, `${label}: building the camera bundle`, { logLine: false });
  const r = await run('node', ['app/scripts/build-eye.mjs'], { cwd: dir, timeoutMs: T.eye, logFile: join(runDir, `${label}-build-eye.log`) });
  if (r.code !== 0) throw new StepFail(`${label}: camera bundle build ${r.timedOut ? 'timed out' : 'failed'}`);
  // Existing files are kept (force: false) so this is cheap after the first
  // copy; copy-on-write clones on APFS cost no disk.
  if (existsSync(OVERLAY)) cpSync(OVERLAY, dir, { recursive: true, force: false, mode: constants.COPYFILE_FICLONE });
}

async function tests(runDir) {
  const jobs = [
    { name: 'app tests', cwd: 'app', args: ['test'], t: T.test },
    { name: 'app typecheck', cwd: 'app', args: ['run', 'typecheck'], t: T.typecheck },
    // price tests take ~97 s against ~1 s for the others, so they are left out.
    ...['spine', 'identify', 'catalogue'].map((p) => ({ name: `${p} tests`, cwd: p, args: ['test'], t: T.pkgTest })),
  ];
  const results = await Promise.all(
    jobs.map(async (j) => ({ j, r: await run('npm', j.args, { cwd: join(PATHS.stage, j.cwd), timeoutMs: j.t, logFile: join(runDir, `test-${j.name.replace(' ', '-')}.log`) }) })),
  );
  const red = results.filter((x) => x.r.code !== 0);
  const passCount = (out) => Number((out.match(/^[ℹ#] pass (\d+)/m) ?? [])[1] ?? 0);
  if (!red.length) {
    const passed = results.reduce((n, x) => n + passCount(x.r.out), 0);
    return { ok: true, summary: `${passed} tests passed, typecheck clean` };
  }
  const parts = red.map((x) => (x.r.timedOut ? `${x.j.name} timed out` : `${x.j.name}: ${summarizeFailures(failingTests(x.r.out), 3)}`));
  return { ok: false, summary: parts.join('; ') };
}

async function getJson(url, ms = 8e3) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const localUrl = () => `http://127.0.0.1:${cfg.PORT || 4173}/api/health`;

/** The invite code the server accepts (never logged), for the warm-up search. */
function inviteCode() {
  const shared = cfg.SHIN_INVITE_CODE?.trim();
  if (shared) return shared;
  for (const part of (cfg.SHIN_INVITES ?? '').split(',')) {
    const i = part.indexOf(':');
    if (i > 0 && part.slice(i + 1).trim()) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * One real catalogue text search against the new process, repeated until it
 * answers inside the server's 5 s search timeout (T.warmSearch in all). A text
 * search makes no model call and writes no scan.
 */
async function warmSearch() {
  const until = Date.now() + T.warmSearch;
  const code = inviteCode();
  let last = 'no answer';
  let tries = 0;
  while (Date.now() < until) {
    tries++;
    try {
      const res = await fetch(`http://127.0.0.1:${cfg.PORT || 4173}/api/search?q=milk&limit=1`, {
        signal: AbortSignal.timeout(20e3),
        headers: { 'cache-control': 'no-cache', ...(code ? { 'x-shin-invite': code } : {}) },
      });
      const b = res.ok ? await res.json() : null;
      if (searchAnswered(b)) return { ok: true, ms: b.ms, tries };
      last = b ? (b.error ? `search error "${clean(b.error, 60)}"` : `search took ${b.ms} ms`) : `HTTP ${res.status}`;
    } catch (e) {
      last = e.name === 'TimeoutError' ? 'search request timed out' : 'search request failed';
    }
    await sleep(5000);
  }
  return { ok: false, reason: `no catalogue search answered within ${T.warmSearch / 1000} s (${tries} tries, last: ${last})` };
}
const tunnelUrl = () => (cfg.SHIN_TUNNEL_HOSTNAME ? `https://${cfg.SHIN_TUNNEL_HOSTNAME}/api/health` : null);

async function serverPidCwd() {
  const p = await run('launchctl', ['print', SERVER], { timeoutMs: 10e3 });
  const pid = Number((p.out.match(/^\s*pid = (\d+)/m) ?? [])[1] ?? 0);
  if (!pid) return { pid: 0, cwd: null };
  const l = await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeoutMs: 10e3 });
  return { pid, cwd: (l.out.match(/^n(.+)$/m) ?? [])[1] ?? null };
}

/** launchd's last exit status for the server: negative = killed by that signal, positive = exit code. */
async function lastExitStatus() {
  const r = await run('launchctl', ['list'], { timeoutMs: 10e3 });
  const line = r.out.split('\n').find((l) => /\scom\.shin\.server$/.test(l));
  const v = line ? Number(line.split(/\s+/)[1]) : NaN;
  return Number.isFinite(v) ? v : null;
}

async function restartAndCheck(sha, before) {
  const restartAt = Date.now();
  const k = await run('launchctl', ['kickstart', '-k', SERVER], { timeoutMs: T.restart });
  if (k.code !== 0) return { ok: false, reason: 'launchctl kickstart failed' };
  const waitHealthy = async () => {
    const until = Date.now() + T.localHealth;
    while (Date.now() < until) {
      await sleep(2000);
      const b = await getJson(localUrl());
      if (healthGood(b, restartAt, before)) return b;
    }
    return null;
  };
  let local = await waitHealthy();
  if (!local) return { ok: false, reason: 'local health not good within 120 s' };
  // A server can answer health and then crash seconds later (the catalogue
  // worker's model load did exactly that on 2026-09-14): same process 30 s on.
  // A different process is a crash only if launchd saw an exit code; a
  // signal means someone restarted it by hand (which on 2026-09-14 made this
  // check roll back a good deploy), so the new process is checked instead.
  let stable = false;
  for (let round = 0; round < 3 && !stable; round++) {
    await sleep(T.settle);
    let s = null;
    for (let i = 0; i < 3 && !s; i++) s = await getJson(localUrl(), 10e3);
    if (s && s.ok === true && s.startedAt === local.startedAt) {
      stable = true;
      break;
    }
    const exit = await lastExitStatus();
    if (exit === null || exit >= 0) {
      return { ok: false, reason: `server did not stay up for 30 s after its first healthy answer (last exit ${exit ?? 'unknown'})` };
    }
    log(`server was restarted from outside (signal ${-exit}) during the settle check; checking the new process`);
    local = await waitHealthy();
    if (!local) return { ok: false, reason: 'after an outside restart, local health not good within 120 s' };
  }
  if (!stable) return { ok: false, reason: 'server kept being replaced during the settle check' };
  let searchNote = 'catalogue not attached, no search check';
  if (local.catalogueUp === true) {
    const w = await warmSearch();
    if (!w.ok) return { ok: false, reason: w.reason };
    searchNote = `catalogue search answered in ${w.ms} ms (try ${w.tries})`;
    const again = await getJson(localUrl(), 10e3);
    if (!again || again.startedAt !== local.startedAt) return { ok: false, reason: 'server process changed during the catalogue search check' };
  }
  const tu = tunnelUrl();
  let tunnelOk = !tu;
  const tUntil = Date.now() + T.tunnelHealth;
  while (tu && Date.now() < tUntil) {
    const b = await getJson(tu, 15e3);
    if (b && b.ok === true && b.startedAt === local.startedAt) {
      tunnelOk = true;
      break;
    }
    await sleep(3000);
  }
  if (!tunnelOk) return { ok: false, reason: `public address did not show the new process within 60 s` };
  const head = await git(PATHS.live, ['rev-parse', 'HEAD']);
  const dirty = await git(PATHS.live, ['status', '--porcelain', '--untracked-files=no']);
  const { pid, cwd } = await serverPidCwd();
  const wantCwd = join(PATHS.live, 'app');
  if (head !== sha) return { ok: false, reason: `live is at ${short(head)}, expected ${short(sha)}` };
  if (dirty) return { ok: false, reason: 'live has modified tracked files' };
  if (cwd !== wantCwd) return { ok: false, reason: `server process runs from ${cwd ?? 'unknown'}, not ${wantCwd}` };
  return {
    ok: true,
    startedAt: local.startedAt,
    detail: `healthy locally and at ${cfg.SHIN_TUNNEL_HOSTNAME ?? 'no tunnel'}, ${searchNote}, pid ${pid} started ${local.startedAt.slice(11, 19)} from shin-live at ${short(sha)}`,
  };
}

async function waitForHolds(item) {
  let shown = '';
  for (;;) {
    const holds = await withState(OWNER, (st) => {
      expire(st, Date.now());
      return st.holds.map((h) => h.who);
    });
    if (!holds.length) return;
    const names = holds.join(', ');
    if (names !== shown) {
      shown = names;
      await post(item, `tests green; waiting for the hold by ${names}`);
    }
    await sleep(20e3);
  }
}

async function deploy(item) {
  const runDir = join(PATHS.runs, `${new Date().toISOString().replace(/[:.]/g, '-')}-${item.id}`);
  mkdirSync(runDir, { recursive: true });
  let sha = null;
  let subject = '';
  let head = null;
  let prev = null;
  let liveTouched = false;
  const appBefore = await withState(OWNER, (st) => st.app);
  try {
    await post(item, 'started: fetching from GitLab');
    await git(PATHS.stage, ['fetch', 'origin', '--prune'], T.fetch);
    head = await git(PATHS.stage, ['rev-parse', 'origin/main']);
    if (item.commit === 'latest') sha = head;
    else {
      try {
        sha = await git(PATHS.stage, ['rev-parse', '--verify', `${item.commit}^{commit}`]);
      } catch {
        throw new StepFail(`commit ${item.commit} not found on GitLab`);
      }
    }
    item.resolved = sha;
    subject = await git(PATHS.stage, ['log', '-1', '--format=%s', sha]);
    const live = await withState(OWNER, (st) => st.live);
    prev = live?.commit ?? (await git(PATHS.live, ['rev-parse', 'HEAD']));
    // Already live: skipped for an unrequested push, or for a request that a
    // deploy finishing after it already satisfied. Any other request runs the
    // whole pipeline (it may be asking for a restart).
    const satisfied = item.unrequested || (live?.at ?? 0) > item.requestedAt;
    if (satisfied && live?.commit === sha && (await getJson(localUrl()))?.ok === true) {
      return { ok: true, sha, subject, head, detail: 'already live, no restart' };
    }

    await post(item, `stage: checking out ${short(sha)} "${subject.slice(0, 50)}"`, { app: { kind: 'updating', label: short(sha), since: Date.now() } });
    await git(PATHS.stage, ['checkout', '--force', '--detach', sha]);
    await prepare(PATHS.stage, 'stage', runDir, item);
    await post(item, 'stage: running tests and typecheck');
    const t = await tests(runDir);
    if (!t.ok) throw new StepFail(`tests red, live untouched: ${t.summary}`);
    await post(item, `stage green: ${t.summary}`);

    await waitForHolds(item);

    const before = await getJson(localUrl());
    await post(item, `live: checking out ${short(sha)} (was ${short(prev)})`);
    liveTouched = true;
    await git(PATHS.live, ['fetch', 'origin', '--prune'], T.fetch);
    await git(PATHS.live, ['checkout', '--force', '--detach', sha]);
    await prepare(PATHS.live, 'live', runDir, item);
    await post(item, 'live: restarting the server', { app: { kind: 'restarting', since: Date.now() }, restartWindow: true });
    const r = await restartAndCheck(sha, before);
    if (r.ok) return { ok: true, sha, subject, head, detail: r.detail, startedAt: r.startedAt, app: { kind: 'ready', commit: sha, since: Date.now() } };
    throw new StepFail(`health check failed after restart: ${r.reason}`);
  } catch (e) {
    const reason = e instanceof StepFail ? e.message : `unexpected: ${e.message}`;
    log(`${itemLabel(item)} failed: ${reason}`);
    if (!liveTouched) return { ok: false, sha, reason, app: appBefore ?? null };
    try {
      await post(item, `${reason}; rolling back live to ${short(prev)}`, { app: { kind: 'restarting', since: Date.now() }, restartWindow: true });
      await git(PATHS.live, ['checkout', '--force', '--detach', prev]);
      await prepare(PATHS.live, 'rollback', runDir, null);
      const rb = await restartAndCheck(prev, null);
      return {
        ok: false,
        sha,
        reason: `${reason}; rolled back to ${short(prev)}${rb.ok ? ', server healthy' : `, rollback unhealthy too: ${rb.reason}`}`,
        startedAt: rb.startedAt,
        app: rb.ok ? { kind: 'ready', commit: prev, since: Date.now() } : { kind: 'down', since: Date.now(), reason: `rollback unhealthy: ${rb.reason}` },
      };
    } catch (e2) {
      return { ok: false, sha, reason: `${reason}; ROLLBACK FAILED: ${e2.message}`, app: { kind: 'down', since: Date.now(), reason: 'rollback failed' } };
    }
  }
}

async function main() {
  if (process.argv[2] === '--prepare') {
    const dir = process.argv[3];
    const runDir = join(PATHS.runs, `prepare-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });
    await prepare(dir, 'prepare', runDir, null);
    console.log(`prepared ${dir}`);
    return;
  }
  const lock = tryLock('deployer', OWNER);
  if (!lock) return;
  process.on('exit', () => lock.release());
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => process.exit(1));
  log('deployer started');
  try {
    for (;;) {
      const item = await withState(OWNER, (st) => (st.queue[0] ? { ...st.queue[0] } : null));
      if (!item) break;
      const t0 = Date.now();
      const result = await deploy(item);
      log(`${itemLabel(item)} finished in ${Math.round((Date.now() - t0) / 1000)} s: ${result.ok ? 'ok' : result.reason}`);
      await withState(OWNER, (st) => {
        if (st.queue[0]?.id === item.id) {
          st.queue[0].resolved = item.resolved;
          finishDeploy(st, result, Date.now());
        }
        if (result.app !== undefined) st.app = result.app;
        if (result.startedAt) st.serverStartedAt = result.startedAt;
        st.restartWindowUntil = 0;
        st.healthFailures = 0;
      });
      await syncPage({ owner: OWNER, log });
    }
  } finally {
    log('deployer idle, exiting');
    lock.release();
  }
}

// Only when run as a program: importing this file must never deploy.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (!existsSync(PATHS.stage) || !existsSync(PATHS.live)) {
    log('stage or live clone missing');
    process.exit(1);
  }
  main().catch((e) => {
    log(`deployer crashed: ${e.stack}`);
    process.exit(1);
  });
}
