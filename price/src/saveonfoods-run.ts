/**
 * Save-On-Foods, many barcodes at several stores, one row per (store, barcode, day).
 *
 * Unit A3 of docs/price-system-build-plan-2026-09-28.md. The bench cannot score
 * anything while the price database holds one product priced at three shops and
 * none priced on two dates; the gateway `saveonfoods.ts` reads answers per store,
 * so the same barcodes asked at several stores, and again on later days, is the
 * data the bench is waiting for.
 *
 * THE RULES OF A RUN:
 *   - `--db PATH` is required. There is no default database on purpose: a run
 *     pointed at nothing writes nowhere, rather than into whatever file a
 *     default happened to name.
 *   - One worker, at least 1200 ms between requests (`--delay-ms` may raise it,
 *     never lower it). 1.2 s is the rate the 2026-09-28 measurement used.
 *   - The first 403, 429 or challenge page stops the run. Nothing is retried
 *     around a refusal (RULINGS.md, "Price feed sourcing").
 *   - A row is written only for a 200 with a readable price. A 404 is "this
 *     store does not carry it" and writes nothing to `observation`.
 *   - `code` is set only when the barcode is the catalogue's own code (it came
 *     from `--from-catalogue` or `--from-prices`, or `--catalogue` confirmed a
 *     `--barcodes` line) AND the `sku` the gateway echoed is that same barcode.
 *     Otherwise the row is kept unjoined with its `pageGtin`, which `rejoin.ts`
 *     can resolve later.
 *
 * NOT WRITTEN: `crawl_attempt`. Its key is (code, seller, day) with no store, so
 * a 404 at one store would overwrite a match at another. The per-request log
 * printed by this runner, and `--sheet`, are the record of what was asked.
 *
 *   node src/saveonfoods-run.ts --barcodes codes.txt --stores 4 --dry-run
 *   node src/saveonfoods-run.ts --barcodes codes.txt --store-ids 2241,2202 --db C:\tmp\sof.db
 *   node src/saveonfoods-run.ts --from-catalogue PATH --limit 500 --stores 6 --db PATH --sheet out.csv
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import * as sof from './saveonfoods.ts';
import { normaliseGtin } from './sources.ts';
import { openPrices, recordObservation, type ObservationRow } from './store.ts';
import { requireSourceUse } from './registry.ts';

export const SELLER = sof.SAVE_ON_FOODS_SELLER;
export const MIN_DELAY_MS = 1200;

/** One barcode to ask about, and whether it is known to be a catalogue code. */
export interface Target {
  readonly barcode: string;
  readonly catalogueCode: string | null;
}

export interface RunOptions {
  readonly db: string | null;
  readonly barcodesFile: string | null;
  readonly fromCatalogue: string | null;
  readonly fromPrices: string | null;
  readonly catalogue: string | null;
  readonly storeIds: readonly string[] | null;
  readonly stores: number | null;
  readonly storesFile: string | null;
  readonly limit: number | null;
  readonly offset: number;
  readonly delayMs: number;
  readonly maxRequests: number | null;
  readonly sheet: string | null;
  readonly dryRun: boolean;
}

export function parseArgs(argv: readonly string[]): RunOptions {
  const text = (name: string): string | null => {
    const i = argv.indexOf(name);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v === '' || v.startsWith('--')) throw new Error(`${name} needs a value`);
    return v;
  };
  const num = (name: string): number | null => {
    const v = text(name);
    if (v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} needs a whole number, got ${v}`);
    return n;
  };

  const delayMs = num('--delay-ms') ?? MIN_DELAY_MS;
  if (delayMs < MIN_DELAY_MS) throw new Error(`--delay-ms ${delayMs} is below the ${MIN_DELAY_MS} ms floor; refusing`);

  const ids = text('--store-ids');
  const o: RunOptions = {
    db: text('--db'),
    barcodesFile: text('--barcodes'),
    fromCatalogue: text('--from-catalogue'),
    fromPrices: text('--from-prices'),
    catalogue: text('--catalogue'),
    storeIds: ids === null ? null : ids.split(',').map((s) => s.trim()).filter((s) => s !== ''),
    stores: num('--stores'),
    storesFile: text('--stores-file'),
    limit: num('--limit'),
    offset: num('--offset') ?? 0,
    delayMs,
    maxRequests: num('--max-requests'),
    sheet: text('--sheet'),
    dryRun: argv.includes('--dry-run'),
  };

  const sources = [o.barcodesFile, o.fromCatalogue, o.fromPrices].filter((s) => s !== null).length;
  if (sources !== 1) throw new Error('give exactly one of --barcodes FILE, --from-catalogue PATH, --from-prices PATH');
  if ((o.storeIds === null) === (o.stores === null)) throw new Error('give exactly one of --store-ids A,B or --stores N');
  if (o.stores !== null && o.stores < 1) throw new Error('--stores needs at least 1');
  if (!o.dryRun && o.db === null) {
    throw new Error('--db PATH is required: there is no default database, so a run never writes into a real one by accident');
  }
  return o;
}

/*
 * ---------------------------------------------------------------------------
 * Targets. Every reader opens its database read only.
 * ---------------------------------------------------------------------------
 */

export function barcodesFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const code = line.replace(/#.*$/, '').trim();
    if (code === '') continue;
    if (!/^\d{8,14}$/.test(code)) throw new Error(`not a barcode in the list: ${JSON.stringify(line)}`);
    out.push(code);
  }
  return [...new Set(out)];
}

function readOnly(path: string): DatabaseSync {
  return new DatabaseSync(path, { readOnly: true });
}

export function codesFromCatalogue(path: string, limit: number | null, offset: number): string[] {
  const db = readOnly(path);
  try {
    const rows = db
      .prepare(`SELECT code FROM product ORDER BY code ${limit === null ? '' : 'LIMIT ?'} ${offset > 0 ? 'OFFSET ?' : ''}`)
      .all(...(limit === null ? [] : [limit]), ...(offset > 0 ? [offset] : [])) as unknown as { code: string }[];
    return rows.map((r) => r.code);
  } finally {
    db.close();
  }
}

/** Catalogue codes the price database already prices somewhere: the products the bench can score. */
export function codesFromPrices(path: string, limit: number | null, offset: number): string[] {
  const db = readOnly(path);
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT code FROM observation WHERE code IS NOT NULL ORDER BY code ${limit === null ? '' : 'LIMIT ?'} ${offset > 0 ? 'OFFSET ?' : ''}`,
      )
      .all(...(limit === null ? [] : [limit]), ...(offset > 0 ? [offset] : [])) as unknown as { code: string }[];
    return rows.map((r) => r.code);
  } finally {
    db.close();
  }
}

/** The catalogue's own code for a barcode, trying the same forms crawl.ts's probe does. */
export function catalogueLookup(path: string): { find(barcode: string): string | null; close(): void } {
  const db = readOnly(path);
  const stmt = db.prepare('SELECT code FROM product WHERE code = ?');
  return {
    find(barcode: string): string | null {
      for (const form of new Set([barcode, barcode.padStart(13, '0'), barcode.replace(/^0+/, '')])) {
        if (form === '') continue;
        const row = stmt.get(form) as unknown as { code: string } | undefined;
        if (row !== undefined) return row.code;
      }
      return null;
    },
    close: () => db.close(),
  };
}

export function loadTargets(o: RunOptions): Target[] {
  if (o.fromCatalogue !== null) {
    return codesFromCatalogue(o.fromCatalogue, o.limit, o.offset).map((c) => ({ barcode: c, catalogueCode: c }));
  }
  if (o.fromPrices !== null) {
    return codesFromPrices(o.fromPrices, o.limit, o.offset).map((c) => ({ barcode: c, catalogueCode: c }));
  }
  let codes = barcodesFromText(readFileSync(o.barcodesFile!, 'utf8')).slice(o.offset);
  if (o.limit !== null) codes = codes.slice(0, o.limit);
  if (o.catalogue === null) return codes.map((c) => ({ barcode: c, catalogueCode: null }));
  const cat = catalogueLookup(o.catalogue);
  try {
    return codes.map((c) => ({ barcode: c, catalogueCode: cat.find(c) }));
  } finally {
    cat.close();
  }
}

/*
 * ---------------------------------------------------------------------------
 * Stores.
 * ---------------------------------------------------------------------------
 */

/**
 * N stores spread across the list: one per province in turn, and within a
 * province at even steps through its stores sorted by city, so four stores are
 * not four Vancouver neighbourhoods. Deterministic, so a later day asks the
 * same stores again and the bench gets repeat prices.
 */
export function spreadStores(all: readonly sof.Store[], n: number): sof.Store[] {
  const byProvince = new Map<string, sof.Store[]>();
  for (const s of all) {
    const k = s.province ?? '';
    byProvince.set(k, [...(byProvince.get(k) ?? []), s]);
  }
  const groups = [...byProvince.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => {
      const sorted = g.sort(
        (a, b) => (a.city ?? '').localeCompare(b.city ?? '') || a.retailerStoreId.localeCompare(b.retailerStoreId),
      );
      /* Even-step order: first, middle, quarters, ... so a province's first two picks are far apart. */
      const order: sof.Store[] = [];
      const taken = new Set<number>();
      for (let parts = 1; order.length < sorted.length; parts *= 2) {
        for (let i = 0; i < parts; i += 1) {
          const idx = Math.floor((i * sorted.length) / parts);
          if (!taken.has(idx)) {
            taken.add(idx);
            order.push(sorted[idx]!);
          }
        }
        if (parts > sorted.length * 2) {
          for (let i = 0; i < sorted.length; i += 1) if (!taken.has(i)) order.push(sorted[i]!);
          break;
        }
      }
      return order;
    });
  const out: sof.Store[] = [];
  for (let round = 0; out.length < n && groups.some((g) => g.length > round); round += 1) {
    for (const g of groups) if (round < g.length && out.length < n) out.push(g[round]!);
  }
  return out;
}

export function pickStores(all: readonly sof.Store[], o: Pick<RunOptions, 'storeIds' | 'stores'>): sof.Store[] {
  if (o.storeIds !== null) {
    const byId = new Map(all.map((s) => [s.retailerStoreId, s]));
    const missing = o.storeIds.filter((id) => !byId.has(id));
    if (missing.length > 0) throw new Error(`not in the store list: ${missing.join(', ')}`);
    return o.storeIds.map((id) => byId.get(id)!);
  }
  return spreadStores(all, o.stores!);
}

/*
 * ---------------------------------------------------------------------------
 * One answer to one row.
 * ---------------------------------------------------------------------------
 */

export function observationOf(
  p: sof.Product,
  store: sof.Store,
  target: Target,
  seenOn: string,
): ObservationRow | null {
  if (p.priceCents === null) return null;
  const joined = target.catalogueCode !== null && normaliseGtin(p.sku) === normaliseGtin(target.catalogueCode);
  return {
    code: joined ? target.catalogueCode : null,
    seller: SELLER,
    /* Store in the key: the table's key is (seller, seller_sku, seen_on), and
       one barcode at two stores on one day is two observations. */
    sellerSku: `${store.retailerStoreId}:${p.sku}`,
    sellerName: p.name,
    sellerBrand: p.brand,
    priceCents: p.priceCents,
    kind: p.onPromotion ? 'promotional' : 'regular',
    unitPriceCents: p.unitPriceCents,
    unitLabel: p.unitPriceText,
    unitPricePer: p.unitPricePer,
    currency: 'CAD',
    country: 'CA',
    region: store.province,
    joinMethod: joined ? 'gtin' : 'none',
    pageGtin: p.sku,
    seenOn,
    url: sof.productUrl(store.retailerStoreId, p.sku),
    imageUrl: p.imageUrl,
    inStock: p.available === null ? null : p.available ? 1 : 0,
    storeName: store.name,
    storeCity: store.city,
    storeOsm: null,
    wasCents: p.onPromotion ? p.wasPriceCents : null,
    isSale: p.onPromotion ? 1 : 0,
  };
}

export type Outcome = 'written' | 'absent' | 'no_price' | 'error' | 'blocked';

export interface Asked {
  readonly store: sof.Store;
  readonly target: Target;
  readonly outcome: Outcome;
  readonly note: string | null;
  readonly raw: unknown;
  readonly row: ObservationRow | null;
}

export type LookupFn = (storeId: string, barcode: string) => Promise<sof.Lookup>;

export interface RunResult {
  readonly asked: readonly Asked[];
  readonly stoppedBecause: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The pass: every target at every store, store by store. Takes its database
 * and its lookup as arguments so a test drives it with recorded bodies and no
 * network.
 */
export async function run(
  db: DatabaseSync | null,
  stores: readonly sof.Store[],
  targets: readonly Target[],
  lookupFn: LookupFn,
  o: { delayMs: number; maxRequests: number | null; dryRun: boolean },
  seenOn: string = new Date().toISOString().slice(0, 10),
  log: (line: string) => void = () => {},
): Promise<RunResult> {
  const asked: Asked[] = [];
  let requests = 0;
  let errorsInARow = 0;

  for (const store of stores) {
    for (const target of targets) {
      if (o.dryRun) {
        log(`  would ask ${store.retailerStoreId} (${store.name}, ${store.city ?? '?'}) for ${sof.toGtin14(target.barcode)}`);
        continue;
      }
      if (o.maxRequests !== null && requests >= o.maxRequests) {
        return { asked, stoppedBecause: `--max-requests ${o.maxRequests} reached` };
      }
      if (requests > 0) await sleep(o.delayMs);
      requests += 1;

      let r: sof.Lookup;
      try {
        r = await lookupFn(store.retailerStoreId, target.barcode);
      } catch (err) {
        if (err instanceof sof.Blocked) {
          asked.push({ store, target, outcome: 'blocked', note: err.message, raw: null, row: null });
          log(`  ${store.retailerStoreId} ${target.barcode}  BLOCKED  ${err.message}`);
          return { asked, stoppedBecause: `blocked at store ${store.retailerStoreId}: ${err.message}` };
        }
        r = { kind: 'error', status: 0, why: String(err).slice(0, 200) };
      }

      if (r.kind === 'error') {
        errorsInARow += 1;
        asked.push({ store, target, outcome: 'error', note: r.why, raw: null, row: null });
        log(`  ${store.retailerStoreId} ${target.barcode}  error  ${r.why}`);
        if (errorsInARow >= 3) return { asked, stoppedBecause: 'three errors in a row' };
        continue;
      }
      errorsInARow = 0;

      if (r.kind === 'absent') {
        asked.push({ store, target, outcome: 'absent', note: null, raw: null, row: null });
        log(`  ${store.retailerStoreId} ${target.barcode}  not carried (404)`);
        continue;
      }

      const row = observationOf(r.product, store, target, seenOn);
      if (row === null) {
        asked.push({ store, target, outcome: 'no_price', note: `price ${JSON.stringify(r.product.priceText)}`, raw: r.raw, row: null });
        log(`  ${store.retailerStoreId} ${target.barcode}  found, price unreadable ${JSON.stringify(r.product.priceText)}`);
        continue;
      }
      if (db !== null) recordObservation(db, row);
      asked.push({ store, target, outcome: 'written', note: null, raw: r.raw, row });
      log(
        `  ${store.retailerStoreId} ${target.barcode}  $${(row.priceCents / 100).toFixed(2)} ${row.kind}` +
          `${row.code === null ? ' (unjoined)' : ''}  ${row.sellerName}`,
      );
    }
  }
  return { asked, stoppedBecause: null };
}

/*
 * ---------------------------------------------------------------------------
 * The re-read sheet: the raw price fields beside what the row stored, so a
 * person can check each row against the response by hand (plan A3, done-when).
 * ---------------------------------------------------------------------------
 */

const RAW_FIELDS = ['sku', 'name', 'price', 'wasPrice', 'unitPrice', 'priceSource', 'promotions', 'tprInfo', 'available', 'taxDetails'];
const ROW_FIELDS: readonly (keyof ObservationRow)[] = [
  'code', 'joinMethod', 'pageGtin', 'sellerSku', 'priceCents', 'kind', 'wasCents', 'isSale',
  'unitPriceCents', 'unitPricePer', 'unitLabel', 'inStock', 'storeName', 'storeCity', 'region', 'seenOn',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sheetCsv(asked: readonly Asked[]): string {
  const header = ['store_id', 'barcode', 'outcome', ...RAW_FIELDS.map((f) => `raw_${f}`), ...ROW_FIELDS.map((f) => `stored_${f}`)];
  const lines = [header.join(',')];
  for (const a of asked) {
    const raw = (a.raw ?? {}) as Record<string, unknown>;
    lines.push(
      [
        a.store.retailerStoreId,
        a.target.barcode,
        a.outcome,
        ...RAW_FIELDS.map((f) => (a.raw === null ? '' : raw[f] === undefined ? '(absent)' : raw[f])),
        ...ROW_FIELDS.map((f) => (a.row === null ? '' : a.row[f])),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function storesFromFile(path: string): sof.Store[] {
  return sof.parseStores(JSON.parse(readFileSync(path, 'utf8')));
}

async function main(): Promise<void> {
  let o: RunOptions;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String((err as Error).message ?? err));
    process.exit(2);
  }

  const targets = loadTargets(o);
  console.log(`${SELLER}: ${targets.length} barcodes, ${targets.filter((t) => t.catalogueCode !== null).length} known catalogue codes`);

  let all: sof.Store[];
  if (o.storesFile !== null) all = storesFromFile(o.storesFile);
  else if (o.dryRun) {
    console.log(`  DRY RUN: the store list is fetched at run time; ${o.storeIds?.join(',') ?? `${o.stores} spread stores`} would be asked`);
    for (const t of targets) console.log(`  would ask for ${sof.toGtin14(t.barcode)}${t.catalogueCode === null ? '' : ' (catalogue code)'}`);
    return;
  } else {
    try {
      all = await sof.fetchStores();
    } catch (err) {
      console.error(`store list: ${String((err as Error).message ?? err)}. Nothing asked.`);
      process.exit(1);
    }
    await sleep(o.delayMs);
  }

  const stores = pickStores(all, o);
  console.log(
    `  ${stores.length} stores: ${stores.map((s) => `${s.retailerStoreId} ${s.name} (${s.city ?? '?'})`).join('; ')}`,
  );
  console.log(`  ${stores.length * targets.length} requests planned, ${o.delayMs} ms apart${o.dryRun ? ', DRY RUN (nothing is opened)' : ''}`);

  const db = o.dryRun ? null : openPrices(o.db!, { enforceSources: true });
  // Requirement 4.8: the database refuses unregistered sellers, and no automated
  // reader runs without a recorded basis or on a source whose basis forbids one.
  if (db !== null) requireSourceUse(db, SELLER, 'automated');
  const res = await run(db, stores, targets, (s, b) => sof.lookup(s, b), o, undefined, (l) => console.log(l));
  db?.close();

  const by: Record<string, number> = {};
  for (const a of res.asked) by[a.outcome] = (by[a.outcome] ?? 0) + 1;
  console.log('');
  for (const [k, n] of Object.entries(by).sort()) console.log(`  ${k.padEnd(10)} ${n}`);
  if (res.stoppedBecause !== null) console.log(`  STOPPED: ${res.stoppedBecause}`);
  if (o.sheet !== null && !o.dryRun) {
    writeFileSync(o.sheet, sheetCsv(res.asked));
    console.log(`  sheet: ${o.sheet}`);
  }
  if (res.stoppedBecause?.startsWith('blocked')) process.exit(3);
}

if (import.meta.filename === process.argv[1]) {
  void main();
}
