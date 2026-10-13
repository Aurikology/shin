// Renders the Reel's frames with headless Chromium and checks every word, price
// and mascot face against Instagram's safe box.
//   node render.mjs <outDir> [frames=all|a,b,c] [variants=A,B,C]
// Writes <outDir>/<variant>/NNNN.png (frames 30+ are shared, written to common/)
// and <outDir>/safebox.json.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/xujam/AppData/Roaming/npm/node_modules/playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../../app/public');
const out = path.resolve(process.argv[2] || 'frames');
const frameArg = process.argv[3] || 'all';
const variants = (process.argv[4] || 'A,B,C').split(',');
const b64 = (p) => fs.readFileSync(p).toString('base64');

const angry = fs.readFileSync(path.join(app, 'faces/blunt/angry.svg'), 'utf8');
const delighted = fs.readFileSync(path.join(app, 'faces/blunt/delighted.svg'), 'utf8');
// The second scan's face flushes red: the same angry art, body recoloured to the walk-away hues.
const boil = angry.replaceAll('#2BB5F0', '#FF6A45').replaceAll('#1E93C9', '#C23619').replaceAll('#DDF1FA', '#FFE1D6');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style></head>
<body><canvas id="c" width="1080" height="1920"></canvas>
<script>${fs.readFileSync(path.join(here, 'scene.js'), 'utf8')}</script>
<script>
window.boot = (async () => {
  const fonts = [
    new FontFace('Bricolage Grotesque', 'url(data:font/woff2;base64,${b64(path.join(app, 'fonts/bricolage-grotesque-var-latin.woff2'))})', { weight: '200 800', stretch: '75% 100%' }),
    new FontFace('Instrument Sans', 'url(data:font/woff2;base64,${b64(path.join(app, 'fonts/instrument-sans-var-latin.woff2'))})', { weight: '400 700' }),
  ];
  for (const f of fonts) { await f.load(); document.fonts.add(f); }
  const load = async (svg) => { const i = new Image(); i.src = 'data:image/svg+xml;base64,' + btoa(svg); await i.decode(); return i; };
  REEL.setImages({ angry: await load(${JSON.stringify(angry)}), delighted: await load(${JSON.stringify(delighted)}), boil: await load(${JSON.stringify(boil)}) });
  window.ctx = document.getElementById('c').getContext('2d');
  return document.fonts.check("800 100px 'Bricolage Grotesque'") && document.fonts.check("600 40px 'Instrument Sans'");
})();
</script></body></html>`;

const pagePath = path.join(out, 'page.html');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(pagePath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('console', m => console.log('page:', m.text()));
page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
await page.goto('file:///' + pagePath.replaceAll('\\', '/'));
const ok = await page.evaluate(() => window.boot);
if (!ok) { console.error('fonts did not load'); process.exit(1); }
if (process.env.REEL_SHIFT) await page.evaluate((d) => REEL.setShift(d), Number(process.env.REEL_SHIFT));

const all = [...Array(450).keys()];
const frames = frameArg === 'all' ? all : frameArg.split(',').map(Number);
const violations = [];
const SAFE = { x0: 154, y0: 285, x1: 925, y1: 1635 };
const jobs = [];
for (const f of frames) {
  if (f < 30) for (const v of variants) jobs.push([f, v, path.join(out, v)]);
  else jobs.push([f, variants[0], path.join(out, 'common')]);
}
let n = 0;
for (const [f, v, dir] of jobs) {
  fs.mkdirSync(dir, { recursive: true });
  const { png, log } = await page.evaluate(([f, v]) => {
    const log = [];
    REEL.renderFrame(ctx, f, v, log);
    return { png: ctx.canvas.toDataURL('image/png').split(',')[1], log };
  }, [f, v]);
  fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.png'), Buffer.from(png, 'base64'));
  for (const b of log) {
    const tol = 0.5;
    if (b.x0 < SAFE.x0 - tol || b.y0 < SAFE.y0 - tol || b.x1 > SAFE.x1 + tol || b.y1 > SAFE.y1 + tol)
      violations.push({ frame: f, variant: f < 30 ? v : '*', ...b, x0: Math.round(b.x0), y0: Math.round(b.y0), x1: Math.round(b.x1), y1: Math.round(b.y1) });
  }
  if (++n % 50 === 0) console.log(`${n}/${jobs.length}`);
}
await browser.close();
fs.writeFileSync(path.join(out, 'safebox.json'), JSON.stringify(violations, null, 1));
console.log(`rendered ${jobs.length} images; safe-box violations: ${violations.length}`);
const byLabel = {};
for (const v of violations) (byLabel[v.label] ||= []).push(v.frame);
for (const [k, fr] of Object.entries(byLabel)) console.log(`  ${k}: frames ${fr[0]}..${fr[fr.length - 1]} (${fr.length})`);
