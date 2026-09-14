/**
 * D-099, 2026-09-14: the Cherry Coke Zero that came back as a plain Coke Zero.
 *
 * A cofounder photographed a Cherry Coke Zero 355 mL can on an iPhone and the
 * photo path named it "Coke Zero 355 ml". The barcode read in the same session
 * found the right row, so the catalogue had it all along. What happened is in
 * the two rows below, which are copied from the real catalogue and not invented
 * here: pass 1 builds "Coca-Cola Coke Zero Cherry" and the PLAIN row repeats
 * three of those four words, while the cherry row's English name says neither
 * "coke" nor "zero". The wrong can led, the band was confident, the lead was
 * clear, and pass 1 settled without ever asking for a second look.
 *
 * Every model here is fake. There is no API key on this machine, so what these
 * tests prove is that the guard fires and the pick pass is reached. Whether the
 * pick pass then chooses the cherry can from a real photograph is unmeasured,
 * and the shutter frame that produced the defect is on the cofounder's Mac.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IdentifyStage,
  variantForcesPick,
  type CatalogueCandidate,
  type CatalogueLookup,
  type CatalogueResult,
} from '../src/identify.ts';
import type {
  Identifier,
  IdentifiedFields,
  ModelReading,
  PickCandidateRow,
  PickFields,
} from '../src/model.ts';

type Query = Parameters<CatalogueLookup>[0];

function candidate(over: Partial<CatalogueCandidate> & { code: string }): CatalogueCandidate {
  return {
    name: 'Widget',
    brands: 'Acme',
    quantity: '355 ml',
    sizeValue: 355,
    sizeUnit: 'ml',
    categoryPath: [],
    allergens: [],
    signals: { similarity: 0.5, brandAgrees: true, sizeAgrees: true },
    ...over,
  };
}

/** The plain can, verbatim from catalogue/data/catalogue.db. */
const PLAIN = candidate({
  code: '06731906',
  name: 'Coke Zero',
  nameFr: null,
  genericName: null,
  brands: 'Coca-Cola',
  quantity: '355 ml',
  signals: { similarity: 0.9, brandAgrees: true, sizeAgrees: true },
});

/** The cherry can, verbatim. Its English name never says "coke" or "zero". */
const CHERRY = candidate({
  code: '06781901',
  name: 'Cherry-flavoured calorie-free cola',
  nameFr: 'Coca-cola cerise',
  genericName: null,
  brands: 'Coca-Cola',
  quantity: '355 mL',
  signals: { similarity: 0.82, brandAgrees: true, sizeAgrees: true },
});

/* -------------------------------------------------------------------------
 * The rule on its own, with no stage, no model and no catalogue.
 * ------------------------------------------------------------------------- */

test('no variant was read, so there is nothing to prefer and nothing changes', () => {
  assert.equal(variantForcesPick(null, [PLAIN, CHERRY]), false);
  assert.equal(variantForcesPick('', [PLAIN, CHERRY]), false);
  assert.equal(variantForcesPick('   ', [PLAIN, CHERRY]), false);
});

test('the leader already carries the variant, so pass one may still settle', () => {
  assert.equal(variantForcesPick('Cherry', [CHERRY, PLAIN]), false);
});

test('the leader lacks the variant and another candidate carries it: force the pick', () => {
  assert.equal(variantForcesPick('Cherry', [PLAIN, CHERRY]), true);
});

test('nobody carries the variant, so the second call would buy nothing', () => {
  const other = candidate({ code: 'C9', name: 'Coke Zero Vanilla', brands: 'Coca-Cola' });
  assert.equal(variantForcesPick('Cherry', [PLAIN, other]), false);
});

test('the variant is found in the French name, accents and casing aside', () => {
  // "Cerise" as the model would report it, "cerise" as the row spells it, and
  // the row spells it only in French. All three of those have to line up or
  // this candidate reads as carrying nothing.
  assert.equal(variantForcesPick('Cerise', [PLAIN, CHERRY]), true);
  assert.equal(variantForcesPick('cerise', [PLAIN, CHERRY]), true);
});

test('the variant is found in the generic name when that is the only place it is written', () => {
  const described = candidate({
    code: 'C8',
    name: 'Sparkling Water',
    genericName: 'Eau petillante saveur cerise',
  });
  const plainWater = candidate({ code: 'C7', name: 'Sparkling Water' });
  assert.equal(variantForcesPick('cerise', [plainWater, described]), true);
});

test('a multi-word variant needs every word, not any of them', () => {
  const partial = candidate({ code: 'C6', name: 'Coca-Cola Zero Sugar' });
  const whole = candidate({ code: 'C5', name: 'Coca-Cola Zero Sugar Cherry' });

  // The leader answers to two of the three words. That is the row the guard
  // exists to stop settling on, so a candidate carrying all three forces a pick.
  assert.equal(variantForcesPick('Zero Sugar Cherry', [partial, whole]), true);
  // And with only the two-word row in the list, nobody carries it.
  assert.equal(variantForcesPick('Zero Sugar Cherry', [PLAIN, partial]), false);
  // The leader carrying all three settles, whatever the others say.
  assert.equal(variantForcesPick('Zero Sugar Cherry', [whole, partial]), false);
});

test('a hyphenated or compounded printing still answers to the word', () => {
  // "Cherry-flavoured" is one token to a tokeniser and carries the variant to a
  // shopper, which is why the check is a substring one.
  assert.equal(variantForcesPick('Cherry', [PLAIN, CHERRY]), true);
});

test('an empty or single-candidate list has no other row to prefer', () => {
  assert.equal(variantForcesPick('Cherry', []), false);
  assert.equal(variantForcesPick('Cherry', [PLAIN]), false);
});

/* -------------------------------------------------------------------------
 * The rule inside the cascade.
 *
 * There is no photograph here and the eval manifest has no room for a row
 * without one (eval/run.ts marks a row whose file is missing PENDING and skips
 * it), so the D-099 case is carried as a cascade test instead.
 * ------------------------------------------------------------------------- */

function fields(over: Partial<IdentifiedFields> = {}): IdentifiedFields {
  return {
    front_text: ['Coca-Cola', 'Zero Sugar', 'Cherry', '355 mL'],
    barcode_digits: null,
    brand: 'Coca-Cola',
    name: 'Coke Zero',
    variant: 'Cherry',
    size_value: 355,
    size_unit: 'ml',
    count: null,
    category: null,
    language_seen: 'en',
    alternates: [],
    self_confidence: 'high',
    uncertainty: null,
    ...over,
  };
}

const REFUSED_PICK: PickFields = {
  chosen_index: null,
  confidence: 'low',
  why: 'no row matches the printed text',
  size_question: null,
};

/**
 * A model that never calls out, counting picks and keeping the rows it was
 * shown. "Did the second vision call happen, and what could it see" is the
 * whole assertion in this half of the file.
 */
function fakeModel(over: Partial<IdentifiedFields> = {}) {
  const model = {
    picks: 0,
    rows: [] as readonly PickCandidateRow[],
    read: async (): Promise<ModelReading> => ({
      product: fields(over),
      tag: null,
      model: 'test-model',
      ms: 1,
    }),
    pick: async (_png: Uint8Array, candidates: readonly PickCandidateRow[]) => {
      model.picks += 1;
      model.rows = candidates;
      return { pick: REFUSED_PICK, model: 'test-model', ms: 1 };
    },
  };
  return model as unknown as Identifier & {
    picks: number;
    rows: readonly PickCandidateRow[];
  };
}

/** The defect's own result: confident band, clear lead, wrong can in front. */
const D099_RESULT: CatalogueResult = {
  band: 'confident',
  candidates: [PLAIN, CHERRY],
  ring: null,
  matchedBy: 'hybrid',
};

test('D-099: a confident, clear-lead leader that lacks the read variant no longer settles', async () => {
  const model = fakeModel();
  const stage = new IdentifyStage(async () => D099_RESULT, model);
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(model.picks, 1, 'the pick pass must run: the leader does not say cherry and another row does');
  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') assert.equal(outcome.passes, 2);
});

test('with no variant read, the same result settles in one pass exactly as before', async () => {
  const model = fakeModel({ variant: null, front_text: ['Coca-Cola', 'Zero Sugar', '355 mL'] });
  const stage = new IdentifyStage(async () => D099_RESULT, model);
  const outcome = await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(model.picks, 0, 'nothing was read that the leader could be failing to carry');
  assert.equal(outcome.kind, 'identified');
  if (outcome.kind === 'identified') {
    assert.equal(outcome.passes, 1);
    assert.equal(outcome.chosen.code, PLAIN.code);
  }
});

test('the variant reaches the pick pass as a French name it could not see before', async () => {
  const model = fakeModel();
  const stage = new IdentifyStage(async () => D099_RESULT, model);
  await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  const cherryRow = model.rows.find((r) => r.code === CHERRY.code);
  assert.ok(cherryRow, 'the cherry row must be in the list the pick pass reads');
  assert.equal(cherryRow.nameFr, 'Coca-cola cerise');

  const plainRow = model.rows.find((r) => r.code === PLAIN.code);
  assert.ok(plainRow);
  assert.equal('nameFr' in plainRow, false, 'a row with no French name sends no empty key');
  assert.equal('genericName' in plainRow, false);
});

test('a French name that only repeats the English one is not sent twice', async () => {
  const twice = candidate({
    code: 'C4',
    name: 'Coke Zero',
    nameFr: 'coke zero',
    signals: { similarity: 0.82, brandAgrees: true, sizeAgrees: true },
  });
  const model = fakeModel();
  const stage = new IdentifyStage(
    async () => ({ band: 'confident', candidates: [PLAIN, twice, CHERRY], ring: null, matchedBy: 'hybrid' }),
    model,
  );
  await stage.fromCrop(new Uint8Array(), null, 'pro', 100);

  const row = model.rows.find((r) => r.code === 'C4');
  assert.ok(row);
  assert.equal('nameFr' in row, false, 'the same name in two keys is tokens for nothing');
});

test('the variant is pinned on the two queries that name a product and on neither the third', async () => {
  const queries: Query[] = [];
  const lookup = async (q: Query): Promise<CatalogueResult> => {
    queries.push(q);
    return { band: 'miss', candidates: [], ring: null, matchedBy: 'none' };
  };
  await new IdentifyStage(lookup, fakeModel()).fromCrop(new Uint8Array(), null, 'pro', 100);

  assert.equal(queries.length, 3, 'the cascade is still three queries');
  assert.equal(queries[0].variant, 'Cherry', 'q1 is the precise one and must carry it');
  assert.equal(queries[1].variant, 'Cherry', 'q2 unpins the size, not the flavour');
  assert.equal(queries[2].variant, undefined, 'q3 pins nothing at all, by design');
});
