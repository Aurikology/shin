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
import { openCatalogue, rebuildFts, rebuildCategories } from './schema.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const ROWS_PATH = process.argv[2] ?? 'data/rows.jsonl';
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
}

async function main(): Promise<number> {
  const db = openCatalogue(DB_PATH);

  // Re-runnable: the same dump loaded twice must not double the catalogue, and
  // a re-run after an upstream refresh must update rather than conflict.
  const insert = db.prepare(`
    INSERT INTO product (
      code, name, name_en, name_fr, brands, quantity, size_value, size_unit,
      category_path, leaf_category, allergens, image_url, sold_in_canada, source
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET
      name=excluded.name, name_en=excluded.name_en, name_fr=excluded.name_fr,
      brands=excluded.brands, quantity=excluded.quantity,
      size_value=excluded.size_value, size_unit=excluded.size_unit,
      category_path=excluded.category_path, leaf_category=excluded.leaf_category,
      allergens=excluded.allergens, image_url=excluded.image_url,
      sold_in_canada=excluded.sold_in_canada, source=excluded.source
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
      r.code,
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
  process.stdout.write('rebuilding category index...\r');
  rebuildCategories(db);

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

  console.log(`lines read        ${read}`);
  console.log(`malformed         ${malformed}`);
  console.log(`rows in product   ${total.n}`);
  console.log(`  sold in Canada  ${canada.n}`);
  console.log(`  with a size     ${sized.n}`);
  console.log(`  EN and FR both  ${bilingual.n}`);
  console.log(`rows in text index ${fts.n}`);
  console.log(`category memberships ${cats.n} across ${catProducts.n} products`);

  if (fts.n !== total.n) {
    console.error(`text index out of step with the table: ${fts.n} vs ${total.n}`);
    return 1;
  }
  return total.n > 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
