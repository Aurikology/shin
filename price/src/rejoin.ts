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
 *   node src/rejoin.ts --names          <- the nightly one: both legs
 *
 * `--names` adds the leg written for item 17: rows from a seller that publishes
 * no barcode, joined by the catalogue's own names instead. See its own comment
 * block below for what that leg can and cannot do.
 *
 * With no catalogue on the machine it refuses to start and says so, rather than
 * walking every row to report that none of them joined: "0 joined" and "there
 * was nothing to join against" are different facts and reading the second as
 * the first would look exactly like a seller who stocks nothing we know.
 */

import { DatabaseSync } from 'node:sqlite';
import { openPrices, rejoinable, nameRejoinable, attachCode, joinState, PRICES_DB_PATH } from './store.ts';
import type { NameRejoinableRow, RejoinableRow } from './store.ts';
import { openCatalogue, CATALOGUE_PATH, type CatalogueProbe } from './crawl.ts';
import { joinToProduct, type Listing, type PriceSource } from './sources.ts';
import { scoreCandidate, verdictOn, type NamedProduct } from './name-match.ts';

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

/*
 * ---------------------------------------------------------------------------
 * THE NAME LEG, 2026-09-11, item 17's "rejoin unmatched rows nightly".
 *
 * Everything above joins a stored barcode to a catalogue code. Canadian Tire
 * publishes no barcode at all (measured 2026-09-05), so its unjoined rows carry
 * no `page_gtin`, `rejoinable` correctly refuses to return them, and the leg
 * above can never do anything for them however many nights it runs.
 *
 * They are not unjoinable, though. The row holds the seller's own title, its
 * brand and its price, and the question "is this title this catalogue product"
 * is answerable offline against a catalogue that keeps growing. So this leg asks
 * exactly that, through the same `name-match.ts` rule the live run used, and
 * through `joinToProduct` for the same reason the barcode leg does.
 *
 * WHAT IT CANNOT DO, said plainly so a report of it is not read as more than it
 * is. It searches the catalogue's own full text index over `name_en`, `name_fr`
 * and `brands`. A catalogue row whose English and French names are both null is
 * unreachable by it no matter how good the match would have been, and this leg
 * is token overlap, not the catalogue's semantic search. A row it cannot join
 * tonight stays exactly as it is and is asked again tomorrow, which costs
 * nothing: there is no request to anybody, only indexed reads.
 * ---------------------------------------------------------------------------
 */

/** The half of the catalogue this leg reads: full text search over names and brands. */
export interface CatalogueNames {
  readonly available: boolean;
  /** Products whose indexed names share words with this title, best effort, capped. */
  candidates(title: string, brand: string | null): NamedProduct[];
  close(): void;
}

/** How many full text hits one row is scored against. Enough to find it, small enough to stay fast. */
const NAME_CANDIDATES = 20;

export function openCatalogueNames(path: string = CATALOGUE_PATH): CatalogueNames {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.prepare('SELECT code FROM product LIMIT 1').get();
    db.prepare('SELECT rowid FROM product_fts LIMIT 1').get();
  } catch {
    return { available: false, candidates: () => [], close: () => {} };
  }

  const stmt = db.prepare(
    `SELECT p.code AS code, p.name AS name, p.brands AS brands
       FROM product_fts f
       JOIN product p ON p.rowid = f.rowid
      WHERE product_fts MATCH ?
      LIMIT ${NAME_CANDIDATES}`,
  );

  return {
    available: true,
    candidates(title: string, brand: string | null): NamedProduct[] {
      /*
       * Every token is quoted before it reaches MATCH. An unquoted word can be
       * an FTS operator (NOT, OR, NEAR, a bare hyphen) and a product title is
       * full of punctuation nobody vetted, so an unquoted query is a syntax
       * error waiting for the one row that contains the word AND.
       */
      const words = [...new Set([...(brand ?? '').split(/\s+/), ...title.split(/\s+/)])]
        .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter((w) => w.length > 1)
        .slice(0, 12);
      if (words.length === 0) return [];
      const match = words.map((w) => `"${w}"`).join(' OR ');
      try {
        const rows = stmt.all(match) as unknown as { code: string; name: string; brands: string | null }[];
        return rows.map((r) => ({ code: r.code, name: r.name, brand: r.brands }));
      } catch {
        return [];
      }
    },
    close: () => db.close(),
  };
}

export interface NameRejoinTally {
  readonly considered: number;
  readonly filled: number;
  /** The catalogue had candidates and none of them cleared the name floor. */
  readonly noMatch: number;
  /** The catalogue's text index returned nothing for this title at all. */
  readonly noCandidates: number;
  /** The catalogue matched and `joinToProduct` still refused the row. */
  readonly refused: number;
}

/**
 * Walk the unjoined rows that carry no barcode and join the ones a catalogue
 * name confirms. Exported so a test can drive it against a stand-in catalogue.
 */
export async function rejoinByName(
  db: DatabaseSync,
  cat: CatalogueNames,
  options: { seller?: string | null; limit?: number | null; dryRun?: boolean; onRow?: (line: string) => void } = {},
): Promise<NameRejoinTally> {
  const rows = nameRejoinable(db, options.seller ?? null, options.limit ?? null);
  let filled = 0;
  let noMatch = 0;
  let noCandidates = 0;
  let refused = 0;

  for (const r of rows) {
    const listing = nameListingFor(r);
    const candidates = cat.candidates(r.sellerName, r.sellerBrand);
    if (candidates.length === 0) {
      noCandidates += 1;
      continue;
    }

    let best: NamedProduct | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      /* Scored in the direction the live run scores it: how much of the
         CATALOGUE product's name is present in the SELLER's title. */
      const score = scoreCandidate(c, { name: r.sellerName, brand: r.sellerBrand });
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    const { join, confident } = verdictOn(bestScore);
    if (best === null || !join) {
      noMatch += 1;
      continue;
    }

    const joined = await joinToProduct(best.code, [listing], [nameSourceFor(r.seller)], async () => ({
      code: best.code,
      confident,
    }));
    if (joined.observations.length !== 1) {
      refused += 1;
      options.onRow?.(
        `  ${r.seller} ${r.sellerSku} ${r.seenOn}  refused: ${joined.unjoined[0]?.because ?? 'the join gate refused it'}`,
      );
      continue;
    }

    if (options.dryRun) {
      filled += 1;
      options.onRow?.(`  ${r.seller} ${r.sellerSku} ${r.seenOn}  would join to ${best.code} at ${bestScore.toFixed(2)}`);
      continue;
    }

    if (attachCode(db, { seller: r.seller, sellerSku: r.sellerSku, seenOn: r.seenOn }, best.code, 'name')) {
      filled += 1;
      options.onRow?.(`  ${r.seller} ${r.sellerSku} ${r.seenOn}  -> ${best.code} at ${bestScore.toFixed(2)}`);
    }
  }

  return { considered: rows.length, filled, noMatch, noCandidates, refused };
}

/** The stored barcode-less row, back in the shape `joinToProduct` takes. */
function nameListingFor(r: NameRejoinableRow): Listing {
  return {
    seller: r.seller,
    sellerSku: r.sellerSku,
    title: r.sellerName,
    brand: r.sellerBrand,
    /* Null and not missing: these are the rows whose seller published none. */
    gtin: null,
    sizeValue: null,
    sizeUnit: null,
    amountCents: r.priceCents,
    kind: r.kind,
    observedAt: r.seenOn,
    preTax: true,
    url: r.url,
  };
}

function nameSourceFor(seller: string): PriceSource {
  return { seller, joins: 'name', fetch: async () => [] };
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

  /*
   * The name leg, off `--names`, so the nightly job is one command that does
   * both: barcode rows first because that join is exact and cheap, then the
   * rows no barcode can ever reach.
   */
  if (flag('--names')) {
    const names = openCatalogueNames();
    if (!names.available) {
      console.error('no full text index in the catalogue, so no row can be joined by name');
    } else {
      console.log('');
      console.log(`name rejoin against ${CATALOGUE_PATH}${dryRun ? ', DRY RUN (nothing is written)' : ''}`);
      const startedNames = Date.now();
      const n = await rejoinByName(db, names, {
        seller,
        limit: limitArg < 0 ? null : limitArg,
        dryRun,
        onRow: (line) => console.log(line),
      });
      console.log('');
      console.log(`  considered        ${n.considered}`);
      console.log(`  joined            ${n.filled}${dryRun ? ' (would have)' : ''}`);
      console.log(`  no name match     ${n.noMatch}`);
      console.log(`  nothing indexed   ${n.noCandidates}`);
      console.log(`  join gate refused ${n.refused}`);
      console.log(`  in ${((Date.now() - startedNames) / 1000).toFixed(1)} s`);
      names.close();
    }
  }

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

