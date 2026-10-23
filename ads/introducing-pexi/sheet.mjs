// Captures the app's real verdict sheet (camera.distributionSheet, the app's own
// CSS and fonts, the working tree as it stands) as a transparent PNG, so the video
// shows the product rather than a drawing of it. The answer is staged: a staged
// item, staged prices and made-up store names (RULINGS "Marketing and
// positioning": never a real store as overcharging).
//   node sheet.mjs <outDir>          writes <outDir>/sheet-bad-shoes.png and sheet-great-headphones.png (1170 x 2532)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../../app');
const publicDir = join(appDir, 'public');
const imp = (p) => import(pathToFileURL(join(appDir, p)).href);
const { makeDocument, installBrowser, makeStorage } = await imp('test/mini-dom.mjs');
const restore = installBrowser({ doc: makeDocument(), storage: makeStorage() });
const camera = await imp('public/js/screens/camera.js');

// The response contract's own arithmetic (app/test/verdict-fixtures.mjs).
const Z90 = 1.2815515655446004;
function staged(centre, shelf, unit, dots) {
  const sigmaLog = 0.18;
  const pct = ((shelf - centre) / centre) * 100;
  const zone = pct <= -30 ? 'great' : pct <= -20 ? 'good' : pct >= 20 ? 'bad' : 'reasonable';
  return {
    kind: 'distribution', currency: 'CAD', centreCents: centre, sigmaLog,
    p10Cents: Math.round(Math.exp(Math.log(centre) - Z90 * sigmaLog)),
    p90Cents: Math.round(Math.exp(Math.log(centre) + Z90 * sigmaLog)),
    basis: 'own_prices', spreadFrom: 'leaf_category', confidence: 'high', n: dots.length,
    perUnit: null, scaledTo: null,
    dots: dots.map(([cents, store, city]) => ({ cents, store, city, seenOn: '2026-10-12', kind: 'regular', quantity: unit })),
    biggerPack: null, thresholds: { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false }, notes: [],
    shopper: { cents: shelf, zone, offByPct: Math.round(pct * 10) / 10, beyond: null, suspect: null },
  };
}
const SHEETS = {
  // a pair of running shoes at $180 that usually sells for about $120
  'bad-shoes': camera.distributionSheet(staged(12000, 18000, '1 pair',
    [[10999, 'Corner Sports', 'Toronto'], [11999, 'Northfield Outfitters', 'Ottawa'], [12999, 'Eastway Shoes', 'Montreal'], [11499, 'Harbour Athletic', 'Halifax']]),
    { name: 'Running Shoes, Size 10' }),
  // over-ear headphones at $119 that usually sell for about $179
  'great-headphones': camera.distributionSheet(staged(17900, 11900, '1 unit',
    [[16999, 'Corner Electronics', 'Toronto'], [17999, 'Northfield Audio', 'Ottawa'], [18999, 'Eastway Sound', 'Montreal'], [17499, 'Harbour Tech', 'Halifax']]),
    { name: 'Wireless Headphones' }),
};
restore();

// The stylesheets in index.html's order, @imports expanded by hand (see app/scripts/sheet-preview.mjs).
function inlineCss(file, seen = new Set()) {
  const p = join(publicDir, file.replace(/^\/+/, ''));
  if (seen.has(p)) return '';
  seen.add(p);
  return readFileSync(p, 'utf8').replace(/@import\s+url\(\s*['"]([^'"]+)['"]\s*\)\s*;/g, (_m, href) => inlineCss(href, seen));
}
const fonts = pathToFileURL(join(publicDir, 'fonts')).href;
const CSS = ['css/fonts.css', 'css/tokens.css', 'css/shell.css', 'css/face.css', 'css/screens.css']
  .map((f) => inlineCss(f)).join('\n').replaceAll("url('/fonts/", `url('${fonts}/`).replaceAll('url(/fonts/', `url(${fonts}/`);

const out = resolve(process.argv[2] || 'out');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' });
for (const [id, sheet] of Object.entries(SHEETS)) {
  const file = join(out, `sheet-${id}.html`);
  // transparent behind the sheet: the video draws the camera view there;
  // Pexi shown on his own, without the pale disc and ring the app draws round him, and
  // in his own navy outline (on a verdict colour the sheet sets currentColor to white)
  writeFileSync(file, `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}
html,body{margin:0;height:100%;background:transparent!important}.screen,.cam{background:transparent!important}
.face-disc,.face-ring{display:none}.sheet .face{color:#12233A}</style></head>
<body><div class="screen"><div class="cam" data-state="answered"><div class="sheet-slot">${sheet}</div></div></div></body></html>`);
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check("800 40px 'Bricolage Grotesque'") && !!document.querySelector('.sheet'));
  if (!ok) { console.error(`${id}: fonts or sheet missing`); process.exit(1); }
  await page.screenshot({ path: join(out, `sheet-${id}.png`), omitBackground: true });
}
await browser.close();
console.log('sheets:', Object.keys(SHEETS).join(', '));
