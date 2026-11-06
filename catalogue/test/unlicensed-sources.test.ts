/**
 * Decision 2026-11-05: Pexi must hold the rights to everything it shows. Return-It and Consignaction
 * grant no reuse licence, so no read path may return one of their rows: not a barcode lookup, not a
 * word search, not a vector search, not a neighbour ring, not a brand lookup, not an offline pack.
 * Rows are never deleted: the proof is that they are in the database and still do not come out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, toVecBlob, EMBED_DIM } from '../src/schema.ts';
import { rebuildCategoriesFromPaths as rebuildCategories } from './helpers/path-taxonomy.ts';
import { Catalogue } from '../src/search.ts';
import { brandLookupFromDb } from '../src/text-match.ts';
import { alternativesFor } from '../src/alternatives.ts';
import type { Embedder } from '../src/embed.ts';
import { UNLICENSED_SOURCES, NEVER_SENT_TO_A_MODEL_SOURCES, isUnlicensedSource, licensedOnlySql } from '../src/source-rights.ts';

class SameVector implements Embedder {
  readonly id = 'test:same';
  readonly dim = EMBED_DIM;
  async embedPassages(texts: string[]) {
    return texts.map(() => this.#v());
  }
  async embedQuery() {
    return this.#v();
  }
  #v() {
    const v = new Float32Array(this.dim);
    v[0] = 1;
    return v;
  }
}

const PATH = ['en:beverages', 'en:sodas'];
const ROWS: [string, string, string, string][] = [
  // code, name, brand, source
  ['1000000000011', 'Zorbix Fizz Cola', 'Zorbix', 'returnit'],
  ['1000000000012', 'Zorbix Fizz Cola', 'Zorbix', 'consignaction'],
  ['1000000000013', 'Zorbix Fizz Cola', 'Zorbix', 'openfoodfacts'],
  ['1000000000014', 'Zorbix Fizz Cola', 'Zorbix', 'icecat'],
  ['1000000000015', 'Plimby Berry Fizz', 'Plimby', 'returnit'],
  ['1000000000016', 'Plimby Berry Fizz', 'Plimby', 'consignaction'],
];

async function fixture() {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const [code, name, brand, source] of ROWS) {
    insert.run(code, name, name, null, brand, '355 ml', 355, 'ml', JSON.stringify(PATH), 'en:sodas', '[]', 1, source);
  }
  rebuildFts(db);
  rebuildCategories(db);
  const embedder = new SameVector();
  const all = db.prepare('SELECT rowid FROM product').all() as { rowid: number }[];
  const vecs = await embedder.embedPassages(all.map(() => ''));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));
  return { db, cat: new Catalogue(db, embedder) };
}

test('the named lists hold the two unlicensed sources and Icecat', () => {
  assert.deepEqual([...UNLICENSED_SOURCES].sort(), ['consignaction', 'returnit']);
  assert.deepEqual([...NEVER_SENT_TO_A_MODEL_SOURCES], ['icecat']);
  assert.equal(isUnlicensedSource('returnit'), true);
  assert.equal(isUnlicensedSource('openfoodfacts'), false);
  assert.match(licensedOnlySql('p.'), /^\(p\.source IS NULL OR p\.source NOT IN \('returnit', 'consignaction'\)\)$/);
});

test('the rows are still in the database: nothing is deleted', async () => {
  const { db } = await fixture();
  const n = db.prepare(`SELECT count(*) AS n FROM product WHERE source IN ('returnit','consignaction')`).get() as { n: number };
  assert.equal(n.n, 4);
});

test('a barcode lookup returns nothing for a Return-It or Consignaction row, and the row of another source still answers', async () => {
  const { cat } = await fixture();
  assert.equal(cat.byGtin('1000000000011'), null);
  assert.equal(cat.byGtin('1000000000012'), null);
  assert.equal(cat.byGtin('1000000000013')?.code, '1000000000013');
  assert.equal(cat.byGtin('1000000000014')?.source, 'icecat');
  const viaSearch = await cat.search({ gtin: '1000000000011' });
  assert.ok(!viaSearch.candidates.some((c) => c.source === 'returnit'));
});

test('a typed word search never returns an unlicensed row', async () => {
  const { cat } = await fixture();
  const r = await cat.search({ text: 'zorbix fizz cola', limit: 10 });
  assert.ok(r.candidates.length > 0, 'the licensed rows must still be found');
  for (const c of r.candidates) assert.ok(!UNLICENSED_SOURCES.includes(c.source), `${c.source} row ${c.code} came back`);
  const only = await cat.search({ text: 'plimby berry fizz', limit: 10, vectors: false });
  assert.ok(!only.candidates.some((c) => /plimby/i.test(c.name)), 'a name only unlicensed rows carry is not found');
  for (const c of only.candidates) assert.ok(!UNLICENSED_SOURCES.includes(c.source));
});

test('the vector arm never returns an unlicensed row either', async () => {
  const { cat } = await fixture();
  const r = await cat.search({ text: 'qqqq', limit: 20 });
  for (const c of r.candidates) assert.ok(!UNLICENSED_SOURCES.includes(c.source), `${c.source} row ${c.code} came back`);
});

test('the neighbour ring never holds an unlicensed row', async () => {
  const { cat } = await fixture();
  const ring = cat.ring(PATH, 20, '');
  assert.ok(ring, 'licensed neighbours exist');
  const sources = ring.members.map((m) => m.source).sort();
  assert.deepEqual(sources, ['icecat', 'openfoodfacts']);
});

test('alternatives are never drawn from an unlicensed source', async () => {
  const { db } = await fixture();
  const original = { code: '1000000000011', source: 'returnit', categoryPath: PATH, leafCategory: 'en:sodas', sizeValue: 355, sizeUnit: 'ml', allergens: [], soldInCanada: true, name: 'Zorbix Fizz Cola' } as never;
  const priced = async (codes: readonly string[]) =>
    new Map(codes.map((c) => [c, { code: c, amountCents: 100, seller: 'walmart.ca', observedAt: '2026-09-04', storeName: null, storeCity: null, joinMethod: 'name' }])) as never;
  const alts = await alternativesFor(db, original, 500, priced);
  assert.deepEqual(alts, [], 'a Return-It product was offered a Return-It alternative');
});

test('a brand known only from an unlicensed source is not a known brand', async () => {
  const { db } = await fixture();
  const brands = brandLookupFromDb(db);
  assert.equal(brands.find(['zorbix']), 'Zorbix');
  assert.equal(brands.find(['plimby']), null);
});
