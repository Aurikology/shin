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

const configScript =
  `<script>\n` +
  `  window.SHIN_API_BASE = ${JSON.stringify(config.apiBase)};\n` +
  `  window.SHIN_INVITE_CODE = ${JSON.stringify(config.inviteCode)};\n` +
  `  window.SHIN_NATIVE_CAMERA_FALLBACK = ${JSON.stringify(Boolean(config.nativeCameraFallback))};\n` +
  `</script>\n`;

html = html.replace(marker, configScript + marker);
writeFileSync(indexPath, html);

console.log(`[sync-web] copied ${source} -> ${dest}`);
console.log(`[sync-web] injected SHIN_API_BASE=${config.apiBase}`);
