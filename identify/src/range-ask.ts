/**
 * THE LAST-RESORT RANGE ASK. RULINGS.md "Catalogue first; Claude, with no web
 * search, is the capped price-range fallback" (2026-09-28): Shin checks its own
 * catalogue and computes a price range from its own prices by math first. Only
 * when that gives nothing does Shin ask Claude "what is the typical price range
 * for this item", from Claude's own knowledge, with no web search, capped per
 * month to save credits, and every answer is saved as data. Gemini is not used
 * here; this file imports nothing from the Gemini providers.
 *
 * WHAT THIS FILE DOES, IN ORDER:
 *   1. takes the product identity Shin already has (name, brand, size,
 *      category, market). Never an image. No name means no ask;
 *   2. looks up a 30-day cache keyed on normalised name + brand + size +
 *      market. A hit returns the stored answer, with the time of the call that
 *      produced it, and neither calls the model nor counts against the cap;
 *   3. counts the ask against this UTC month BEFORE sending it (an attempt
 *      counts whether or not it succeeds). At or over the monthly limit it
 *      returns `monthly_cap_reached` and sends nothing. The limit is
 *      SHIN_RANGE_ASK_MONTHLY_CAP, read by the caller (app/src/catalogue-first.ts).
 *      A cap that is not a whole number >= 0 (NaN, negative, fractional) is
 *      read as 0: a bad cap fails closed, never open;
 *   4. makes ONE Claude call through the existing `AnthropicProvider`
 *      (`./providers/anthropic.ts`): text only, structured JSON output, NO
 *      `tools` key at all (so no web search tool exists for the model to use),
 *      and thinking disabled with a 1024-token ceiling, so the whole ceiling
 *      goes to the JSON answer and a thinking model cannot cut it off.
 *      The model is `claude-haiku-4-5-20251001` (the cheapest Claude) unless a caller names another. The key is
 *      ANTHROPIC_API_KEY, read by the Anthropic SDK itself (after `.env` is
 *      loaded); an absent or empty key returns `no_api_key` before anything is
 *      counted or sent;
 *   5. validates the JSON hard: exactly the schema's six fields, `known` a
 *      boolean, the currency exactly the market's three capitals. Anything
 *      wrong comes back `{ ok: false, reason }` and no number is ever
 *      substituted for the one the model gave;
 *   6. saves EVERY answer the model gave as data (valid, `known: false`, or
 *      refused by the validator, with its reason and the raw object) to the
 *      answer log beside the store (`./range-ask-store.ts`). A valid range and
 *      a `known: false` are also cached for 30 days, so a rescan of a product
 *      Claude does not know costs no second cap slot. An invalid answer or a
 *      transport failure is not cached: the next ask tries again.
 *
 * NOT DONE HERE: the catalogue-first math, and the wiring that calls this only
 * when that math found nothing. This file is the ask and nothing else.
 *
 * NOTHING HERE OPENS A SOCKET IN A TEST. `deps.provider` is injected; the
 * default provider is built only when no provider is passed.
 */

import Anthropic from '@anthropic-ai/sdk';

import { loadDotEnv } from './env.ts';
import { classifyProviderError, type Provider } from './provider.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import {
  appendRangeAnswer,
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
  | 'extra_fields'
  | 'bad_known'
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
  | { readonly ok: false; readonly reason: RangeAskFailure; readonly detail?: string; readonly cached?: true };

export interface RangeAskDeps {
  /** The Claude provider. Default: an `AnthropicProvider` over the SDK client (reads ANTHROPIC_API_KEY). Tests always pass one. */
  readonly provider?: Provider;
  /** Asks allowed per UTC calendar month. Default 1000 when absent. 0 turns the ask off; NaN, negative or fractional also reads as 0. */
  readonly monthlyCap?: number;
  /** The count-and-cache file. Default `identify/data/range-ask.json`. */
  readonly storePath?: string;
  /** Highest acceptable `high_cents`. Default 2,000,000 (20,000.00 in the market's currency). */
  readonly ceilingCents?: number;
  /** How long a cached answer stands. Default 30 days. */
  readonly cacheTtlMs?: number;
  /** Model id. Default `RANGE_ASK_MODEL` (claude-haiku-4-5-20251001). */
  readonly model?: string;
  /** Per-call clock in ms. Default 30000. */
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

/* --------------------------------------------------------------- defaults */

export const DEFAULT_MONTHLY_CAP = 1000;
export const DEFAULT_CEILING_CENTS = 2_000_000;
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
/** The Claude model asked. No setting names one yet; a caller may pass `deps.model`. */
export const RANGE_ASK_MODEL = 'claude-haiku-4-5-20251001';
/** Thinking is disabled, so all of this is the JSON answer (about 60 tokens in practice). */
export const MAX_OUTPUT_TOKENS = 1024;

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
      // anyOf rather than a type array: the one nullable shape the Anthropic
      // provider's structured-output path is known to pass (see providers/anthropic.ts).
      low_cents: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
      high_cents: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
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

const SCHEMA_KEYS: ReadonlySet<string> = new Set(Object.keys(RANGE_SCHEMA.schema.properties));

/** Hard checks on the model's object. Never repairs, never substitutes. */
export function validateRange(raw: unknown, expectedCurrency: string, ceilingCents: number): Validated {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_json', detail: 'the answer is not a JSON object' };
  }
  const o = raw as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => !SCHEMA_KEYS.has(k));
  if (extra.length > 0) return { ok: false, reason: 'extra_fields', detail: extra.join(',') };
  if (typeof o.known !== 'boolean') return { ok: false, reason: 'bad_known' };
  if (o.known === false) return { ok: false, reason: 'model_does_not_know' };
  const low = o.low_cents;
  const high = o.high_cents;
  if (typeof low !== 'number' || typeof high !== 'number' || !Number.isInteger(low) || !Number.isInteger(high)) {
    return { ok: false, reason: 'not_integer_cents' };
  }
  if (low <= 0 || high <= 0) return { ok: false, reason: 'not_positive' };
  if (low > high) return { ok: false, reason: 'low_above_high' };
  if (high > ceilingCents) return { ok: false, reason: 'over_ceiling', detail: `high_cents ${high} > ${ceilingCents}` };
  // Exactly three capitals: no trimming, no upper-casing. The model was told the code.
  const currency = typeof o.currency === 'string' ? o.currency : '';
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: 'bad_currency', detail: JSON.stringify(o.currency) };
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

/** The monthly cap: absent is the default; anything present that is not a whole number >= 0 is 0 (fail closed). */
export function capOf(v: number | undefined): number {
  if (v === undefined) return DEFAULT_MONTHLY_CAP;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

/* ------------------------------------------------------------------ entry */

/**
 * Asks Claude, once, with no tools, for the typical price range of `identity`. NEVER THROWS:
 * every failure is `{ ok: false, reason }`.
 */
export async function askTypicalRange(identity: RangeIdentity, deps: RangeAskDeps = {}): Promise<RangeAskResult> {
  const clock = deps.now ?? Date.now;
  const storePath = deps.storePath ?? DEFAULT_RANGE_STORE_PATH;
  const ttl = positiveOr(deps.cacheTtlMs, CACHE_TTL_MS);
  const cap = capOf(deps.monthlyCap);
  const ceiling = positiveOr(deps.ceilingCents, DEFAULT_CEILING_CENTS);

  if (typeof identity?.name !== 'string' || identity.name.trim() === '') return { ok: false, reason: 'no_name' };
  const market = MARKETS[norm(identity.market).toUpperCase()];
  if (!market) return { ok: false, reason: 'unsupported_market', detail: String(identity.market) };

  const key = rangeCacheKey(identity);
  try {
    const hit = readCachedRange(storePath, key, clock(), ttl);
    if (hit) {
      if (hit.range.known === false) return { ok: false, reason: 'model_does_not_know', cached: true };
      const range = fromCache(hit.range, hit.askedAt);
      if (range && range.currency === market.currency) return { ok: true, range, cached: true };
    }
  } catch {
    // An unreadable cache is a miss, not a failure.
  }

  let provider = deps.provider;
  if (!provider) {
    loadDotEnv();
    let client: Anthropic;
    try {
      // The SDK reads ANTHROPIC_API_KEY itself; retries stay off (the provider passes maxRetries: 0 per call too).
      client = new Anthropic({ maxRetries: 0 });
    } catch {
      return { ok: false, reason: 'no_api_key' };
    }
    if ((client.apiKey ?? '').trim() === '') return { ok: false, reason: 'no_api_key' };
    provider = new AnthropicProvider(client);
  }

  let reserved: { allowed: boolean };
  try {
    reserved = reserveMonthlyRangeCall(storePath, cap, clock(), ttl);
  } catch (err) {
    // A store that cannot be written cannot count, so the ask does not go out.
    return { ok: false, reason: 'cap_store_error', detail: `the count could not be saved: ${String(err)}` };
  }
  if (!reserved.allowed) return { ok: false, reason: 'monthly_cap_reached' };

  const model = deps.model ?? RANGE_ASK_MODEL;
  const timeoutMs = deps.timeoutMs !== undefined && deps.timeoutMs > 0 ? deps.timeoutMs : DEFAULT_TIMEOUT_MS;
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
      thinking: 'disabled',
      signal: controller.signal,
    });
    value = res.value;
    answeredBy = res.model;
  } catch (err) {
    const failure = classifyProviderError(err);
    const message = String((err as Error)?.message ?? err);
    const askedAt = new Date(askedAtMs).toISOString();
    if (failure === 'model_malformed') {
      // The model answered with something that is not JSON: an answer, so it is logged. Not cached.
      saveAnswer(storePath, { key, askedAt, model, outcome: 'invalid_json', detail: message, raw: null });
      return { ok: false, reason: 'invalid_json', detail: message };
    }
    if (failure === 'unreadable_photo') {
      // The provider's refusal class. There is no photo here: the model declined to answer.
      saveAnswer(storePath, { key, askedAt, model, outcome: 'refused', detail: message, raw: null });
      return { ok: false, reason: 'model_error', detail: 'refused' };
    }
    // A transport failure: no answer came back, so nothing is logged or cached.
    return { ok: false, reason: 'model_error', detail: failure };
  } finally {
    clearTimeout(timer);
  }

  const askedAt = new Date(askedAtMs).toISOString();
  const checked = validateRange(value, market.currency, ceiling);
  saveAnswer(storePath, {
    key,
    askedAt,
    model: answeredBy,
    outcome: checked.ok ? 'ok' : checked.reason,
    ...(checked.ok || checked.detail === undefined ? {} : { detail: checked.detail }),
    raw: value ?? null,
  });
  if (!checked.ok) {
    if (checked.reason === 'model_does_not_know') {
      // Cached like a range, so a rescan of a product Claude does not know costs no cap slot.
      try {
        writeCachedRange(storePath, key, { askedAt, range: { known: false, currency: market.currency, model: answeredBy } }, clock(), ttl);
      } catch {
        // Not cached; the next ask will call again.
      }
    }
    return checked;
  }

  const range: TypicalRange = { ...checked.value, askedAt, model: answeredBy };
  try {
    writeCachedRange(storePath, key, { askedAt, range: { ...range } }, clock(), ttl);
  } catch {
    // The answer stands even if it could not be cached; the next ask will simply call again.
  }
  return { ok: true, range, cached: false };
}

/** Logs one answer. A log that cannot be written does not change the answer the shopper gets. */
function saveAnswer(storePath: string, record: Parameters<typeof appendRangeAnswer>[1]): void {
  try {
    appendRangeAnswer(storePath, record);
  } catch {
    // The answer stands; only its record is lost.
  }
}
