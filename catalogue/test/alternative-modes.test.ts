/**
 * Item 18: two modes, an open set of constraints, a tolerant parser and a fallback.
 *
 * The distinction Jamin drew is the whole point, so most tests run one candidate
 * through BOTH modes and assert the two answers differ.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts } from '../src/schema.ts';
import { rebuildCategoriesFromPaths as rebuildCategories } from './helpers/path-taxonomy.ts';
import { alternativesFor, type PricedProduct } from '../src/alternatives.ts';
import type { Candidate } from '../src/search.ts';
import {
  UNKNOWN_SUBJECT,
  applyConstraints,
  constraints,
  evaluateConstraints,
  parseAlternativesAnswer,
  registerConstraint,
  resolveAlternatives,
  type AlternativeOffer,
  type AlternativeSubject,
} from '../src/alternative-modes.ts';
import { marketFromLocation } from '../src/market.ts';
import { toComparison } from '../src/units.ts';

const CA = marketFromLocation({ country: 'CA' });

const subject = (over: Partial<AlternativeSubject>): AlternativeSubject => ({ ...UNKNOWN_SUBJECT, ...over });

function offer(over: Partial<AlternativeOffer> & { name: string }): AlternativeOffer {
  return {
    brand: null, kind: 'substitute', storeName: null, storeType: 'unknown', condition: 'unknown',
    priceCents: 300, currency: 'CAD', size: null, membershipRequired: null, distanceKm: null,
    attributes: null, url: null, unitPriceCents: null, source: 'gemini', ...over,
  };
}

test('a supermarket shopper: a farm alternative is excluded when switching and kept as evidence when validating', () => {
  const original = subject({ storeType: 'supermarket' });
  const farm = subject({ storeType: 'farm' });
  const sw = evaluateConstraints({ mode: 'switching', original, candidate: farm, user: {} });
  const va = evaluateConstraints({ mode: 'validation', original, candidate: farm, user: {} });
  assert.equal(sw.allowed, false);
  assert.equal(sw.excludedBy[0].code, 'farm_for_store_shopper');
  assert.equal(va.allowed, true);
  assert.equal(va.labels[0].code, 'farm_price_is_evidence');
});

test('a farm buyer may take a supermarket option, in either mode', () => {
  for (const mode of ['switching', 'validation'] as const) {
    const r = evaluateConstraints({ mode, original: subject({ storeType: 'farm' }), candidate: subject({ storeType: 'supermarket' }), user: {} });
    assert.equal(r.allowed, true, mode);
    assert.equal(r.labels.length, 0, mode);
  }
});

test('a new purchase: a used listing is excluded when switching, and evidence only (outside the arithmetic) when validating', () => {
  const original = subject({ condition: 'new' });
  const used = subject({ condition: 'used' });
  assert.equal(evaluateConstraints({ mode: 'switching', original, candidate: used, user: {} }).allowed, false);
  const va = evaluateConstraints({ mode: 'validation', original, candidate: used, user: {} });
  assert.equal(va.allowed, true);
  assert.equal(va.evidenceOnly, true, 'a used price never enters the good/bad calculation for a new buyer');
  // Someone buying used may consider new.
  assert.equal(evaluateConstraints({ mode: 'switching', original: subject({ condition: 'used' }), candidate: subject({ condition: 'new' }), user: {} }).allowed, true);
});

test('bulk: a pack five times larger is not offered when switching and is marked when validating', () => {
  const small = subject({ size: toComparison(500, 'g') });
  const bulk = subject({ size: toComparison(5, 'kg') });
  assert.equal(evaluateConstraints({ mode: 'switching', original: small, candidate: bulk, user: {} }).allowed, false);
  const va = evaluateConstraints({ mode: 'validation', original: small, candidate: bulk, user: {} });
  assert.equal(va.allowed, true);
  assert.equal(va.labels[0].code, 'bulk_pack');
  // The size is compared after conversion: 1 kg against 500 g is only 2x, not bulk.
  assert.equal(evaluateConstraints({ mode: 'switching', original: small, candidate: subject({ size: toComparison(1, 'kg') }), user: {} }).allowed, true);
});

test('unknown is never a violation: no store type, condition or size means the candidate is allowed', () => {
  for (const mode of ['switching', 'validation'] as const) {
    const r = evaluateConstraints({ mode, original: UNKNOWN_SUBJECT, candidate: UNKNOWN_SUBJECT, user: {} });
    assert.equal(r.allowed, true);
    assert.equal(r.labels.length, 0);
  }
});

test('the constraint set is open: a registered constraint applies with no other code changing', () => {
  const before = constraints().length;
  registerConstraint({
    id: 'test_only_no_organic_swaps',
    origin: 'suggested',
    describes: 'test',
    evaluate: ({ candidate }) => (candidate.attributes?.includes('conventional') ? { effect: 'exclude', code: 'test_conventional' } : { effect: 'allow' }),
  });
  assert.equal(constraints().length, before + 1);
  const r = evaluateConstraints({ mode: 'switching', original: UNKNOWN_SUBJECT, candidate: subject({ attributes: ['conventional'] }), user: {} });
  assert.equal(r.allowed, false);
  assert.equal(r.excludedBy[0].constraint, 'test_only_no_organic_swaps');
});

test('a constraint that throws never crashes the answer; it is marked and skipped', () => {
  registerConstraint({ id: 'test_only_broken', origin: 'suggested', describes: 'test', evaluate: () => { throw new Error('boom'); } });
  const r = evaluateConstraints({ mode: 'switching', original: UNKNOWN_SUBJECT, candidate: UNKNOWN_SUBJECT, user: {} });
  assert.equal(r.allowed, true);
  assert.ok(r.labels.some((l) => l.constraint === 'test_only_broken' && l.code === 'constraint_failed'));
});

test('the suggested constraints are labelled as suggested and are at least two, beside Jamin\'s three', () => {
  const all = constraints();
  const jamin = all.filter((c) => c.origin === 'jamin').map((c) => c.id);
  const suggested = all.filter((c) => c.origin === 'suggested' && !c.id.startsWith('test_only'));
  assert.deepEqual(new Set(jamin), new Set(['bulk', 'channel', 'condition']));
  assert.ok(suggested.length >= 2, 'the notes say his examples are not the whole list');
});

test('suggested: travel and membership speak in switching, and travel is silent in validation', () => {
  const far = subject({ distanceKm: 80 });
  assert.equal(evaluateConstraints({ mode: 'switching', original: UNKNOWN_SUBJECT, candidate: far, user: { maxTravelKm: 20 } }).allowed, false);
  assert.equal(evaluateConstraints({ mode: 'validation', original: UNKNOWN_SUBJECT, candidate: far, user: { maxTravelKm: 20 } }).allowed, true);
  const club = subject({ membershipRequired: true });
  assert.equal(evaluateConstraints({ mode: 'switching', original: UNKNOWN_SUBJECT, candidate: club, user: { hasMembership: false } }).allowed, false);
  assert.equal(evaluateConstraints({ mode: 'switching', original: UNKNOWN_SUBJECT, candidate: club, user: { hasMembership: true } }).allowed, true);
});

test('suggested: a newer model that costs more is an upgrade when switching and is not evidence when validating', () => {
  const up = subject({ relation: 'newer_model' });
  assert.equal(evaluateConstraints({ mode: 'validation', original: UNKNOWN_SUBJECT, candidate: up, user: {} }).allowed, false);
  const sw = evaluateConstraints({ mode: 'switching', original: UNKNOWN_SUBJECT, candidate: up, user: {} });
  assert.equal(sw.allowed, true);
  assert.equal(sw.labels[0].code, 'upgrade_costs_more');
});

test('parser: repairs a string price, drops a row with no name or price, and never converts a foreign currency', () => {
  const raw = {
    alternatives: [
      { name: 'Store spinach', priceCents: '199', currency: 'cad', storeName: 'Loblaws', kind: 'substitute' },
      { priceCents: 100 },
      { name: 'No price' },
      { name: 'Farm spinach', price: 1.5, currency: 'CAD', storeType: 'farm' },
      { name: 'US spinach', priceCents: 99, currency: 'USD' },
      'garbage',
      null,
    ],
  };
  const { offers, dropped } = parseAlternativesAnswer(raw, CA);
  assert.deepEqual(offers.map((o) => [o.name, o.priceCents]), [['Store spinach', 199], ['Farm spinach', 150]]);
  assert.equal(offers[1].storeType, 'farm');
  assert.equal(dropped.length, 5);
  assert.ok(dropped.some((d) => /never converted/.test(d.reason)));
  assert.doesNotThrow(() => parseAlternativesAnswer(undefined, CA));
  assert.doesNotThrow(() => parseAlternativesAnswer('not json at all', CA));
});

test('parser: reads the snake_case shape the prompt fragment asks for', () => {
  const { offers } = parseAlternativesAnswer([
    { name: 'Used headphones', price_cents: 15000, currency: 'CAD', store_type: 'online_marketplace', condition: 'used', kind: 'used_copy', size: { value: 250, unit: 'g' } },
  ], CA);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].priceCents, 15000);
  assert.equal(offers[0].storeType, 'online_marketplace');
  assert.equal(offers[0].condition, 'used');
});

test('resolve: the mode changes the answer for the same Gemini list', async () => {
  const raw = [
    { name: 'Supermarket spinach', priceCents: 250, storeType: 'supermarket' },
    { name: 'Farm spinach', priceCents: 180, storeType: 'farm' },
  ];
  const original = subject({ storeType: 'supermarket' });
  const sw = await resolveAlternatives(raw, { mode: 'switching', original, market: CA });
  const va = await resolveAlternatives(raw, { mode: 'validation', original, market: CA });
  assert.deepEqual(sw.offers.map((o) => o.offer.name), ['Supermarket spinach']);
  assert.deepEqual(va.offers.map((o) => o.offer.name), ['Supermarket spinach', 'Farm spinach']);
  assert.equal(sw.excluded.length, 1);
  assert.equal(sw.source, 'gemini');
});

test('fallback: when Gemini gives nothing usable the catalogue list is used, marked not fully confident', async () => {
  const req = { mode: 'switching' as const, original: UNKNOWN_SUBJECT, market: CA };
  const viaCatalogue = await resolveAlternatives('not an array', req, async () => [offer({ name: 'From catalogue', source: 'catalogue' })]);
  assert.equal(viaCatalogue.source, 'catalogue_fallback');
  assert.equal(viaCatalogue.notFullyConfident, true);
  assert.equal(viaCatalogue.offers[0].offer.name, 'From catalogue');
  const nothing = await resolveAlternatives(null, req, async () => { throw new Error('catalogue down'); });
  assert.equal(nothing.source, 'none');
  assert.deepEqual(nothing.offers, []);
  assert.equal(nothing.notFullyConfident, true);
});

test('fallback: constraints apply to the catalogue list too', () => {
  const applied = applyConstraints(
    [offer({ name: 'Farm', storeType: 'farm', source: 'catalogue' })],
    { mode: 'switching', original: subject({ storeType: 'supermarket' }), market: CA },
  );
  assert.equal(applied.offers.length, 0);
  assert.equal(applied.excluded.length, 1);
});

// The catalogue's own alternatives run through the same constraints.

const PB = ['en:spreads', 'en:nut-butters', 'en:peanut-butters'];
function catalogueFixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const [code, size, unit] of [['A', 500, 'g'], ['BULK', 5, 'kg'], ['NORMAL', 450, 'g']] as const) {
    insert.run(code, code, code, size, unit, JSON.stringify(PB), 'en:peanut-butters', '[]', 1, 'openfoodfacts');
  }
  rebuildFts(db);
  rebuildCategories(db);
  return db;
}
const original: Candidate = {
  code: 'A', name: 'A', nameEn: null, nameFr: null, brands: null, quantity: null, sizeValue: 500, sizeUnit: 'g',
  leafCategory: 'en:peanut-butters', categoryPath: PB, allergens: [], soldInCanada: true, source: 'openfoodfacts',
  genericName: null, nutriscoreGrade: null, novaGroup: null, additivesN: null, ingredientsText: null,
  signals: { textRank: null, vectorRank: null, bm25: null, similarity: null, rrf: 0, brandAgrees: null, sizeAgrees: null },
};
const lookup = async (codes: readonly string[]) => {
  const m = new Map<string, PricedProduct>();
  for (const c of codes) {
    const amountCents = { BULK: 1500, NORMAL: 300 }[c as 'BULK' | 'NORMAL'];
    if (amountCents !== undefined) {
      m.set(c, { code: c, amountCents, seller: 'walmart.ca', observedAt: '2026-09-04', storeName: null, storeCity: null, joinMethod: 'name' });
    }
  }
  return m;
};

test('catalogue path: the bulk sack is a marked comparison when validating and is not offered when switching', async () => {
  const db = catalogueFixture();
  const ca = marketFromLocation({ country: 'CA' });
  const va = await alternativesFor(db, original, 800, lookup, { mode: 'validation', market: ca });
  const sw = await alternativesFor(db, original, 800, lookup, { mode: 'switching', market: ca });
  const bulkV = va.find((a) => a.product.code === 'BULK');
  assert.ok(bulkV, 'validation keeps the bulk pack');
  assert.equal(bulkV!.labels[0].code, 'bulk_pack');
  assert.equal(bulkV!.mode, 'validation');
  assert.ok(!sw.some((a) => a.product.code === 'BULK'), 'switching drops it');
  assert.ok(sw.some((a) => a.product.code === 'NORMAL'));
});
