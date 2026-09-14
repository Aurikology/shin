/**
 * The Gemini adapter for the plain vision call: extract and pick, exactly the
 * two passes `AnthropicProvider` and `XaiProvider` already serve. Added
 * 2026-09-14 (his words: "switch to gemini for barcode and image searches").
 *
 * THIS FILE DOES NOT GROUND. No `google_search` tool, no citations, no
 * search suggestions. Google's own docs say why that has to be a second file:
 * on `generateContent`, structured JSON output (`responseSchema`) and the
 * `google_search` tool are documented as incompatible on the Gemini 2.5
 * models this file targets -- a real error from a real call, "controlled
 * generation is not supported with google_search tool" (confirmed 2026-09-14
 * against https://github.com/googleapis/python-genai/issues/665, and Google's
 * own structured-output page, https://ai.google.dev/gemini-api/docs/structured-output,
 * says the combination works only in preview on the Gemini 3 series through
 * the newer Interactions API, not on `generateContent`). Every call
 * `model.ts` makes through the `Provider` interface needs a JSON Schema
 * answer -- that is what `Identifier.read()` and `.pick()` parse -- so this
 * adapter never asks for a search. The grounded calls (barcode lookup, and
 * prices-and-reviews) are `gemini-grounded.ts`, a separate module with its
 * own request shape, because a grounded answer is prose with citations, not a
 * schema-shaped object, and the two must never be asked for in one request.
 *
 * ============================ READ THIS FIRST ============================
 * THIS ADAPTER HAS NEVER BEEN RUN. There is no `GEMINI_API_KEY` on this
 * machine (his own build note: "Gemini live calls cannot be tested without
 * Jamin's key"), so every statement below about Gemini's wire format is
 * read from Google's own current documentation (cited inline, checked
 * 2026-09-14) and is an ASSUMPTION until one real call is made, in exactly
 * the sense `providers/xai.ts`'s header states for itself. The unit tests in
 * `identify/test/gemini.test.ts` prove this file builds the request it
 * thinks it should and reads the response it thinks it will get -- they
 * prove nothing about whether Gemini agrees.
 *
 * THE ASSUMPTIONS, each one a thing to check on the first real call:
 *   1. Endpoint `https://generativelanguage.googleapis.com/v1beta/models/
 *      {model}:generateContent`, the REST call documented at
 *      https://ai.google.dev/api/generate-content -- the older, still fully
 *      supported API, not the newer Interactions API GA'd 2026-06-22. Chosen
 *      because it is the simpler, longer-documented shape and because the
 *      Interactions API's structured-output-plus-grounding combination (the
 *      one feature that would matter here) is Gemini-3-preview-only anyway,
 *      so nothing is given up by not moving to it for this ungrounded call.
 *   2. Auth is the API key as a query parameter, `?key=$GEMINI_API_KEY`
 *      (the header form `x-goog-api-key` is also documented and would work
 *      equally; the query form is what this file sends).
 *   3. Field casing is camelCase throughout, per protobuf-JSON convention
 *      and per every field name actually shown in
 *      https://ai.google.dev/api/generate-content: `systemInstruction`,
 *      `generationConfig`, `responseMimeType`, `responseSchema`,
 *      `inlineData` with `mimeType`/`data`, `usageMetadata` with
 *      `promptTokenCount`/`candidatesTokenCount`/`cachedContentTokenCount`.
 *   4. An image part is `{ inlineData: { mimeType, data } }`, base64 in
 *      `data`, inside a `Content.parts` array -- no upload step for an image
 *      this small (the crop this app sends is a few hundred KB, far under
 *      the ~20 MB inline ceiling documented at
 *      https://ai.google.dev/gemini-api/docs/image-understanding).
 *   5. Structured output is `generationConfig.responseMimeType:
 *      "application/json"` plus `generationConfig.responseSchema`, a schema
 *      in Gemini's own dialect (Schema object, an OpenAPI 3.0 subset) rather
 *      than raw JSON Schema: single uppercase `type` strings (`STRING`,
 *      `NUMBER`, `INTEGER`, `BOOLEAN`, `ARRAY`, `OBJECT`), `nullable: true`
 *      in place of a `type` array, and no `additionalProperties`. `forGeminiSchema`
 *      below does that conversion; THIS IS THE ASSUMPTION MOST LIKELY TO BE
 *      WRONG, the same way Anthropic's `output_config` bounds were wrong on
 *      the first real call (`providers/anthropic.ts`'s own history) --
 *      Gemini's Schema type is documented at
 *      https://ai.google.dev/api/caching#Schema but this file's reading of
 *      it has not been checked against a live 400 error.
 *   6. The output ceiling is `generationConfig.maxOutputTokens`.
 *   7. The answer is `candidates[0].content.parts[].text` joined, a JSON
 *      string (no markdown fence expected when `responseMimeType` is JSON).
 *   8. A refusal shows as `promptFeedback.blockReason` (no candidates at
 *      all), or as `candidates[0].finishReason` being one of `SAFETY`,
 *      `PROHIBITED_CONTENT`, `IMAGE_SAFETY`, `BLOCKLIST`, `RECITATION` --
 *      the enum documented at https://ai.google.dev/api/generate-content.
 *   9. Usage is `usageMetadata.promptTokenCount` /
 *      `usageMetadata.candidatesTokenCount`, with a cache read count at
 *      `usageMetadata.cachedContentTokenCount`. There is assumed to be no
 *      separate cache-WRITE count in this response (Gemini's context
 *      caching is a separate, explicitly-created resource, not an
 *      automatic breakpoint the way `cache_control` is on the Anthropic
 *      side), so `cacheCreationTokens` is always null here -- absence, not
 *      a measurement, the same convention `xai.ts` uses for its own unknown.
 *  10. There is no per-request cache-breakpoint control on this path, so
 *      `request.cache` is accepted and ignored, exactly as `xai.ts` does.
 *  11. The model ids in `GEMINI_FOR` below exist and accept images. Chosen
 *      from the stable, non-preview line documented at
 *      https://ai.google.dev/gemini-api/docs/models as of 2026-09-14:
 *      `gemini-2.5-flash` and `gemini-2.5-pro`. `SHIN_GEMINI_MODEL`
 *      overrides either tier's choice with one name, because a build note
 *      names exactly that one variable and a single override is simpler
 *      than a second tier table nobody asked for; a per-tier override was
 *      not requested and is not built.
 *
 * None of this is reached unless `SHIN_MODEL_PROVIDER=gemini` is set AND
 * `GEMINI_API_KEY` is present. Absent either, `model.ts`'s `makeProvider`
 * never constructs this class, and the environment behaves exactly as it
 * did before this file existed.
 * =======================================================================
 */

import {
  ProviderError,
  classifyProviderError,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type TokenUsage,
} from '../provider.ts';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Which Gemini model stands in for which Claude tier. See assumption 11.
 * `SHIN_GEMINI_MODEL` overrides both tiers with one explicit id, so a wrong
 * guess here is a config change, never a code change -- the same escape
 * hatch `xai.ts`'s `SHIN_XAI_MODEL` gives.
 */
const GEMINI_FOR: Readonly<Record<string, string>> = {
  'claude-haiku-4-5': 'gemini-2.5-flash',
  'claude-sonnet-5': 'gemini-2.5-pro',
  'claude-opus-5': 'gemini-2.5-pro',
};

const FALLBACK_MODEL = 'gemini-2.5-flash';

export function geminiModelFor(model: string): string {
  const override = process.env.SHIN_GEMINI_MODEL?.trim();
  if (override) return override;
  const mapped = GEMINI_FOR[model];
  if (mapped) return mapped;
  if (model.startsWith('gemini')) return model;
  return FALLBACK_MODEL;
}

/**
 * Just enough of `fetch` to be replaceable by a fake in a test. Same shape as
 * `XaiTransport`, deliberately: one contract for "an HTTP call this package
 * can fake" rather than one per vendor.
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

export class GeminiProvider implements Provider {
  readonly name = 'gemini';
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #transport: GeminiTransport;

  constructor(options: GeminiOptions = {}) {
    this.#apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.#baseUrl = (options.baseUrl ?? process.env.SHIN_GEMINI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
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

    const model = geminiModelFor(request.model);
    const url = `${this.#baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.#apiKey)}`;
    const response = await this.#transport(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyFor(request)),
      signal: request.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new ProviderError(
        classifyProviderError({ status: response.status, message: raw }),
        `Gemini returned ${response.status}: ${raw.slice(0, 300)}`,
        response.status,
      );
    }

    return readAnswer<T>(raw, model, this.name);
  }
}

/**
 * Gemini's own schema dialect (assumption 5): a single uppercase `type`
 * string, `nullable: true` instead of a `type` array, no
 * `additionalProperties`. The schemas in `model.ts` are written once, in
 * plain JSON Schema, for every provider; this is the one adapter that has to
 * translate the union-nullable pattern (`type: ['string', 'null']`) that
 * every field in `PRODUCT_SCHEMA`, `TAG_SCHEMA` and `PICK_SCHEMA` uses.
 */
export function forGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(forGeminiSchema);
  if (schema === null || typeof schema !== 'object') return schema;

  const obj = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let nullable = false;

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'additionalProperties') continue; // not a field Gemini's Schema documents
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
      // A nullable enum (e.g. size_unit) drops the null member from the
      // list and relies on the sibling `nullable: true` instead, because
      // Gemini's `enum` is documented as a list of strings, not a list that
      // itself carries a null.
      const filtered = value.filter((v) => v !== null);
      if (filtered.length !== value.length) nullable = true;
      out.enum = filtered;
      continue;
    }
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

function bodyFor(request: ProviderRequest): Record<string, unknown> {
  const parts: unknown[] = request.images.map((image) => ({
    inlineData: { mimeType: image.mediaType, data: Buffer.from(image.bytes).toString('base64') },
  }));
  // Text after the image, exactly as the Anthropic and xAI adapters do, so a
  // future A/B between vendors measures the model rather than the prompt
  // layout. Assumption 10: no cache breakpoint control on this path either
  // way, so `request.cache` buys nothing here today.
  parts.push({ text: request.user });

  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: forGeminiSchema(request.schema.schema),
    },
  };
}

/**
 * The refusal classes documented at https://ai.google.dev/api/generate-content
 * for `promptFeedback.blockReason` and `candidates[].finishReason`.
 * Assumption 8.
 */
const REFUSAL_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'BLOCKLIST', 'RECITATION', 'OTHER']);

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

interface GeminiBody {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: Record<string, unknown>;
  modelVersion?: string;
}

function readAnswer<T>(raw: string, model: string, provider: string): ProviderResponse<T> {
  let parsed: GeminiBody;
  try {
    parsed = JSON.parse(raw) as GeminiBody;
  } catch {
    throw new ProviderError('model_malformed', 'Gemini returned a body that is not JSON');
  }

  if (parsed.promptFeedback?.blockReason) {
    throw new ProviderError('unreadable_photo', `Gemini blocked the prompt: ${parsed.promptFeedback.blockReason}`);
  }

  const candidate = parsed.candidates?.[0];
  if (!candidate) {
    throw new ProviderError('model_malformed', 'Gemini returned no candidates');
  }
  if (candidate.finishReason && REFUSAL_REASONS.has(candidate.finishReason)) {
    throw new ProviderError('unreadable_photo', `Gemini declined to read this image: ${candidate.finishReason}`);
  }

  const text = (candidate.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('');
  if (text.trim() === '') {
    throw new ProviderError('model_malformed', 'Gemini returned no text part');
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

  return {
    value,
    usage: usageOf(parsed.usageMetadata),
    provider,
    model: typeof parsed.modelVersion === 'string' && parsed.modelVersion !== '' ? parsed.modelVersion : model,
  };
}

function usageOf(usage: Record<string, unknown> | undefined): TokenUsage {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!usage) {
    return { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null };
  }
  return {
    inputTokens: num(usage.promptTokenCount),
    outputTokens: num(usage.candidatesTokenCount),
    cacheReadTokens: num(usage.cachedContentTokenCount),
    // Assumption 9: no separate cache-write count on this path. Null, never
    // zero -- zero would claim a measurement this adapter never took.
    cacheCreationTokens: null,
  };
}
