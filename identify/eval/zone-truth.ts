/**
 * DOES THE VERDICT ZONE MATCH THE TRUTH? `price-truth.ts` beside this one asks
 * whether the NUMBER Shin found is near the hand-priced one, by comparing two
 * medians. Nothing anywhere asked the question the shopper actually sees: given
 * a shelf price and a set of offers, does `computeGauge` put the dot in the
 * RIGHT ZONE. D-113 (a lone $9.97 offer rendering an ordinary $1.74 as "83%
 * under the middle") had to be derived by hand because of that gap. This is the
 * missing measurement.
 *
 * NO MODEL CALL, NO API KEY, NOTHING GROUNDED. Every price here was read off a
 * public Canadian page by a person on 2026-09-03 and committed to
 * `spine/data/observations.json`. Running `computeGauge` over hand-recorded
 * numbers is exactly the "local proof against fake numbers" that `src/gauge.ts`'s
 * own header sanctions; it is not analysis of a Grounded Result, because no
 * Grounded Result is involved. Nothing is written to disk: this computes in
 * memory and prints, following `price-truth.ts`'s lead.
 *
 * ============================================================================
 * THE METHOD: LEAVE-ONE-OUT.
 * ============================================================================
 * Seven products is not a truth set you can split. So for each product with N
 * usable price points, each point in turn is treated as the shopper's SHELF
 * price and the remaining N-1 as the OFFERS. That yields N cases per product
 * from the same data.
 *
 * *** WHAT THIS CANNOT TELL US, and it is most of what you would want to know. ***
 * The offers and the shelf price come out of the SAME small hand-read set. So
 * this measures THE ARITHMETIC AND THE GUARDS -- the median, the percentage, the
 * zone cut, the lone-claim hold, the refusals -- and NEVER whether the prices
 * themselves are right, whether the grounded search would have found those
 * sellers, or whether the zone a real shopper sees in a real store is correct.
 * A clean matrix here is a statement about `computeGauge`, not about Shin.
 *
 * ============================================================================
 * THE EXPECTED ZONE, defined independently of `computeGauge` or this is circular.
 * ============================================================================
 * For each case, in plain arithmetic in this file:
 *   reference = median of the OTHER points' prices
 *   pct       = (shelf - reference) / reference * 100
 *   expected  = pct <= -UNDER_PCT ? 'under_your_line'
 *             : pct >   OVER_PCT  ? 'over_your_line'
 *             : 'middle'
 * with UNDER_PCT = OVER_PCT = 10, the shopper's own defaults, which is the same
 * pair of percentages the product ships. The boundary rule is deliberately the
 * SPECIFIED one (<= on the under side, > on the over side), not a re-invention:
 * the thing under test is whether the gauge computes the specified answer, so
 * disagreeing about where the cut sits would measure nothing.
 *
 * TWO CONVENTIONS CHOSEN HERE, both stated rather than hidden:
 *
 *  (a) RAW PRICE, NOT UNIT PRICE. Every point of a product in the truth set is
 *      a price for the SAME package (225 g of KD, a 3 lb bag of oranges); the
 *      pilot recorded one size per product, not one per seller. Dividing every
 *      price by the same size leaves every ratio to the median unchanged, so
 *      the expected zone computed on raw prices is identical to one computed on
 *      unit prices. Using raw prices keeps this side of the comparison free of
 *      any of the gauge's own scaling code.
 *  (b) MEAN-OF-TWO-MIDDLES MEDIAN, matching `gauge.ts:medianOf`. Note this is
 *      NOT spine's `money.ts:median`, which takes the LOWER of two middles on
 *      purpose. Two medians exist in this repo; the gauge uses the averaging
 *      one, so measuring the gauge has to use the averaging one too or the
 *      harness would report a disagreement that is only a definition.
 *
 * ============================================================================
 * THE FOURTH OUTCOME.
 * ============================================================================
 * `computeGauge` can decline to draw a line at all, returning `usable: false`
 * with a reason of 'single_offer' | 'no_offers_on_line' | 'no_shelf_size'. A
 * refusal is NOT a wrong zone -- it is the gauge saying the evidence is too thin
 * to place a dot, which after D-113 is the correct behaviour. It gets its own
 * bucket and is never scored as an error.
 *
 * ============================================================================
 * UNITS: THE ONE ERROR THAT WOULD PRODUCE A CONFIDENT, COMPLETELY WRONG MATRIX.
 * ============================================================================
 * `observations.json` records `amountCents` -- CENTS, integers ($1.47 is 147).
 * `computeGauge` takes DOLLARS (`GaugeShelfItem.price`, `GaugeOffer.price`), as
 * its own `money()` helper formatting `$${price.toFixed(2)}` shows. So every
 * price crossing into the gauge is DIVIDED BY 100, in exactly one place
 * (`toDollars`) so there is one line to get right. A factor of 100 would not
 * change any zone here -- percentages against a median are scale-invariant --
 * which is precisely why it would go unnoticed, so it is asserted at startup
 * rather than trusted.
 */
import { readFileSync } from 'node:fs';
import { computeGauge, type GaugeOffer, type GaugeShelfItem } from '../src/gauge.ts';

/** The shopper's defaults, the same pair `computeGauge` falls back to. */
const UNDER_PCT = 10;
const OVER_PCT = 10;

/**
 * Which `kind` of recorded price counts. `regular` only, matching
 * `price-truth.ts:63`'s convention and its reason: a promotional 55c against a
 * regular 147c is not a wrong answer, it is a different question. An `asking`
 * price on a used listing and a manufacturer `list` price are two further
 * different questions. How much this discards is printed, because it is most of
 * the set.
 */
const USABLE_KIND = 'regular';

type Zone = 'under_your_line' | 'middle' | 'over_your_line';
const ZONES: readonly Zone[] = ['under_your_line', 'middle', 'over_your_line'];
type NoLine = 'single_offer' | 'no_offers_on_line' | 'no_shelf_size';

interface TruthPoint {
  seller: string;
  amountCents: number;
  currency?: string;
  kind?: string;
  note?: string;
}
interface TruthProduct {
  id: string;
  label: string;
  brand?: string;
  category?: string;
  size?: { value: number; unit: string };
  points: TruthPoint[];
}

/** THE ONE PLACE cents become dollars. See the units paragraph in the header. */
const toDollars = (cents: number): number => cents / 100;

/** Mean of two middles, matching `gauge.ts:medianOf`. See convention (b). */
const median = (ns: readonly number[]): number => {
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const expectedZone = (shelfCents: number, otherCents: readonly number[]): Zone | null => {
  if (otherCents.length === 0) return null;
  const reference = median(otherCents);
  if (!(reference > 0)) return null;
  const pct = ((shelfCents - reference) / reference) * 100;
  if (pct <= -UNDER_PCT) return 'under_your_line';
  if (pct > OVER_PCT) return 'over_your_line';
  return 'middle';
};

interface CaseRow {
  productId: string;
  label: string;
  category: string;
  shelfSeller: string;
  shelfCents: number;
  offerCount: number;
  expected: Zone | null;
  emitted: Zone | null;
  noLineReason: NoLine | null;
  confidence: string;
  shortfalls: string;
  excluded: string;
}

/**
 * One product's cases. `pointsOf` is passed in so the same code can run the
 * strict `regular`-only pass and the clearly-labelled all-kinds sensitivity
 * pass below without either one copying the other's arithmetic.
 */
function casesFor(p: TruthProduct, points: readonly TruthPoint[]): CaseRow[] {
  const rows: CaseRow[] = [];
  /**
   * SIZE LIVES AT THE PRODUCT LEVEL in `observations.json` (`product.size`),
   * never on a point -- checked, not assumed; no point in the file carries one.
   * So every point of a product is back-filled from the product, which is also
   * what makes convention (a) hold. A product with no `size` at all reaches
   * `computeGauge` with nulls and comes back `no_shelf_size`, said out loud in
   * the output rather than quietly compared per-item.
   */
  const sizeValue = p.size?.value ?? null;
  const sizeUnit = p.size?.unit ?? null;

  for (let i = 0; i < points.length; i += 1) {
    const shelfPoint = points[i];
    const others = points.filter((_, j) => j !== i);

    const shelf: GaugeShelfItem = {
      price: toDollars(shelfPoint.amountCents),
      sizeValue,
      sizeUnit,
    };
    /**
     * Offers are built with only the fields the pilot actually recorded. No
     * `marketplace`, `memberOnly`, `dealKind` or `storeBrand` is invented: the
     * truth set does not carry them, and inventing one would be the harness
     * feeding the gauge a fact nobody observed. `currency` is passed through as
     * recorded so a non-CAD point would be excluded rather than silently mixed.
     */
    const offers: readonly GaugeOffer[] = others.map((o) => ({
      retailer: o.seller,
      price: toDollars(o.amountCents),
      url: null,
      currency: o.currency ?? null,
      sizeValue,
      sizeUnit,
    }));

    const result = computeGauge(shelf, offers, UNDER_PCT, OVER_PCT);
    rows.push({
      productId: p.id,
      label: p.label,
      category: p.category ?? 'uncategorised',
      shelfSeller: shelfPoint.seller,
      shelfCents: shelfPoint.amountCents,
      offerCount: offers.length,
      expected: expectedZone(shelfPoint.amountCents, others.map((o) => o.amountCents)),
      emitted: result.usable ? result.zone : null,
      noLineReason: result.usable ? null : result.reason,
      confidence: result.usable ? result.confidence : '-',
      shortfalls: result.usable ? result.shortfalls.map((s) => s.code).join(',') || '-' : '-',
      excluded: result.excluded.map((e) => e.code).join(',') || '-',
    });
  }
  return rows;
}

function printCases(rows: readonly CaseRow[]): void {
  console.log(
    'product'.padEnd(22), '|',
    'shelf (as offered by)'.padEnd(24), '|',
    'shelf $'.padStart(8), '|',
    'offers'.padStart(6), '|',
    'expected'.padEnd(16), '|',
    'emitted'.padEnd(17), '|',
    'agree', '|', 'conf ', '|', 'excluded/shortfall',
  );
  console.log('-'.repeat(150));
  for (const r of rows) {
    const emitted = r.emitted ?? `NO LINE:${r.noLineReason}`;
    // A refusal is neither agreement nor disagreement; it is the fourth bucket.
    const agree = r.emitted === null ? '  -  ' : r.expected === null ? '  ?  ' : r.expected === r.emitted ? 'AGREE' : 'DIFFER';
    console.log(
      r.productId.slice(0, 22).padEnd(22), '|',
      r.shelfSeller.slice(0, 24).padEnd(24), '|',
      toDollars(r.shelfCents).toFixed(2).padStart(8), '|',
      String(r.offerCount).padStart(6), '|',
      (r.expected ?? '-').padEnd(16), '|',
      emitted.padEnd(17), '|',
      agree.padEnd(5), '|', r.confidence.padEnd(5), '|',
      [r.excluded === '-' ? '' : `excl:${r.excluded}`, r.shortfalls === '-' ? '' : `short:${r.shortfalls}`].filter(Boolean).join(' ') || '-',
    );
  }
}

function printMatrix(rows: readonly CaseRow[], title: string): void {
  console.log(`\n${title}`);
  console.log('rows = expected (computed here in plain arithmetic), columns = emitted by computeGauge.');
  console.log('COUNTS ONLY. No percentage is printed: the denominator is far under 20 and a percentage would flatter it.\n');

  const header = ['expected \\ emitted'.padEnd(20), ...ZONES.map((z) => z.padStart(16)), 'NO LINE'.padStart(9)];
  console.log(header.join(' |'));
  console.log('-'.repeat(header.join(' |').length));
  for (const e of ZONES) {
    const cells = ZONES.map((g) => String(rows.filter((r) => r.expected === e && r.emitted === g).length).padStart(16));
    const noLine = String(rows.filter((r) => r.expected === e && r.emitted === null).length).padStart(9);
    console.log([e.padEnd(20), ...cells, noLine].join(' |'));
  }
  const undef = rows.filter((r) => r.expected === null);
  if (undef.length > 0) {
    const cells = ZONES.map((g) => String(undef.filter((r) => r.emitted === g).length).padStart(16));
    const noLine = String(undef.filter((r) => r.emitted === null).length).padStart(9);
    console.log(['(no expectation)'.padEnd(20), ...cells, noLine].join(' |'));
  }

  const scored = rows.filter((r) => r.emitted !== null && r.expected !== null);
  const agreed = scored.filter((r) => r.expected === r.emitted).length;
  const refused = rows.filter((r) => r.emitted === null);
  const byReason = new Map<string, number>();
  for (const r of refused) byReason.set(r.noLineReason ?? '?', (byReason.get(r.noLineReason ?? '?') ?? 0) + 1);
  console.log(`\nNO-LINE BUCKET  : ${refused.length} of ${rows.length} cases, by reason: ${[...byReason].map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
  console.log(
    `SUMMARY         : ${rows.length} cases; ${scored.length} produced a zone (${agreed} agree, ${scored.length - agreed} differ); ${refused.length} refused a line.`,
  );
}

function printCategories(rows: readonly CaseRow[], products: readonly TruthProduct[]): void {
  console.log('\nPER CATEGORY -- the app treats these differently and they are NEVER averaged together here.');
  console.log('category'.padEnd(12), '|', 'products'.padStart(8), '|', 'cases'.padStart(5), '|', 'zone emitted'.padStart(12), '|', 'no line'.padStart(7));
  console.log('-'.repeat(64));
  const cats = [...new Set(products.map((p) => p.category ?? 'uncategorised'))].sort();
  for (const c of cats) {
    const inCat = rows.filter((r) => r.category === c);
    console.log(
      c.padEnd(12), '|',
      String(products.filter((p) => (p.category ?? 'uncategorised') === c).length).padStart(8), '|',
      String(inCat.length).padStart(5), '|',
      String(inCat.filter((r) => r.emitted !== null).length).padStart(12), '|',
      String(inCat.filter((r) => r.emitted === null).length).padStart(7),
    );
  }
}

export function runZoneTruth(): number {
  const raw = JSON.parse(
    readFileSync(new URL('../../spine/data/observations.json', import.meta.url), 'utf8'),
  ) as { recordedAt?: string; products?: TruthProduct[] };
  const products: TruthProduct[] = raw.products ?? [];

  // The units assertion, run rather than trusted: every recorded amount must be
  // an integer count of cents. A float here would mean the file had quietly
  // become dollars and `toDollars` would divide a second time.
  for (const p of products) {
    for (const pt of p.points) {
      if (!Number.isInteger(pt.amountCents)) {
        throw new Error(`observations.json is meant to be integer CENTS; ${p.id}/${pt.seller} carries ${pt.amountCents}`);
      }
    }
  }

  const allPoints = products.flatMap((p) => p.points);
  const usablePoints = products.flatMap((p) => p.points.filter((x) => (x.kind ?? 'regular') === USABLE_KIND));
  const kindCounts = new Map<string, number>();
  for (const pt of allPoints) kindCounts.set(pt.kind ?? 'regular', (kindCounts.get(pt.kind ?? 'regular') ?? 0) + 1);

  console.log('ZONE TRUTH -- does computeGauge emit the right verdict zone?');
  console.log(`ground truth: ${products.length} hand-priced products, ${allPoints.length} price points, recorded ${raw.recordedAt ?? 'unknown'}.`);
  console.log('NO API KEY, NO MODEL CALL, NOTHING WRITTEN TO DISK. computeGauge over hand-recorded prices only.');
  console.log(`shopper's percentages: ${UNDER_PCT}% under / ${OVER_PCT}% over (the product defaults).\n`);

  console.log(`KIND FILTER: '${USABLE_KIND}' only, matching price-truth.ts. Points by kind: ${[...kindCounts].map(([k, v]) => `${k}=${v}`).join(', ')}.`);
  console.log(
    `That DISCARDS ${allPoints.length - usablePoints.length} of ${allPoints.length} points and keeps ${usablePoints.length}. ` +
      "Why: a promotional price against a regular one is a different question, an 'asking' price on a used listing is what a seller hopes for rather than what the thing costs, and a manufacturer 'list' price is nobody's shelf.",
  );

  console.log('\nPER PRODUCT, what survives the filter and whether it can be sized:');
  console.log('product'.padEnd(22), '|', 'category'.padEnd(11), '|', 'pts'.padStart(3), '|', 'regular'.padStart(7), '|', 'size', '|', 'cases');
  console.log('-'.repeat(90));
  for (const p of products) {
    const reg = p.points.filter((x) => (x.kind ?? 'regular') === USABLE_KIND);
    const size = p.size ? `${p.size.value} ${p.size.unit}` : 'NONE -- cannot be sized, so no unit price exists';
    console.log(
      p.id.slice(0, 22).padEnd(22), '|',
      (p.category ?? '-').padEnd(11), '|',
      String(p.points.length).padStart(3), '|',
      String(reg.length).padStart(7), '|',
      size, '|', reg.length,
    );
  }

  const rows = products.flatMap((p) => casesFor(p, p.points.filter((x) => (x.kind ?? 'regular') === USABLE_KIND)));

  console.log(`\nLEAVE-ONE-OUT CASES (${rows.length}). Each row: one point is the shelf price, the rest are the offers.\n`);
  if (rows.length === 0) {
    console.log('(none -- the kind filter left no product with any usable point)');
  } else {
    printCases(rows);
  }
  printMatrix(rows, `CONFUSION MATRIX -- '${USABLE_KIND}' points only (the honest pass).`);
  printCategories(rows, products);

  /**
   * SENSITIVITY PASS, NOT A RESULT. Clearly separated and never merged into the
   * number above. It drops the kind filter entirely, mixing promotional,
   * asking and list prices onto one line, which the product would never do --
   * `price-truth.ts` gives the reason and it still stands. It is printed for
   * one reason only: if the strict pass refuses every case, that is consistent
   * both with "the guards work" and with "this harness cannot detect anything",
   * and only a pass where the arithmetic actually engages tells those apart.
   * READ IT AS A TEST OF THE HARNESS, never as a measurement of the gauge.
   */
  const loose = products.flatMap((p) => casesFor(p, p.points));
  console.log('\n' + '='.repeat(150));
  console.log('SENSITIVITY PASS -- kind filter DROPPED. NOT A MEASUREMENT OF THE GAUGE.');
  console.log('It mixes promotional, asking and list prices onto one line, which the product never does.');
  console.log('Its only job is to show whether this harness can detect a disagreement at all.\n');
  if (loose.length > 0) printCases(loose);
  printMatrix(loose, 'CONFUSION MATRIX -- all kinds mixed (SENSITIVITY ONLY).');

  console.log('\n' + '='.repeat(150));
  console.log('WHAT THIS HARNESS CANNOT TELL YOU: whether any of these prices is right, whether a grounded');
  console.log('search would find these sellers, or what zone a shopper sees in a real store. Shelf and offers');
  console.log('come from the same hand-read set, so only the arithmetic and the guards are under test.');
  return rows.length;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop() ?? '')) {
  runZoneTruth();
}
