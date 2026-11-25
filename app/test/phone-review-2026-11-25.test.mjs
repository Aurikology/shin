/**
 * Aurik's phone review of build 12, 2026-11-25:
 *   1. "the price verdict screen having a slight scroll"
 *   2. "when you press save it, the price verdict screen should auto disappear but it doesn't"
 *   3. "the settings page button is an x at the top left"
 * Source assertions where the code lives inside the camera's render closure; a behaviour test for
 * the pure fit rule. None of this is a phone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('../public/js/screens/camera.js');
const CSS = read('../public/css/screens/camera.css');

function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `no start marker for ${what}`);
  const b = text.indexOf(to, a + from.length);
  assert.ok(b > a, `no end marker for ${what}`);
  return text.slice(a, b);
}

test('3. the camera\'s top-left button is a Settings gear that opens Settings, not an X', () => {
  const top = between(CAMERA, '<div class="cam-top">', '<span class="wordmark">', 'the camera top row');
  assert.match(top, /data-act="you"/, 'the top-left button does not open Settings');
  assert.match(top, /t\('nav_you'\)/, 'its spoken name is not "Settings"');
  assert.ok(!/M6 6l12 12M18 6L6 18/.test(top), 'it is still drawn as an X');
});

test('2. a Save that adds the item closes the answer sheet; an un-save does not', () => {
  const watch = between(CAMERA, "if (act === 'watch' && last?.result?.kind === 'verdict') {", '/* D09 (2026-10-06)', 'the verdict Save');
  assert.match(watch, /if \(!wasSaved\) closeAfterSave\(\);/, 'the verdict Save leaves the sheet up');
  const rng = between(CAMERA, "if ((act === 'dist-save' && dist?.key) || (act === 'range-save' && cat?.snap?.id)) {", "if (act === 'correct-save')", 'the price and range Save');
  assert.match(rng, /if \(!wasSaved\) closeAfterSave\(\);/, 'the price verdict Save leaves the sheet up');
  const helper = between(CAMERA, 'function closeAfterSave() {', '\n    }\n', 'closeAfterSave');
  assert.match(helper, /dismissSheet\(sheet, reset\)/, 'the close does not run the sheet exit and return to the camera');
  const reset = between(CAMERA, '    function reset() {', 'slot.innerHTML = \'\';', 'reset');
  assert.match(reset, /clearTimeout\(saveCloseTimer\)/, 'reset leaves the save timer running');
  const teardown = between(CAMERA, "trackScanAbandonedIfMidScan('left_screen');", 'listeners.abort();', 'teardown');
  assert.match(teardown, /clearTimeout\(saveCloseTimer\)/, 'leaving the camera leaves the save timer running');
});

test('1. a sheet whose overflow is only its own bottom padding does not scroll', async () => {
  const { sheetFits } = await import('../public/js/lib/sheet-fit.js');
  assert.equal(sheetFits({ scrollHeight: 316, clientHeight: 315, paddingBottom: 22 }), true, '1 px of rounding scrolled');
  assert.equal(sheetFits({ scrollHeight: 349, clientHeight: 315, paddingBottom: 56 }), true, 'the safe-area padding scrolled');
  assert.equal(sheetFits({ scrollHeight: 500, clientHeight: 315, paddingBottom: 56 }), false, 'real content was cut off');
  assert.match(CSS, /\.sheet\.sheet-fits\s*\{[^}]*overflow-y:\s*hidden/, 'no rule stops a fitting sheet from scrolling');
  assert.match(between(CAMERA, 'function syncGrabber(sheet) {', '\n    }\n', 'syncGrabber'), /fitSheet\(sheet\)/, 'the fit is not checked when a sheet is drawn or moves detent');
});

/* Aurik, 2026-11-25: "pexi takes a long time to respond make it faster when the use inputs the prices".
   Measured in WebKit: after the price, the name search (~365 ms) and the price lookup (~730 ms) ran
   one after the other. The search needs only the name, so it starts when the name is submitted and
   runs while the price is typed. */
test('4. the typed name is searched while the price is typed, and the answer is reused', () => {
  const ask = between(CAMERA, '    function askPriceFirst(pending) {', '\n    }\n', 'askPriceFirst');
  assert.match(ask, /typedAhead = pending\.kind === 'text'\s*\? \{ text: pending\.text, promise: /, 'the search does not start with the price pad');
  const run = between(CAMERA, '    async function runTypedSearch(', "track('candidates_shown', { source: 'typed_pick'", 'runTypedSearch');
  assert.match(run, /typedAhead\?\.text === text \? typedAhead\.promise : null/, 'the early search is not reused');
  assert.match(run, /await \(ahead \?\? ctx\.api\.search\(\{ text, limit: 3 \}\)\)/);
  const reset = between(CAMERA, '    function reset() {', 'slot.innerHTML = \'\';', 'reset');
  assert.match(reset, /typedAhead = null;/, 'a search from a scan left behind carries into the next one');
});

/* Aurik, 2026-11-25: "for the progress section there should be how much they have saved compared to
   the typical shopper". It was there only after a Bought mark, as a % line under the chart. Now the
   first card names the typical shopper, and the comparison line sits under the cards and always
   shows. Never the word "saved" (RULINGS "No savings claim ships until it is measured"). */
test('5. Progress leads with the comparison against the typical shopper, and shows it from the start', async () => {
  const { t } = await import('../public/js/ui-strings.js');
  assert.equal(t('prog_under_h'), 'Less than the typical shopper');
  assert.match(t('prog_vs_none'), /typical shopper/);
  const PROG = read('../public/js/screens/progress.js');
  const vs = between(PROG, 'function vsLine(s) {', '\n}\n', 'vsLine');
  assert.match(vs, /prog_vs_none/, 'with no buys the comparison says nothing');
  const cardsEnd = PROG.indexOf("${vsLine(s)}");
  assert.ok(cardsEnd > PROG.indexOf('prog-card-under') && cardsEnd < PROG.indexOf('<section class="prog-panel">'), 'the comparison is not right under the cards');
  for (const k of ['prog_under_h', 'prog_vs_none', 'prog_vs_less', 'prog_under_sub']) {
    const en = String(typeof t(k) === 'function' ? '' : t(k, { pct: '5', n: '2' }));
    assert.ok(!/\bsav(e|ed|ing)\b/i.test(en), `${k} says "saved"`);
  }
});
