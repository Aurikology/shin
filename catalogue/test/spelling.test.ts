/**
 * D-263 / D-269: a misspelt word finds what the shopper meant.
 *
 * Meaning search (vectors) is off live, so only exact words match and typed
 * "dedorant" found nothing. The fallback corrects a word the catalogue has
 * never indexed to the most frequent indexed word one edit away (two for a
 * word of eight letters or more), and runs the corrected search only when the
 * exact one missed or matched only some of the words.
 *
 * The catalogue here is a temp file opened READ-ONLY, the way the live worker
 * opens the real one, so anything the fallback needs that is a write would
 * fail here as it would there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openCatalogue, openCatalogueReadOnly, rebuildFts, EMBED_DIM } from '../src/schema.ts';
import { Catalogue } from '../src/search.ts';
import type { Embedder } from '../src/embed.ts';

/** The vector arm is off in every query below, as it is live; this only satisfies the constructor. */
const NO_EMBEDDER: Embedder = {
  id: 'test:none',
  dim: EMBED_DIM,
  embedPassages: async () => { throw new Error('the vector arm must not run'); },
  embedQuery: async () => { throw new Error('the vector arm must not run'); },
};

const ROWS: [string, string, string | null, string | null][] = [
  // code, name, brands, quantity
  ['1000000000001', 'Clinical Deodorant', 'Gillette', '76 g'],
  ['1000000000002', 'Deodorant Stick', 'Dove', '74 g'],
  ['1000000000003', 'Deodorant Spray', 'Lynx', '150 ml'],
  ['1000000000004', 'Natural Deodorant', 'Native', '75 g'],
  ['1000000000005', 'Cheerios Cereal', 'General Mills', '400 g'],
  ['1000000000006', 'Honey Nut Cheerios', 'General Mills', '430 g'],
  ['1000000000007', 'Tomato Ketchup', 'Heinz', '750 ml'],
  ['1000000000008', 'Ketchup', 'French\'s', '1 l'],
  ['1000000000009', 'Partly Skimmed Milk 2%', 'Natrel', '4 l'],
  ['1000000000010', 'Homogenized Milk', 'Neilson', '2 l'],
  ['1000000000011', 'Chocolate Milk', 'Neilson', '1 l'],
  // A real word one letter from a far more frequent one: "mild" beside "milk".
  ['1000000000012', 'Mild Salsa', 'Tostitos', '423 ml'],
  // Numbers the index holds, so a typed number has neighbours it could wrongly snap to.
  ['1000000000013', 'Model 1000 Blender', 'Ninja', null],
  ['1000000000014', 'Model 1000 Mixer', 'Ninja', null],
];

function catalogue(): Catalogue {
  const path = join(mkdtempSync(join(tmpdir(), 'shin-spell-')), 'catalogue.db');
  const w = openCatalogue(path);
  const insert = w.prepare(`
    INSERT INTO product (code, name, name_en, brands, quantity, category_path, allergens, sold_in_canada, source)
    VALUES (?, ?, ?, ?, ?, '[]', '[]', 1, 'test')`);
  for (const [code, name, brands, quantity] of ROWS) insert.run(code, name, name, brands, quantity);
  rebuildFts(w);
  w.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  w.close();
  return new Catalogue(openCatalogueReadOnly(path), NO_EMBEDDER, null);
}

async function ask(cat: Catalogue, text: string) {
  return cat.search({ text, vectors: false, recordMiss: false });
}

test('typed "dedorant" answers with deodorant and says it corrected the word', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  const r = await ask(cat, 'dedorant');
  assert.ok(r.candidates.length > 0, 'a one-letter typo still finds nothing');
  assert.match(r.candidates[0].name, /deodorant/i);
  assert.equal(r.correctedFrom, 'dedorant');
  assert.equal(r.correctedTo, 'deodorant');
});

test('typed "cheerois" (two letters swapped) answers with Cheerios', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  const r = await ask(cat, 'cheerois');
  assert.match(r.candidates[0]?.name ?? '', /cheerios/i);
  assert.equal(r.correctedTo, 'cheerios');
});

test('typed "ketchp" (a letter missing) answers with ketchup', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  const r = await ask(cat, 'ketchp');
  assert.match(r.candidates[0]?.name ?? '', /ketchup/i);
  assert.equal(r.correctedTo, 'ketchup');
});

test('a typo beside a correct word is corrected and the correct word is kept', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  const r = await ask(cat, 'heinz ketchp');
  assert.equal(r.candidates[0]?.code, '1000000000007');
  assert.equal(r.correctedFrom, 'heinz ketchp');
  assert.equal(r.correctedTo, 'heinz ketchup');
  assert.equal(r.wordsMatched, 'all');
});

test('a correct word is never corrected, even one letter from a more common word', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  for (const text of ['deodorant', 'mild', 'mild salsa', 'milk']) {
    const r = await ask(cat, text);
    assert.equal(r.correctedFrom, undefined, `"${text}" was corrected to "${r.correctedTo}"`);
    assert.ok(r.candidates.length > 0, `"${text}" found nothing`);
  }
  assert.equal(cat.spellingFix('mild'), null);
});

test('a number or a barcode is never corrected', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  for (const text of ['1001', '0068100084245', '068100084245', 'model 1001']) {
    const r = await ask(cat, text);
    assert.equal(r.correctedFrom, undefined, `"${text}" was corrected to "${r.correctedTo}"`);
  }
  assert.equal(cat.spellingFix('1001'), null);
});

test('nonsense far from every word is left alone', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  const r = await ask(cat, 'qzxv');
  assert.equal(r.correctedFrom, undefined);
  assert.equal(r.candidates.length, 0);
});

test('a long word takes two edits; a short one only one', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  // "deoderent": two substitutions from "deodorant", nine letters.
  assert.equal(cat.spellingFix('deoderent'), 'deodorant');
  // "kechp": two edits from "ketchup" but only five letters, so it is not guessed at.
  assert.equal(cat.spellingFix('kechp'), null);
});

test('the vocabulary reports its own size and memory cost once built', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  const s = cat.spellingStats();
  assert.equal(s.ready, true);
  assert.ok(s.words > 0, `only ${s.words} words held`);
  assert.ok(s.bytes > 0 && s.bytes < 1_000_000, `memory estimate ${s.bytes}`);
});

test('a word of seven letters or fewer takes one edit; eight or more takes two', async () => {
  const cat = catalogue();
  await cat.startSpelling();
  // "ketchop" is "ketchup" with one letter changed: seven letters, one edit.
  assert.equal(cat.spellingFix('ketchop'), 'ketchup');
  // "ketchop" with a second slip ("kitchop") is two edits at seven letters: not guessed at.
  assert.equal(cat.spellingFix('kitchop'), null);
  // "deoderent" is nine letters and two edits: guessed at.
  assert.equal(cat.spellingFix('deoderent'), 'deodorant');
});

test('a corrected search is never banded confident, even with the brand and size pinned', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'shin-spell-band-')), 'catalogue.db');
  const w = openCatalogue(path);
  const insert = w.prepare(`
    INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path, allergens, sold_in_canada, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', 1, 'test')`);
  insert.run('1000000000007', 'Tomato Ketchup', 'Tomato Ketchup', 'Heinz', '750 ml', 750, 'ml');
  insert.run('1000000000008', 'Ketchup', 'Ketchup', "French's", '1 l', 1000, 'ml');
  rebuildFts(w);
  w.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  w.close();
  const cat = new Catalogue(openCatalogueReadOnly(path), NO_EMBEDDER, null);
  await cat.startSpelling();
  const pinned = { brand: 'Heinz', sizeValue: 750, sizeUnit: 'ml', vectors: false, recordMiss: false };
  const exact = await cat.search({ text: 'ketchup', ...pinned });
  const typo = await cat.search({ text: 'ketchp', ...pinned });
  assert.equal(exact.band, 'confident', 'the control: the right spelling with a pinned brand and size is confident');
  assert.equal(typo.correctedTo, 'ketchup');
  assert.equal(typo.candidates[0]?.code, exact.candidates[0]?.code);
  assert.equal(typo.band, 'ambiguous');
});
