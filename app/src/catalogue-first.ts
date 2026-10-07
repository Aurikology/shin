/**
 * CATALOGUE FIRST: a barcode is named by Shin's own catalogue and priced by
 * Shin's own prices; when Shin has no price, Claude, with no web search, is
 * asked for a typical range, capped per month. No answer a shopper sees comes
 * from Gemini.
 *
 * RULINGS.md "Catalogue first; Claude, with no web search, is the capped
 * price-range fallback": "Shin names a product from its own catalogue: a
 * barcode by lookup; anything else by reading every piece of text on the object
 * ... returning the top 3 for the shopper to pick ... manual entry when nothing
 * matches. The price range comes from Shin's own data by math". Jamin,
 * 2026-09-28: "We are not using gemini at all for the client side answers".
 *
 * That setting is SHIN_CATALOGUE_FIRST, ON by default since 2026-09-28 (Jamin:
 * "switch on the setting to allow testers to see it"); '0', 'off' or 'false'
 * turns it off, and then nothing in this file runs and `/api/identify`
 * answers exactly as it did before (pinned by
 * test/catalogue-first-route.test.ts). With it on:
 *
 *   BARCODE (`/api/identify?gtin=`), `answerBarcodeFromCatalogue`:
 *     1. the canonical barcode (app/src/barcode.ts `canonicalBarcode`) is looked
 *        up with `Catalogue.byGtin` (catalogue/src/search.ts), the same lookup
 *        the server's `fastLookup` already holds;
 *     2. found: the catalogue row IS the identity. `priceRangeFor`
 *        (price/src/range.ts) computes the range from Shin's own prices. When
 *        its basis is `none`, `askRange` is called once if the caller passed
 *        one; the server passes the capped Claude ask, no web search
 *        (identify/src/range-ask.ts `askTypicalRange`). If that ask fails for
 *        any reason, or no ask is passed, the answer still comes back with the
 *        identity, no range and the reason code (`no_shin_prices` when no ask
 *        was passed; RULINGS "Always answer");
 *     3. not found: `not_in_catalogue`, and the client offers manual entry.
 *        No model is asked who the product is. The Gemini scan call
 *        (`runGeminiScan`) is never made anywhere on this path.
 *
 *   TEXT (`POST /api/match-text`), `matchText`: the lines read off a pack or a
 *     shelf tag go to `topMatchesFromText` (catalogue/src/text-match.ts) with
 *     `recordMiss: false`, and the top 3 come back plus any shelf price read.
 *     The shopper picks one and the client calls the barcode path with that
 *     candidate's barcode.
 *
 * THE ANSWER SHAPE, for the client lane. A barcode on the new path answers:
 *
 *   {
 *     kind: 'catalogue',
 *     outcome: 'catalogue_hit' | 'not_in_catalogue',
 *     offerManualEntry: boolean,      // true exactly when outcome is not_in_catalogue
 *     catalogueUp: boolean,           // false: the catalogue is not attached at all
 *     barcode: string,                // the canonical digits that were looked up
 *     identity: null | {
 *       name: string, brand: string | null, size: string | null,
 *       barcode: string,              // the catalogue row's own code
 *       category: null | { tag: string, name: string },   // the row's leaf category
 *     },
 *     range: null | {
 *       lowCents: number, highCents: number,
 *       medianCents: number | null,   // null for gemini_typical
 *       n: number | null,             // shops (this_product) or products (category); null for gemini_typical
 *       basis: 'this_product' | 'leaf_category' | 'parent_category' | 'gemini_typical',
 *       category: null | { tag: string, name: string },   // set for the two category bases
 *       currency: string,
 *       unit: string | null,          // gemini_typical only: what one price buys, as the model said
 *     },
 *     rangeSource: 'shin_prices' | 'gemini_typical' | null,
 *     rangeAskedAt: string | null,    // ISO time of the Claude ask, gemini_typical only
 *     noRangeReason: string | null,   // why range is null, e.g. 'monthly_cap_reached'
 *     shelfPrice: null | { cents: number, from: 'weighed_label' },
 *     verdict: null | Verdict,        // price/src/estimate.ts, the design's response contract
 *     storeIdentity: null | { name, brand, size, barcode },   // design case 2 only
 *     ms: number,
 *     scanId?: number,
 *   }
 *
 * `gemini_typical` is a historical wire value, not a statement of which model
 * answered: it is what the client (app/public/js/lib/catalogue-range.js), the
 * scans table (`range_source`, app/src/migrations.ts) and the native copies
 * already read. Since 2026-09-28 the answer behind it comes from Claude (the
 * model id is kept with the saved answer in identify/data/range-ask.json).
 * Renaming it is a client + migration change, not made here.
 *
 * `POST /api/match-text` answers:
 *
 *   {
 *     kind: 'text_match',
 *     catalogueUp: boolean,
 *     candidates: [ { barcode: string | null, productId: string, name: string,
 *                     brand: string | null, size: string | null, score: number } ],  // 0 to 3
 *     shelfPrice: null | { cents: number, forCount: number, text: string },
 *     ms: number,
 *     scanId?: number,
 *   }
 */

import type { DatabaseSync } from 'node:sqlite';
import * as settings from '../../settings/src/index.ts';
import { priceRangeFor, type RangeResult } from '../../price/src/range.ts';
import type { RangeAskFailure, RangeAskResult, RangeIdentity } from '../../identify/src/range-ask.ts';
import type { CanonicalBarcode } from './barcode.ts';
import { estimate, type EstimateDeps, type EstimateTrace, type Verdict } from '../../price/src/estimate.ts';
import { onceAsk, type RangeAskOutcome } from './distribution.ts';

/* ---------------------------------------------------------------- settings */

/** SHIN_CATALOGUE_FIRST: on unless it reads '0', 'off' or 'false'. Read per call, so a test can flip it. */
export function catalogueFirstOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (settings.SHIN_CATALOGUE_FIRST(env) ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'off' || v === 'false');
}

export const RANGE_ASK_DEFAULT_MONTHLY_CAP = 1000;
export const RANGE_ASK_DEFAULT_CEILING_CENTS = 2_000_000;

function wholeOr(raw: string | undefined, fallback: number): number {
  const t = (raw ?? '').trim();
  if (t === '') return fallback;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * The monthly cap fails CLOSED: unset or empty is the documented default, but a
 * value that is set and is not a whole number >= 0 ('abc', '-3', '1.5') is 0,
 * so a typo turns the paid ask off rather than opening it to 1000 a month.
 */
function capOr(raw: string | undefined, fallback: number): number {
  const t = (raw ?? '').trim();
  if (t === '') return fallback;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * The three range-ask settings, as `askTypicalRange`'s deps. The store path is
 * left undefined when unset, so range-ask.ts keeps its own default
 * (`identify/data/range-ask.json`) as the one source of that path.
 */
export function rangeAskSettings(env: NodeJS.ProcessEnv = process.env): {
  monthlyCap: number;
  ceilingCents: number;
  storePath: string | undefined;
} {
  return {
    monthlyCap: capOr(settings.SHIN_RANGE_ASK_MONTHLY_CAP(env), RANGE_ASK_DEFAULT_MONTHLY_CAP),
    ceilingCents: wholeOr(settings.SHIN_RANGE_ASK_CEILING_CENTS(env), RANGE_ASK_DEFAULT_CEILING_CENTS),
    storePath: settings.SHIN_RANGE_ASK_STORE_PATH(env)?.trim() || undefined,
  };
}

/* ------------------------------------------------------------------- types */

export interface CategoryRef {
  readonly tag: string;
  readonly name: string;
}

export interface CatalogueIdentity {
  readonly name: string;
  readonly brand: string | null;
  readonly size: string | null;
  readonly barcode: string;
  readonly category: CategoryRef | null;
}

export interface CatalogueRange {
  readonly lowCents: number;
  readonly highCents: number;
  readonly medianCents: number | null;
  readonly n: number | null;
  readonly basis: 'this_product' | 'leaf_category' | 'parent_category' | 'gemini_typical';
  readonly category: CategoryRef | null;
  readonly currency: string;
  readonly unit: string | null;
}

/** `claude_slow`: the ask outlived the verdict's wait; the answer went out without it. */
export type NoRangeReason = RangeAskFailure | 'rate_limited' | 'no_shin_prices' | 'claude_slow';

export interface CatalogueAnswer {
  readonly kind: 'catalogue';
  readonly outcome: 'catalogue_hit' | 'not_in_catalogue';
  readonly offerManualEntry: boolean;
  readonly catalogueUp: boolean;
  readonly barcode: string;
  readonly identity: CatalogueIdentity | null;
  readonly range: CatalogueRange | null;
  readonly rangeSource: 'shin_prices' | 'gemini_typical' | null;
  readonly rangeAskedAt: string | null;
  readonly noRangeReason: NoRangeReason | null;
  readonly shelfPrice: { readonly cents: number; readonly from: 'weighed_label' } | null;
  /**
   * The price verdict as a distribution (docs/verdict-distribution-design-2026-09-30.md,
   * price/src/estimate.ts). Set on every catalogue hit; on a barcode missing
   * from the catalogue, set only when Shin holds a store price for it (design
   * case 2), else null and the client asks for the name (case 6).
   */
  readonly verdict: Verdict | null;
  /**
   * Design case 2: a barcode the catalogue lacks but a store prices, named by
   * the store's own product name. Null on every other answer.
   */
  readonly storeIdentity: { readonly name: string; readonly brand: string | null; readonly size: string | null; readonly barcode: string } | null;
}

/** What the scan row gets beside the answer (migration 18). */
export interface CatalogueRecord {
  readonly resolvedCode: string | null;
  readonly resolvedLabel: string | null;
  readonly outcome: 'answered' | 'refused';
  readonly failureClass: 'not_in_catalogue' | null;
  readonly answerPath: 'catalogue_hit' | 'not_in_catalogue';
  readonly rangeSource: 'shin_prices' | 'gemini_typical' | 'none' | null;
  readonly rangeBasis: string | null;
  readonly rangeMissReason: string | null;
  /** The verdict shown, or null (migration 19 records its basis, confidence and zone). */
  readonly verdict: Verdict | null;
  /** Design case 9: the catalogue and the store row disagree on size; the caller logs it. */
  readonly conflict: EstimateTrace['conflict'];
}

/** The fields of a catalogue row this path reads. `Catalogue.byGtin`'s `Candidate` has all of them. */
export interface CatalogueRow {
  readonly code: string;
  readonly name: string;
  readonly nameEn?: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly sizeValue?: number | null;
  readonly sizeUnit?: string | null;
  readonly leafCategory: string | null;
  readonly categoryPath: readonly string[];
}

export interface BarcodeDeps {
  /** `Catalogue.byGtin`, as the server's `fastLookup` holds it. Null when no catalogue is attached. */
  readonly lookup: { byGtin(code: string): unknown } | null;
  /** The price database, read-only. Null when it could not be opened: the ladder is then `none`. */
  readonly prices: DatabaseSync | null;
  /** The catalogue handle `priceRangeFor` reads categories from. Optional. */
  readonly catalogue: DatabaseSync | null;
  /** The market's ISO country code, or null when unknown (never defaulted). */
  readonly country: string | null;
  /** Currency of the prices used. */
  readonly currency: string;
  /** ISO date the range is for. */
  readonly asOf: string;
  /**
   * One capped Claude range ask, no tools, or absent for none. The server wraps
   * `askTypicalRange` with its settings and the paid-call limiter. No shopper
   * answer comes from Gemini (Jamin, 2026-09-28).
   */
  readonly askRange?: (identity: RangeIdentity) => Promise<RangeAskResult | { ok: false; reason: 'rate_limited' }>;
  /** The shopper's province or state as they chose it ("British Columbia"), or null. */
  readonly region?: string | null;
  /** The shelf price and the shopper's own lines, when the request carried them. */
  readonly shopper?: { readonly cents: number; readonly thresholds?: unknown } | null;
  /** Places a name in a category (the catalogue search), for design cases 2 and 5. */
  readonly sortName?: EstimateDeps['sortName'];
  /** How long the verdict waits for Claude before moving down the ladder. */
  readonly claudeWaitMs?: number;
}

/** The verdict, never a throw: an estimate that fails for any reason is null and the answer still goes out. */
export async function safeEstimate(...args: Parameters<typeof estimate>): Promise<Awaited<ReturnType<typeof estimate>> | null> {
  try {
    return await estimate(...args);
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- helpers */

/** "en:peanut-butters" -> "Peanut butters". Same rule as search.ts's labelForTag, which this avoids importing (it loads the vector extension). */
export function categoryName(tag: string): string {
  const label = tag.toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * A category as the English-UI shopper reads it (D38). The catalogue's leaf is
 * often a French Open Food Facts tag ("fr:boisson-alcoolisee", 503 thousand
 * products), and stripping the prefix showed French words to an English reader.
 * A non-English tag is replaced by the nearest English ancestor on the row's own
 * path ("en:alcoholic-beverages"); with no English ancestor the name is empty, and
 * the sheet then says the shorter line with no category in it rather than a
 * French one.
 */
export function categoryRef(tag: string | null | undefined, path: readonly string[] = []): CategoryRef | null {
  if (!tag) return null;
  if (!/^[a-z]{2}:/i.test(tag) || /^en:/i.test(tag)) return { tag, name: categoryName(tag) };
  // Start at the tag's own place on the path (its nearest ancestor), else at the leaf end.
  const at = path.lastIndexOf(tag);
  for (let i = at >= 0 ? at - 1 : path.length - 1; i >= 0; i--) {
    const up = path[i];
    if (typeof up === 'string' && /^en:/i.test(up)) return { tag: up, name: categoryName(up) };
  }
  return { tag, name: '' };
}

function isRow(v: unknown): v is CatalogueRow {
  return !!v && typeof v === 'object' && typeof (v as CatalogueRow).code === 'string' && typeof (v as CatalogueRow).name === 'string';
}

function identityOf(row: CatalogueRow): CatalogueIdentity {
  const brand = (row.brands ?? '').split(',')[0]?.trim() || null;
  const size =
    row.quantity?.trim() ||
    (typeof row.sizeValue === 'number' && row.sizeUnit ? `${row.sizeValue} ${row.sizeUnit}` : null);
  const leaf = row.leafCategory ?? row.categoryPath[row.categoryPath.length - 1] ?? null;
  return { name: (row.nameEn ?? row.name).trim(), brand, size, barcode: row.code, category: categoryRef(leaf, row.categoryPath) };
}

function labelOf(id: CatalogueIdentity): string {
  const withBrand = id.brand && !id.name.toLowerCase().includes(id.brand.toLowerCase()) ? `${id.brand} ${id.name}` : id.name;
  return [withBrand, id.size].filter(Boolean).join(' ');
}

function fromShinPrices(r: Exclude<RangeResult, { basis: 'none' }>, path: readonly string[] = []): CatalogueRange {
  return {
    lowCents: r.lowCents,
    highCents: r.highCents,
    medianCents: r.medianCents,
    n: r.n,
    basis: r.basis,
    category: r.basis === 'this_product' ? null : categoryRef(r.category, path),
    currency: r.currency,
    unit: null,
  };
}

/* ------------------------------------------------------------------ barcode */

/**
 * The catalogue-first answer to one scanned barcode. Never throws: a broken
 * price file is a `none` ladder, a failed ask is a reason code.
 */
export async function answerBarcodeFromCatalogue(
  barcode: CanonicalBarcode,
  deps: BarcodeDeps,
): Promise<{ answer: CatalogueAnswer; record: CatalogueRecord }> {
  const embedded = barcode.how === 'variable_measure' ? (barcode.variableMeasure?.embeddedPriceCents ?? null) : null;
  const shelfPrice = embedded !== null ? { cents: embedded, from: 'weighed_label' as const } : null;

  let row: CatalogueRow | null = null;
  if (deps.lookup) {
    try {
      const hit = deps.lookup.byGtin(barcode.gtin);
      row = isRow(hit) ? hit : null;
    } catch {
      row = null;
    }
  }

  if (!row) {
    /*
     * Design case 2: a barcode the catalogue lacks can still be one a store
     * prices (7,211 BC liquor rows). Its verdict is built from that price under
     * the store's own product name, sorted into a category by name. No Claude
     * ask here: a barcode nothing knows asks the shopper for the name first
     * (case 6), and the typed path takes it from there.
     */
    let verdict: Verdict | null = null;
    let storeIdentity: CatalogueAnswer['storeIdentity'] = null;
    if (deps.prices) {
      const est = await safeEstimate(
        {
          barcode: barcode.gtin,
          region: deps.region ?? null,
          country: deps.country,
          currency: deps.currency,
          asOf: deps.asOf,
        },
        deps.shopper ?? null,
        { prices: deps.prices, catalogue: deps.catalogue, sortName: deps.sortName },
      );
      if (est && est.verdict.dots.length > 0 && est.trace.name) {
        verdict = est.verdict;
        storeIdentity = { name: est.trace.name, brand: est.trace.brand, size: est.trace.size, barcode: barcode.gtin };
      }
    }
    return {
      answer: {
        kind: 'catalogue',
        outcome: 'not_in_catalogue',
        offerManualEntry: true,
        catalogueUp: deps.lookup !== null,
        barcode: barcode.gtin,
        identity: null,
        range: null,
        rangeSource: null,
        rangeAskedAt: null,
        noRangeReason: null,
        shelfPrice,
        verdict,
        storeIdentity,
      },
      record: {
        resolvedCode: storeIdentity ? barcode.gtin : null,
        resolvedLabel: storeIdentity ? [storeIdentity.name, storeIdentity.size].filter(Boolean).join(' ') : null,
        outcome: verdict ? 'answered' : 'refused',
        failureClass: verdict ? null : 'not_in_catalogue',
        answerPath: 'not_in_catalogue',
        rangeSource: null,
        rangeBasis: null,
        rangeMissReason: null,
        verdict,
        conflict: null,
      },
    };
  }

  const identity = identityOf(row);
  let ladder: RangeResult | null = null;
  if (deps.prices) {
    try {
      ladder = priceRangeFor(
        {
          barcode: row.code,
          name: identity.name,
          brand: identity.brand,
          size: identity.size,
          leafCategory: row.leafCategory,
          categoryPath: row.categoryPath,
          asOf: deps.asOf,
          currency: deps.currency,
        },
        { prices: deps.prices, catalogue: deps.catalogue },
      );
    } catch {
      ladder = null;
    }
  }

  let range: CatalogueRange | null = null;
  let rangeSource: CatalogueAnswer['rangeSource'] = null;
  let rangeAskedAt: string | null = null;
  let noRangeReason: NoRangeReason | null = null;

  /*
   * The verdict first. Its ladder asks Claude only when Shin's own data cannot
   * answer (own prices, other sizes, the leaf, the parent, the brand); the one
   * ask it makes is shared with the older `range` field below, so a scan never
   * spends two cap slots.
   */
  const once = onceAsk(deps.askRange, identity.category?.name ?? null);
  let verdict: Verdict | null = null;
  let conflict: EstimateTrace['conflict'] = null;
  const est = await safeEstimate(
    {
      barcode: row.code,
      name: identity.name,
      brand: identity.brand,
      size: identity.size,
      leafCategory: row.leafCategory,
      categoryPath: row.categoryPath,
      region: deps.region ?? null,
      country: deps.country,
      currency: deps.currency,
      asOf: deps.asOf,
      weighed: barcode.how === 'variable_measure',
    },
    deps.shopper ?? null,
    {
      prices: deps.prices,
      catalogue: deps.catalogue,
      ...(once ? { askClaude: once.askClaude } : {}),
      sortName: deps.sortName,
      ...(deps.claudeWaitMs !== undefined ? { claudeWaitMs: deps.claudeWaitMs } : {}),
    },
  );
  verdict = est?.verdict ?? null;
  conflict = est?.trace.conflict ?? null;

  if (ladder && ladder.basis !== 'none') {
    range = fromShinPrices(ladder, row.categoryPath);
    rangeSource = 'shin_prices';
  } else if (!once || !once.started()) {
    // No ask was passed, or the verdict answered from Shin's own data and never needed one.
    noRangeReason = 'no_shin_prices';
  } else if (once.settled() === undefined) {
    // The verdict stopped waiting (design case 27, "slow"); the ask carries on and saves its answer as data.
    noRangeReason = 'claude_slow';
  } else {
    const asked: RangeAskOutcome = once.settled()!;
    if (asked.ok) {
      range = {
        lowCents: asked.range.lowCents,
        highCents: asked.range.highCents,
        medianCents: null,
        n: null,
        basis: 'gemini_typical',
        category: null,
        currency: asked.range.currency,
        unit: asked.range.unit,
      };
      rangeSource = 'gemini_typical';
      rangeAskedAt = asked.range.askedAt;
    } else {
      noRangeReason = asked.reason;
    }
  }

  return {
    answer: {
      kind: 'catalogue',
      outcome: 'catalogue_hit',
      offerManualEntry: false,
      catalogueUp: true,
      barcode: barcode.gtin,
      identity,
      range,
      rangeSource,
      rangeAskedAt,
      noRangeReason,
      shelfPrice,
      verdict,
      storeIdentity: null,
    },
    record: {
      resolvedCode: row.code,
      resolvedLabel: labelOf(identity),
      outcome: 'answered',
      failureClass: null,
      answerPath: 'catalogue_hit',
      rangeSource: rangeSource ?? 'none',
      rangeBasis: ladder ? ladder.basis : null,
      rangeMissReason: noRangeReason,
      verdict,
      conflict,
    },
  };
}

/* -------------------------------------------------------------------- text */

/** At most this many lines per call: a busy cereal box reads as 30 to 40. */
export const MAX_MATCH_LINES = 60;
/** At most this many characters per line: a real printed line is far shorter. */
export const MAX_MATCH_LINE_CHARS = 200;

/** `{ lines: string[] }`, 1 to MAX_MATCH_LINES strings of at most MAX_MATCH_LINE_CHARS each, or the reason it is not. */
export function readMatchTextBody(body: unknown): { ok: true; lines: string[] } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body must be a JSON object' };
  const lines = (body as Record<string, unknown>).lines;
  if (!Array.isArray(lines)) return { ok: false, error: 'lines must be an array of strings' };
  if (lines.length === 0) return { ok: false, error: 'lines is empty' };
  if (lines.length > MAX_MATCH_LINES) return { ok: false, error: `lines has more than ${MAX_MATCH_LINES} entries` };
  for (const l of lines) {
    if (typeof l !== 'string') return { ok: false, error: 'lines must be an array of strings' };
    if (l.length > MAX_MATCH_LINE_CHARS) return { ok: false, error: `a line is longer than ${MAX_MATCH_LINE_CHARS} characters` };
  }
  return { ok: true, lines: lines as string[] };
}

export interface MatchTextCandidate {
  readonly barcode: string | null;
  readonly productId: string;
  readonly name: string;
  readonly brand: string | null;
  readonly size: string | null;
  readonly score: number;
}

export interface MatchTextAnswer {
  readonly kind: 'text_match';
  readonly catalogueUp: boolean;
  readonly candidates: readonly MatchTextCandidate[];
  readonly shelfPrice: { readonly cents: number; readonly forCount: number; readonly text: string } | null;
}

export interface MatchTextDeps {
  /** Anything with `Catalogue.search`'s shape: the server's worker service, or a `Catalogue` in a test. Null when not attached. */
  readonly searcher: { search(q: unknown): Promise<unknown> } | null;
  /** The catalogue handle the brand lookup reads. Optional: without it no brand is detected. */
  readonly catalogue: DatabaseSync | null;
}

/**
 * The top 3 catalogue rows the text supports, plus any shelf price read.
 * Never writes a miss (`recordMiss: false`). Throws only when the searcher
 * itself rejects (a worker timeout); the server turns that into an empty list.
 */
export async function matchText(lines: readonly string[], deps: MatchTextDeps): Promise<MatchTextAnswer> {
  if (!deps.searcher) return { kind: 'text_match', catalogueUp: false, candidates: [], shelfPrice: null };
  // Loaded here, not at the top: text-match.ts imports search.ts, which loads the vector extension.
  const { topMatchesFromText, brandLookupFromDb } = await import('../../catalogue/src/text-match.ts');
  let brands;
  try {
    brands = deps.catalogue ? brandLookupFromDb(deps.catalogue) : undefined;
  } catch {
    brands = undefined;
  }
  const result = await topMatchesFromText(lines, {
    catalogue: deps.searcher as Parameters<typeof topMatchesFromText>[1]['catalogue'],
    ...(brands ? { brands } : {}),
    recordMiss: false,
  });
  return {
    kind: 'text_match',
    catalogueUp: true,
    candidates: result.candidates.map((c) => ({
      barcode: c.barcode,
      productId: c.productId,
      name: c.name,
      brand: c.brand,
      size: c.size,
      score: c.score,
    })),
    shelfPrice: result.shelfPrice
      ? { cents: result.shelfPrice.cents, forCount: result.shelfPrice.forCount, text: result.shelfPrice.text }
      : null,
  };
}

/* ---------------------------------------------------------- typed name, D04 */

/**
 * A catalogue row as the typed-name search returns it: the fields the resolver
 * reads, and the ones the client's pick list shows. `Catalogue.search`'s
 * `Candidate` has all of them.
 */
export interface TypedRow {
  readonly code: string;
  readonly name: string;
  readonly nameEn?: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly leafCategory?: string | null;
  readonly categoryPath?: readonly string[];
}

/** Lower case, accents off, apostrophes dropped ("Tater's" is "taters"), split on anything else. */
function wordsOf(s: string | null | undefined): string[] {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function brandWordsOf(row: TypedRow): string {
  return wordsOf((row.brands ?? '').split(',')[0]).join(' ');
}

function nameWordsOf(row: TypedRow): string[] {
  return wordsOf(row.nameEn ?? row.name);
}

/** Whether every word the shopper typed is a word of this row's brand, name or size. */
function coversTyped(typed: readonly string[], row: TypedRow): boolean {
  const have = new Set([...brandWordsOf(row).split(' '), ...nameWordsOf(row), ...wordsOf(row.quantity)]);
  return typed.length > 0 && typed.every((w) => have.has(w));
}

/** The same product spelled twice: one brand, one name once punctuation is gone. */
function sameIdentity(a: TypedRow, b: TypedRow): boolean {
  return brandWordsOf(a) === brandWordsOf(b) && nameWordsOf(a).join(' ') === nameWordsOf(b).join(' ');
}

export interface TypedResolution {
  /** The row the typed words name, or null: the shopper is to pick, or nothing matched. */
  readonly row: TypedRow | null;
  /** Which rule decided, for the log and the tests. */
  readonly rule: 'search_confident' | 'covers_all_words_no_rival' | 'ambiguous' | 'no_match';
}

/**
 * Whether a typed name resolves to ONE catalogue product (design case 7 says
 * the shopper picks one of three; this decides when the server may take the
 * pick on the shopper's behalf, for the call that arrives without one).
 *
 * Resolved when, in the order the search returned them:
 *   1. the search itself banded the result `confident`; or
 *   2. the top row carries every typed word (brand, name or size) AND no other
 *      row in the list carries them all unless it is the same product spelled
 *      differently (same brand, same name once apostrophes and accents are
 *      gone: Open Food Facts holds "Tasti Taters" and "Tasti Tater's 800g" as
 *      two rows of one product).
 * Anything else with candidates is `ambiguous`: two different products carry
 * the typed words, so naming one would be a guess the shopper never made, and
 * the caller answers from the typed words alone (case 8) while offering the
 * candidates. No candidates is `no_match`.
 */
export function resolveTypedName(text: string, rows: readonly TypedRow[], band: string = 'ambiguous'): TypedResolution {
  const top = rows[0];
  if (!top) return { row: null, rule: 'no_match' };
  if (band === 'confident') return { row: top, rule: 'search_confident' };
  const typed = wordsOf(text);
  if (!coversTyped(typed, top)) return { row: null, rule: 'ambiguous' };
  const rival = rows.slice(1).some((r) => coversTyped(typed, r) && !sameIdentity(top, r));
  return rival ? { row: null, rule: 'ambiguous' } : { row: top, rule: 'covers_all_words_no_rival' };
}

/** What the client's pick list needs of one row. */
export function pickCandidate(row: TypedRow): {
  barcode: string;
  name: string;
  brand: string | null;
  size: string | null;
  category: CategoryRef | null;
} {
  const id = identityOf({
    code: row.code,
    name: row.name,
    nameEn: row.nameEn ?? null,
    brands: row.brands,
    quantity: row.quantity,
    leafCategory: row.leafCategory ?? null,
    categoryPath: row.categoryPath ?? [],
  });
  return { barcode: id.barcode, name: id.name, brand: id.brand, size: id.size, category: id.category };
}
