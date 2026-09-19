/**
 * The Gemini answer sheet: what the shopper sees when `/api/price` answers a
 * scan with `{ kind: 'gemini', ... }`.
 *
 * THE BREAK THIS HOLDS SHUT. The server stopped answering with a `verdict` and
 * answers with one Gemini answer instead. The camera only knew `verdict`, so a
 * good answer fell into the refusal branch and the shopper saw a refusal for
 * it, on the app's main screen. Every test below fails if that comes back:
 *
 *   - the sheet functions are string renderers, so the headline, the figures,
 *     the "not fully confident" mark and the failure states are asserted on the
 *     markup a phone would get;
 *   - `proceed`'s branch is closed over a live camera, so its routing is held by
 *     source markers, cut to the branch itself so a `refusalSheet(` elsewhere in
 *     the file cannot satisfy or break them;
 *   - the history screens are asserted on the rows they build.
 *
 * SHIN COMPUTES NO PRICE MATH (docs/beta-gaps-2026-09-19.md, rule 6): the
 * figures on the sheet must be the model's bytes. The fixture medians are
 * chosen so a formatter would change them (4.5 becomes 4.50, 5.25 becomes
 * $5.25), which is what makes "shown as returned" checkable rather than
 * asserted.
 *
 * NOT VERIFIED HERE: layout. There is no browser in this suite, so how the
 * sheet sits at 390 px is a walk on a phone, not a claim of this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { geminiSheet, geminiFailureSheet, geminiFailed } from '../public/js/screens/camera.js';
import { detail as pastDetail, row as pastRow } from '../public/js/screens/pastscans.js';
import { geminiReading } from '../public/js/grounded.js';
import { confidenceOf, geminiWordFor } from '../public/js/shin.js';
import { say } from '../public/js/voice.js';
import { LINES_FR } from '../public/js/voice-fr.js';
import { t } from '../public/js/ui-strings.js';
import { makeDocument, installBrowser, makeStorage } from './mini-dom.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const TONES = ['deadpan', 'warm', 'blunt'];

/** A Gemini answer as the server sends it, with the fields this sheet reads. */
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
        offers: [{ retailer: 'Northfield Grocers', price: '4.49', url: 'https://northfield.example.ca/p/1', hasLink: true }],
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

/* ================================================================ answers == */

test('the headline is Gemini\'s own zone word, and each of the three zones reads differently', () => {
  const words = [];
  for (const [zone, key] of [
    ['under_your_line', 'priceline_zone_under'],
    ['middle', 'priceline_zone_middle'],
    ['over_your_line', 'priceline_zone_over'],
  ]) {
    const html = geminiSheet(answer({ zone }), ITEM, null);
    const headline = html.match(/<h2 class="vword[^"]*" data-gemini-headline>([^<]*)<\/h2>/);
    assert.ok(headline, `${zone}: no headline on the Gemini sheet`);
    assert.equal(headline[1], t(key), `${zone}: the headline is not the zone word`);
    assert.match(html, new RegExp(`data-zone="${zone}"`));
    words.push(headline[1]);
  }
  assert.equal(new Set(words).size, 3, 'two different zones headline the same word');
});

test('the middle price and the shelf label are shown as the model returned them', () => {
  const html = geminiSheet(answer({ median: 4.5 }), ITEM, null);
  // 4.5, not 4.50 and not $4.50: a formatter would have changed it.
  assert.ok(html.includes('Middle price: 4.5 per 100 mL'), 'the median is not the model\'s own text');
  assert.ok(html.includes('Shelf price: 6 x 355 mL, 4.49'), 'the shelf label is not the model\'s own text');
  assert.doesNotMatch(html, /\$\d|\d\s?%/, 'the sheet shows a dollar figure or a percentage Shin made');
});

test('with no shelf price to place there is no zone, and the name leads instead', () => {
  const html = geminiSheet(answer({ zone: null }), ITEM, null);
  assert.match(html, /data-gemini-headline>Citrus Soda</);
  assert.doesNotMatch(html, /data-gemini-figures/, 'a median appeared with no verdict behind it');
  assert.ok(!geminiFailed(answer({ zone: null })), 'an answer with offers and no verdict was called a failure');
});

test('the answer sheet carries the grounded slot, the thumbs, the correct-it action and Done', () => {
  const html = geminiSheet(answer(), ITEM, null);
  assert.match(html, /data-grounded-slot/, 'nothing to mount the offers and reviews into');
  assert.match(html, /data-act="thumbs-up"/);
  assert.match(html, /data-act="thumbs-down"/);
  assert.match(html, /data-act="correct"/);
  assert.match(html, /data-act="cancel-scan"/);
});

test('an answer is never drawn as a refusal, and offers no watch, share or swaps it cannot serve', () => {
  const html = geminiSheet(answer(), ITEM, null);
  assert.doesNotMatch(html, /class="sheet refusal|gemini-failed/, 'a good answer was drawn as a refusal');
  assert.doesNotMatch(html, /data-act="(watch|share|keepit|typeit)"/, 'the sheet offers an action that has nothing to act on');
  assert.doesNotMatch(html, /data-cheaper|cheaper-slot|data-swap/, 'the catalogue swap box is on a Gemini answer');
  assert.ok(!html.includes(t('cam_refused_word')));
});

/* ============================================================ low confidence == */

test('a low-confidence answer shows the mark and still shows the answer', () => {
  const html = geminiSheet(answer({ low: true }), ITEM, null);
  assert.match(html, /data-not-confident>Not fully confident</, 'the mark is missing');
  assert.match(html, /data-conf="thin"/);
  assert.match(html, /data-conf-reasons="thin_offers"/, 'the reasons were dropped');
  assert.match(html, /data-gemini-headline>over your line</, 'the answer disappeared behind the mark');
  assert.match(html, /data-grounded-slot/);
  assert.equal(geminiFailed(answer({ low: true })), false, 'a low-confidence answer was called a failure');
  assert.ok(html.includes(say('gem_unsure')), 'Shin does not say he is unsure');
});

test('a confident answer carries no mark', () => {
  const html = geminiSheet(answer({ low: false }), ITEM, null);
  assert.doesNotMatch(html, /data-not-confident/);
  assert.match(html, /data-conf="sure"/);
});

/* ================================================================ failures == */

test('every failure variant is a failure, and an answer is not', () => {
  assert.equal(geminiFailed({ kind: 'gemini', failure: 'model_client_error', lowConfidence: true, confidenceReasons: ['no_answer:model_client_error'] }), true);
  assert.equal(geminiFailed({ kind: 'gemini', reason: 'nothing_to_price', lowConfidence: true, confidenceReasons: ['no_query'] }), true);
  assert.equal(geminiFailed(answer({ top: { failure: 'model_timeout' } })), true, 'a marked failure with a block was shown as an answer');
  const empty = answer({ zone: null, block: { offers: [], reviews: [], facts: [], description: null } });
  assert.equal(geminiFailed(empty), true, 'a block with nothing in it was shown as an answer');
  assert.equal(geminiFailed(answer()), false);
  assert.equal(geminiFailed({ kind: 'verdict' }), false, 'a verdict is not a Gemini failure');
});

test('the failure state is plain, kind and retryable, in the mascot voice', () => {
  for (const [result, key] of [
    [{ kind: 'gemini', failure: 'model_client_error', lowConfidence: true }, 'gem_failed'],
    [{ kind: 'gemini', reason: 'nothing_to_price', lowConfidence: true }, 'gem_nothing'],
  ]) {
    const html = geminiFailureSheet(result, ITEM);
    assert.match(html, /data-gemini-failed/);
    assert.match(html, /data-act="gem-retry"/, 'no way to try again');
    assert.ok(html.includes(say(key)), `${key} is not on the sheet`);
    assert.ok(!html.includes('model_client_error') && !html.includes('nothing_to_price'), 'a raw code reached the sheet');
    assert.ok(!html.includes(t('cam_refused_word')), 'the failure says refused');
    assert.doesNotMatch(html, /\$|price this|could not price|comparison/i, 'the old refusal wording came back');
  }
});

test('the Gemini lines and words have every tone, French included, and no em dash', () => {
  for (const key of ['gem_answer', 'gem_unsure', 'gem_failed', 'gem_nothing']) {
    for (const tone of TONES) {
      const en = say(key, {}, tone);
      const fr = LINES_FR[key]?.[tone]?.();
      assert.ok(en && en.length > 0, `${key}/${tone} has no English`);
      assert.ok(fr && fr.length > 0, `${key}/${tone} has no French`);
      assert.notEqual(en, fr, `${key}/${tone} French is the English`);
      assert.ok(!en.includes('—') && !fr.includes('—'), `${key}/${tone} has an em dash`);
      assert.doesNotMatch(en, /\brefused\b/i, `${key}/${tone} says refused`);
    }
  }
});

/* ============================================================ read, not made == */

test('the reading lifted out of the wire copies values and works nothing out', () => {
  const g = geminiReading(answer({ median: 4.5 }).grounded);
  assert.equal(g.zone, 'over_your_line');
  assert.equal(g.median, '4.5');
  assert.equal(g.unitLabel, '100 mL');
  assert.equal(g.shelfLabel, '6 x 355 mL, 4.49');
  assert.equal(g.name, 'Citrus Soda');
  // A code Shin does not know is not a zone, and is never guessed at.
  const odd = geminiReading(answer({ zone: 'somewhere_else' }).grounded);
  assert.equal(odd.zone, null);

  const src = read('../public/js/grounded.js');
  const body = src.slice(src.indexOf('export function geminiReading'));
  assert.doesNotMatch(body, /Math\.|toFixed|parseFloat|Number\(|Intl\.|\bcad\s*\(/, 'geminiReading does arithmetic or formatting on a price');
});

/* ================================================== the branch in the camera == */

const camera = read('../public/js/screens/camera.js');
const branchStart = camera.indexOf("if (result.kind === 'gemini') {");
const branchEnd = camera.indexOf("} else if (result.kind === 'verdict') {", branchStart);
const branch = branchStart > 0 && branchEnd > branchStart ? camera.slice(branchStart, branchEnd) : '';

test('proceed has a gemini branch, ahead of the verdict and refusal branches', () => {
  assert.ok(branchStart > 0, 'proceed no longer has a branch for kind === \'gemini\'');
  assert.ok(branchEnd > branchStart, 'the gemini branch no longer sits ahead of the verdict branch');
  assert.ok(branchStart < camera.indexOf('goingRateCard(result, item)'), 'the gemini branch is behind the refusal branches');
});

test('the gemini branch draws the answer or the failure state, never the refusal sheet', () => {
  assert.match(branch, /geminiSheet\(result, item, scanThumb\)/, 'the answer sheet is not drawn');
  assert.match(branch, /geminiFailureSheet\(result, item\)/, 'the failure state is not drawn');
  assert.match(branch, /geminiFailed\(result\)/);
  assert.match(branch, /fillGrounded\(slot, result\)/, 'the offers and reviews are not mounted');
  assert.doesNotMatch(branch, /refusalSheet\(/, 'a Gemini answer would render the refusal sheet');
  assert.doesNotMatch(branch, /verdictSheet\(/);
});

test('the catalogue is not consulted for a Gemini answer', () => {
  assert.ok(branch.length > 200, 'the gemini branch is missing, so there is nothing to check');
  assert.doesNotMatch(branch, /fillCheaper\(|cheaperSlot\(|swapCode/, 'a catalogue swap runs on a Gemini answer');
  const sheet = camera.slice(camera.indexOf('function geminiSheet('), camera.indexOf('function geminiFailureSheet('));
  assert.doesNotMatch(sheet, /cheaperSlot\(|provenance\(/, 'the answer sheet carries the catalogue swap box');
});

test('the answer is stored with the two plain facts the history screens read', () => {
  assert.match(camera, /answered: !geminiFailed\(result\)/);
  assert.match(camera, /zone: geminiReading\(result\.grounded\)\.zone/);
  assert.match(camera, /last = \{ result, scenario: item, thumb: scanThumb, askingCents \};/, 'retry has no price to send again');
});

test('a thumb on a Gemini answer is kept against that answer\'s scan id, and undo removes it', () => {
  assert.match(camera, /const ratedScan = last\?\.result\?\.kind === 'gemini'/);
  assert.match(camera, /Number\.isInteger\(last\.result\.scanId\) \? last\.result\.scanId : lastScanId/);
  assert.match(camera, /store\.recordRating\(\{ scanId: ratedScan, rating \}\)/);
  assert.match(camera, /postScanRating\?\.\(\{ deviceId: getDeviceId\(\)\?\.id, scanId: ratedScan, rating \}\)/);
  assert.match(camera, /store\.deleteRating\(ratedScan\)/);
  assert.match(camera, /deleteScanRating\?\.\(\{ deviceId: getDeviceId\(\)\?\.id, scanId: ratedScan \}\)/);
});

test('retry runs the same scan again from the failure state', () => {
  assert.match(camera, /act === 'gem-retry' && last\?\.scenario\) \{[^}]*proceed\(last\.scenario, last\.askingCents\)/);
});

/* ==================================================== the history screens == */

const entry = (over = {}) => ({
  id: 'h1',
  at: new Date().toISOString(),
  result: answer(),
  query: { text: 'citrus soda', answered: true, zone: 'over_your_line' },
  ...over,
});

test('a past Gemini answer reopens as its zone word, never as a refusal', () => {
  const doc = makeDocument();
  const restore = installBrowser({ doc, storage: makeStorage() });
  try {
    const html = pastDetail(entry());
    assert.ok(html.includes(t('priceline_zone_over')), 'the reopened answer lost its word');
    assert.ok(!html.includes(t('cam_refused_word')), 'the reopened answer says refused');
    assert.ok(html.includes(t('cam_gem_not_confident')) === false, 'a confident answer reopened with the mark');
    const unsure = pastDetail(entry({ result: answer({ low: true }) }));
    assert.ok(unsure.includes(t('cam_gem_not_confident')), 'the mark was lost on reopening');
    const failed = pastDetail(entry({ result: { kind: 'gemini', failure: 'model_client_error' }, query: { text: 'citrus soda', answered: false, zone: null } }));
    assert.ok(failed.includes(t('cam_gem_failed_word')));
    assert.ok(pastRow(entry()).includes('citrus soda'), 'the row lost the item name');
  } finally {
    restore();
  }
});

test('the history word and confidence read the stored facts, not the wire', () => {
  assert.equal(geminiWordFor({ query: { zone: 'under_your_line', answered: true } }), t('priceline_zone_under'));
  assert.equal(geminiWordFor({ query: { zone: null, answered: true } }), t('cam_gem_answered_word'));
  assert.equal(geminiWordFor({ query: { zone: null, answered: false } }), t('cam_gem_failed_word'));
  assert.equal(confidenceOf(answer({ low: true })).level, 'thin');
  assert.equal(confidenceOf(answer({ low: false })).level, 'sure');
  assert.equal(confidenceOf({ kind: 'gemini', failure: 'model_timeout' }).level, 'refuses');
});

test('the weekly line counts an answered Gemini scan and skips a failed one', async () => {
  const doc = makeDocument();
  const restore = installBrowser({ doc, storage: makeStorage() });
  try {
    const store = await import('../public/js/store.js');
    const before = store.weeklyStats();
    store.recordVerdict(answer(), { text: 'a', answered: true, zone: 'under_your_line' });
    store.recordVerdict({ kind: 'gemini', failure: 'model_client_error' }, { text: 'b', answered: false, zone: null });
    const after = store.weeklyStats();
    assert.equal(after.scanned - before.scanned, 2);
    assert.equal(after.callable - before.callable, 1, 'a failed answer counted as callable, or an answer did not');
    assert.equal(store.goodFindThisWeek(), true, 'an answer under the user\'s line is not a good find');
  } finally {
    restore();
  }
});
