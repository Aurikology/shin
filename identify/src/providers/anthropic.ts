/**
 * The Anthropic adapter. Everything vendor-specific that used to live in
 * `model.ts` is here, and nothing else moved with it.
 *
 * WHAT THIS FILE IS ALLOWED TO KNOW: the wire shape, the media block, the
 * `output_config` structured-output field, where `cache_control` goes, and how
 * to read a `usage` record. WHAT IT MUST NOT KNOW: the prompts, the schemas, the
 * clocks, the retry policy, the call cap, or the dollar cap. All of those stayed
 * in `model.ts` on purpose -- a second provider must inherit the policy, not
 * reimplement it, or the two will drift and only one of them will be the one
 * anybody reads.
 *
 * `MessagesClient` is still the structural seam every existing test builds a
 * fake against, and it is still typed in Anthropic's own wire types, because
 * that is now honest: this file IS the Anthropic-shaped layer. `model.ts`
 * re-exports the type so the callers that already import it from there
 * (`cap.ts`, `describe.ts`, `app/server.ts`) do not move.
 */

import Anthropic from '@anthropic-ai/sdk';

import {
  NO_USAGE,
  ProviderError,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type TokenUsage,
} from '../provider.ts';

/**
 * The one thing this file needs from a client, so a test can supply it.
 *
 * Structural rather than the SDK class: a test that wants to prove the retry
 * policy has to be able to hand back a 429 and then a success, and it should
 * not have to construct an Anthropic instance, an API key, or a socket to do
 * it. The real client satisfies this shape.
 */
export interface MessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal; maxRetries?: number },
    ): Promise<Anthropic.Message>;
  };
}

/** Builds a real SDK client, with the SDK's own retry loop switched off. */
export function anthropicClient(apiKey?: string): MessagesClient {
  // maxRetries: 0 added 2026-09-08. The SDK retries twice by default, which
  // would sit underneath model.ts's policy and make the real behaviour four
  // attempts with a backoff nothing in this repo chose.
  return new Anthropic(apiKey ? { apiKey, maxRetries: 0 } : { maxRetries: 0 }) as unknown as MessagesClient;
}

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  readonly #client: MessagesClient;

  constructor(client: MessagesClient) {
    this.#client = client;
  }

  async send<T>(request: ProviderRequest): Promise<ProviderResponse<T>> {
    const message = await this.#client.messages.create(bodyFor(request), {
      signal: request.signal,
      maxRetries: 0,
    });
    return {
      value: parseJson<T>(message),
      usage: usageOf(message),
      provider: this.name,
      // The SDK echoes the model it ran. A fake client in a test does not, and
      // the request's own model is the right answer there.
      model: (message as { model?: unknown }).model as string | undefined ?? request.model,
    };
  }
}

/**
 * The neutral request as Anthropic wants to hear it.
 *
 * Render order is tools, then system, then messages, and within the one user
 * turn the image blocks come before the text. That ordering is load-bearing for
 * the cache lever in `model.ts`: a `cache_control` breakpoint on the last image
 * block makes the cacheable prefix exactly "system + image", and anything
 * pass-specific after it is outside the cached span by construction.
 */
function bodyFor(request: ProviderRequest): Anthropic.MessageCreateParamsNonStreaming {
  const images = request.images.map((image, i) => {
    const block = {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: image.mediaType,
        data: toBase64(image.bytes),
      },
    };
    const last = i === request.images.length - 1;
    return request.cache === 'after_image' && last
      ? { ...block, cache_control: { type: 'ephemeral' as const } }
      : block;
  });

  const content = [...images, { type: 'text' as const, text: request.user }];

  return {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    system: request.system,
    output_config: {
      format: {
        type: 'json_schema' as const,
        name: request.schema.name,
        schema: request.schema.schema,
      },
    },
    messages: [{ role: 'user', content }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
}

/**
 * Reads the token counts, and reports an absence as an absence.
 *
 * A fake client (every test in this package, and the eval's `--dry-run`) returns
 * a message with no `usage` at all, and that has to come back as four nulls
 * rather than four zeroes: zero cache reads is a measurement and no cache read
 * field is not, and the cost model downstream refuses to price the second one.
 */
function usageOf(message: unknown): TokenUsage {
  const usage = (message as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage) return NO_USAGE;
  const num = (key: string): number | null => {
    const v = usage[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return {
    inputTokens: num('input_tokens'),
    outputTokens: num('output_tokens'),
    cacheReadTokens: num('cache_read_input_tokens'),
    cacheCreationTokens: num('cache_creation_input_tokens'),
  };
}

function parseJson<T>(message: Anthropic.Message): T {
  // stop_reason is checked before content is read: a refusal returns HTTP 200
  // with no usable body, and treating that as a parse failure would report a
  // camera problem for something that is not one.
  if (message.stop_reason === 'refusal') {
    throw new ProviderError('unreadable_photo', 'model declined to read this image');
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  // 2026-09-08: an answer that will not parse is its own class. It is the one
  // failure here that is neither the photograph nor the wire, and reading it
  // as either would have been the audit's point exactly.
  if (text.trim() === '') {
    throw new ProviderError('model_malformed', 'the model returned no text block');
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ProviderError(
      'model_malformed',
      `the model returned text that is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
