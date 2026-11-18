// mac/test/planned-restart.test.mjs
// 11-planned-restart.sh against fake commands. The point: with FileVault ON it must restart with
// `fdesetup authrestart` and NEVER a plain restart (a plain restart would stop at the unlock screen and
// the site would stay down until someone arrives), and if the update install fails it must not restart at all.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '11-planned-restart.sh');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-restart-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const FAKE = `#!/bin/sh
n=$(basename "$0")
echo "$n $*" >> "$FAKE_LOG"
case "$n" in
  id) echo "\${FAKE_UID:-0}" ;;
  fdesetup) [ "$1" = authrestart ] && exit \${FAKE_AUTH_RC:-0}; if [ "\${FAKE_FILEVAULT:-on}" = on ]; then echo "FileVault is On."; else echo "FileVault is Off."; fi ;;
  softwareupdate) [ "$1" = "--install" ] && exit \${FAKE_SU_RC:-0}; echo "No new software available." ;;
  curl) exit \${FAKE_CURL_RC:-0} ;;
  sleep) exit 0 ;;
esac
exit 0
`;

function setup() {
  const dir = mkdtempSync(join(root, 't-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const n of ['id', 'fdesetup', 'softwareupdate', 'shutdown', 'curl', 'sleep', 'sysctl']) {
    writeFileSync(join(bin, n), FAKE);
    chmodSync(join(bin, n), 0o755);
  }
  const log = join(dir, 'fake.log');
  const env = { ...process.env, PATH: `${posix(bin)}:${process.env.PATH}`, FAKE_LOG: posix(log), SHIN_CONFIG_FILE: posix(join(dir, 'none.env')) };
  const sh = (args = [], extra = {}) => {
    const r = spawnSync('sh', [posix(SCRIPT), ...args], { encoding: 'utf8', cwd: dir, env: { ...env, ...extra } });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  return { sh, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []) };
}

test('--dry-run: nothing is installed or restarted', () => {
  const t = setup();
  const r = t.sh(['--dry-run'], { FAKE_UID: '501' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /would run: fdesetup authrestart/);
  assert.deepEqual(t.calls().filter((c) => /^(shutdown|fdesetup authrestart|softwareupdate --install)/.test(c)), []);
});

test('not root: refused', () => {
  const r = setup().sh(['--yes'], { FAKE_UID: '501' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /run it with sudo/);
});

test('FileVault on: updates installed, then authrestart, and never a plain restart', () => {
  const t = setup();
  const r = t.sh(['--yes']);
  assert.equal(r.status, 0, r.out);
  const c = t.calls();
  const upd = c.findIndex((x) => x.startsWith('softwareupdate --install --all'));
  const rst = c.findIndex((x) => x === 'fdesetup authrestart');
  assert.ok(upd >= 0 && rst > upd);
  assert.ok(!c.some((x) => x.startsWith('shutdown')), 'a plain restart with FileVault on would stop at the unlock screen');
});

test('FileVault off: a plain restart', () => {
  const t = setup();
  assert.equal(t.sh(['--yes'], { FAKE_FILEVAULT: 'off' }).status, 0);
  assert.ok(t.calls().includes('shutdown -r now'));
  assert.ok(!t.calls().includes('fdesetup authrestart'));
});

test('update install fails: no restart at all, loud exit', () => {
  const t = setup();
  const r = t.sh(['--yes'], { FAKE_SU_RC: '1' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /not restarting/);
  assert.ok(!t.calls().some((x) => /^(shutdown|fdesetup authrestart)/.test(x)));
});

test('authrestart fails: says so and does not fall back to a plain restart', () => {
  const t = setup();
  const r = t.sh(['--yes'], { FAKE_AUTH_RC: '1' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /NOT restarted/);
  assert.ok(!t.calls().some((x) => x.startsWith('shutdown')));
});

test('--after: server never answers => loud failure naming the verify command', () => {
  const r = setup().sh(['--after'], { FAKE_CURL_RC: '22', SHIN_AFTER_WAIT_SECONDS: '10' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /did not answer/);
});
