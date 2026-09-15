/**
 * The provider seam: one vision call, described without naming a vendor.
 *
 * WHY THIS FILE EXISTS (2026-09-13, beta plan item 22).
 *
 * Until today `model.ts` imported `Anthropic` from `@anthropic-ai/sdk` and its
 * only test seam -- `MessagesClient` -- was typed in Anthropic's own wire types
 * (`MessageCreateParamsNonStreaming`, `Message`). That is a seam for a test, not
 * a seam for a provider: a second vendor could not be put behind it without
 * either speaking Anthropic's wire shape or rewriting every caller. The request
 * and response below are the same call said in nobody's dialect -- an image, a
 * system prompt, a user prompt, a JSON schema, an output ceiling, a clock, and
 * an optional hint about where a cache breakpoint would go.
 *
 * WHAT DELIBERATELY IS NOT HERE. No timeout, no retry, no cap, no prompt. Those
 * are policy and they stay in `model.ts`, where they were written and where the
 * comments explaining the numbers live. A provider implementation is a
 * translator and nothing else: it turns this request into one HTTP call, and it
 * turns the answer (or the failure) back into these types. If a provider file
 * ever grows a retry loop, two retry policies are stacked again and the visible
 * one is not the one that runs -- the exact bug `maxRetries: 0` was added for.
 *
 * WHY `FailureClass` IS IMPORTED AND NOT REDEFINED. The vocabulary in
 * `model.ts` is copied by hand into `spine/src/run.ts` and `app/src/scans.ts`,
 * and `identify/test/model.test.ts` reads `model.ts`'s source to check the three
 * copies still agree. A second definition here would be a fourth copy with no
 * check on it. The import is type-only, so nothing at runtime depends on
 * `model.ts` and the two files are not a cycle.
 */

import type { FailureClass } from './model.ts';
import type { Grounded } from './grounded.ts';

export type MediaType = 'image/png' | 'image/jpeg';

/** One picture, and the media type the wire has to be told about (see `mediaTypeOf`). */
export interface ProviderImage {
  readonly bytes: Uint8Array;
  readonly mediaType: MediaType;
}

/**
 * Where the cache breakpoint goes, when a caller wants one.
 *
 * `none` is the default and means what it says: send no cache directive at all.
 * `after_image` marks the image as the end of the cacheable prefix, which is the
 * only breakpoint this path has any use for -- see `model.ts`'s
 * PROMPT CACHING block for why, and for why no saving is claimed anywhere.
 */
export type CacheHint = 'none' | 'after_image';

export interface ProviderSchema {
  /** A name for the structured output. Some providers require one; all accept one. */
  readonly name: string;
  /** A JSON Schema object. Written out by hand in `model.ts`, not generated. */
  readonly schema: Record<string, unknown>;
}

/**
 * One vision call.
 *
 * The render order a provider MUST preserve is: system, then image(s), then the
 * user text. `model.ts`'s cache restructure depends on the pass-specific
 * instruction sitting AFTER the image, because a prefix that diverges before the
 * image is a prefix that cannot be shared between the two passes.
 */
export interface ProviderRequest {
  readonly model: string;
  readonly images: readonly ProviderImage[];
  readonly system: string;
  readonly user: string;
  readonly schema: ProviderSchema;
  readonly maxOutputTokens: number;
  readonly signal: AbortSignal;
  readonly cache?: CacheHint;
  /**
   * Whether Google Search grounding was asked for. Optional and defaulting to
   * absent, so every request written before 2026-09-14 still means exactly
   * what it meant: no search tool, ordinary model output, no rules about where
   * the answer may be stored.
   */
  readonly grounding?: Grounding;
  /**
   * The first vendor's own clock inside a `withFallback` pair, in ms. Added
   * 2026-09-15. Without it one outer clock covered both vendors, so a slow
   * Gemini used up the whole allowance and the Claude fallback was aborted
   * before it began: it could only ever rescue a FAST failure. With it, the
   * primary is abandoned at this mark and the fallback gets what is left of the
   * outer clock. Ignored by a provider that is not a pair.
   */
  readonly vendorTimeoutMs?: number;
}

/**
 * Off, or the Google Search tool.
 *
 * The two values are not a preference, they are two different licences over
 * the answer that comes back: see the header of `grounded.ts`.
 */
export type Grounding = 'none' | 'google_search';

/**
 * A provider that can run a grounded call, kept OUT of `Provider` on purpose.
 *
 * This is a separate interface rather than a second method on `Provider`
 * because of what `ProviderResponse<Grounded<T>>` means: `.value` is a sealed
 * box, not a `T`. Every existing consumer of a provider answer is typed on
 * `T` -- `Identifier.#send` in `model.ts` parses one, `identify/src/identify.ts`
 * reads its fields -- so if a grounded answer were ever routed into the
 * identification pipeline, the COMPILER stops it at the first field access
 * rather than a reviewer stopping it at a pull request. That is the whole
 * reason for the split, and it is also why `Provider` and every test written
 * against it are untouched by this addition.
 */
export interface GroundedProvider {
  readonly name: string;
  sendGrounded<T>(
    request: ProviderRequest & { readonly grounding: 'google_search' },
    forDevice: string,
  ): Promise<ProviderResponse<Grounded<T>>>;
}

/**
 * What a call cost, in tokens, as the provider reported it.
 *
 * EVERY FIELD IS NULLABLE, and that is the point rather than defensiveness. Not
 * every provider reports every number, and a provider that reports none of them
 * must be distinguishable from one that genuinely used zero cache tokens. A
 * zero here would be a measurement; a null is an absence, and the cost model in
 * `eval/run.ts` has to be able to tell them apart before it prints a dollar
 * figure that somebody believes.
 */
export interface TokenUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheCreationTokens: number | null;
}

export const NO_USAGE: TokenUsage = {
  inputTokens: null,
  outputTokens: null,
  cacheReadTokens: null,
  cacheCreationTokens: null,
};

export interface ProviderResponse<T> {
  /** The structured answer, already parsed. A provider that cannot parse throws. */
  readonly value: T;
  readonly usage: TokenUsage;
  /** Which adapter answered: `anthropic`, `xai`. */
  readonly provider: string;
  /** The model the provider says it actually ran, which need not be the one asked for. */
  readonly model: string;
}

export interface Provider {
  readonly name: string;
  send<T>(request: ProviderRequest): Promise<ProviderResponse<T>>;
}

/**
 * The failures a second vendor cannot fix, and must not be asked about.
 *
 * `spend_cap_reached` is the sharp one: the cap exists to stop the day's
 * spending, and a fallback that fires on it would spend a SECOND vendor's
 * money the moment the first one's budget ran out, which is the cap doing the
 * opposite of its job. `unreadable_photo` is the cheap one: a picture of a
 * thumb is a picture of a thumb at both vendors, and falling back doubles the
 * bill on precisely the scan that was never going to answer.
 */
const NO_SECOND_VENDOR: ReadonlySet<FailureClass> = new Set<FailureClass>([
  'spend_cap_reached',
  'unreadable_photo',
]);

/**
 * Tries `primary`; on a failure a second vendor could plausibly answer, tries
 * `fallback` instead. Added 2026-09-14 for the Gemini switch (`docs/decisions.md`,
 * "Gemini for identification, and grounded prices display-only"). Aurik's words:
 * "we will be swithcing to gemini" -- with no instruction to let a Gemini outage
 * become a refusal when the Claude path is sitting right there, and this app's
 * own priority 1 says the same thing: always answer.
 *
 * WHOLE-CALL FALLBACK, NOT PER-ATTEMPT. `model.ts`'s `#send` already retries a
 * retryable failure once against the SAME provider before this is ever reached,
 * so by the time `send` here sees an error the primary has had its shot.
 * Falling back at that point, rather than interleaving retries across two
 * vendors, keeps `model.ts`'s retry policy the only thing deciding how many
 * times any ONE vendor is asked.
 *
 * A vendor swap changes what answered, and `ProviderResponse` already carries
 * `provider` and `model` for exactly this: a scan answered by the fallback says
 * so in its own row rather than pretending to be a Gemini answer that happened
 * to run on Claude's model id.
 *
 * NOT a class, because there is no state to keep and a function value is
 * simpler for a test to build without importing a class twice under two names.
 */
/**
 * A FLOOR ON THE TIME BETWEEN REQUESTS, for a rate-limited key.
 *
 * WHY IT IS HERE AND NOT IN THE ADAPTER, which is where it was first put and
 * where it did real damage. `model.ts` wraps every provider call in a clock
 * (3,500 ms to read, 3,000 ms to pick). A wait inside `send` is a wait inside
 * that clock, so a six second gap against a three and a half second budget
 * aborted the request before it was ever sent: a 200-photo run came back 199
 * unreadable and top-1 of 1/200, which reads like a catastrophic model and was
 * entirely self-inflicted. Measured 2026-09-14.
 *
 * Waiting is SCHEDULING, and scheduling happens before the stopwatch starts.
 * `#send` awaits this, then starts the clock.
 *
 * Module scope on purpose: two providers in one process share one key and
 * therefore share one quota. Off unless `SHIN_MODEL_MIN_INTERVAL_MS` is set,
 * so a paid key pays nothing for a free key's problem.
 */
let nextAllowedAt = 0;

export async function waitForSlot(): Promise<void> {
  const gap = Number(process.env.SHIN_MODEL_MIN_INTERVAL_MS ?? 0);
  if (!Number.isFinite(gap) || gap <= 0) return;
  const now = Date.now();
  const waitMs = Math.max(0, nextAllowedAt - now);
  // Reserve the slot BEFORE awaiting, so two callers queue behind each other
  // rather than both reading the same `now` and both going at once.
  nextAllowedAt = Math.max(now, nextAllowedAt) + gap;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export function withFallback(primary: Provider, fallback: Provider): Provider {
  return {
    name: primary.name + '+fallback:' + fallback.name,
    async send<T>(request: ProviderRequest): Promise<ProviderResponse<T>> {
      try {
        return await sendWithin<T>(primary, request, request.vendorTimeoutMs);
      } catch (primaryErr) {
        if (NO_SECOND_VENDOR.has(classifyProviderError(primaryErr))) throw primaryErr;
        try {
          return await fallback.send<T>(request);
        } catch (fallbackErr) {
          // The fallback's own failure is the one that matters: it is the last
          // thing that actually happened, and it is what `model.ts`'s `classify`
          // and retry policy have to react to. The primary's error is not
          // swallowed silently -- it goes to the log, because a Gemini outage
          // that never surfaces anywhere is the "an outage looks like bad
          // photos" confusion `classifyProviderError` exists to prevent, just
          // moved one layer up.
          console.error(
            primary.name + ' failed, and the fallback ' + fallback.name + ' also failed:',
            primaryErr,
          );
          throw fallbackErr;
        }
      }
    },
  };
}

/** One vendor's attempt with its own clock, still honouring the caller's signal. */
async function sendWithin<T>(
  provider: Provider,
  request: ProviderRequest,
  ms: number | undefined,
): Promise<ProviderResponse<T>> {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return provider.send<T>(request);
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  request.signal.addEventListener('abort', onOuterAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderError('model_timeout', `${provider.name} gave no answer in ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([provider.send<T>({ ...request, signal: controller.signal }), expired]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    request.signal.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * A failure a provider adapter raised on its own account, already classed.
 *
 * Separate from `ModelCallError` so that `provider.ts` needs no runtime import
 * of `model.ts`. `model.ts`'s `classify` reads the `failure` field off anything
 * that carries one, so one of these travels up with its class intact and is
 * re-wrapped as a `ModelCallError` by `#send`, which is the only thing callers
 * ever see thrown.
 */
export class ProviderError extends Error {
  readonly failure: FailureClass;
  readonly status: number | null;

  constructor(failure: FailureClass, message: string, status: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.failure = failure;
    this.status = status;
  }
}

/**
 * Maps anything thrown by a provider, an SDK, or the wire onto the vocabulary.
 *
 * Moved here from `model.ts` on 2026-09-13 unchanged except for the first
 * branch, which is new: anything already carrying a `failure` keeps it. That
 * covers both `ModelCallError` (so `cap.ts`'s spend-cap refusal is not
 * reclassified as an outage on its way up) and `ProviderError`.
 */
export function classifyProviderError(err: unknown): FailureClass {
  const carried = (err as { failure?: unknown } | null)?.failure;
  if (typeof carried === 'string' && (KNOWN_CLASSES as readonly string[]).includes(carried)) {
    return carried as FailureClass;
  }
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    if (status === 429) return 'model_rate_limited';
    if (status >= 500) return 'model_outage';
    if (status >= 400) return 'model_client_error';
  }
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return 'model_timeout';
  // No credentials at all is our misconfiguration, not the wire. The SDK
  // throws this before a socket opens and with no status, so without this
  // branch a missing key reads as an outage, which is exactly the "an outage
  // looks like bad photos" confusion the class exists to prevent. Found
  // 2026-09-09 by posting a real PNG to the running route on a machine with
  // no key. Not retried: the second attempt has the same empty environment.
  const message = String((err as { message?: unknown } | null)?.message ?? '');
  if (
    name === 'AuthenticationError' ||
    /api key|apiKey|ANTHROPIC_API_KEY|XAI_API_KEY|auth(entication)? token/i.test(message)
  ) {
    return 'model_client_error';
  }
  // No status at all is the wire, not the service: a reset socket, a DNS
  // failure, a TLS error. Treated as a 5xx is, because the same second attempt
  // is the thing that might work.
  return 'model_outage';
}

/**
 * The union, as data, only so the branch above can check a string against it.
 *
 * `model.ts` still owns the type. If the two ever disagree TypeScript says so at
 * the `satisfies` below, which is why it is written that way rather than as a
 * bare array.
 */
const KNOWN_CLASSES = [
  'unreadable_photo',
  'model_timeout',
  'model_rate_limited',
  'model_outage',
  'model_malformed',
  'model_client_error',
  'spend_cap_reached',
] as const satisfies readonly FailureClass[];

/* -------------------------------------------------------------- the price list
 *
 * LIST PRICES, NOT MEASUREMENTS. Every number below was typed in from a public
 * price page on 2026-09-13 and nothing in this repo has ever been billed, so
 * none of it has been checked against an invoice. Re-check before any figure
 * derived from this table is quoted to anybody. A wrong number here is silent:
 * it produces a plausible dollar amount, not an error.
 *
 * USD per million tokens. Cache reads bill at about 0.1x the input rate and
 * cache writes at about 1.25x; both multipliers are the published ratios, and
 * both are also list, not observed.
 *
 * xAI has no row on purpose. This lane had no network access to check Grok's
 * published rates, and an invented number here would be indistinguishable from
 * a checked one three files downstream. A model with no row costs `null`, and
 * every consumer prints that as unknown rather than as zero.
 */
export interface ModelPrice {
  /** USD per million input tokens. */
  readonly input: number;
  /** USD per million output tokens. */
  readonly output: number;
}

export const LIST_PRICES_USD_PER_MTOK: Readonly<Record<string, ModelPrice>> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  /*
   * Gemini, from ai.google.dev/gemini-api/docs/pricing read 2026-09-14. The
   * rows live here rather than beside the adapter because `costUsd` below
   * reads this one table and nothing else: a model absent from it costs
   * `null`, which every caller prints as unknown. That is the safe direction
   * and it is where xAI still sits, but it means a Gemini scan would have
   * reported no cost at all while the whole point of the switch is knowing
   * what it costs.
   *
   * BOTH RATES DOUBLE ON 2027-01-01 and nothing automatic re-checks that.
   * 3.8 Flash goes to 1.50 in / 7.50 out; whoever reads this line before the
   * date is the mechanism.
   */
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
};

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * What one call cost, from what the provider actually reported.
 *
 * Returns null rather than a number in the two cases where a number would be a
 * lie: a model with no row in the table above, and a usage record with no input
 * or output count in it (which is every call made with the usage lever off, and
 * every call made against a fake client in a test).
 */
export function costUsd(model: string, usage: TokenUsage): number | null {
  const price = LIST_PRICES_USD_PER_MTOK[model];
  if (!price) return null;
  if (usage.inputTokens === null && usage.outputTokens === null) return null;
  const perToken = (rate: number, tokens: number | null) => ((tokens ?? 0) / 1_000_000) * rate;
  return (
    perToken(price.input, usage.inputTokens) +
    perToken(price.output, usage.outputTokens) +
    perToken(price.input * CACHE_READ_MULTIPLIER, usage.cacheReadTokens) +
    perToken(price.input * CACHE_WRITE_MULTIPLIER, usage.cacheCreationTokens)
  );
}

/** Adds two usage records, treating a null on either side as "not reported here". */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const add = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    inputTokens: add(a.inputTokens, b.inputTokens),
    outputTokens: add(a.outputTokens, b.outputTokens),
    cacheReadTokens: add(a.cacheReadTokens, b.cacheReadTokens),
    cacheCreationTokens: add(a.cacheCreationTokens, b.cacheCreationTokens),
  };
}
