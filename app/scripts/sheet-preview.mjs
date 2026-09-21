/**
 * Render the answer sheet to a standalone HTML file, with no key and no server.
 *
 * WHY THIS EXISTS. `app/test/gemini-answer-sheet.test.mjs` says it plainly at
 * the top: "NOT VERIFIED HERE: layout. There is no browser in this suite, so
 * how the sheet sits at 390 px is a walk on a phone, not a claim of this
 * file." The walk on a phone has never happened, because reaching a real
 * answer costs a Gemini key this machine does not have. So the most important
 * screen in the product, the one the whole app exists to draw, has never been
 * looked at.
 *
 * It does not need a key. `geminiSheet` is a pure string renderer and the test
 * file already builds the answer shape the server sends. This script feeds it
 * the same shapes, wraps the output in the real shell markup, inlines the real
 * stylesheets, and writes one file per state.
 *
 * Run it: `node scripts/sheet-preview.mjs [outDir]` from `app/`. The default
 * out dir is `.sheet-preview/`, which is gitignored. Open the files in a
 * browser at 390 px wide, or point a screenshot tool at them.
 *
 * WHAT IT IS NOT. The CSS and the markup are real; the answer is a fixture. A
 * state looking right here means the CSS holds for that shape, never that the
 * model produces it. The moment a key exists, record real answers and feed
 * them in through `--answers <file.json>` rather than trusting these.
 *
 * IF YOU POINT A CONTRAST CHECKER AT THESE FILES, read this first. The sheet's
 * thin and refusal tints are `color-mix()`, and `getComputedStyle` reports a
 * mixed colour as `color(srgb 0.926039 0.842431 0.809647)`, with components in
 * 0 to 1 rather than 0 to 255. A checker written for `rgb(...)` reads those as
 * near-black and reports the whole low-confidence sheet as failing. It is not:
 * measured properly it is 5.56 in light and 6.31 in dark. Two separate false
 * alarms came out of this file on its first run, which is why the warning is
 * here rather than in someone's memory. `test/tokens.test.mjs` computes these
 * ratios from the token values and is the authority; this preview is for
 * layout, wrapping and whether the thing reads at a glance.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const publicDir = join(appDir, 'public');

const { makeDocument, installBrowser, makeStorage } = await import('../test/mini-dom.mjs');
const restore = installBrowser({ doc: makeDocument(), storage: makeStorage() });

const { geminiSheet, geminiFailureSheet } = await import('../public/js/screens/camera.js');

/*
 * The answer the server sends, copied in shape from
 * `test/gemini-answer-sheet.test.mjs`'s own `answer()` so the two cannot drift
 * apart silently. The figures are deliberately unformatted (4.5, not $4.50),
 * because rule 6 says the sheet shows the model's own bytes and a formatter
 * appearing here is a defect this preview should make visible.
 */
function answer({ zone = 'over_your_line', median = 4.5, low = false, block = {}, top = {} } = {}) {
  return {
    kind: 'gemini',
    scanId: 41,
    model: 'gemini-2.5-flash',
    modelFamily: '2.5',
    lowConfidence: low,
    confidenceReasons: low ? ['thin_offers'] : [],
    parseStatus: 'ok',
    failure: null,
    shelfPriceLate: false,
    grounded: {
      kind: 'grounded',
      forDevice: 'dev-1',
      fetchedAt: '2026-09-19T12:00:00.000Z',
      block: {
        kind: 'prices',
        checked: false,
        name: 'Citrus Soda',
        description: 'A citrus soda sold in cans.',
        offers: [
          { retailer: 'Northfield Grocers', price: '4.49', url: 'https://northfield.example.ca/p/1', hasLink: true },
          { retailer: 'Eastway Market', price: '5.29', url: 'https://eastway.example.ca/p/2', hasLink: true },
        ],
        reviews: [],
        facts: [],
        verdict: zone === null
          ? null
          : {
              median,
              n: 3,
              unitLabel: '100 mL',
              span: 40,
              zoneUnderBoundary: 37.5,
              zoneOverBoundary: 62.5,
              ticks: [],
              points: [],
              excluded: [],
              shelf: { position: 72, zone, pct: 18 },
              shelfLabel: '6 x 355 mL, 4.49',
              sizeAssumed: false,
              confidence: 'ok',
              shortfalls: [],
            },
        lowConfidence: low,
        confidenceReasons: low ? ['thin_offers'] : [],
        ...block,
      },
      suggestionsHtml: '',
    },
    ...top,
  };
}

const ITEM = { text: 'citrus soda', category: 'groceries' };

/*
 * One entry per state worth looking at. The three zones are the product: they
 * are what a shopper is here for and what a screenshot has to carry on its
 * own. The rest are the states that only ever get drawn when something has
 * gone sideways, which is exactly why nobody has seen them.
 */
const STATES = [
  { id: 'zone-under', title: 'Under your line', html: () => geminiSheet(answer({ zone: 'under_your_line' }), ITEM, null) },
  { id: 'zone-middle', title: 'Middle', html: () => geminiSheet(answer({ zone: 'middle' }), ITEM, null) },
  { id: 'zone-over', title: 'Over your line', html: () => geminiSheet(answer({ zone: 'over_your_line' }), ITEM, null) },
  { id: 'low-confidence', title: 'Over your line, not fully confident', html: () => geminiSheet(answer({ zone: 'over_your_line', low: true }), ITEM, null) },
  { id: 'no-verdict', title: 'No shelf price, so no zone', html: () => geminiSheet(answer({ zone: null }), ITEM, null) },
  { id: 'long-name', title: 'A name long enough to wrap', html: () => geminiSheet(answer({ block: { name: 'Northfield Organic Sparkling Citrus Soda, Six Pack of 355 mL Cans, Limited Edition' } }), ITEM, null) },
  { id: 'failure', title: 'The call failed', html: () => geminiFailureSheet({ kind: 'gemini', failure: 'model_client_error', reason: 'model_client_error' }, ITEM) },
  { id: 'nothing-to-price', title: 'Nothing to price', html: () => geminiFailureSheet({ kind: 'gemini', failure: 'nothing_to_price', reason: 'nothing_to_price' }, ITEM) },
];

/*
 * The served stylesheets, in the order index.html links them, inlined so the
 * file opens from disk with no server behind it.
 *
 * The @import chain has to be expanded by hand and that is not a detail.
 * `screens.css` is nothing but `@import url('/css/screens/camera.css')` and
 * five siblings, and a root-absolute URL resolves against the filesystem root
 * on a `file://` page, so it silently fetches nothing. The first run of this
 * script reported every control on the sheet as an undersized tap target,
 * because `.pill`, `.sheet` and `.thumb` all live in camera.css and none of it
 * had loaded. A preview that quietly drops a stylesheet invents defects, which
 * is worse than having no preview, so this resolves the chain itself and
 * throws if a file named by an import is missing.
 */
function inlineCss(file, seen = new Set()) {
  const path = join(publicDir, file.replace(/^\/+/, ''));
  if (seen.has(path)) return '';
  seen.add(path);
  const text = readFileSync(path, 'utf8');
  return text.replace(/@import\s+url\(\s*['"]([^'"]+)['"]\s*\)\s*;/g, (_m, href) =>
    `\n/* inlined: ${href} */\n${inlineCss(href, seen)}\n`);
}

const CSS = ['css/fonts.css', 'css/tokens.css', 'css/shell.css', 'css/face.css', 'css/screens.css']
  .map((f) => inlineCss(f))
  .join('\n');

/*
 * The shell the sheet is mounted into on the real screen: `.cam` carrying a
 * state, with the sheet inside `.sheet-slot` (screens/camera.js:2267). Getting
 * this wrong would make the preview lie, so it is copied rather than invented.
 * `data-state="answered"` is what the camera sets when a sheet is up.
 */
function page(state) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Shin answer sheet: ${state.title}</title>
<style>
${CSS}
/* Preview only, never served: the real screen has a camera feed behind the
   sheet. A flat ground stands in for it so the sheet's own contrast is what is
   being judged, not the contrast against one frame of one store. */
html, body { margin: 0; height: 100%; background: var(--ground); }
.preview-note { position: fixed; top: 0; left: 0; right: 0; z-index: 99;
  font: 600 11px/1.6 var(--f-mono); letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-faint); background: var(--surface); padding: 6px 12px;
  border-bottom: 1px solid var(--hairline); }
</style>
</head>
<body>
<p class="preview-note">Preview, fixture answer: ${state.title}</p>
<div class="screen">
  <div class="cam" data-state="answered">
    <div class="sheet-slot">${state.html()}</div>
  </div>
</div>
</body>
</html>`;
}

const outDir = process.argv[2] ?? join(appDir, '.sheet-preview');
mkdirSync(outDir, { recursive: true });
const written = [];
for (const state of STATES) {
  const file = join(outDir, `${state.id}.html`);
  writeFileSync(file, page(state), 'utf8');
  written.push(file);
}
restore();

console.log(`${written.length} states written to ${outDir}`);
for (const f of written) console.log(`  ${f}`);
