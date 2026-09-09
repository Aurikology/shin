/**
 * The crawl, and the measurement that decides what this product can be.
 *
 * DISCOVERY LEG REMOVED 2026-09-05, REBUILT 2026-09-08. The removal stands and
 * is not undone: walmart.ca/robots.txt disallows `/search?*` under
 * `User-agent: *`, `walmart.search` is still gone, and nothing here will ever
 * fetch a search page again. What is new is the second leg the old comment
 * named and did not build, `walmart-sitemap.ts`: the site's own product sitemap
 * index, published in that same robots.txt, listing product URLs under
 * `/en/ip/*\/*`, which the same file explicitly Allows. Discovery happens by
 * reading a list Walmart publishes for the purpose, not by querying a path we
 * were asked not to query.
 *
 * So this crawl now has two modes, and they are different questions:
 *
 *   re-price (the default)  every Walmart SKU already in `observation`, asked
 *                           again. Bounded by our own history.
 *   discover (`--discover`) SKUs out of the sitemap that we have never seen,
 *                           confirmed by barcode on their own product page.
 *                           Bounded by Walmart's catalogue, not by ours.
 *
 * THE SLUG NEVER DECIDES ANYTHING, per the 2026-09-05 decision this leg was
 * built under. A sitemap URL chooses which page to open and contributes nothing
 * to the match; `detail()` reads the barcode off the page and the barcode is
 * what joins, through `sources.ts`'s `joinToProduct`, the same gate every other
 * source in this package goes through.
 *
 * HOW LONG A FULL PASS TAKES, and this replaces the estimate deleted on
 * 2026-09-05 (that one described the search-and-confirm shape, so it was
 * removed rather than corrected). Measured 2026-09-08 against the live site:
 *
 *   ten product pages opened through `detail()` at the polite rate, 2026-09-08:
 *   779, 965, 979, 1113, 1246, 1248, 1319, 1371, 1783 and 1967 ms, mean 1,277 ms.
 *   Nothing was throttled and no challenge page came back. Add DELAY_MS's 3,000
 *   and one SKU costs 4.28 seconds start to start.
 *
 *   The first-party sitemap set is 5 children at 43,532 entries each, about
 *   217,660 SKUs, counted from the files: 217,660 x 4.28 s = 931,600 s, TEN AND
 *   THREE QUARTER DAYS of continuous single-worker crawling. The marketplace
 *   head (19 children, about 855,000 SKUs) is 42 days on the same arithmetic and
 *   the marketplace tail (1,848 children, about 83 million SKUs) is eleven years,
 *   which is not a schedule, it is a proof that a full pass over 3p is not a
 *   thing this crawl can do.
 *
 *   READ THE 10.8 DAYS AS A CEILING ON A CRAWL NOBODY SHOULD RUN, not as a plan.
 *   It assumes opening every SKU Walmart publishes, and most of them will not
 *   join: five random 1p SKUs opened on 2026-09-08 were a framed poster, a
 *   toddler tank top, an area rug, a soufflé and a boys' tee, and the catalogue
 *   this app searches is groceries and electronics. The number that matters is
 *   not how long the whole file takes, it is how many pages have to be opened to
 *   fill the gap `queue.ts` reports, and that is a question about which SKUs are
 *   worth opening.
 *
 * The first-party set is a real if long crawl. The marketplace tail is not a
 * crawl at all at any polite rate, which is why `discoverSkus` defaults to the
 * 1p index alone and why `--indexes` has to be asked for by name. The way that
 * number comes down is a queue that picks which SKUs are worth opening
 * (`queue.ts`), never a shorter delay.
 *
 * Run it on a sample first. The number it prints, how many SKUs come back with
 * a price we can join, is the one number every downstream design choice depends
 * on, and it is not guessable. A tier design, a verdict, a range and a set of
 * cheaper options all assume prices exist.
 *
 *   node src/crawl.ts --sample 10
 *   node src/crawl.ts --concurrency 6
 *   node src/crawl.ts --resume
 *   node src/crawl.ts --report
 *   node src/crawl.ts --discover --limit 5 --dry-run
 *   node src/crawl.ts --discover --limit 200
 *
 * Every attempt is written down, including the ones that found nothing, so the
 * coverage figure has an honest denominator. A row we never asked about and a
 * row nobody sells are different facts and are stored differently.
 */

import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, recordAttempt, alreadyAttempted, coverage } from './store.ts';
import type { AttemptOutcome, ObservationRow } from './store.ts';
import * as walmart from './walmart.ts';
import { discoverSkus, PRODUCT_SITEMAP_INDEXES, type SitemapEntry } from './walmart-sitemap.ts';
import { joinToProduct, type Listing, type PriceSource } from './sources.ts';

/*
 * No more catalogue.db import: the SKU list this crawl works from now comes
 * entirely out of the price database itself, since `search()` is gone and the
 * catalogue plays no part in choosing what to ask Walmart about any more.
 */
const PRICES = new URL('../data/prices.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * One request every this many milliseconds, single worker.
 *
 * MEASURED 2026-09-05, not chosen. Walmart Canada is behind PerimeterX. Three
 * workers at 700 ms tripped it inside about forty requests and the address then
 * refused everything for roughly ten minutes. At one worker every 3000 ms,
 * twenty consecutive requests came back clean with no throttle at all.
 *
 * REMOVED 2026-09-05: this comment used to carry a full-catalogue crawl time
 * estimate (17.7 s per product, ~15.7 days for 76,965 rows). That number was
 * built almost entirely from the four detail pages an unmatched product opened
 * while scanning search candidates. The search leg that produced unmatched
 * products is gone (see the file header), so the number is not stale, it is
 * about a workload that no longer exists. A fresh estimate belongs here once
 * this crawl has a real discovery source again, not a corrected version of one
 * that measured a different crawl.
 */
const DELAY_MS = 3000;

/**
 * One Walmart SKU this crawl already knows about, and the catalogue code it
 * was priced against. Read back from our own price history, not the
 * catalogue: since `search()` was removed (see the file header), a Walmart
 * SKU can only come from a row this crawl has already written.
 */
interface SkuTarget {
  readonly sku: string;
  readonly code: string;
}

/** Catalogue codes are 13 digits, zero padded. A seller's 12 digit UPC is the same code. */
export function pad13(upc: string): string {
  const digits = upc.replace(/\D/g, '');
  return digits.length >= 13 ? digits.slice(-13) : digits.padStart(13, '0');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The outcomes this crawl can still produce, now that `search()` is gone.
 *
 * `AttemptOutcome` itself, declared in store.ts, still lists `no_candidates`
 * and `named` too - this lane does not own that file, so it is not narrowed
 * there. This local alias is the real contract: nothing below writes either
 * of those two any more. HANDOFF for whoever next edits store.ts: narrow
 * `AttemptOutcome` to match, and reword the `crawl_attempt` table's comment,
 * which still describes one row per catalogue product per crawl - the
 * denominator is now known SKUs, not catalogue products.
 */
type KnownSkuOutcome = Extract<AttemptOutcome, 'matched' | 'no_barcode_match' | 'throttled' | 'error'>;

interface Outcome {
  readonly outcome: KnownSkuOutcome;
  /**
   * Always 0. There is no candidate list any more now that a known SKU is
   * asked for directly; the field stays only because store.ts's schema still
   * has the column and this lane does not own that file.
   */
  readonly candidates: number;
  readonly note: string | null;
}

/**
 * Shared backoff. When the seller throttles, every worker waits, not just the
 * one that hit it: the limit is per address, so a single worker charging ahead
 * simply keeps the door shut for the others.
 */
const gate = { until: 0, strikes: 0 };

async function waitForGate(): Promise<void> {
  for (;;) {
    const wait = gate.until - Date.now();
    if (wait <= 0) return;
    await sleep(Math.min(wait, 2000));
  }
}

function throttleHit(): void {
  gate.strikes += 1;
  /* Doubling, capped at two minutes. Cheap to wait, expensive to be locked out. */
  const backoff = Math.min(120_000, 5_000 * 2 ** Math.min(gate.strikes, 5));
  gate.until = Math.max(gate.until, Date.now() + backoff);
}

async function priceOne(db: DatabaseSync, t: SkuTarget, today: string): Promise<Outcome> {
  await waitForGate();
  let d: walmart.ProductDetail | null;
  try {
    d = await walmart.detail(t.sku);
    gate.strikes = Math.max(0, gate.strikes - 1);
  } catch (e) {
    if (e instanceof walmart.Throttled) {
      throttleHit();
      return { outcome: 'throttled', candidates: 0, note: e.message };
    }
    return { outcome: 'error', candidates: 0, note: String(e).slice(0, 200) };
  }

  if (d === null || d.priceCents === null) {
    return { outcome: 'no_barcode_match', candidates: 0, note: 'no usable price on the product page' };
  }

  /*
   * Checked every time, not trusted from history: a Walmart SKU can be
   * reassigned to a different product on their side between crawls, and this
   * is the only place left that would catch it. `no_barcode_match` is reused
   * for the disagreement rather than left unrecorded - openprices.ts already
   * uses that same outcome for "we saw a barcode and it did not join" - and it
   * keeps the name `AttemptOutcome` gives it in store.ts, which this lane does
   * not own. A name less tied to "barcode" is a handoff, not a fix made here.
   */
  if (d.upc !== null && pad13(d.upc) !== t.code) {
    return {
      outcome: 'no_barcode_match',
      candidates: 0,
      note: `page now shows upc ${d.upc}, expected ${t.code}`,
    };
  }

  const promo = d.wasPriceCents !== null && d.wasPriceCents > d.priceCents;
  recordObservation(db, {
    code: t.code,
    seller: walmart.WALMART_SELLER,
    sellerSku: d.sku,
    sellerName: d.name,
    sellerBrand: d.brand,
    priceCents: d.priceCents,
    kind: promo ? 'promotional' : 'regular',
    unitPriceCents: d.unitPriceCents,
    unitLabel: d.unitLabel,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: today,
    url: d.url,
    imageUrl: d.imageUrl,
    inStock: d.inStock ? 1 : 0,
  });
  /* The regular price is also worth keeping when the current one is a sale. */
  if (promo && d.wasPriceCents !== null) {
    recordObservation(db, {
      code: t.code,
      seller: walmart.WALMART_SELLER,
      sellerSku: `${d.sku}#was`,
      sellerName: d.name,
      sellerBrand: d.brand,
      priceCents: d.wasPriceCents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
      currency: 'CAD',
      country: 'CA',
      region: null,
      joinMethod: 'gtin',
      seenOn: today,
      url: d.url,
      imageUrl: d.imageUrl,
      inStock: d.inStock ? 1 : 0,
    });
  }
  return { outcome: 'matched', candidates: 0, note: null };
}

/**
 * Known Walmart SKUs, read back from this crawl's own price history rather
 * than the catalogue. Once `search()` is gone the catalogue plays no part in
 * choosing what to ask Walmart about; a SKU is here only because a past run
 * already matched it by barcode and wrote the observation.
 *
 * `seller_sku` values ending `#was` are not real Walmart item ids: `priceOne`
 * above writes a second row under `${sku}#was` to keep a pre-discount price
 * next to the promotional one. Asking Walmart for that literal string would
 * just fail, so it is filtered out here rather than burning a wasted request
 * and an ambiguous outcome row. Verified against the live table 2026-09-05:
 * of 22 walmart.ca rows, exactly one carries a `#was` suffix.
 */
function knownSkus(db: DatabaseSync, limit: number | null, skip: ReadonlySet<string>): SkuTarget[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT seller_sku AS sku, code
         FROM observation
        WHERE seller = ?
          AND code IS NOT NULL
          AND seller_sku NOT LIKE '%#was'
        ORDER BY seller_sku`,
    )
    .all(walmart.WALMART_SELLER) as unknown as SkuTarget[];
  const usable = rows.filter((r) => !skip.has(r.code));
  if (limit === null) return usable;
  return usable.slice(0, limit);
}

/*
 * HANDOFF: `named` and `noCandidates` below can now only hold history from
 * before 2026-09-05 - `priceOne` no longer produces either outcome, because
 * there is no search result to fall back to a name match on and no such thing
 * as "the seller had no search results" once a known SKU is asked for
 * directly. Left printed rather than removed because old rows are still real
 * data; whoever narrows `AttemptOutcome` in store.ts (see the outcome comment
 * above `priceOne`) should also decide whether these two lines still belong
 * in a report about a SKU-driven crawl.
 */
function report(db: DatabaseSync): void {
  const c = coverage(db, walmart.WALMART_SELLER);
  const pct = (n: number) => (c.attempted === 0 ? '0.0' : ((n / c.attempted) * 100).toFixed(1));
  console.log('');
  console.log(`  asked about        ${c.attempted}`);
  console.log(`  barcode matched    ${c.matched}  (${pct(c.matched)}%)   <- the number that matters`);
  console.log(`  brand and name     ${c.named}  (${pct(c.named)}%)`);
  console.log(`  seller had nothing ${c.noCandidates}  (${pct(c.noCandidates)}%)`);
  console.log(`  found, wrong item  ${c.noBarcodeMatch}  (${pct(c.noBarcodeMatch)}%)`);
  const withPrice = c.matched + c.named;
  console.log('');
  console.log(`  usable price       ${withPrice}  (${pct(withPrice)}%)`);
  console.log('');
  console.log(`  not counted: ${c.throttled} throttled, ${c.errors} errors (retry, not zeros)`);
  /*
   * FILTERED BY SELLER 2026-09-05. This counted the whole table, and the table
   * also holds 874 rows from the Open Prices ingest. A 60 product Walmart run
   * that kept 22 rows printed "observations kept 896", and that number was read
   * out as Walmart's twice in one session before anyone separated them. A run
   * report must count only what the run did.
   */
  const obs = db
    .prepare('SELECT COUNT(*) n FROM observation WHERE seller = ?')
    .get(walmart.WALMART_SELLER) as unknown as { n: number };
  console.log(`  observations kept  ${obs.n}  (this seller only)`);
  console.log('');
}

/*
 * ---------------------------------------------------------------------------
 * THE DISCOVERY LEG, 2026-09-08. Everything above this line works from SKUs we
 * already knew. Everything below finds SKUs we did not.
 * ---------------------------------------------------------------------------
 */

/**
 * The catalogue, opened read-only just to answer "is this barcode a product we
 * know about", and nothing else.
 *
 * NOT `catalogue/src/search.ts`'s `Catalogue` class, deliberately. That class
 * takes an embedder in its constructor because it does semantic search; this
 * needs one indexed primary-key read, and loading an embedding model to perform
 * it would be several hundred megabytes of resident memory to answer a question
 * `SELECT code FROM product WHERE code = ?` already answers. The three barcode
 * forms tried below are copied from that class's own `byGtin`, for the reason
 * its comment gives: a UPC-A read and its EAN-13 form with a leading zero are
 * the same product, and retailers publish both.
 *
 * A MISSING CATALOGUE IS NOT AN ERROR HERE, and this is the part worth arguing
 * with. `catalogue/data/` is gitignored and 9.1 GB, so a fresh clone has no
 * catalogue at all, and a discovery run on such a clone would otherwise have to
 * refuse to start. Instead it runs and writes what it saw as UNJOINED rows,
 * `code` NULL and `join_method` 'none', which is the exact case store.ts's own
 * header describes: "the seller published a price we could not tie to anything.
 * Kept, never discarded, because a barcode may appear on a later crawl and
 * resolve it retroactively." The evidence is preserved and no verdict can ever
 * be built on it, because every serving path in this package selects on `code`.
 * The attempt note says which of the two happened, so a coverage figure is
 * never read as a statement about Walmart when it was a statement about a
 * missing file.
 */
const CATALOGUE_PATH =
  process.env.SHIN_CATALOGUE ??
  new URL('../../catalogue/data/catalogue.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

interface CatalogueProbe {
  /** False when there is no catalogue on this machine at all. See the comment above. */
  readonly available: boolean;
  /** The catalogue's own code for this barcode, or null if it does not hold one. */
  find(gtin: string): string | null;
  close(): void;
}

function openCatalogue(): CatalogueProbe {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(CATALOGUE_PATH, { readOnly: true });
    db.prepare('SELECT code FROM product LIMIT 1').get();
  } catch {
    return { available: false, find: () => null, close: () => {} };
  }
  const stmt = db.prepare('SELECT code FROM product WHERE code = ?');
  return {
    available: true,
    find(gtin: string): string | null {
      const digits = gtin.replace(/\D/g, '');
      for (const form of new Set([digits, digits.padStart(13, '0'), digits.replace(/^0+/, '')])) {
        if (form === '') continue;
        const row = stmt.get(form) as unknown as { code: string } | undefined;
        if (row !== undefined) return row.code;
      }
      return null;
    },
    close: () => db.close(),
  };
}

/**
 * The one place a discovered Walmart listing is allowed to become an observation.
 *
 * This goes through `sources.ts`'s `joinToProduct` rather than comparing two
 * strings inline, and that is not ceremony. `joinToProduct` is where this
 * package's rule about joins lives: a source that declares `joins: 'gtin'` is
 * refused outright if it published no barcode, and its normalisation is the same
 * one the catalogue uses, so 12 and 13 digit forms meet. Writing the comparison
 * here would be a second implementation of that rule that no test in
 * `sources.test.ts` covers, and the day the rule changes only one of the two
 * would follow.
 */
const WALMART_SOURCE: PriceSource = {
  seller: walmart.WALMART_SELLER,
  joins: 'gtin',
  /* Never called. `joinToProduct` reads `joins` off this object and nothing
   * else; the listing is already in hand by the time we get here, because the
   * sitemap chose the page and `detail()` opened it. */
  fetch: async () => [],
};

function listingFrom(d: walmart.ProductDetail, today: string): Listing {
  const promo = d.wasPriceCents !== null && d.priceCents !== null && d.wasPriceCents > d.priceCents;
  return {
    seller: walmart.WALMART_SELLER,
    sellerSku: d.sku,
    title: d.name,
    brand: d.brand,
    gtin: d.upc,
    /* The product page publishes a computed unit price, not a parsed size, and
     * this leg joins by barcode, where size plays no part. Guessing a size out
     * of the title to fill these in would stand an unmeasured number next to a
     * measured one. */
    sizeValue: null,
    sizeUnit: null,
    amountCents: d.priceCents ?? 0,
    kind: promo ? 'promotional' : 'regular',
    observedAt: today,
    /* Decision 36. Walmart Canada quotes the shelf price before tax. */
    preTax: true,
    url: d.url,
  };
}

/** One product detail in the shape the table stores. */
function observationFrom(
  d: walmart.ProductDetail,
  code: string | null,
  joinMethod: 'gtin' | 'none',
  today: string,
): ObservationRow {
  const promo = d.wasPriceCents !== null && d.priceCents !== null && d.wasPriceCents > d.priceCents;
  return {
    code,
    seller: walmart.WALMART_SELLER,
    sellerSku: d.sku,
    sellerName: d.name,
    sellerBrand: d.brand,
    priceCents: d.priceCents ?? 0,
    kind: promo ? 'promotional' : 'regular',
    unitPriceCents: d.unitPriceCents,
    unitLabel: d.unitLabel,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod,
    seenOn: today,
    url: d.url,
    imageUrl: d.imageUrl,
    inStock: d.inStock ? 1 : 0,
  };
}

/**
 * What one discovered SKU produced, and under which key it is written down.
 *
 * `code` is the catalogue code when the barcode joined, and `wm-sku:<SKU>` when
 * it did not. The prefix is deliberately not thirteen digits, so it can never
 * collide with a real catalogue code in `crawl_attempt`'s primary key, and the
 * row is deliberately written rather than skipped: an attempt that found nothing
 * is exactly the row that keeps a coverage figure honest, and a SKU we opened
 * and could not use is a fact about the join, not a fact we may forget.
 * `queue.ts` only ever looks up codes it already has an observation or a scan
 * for, so these keys are inert there.
 */
interface DiscoveryResult {
  readonly code: string;
  readonly outcome: AttemptOutcome;
  readonly note: string | null;
  /** For the per-SKU line a run prints. Null when no price was read. */
  readonly priceCents: number | null;
}

async function discoverOne(
  db: DatabaseSync,
  e: SitemapEntry,
  cat: CatalogueProbe,
  today: string,
): Promise<DiscoveryResult> {
  const key = `wm-sku:${e.sku}`;
  await waitForGate();

  let d: walmart.ProductDetail | null;
  try {
    d = await walmart.detail(e.sku);
    gate.strikes = Math.max(0, gate.strikes - 1);
  } catch (err) {
    if (err instanceof walmart.Throttled) {
      throttleHit();
      return { code: key, outcome: 'throttled', note: err.message, priceCents: null };
    }
    return { code: key, outcome: 'error', note: String(err).slice(0, 200), priceCents: null };
  }

  /*
   * `no_candidates` is alive again. The HANDOFF note above `priceOne` says this
   * outcome can only hold history from before 2026-09-05, because a known SKU
   * asked for directly cannot come back with "the seller had nothing". A
   * DISCOVERED SKU can: a sitemap is a snapshot, and a product delisted between
   * that file's lastmod and now returns a page with no data in it. That is the
   * seller having nothing for a URL the seller itself published, which is what
   * this outcome names. Whoever narrows `AttemptOutcome` in store.ts should keep
   * it. (`named` is still dead and this leg never writes it: a name match may
   * not stand in for a barcode on a seller that publishes barcodes.)
   */
  if (d === null) {
    return { code: key, outcome: 'no_candidates', note: 'product page returned no readable data', priceCents: null };
  }
  if (d.priceCents === null) {
    return { code: key, outcome: 'no_barcode_match', note: 'page read, no usable price on it', priceCents: null };
  }
  if (d.upc === null) {
    return {
      code: key,
      outcome: 'no_barcode_match',
      note: 'page read, seller published no barcode',
      priceCents: d.priceCents,
    };
  }

  const code = cat.available ? cat.find(d.upc) : null;

  if (code === null) {
    /*
     * Unjoined, kept. See openCatalogue's comment for why the two reasons below
     * are recorded apart: one is a fact about Walmart, the other is a fact about
     * this machine, and reading the second as the first would understate our own
     * coverage against a catalogue that was simply not installed.
     */
    recordObservation(db, observationFrom(d, null, 'none', today));
    const note = cat.available
      ? `barcode ${d.upc} is not in the catalogue; kept unjoined`
      : `no catalogue on this machine to confirm barcode ${d.upc}; kept unjoined`;
    return { code: key, outcome: 'no_barcode_match', note, priceCents: d.priceCents };
  }

  const joined = await joinToProduct(code, [listingFrom(d, today)], [WALMART_SOURCE], async () => null);
  if (joined.observations.length !== 1) {
    const because = joined.unjoined[0]?.because ?? 'the join gate refused it';
    recordObservation(db, observationFrom(d, null, 'none', today));
    return { code: key, outcome: 'no_barcode_match', note: `${because}; kept unjoined`, priceCents: d.priceCents };
  }

  const row = observationFrom(d, code, 'gtin', today);
  recordObservation(db, row);
  /* The regular price is also worth keeping when the current one is a sale.
   * Same `#was` convention `priceOne` uses, and `knownSkus` already filters it. */
  if (d.wasPriceCents !== null && d.priceCents !== null && d.wasPriceCents > d.priceCents) {
    recordObservation(db, {
      ...row,
      sellerSku: `${d.sku}#was`,
      priceCents: d.wasPriceCents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
    });
  }
  return { code, outcome: 'matched', note: null, priceCents: d.priceCents };
}

/**
 * The discovery run.
 *
 * SINGLE WORKER, ALWAYS, and `--concurrency` does not reach it. DELAY_MS's own
 * comment above records the measurement: three workers at 700 ms tripped
 * PerimeterX inside forty requests, one worker at 3000 ms ran twenty clean. The
 * re-price leg keeps its workers because its list is at most a few hundred SKUs
 * we already hold; a discovery run is unbounded, so it is the one that would
 * actually earn a ten minute lockout, and it takes the measured safe rate.
 *
 * `--dry-run` makes no request to walmart.ca except the sitemaps themselves. It
 * answers "is discovery finding sane URLs" without opening a single product
 * page, which is the cheap check to run before the expensive one.
 */
async function discover(
  db: DatabaseSync,
  limit: number | null,
  dryRun: boolean,
  indexes: readonly string[],
  today: string,
): Promise<void> {
  console.log(
    `walmart.ca discovery: ${indexes.join(', ')}, limit ${limit ?? 'none'}${dryRun ? ', DRY RUN (no product page is opened)' : ''}`,
  );

  const cat = openCatalogue();
  if (!dryRun && !cat.available) {
    console.log(`  no catalogue at ${CATALOGUE_PATH}: everything found will be kept unjoined`);
  }

  const tally = new Map<string, number>();
  let n = 0;
  const startedAt = Date.now();

  try {
    for await (const e of discoverSkus({
      limit,
      indexes,
      onShard: (shard, _index, i, total) =>
        console.log(`  sitemap ${i}/${total}: ${shard.url} (lastmod ${shard.lastmod ?? 'none'})`),
    })) {
      n += 1;
      if (dryRun) {
        console.log(`  ${n}. ${e.sku}  ${e.lastmod ?? 'no lastmod'}  ${e.url}`);
        continue;
      }

      const t0 = Date.now();
      const r = await discoverOne(db, e, cat, today);
      const ms = Date.now() - t0;
      recordAttempt(db, r.code, walmart.WALMART_SELLER, today, r.outcome, 0, r.note);
      tally.set(r.outcome, (tally.get(r.outcome) ?? 0) + 1);
      const money = r.priceCents === null ? '' : ` $${(r.priceCents / 100).toFixed(2)}`;
      console.log(`  ${n}. ${e.sku}  ${r.outcome}${money}  ${ms} ms  ${r.note ?? ''}`);
      await sleep(DELAY_MS);
    }
  } finally {
    cat.close();
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  console.log('');
  console.log(`  discovered ${n} SKUs in ${elapsed.toFixed(1)} s`);
  for (const [outcome, count] of [...tally].sort()) console.log(`  ${outcome.padEnd(18)} ${count}`);
  console.log('');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(name);
  const value = (name: string, dflt: number) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
  };

  const db = openPrices(PRICES);

  if (flag('--report')) {
    report(db);
    db.close();
    return;
  }

  /*
   * No `--source` any more: that flag picked a catalogue source (grocery vs
   * electronics) for the discovery leg, and there is nothing left to pick a
   * source for. `--all` is gone too since the default is already every known
   * SKU; `--sample` still caps the list, for a quick test run.
   */
  const today0 = new Date().toISOString().slice(0, 10);
  if (flag('--discover')) {
    const limitArg = value('--limit', -1);
    /*
     * `--indexes` takes the keys of PRODUCT_SITEMAP_INDEXES, comma separated,
     * and defaults to the first-party one alone. The marketplace tail is 1,848
     * sitemap children and roughly 83 million SKUs; a flag is the honest way to
     * reach it, because nobody should walk into that by running the default.
     */
    const idxArg = argv.indexOf('--indexes');
    const chosen = idxArg >= 0 && argv[idxArg + 1] ? argv[idxArg + 1].split(',') : ['firstParty'];
    const indexes = chosen.map((k) => {
      const url = (PRODUCT_SITEMAP_INDEXES as Record<string, string>)[k.trim()];
      if (url === undefined) {
        throw new Error(
          `unknown --indexes value ${k}; expected one of ${Object.keys(PRODUCT_SITEMAP_INDEXES).join(', ')}`,
        );
      }
      return url;
    });
    await discover(db, limitArg < 0 ? null : limitArg, flag('--dry-run'), indexes, today0);
    db.close();
    return;
  }

  const sampleArg = value('--sample', -1);
  const sample = sampleArg < 0 ? null : sampleArg;
  const workers = value('--concurrency', 4);
  const skip = flag('--resume') ? alreadyAttempted(db, walmart.WALMART_SELLER) : new Set<string>();
  const list = knownSkus(db, sample, skip);
  const today = new Date().toISOString().slice(0, 10);

  console.log(
    `walmart.ca: ${list.length} known SKUs, ${workers} workers, ${skip.size} already done`,
  );

  let done = 0;
  const queue = [...list];
  const worker = async (): Promise<void> => {
    for (;;) {
      const t = queue.shift();
      if (t === undefined) return;
      const r = await priceOne(db, t, today);
      recordAttempt(db, t.code, walmart.WALMART_SELLER, today, r.outcome, r.candidates, r.note);
      done += 1;
      if (done % 10 === 0 || done === list.length) {
        process.stdout.write(`\r  ${done}/${list.length}   `);
      }
      await sleep(DELAY_MS);
    }
  };

  await Promise.all(Array.from({ length: workers }, worker));
  console.log('');
  report(db);
  db.close();
}

if (import.meta.filename === process.argv[1]) {
  void main();
}
