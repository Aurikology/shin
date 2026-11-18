// mac/test/harden.test.mjs
// R55, D3: mac/12-harden.sh against FAKE macOS commands. Proves the script's own safety logic: it changes nothing in
// --dry-run and --audit, it turns the firewall back OFF if the site stops answering, it never leaves an sshd drop-in
// that sshd -t rejects, it refuses to switch SSH passwords off when there is no key to log in with, and it names an
// unexpected listener without killing it. It cannot prove how the real firewall behaves; the live health check inside
// the script is the safety net for that.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '12-harden.sh');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-harden-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const FAKE = `#!/bin/sh
n=$(basename "$0")
echo "$n $*" >> "$FAKE_LOG"
case "$n" in
  id) echo "\${FAKE_UID:-0}" ;;
  uname) echo Darwin ;;
  socketfilterfw)
    case "$1" in
      --setglobalstate) if [ "$2" = on ]; then : > "$FAKE_DIR/fw_on"; else rm -f "$FAKE_DIR/fw_on"; fi ;;
      --getglobalstate) if [ -f "$FAKE_DIR/fw_on" ]; then echo "Firewall is enabled. (State = 1)"; else echo "Firewall is disabled. (State = 0)"; fi ;;
    esac ;;
  curl)
    [ -n "\${FAKE_BREAK_ON_FW:-}" ] && [ -f "$FAKE_DIR/fw_on" ] && exit 22
    [ -n "\${FAKE_DOWN_ALWAYS:-}" ] && exit 22
    exit 0 ;;
  sshd) exit \${FAKE_SSHD_RC:-0} ;;
  systemsetup) echo "Remote Login: On" ;;
  dseditgroup) echo "yes worker is a member of admin" ;;
  lsof)
    case "$*" in
      *-iTCP*) printf 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\\n'
               printf 'node 46083 worker 20u IPv6 0x1 0t0 TCP *:4173 (LISTEN)\\n'
               printf 'node 78683 worker 21u IPv6 0x2 0t0 TCP *:8787 (LISTEN)\\n'
               printf 'cloudflar 931 worker 7u IPv4 0x3 0t0 TCP 127.0.0.1:20241 (LISTEN)\\n' ;;
      *) echo "n/Users/worker/start-thing" ;;
    esac ;;
  ps) echo "node /Users/worker/start-thing/start.mjs" ;;
  sleep) exit 0 ;;
  chmod) exit 0 ;;
esac
exit 0
`;

function setup({ key = true } = {}) {
  const dir = mkdtempSync(join(root, 't-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const n of ['id', 'uname', 'socketfilterfw', 'curl', 'sshd', 'systemsetup', 'dseditgroup', 'lsof', 'ps', 'sleep', 'chmod', 'launchctl']) {
    writeFileSync(join(bin, n), FAKE);
    chmodSync(join(bin, n), 0o755);
  }
  const home = join(dir, 'home');
  mkdirSync(join(home, '.ssh'), { recursive: true });
  if (key) writeFileSync(join(home, '.ssh', 'authorized_keys'), 'ssh-ed25519 AAAAC3Nza fake@test\n');
  mkdirSync(join(home, 'shin-data'));
  writeFileSync(join(home, 'shin-data', 'scans.db'), 'x');
  const sshd = join(dir, 'sshd_config.d');
  const cfg = join(dir, 'config.env');
  writeFileSync(cfg, `PORT=4173\nNODE_BIN=/opt/homebrew/bin/node\nSHIN_TUNNEL_HOSTNAME=relay.example.com\n`);
  const log = join(dir, 'fake.log');
  const env = {
    ...process.env,
    PATH: `${posix(bin)}:${process.env.PATH}`,
    FAKE_LOG: posix(log),
    FAKE_DIR: posix(dir),
    SHIN_CONFIG_FILE: posix(cfg),
    SHIN_SERVICE_HOME: posix(home),
    SHIN_SSHD_DIR: posix(sshd),
    SHIN_SOCKETFILTERFW: posix(join(bin, 'socketfilterfw')),
    SHIN_HARDEN_SETTLE_SECONDS: '0',
  };
  const sh = (args = [], extra = {}) => {
    const r = spawnSync('sh', [posix(SCRIPT), ...args], { encoding: 'utf8', cwd: dir, env: { ...env, ...extra } });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
  return { dir, home, sshd, sh, calls, dropin: join(sshd, '100-shin.conf'), fwOn: () => existsSync(join(dir, 'fw_on')) };
}
const MUT = /^(socketfilterfw --(setglobalstate|add|unblockapp|setallowsigned)|chmod|launchctl (disable|bootout|enable))/;

test('--dry-run: says what it would do, changes nothing', () => {
  const t = setup();
  const r = t.sh(['--dry-run'], { FAKE_UID: '501' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /would run: .*--setglobalstate on/);
  assert.match(r.out, /DRY RUN: nothing was changed/);
  assert.deepEqual(t.calls().filter((c) => MUT.test(c)), []);
  assert.ok(!existsSync(t.dropin));
  assert.ok(!t.fwOn());
});

test('--audit: read-only, needs no root, names the unknown listener with its command and folder, never kills it', () => {
  const t = setup();
  const r = t.sh(['--audit'], { FAKE_UID: '501' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /UNKNOWN\s+node\s+pid 78683\s+\*:8787/);
  assert.match(r.out, /command: node \/Users\/worker\/start-thing\/start\.mjs/);
  assert.match(r.out, /ok\s+node\s+pid 46083\s+\*:4173/);
  assert.match(r.out, /ok\s+cloudflar\s+pid 931\s+127\.0\.0\.1:20241/);
  assert.match(r.out, /yes worker is a member of admin/);
  assert.deepEqual(t.calls().filter((c) => /^(kill|socketfilterfw --set|chmod)/.test(c)), []);
});

test('apply without root is refused', () => {
  const t = setup();
  const r = t.sh([], { FAKE_UID: '501' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /run it with sudo/);
});

test('apply: firewall on with node and cloudflared allowed, SSH drop-in written, files made private, site still answers', () => {
  const t = setup();
  const r = t.sh();
  assert.equal(r.status, 0, r.out);
  assert.ok(t.fwOn());
  const c = t.calls();
  assert.ok(c.some((x) => /^socketfilterfw --unblockapp \/opt\/homebrew\/bin\/node$/.test(x)));
  assert.equal(readFileSync(t.dropin, 'utf8'), 'PermitRootLogin no\nAllowUsers worker\n');
  assert.ok(c.some((x) => /^chmod 700 .*shin-data$/.test(x)));
  assert.ok(c.some((x) => /^chmod 600 /.test(x)));
});

test('apply: the site stops answering once the firewall is on => firewall turned OFF again, loud exit 1', () => {
  const t = setup();
  const r = t.sh([], { FAKE_BREAK_ON_FW: '1' });
  assert.equal(r.status, 1);
  assert.match(r.out, /firewall was turned OFF again/);
  assert.ok(!t.fwOn(), 'firewall must not be left on over a dead site');
  assert.ok(!existsSync(t.dropin), 'nothing after the firewall step ran');
});

test('apply: a site that is already down BEFORE the change is not blamed on the firewall, and nothing is changed', () => {
  const t = setup();
  const r = t.sh([], { FAKE_DOWN_ALWAYS: '1' });
  assert.equal(r.status, 1);
  assert.match(r.out, /does not answer BEFORE the change/);
  assert.ok(!t.fwOn());
});

test('apply: an sshd drop-in that sshd -t rejects is removed again and the run fails', () => {
  const t = setup();
  const r = t.sh([], { FAKE_SSHD_RC: '1' });
  assert.equal(r.status, 1);
  assert.match(r.out, /sshd -t rejected/);
  assert.ok(!existsSync(t.dropin));
});

test('--ssh-keys-only with no key to log in with is refused: it would lock him out', () => {
  const t = setup({ key: false });
  const r = t.sh(['--ssh-keys-only']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /holds no key/);
  assert.ok(!existsSync(t.dropin));
});

test('--ssh-keys-only with a key adds PasswordAuthentication no', () => {
  const t = setup();
  assert.equal(t.sh(['--ssh-keys-only']).status, 0);
  const c = readFileSync(t.dropin, 'utf8');
  assert.match(c, /PasswordAuthentication no/);
  assert.match(c, /KbdInteractiveAuthentication no/);
});

test('Screen Sharing is left alone unless asked', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  assert.deepEqual(t.calls().filter((c) => /^launchctl (disable|bootout)/.test(c)), []);
  const u = setup();
  assert.equal(u.sh(['--screen-sharing-off']).status, 0);
  assert.ok(u.calls().includes('launchctl disable system/com.apple.screensharing'));
});

test('--undo: firewall off, drop-in gone', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  assert.equal(t.sh(['--undo']).status, 0);
  assert.ok(!t.fwOn());
  assert.ok(!existsSync(t.dropin));
});
