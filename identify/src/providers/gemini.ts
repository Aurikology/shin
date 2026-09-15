/**
 * The Gemini adapter for the plain vision call: extract, tag and pick, the same
 * three passes `AnthropicProvider` and `XaiProvider` already serve. Added
 * 2026-09-14 for the switch named in `docs/decisions.md` ("Gemini for
 * identification, and grounded prices display-only").
 *
 * THIS FILE NEVER GROUNDS. It sends no `tools` array at all: not
 * `google_search`, not `code_execution`, not an empty list. That is the whole
 * point of this half of the switch. An ungrounded call is ordinary model
 * output, which this app may store on a scan row, re-read, and compute over
 * with no terms restriction whatsoever. The moment a `google_search` tool
 * appears in a request, the answer becomes a Grounded Result and Google's
 * terms (no caching, no analysing, no interspersing, no per-link tracking)
 * attach to it. The grounded calls are a different module owned by a different
 * lane, and the two must never be asked for in one request. A test in
 * `identify/test/gemini.test.ts` asserts the absence of the field rather than
 * trusting this paragraph.
 *
 * ============================ READ THIS FIRST ============================
 * THE FIRST REAL CALL FAILED, 2026-09-15, and every field below was re-read
 * against Google's own documentation the same day. The phone's first scan got
 * HTTP 400 `Unknown parameter 'media_resolution' at 'generation_config'`:
 * the body had been written from a reading of the docs and never sent. Google
 * stops at the first bad field, so one rejection says nothing about the rest;
 * each field was therefore checked on its own, against the OpenAPI spec
 * (https://ai.google.dev/static/api/interactions.openapi.json, read
 * 2026-09-15) and the REST examples on the pages named per field. Still no
 * observation: this lane makes no call to Google, so the tests prove this file
 * matches the spec as read, not that Google accepts it.
 *
 * THE REQUEST, field by field (all read 2026-09-15):
 *
 *   1. ENDPOINT. `POST https://generativelanguage.googleapis.com/v1beta/
 *      interactions`. https://ai.google.dev/api/interactions-api ("Creating
 *      an interaction"). `generateContent` is the legacy surface.
 *   2. AUTH. The `x-goog-api-key` header, as in every REST example on
 *      https://ai.google.dev/gemini-api/docs/image-understanding. Never a
 *      `?key=` query parameter, which writes the secret into every URL log.
 *   3. `model`. A plain id string. `gemini-3.8-flash` is in the spec's
 *      `ModelOption` enum. `gemini-3.5-flash-lite` is NOT in that enum but is
 *      listed as a stable model code on
 *      https://ai.google.dev/gemini-api/docs/models and in the thinking-level
 *      table on https://ai.google.dev/gemini-api/docs/thinking. The two pages
 *      disagree; the models page is the one that names model codes, so it is
 *      kept, and it is the first thing to swap (for `gemini-3.1-flash-lite`,
 *      which is in both) if Google answers 400 on the model.
 *   4. `system_instruction`. A top-level STRING
 *      (`CreateModelInteractionParams.system_instruction`, type string).
 *   5. `input`. An array of `Content` parts, image first, then text. The
 *      inline image part is `{type:'image', data:<base64>, mime_type}`,
 *      verbatim from the "Passing inline image data" REST example on the
 *      image-understanding page and the spec's `ImageContent`. Inline requests
 *      are capped at 20 MB in total, per the note under that example.
 *   6. RESOLUTION IS ON THE IMAGE PART, as `resolution`, one of `low`,
 *      `medium`, `high`, `ultra_high` (spec `MediaResolution`; REST example on
 *      https://ai.google.dev/gemini-api/docs/media-resolution, "Per-content-
 *      item media resolution (Gemini 3 only)"). There is NO `media_resolution`
 *      member of `GenerationConfig` on this surface; that is the field Google
 *      rejected. Gemini 3 costs 280 / 560 / 1120 / 2240 tokens per image for
 *      the four levels (same page, "Token counts"). `medium` by default: the
 *      eye has already cropped to the product at 1568 px.
 *   7. `response_format`. `{type:'text', mime_type:'application/json',
 *      schema}` (spec `TextResponseFormat`; REST example on
 *      https://ai.google.dev/gemini-api/docs/structured-output). The schema is
 *      PLAIN JSON Schema: lowercase `type`, a nullable field written as
 *      `type: ['string','null']`, and `additionalProperties` supported ("JSON
 *      schema support", same page). The uppercase-plus-`nullable` translation
 *      this file used to apply is the older OpenAPI-subset dialect and is gone.
 *   8. `generation_config`. Only `thinking_level` is sent, one of `minimal`,
 *      `low`, `medium`, `high` (spec `GenerationConfig`, `ThinkingLevel`; REST
 *      example on the thinking page). `low` is supported by every model in
 *      that page's table, `minimal` is not (3.8 Flash rejects it), so `low` is
 *      the default. `max_output_tokens` is deliberately NOT sent: the thinking
 *      page says it counts thought tokens too, so a ceiling sized for the JSON
 *      would cut an answer off mid-object on a call that thought a little.
 *   9. `store: false`. A documented input-only boolean
 *      (`CreateModelInteractionParams.store`). The interactions page says the
 *      API otherwise keeps every interaction for 55 days on the paid tier, and
 *      this call is stateless (no `previous_interaction_id`), so there is
 *      nothing to keep a photograph of a tester's shopping for.
 *  10. NO `tools` KEY. See above.
 *
 * THE RESPONSE (spec `Interaction`, and the example responses on the
 * interactions reference page):
 *
 *  11. `status` is one of `completed`, `failed`, `incomplete`,
 *      `budget_exceeded` and others; `errors[]` carries `{code, message}`.
 *      Anything but `completed` with no usable answer is `model_malformed`
 *      here, never a photograph problem.
 *  12. `steps[]`, typed. The answer is the LAST `model_output` step, whose
 *      `content[]` text parts are joined. `thought` steps are skipped.
 *  13. `usage.total_input_tokens`, `total_output_tokens`,
 *      `total_thought_tokens`, `total_cached_tokens` (spec `Usage`). Thinking
 *      tokens bill at the output rate and are added to output. No cache-write
 *      count exists on this surface, so `cacheCreationTokens` is null, an
 *      absence and never a zero.
 *  14. A REFUSAL. The spec has no finish reason or block reason on an
 *      Interaction, so `refusalReasonIn` stays a tolerant search of the places
 *      the legacy surface used; it is the one reading here with no documented
 *      shape behind it.
 *  15. `OTHER` IS NOT A PHOTOGRAPH PROBLEM (hard rule 3): `model_malformed`.
 *  16. No per-request cache-breakpoint control exists, so `request.cache` is
 *      accepted and ignored, exactly as `xai.ts` does.
 *
 * None of this is reached unless `SHIN_MODEL_PROVIDER=gemini` is set AND
 * `GEMINI_API_KEY` is present. Absent either, `model.ts`'s `makeProvider` never
 * constructs this class and the environment behaves exactly as it did before
 * this file existed.
 * =======================================================================
 */

import {
  ProviderError,
  classifyProviderError,
  type ModelPrice,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type TokenUsage,
} from '../provider.ts';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Field 5. Raw bytes, not base64 length: base64 inflates by 4/3, so Google's 20 MB request cap bites first. */
export const MAX_INLINE_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Which Gemini model stands in for which Claude tier, per the founder's ruling
 * of 2026-09-14: identification runs cheap and escalates only when the cheap
 * answer says `low` about itself.
 *
 * `model.ts` picks from its own tier table, written in Anthropic's names
 * because Anthropic is the default provider. Rather than teach `model.ts` about
 * every vendor's catalogue, the translation lives with the translator, the same
 * way `xai.ts`'s `GROK_FOR` does. `basic` is `claude-haiku-4-5` and `pro` is
 * `claude-sonnet-5`, and `model.ts`'s escalation step re-sends the extract pass
 * on `MODEL.pro`, so the two rows below are exactly the cheap-first pair the
 * ruling asks for with no second mechanism invented anywhere.
 */
const GEMINI_FOR: Readonly<Record<string, string>> = {
  'claude-haiku-4-5': 'gemini-3.5-flash-lite',
  'claude-sonnet-5': 'gemini-3.8-flash',
  'claude-opus-5': 'gemini-3.8-flash',
};

const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

/**
 * PUBLISHED LIST PRICES, USD PER MILLION TOKENS, TYPED IN AND NEVER BILLED.
 *
 * These rows belong in `provider.ts`'s `LIST_PRICES_USD_PER_MTOK`, which is
 * what `costUsd` actually reads. That file is owned by another lane this
 * session and this one must not edit it, so the numbers live here, exported,
 * ready to be spread into that table in one line. Until they are, `costUsd`
 * finds no row for a Gemini model and returns null, and every consumer prints
 * that as unknown rather than as zero, which is the safe direction and is the
 * behaviour `provider.ts`'s own header describes for xAI.
 *
 * WORTH A DIARY ENTRY: both rates are documented as DOUBLING on 2027-01-01.
 * A cost figure quoted from this table after that date is wrong by exactly 2x
 * and will look completely plausible.
 */
export const GEMINI_LIST_PRICES_USD_PER_MTOK: Readonly<Record<string, ModelPrice>> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
};

export function geminiModelFor(model: string): string {
  const override = process.env.SHIN_GEMINI_MODEL?.trim();
  if (override) return override;
  const mapped = GEMINI_FOR[model];
  if (mapped) return mapped;
  // A caller that already named a Gemini model is taken at its word; anything
  // else unknown falls back rather than being sent to Google as a Claude id.
  if (model.startsWith('gemini')) return model;
  return FALLBACK_MODEL;
}

/**
 * Field 6. How many tokens one image may cost: 280, 560, 1120 or 2240 on
 * Gemini 3, a fourfold spread for the same photograph, so this is the
 * cheapest cost lever in the adapter. `medium` because the crop arriving here
 * is already tight. The documented values are `low`, `medium`, `high` and
 * `ultra_high` (https://ai.google.dev/gemini-api/docs/media-resolution, read
 * 2026-09-15). A value written in the legacy `MEDIA_RESOLUTION_MEDIUM` form in
 * an old config is read as the level it names, because sending that spelling
 * would be a 400 on every scan.
 */
const RESOLUTIONS: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'ultra_high']);

export function mediaResolution(): string {
  const named = (process.env.SHIN_GEMINI_MEDIA_RESOLUTION ?? '').trim().toLowerCase().replace(/^media_resolution_/, '');
  return RESOLUTIONS.has(named) ? named : 'medium';
}

/**
 * Field 8. `minimal`, `low`, `medium` or `high`
 * (https://ai.google.dev/gemini-api/docs/thinking, read 2026-09-15). Anything
 * else in the environment is ignored rather than sent, for the same reason as
 * the resolution: a typo in a config file must not become a 400 on every call.
 */
const THINKING_LEVELS: ReadonlySet<string> = new Set(['minimal', 'low', 'medium', 'high']);

export function thinkingLevel(): string {
  const named = (process.env.SHIN_GEMINI_THINKING ?? '').trim().toLowerCase();
  return THINKING_LEVELS.has(named) ? named : 'low';
}

/**
 * Just enough of `fetch` to be replaceable by a fake in a test. Same shape as
 * `XaiTransport`, deliberately: one contract for "an HTTP call this package can
 * fake" rather than one per vendor.
 */
export interface GeminiTransport {
  (
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
      signal: AbortSignal;
    },
  ): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

export interface GeminiOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly transport?: GeminiTransport;
}

/**
 * Builds the one URL this file calls.
 *
 * The grounded module builds its URL with this same function, reading
 * `SHIN_GEMINI_GROUNDED_BASE_URL` first and this file's `SHIN_GEMINI_BASE_URL`
 * second, so both adapters reach one endpoint by default. A base that already
 * names the endpoint is used as it stands instead of growing
 * a second `/interactions` on the end, which would be a 404 nobody would read
 * as a config mistake.
 */
export function interactionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/interactions') ? trimmed : `${trimmed}/interactions`;
}

export class GeminiProvider implements Provider {
  readonly name = 'gemini';
  readonly #apiKey: string;
  readonly #url: string;
  readonly #transport: GeminiTransport;

  constructor(options: GeminiOptions = {}) {
    this.#apiKey = (options.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim();
    this.#url = interactionsUrl(options.baseUrl ?? process.env.SHIN_GEMINI_BASE_URL ?? DEFAULT_BASE_URL);
    this.#transport = options.transport ?? (globalThis.fetch as unknown as GeminiTransport);
  }

  async send<T>(request: ProviderRequest): Promise<ProviderResponse<T>> {
    // Classed as a client error and not an outage, for the same reason
    // `classifyProviderError` already has that branch for the other two
    // vendors: our empty environment is our misconfiguration, and calling it
    // an outage is how a missing key ends up logged as a bad photograph.
    if (!this.#apiKey) {
      throw new ProviderError('model_client_error', 'no GEMINI_API_KEY is set, so the Gemini provider cannot call');
    }

    // Assumption 6, checked before a socket is opened rather than after the
    // upload has already been paid for in time.
    for (const image of request.images) {
      if (image.bytes.length > MAX_INLINE_IMAGE_BYTES) {
        throw new ProviderError(
          'model_client_error',
          `this image is ${image.bytes.length} bytes, past Gemini's ${MAX_INLINE_IMAGE_BYTES} byte inline limit, and this adapter has no upload path`,
        );
      }
    }

    const model = geminiModelFor(request.model);
    const response = await this.#transport(this.#url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Assumption 2. The key is a header and only a header. A `?key=` query
        // parameter is a secret written into every log line that records a URL.
        'x-goog-api-key': this.#apiKey,
      },
      body: JSON.stringify(bodyFor(request, model)),
      signal: request.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      // Status carried through so `model.ts`'s retry policy sees the same 429
      // and 5xx it already knows how to treat, from a provider it has never
      // heard of. `classifyProviderError` is the single place that mapping
      // lives: 429 is rate limited, 5xx is an outage, other 4xx is ours.
      throw new ProviderError(
        classifyProviderError({ status: response.status, message: raw }),
        `Gemini returned ${response.status}: ${raw.slice(0, 300)}`,
        response.status,
      );
    }

    return readAnswer<T>(raw, model, this.name);
  }
}

/* --------------------------------------------------------------- the request */

/**
 * The body both Gemini adapters send, built in ONE place.
 *
 * `providers/gemini-grounded.ts` imports this and adds its `tools`; this file
 * never does. One builder is the fix for the defect the first live call found:
 * two hand-written bodies read off the docs on two different days had already
 * drifted (one sent `system_instruction`, the other folded it into `input`),
 * and a field corrected in one would have stayed wrong in the other.
 *
 * Every field is decided in this file's header, with the page it came from.
 */
export interface InteractionBody {
  model: string;
  system_instruction: string;
  input: unknown[] | string;
  response_format: { type: 'text'; mime_type: 'application/json'; schema: unknown };
  generation_config: { thinking_level: string };
  store: false;
  tools?: { type: string }[];
}

export function interactionBody(request: ProviderRequest, model: string): InteractionBody {
  const imageParts = request.images.map((image) => ({
    // Field 5 and 6: `image`, inline base64, and the resolution ON THE PART.
    type: 'image',
    data: Buffer.from(image.bytes).toString('base64'),
    mime_type: image.mediaType,
    resolution: mediaResolution(),
  }));

  // The text goes AFTER the image, exactly as in the Anthropic and xAI
  // adapters, so all three send the same thing in the same order and an A/B
  // between vendors measures the model rather than the prompt layout.
  const input: unknown[] | string =
    imageParts.length === 0 ? request.user : [...imageParts, { type: 'text', text: request.user }];

  return {
    model,
    system_instruction: request.system,
    input,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      // Field 7: plain JSON Schema, as written in `model.ts`, untranslated.
      schema: request.schema.schema,
    },
    generation_config: { thinking_level: thinkingLevel() },
    store: false,
  };
}

function bodyFor(request: ProviderRequest, model: string): InteractionBody {
  // No `tools` key. Not an empty array either: an empty array is still a
  // request that mentions tools, and the point of this adapter is a call that
  // does not. See the header.
  return interactionBody(request, model);
}

/* -------------------------------------------------------------- the response */

/**
 * The reasons that really are about the photograph. Assumption 10.
 *
 * `other` is deliberately absent. It is the bucket that means the service did
 * not say, and calling that a bad photo is how an outage reads back as a beta
 * full of bad photographers, which is the confusion `FailureClass` exists to
 * prevent. It lands on `model_malformed` below with the rest of the answers
 * this file cannot make sense of.
 */
const REFUSAL_REASONS: ReadonlySet<string> = new Set([
  'safety',
  'recitation',
  'prohibited_content',
  'spii',
  'image_safety',
  'blocklist',
]);

interface StepLike {
  type?: unknown;
  content?: unknown;
  finish_reason?: unknown;
  finishReason?: unknown;
}

interface InteractionsBody {
  steps?: unknown;
  status?: unknown;
  errors?: unknown;
  usage?: Record<string, unknown>;
  usageMetadata?: Record<string, unknown>;
  usage_metadata?: Record<string, unknown>;
  model?: unknown;
  modelVersion?: unknown;
  finish_reason?: unknown;
  finishReason?: unknown;
  promptFeedback?: { blockReason?: unknown };
  prompt_feedback?: { block_reason?: unknown };
}

function lower(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().toLowerCase() : null;
}

/**
 * Finds a refusal or a block reason anywhere it could plausibly be.
 *
 * Deliberately a search rather than one field read: no page this lane could
 * reach documents where the Interactions surface reports a block, and guessing
 * one location and being wrong would turn every safety refusal into
 * `model_malformed`, which is the one misdiagnosis that would make the beta's
 * refusal numbers unreadable. Returns the reason and whether it was a BLOCK
 * (any block reason is about the photograph) or a finish reason (only the
 * listed ones are).
 */
function refusalReasonIn(parsed: InteractionsBody, steps: StepLike[]): { reason: string; blocked: boolean } | null {
  const block = lower(parsed.promptFeedback?.blockReason) ?? lower(parsed.prompt_feedback?.block_reason);
  if (block) return { reason: block, blocked: true };

  const finishes: string[] = [];
  const top = lower(parsed.finish_reason) ?? lower(parsed.finishReason);
  if (top) finishes.push(top);
  for (const step of steps) {
    const s = lower(step.finish_reason) ?? lower(step.finishReason);
    if (s) finishes.push(s);
  }
  const refusal = finishes.find((f) => REFUSAL_REASONS.has(f));
  return refusal ? { reason: refusal, blocked: false } : null;
}

function readAnswer<T>(raw: string, model: string, provider: string): ProviderResponse<T> {
  let parsed: InteractionsBody;
  try {
    parsed = JSON.parse(raw) as InteractionsBody;
  } catch {
    throw new ProviderError('model_malformed', 'Gemini returned a body that is not JSON');
  }

  const steps: StepLike[] = Array.isArray(parsed.steps) ? (parsed.steps as StepLike[]) : [];

  const refusal = refusalReasonIn(parsed, steps);
  if (refusal) {
    throw new ProviderError(
      'unreadable_photo',
      `Gemini declined to read this image: ${refusal.blocked ? 'blocked, ' : ''}${refusal.reason}`,
    );
  }

  // Assumption 8: the LAST `model_output` step is the answer. Last rather than
  // first because a run that thought, then answered, then corrected itself
  // would leave two, and the one the model finished on is the one it meant.
  const outputs = steps.filter((step) => step.type === 'model_output');
  const last = outputs[outputs.length - 1];
  if (!last) {
    // Field 11: a `failed` or `incomplete` interaction says why in `errors`.
    const status = lower(parsed.status);
    const errors = Array.isArray(parsed.errors)
      ? (parsed.errors as { code?: unknown; message?: unknown }[])
          .map((e) => [e?.code, e?.message].filter((x) => typeof x === 'string').join(': '))
          .filter(Boolean)
          .join('; ')
      : '';
    if (status && status !== 'completed') {
      throw new ProviderError('model_malformed', `Gemini returned status ${status}${errors ? `: ${errors}` : ''}`);
    }
    // Not `unreadable_photo`. A body with no answer step in it is a body this
    // file does not understand, and that is a fact about the wire or about
    // this file's reading of it, never about the photograph. Assumption 11.
    throw new ProviderError('model_malformed', 'Gemini returned no model_output step');
  }

  const text = (Array.isArray(last.content) ? (last.content as { text?: unknown }[]) : [])
    .map((item) => (typeof item?.text === 'string' ? item.text : ''))
    .join('');
  if (text.trim() === '') {
    throw new ProviderError('model_malformed', 'Gemini returned a model_output step with no text');
  }

  let value: T;
  try {
    value = JSON.parse(text) as T;
  } catch (err) {
    throw new ProviderError(
      'model_malformed',
      `Gemini returned text that is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const echoed = lower(parsed.model) ? String(parsed.model) : lower(parsed.modelVersion) ? String(parsed.modelVersion) : null;
  return {
    value,
    // `usage` is this surface's own name for it; the other two are the legacy
    // envelope, kept as a fallback because nothing here has seen a real one yet.
    usage: usageOf(parsed.usage ?? parsed.usageMetadata ?? parsed.usage_metadata),
    provider,
    // The model asked for stands in when the response does not echo one, which
    // is every fake transport in this package's tests.
    model: echoed ?? model,
  };
}

export function usageOf(usage: Record<string, unknown> | undefined): TokenUsage {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!usage) {
    return { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null };
  }
  /*
   * THE INTERACTIONS API COUNTS ARE NOT generateContent'S COUNTS.
   *
   * This adapter read `promptTokenCount` / `candidatesTokenCount` /
   * `thoughtsTokenCount` until 2026-09-14, which are the LEGACY names. On this
   * surface the reference gives `total_input_tokens`, `total_output_tokens`,
   * `total_thought_tokens`, `total_cached_tokens` and `total_tokens`, on a
   * `usage` object rather than `usageMetadata`. Every one of the old names
   * would have parsed as absent, so every Gemini call would have reported a
   * null cost while the whole point of the switch is knowing what it costs.
   * That is a failure that looks like working software, which is why it is
   * written out here rather than fixed quietly.
   *
   * The legacy names are still read as a fallback, because a null cost is
   * worse than a cost read off whichever shape actually arrives, and because
   * nothing here has yet seen a real response from either surface.
   */
  const candidates = num(usage.total_output_tokens) ?? num(usage.candidatesTokenCount);
  const thoughts = num(usage.total_thought_tokens) ?? num(usage.thoughtsTokenCount);
  return {
    inputTokens: num(usage.total_input_tokens) ?? num(usage.promptTokenCount),
    // Assumption 9: thinking tokens bill at the OUTPUT rate, so they are output
    // as far as any cost figure is concerned. Added rather than reported apart,
    // because `TokenUsage` has no third bucket and inventing one would mean
    // every consumer that prices a call has to learn about it or silently
    // under-report by the whole thinking budget. Null stays null: a response
    // that reported neither count must not come back as a measured zero.
    outputTokens: candidates === null && thoughts === null ? null : (candidates ?? 0) + (thoughts ?? 0),
    cacheReadTokens: num(usage.total_cached_tokens) ?? num(usage.cachedContentTokenCount),
    // Assumption 9: no cache-write count on this path. Null, never zero: zero
    // would claim a measurement this adapter never took.
    cacheCreationTokens: null,
  };
}
