/**
 * BC Liquor Distribution Branch's public price list, unit 3 of the
 * 2026-09-26 catalogue build plan (`docs/catalogue-build-plan-2026-09-26.md`).
 *
 * SOURCE: the BC Open Government Licence CSV, no login, republished monthly:
 *   https://catalogue.data.gov.bc.ca/dataset/bc-liquor-store-product-price-list-historical-prices
 *   https://catalogue.data.gov.bc.ca/dataset/e43be180-7511-4e6f-84d3-ad6c9f5c3e2b/resource/09a4eba7-c357-4764-8ef8-5f0499e11a3e/download/bc_liquor_store_product_price_list_june_2026.csv
 * Verified 2026-09-26: HTTP 200, 988,625 bytes, 8,211 data rows, 7,556 of them
 * carrying a UPC in PRODUCT_BASE_UPC_NO, one of those 7,556 UPCs (62067427152,
 * Michelob Ultra Zero, a 6-pack and a single under two different SKUs) repeated
 * once, so 7,555 distinct barcodes -- both counts match the plan's own numbers
 * to the row.
 *
 * PRICE FIELD. The dataset carries exactly one price column, PRODUCT_PRICE,
 * and the publisher's own metadata says it plainly: "prices shown do not
 * include taxes and are subject to change." There is no second, tax-inclusive
 * shelf-price column here the way New Brunswick's PDF carries one -- this file
 * has nothing to keep in a separate field. Every `priceCents` this loader
 * writes is that one pre-tax PRODUCT_PRICE column, converted to integer cents
 * by string arithmetic (never a float, never Math.round(x*100), which can land
 * one cent off on values like 19.99 * 100 depending on the exact double).
 *
 * BARCODE REPAIR, then CANONICALISATION. Found 2026-09-26: the publisher's
 * numeric-looking UPC column has lost leading zeros the way a spreadsheet does
 * to "00123" -- 1,439 rows arrived 11 digits long, 7 at 10, 3 at 9, every one
 * of them a real 12-digit UPC-A (81753830175 is really 081753830175, Cape
 * Mentelle Shiraz Cabernet). `repairShortUpc` left-pads a 9-11 digit numeric
 * code back to 12 before canonicalisation ever sees it; a code under 8 digits
 * even after that is too corrupted to trust and is skipped, counted, never
 * stored. Then `canonicalCode`, the same rule catalogue/src/load.ts uses,
 * copied rather than imported because this package does not depend on
 * catalogue/: a 12-digit UPC-A gets one leading zero (GTIN-13 spelling), a
 * 14-digit code starting with 0 loses that zero, and everything else --
 * including the 8-digit EAN-8 codes in this file -- passes through untouched.
 * An 8-digit code is a different symbology, not a truncated EAN-13, so padding
 * it to 13 would assert a barcode nobody printed.
 *
 * JOIN METHOD. This source publishes the barcode itself, so every row here
 * joins by `gtin`, the same as crawl.ts's Walmart rows that read a UPC off the
 * seller's own page -- no name matching, no candidate search.
 */

import { readFileSync } from 'node:fs';
import { openPrices, recordObservation, type ObservationRow } from './store.ts';

export const SELLER = 'bcldb';

const DEFAULT_CSV = new URL(
  '../data/bc_liquor_store_product_price_list_june_2026.csv',
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * Same rule catalogue/src/load.ts's canonicalCode uses: only a 12-digit code is
 * padded, and only a 14-digit code whose leading digit is 0 is shortened. An
 * 8-digit EAN-8, and anything else that is not exactly 12 or 0-led-14 digits,
 * is passed through untouched.
 */
export function canonicalCode(code: string): string {
  const digits = code.trim();
  if (!/^\d+$/.test(digits)) return code;
  if (digits.length === 12) return `0${digits}`;
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/**
 * The publisher's own CSV column is numeric-looking, and something between the
 * publisher and this parser strips leading zeros from a numeric column -- the
 * same thing a spreadsheet does to "00123". Found 2026-09-26 by the coordinator
 * reading the loaded distribution back out of the database: 1,439 rows landed
 * at 11 digits, 7 at 10, 3 at 9, all real 12-digit UPC-A codes missing 1, 2 or
 * 3 leading zeros (e.g. 81753830175 -> Cape Mentelle Shiraz Cabernet is really
 * 081753830175). None of those would ever join to the catalogue's 13-digit
 * spelling, silently, because `canonicalCode` only special-cases an exact
 * 12-digit code.
 *
 * The fix belongs in the parse, not in `canonicalCode`, which stays the shared
 * rule catalogue/src/load.ts also uses: a 9, 10 or 11 digit numeric code is
 * left-padded back to 12 here, before `canonicalCode` ever sees it, so 11
 * becomes 12 becomes (there) 13. An 8-digit code is EAN-8, a real and
 * different symbology that was never 12 digits, so it is returned unchanged.
 * Anything under 8 digits is too short to trust as a lost-zero UPC-A -- padding
 * it would fabricate digits nobody printed -- so it is rejected (null) and the
 * caller must skip and count the row, not store a code that can never join.
 * A code already 12 digits or longer is also returned unchanged; it is not
 * this function's job.
 */
export function repairShortUpc(digits: string): string | null {
  if (!/^\d+$/.test(digits)) return digits;
  if (digits.length < 8) return null;
  if (digits.length === 8) return digits;
  if (digits.length >= 9 && digits.length <= 11) return digits.padStart(12, '0');
  return digits;
}

/**
 * Minimal RFC 4180 line splitter: quoted fields, commas inside quotes, and a
 * doubled `""` as an escaped quote (the file has both -- see
 * `BIG ROCK - "THE ROCK BOX" SIGNATURE 15 PACK CAN`). A plain `split(',')`
 * would shift every column on a quoted field, silently, which is exactly the
 * kind of wrong parse this loader's falsifier exists to catch.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * "19.99", "2000", "1.99" -> integer cents, by string arithmetic so no float
 * ever touches the number. Returns null for anything that is not plain digits
 * with at most two decimal places, which the loader treats as a parse failure,
 * never as a silent zero.
 */
export function toCents(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, fracRaw] = s.split('.');
  const frac = (fracRaw ?? '').padEnd(2, '0');
  return Number(whole) * 100 + Number(frac);
}

interface ParsedCsv {
  readonly header: readonly string[];
  readonly rows: readonly string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

function columnIndex(header: readonly string[], name: string): number {
  const i = header.indexOf(name);
  if (i === -1) {
    throw new Error(
      `bcldb: expected column "${name}" in the CSV header, got: ${header.join(', ')}. ` +
        `Stopping -- the plan's column mapping no longer matches the file.`,
    );
  }
  return i;
}

export interface LoadResult {
  readonly written: number;
  readonly skippedNoUpc: number;
  readonly skippedBadPrice: number;
  readonly skippedShortUpc: number;
}

export async function loadBcldb(csvPath: string = DEFAULT_CSV): Promise<LoadResult> {
  const text = readFileSync(csvPath, 'utf8');
  const { header, rows } = parseCsv(text);

  const UPC = columnIndex(header, 'PRODUCT_BASE_UPC_NO');
  const SKU = columnIndex(header, 'PRODUCT_SKU_NO');
  const NAME = columnIndex(header, 'PRODUCT_LONG_NAME');
  const PRICE = columnIndex(header, 'PRODUCT_PRICE');

  const db = openPrices();
  const today = new Date().toISOString().slice(0, 10);

  let written = 0;
  let skippedNoUpc = 0;
  let skippedBadPrice = 0;
  let skippedShortUpc = 0;

  for (let i = 0; i < rows.length; i++) {
    const fields = rows[i];
    const upcRaw = (fields[UPC] ?? '').trim();
    if (upcRaw === '') {
      skippedNoUpc++;
      continue;
    }

    const repaired = repairShortUpc(upcRaw);
    if (repaired === null) {
      /* Under 8 digits even after the lost-leading-zero repair: too corrupted
       * to trust as a barcode, so it is skipped and counted, never stored as a
       * code that can never join. */
      console.error(
        `bcldb: row ${i + 2}: upc "${upcRaw}" is under 8 digits even after left-pad repair -- skipped, cannot join`,
      );
      skippedShortUpc++;
      continue;
    }

    const priceCents = toCents(fields[PRICE] ?? '');
    if (priceCents === null || priceCents <= 0) {
      /* The plan's falsifier: the source never contains a zero, negative or
       * absent price on a row that carries a barcode, so landing here means
       * this parser is wrong, not that the row is thin. Logged loudly rather
       * than silently dropped. */
      console.error(
        `bcldb: row ${i + 2}: unusable price "${fields[PRICE]}" for upc ${upcRaw} -- skipped, not written as 0`,
      );
      skippedBadPrice++;
      continue;
    }

    const row: ObservationRow = {
      code: canonicalCode(repaired),
      seller: SELLER,
      sellerSku: fields[SKU],
      sellerName: fields[NAME],
      sellerBrand: null,
      priceCents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
      currency: 'CAD',
      country: 'CA',
      region: 'British Columbia',
      joinMethod: 'gtin',
      seenOn: today,
      url: null,
      imageUrl: null,
      inStock: null,
      pageGtin: upcRaw,
    };
    recordObservation(db, row);
    written++;
  }

  return { written, skippedNoUpc, skippedBadPrice, skippedShortUpc };
}

async function main(): Promise<void> {
  const csvPath = process.argv[2] ?? DEFAULT_CSV;
  const { written, skippedNoUpc, skippedBadPrice, skippedShortUpc } = await loadBcldb(csvPath);
  console.log(
    `bcldb: ${written} observations written, ${skippedNoUpc} rows with no UPC skipped, ` +
      `${skippedBadPrice} priced-looking rows failed to parse, ${skippedShortUpc} upcs too short to repair.`,
  );
  if (skippedBadPrice > 0) {
    console.error(
      `bcldb: ${skippedBadPrice} rows failed price parsing. The source is documented to never ` +
        `contain a zero, negative or absent price on a barcoded row, so this is a bug here, not a thin source.`,
    );
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
