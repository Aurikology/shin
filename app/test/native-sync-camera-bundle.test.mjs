/**
 * The phone build must carry the barcode reader.
 *
 * Found 2026-11-11 by the Android emulator run (scripts/phone-run): `npm run cap:sync`
 * copies app/public into the phone app, but app/public/js/eye.js and
 * app/public/js/vendor/zxing_reader.wasm are build output of `npm run build-eye`
 * (gitignored), and nothing in the sync ran it. A phone build from a fresh clone
 * opened the camera, showed a feed, and never read a barcode: three 404s in the
 * WebView console, the button stuck on "Point me at the barcode".
 *
 * These tests run the real native/scripts/sync-web.mjs inside a temp copy of the
 * repo layout, with a stand-in build-eye, so nothing real is built or touched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const realSync = path.join(repoRoot, 'native', 'scripts', 'sync-web.mjs');

/** A temp tree shaped like the repo: native/scripts/sync-web.mjs, native/config, app/public, app/scripts/build-eye.mjs. */
function layout(buildEyeBody) {
  const root = mkdtempSync(path.join(tmpdir(), 'pexi-sync-'));
  const w = (rel, body) => {
    const p = path.join(root, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, body);
  };
  mkdirSync(path.join(root, 'native', 'scripts'), { recursive: true });
  copyFileSync(realSync, path.join(root, 'native', 'scripts', 'sync-web.mjs'));
  w('native/config/shin-api.config.json', JSON.stringify({ apiBase: 'https://api.test.local', inviteCode: '', nativeCameraFallback: false }));
  w('native/node_modules/@capacitor/core/dist/capacitor.js', '/* stand-in */');
  w('app/public/index.html', '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/js/main.js"></script></body></html>');
  w('app/public/js/main.js', '/* stand-in */');
  w('app/scripts/build-eye.mjs', buildEyeBody);
  return root;
}

function sync(root) {
  return spawnSync(process.execPath, [path.join(root, 'native', 'scripts', 'sync-web.mjs')], {
    cwd: path.join(root, 'native'),
    encoding: 'utf8',
  });
}

const WRITES_BUNDLE = `
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const js = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'public', 'js');
mkdirSync(path.join(js, 'vendor'), { recursive: true });
writeFileSync(path.join(js, 'eye.js'), '/* built */');
writeFileSync(path.join(js, 'vendor', 'zxing_reader.wasm'), 'wasm');
`;

test('cap:sync builds the camera bundle, so a fresh clone ships a barcode reader', () => {
  const root = layout(WRITES_BUNDLE);
  try {
    const r = sync(root);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(path.join(root, 'native', 'www', 'js', 'eye.js')), 'eye.js missing from the phone copy');
    assert.ok(existsSync(path.join(root, 'native', 'www', 'js', 'vendor', 'zxing_reader.wasm')), 'zxing_reader.wasm missing from the phone copy');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cap:sync stops when the build leaves no barcode reader behind', () => {
  // build-eye "succeeds" but writes no wasm, as it does when zxing-wasm is not installed (copyIfPresent only warns).
  const root = layout(`
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const js = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'public', 'js');
mkdirSync(js, { recursive: true });
writeFileSync(path.join(js, 'eye.js'), '/* built */');
`);
  try {
    const r = sync(root);
    assert.notEqual(r.status, 0, 'sync passed with no zxing_reader.wasm');
    assert.match(r.stderr, /zxing_reader\.wasm/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cap:sync stops when the camera build itself fails', () => {
  const root = layout('process.exit(3);');
  try {
    const r = sync(root);
    assert.notEqual(r.status, 0, 'sync passed although build-eye failed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
