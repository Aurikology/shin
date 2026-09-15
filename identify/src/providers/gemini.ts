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
 * THIS ADAPTER HAS NEVER BEEN RUN. Not once, not against a sandbox, not
 * against a fixture recorded from a real response. There is no `GEMINI_API_KEY`
 * on this machine and this lane had no network access, so EVERY statement below
 * about Google's wire format is written against documentation and against the
 * shape the reverted `gemini-grounded.ts` (commit ccbd0cc) read off Google's
 * own REST examples on 2026-09-14. None of it is observation. The tests prove
 * this file agrees with itself and prove nothing at all about whether Google
 * agrees, exactly as `providers/xai.ts`'s header says of its own.
 *
 * THE ASSUMPTIONS, each one a thing to check on the first real call:
 *
 *   1. ENDPOINT. `POST https://generativelanguage.googleapis.com/v1beta/
 *      interactions`, the Interactions API. Google's migration note names this
 *      as its own surface and recommends it for all new development, and calls
 *      `generateContent` legacy. The earlier, reverted version of this file
 *      used `generateContent`; that is deliberately not repeated here.
 *   2. AUTH is the `x-goog-api-key` REQUEST HEADER, never a `?key=` query
 *      parameter. The reverted version put the key in the URL, which is how a
 *      secret ends up in a proxy log, a crash report and a screenshot. The
 *      header form is what every current Interactions example shows, and this
 *      file has a test asserting the URL it builds contains no `key=`.
 *   3. BODY is `{ model, input, response_format, thinking_level }`. No `tools`
 *      key at all (see above). `response_format` is
 *      `{ type: 'text', mime_type: 'application/json', schema }`, verbatim from
 *      the structured-output REST examples the grounded module cites.
 *   4. `input` IS A LIST OF ROLE-TAGGED MESSAGES, not the single string the doc
 *      examples show. THIS IS THE ASSUMPTION MOST LIKELY TO BE WRONG, together
 *      with 5. Every published Interactions example passes a plain string,
 *      because every published example is text-only; none of them shows an
 *      image, and this app's entire call is an image. The shape sent here is
 *      `[{role:'system', content:[{type:'text',...}]},
 *        {role:'user', content:[<image parts>, {type:'text',...}]}]`, chosen
 *      because it is the only shape that can preserve `ProviderRequest`'s
 *      required render order (system, then images, then the user text) and
 *      still carry bytes. If Google rejects a role-tagged `input`, the repair
 *      is small and local: fold `request.system` onto the front of the user
 *      text and send one user message, which is what the grounded module does
 *      for its own text-only calls.
 *   5. AN IMAGE PART is `{type:'input_image', mime_type, data:<base64>,
 *      resolution:'medium'}`, inline base64 with no upload step. `resolution`
 *      is the Gemini 3 image-resolution hint: `low` costs 280 tokens per image,
 *      `medium` 560, `high` 1120. Medium is chosen because the eye already
 *      crops to 1568 px on the long edge before this file ever sees the bytes
 *      (`app/src/eye/capture.ts`, decision 12), so the cheap tier would be
 *      re-downscaling an already-tight crop and losing exactly the 9 pt
 *      net-quantity line the extract pass exists to read. If the field does not
 *      exist, it is assumed to be ignored rather than rejected, which is itself
 *      an assumption.
 *   6. THE INLINE CEILING is 20 MB, above which the bytes have to go through a
 *      file upload this file does not implement. Rather than send a request
 *      that is certain to fail, an oversized image is refused here with a
 *      `ProviderError` before a socket is opened. Note the check is on the RAW
 *      bytes: base64 inflates them by about 4/3, so Google's real ceiling may
 *      bite before this one does. The crop this app sends is a few hundred KB,
 *      so neither number is reachable in practice today.
 *   7. `thinking_level` is a top-level string, `low` by default and overridable
 *      with `SHIN_GEMINI_THINKING`. Low because this is a reading task against
 *      a fixed schema inside a four second budget, not a reasoning task.
 *   8. THE RESPONSE is `{ steps: [...] }`, an ordered list of typed steps. The
 *      answer is the LAST `model_output` step, whose `content[]` entries carry
 *      `text`. Anything else in the list (a `thought` step, for instance) is
 *      read for nothing.
 *   9. USAGE is `usage.total_input_tokens` / `.total_output_tokens` /
 *      `.total_thought_tokens` / `.total_cached_tokens`, CORRECTED 2026-09-14
 *      against ai.google.dev/api/interactions-api. This adapter first shipped
 *      with `usageMetadata.promptTokenCount` and its siblings, which are the
 *      legacy generateContent names and would have parsed as absent on every
 *      call, reporting a null cost forever. The legacy names are still read as
 *      a fallback. Thinking tokens bill at the OUTPUT rate and are added to
 *      output, because `TokenUsage` has no third bucket and a consumer that
 *      did not learn about one would under-report by the whole thinking
 *      budget. There is assumed to be NO cache-WRITE count on this
 *      path (Gemini's context caching is an explicitly created resource, not an
 *      automatic breakpoint), so `cacheCreationTokens` is always null here:
 *      absence, never a zero, which is the convention `provider.ts`'s
 *      `TokenUsage` comment sets out.
 *  10. A REFUSAL arrives as a finish reason or a block reason somewhere in the
 *      body. Where exactly, on the Interactions surface, is not documented
 *      anywhere this lane could reach, so `refusalReasonIn` below looks in
 *      every plausible place at once and is written to be tolerant rather than
 *      exact. The reasons treated as being about the PHOTOGRAPH are `safety`,
 *      `recitation`, `prohibited_content`, `spii`, `image_safety`, `blocklist`,
 *      and any block reason at all.
 *  11. `OTHER` IS NOT A PHOTOGRAPH PROBLEM. The reverted version of this file
 *      mapped a generic `OTHER` finish reason to `unreadable_photo`, which
 *      blames the person holding the phone for a bucket that by definition
 *      means the service did not say. It is `model_malformed` here, and hard
 *      rule 3 is the reason: the aggression never points at the user, and
 *      neither does the diagnosis.
 *  12. There is no per-request cache-breakpoint control on this surface, so
 *      `request.cache` is accepted and ignored, exactly as `xai.ts` does.
 *  13. The model ids in `GEMINI_FOR` exist and accept images.
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

/** Assumption 6. Raw bytes, not base64 length: see the header for why that is the looser of the two. */
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

/** Assumption 7. Anything the environment says is passed through untouched: this file does not police Google's enum. */
function thinkingLevel(): string {
  return process.env.SHIN_GEMINI_THINKING?.trim() || 'low';
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
 * `SHIN_GEMINI_BASE_URL` is shared with the grounded module, which points it at
 * the full `/v1beta/interactions` path rather than at the version prefix. So a
 * base that already names the endpoint is used as it stands instead of growing
 * a second `/interactions` on the end, which would be a 404 nobody would read
 * as a config mistake.
 */
function interactionsUrl(baseUrl: string): string {
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
 * JSON Schema translated into the dialect Gemini's schema fields accept
 * (assumption 3 and the tail of 4): a single uppercase `type` string,
 * `nullable: true` in place of a `type` array carrying `null`, no
 * `additionalProperties`.
 *
 * Carried over from the reverted commit ccbd0cc, where its own header called it
 * THE ASSUMPTION MOST LIKELY TO BE WRONG. That is still true and it is repeated
 * here rather than quietly dropped: the schemas in `model.ts` are written once,
 * in plain JSON Schema, for every provider, and every nullable field in
 * `PRODUCT_SCHEMA`, `TAG_SCHEMA` and `PICK_SCHEMA` is a `type: [..., 'null']`
 * union. If Google's Interactions `response_format.schema` in fact takes plain
 * JSON Schema (its own grounded REST examples show lowercase `type: 'object'`,
 * which is evidence AGAINST this translation being needed at all), then this
 * function is doing damage rather than repair, and the symptom would be a 400
 * naming a type it does not recognise. That is the first thing to try removing
 * when the first real call fails.
 */
export function forGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(forGeminiSchema);
  if (schema === null || typeof schema !== 'object') return schema;

  const obj = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let nullable = false;

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'additionalProperties') continue; // not a field Gemini's schema documents
    if (key === 'type') {
      if (Array.isArray(value)) {
        const types = value.filter((t): t is string => typeof t === 'string');
        if (types.includes('null')) nullable = true;
        const real = types.find((t) => t !== 'null') ?? 'string';
        out.type = real.toUpperCase();
      } else if (typeof value === 'string') {
        out.type = value.toUpperCase();
      }
      continue;
    }
    if (key === 'enum' && Array.isArray(value)) {
      // A nullable enum drops the null member from the list and relies on the
      // sibling `nullable: true` instead, because Gemini's `enum` is documented
      // as a list of strings, not a list that itself carries a null.
      const filtered = value.filter((v) => v !== null);
      if (filtered.length !== value.length) nullable = true;
      out.enum = filtered;
      continue;
    }
    // Property names are data, not keywords: a field genuinely called "type"
    // or "enum" must survive as a name, so `properties` recurses into its
    // values only and never re-reads its keys.
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, forGeminiSchema(v)]),
      );
      continue;
    }
    if (key === 'items') {
      out.items = forGeminiSchema(value);
      continue;
    }
    out[key] = value;
  }

  if (nullable) out.nullable = true;
  return out;
}

interface GeminiBody {
  model: string;
  system_instruction: string;
  input: unknown[];
  response_format: unknown;
  generation_config: { thinking_level: string };
}

function bodyFor(request: ProviderRequest, model: string): GeminiBody {
  const imageParts = request.images.map((image) => ({
    // `image`, not `input_image`. Read off Google's own reference and the image
    // understanding page on 2026-09-14, whose REST example is verbatim
    // `{"type": "image", "data": "...", "mime_type": "image/jpeg"}`. This
    // adapter said `input_image` until that was checked, which is a request
    // that would have failed on first contact and on every call after it.
    type: 'image',
    mime_type: image.mediaType,
    data: Buffer.from(image.bytes).toString('base64'),
  }));

  // The text goes AFTER the image, exactly as in the Anthropic and xAI
  // adapters, because `model.ts`'s cache lever depends on the pass-specific
  // instruction sitting behind the shared prefix. Assumption 12 says this
  // surface has no breakpoint control, so the ordering buys nothing here today.
  // It is kept so all three adapters send the same thing in the same order and
  // an A/B between vendors measures the model rather than the prompt layout.
  const userContent: unknown[] = [...imageParts, { type: 'text', text: request.user }];

  // No `tools` key. Not an empty array either: an empty array is still a
  // request that mentions tools, and the point of this adapter is a call that
  // does not. See the header.
  return {
    model,
    // A TOP-LEVEL STRING, not a role-tagged turn inside `input`. The reference
    // lists `system_instruction` as its own field and `input` as "Content,
    // array of Content, array of Step, or string"; the roles this adapter used
    // to wrap around both were an invention. Checked 2026-09-14.
    system_instruction: request.system,
    input: userContent,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: forGeminiSchema(request.schema.schema),
    },
    // Both of these live INSIDE `generation_config`, and the resolution hint is
    // The reference names a `media_resolution` setting; a real call refuses it
    // everywhere it could go. The documentation and the running service do not
    // agree, and the running service is the one that answers.
    // `thinking_level` only. `media_resolution` was here until a real call
    // answered `400 Unknown parameter 'media_resolution' at 'generation_config'`
    // on 2026-09-14; it was also refused on the image part and at the top
    // level, so it is not a parameter this surface takes at all, whatever the
    // image-understanding page says about Gemini 3 resolution levels. Removed
    // rather than moved. The crop this app sends is already tight, so the
    // default is the right size anyway, and a measured 1,110 input tokens for
    // an 18 KB photograph says the default is doing the economical thing.
    generation_config: { thinking_level: thinkingLevel() },
  };
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

function usageOf(usage: Record<string, unknown> | undefined): TokenUsage {
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
