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
 *     3. not found: before anything says so, the item is named elsewhere
 *        (RULINGS.md "A scan never ends with no result", 2026-10-10), in
 *        order: a live Open Food Facts lookup (identity only), a reading
 *        Claude already made of this pack, then the camera frame sent to the
 *        cheapest Claude, no web search, to read the name, brand and size
 *        (`deps.nameElsewhere`, wired in server.ts; the frame comes by
 *        `POST /api/identify/pack`). A name found takes step 2's price ladder
 *        as `named_outside_catalogue`, with `identitySource` saying who named
 *        it. Only when every step failed is it `not_in_catalogue` with manual
 *        entry offered, and `noNameReasons` says why. The Gemini scan call
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
 *     outcome: 'catalogue_hit' | 'not_in_catalogue' | 'named_outside_catalogue' | 'frame_wanted',
 *     offerManualEntry: boolean,      // true exactly when outcome is not_in_catalogue
 *     identitySource?: 'open_food_facts' | 'claude_reading',   // named_outside_catalogue only
 *     noNameReasons?: string[],       // a miss after the naming steps ran: why each failed
 *     catalogueUp: boolean,           // false: the catalogue is not attached at all, or its lookup threw
 *                                     // ([catalogue-fault] lookup_failed): "we did not look", never "never seen"
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
 *     rangeSource: 'shin_prices' | 'claude_typical' | null,
 *     rangeAskedAt: string | null,    // ISO time of the Claude ask, claude_typical only
 *     noRangeReason: string | null,   // why range is null, e.g. 'monthly_cap_reached'
 *     shelfPrice: null | { cents: number, from: 'weighed_label' },
 *     verdict: null | Verdict,        // price/src/estimate.ts, the design's response contract
 *     storeIdentity: null | { name, brand, size, barcode },   // design case 2 only
 *     ms: number,
 *     scanId?: number,
 *   }
 *
 * `rangeSource` (and the scan row's `range_source`) says which model answered:
 * `claude_typical` since D-231 (2026-10-10), because the range ask has been
 * Claude since 2026-09-28. Old rows are left as written: `gemini_typical` on a
 * row scanned from 2026-09-28 until this fix is the same Claude ask under its
 * old label (app/src/migrations.ts, version 18, says how to read it).
 * The range's `basis` keeps `gemini_typical` as a historical wire value, not a
 * statement of which model answered: it is what the client
 * (app/public/js/lib/catalogue-range.js) and the native copies built from it
 * already read, so renaming it waits for a client release that reads both.
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
import { parentOf, priceRangeFor, type RangeResult } from '../../price/src/range.ts';
import type { RangeAskFailure, RangeAskResult, RangeIdentity } from '../../identify/src/range-ask.ts';
import type { CanonicalBarcode } from './barcode.ts';
import { estimate, type EstimateDeps, type EstimateTrace, type Verdict } from '../../price/src/estimate.ts';
import { onceAsk, shownRange, type RangeAskOutcome } from './distribution.ts';
import { positionalParent, type CategoryFaultKind, type CategoryGuard } from './category-guard.ts';

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

export const PACK_READ_DEFAULT_MONTHLY_CAP = 300;

/**
 * The frame-read settings (RULINGS.md "A scan never ends with no result"), as
 * `readPack`'s deps. The cap fails closed exactly as the range ask's does; the
 * store path is left undefined when unset so pack-read.ts keeps its default.
 */
export function packReadSettings(env: NodeJS.ProcessEnv = process.env): { monthlyCap: number; storePath: string | undefined } {
  return {
    monthlyCap: capOr(settings.SHIN_PACK_READ_MONTHLY_CAP(env), PACK_READ_DEFAULT_MONTHLY_CAP),
    storePath: settings.SHIN_PACK_READ_STORE_PATH(env)?.trim() || undefined,
  };
}

/* ------------------------------------------------------------------ faults */

/*
 * A CATALOGUE THAT FAILED MUST NEVER READ AS A CATALOGUE THAT HAS NOTHING.
 *
 * Both faults below sit in front of a shopper, so neither throws and neither blocks the answer.
 * Each is logged once as `[catalogue-fault] <kind> <reason>` and counted; `catalogueFaults()` is
 * what `/api/health` shows, beside the `[category-fault]` counts of category-guard.ts.
 */
const faultCounts: Record<string, number> = {};

function warnCatalogueFault(kind: string, detail: string): void {
  faultCounts[kind] = (faultCounts[kind] ?? 0) + 1;
  console.warn(`[catalogue-fault] ${kind} ${detail}`);
}

/** Lookups and brand reads that failed since start, by kind. Empty means none. */
export function catalogueFaults(): Record<string, number> {
  return { ...faultCounts };
}

/** TEST ONLY: forget the counts. */
export function resetCatalogueFaultsForTests(): void {
  for (const k of Object.keys(faultCounts)) delete faultCounts[k];
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

/**
 * `claude_slow`: the ask outlived the verdict's wait; the answer went out without it.
 * `pool_too_wide` (D-233): the only Pexi basis was a category pool too wide to mean anything, and
 * Claude did not answer, so there is no range and no verdict: the estimate is too thin to judge a price.
 */
export type NoRangeReason = RangeAskFailure | 'rate_limited' | 'no_shin_prices' | 'claude_slow' | 'pool_too_wide';

export interface CatalogueAnswer {
  readonly kind: 'catalogue';
  /**
   * `named_outside_catalogue`: the catalogue lacks it and Open Food Facts or Claude's reading of the pack
   * named it (`identitySource` says which). `frame_wanted`: nothing named it yet and the client said it holds
   * a frame, so it is asked to send it to `POST /api/identify/pack` before anything says "not found".
   */
  readonly outcome: 'catalogue_hit' | 'not_in_catalogue' | 'named_outside_catalogue' | 'frame_wanted';
  readonly offerManualEntry: boolean;
  readonly catalogueUp: boolean;
  readonly barcode: string;
  readonly identity: CatalogueIdentity | null;
  readonly range: CatalogueRange | null;
  readonly rangeSource: 'shin_prices' | 'claude_typical' | null;
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
  /** Who named an item the catalogue lacks. Absent on a catalogue hit and on a miss. */
  readonly identitySource?: NamedElsewhere['source'];
  /** Why nothing named the item, one code per step tried (`off_not_found`, `no_frame`, `claude_monthly_cap_reached`). Present only after those steps ran. */
  readonly noNameReasons?: readonly string[];
  /**
   * D-233: the category pool set aside as too wide to price this item (width-flag.ts), with the
   * prices it holds, ascending, scaled to this item's size: context for "Prices Pexi has seen",
   * never a centre, a range or a zone. Present only when a pool was set aside.
   */
  readonly widePool?: { readonly category: CategoryRef | null; readonly n: number; readonly cents: readonly number[] };
}

/** What the scan row gets beside the answer (migration 18). */
export interface CatalogueRecord {
  readonly resolvedCode: string | null;
  readonly resolvedLabel: string | null;
  readonly outcome: 'answered' | 'refused';
  readonly failureClass: 'not_in_catalogue' | null;
  readonly answerPath: 'catalogue_hit' | 'not_in_catalogue' | 'open_food_facts' | 'claude_reading' | 'frame_wanted';
  readonly rangeSource: 'shin_prices' | 'claude_typical' | 'none' | null;
  readonly rangeBasis: string | null;
  readonly rangeMissReason: string | null;
  /** The verdict shown, or null (migration 19 records its basis, confidence and zone). */
  readonly verdict: Verdict | null;
  /** Design case 9: the catalogue and the store row disagree on size; the caller logs it. */
  readonly conflict: EstimateTrace['conflict'];
  /**
   * Category faults the serve-time check found on this answer (category-guard.ts).
   * Present only when there are some; absent means none were found OR the check
   * was off, which `/api/health` says separately.
   */
  readonly categoryFaults?: readonly CategoryFaultKind[];
}

/** A name for a barcode the catalogue lacks, found by Open Food Facts or read off the pack by Claude. */
export interface NamedElsewhere {
  readonly name: string;
  readonly brand: string | null;
  readonly size: string | null;
  readonly source: 'open_food_facts' | 'claude_reading';
}

/**
 * What the steps after a catalogue miss found: a name, or every reason they did not, in the order tried.
 * `frameWanted`: the next step needs the camera frame, and the client said it holds one.
 */
export type NameElsewhereResult =
  | { readonly ok: true; readonly named: NamedElsewhere }
  | { readonly ok: false; readonly reasons: readonly string[]; readonly frameWanted: boolean };

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
  /**
   * The serve-time category safeguard (category-guard.ts). When an answer used a
   * parent rung it checks the parent against the taxonomy, logs and counts any
   * fault, and never changes the answer. Absent: no check, and no claim of one.
   */
  readonly categoryGuard?: CategoryGuard;
  /**
   * The steps after a catalogue miss (RULINGS.md "A scan never ends with no result"): a live Open Food Facts
   * lookup, a saved Claude reading, the frame read by Claude. The server wires them; absent, a miss is a miss.
   */
  readonly nameElsewhere?: (gtin: string) => Promise<NameElsewhereResult>;
}

/**
 * The verdict a shopper may be shown from an estimate (D-233). A too-thin one
 * (the only pool was too wide and Claude did not answer) is null: its bell is a
 * prior, and a client places a typed price on any bell it is handed, so the
 * only way to show no zone is to send no verdict. Logged loudly and counted
 * with the reason. Every route that answers from `estimate` goes through here.
 */
export function shownVerdict(est: Awaited<ReturnType<typeof estimate>> | null, where: string): Verdict | null {
  if (!est) return null;
  const thin = est.trace.tooThin;
  if (!thin) return est.verdict;
  const w = est.trace.widePool;
  const pool = w ? `${w.rung} ${w.tag} n=${w.n} ${w.cents[0]}..${w.cents[w.cents.length - 1]} cents` : 'a pool';
  warnCatalogueFault('pool_too_wide', `${where} estimate too thin: ${pool} set aside as too wide, Claude ${thin.why}; no verdict shown`);
  return null;
}

/** The verdict, never a throw: an estimate that fails for any reason is null and the answer still goes out. */
export async function safeEstimate(...args: Parameters<typeof estimate>): Promise<Awaited<ReturnType<typeof estimate>> | null> {
  try {
    return await estimate(...args);
  } catch (err) {
    // Never blocks the shopper, never silent: the fault is logged with the fixed tag.
    console.error(`[category-fault] estimate_failed - ${err instanceof Error ? err.message : String(err)}`);
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
  // True when the lookup itself threw: the catalogue was asked and could not answer, which is
  // not the same as answering "never seen". It reads as `catalogueUp: false` ("we did not look").
  let lookupFailed = false;
  if (deps.lookup) {
    try {
      const hit = deps.lookup.byGtin(barcode.gtin);
      row = isRow(hit) ? hit : null;
    } catch (err) {
      row = null;
      lookupFailed = true;
      warnCatalogueFault('lookup_failed', `${barcode.gtin} ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!row) {
    /*
     * Design case 2: a barcode the catalogue lacks can still be one a store
     * prices (7,211 BC liquor rows). Its verdict is built from that price under
     * the store's own product name, sorted into a category by name.
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
        { prices: deps.prices, catalogue: deps.catalogue, sortName: deps.sortName, taxonomy: deps.categoryGuard?.taxonomy() ?? null },
      );
      if (est && est.verdict.dots.length > 0 && est.trace.name) {
        verdict = est.verdict;
        storeIdentity = { name: est.trace.name, brand: est.trace.brand, size: est.trace.size, barcode: barcode.gtin };
      }
    }

    /*
     * RULINGS.md "A scan never ends with no result" (2026-10-10): when nothing
     * of Pexi's names the barcode, it is named elsewhere before "not found" is
     * ever said, in order: a live Open Food Facts lookup, a reading Claude
     * already made of this pack, then the frame sent to Claude to read now
     * (`deps.nameElsewhere`, wired in server.ts). A name found there takes the
     * ordinary price ladder below (`answerNamedItem`). Typing the name is the
     * last step, and the reasons every step failed travel on the answer.
     */
    let noName: Extract<NameElsewhereResult, { ok: false }> | null = null;
    if (!verdict && deps.nameElsewhere) {
      let named: NameElsewhereResult;
      try {
        named = await deps.nameElsewhere(barcode.gtin);
      } catch (err) {
        warnCatalogueFault('name_elsewhere_failed', `${barcode.gtin} ${err instanceof Error ? err.message : String(err)}`);
        named = { ok: false, reasons: ['name_elsewhere_threw'], frameWanted: false };
      }
      if (named.ok) return answerNamedItem(named.named, barcode.gtin, barcode.gtin, deps, shelfPrice, barcode.how === 'variable_measure');
      noName = named;
    }

    if (noName?.frameWanted) {
      // The client holds a frame and has not sent it: it is asked for it, and nothing here says "not found" yet.
      return {
        answer: {
          ...emptyAnswer(barcode.gtin, deps.lookup !== null && !lookupFailed, shelfPrice),
          outcome: 'frame_wanted',
          offerManualEntry: false,
          noNameReasons: noName.reasons,
        },
        record: { ...missRecord(null, null), answerPath: 'frame_wanted', rangeMissReason: `no_name:${noName.reasons.join(',')}` },
      };
    }
    return {
      answer: {
        ...emptyAnswer(barcode.gtin, deps.lookup !== null && !lookupFailed, shelfPrice),
        verdict,
        storeIdentity,
        ...(noName ? { noNameReasons: noName.reasons } : {}),
      },
      record: {
        ...missRecord(verdict, storeIdentity ? [storeIdentity.name, storeIdentity.size].filter(Boolean).join(' ') : null),
        resolvedCode: storeIdentity ? barcode.gtin : null,
        rangeMissReason: noName ? `no_name:${noName.reasons.join(',')}` : null,
      },
    };
  }

  return priceIdentity(row, row.code, barcode.gtin, deps, shelfPrice, barcode.how === 'variable_measure', {
    outcome: 'catalogue_hit',
    answerPath: 'catalogue_hit',
    identitySource: null,
  });
}

/** A miss answer with nothing in it yet: the shape every not-found answer starts from. */
function emptyAnswer(barcode: string, catalogueUp: boolean, shelfPrice: CatalogueAnswer['shelfPrice']): CatalogueAnswer {
  return {
    kind: 'catalogue',
    outcome: 'not_in_catalogue',
    offerManualEntry: true,
    catalogueUp,
    barcode,
    identity: null,
    range: null,
    rangeSource: null,
    rangeAskedAt: null,
    noRangeReason: null,
    shelfPrice,
    verdict: null,
    storeIdentity: null,
  };
}

function missRecord(verdict: Verdict | null, label: string | null): CatalogueRecord {
  return {
    resolvedCode: null,
    resolvedLabel: label,
    outcome: verdict ? 'answered' : 'refused',
    failureClass: verdict ? null : 'not_in_catalogue',
    answerPath: 'not_in_catalogue',
    // D-235: a store-only answer has no range field, but its verdict is shown, and the row says what it stood on.
    rangeSource: shownRange(verdict)?.rangeSource ?? null,
    rangeBasis: shownRange(verdict)?.rangeBasis ?? null,
    rangeMissReason: null,
    verdict,
    conflict: null,
  };
}

/**
 * D-235: what the scan row says the shown range came from. The range ladder's own rung when it set the range
 * (`shin_prices`), `claude_typical` for Claude's answer, and otherwise the rung the shown verdict stood on: the
 * verdict ladder and the range ladder can disagree (a wide leaf pool set aside while the verdict stands on its
 * parent), and the row records what the sheet showed, never `none` beside a verdict.
 */
function recordedRange(
  rangeSource: CatalogueAnswer['rangeSource'],
  usable: RangeResult | null,
  laddered: boolean,
  verdict: Verdict | null,
): { rangeSource: NonNullable<CatalogueRecord['rangeSource']>; rangeBasis: string | null } {
  if (rangeSource === 'shin_prices' && usable) return { rangeSource, rangeBasis: usable.basis };
  if (rangeSource === 'claude_typical') return { rangeSource, rangeBasis: 'claude_typical' };
  const shown = shownRange(verdict);
  if (shown) return shown;
  return { rangeSource: 'none', rangeBasis: laddered ? 'none' : null };
}

/**
 * A name found outside the catalogue (Open Food Facts, or Claude's reading of
 * the pack), priced by the same ladder a catalogue hit takes: Pexi's own
 * prices, the category the name sorts into, the brand, then the one capped
 * Claude range ask. `answerBarcode` is what the answer shows as the barcode;
 * `priceBarcode` is the code prices are looked up by, null for a misread (a
 * reading whose check digit failed is no product's code, and its prices would
 * be some other product's). Never throws.
 */
export async function answerNamedItem(
  named: NamedElsewhere,
  answerBarcode: string,
  priceBarcode: string | null,
  deps: BarcodeDeps,
  shelfPrice: CatalogueAnswer['shelfPrice'] = null,
  weighed = false,
): Promise<{ answer: CatalogueAnswer; record: CatalogueRecord }> {
  const row: CatalogueRow = {
    code: answerBarcode,
    name: named.name,
    nameEn: null,
    brands: named.brand,
    quantity: named.size,
    leafCategory: null,
    categoryPath: [],
  };
  return priceIdentity(row, priceBarcode, answerBarcode, deps, shelfPrice, weighed, {
    outcome: 'named_outside_catalogue',
    answerPath: named.source,
    identitySource: named.source,
  });
}

/** One identity through the price ladder: the catalogue hit's path, and the named item's. */
async function priceIdentity(
  row: CatalogueRow,
  priceBarcode: string | null,
  answerBarcode: string,
  deps: BarcodeDeps,
  shelfPrice: CatalogueAnswer['shelfPrice'],
  weighed: boolean,
  how: {
    outcome: 'catalogue_hit' | 'named_outside_catalogue';
    answerPath: CatalogueRecord['answerPath'];
    identitySource: NamedElsewhere['source'] | null;
  },
): Promise<{ answer: CatalogueAnswer; record: CatalogueRecord }> {
  let identity = identityOf(row);

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
      barcode: priceBarcode,
      name: identity.name,
      brand: identity.brand,
      size: identity.size,
      leafCategory: row.leafCategory,
      categoryPath: row.categoryPath,
      region: deps.region ?? null,
      country: deps.country,
      currency: deps.currency,
      asOf: deps.asOf,
      weighed,
    },
    deps.shopper ?? null,
    {
      prices: deps.prices,
      catalogue: deps.catalogue,
      taxonomy: deps.categoryGuard?.taxonomy() ?? null,
      ...(once ? { askClaude: once.askClaude } : {}),
      sortName: deps.sortName,
      ...(deps.claudeWaitMs !== undefined ? { claudeWaitMs: deps.claudeWaitMs } : {}),
    },
  );
  verdict = shownVerdict(est, row.code);
  conflict = est?.trace.conflict ?? null;
  // D-233: the pool the verdict ladder set aside as too wide, and whether that left it too thin to judge.
  const wide = est?.trace.widePool ?? null;
  const thin = est?.trace.tooThin ?? null;

  // A name from outside the catalogue has no category of its own; the one the verdict sorted it into is the range's too.
  const sorted = !row.leafCategory && row.categoryPath.length === 0 ? (est?.trace.sorted ?? null) : null;
  const leafCategory = sorted ? (sorted.leafCategory ?? sorted.categoryPath[sorted.categoryPath.length - 1] ?? null) : row.leafCategory;
  const categoryPath = sorted ? sorted.categoryPath : row.categoryPath;
  if (sorted) identity = { ...identity, category: categoryRef(leafCategory, categoryPath) };

  let ladder: RangeResult | null = null;
  if (deps.prices) {
    try {
      ladder = priceRangeFor(
        {
          barcode: priceBarcode,
          name: identity.name,
          brand: identity.brand,
          size: identity.size,
          leafCategory,
          categoryPath,
          asOf: deps.asOf,
          currency: deps.currency,
        },
        // The taxonomy the category guard loaded: the parent rung is the taxonomy parent. Without one the ladder
        // falls back to the position rule and records `parent_unchecked` on the step (never silent).
        { prices: deps.prices, catalogue: deps.catalogue, taxonomy: deps.categoryGuard?.taxonomy() ?? null },
      );
    } catch (err) {
      // The answer goes on without a range, but the fault is logged with the fixed tag, never swallowed.
      console.error(`[category-fault] range_failed ${row.code} - ${err instanceof Error ? err.message : String(err)}`);
      ladder = null;
    }
  }

  /*
   * D-233: a category pool too wide to mean anything sets no range. The range
   * ladder flags its own pools (`wide`, width-flag.ts), and when the verdict
   * ladder set one aside, a category range is set aside with it, so the range
   * and the verdict never disagree about whether the pool is usable. The
   * item's own prices (`this_product`) are never set aside.
   */
  const categoryLadder = ladder !== null && (ladder.basis === 'leaf_category' || ladder.basis === 'parent_category') ? ladder : null;
  const poolTooWide = wide !== null || (categoryLadder?.wide ?? false);
  const ladderUsable = ladder !== null && ladder.basis !== 'none' && (ladder.basis === 'this_product' || !poolTooWide);
  let claudeWhy: string | null = null;
  if (ladderUsable) {
    range = fromShinPrices(ladder as Exclude<RangeResult, { basis: 'none' }>, categoryPath);
    rangeSource = 'shin_prices';
  } else if (!once || !once.started()) {
    // No ask was passed, or the verdict answered from Shin's own data and never needed one.
    noRangeReason = poolTooWide ? 'pool_too_wide' : 'no_shin_prices';
    claudeWhy = once ? 'not_asked' : 'no_ask';
  } else if (once.settled() === undefined) {
    // The verdict stopped waiting (design case 27, "slow"); the ask carries on and saves its answer as data.
    noRangeReason = poolTooWide ? 'pool_too_wide' : 'claude_slow';
    claudeWhy = 'timeout';
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
      // D-231: the ask is Claude's, and the row says so (the range's `basis` above stays the historical wire value).
      rangeSource = 'claude_typical';
      rangeAskedAt = asked.range.askedAt;
    } else {
      noRangeReason = poolTooWide ? 'pool_too_wide' : asked.reason;
      claudeWhy = asked.reason;
    }
  }
  /*
   * The scan row says which way it went: `pool_too_wide` when the pool was set
   * aside and Claude answered, `pool_too_wide:<why>` when nothing did (the
   * verdict ladder's own reason first, it is the one that decided the verdict).
   */
  const rangeMissReason: string | null = poolTooWide
    ? range
      ? 'pool_too_wide'
      : `pool_too_wide:${thin?.why ?? claudeWhy ?? 'unknown'}`
    : noRangeReason;
  if (poolTooWide && !range && !thin) {
    // The range ladder alone set a pool aside and no range came back: said once, loudly, like the verdict's.
    warnCatalogueFault('pool_too_wide', `${row.code} range set aside as too wide, Claude ${claudeWhy ?? 'unknown'}; no range shown`);
  }

  /*
   * The category safeguard. When the range or the verdict stood on a PARENT
   * rung, the parent must be an ancestor of the leaf in the taxonomy. A fault is
   * logged, counted and put on the record; the answer above is not touched.
   * The range's parent is the one the ladder reports; the verdict's is picked by
   * the same rule the verdict ladder uses (`parentOf`: the taxonomy parent, or
   * the tag before the leaf when no taxonomy was given).
   */
  const categoryFaults: CategoryFaultKind[] = [];
  if (deps.categoryGuard) {
    const at = positionalParent(leafCategory, categoryPath);
    const verdictParent = parentOf(at.leaf, categoryPath, deps.categoryGuard.taxonomy()).parent;
    const checks: [('range' | 'verdict'), string | null][] = [];
    if (ladderUsable && ladder!.basis === 'parent_category') checks.push(['range', ladder!.category]);
    if (verdict && verdict.basis === 'parent_category') checks.push(['verdict', verdictParent]);
    for (const [via, parent] of checks) {
      const f = deps.categoryGuard.check({ via, barcode: row.code, leaf: at.leaf, parent });
      if (f && !categoryFaults.includes(f)) categoryFaults.push(f);
    }
  }

  return {
    answer: {
      kind: 'catalogue',
      outcome: how.outcome,
      offerManualEntry: false,
      catalogueUp: true,
      barcode: answerBarcode,
      identity,
      range,
      rangeSource,
      rangeAskedAt,
      noRangeReason,
      shelfPrice,
      verdict,
      storeIdentity: null,
      ...(how.identitySource ? { identitySource: how.identitySource } : {}),
      ...(wide ? { widePool: { category: categoryRef(wide.tag, categoryPath), n: wide.n, cents: wide.cents } } : {}),
    },
    record: {
      resolvedCode: row.code,
      resolvedLabel: labelOf(identity),
      outcome: 'answered',
      failureClass: null,
      answerPath: how.answerPath,
      ...recordedRange(rangeSource, ladderUsable ? ladder : null, ladder !== null, verdict),
      rangeMissReason,
      verdict,
      conflict,
      ...(categoryFaults.length > 0 ? { categoryFaults } : {}),
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
  } catch (err) {
    // The match still runs, without brands; the fault is said out loud so a catalogue that
    // lost its text index does not just look like a catalogue with no brand in the text.
    brands = undefined;
    warnCatalogueFault('brand_lookup_failed', err instanceof Error ? err.message : String(err));
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
