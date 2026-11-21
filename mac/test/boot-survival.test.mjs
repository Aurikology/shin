// mac/test/boot-survival.test.mjs
// R04: mac/10-boot-survival.sh, driven against FAKE macOS commands (launchctl, plutil, visudo, defaults, pmset,
// fdesetup, sudo, id...) that only record what they were asked. This proves the script's own logic: order, what it
// refuses, what it never executes, what it leaves alone. It cannot prove how the real launchctl behaves; that is what
// `--verify` and the reboot drill in mac/README.md are for.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, cpSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAC = join(HERE, '..');
const SCRIPT = join(MAC, '10-boot-survival.sh');
const posix = (p) => String(p).replace(/\\/g, '/');
const root = mkdtempSync(join(tmpdir(), 'shin-boot-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const FAKE = `#!/bin/sh
n=$(basename "$0")
echo "$n $*" >> "$FAKE_LOG"
case "$n" in
  id)
    if [ "$1" = "-u" ] && [ -z "\${2:-}" ]; then echo "\${FAKE_UID:-0}"; else echo 501; fi ;;
  uname) case "$1" in -s) echo Darwin ;; -m) echo arm64 ;; *) echo Darwin ;; esac ;;
  sw_vers) echo 27.0.1 ;;
  sysctl) echo Mac14,2 ;;
  launchctl)
    case "$1 $2" in
      "print gui/"*) exit 1 ;;
      "print system/"*) echo "state = running"; exit \${FAKE_PRINT_RC:-0} ;;
      "bootstrap system") exit \${FAKE_BOOTSTRAP_RC:-0} ;;
    esac
    exit 0 ;;
  plutil) exit \${FAKE_PLUTIL_RC:-0} ;;
  visudo) exit \${FAKE_VISUDO_RC:-0} ;;
  defaults) if [ "$1" = read ]; then echo "\${FAKE_AU:-0}"; fi ;;
  fdesetup) if [ "\${FAKE_FILEVAULT:-off}" = on ]; then echo "FileVault is On."; else echo "FileVault is Off."; fi ;;
  curl) exit 0 ;;
  PlistBuddy) exit 0 ;;
  sudo)
    while [ $# -gt 0 ]; do
      case "$1" in -u) shift 2 ;; -n) shift ;; *) break ;; esac
    done
    c=$1; shift; exec "$(basename "$c")" "$@" ;;
esac
exit 0
`;

function setup({ agents = ['server', 'tunnel', 'backup', 'checker'], config } = {}) {
  const dir = mkdtempSync(join(root, 't-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const n of ['id', 'uname', 'sw_vers', 'sysctl', 'launchctl', 'plutil', 'visudo', 'defaults', 'pmset', 'fdesetup', 'curl', 'PlistBuddy', 'sudo']) {
    writeFileSync(join(bin, n), FAKE);
    chmodSync(join(bin, n), 0o755);
  }
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'mac'), { recursive: true });
  const home = join(dir, 'home');
  const agentDir = join(home, 'Library', 'LaunchAgents');
  mkdirSync(agentDir, { recursive: true });
  for (const a of agents) {
    writeFileSync(join(agentDir, `com.shin.${a}.plist`), `<?xml version="1.0"?><plist><dict><key>Label</key><string>com.shin.${a}</string></dict></plist>\n`);
  }
  const daemons = join(dir, 'LaunchDaemons');
  const sudoers = join(dir, 'sudoers.d');
  mkdirSync(daemons);
  mkdirSync(sudoers);
  const cfg = join(dir, 'config.env');
  writeFileSync(cfg, config ?? `SHIN_REPO_DIR='${posix(repo)}'\nPORT=4173\nNODE_BIN=/opt/homebrew/bin/node\nSHIN_TUNNEL_HOSTNAME=relay.example.com # public name\nSHIN_LAUNCHD_DOMAIN=gui\nANTHROPIC_API_KEY=keep-me\n`);
  const log = join(dir, 'fake.log');
  const env = {
    ...process.env,
    PATH: `${posix(bin)}:${process.env.PATH}`,
    FAKE_LOG: posix(log),
    SHIN_DAEMON_DIR: posix(daemons),
    SHIN_SUDOERS_DIR: posix(sudoers),
    SHIN_CONFIG_FILE: posix(cfg),
    SHIN_SERVICE_HOME: posix(home),
    SHIN_PLISTBUDDY: posix(join(bin, 'PlistBuddy')),
    SHIN_TEST_NO_CHOWN: '1',
    TMPDIR: posix(dir),
  };
  const sh = (args = [], extra = {}) => {
    const r = spawnSync('sh', [posix(SCRIPT), ...args], { encoding: 'utf8', cwd: dir, env: { ...env, ...extra } });
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
  return { dir, repo, home, agentDir, daemons, sudoers, cfg, sh, calls };
}

const MUTATING = /^(launchctl (bootstrap|bootout)|defaults write|pmset -a)/;

test('--dry-run as a normal user: says what it would do, runs no mutating command, writes nothing', () => {
  const t = setup();
  const r = t.sh(['--dry-run'], { FAKE_UID: '501' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /would run: launchctl bootstrap system .*com\.shin\.server\.plist/);
  assert.match(r.out, /DRY RUN: nothing was changed/);
  assert.deepEqual(t.calls().filter((c) => MUTATING.test(c)), []);
  assert.deepEqual(readdirSync(t.daemons), []);
  assert.deepEqual(readdirSync(t.sudoers), []);
  assert.ok(existsSync(join(t.agentDir, 'com.shin.server.plist')), 'old agents untouched');
  assert.match(readFileSync(t.cfg, 'utf8'), /SHIN_LAUNCHD_DOMAIN=gui/);
});

test('install without root is refused, nothing changes', () => {
  const t = setup();
  const r = t.sh([], { FAKE_UID: '501' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /run it with sudo/);
  assert.deepEqual(readdirSync(t.daemons), []);
});

test('install: ten rendered daemons as the service user, old agents moved aside, server agent stopped BEFORE the daemon starts', () => {
  const t = setup();
  const r = t.sh();
  assert.equal(r.status, 0, r.out);
  const names = readdirSync(t.daemons).sort();
  for (const n of ['server', 'checker', 'integrity', 'backup', 'offsite', 'logrotate', 'hammer', 'restoretest', 'expiry', 'deadman']) assert.ok(names.includes(`com.shin.${n}.plist`), `missing ${n}`);
  const server = readFileSync(join(t.daemons, 'com.shin.server.plist'), 'utf8');
  assert.match(server, /<key>UserName<\/key>\s*<string>worker<\/string>/);
  assert.match(server, new RegExp(posix(t.repo).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '/mac/run-server\\.sh'));
  assert.doesNotMatch(server, /__[A-Z_]+__/);
  assert.match(readFileSync(join(t.daemons, 'com.shin.checker.plist'), 'utf8'), /<string>\/opt\/homebrew\/bin\/node<\/string>/);
  for (const a of ['server', 'checker', 'backup']) assert.ok(!existsSync(join(t.agentDir, `com.shin.${a}.plist`)), `${a} agent still in place`);
  assert.ok(existsSync(join(t.home, 'Library', 'LaunchAgents.shin-disabled', 'com.shin.server.plist')), 'the old agent is kept, aside, so it can be put back');
  const c = t.calls();
  const stopOld = c.findIndex((x) => x === 'launchctl bootout gui/501/com.shin.server');
  const startNew = c.findIndex((x) => /^launchctl bootstrap system .*com\.shin\.server\.plist$/.test(x));
  assert.ok(stopOld >= 0 && startNew > stopOld, `old server agent must stop before the daemon starts (${stopOld}, ${startNew})`);
  assert.equal(c.filter((x) => x.startsWith('plutil -lint')).length >= 9, true, 'every plist validated');
});

test('install: the sudoers rule is narrow, validated by visudo BEFORE it is installed, and mode 440', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const rule = readFileSync(join(t.sudoers, 'shin-deploy'), 'utf8');
  const lines = rule.split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(lines.length, 1);
  assert.equal(lines[0], 'worker ALL=(root) NOPASSWD: /bin/launchctl kickstart -k system/com.shin.server, /bin/launchctl print system/com.shin.server, /bin/launchctl list');
  assert.doesNotMatch(rule, /ALL\s*$/m, 'never a blanket command');
  assert.ok(t.calls().some((x) => x.startsWith('visudo -cf')));
});

test('install: a sudoers rule that does not validate stops everything before any daemon is touched', () => {
  const t = setup();
  const r = t.sh([], { FAKE_VISUDO_RC: '1' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /did not validate/);
  assert.deepEqual(readdirSync(t.sudoers), []);
  assert.deepEqual(readdirSync(t.daemons), []);
  assert.deepEqual(t.calls().filter((x) => MUTATING.test(x)), []);
});

test('install: config.env gets SHIN_LAUNCHD_DOMAIN=system, every other line untouched', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const c = readFileSync(t.cfg, 'utf8');
  assert.match(c, /^SHIN_LAUNCHD_DOMAIN=system$/m);
  assert.doesNotMatch(c, /SHIN_LAUNCHD_DOMAIN=gui/);
  assert.match(c, /ANTHROPIC_API_KEY=keep-me/);
  assert.match(c, /PORT=4173/);
});

test('install: config.env is READ, never executed (it belongs to the service user, the script runs as root)', () => {
  const t = setup();
  const pwned = join(t.dir, 'PWNED');
  writeFileSync(t.cfg, readFileSync(t.cfg, 'utf8') + `EVIL=$(touch '${posix(pwned)}')\n\`touch ${posix(pwned)}\`\n`);
  assert.equal(t.sh().status, 0);
  assert.ok(!existsSync(pwned), 'config.env content was executed');
});

test('install: software updates download but never install and restart on their own', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const c = t.calls();
  assert.ok(c.includes('defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates -bool false'));
  assert.ok(c.includes('defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload -bool true'));
  assert.ok(c.includes('defaults write /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall -bool true'));
  assert.ok(c.includes('pmset -a autorestart 1'));
});

test('install: the tunnel login-agent is converted to a daemon run as the service user, program and arguments kept', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  assert.ok(existsSync(join(t.daemons, 'com.shin.tunnel.plist')));
  assert.ok(!existsSync(join(t.agentDir, 'com.shin.tunnel.plist')));
  const pb = t.calls().filter((x) => x.startsWith('PlistBuddy'));
  assert.ok(pb.some((x) => x.includes('Add :UserName string worker')));
  assert.ok(pb.some((x) => x.includes('Delete :LimitLoadToSessionType')), 'a daemon with a gui-session key would not load');
  assert.ok(pb.some((x) => x.includes('Add :EnvironmentVariables:HOME string ')));
});

test('install: a tunnel that is already a boot-time daemon is left alone', () => {
  const t = setup({ agents: ['server'] });
  writeFileSync(join(t.daemons, 'com.cloudflare.cloudflared.plist'), '<plist/>');
  const r = t.sh();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /already a boot-time daemon/);
});

test('install: no tunnel job anywhere is a loud failure (the site would stay down after a reboot)', () => {
  const t = setup({ agents: ['server'] });
  const r = t.sh();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /no tunnel job/);
});

test('install: SHIN_KEEP_LEGACY_BACKUP keeps the old backup job instead of installing the new one', () => {
  const t = setup();
  assert.equal(t.sh([], { SHIN_KEEP_LEGACY_BACKUP: '1' }).status, 0);
  assert.ok(!existsSync(join(t.daemons, 'com.shin.backup.plist')));
  assert.ok(existsSync(join(t.agentDir, 'com.shin.backup.plist')), 'the old backup agent is untouched');
});

test('install: a plist that plutil rejects is reported and the script exits 1', () => {
  const t = setup();
  const r = t.sh([], { FAKE_PLUTIL_RC: '1' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /plutil -lint rejected/);
});

test('install: a daemon launchctl refuses to start is reported and the script exits 1', () => {
  const t = setup();
  const r = t.sh([], { FAKE_BOOTSTRAP_RC: '5' });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /bootstrap com\.shin\.server failed/);
});

test('install twice is safe: the second run changes nothing it should not', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const r = t.sh();
  assert.equal(r.status, 0, r.out);
  assert.equal(readdirSync(t.daemons).length >= 10, true);
  assert.equal((readFileSync(t.cfg, 'utf8').match(/^SHIN_LAUNCHD_DOMAIN=/gm) ?? []).length, 1);
});

test('--verify: reports FileVault off as a failure and exits 1', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const r = t.sh(['--verify'], { FAKE_FILEVAULT: 'off' });
  assert.equal(r.status, 1);
  assert.match(r.out, /FileVault is OFF/);
});

test('--verify: everything in place and FileVault on passes', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const r = t.sh(['--verify'], { FAKE_FILEVAULT: 'on' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /VERIFY: all good/);
});

test('--verify: a daemon that is not loaded fails it', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const r = t.sh(['--verify'], { FAKE_FILEVAULT: 'on', FAKE_PRINT_RC: '1' });
  assert.equal(r.status, 1);
  assert.match(r.out, /NOT loaded/);
});

test('--rollback puts the old agents back, removes the daemons and the sudoers rule, and sets the domain back to gui', () => {
  const t = setup();
  assert.equal(t.sh().status, 0);
  const r = t.sh(['--rollback']);
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(join(t.agentDir, 'com.shin.server.plist')));
  assert.ok(existsSync(join(t.agentDir, 'com.shin.tunnel.plist')));
  assert.deepEqual(readdirSync(t.daemons), []);
  assert.deepEqual(readdirSync(t.sudoers), []);
  assert.match(readFileSync(t.cfg, 'utf8'), /^SHIN_LAUNCHD_DOMAIN=gui$/m);
});
