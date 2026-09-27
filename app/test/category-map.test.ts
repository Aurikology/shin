/**
 * `categoryFor()` (app/src/category-map.ts) had zero tests anywhere in the
 * repo before this file, per audit. It is reached only from typed-name search
 * in app/server.ts; the live barcode/photo scan path never calls it.
 *
 * Locks CURRENT behaviour first (produce and furniture regex priority, every
 * ICECAT_SECTIONS entry, each source's own mapping, case-insensitivity, empty
 * path and null leaf), then covers the audit-counted misses this session
 * fixed (household grocery items, webcams) with their own tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryFor, type CatalogueIdentity } from '../src/category-map.ts';

function identity(partial: Partial<CatalogueIdentity>): CatalogueIdentity {
  return {
    source: partial.source ?? 'unknown',
    categoryPath: partial.categoryPath ?? [],
    leafCategory: partial.leafCategory ?? null,
  };
}

/* ------------------------------- produce -------------------------------- */

test('a fresh- tag goes to produce, even inside openfoodfacts data', () => {
  const v = categoryFor(identity({ source: 'openfoodfacts', categoryPath: ['en:groceries', 'en:fresh-oranges'] }));
  assert.equal(v.category, 'produce');
});

test('en:fruits goes to produce, even inside openfoodfacts data', () => {
  const v = categoryFor(identity({ source: 'openfoodfacts', leafCategory: 'en:fruits' }));
  assert.equal(v.category, 'produce');
});

test('en:vegetables and en:legumes also go to produce', () => {
  assert.equal(categoryFor(identity({ source: 'openfoodfacts', leafCategory: 'en:vegetables' })).category, 'produce');
  assert.equal(categoryFor(identity({ source: 'openfoodfacts', leafCategory: 'en:legumes' })).category, 'produce');
});

test('produce is checked before the source switch even for a source that would otherwise map elsewhere', () => {
  // icecat's own domestic-appliances section maps to tech; a fresh- tag on the
  // same row must still win.
  const v = categoryFor(
    identity({ source: 'icecat', categoryPath: ['en:domestic-appliances'], leafCategory: 'en:fresh-herbs' }),
  );
  assert.equal(v.category, 'produce');
});

/* ------------------------------ furniture -------------------------------- */

test('furniture words are matched across the whole path, not only the leaf', () => {
  const v = categoryFor(identity({ source: 'openproductsfacts', categoryPath: ['en:home', 'en:chairs'], leafCategory: 'en:office-chair-model-x' }));
  assert.equal(v.category, 'furniture');
});

for (const word of ['furniture', 'chairs', 'tables', 'sofas', 'couches', 'beds', 'mattresses', 'desks', 'wardrobes', 'bookcases']) {
  test(`en:${word} maps to furniture`, () => {
    const v = categoryFor(identity({ source: 'openproductsfacts', leafCategory: `en:${word}` }));
    assert.equal(v.category, 'furniture');
  });
}

/* --------------------------- icecat sections ------------------------------ */

const ICECAT_TECH = ['en:computers-peripherals', 'en:telecom-navigation', 'en:pro-consumer-av-photo', 'en:domestic-appliances', 'en:entertainment-hobby'];
const ICECAT_GROCERY = ['en:health-beauty-personal-care', 'en:food-beverages-tobacco', 'en:pet-care'];

for (const section of ICECAT_TECH) {
  test(`icecat section ${section} maps to tech`, () => {
    const v = categoryFor(identity({ source: 'icecat', categoryPath: [section, 'en:some-leaf'] }));
    assert.equal(v.category, 'tech');
  });
}

for (const section of ICECAT_GROCERY) {
  test(`icecat section ${section} maps to grocery`, () => {
    const v = categoryFor(identity({ source: 'icecat', categoryPath: [section, 'en:some-leaf'] }));
    assert.equal(v.category, 'grocery');
  });
}

test('an icecat section absent from ICECAT_SECTIONS maps to null', () => {
  const v = categoryFor(identity({ source: 'icecat', categoryPath: ['en:toys-games', 'en:some-leaf'] }));
  assert.equal(v.category, null);
});

/* --------------------------------- sources -------------------------------- */

test('openfoodfacts maps to grocery', () => {
  const v = categoryFor(identity({ source: 'openfoodfacts', leafCategory: 'en:macaroni' }));
  assert.equal(v.category, 'grocery');
});

test('openpetfoodfacts maps to grocery', () => {
  const v = categoryFor(identity({ source: 'openpetfoodfacts', leafCategory: 'en:dog-food' }));
  assert.equal(v.category, 'grocery');
});

test('openbeautyfacts maps to grocery', () => {
  const v = categoryFor(identity({ source: 'openbeautyfacts', leafCategory: 'en:shampoo' }));
  assert.equal(v.category, 'grocery');
});

test('openproductsfacts under root en:electronics maps to tech', () => {
  const v = categoryFor(identity({ source: 'openproductsfacts', categoryPath: ['en:electronics', 'en:mice-trackballs'] }));
  assert.equal(v.category, 'tech');
});

test('openproductsfacts under any other root maps to null', () => {
  const v = categoryFor(identity({ source: 'openproductsfacts', categoryPath: ['en:toys'], leafCategory: 'en:action-figures' }));
  assert.equal(v.category, null);
});

test('an unknown source maps to null', () => {
  const v = categoryFor(identity({ source: 'some-other-database', leafCategory: 'en:widget' }));
  assert.equal(v.category, null);
});

/* ---------------------------- shape edge cases ----------------------------- */

test('an empty path and a null leaf are handled, not thrown', () => {
  const v = categoryFor(identity({ source: 'openfoodfacts', categoryPath: [], leafCategory: null }));
  assert.equal(v.category, 'grocery');
  const u = categoryFor(identity({ source: 'openproductsfacts', categoryPath: [], leafCategory: null }));
  assert.equal(u.category, null);
});

test('tags are matched case-insensitively', () => {
  assert.equal(categoryFor(identity({ source: 'openfoodfacts', leafCategory: 'EN:Fresh-Oranges' })).category, 'produce');
  assert.equal(categoryFor(identity({ source: 'openproductsfacts', leafCategory: 'EN:CHAIRS' })).category, 'furniture');
  assert.equal(categoryFor(identity({ source: 'icecat', categoryPath: ['EN:Computers-Peripherals'] })).category, 'tech');
  assert.equal(categoryFor(identity({ source: 'openproductsfacts', categoryPath: ['EN:ELECTRONICS'] })).category, 'tech');
});

/* --------------------- audit-counted misses, fixed this session --------------------- */

test('en:Dish soap (as stored, mixed case) maps to grocery, like pet food and cosmetics', () => {
  const v = categoryFor(identity({ source: 'openproductsfacts', leafCategory: 'en:Dish soap' }));
  assert.equal(v.category, 'grocery');
});

test('en:detergents maps to grocery', () => {
  const v = categoryFor(identity({ source: 'openproductsfacts', leafCategory: 'en:detergents' }));
  assert.equal(v.category, 'grocery');
});

test('en:cat-litter maps to grocery', () => {
  const v = categoryFor(identity({ source: 'openproductsfacts', leafCategory: 'en:cat-litter' }));
  assert.equal(v.category, 'grocery');
});

test('en:webcams maps to tech', () => {
  const v = categoryFor(identity({ source: 'openproductsfacts', leafCategory: 'en:webcams' }));
  assert.equal(v.category, 'tech');
});

test('en:webcams maps to tech even under an icecat section not in ICECAT_SECTIONS', () => {
  const v = categoryFor(identity({ source: 'icecat', categoryPath: ['en:toys-games'], leafCategory: 'en:webcams' }));
  assert.equal(v.category, 'tech');
});

/* ------------ left null on purpose: no rule written, and none invented ------------- */

for (const tag of ['en:tools', 'en:t-shirts', 'en:shoes', 'en:books', 'en:publications', 'en:cigarettes', 'en:medicine-drugs']) {
  test(`${tag} stays null: no rule is written for it`, () => {
    const v = categoryFor(identity({ source: 'openproductsfacts', leafCategory: tag }));
    assert.equal(v.category, null);
  });
}
