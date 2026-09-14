/**
 * A barcode the catalogue knows is a product the engine knows, priced or not.
 *
 * Found 2026-09-14 on the founder's phone, twice in one minute. A Kirkland
 * Signature 500 mL water bottle: `/api/identify` named it by barcode, then
 * `/api/price` with that same barcode answered "Could not work out what this
 * is". Then a photo of the same bottle: the photo route picked catalogue row
 * 0055297000189 ("Water"), and the price call carrying that code refused the
 * same way. In both cases no price source held a row for the code, so no
 * source could identify it, and the engine reported a gap in its PRICES as a
 * failure to know what the person was holding.
 *
 * The fix is the plan's step "the catalogue tells the price engine what the
 * barcode is" (docs/plan-always-a-price.md): the server hands the engine a
 * barcode lookup, and a hit is an identity. With no prices behind it the
 * answer names the product and says nothing has a price for it yet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceIt } from '../src/spine.ts';
import type { ProductIdentity, Refusal, SpineQuery, Verdict } from '../src/contract.ts';
import { AS_OF, StubSource, identity, point } from './helpers.ts';

function asRefusal(r: Verdict | Refusal): Refusal {
  assert.equal(r.kind, 'refusal', `expected a refusal, got ${r.kind}`);
  return r as Refusal;
}

/** The two catalogue rows from the phone, as the server's lookup would name them. */
const ROWS: Record<string, ProductIdentity> = {
  '0096619321841': {
    id: 'catalogue:0096619321841',
    label: 'Kirkland Signature Natural spring water 500mL',
    brand: 'Kirkland Signature',
    category: 'grocery',
    gtin: '0096619321841',
    confidence: 1,
    resolvedBy: 'catalogue',
  },
  '0055297000189': {
    id: 'catalogue:0055297000189',
    label: 'Water',
    category: 'grocery',
    gtin: '0055297000189',
    confidence: 1,
    resolvedBy: 'catalogue',
  },
};

const catalogueIdentity = async (q: SpineQuery) => (q.gtin ? (ROWS[q.gtin] ?? null) : null);

test('a barcode only the catalogue knows names the product instead of "could not work out what this is"', async () => {
  // A source that is up and holds nothing for this code, which is the live state.
  const src = new StubSource(null, []);
  const r = asRefusal(
    await priceIt(
      {
        text: 'Kirkland Signature Natural spring water 500mL',
        gtin: '0096619321841',
        category: 'grocery',
        asOf: AS_OF,
      },
      { sources: [src], catalogueIdentity },
    ),
  );
  assert.notEqual(r.reason, 'no_identity');
  assert.equal(r.reason, 'no_source_response');
  assert.equal(r.identity?.gtin, '0096619321841');
  assert.equal(r.identity?.label, 'Kirkland Signature Natural spring water 500mL');
  assert.match(r.detail, /Kirkland Signature Natural spring water 500mL/);
  assert.doesNotMatch(r.detail, /Could not work out/);
});

test('the photo route\'s pick, priced with its code and the one word it read, names the product too', async () => {
  const src = new StubSource(null, []);
  const r = asRefusal(
    await priceIt(
      { text: 'Water', gtin: '0055297000189', category: 'grocery', askingCents: 200, asOf: AS_OF },
      { sources: [src], catalogueIdentity },
    ),
  );
  assert.equal(r.reason, 'no_source_response');
  assert.equal(r.identity?.label, 'Water');
  assert.equal(r.identity?.gtin, '0055297000189');
});

test('a price source that knows the code still outranks the catalogue', async () => {
  const known = { ...identity('grocery', 0.99, 'Kraft Dinner Original 225 g'), gtin: '0068100084245' };
  const src = new StubSource(known, [point('Walmart', 147)]);
  let asked = 0;
  const r = await priceIt(
    { gtin: '0068100084245', category: 'grocery', asOf: AS_OF },
    {
      sources: [src],
      catalogueIdentity: async () => {
        asked++;
        return null;
      },
    },
  );
  assert.equal(r.kind, 'refusal');
  assert.equal((r as Refusal).identity?.label, 'Kraft Dinner Original 225 g');
  assert.equal(asked, 0, 'the catalogue is only asked when no source recognised the product');
});

test('a code the catalogue does not have either still refuses as no identity', async () => {
  const src = new StubSource(null, []);
  const r = asRefusal(
    await priceIt(
      { gtin: '0000000000000', category: 'grocery', asOf: AS_OF },
      { sources: [src], catalogueIdentity },
    ),
  );
  assert.equal(r.reason, 'no_identity');
});

test('a catalogue lookup that throws is a miss, never a crash', async () => {
  const src = new StubSource(null, []);
  const r = asRefusal(
    await priceIt(
      { gtin: '0096619321841', category: 'grocery', asOf: AS_OF },
      {
        sources: [src],
        catalogueIdentity: async () => {
          throw new Error('catalogue file gone');
        },
      },
    ),
  );
  assert.equal(r.reason, 'no_identity');
});
