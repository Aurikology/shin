#!/usr/bin/env node
/**
 * The phone's whole app, end to end, against the LIVE server, the way the phone reaches it.
 *
 *   PLAYWRIGHT_DIR=<folder holding node_modules/playwright> node scripts/e2e-phone-live.mjs [--api https://relay.anjiawenda.com] [--port 443] [--out <dir>] [--quick] [--allow-writes]
 *
 * Why it exists (2026-11-14): with "Send product names to Claude" on, every request the phone made failed its
 * CORS preflight and the app said "I need a connection" (x-shin-claude was never in the server's allowed
 * headers). Every test passed, because tests call the server same-origin, the hourly probe never sent the
 * header, and the fake-camera and WebKit sweeps both answer "no" to Claude on the first screen. This run uses
 * the phone's real conditions instead:
 *   - app/public packaged as native/scripts/sync-web.mjs packages it (native-config.js, the content security
 *     policy tag), served over https at https://localhost, the iOS build's own origin, so the browser applies
 *     the real CORS and CSP rules. No request interception (Playwright routing bypasses the CORS preflight).
 *   - the camera fed a generated barcode through Chromium's fake capture, read by the app's own reader.
 *   - every combination of: the Claude answer on the first screen (yes/no), location (granted/denied),
 *     language (en-CA, plus one fr-CA run); each as a fresh install, then again as a returning user.
 *   - flows: first screen, a known barcode, an unknown barcode, four typed searches (hit, typo, full name,
 *     nonsense), then every button on Scan, Saved and You that does not write shopper data.
 * A NEGATIVE CONTROL runs first: the same scan with one header the server does not allow added to every API
 * call. The run stops (exit 3) unless that control is reported as a failure, so a pass means something.
 *
 * Fails a step on: a request to the API that never completed (CORS, CSP, network), a CORS or CSP console
 * message, a page error, a 5xx/401/403 answer, or the "I need a connection" / server-fault sheet.
 * Reported, not failed: 4xx answers, console errors the app logs on purpose, the sheet each flow ended on.
 *
 * LIVE DATA: scans are written as the probe device `probe-e2e-*` (as the App Store screenshot run did); the
 * price pad is always skipped, and no typed price, correction, rating, share or purchase is ever pressed
 * unless --allow-writes is given.
 *
 * Output: one line per step on stdout as it happens ("[e2e] ..."), progress.jsonl and summary.md in --out,
 * a screenshot for every failed step. Exit 0 all pass, 1 any step failed, 2 the run could not start,
 * 3 the negative control was not caught.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:https';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { values: args } = parseArgs({
  options: {
    api: { type: 'string', default: 'https://relay.anjiawenda.com' },
    port: { type: 'string', default: '443' },
    out: { type: 'string' },
    quick: { type: 'boolean', default: false },
    'allow-writes': { type: 'boolean', default: false },
  },
});
const API = new URL(args.api).origin;
const PORT = Number(args.port);
const ORIGIN = PORT === 443 ? 'https://localhost' : `https://localhost:${PORT}`;
const OUT = resolve(args.out ?? join('e2e-out', new Date().toISOString().replace(/[:.]/g, '-')));
mkdirSync(OUT, { recursive: true });
const PROGRESS = join(OUT, 'progress.jsonl');
const stamp = () => new Date().toISOString().slice(11, 19);
const say = (line) => console.log(`[e2e] ${stamp()} ${line}`);
const die = (code, why) => { say(`STOP ${why}`); process.exit(code); };

if (!process.env.PLAYWRIGHT_DIR) die(2, 'set PLAYWRIGHT_DIR to a folder holding node_modules/playwright');
const { chromium, devices } = await import(pathToFileURL(join(process.env.PLAYWRIGHT_DIR, 'node_modules', 'playwright', 'index.mjs')).href);

const KNOWN = { code: '0068100084245', expect: /peanut butter/i }; // Kraft Smooth Peanut Butter 1kg, live catalogue 2026-11-14
const UNKNOWN = { code: '0064100111998', expect: null }; // Kraft Dinner: not in the live catalogue 2026-11-14
const SEARCHES = ['oreo', 'cheerois', 'kraft dinner original 225g', 'zzqxwv'];
/* Buttons never pressed on the live server without --allow-writes: they write shopper data others would read. */
const WRITE_ACTS = new Set(['pad-confirm', 'correct', 'correct-save', 'correct-sale', 'thumbs-up', 'thumbs-down', 'thumbs-reason', 'share', 'dist-suspect', 'dist-save', 'priceonly', 'range-save', 'watch', 'watchlist', 'keepit', 'shoot']);
const NEVER_LABEL = /delete|erase|remove all|sign out|reset|subscribe|start my|free trial|restore|purchase|buy|send it|report|bad price|wrong/i;

/* ------------------------------------------------------------------ the browser */

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const dirs = [join(process.env.LOCALAPPDATA ?? '', 'ms-playwright'), join(homedir(), 'Library', 'Caches', 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright')];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    const found = readdirSync(d).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const n of found) {
      for (const exe of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
        if (existsSync(join(d, n, exe))) return join(d, n, exe);
      }
    }
  }
  return undefined;
}
const EXE = chromiumPath();

/* ------------------------------------------------------------------ barcodes as a camera feed */

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function ean13Svg(code) {
  const d = code.split('').map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i += 1) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i += 1) bits += R[d[i]];
  bits += '101';
  const m = 5;
  const x0 = (640 - bits.length * m) / 2;
  const rects = [...bits].map((b, i) => (b === '1' ? `<rect x="${x0 + i * m}" y="90" width="${m}" height="300"/>` : '')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
async function feedFor(code, dir) {
  const file = join(dir, `${code}.mjpeg`);
  if (existsSync(file)) return file;
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  await p.setContent(`<body style="margin:0">${ean13Svg(code)}</body>`);
  const jpeg = await p.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 640, height: 480 } });
  await b.close();
  writeFileSync(file, Buffer.concat(Array.from({ length: 30 }, () => jpeg)));
  return file;
}

/* ------------------------------------------------------------------ the app, packaged like the phone build */

function packageApp(dir) {
  const www = join(dir, 'www');
  cpSync(join(ROOT, 'app', 'public'), www, { recursive: true });
  for (const rel of ['js/eye.js', 'js/vendor/zxing_reader.wasm']) if (!existsSync(join(www, rel))) die(2, `${rel} missing from app/public: run npm ci in app/ (the phone would have no barcode reader either)`);
  writeFileSync(join(www, 'js', 'native-config.js'),
    `window.SHIN_API_BASE = ${JSON.stringify(API)};\n` +
    `window.SHIN_INVITE_CODE = ${JSON.stringify(process.env.SHIN_E2E_INVITE ?? '')};\n` +
    'window.SHIN_NATIVE_CAMERA_FALLBACK = false;\nwindow.SHIN_RC_KEYS = {};\n');
  const cap = join(ROOT, 'native', 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js');
  const withCap = existsSync(cap);
  if (withCap) cpSync(cap, join(www, 'js', 'capacitor.js'));
  // The same policy tag sync-web.mjs writes into the phone's copy (kept in step by hand; see that file).
  const self = "'self' capacitor://localhost https://localhost";
  const csp = [`default-src ${self}`, `script-src ${self} 'wasm-unsafe-eval'`, `style-src ${self} 'unsafe-inline'`, `img-src ${self} data: blob:`, `media-src ${self} blob:`, `font-src ${self}`, `connect-src ${self} ${API}`, `worker-src ${self} blob:`, "object-src 'none'", "base-uri 'self'"].join('; ');
  const index = join(www, 'index.html');
  let html = readFileSync(index, 'utf8');
  const marker = '<script type="module" src="/js/main.js"></script>';
  if (!html.includes(marker) || !html.includes('<meta charset="utf-8">')) die(2, 'app/public/index.html changed shape; update packageApp to match native/scripts/sync-web.mjs');
  html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  html = html.replace(marker, `<script src="/js/native-config.js"></script>\n${withCap ? '<script src="/js/capacitor.js"></script>\n' : ''}${marker}`);
  writeFileSync(index, html);
  return { www, withCap };
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json', '.txt': 'text/plain' };
async function serve(www, dir) {
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=localhost'], { encoding: 'utf8' });
  if (r.status !== 0) die(2, `openssl could not make a certificate: ${(r.stderr || r.error?.message || '').split('\n')[0]}`);
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', ORIGIN).pathname);
    let file = join(www, path === '/' ? 'index.html' : path);
    if (!file.startsWith(www) || !existsSync(file) || statSync(file).isDirectory()) file = join(www, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise((ok) => {
    server.once('error', (e) => die(2, `cannot serve ${ORIGIN}: ${e.code} (port ${PORT}; the phone's origin needs 443, or pass --port and accept a different origin)`));
    server.listen(PORT, '127.0.0.1', ok);
  });
  return server;
}

/* ------------------------------------------------------------------ one combination */

const results = [];
function record(row) {
  results.push(row);
  appendFileSync(PROGRESS, JSON.stringify(row) + '\n');
  const extra = row.status === 'PASS' ? row.note : [...row.fails, ...row.warns.map((w) => `warn: ${w}`)].slice(0, 4).join(' | ');
  say(`${row.status.padEnd(4)} ${row.combo} :: ${row.step} (${row.apiCalls} API calls${row.ms ? `, ${Math.round(row.ms / 1000)} s` : ''})${extra ? ` :: ${extra}` : ''}`);
}

async function runCombo(combo, feeds, storage = null) {
  const launch = { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${combo.feed}`, '--ignore-certificate-errors'] };
  if (EXE) launch.executablePath = EXE;
  const browser = await chromium.launch(launch);
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    locale: combo.locale,
    ignoreHTTPSErrors: true,
    permissions: combo.location ? ['camera', 'geolocation'] : ['camera'],
    ...(combo.location ? { geolocation: { latitude: 43.6532, longitude: -79.3832 } } : {}),
    ...(storage ? { storageState: storage } : {}),
  });
  // Name this phone a probe BEFORE any page script runs, so every scan, event and typed search it writes is
  // `probe-e2e-*` and the funnel report leaves it out (round 3: 12 random-id devices typed "zzqxwv" and counted
  // as shoppers). An id already stored by an earlier step (storageState) is replaced only if it is not a probe's.
  await ctx.addInitScript(([key, fresh]) => {
    try {
      if (!(localStorage.getItem(key) || '').startsWith('probe-')) localStorage.setItem(key, fresh);
    } catch { /* storage blocked: the app falls back to its own session id */ }
  }, ['shin.deviceId', `probe-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`]);
  if (combo.control) {
    // The negative control: one header the server does not allow, on every API call, as the Claude header was.
    await ctx.addInitScript((api) => {
      const real = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url ?? String(input);
        if (url.startsWith(api)) {
          const h = new Headers(init.headers ?? (typeof input === 'object' ? input.headers : undefined));
          h.set('x-shin-e2e-control', '1');
          init = { ...init, headers: h };
        }
        return real(input, init);
      };
    }, API);
  }
  const page = await ctx.newPage();
  let buf = { calls: 0, fails: [], warns: [] };
  page.on('request', (r) => { if (r.url().startsWith(API)) buf.calls += 1; });
  page.on('requestfailed', (r) => {
    if (!r.url().startsWith(API)) return;
    buf.fails.push(`${r.method()} ${new URL(r.url()).pathname} never completed (${r.failure()?.errorText ?? '?'})`);
  });
  page.on('response', (r) => {
    if (!r.url().startsWith(API) || r.request().method() === 'OPTIONS') return;
    const s = r.status();
    const what = `${r.request().method()} ${new URL(r.url()).pathname} answered ${s}`;
    if (s >= 500 || s === 401 || s === 403) buf.fails.push(what);
    else if (s >= 400) buf.warns.push(what);
  });
  page.on('console', (m) => {
    const t = m.text();
    if (/CORS|Access-Control|Content Security Policy|Refused to connect/i.test(t)) buf.fails.push(`console: ${t.slice(0, 200)}`);
    else if (m.type() === 'error') buf.warns.push(`console.error: ${t.slice(0, 140)}`);
  });
  /* What the browser hides from the page: the status and sender of an answer it blocked (a CORS failure carries
     no response object). Read from the DevTools protocol, so a blocked answer says whether the server, the
     tunnel or Cloudflare sent it. */
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const urls = new Map();
  const raw = new Map();
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, { url: e.request.url, method: e.request.method, bytes: e.request.postData?.length ?? 0 }));
  cdp.on('Network.responseReceivedExtraInfo', (e) => {
    const h = Object.fromEntries(Object.entries(e.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    raw.set(e.requestId, `${e.statusCode}${h.server ? ` from ${h.server}` : ''}${h['cf-ray'] ? ' (cf-ray)' : ''}${h['access-control-allow-origin'] ? '' : ', no allow-origin'}`);
  });
  cdp.on('Network.loadingFailed', (e) => {
    const u = urls.get(e.requestId);
    if (!u || !u.url.startsWith(API) || !(e.corsErrorStatus || e.blockedReason)) return;
    setTimeout(() => buf.fails.push(`blocked ${u.method} ${new URL(u.url).pathname} (${u.bytes} B body): ${e.corsErrorStatus?.corsError ?? e.blockedReason}; the answer was ${raw.get(e.requestId) ?? 'never seen'}`), 300);
  });
  page.on('pageerror', (e) => buf.fails.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('crash', () => buf.fails.push('page crashed'));

  const screen = () => page.evaluate(() => document.querySelector('#screen')?.dataset.screen ?? '?').catch(() => 'DEAD');
  const sheet = () => page.evaluate(() => {
    const s = [...document.querySelectorAll('.sheet')].filter((e) => e.offsetParent).pop();
    return s ? `${s.className.replace(/\s+/g, '.')}${s.dataset.tier ? `[${s.dataset.tier}]` : ''}` : 'none';
  }).catch(() => 'DEAD');
  const visibleText = () => page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
  async function step(name, fn) {
    buf = { calls: 0, fails: [], warns: [] };
    const t0 = Date.now();
    let note = '';
    try {
      note = (await fn()) ?? '';
    } catch (e) {
      buf.fails.push(`step error: ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`);
    }
    await page.waitForTimeout(400);
    const needs = await page.locator('[data-needs-connection]:visible').count().catch(() => 0);
    if (needs) buf.fails.push('"I need a connection" sheet shown');
    const fault = await page.locator('.sheet.refusal:visible').filter({ hasText: /server|went wrong|try again later/i }).count().catch(() => 0);
    if (fault) buf.warns.push('a refusal sheet mentioning the server is showing');
    const row = { combo: combo.name, step: name, status: buf.fails.length ? 'FAIL' : 'PASS', apiCalls: buf.calls, ms: Date.now() - t0, note, fails: [...new Set(buf.fails)], warns: [...new Set(buf.warns)].slice(0, 6), at: new Date().toISOString() };
    if (row.status === 'FAIL') {
      const shot = join(OUT, `${combo.name}--${name}`.replace(/[^a-z0-9-]+/gi, '_') + '.png');
      await page.screenshot({ path: shot }).catch(() => {});
      row.screenshot = shot;
    }
    record(row);
    return row;
  }
  const pressAct = async (act) => {
    const b = page.locator(`[data-act="${act}"]:visible`).first();
    if (!(await b.count())) return false;
    await b.click({ timeout: 3000 }).catch(() => {});
    return true;
  };
  async function settle(ms = 15000) {
    // Past the price pad by Skip (never a typed price on live data), then wait for the answer sheet.
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await page.locator('[data-needs-connection]:visible').count().catch(() => 0)) return;
      if (await pressAct('pad-skip')) { await page.waitForTimeout(800); continue; }
      const s = await sheet();
      if (s !== 'none' && !s.includes('padsheet')) return;
      await page.waitForTimeout(500);
    }
  }
  async function closeSheets() {
    for (let i = 0; i < 3; i += 1) {
      if ((await sheet()) === 'none') return;
      await page.evaluate(() => history.back()).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  try {
    await step(storage ? 'returning user opens the app' : 'fresh install: first screen', async () => {
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      if (await page.locator('[data-agree-tick]').count()) {
        await page.locator('[data-agree-tick]').check();
        await page.locator(`[data-agree-claude][value="${combo.claude ? 'yes' : 'no'}"]`).check();
      }
      for (let i = 0; i < 5; i += 1) {
        const c = page.locator('#screen button:visible', { hasText: /Continue|Get started|Start|Allow|OK|Next|Agree/ }).first();
        if (!(await c.count())) break;
        await c.click().catch(() => {});
        await page.waitForTimeout(700);
      }
      const s = await screen();
      if (s !== 'camera') throw new Error(`ended on screen "${s}", not the camera`);
      return `on ${s}`;
    });

    await step(`scan ${combo.feedCode === KNOWN.code ? 'a known' : 'an unknown'} barcode (${combo.feedCode})`, async () => {
      await page.waitForTimeout(3000); // the reader starts on the fake feed
      let tries = 0;
      while (tries < 4 && (await sheet()) === 'none') {
        await pressAct('scan-barcode');
        await page.waitForTimeout(3500);
        tries += 1;
      }
      await settle();
      const s = await sheet();
      if (s === 'none') throw new Error('no sheet after four presses: the barcode was never read or never answered');
      const text = await visibleText();
      const expect = combo.feedCode === KNOWN.code ? KNOWN.expect : null;
      if (expect && !expect.test(text)) buf.fails.push(`the answer does not name the product (${expect}); sheet ${s}`);
      return `ended on ${s}`;
    });
    await closeSheets();
    if (combo.control) return;

    for (const q of SEARCHES) {
      await step(`typed search "${q}"`, async () => {
        if (!(await pressAct('manual-search'))) throw new Error('no Manual Search button on the camera');
        await page.waitForTimeout(500);
        await page.fill('[data-textroute-input]', q);
        await page.locator('form.textroute-form button[type=submit]').click({ timeout: 3000 });
        await page.waitForTimeout(1500);
        await settle(12000);
        return `ended on ${await sheet()}`;
      });
      await closeSheets();
    }

    await step('every button on Scan, Saved and You', async () => {
      const seen = new Set();
      for (const tab of ['Saved', 'You', 'Scan']) {
        const here = await screen();
        const targets = await page.evaluate(() => [...document.querySelectorAll('#screen button, #screen [role=button], #screen [role=switch], #screen input[type=checkbox], #screen a[href]')]
          .filter((e) => e.offsetParent && !e.disabled)
          .map((e, i) => ({ i, act: e.dataset.act ?? '', label: (e.getAttribute('aria-label') || e.innerText || e.closest('label')?.innerText || '').trim().slice(0, 60) }))).catch(() => []);
        for (const t of targets.slice(0, 60)) {
          if (!args['allow-writes'] && (WRITE_ACTS.has(t.act) || NEVER_LABEL.test(t.label))) continue;
          const key = `${here}:${t.act || t.label}`;
          if (seen.has(key) || !t.label && !t.act) continue;
          seen.add(key);
          const el = page.locator('#screen button, #screen [role=button], #screen [role=switch], #screen input[type=checkbox], #screen a[href]').nth(t.i);
          if (!(await el.isVisible().catch(() => false))) continue;
          await el.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(600);
          if (await page.locator('[data-needs-connection]:visible').count().catch(() => 0)) buf.fails.push(`"I need a connection" after tapping ${key}`);
          await closeSheets();
          if ((await screen()) !== here) { await page.goBack().catch(() => {}); await page.waitForTimeout(600); }
          if ((await screen()) === 'DEAD') throw new Error(`the page died after tapping ${key}`);
        }
        const nav = page.getByRole('button', { name: tab, exact: true }).or(page.getByRole('link', { name: tab, exact: true })).first();
        if (await nav.count()) await nav.click().catch(() => {});
        await page.waitForTimeout(900);
      }
      return `${seen.size} controls tapped`;
    });
  } finally {
    const state = await ctx.storageState().catch(() => null);
    await browser.close().catch(() => {});
    return state;
  }
}

/* ------------------------------------------------------------------ the run */

const work = mkdtempSync(join(tmpdir(), 'e2e-phone-'));
const { www, withCap } = packageApp(work);
const server = await serve(www, work);
const feeds = { known: await feedFor(KNOWN.code, work), unknown: await feedFor(UNKNOWN.code, work) };
say(`START app from ${ROOT} (capacitor.js ${withCap ? 'included' : 'not found, web mode'}), served at ${ORIGIN}, API ${API}, chromium ${EXE ?? 'playwright default'}, out ${OUT}${args['allow-writes'] ? ', WRITES ALLOWED' : ''}`);

const health = await fetch(`${API}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
say(`live server: ${health.ok ? `up since ${health.startedAt}, catalogue ${health.catalogueUp ? 'up' : 'DOWN'}` : `NOT OK ${JSON.stringify(health).slice(0, 160)}`}`);

const combos = [];
const base = (name, o) => ({ name, claude: true, location: true, locale: 'en-CA', ...o });
combos.push(base('claude-yes.location-on.en', {}));
combos.push(base('claude-no.location-off.en', { claude: false, location: false }));
if (!args.quick) {
  combos.push(base('claude-yes.location-off.en', { location: false }));
  combos.push(base('claude-no.location-on.en', { claude: false }));
  combos.push(base('claude-yes.location-on.fr', { locale: 'fr-CA' }));
}

let exitCode = 0;
try {
  say('CONTROL a header the server does not allow, on every API call: this must be reported as FAIL');
  await runCombo({ ...base('CONTROL', {}), control: true, feed: feeds.known, feedCode: KNOWN.code }, feeds);
  const controlCaught = results.some((r) => r.combo === 'CONTROL' && r.status === 'FAIL' && r.fails.some((f) => /never completed|CORS|connection/i.test(f)));
  if (!controlCaught) die(3, 'the negative control was NOT caught, so a pass below would mean nothing; fix the detector first');
  say('CONTROL caught, as it must be; the real run starts');
  results.length = 0;
  writeFileSync(PROGRESS, '');

  for (const c of combos) {
    say(`COMBO ${c.name}: fresh install, known barcode`);
    const state = await runCombo({ ...c, feed: feeds.known, feedCode: KNOWN.code }, feeds);
    say(`COMBO ${c.name}: returning user, unknown barcode`);
    await runCombo({ ...c, name: `${c.name}.returning`, feed: feeds.unknown, feedCode: UNKNOWN.code }, feeds, state);
  }
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

const failed = results.filter((r) => r.status === 'FAIL');
const md = `# Phone end-to-end run against ${API}\n\n` +
  `**${failed.length ? `FAIL: ${failed.length} of ${results.length} steps` : `PASS: ${results.length} of ${results.length} steps`}**, ${new Date().toISOString()}, app from ${ROOT}\n\n` +
  `Negative control: caught (a disallowed header on every API call was reported as a failure).\n\n` +
  `| Combination | Step | Result | API calls | Detail |\n|---|---|---|---|---|\n` +
  results.map((r) => `| ${r.combo} | ${r.step} | ${r.status} | ${r.apiCalls} | ${(r.status === 'PASS' ? r.note : r.fails.join('; ')).replace(/\|/g, '/')}${r.warns.length ? ` (warnings: ${r.warns.join('; ').replace(/\|/g, '/')})` : ''} |`).join('\n') + '\n';
writeFileSync(join(OUT, 'summary.md'), md);
say(`DONE ${failed.length ? `FAIL ${failed.length} of ${results.length} steps` : `PASS ${results.length} of ${results.length} steps`}; summary ${join(OUT, 'summary.md')}`);
exitCode = failed.length ? 1 : 0;
process.exit(exitCode);
