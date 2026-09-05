/**
 * Tests for decision 18, which is the decision most likely to be quietly undone.
 *
 * The failure this guards against is not a crash. It is someone later replacing
 * the derived score with the model's self-report because it is one line shorter,
 * and nothing breaking, and the product becoming confidently wrong in exactly
 * the way the pilot already was once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveConfidence, type ConfidenceSignals } from '../src/confidence.ts';

const base: ConfidenceSignals = {
  barcodeResolved: false,
  catalogueSimilarity: 0.9,
  lead: 0.12,
  brandAgrees: true,
  sizeAgrees: true,
  selfConfidence: 0.9,
  sharpnessOk: true,
};

test('a resolved barcode is answered, not scored', () => {
  const c = deriveConfidence({ ...base, barcodeResolved: true, selfConfidence: 0 });
  assert.equal(c.band, 'high');
  assert.equal(c.score, 1);
});

test('a confident model with nothing backing it does not reach high', () => {
  // The whole point of decision 18. The model says 1.0; everything independent
  // is missing or disagrees.
  const c = deriveConfidence({
    barcodeResolved: false,
    catalogueSimilarity: 0.55,
    lead: 0.005,
    brandAgrees: false,
    sizeAgrees: false,
    selfConfidence: 1,
    sharpnessOk: true,
  });
  assert.notEqual(c.band, 'high');
  assert.ok(c.score < 0.5, `expected a low score, got ${c.score}`);
});

test('two near identical candidates cap confidence however good the match is', () => {
  const c = deriveConfidence({ ...base, catalogueSimilarity: 0.97, lead: 0.004 });
  assert.notEqual(c.band, 'high');
  assert.match(c.because, /almost equally/);
});

test('a soft photo is named as the limit before anything else', () => {
  const c = deriveConfidence({ ...base, sharpnessOk: false });
  assert.match(c.because, /soft/);
});

test('everything lining up reaches high', () => {
  const c = deriveConfidence(base);
  assert.equal(c.band, 'high');
});

test('a missing signal lowers certainty rather than scoring zero', () => {
  // No brand and no size to compare should not be punished the same as a brand
  // and size that disagree.
  const absent = deriveConfidence({ ...base, brandAgrees: null, sizeAgrees: null });
  const disagreeing = deriveConfidence({ ...base, brandAgrees: false, sizeAgrees: false });
  assert.ok(
    absent.score > disagreeing.score,
    `absent ${absent.score} should beat disagreeing ${disagreeing.score}`,
  );
});

test('the reason is a sentence a shopper can act on, not a percentage', () => {
  for (const c of [
    deriveConfidence(base),
    deriveConfidence({ ...base, sharpnessOk: false }),
    deriveConfidence({ ...base, catalogueSimilarity: null }),
    deriveConfidence({ ...base, brandAgrees: false }),
  ]) {
    assert.ok(c.because.length > 10, 'reason too short to mean anything');
    assert.ok(!/\d+%/.test(c.because), `reason leaked a percentage: ${c.because}`);
  }
});
