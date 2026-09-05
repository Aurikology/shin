/**
 * The crawl, and the measurement that decides what this product can be.
 *
 * DISCOVERY LEG REMOVED, 2026-09-05. walmart.ca/robots.txt, fetched live that
 * day, disallows `/search?*` under `User-agent: *`. This crawl used to build a
 * text query, call `walmart.search`, and open the top few results to learn new
 * SKUs; that leg is gone. `detail()` in walmart.ts still opens a known product
 * page, which robots.txt permits, but as of this change nothing here can turn
 * a catalogue product into a Walmart SKU.
 *
 * This is not a permanent dead end, and this crawl is not the reason: a
 * sanctioned discovery route exists and is documented in walmart.ts's header
 * (the site's own product sitemap, listed in its robots.txt, under a path
 * robots.txt Allows) - it is just not built here. Building it, or getting a
 * Walmart Marketplace API key instead, is a scoped decision for whoever picks
 * this up next, not a side effect of deleting a disallowed search call.
 *
 * The immediate consequence: until one of those is built, this crawl can only
 * re-price a Walmart product it has already priced at least once. Counted
 * 2026-09-05: 22 walmart.ca observation rows across 21 distinct products, out
 * of a catalogue over 76,000 rows deep. That is the entire set this crawl can
 * touch today.
 *
 * This is an accepted cost, decided the day the search leg was found to be
 * disallowed, not an oversight to "fix" by restoring the search call. A
 * disabled-but-present crawler of a disallowed path is the same liability as
 * a live one, so it was deleted rather than flagged off.
 *
 * Run it on a sample first. The number it prints, how many known SKUs come
 * back with a price, is the one number every downstream design choice depends
 * on, and it is not guessable. A tier design, a verdict, a range and a set of
 * cheaper options all assume prices exist.
 *
 *   node src/crawl.ts --sample 10
 *   node src/crawl.ts --concurrency 6
 *   node src/crawl.ts --resume
 *   node src/crawl.ts --report
 *
 * Every attempt is written down, including the ones that found nothing, so the
 * coverage figure has an honest denominator. A row we never asked about and a
 * row nobody sells are different facts and are stored differently.
 */

import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, recordAttempt, alreadyAttempted, coverage } from './store.ts';
import type { AttemptOutcome } from './store.ts';
import * as walmart from './walmart.ts';

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
