/**
 * One app id on both stores: com.getpexi.app (RULINGS.md, "App id com.getpexi.app on both
 * stores", Jamin 2026-10-08). Found 2026-11-11 by the Android emulator run: iOS and
 * native/capacitor.config.json had moved, the Android build still installed as
 * com.useshinapp.shin, the retired id that carries the dropped name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');
const APP_ID = JSON.parse(read('native/capacitor.config.json')).appId;

function javaFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? javaFiles(p) : p.endsWith('.java') ? [p] : [];
  });
}

test('the Capacitor config carries the ruled app id', () => {
  assert.equal(APP_ID, 'com.getpexi.app');
});

test('the Android build installs under the same id, with the same code namespace', () => {
  const gradle = read('native/android/app/build.gradle');
  assert.match(gradle, new RegExp(`applicationId\\s+"${APP_ID.replace(/\./g, '\\.')}"`));
  assert.match(gradle, new RegExp(`namespace\\s*=\\s*"${APP_ID.replace(/\./g, '\\.')}"`));
  const strings = read('native/android/app/src/main/res/values/strings.xml');
  assert.match(strings, new RegExp(`name="package_name">${APP_ID}<`));
  assert.match(strings, new RegExp(`name="custom_url_scheme">${APP_ID}<`));
});

test('every Android source file sits in the app id package', () => {
  const javaRoot = path.join(repoRoot, 'native', 'android', 'app', 'src', 'main', 'java');
  const files = javaFiles(javaRoot);
  assert.ok(files.length > 0);
  for (const f of files) {
    const rel = path.relative(javaRoot, path.dirname(f)).split(path.sep).join('.');
    assert.equal(rel, APP_ID, `${f} is not under ${APP_ID}`);
    assert.match(readFileSync(f, 'utf8'), new RegExp(`^package ${APP_ID.replace(/\./g, '\\.')};`, 'm'));
  }
});

test('the iOS bundle id matches', () => {
  const pbx = read('native/ios/App/App.xcodeproj/project.pbxproj');
  const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
  assert.ok(ids.length > 0);
  for (const id of ids) assert.equal(id, APP_ID);
});
