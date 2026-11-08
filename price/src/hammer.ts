/**
 * Project Hammer's Canadian grocery prices (jacobfilipp.com/hammer,
 * projecthammer.org), imported on Jamin's instruction 2026-11-07: *"scrap the
 * data from project hammer"* (RULINGS "Project Hammer prices are imported").
 *
 * SOURCE. hammer-5-csv.zip from https://jacobfilipp.com/hammerdata/hammer-5-csv.zip
 * (539 MB, refreshed 2026-11-07), two files:
 *   hammer-4-product.csv  id,concatted,vendor,product_name,units,brand,detail_url,sku,upc
 *   hammer-4-raw.csv      nowtime,current_price,old_price,price_per_unit,other,product_id
 * raw.product_id joins product.id. Prices are the vendors' in-store-pickup
 * prices for one Toronto neighbourhood, so every row is region ON, city Toronto.
 *
 * WHAT IS WRITTEN. One observation per product that carries a barcode: its
 * most recent raw row (largest nowtime). When that row has an old_price, the
 * current price is a sale: it is written as `promotional` with `wasCents` set
 * to the old price, and the old price is also written as the `regular` row for
 * the same day under the sku suffix `#regular`, so a range built from regular
 * prices still has this product. A product with no barcode is counted and
 * skipped: Pexi answers by barcode.
 *
 * JOIN METHOD. Project Hammer says UPCs came straight from the vendor for
 * Metro, Galleria and Save-On-Foods (joined `gtin`); Walmart's were matched
 * from another site and Loblaws, No Frills, T&T and Voila's by fuzzy matching
 * (joined `name`, which the price engine already weighs lower,
 * spine/src/sources/observed.ts). Sobeys is not described there and is `name`.
 *
 * Run: SHIN_PRICES=<prices.db> node price/src/hammer.ts <dir holding the two CSVs>
 */

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPrices, recordObservation, type ObservationRow } from './store.ts';
import { registerSource, requireSourceUse, currentRegistry } from './registry.ts';
import { canonicalCode, repairShortUpc, toCents } from './bcldb.ts';
import { parseQuantity } from '../../catalogue/src/units.ts';

export const SELLER = 'hammer';

const VENDOR_NAMES: Readonly<Record<string, string>> = {
  Voila: 'Voila',
  Galleria: 'Galleria',
  Loblaws: 'Loblaws',
  Metro: 'Metro',
  NoFrills: 'No Frills',
  SaveOnFoods: 'Save-On-Foods',
  TandT: 'T&T',
  Walmart: 'Walmart',
  Sobeys: 'Sobeys',
};

/** Vendors whose UPCs Project Hammer says came directly from the vendor. */
const DIRECT_UPC = new Set(['Metro', 'Galleria', 'SaveOnFoods']);

/**
 * Quote-aware CSV reader over a string or a stream of chunks: fields may hold
 * commas, doubled quotes and newlines. Calls `onRow` once per record.
 */
export class CsvReader {
  private row: string[] = [];
  private cell = '';
  private quoted = false;
  private pendingQuote = false;
  private readonly onRow: (row: string[]) => void;
  constructor(onRow: (row: string[]) => void) {
    this.onRow = onRow;
  }
  push(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (this.pendingQuote) {
        this.pendingQuote = false;
        if (ch === '"') { this.cell += '"'; continue; }
        this.quoted = false;
      }
      if (this.quoted) {
        if (ch === '"') this.pendingQuote = true;
        else this.cell += ch;
      } else if (ch === '"') this.quoted = true;
      else if (ch === ',') { this.row.push(this.cell); this.cell = ''; }
      else if (ch === '\n') { this.row.push(this.cell.replace(/\r$/, '')); this.onRow(this.row); this.row = []; this.cell = ''; }
      else this.cell += ch;
    }
  }
  end(): void {
    if (this.pendingQuote) { this.pendingQuote = false; this.quoted = false; }
    if (this.cell !== '' || this.row.length > 0) { this.row.push(this.cell.replace(/\r$/, '')); this.onRow(this.row); }
    this.row = []; this.cell = '';
  }
}

export interface HammerProduct {
  readonly id: string;
  readonly vendor: string;
  readonly name: string;
  readonly units: string;
  readonly brand: string;
  readonly url: string;
  readonly sku: string;
  readonly code: string | null;
}

/** Barcode as Pexi spells it, or null when the UPC is absent or unusable. */
export function hammerCode(rawUpc: string): string | null {
  const digits = rawUpc.trim();
  if (!/^\d+$/.test(digits)) return null;
  const repaired = digits.length >= 9 && digits.length <= 11 ? repairShortUpc(digits) : digits;
  if (repaired === null || repaired.length < 8 || repaired.length > 14) return null;
  if (/^0+$/.test(repaired)) return null;
  return canonicalCode(repaired);
}

export function readProducts(csvText: string): Map<string, HammerProduct> {
  const out = new Map<string, HammerProduct>();
  let header: string[] | null = null;
  const r = new CsvReader((row) => {
    if (header === null) { header = row; return; }
    if (row.length !== 9) return;
    const [id, , vendor, name, units, brand, url, sku, upc] = row;
    if (!VENDOR_NAMES[vendor] || !id) return;
    out.set(id, { id, vendor, name, units, brand, url, sku, code: hammerCode(upc) });
  });
  r.push(csvText);
  r.end();
  return out;
}

export interface LatestPrice {
  readonly day: string; // YYYYMMDD
  readonly current: string;
  readonly old: string;
  readonly perUnit: string;
  readonly other: string;
}

/** Streams the raw file and keeps each wanted product's most recent row. */
export async function readLatest(path: string, wanted: ReadonlySet<string>): Promise<{ latest: Map<string, LatestPrice>; rows: number; minDay: string; maxDay: string }> {
  const latest = new Map<string, LatestPrice>();
  let rows = 0;
  let minDay = '99999999';
  let maxDay = '00000000';
  let header = true;
  const r = new CsvReader((row) => {
    if (header) { header = false; return; }
    if (row.length !== 6) return;
    const [day, current, old, perUnit, other, productId] = row;
    if (!/^\d{8}$/.test(day)) return;
    rows++;
    if (day < minDay) minDay = day;
    if (day > maxDay) maxDay = day;
    if (!wanted.has(productId)) return;
    const prev = latest.get(productId);
    if (!prev || day >= prev.day) latest.set(productId, { day, current, old, perUnit, other });
  });
  await new Promise<void>((resolve, reject) => {
    const s = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 });
    s.on('data', (c) => r.push(String(c)));
    s.on('end', () => { r.end(); resolve(); });
    s.on('error', reject);
  });
  return { latest, rows, minDay, maxDay };
}

function isoDay(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/**
 * From July 2026 Project Hammer writes about 4 in 10 Walmart prices in cents with no decimal point:
 * "2196" for a $21.96 coffee (its per-unit field, $3.43/100g on 641 g, agrees), "197" for $1.97
 * English muffins. Counted 2026-11-08 over hammer-4-raw.csv: Walmart integer prices were 0 to 2 percent
 * of rows each month until 2026-07, then 12, 37 and 15 percent; every other vendor stays under
 * 1 percent (whole-dollar prices such as Galleria's "83" honey). Read as dollars they were 100 times
 * too high. So a Walmart integer price on or after 2026-07-01 is cents when it is 100 or more; under
 * 100 it could be either (45 cents or $45), and the price is not used.
 */
export const WALMART_CENTS_FROM = '20260701';

/** A Hammer price field as cents, or null when it is not a usable price. */
export function hammerCents(vendor: string, day: string, text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (vendor === 'Walmart' && day >= WALMART_CENTS_FROM && /^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 100 ? n : null;
  }
  return toCents(t);
}

/** The observations one product's latest row turns into (one, or two on a sale). */
export function observationsFor(p: HammerProduct, l: LatestPrice): ObservationRow[] {
  const cents = hammerCents(p.vendor, l.day, l.current);
  if (p.code === null || cents === null || cents <= 0) return [];
  const was = l.old.trim() ? hammerCents(p.vendor, l.day, l.old) : null;
  const sale = was !== null && was > cents;
  const base = {
    code: p.code,
    seller: SELLER,
    sellerName: p.units ? `${p.name} ${p.units}` : p.name,
    sellerBrand: p.brand || null,
    unitPriceCents: null,
    unitLabel: l.perUnit.trim() || null,
    currency: 'CAD',
    country: 'CA',
    region: 'ON',
    joinMethod: DIRECT_UPC.has(p.vendor) ? ('gtin' as const) : ('name' as const),
    seenOn: isoDay(l.day),
    url: p.url || null,
    imageUrl: null,
    inStock: /out of stock/i.test(l.other) ? 0 : null,
    storeName: VENDOR_NAMES[p.vendor],
    storeCity: 'Toronto',
  };
  const rows: ObservationRow[] = [
    { ...base, sellerSku: p.id, priceCents: cents, kind: sale ? 'promotional' : 'regular', wasCents: sale ? was : null, isSale: sale ? 1 : 0 },
  ];
  if (sale) rows.push({ ...base, sellerSku: `${p.id}#regular`, priceCents: was!, kind: 'regular', wasCents: null, isSale: 0 });
  return rows;
}

export function ensureRegistered(db: ReturnType<typeof openPrices>): void {
  if (currentRegistry(db).some((e) => e.seller === SELLER && e.access === 'automated')) return;
  registerSource(db, {
    seller: SELLER,
    access: 'automated',
    basis: 'unknown',
    evidence:
      'Project Hammer dataset (Jacob Filipp): vendor in-store-pickup prices for one Toronto neighbourhood, ' +
      'downloaded as hammer-5-csv.zip on 2026-11-07. No licence is stated on the page. Imported on Jamin\'s ' +
      'instruction 2026-11-07: "scrap the data from project hammer".',
    evidenceUrl: 'https://jacobfilipp.com/hammer/',
    readOn: '2026-11-07',
    automated: 'not_recorded',
    cite: 'RULINGS.md "Project Hammer prices are imported"',
  });
}

/**
 * One catalogue row (catalogue/src/load.ts PreparedRow) per barcoded Hammer
 * product, so a priced barcode the catalogue never knew gets a name instead of
 * manual entry. Measured 2026-11-07 on 200 random Hammer barcodes against the
 * live server: 99 catalogue hits, 25 named by Open Food Facts, 75 unknown.
 * load.ts keeps the first writer: a barcode already in the catalogue keeps its
 * row and these fields only fill its blanks. No category is claimed.
 */
export function catalogueRow(p: HammerProduct): Record<string, unknown> | null {
  if (p.code === null || !p.name.trim()) return null;
  const q = parseQuantity(p.units);
  return {
    code: p.code,
    name: p.name.trim(),
    name_en: p.name.trim(),
    name_fr: null,
    brands: p.brand.trim() || null,
    quantity: p.units.trim() || null,
    size_value: q ? q.value : null,
    size_unit: q ? q.unit : null,
    category_path: [],
    leaf_category: null,
    allergens: [],
    image_url: null,
    sold_in_canada: 1,
    source: SELLER,
  };
}

function writeCatalogueRows(products: Map<string, HammerProduct>, out: string): void {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const p of products.values()) {
    const r = catalogueRow(p);
    if (r === null || seen.has(p.code!)) continue;
    seen.add(p.code!);
    lines.push(JSON.stringify(r));
  }
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`hammer: wrote ${lines.length} catalogue rows to ${out} (load with: SHIN_CATALOGUE=<catalogue.db> node catalogue/src/load.ts --no-placement ${out})`);
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: SHIN_PRICES=<prices.db> node price/src/hammer.ts <dir with hammer-4-product.csv and hammer-4-raw.csv>');
    console.error('       node price/src/hammer.ts <dir> --catalogue-rows <out.jsonl>   (writes catalogue rows, no database touched)');
    process.exit(2);
  }
  const products = readProducts(readFileSync(join(dir, 'hammer-4-product.csv'), 'utf8'));
  const rowsAt = process.argv.indexOf('--catalogue-rows');
  if (rowsAt !== -1) {
    const out = process.argv[rowsAt + 1];
    if (!out) { console.error('--catalogue-rows needs an output path'); process.exit(2); }
    writeCatalogueRows(products, out);
    return;
  }
  const withCode = new Set([...products.values()].filter((p) => p.code !== null).map((p) => p.id));
  console.log(`hammer: ${products.size} products, ${withCode.size} with a usable barcode`);
  const { latest, rows, minDay, maxDay } = await readLatest(join(dir, 'hammer-4-raw.csv'), withCode);
  console.log(`hammer: ${rows} price rows from ${minDay} to ${maxDay}; ${latest.size} barcoded products have a price`);

  const db = openPrices(undefined, { enforceSources: true });
  ensureRegistered(db);
  requireSourceUse(db, SELLER, 'automated');
  let written = 0;
  let skippedPrice = 0;
  const byVendor: Record<string, number> = {};
  db.exec('BEGIN');
  try {
    for (const [id, l] of latest) {
      const p = products.get(id)!;
      const obs = observationsFor(p, l);
      if (obs.length === 0) { skippedPrice++; continue; }
      for (const o of obs) recordObservation(db, o);
      written += obs.length;
      byVendor[p.vendor] = (byVendor[p.vendor] ?? 0) + 1;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const distinct = db.prepare('SELECT COUNT(DISTINCT code) AS n FROM observation WHERE seller = ?').get(SELLER) as { n: number };
  console.log(`hammer: wrote ${written} observations; ${skippedPrice} products skipped for an unusable price; ${distinct.n} distinct barcodes held`);
  console.log(`hammer: products priced by vendor ${JSON.stringify(byVendor)}`);
  db.close();
}

if (import.meta.filename === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
