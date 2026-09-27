/**
 * CATALOGUE FIRST: a barcode is named by Shin's own catalogue, priced by Shin's
 * own prices, and Gemini is asked only for a typical range, capped per month.
 *
 * RULINGS.md "Catalogue first; Gemini is a capped fallback, never the identity"
 * (both founders, 2026-09-27): "Shin names a product from its own catalogue: a
 * barcode by lookup; anything else by reading every piece of text on the object
 * ... returning the top 3 for the shopper to pick ... manual entry when nothing
 * matches. The price range comes from Shin's own data by math ... Gemini is not
 * asked who the product is; it is only a fallback asked for a typical price
 * range, capped per month. ... The beta keeps today's behaviour until one
 * setting flips, which both founders decide".
 *
 * That setting is SHIN_CATALOGUE_FIRST, default off. With it off, nothing in
 * this file runs and `/api/identify` answers exactly as it did before, byte for
 * byte (pinned by test/catalogue-first-route.test.ts). With it on:
 *
 *   BARCODE (`/api/identify?gtin=`), `answerBarcodeFromCatalogue`:
 *     1. the canonical barcode (app/src/barcode.ts `canonicalBarcode`) is looked
 *        up with `Catalogue.byGtin` (catalogue/src/search.ts), the same lookup
 *        the server's `fastLookup` already holds;
 *     2. found: the catalogue row IS the identity. `priceRangeFor`
 *        (price/src/range.ts) computes the range from Shin's own prices; only
 *        when its basis is `none` is `askTypicalRange` (identify/src/range-ask.ts)
 *        called, once, with the catalogue identity. If that ask fails for any
 *        reason the answer still comes back, with the identity, no range and
 *        the reason code (RULINGS "Always answer");
 *     3. not found: `not_in_catalogue`, and the client offers manual entry.
 *        Gemini is never asked who the product is. The Gemini scan call
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
 *     rangeAskedAt: string | null,    // ISO time of the Gemini ask, gemini_typical only
 *     noRangeReason: string | null,   // why range is null, e.g. 'monthly_cap_reached'
 *     shelfPrice: null | { cents: number, from: 'weighed_label' },
 *     ms: number,
 *     scanId?: number,
 *   }
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

/* ---------------------------------------------------------------- settings */

/** SHIN_CATALOGUE_FIRST: off unless it reads '1', 'on' or 'true'. Read per call, so a test can flip it. */
export function catalogueFirstOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (settings.SHIN_CATALOGUE_FIRST(env) ?? '').trim().toLowerCase();
  return v === '1' || v === 'on' || v === 'true';
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
    monthlyCap: wholeOr(settings.SHIN_RANGE_ASK_MONTHLY_CAP(env), RANGE_ASK_DEFAULT_MONTHLY_CAP),
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

export type NoRangeReason = RangeAskFailure | 'rate_limited';

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
  /** One capped Gemini range ask. The server wraps `askTypicalRange` with its settings and the paid-call limiter. */
  readonly askRange: (identity: RangeIdentity) => Promise<RangeAskResult | { ok: false; reason: 'rate_limited' }>;
}

/* ----------------------------------------------------------------- helpers */

/** "en:peanut-butters" -> "Peanut butters". Same rule as search.ts's labelForTag, which this avoids importing (it loads the vector extension). */
export function categoryName(tag: string): string {
  const label = tag.toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ref(tag: string | null | undefined): CategoryRef | null {
  return tag ? { tag, name: categoryName(tag) } : null;
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
  return { name: (row.nameEn ?? row.name).trim(), brand, size, barcode: row.code, category: ref(leaf) };
}

function labelOf(id: CatalogueIdentity): string {
  const withBrand = id.brand && !id.name.toLowerCase().includes(id.brand.toLowerCase()) ? `${id.brand} ${id.name}` : id.name;
  return [withBrand, id.size].filter(Boolean).join(' ');
}

function fromShinPrices(r: Exclude<RangeResult, { basis: 'none' }>): CatalogueRange {
  return {
    lowCents: r.lowCents,
    highCents: r.highCents,
    medianCents: r.medianCents,
    n: r.n,
    basis: r.basis,
    category: r.basis === 'this_product' ? null : ref(r.category),
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
      },
      record: {
        resolvedCode: null,
        resolvedLabel: null,
        outcome: 'refused',
        failureClass: 'not_in_catalogue',
        answerPath: 'not_in_catalogue',
        rangeSource: null,
        rangeBasis: null,
        rangeMissReason: null,
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

  if (ladder && ladder.basis !== 'none') {
    range = fromShinPrices(ladder);
    rangeSource = 'shin_prices';
  } else {
    let asked: RangeAskResult | { ok: false; reason: 'rate_limited' };
    try {
      asked = await deps.askRange({
        name: identity.name,
        brand: identity.brand,
        size: identity.size,
        category: identity.category?.name ?? null,
        market: deps.country ?? '',
      });
    } catch {
      asked = { ok: false, reason: 'model_error' };
    }
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
