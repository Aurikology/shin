#!/usr/bin/env node
/**
 * Fake-camera check: the app in Chromium at iPhone 13 size with a fake camera feed (which WebKit
 * on Windows lacks), past the first screen, then the barcode button tapped with no code in view.
 * Prints whether the press shows it is looking (D-252), whether the look ends with the coaching
 * line, and every page or console error. Screenshots to OUT (default: the OS temp folder).
 *
 *   PLAYWRIGHT_DIR=<folder holding node_modules/playwright> node scripts/fake-camera-check.mjs
 *
 * Own server on a free port, every data path in a fresh temp folder, killed at the end.
 * Written 2026-11-11 for D-252 (fix-loop skill, step 5).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url))), APP = join(ROOT, 'app');
if (!process.env.PLAYWRIGHT_DIR) { console.error('[fake-camera-check] set PLAYWRIGHT_DIR'); process.exit(2); }
const { chromium, devices } = await import(pathToFileURL(join(process.env.PLAYWRIGHT_DIR, 'node_modules/playwright/index.mjs')).href);
const { pathSettings } = await import(pathToFileURL(join(APP, 'test/setup/data-paths.mjs')).href);
const OUT = process.env.OUT ?? tmpdir();
const tmp = mkdtempSync(join(tmpdir(), 'fake-camera-'));
const port = await new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const env = { ...process.env, PORT: String(port) };
for (const s of await pathSettings()) env[s.env] = join(tmp, s.name);
const server = spawn(process.execPath, ['server.ts'], { cwd: APP, env, stdio: 'ignore' });
const BASE = `http://localhost:${port}/`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
const errs = [];
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['camera'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  await p.goto(BASE); await p.waitForTimeout(1500);
  if (await p.locator('[data-agree-tick]').count()) { await p.locator('[data-agree-tick]').check(); await p.locator('[data-agree-claude][value="no"]').check(); }
  for (let i = 0; i < 4; i++) { const c = p.locator('#screen button:visible', { hasText: /Continue|Get started|Start|Allow|OK|Next/ }).first(); if (!(await c.count())) break; await c.click().catch(() => {}); await p.waitForTimeout(600); }
  console.log('screen', await p.evaluate(() => document.querySelector('#screen')?.dataset.screen));
  await p.waitForTimeout(4000); // let the eye start on the fake feed
  console.log('camera state', await p.evaluate(() => document.querySelector('.cam')?.dataset.camera));
  const btn = p.locator('.scan-code-btn');
  await btn.click();
  await p.waitForTimeout(300);
  const during = await btn.evaluate(e => ({ looking: e.classList.contains('is-looking'), busy: e.getAttribute('aria-busy'), ring: getComputedStyle(e, '::after').animationName }));
  console.log('300 ms after tap', JSON.stringify(during));
  await p.screenshot({ path: OUT + '/look-during.png' });
  await p.waitForTimeout(3000);
  const after = await btn.evaluate(e => ({ looking: e.classList.contains('is-looking'), busy: e.getAttribute('aria-busy') }));
  const dock = await p.evaluate(() => document.querySelector('.cam-shin')?.innerText.trim().slice(0, 80));
  console.log('3.3 s after tap', JSON.stringify(after), 'dock:', JSON.stringify(dock));
  await p.screenshot({ path: OUT + '/look-after.png' });
  console.log('errors', errs.length, errs.slice(0, 5));
} finally { await b.close(); server.kill(); }
