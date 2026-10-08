/**
 * A SECOND SOURCE IS A SECOND WITNESS, NOT A REPLACEMENT.
 *
 * Why this file exists, measured 2026-09-26. The loader's conflict clause
 * overwrote every field of an existing row with the incoming one, whoever was
 * writing. Quebec's deposit registry then loaded 50,166 drinks, 5,106 of which
 * the food database already held, and the overwrite cost real quality:
 * "Black Raspberry Sparkling Fruit2O" became "Black Raspberry", "Mixed Berry
 * Sparkling Fruit2O" became "Baies". Worse, the rows' `source` was overwritten
 * too, and the phone's grocery pack selects on `source`, so the pack lost 4% of
 * its products while the catalogue still held every one of them. Nothing failed;
 * a row count in a test file dated three weeks earlier is what noticed.
 *
 * The rule now: the same feed refreshing its own row overwrites, because a feed
 * is allowed to correct itself and to drop a field it no longer publishes. A
 * different source may only fill a hole.
 *
 * WHY THIS TEST RUNS THE LOADER AS A SEPARATE PROCESS. Importing `load.ts`
 * EXECUTES it: it is a script, not a module, and a test that imported it once
 * tonight loaded 122,158 rows into the live 4 GB catalogue and ended in
 * "database is locked". So the loader is spawned, pointed at a temp database
 * through SHIN_CATALOGUE, and the result is read back out of that file with a
 * second connection. That is also the only way to test the SQL, which lives
 * inside the script rather than in an exported function.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'shin-load-second-'));
const dbPath = join(dir, 'catalogue.db');
const loader = fileURLToPath(new URL('../src/load.ts', import.meta.url));
const catalogueDir = fileURLToPath(new URL('..', import.meta.url));
// The load ends with the canonical category pass, which needs a taxonomy. These tests are about
// the upsert, so they use a one-entry taxonomy that resolves none of their labels (rows stay as
// loaded); the pass itself is tested in category-canonicalize.test.ts and at the end of this file.
const noopTaxonomy = join(dir, 'noop-taxonomy.json');
const noopAliases = join(dir, 'noop-aliases.json');
writeFileSync(noopTaxonomy, JSON.stringify({ 'en:placeholder': { parents: [] } }));
writeFileSync(noopAliases, JSON.stringify({ aliases: {} }));

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

/** One prepared row, in exactly the shape `prepare_rows.py` writes. */
function row(over: Record<string, unknown>): Record<string, unknown> {
  return {
    code: '0016571951580',
    name: 'Cherry Limeade Sparkling Ice',
    name_en: 'Cherry Limeade Sparkling Ice',
    name_fr: null,
    brands: 'Sparkling Ice',
    quantity: '503 mL',
    size_value: 503,
    size_unit: 'ml',
    category_path: ['Beverages'],
    leaf_category: 'Beverages',
    allergens: [],
    image_url: 'https://example.invalid/sparkling-ice.jpg',
    sold_in_canada: 0,
    source: 'openfoodfacts',
    ingredients_text: 'carbonated water, citric acid',
    ...over,
  };
}

function load(rows: Record<string, unknown>[], tag: string, env: Record<string, string> = {}): void {
  const path = join(dir, `rows-${tag}.jsonl`);
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  execFileSync(process.execPath, ['--experimental-strip-types', loader, path], {
    cwd: catalogueDir,
    env: { ...process.env, SHIN_CATALOGUE: dbPath, SHIN_CATEGORY_TAXONOMY: noopTaxonomy, SHIN_CATEGORY_ALIASES: noopAliases, ...env },
    stdio: 'pipe',
  });
}

function read(code: string): Record<string, unknown> {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 30000');
  const r = db
    .prepare(
      'SELECT code, name, name_en, name_fr, brands, quantity, size_value, size_unit, leaf_category,' +
        ' image_url, sold_in_canada, source, ingredients_text FROM product WHERE code = ?',
    )
    .get(code) as Record<string, unknown>;
  db.close();
  return r;
}

test('a different source keeps the existing name, brand and source, and fills only what was missing', () => {
  load([row({})], 'first');
  // The deposit registry's version of the same drink: a terser name, a French
  // name the food database lacked, no brand, no picture, and it knows the drink
  // is sold in Canada.
  load(
    [
      row({
        name: 'Sparkling ICE - Limonade cerise',
        name_en: null,
        name_fr: 'Limonade cerise',
        brands: null,
        image_url: null,
        ingredients_text: null,
        sold_in_canada: 1,
        source: 'consignaction',
      }),
    ],
    'second',
  );
  const r = read('0016571951580');
  assert.equal(r.name, 'Cherry Limeade Sparkling Ice', 'the newcomer overwrote a name it should only have filled');
  assert.equal(r.name_en, 'Cherry Limeade Sparkling Ice');
  assert.equal(r.brands, 'Sparkling Ice', 'a null from a second source erased a brand');
  assert.equal(r.image_url, 'https://example.invalid/sparkling-ice.jpg');
  assert.equal(r.ingredients_text, 'carbonated water, citric acid');
  assert.equal(r.source, 'openfoodfacts', 'the row changed pack: the grocery pack selects on source');
  // What the second witness IS allowed to add.
  assert.equal(r.name_fr, 'Limonade cerise', 'the hole the newcomer should have filled is still empty');
  assert.equal(r.sold_in_canada, 1, 'one source saying it is sold in Canada is a fact, not a preference');
});

test('the same source refreshing its own row does overwrite, nulls included', () => {
  load([row({ code: '0016600000098', name: 'Schweppes Soda tonique', brands: 'Schweppes' })], 'refresh-a');
  load(
    [
      row({
        code: '0016600000098',
        name: 'Schweppes Tonic Water',
        name_en: 'Schweppes Tonic Water',
        brands: null,
        source: 'openfoodfacts',
      }),
    ],
    'refresh-b',
  );
  const r = read('0016600000098');
  assert.equal(r.name, 'Schweppes Tonic Water', 'a feed correcting its own row was ignored');
  assert.equal(r.brands, null, 'a feed that stopped publishing a field could not clear it');
});

test('a barcode written 12 digits and then 13 is one row, and the second write is a second witness', () => {
  load([row({ code: '019063001114', name: 'Black Raspberry Sparkling Fruit2O', source: 'openfoodfacts' })], 'twelve');
  load([row({ code: '0019063001114', name: 'Black Raspberry', name_fr: 'Framboise noire', brands: null, source: 'consignaction' })], 'thirteen');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const n = Object.values(
    db.prepare("SELECT count(*) FROM product WHERE code IN ('019063001114', '0019063001114')").get() ?? {},
  )[0];
  db.close();
  assert.equal(n, 1, 'one barcode became two rows again');
  const r = read('0019063001114');
  assert.equal(r.name, 'Black Raspberry Sparkling Fruit2O', 'the fuller name lost to the registry label');
  assert.equal(r.name_fr, 'Framboise noire');
});
