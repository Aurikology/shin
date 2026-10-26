// Renders the frames with headless Chromium and checks every word, price and
// face against the platforms' safe box (x 154..925, y 285..1635).
//   node render.mjs <outDir> [frames=all|a,b,c]
// Needs <outDir>/sheet-bad-shoes.png and sheet-great-headphones.png from sheet.mjs first. Writes
// <outDir>/frames/NNNN.png and <outDir>/safebox.json.
// Playwright is resolved from $PLAYWRIGHT if set (it is not a repo dependency).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../../app/public');
const out = path.resolve(process.argv[2] || 'out');
const frameArg = process.argv[3] || 'all';
const b64 = (p) => fs.readFileSync(p).toString('base64');
const svg = (rel) => fs.readFileSync(path.join(app, rel), 'utf8');
// The ad shows Pexi on its own: the pale disc and the outline ring the app draws round him are removed.
const bare = (rel) => svg(rel).replace(/<circle class="face-disc"[^>]*\/>/, '').replace(/<circle class="face-ring"[^>]*\/>/, '');

// The launch video's studio product shots (generated in Gemini, backgrounds cut out with rembg).
const meet = path.resolve(here, '../launch-meet-pexi');
const PRODUCTS = Object.fromEntries(['shoe', 'headphones', 'serum'].map(n => [n, b64(path.join(meet, 'products', n + '.png'))]));

const SHEETS = { sheetBad: 'sheet-bad-shoes.png', sheetGreat: 'sheet-great-headphones.png' };
for (const f of Object.values(SHEETS)) if (!fs.existsSync(path.join(out, f))) { console.error(`missing ${f}: run sheet.mjs first`); process.exit(1); }

const SVGS = {
  bluntDelighted: bare('faces/blunt/delighted.svg'),
  bluntAngry: bare('faces/blunt/angry.svg'),
  bluntWalk: bare('faces/blunt/walk.svg'),
  warmWalk: bare('faces/warm/walk.svg'),
  warmDelighted: bare('faces/warm/delighted.svg'),
  deadpanWalk: bare('faces/deadpan/walk.svg'),
  deadpanPleased: bare('faces/deadpan/pleased.svg'),
  bluntThinking: bare('faces/blunt/thinking.svg'),
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style></head>
<body><canvas id="c" width="1080" height="1920"></canvas>
<script>${fs.readFileSync(path.join(here, 'scene.js'), 'utf8')}</script>
<script>
window.boot = (async () => {
  const fonts = [
    new FontFace('Outfit', 'url(data:font/woff2;base64,${b64(path.join(here, '../introducing-pexi/fonts/outfit-var-latin.woff2'))})', { weight: '100 900' }),
    new FontFace('Inter Tight', 'url(data:font/woff2;base64,${b64(path.join(meet, 'fonts/inter-tight-var-latin.woff2'))})', { weight: '400 900' }),
    new FontFace('IBM Plex Mono', 'url(data:font/woff2;base64,${b64(path.join(app, 'fonts/ibm-plex-mono-600-latin.woff2'))})', { weight: '600' }),
  ];
  for (const f of fonts) { await f.load(); document.fonts.add(f); }
  const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
  const svgs = ${JSON.stringify(SVGS)};
  const imgs = {};
  for (const [k, s] of Object.entries(svgs)) imgs[k] = await load('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s))));
  const sheets = ${JSON.stringify(Object.fromEntries(Object.entries(SHEETS).map(([k, f]) => [k, b64(path.join(out, f))])))};
  for (const [k, s] of Object.entries(sheets)) imgs[k] = await load('data:image/png;base64,' + s);
  for (const n of ['shoe', 'headphones', 'serum']) imgs[n] = await load('data:image/png;base64,' + ${JSON.stringify(PRODUCTS)}[n]);
  LAUNCH.setImages(imgs);
  window.ctx = document.getElementById('c').getContext('2d');
  return document.fonts.check("800 100px 'Outfit'") && document.fonts.check("600 30px 'IBM Plex Mono'") && document.fonts.check("800 30px 'Inter Tight'");
})();
</script></body></html>`;

fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
const pagePath = path.join(out, 'page.html');
fs.writeFileSync(pagePath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('console', m => console.log('page:', m.text()));
page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
await page.goto(pathToFileURL(pagePath).href);
if (!(await page.evaluate(() => window.boot))) { console.error('fonts did not load'); process.exit(1); }

const total = await page.evaluate(() => LAUNCH.DUR * LAUNCH.FPS);
const frames = frameArg === 'all' ? [...Array(total).keys()] : frameArg.split(',').map(Number);
const SAFE = { x0: 154, y0: 285, x1: 925, y1: 1635 };
const violations = [];
let n = 0;
for (const f of frames) {
  const { png, log } = await page.evaluate((f) => {
    const log = [];
    LAUNCH.renderFrame(ctx, f, log);
    return { png: ctx.canvas.toDataURL('image/png').split(',')[1], log };
  }, f);
  fs.writeFileSync(path.join(out, 'frames', String(f).padStart(4, '0') + '.png'), Buffer.from(png, 'base64'));
  for (const b of log) {
    const tol = 0.5;
    if (b.x0 < SAFE.x0 - tol || b.y0 < SAFE.y0 - tol || b.x1 > SAFE.x1 + tol || b.y1 > SAFE.y1 + tol)
      violations.push({ frame: f, ...b, x0: Math.round(b.x0), y0: Math.round(b.y0), x1: Math.round(b.x1), y1: Math.round(b.y1) });
  }
  if (++n % 100 === 0) console.log(`${n}/${frames.length}`);
}
await browser.close();
fs.writeFileSync(path.join(out, 'safebox.json'), JSON.stringify(violations, null, 1));
console.log(`rendered ${frames.length} frames; safe-box violations: ${violations.length}`);
const byLabel = {};
for (const v of violations) (byLabel[v.label] ||= []).push(v.frame);
for (const [k, fr] of Object.entries(byLabel)) console.log(`  ${k}: frames ${fr[0]}..${fr[fr.length - 1]} (${fr.length})`);
