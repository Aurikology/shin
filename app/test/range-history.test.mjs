/**
 * D-240 and the client half of D-241 (Aurik's calls, 2026-11-01).
 *
 * D-240: a catalogue answer with a range and no verdict (the broad bell, an AI
 * range, an estimate) was never written to history (`showCatalogue`: "Not
 * written to history"), so Past scans stayed at 0, You said "Nothing scanned
 * this week", and the sheet had only Done. Now it is written as a `range`
 * snapshot, its row shows the name and the range under a label ("A broad
 * guess"), never a verdict word and never a typical price (the bell's midpoint
 * is not one: D-239), and the sheet gets Save it, Fix Results, Share and the
 * thumbs like every other answer.
 *
 * D-241 client half: a typed name that matches nothing now comes back from the
 * server with a fixed_prior range on the `no_own_price` answer. `showOwnData`
 * drew the refusal for it because it never read `id.range`. It now draws the
 * same range sheet, `reading`, no haptic, nothing placed, titled with the
 * shopper's own words, with Scan the barcode as its action, and writes it to
 * history.
 *
 * The camera's render closure is source-asserted, the convention for code
 * inside it (back-to-camera.test.mjs); the sheet and the snapshot are run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const cam = await import('../public/js/screens/camera.js');
const store = await import('../public/js/store.js');
const { setLocale } = await import('../public/js/lib/locale.js');

const SRC = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The fixed bell as the server sends it (D-239's Panasonic Batteries). */
const BROAD = { lowCents: 278, highCents: 3602, medianCents: null, n: 0, basis: 'fixed_prior', category: null, currency: 'CAD', unit: null };
const BARCODE_BROAD = {
  outcome: 'catalogue_hit',
  identity: { brand: 'Panasonic', name: 'Batteries', size: null, barcode: '0123456789012' },
  range: BROAD,
};
/** The typed no-match answer the server lane now sends (D-241), fixtured from the coordinator's shape. */
const TYPED_MISS = {
  ownData: true,
  found: false,
  reason: 'no_own_price',
  verdict: null,
  range: { lowCents: 278, highCents: 3602, medianCents: null, n: 0, basis: 'fixed_prior', category: null, currency: 'CAD', unit: null, confidence: 'low' },
  rangeSource: 'fixed_prior',
  noRangeReason: 'no_shin_prices',
  catalogueUp: true,
  lowConfidence: true,
};

const VERDICT_WORDS = /Great price|Good price|Reasonable|Bad price|Bon prix|Excellent prix|Prix raisonnable|Mauvais prix/;

/* ------------------------------------------------------------ the snapshot */

test('D-240: a range answer is kept as a range snapshot with no centre, no median and no zone', () => {
  const snap = cam.rangeAnswerSnapshot(BROAD, { key: '0123456789012', name: 'Panasonic Batteries', shelfCents: 499, scanId: 7, code: '0123456789012' });
  assert.equal(snap.kind, 'range');
  assert.equal(snap.id, '0123456789012');
  assert.equal(snap.label, 'Panasonic Batteries');
  assert.equal(snap.basis, 'fixed_prior');
  assert.equal(snap.lowCents, 278);
  assert.equal(snap.highCents, 3602);
  assert.equal(snap.askingCents, 499);
  assert.equal(snap.scanId, 7);
  for (const k of ['centreCents', 'medianCents', 'zone', 'p10Cents', 'p90Cents', 'usualCents']) {
    assert.equal(k in snap, false, `the snapshot carries ${k}, which a list could print as a typical price or a verdict`);
  }
  assert.equal(cam.rangeAnswerSnapshot({ lowCents: 0, highCents: 10, basis: 'fixed_prior' }), null, 'an undrawable range made a row');
});

/* --------------------------------------------------------------- the sheet */

test('D-240: the broad-guess sheet has Save it, Fix Results, Share, the thumbs and Done', () => {
  const html = cam.catalogueSheet(BARCODE_BROAD, { shelfCents: 499 });
  for (const act of ['range-save', 'correct', 'share', 'thumbs-up', 'thumbs-down', 'cancel-scan']) {
    assert.match(html, new RegExp(`data-act="${act}"`), `the range sheet has no ${act}`);
  }
  assert.match(html, /data-toast-slot/, 'the thumbs have nowhere to say Noted');
  assert.match(html, /class="sheet-half"/);
  assert.match(html, /class="sheet-full"/);
  assert.doesNotMatch(html, VERDICT_WORDS, 'the broad bell said a verdict word (D-239)');
  assert.match(html, /data-conf="reading"/);
});

test('D-240: Save it on the range sheet says Saved once the item is saved', () => {
  const html = cam.catalogueSheet(BARCODE_BROAD, { saved: true });
  assert.match(html, /data-act="range-save">Saved</);
});

test('D-240: a catalogue answer with no range keeps its single Done and no actions it cannot back', () => {
  const html = cam.catalogueSheet({ ...BARCODE_BROAD, range: null, noRangeReason: 'no_prices' });
  assert.doesNotMatch(html, /data-act="range-save"|data-act="share"/);
  assert.match(html, /data-act="cancel-scan"/);
});

test('D-240: showCatalogue writes a range answer to history, and the old "Not written to history" is gone', () => {
  assert.doesNotMatch(SRC, /Not written to history/);
  const body = SRC.slice(SRC.indexOf('function showCatalogue('), SRC.indexOf('THE VERDICT BELL ON SCREEN'));
  assert.match(body, /rangeAnswerSnapshot\(answer\.range/);
  assert.match(body, /store\.recordVerdict\(snap/);
  assert.match(body, /answered: true/);
});

test('D-240: Save keeps no usual price for a range, and Share opens the card for it', () => {
  const from = SRC.indexOf('// D-240, range-save');
  const save = SRC.slice(from, SRC.indexOf("haptic('saved')", from));
  assert.ok(save.length > 50, 'no range-save branch');
  assert.match(save, /store\.toggleWatch\(/);
  assert.match(save, /usualCents: null/, 'a saved broad guess carries its midpoint as a usual price');
  assert.match(save, /answer: snap/);
  assert.match(SRC, /if \(act === 'share' && cat\?\.snap\?\.id && last\?\.result\?\.kind === 'range'\) \{\n\s+ctx\.go\('share', \{ id: cat\.snap\.id \}\);/);
});

test('D-240: a range row in history counts for the week on the You screen', () => {
  store.reset();
  assert.equal(store.weeklyStats().scanned, 0);
  store.recordVerdict(cam.rangeAnswerSnapshot(BROAD, { name: 'Panasonic Batteries' }), { text: 'Panasonic Batteries', answered: true });
  assert.equal(store.weeklyStats().scanned, 1);
  assert.equal(store.get().history[0].result.kind, 'range');
});

/* ------------------------------------------------------------ D-241 typed */

test('D-241: a typed miss with a range reaches the range sheet, not the refusal', () => {
  const body = SRC.slice(SRC.indexOf('function showOwnData('), SRC.indexOf('function showCatalogue('));
  const branch = body.indexOf('usableRange(id?.range)');
  assert.ok(branch > -1, 'showOwnData never reads id.range');
  assert.ok(branch < body.indexOf('refusalSheet('), 'the range branch must come before the refusal');
  assert.match(body.slice(branch), /showCatalogue\(/);
  assert.match(body.slice(branch), /typed: id\.identity \|\| m \? null : text/);
});

test('D-241: the typed broad guess is titled with the shopper\'s words, drawn reading, with Scan the barcode as its action', () => {
  const words = 'kraft dinner original 225g';
  // What showOwnData hands showCatalogue for the fixture above.
  const answer = { outcome: 'named_outside_catalogue', identity: { name: words }, range: TYPED_MISS.range };
  const html = cam.catalogueSheet(answer, { shelfCents: 499, typed: words });
  assert.match(html, /No price for “kraft dinner original 225g” yet/);
  assert.match(html, /data-conf="reading"/);
  assert.match(html, /data-zone=""/, 'a price was placed against the broad bell');
  assert.doesNotMatch(html, VERDICT_WORDS);
  assert.match(html, /A broad guess/);
  assert.match(html, /\$2\.78 to \$36\.02/);
  const peek = html.slice(html.indexOf('sheet-peek'), html.indexOf('sheet-half'));
  assert.match(peek, /data-act="cancel-scan">Scan the barcode</, 'the typed miss lost its Scan the barcode action');
  assert.doesNotMatch(peek, /Type what it is|Refused/);
  assert.match(html, /data-act="range-save"/, 'the typed broad guess cannot be saved');
});

test('D-241: the typed broad guess speaks French too', () => {
  setLocale('fr');
  try {
    const words = 'kraft dinner';
    const html = cam.catalogueSheet({ outcome: 'named_outside_catalogue', identity: { name: words }, range: TYPED_MISS.range }, { typed: words });
    assert.match(html, /Scanner le code-barres/);
    assert.match(html, /Une estimation large/);
    assert.match(html, /kraft dinner/);
  } finally {
    setLocale('en');
  }
});

test('D-240: the short range labels exist in both languages, with no em dash', async () => {
  const { t } = await import('../public/js/ui-strings.js');
  for (const lang of ['en', 'fr']) {
    setLocale(lang);
    try {
      for (const k of ['range_word_broad', 'range_word_ai', 'range_word_estimate', 'range_word_own']) {
        const s = t(k);
        assert.ok(s && s !== k, `${lang}: ${k} has no copy`);
        assert.doesNotMatch(s, /—/);
      }
    } finally {
      setLocale('en');
    }
  }
});
