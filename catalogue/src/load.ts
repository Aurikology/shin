/**
 * Insert prepared rows into the catalogue and rebuild the text index.
 *
 * Deliberately dumb: every judgement about what a row means was made in
 * `prepare_rows.py`. This file's only jobs are to be fast, to be re-runnable
 * without duplicating anything, and to report a count that came from the
 * database rather than from its own loop counter.
 *
 * That last one matters more than it looks. A loader that reports what it tried
 * to insert rather than what is in the table is how a half-loaded catalogue
 * looks healthy, and every downstream "no results" then reads as a matching
 * problem instead of a loading one.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { openCatalogue, rebuildFts } from './schema.ts';
import { DEFAULT_ALIASES_PATH, DEFAULT_TAXONOMY_PATH, loadTaxonomy } from './category-taxonomy.ts';
import type { Taxonomy } from './category-taxonomy.ts';
import { canonicalizeCatalogue } from './category-canonicalize.ts';
import { canonicalCode } from './barcode.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const ROWS_PATH = process.argv[2] ?? 'data/rows.jsonl';
const TAXONOMY_PATH = process.env.SHIN_CATEGORY_TAXONOMY ?? DEFAULT_TAXONOMY_PATH;
const ALIASES_PATH = process.env.SHIN_CATEGORY_ALIASES ?? DEFAULT_ALIASES_PATH;

/*
 * ONE BARCODE, ONE SPELLING. The upsert below keys on `code` exactly as the
 * prepared row spells it, so before `canonicalCode` existed one barcode written two
 * ways was two rows and the conflict clause never fired: 1,375,443 products sat in
 * the catalogue under both a 12-digit code and its zero-padded 13-digit twin,
 * 198,095 of them Canadian, which was 32% of what the phone downloads. The rule and
 * the counts behind it are in `barcode.ts`; `dedupe-barcode-spellings.ts` cleaned
 * the rows that were already there.
 */
const BATCH = 2000;

interface PreparedRow {
  code: string;
  name: string;
  name_en: string | null;
  name_fr: string | null;
  brands: string | null;
  quantity: string | null;
  size_value: number | null;
  size_unit: string | null;
  category_path: string[];
  leaf_category: string | null;
  allergens: string[];
  image_url: string | null;
  sold_in_canada: number;
  source: string;
  generic_name?: string | null;
  nutriscore_grade?: string | null;
  nova_group?: number | null;
  additives_n?: number | null;
  ingredients_text?: string | null;
}

async function main(): Promise<number> {
  const db = openCatalogue(DB_PATH);

  /*
   * TWO DIFFERENT JOBS FOR ONE CONFLICT CLAUSE, AND THEY WANT OPPOSITE THINGS.
   *
   * Job one: the same dump loaded twice must not double the catalogue, and when
   * a feed republishes with a corrected name that correction must land. That
   * wants the incoming row to win.
   *
   * Job two: a SECOND source writing a barcode we already hold is a second
   * witness to the same product, not a replacement for it. That wants the
   * existing row to win, with the newcomer filling only what is missing. It is
   * the rule the build plan wrote down for this loader: "a barcode already
   * present keeps its existing row and the new source contributes only fields
   * that row is missing".
   *
   * Until 2026-09-26 this clause did job one for both, which is silent and
   * expensive. Counted afterwards: Quebec's deposit registry overwrote 5,106
   * rows the food database already held, so "Black Raspberry Sparkling Fruit2O"
   * became "Black Raspberry", "Mixed Berry Sparkling Fruit2O" became "Baies",
   * and because those rows' `source` was overwritten too, the phone's grocery
   * pack, which selects `source = 'openfoodfacts'`, quietly lost 4% of its
   * products while the catalogue still held every one of them.
   *
   * SO THE CLAUSE ASKS WHO IS WRITING. `product.source = excluded.source` means
   * the same feed is refreshing its own row, and then the incoming value wins,
   * nulls included, because a feed is allowed to delete a field it no longer
   * publishes. A different source means the newcomer may only fill a hole:
   * COALESCE takes the existing value first, and NULLIF is there because an
   * empty string is a hole too, as are '[]' for the two JSON list columns.
   *
   * TWO EXCEPTIONS, both deliberate. `sold_in_canada` is raised with max(),
   * because one source saying a product is sold here is a fact that another
   * source's silence does not undo. And `source` itself stays with the first
   * writer, which is what keeps a product in the pack it belongs to; the cost is
   * that the catalogue records one source per barcode rather than a list, and a
   * second-witness column is the fix for that when something needs it.
   */
  const insert = db.prepare(`
    INSERT INTO product (
      code, name, name_en, name_fr, brands, quantity, size_value, size_unit,
      category_path, leaf_category, allergens, image_url, sold_in_canada, source,
      generic_name, nutriscore_grade, nova_group, additives_n, ingredients_text
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET
      name = CASE WHEN product.source = excluded.source THEN excluded.name
                  ELSE COALESCE(NULLIF(TRIM(product.name), ''), excluded.name) END,
      name_en = CASE WHEN product.source = excluded.source THEN excluded.name_en
                     ELSE COALESCE(NULLIF(TRIM(product.name_en), ''), excluded.name_en) END,
      name_fr = CASE WHEN product.source = excluded.source THEN excluded.name_fr
                     ELSE COALESCE(NULLIF(TRIM(product.name_fr), ''), excluded.name_fr) END,
      brands = CASE WHEN product.source = excluded.source THEN excluded.brands
                    ELSE COALESCE(NULLIF(TRIM(product.brands), ''), excluded.brands) END,
      quantity = CASE WHEN product.source = excluded.source THEN excluded.quantity
                      ELSE COALESCE(NULLIF(TRIM(product.quantity), ''), excluded.quantity) END,
      size_value = CASE WHEN product.source = excluded.source THEN excluded.size_value
                        ELSE COALESCE(product.size_value, excluded.size_value) END,
      size_unit = CASE WHEN product.source = excluded.source THEN excluded.size_unit
                       ELSE COALESCE(NULLIF(TRIM(product.size_unit), ''), excluded.size_unit) END,
      category_path = CASE WHEN product.source = excluded.source THEN excluded.category_path
                           ELSE COALESCE(NULLIF(NULLIF(product.category_path, ''), '[]'), excluded.category_path) END,
      leaf_category = CASE WHEN product.source = excluded.source THEN excluded.leaf_category
                           ELSE COALESCE(NULLIF(TRIM(product.leaf_category), ''), excluded.leaf_category) END,
      -- A fresh load of the same source brings fresh raw tags: the canonical pass (category-canonicalize.ts,
      -- run at the end of this file) must copy THEM into category_tags_raw, not read the stale copy.
      category_tags_raw = CASE WHEN product.source = excluded.source THEN NULL ELSE product.category_tags_raw END,
      leaf_category_raw = CASE WHEN product.source = excluded.source THEN NULL ELSE product.leaf_category_raw END,
      category_rejected = CASE WHEN product.source = excluded.source THEN NULL ELSE product.category_rejected END,
      allergens = CASE WHEN product.source = excluded.source THEN excluded.allergens
                       ELSE COALESCE(NULLIF(NULLIF(product.allergens, ''), '[]'), excluded.allergens) END,
      image_url = CASE WHEN product.source = excluded.source THEN excluded.image_url
                       ELSE COALESCE(NULLIF(TRIM(product.image_url), ''), excluded.image_url) END,
      -- A fact, never a preference: one source saying a product is sold in Canada
      -- is not undone by another source that does not say so.
      sold_in_canada = max(product.sold_in_canada, excluded.sold_in_canada),
      source = CASE WHEN product.source = excluded.source THEN excluded.source ELSE product.source END,
      generic_name = CASE WHEN product.source = excluded.source THEN excluded.generic_name
                          ELSE COALESCE(NULLIF(TRIM(product.generic_name), ''), excluded.generic_name) END,
      nutriscore_grade = CASE WHEN product.source = excluded.source THEN excluded.nutriscore_grade
                              ELSE COALESCE(NULLIF(TRIM(product.nutriscore_grade), ''), excluded.nutriscore_grade) END,
      nova_group = CASE WHEN product.source = excluded.source THEN excluded.nova_group
                        ELSE COALESCE(product.nova_group, excluded.nova_group) END,
      additives_n = CASE WHEN product.source = excluded.source THEN excluded.additives_n
                         ELSE COALESCE(product.additives_n, excluded.additives_n) END,
      ingredients_text = CASE WHEN product.source = excluded.source THEN excluded.ingredients_text
                              ELSE COALESCE(NULLIF(TRIM(product.ingredients_text), ''), excluded.ingredients_text) END
  `);

  const rl = createInterface({
    input: createReadStream(ROWS_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let read = 0;
  let malformed = 0;
  let inBatch = 0;
  db.exec('BEGIN');

  for await (const line of rl) {
    if (line.length === 0) continue;
    let r: PreparedRow;
    try {
      r = JSON.parse(line) as PreparedRow;
    } catch {
      malformed += 1;
      continue;
    }
    insert.run(
      canonicalCode(r.code),
      r.name,
      r.name_en,
      r.name_fr,
      r.brands,
      r.quantity,
      r.size_value,
      r.size_unit,
      JSON.stringify(r.category_path ?? []),
      r.leaf_category,
      JSON.stringify(r.allergens ?? []),
      r.image_url,
      r.sold_in_canada ? 1 : 0,
      r.source,
      r.generic_name ?? null,
      r.nutriscore_grade ?? null,
      r.nova_group ?? null,
      r.additives_n ?? null,
      r.ingredients_text ?? null,
    );
    read += 1;
    inBatch += 1;
    if (inBatch >= BATCH) {
      db.exec('COMMIT');
      db.exec('BEGIN');
      inBatch = 0;
      if (read % 20000 === 0) process.stdout.write(`  ${read}\r`);
    }
  }
  db.exec('COMMIT');

  process.stdout.write('rebuilding text index...\r');
  rebuildFts(db);
  /*
   * The canonical category pass (category-canonicalize.ts): resolve every label against the taxonomy,
   * pick one leaf and one chain per Open Food Facts product, and rebuild product_category from the
   * result. A missing taxonomy STOPS the load here, after the rows are in but before the index is
   * rebuilt, and says so; it never falls back to the old lower-casing rebuild.
   */
  process.stdout.write('canonicalizing categories...\r');
  let tax: Taxonomy;
  try {
    tax = loadTaxonomy(TAXONOMY_PATH, { aliasesPath: ALIASES_PATH });
  } catch (err) {
    console.error(`load STOPPED: the category taxonomy is unavailable (${err instanceof Error ? err.message : String(err)}). Run "npm run fetch:categories", then "node src/category-canonicalize.ts --db ${DB_PATH}".`);
    return 1;
  }
  const canon = canonicalizeCatalogue(db, { taxonomy: tax });
  if (!canon.ok) {
    console.error('load STOPPED: the category pass failed (see the counts above).');
    return 1;
  }

  // Counted from the table, never from the loop above.
  const total = db.prepare('SELECT count(*) AS n FROM product').get() as { n: number };
  const canada = db
    .prepare('SELECT count(*) AS n FROM product WHERE sold_in_canada = 1')
    .get() as { n: number };
  const sized = db
    .prepare('SELECT count(*) AS n FROM product WHERE size_value IS NOT NULL')
    .get() as { n: number };
  const bilingual = db
    .prepare('SELECT count(*) AS n FROM product WHERE name_en IS NOT NULL AND name_fr IS NOT NULL')
    .get() as { n: number };
  const fts = db.prepare('SELECT count(*) AS n FROM product_fts').get() as { n: number };
  const cats = db.prepare('SELECT count(*) AS n FROM product_category').get() as { n: number };
  const catProducts = db
    .prepare('SELECT count(DISTINCT rowid_ref) AS n FROM product_category')
    .get() as { n: number };

  // Item 25's five quality fields. Counted from the table, same as everything
  // above, so this reports what actually landed rather than what the loader
  // tried to write.
  const genericName = db
    .prepare('SELECT count(*) AS n FROM product WHERE generic_name IS NOT NULL').get() as { n: number };
  const nutriscore = db
    .prepare('SELECT count(*) AS n FROM product WHERE nutriscore_grade IS NOT NULL').get() as { n: number };
  const nova = db
    .prepare('SELECT count(*) AS n FROM product WHERE nova_group IS NOT NULL').get() as { n: number };
  const additives = db
    .prepare('SELECT count(*) AS n FROM product WHERE additives_n IS NOT NULL').get() as { n: number };
  const ingredients = db
    .prepare('SELECT count(*) AS n FROM product WHERE ingredients_text IS NOT NULL').get() as { n: number };

  console.log(`lines read        ${read}`);
  console.log(`malformed         ${malformed}`);
  console.log(`rows in product   ${total.n}`);
  console.log(`  sold in Canada  ${canada.n}`);
  console.log(`  with a size     ${sized.n}`);
  console.log(`  EN and FR both  ${bilingual.n}`);
  console.log(`rows in text index ${fts.n}`);
  console.log(`category memberships ${cats.n} across ${catProducts.n} products`);
  console.log(`  with generic_name       ${genericName.n}`);
  console.log(`  with nutriscore_grade   ${nutriscore.n}`);
  console.log(`  with nova_group         ${nova.n}`);
  console.log(`  with additives_n        ${additives.n}`);
  console.log(`  with ingredients_text   ${ingredients.n}`);

  if (fts.n !== total.n) {
    console.error(`text index out of step with the table: ${fts.n} vs ${total.n}`);
    return 1;
  }
  return total.n > 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
