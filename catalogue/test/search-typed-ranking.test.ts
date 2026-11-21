/**
 * Typed search ranking (review 2026-11-21 old-lists 3 and premortem 6; launch gap 74; D-269 left open).
 * Live probes 2026-11-21 on /api/search:
 *   - "ketchup" put Doritos Ketchup 80 g first, ahead of the ketchups;
 *   - "heinz ketchup 750 ml" put the 1.25 L first and no 750 ml row;
 *   - "kraft dinner" put a bare "Kraft dinner" row (no brand, no size) ahead of the sized boxes.
 * Each case was red on the ranking before the fix. A tiny hand-built catalogue with a deterministic
 * stand-in embedder, as in search.test.ts: these check the ranking LOGIC on the shapes seen live.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, toVecBlob, EMBED_DIM } from '../src/schema.ts';
import { rebuildCategoriesFromPaths as rebuildCategories } from './helpers/path-taxonomy.ts';
import { Catalogue } from '../src/search.ts';
import type { Embedder } from '../src/embed.ts';

class HashEmbedder implements Embedder {
  readonly id = 'test:hash';
  readonly dim = EMBED_DIM;
  #vec(text: string): Float32Array {
    const v = new Float32Array(this.dim);
    for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i += 1) {
        h ^= tok.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      v[Math.abs(h) % this.dim] += 1;
    }
    let sum = 0;
    for (const x of v) sum += x * x;
    const n = Math.sqrt(sum) || 1;
    for (let i = 0; i < v.length; i += 1) v[i] /= n;
    return v;
  }
  async embedPassages(texts: string[]) {
    return texts.map((t) => this.#vec(t));
  }
  async embedQuery(text: string) {
    return this.#vec(text);
  }
}

const CHIPS = '["en:snacks","en:chips"]';
const KETCHUP = '["en:condiments","en:sauces","en:ketchup"]';
const PASTA = '["en:meals","en:pasta-dishes","en:macaroni-and-cheese"]';

// code, name, name_en, name_fr, brands, quantity, size_value, size_unit, path, leaf
type R = [string, string, string | null, string | null, string | null, string | null, number | null, string | null, string, string | null];
// The ketchup rows copy the live answer's shape (GET /api/search?q=ketchup, 2026-11-21): Open Food Facts gives
// most of them the English name "Ketchup", the Doritos bag too, and the Doritos bag carries no category.
const ROWS: R[] = [
  ['0060410019689', 'Doritos Ketchup 80g', 'Ketchup', 'Ketchup', 'DORITOS', '80g', 80, 'g', '[]', null],
  ['0060410000102', 'Doritos Nacho Cheese', 'Doritos Nacho Cheese', 'Doritos Nacho fromage', 'Doritos', '235 g', 235, 'g', CHIPS, 'en:chips'],
  ['0774223289404', 'Ketchup', 'Ketchup', null, null, null, null, null, KETCHUP, 'en:ketchup'],
  ['0055742545999', 'Ketchup 750ml', 'Ketchup', null, null, '750ml', 750, 'ml', '["en:condiments"]', 'en:condiments'],
  ['0005732401000', 'Heinz Ketchup 2.84l', 'Ketchup', null, 'Heinz', '2.84l', 2840, 'ml', KETCHUP, 'en:ketchup'],
  ['0057000613280', 'Heinz Tomato Ketchup 1 x 1.25 L', 'Heinz Tomato Ketchup', null, 'Heinz', '1 x 1.25 L', 1250, 'ml', KETCHUP, 'en:ketchup'],
  ['0057000000303', 'Heinz Ketchup 1 L', 'Heinz Ketchup', null, 'Heinz', '1 l', 1000, 'ml', KETCHUP, 'en:ketchup'],
  ['0059749898782', 'Selection Ketchup 750ml', 'Tomato Ketchup', null, 'Selection', '750ml', 750, 'ml', KETCHUP, 'en:ketchup'],
  ['0057000712532', 'Heinz Ketchup 750ml', 'Heinz Ketchup', null, 'Heinz', '750ml', 750, 'ml', KETCHUP, 'en:ketchup'],
  // Kraft dinner: a bare row (no brand, no size) beside the sized boxes.
  ['0068100145120', 'Kraft dinner', 'Kraft dinner', null, null, null, null, null, '[]', null],
  ['0068100000501', 'Kraft Dinner', 'Kraft Dinner', 'Kraft Diner', 'Kraft', '225 g', 225, 'g', PASTA, 'en:macaroni-and-cheese'],
  ['0068100000502', 'Kraft Dinner', 'Kraft Dinner', null, 'Kraft', '12 x 200 g', 2400, 'g', PASTA, 'en:macaroni-and-cheese'],
];

async function fixture(): Promise<Catalogue> {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of ROWS) insert.run(...r, '[]', 1, 'test');
  rebuildFts(db);
  rebuildCategories(db);
  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name, brands FROM product').all() as { rowid: number; name: string; brands: string | null }[];
  const vecs = await embedder.embedPassages(all.map((r) => `${r.brands ?? ''} ${r.name}`));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i]!)));
  return new Catalogue(db, embedder);
}

const label = (c: { name?: string; brands: string | null; quantity: string | null }) => `${c.brands ?? ''} ${c.name ?? ''} ${c.quantity ?? ''}`.trim();

test('"ketchup": a ketchup comes first, never a ketchup-flavoured snack', async () => {
  const cat = await fixture();
  for (const vectors of [true, false]) {
    const r = await cat.search({ text: 'ketchup', vectors, limit: 5 });
    const doritos = r.candidates.findIndex((c) => c.code === '0060410019689');
    // Every ketchup the catalogue both names "Ketchup" and places with the ketchups comes before the bag of chips.
    assert.ok(doritos === -1 || doritos >= 3, `Doritos at ${doritos}: ${r.candidates.map(label).join(' | ')} (vectors ${vectors})`);
    assert.ok(['en:ketchup', 'en:condiments'].includes(r.candidates[0]!.leafCategory ?? ''), `top is ${label(r.candidates[0]!)}`);
  }
});

test('"heinz ketchup 750 ml": the 750 ml bottle comes first', async () => {
  const cat = await fixture();
  for (const vectors of [true, false]) {
    const r = await cat.search({ text: 'heinz ketchup 750 ml', vectors, limit: 5 });
    const top = r.candidates[0]!;
    assert.equal(top.sizeValue, 750, `top is ${label(top)} (vectors ${vectors})`);
    assert.equal(top.brands, 'Heinz');
    // A typed size reorders the list; it never makes a typed search "confident" on its own (the band reads the caller's pins).
    assert.notEqual(r.band, 'confident');
  }
});

test('"ketchup 750ml" (size run together): a 750 ml ketchup comes first', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'ketchup 750ml', vectors: false, limit: 5 });
  assert.equal(r.candidates[0]!.sizeValue, 750, `top is ${label(r.candidates[0]!)}`);
});

test('"kraft dinner": the sized boxes come before a bare row of the same name with no brand or size', async () => {
  const cat = await fixture();
  for (const vectors of [true, false]) {
    const r = await cat.search({ text: 'kraft dinner', vectors, limit: 5 });
    const bare = r.candidates.findIndex((c) => c.code === '0068100145120');
    const sized = r.candidates.findIndex((c) => c.code === '0068100000501');
    assert.ok(sized !== -1, 'the 225 g box is listed');
    assert.ok(bare === -1 || bare > sized, `bare row at ${bare}, sized box at ${sized} (vectors ${vectors})`);
  }
});

test('a size the caller pinned is untouched by the text: the pin still decides', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'heinz ketchup', sizeValue: 1250, sizeUnit: 'ml', vectors: false, limit: 5 });
  assert.equal(r.candidates[0]!.sizeValue, 1250);
});
