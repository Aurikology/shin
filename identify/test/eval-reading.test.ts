/**
 * Tests for `captureOf`/`observationOf` (`run.ts`): the reading capture that
 * feeds `language.ts`'s classifier.
 *
 * NOTE ON LOCATION, same as `language.test.ts`: this lives in `identify/eval/`
 * because the lane that wrote it may only write there, and
 * `identify/package.json`'s `test` script (`node --test "test/*.test.ts"`)
 * does not glob this directory, only `identify/test/`. `npm run typecheck`
 * DOES cover it (`eval/**\/*.ts` is in `tsconfig.json`'s `include`). Run with:
 *   node --test eval/reading.test.ts
 * from `identify/`.
 *
 * NO LIVE MODEL CALL IS MADE ANYWHERE IN THIS FILE. Every `Identifier` below
 * is a fake, exactly like `identify/test/identify.test.ts`'s own fixtures --
 * this proves the capture logic on outcomes `IdentifyStage` genuinely
 * produces, not on hand-typed `IdentifyOutcome` literals that could silently
 * drift from what `fromBarcode`/`fromCrop` actually return.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IdentifyStage,
  type CatalogueCandidate,
  type CatalogueLookup,
  type CatalogueResult,
} from '../src/identify.ts';
import type { Identifier, IdentifiedFields, ModelReading, PickFields } from '../src/model.ts';

import { captureOf, newProbe, observationOf, probingLookup, type ManifestRow } from '../eval/run.ts';

// ---------------------------------------------------------------- fixtures
// (mirrors identify/test/identify.test.ts's own helpers, so the outcomes
// tested here are the same shapes that file already trusts)

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
  return { product: fields(over), tag: null, model: 'test-model', ms: 42 };
}

function candidate(code: string, similarity: number | null, over: Partial<CatalogueCandidate> = {}): CatalogueCandidate {
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

function fakeModel(over: Partial<IdentifiedFields> = {}, pick: PickFields | Error = NO_PICK): Identifier {
  return {
    read: async () => reading(over),
    pick: async () => {
      if (pick instanceof Error) throw pick;
      return { pick, model: 'claude-sonnet-5', ms: 1 };
    },
  } as unknown as Identifier;
}

function throwingModel(err: Error): Identifier {
  return {
    read: async () => {
      throw err;
    },
    pick: async () => {
      throw err;
    },
  } as unknown as Identifier;
}

const VALID_GTIN = '036000291452';

// ---------------------------------------------------------------- captureOf

test('barcode short-circuit (fromBarcode, resolves): not_attempted -- no model was ever called', async () => {
  const lookup: CatalogueLookup = async () => ({
    band: 'confident',
    candidates: [candidate('C1', 1)],
    ring: null,
    matchedBy: 'gtin',
  });
  const stage = new IdentifyStage(lookup, fakeModel());
  const outcome = await stage.fromBarcode(VALID_GTIN, 'basic');
  assert.equal(outcome.kind, 'identified');

  const cap = captureOf(outcome);
  assert.equal(cap.captureStatus, 'not_attempted');
  assert.equal(cap.reading, null);
});

test('barcode short-circuit (fromBarcode, catalogue miss): also not_attempted, not "captured empty"', async () => {
  const lookup: CatalogueLookup = async () => ({ band: 'miss', candidates: [], ring: null, matchedBy: 'none' });
  const stage = new IdentifyStage(lookup, fakeModel());
  const outcome = await stage.fromBarcode(VALID_GTIN, 'basic');
  assert.equal(outcome.kind, 'not_in_catalogue');

  const cap = captureOf(outcome);
  assert.equal(cap.captureStatus, 'not_attempted');
  assert.equal(cap.reading, null);
});

test('a model call that throws (fromCrop): call_failed -- an attempt was made and produced nothing', async () => {
  const lookup: CatalogueLookup = async () => ({ band: 'miss', candidates: [], ring: null, matchedBy: 'none' });
  const stage = new IdentifyStage(lookup, throwingModel(new Error('rate limited')));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);
  assert.equal(outcome.kind, 'unreadable');

  const cap = captureOf(outcome);
  assert.equal(cap.captureStatus, 'call_failed');
  assert.equal(cap.reading, null);
});

test('the model answers with nothing on the label: captured, with an empty readAs -- not the same as call_failed', async () => {
  const lookup: CatalogueLookup = async () => ({ band: 'miss', candidates: [], ring: null, matchedBy: 'none' });
  const stage = new IdentifyStage(
    lookup,
    fakeModel({ brand: null, name: null, variant: null, front_text: [], uncertainty: 'too dark' }),
  );
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);
  assert.equal(outcome.kind, 'unreadable');
  if (outcome.kind === 'unreadable') assert.equal(outcome.failure, 'unreadable_photo');

  const cap = captureOf(outcome);
  assert.equal(cap.captureStatus, 'captured');
  assert.ok(cap.reading);
  assert.equal(cap.reading?.readAs, '');
});

test('a normal identified crop: captured, readAs is brand+name+variant joined exactly as identify.ts builds it', async () => {
  const lookup: CatalogueLookup = async () => ({
    band: 'confident',
    candidates: [candidate('C1', 0.9)],
    ring: null,
    matchedBy: 'hybrid',
  });
  const stage = new IdentifyStage(lookup, fakeModel({ brand: 'Acme', name: 'Widget', variant: 'Blue' }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);
  assert.equal(outcome.kind, 'identified');

  const cap = captureOf(outcome);
  assert.equal(cap.captureStatus, 'captured');
  assert.equal(cap.reading?.readAs, 'Acme Widget Blue');
  assert.equal(cap.reading?.brand, 'Acme');
  assert.equal(cap.reading?.name, 'Widget');
  assert.equal(cap.reading?.variant, 'Blue');
  assert.equal(cap.reading?.languageSeen, 'en');
  assert.equal(cap.reading?.model, 'test-model');
  assert.equal(cap.reading?.barcodeFromPhoto, null);
});

test('cascade miss (crop path, no barcode): captured -- a call happened even though nothing was found', async () => {
  const lookup: CatalogueLookup = async () => ({ band: 'miss', candidates: [], ring: null, matchedBy: 'none' });
  const stage = new IdentifyStage(lookup, fakeModel({ brand: 'Acme', name: 'Nonexistent Widget' }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);
  assert.equal(outcome.kind, 'not_in_catalogue');

  const cap = captureOf(outcome);
  assert.equal(cap.captureStatus, 'captured');
  assert.equal(cap.reading?.readAs, 'Acme Nonexistent Widget');
});

test('a barcode read off the photo (not scanned): captured, and barcodeFromPhoto carries the code', async () => {
  const lookup: CatalogueLookup = async (q) =>
    q.gtin
      ? { band: 'confident', candidates: [candidate('C1', 1)], ring: null, matchedBy: 'gtin' }
      : { band: 'miss', candidates: [], ring: null, matchedBy: 'none' };
  const stage = new IdentifyStage(lookup, fakeModel({ barcode_digits: VALID_GTIN }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);
  assert.equal(outcome.kind, 'identified');

  const cap = captureOf(outcome);
  assert.equal(cap.captureStatus, 'captured');
  assert.equal(cap.reading?.barcodeFromPhoto, VALID_GTIN);
});

/*
 * THE PIN THE LANE CONTRACT ASKS FOR BY NAME: "not captured" and "the model
 * returned nothing" must stay two different facts. Collected here as one
 * assertion over all the outcomes above, so a future change that collapses
 * them back into a shared `null` fails loudly in one place.
 */
test('PIN: not_attempted, call_failed and captured-but-empty are three distinct captureStatus values', async () => {
  const missLookup: CatalogueLookup = async () => ({ band: 'miss', candidates: [], ring: null, matchedBy: 'none' });

  const notAttempted = captureOf(await new IdentifyStage(missLookup, fakeModel()).fromBarcode(VALID_GTIN, 'basic'));
  const callFailed = captureOf(
    await new IdentifyStage(missLookup, throwingModel(new Error('outage'))).fromCrop(
      new Uint8Array(),
      null,
      'basic',
      100,
    ),
  );
  const capturedEmpty = captureOf(
    await new IdentifyStage(
      missLookup,
      fakeModel({ brand: null, name: null, variant: null, front_text: [] }),
    ).fromCrop(new Uint8Array(), null, 'basic', 100),
  );

  assert.equal(notAttempted.captureStatus, 'not_attempted');
  assert.equal(callFailed.captureStatus, 'call_failed');
  assert.equal(capturedEmpty.captureStatus, 'captured');

  // Distinct statuses...
  const statuses = new Set([notAttempted.captureStatus, callFailed.captureStatus, capturedEmpty.captureStatus]);
  assert.equal(statuses.size, 3);
  // ...and `reading` follows: null for the two non-captures, an object (with
  // an empty readAs) for the one that genuinely captured nothing to say.
  assert.equal(notAttempted.reading, null);
  assert.equal(callFailed.reading, null);
  assert.notEqual(capturedEmpty.reading, null);
  assert.equal(capturedEmpty.reading?.readAs, '');
});

// ---------------------------------------------------------------- observationOf carries it through

function manifestRow(over: Partial<ManifestRow> = {}): ManifestRow {
  return {
    code: 'C1',
    file: 'photos/does-not-matter.jpg',
    brand: 'Acme',
    name: 'Widget',
    size: '500 g',
    kind: 'plain',
    expect: 'identify',
    category: null,
    ...over,
  };
}

test('observationOf spreads captureStatus/reading onto the StageObservation it builds', async () => {
  let probe = newProbe();
  const inner: CatalogueLookup = async () => ({
    band: 'confident',
    candidates: [candidate('C1', 0.9)],
    ring: null,
    matchedBy: 'hybrid',
  });
  const watched = probingLookup(inner, () => probe);
  const stage = new IdentifyStage(watched, fakeModel({ brand: 'Acme', name: 'Widget', variant: 'Blue' }));
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'basic', 100);

  const obs = observationOf(manifestRow(), outcome, probe);
  assert.ok(obs);
  assert.equal(obs?.captureStatus, 'captured');
  assert.equal(obs?.reading?.readAs, 'Acme Widget Blue');
});

test('observationOf on a barcode short-circuit reports not_attempted with a null reading', async () => {
  const probe = newProbe();
  probe.gtinHits = 1; // what a real barcode short-circuit records
  const stage = new IdentifyStage(async () => ({ band: 'confident', candidates: [candidate('C1', 1)], ring: null, matchedBy: 'gtin' }), fakeModel());
  const outcome = await stage.fromBarcode(VALID_GTIN, 'basic');

  const obs = observationOf(manifestRow(), outcome, probe);
  assert.ok(obs);
  assert.equal(obs?.captureStatus, 'not_attempted');
  assert.equal(obs?.reading, null);
});
