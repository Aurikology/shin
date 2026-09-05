/**
 * The crawl, and the measurement that decides what this product can be.
 *
 * Run it on a sample first. The number it prints, how many catalogue rows come
 * back with a price, is the one number every downstream design choice depends
 * on, and it is not guessable. A tier design, a verdict, a range and a set of
 * cheaper options all assume prices exist. If they exist for five percent of
 * the catalogue, the product is a different product.
 *
 *   node src/crawl.ts --sample 100
 *   node src/crawl.ts --sample 100 --concurrency 6
 *   node src/crawl.ts --all --resume
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

const CATALOGUE = new URL('../../catalogue/data/catalogue.db', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);
const PRICES = new URL('../data/prices.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * One request every this many milliseconds, single worker.
 *
 * MEASURED 2026-09-05, not chosen. Walmart Canada is behind PerimeterX. Three
 * workers at 700 ms tripped it inside about forty requests and the address then
 * refused everything for roughly ten minutes. At one worker every 3000 ms,
 * twenty consecutive requests came back clean with no throttle at all.
 *
 * The consequence, stated plainly because it sets the schedule.
 *
 * CORRECTED 2026-09-05 against a timed 60 product run, replacing an estimate
 * that was about half the truth. The old figure assumed 2.5 requests per
 * product and gave seven days. The measured run took 17 min 40 s for 60
 * products at one worker, which is 17.7 s per product, because 65% of products
 * are not found by barcode and each of those scans all four candidate detail
 * pages before giving up: 1 search plus 4 details, not 2.5 requests.
 *
 * 76,965 Canadian grocery rows at 17.7 s is about 15.7 days of continuous
 * crawling at one worker. That is the real cost of a national price corpus read
 * this way, and it is why the crawl starts before anything needs it.
 *
 * The lever, if that is too slow, is the 65% rather than the pacing: a cheaper
 * way to reject a wrong candidate would cut four requests off two products in
 * three.
 */
const DELAY_MS = 3000;

interface Target {
  readonly code: string;
  readonly name: string;
  readonly brands: string | null;
  readonly quantity: string | null;
}

/**
 * The query the seller is actually asked.
 *
 * Built from brand plus name plus size rather than the catalogue's display
 * string, because the display string carries marketing words ("Grade A Dark
 * Color Robust Taste") that no retailer's search index contains, and every one
 * of them narrows a keyword search toward zero. The brand is the single most
 * discriminating token a retail search has, so it leads.
 */
export function buildQuery(t: Target): string {
  const brand = (t.brands ?? '')
    .split(',')[0]
    .replace(/\b(usda|organic|certified)\b/gi, '')
    .trim();
  const name = t.name
    .replace(/[™®]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ');
  const size = (t.quantity ?? '').trim();
  const parts = [brand, name, size].filter((p) => p.length > 0);
  /* Deduplicate: the brand is very often already the first word of the name. */
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of parts.join(' ').split(/\s+/)) {
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    words.push(w);
  }
  return words.slice(0, 10).join(' ');
}

/** Catalogue codes are 13 digits, zero padded. A seller's 12 digit UPC is the same code. */
export function pad13(upc: string): string {
  const digits = upc.replace(/\D/g, '');
  return digits.length >= 13 ? digits.slice(-13) : digits.padStart(13, '0');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Outcome {
  readonly outcome: AttemptOutcome;
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

async function priceOne(db: DatabaseSync, t: Target, today: string): Promise<Outcome> {
  const query = buildQuery(t);
  let candidates: walmart.Candidate[];
  await waitForGate();
  try {
    candidates = await walmart.search(query);
    gate.strikes = Math.max(0, gate.strikes - 1);
  } catch (e) {
    if (e instanceof walmart.Throttled) {
      throttleHit();
      return { outcome: 'throttled', candidates: 0, note: e.message };
    }
    return { outcome: 'error', candidates: 0, note: String(e).slice(0, 200) };
  }
  if (candidates.length === 0) return { outcome: 'no_candidates', candidates: 0, note: query };

  const want = pad13(t.code);
  const look = candidates.slice(0, walmart.MAX_PAGES_PER_SEARCH);

  /*
   * Best name candidate is kept as we go. If no barcode matches we still know
   * the seller stocks something by this brand and name, and that is a real
   * observation about the world even though it is a weaker join. Discarding it
   * would report "nobody sells this" when the truth is "we could not prove it
   * was the same jar".
   */
  let nameFallback: walmart.ProductDetail | null = null;

  for (const c of look) {
    await sleep(DELAY_MS);
    await waitForGate();
    let d: walmart.ProductDetail | null;
    try {
      d = await walmart.detail(c.sku);
    } catch (e) {
      if (e instanceof walmart.Throttled) {
        throttleHit();
        return { outcome: 'throttled', candidates: candidates.length, note: e.message };
      }
      return { outcome: 'error', candidates: candidates.length, note: String(e).slice(0, 200) };
    }
    if (d === null || d.priceCents === null) continue;

    if (d.upc !== null && pad13(d.upc) === want) {
      const promo = d.wasPriceCents !== null && d.wasPriceCents > d.priceCents;
      recordObservation(db, {
        code: want,
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
          code: want,
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
      return { outcome: 'matched', candidates: candidates.length, note: null };
    }

    if (nameFallback === null && brandAgrees(t, d)) nameFallback = d;
  }

  if (nameFallback !== null) {
    recordObservation(db, {
      code: want,
      seller: walmart.WALMART_SELLER,
      sellerSku: nameFallback.sku,
      sellerName: nameFallback.name,
      sellerBrand: nameFallback.brand,
      priceCents: nameFallback.priceCents ?? 0,
      kind: 'regular',
      unitPriceCents: nameFallback.unitPriceCents,
      unitLabel: nameFallback.unitLabel,
      currency: 'CAD',
      country: 'CA',
      region: null,
      joinMethod: 'name',
      seenOn: today,
      url: nameFallback.url,
      imageUrl: nameFallback.imageUrl,
      inStock: nameFallback.inStock ? 1 : 0,
    });
    return { outcome: 'named', candidates: candidates.length, note: nameFallback.name.slice(0, 120) };
  }

  return { outcome: 'no_barcode_match', candidates: candidates.length, note: query };
}

function brandAgrees(t: Target, d: walmart.ProductDetail): boolean {
  const ours = (t.brands ?? '').toLowerCase();
  const theirs = (d.brand ?? '').toLowerCase();
  if (ours === '' || theirs === '') return false;
  return ours.split(',').some((b) => {
    const s = b.trim();
    return s.length > 2 && (theirs.includes(s) || s.includes(theirs));
  });
}

/**
 * MEASURED 2026-09-05, and it invalidated the first run entirely. The catalogue
 * is not the grocery corpus it was assumed to be. Canadian rows carrying a
 * brand, by source:
 *
 *   icecat             494,513   electronics and office supplies
 *   openfoodfacts       76,965   grocery
 *   openbeautyfacts        669
 *   openproductsfacts      581
 *   openpetfoodfacts       117
 *
 * An evenly spaced sample across all of it is 87% electronics, so the first
 * coverage run priced Jabra headsets and Lenovo laptops and said nothing at all
 * about groceries. A source has to be named, or the number answers a question
 * nobody asked.
 */
function targets(limit: number | null, skip: ReadonlySet<string>, source: string | null): Target[] {
  const cat = new DatabaseSync(CATALOGUE, { readOnly: true });
  const where = source === null ? '' : 'AND source = ?';
  const rows = cat
    .prepare(
      `SELECT code, name, brands, quantity
         FROM product
        WHERE sold_in_canada = 1
          AND brands IS NOT NULL AND brands <> ''
          AND name IS NOT NULL AND name <> ''
          ${where}
        ORDER BY code`,
    )
    .all(...(source === null ? [] : [source])) as unknown as Target[];
  cat.close();
  const usable = rows.filter((r) => !skip.has(pad13(r.code)));
  if (limit === null) return usable;
  /* Evenly spaced rather than the first N: codes are ordered by manufacturer
   * prefix, so the first N is one brand's shelf, not the catalogue. */
  const step = Math.max(1, Math.floor(usable.length / limit));
  const out: Target[] = [];
  for (let i = 0; i < usable.length && out.length < limit; i += step) out.push(usable[i]);
  return out;
}

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

  const sample = flag('--all') ? null : value('--sample', 60);
  const workers = value('--concurrency', 4);
  const skip = flag('--resume') ? alreadyAttempted(db, walmart.WALMART_SELLER) : new Set<string>();
  const si = argv.indexOf('--source');
  const source = si >= 0 && argv[si + 1] ? argv[si + 1] : 'openfoodfacts';
  const list = targets(sample, skip, source === 'all' ? null : source);
  const today = new Date().toISOString().slice(0, 10);

  console.log(
    `walmart.ca: ${list.length} products, ${workers} workers, ${skip.size} already done`,
  );

  let done = 0;
  const queue = [...list];
  const worker = async (): Promise<void> => {
    for (;;) {
      const t = queue.shift();
      if (t === undefined) return;
      const r = await priceOne(db, t, today);
      recordAttempt(db, pad13(t.code), walmart.WALMART_SELLER, today, r.outcome, r.candidates, r.note);
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
