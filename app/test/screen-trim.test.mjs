/**
 * THE FIRST LINES OF A SCREEN CARRY NO REPEAT, HEDGE, INTERNAL WORDING OR
 * UNBUILT PROMISE (RULINGS.md "V1 verdict screen mechanics", 2026-10-10, and
 * docs/decisions.md "Four calls made on his delegation"), and ON THE VERDICT THE
 * MASCOT SHOWS ITS FACE ONLY, its mood still following the tier.
 *
 * One test per row of the 2026-10-10 top-of-screen audit that was applied. The
 * row numbers are the audit's. Each test was run against the code before this
 * change and failed there (the count is in the lane report).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const store = await import('../public/js/store.js');
const camera = await import('../public/js/screens/camera.js');
const watchlist = await import('../public/js/screens/watchlist.js');
const pastscans = await import('../public/js/screens/pastscans.js');
const savings = await import('../public/js/screens/savings.js');
const paywall = await import('../public/js/screens/paywall.js');
const share = await import('../public/js/screens/share.js');
const H = await import('../public/js/lib/history-answer.js');
const F = await import('./verdict-fixtures.mjs');
const { say } = await import('../public/js/voice.js');
const { shinFace } = await import('../public/js/shin.js');
const { t } = await import('../public/js/ui-strings.js');

function inLocale(id, fn) {
  storage.setItem('shin.locale', id);
  try {
    return fn();
  } finally {
    storage.removeItem('shin.locale');
  }
}
const unesc = (s) => s?.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const peekOf = (html) => html.slice(html.indexOf('<div class="sheet-peek">'), html.indexOf('<div class="sheet-half">'));
const halfOf = (html) => html.slice(html.indexOf('<div class="sheet-half">'), html.indexOf('<div class="sheet-full">'));
const faceStateOf = (html) => /<div class="shin-say" data-state="(\w+)"/.exec(html)?.[1];
const between = (html, marker) => unesc(new RegExp(`${marker}[^>]*>([^<]*)<`).exec(html)?.[1]);
const IDS = ['deadpan', 'warm', 'blunt'];
/**
 * Mascot units on a screen that carry no words: every `.shin-say` root without a
 * bubble line, plus any bare face block. A face that says nothing is allowed only
 * where its mood is the answer (the verdict); everywhere else it reads as broken.
 */
const loneFaces = (html) => {
  const roots = (html.match(/<div class="shin-say"/g) ?? []).length;
  const lines = (html.match(/class="bubble-text"/g) ?? []).length;
  return roots - lines + strayFaces(html);
};
/** Faces that are not on a heading's own row (`.head-row`, the face then the h1/h2). */
const strayFaces = (html) => (html.replace(/<div class="head-row">[\s\S]*?<\/h[12]><\/div>/g, '').match(/class="face /g) ?? []).length;
/** The state of the face on the heading's row, or undefined: the face and the heading in one flex row. */
const inlineFace = (html) => /<div class="head-row"><span class="head-face" data-state="(\w+)">\s*<svg[\s\S]*?<\/svg><\/span><h[12][^>]*>[^<]+<\/h[12]><\/div>/.exec(html)?.[1];
/** The rule for every screen that lost its bubble words but keeps the mascot. */
function assertInlineFace(html, where) {
  assert.ok(inlineFace(html), `${where}: no face beside the heading`);
  assert.doesNotMatch(html, /class="bubble/, `${where}: a bubble (or an empty bubble node) is drawn`);
  assert.equal(strayFaces(html), 0, `${where}: a face sits on a row of its own`);
}

function stubRoot() {
  return {
    innerHTML: '', dataset: {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, removeEventListener: () => {}, setAttribute: () => {}, closest: () => null, contains: () => false,
  };
}
function paint(screen, ctx = {}) {
  const root = stubRoot();
  const dummy = { hidden: false, textContent: '', innerHTML: '', getContext: () => null };
  root.querySelector = (sel) => (/shr-|data-pw-body/.test(sel) ? dummy : null);
  try {
    screen.render(root, { go() {}, replace() {}, params: {}, store, api: {}, build: 'test', ...ctx });
  } catch { /* wiring after the paint needs a DOM this stub lacks, not markup */ }
  return { html: root.innerHTML, body: dummy.innerHTML };
}

/* ======================================================== rows 1 and 2 == */

const ZONED = { great: F.GREAT, good: F.GOOD, reasonable: F.REASONABLE, bad: F.BAD };

test('rows 1 and 2: the verdict sheet shows the face and no bubble words, at every tier and confidence, in both languages', () => {
  for (const locale of ['en', 'fr']) {
    for (const [zone, raw] of Object.entries(ZONED)) {
      for (const confidence of ['high', 'medium', 'low']) {
        const html = inLocale(locale, () => camera.distributionSheet({ ...raw, confidence }, { name: 'Kraft Dinner' }));
        assert.ok(html.includes('data-dist-headline'), `${locale} ${zone} ${confidence}: no sheet drawn`);
        assert.doesNotMatch(html, /class="bubble/, `${locale} ${zone} ${confidence}: the mascot still speaks on the verdict`);
        assert.ok(faceStateOf(peekOf(html)), `${locale} ${zone} ${confidence}: the face is gone`);
        // No empty bubble node left beside the face, and the face is marked as standing alone.
        assert.doesNotMatch(html, /class="bubble[^"]*"[^>]*>\s*(<p[^>]*>\s*<\/p>\s*)?<\/div>/, `${locale} ${zone} ${confidence}: an empty bubble remains`);
        assert.match(peekOf(html), /<div class="shin-say" data-state="\w+" data-side="left" data-face-only/);
      }
    }
    // No price typed yet is the same sheet: face only there too.
    assert.doesNotMatch(inLocale(locale, () => camera.distributionSheet(F.NO_PRICE, { name: 'Kraft Dinner' })), /class="bubble/);
  }
});

test('rows 1 and 2 (the mood ruling holds): the face still follows the tier and the confidence gate', () => {
  for (const [zone, raw] of Object.entries(ZONED)) {
    for (const confidence of ['high', 'medium', 'low']) {
      const html = camera.distributionSheet({ ...raw, confidence }, {});
      assert.equal(faceStateOf(html), H.distFace(zone, confidence), `${zone} ${confidence}`);
    }
  }
  assert.equal(faceStateOf(camera.distributionSheet({ ...F.GREAT, confidence: 'high' }, {})), 'delighted', 'control: the happy face still shows');
  assert.equal(faceStateOf(camera.distributionSheet({ ...F.BAD, confidence: 'high' }, {})), 'walk', 'control: the mad face still shows');
});

test('rows 1 and 2: the lone verdict face holds no row open for words (the stylesheet sizes it to the face)', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../public/css/screens/camera.css', import.meta.url), 'utf8');
  assert.match(css, /\.sheet-head \.shin-say\[data-face-only\]\s*\{\s*flex:\s*0 0 auto;\s*\}/, 'the face-only unit still grows to fill the row');
});

/* ================================================================ row 3 == */

test('row 3: the "prices vary a lot" line has left the peek, and is not repeated lower down', () => {
  const wide = { ...F.LOW_CONFIDENCE, p10Cents: 300, p90Cents: 3000 };
  for (const locale of ['en', 'fr']) {
    const html = inLocale(locale, () => camera.distributionSheet(wide, {}));
    assert.doesNotMatch(html, /data-dist-spread|vary a lot|varient beaucoup/, locale);
  }
  // The chart still draws the spread: its band caption names both ends.
  assert.match(camera.distributionSheet(wide, {}), /\$3\.00/);
});

/* ================================================================ row 8 == */

test('row 8: the half detent has one basis line, no separate confidence sentence, and no chip repeating the basis', () => {
  const medium = halfOf(camera.distributionSheet(F.MEDIUM_SALE_BULK, {}));
  assert.equal((medium.match(/<p class="vd-basis/g) ?? []).length, 1, 'medium: more than one basis line');
  assert.doesNotMatch(medium, /Fairly sure, not certain/);
  const low = halfOf(camera.distributionSheet({ ...F.LOW_CONFIDENCE, basis: 'category_prior', n: 21 }, {}));
  assert.equal((low.match(/<p class="vd-basis/g) ?? []).length, 1, 'low: more than one basis line');
  // The AI basis is said once: no "Estimated by AI" chip under an AI basis line, and no garbled "from an AI estimate".
  const ai = halfOf(camera.distributionSheet(F.LOW_CONFIDENCE, {}));
  assert.equal((ai.match(/<p class="vd-basis/g) ?? []).length, 1);
  assert.doesNotMatch(ai, /data-vd-note="claude_estimate"/, 'the AI chip repeats the AI basis line');
  assert.doesNotMatch(ai, /from an AI estimate/);
  assert.match(ai, /data-vd-note="size_assumed"/, 'a chip that changes the answer must stay');
  const aiSure = halfOf(camera.distributionSheet({ ...F.LOW_CONFIDENCE, confidence: 'high' }, {}));
  // Build 6 (2026-10-13, docs/design/ux-evidence-2026-10-09.md section 13): R-56 plain words for the AI source.
  assert.equal(between(aiSure, 'data-vd-basis'), 'An AI estimate; no shop prices found');
  // A low answer's reason is the line itself, so "Few prices behind this" would say it twice.
  const few = halfOf(camera.distributionSheet({ ...F.LOW_CONFIDENCE, basis: 'own_prices', n: 2, notes: ['few_prices', 'old_prices'] }, {}));
  assert.doesNotMatch(few, /data-vd-note="few_prices"/);
  assert.match(few, /data-vd-note="old_prices"/);
});

/* ======================================================= rows 10 to 12 == */

const IDENTITY = { name: 'Crunchy Peanut Butter', brand: 'Kraft', size: '1 kg', barcode: '0068100084245', category: { tag: 'en:peanut-butters', name: 'Peanut butters' } };
const RANGE = (over = {}) => ({ lowCents: 800, highCents: 1200, medianCents: 1000, n: 4, basis: 'this_product', category: null, currency: 'CAD', unit: null, ...over });
const hit = (range, top = {}) => ({ kind: 'catalogue', outcome: 'catalogue_hit', offerManualEntry: false, catalogueUp: true, barcode: IDENTITY.barcode, identity: IDENTITY, range, rangeAskedAt: null, noRangeReason: null, shelfPrice: null, ms: 3, ...top });
const DEFAULT_LINES = {};

test('row 10: the catalogue answer opens with no "Here is what I found."', () => {
  for (const locale of ['en', 'fr']) {
    const html = inLocale(locale, () => camera.catalogueSheet(hit(RANGE()), { state: DEFAULT_LINES }));
    assert.doesNotMatch(html, /class="bubble/, locale);
    assert.doesNotMatch(html, /Here is what I found|Voici ce que j/, locale);
    // The mascot stays, small and beside the headline, with no words.
    assertInlineFace(html, locale);
    assert.equal(loneFaces(html), 0, `${locale}: a face with no line on a row of its own`);
  }
});

test('row 10 (mascot ruling): the range answer\'s face follows the zone, the way the bell\'s does', () => {
  const cases = [[650, 'great'], [800, 'good'], [1000, 'reasonable'], [1200, 'bad']];
  for (const [cents, zone] of cases) {
    const html = camera.catalogueSheet(hit(RANGE()), { shelfCents: cents, state: DEFAULT_LINES });
    assert.equal(inlineFace(html), H.distFace(zone, 'medium'), zone);
  }
  assert.equal(inlineFace(camera.catalogueSheet(hit(RANGE()), { shelfCents: 650, state: DEFAULT_LINES })), 'delighted', 'control: great is the happy face');
  assert.equal(inlineFace(camera.catalogueSheet(hit(RANGE()), { shelfCents: 1200, state: DEFAULT_LINES })), 'walk', 'control: bad is the mad face');
});

test('row 11: the range answer speaks the bell\'s verdict words against the shopper\'s own thresholds', () => {
  // Middle $10.00; defaults great 30% under, good 20% under, bad 20% over (his 2026-09-17 numbers).
  const cases = [[650, 'great', 'Great price'], [800, 'good', 'Good price'], [1000, 'reasonable', 'Reasonable price'], [1200, 'bad', 'Bad price']];
  for (const [cents, zone, word] of cases) {
    const html = camera.catalogueSheet(hit(RANGE()), { shelfCents: cents, state: DEFAULT_LINES });
    assert.equal(between(html, 'data-cat-headline'), word, `${cents}`);
    assert.match(html, new RegExp(`data-zone="${zone}"`), `${cents}`);
    assert.doesNotMatch(html, /your line|in the middle/);
  }
  // The shopper's own lines move the word: 15% under is Good at good=10, Reasonable at the default 20.
  assert.equal(between(camera.catalogueSheet(hit(RANGE()), { shelfCents: 850, state: { lineUnit: 'percent', lineGreatPct: 30, lineUnderPct: 10, lineOverPct: 20 } }), 'data-cat-headline'), 'Good price');
  assert.equal(between(camera.catalogueSheet(hit(RANGE()), { shelfCents: 850, state: DEFAULT_LINES }), 'data-cat-headline'), 'Reasonable price');
  // And in French, the bell's French words.
  assert.equal(between(inLocale('fr', () => camera.catalogueSheet(hit(RANGE()), { shelfCents: 800, state: DEFAULT_LINES })), 'data-cat-headline'), 'Bon prix');
});

test('row 12: an AI range says "Estimated by AI" and never the date it was asked', () => {
  const ai = hit(RANGE({ basis: 'gemini_typical', medianCents: null, n: null }), { rangeAskedAt: '2026-10-08T12:00:00Z' });
  const en = camera.catalogueSheet(ai, { state: DEFAULT_LINES });
  assert.equal(between(en, 'data-cat-basis'), 'Estimated by AI');
  assert.doesNotMatch(en, /asked|October|2026/);
  const fr = inLocale('fr', () => camera.catalogueSheet(ai, { state: DEFAULT_LINES }));
  assert.equal(between(fr, 'data-cat-basis'), 'Estimé par l’IA');
  assert.doesNotMatch(fr, /demandée|octobre/);
});

/* ======================================================= rows 13 and 14 == */

test('row 13: not found keeps its heading and drops the bubble that asked the same thing', () => {
  for (const unknownBarcode of [false, true]) {
    const html = camera.textRouteSheet('', { unknownBarcode });
    assert.doesNotMatch(html, /class="bubble/, `unknownBarcode ${unknownBarcode}`);
    assert.match(html, /<h2 class="vword"/);
    assertInlineFace(html, `unknownBarcode ${unknownBarcode}`);
    assert.equal(loneFaces(html), 0);
  }
  assert.match(camera.textRouteSheet('', { unknownBarcode: true }), /What is the product called\?/);
});

test('row 14: pick-one keeps its heading and drops the stale "Name it" bubble', () => {
  const html = camera.typedPickSheet([{ code: '1', label: 'Kraft Dinner 225 g', meta: '' }], 'Kraft Dinner');
  assert.doesNotMatch(html, /class="bubble|Name it/);
  assertInlineFace(html, 'pick-one');
  assert.equal(loneFaces(html), 0);
  assert.match(html, /Which one is &quot;Kraft Dinner&quot;\?|Which one is "Kraft Dinner"\?/);
});

/* ======================================================= rows 17 and 18 == */

test('rows 17 and 18: the server-fault and offline sheets are the bubble and Try again, with no long explanation', () => {
  for (const [name, html] of [['fault', camera.serverFaultSheet()], ['offline', camera.needsConnectionSheet()]]) {
    assert.match(html, /class="bubble-text"/, `${name}: the bubble is gone`);
    assert.match(html, /data-act="lookup-retry"/, `${name}: Try again is gone`);
    assert.doesNotMatch(html, /<p class="detail"/, `${name}: the long explanation is still there`);
    assert.doesNotMatch(html, /Your connection is fine|Scan again once connected/, name);
  }
});

/* ======================================================= rows 22 and 34 == */

test('row 22: the camera-off line says what to do, and never "drawn shelf"', () => {
  for (const locale of ['en', 'fr']) {
    for (const id of IDS) {
      const line = inLocale(locale, () => say('cam_camera_denied', {}, id));
      assert.doesNotMatch(line, /drawn|dessin/i, `${locale}/${id}: ${line}`);
      assert.match(line, locale === 'en' ? /Settings/ : /Réglages/, `${locale}/${id}: ${line}`);
    }
  }
  assert.equal(say('cam_camera_denied', {}, 'deadpan'), 'Camera is off. Turn it on in Settings, or type the name.');
});

test('row 34: the You screen says "No scan limit." and nothing about metering or builds', () => {
  assert.equal(t('you_no_meter'), 'No scan limit.');
  const fr = inLocale('fr', () => t('you_no_meter'));
  assert.doesNotMatch(fr, /version|compté/);
  assert.ok(fr.length < 40, fr);
});

/* ======================================================= rows 25 and 27 == */

const WIRE = {
  kind: 'distribution', currency: 'CAD', centreCents: 554, sigmaLog: 0.3, p10Cents: 100, p90Cents: 2000,
  confidence: 'low', basis: 'category_prior', n: 21,
  shopper: { cents: 549, zone: 'reasonable', offByPct: -0.9, beyond: null, suspect: null },
};
const LABEL = 'Kraft Dinner 12 x 340 g';

test('rows 25 and 27: Saved and Past scans with one row carry no bubble copying that row', () => {
  store.reset();
  const snap = H.answerSnapshot(WIRE, { key: '0068100902426', name: LABEL });
  store.recordVerdict(snap, { text: LABEL, askingCents: 549, answered: true });
  store.update({ watchlist: [{ id: '0068100902426', label: LABEL, lastCents: 549, usualCents: 554, savedAt: new Date().toISOString(), answer: snap }] });
  const saved = paint(watchlist.default).html;
  assert.ok(saved.includes(LABEL), 'the row is not on Saved');
  assert.doesNotMatch(saved, /class="bubble/, 'Saved still has the bubble that copies the row');
  const past = paint(pastscans.default).html;
  assert.ok(past.includes(LABEL), 'the row is not on Past scans');
  assert.doesNotMatch(past, /class="bubble/, 'Past scans still has the bubble that copies the row');
  // Controls: the checker sees a face on a row of its own, as the first pass of this change drew it
  // (a face-only unit between the heading and the rows), and a bare face under a heading.
  assert.ok(loneFaces(`<h1>Saved</h1><div class="wlist-head">${shinFace('fair', { size: 64 })}</div>`) > 0, 'control: loneFaces is blind');
  assert.equal(strayFaces(`<h1>Saved</h1><div>${shinFace('fair', { size: 64 })}</div>`), 1, 'control: strayFaces is blind');
  assert.equal(inlineFace(`<h1>Saved</h1><div>${shinFace('fair', { size: 64 })}</div>`), undefined, 'control: inlineFace takes a face that is not beside the heading');
  // The mascot stays, inline beside the heading with no words, and nothing between the heading and the rows.
  for (const [name, html] of [['Saved', saved], ['Past scans', past]]) {
    const top = html.slice(0, html.indexOf('data-open'));
    assertInlineFace(top, name);
    assert.equal(loneFaces(top), 0, `${name}: a face with no line is left above the rows`);
    assert.doesNotMatch(html, /wlist-head|plist-head|data-face-only/, `${name}: the header face row is still drawn`);
  }
  // Its mood is the newest row's face, as the row wears it.
  assert.equal(inlineFace(saved), H.answerLook(snap).face);
  assert.equal(inlineFace(past), H.answerLook(snap).face);
  store.reset();
});

/* =============================================================== row 29 == */

test('row 29: a saved or past answer reopens as verdict, percentage, item and date, with no hedge or range lines', () => {
  const answer = H.answerSnapshot(WIRE, { key: '0068100902426', name: LABEL });
  const at = new Date().toISOString();
  const modals = [
    ['saved', watchlist.detailModal({ id: '0068100902426', label: LABEL, lastCents: 549, usualCents: 554, savedAt: at, answer }, null)],
    ['past', pastscans.detail({ id: 'h1', at, result: answer, query: { text: LABEL, askingCents: 549, answered: true } })],
  ];
  for (const [name, html] of modals) {
    const text = unesc(html);
    assert.match(text, /Reasonable price/, `${name}: the verdict`);
    assert.match(text, /under the typical price|about the typical price/, `${name}: the percentage line`);
    assert.ok(text.includes(LABEL), `${name}: the item`);
    assert.doesNotMatch(text, /Not fully confident|vary a lot|Nothing here changes/, `${name}: a hedge or a repeated range line`);
    assert.doesNotMatch(html, /pmodal-conf|pmodal-note/, `${name}`);
  }
});

/* =============================================================== row 32 == */

test('row 32: the savings page shows the list or the empty line only', () => {
  const empty = savings.savingsHtml(savings.savingsView({ history: [] }, null));
  assert.doesNotMatch(empty, /Total Saved and Monthly Goal|data-savings="pending"/);
  assert.match(empty, /data-savings="empty"/);
  const one = savings.savingsHtml(savings.savingsView({ history: [{ id: 'a', at: new Date().toISOString(), query: { text: LABEL, askingCents: 249 }, result: {} }] }, null));
  assert.doesNotMatch(one, /data-savings="pending"/);
  assert.match(one, /data-savings-row/);
});

/* =============================================================== row 38 == */

test('row 38: the web paywall is the h1 and the one instruction, no kicker and no repeated sentence', () => {
  const { html, body } = paint(paywall.default, { win: {} });
  assert.match(html, /<h1>/);
  assert.doesNotMatch(html, /class="kicker"/, 'the kicker repeats the h1');
  assert.doesNotMatch(html, /class="bubble/, 'the bubble repeats the h1');
  assertInlineFace(html, 'paywall');
  assert.equal(loneFaces(html), 0, 'a face with no line is left under the heading');
  const web = body || paywall.paywallBody('web');
  assert.match(web, /Subscribe in the app/);
  assert.doesNotMatch(paywall.paywallBody('web'), /App Store and Google Play|class="fineprint"/, 'the instruction is said twice');
  // The spent state keeps its bubble: it is the one line that says when scans return.
  const spent = paint(paywall.default, { win: {}, params: { limit: '5', used: '5', resetsAt: '2026-10-12T05:00:00Z' } }).html;
  assert.match(spent, /class="bubble-text"/);
});

/* ======================================================= rows 40 and 41 == */

test('row 40: the share screen drops "No link in the frame" and its explanation', () => {
  store.reset();
  const snap = H.answerSnapshot(WIRE, { key: '0068100902426', name: LABEL });
  store.recordVerdict(snap, { text: LABEL, askingCents: 549, answered: true });
  const { html } = paint(share.default, { params: { id: '0068100902426' } });
  assert.match(html, /Post it/);
  assert.doesNotMatch(html, /No link in the frame|reads as spam|class="kicker"/);
  store.reset();
});

test('row 41: the share image does not print "NOT FULLY CONFIDENT"', () => {
  for (const confidence of ['low', 'medium']) {
    const snap = { ...H.answerSnapshot(WIRE, { key: 'k', name: LABEL }), confidence };
    const card = share.answerCard({ id: 'h', at: new Date().toISOString(), result: snap, query: { text: LABEL } });
    assert.doesNotMatch(card.confidence, /NOT FULLY CONFIDENT/i, confidence);
    assert.equal(card.confidence, '', confidence);
  }
  const sure = share.answerCard({ id: 'h', at: new Date().toISOString(), result: { ...H.answerSnapshot(WIRE, { key: 'k', name: LABEL }), confidence: 'high' }, query: {} });
  assert.equal(sure.confidence, t('share_conf_high').toUpperCase(), 'control: a confident card still says so');
});
