/**
 * History and sharing (walkthrough 2026-10-06, docs/walkthrough-e2e-2026-10-06.md):
 *
 *   D07  every answer, the verdict bell included, is written to Past scans, and
 *        a Saved item opens with the verdict on file
 *   D08  the bell sheet has Share at its half detent, the card is reachable, and
 *        carries no link
 *   D17  a server fault (5xx) says the fault is Shin's, with Retry; only a
 *        request that never arrived says connection
 *   D20  the Saved list face follows the zone word, never the price delta
 *   D37  the offline sheet has Retry
 *   D41  an unreadable store says so on Saved, Past scans and Recently removed,
 *        and never shows 0 as if the lists were empty
 *
 * The camera screen reaches the DOM at import, so its wiring is checked by
 * source (the way answer-flow.test.mjs does) and its templates by running them.
 * This file starts with a CORRUPT stored blob so D41 meets a real fault; the
 * blob is then replaced and `reload()` brings the same store module back healthy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
storage.setItem('shin.v1', '{"history": [ {"id":');
installBrowser({ doc: makeDocument(), storage });

const store = await import('../public/js/store.js');
const watchlist = await import('../public/js/screens/watchlist.js');
const pastscans = await import('../public/js/screens/pastscans.js');
const removed = await import('../public/js/screens/removed.js');
const shareScreen = (await import('../public/js/screens/share.js')).default;
const H = await import('../public/js/lib/history-answer.js');
const camera = await import('../public/js/screens/camera.js');
const { say } = await import('../public/js/voice.js');
const { t } = await import('../public/js/ui-strings.js');

const read = (rel) => readFileSync(new URL(`../public/${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('js/screens/camera.js');

function stubRoot() {
  return {
    innerHTML: '', dataset: {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, removeEventListener: () => {}, setAttribute: () => {}, closest: () => null, contains: () => false,
  };
}
function paint(screen, ctx = {}) {
  const root = stubRoot();
  /* The share card finds its canvas after the paint; a stand-in keeps its async draw harmless. */
  const dummy = { hidden: false, textContent: '', getContext: () => null };
  root.querySelector = (sel) => (/shr-/.test(sel) ? dummy : null);
  try {
    screen.render(root, { go() {}, replace() {}, params: {}, store, api: {}, build: 'test', ...ctx });
  } catch { /* wiring after the paint needs a DOM this stub lacks, not markup */ }
  return root.innerHTML;
}

/* ------------------------------------------------------------------ D41 */

test('D41: an unreadable store is said on all three lists, with Try again, and no list shows 0', () => {
  assert.equal(store.loadFault(), 'corrupt', 'the fixture did not fault the store');
  const saved = paint(watchlist.default);
  assert.match(saved, /I could not read what you saved/);
  assert.match(saved, /data-act="retry"/);
  assert.ok(!/ilist-v">\s*0\s*</.test(saved), 'Saved still prints a 0 count for Past scans or Recently removed');
  assert.match(saved, /ilist-v">\?</, 'the counts are not marked unknown');
  const past = paint(pastscans.default);
  assert.match(past, /I could not read your past scans/);
  assert.match(past, /data-act="retry"/);
  assert.ok(!/PAST SCANS · 0|Past scans · 0|Nothing scanned yet/i.test(past), 'Past scans reports an empty list');
  const gone = paint(removed.default);
  assert.match(gone, /I could not read what was removed/);
  assert.match(gone, /data-act="retry"/);
  assert.ok(!/Nothing removed/i.test(gone), 'Recently removed reports an empty list');
});

test('D41: once the store reads again the lists are drawn, and zero is a count again', () => {
  storage.setItem('shin.v1', '{}');
  assert.equal(store.reload(), null);
  const saved = paint(watchlist.default);
  assert.match(saved, /ilist-v">0</, 'a healthy empty store should show its zero counts');
});

/* ------------------------------------------------------------------ D07 */

const WIRE = {
  kind: 'distribution', currency: 'CAD', centreCents: 554, sigmaLog: 0.3, p10Cents: 316, p90Cents: 972,
  confidence: 'low', basis: 'parent_category', n: 21,
  shopper: { cents: 549, zone: 'reasonable', offByPct: -0.9, beyond: null, suspect: null },
};

test('D07: a bell becomes a self-contained snapshot holding the word, the prices and the confidence', () => {
  const snap = H.answerSnapshot(WIRE, { key: '0055773000795', name: "McCain Tasti Tater's 800g" });
  assert.equal(snap.kind, 'distribution');
  assert.equal(snap.id, '0055773000795');
  assert.equal(snap.zone, 'reasonable');
  assert.equal(snap.askingCents, 549);
  assert.equal(snap.centreCents, 554);
  assert.equal(snap.confidence, 'low');
  assert.equal(H.answerSnapshot({ kind: 'range' }, { key: 'x' }), null, 'an undrawable bell must not be stored as an answer');
  // A price typed on the sheet is newer than the server's reading of the tag.
  const typed = H.answerSnapshot({ ...WIRE, shopper: null }, { key: 'k', name: 'N', typedCents: 300 });
  assert.equal(typed.askingCents, 300);
  assert.equal(typed.zone, 'great');
});

test('D07: recordVerdict hands back the row id and patchHistory rewrites that row only', () => {
  store.reset();
  const a = store.recordVerdict({ kind: 'gemini' }, { text: 'a' });
  const b = store.recordVerdict({ kind: 'gemini' }, { text: 'b' });
  assert.equal(typeof a, 'string');
  store.patchHistory(a, { answer: { kind: 'distribution' }, query: { askingCents: 7 } });
  const rows = store.get().history;
  const ra = rows.find((h) => h.id === a);
  const rb = rows.find((h) => h.id === b);
  assert.deepEqual(ra.answer, { kind: 'distribution' });
  assert.equal(ra.query.text, 'a', 'the patch dropped the rest of the query');
  assert.equal(ra.query.askingCents, 7);
  assert.equal(rb.answer, undefined);
  store.patchHistory('no-such-row', { answer: 1 });
  assert.equal(store.get().history.length, 2);
});

function bellEntry(over = {}) {
  const snap = { ...H.answerSnapshot(WIRE, { key: '0055773000795', name: "McCain Tasti Tater's 800g" }), ...over };
  return { id: 'h1', at: new Date().toISOString(), result: snap, query: { text: snap.label, askingCents: 549, answered: true } };
}

test('D07: Past scans draws a bell row and reopens it with its zone word', () => {
  const entry = bellEntry();
  const row = pastscans.row(entry);
  assert.match(row, /McCain Tasti Tater/);
  assert.match(row, /face-fair/, 'the row does not wear the zone word\'s face');
  assert.match(row, /5\.49/);
  const detail = pastscans.detail(entry);
  assert.match(detail, /Reasonable price/);
  assert.match(detail, /Shin&#39;s estimate \$5\.54|Shin's estimate \$5\.54/);
  assert.ok(!/refus|No verdict on file/i.test(detail), 'a bell answer reopened as a refusal');
});

test('D07: a Gemini row that ended in the bell carries its answer, and the list reads it', () => {
  const snap = H.answerSnapshot(WIRE, { key: 'name:oats', name: 'Oats' });
  const entry = { id: 'g1', at: new Date().toISOString(), result: { kind: 'gemini' }, answer: snap, query: { text: 'Oats', askingCents: 549, answered: true } };
  assert.equal(H.answerOf(entry), snap);
  assert.match(pastscans.row(entry), /face-fair/);
});

test('D07: Saved opens with the verdict on file, never "no verdict on file"', () => {
  const answer = H.answerSnapshot(WIRE, { key: '0055773000795', name: "McCain Tasti Tater's 800g" });
  const w = { id: '0055773000795', label: "McCain Tasti Tater's 800g", lastCents: 549, usualCents: 554, savedAt: new Date().toISOString(), answer };
  const modal = watchlist.detailModal(w, null);
  assert.match(modal, /Reasonable price/);
  assert.ok(!modal.includes(say('watchlist_no_history_note')), 'Saved still says there is no verdict on file');
  // Saved from before the answer travelled with the row: the scan left in history is enough.
  const legacy = { id: '0055773000795', label: 'X', lastCents: 549, usualCents: 554, savedAt: new Date().toISOString() };
  assert.match(watchlist.detailModal(legacy, bellEntry()), /Reasonable price/);
  // And a row with nothing on file still says so, honestly.
  assert.ok(watchlist.detailModal(legacy, null).includes(say('watchlist_no_history_note')));
});

test('D07: the camera writes every bell answer to history, and Save carries the answer', () => {
  const at = CAMERA.indexOf('function showDistribution(');
  assert.ok(at > 0);
  const body = CAMERA.slice(at, at + 2600);
  assert.match(body, /answerSnapshot\(raw/, 'showDistribution does not snapshot the answer');
  assert.match(body, /store\.recordVerdict\(snap/, 'a catalogue-first answer is not written to history');
  assert.match(body, /store\.patchHistory\(historyId, \{ answer: snap \}\)/, 'a Gemini row does not get its answer');
  const save = CAMERA.slice(CAMERA.indexOf("act === 'dist-save'"), CAMERA.indexOf("act === 'dist-save'") + 1200);
  assert.match(save, /answer: answerSnapshot\(/, 'Save does not put the verdict on the saved row');
  const sync = CAMERA.slice(CAMERA.indexOf('function syncAnswer()'), CAMERA.indexOf('function syncAnswer()') + 600);
  assert.match(sync, /store\.patchHistory\(dist\.historyId/, 'a typed price does not update the stored answer');
});

/* ------------------------------------------------------------------ D20 */

test('D20: the Saved face is the zone word\'s face, not the sign of the price delta', () => {
  // Shelf price $4.00 against a typical $5.54: the delta says "cheaper" (the old
  // code drew the good face), but the answer was Reasonable.
  const answer = { ...H.answerSnapshot(WIRE, { key: 'k', name: 'N' }), zone: 'reasonable', askingCents: 400 };
  const w = { id: 'k', label: 'N', lastCents: 400, usualCents: 554, savedAt: new Date().toISOString(), answer };
  const row = watchlist.row(w, []);
  assert.match(row, /face-fair/);
  assert.ok(!/face-good|face-walk/.test(row), 'the row wears a face the zone word did not give');
  for (const [zone, face] of [['great', 'face-delighted'], ['good', 'face-good'], ['bad', 'face-walk']]) {
    const r = watchlist.row({ ...w, answer: { ...answer, zone, confidence: 'high' } }, []);
    assert.match(r, new RegExp(face), `${zone} should wear ${face}`);
  }
  assert.equal(H.distFace('reasonable', 'high'), 'fair');
  assert.equal(H.distFace('great', 'low'), 'good', 'the confidence gate on the loud face is kept');
});

test('D20: the Saved list and the camera use one zone-to-face mapping', () => {
  assert.equal(camera.distFace, H.distFace);
  assert.ok(!/function distFace\(/.test(CAMERA), 'camera.js grew a second copy of the mapping');
});

/* ------------------------------------------------------------------ D08 */

test('D08: the bell sheet has Share at the half detent, with Correct, and not in the peek', () => {
  const html = camera.distributionSheet(WIRE, { name: 'McCain' });
  const half = html.slice(html.indexOf('class="sheet-half"'), html.indexOf('class="sheet-full"'));
  assert.match(half, /data-act="share"/, 'no Share control at the half detent');
  assert.match(half, /data-act="correct"/);
  const peek = html.slice(html.indexOf('class="sheet-peek"'), html.indexOf('class="sheet-half"'));
  assert.ok(!/data-act="share"/.test(peek), 'Share is in the peek, where Save is the one action');
  assert.match(peek, /data-act="dist-save"/);
  assert.match(CAMERA, /act === 'share' && dist\?\.key && last\?\.result\?\.kind === 'distribution'/, 'the Share tap is not wired');
});

test('D08: /share does not redirect when a bell answer exists, and the card carries no link', () => {
  store.reset();
  const snap = H.answerSnapshot(WIRE, { key: '0055773000795', name: "McCain Tasti Tater's 800g" });
  store.recordVerdict(snap, { text: snap.label, askingCents: 549, answered: true });
  const calls = [];
  const html = paint(shareScreen, { params: { id: '0055773000795' }, replace: (to) => calls.push(to) });
  assert.deepEqual(calls, [], '/share still redirects with an answer to share');
  assert.match(html, /Post it/);
  assert.ok(!/https?:\/\/|download|app store|play store/i.test(html), 'the share card carries a link');
  // With nothing to share it still goes back to the camera.
  store.reset();
  const gone = [];
  paint(shareScreen, { params: {}, replace: (to) => gone.push(to) });
  assert.deepEqual(gone, ['camera']);
});

test('D08: the share card draws with its own strings (the canvas text colour no longer shadows t())', () => {
  const src = read('js/screens/share.js');
  const draw = src.slice(src.indexOf('async function drawCard('), src.indexOf('function cardText('));
  assert.ok(!/const t = palette/.test(draw), 'drawCard shadows the string function with the palette');
  assert.match(draw, /t\('share_on_the_tag_caps'\)/);
  assert.match(draw, /const pal = palette/);
});

test('D08: the card for a bell answer says the zone word and both prices, never the arithmetic between them', () => {
  const src = read('js/screens/share.js');
  const card = src.slice(src.indexOf('function answerCard('), src.indexOf('export default'));
  assert.match(card, /askingText/);
  assert.match(card, /elsewhereText/);
  assert.ok(!/saved|savings/i.test(card), 'the card claims a saving');
  assert.equal(t('share_conf_low'), 'Not fully confident');
});

/* ------------------------------------------------------------------ D17, D37 */

test('D17: a 5xx is a server fault and a network failure is not', () => {
  assert.equal(camera.isServerFault(new Error('/api/identify returned 500')), true);
  assert.equal(camera.isServerFault(new Error('/api/identify returned 503')), true);
  assert.equal(camera.isServerFault(new Error('/api/identify returned 404')), false);
  assert.equal(camera.isServerFault(new TypeError('Failed to fetch')), false);
  assert.equal(camera.isServerFault(undefined), false);
});

test('D17: the server-fault sheet blames Shin, offers Retry and never says "I need a connection"', () => {
  const html = camera.serverFaultSheet();
  assert.match(html, /data-server-fault/);
  assert.match(html, /data-act="lookup-retry"/);
  assert.match(html, /Shin hit a problem on its side/);
  assert.match(html, /fault is on Shin/);
  assert.ok(!/I need a connection|needs an internet connection/.test(html), 'a server fault tells the shopper to fix their network');
  const lookup = CAMERA.slice(CAMERA.indexOf('async function catalogueLookup'), CAMERA.indexOf('function sameCode'));
  assert.match(lookup, /serverFault = isServerFault\(err\)/);
  assert.match(lookup, /if \(id === null && serverFault\) return \{ serverFault: true \}/, 'a 5xx still falls through to the offline marker');
  assert.match(CAMERA, /found\?\.serverFault/);
});

test('D37: the offline sheet carries Retry and still says it needs a connection', () => {
  const html = camera.needsConnectionSheet();
  assert.match(html, /data-needs-connection/);
  assert.match(html, /data-act="lookup-retry"/, 'the offline sheet has no Retry');
  assert.match(html, /I need a connection for this/);
  assert.match(CAMERA, /act === 'lookup-retry' && lastLookup/);
});
