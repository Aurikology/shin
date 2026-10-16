// mac/deploy/checker.mjs
//
// Run by launchd every 30 s (com.shin.checker); a lock prevents overlapping
// runs. When a check is due (every 30 s, backing off after network/mailbox/429/5xx
// failures): look at GitLab's main, one report sync (read requests, queue, holds, status,
// log), then start the deployer if the queue has work and none runs. Never waits on a deploy.
//
// The report sink is SHIN_DEPLOY_REPORT in mac/config.env (see sync.mjs):
//   mailbox (default)  status in ~/.shin-deploy/status.md, progress/notices to the PC and
//                      requests ("deploy: ..." mail) through the PC-Mac mailbox. An
//                      unreachable mailbox backs off; it never stops the checker.
//   notion             the optional page sink. If the checker was stopped (broken Notion
//                      key, 3 refusals in a row), it exits with no calls at all.
//
//   node checker.mjs          scheduled run
//   node checker.mjs --now    check even if not due

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkDue, observeHealth } from './lib.mjs';
import { handleOutcome, reportSink, stoppedReason, syncPage } from './sync.mjs';
import { PATHS, childEnv, git, loadState, lockHolder, logTo, readConfig, run, tryLock, withState } from './util.mjs';

const log = logTo('checker');

/** origin/main, fetching only when GitLab's main moved (one ls-remote per check). */
async function originInfo() {
  try {
    const remote = await run('git', ['-C', PATHS.stage, 'ls-remote', 'origin', 'refs/heads/main'], { timeoutMs: 45e3 });
    const remoteHead = remote.code === 0 ? remote.out.split(/\s/)[0] : null;
    let local = null;
    try {
      local = await git(PATHS.stage, ['rev-parse', 'origin/main']);
    } catch {}
    if (!remoteHead) log(`ls-remote failed (using last fetched origin/main): ${remote.out.trim().split('\n').pop()}`);
    else if (remoteHead !== local) await git(PATHS.stage, ['fetch', 'origin', '--prune'], 90e3);
    const [head, author, subject] = (await git(PATHS.stage, ['log', '-1', '--format=%H%n%an%n%s', 'origin/main'])).split('\n');
    return { head, author, subject };
  } catch (e) {
    log(`origin/main unreadable: ${e.message}`);
    return null;
  }
}

/** The public /api/health through the tunnel, as testers reach it. One GET, 15 s timeout. */
async function publicHealth() {
  const host = readConfig(['SHIN_TUNNEL_HOSTNAME']).SHIN_TUNNEL_HOSTNAME;
  if (!host) return null;
  try {
    const res = await fetch(`https://${host}/api/health`, { signal: AbortSignal.timeout(15e3), headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) return { ok: false, reason: `public /api/health answered HTTP ${res.status}` };
    const b = await res.json();
    if (b?.ok !== true) return { ok: false, reason: 'public /api/health did not say ok' };
    if (b.catalogueUp !== true) return { ok: false, reason: 'catalogue not attached' };
    return { ok: true, startedAt: b.startedAt };
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'public /api/health timed out after 15 s' : 'public /api/health unreachable' };
  }
}

function startDeployerIfNeeded() {
  const state = loadState();
  if (!state.queue.length || lockHolder('deployer')) return;
  const child = spawn(process.execPath, [join(PATHS.code, 'deployer.mjs')], { cwd: PATHS.home, env: childEnv(), detached: true, stdio: 'ignore' });
  child.unref();
  log(`started deployer pid ${child.pid} for ${state.queue.length} queued`);
}

async function main() {
  if (reportSink() === 'notion' && stoppedReason()) return; // stopped: no Notion, no claude, no git
  const lock = tryLock('checker', 'checker');
  if (!lock) return;
  try {
    const force = process.argv.includes('--now');
    if (force || checkDue(loadState(), Date.now())) {
      const gitInfo = await originInfo();
      const health = await publicHealth();
      if (health) await withState('checker', (st) => observeHealth(st, health, Date.now(), !!lockHolder('deployer')));
      const r = await syncPage({ ingest: true, git: gitInfo, owner: 'checker', log });
      if (await handleOutcome({ r, log })) return; // notion sink only: the key broke, checker stopped
    }
    startDeployerIfNeeded();
  } finally {
    lock.release();
  }
}

// Only when run as a program: importing this file must never check or deploy.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((e) => {
    log(`checker crashed: ${e.stack}`);
    process.exitCode = 1;
  });
}
