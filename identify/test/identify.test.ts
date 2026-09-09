/**
 * Tests for decision 17, the one that was still being violated, and for the
 * two-pass photo path added 2026-09-09.
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
 *
 * The second half of this file covers docs/the-photo-path.md section 2: the
 * barcode read off the pack, the three-query cascade, and the pick pass. Every
 * model here is fake. There is no API key on this machine and there never was
 * one while this path was built, which is itself the largest gap in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IdentifyStage,
  type CatalogueCandidate,
  type CatalogueLookup,
  type CatalogueResult,
} from '../src/identify.ts';
import type { Identifier, IdentifiedFields, ModelReading, PickFields } from '../src/model.ts';

type Query = Parameters<CatalogueLookup>[0];

function fields(over: Partial<IdentifiedFields> = {}): IdentifiedFields {
  return {
    front_text: ['Acme', 'Widget', '500 g'],
    barcode_digits: null,
    brand: 'Acme',
    name: 'Widget',
    variant: null,
    size_value: 500,
    size_unit: 'g',
    count: null,
    category: null,
    language_seen: 'en',
    alternates: [],
    self_confidence: 'medium',
    uncertainty: null,
    ...over,
  };
}

function reading(over: Partial<IdentifiedFields> = {}): ModelReading {
  return { product: fields(over), tag: null, model: 'test-model', ms: 1 };
}

function candidate(
  code: string,
  similarity: number | null,
  over: Partial<CatalogueCandidate> = {},
): CatalogueCandidate {
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
    ...over,
  };
}

const NO_PICK: PickFields = {
  chosen_index: null,
  confidence: 'low',
  why: 'nothing on the pack matches any of these rows',
  size_question: null,
};

/**
 * A model that never actually calls out, so no API key is needed in a test.
 *
 * It now answers both passes, and counts the pick calls, because "did the
 * second vision call happen" is the assertion half these tests are making.
 */
function fakeModel(
  over: Partial<IdentifiedFields> = {},
  pick: PickFields | Error = NO_PICK,
): Identifier & { picks: number } {
  const model = {
    picks: 0,
    read: async () => reading(over),
    pick: async () => {
      model.picks += 1;
      if (pick instanceof Error) throw pick;
      return { pick, model: 'claude-sonnet-5', ms: 1 };
    },
  };
  return model as unknown as Identifier & { picks: number };
}

/** A lookup that records every query it was asked, in order. */
function recordingLookup(answer: (q: Query, n: number) => CatalogueResult) {
  const queries: Query[] = [];
  const lookup = async (q: Query): Promise<CatalogueResult> => {
    const n = queries.length;
    queries.push(q);
    return answer(q, n);
  };
  return { lookup, queries };
}

test('a weak band with a candidate still commits to it, not a refusal (the pick now also refuses, and it is still an answer)', async () => {
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

/* -------------------------------------------------------------------------
 * The photo path, 2026-09-09.
 * ------------------------------------------------------------------------- */

test('digits read off the pack that pass the check digit go straight to the catalogue by code', async () => {
  const { lookup, queries } = recordingLookup(() => ({
    band: 'confident',
    candidates: [candidate('C1', null)],
    ring: null,
    matchedBy: 'gtin',
  }));
  const stage = new IdentifyStage(lookup, fakeModel({ barcode_digits: '0 36000 29145 2' }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(queries.length, 1, 'a fact beats an opinion: the text cascade must not run');
  assert.equal(queries[0].gtin, '036000291452', 'the printed separators are not part of the number');
  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.confidence.band, 'high', 'a resolved barcode is answered, not scored');
    assert.equal(outcome.passes, 1);
    assert.equal(
      outcome.reading?.barcodeFromPhoto,
      '036000291452',
      'the log has to be able to tell a photo-read code from a scanned one',
    );
  }
});

test('digits that fail the check digit are not believed and the cascade runs instead', async () => {
  const { lookup, queries } = recordingLookup(() => ({
    band: 'confident',
    candidates: [candidate('C1', 0.9)],
    ring: null,
    matchedBy: 'hybrid',
  }));
  const stage = new IdentifyStage(lookup, fakeModel({ barcode_digits: '4006381333932' }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.ok(queries.every((q) => q.gtin === undefined), 'a failing number must never reach the lookup');
  assert.ok(queries.length >= 2, 'the text cascade runs in its place');
  assert.equal(outcome.kind, 'identified');
});

test('a legible barcode that the catalogue does not carry falls through to the text cascade', async () => {
  const { lookup, queries } = recordingLookup((q) =>
    q.gtin
      ? { band: 'miss', candidates: [], ring: null, matchedBy: 'none' }
      : { band: 'confident', candidates: [candidate('C1', 0.9)], ring: null, matchedBy: 'hybrid' },
  );
  const stage = new IdentifyStage(lookup, fakeModel({ barcode_digits: '036000291452' }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(queries[0].gtin, '036000291452');
  assert.ok(queries.length >= 3, 'a miss on the code is not a miss on the product');
  assert.equal(outcome.kind, 'identified');
});

test('the cascade issues three queries with the pinning each one is for, and dedupes the union', async () => {
  const { lookup, queries } = recordingLookup((_q, n) => {
    if (n === 0) {
      return { band: 'miss', candidates: [candidate('A', 0.5)], ring: null, matchedBy: 'hybrid' };
    }
    if (n === 1) {
      return {
        band: 'ambiguous',
        // The same row again, better scored, but with the size never compared
        // because q2 does not pin one.
        candidates: [candidate('A', 0.8, { signals: { similarity: 0.8, brandAgrees: true, sizeAgrees: null } })],
        ring: null,
        matchedBy: 'hybrid',
      };
    }
    return { band: 'miss', candidates: [candidate('B', 0.4)], ring: null, matchedBy: 'hybrid' };
  });

  const stage = new IdentifyStage(lookup, fakeModel({ variant: 'Smooth' }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(queries.length, 3);

  assert.equal(queries[0].text, 'Acme Widget Smooth');
  assert.equal(queries[0].brand, 'Acme', 'q1 pins the brand');
  assert.equal(queries[0].sizeValue, 500, 'q1 pins the size');
  assert.equal(queries[0].limit, 10);

  assert.equal(queries[1].text, 'Acme Widget');
  assert.equal(queries[1].brand, 'Acme', 'q2 pins the brand');
  assert.equal(queries[1].sizeValue, undefined, 'q2 unpins the size so the siblings come back');

  assert.match(queries[2].text ?? '', /^Widget Acme Widget 500 g$/, 'q3 runs on the transcription');
  assert.equal(queries[2].brand, undefined, 'q3 pins nothing, so a misread brand cannot exclude the answer');

  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    const all = [outcome.chosen, ...outcome.alternates];
    assert.equal(all.length, 2, 'the row seen twice is one row');
    const a = all.find((c) => c.code === 'A');
    assert.equal(a?.signals.similarity, 0.8, 'the best similarity survives the merge');
    assert.equal(a?.signals.sizeAgrees, true, 'a signal established by q1 is not erased by q2 not asking');
  }
});

test('a query with nothing to say is not sent', async () => {
  const { lookup, queries } = recordingLookup(() => ({
    band: 'miss',
    candidates: [candidate('C1', 0.4)],
    ring: null,
    matchedBy: 'hybrid',
  }));
  // No brand, no name and nothing transcribed: only the variant word survives,
  // so q2 (brand + name) and q3 (name + front text) have nothing to ask.
  const stage = new IdentifyStage(
    lookup,
    fakeModel({ brand: null, name: null, variant: 'Smooth', front_text: [] }),
  );
  await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(queries.length, 1, 'an empty query is a wasted round trip, not a wider net');
  assert.equal(queries[0].text, 'Smooth');
  assert.equal(queries[0].brand, undefined);
});

test('pass one settling it means the second vision call is never made', async () => {
  const result: CatalogueResult = {
    band: 'confident',
    candidates: [candidate('C1', 0.9), candidate('C2', 0.4)],
    ring: null,
    matchedBy: 'hybrid',
  };
  const model = fakeModel();
  const stage = new IdentifyStage(async () => result, model);
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(model.picks, 0, 'a confident band with a clear lead has nothing left to decide');
  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.passes, 1);
    assert.equal(outcome.chosen.code, 'C1');
  }
});

/** Confident band, hairline lead: the exact case the pick pass was added for. */
function nearIdentical(): CatalogueResult {
  return {
    band: 'confident',
    candidates: [candidate('C1', 0.98), candidate('C2', 0.96, { quantity: '250 g', sizeValue: 250 })],
    ring: null,
    matchedBy: 'hybrid',
  };
}

test('the pick chooses a row and the answer becomes that row', async () => {
  const model = fakeModel({}, {
    chosen_index: 1,
    confidence: 'high',
    why: 'the pack reads 250 g',
    size_question: null,
  });
  const stage = new IdentifyStage(async () => nearIdentical(), model);
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(model.picks, 1, 'a confident band with a 0.02 lead has not settled anything');
  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.chosen.code, 'C2');
    assert.equal(outcome.passes, 2);
    assert.equal(outcome.pick?.why, 'the pack reads 250 g');
    assert.equal(outcome.alternates.length, 1);
    assert.equal(outcome.alternates[0].code, 'C1', 'the row the pick passed over is still an alternate');
  }
});

test('a hesitant pick caps the six-signal score instead of replacing it', async () => {
  const sure = fakeModel({}, { chosen_index: 0, confidence: 'high', why: 'clear', size_question: null });
  const unsure = fakeModel({}, { chosen_index: 0, confidence: 'medium', why: 'close', size_question: null });

  const a = await new IdentifyStage(async () => nearIdentical(), sure).fromCrop(
    new Uint8Array(), null, 'pro', 100,
  );
  const b = await new IdentifyStage(async () => nearIdentical(), unsure).fromCrop(
    new Uint8Array(), null, 'pro', 100,
  );

  assert.equal(a.kind, 'identified');
  assert.equal(b.kind, 'identified');
  if (a.kind === 'identified' && b.kind === 'identified') {
    assert.ok(a.confidence.score > b.confidence.score, 'a hesitant pick has to cost something');
    assert.ok(b.confidence.score <= 0.75, 'medium caps at 0.75');
    assert.match(b.confidence.because, /matched the print/, 'the capped case names its own limit');
  }
});

test('a pick that refuses is still an answer: the top row, a low band, and the rest as alternates', async () => {
  const model = fakeModel({}, NO_PICK);
  const stage = new IdentifyStage(async () => nearIdentical(), model);
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(outcome.kind, 'identified', 'priority 1: never tell the person we do not know');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.confidence.band, 'low', 'the route reads low + alternates as identity_unsure');
    assert.ok(outcome.alternates.length > 0, 'unsure without candidates is not unsure, it is a refusal');
    assert.equal(outcome.passes, 2);
  }
});

test('two rows that are the same product in different sizes become a question, not a guess', async () => {
  const model = fakeModel({ size_value: null }, {
    chosen_index: null,
    confidence: 'medium',
    why: 'the net quantity is not legible from this angle',
    size_question: [0, 1],
  });
  const stage = new IdentifyStage(async () => nearIdentical(), model);
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.sizeQuestion?.options.length, 2, 'decision 19: ask, do not guess');
    assert.deepEqual(outcome.sizeQuestion?.options.map((o) => o.code), ['C1', 'C2']);
    assert.equal(outcome.passes, 2);
  }
});

test('a pick that fails on the wire loses the improvement, never the scan', async () => {
  const model = fakeModel({}, new Error('the pick timed out'));
  const stage = new IdentifyStage(async () => nearIdentical(), model);
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.passes, 1, 'the answer that shipped is pass one and says so');
    assert.equal(outcome.chosen.code, 'C1');
  }
});

test('the words the model answers in become the number the confidence expects', async () => {
  const result: CatalogueResult = {
    band: 'confident',
    candidates: [candidate('C1', 0.9)],
    ring: null,
    matchedBy: 'hybrid',
  };
  const high = await new IdentifyStage(async () => result, fakeModel({ self_confidence: 'high' })).fromCrop(
    new Uint8Array(), null, 'pro', 100,
  );
  const low = await new IdentifyStage(async () => result, fakeModel({ self_confidence: 'low' })).fromCrop(
    new Uint8Array(), null, 'pro', 100,
  );

  assert.equal(high.kind, 'identified');
  assert.equal(low.kind, 'identified');
  if (high.kind === 'identified' && low.kind === 'identified') {
    assert.equal(high.confidence.signals.selfConfidence, 0.9);
    assert.equal(low.confidence.signals.selfConfidence, 0.3);
    assert.ok(
      high.confidence.score - low.confidence.score < 0.1,
      'decision 18: the self-report is one voice in six and moves the score barely at all',
    );
  }
});

test('the union puts the size the label showed above its sibling, whatever the similarities say (D-082)', async () => {
  /*
   * D-082. The reading is exact -- Cadbury Mini Eggs, 151 g -- and the row was
   * still lost. Two things had to hold for that: the catalogue's q1 must lift
   * the row whose size agrees (fixed in catalogue/src/search.ts), and this
   * union must not then sort it back down, which it did, because it ordered on
   * similarity alone and similarity knows nothing about the pin.
   *
   * Here q1 returns both siblings with the 151 g row scoring LOWER on cosine,
   * which is the ordinary case for two listings whose names are identical.
   * q2 unpins the size and returns them with no size signal at all, and the
   * union's dedupe keeps the established `true` and the established `false`.
   */
  const want = candidate('0061200018585', 0.71, {
    name: 'Mini Eggs',
    brands: 'Cadbury',
    quantity: '151 g',
    sizeValue: 151,
    sizeUnit: 'g',
    signals: { similarity: 0.71, brandAgrees: true, sizeAgrees: true },
  });
  const sibling = candidate('0061200016741', 0.93, {
    name: 'Mini Eggs',
    brands: 'Cadbury',
    quantity: '90 g',
    sizeValue: 90,
    sizeUnit: 'g',
    signals: { similarity: 0.93, brandAgrees: true, sizeAgrees: false },
  });
  const unpinned = (c: CatalogueCandidate): CatalogueCandidate => ({
    ...c,
    signals: { ...c.signals, sizeAgrees: null },
  });

  const { lookup, queries } = recordingLookup((q) => ({
    band: 'ambiguous',
    // q1 is the only query carrying the size pin.
    candidates: q.sizeValue ? [sibling, want] : [unpinned(sibling), unpinned(want)],
    ring: null,
    matchedBy: 'hybrid',
  }));

  const stage = new IdentifyStage(
    lookup,
    fakeModel({ brand: 'Cadbury', name: 'Mini Eggs', size_value: 151, size_unit: 'g' }),
  );
  const out = await stage.fromCrop(new Uint8Array([1]), null, 'pro', 100);

  assert.ok(queries.some((q) => q.sizeValue === 151), 'q1 never pinned the size');
  assert.equal(out.kind, 'identified');
  if (out.kind !== 'identified') return;
  assert.equal(out.chosen.code, '0061200018585', 'the sibling with the wrong size led the union');
  // The general rule: brand AND size never below brand alone.
  const ranked = [out.chosen, ...out.alternates];
  const both = ranked.findIndex((c) => c.signals.brandAgrees === true && c.signals.sizeAgrees === true);
  const brandOnly = ranked.findIndex((c) => c.signals.brandAgrees === true && c.signals.sizeAgrees !== true);
  assert.ok(both !== -1 && (brandOnly === -1 || both < brandOnly), 'a brand-and-size row sorted below a brand-only row');
});

/*
 * D-082's "found and not fixed here": the catalogue stores a multipack's net
 * quantity (Danone Danette "4 x 100 g" is listed as 400 g), while the reading
 * off the label is per-unit size plus a count. Pinning the unit reading
 * against a net-quantity catalogue pins the wrong number. The `reading` the
 * outcome carries stays exactly what the model said -- these assert q1's
 * pinned size only.
 */
test('a multipack reading pins the net (size_value * count), not the unit size, and the reading is untouched', async () => {
  const { lookup, queries } = recordingLookup(() => ({
    band: 'miss',
    candidates: [candidate('A', 0.5)],
    ring: null,
    matchedBy: 'hybrid',
  }));

  const stage = new IdentifyStage(
    lookup,
    fakeModel({ brand: 'Danone', name: 'Danette', size_value: 100, size_unit: 'g', count: 4 }),
  );
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(queries[0].sizeValue, 400, 'q1 pins the net (100 g x 4), not the 100 g unit reading');
  assert.equal(queries[0].sizeUnit, 'g');

  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.reading?.product.size_value, 100, 'the reading itself keeps the unit size the model read');
    assert.equal(outcome.reading?.product.count, 4);
  }
});

test('a 12 ea reading pins count as the size when the label gave no size of its own', async () => {
  const { lookup, queries } = recordingLookup(() => ({
    band: 'miss',
    candidates: [candidate('A', 0.5)],
    ring: null,
    matchedBy: 'hybrid',
  }));

  const stage = new IdentifyStage(
    lookup,
    fakeModel({ brand: 'Acme', name: 'Widget', size_value: null, size_unit: 'ea', count: 12 }),
  );
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(queries[0].sizeValue, 12, 'a 12-pack is 12 ea, so count stands in for the missing size');
  assert.equal(queries[0].sizeUnit, 'ea');

  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.reading?.product.size_value, null, 'the reading itself is untouched');
    assert.equal(outcome.reading?.product.count, 12);
  }
});
