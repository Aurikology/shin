/**
 * US product names from an old Kroger product file, so a US barcode that has a
 * USD price but no catalogue row gets a name (2026-11-22).
 *
 * SOURCE. https://raw.githubusercontent.com/atehe/stores_scrapers/master/kroger_products.csv
 * (about 22 MB, 102,604 rows, scraped 2022). Columns, read 2026-11-22:
 *   name,subcategory,category,product_id,url,price
 * Names are Kroger's own listing names, sometimes carrying (R), (TM) marks.
 *
 * WHAT IS TAKEN. Name, and a size when the name states one. There is no brand
 * column, so brand is left empty rather than guessed. THE 2022 PRICES ARE NOT
 * READ INTO ANYTHING: the `price` column is dropped at the parse and no
 * observation row is ever written by this file. It makes catalogue rows only.
 *
 * THE BARCODE. `product_id` is 13 digits. For 98,257 of the 102,603 rows it is
 * "00" + the 11 digits of a UPC-A WITHOUT its check digit. Checked 2026-11-22
 * against Open Food Facts on five of them: appending the UPC-A check digit
 * gives a code Open Food Facts knows (e.g. 0013000008549 "Distilled white
 * vinegar", 0044000048341 "Pie crust"). So this file computes the check digit
 * and spells the result as the catalogue does (13 digits, zero-led, via
 * hammer.ts's `hammerCode`). The other 4,346 ids start with something other
 * than "00" (a different Kroger scheme, not checked) and ids whose 11-digit
 * body has under 7 significant digits look like produce PLUs, not barcodes;
 * both are skipped and counted, never guessed (4,584 rows). Result on the whole
 * file, 2026-11-22: 84,863 distinct barcodes usable, 13,157 repeat listings.
 *
 * ONLY WHAT THE CATALOGUE LACKS. Rows are written for barcodes the catalogue
 * does not already hold (pass `--catalogue <db>` to say which database). The
 * loader (catalogue/src/load.ts) keeps the first writer anyway, so a barcode
 * that slipped through still keeps its existing row. `sold_in_canada` is 0:
 * these are US listings and nothing here says they are sold in Canada.
 *
 *   node price/src/kroger-names.ts <kroger_products.csv> --catalogue-rows <out.jsonl> [--catalogue <catalogue.db>]
 *   SHIN_CATALOGUE=<catalogue.db> node catalogue/src/load.ts --no-placement <out.jsonl>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CsvReader, hammerCode } from './hammer.ts';
import { parseQuantity } from '../../catalogue/src/units.ts';
import { krogerDepartment } from './kroger-departments.ts';
import * as settings from '../../settings/src/index.ts';

/** `product.source` for these rows; app/src/attribution.ts credits it. */
export const SELLER = 'kroger-names';

export interface KrogerProduct {
  readonly name: string;
  readonly code: string;
  /** Pexi department from the file's category and subcategory; null when the category is not in the table (kroger-departments.ts). */
  readonly department?: string | null;
}

/** UPC check digit for an 11-digit body: odd positions (1st, 3rd, ...) weigh 3. */
export function upcCheckDigit(body11: string): number {
  let sum = 0;
  for (let i = 0; i < body11.length; i++) sum += Number(body11[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * The catalogue spelling of a Kroger `product_id`, or null when it is not a
 * "00"-led 13-digit id with a barcode-sized body.
 */
export function krogerCode(productId: string): string | null {
  const id = productId.trim();
  if (!/^00\d{11}$/.test(id)) return null;
  const body = id.slice(2);
  if (body.replace(/^0+/, '').length < 7) return null;
  return hammerCode(body + String(upcCheckDigit(body)));
}

/** Kroger's listing names carry registered-trade-mark signs and stray spacing; the words are kept. */
export function cleanName(raw: string): string {
  return raw.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();
}

export interface ReadResult {
  readonly products: KrogerProduct[];
  readonly rows: number;
  readonly skippedOtherIdScheme: number;
  readonly skippedNoName: number;
  readonly duplicates: number;
  /** Usable barcodes whose category is not in the mapping table, by category value. Print these; never treat them as food. */
  readonly unmapped: Record<string, number>;
}

/** Parse the file. The price column is read past and discarded here. */
export function readKroger(csvText: string): ReadResult {
  const products: KrogerProduct[] = [];
  const seen = new Set<string>();
  let rows = 0;
  let skippedOtherIdScheme = 0;
  let skippedNoName = 0;
  let duplicates = 0;
  const unmapped: Record<string, number> = {};
  let header: string[] | null = null;
  const r = new CsvReader((row) => {
    if (header === null) {
      header = row;
      return;
    }
    if (row.length < 6) return;
    rows += 1;
    const name = cleanName(row[0] ?? '');
    const code = krogerCode(row[3] ?? '');
    if (code === null) {
      skippedOtherIdScheme += 1;
      return;
    }
    if (!name) {
      skippedNoName += 1;
      return;
    }
    if (seen.has(code)) {
      duplicates += 1;
      return;
    }
    seen.add(code);
    const department = krogerDepartment(row[2] ?? '', row[1] ?? '');
    if (department === null) {
      const key = (row[2] ?? '').trim() || '(empty)';
      unmapped[key] = (unmapped[key] ?? 0) + 1;
    }
    products.push({ name, code, department });
  });
  r.push(csvText);
  r.end();
  return { products, rows, skippedOtherIdScheme, skippedNoName, duplicates, unmapped };
}

/** One catalogue row (catalogue/src/load.ts PreparedRow), shaped like hammer.ts's `catalogueRow`. No category is claimed. */
export function catalogueRow(p: KrogerProduct): Record<string, unknown> {
  const q = parseQuantity(p.name);
  return {
    code: p.code,
    name: p.name,
    name_en: p.name,
    name_fr: null,
    brands: null,
    quantity: q ? `${q.value} ${q.unit}` : null,
    size_value: q ? q.value : null,
    size_unit: q ? q.unit : null,
    category_path: [],
    leaf_category: null,
    allergens: [],
    image_url: null,
    sold_in_canada: 0,
    source: SELLER,
    department: p.department ?? null,
  };
}

/** Rows for the barcodes `has` says the catalogue lacks. */
export function rowsForMissing(products: readonly KrogerProduct[], has: (code: string) => boolean): Record<string, unknown>[] {
  return products.filter((p) => !has(p.code)).map(catalogueRow);
}

function main(): void {
  const argv = process.argv.slice(2);
  const csv = argv[0];
  const flag = (n: string): string | undefined => {
    const i = argv.indexOf(n);
    return i === -1 ? undefined : argv[i + 1];
  };
  const out = flag('--catalogue-rows');
  if (!csv || !out) {
    console.error('usage: node price/src/kroger-names.ts <kroger_products.csv> --catalogue-rows <out.jsonl> [--catalogue <catalogue.db>]');
    process.exit(2);
  }
  const parsed = readKroger(readFileSync(csv, 'utf8'));
  const catPath = flag('--catalogue') ?? settings.SHIN_CATALOGUE();
  let has = (_code: string): boolean => false;
  let cat: DatabaseSync | null = null;
  if (catPath) {
    cat = new DatabaseSync(catPath, { readOnly: true });
    const q = cat.prepare('SELECT 1 FROM product WHERE code = ?');
    has = (code) => q.get(code) !== undefined;
  }
  const rows = rowsForMissing(parsed.products, has);
  cat?.close();
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  console.log(
    `kroger-names: ${parsed.rows} file rows, ${parsed.products.length} usable barcodes, ` +
      `${parsed.skippedOtherIdScheme} skipped (id not a UPC body), ${parsed.duplicates} duplicates; ` +
      `${rows.length} not in the catalogue${catPath ? '' : ' (no catalogue given, so every barcode counts as missing)'} -> ${out}`,
  );
  const unmappedTotal = Object.values(parsed.unmapped).reduce((a, b) => a + b, 0);
  if (unmappedTotal > 0) {
    console.error(`kroger-names: WARNING ${unmappedTotal} barcodes have a category with no department mapping (they keep the source department): ${JSON.stringify(parsed.unmapped)}`);
  }
}

if (import.meta.filename === process.argv[1]) main();
