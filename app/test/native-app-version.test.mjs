/**
 * ops finding 2 (review 2026-11-21): the update gate (R13) judges the app's APP_VERSION, which was
 * typed by hand for each build and tied to nothing. If a fix shipped under the same APP_VERSION as
 * the bad build, raising SHIN_APP_MIN_VERSION blocked both builds or neither.
 *
 * The phone build now stamps the copy of js/version.js in native/www from the Xcode build number
 * (CURRENT_PROJECT_VERSION), so the number Apple counts and the number the gate judges cannot drift.
 * The source file app/public/js/version.js (what the web server serves) is never touched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readBuildNumber, stampVersionSource, versionFor } from '../../native/scripts/app-version.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const nativeScripts = path.join(repoRoot, 'native', 'scripts');
const pbx = (...numbers) => numbers.map((n) => `\t\t\t\tCURRENT_PROJECT_VERSION = ${n};\n`).join('');
const SOURCE = "/** doc */\nexport const APP_VERSION = '2026-11-18.1';\n";
const SERVER_FORMAT = /^\d{4}-\d{2}-\d{2}\.\d{1,4}$/; // app/src/app-status.ts VERSION

test('the build number is read from the Xcode project, and both configurations must agree', () => {
  assert.equal(readBuildNumber(pbx(10, 10)), 10);
  assert.throws(() => readBuildNumber(pbx(10, 11)), /disagree/);
  assert.throws(() => readBuildNumber('nothing here'), /CURRENT_PROJECT_VERSION/);
  assert.throws(() => readBuildNumber(pbx('$(inherited)')), /CURRENT_PROJECT_VERSION/);
});

test('the stamped version is YYYY-MM-DD.<build>, the format the server gate accepts', () => {
  assert.equal(versionFor(10, new Date('2026-11-21T05:00:00Z')), '2026-11-21.10');
  assert.match(versionFor(9999, new Date('2026-01-02T00:00:00Z')), SERVER_FORMAT);
  assert.throws(() => versionFor(10000, new Date('2026-11-21T00:00:00Z')), /1 to 4 digits/);
  assert.throws(() => versionFor(0, new Date('2026-11-21T00:00:00Z')), /1 to 4 digits/);
});

test('stamping rewrites only the APP_VERSION string and fails loudly if the line is not there', () => {
  const out = stampVersionSource(SOURCE, '2026-11-21.10');
  assert.equal(out, SOURCE.replace('2026-11-18.1', '2026-11-21.10'));
  assert.throws(() => stampVersionSource('export const OTHER = 1;', '2026-11-21.10'), /APP_VERSION/);
});

test('the real Xcode project and the real version.js are both readable by the stamper', () => {
  const build = readBuildNumber(readFileSync(path.join(repoRoot, 'native', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8'));
  assert.ok(Number.isInteger(build) && build >= 1);
  const real = readFileSync(path.join(repoRoot, 'app', 'public', 'js', 'version.js'), 'utf8');
  const stamped = stampVersionSource(real, versionFor(build, new Date('2026-11-21T00:00:00Z')));
  assert.match(stamped, /APP_VERSION = '2026-11-21\.\d{1,4}';/);
});

test('a later build number is never below an earlier one, so the minimum can tell a fix from the bad build', async () => {
  const { makeDocument, makeStorage, installBrowser } = await import('./mini-dom.mjs');
  installBrowser({ doc: makeDocument(), storage: makeStorage() });
  const { versionBelow } = await import('../public/js/remote-status.js');
  const day = new Date('2026-11-21T00:00:00Z');
  assert.equal(versionBelow(versionFor(10, day), versionFor(11, day)), true);
  assert.equal(versionBelow(versionFor(11, day), versionFor(11, day)), false);
  assert.equal(versionBelow(versionFor(12, day), versionFor(11, day)), false);
  assert.equal(versionBelow(versionFor(9, day), versionFor(10, day)), true, 'build 9 vs 10 compares as numbers, not text');
});

/** A temp tree shaped like the repo, running the real sync-web.mjs with a stand-in camera build. */
function layout({ pbxproj }) {
  const root = mkdtempSync(path.join(tmpdir(), 'pexi-version-'));
  const w = (rel, body) => {
    const p = path.join(root, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, body);
  };
  mkdirSync(path.join(root, 'native', 'scripts'), { recursive: true });
  for (const f of ['sync-web.mjs', 'rc-keys.mjs', 'app-version.mjs']) copyFileSync(path.join(nativeScripts, f), path.join(root, 'native', 'scripts', f));
  w('native/config/shin-api.config.json', JSON.stringify({ apiBase: 'https://api.test.local', inviteCode: '' }));
  w('native/node_modules/@capacitor/core/dist/capacitor.js', '/* stand-in */');
  w('app/public/index.html', '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/js/main.js"></script></body></html>');
  w('app/public/js/main.js', '/* stand-in */');
  w('app/public/js/version.js', SOURCE);
  if (pbxproj !== null) w('native/ios/App/App.xcodeproj/project.pbxproj', pbxproj);
  w(
    'app/scripts/build-eye.mjs',
    `import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const js = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'public', 'js');
mkdirSync(path.join(js, 'vendor'), { recursive: true });
writeFileSync(path.join(js, 'eye.js'), '/* built */');
writeFileSync(path.join(js, 'vendor', 'zxing_reader.wasm'), 'wasm');
`,
  );
  return root;
}
const sync = (root, env = {}) =>
  spawnSync(process.execPath, [path.join(root, 'native', 'scripts', 'sync-web.mjs')], {
    cwd: path.join(root, 'native'),
    encoding: 'utf8',
    env: { ...process.env, SHIN_BUILD_NUMBER: '', ...env },
  });

test('the phone build is stamped from the Xcode build number; the web source file is untouched', () => {
  const root = layout({ pbxproj: pbx(10, 10) });
  try {
    const r = sync(root);
    assert.equal(r.status, 0, r.stderr);
    const phone = readFileSync(path.join(root, 'native', 'www', 'js', 'version.js'), 'utf8');
    assert.match(phone, /APP_VERSION = '\d{4}-\d{2}-\d{2}\.10';/);
    assert.equal(readFileSync(path.join(root, 'app', 'public', 'js', 'version.js'), 'utf8'), SOURCE);
    assert.match(r.stdout, /APP_VERSION/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('SHIN_BUILD_NUMBER overrides the Xcode number, for a build whose number is set later', () => {
  const root = layout({ pbxproj: pbx(10, 10) });
  try {
    const r = sync(root, { SHIN_BUILD_NUMBER: '23' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(path.join(root, 'native', 'www', 'js', 'version.js'), 'utf8'), /\.23';/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a build with no readable build number stops, rather than shipping the hand-typed string', () => {
  for (const pbxproj of [null, pbx(10, 11), 'nothing']) {
    const root = layout({ pbxproj });
    try {
      const r = sync(root);
      assert.notEqual(r.status, 0, 'must stop');
      assert.match(r.stderr, /build number|CURRENT_PROJECT_VERSION|disagree/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
