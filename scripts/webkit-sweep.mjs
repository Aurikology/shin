#!/usr/bin/env node
/**
 * WebKit crash sweep: the app in Safari's engine at iPhone 13 size, every visible button on
 * every screen tapped, round after round, plus a typed search that finds something and one
 * that finds nothing. Prints each crash, page error and console error; exits 1 if any.
 *
 * Written 2026-11-01 for the TestFlight crash report (D-250). Four rounds, 35 taps: 0 crashes,
 * 0 errors on 165fcf5. WHAT IT CANNOT SEE: there is no camera feed (Playwright's WebKit on
 * Windows has no fake camera), and a desktop has none of an iPhone's memory limit, so a crash
 * that needs the camera or a phone's memory (D-249's kind) stays invisible here.
 *
 * Playwright is not a repo dependency (zero runtime dependencies). Point at an install:
 *   PLAYWRIGHT_DIR=<folder holding node_modules/playwright> node scripts/webkit-sweep.mjs [rounds]
 * and run `npx playwright install webkit` there once.
 *
 * It starts its own server on a free port with every data path in a fresh temp folder, the
 * real catalogue read-only if present, and kills it by PID at the end. Real data is never touched.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const APP = join(ROOT, 'app');
const ROUNDS = Number(process.argv[2] ?? 4);

const pwDir = process.env.PLAYWRIGHT_DIR;
if (!pwDir || !existsSync(join(pwDir, 'node_modules', 'playwright'))) {
  console.error('[webkit-sweep] set PLAYWRIGHT_DIR to a folder holding node_modules/playwright');
  process.exit(2);
}
const { webkit, devices } = await import(pathToFileURL(join(pwDir, 'node_modules', 'playwright', 'index.mjs')).href);

const port = await new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const { pathSettings } = await import(pathToFileURL(join(APP, 'test', 'setup', 'data-paths.mjs')).href);
const tmp = mkdtempSync(join(tmpdir(), 'webkit-sweep-'));
const env = { ...process.env, PORT: String(port) };
for (const s of await pathSettings()) env[s.env] = join(tmp, s.name);
const catalogue = join(ROOT, 'catalogue', 'data', 'catalogue.db');
if (existsSync(catalogue)) env.SHIN_CATALOGUE = catalogue;
const server = spawn(process.execPath, ['server.ts'], { cwd: APP, env, stdio: 'ignore' });
const BASE = `http://localhost:${port}/`;
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${BASE}api/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const problems = [];
const note = (k, m) => { console.log(`${k} ${m}`); if (k !== 'tap' && k !== 'round') problems.push(`${k} ${m}`); };
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
let p;
async function fresh() {
  p = await ctx.newPage();
  p.on('crash', () => note('CRASH', 'page crashed'));
  p.on('pageerror', (e) => note('pageerror', `${e.message} @ ${(e.stack ?? '').split('\n')[1] ?? ''}`));
  p.on('console', (m) => { if (m.type() === 'error') note('console.error', m.text().slice(0, 200)); });
  await p.goto(BASE); await p.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) {
    const c = p.locator('#screen button:visible', { hasText: /Continue|Get started|Start|Allow|OK|Next/ }).first();
    if (!(await c.count())) break;
    await c.click().catch(() => {}); await p.waitForTimeout(600);
  }
}
const screen = () => p.evaluate(() => document.querySelector('#screen')?.dataset.screen ?? '?').catch(() => 'DEAD');

try {
  await fresh();
  if ((await screen()) !== 'camera') throw new Error(`setup did not reach the camera (on ${await screen()}); nothing would be measured`);
  const seen = new Set();
  for (let r = 0; r < ROUNDS; r++) {
    for (const tab of ['Saved', 'You', 'Scan']) {
      const here = await screen();
      const labels = await p.evaluate(() => [...document.querySelectorAll('#screen button, #screen [role=button], #screen a[href]')]
        .filter((e) => e.offsetParent && !e.disabled).map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim()).filter(Boolean)).catch(() => []);
      for (const label of labels) {
        if (/delete|erase|remove all|sign out|reset/i.test(label)) continue;
        const key = `${here}:${label}`;
        const el = p.locator('#screen button:visible, #screen [role=button]:visible, #screen a[href]:visible').filter({ hasText: label }).first();
        const target = (await el.count()) ? el : p.getByRole('button', { name: label, exact: true }).first();
        if (!(await target.count())) continue;
        if (!seen.has(key)) { seen.add(key); note('tap', key); }
        await target.click({ timeout: 2000 }).catch(() => {});
        await p.waitForTimeout(500);
        await p.evaluate(() => { if (document.querySelector('.sheet')) history.back(); }).catch(() => {});
        await p.waitForTimeout(300);
        if ((await screen()) !== here) { await p.goBack().catch(() => {}); await p.waitForTimeout(500); }
        if ((await screen()) === 'DEAD') { note('DEAD', `after ${key}`); await p.close().catch(() => {}); await fresh(); }
      }
      const nav = p.getByRole('button', { name: tab, exact: true }).or(p.getByRole('link', { name: tab, exact: true })).first();
      if (await nav.count()) await nav.click().catch(() => {});
      await p.waitForTimeout(700);
    }
    for (const q of ['oreo', 'kraft dinner original 225g']) {
      const ms = p.getByRole('button', { name: 'Manual Search' });
      if (!(await ms.count())) continue;
      await ms.click().catch(() => {}); await p.waitForTimeout(400);
      await p.fill('[data-textroute-input]', q).catch(() => {});
      await p.locator('form.textroute-form button[type=submit]').click().catch(() => {}); await p.waitForTimeout(2000);
      const skip = p.locator('.sheet button:visible', { hasText: /^\s*Skip\s*$/ }).first();
      if (await skip.count()) { await skip.click().catch(() => {}); await p.waitForTimeout(1500); }
      await p.evaluate(() => history.back()).catch(() => {}); await p.waitForTimeout(500);
    }
    note('round', `${r + 1} of ${ROUNDS} done on ${await screen()}`);
  }
  console.log(`\n${seen.size} buttons tapped, ${ROUNDS} rounds, ${problems.length} problems`);
} catch (e) {
  problems.push(String(e.message ?? e));
  console.error(`[webkit-sweep] ${e.message ?? e}`);
} finally {
  await b.close().catch(() => {});
  // Windows will not delete the databases while the server still holds them open.
  const exited = new Promise((r) => server.once('exit', r));
  server.kill();
  await exited;
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(problems.length ? 1 : 0);
