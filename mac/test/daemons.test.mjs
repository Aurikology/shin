// mac/test/daemons.test.mjs
// R04: the LaunchDaemon templates in mac/launchd-daemons/ are well formed, every one runs as the
// service user (never root), points at a script that exists, and uses only tokens 10-boot-survival.sh fills in.
// There is no plutil on the PC; this is a structural check, and `plutil -lint` on the Mac (done by
// 10-boot-survival.sh before it installs anything) is the real validator.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAC = join(HERE, '..');
const DIR = join(MAC, 'launchd-daemons');
const files = readdirSync(DIR).filter((f) => f.endsWith('.plist'));
const TOKENS = new Set(['__SHIN_REPO_DIR__', '__SHIN_USER__', '__SHIN_HOME__', '__NODE_BIN__']);

function tags(xml) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), name, `mismatched </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed tags');
  return body;
}

test('there is one daemon per job the install procedure lists', () => {
  const want = ['backup', 'checker', 'deadman', 'expiry', 'hammer', 'integrity', 'logrotate', 'offsite', 'restoretest', 'server'].map((n) => `com.shin.${n}.plist`);
  assert.deepEqual(files.sort(), want.sort());
});

for (const f of files) {
  test(`${f}: well formed, label matches file, runs as the service user, script exists, only known tokens`, () => {
    const xml = readFileSync(join(DIR, f), 'utf8');
    const body = tags(xml);
    assert.equal(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/.exec(body)[1], basename(f, '.plist'));
    assert.match(body, /<key>UserName<\/key>\s*<string>__SHIN_USER__<\/string>/, 'must run as the service user, never root');
    assert.doesNotMatch(body, /<string>root<\/string>/);
    for (const k of ['HOME', 'USER', 'LOGNAME', 'PATH']) assert.match(body, new RegExp(`<key>${k}</key>`), `launchd gives no ${k}`);
    for (const t of body.match(/__[A-Z_]+__/g) ?? []) assert.ok(TOKENS.has(t), `unknown token ${t}`);
    assert.doesNotMatch(body, /\/Users\/worker/, 'no hard-coded home: tokens only');
    assert.match(body, /<key>StandardOutPath<\/key>/);
    assert.match(body, /<key>StandardErrorPath<\/key>/);
    const args = [...(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(body)[1].matchAll(/<string>([^<]*)<\/string>/g))].map((m) => m[1]);
    const script = args.find((a) => a.startsWith('__SHIN_REPO_DIR__/mac/'));
    assert.ok(script, 'runs something from mac/');
    assert.ok(existsSync(join(MAC, script.replace('__SHIN_REPO_DIR__/mac/', ''))), `${script} exists`);
    const hasSchedule = /StartCalendarInterval|StartInterval|KeepAlive/.test(body);
    assert.ok(hasSchedule, 'something must start it');
  });
}

test('the server daemon is kept alive and starts at boot; scheduled jobs do not run at load', () => {
  const server = readFileSync(join(DIR, 'com.shin.server.plist'), 'utf8');
  assert.match(server, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(server, /<key>RunAtLoad<\/key>\s*<true\/>/);
  for (const f of files.filter((x) => !/server|checker|deadman/.test(x))) {
    assert.match(readFileSync(join(DIR, f), 'utf8'), /<key>RunAtLoad<\/key>\s*<false\/>/, f);
  }
});

test('nightly order: integrity 03:30, backup 04:00, offsite 04:45, logrotate 05:00 (each after the one it depends on)', () => {
  const at = (n) => {
    const x = readFileSync(join(DIR, `com.shin.${n}.plist`), 'utf8');
    return Number(/<key>Hour<\/key>\s*<integer>(\d+)/.exec(x)[1]) * 60 + Number(/<key>Minute<\/key>\s*<integer>(\d+)/.exec(x)[1]);
  };
  assert.ok(at('integrity') < at('backup') && at('backup') < at('offsite') && at('offsite') < at('logrotate'));
  assert.ok(at('offsite') - at('backup') >= 30, 'room for the backup to finish');
});

test('the dead-man ping runs every 60 seconds and at load, so the first ping does not wait a minute (R02/R03)', () => {
  const x = readFileSync(join(DIR, 'com.shin.deadman.plist'), 'utf8');
  assert.match(x, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/);
  assert.match(x, /<key>RunAtLoad<\/key>\s*<true\/>/);
});

test('every daemon starts with Umask 077 (decimal 63) so files it creates are owner-only (D3)', () => {
  for (const f of files) assert.match(readFileSync(join(DIR, f), 'utf8'), /<key>Umask<\/key>\s*<integer>63<\/integer>/, f);
});
