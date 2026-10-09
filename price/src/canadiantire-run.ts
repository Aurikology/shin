/**
 * Canadian Tire at scale, item 17 of the beta build plan.
 *
 * The plan's own words: "Run the adapter over the catalogue's tech and hardware
 * barcodes at its measured delay; log matches and misses in the attempt table.
 * Rejoin unmatched rows nightly."
 *
 * NOTHING IN THIS FILE RAN ON THE DAY IT WAS WRITTEN. No request has been made
 * to canadiantire.ca from this code, so every number below about coverage is
 * unknown rather than low, and the run report says so in those words. The one
 * command that starts it is at the bottom of this comment; the boss runs it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SELLER IS, and why the whole shape differs from the Walmart crawl.
 *
 * `canadiantire.ts`'s header carries the measurement, 2026-09-05: the storefront
 * API answers a plain fetch, and it publishes NO BARCODE. `partNumber` is a
 * vendor part number (five to seven characters on nine of ten sampled products),
 * and the one twelve digit example failed its own UPC check digit and did not
 * match this catalogue's code for that product. So this seller cannot be joined
 * the way Walmart is. Every row here joins by brand and name or does not join,
 * which is `sources.ts`'s `name` join, with all of that file's argument about
 * why a fuzzy name match quietly attached to the wrong product is not a slightly
 * worse price but a verdict about something the shopper is not holding.
 *
 * Three consequences, and they are the design:
 *
 *   - The outcome for a joined row is `named`, never `matched`. `matched` means
 *     the seller published our barcode, and this one never will.
 *   - A miss where candidates existed is `no_name_match`, a new outcome added to
 *     `store.ts` today rather than reusing `no_barcode_match`, which would report
 *     a fact about a field this seller does not have.
 *   - Unjoined rows are KEPT, with the seller's own title and price, exactly as
 *     the Walmart discovery leg keeps its unjoined rows. They are what the
 *     nightly name rejoin in `rejoin.ts` walks.
 *
 * ---------------------------------------------------------------------------
 * WHAT "THE CATALOGUE'S TECH AND HARDWARE BARCODES" ACTUALLY IS, measured against
 * the live catalogue on 2026-09-11 rather than assumed:
 *
 *   source = 'icecat', sold_in_canada = 1            494,513 rows
 *   leaf_category LIKE '%hardware%', Canadian             96 rows
 *   leaf_category LIKE '%tool%', Canadian                 78 rows
 *   leaf_category LIKE '%paint%' / '%automotive%'
 *     / '%garden%' / '%tire%', Canadian                     0 rows each
 *
 * So the honest reading is: this catalogue has a large tech set and essentially
 * no hardware set. Canadian Tire's own aisles, automotive and paint and garden,
 * are not in it at all. A run over "tech and hardware" is in practice a run over
 * tech, and the hardware half of item 17 is waiting on a catalogue that has
 * hardware in it, not on this runner. That is a finding, recorded here, not a
 * reason to stop: the tech set is half a million rows and Canadian Tire sells a
 * real amount of it.
 *
 * `--leaf-like` narrows the set for a probe run, and the run report prints the
 * selector and the count it got, so a coverage number is never read against a
 * denominator nobody printed.
 *
 * ---------------------------------------------------------------------------
 * THE DELAY. `DELAY_MS` below is 3000, the same number `crawl.ts` uses, and it is
 * CARRIED OVER rather than measured for this seller. What was measured for
 * Canadian Tire (2026-09-05) is that a single threaded plain fetch was not
 * blocked; no rate was probed, and the site runs the same bot vendor that blocks
 * Loblaws outright. Three workers at 700 ms tripped Walmart's inside forty
 * requests. So the floor is the known-safe rate from the one seller anybody here
 * has measured, a run is single worker always, and `--delay-ms` may raise it but
 * never lower it. The first real run is the measurement, and it belongs in the
 * scoreboard.
 *
 * ---------------------------------------------------------------------------
 * THE COMMAND, and this is the whole of "one command starts it":
 *
 *   node price/src/canadiantire-run.ts --limit 50 --dry-run     (opens nothing)
 *   node price/src/canadiantire-run.ts --limit 50               (a probe run)
 *   node price/src/canadiantire-run.ts --resume                 (the full pass)
 *
 * `--dry-run` prints the target list and makes no request at all, which is the
 * cheap check to run before the expensive one. `--resume` skips codes this
 * seller has already given a real answer about, so a pass can stop and restart;
 * throttles and errors are deliberately not skipped, because they are the rows a
 * resume exists to go back for.
 */

import { DatabaseSync } from 'node:sqlite';
import * as ct from './canadiantire.ts';
import {
  openPrices,
  recordAttempt,
  recordObservation,
  alreadyAttempted,
  coverage,
  PRICES_DB_PATH,
  type AttemptOutcome,
  type ObservationRow,
} from './store.ts';
import { requireSourceUse } from './registry.ts';
import { CATALOGUE_PATH } from './crawl.ts';
import { joinToProduct, type Listing, type PriceSource } from './sources.ts';
import { NAME_FLOOR, scoreCandidate, verdictOn, type NamedProduct } from './name-match.ts';

export const CANADIAN_TIRE = ct.CANADIAN_TIRE_SELLER;

/** See the delay note in the header. Carried over from the Walmart measurement, never lowered. */
export const DELAY_MS = 3000;

/**
 * One product this run is asking about. The name-match rule it is judged by lives
 * in `name-match.ts`, shared with the nightly rejoin that asks the same question
 * offline about rows this run wrote.
 */
export type Target = NamedProduct;

/** The search text handed to the seller: the brand and the product's own name. */
export function searchTextFor(target: Target): string {
  return [target.brand ?? '', target.name].join(' ').trim();
}

/*
 * ---------------------------------------------------------------------------
 * The target list, read out of the catalogue. Read only, and a missing catalogue
 * is a refusal to start rather than an empty run: "0 products" and "there is no
 * catalogue on this machine" are different facts and reading the second as the
 * first would look exactly like a catalogue with no tech in it.
 * ---------------------------------------------------------------------------
 */

export interface TargetQuery {
  readonly limit: number | null;
  readonly offset: number;
  /** SQL LIKE pattern against leaf_category. Null takes the whole tech set. */
  readonly leafLike: string | null;
  /** Catalogue sources counted as tech and hardware. See the header's measurement. */
  readonly sources: readonly string[];
}

const DEFAULT_SOURCES: readonly string[] = ['icecat'];

export interface CatalogueReader {
  readonly available: boolean;
  targets(q: TargetQuery): Target[];
  count(q: TargetQuery): number;
  close(): void;
}

function openCatalogueForTargets(path: string = CATALOGUE_PATH): CatalogueReader {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.prepare('SELECT code FROM product LIMIT 1').get();
  } catch {
    return { available: false, targets: () => [], count: () => 0, close: () => {} };
  }

  const where = (q: TargetQuery) => {
    const marks = q.sources.map(() => '?').join(',');
    return {
      sql: `FROM product WHERE sold_in_canada = 1 AND source IN (${marks})${q.leafLike === null ? '' : ' AND leaf_category LIKE ?'}`,
      args: q.leafLike === null ? [...q.sources] : [...q.sources, q.leafLike],
    };
  };

  return {
    available: true,
    targets(q: TargetQuery): Target[] {
      const w = where(q);
      /* ORDER BY code, so a run with an offset reaches products the last one did
         not, the same argument crawl.ts's `--offset` makes about sitemap order. */
      const rows = db
        .prepare(
          `SELECT code, name, brands ${w.sql} ORDER BY code ${q.limit === null ? '' : 'LIMIT ?'} ${q.offset > 0 ? 'OFFSET ?' : ''}`,
        )
        .all(
          ...w.args,
          ...(q.limit === null ? [] : [q.limit]),
          ...(q.offset > 0 ? [q.offset] : []),
        ) as unknown as { code: string; name: string; brands: string | null }[];
      return rows.map((r) => ({ code: r.code, name: r.name, brand: r.brands }));
    },
    count(q: TargetQuery): number {
      const w = where(q);
      const row = db.prepare(`SELECT COUNT(*) AS n ${w.sql}`).get(...w.args) as unknown as { n: number };
      return row.n;
    },
    close: () => db.close(),
  };
}

/*
 * ---------------------------------------------------------------------------
 * One product, asked about once.
 * ---------------------------------------------------------------------------
 */

/** The seller descriptor `joinToProduct` reads. Name join, because this seller publishes no barcode. */
const CT_SOURCE: PriceSource = {
  seller: CANADIAN_TIRE,
  joins: 'name',
  /* Never called: `joinToProduct` reads `joins` and nothing else, and the
     listing is already in hand by the time we get there. */
  fetch: async () => [],
};

export function listingFrom(d: ct.ProductDetail, today: string): Listing {
  const promo = d.wasPriceCents !== null && d.priceCents !== null && d.wasPriceCents > d.priceCents;
  return {
    seller: CANADIAN_TIRE,
    sellerSku: d.sku,
    title: d.name,
    brand: d.brand,
    /* Measured, not missing: this seller publishes no barcode at all. */
    gtin: null,
    sizeValue: null,
    sizeUnit: null,
    amountCents: d.priceCents ?? 0,
    kind: promo ? 'promotional' : 'regular',
    observedAt: today,
    /* Decision 36. Canadian Tire quotes the shelf price before tax. */
    preTax: true,
    url: d.url,
  };
}

export function observationFrom(
  d: ct.ProductDetail,
  code: string | null,
  joinMethod: 'name' | 'none',
  today: string,
): ObservationRow {
  const promo = d.wasPriceCents !== null && d.priceCents !== null && d.wasPriceCents > d.priceCents;
  return {
    code,
    seller: CANADIAN_TIRE,
    sellerSku: d.sku,
    sellerName: d.name,
    sellerBrand: d.brand,
    priceCents: d.priceCents ?? 0,
    kind: promo ? 'promotional' : 'regular',
    /* Measured 2026-09-05: this API publishes no unit price field at all. Null
       here is an absence in the source, not a parsing gap. */
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod,
    seenOn: today,
    url: d.url,
    imageUrl: d.imageUrl,
    inStock: d.inStock ? 1 : 0,
    /* Null, and it is why `rejoin.ts` needed a name leg: there is no barcode on
       this seller's page to come back to later. */
    pageGtin: null,
  };
}

export interface Attempt {
  readonly code: string;
  readonly outcome: AttemptOutcome;
  readonly candidates: number;
  readonly note: string | null;
  readonly priceCents: number | null;
}

/** The two calls this runner makes, injectable so a test can drive it with no network. */
export interface Adapter {
  search(query: string): Promise<readonly ct.Candidate[]>;
  detail(sku: string): Promise<ct.ProductDetail | null>;
}

const liveAdapter: Adapter = {
  search: (q) => ct.search(q),
  detail: (sku) => ct.detail(sku),
};

/**
 * Ask about one catalogue product, write what came back, and return what to log.
 *
 * The write is `joinToProduct`'s decision, never a comparison written here, for
 * the reason `crawl.ts` gives above its own source descriptor: the rule about
 * what may become an observation lives in `sources.ts` and is covered by
 * `sources.test.ts`, and a second copy of it here would drift the day it changes.
 */
export async function priceOne(
  db: DatabaseSync,
  target: Target,
  adapter: Adapter,
  today: string,
): Promise<Attempt> {
  let candidates: readonly ct.Candidate[];
  try {
    candidates = await adapter.search(searchTextFor(target));
  } catch (err) {
    if (err instanceof ct.Throttled) {
      return { code: target.code, outcome: 'throttled', candidates: 0, note: err.message, priceCents: null };
    }
    return { code: target.code, outcome: 'error', candidates: 0, note: String(err).slice(0, 200), priceCents: null };
  }

  if (candidates.length === 0) {
    return { code: target.code, outcome: 'no_candidates', candidates: 0, note: null, priceCents: null };
  }

  let best: ct.Candidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = scoreCandidate(target, c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  if (best === null || bestScore < NAME_FLOOR) {
    return {
      code: target.code,
      outcome: 'no_name_match',
      candidates: candidates.length,
      note: `${candidates.length} listings, best name overlap ${bestScore.toFixed(2)} under the ${NAME_FLOOR} floor`,
      priceCents: null,
    };
  }

  let detail: ct.ProductDetail | null;
  try {
    detail = await adapter.detail(best.sku);
  } catch (err) {
    if (err instanceof ct.Throttled) {
      return { code: target.code, outcome: 'throttled', candidates: candidates.length, note: err.message, priceCents: null };
    }
    return {
      code: target.code,
      outcome: 'error',
      candidates: candidates.length,
      note: String(err).slice(0, 200),
      priceCents: null,
    };
  }

  if (detail === null) {
    return {
      code: target.code,
      outcome: 'no_candidates',
      candidates: candidates.length,
      note: 'the listing was in search and its product page returned nothing',
      priceCents: null,
    };
  }
  if (detail.priceCents === null) {
    return {
      code: target.code,
      outcome: 'no_name_match',
      candidates: candidates.length,
      note: 'page read, no usable price on it',
      priceCents: null,
    };
  }

  const { confident } = verdictOn(bestScore);
  const joined = await joinToProduct(target.code, [listingFrom(detail, today)], [CT_SOURCE], async () => ({
    code: target.code,
    confident,
  }));

  if (joined.observations.length !== 1) {
    recordObservation(db, observationFrom(detail, null, 'none', today));
    return {
      code: target.code,
      outcome: 'no_name_match',
      candidates: candidates.length,
      note: `${joined.unjoined[0]?.because ?? 'the join gate refused it'}; kept unjoined`,
      priceCents: detail.priceCents,
    };
  }

  const row = observationFrom(detail, target.code, 'name', today);
  recordObservation(db, row);
  /* The everyday price is worth keeping when the current one is a sale. Same
     `#was` key convention the Walmart crawl uses, so one product cannot overwrite
     its own two prices. */
  if (detail.wasPriceCents !== null && detail.wasPriceCents > detail.priceCents) {
    recordObservation(db, {
      ...row,
      sellerSku: `${detail.sku}#was`,
      priceCents: detail.wasPriceCents,
      kind: 'regular',
    });
  }

  return {
    code: target.code,
    outcome: 'named',
    candidates: candidates.length,
    note: `name overlap ${bestScore.toFixed(2)}${confident ? '' : ', stored as a likely join'}`,
    priceCents: detail.priceCents,
  };
}

export interface RunOptions {
  readonly limit: number | null;
  readonly offset: number;
  readonly leafLike: string | null;
  readonly sources: readonly string[];
  readonly delayMs: number;
  readonly dryRun: boolean;
  readonly resume: boolean;
  readonly stopOnThrottle: boolean;
}

const DEFAULT_RUN: RunOptions = {
  limit: null,
  offset: 0,
  leafLike: null,
  sources: DEFAULT_SOURCES,
  delayMs: DELAY_MS,
  dryRun: false,
  resume: false,
  stopOnThrottle: false,
};

export interface RunTally {
  readonly asked: number;
  readonly skipped: number;
  readonly byOutcome: Record<string, number>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The pass. Single worker, always: see the delay note in the header.
 *
 * Exported and taking its database, its catalogue and its adapter as arguments
 * so the whole loop, including the attempt logging, is testable without a
 * network and without a 4 GB catalogue.
 */
export async function run(
  db: DatabaseSync,
  cat: CatalogueReader,
  adapter: Adapter,
  options: Partial<RunOptions> = {},
  today: string = new Date().toISOString().slice(0, 10),
  log: (line: string) => void = () => {},
): Promise<RunTally> {
  const o = { ...DEFAULT_RUN, ...options };
  const query: TargetQuery = { limit: o.limit, offset: o.offset, leafLike: o.leafLike, sources: o.sources };
  const targets = cat.targets(query);
  const skip = o.resume ? alreadyAttempted(db, CANADIAN_TIRE) : new Set<string>();

  const byOutcome: Record<string, number> = {};
  let asked = 0;
  let skipped = 0;

  for (const t of targets) {
    if (skip.has(t.code)) {
      skipped += 1;
      continue;
    }
    if (o.dryRun) {
      asked += 1;
      log(`  ${asked}. ${t.code}  ${searchTextFor(t)}`);
      continue;
    }

    if (asked > 0 && o.delayMs > 0) await sleep(o.delayMs);
    const started = Date.now();
    const a = await priceOne(db, t, adapter, today);
    asked += 1;
    /* Every attempt is written down, including the ones that found nothing.
       Without this row a zero is indistinguishable from never having looked. */
    recordAttempt(db, a.code, CANADIAN_TIRE, today, a.outcome, a.candidates, a.note);
    byOutcome[a.outcome] = (byOutcome[a.outcome] ?? 0) + 1;
    const money = a.priceCents === null ? '' : ` $${(a.priceCents / 100).toFixed(2)}`;
    log(`  ${asked}. ${a.code}  ${a.outcome}${money}  ${Date.now() - started} ms  ${a.note ?? ''}`);

    if (o.stopOnThrottle && a.outcome === 'throttled') {
      log(`  STOPPING: throttled on product ${asked} and --stop-on-throttle is set`);
      break;
    }
  }

  return { asked, skipped, byOutcome };
}

/**
 * The flags, read off an argv slice. Separate from `main` so a test can read them
 * without a database, a network or a process.
 */
export function parseArgs(argv: readonly string[]): RunOptions {
  const flag = (name: string) => argv.includes(name);
  const number = (name: string, dflt: number): number => {
    const i = argv.indexOf(name);
    if (i < 0) return dflt;
    const raw = argv[i + 1];
    if (raw === undefined || raw === '' || !Number.isFinite(Number(raw))) throw new Error(`${name} needs a number`);
    return Number(raw);
  };
  const text = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };

  const delayMs = number('--delay-ms', DELAY_MS);
  if (delayMs < DELAY_MS) {
    throw new Error(
      `--delay-ms ${delayMs} is below the ${DELAY_MS} ms floor this run inherits from the one crawl rate anybody here has measured; refusing`,
    );
  }

  const offset = number('--offset', 0);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`--offset ${offset} must be a whole number of products, zero or more`);
  }

  const limitArg = number('--limit', -1);
  const sources = text('--sources');

  return {
    limit: limitArg < 0 ? null : limitArg,
    offset,
    leafLike: text('--leaf-like'),
    sources: sources === null ? DEFAULT_SOURCES : sources.split(',').map((s) => s.trim()).filter((s) => s !== ''),
    delayMs,
    dryRun: flag('--dry-run'),
    resume: flag('--resume'),
    stopOnThrottle: flag('--stop-on-throttle'),
  };
}

function report(db: DatabaseSync): void {
  const c = coverage(db, CANADIAN_TIRE);
  const pct = (n: number) => (c.attempted === 0 ? '0.0' : ((n / c.attempted) * 100).toFixed(1));
  console.log('');
  console.log(`  asked about        ${c.attempted}`);
  console.log(`  brand and name     ${c.named}  (${pct(c.named)}%)   <- the number that matters here`);
  console.log(`  seller had nothing ${c.noCandidates}  (${pct(c.noCandidates)}%)`);
  console.log(`  found, no match    ${c.noNameMatch}  (${pct(c.noNameMatch)}%)`);
  console.log('');
  console.log(`  not counted: ${c.throttled} throttled, ${c.errors} errors (retry, not zeros)`);
  const obs = db
    .prepare('SELECT COUNT(*) n FROM observation WHERE seller = ?')
    .get(CANADIAN_TIRE) as unknown as { n: number };
  console.log(`  observations kept  ${obs.n}  (this seller only)`);
  console.log('');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const o = parseArgs(argv);

  const cat = openCatalogueForTargets();
  if (!cat.available) {
    console.error(`no catalogue at ${CATALOGUE_PATH}`);
    console.error('there is nothing to ask about, so nothing is asked. Set SHIN_CATALOGUE or install the catalogue.');
    process.exit(1);
  }

  const db = openPrices(PRICES_DB_PATH, { enforceSources: true });
  // Requirement 4.8: the database refuses unregistered sellers, and no automated
  // reader runs without a recorded basis or on a source whose basis forbids one.
  requireSourceUse(db, CANADIAN_TIRE, 'automated');
  const today = new Date().toISOString().slice(0, 10);
  const total = cat.count({ limit: null, offset: 0, leafLike: o.leafLike, sources: o.sources });

  console.log(
    `${CANADIAN_TIRE}: ${total} catalogue products match sources ${o.sources.join(',')}` +
      `${o.leafLike === null ? '' : ` and leaf_category LIKE ${o.leafLike}`}, ` +
      `limit ${o.limit ?? 'none'}, offset ${o.offset}, ${o.delayMs} ms between products` +
      `${o.resume ? ', resuming' : ''}${o.dryRun ? ', DRY RUN (nothing is opened)' : ''}`,
  );

  const started = Date.now();
  const t = await run(db, cat, liveAdapter, o, today, (line) => console.log(line));
  const elapsed = (Date.now() - started) / 1000;

  console.log('');
  console.log(`  asked ${t.asked}, skipped ${t.skipped} already answered, in ${elapsed.toFixed(1)} s`);
  for (const [outcome, n] of Object.entries(t.byOutcome).sort()) console.log(`  ${outcome.padEnd(18)} ${n}`);
  if (!o.dryRun) report(db);

  cat.close();
  db.close();
}

if (import.meta.filename === process.argv[1]) {
  void main();
}
