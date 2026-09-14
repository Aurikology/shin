// mac/deploy/util.mjs
//
// I/O helpers shared by the checker and the deployer: paths, config.env
// (only the few keys needed, never echoed), atomic mkdir locks, state file,
// logging, and child processes with hard timeouts.

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshState } from './lib.mjs';

const HOME = homedir();
export const PATHS = {
  home: process.env.SHIN_DEPLOY_HOME || join(HOME, '.shin-deploy'),
  stage: process.env.SHIN_STAGE_DIR || join(HOME, 'shin-stage'),
  live: process.env.SHIN_LIVE_DIR || join(HOME, 'shin-live'),
  configEnv: process.env.SHIN_CONFIG_ENV || join(dirname(fileURLToPath(import.meta.url)), '..', 'config.env'),
  code: dirname(fileURLToPath(import.meta.url)),
};
PATHS.state = join(PATHS.home, 'state.json');
PATHS.logs = join(PATHS.home, 'logs');
PATHS.runs = join(PATHS.home, 'runs');
PATHS.neutral = join(PATHS.home, 'neutral');
for (const d of [PATHS.home, PATHS.logs, PATHS.runs, PATHS.neutral]) mkdirSync(d, { recursive: true });

export const PAGE_ID = '3db09fb15fcf8155bc04ef261e4e1d9c';
export const PACKAGES = ['spine', 'catalogue', 'identify', 'price', 'app'];

/** Reads only the named keys from config.env. Values are never logged. */
export function readConfig(keys = ['PORT', 'SHIN_TUNNEL_HOSTNAME', 'NOTION_TOKEN', 'NODE_BIN']) {
  const out = {};
  let text = '';
  try {
    text = readFileSync(PATHS.configEnv, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && keys.includes(m[1])) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function logTo(name) {
  const file = join(PATHS.logs, `${name}.log`);
  return (msg) => {
    try {
      appendFileSync(file, `${new Date().toISOString()} [${process.pid}] ${msg}\n`);
    } catch {}
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** Atomic mkdir lock. Stale when its pid is dead. */
export function tryLock(name, owner) {
  const dir = join(PATHS.home, `${name}.lock`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(dir);
      writeFileSync(join(dir, 'pid'), String(process.pid));
      writeFileSync(join(dir, 'owner'), `${owner} ${new Date().toISOString()}`);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          if (readFileSync(join(dir, 'pid'), 'utf8').trim() === String(process.pid)) rmSync(dir, { recursive: true, force: true });
        } catch {}
      };
      return { release };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0;
      try {
        pid = Number(readFileSync(join(dir, 'pid'), 'utf8'));
      } catch {
        // Lock directory made but pid not yet written: treat as live for a moment.
        return null;
      }
      if (pidAlive(pid)) return null;
      try {
        const graveyard = `${dir}.stale-${process.pid}`;
        renameSync(dir, graveyard);
        rmSync(graveyard, { recursive: true, force: true });
      } catch {}
    }
  }
  return null;
}

export async function waitLock(name, owner, timeoutMs) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const l = tryLock(name, owner);
    if (l) return l;
    if (Date.now() > until) return null;
    await sleep(150);
  }
}

export function lockHolder(name) {
  try {
    const pid = Number(readFileSync(join(PATHS.home, `${name}.lock`, 'pid'), 'utf8'));
    return pidAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function loadState() {
  try {
    return { ...freshState(), ...JSON.parse(readFileSync(PATHS.state, 'utf8')) };
  } catch {
    return freshState();
  }
}

function saveState(state) {
  const tmp = `${PATHS.state}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1));
  renameSync(tmp, PATHS.state);
}

/** Read-modify-write under the state lock. fn may be async but should be quick. */
export async function withState(owner, fn) {
  const lock = await waitLock('state', owner, 30e3);
  if (!lock) throw new Error('state lock not acquired in 30 s');
  try {
    const state = loadState();
    const out = await fn(state);
    saveState(state);
    return out;
  } finally {
    lock.release();
  }
}

/** Environment for child commands: none of config.env, nothing secret. */
export function childEnv(extra = {}) {
  const keep = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'SSH_AUTH_SOCK'];
  const env = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${join(HOME, '.local', 'bin')}`;
  return { ...env, CI: '1', NO_COLOR: '1', ...extra };
}

/**
 * Runs a command with a hard timeout (kills the whole process group).
 * Output goes to logFile; the last ~64 KB is returned for parsing.
 */
export function run(cmd, args, { cwd, timeoutMs = 120e3, logFile, env, input } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: env ?? childEnv(), detached: true, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const take = (b) => {
      const s = b.toString();
      out = (out + s).slice(-65536);
      if (logFile) {
        try {
          appendFileSync(logFile, s);
        } catch {}
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    if (input !== undefined) child.stdin.end(input);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out: String(e.message), timedOut, ms: Date.now() - started });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -1 : code, out, timedOut, ms: Date.now() - started });
    });
  });
}

export async function git(dir, args, timeoutMs = 60e3) {
  const r = await run('git', ['-C', dir, ...args], { timeoutMs });
  if (r.code !== 0) throw new Error(`git ${args[0]} failed${r.timedOut ? ' (timed out)' : ''}: ${r.out.trim().split('\n').pop()}`);
  return r.out.trim();
}

export { existsSync, join };
