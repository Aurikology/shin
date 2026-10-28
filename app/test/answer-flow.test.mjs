/**
 * The typed and scanned routes meet at one answer (walkthrough 2026-10-06):
 *
 *   D04  a typed name offers the catalogue's top three matches, and a pick is
 *        answered by the barcode route with that product's own code.
 *   D11  an unknown or unreadable barcode asks for the name, then the typed route
 *        answers; no "not found" screen is left to stop on.
 *   D18  with photo ID off the camera speaks about barcodes, not photos.
 *   D26  the price pad asks for the shelf price, not for a tag.
 *   D19  nothing asks for the photo-ID model while photo ID is off.
 *   D25  the pad's close control is 44 by 44.
 *   D42  the lone action on an unhued sheet does not look disabled.
 *
 * By source for the flow wiring, like notthis.test.mjs and for the same reason
 * (the camera screen reaches the DOM at import), and by running the copy and the
 * templates where they are pure. Each assertion failed on the code before the fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const { typedPickSheet, textRouteSheet } = await import('../public/js/screens/camera.js');
const { say, personality, setPersonality, PERSONALITIES } = await import('../public/js/voice.js');
const { t, setLocale } = await import('../public/js/ui-strings.js');

const read = (rel) => readFileSync(new URL(`../public/${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CAMERA = read('js/screens/camera.js');
const CSS = read('css/screens/camera.css');
const EYE = read('js/eye-attach.js');

/** The body of `function name(` up to the next function at the same indent. */
function bodyOf(src, header) {
  const at = src.indexOf(header);
  assert.ok(at >= 0, `${header} not found`);
  return src.slice(at, at + 9000);
}

/* ------------------------------------------------------------------- D04 */

const picks = [
  { code: '0055773000795', label: "McCain Tasti Tater's 800 g", meta: 'frozen fried potatoes' },
  { code: '0055773003062', label: 'McCain Tasti Taters', meta: '' },
  { code: '0055773000796', label: 'McCain Tasti Taters Mini', meta: '' },
];

test('D04: the picker shows each match as a row carrying its own barcode, plus a way out', () => {
  const html = typedPickSheet(picks, 'McCain Tasti Taters');
  for (const p of picks) assert.match(html, new RegExp(`data-typed-pick="${p.code}"`));
  assert.equal((html.match(/data-typed-pick=/g) ?? []).length, 3);
  assert.match(html, /data-act="typed-pick-none"/);
  assert.match(html, /McCain Tasti Taters/);
});

test('D04: the typed query reaches the picker escaped', () => {
  const html = typedPickSheet(picks, '<script>x</script>');
  assert.doesNotMatch(html, /<script>x<\/script>/);
});

test('D04: the typed route asks for three catalogue matches before it identifies anything', () => {
  const fn = bodyOf(CAMERA, 'async function runTypedSearch(');
  const search = fn.indexOf('ctx.api.search({ text, limit: 3 })');
  const identify = fn.indexOf('ctx.api.identify(');
  assert.ok(search > 0, 'runTypedSearch never searches for the top three');
  assert.ok(identify > search, 'the picker must come before the identify call');
  assert.match(fn, /typedPickSheet\(rows, text\)/);
});

test('D04: a pick is answered by the barcode route with the pick\'s own code and the shelf price typed', () => {
  const at = CAMERA.indexOf("e.target.closest('[data-typed-pick]')");
  assert.ok(at > 0, 'no handler for a typed pick');
  const handler = CAMERA.slice(at, at + 900);
  assert.match(handler, /resolveBarcode\(code, scanShelfCents\)/);
  // The price asked on the pad before the name is carried, not asked a second time.
  assert.match(handler, /typedPick\.cents/);
});

test('D04: "none of these" falls back to the old identify path, never to a second picker', () => {
  assert.match(CAMERA, /act === 'typed-pick-none'[\s\S]{0,200}skipPicks: true/);
});

/* ------------------------------------------------------------------- D11 */

test('D11: a barcode the catalogue does not hold asks the name, with no not-found screen drawn', () => {
  const fn = bodyOf(CAMERA, 'function showCatalogue(');
  const ask = fn.indexOf("answer?.outcome === 'not_in_catalogue' && answer.offerManualEntry");
  const sheet = fn.indexOf('catalogueSheet(answer');
  assert.ok(ask > 0 && sheet > ask, 'the name prompt must be chosen before the not-found sheet is built');
  assert.match(fn.slice(ask, ask + 200), /askNameForUnknownBarcode\(cents, answer\.barcode \?\? null\)/);
});

test('D11: an unreadable (invalid) barcode reads the frame first, and asks the name only after, loudly', () => {
  // RULINGS.md "A scan never ends with no result" (2026-10-10) retired "the same road as a code nobody knows":
  // a misread is not a missing product. The frame is read off the pack; typing is the last step and is logged.
  const fn = bodyOf(CAMERA, 'async function catalogueLookup(');
  const at = fn.indexOf("id?.failure === 'invalid_barcode'");
  assert.ok(at > 0, 'the invalid-barcode answer is not handled in the lookup at all');
  const branch = fn.slice(at, at + 1400);
  const frame = branch.indexOf('sendFrame(code, scanFrame');
  const typing = branch.indexOf('offerManualEntry: true');
  assert.ok(frame > 0, 'an invalid barcode no longer tries the camera frame before asking for the name');
  assert.ok(typing > frame, 'typing the name is offered before the frame was tried');
  assert.match(branch.slice(0, typing), /console\.error\('scan ended with no name:'/, 'typing the name after a misread is not logged loudly');
});

test('D11: a code nothing knows no longer ends on the stand-in candidate list', () => {
  const fn = bodyOf(CAMERA, 'async function resolveBarcode(');
  const tail = fn.slice(fn.indexOf('Read fine, and we do not have it'));
  assert.match(tail.slice(0, 400), /askNameForUnknownBarcode\(cents, code\)/);
  assert.doesNotMatch(tail.slice(0, 400), /candidateSheet\(/);
});

test('D11: the name prompt carries the price on to the typed route', () => {
  const fn = bodyOf(CAMERA, 'function askNameForUnknownBarcode(');
  assert.match(fn, /typedAfterPad = \{ cents: scanShelfCents \}/);
  assert.match(fn, /textRouteSheet\('', \{ unknownBarcode: true \}\)/);
});

test('D11: the prompt says the barcode is unknown and asks for the name, in both languages', () => {
  const html = textRouteSheet('', { unknownBarcode: true });
  assert.match(html, /doesn&#39;t know this barcode|doesn't know this barcode/);
  assert.match(html, /data-textroute-input/);
  setLocale('fr');
  try {
    assert.match(t('cat_unknown_ask_name'), /ne connaît pas encore ce code-barres/);
    assert.match(t('cam_typed_pick_none'), /Aucun/);
  } finally {
    setLocale('en');
  }
  // The ordinary type-it sheet is unchanged.
  assert.doesNotMatch(textRouteSheet(''), /know this barcode/);
});

/* ------------------------------------------------------------------- D20 */

test('D20: every face tracks the zone word; Reasonable is never the green good face', async () => {
  const { distFace } = await import('../public/js/screens/camera.js');
  assert.equal(distFace('great', 'high'), 'delighted');
  assert.equal(distFace('great', 'low'), 'fair', 'a not-confident Great is never a smiling face (build 7 R-72, was good)');
  assert.equal(distFace('good', 'high'), 'good');
  assert.equal(distFace('reasonable', 'high'), 'fair');
  assert.equal(distFace('reasonable', 'medium'), 'fair');
  assert.equal(distFace('bad', 'high'), 'walk');
  // And the sheet draws the face distFace names, for every zone.
  const F = await import('./verdict-fixtures.mjs');
  const { distributionSheet } = await import('../public/js/screens/camera.js');
  for (const [fixture, zone, face] of [
    [F.GREAT, 'great', 'delighted'],
    [F.GOOD, 'good', 'good'],
    [F.REASONABLE, 'reasonable', 'fair'],
    [F.BAD, 'bad', 'walk'],
  ]) {
    const v = JSON.parse(JSON.stringify(fixture));
    v.confidence = 'high';
    const html = distributionSheet(v, { name: 'X' });
    assert.match(html, new RegExp(`data-zone="${zone}"`), `fixture is not the ${zone} zone`);
    assert.match(html, new RegExp(`class="face face-${face}"`), `zone ${zone} is not drawn with the ${face} face`);
  }
});

/* ------------------------------------------------------------ D18 / D26 */

test('D18: with photo ID off the camera lines are about barcodes', () => {
  const was = personality();
  try {
    for (const who of PERSONALITIES.map((p) => p.id ?? p)) {
      for (const key of ['cam_aim_barcode', 'hint_escalated_barcode', 'reading_barcode']) {
        const line = say(key, {}, who);
        assert.ok(line && line !== key, `${key} (${who}) has no line`);
        assert.doesNotMatch(line, /photo|picture|shutter/i, `${key} (${who}) talks about photos`);
      }
      assert.match(say('cam_aim_barcode', {}, who), /barcode/i, `aim line (${who}) never says barcode`);
    }
  } finally {
    setPersonality(was);
  }
  assert.match(CAMERA, /FLAGS\.photoId \? 'cam_aim_hint' : 'cam_aim_barcode'/);
  assert.match(CAMERA, /FLAGS\.photoId \? 'hint_escalated' : 'hint_escalated_barcode'/);
  assert.match(CAMERA, /FLAGS\.photoId \? 'reading' : 'reading_barcode'/);
});

test('D26: the price pad asks "What\'s the shelf price?"', () => {
  assert.equal(say('price_pad_prompt', {}, 'deadpan'), "What's the shelf price?");
  for (const who of ['deadpan', 'warm', 'blunt']) {
    assert.match(say('price_pad_prompt', {}, who), /shelf price/i);
    assert.doesNotMatch(say('price_pad_prompt', {}, who), /tag/i);
  }
});

/* ------------------------------------------------------------------- D19 */

test('D19: the photo-ID model is not requested while photo ID is off', () => {
  const at = EYE.indexOf("method: 'HEAD'");
  assert.ok(at > 0, 'the model probe moved; update this test');
  const before = EYE.slice(Math.max(0, at - 220), at);
  assert.match(before, /if \(FLAGS\.photoId\)/, 'the HEAD request is not behind FLAGS.photoId');
  assert.match(EYE, /import \{ FLAGS \} from '\.\/flags\.js'/);
});

/* ------------------------------------------------------------------- D25 */

test('D25: the sheet close control is itself 44 by 44, not a small box with reach around it', () => {
  const rule = CSS.match(/\.sheet-close \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /width: 44px/);
  assert.match(rule, /height: 44px/);
});

/* ------------------------------------------------------------------- D42 */

test('D42: the one action on an unhued sheet is ink on ground, not a pale pill with grey text', () => {
  const rule = CSS.match(/\.sheet\[data-tier="unknown"\] \.pill\.solid \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /background: var\(--ink\)/);
  assert.match(rule, /color: var\(--ground\)/);
});

/* D-241 (2026-10-28): "kraft dinner original 225g", a price, then "None of these" landed on "I could
   not tell what this is. Type what it is" with a "Type what it is" button, right after it was typed.
   A typed miss names what was typed and points at the barcode; it never asks to type it again. */
test('D-241: a typed name with no match names the words and offers the barcode, not "Type what it is"', async () => {
  const { refusalSheet } = await import('../public/js/screens/camera.js');
  const miss = { kind: 'refusal', reason: 'no_identity', detail: say('cam_text_no_own_price'), identity: null, evidence: [] };
  for (const p of ['deadpan', 'warm', 'blunt']) {
    setPersonality(p);
    const html = refusalSheet(miss, null, [], null, { priceRoute: false, typedText: 'kraft dinner original 225g' });
    assert.ok(!html.includes('data-act="typeit"'), `${p}: the typed miss asks to type it again`);
    assert.ok(!html.includes(say('refuse_unknown_why')), `${p}: "Type what it is and I will look it up" is still said`);
    assert.ok(!html.includes(say('refuse_unknown')), `${p}: the title says Pexi could not tell what it is`);
    assert.match(html, /kraft dinner original 225g/, `${p}: the typed words are not named`);
    assert.match(html, new RegExp(`data-act="cancel-scan"[^>]*>${t('cam_scan_barcode')}<`), `${p}: no way back to scan the barcode`);
  }
  setPersonality('deadpan');
  // A barcode or photo with no identity still offers the typed route.
  assert.ok(refusalSheet(miss, null, [], null, {}).includes('data-act="typeit"'));
});
