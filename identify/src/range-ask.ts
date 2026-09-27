/**
 * THE LAST-RESORT RANGE ASK. Founders, 2026-09-27: Shin checks its own
 * catalogue and computes a price range from its own prices by math first.
 * Only when that gives nothing does Shin ask the AI "what is the typical price
 * range for this item", and that ask is limited per month. The founder chose
 * Gemini for it.
 *
 * WHAT THIS FILE DOES, IN ORDER:
 *   1. takes the product identity Shin already has (name, brand, size,
 *      category, market). Never an image. No name means no ask;
 *   2. looks up a 30-day cache keyed on normalised name + brand + size +
 *      market. A hit returns the stored answer, with the time of the call that
 *      produced it, and neither calls the model nor counts against the cap;
 *   3. counts the ask against this UTC month BEFORE sending it (an attempt
 *      counts whether or not it succeeds). At or over the monthly limit it
 *      returns `monthly_cap_reached` and sends nothing;
 *   4. makes ONE ungrounded Gemini call through the existing `GeminiProvider`
 *      (`./providers/gemini.ts`), which sends no `tools` key at all. No Google
 *      Search, so none of the Grounded Results limits in RULINGS.md apply to
 *      the answer and it may be cached here;
 *   5. validates the JSON hard. Anything wrong comes back `{ ok: false, reason }`
 *      and no number is ever substituted for the one the model gave.
 *
 * NOT DONE HERE: the catalogue-first math, and the wiring that calls this only
 * when that math found nothing. This file is the ask and nothing else.
 *
 * NOTHING HERE OPENS A SOCKET IN A TEST. `deps.provider` is injected; the
 * default provider is built only when no provider is passed.
 */

import * as settings from '../../settings/src/index.ts';
import { loadDotEnv } from './env.ts';
import { classifyProviderError, type Provider } from './provider.ts';
import { GeminiProvider } from './providers/gemini.ts';
import { modelForScan } from './providers/gemini-scan.ts';
import {
  DEFAULT_RANGE_STORE_PATH,
  readCachedRange,
  reserveMonthlyRangeCall,
  writeCachedRange,
} from './range-ask-store.ts';

/* ------------------------------------------------------------------ types */

/** What Shin already knows about the product. Never an image. */
export interface RangeIdentity {
  readonly name: string;
  readonly brand?: string | null;
  readonly size?: string | null;
  readonly category?: string | null;
  /** ISO 3166 alpha-2 market, for example 'CA'. Decides the only currency accepted back. */
  readonly market: string;
}

export type RangeConfidence = 'low' | 'medium' | 'high';

export interface TypicalRange {
  readonly lowCents: number;
  readonly highCents: number;
  readonly currency: string;
  /** What one price in the range buys, as the model stated it ("one 500 mL bottle", "each"). */
  readonly unit: string;
  readonly confidence: RangeConfidence;
  /** ISO time of the call that produced this answer, kept on a cache hit too. */
  readonly askedAt: string;
  /** The model the provider says answered. */
  readonly model: string;
}

export type RangeAskFailure =
  | 'no_name'
  | 'unsupported_market'
  | 'no_api_key'
  | 'monthly_cap_reached'
  | 'cap_store_error'
  | 'model_error'
  | 'invalid_json'
  | 'model_does_not_know'
  | 'not_integer_cents'
  | 'not_positive'
  | 'low_above_high'
  | 'over_ceiling'
  | 'bad_currency'
  | 'currency_mismatch'
  | 'bad_unit'
  | 'bad_confidence';

export type RangeAskResult =
  | { readonly ok: true; readonly range: TypicalRange; readonly cached: boolean }
  | { readonly ok: false; readonly reason: RangeAskFailure; readonly detail?: string };

export interface RangeAskDeps {
  /** The Gemini provider. Default: `new GeminiProvider()` (reads GEMINI_API_KEY). Tests always pass one. */
  readonly provider?: Provider;
  /** Asks allowed per UTC calendar month. Default 1000. 0 turns the ask off. */
  readonly monthlyCap?: number;
  /** The count-and-cache file. Default `identify/data/range-ask.json`. */
  readonly storePath?: string;
  /** Highest acceptable `high_cents`. Default 2,000,000 (20,000.00 in the market's currency). */
  readonly ceilingCents?: number;
  /** How long a cached answer stands. Default 30 days. */
  readonly cacheTtlMs?: number;
  /** Model id. Default: the same choice the scan makes (`SHIN_GEMINI_MODEL`, else `SHIN_GEMINI_MODEL_3`, else gemini-3.8-flash). */
  readonly model?: string;
  /** Per-call clock. Default `SHIN_GEMINI_TIMEOUT_MS`, else 30000. */
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

/* --------------------------------------------------------------- defaults */

export const DEFAULT_MONTHLY_CAP = 1000;
export const DEFAULT_CEILING_CENTS = 2_000_000;
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 256;

/** Markets this ask knows the currency of. A market not listed is refused rather than guessed. */
const MARKETS: Readonly<Record<string, { country: string; currency: string }>> = {
  CA: { country: 'Canada', currency: 'CAD' },
  US: { country: 'United States', currency: 'USD' },
};

/* ----------------------------------------------------------------- prompt */

export const RANGE_SYSTEM =
  'You estimate the typical shelf price range of one retail product in one country. ' +
  'Answer only from what you already know. If you do not know this product well enough to give a range ' +
  'a shopper in that country would recognise, set known to false and set both prices to null. ' +
  'Prices are integer cents in the currency you are told, before sales tax, for exactly the size named. ' +
  'Never convert from another currency.';

const NOT_STATED = 'not stated';

export function buildRangePrompt(identity: RangeIdentity, country: string, currency: string): string {
  const line = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : NOT_STATED);
  return [
    `Product: ${identity.name.trim()}`,
    `Brand: ${line(identity.brand)}`,
    `Size: ${line(identity.size)}`,
    `Category: ${line(identity.category)}`,
    `Country: ${country}`,
    `Currency: ${currency}`,
    '',
    `What is the typical price range for this item at ordinary retailers in ${country}? ` +
      'Reply with JSON only: known, low_cents, high_cents, currency (the three-letter code above), ' +
      'unit (what one price in the range buys, for example "one 500 mL bottle" or "each"), ' +
      'and confidence (low, medium or high).',
  ].join('\n');
}

export const RANGE_SCHEMA = {
  name: 'typical_price_range',
  schema: {
    type: 'object',
    properties: {
      known: { type: 'boolean' },
      low_cents: { type: ['integer', 'null'] },
      high_cents: { type: ['integer', 'null'] },
      currency: { type: 'string' },
      unit: { type: 'string' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['known', 'low_cents', 'high_cents', 'currency', 'unit', 'confidence'],
    additionalProperties: false,
  },
} as const;

/* -------------------------------------------------------------- cache key */

function norm(v: string | null | undefined): string {
  return (v ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Normalised name + brand + size + market. Size loses its spaces so "500 mL" and "500ml" meet. */
export function rangeCacheKey(identity: RangeIdentity): string {
  return JSON.stringify([
    norm(identity.name),
    norm(identity.brand),
    norm(identity.size).replace(/\s+/g, ''),
    norm(identity.market).toUpperCase(),
  ]);
}

/* ------------------------------------------------------------- validation */

type Validated = { ok: true; value: Omit<TypicalRange, 'askedAt' | 'model'> } | { ok: false; reason: RangeAskFailure; detail?: string };

/** Hard checks on the model's object. Never repairs, never substitutes. */
export function validateRange(raw: unknown, expectedCurrency: string, ceilingCents: number): Validated {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_json', detail: 'the answer is not a JSON object' };
  }
  const o = raw as Record<string, unknown>;
  if (o.known === false) return { ok: false, reason: 'model_does_not_know' };
  const low = o.low_cents;
  const high = o.high_cents;
  if (typeof low !== 'number' || typeof high !== 'number' || !Number.isInteger(low) || !Number.isInteger(high)) {
    return { ok: false, reason: 'not_integer_cents' };
  }
  if (low <= 0 || high <= 0) return { ok: false, reason: 'not_positive' };
  if (low > high) return { ok: false, reason: 'low_above_high' };
  if (high > ceilingCents) return { ok: false, reason: 'over_ceiling', detail: `high_cents ${high} > ${ceilingCents}` };
  const currency = typeof o.currency === 'string' ? o.currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: 'bad_currency' };
  if (currency !== expectedCurrency) {
    return { ok: false, reason: 'currency_mismatch', detail: `${currency} is not ${expectedCurrency}` };
  }
  const unit = typeof o.unit === 'string' ? o.unit.trim() : '';
  if (unit === '' || unit.length > 80) return { ok: false, reason: 'bad_unit' };
  const confidence = o.confidence;
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') return { ok: false, reason: 'bad_confidence' };
  return { ok: true, value: { lowCents: low, highCents: high, currency, unit, confidence } };
}

function fromCache(range: Record<string, unknown>, askedAt: string): TypicalRange | null {
  const r = range as Partial<TypicalRange>;
  if (
    typeof r.lowCents !== 'number' ||
    typeof r.highCents !== 'number' ||
    typeof r.currency !== 'string' ||
    typeof r.unit !== 'string' ||
    typeof r.confidence !== 'string' ||
    typeof r.model !== 'string'
  ) {
    return null;
  }
  return {
    lowCents: r.lowCents,
    highCents: r.highCents,
    currency: r.currency,
    unit: r.unit,
    confidence: r.confidence as RangeConfidence,
    askedAt,
    model: r.model,
  };
}

function positiveOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/* ------------------------------------------------------------------ entry */

/**
 * Asks Gemini, once, for the typical price range of `identity`. NEVER THROWS:
 * every failure is `{ ok: false, reason }`.
 */
export async function askTypicalRange(identity: RangeIdentity, deps: RangeAskDeps = {}): Promise<RangeAskResult> {
  const clock = deps.now ?? Date.now;
  const storePath = deps.storePath ?? DEFAULT_RANGE_STORE_PATH;
  const ttl = positiveOr(deps.cacheTtlMs, CACHE_TTL_MS);
  const cap = Math.floor(positiveOr(deps.monthlyCap, DEFAULT_MONTHLY_CAP));
  const ceiling = positiveOr(deps.ceilingCents, DEFAULT_CEILING_CENTS);

  if (typeof identity?.name !== 'string' || identity.name.trim() === '') return { ok: false, reason: 'no_name' };
  const market = MARKETS[norm(identity.market).toUpperCase()];
  if (!market) return { ok: false, reason: 'unsupported_market', detail: String(identity.market) };

  const key = rangeCacheKey(identity);
  try {
    const hit = readCachedRange(storePath, key, clock(), ttl);
    if (hit) {
      const range = fromCache(hit.range, hit.askedAt);
      if (range && range.currency === market.currency) return { ok: true, range, cached: true };
    }
  } catch {
    // An unreadable cache is a miss, not a failure.
  }

  let provider = deps.provider;
  if (!provider) {
    loadDotEnv();
    if ((settings.GEMINI_API_KEY() ?? '').trim() === '') return { ok: false, reason: 'no_api_key' };
    provider = new GeminiProvider();
  }

  let reserved: { allowed: boolean };
  try {
    reserved = reserveMonthlyRangeCall(storePath, cap, clock(), ttl);
  } catch (err) {
    // A store that cannot be written cannot count, so the ask does not go out.
    return { ok: false, reason: 'cap_store_error', detail: `the count could not be saved: ${String(err)}` };
  }
  if (!reserved.allowed) return { ok: false, reason: 'monthly_cap_reached' };

  const model = deps.model ?? modelForScan('range-ask').model;
  const envTimeout = Number(settings.SHIN_GEMINI_TIMEOUT_MS());
  const timeoutMs = deps.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const askedAtMs = clock();

  let value: unknown;
  let answeredBy: string;
  try {
    const res = await provider.send<unknown>({
      model,
      images: [],
      system: RANGE_SYSTEM,
      user: buildRangePrompt(identity, market.country, market.currency),
      schema: RANGE_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal: controller.signal,
    });
    value = res.value;
    answeredBy = res.model;
  } catch (err) {
    const failure = classifyProviderError(err);
    if (failure === 'model_malformed') return { ok: false, reason: 'invalid_json', detail: String((err as Error)?.message ?? err) };
    return { ok: false, reason: 'model_error', detail: failure };
  } finally {
    clearTimeout(timer);
  }

  const checked = validateRange(value, market.currency, ceiling);
  if (!checked.ok) return checked;

  const askedAt = new Date(askedAtMs).toISOString();
  const range: TypicalRange = { ...checked.value, askedAt, model: answeredBy };
  try {
    writeCachedRange(storePath, key, { askedAt, range: { ...range } }, clock(), ttl);
  } catch {
    // The answer stands even if it could not be cached; the next ask will simply call again.
  }
  return { ok: true, range, cached: false };
}
