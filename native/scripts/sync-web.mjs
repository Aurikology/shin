#!/usr/bin/env node
/**
 * Copies app/public into native/www, then injects one inline script into the
 * copy that sets window.SHIN_API_BASE and window.SHIN_INVITE_CODE before
 * /js/main.js loads.
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
import path from 'node:path';

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

const config = JSON.parse(readFileSync(configPath, 'utf8'));

/*
 * RevenueCat's public SDK keys (Shin Plus, 2026-09-21). Read from a gitignored
 * file beside shin-api.config.json; the committed one is the .example. Missing
 * is not fatal: the build still works, and the subscription screen shows no
 * plans on a platform with no key.
 */
const rcPath = path.join(nativeRoot, 'config', 'revenuecat.config.json');
let rcKeys = { ios: '', android: '' };
if (existsSync(rcPath)) {
  const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
  rcKeys = { ios: String(rc.ios ?? ''), android: String(rc.android ?? '') };
  for (const [k, v] of Object.entries(rcKeys)) {
    if (v.startsWith('sk_')) {
      console.error(`[sync-web] revenuecat.config.json "${k}" is a SECRET key (sk_...). Only public SDK keys go in the app.`);
      process.exit(1);
    }
  }
} else {
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

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });

const indexPath = path.join(dest, 'index.html');
let html = readFileSync(indexPath, 'utf8');

const marker = '<script type="module" src="/js/main.js"></script>';
if (!html.includes(marker)) {
  console.error('[sync-web] expected script tag not found in copied index.html: ' + marker);
  console.error('[sync-web] app/public/index.html has changed shape. Update the marker in this script.');
  process.exit(1);
}

cpSync(capacitorBuild, path.join(dest, 'js', 'capacitor.js'));

const configScript =
  `<script>\n` +
  `  window.SHIN_API_BASE = ${JSON.stringify(config.apiBase)};\n` +
  `  window.SHIN_INVITE_CODE = ${JSON.stringify(config.inviteCode)};\n` +
  `  window.SHIN_NATIVE_CAMERA_FALLBACK = ${JSON.stringify(Boolean(config.nativeCameraFallback))};\n` +
  `  window.SHIN_RC_KEYS = ${JSON.stringify(rcKeys)};\n` +
  `</script>\n` +
  `<script src="/js/capacitor.js"></script>\n`;

html = html.replace(marker, configScript + marker);
writeFileSync(indexPath, html);

console.log(`[sync-web] copied ${source} -> ${dest}`);
console.log(`[sync-web] injected SHIN_API_BASE=${config.apiBase}`);
console.log(`[sync-web] RevenueCat keys: ios ${rcKeys.ios ? 'set' : 'EMPTY'}, android ${rcKeys.android ? 'set' : 'EMPTY'}`);
