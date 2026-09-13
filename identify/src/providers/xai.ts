/**
 * The xAI (Grok) adapter. Written 2026-09-13, beta plan item 22b.
 *
 * ============================ READ THIS FIRST ============================
 * THIS ADAPTER HAS NEVER BEEN RUN. Not once, not against a sandbox, not
 * against a recorded fixture taken from a real response. There is no xAI key on
 * this machine and this lane had no network access, so every statement below
 * about xAI's wire format is written from memory of their published API and is
 * an ASSUMPTION until one real call is made. The unit tests in
 * `identify/test/xai.test.ts` prove that this file builds the request it thinks
 * it should and reads the response it thinks it will get -- they prove nothing
 * whatsoever about whether xAI agrees.
 *
 * THE ASSUMPTIONS, each one a thing to check on the first real call:
 *   1. Base URL `https://api.x.ai/v1`, endpoint `POST /chat/completions`.
 *   2. Auth is `Authorization: Bearer <XAI_API_KEY>`.
 *   3. The request is OpenAI-chat-compatible: a `messages` array, a `system`
 *      role message, and a user message whose `content` is an array of parts.
 *   4. An image part is `{type:'image_url', image_url:{url:'data:<media
 *      type>;base64,<data>', detail:'high'}}` -- a data URI, not an upload.
 *   5. Structured output is `response_format: {type:'json_schema',
 *      json_schema:{name, strict:true, schema}}`, and the model honours
 *      `additionalProperties:false` and nullable `type` arrays the way the
 *      schemas in `model.ts` are written. THIS IS THE ASSUMPTION MOST LIKELY TO
 *      BE WRONG: strict structured-output implementations often reject union
 *      `type` arrays, and every nullable field in `PRODUCT_SCHEMA` is one.
 *   6. The output ceiling is `max_tokens`.
 *   7. The answer is `choices[0].message.content`, a JSON string.
 *   8. A refusal appears as `choices[0].finish_reason === 'content_filter'`, or
 *      as a non-empty `choices[0].message.refusal`.
 *   9. Usage is `usage.prompt_tokens` / `usage.completion_tokens`, with cache
 *      reads at `usage.prompt_tokens_details.cached_tokens`. There is assumed to
 *      be NO cache-creation count, so `cacheCreationTokens` is always null here
 *      rather than zero -- absence, not a measurement.
 *  10. There is no explicit cache-breakpoint control, so `request.cache` is
 *      accepted and ignored. Caching, if it happens at all, is automatic.
 *  11. The model ids in `GROK_FOR` below exist and accept images.
 *
 * None of this is reached unless `SHIN_MODEL_PROVIDER=xai` is set explicitly.
 * The default is `anthropic` and nothing about the existing path changes.
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

const DEFAULT_BASE_URL = 'https://api.x.ai/v1';

/**
 * Which Grok model stands in for which Claude model.
 *
 * `model.ts` picks a model from its own tier table, which is written in
 * Anthropic's names because that is the default provider. Rather than teach
 * `model.ts` about every vendor's catalogue, the translation lives with the
 * translator. Every id here is an ASSUMPTION (item 11 above) and every one of
 * them is overridable by environment so a wrong guess is a config change, not a
 * code change.
 */
const GROK_FOR: Readonly<Record<string, string>> = {
  'claude-haiku-4-5': 'grok-4-fast',
  'claude-sonnet-5': 'grok-4',
  'claude-opus-5': 'grok-4',
};

const FALLBACK_MODEL = 'grok-4';

export function grokModelFor(model: string): string {
  const override = process.env.SHIN_XAI_MODEL?.trim();
  if (override) return override;
  const mapped = GROK_FOR[model];
  if (mapped) return mapped;
  // A caller that already named a Grok model is taken at its word; anything
  // else unknown falls back rather than being sent to xAI as a Claude id.
  if (model.startsWith('grok')) return model;
  return FALLBACK_MODEL;
}

/**
 * Just enough of `fetch` to be replaceable by a fake in a test.
 *
 * Deliberately narrow. The adapter needs a status, a body, and the ability to be
 * aborted; anything else it asked for would be another thing a fake transport
 * has to imitate correctly for a test to mean something.
 */
export interface XaiTransport {
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

export interface XaiOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly transport?: XaiTransport;
}

export class XaiProvider implements Provider {
  readonly name = 'xai';
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #transport: XaiTransport;

  constructor(options: XaiOptions = {}) {
    this.#apiKey = options.apiKey ?? process.env.XAI_API_KEY ?? '';
    this.#baseUrl = (options.baseUrl ?? process.env.SHIN_XAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#transport = options.transport ?? (globalThis.fetch as unknown as XaiTransport);
  }

  async send<T>(request: ProviderRequest): Promise<ProviderResponse<T>> {
    // Classed as a client error and not an outage, for the same reason
    // `classifyProviderError` has that branch: our empty environment is our
    // misconfiguration, and calling it an outage is how a missing key ends up
    // logged as a bad photograph.
    if (!this.#apiKey) {
      throw new ProviderError('model_client_error', 'no XAI_API_KEY is set, so the xAI provider cannot call');
    }

    const model = grokModelFor(request.model);
    const response = await this.#transport(`${this.#baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify(bodyFor(request, model)),
      signal: request.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      // Status carried through so `model.ts`'s retry policy sees the same 429
      // and 5xx it already knows how to treat, from a provider it has never
      // heard of.
      throw new ProviderError(
        classifyProviderError({ status: response.status, message: raw }),
        `xAI returned ${response.status}: ${raw.slice(0, 300)}`,
        response.status,
      );
    }

    return readAnswer<T>(raw, model, this.name);
  }
}

interface XaiBody {
  model: string;
  max_tokens: number;
  messages: unknown[];
  response_format: unknown;
}

function bodyFor(request: ProviderRequest, model: string): XaiBody {
  const parts: unknown[] = request.images.map((image) => ({
    type: 'image_url',
    image_url: {
      url: `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString('base64')}`,
      // 'high' rather than 'auto': the eye already crops to 1568 px on the long
      // edge (app/src/eye/capture.ts, decision 12) and a provider-side downscale
      // of an already-tight crop is the thing that loses a 9 pt net-quantity
      // line. Assumption 4: that this field exists and takes this value.
      detail: 'high',
    },
  }));
  // The text goes AFTER the image, exactly as in the Anthropic adapter, because
  // `model.ts`'s cache lever depends on the pass-specific instruction sitting
  // behind the shared prefix. xAI is assumed to have no breakpoint control
  // (assumption 10), so here the ordering buys nothing today -- it is kept so
  // the two adapters send the same thing in the same order and an A/B between
  // them measures the model rather than the prompt layout.
  parts.push({ type: 'text', text: request.user });

  return {
    model,
    max_tokens: request.maxOutputTokens,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: parts },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: request.schema.name,
        strict: true,
        schema: request.schema.schema,
      },
    },
  };
}

function readAnswer<T>(raw: string, model: string, provider: string): ProviderResponse<T> {
  let parsed: {
    model?: unknown;
    choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }[];
    usage?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new ProviderError('model_malformed', 'xAI returned a body that is not JSON');
  }

  const choice = parsed.choices?.[0];
  if (!choice) {
    throw new ProviderError('model_malformed', 'xAI returned no choices');
  }
  // A refusal is the one failure on this path that really is about the
  // photograph, and it arrives as HTTP 200 with no usable body -- the same trap
  // the Anthropic adapter checks `stop_reason` for before it reads content.
  const refusal = choice.message?.refusal;
  if (choice.finish_reason === 'content_filter' || (typeof refusal === 'string' && refusal.trim() !== '')) {
    throw new ProviderError('unreadable_photo', 'the model declined to read this image');
  }

  const content = choice.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new ProviderError('model_malformed', 'xAI returned no text content');
  }

  let value: T;
  try {
    value = JSON.parse(content) as T;
  } catch (err) {
    throw new ProviderError(
      'model_malformed',
      `xAI returned text that is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    value,
    usage: usageOf(parsed.usage),
    provider,
    model: typeof parsed.model === 'string' && parsed.model !== '' ? parsed.model : model,
  };
}

function usageOf(usage: Record<string, unknown> | undefined): TokenUsage {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!usage) {
    return { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null };
  }
  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  return {
    inputTokens: num(usage.prompt_tokens),
    outputTokens: num(usage.completion_tokens),
    cacheReadTokens: num(details?.cached_tokens),
    // Assumption 9: xAI is believed to report no cache-creation count at all.
    // Null, never zero: zero would say "we wrote no cache", which would be a
    // measurement this adapter has not made.
    cacheCreationTokens: null,
  };
}
