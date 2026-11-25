#!/usr/bin/env node
/**
 * Accessibility sweep (R80, docs/readiness/REGISTER.md): axe-core over every app state reachable
 * by tapping, at iPhone 13 size in Chromium, plus a pixel contrast check of the text axe cannot
 * decide (text over the camera feed, a gradient, or a pseudo-element). Exits 1 on any axe
 * violation or any measured text under its floor (4.5:1, or 3:1 for 24 px+ / 18.66 px+ bold).
 *
 * Written 2026-11-24. First run on 34a6157: 14 states, 0 axe violations; one measured failure,
 * the price pad's ghosted 0.00 at 1.81 to 2.08:1, fixed in 5176dec (test/pad-ghost-contrast).
 *
 * WHAT IT CANNOT SEE: VoiceOver itself (reading order, what is spoken, rotor), Dynamic Type, a
 * real camera picture behind the camera's white text (the fake feed is a flat green), the paywall
 * with real store offerings, and anything that needs a server answer the temp server cannot give.
 * The VoiceOver pass on a phone (R80's smallest fix) is still needed.
 *
 * Playwright and axe-core are not repo dependencies. Point at a folder holding both:
 *   PLAYWRIGHT_DIR=<folder with node_modules/playwright and node_modules/axe-core> node scripts/a11y-sweep.mjs
 * (`npm i playwright axe-core` there, then `npx playwright install chromium` once).
 *
 * Starts its own server on a free port with every data path in a fresh temp folder (the real
 * catalogue read-only if present) and kills it by PID at the end. Real data is never touched.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const APP = join(ROOT, 'app');

const pwDir = process.env.PLAYWRIGHT_DIR;
if (!pwDir || !existsSync(join(pwDir, 'node_modules', 'playwright')) || !existsSync(join(pwDir, 'node_modules', 'axe-core'))) {
  console.error('[a11y-sweep] set PLAYWRIGHT_DIR to a folder holding node_modules/playwright and node_modules/axe-core');
  process.exit(2);
}
const { chromium, devices } = await import(pathToFileURL(join(pwDir, 'node_modules', 'playwright', 'index.mjs')).href);
const AXE = readFileSync(join(pwDir, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const port = await new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const { pathSettings } = await import(pathToFileURL(join(APP, 'test', 'setup', 'data-paths.mjs')).href);
const tmp = mkdtempSync(join(tmpdir(), 'a11y-sweep-'));
const env = { ...process.env, PORT: String(port) };
for (const s of await pathSettings()) env[s.env] = join(tmp, s.name);
const catalogue = join(ROOT, 'catalogue', 'data', 'catalogue.db');
if (existsSync(catalogue)) env.SHIN_CATALOGUE = catalogue;
const server = spawn(process.execPath, ['server.ts'], { cwd: APP, env, stdio: 'ignore' });
const BASE = `http://localhost:${port}/`;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}api/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const problems = [];
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
// bypassCSP only so axe can be injected; the app's own policy is otherwise unchanged.
const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['camera'], bypassCSP: true });
const p = await ctx.newPage();
let px; // a second page that decodes screenshots on a canvas

const sig = () => p.evaluate(() => {
  const sc = document.querySelector('#screen')?.dataset.screen ?? '?';
  const sh = document.querySelector('.sheet:not([hidden])');
  return sc + (sh ? ':' + (sh.className + ' ' + (sh.querySelector('h1,h2,h3')?.textContent ?? '')).slice(0, 60) : '');
}).catch(() => 'DEAD');

/** Contrast of one element from its rendered pixels: the commonest colour is the ground, the
 *  colour (over 1% of the box) furthest from it in luminance is the text. */
async function measure(sel) {
  const loc = p.locator(sel).first();
  if (!(await loc.count()) || !(await loc.isVisible().catch(() => false))) return null;
  const info = await loc.evaluate((e) => { const cs = getComputedStyle(e); return { size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), text: e.innerText.trim().slice(0, 40) }; });
  if (!info.text || !/[\p{L}\p{N}]/u.test(info.text)) return null; // icons and keys with no text
  const buf = await loc.screenshot({ animations: 'disabled' }).catch(() => null);
  if (!buf) return null;
  px ??= await ctx.newPage();
  const st = await px.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const cnt = new Map();
    for (let i = 0; i < d.length; i += 4) { const k = `${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`; cnt.set(k, (cnt.get(k) || 0) + 1); }
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = ([r, gg, bb]) => 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(bb);
    const rgb = (k) => k.split(',').map((v) => v * 8 + 4);
    const top = [...cnt.entries()].sort((x, y) => y[1] - x[1]);
    const bg = rgb(top[0][0]); const lb = L(bg); const total = d.length / 4;
    let fg = bg; let bd = 0;
    for (const [k, n] of top) { if (n < total * 0.01) continue; const dd = Math.abs(L(rgb(k)) - lb); if (dd > bd) { bd = dd; fg = rgb(k); } }
    const lt = L(fg);
    return { bg, fg, ratio: +((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05)).toFixed(2) };
  }, buf.toString('base64'));
  // A thin font can cover under 1% of its box, leaving fg === bg: unmeasured, not a pass or a fail.
  if (st.fg.join() === st.bg.join()) return { ...info, ...st, unmeasured: true };
  const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
  return { ...info, ...st, floor: large ? 3 : 4.5 };
}

const audited = new Set();
async function visit(label) {
  const s = await sig();
  if (audited.has(s) || s === 'DEAD') return;
  audited.add(s);
  await p.waitForTimeout(700);
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
  const res = await p.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
    return {
      passes: r.passes.length,
      violations: r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      undecided: r.incomplete.filter((i) => i.id === 'color-contrast').flatMap((i) => i.nodes.map((n) => n.target.join(' '))),
    };
  });
  for (const v of res.violations) problems.push(`${s}: ${v}`);
  const measured = [];
  for (const sel of res.undecided) {
    const m = await measure(sel);
    if (!m) continue;
    measured.push(`${sel} ${m.unmeasured ? 'unmeasured' : `${m.ratio}:1`}`);
    if (!m.unmeasured && m.ratio < m.floor) problems.push(`${s}: "${m.text}" (${sel}) ${m.ratio}:1, floor ${m.floor}:1`);
  }
  console.log(`${label} => ${s}: ${res.passes} rules pass, ${res.violations.length} fail${measured.length ? `; measured ${measured.join('; ')}` : ''}`);
}

try {
  await p.goto(BASE); await p.waitForTimeout(1500);
  await visit('first launch');
  if (await p.locator('[data-act="agree-go"]').count()) await p.locator('[data-act="agree-go"]').click();
  for (let i = 0; i < 12; i++) { // the five-screen welcome, then the walkthrough (as webkit-sweep.mjs)
    await visit(`setup ${i}`);
    const opt = p.locator('#screen .onb-opt:visible').first();
    if (await opt.count()) await opt.click().catch(() => {});
    const c = p.locator('#screen button:visible', { hasText: /Continue|Get started|Start|Allow|OK|Next/ }).first();
    if (!(await c.count())) break;
    await c.click().catch(() => {}); await p.waitForTimeout(600);
  }
  if (!(await sig()).startsWith('camera')) throw new Error(`setup did not reach the camera (on ${await sig()}); nothing would be measured`);
  await visit('camera');

  // The typed path: the name sheet, the price pad, the which-one picker.
  for (const q of ['oreo', 'kraft dinner original 225g']) {
    const ms = p.getByRole('button', { name: /Type name|Manual Search/ }).first();
    if (!(await ms.count())) { problems.push('no Type name button on the camera'); break; }
    await ms.click().catch(() => {}); await p.waitForTimeout(500); await visit('type name');
    await p.fill('[data-textroute-input]', q).catch(() => {});
    await p.locator('form.textroute-form button[type=submit]').click().catch(() => {}); await p.waitForTimeout(2500);
    await visit(`search "${q}"`);
    const skip = p.locator('.sheet button:visible', { hasText: /^\s*Skip\s*$/ }).first();
    if (await skip.count()) { await skip.click().catch(() => {}); await p.waitForTimeout(2000); await visit(`skip "${q}"`); }
    await p.goto(BASE); await p.waitForTimeout(1500);
  }

  // Every other state: breadth first, two taps deep, each path replayed from a fresh load
  // (setup is remembered). Nothing that buys, mails, shares or deletes is tapped.
  const SKIP = /delete|erase|remove all|sign out|reset|subscribe|buy|restore|mail|help and contact|torch|scan the barcode|barcode$|share/i;
  const labels = () => p.evaluate(() => [...document.querySelectorAll('button, [role=button], a[href], [role=switch], [role=tab]')]
    .filter((e) => e.offsetParent && !e.disabled).map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim())
    .filter((t) => t && t.length < 60)).catch(() => []);
  const tap = async (l) => {
    const el = p.getByRole('button', { name: l, exact: true }).or(p.getByRole('link', { name: l, exact: true })).first();
    if (!(await el.count())) return false;
    await el.click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(900);
    return true;
  };
  const replay = async (path) => {
    await p.goto(BASE); await p.waitForTimeout(1500);
    for (const l of path) if (!(await tap(l))) return false;
    return true;
  };
  const queue = [[]];
  let taps = 0;
  while (queue.length && taps < 80) {
    const path = queue.shift();
    if (!(await replay(path))) continue;
    const here = await sig();
    for (const l of [...new Set(await labels())]) {
      if (SKIP.test(l)) continue;
      taps += 1;
      if (!(await replay(path)) || !(await tap(l))) continue;
      const now = await sig();
      if (now !== here && !audited.has(now)) { await visit([...path, l].join(' > ')); if (path.length < 2) queue.push([...path, l]); }
    }
  }
  console.log(`\n${audited.size} states audited, ${taps} taps, ${problems.length} problems`);
  for (const x of problems) console.log(`  ${x}`);
} catch (e) {
  problems.push(String(e.message ?? e));
  console.error(`[a11y-sweep] ${e.message ?? e}`);
} finally {
  await b.close().catch(() => {});
  const exited = new Promise((r) => server.once('exit', r));
  server.kill();
  await exited;
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(problems.length ? 1 : 0);
