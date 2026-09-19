/**
 * The xAI adapter. Added 2026-09-13, beta plan item 22b.
 *
 * THESE TESTS PROVE THE ADAPTER AGREES WITH ITSELF, AND NOTHING MORE. There is
 * no xAI key on this machine and this lane made no network call, so every
 * request shape asserted below is asserted against `identify/src/providers/
 * xai.ts`'s own assumptions about xAI's wire format -- the eleven listed in that
 * file's header. If assumption 5 (strict `json_schema` with nullable `type`
 * arrays) is wrong, every test here still passes and every real call still
 * fails. The first real call is the measurement; this file is the scaffolding
 * that makes the first real call worth attempting.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ProviderError } from '../src/provider.ts';
import { XaiProvider, grokModelFor, type XaiTransport } from '../src/providers/xai.ts';

const SCHEMA = { name: 'product_identity', schema: { type: 'object' } };

function request(over: Record<string, unknown> = {}) {
  return {
    model: 'claude-sonnet-5',
    images: [{ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), mediaType: 'image/jpeg' as const }],
    system: 'shared prefix',
    user: 'the pass-specific instruction',
    schema: SCHEMA,
    maxOutputTokens: 512,
    signal: new AbortController().signal,
    ...over,
  };
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeTransport(
  reply: { ok?: boolean; status?: number; text: string },
): XaiTransport & { calls: Call[] } {
  const calls: Call[] = [];
  const transport = (async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      async text() {
        return reply.text;
      },
    };
  }) as XaiTransport & { calls: Call[] };
  transport.calls = calls;
  return transport;
}

const ANSWER = JSON.stringify({
  id: 'x',
  model: 'grok-4',
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ brand: 'Acme' }) } }],
  usage: {
    prompt_tokens: 2_600,
    completion_tokens: 180,
    prompt_tokens_details: { cached_tokens: 2_459 },
  },
});

test('the request is the OpenAI-compatible shape the adapter assumes xAI speaks', async () => {
  const transport = fakeTransport({ text: ANSWER });
  const provider = new XaiProvider({ apiKey: 'k', transport, baseUrl: 'https://api.x.ai/v1' });
  await provider.send(request());

  const call = transport.calls[0];
  assert.equal(call.url, 'https://api.x.ai/v1/chat/completions');
  assert.equal(call.headers.authorization, 'Bearer k');

  const messages = call.body.messages as { role: string; content: unknown }[];
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[0].content, 'shared prefix');

  const parts = messages[1].content as { type: string; text?: string; image_url?: { url: string } }[];
  assert.equal(parts[0].type, 'image_url', 'the image comes first, as it does on the Anthropic side');
  assert.match(parts[0].image_url!.url, /^data:image\/jpeg;base64,/, 'a data URI, not an upload');
  assert.equal(parts[1].type, 'text');
  assert.equal(parts[1].text, 'the pass-specific instruction', 'and the instruction comes after it');

  assert.equal(call.body.max_tokens, 512);
  assert.deepEqual(call.body.response_format, {
    type: 'json_schema',
    json_schema: { name: 'product_identity', strict: true, schema: { type: 'object' } },
  });
});

test('the answer is parsed out of choices[0] and the usage names are xAI\'s, not Anthropic\'s', async () => {
  const transport = fakeTransport({ text: ANSWER });
  const provider = new XaiProvider({ apiKey: 'k', transport });
  const response = await provider.send<{ brand: string }>(request());

  assert.equal(response.value.brand, 'Acme');
  assert.equal(response.provider, 'xai');
  assert.equal(response.model, 'grok-4', 'the model the response says it ran, not the one asked for');
  assert.equal(response.usage.inputTokens, 2_600);
  assert.equal(response.usage.outputTokens, 180);
  assert.equal(response.usage.cacheReadTokens, 2_459);
  assert.equal(
    response.usage.cacheCreationTokens,
    null,
    'xAI is assumed to report no cache-write count; null says "not reported", zero would be a claim',
  );
});

test('a cache hint is accepted and ignored, because this provider is assumed to have no breakpoint', async () => {
  const transport = fakeTransport({ text: ANSWER });
  await new XaiProvider({ apiKey: 'k', transport }).send(request({ cache: 'after_image' }));
  const parts = (transport.calls[0].body.messages as { content: unknown }[])[1].content as Record<
    string,
    unknown
  >[];
  assert.equal(parts[0].cache_control, undefined);
});

test('an HTTP status keeps the class model.ts already knows how to retry on', async () => {
  for (const [status, failure] of [
    [429, 'model_rate_limited'],
    [503, 'model_outage'],
    [400, 'model_client_error'],
  ] as const) {
    const transport = fakeTransport({ ok: false, status, text: '{"error":"no"}' });
    const provider = new XaiProvider({ apiKey: 'k', transport });
    await assert.rejects(
      provider.send(request()),
      (e: unknown) => e instanceof ProviderError && e.failure === failure && e.status === status,
      `status ${status}`,
    );
  }
});

test('a content filter is the one failure that really is about the photograph', async () => {
  const filtered = JSON.stringify({ choices: [{ finish_reason: 'content_filter', message: {} }] });
  const transport = fakeTransport({ text: filtered });
  await assert.rejects(
    new XaiProvider({ apiKey: 'k', transport }).send(request()),
    (e: unknown) => e instanceof ProviderError && e.failure === 'unreadable_photo',
  );
});

test('an answer that is not JSON, or is not there at all, is malformed and neither wire nor photo', async () => {
  const cases = [
    '{"choices":[{"message":{"content":"{oops"}}]}',
    '{"choices":[{"message":{"content":""}}]}',
    '{"choices":[]}',
    'not json at all',
  ];
  for (const text of cases) {
    const transport = fakeTransport({ text });
    await assert.rejects(
      new XaiProvider({ apiKey: 'k', transport }).send(request()),
      (e: unknown) => e instanceof ProviderError && e.failure === 'model_malformed',
      text,
    );
  }
});

test('no key is our misconfiguration, classed as a client error, and never reaches a socket', async () => {
  const transport = fakeTransport({ text: ANSWER });
  const provider = new XaiProvider({ apiKey: '', transport });
  await assert.rejects(
    provider.send(request()),
    (e: unknown) => e instanceof ProviderError && e.failure === 'model_client_error',
  );
  assert.equal(transport.calls.length, 0);
});

test('a Claude model id is translated, an explicit override wins, and nothing unknown is sent raw', () => {
  assert.equal(grokModelFor('claude-haiku-4-5'), 'grok-4-fast');
  assert.equal(grokModelFor('claude-sonnet-5'), 'grok-4');
  assert.equal(grokModelFor('something-else'), 'grok-4', 'never send a Claude id to xAI');
  process.env.SHIN_XAI_MODEL = 'grok-4-mini';
  try {
    assert.equal(grokModelFor('claude-sonnet-5'), 'grok-4-mini');
  } finally {
    delete process.env.SHIN_XAI_MODEL;
  }
});

