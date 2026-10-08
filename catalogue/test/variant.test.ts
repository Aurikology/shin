/**
 * D-099, 2026-09-14: the flavour word, asked as its own question.
 *
 * A Cherry Coke Zero 355 mL can photographed on a phone came back as a plain
 * Coke Zero. The rows below are the shape of the two real ones: the plain can is
 * named "Coke Zero" and the cherry can is named "Cherry-flavoured calorie-free
 * cola" in English and "Coca-cola cerise" in French. A query reading
 * "Coca-Cola Coke Zero Cherry" repeats three of its words on the plain row and
 * one on the cherry row, so the words alone rank the wrong can first and the
 * one token that separates the two cans is spent on nothing.
 *
 * Same fixture discipline as search.test.ts: a tiny hand-built catalogue with a
 * deterministic stand-in embedder, never the real catalogue.db, because a
 * fixture written in this commit cannot prove retrieval quality and is only
 * being asked to prove the LOGIC.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, toVecBlob, EMBED_DIM } from '../src/schema.ts';
import { rebuildCategoriesFromPaths as rebuildCategories } from './helpers/path-taxonomy.ts';
import { Catalogue } from '../src/search.ts';
import type { Embedder } from '../src/embed.ts';

/** The same hashing stand-in search.test.ts uses, for the same reason. */
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

const PLAIN = '06731906';
const CHERRY = '06781901';
const VANILLA = '06781902';
/* The three rows the word families were added for, 2026-09-14. Kept out of the
   default fixture so the ranking tests above still rank the same three rows. */
const SHELF = '06781903';
const LIGHT = '06781904';
const FR_ONLY = '06781905';

/**
 * @param extra rows in the same shape, appended. A row may carry its own
 * category path as a tenth column; the default is the empty path every row in
 * the base fixture has.
 */
async function fixture(extra: (string | number | null)[][] = []) {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, generic_name, brands, quantity,
      size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const rows: (string | number | null)[][] = [
    // The flavour is nowhere in this row, which is correct: it has none.
    [PLAIN, 'Coke Zero', 'Coke Zero', null, null, 'Coca-Cola', '355 ml', 355, 'ml'],
    // The flavour is in the English name here and in the French name as well,
    // and neither of them says "coke" or "zero". That is the whole defect.
    [CHERRY, 'Cherry-flavoured calorie-free cola', 'Cherry-flavoured calorie-free cola',
      'Coca-cola cerise', null, 'Coca-Cola', '355 mL', 355, 'ml'],
    // A third can so that the pinned flavour has something to be wrong about
    // other than the plain one, and so the lift cannot be read as a two-row
    // coincidence.
    [VANILLA, 'Coke Zero Vanilla', 'Coke Zero Vanilla', null, 'Cola saveur vanille',
      'Coca-Cola', '355 ml', 355, 'ml'],
  ];
  for (const r of [...rows, ...extra]) {
    insert.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9] ?? '[]', null, '[]', 1, 'test');
  }
  rebuildFts(db);
  rebuildCategories(db);

  const embedder = new HashEmbedder();
  const all = db.prepare('SELECT rowid, name, brands FROM product').all() as {
    rowid: number; name: string; brands: string | null;
  }[];
  const vecs = await embedder.embedPassages(all.map((r) => `${r.brands ?? ''} ${r.name}`));
  const iv = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
  all.forEach((r, i) => iv.run(BigInt(r.rowid), toVecBlob(vecs[i])));

  return new Catalogue(db, embedder);
}

function signalOf(candidates: readonly { code: string; signals: { variantAgrees?: boolean | null } }[], code: string) {
  return candidates.find((c) => c.code === code)?.signals.variantAgrees;
}

test('no variant pinned leaves every row unasked, so a typed search is untouched', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Coca-Cola Coke Zero', limit: 5 });

  assert.ok(r.candidates.length > 0, 'expected the fixture to answer at all');
  for (const c of r.candidates) {
    assert.equal(c.signals.variantAgrees, null, `${c.code} was judged on a flavour nobody pinned`);
  }
});

test('the signal is true for the row that names the flavour and false for the row that does not', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Coca-Cola Coke Zero Cherry', variant: 'Cherry', limit: 5 });

  assert.equal(signalOf(r.candidates, CHERRY), true, 'the English name says cherry');
  assert.equal(signalOf(r.candidates, PLAIN), false, 'none of the plain row names says cherry');
});

test('the flavour is read out of the French name when that is the only place it is written', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Coca-Cola Coke Zero Cerise', variant: 'Cerise', limit: 5 });

  // "Coca-cola cerise" is the row's name_fr and the accent-free spelling of the
  // query has to reach it, or decision 20's bilingual promise stops at the
  // flavour.
  assert.equal(signalOf(r.candidates, CHERRY), true);
  assert.equal(signalOf(r.candidates, PLAIN), false);
});

test('the flavour is read out of the generic name too', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Coca-Cola Coke Zero Vanille', variant: 'vanille', limit: 5 });

  assert.equal(signalOf(r.candidates, VANILLA), true, 'generic_name is the only field that says vanille');
});

test('a multi-word flavour needs every word', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Coca-Cola Coke Zero Cherry', variant: 'Cherry Lime', limit: 5 });

  // The cherry row says cherry and never says lime; the plain row says neither.
  // Neither carries both, and a rule that took "any word" would have lifted the
  // cherry row on half a flavour.
  assert.equal(signalOf(r.candidates, CHERRY), false);
  assert.equal(signalOf(r.candidates, PLAIN), false);
});

test('D-099: the pinned flavour lifts its row above the one the words alone put first', async () => {
  const cat = await fixture();

  // Without the pin, this is the defect: the plain row repeats three of the
  // query's words and the cherry row repeats one.
  const before = await cat.search({ text: 'Coca-Cola Coke Zero Cherry', limit: 5 });
  assert.equal(before.candidates[0].code, PLAIN, 'the fixture must reproduce the defect, or the next line proves nothing');

  // The SAME query with one field added, so the reorder can only be the flavour.
  const after = await cat.search({ text: 'Coca-Cola Coke Zero Cherry', variant: 'Cherry', limit: 5 });
  assert.equal(after.candidates[0].code, CHERRY, 'agreement on the flavour must lift, the way agreement on the size does');
});

test('a flavour that disagrees costs a row nothing it would otherwise have had', async () => {
  const cat = await fixture();

  // The pin names a flavour NO row carries. Every row is left where the words
  // put it, because a row that is silent about a flavour is not a row that
  // contradicts it: three quarters of the real catalogue has a name_fr or a
  // generic_name missing, and demoting on a silence punishes the sparse rows.
  const baseline = await cat.search({ text: 'Coca-Cola Coke Zero Cherry', limit: 5 });
  const pinned = await cat.search({ text: 'Coca-Cola Coke Zero Cherry', variant: 'Raspberry', limit: 5 });

  assert.deepEqual(
    pinned.candidates.map((c) => c.code),
    baseline.candidates.map((c) => c.code),
  );
});

/* -------------------------------------------------------------------------
 * The word families, 2026-09-14. D-099 left the guard working only for the
 * transcription nobody's model is most likely to produce: the can says "Zero
 * Sugar", the row says "calorie-free", and a literal all-tokens check made them
 * disagree. `catalogue/src/variant-words.ts` is the one table both sides read.
 * ------------------------------------------------------------------------- */

test('the can prints "Zero Sugar" and the row spells it "calorie-free", and they are one thing', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Coca-Cola Zero Sugar Cherry', variant: 'Cherry Zero Sugar', limit: 5 });

  // This is the exact pair the defect is about, in the exact words a model
  // reading the can would use. Before the families it was false here.
  assert.equal(signalOf(r.candidates, CHERRY), true, '"calorie-free" answers to "zero sugar"');
  // The plain can has the zero and not the cherry, which is still a disagreement.
  assert.equal(signalOf(r.candidates, PLAIN), false);
});

test('a row whose only zero is the shelf it sits on still answers to zero', async () => {
  // Nothing in this row's three names says zero, diet or calorie. The catalogue
  // recorded the fact as a category instead, which is where a quarter of these
  // rows keep it.
  const cat = await fixture([
    [SHELF, 'Cherry cola', 'Cherry cola', null, null, 'Coca-Cola', '355 ml', 355, 'ml',
      '["en:beverages","en:diet-sodas"]'],
  ]);
  const r = await cat.search({ text: 'Coca-Cola Zero Sugar Cherry', variant: 'Cherry Zero Sugar', limit: 6 });

  assert.equal(signalOf(r.candidates, SHELF), true, 'en:diet-sodas is the row saying zero');
});

test('a cherry cola with no zero anywhere is not a zero cherry cola', async () => {
  // 06772408 in the real catalogue: "Cherry Coke", the sugared one, sitting
  // beside the can we want. The flavour agrees and the rest of the variant does
  // not, and that is the whole job.
  const cat = await fixture([
    [SHELF, 'Cherry Coke', 'Cherry Coke', null, null, 'Coca-Cola', '355 ml', 355, 'ml'],
  ]);
  const r = await cat.search({ text: 'Coca-Cola Zero Sugar Cherry', variant: 'Cherry Zero Sugar', limit: 6 });

  assert.equal(signalOf(r.candidates, SHELF), false, 'nothing here says zero, in any spelling or on any shelf');
});

test('light is not zero, in either direction', async () => {
  const cat = await fixture([
    [LIGHT, 'Cola light', 'Cola light', 'Cola légère', null, 'Coca-Cola', '355 ml', 355, 'ml'],
  ]);

  // A light cola and a zero-sugar cola are different claims on the pack. They
  // are their own family precisely so that one never answers for the other.
  const asZero = await cat.search({ text: 'Coca-Cola Zero Sugar', variant: 'Zero Sugar', limit: 6 });
  assert.equal(signalOf(asZero.candidates, LIGHT), false);

  const asLight = await cat.search({ text: 'Coca-Cola light', variant: 'Light', limit: 6 });
  assert.equal(signalOf(asLight.candidates, LIGHT), true, 'the row says light in both names');
});

test('a row that names the flavour only in French answers to the English word', async () => {
  const cat = await fixture([
    [FR_ONLY, 'Cola', 'Cola', 'Cola cerise', null, 'Coca-Cola', '355 ml', 355, 'ml'],
  ]);
  const r = await cat.search({ text: 'Coca-Cola Cherry', variant: 'Cherry', limit: 6 });

  // Before the families this needed the model to read the French word off an
  // English can. The pair is the table's whole contribution here.
  assert.equal(signalOf(r.candidates, FR_ONLY), true, '"cerise" answers to "cherry"');
});

test('a flavour with no family behind it is still matched literally', async () => {
  const cat = await fixture();
  const r = await cat.search({ text: 'Coca-Cola Coke Zero Vanilla', variant: 'Vanilla', limit: 5 });

  // The vanilla row says "vanille" in its generic name and nothing else does,
  // so the pair carries it and the two plain rows stay wrong.
  assert.equal(signalOf(r.candidates, VANILLA), true);
  assert.equal(signalOf(r.candidates, PLAIN), false);
  assert.equal(signalOf(r.candidates, CHERRY), false);
});
