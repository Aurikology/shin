/**
 * D-146. The server never read its settings file when started plainly (`npm
 * start` / `npm run dev`, which is literally `node server.ts` per this
 * package's own scripts): no dotenv load and no `--env-file` anywhere in
 * `app/`, so a key that lives only in `.env` was invisible until someone
 * exported it by hand.
 *
 * THE FIX is in `package.json`'s own "start"/"dev" scripts: both now carry
 * `--env-file-if-exists=../.env --env-file-if-exists=.env` ahead of
 * `server.ts`. `--env-file-if-exists` (Node >=20.12, and this repo requires
 * >=22.18) never throws when the file is missing, and a value already in
 * `process.env` always wins over the file (checked by hand against this
 * Node: a real env var is never clobbered) -- which is what keeps this safe
 * on the Mac too: `mac/run-server.sh` sources `mac/config.env` into the
 * shell's real environment and then `exec`s `node server.ts` directly,
 * never through `npm`, so these flags never even run there, and if they
 * ever did, the already-sourced values would still win. One fix, no
 * double-loading either way.
 *
 * Both paths are relative to the process's CWD, which for `npm start` run
 * from `app/` is `app/`: `../.env` is the repo root (icecat/ebay today,
 * and where GEMINI_API_KEY/SHIN_MODEL_PROVIDER can be dropped for local
 * dev), `.env` is `app/.env` (an app-level override, does not exist yet).
 *
 * TEST A checks the wiring itself, so a future edit that drops the flags
 * fails loudly. TEST B proves the mechanism those exact flags name: spawn
 * node with the SAME flags (parsed straight out of package.json, "server.ts"
 * swapped for a tiny probe script) against a fixture tree shaped like
 * `<tmp>/app` beside `<tmp>/.env`, and confirm a key that exists only in the
 * file reaches `process.env` -- "started plainly with a key only in the
 * file, the server sees it", without booting the real server or touching
 * the real repo's `.env`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));

function envFlags(script) {
  // Every token up to (not including) the file node actually runs.
  const parts = script.trim().split(/\s+/);
  assert.equal(parts[0], 'node', `script did not start with node: "${script}"`);
  const target = parts[parts.length - 1];
  return { flags: parts.slice(1, -1), target };
}

test('the "start" script loads repo-root .env and an app-level .env before server.ts, and never errors when either is missing', () => {
  const { flags, target } = envFlags(pkg.scripts.start);
  assert.equal(target, 'server.ts');
  assert.ok(flags.includes('--env-file-if-exists=../.env'), `"start" is missing the repo-root env flag: ${pkg.scripts.start}`);
  assert.ok(flags.includes('--env-file-if-exists=.env'), `"start" is missing the app-level env flag: ${pkg.scripts.start}`);
});

test('the "dev" script carries the same two env flags alongside --watch', () => {
  const { flags, target } = envFlags(pkg.scripts.dev);
  assert.equal(target, 'server.ts');
  assert.ok(flags.includes('--watch'), `"dev" dropped --watch: ${pkg.scripts.dev}`);
  assert.ok(flags.includes('--env-file-if-exists=../.env'), `"dev" is missing the repo-root env flag: ${pkg.scripts.dev}`);
  assert.ok(flags.includes('--env-file-if-exists=.env'), `"dev" is missing the app-level env flag: ${pkg.scripts.dev}`);
});

test('started plainly with a key only in the file, the process sees it (repo-root .env)', () => {
  const root = mkdtempSync(join(tmpdir(), 'shin-env-file-'));
  const appDir = join(root, 'app');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(root, '.env'), 'D146_ROOT_ONLY_KEY=root-value\n');
  const probe = join(appDir, 'probe.mjs');
  writeFileSync(probe, 'console.log(JSON.stringify({ v: process.env.D146_ROOT_ONLY_KEY ?? null }));\n');

  const { flags } = envFlags(pkg.scripts.start);
  const result = spawnSync(process.execPath, [...flags, probe], { cwd: appDir, encoding: 'utf8' });

  assert.equal(result.status, 0, `probe process failed: ${result.stderr}`);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.v, 'root-value', 'a key set only in the repo-root .env was not visible to the process');

  rmSync(root, { recursive: true, force: true });
});

test('started plainly with a key only in app/.env, the process sees it, and a missing repo-root .env is not an error', () => {
  const root = mkdtempSync(join(tmpdir(), 'shin-env-file-'));
  const appDir = join(root, 'app');
  mkdirSync(appDir, { recursive: true });
  // No .env at root at all here -- --env-file-if-exists must not throw.
  writeFileSync(join(appDir, '.env'), 'D146_APP_ONLY_KEY=app-value\n');
  const probe = join(appDir, 'probe.mjs');
  writeFileSync(probe, 'console.log(JSON.stringify({ v: process.env.D146_APP_ONLY_KEY ?? null }));\n');

  const { flags } = envFlags(pkg.scripts.start);
  const result = spawnSync(process.execPath, [...flags, probe], { cwd: appDir, encoding: 'utf8' });

  assert.equal(result.status, 0, `probe process failed: ${result.stderr}`);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.v, 'app-value', 'a key set only in app/.env was not visible to the process');

  rmSync(root, { recursive: true, force: true });
});

test('a real environment variable is never overridden by the file (the "no double-loading" guarantee this fix leans on)', () => {
  const root = mkdtempSync(join(tmpdir(), 'shin-env-file-'));
  const appDir = join(root, 'app');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(root, '.env'), 'D146_PRECEDENCE_KEY=from-file\n');
  const probe = join(appDir, 'probe.mjs');
  writeFileSync(probe, 'console.log(JSON.stringify({ v: process.env.D146_PRECEDENCE_KEY ?? null }));\n');

  const { flags } = envFlags(pkg.scripts.start);
  const result = spawnSync(process.execPath, [...flags, probe], {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, D146_PRECEDENCE_KEY: 'from-real-env' },
  });

  assert.equal(result.status, 0, `probe process failed: ${result.stderr}`);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.v, 'from-real-env', 'a real environment variable was clobbered by the .env file, which is what would double-load on the Mac');

  rmSync(root, { recursive: true, force: true });
});
