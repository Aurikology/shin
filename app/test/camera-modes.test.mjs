/**
 * W30, row 25, row 34 and W33 (docs/audit-google-doc-2026-09-19.md), 2026-09-19.
 *
 *   W30   three scans (barcode, photo, typed name), icon buttons since 2026-09-19
 *         with no mode tabs; the photo sends `hint: 'price_tag'`; the typed name
 *         is one Gemini text call.
 *   25    the user flips validation and switching on the price pad; it rides as
 *         `mode`.
 *   34    no `|| 'Canada'`, and the going rate cards format in the market's own
 *         currency, never converted.
 *   W33   a price history chart from this user's own past scans, only with at
 *         least two earlier prices.
 *
 * The request half runs the real api.js against a stubbed fetch and the real
 * lib modules. The flow inside camera.js's render closure is source-asserted (the
 * convention in this folder); that any of it looks right on a phone is NOT
 * verified here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

function between(text, from, to, what) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  return text.slice(a, b);
}

const { scanContextFrom } = await import('../public/js/lib/scan-body.js');
const { priorPrices, historyChartHtml, normaliseName } = await import('../public/js/lib/price-history.js');
const { money } = await import('../public/js/lib/money.js');

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, json: async () => ({ product: null }) };
};
const api = await import('../public/js/api.js');
const CAMERA = read('../public/js/screens/camera.js');
const SERVER = read('../server.ts');
const PROMPT = read('../../Shin_Gemini_Pricing_Engine/scan_prompt.md');
const STRINGS = read('../public/js/ui-strings.js');

/* ------------------------------------------------------------ mode and hint */

test('the scan context carries a valid mode and the price tag hint, and nothing else invented', () => {
  assert.equal(scanContextFrom({ intent: { mode: 'switching' } }).mode, 'switching');
  assert.equal(scanContextFrom({ intent: { mode: 'validation' } }).mode, 'validation');
  assert.equal(scanContextFrom({ intent: { hint: 'price_tag' } }).hint, 'price_tag');
  for (const bad of ['other', '', null, 5]) assert.equal('mode' in scanContextFrom({ intent: { mode: bad } }), false, String(bad));
  assert.equal('hint' in scanContextFrom({ intent: { hint: 'barcode' } }), false, 'an unknown hint was sent');
  assert.equal('mode' in scanContextFrom({}), false, 'a mode was sent when nobody chose one');
});

test('mode and hint ride on the identify, photo and price calls, and clearing the intent removes them', async () => {
  api.setScanIntent({ mode: 'switching', hint: 'price_tag' });
  calls.length = 0;
  await api.identify({ text: 'oat milk' });
  const u = new URL(calls[0].url, 'http://x');
  assert.equal(u.searchParams.get('mode'), 'switching');
  assert.equal(u.searchParams.get('hint'), 'price_tag');
  calls.length = 0;
  await api.identifyPhoto(new Blob([new Uint8Array([0xff, 0xd8, 1, 2])], { type: 'image/jpeg' }), {});
  const photo = JSON.parse(calls[0].init.body);
  assert.equal(photo.mode, 'switching');
  assert.equal(photo.hint, 'price_tag');
  calls.length = 0;
  await api.price({ text: 'x' });
  assert.equal(JSON.parse(calls[0].init.body).mode, 'switching');
  api.setScanIntent({});
  calls.length = 0;
  await api.identify({ text: 'oat milk' });
  const cleared = new URL(calls[0].url, 'http://x');
  assert.equal(cleared.searchParams.has('mode'), false, 'a finished scan still sends its mode');
  assert.equal(cleared.searchParams.has('hint'), false, 'a finished scan still sends its hint');
});

test('the server reads the hint and turns it into a sentence for the prompt, and the prompt has the line', () => {
  assert.match(SERVER, /hint: text\(get\('hint'\)\)/, 'the server does not read a hint from the scan context');
  assert.match(SERVER, /price_tag: 'The image is a photo of a shelf price tag/, 'the price tag hint has no sentence');
  assert.ok(SERVER.includes("a.kind === 'photo' && a.context.hint ? (PICTURE_HINTS[a.context.hint] ?? null) : null"), 'the hint no longer reaches userInput');
  assert.match(SERVER, /mode: text\(get\('mode'\)\)/, 'the server no longer reads an explicit mode');
  assert.ok(PROMPT.includes('shelf price tag, read the product'), 'scan_prompt.md lost its price tag line');
});

/* ------------------------------------------------- the three scan buttons */

// 2026-09-19: W30's three modes are no longer tabs to pick first. They are three
// icon buttons that are always there (barcode, camera, keyboard); the scan
// paths under them are unchanged. Icon wiring is in camera-icons.test.mjs.

test('the keyboard button opens the name field', () => {
  const bar = between(CAMERA, '<div class="cam-bar">', '</div>\n      </div>', 'the bar').replace(/\s+/g, ' ');
  assert.ok(bar.includes('data-act="manual-search"') && bar.includes("t('cam_mode_manual')"), 'the keyboard button is gone or has lost its label');
  const fn = between(CAMERA, '    function openManualSearch() {', '    /**\n     * Whether the eye is decoding', 'openManualSearch');
  assert.ok(fn.includes('textRouteSheet()') && fn.includes("setState('texting')"), 'manual search no longer opens the name field');
  assert.ok(fn.includes('manualSearch = true;'), 'opening the name field does not say it is a manual search, so the price is not asked first');
  assert.match(CAMERA, /if \(act === 'manual-search'\) \{ openManualSearch\(\); return; \}/, 'the keyboard button does not open it');
});

test('manual search asks the price first, then sends the typed name as one text scan with it', () => {
  assert.ok(CAMERA.includes("if (manualSearch) { manualSearch = false; askPriceFirst({ kind: 'text', text }); return; }"), 'a manual submit skips the price pad');
  assert.ok(CAMERA.includes("else if (pending.kind === 'text') void runTypedSearch(pending.text, scanShelfCents, true);"), 'the pad does not send a text scan');
  const run = between(CAMERA, '    async function runTypedSearch(text, cents, asked) {', '    /* The sheet moves between three detents', 'runTypedSearch');
  assert.ok(run.includes('ctx.api.identify({ text, shelfPriceCents: cents ?? undefined })'), 'the typed name is not sent as a text identify carrying the price');
  // 2026-09-23: no typed name is matched against the demo shelf any more; a hit there went to /api/price and a paid call.
  assert.ok(!run.includes('matchCatalogue('), 'a typed name is matched against the demo shelf, whose hit is priced by a paid call');
  assert.ok(run.includes('if (asked) proceed(typed, cents ?? undefined);'), 'the pad is asked a second time');
  // The type-it route out of a refusal is the same field but NOT a manual search:
  // it identifies first and asks the price after, as before.
  const typeit = between(CAMERA, "      if (act === 'typeit') {", 'textRouteSheet();', 'typeit');
  assert.ok(typeit.includes('manualSearch = false;'), 'the type-it route inherits a manual search and asks the price first');
});

test('the photo scan sends the price tag hint, and only a photo does', () => {
  const fn = between(CAMERA, '    function submitScanPrice(cents) {', '    /** The barcode\'s identification', 'submitScanPrice');
  assert.ok(fn.includes("...(pending.kind === 'photo' ? { hint: 'price_tag' } : {}),"), 'the price tag hint is gone or sent for other scans');
  assert.ok(fn.includes('ctx.api.setScanIntent?.('), 'the intent is never handed to the api');
  assert.ok(CAMERA.includes("askPriceFirst({ kind: 'photo', crop });"), 'the photo path no longer asks the price first');
});

test('the icon names and the manual search label are in both languages', () => {
  const frAt = STRINGS.indexOf("cam_shutter: 'Prendre une photo'");
  assert.notEqual(frAt, -1);
  const en = STRINGS.slice(0, frAt);
  const fr = STRINGS.slice(frAt);
  for (const key of ['cam_mode_manual', 'cam_alt_group', 'cam_alt_validation', 'cam_alt_switching', 'cam_hist_heading', 'cam_hist_alt']) {
    assert.ok(en.includes(`${key}:`), `${key} missing in English`);
    assert.ok(fr.includes(`${key}:`), `${key} missing in French`);
  }
  assert.match(en, /cam_mode_manual: 'Manual Search'/);
  assert.match(en, /cam_shutter: 'Take a photo'/);
});

/* ---------------------------------------------------------- row 25: the choice */

test('the pad carries a two-way choice that defaults as before and that the user can flip', () => {
  assert.ok(CAMERA.includes('return padAlt ?? (typeof cents === \'number\' && cents > 0 ? \'validation\' : \'switching\');'), 'the default no longer follows the typed price');
  assert.match(CAMERA, /const altBtn = e\.target\.closest\('\[data-alt-mode\]'\);\n\s+if \(altBtn\) \{\n\s+padAlt = /, 'flipping the choice does nothing');
  const fn = between(CAMERA, '    function submitScanPrice(cents) {', '    /** The barcode\'s identification', 'submitScanPrice');
  assert.match(fn, /setScanIntent\?\.\(\{\n\s+mode: altMode,/, 'the choice is not sent as `mode`');
  assert.ok(fn.includes('effectiveAlt(scanShelfCents)'), 'the sent mode ignores the choice');
  assert.match(CAMERA, /padItem\?\.pendingScan \? effectiveAlt\(/, 'the choice shows on a pad that has no scan to send it with');
});

/* ------------------------------------------------------------ row 34: currency */

test('no Canada default and no CAD-only formatting on the going rate cards', () => {
  assert.ok(!CAMERA.includes("|| 'Canada'"), "camera.js still defaults the market to 'Canada'");
  const range = between(CAMERA, 'function goingRateRange(v) {', '/**\n * AVATAR.md section 2', 'goingRateRange');
  const card = between(CAMERA, 'function goingRateCard(refusal, item) {', 'The price was written down and Shin cannot call it', 'goingRateCard');
  const prov = between(CAMERA, 'function provenance(points, askingCents) {', '\n}\n', 'provenance');
  for (const [name, body] of [['goingRateRange', range], ['goingRateCard', card], ['provenance', prov]]) {
    assert.ok(!/\bcad\(/.test(body), `${name} still formats with cad()`);
    assert.ok(/\bmoney\(/.test(body), `${name} does not format with the market's currency`);
  }
});

test('money is the market currency, never converted, and the plain number when the currency is unknown', () => {
  assert.equal(money(499, 'EUR', 'en-CA').includes('4.99'), true);
  assert.ok(/€/.test(money(499, 'EUR', 'en-CA')), 'a euro price is not shown in euros');
  assert.ok(/£/.test(money(1250, 'GBP', 'en-GB')));
  assert.equal(money(499, '', 'en'), '4.99', 'no market must show the plain number');
  assert.equal(money(499, 'ZZ', 'en'), '4.99', 'a malformed code must show the plain number');
  assert.equal(money(NaN, 'EUR', 'en'), '--');
  // Same cents, different currency: only the symbol moves, the amount never does.
  assert.ok(money(1000, 'JPY', 'en').includes('10') && !money(1000, 'JPY', 'en').includes('1,000'));
});

/* --------------------------------------------------------- W33: price history */

const hist = (text, cents, day, extra = {}) => ({ id: text + day, at: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`, result: {}, query: { text, askingCents: cents, ...extra } });

test('history is only this user\'s own typed prices for the same item, oldest first', () => {
  const h = [
    hist('Oat  Milk, 1L', 449, 18),
    hist('Something else', 100, 17),
    hist('oat milk 1l', 399, 10),
    hist('Oat Milk 1L', undefined, 12),
    hist('Oat Milk 1L', 0, 13),
    hist('Lait', 379, 2, { gtin: '0123456789012' }),
  ];
  const pts = priorPrices(h, { gtin: '0123456789012', names: ['Oat Milk 1L'] });
  assert.deepEqual(pts.map((p) => p.cents), [379, 399, 449], 'wrong entries or order');
  assert.equal(normaliseName('Oat  Milk, 1L'), normaliseName('oat milk 1l'));
});

test('the chart is absent with fewer than two earlier prices and drawn with two or more', () => {
  const fmt = (c) => `$${(c / 100).toFixed(2)}`;
  assert.equal(historyChartHtml([], { format: fmt }), '');
  assert.equal(historyChartHtml([{ at: 1, cents: 399 }], { format: fmt }), '');
  const html = historyChartHtml([{ at: 1, cents: 399 }, { at: 2, cents: 449 }, { at: 3, cents: 429 }], { format: fmt, heading: 'H', alt: 'A' });
  assert.match(html, /data-price-history/);
  assert.equal((html.match(/data-hist-point/g) ?? []).length, 3, 'one dot per earlier price');
  assert.match(html, /\$3\.99/);
  assert.match(html, /\$4\.49/);
});

test('the answer sheet shows the chart only when history is passed in, with two or more prices', async () => {
  const { geminiSheet } = await import('../public/js/screens/camera.js');
  const result = { kind: 'gemini', grounded: { kind: 'grounded', block: { name: 'Oat Milk', facts: ['x'], verdict: null } } };
  const item = { text: 'Oat Milk' };
  assert.doesNotMatch(geminiSheet(result, item, null), /data-price-history/, 'a chart with no history');
  assert.doesNotMatch(geminiSheet(result, item, null, [{ at: 1, cents: 399 }]), /data-price-history/, 'a chart from one price');
  assert.match(geminiSheet(result, item, null, [{ at: 1, cents: 399 }, { at: 2, cents: 449 }]), /data-price-history/, 'no chart from two prices');
  // And the camera reads history from the store BEFORE recording this scan, so a scan is not its own history.
  const proceed = between(CAMERA, 'const earlier = priorPrices(store.get().history', 'store.recordVerdict(result', 'proceed');
  assert.ok(proceed.length > 0);
});
