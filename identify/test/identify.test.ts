/**
 * Tests for decision 17, the one that was still being violated.
 *
 * 2026-09-05, his correction (docs/the-combined-pipeline.md): the app must
 * always answer, with confidence carrying the doubt. `fromCrop` used to treat
 * a catalogue 'miss' band the same as zero candidates and refuse with
 * `not_in_catalogue`, even when the catalogue had handed back a ranked top
 * candidate with alternates. That threw away decision 17's whole point --
 * ranked candidates always exist, and the top one is shown large with a
 * "not this?" affordance, band or no band. These tests guard the fix: a
 * weak-band match with candidates still commits to the top one, and a
 * genuine zero-candidate result is the only case still refused, because
 * there is nothing there for a confidence number to be about.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdentifyStage, type CatalogueCandidate, type CatalogueResult } from '../src/identify.ts';
import type { Identifier, ModelReading } from '../src/model.ts';

function reading(): ModelReading {
  return {
    product: {
      brand: 'Acme',
      name: 'Widget',
      variant: null,
      size_value: 500,
      size_unit: 'g',
      category: null,
      visible_text: 'Acme Widget 500 g',
      alternates: [],
      self_confidence: 0.5,
      uncertainty: null,
    },
    tag: null,
    model: 'test-model',
    ms: 1,
  };
}

function candidate(code: string, similarity: number | null): CatalogueCandidate {
  return {
    code,
    name: 'Widget',
    brands: 'Acme',
    quantity: '500 g',
    sizeValue: 500,
    sizeUnit: 'g',
    categoryPath: [],
    allergens: [],
    signals: { similarity, brandAgrees: true, sizeAgrees: true },
  };
}

/** A model that never actually calls out, so no API key is needed in a test. */
function fakeModel(): Identifier {
  return { read: async () => reading() } as unknown as Identifier;
}

test('a weak band with a candidate still commits to it, not a refusal', async () => {
  const result: CatalogueResult = {
    band: 'miss',
    candidates: [candidate('C1', 0.4), candidate('C2', 0.3)],
    ring: null,
    matchedBy: 'hybrid',
  };
  const stage = new IdentifyStage(async () => result, fakeModel());
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);

  assert.equal(outcome.kind, 'identified', 'a miss band with candidates was refused');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.chosen.code, 'C1');
    assert.equal(outcome.alternates.length, 1, 'decision 17: the runner-up must survive as an alternate');
    assert.equal(outcome.alternates[0].code, 'C2');
  }
});

test('genuinely nothing found is still the one refusal left', async () => {
  const result: CatalogueResult = { band: 'miss', candidates: [], ring: null, matchedBy: 'none' };
  const stage = new IdentifyStage(async () => result, fakeModel());
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);

  assert.equal(outcome.kind, 'not_in_catalogue', 'zero candidates is arithmetic, not judgement, and stays a refusal');
});

test('a confident band with a candidate is unaffected by the fix', async () => {
  const result: CatalogueResult = {
    band: 'confident',
    candidates: [candidate('C1', 0.9)],
    ring: null,
    matchedBy: 'hybrid',
  };
  const stage = new IdentifyStage(async () => result, fakeModel());
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);

  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') assert.equal(outcome.chosen.code, 'C1');
});
