#!/usr/bin/env node
/**
 * Copies app/public into native/www, then writes js/native-config.js, which sets
 * window.SHIN_API_BASE and window.SHIN_INVITE_CODE before /js/main.js loads, and
 * adds the content security policy tag to the copy of the page.
 *
 * This never touches app/public/index.html. It only edits the copy that lands
 * in native/www, which is generated build output (gitignored) and owned by
 * this wrapper project. `npx cap sync` / `npx cap copy` then take native/www
 * into the native ios/android projects.
 *
 * Run via `npm run sync`, or automatically as part of `npm run cap:sync`.
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { checkRevenueCatKeys } from './rc-keys.mjs';
import { readBuildNumber, stampVersionSource, versionFor } from './app-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativeRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(nativeRoot, '..');
const source = path.join(repoRoot, 'app', 'public');
const dest = path.join(nativeRoot, 'www');
const configPath = path.join(nativeRoot, 'config', 'shin-api.config.json');

if (!existsSync(source)) {
  console.error(`[sync-web] source not found: ${source}`);
  process.exit(1);
}

/*
 * The real hostname and invite code, from a gitignored file beside
 * revenuecat.config.json; the committed one is the .example (2026-10-16).
 * Missing IS fatal: a wrapper built against the example's placeholder
 * hostname installs on a phone and reaches nothing, which is worse than a
 * build that stops here and says what to copy.
 */
if (!existsSync(configPath)) {
  console.error(`[sync-web] no ${configPath}; copy config/shin-api.config.example.json to it and fill in apiBase and inviteCode.`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (/REPLACE-WITH|example\.invalid/.test(`${config.apiBase} ${config.inviteCode}`)) {
  console.error(`[sync-web] ${configPath} still holds the example placeholders. Fill in the real apiBase and inviteCode before building.`);
  process.exit(1);
}

/*
 * RevenueCat's public SDK keys (Shin Plus, 2026-09-21). Read from a gitignored
 * file beside shin-api.config.json; the committed one is the .example. Missing
 * is not fatal: the build still works, and the subscription screen shows no
 * plans on a platform with no key.
 */
const rcPath = path.join(nativeRoot, 'config', 'revenuecat.config.json');
/** A release build (App Store or TestFlight for review) passes --release or sets SHIN_RELEASE=1; R31. */
const release = process.argv.includes('--release') || process.env.SHIN_RELEASE === '1';
let rcKeys = { ios: '', android: '' };
if (existsSync(rcPath)) {
  const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
  rcKeys = { ios: String(rc.ios ?? ''), android: String(rc.android ?? '') };
  // R31: refuse a secret key, a key of the wrong platform, and (for a release) a missing iOS key.
  const keyProblem = checkRevenueCatKeys(rcKeys, { release });
  if (keyProblem) {
    console.error(`[sync-web] ${keyProblem}`);
    process.exit(1);
  }
} else {
  if (release) {
    console.error(`[sync-web] --release build with no ${rcPath}: the paywall could not sell. Copy revenuecat.config.example.json to it and fill in the iOS key.`);
    process.exit(1);
  }
  console.warn(`[sync-web] no ${rcPath}; copy revenuecat.config.example.json to it. Building with no RevenueCat keys.`);
}

/*
 * Capacitor's browser build, so plain ES modules can reach native plugins.
 * app/public has no bundler, so `import ... from '@capacitor/core'` cannot
 * resolve there; this script gives the page `window.Capacitor.registerPlugin`
 * instead, which app/public/js/purchases.js uses to reach RevenueCat's
 * native Purchases plugin.
 */
const capacitorBuild = path.join(nativeRoot, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js');
if (!existsSync(capacitorBuild)) {
  console.error(`[sync-web] ${capacitorBuild} not found. Run npm install in native/.`);
  process.exit(1);
}

/*
 * The barcode reader is build output, not source: app/public/js/eye.js and
 * js/vendor/zxing_reader.wasm come from `npm run build-eye` and are gitignored.
 * Until 2026-11-11 nothing here ran it, so a phone build from a fresh clone
 * opened the camera and never read a barcode (found by the Android emulator run,
 * scripts/phone-run: three 404s, the button stuck on "Point me at the barcode"),
 * and a machine with an old build shipped an old reader. Build it every time.
 */
const buildEye = path.join(repoRoot, 'app', 'scripts', 'build-eye.mjs');
const built = spawnSync(process.execPath, [buildEye], { cwd: path.join(repoRoot, 'app'), stdio: 'inherit' });
if (built.status !== 0) {
  console.error(`[sync-web] the camera build failed (exit ${built.status}). Run npm ci in app/ and retry; a phone build without it cannot read barcodes.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });

// build-eye only warns when a wasm is missing, so check what actually landed in the copy.
for (const rel of ['js/eye.js', 'js/vendor/zxing_reader.wasm']) {
  if (!existsSync(path.join(dest, rel))) {
    console.error(`[sync-web] ${rel} is missing from the phone copy, so the app would have no barcode reader. Run npm ci in app/ and retry.`);
    process.exit(1);
  }
}

/*
 * The photo engine (MediaPipe, 34 MB of WebAssembly) only ever starts when FLAGS.photoId is on AND
 * js/vendor/efficientdet_lite0.tflite is present: eye-attach.js passes the model URL only then, and
 * src/eye/camera.ts makes no detector without one. For 1.0 neither is true, so until 2026-11-20
 * every phone build carried 34 MB it never ran. Only the copy is trimmed; turning photo scans on
 * and adding the model brings it back with no change here.
 */
const flagsPath = path.join(source, 'js', 'flags.js');
const photoIdOn = existsSync(flagsPath) && /\bphotoId:\s*true\b/.test(readFileSync(flagsPath, 'utf8'));
const hasDetectorModel = existsSync(path.join(source, 'js', 'vendor', 'efficientdet_lite0.tflite'));
const photoEngine = path.join(dest, 'js', 'vendor', 'mediapipe-wasm');
if (!(photoIdOn && hasDetectorModel) && existsSync(photoEngine)) {
  rmSync(photoEngine, { recursive: true, force: true });
  console.log(`[sync-web] left out js/vendor/mediapipe-wasm: photo scans ${photoIdOn ? 'on' : 'off'}, detector model ${hasDetectorModel ? 'present' : 'absent'}`);
}

const indexPath = path.join(dest, 'index.html');
let html = readFileSync(indexPath, 'utf8');

const marker = '<script type="module" src="/js/main.js"></script>';
if (!html.includes(marker)) {
  console.error('[sync-web] expected script tag not found in copied index.html: ' + marker);
  console.error('[sync-web] app/public/index.html has changed shape. Update the marker in this script.');
  process.exit(1);
}

cpSync(capacitorBuild, path.join(dest, 'js', 'capacitor.js'));

/*
 * The update gate's build identity (R13): APP_VERSION in the phone copy is `<date>.<Xcode build number>`,
 * so it rises with every upload and cannot be forgotten. Bump the build number in Xcode BEFORE running
 * this, or pass SHIN_BUILD_NUMBER. Only the copy is stamped; app/public/js/version.js is untouched.
 */
let appVersion;
try {
  const override = (process.env.SHIN_BUILD_NUMBER ?? '').trim();
  const build = override
    ? Number(override)
    : readBuildNumber(readFileSync(path.join(nativeRoot, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8'));
  appVersion = versionFor(build);
  const versionPath = path.join(dest, 'js', 'version.js');
  writeFileSync(versionPath, stampVersionSource(readFileSync(versionPath, 'utf8'), appVersion));
} catch (e) {
  console.error(`[sync-web] cannot set APP_VERSION from the build number: ${e.message}`);
  process.exit(1);
}

// A file, not an inline script, so the page's script rule can stay "this app's own files only".
writeFileSync(
  path.join(dest, 'js', 'native-config.js'),
  `window.SHIN_API_BASE = ${JSON.stringify(config.apiBase)};\n` +
    `window.SHIN_INVITE_CODE = ${JSON.stringify(config.inviteCode)};\n` +
    `window.SHIN_NATIVE_CAMERA_FALLBACK = ${JSON.stringify(Boolean(config.nativeCameraFallback))};\n` +
    `window.SHIN_RC_KEYS = ${JSON.stringify(rcKeys)};\n`,
);

// The same policy app/server.ts sends as a header, as a tag: the phone build is served from the phone.
const self = "'self' capacitor://localhost https://localhost";
const contentSecurityPolicy = [
  `default-src ${self}`,
  `script-src ${self} 'wasm-unsafe-eval'`,
  `style-src ${self} 'unsafe-inline'`,
  `img-src ${self} data: blob:`,
  `media-src ${self} blob:`,
  `font-src ${self}`,
  `connect-src ${self} ${new URL(config.apiBase).origin}`,
  `worker-src ${self} blob:`,
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

// In <head>: a policy tag anywhere later is ignored by the browser.
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`);
if (!html.includes('Content-Security-Policy')) {
  console.error('[sync-web] the charset tag was not found, so the page would ship with no content security policy.');
  process.exit(1);
}

const configScript =
  `<script src="/js/native-config.js"></script>\n` +
  `<script src="/js/capacitor.js"></script>\n`;

html = html.replace(marker, configScript + marker);
writeFileSync(indexPath, html);

console.log(`[sync-web] copied ${source} -> ${dest}`);
console.log(`[sync-web] injected SHIN_API_BASE=${config.apiBase}`);
console.log(`[sync-web] APP_VERSION=${appVersion} (from the build number; the update gate judges this)`);
console.log(`[sync-web] RevenueCat keys: ios ${rcKeys.ios ? 'set' : 'EMPTY'}, android ${rcKeys.android ? 'set' : 'EMPTY'}`);
