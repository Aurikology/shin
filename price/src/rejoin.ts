/**
 * Crawl now, join later.
 *
 * WHY THIS EXISTS, 2026-09-08. The discovery leg in `crawl.ts` opens a Walmart
 * product page, reads a barcode and a price off it, and asks the catalogue
 * whether that barcode is a product we know. `catalogue/data/catalogue.db` is
 * 9.1 GB, gitignored, and is not on every machine that can run a crawl; on a
 * machine without it every single SKU came back unjoined. That is not a small
 * loss. The first-party sitemap is roughly 217,660 SKUs and `crawl.ts`'s own
 * header puts a full pass at 10.8 days at the measured polite rate, so "wait
 * for the catalogue, then crawl" costs 10.8 days of wall clock that could
 * already be running, and "crawl anyway" used to mean throwing the answer away
 * and paying that 10.8 days a second time.
 *
 * So the crawl keeps the page's barcode on the row (`page_gtin`, store.ts) and
 * this file joins it afterwards, offline, at whatever speed SQLite runs at,
 * with no request to walmart.ca at all. A rejoin over the whole table is
 * indexed reads against a catalogue keyed by barcode: seconds, not days, and
 * repeatable the moment a better catalogue lands.
 *
 * IT JOINS THROUGH `joinToProduct`, NOT BY COMPARING TWO STRINGS. Same argument
 * `crawl.ts` makes above its own `WALMART_SOURCE`: the rule about what may
 * become an observation lives in `sources.ts` and is covered by
 * `sources.test.ts`. A barcode comparison written inline here would be a second
 * copy of that rule that no test guards, and the day it changes only one of the
 * two would follow.
 *
 * IT NEVER OVERWRITES A CODE. `attachCode` (store.ts) carries `AND code IS NULL`
 * in its own WHERE clause, so a row that is already joined is untouched by
 * construction and a second run of this script is a no-op rather than a
 * rewrite. That is what makes it safe to schedule.
 *
 * IT NEVER WRITES A PRICE. This file only fills in `code` and `join_method` on
 * rows the crawl already wrote. A number in this table is a thing somebody
 * observed at a seller; nothing here observed anything.
 *
 *   node src/rejoin.ts --dry-run
 *   node src/rejoin.ts
 *   node src/rejoin.ts --limit 500
 *   node src/rejoin.ts --seller Walmart
 *
 * With no catalogue on the machine it refuses to start and says so, rather than
 * walking every row to report that none of them joined: "0 joined" and "there
 * was nothing to join against" are different facts and reading the second as
 * the first would look exactly like a seller who stocks nothing we know.
 */

import { DatabaseSync } from 'node:sqlite';
import { openPrices, rejoinable, attachCode, joinState, PRICES_DB_PATH } from './store.ts';
import type { RejoinableRow } from './store.ts';
import { openCatalogue, CATALOGUE_PATH, type CatalogueProbe } from './crawl.ts';
import { joinToProduct, type Listing, type PriceSource } from './sources.ts';

export interface RejoinTally {
  /** Rows looked at. */
  readonly considered: number;
  /** Rows that gained a code on this run. */
  readonly filled: number;
  /** The barcode is real and the catalogue simply does not hold it. Still unjoined, correctly. */
  readonly notInCatalogue: number;
  /** The catalogue held the barcode and `joinToProduct` still refused the row. */
  readonly refused: number;
}

/**
 * The source descriptor one stored row joins under.
 *
 * Always `joins: 'gtin'`, and built per row rather than imported from
 * `crawl.ts`'s `WALMART_SOURCE`, because the thing being joined here is a
 * barcode this table already stores. A name join needs the seller's title
 * measured against the catalogue's search, which is a live question, not a
 * stored one; there is no such thing as rejoining by name off a row. Any
 * seller that ever writes a `page_gtin` therefore rejoins the same way, and a
 * seller that publishes no barcode never appears in `rejoinable` at all.
 */
function sourceFor(seller: string): PriceSource {
  return { seller, joins: 'gtin', fetch: async () => [] };
}

/** The stored row, back in the shape `joinToProduct` takes. */
function listingFor(r: RejoinableRow): Listing {
  return {
    seller: r.seller,
    sellerSku: r.sellerSku,
    title: r.sellerName,
    brand: r.sellerBrand,
    gtin: r.pageGtin,
    /* Not stored, and not guessed. A gtin join does not read either. */
    sizeValue: null,
    sizeUnit: null,
    amountCents: r.priceCents,
    kind: r.kind,
    observedAt: r.seenOn,
    /* Decision 36, and the same value the crawl wrote the row under. */
    preTax: true,
    url: r.url,
  };
}

/**
 * Walk the unjoined rows that carry a barcode and join the ones the catalogue
 * confirms. Exported so a test can drive it against a stand-in catalogue
 * without going through argv.
 */
export async function rejoin(
  db: DatabaseSync,
  cat: CatalogueProbe,
  options: { seller?: string | null; limit?: number | null; dryRun?: boolean; onRow?: (line: string) => void } = {},
): Promise<RejoinTally> {
  const rows = rejoinable(db, options.seller ?? null, options.limit ?? null);
  let filled = 0;
  let notInCatalogue = 0;
  let refused = 0;

  for (const r of rows) {
    const code = cat.find(r.pageGtin);
    if (code === null) {
      notInCatalogue += 1;
      continue;
    }

    const joined = await joinToProduct(code, [listingFor(r)], [sourceFor(r.seller)], async () => null);
    if (joined.observations.length !== 1) {
      refused += 1;
      options.onRow?.(
        `  ${r.seller} ${r.sellerSku} ${r.seenOn}  refused: ${joined.unjoined[0]?.because ?? 'the join gate refused it'}`,
      );
      continue;
    }

    if (options.dryRun) {
      filled += 1;
      options.onRow?.(`  ${r.seller} ${r.sellerSku} ${r.seenOn}  would join ${r.pageGtin} -> ${code}`);
      continue;
    }

    /*
     * `attachCode` returns false when the row was already joined between the
     * read above and this write. Counted as not filled rather than as an error:
     * two runs overlapping is exactly what "safe to rerun" has to mean, and the
     * row is in the state this run wanted it in either way.
     */
    if (attachCode(db, { seller: r.seller, sellerSku: r.sellerSku, seenOn: r.seenOn }, code, 'gtin')) {
      filled += 1;
      options.onRow?.(`  ${r.seller} ${r.sellerSku} ${r.seenOn}  ${r.pageGtin} -> ${code}`);
    }
  }

  return { considered: rows.length, filled, notInCatalogue, refused };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(name);
  const value = (name: string, dflt: number) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
  };
  const text = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };

  const cat = openCatalogue();
  if (!cat.available) {
    console.error(`no catalogue at ${CATALOGUE_PATH}`);
    console.error('nothing to join against, so nothing is walked. Set SHIN_CATALOGUE or install the catalogue.');
    process.exit(1);
  }

  const db = openPrices(PRICES_DB_PATH);
  const seller = text('--seller');
  const limitArg = value('--limit', -1);
  const dryRun = flag('--dry-run');

  console.log(`rejoin against ${CATALOGUE_PATH}${dryRun ? ', DRY RUN (nothing is written)' : ''}`);
  const started = Date.now();
  const t = await rejoin(db, cat, {
    seller,
    limit: limitArg < 0 ? null : limitArg,
    dryRun,
    onRow: (line) => console.log(line),
  });
  const elapsed = (Date.now() - started) / 1000;

  console.log('');
  console.log(`  considered        ${t.considered}`);
  console.log(`  joined            ${t.filled}${dryRun ? ' (would have)' : ''}`);
  console.log(`  not in catalogue  ${t.notInCatalogue}`);
  console.log(`  join gate refused ${t.refused}`);
  console.log(`  in ${elapsed.toFixed(1)} s`);
  if (seller !== null) {
    const s = joinState(db, seller);
    console.log('');
    console.log(
      `  ${seller}: ${s.joined} joined, ${s.rejoinable} still rejoinable, ${s.noBarcode} with no barcode to try`,
    );
  }
  console.log('');

  cat.close();
  db.close();
}

if (import.meta.filename === process.argv[1]) {
  void main();
}

