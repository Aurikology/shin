/**
 * The Gemini adapter. Added 2026-09-14, "switch to gemini for barcode and
 * image searches".
 *
 * THESE TESTS PROVE THE ADAPTER AGREES WITH ITSELF, AND NOTHING MORE, exactly
 * as `xai.test.ts`'s own header says of that adapter. There is no
 * `GEMINI_API_KEY` on this machine and this file makes no network call, so
 * every request shape asserted below is asserted against
 * `identify/src/providers/gemini.ts`'s own documented assumptions about
 * Gemini's wire format. The first real call is the measurement.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ModelCallError, Identifier, resetModelSpend } from '../src/model.ts';
import { ProviderError } from '../src/provider.ts';
import { GeminiProvider, forGeminiSchema, geminiModelFor, type GeminiTransport } from '../src/providers/gemini.ts';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'size_unit'],
  properties: {
    brand: { type: ['string', 'null'] },
    size_unit: { type: ['string', 'null'], enum: ['g', 'kg', 'ml', 'l', 'ea', null] },
    count: { type: ['integer', 'null'] },
    front_text: { type: 'array', maxItems: 12, items: { type: 'string' } },
  },
};

function request(over: Record<string, unknown> = {}) {
  return {
    model: 'claude-sonnet-5',
    images: [{ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mediaType: 'image/png' as const }],
    system: 'shared prefix',
    user: 'the pass-specific instruction',
    schema: { name: 'product_identity', schema: SCHEMA },
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

function fakeTransport(reply: { ok?: boolean; status?: number; text: string }): GeminiTransport & { calls: Call[] } {
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
  }) as GeminiTransport & { calls: Call[] };
  transport.calls = calls;
  return transport;
}

const ANSWER = JSON.stringify({
  modelVersion: 'gemini-2.5-pro-002',
  candidates: [
    {
      finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify({ brand: 'Acme' }) }] },
    },
  ],
  usageMetadata: {
    promptTokenCount: 2_600,
    candidatesTokenCount: 180,
    cachedContentTokenCount: 2_459,
  },
});

test('the schema translation: type arrays become nullable, enums drop null, additionalProperties is dropped', () => {
  const out = forGeminiSchema(SCHEMA) as Record<string, unknown>;
  assert.equal(out.additionalProperties, undefined, 'not a field Gemini documents');
  const props = out.properties as Record<string, Record<string, unknown>>;
  assert.equal(props.brand.type, 'STRING');
  assert.equal(props.brand.nullable, true);
  assert.equal(props.size_unit.type, 'STRING');
  assert.equal(props.size_unit.nullable, true);
  assert.deepEqual(props.size_unit.enum, ['g', 'kg', 'ml', 'l', 'ea'], 'null member dropped from the enum list');
  assert.equal(props.count.type, 'INTEGER');
  assert.equal(props.count.nullable, true);
  assert.equal(props.front_text.type, 'ARRAY');
  assert.equal((props.front_text.items as Record<string, unknown>).type, 'STRING');
});

test('the request: image before text, key on the query string, camelCase generationConfig', async () => {
  const transport = fakeTransport({ text: ANSWER });
  const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' });
  await provider.send(request());

  const call = transport.calls[0];
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=k');

  assert.equal((call.body.systemInstruction as { parts: { text: string }[] }).parts[0].text, 'shared prefix');
  const parts = (call.body.contents as { parts: unknown[] }[])[0].parts as Record<string, unknown>[];
  assert.ok('inlineData' in parts[0], 'the image comes first, as it does on every other adapter');
  assert.equal((parts[0].inlineData as { mimeType: string }).mimeType, 'image/png');
  assert.equal(parts[1].text, 'the pass-specific instruction');

  const gen = call.body.generationConfig as Record<string, unknown>;
  assert.equal(gen.maxOutputTokens, 512);
  assert.equal(gen.responseMimeType, 'application/json');
  assert.ok(gen.responseSchema, 'a translated schema is always sent, never the raw JSON Schema one');
});

test('the answer is parsed out of candidates[0] and the usage names are Gemini\'s own', async () => {
  const transport = fakeTransport({ text: ANSWER });
  const provider = new GeminiProvider({ apiKey: 'k', transport });
  const response = await provider.send<{ brand: string }>(request());

  assert.equal(response.value.brand, 'Acme');
  assert.equal(response.provider, 'gemini');
  assert.equal(response.model, 'gemini-2.5-pro-002', 'the model Gemini says it actually ran');
  assert.equal(response.usage.inputTokens, 2_600);
  assert.equal(response.usage.outputTokens, 180);
  assert.equal(response.usage.cacheReadTokens, 2_459);
  assert.equal(response.usage.cacheCreationTokens, null, 'no cache-write count is reported on this path');
});

test('a blocked prompt is the one failure that really is about the photograph', async () => {
  const blocked = JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } });
  const transport = fakeTransport({ text: blocked });
  await assert.rejects(
    new GeminiProvider({ apiKey: 'k', transport }).send(request()),
    (e: unknown) => e instanceof ProviderError && e.failure === 'unreadable_photo',
  );
});

test('a candidate finishReason in the refusal set is also unreadable_photo, not malformed', async () => {
  const refused = JSON.stringify({ candidates: [{ finishReason: 'PROHIBITED_CONTENT', content: {} }] });
  const transport = fakeTransport({ text: refused });
  await assert.rejects(
    new GeminiProvider({ apiKey: 'k', transport }).send(request()),
    (e: unknown) => e instanceof ProviderError && e.failure === 'unreadable_photo',
  );
});

test('an HTTP status keeps the class model.ts already knows how to retry on', async () => {
  for (const [status, failure] of [
    [429, 'model_rate_limited'],
    [503, 'model_outage'],
    [400, 'model_client_error'],
  ] as const) {
    const transport = fakeTransport({ ok: false, status, text: '{"error":"no"}' });
    const provider = new GeminiProvider({ apiKey: 'k', transport });
    await assert.rejects(
      provider.send(request()),
      (e: unknown) => e instanceof ProviderError && e.failure === failure && e.status === status,
      `status ${status}`,
    );
  }
});

test('an answer that is not JSON, or is not there at all, is malformed and neither wire nor photo', async () => {
  const cases = [
    '{"candidates":[{"content":{"parts":[{"text":"{oops"}]}}]}',
    '{"candidates":[{"content":{"parts":[{"text":""}]}}]}',
    '{"candidates":[]}',
    'not json at all',
  ];
  for (const text of cases) {
    const transport = fakeTransport({ text });
    await assert.rejects(
      new GeminiProvider({ apiKey: 'k', transport }).send(request()),
      (e: unknown) => e instanceof ProviderError && e.failure === 'model_malformed',
      text,
    );
  }
});

test('no key is our misconfiguration, classed as a client error, and never reaches a socket', async () => {
  const transport = fakeTransport({ text: ANSWER });
  const provider = new GeminiProvider({ apiKey: '', transport });
  await assert.rejects(
    provider.send(request()),
    (e: unknown) => e instanceof ProviderError && e.failure === 'model_client_error',
  );
  assert.equal(transport.calls.length, 0);
});

test('a Claude model id is translated, an explicit override wins, and nothing unknown is sent raw', () => {
  assert.equal(geminiModelFor('claude-haiku-4-5'), 'gemini-2.5-flash');
  assert.equal(geminiModelFor('claude-sonnet-5'), 'gemini-2.5-pro');
  assert.equal(geminiModelFor('something-else'), 'gemini-2.5-flash', 'never send a Claude id to Gemini');
  process.env.SHIN_GEMINI_MODEL = 'gemini-2.5-flash-lite';
  try {
    assert.equal(geminiModelFor('claude-sonnet-5'), 'gemini-2.5-flash-lite');
  } finally {
    delete process.env.SHIN_GEMINI_MODEL;
  }
});

test('selected by env, the Gemini provider carries model.ts\'s whole policy unchanged', async () => {
  const before = process.env.SHIN_MODEL_PROVIDER;
  process.env.SHIN_MODEL_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'k';
  resetModelSpend();
  try {
    // A 429 then an answer: proof that the retry policy, the clock and the
    // cap are model.ts's and apply to a provider it has never heard of.
    let calls = 0;
    const transport = (async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 429, async text() { return 'slow down'; } };
      return { ok: true, status: 200, async text() { return ANSWER; } };
    }) as GeminiTransport;

    const id = new Identifier(undefined, undefined, new GeminiProvider({ apiKey: 'k', transport }));
    const reading = await id.read(new Uint8Array(), null, 'basic');
    assert.equal(calls, 2, 'one retry, exactly as on the Anthropic path');
    assert.equal((reading.product as unknown as { brand: string }).brand, 'Acme');
  } finally {
    if (before === undefined) delete process.env.SHIN_MODEL_PROVIDER;
    else process.env.SHIN_MODEL_PROVIDER = before;
    delete process.env.GEMINI_API_KEY;
    resetModelSpend();
  }
});

test('a hard outage through the Gemini provider still arrives as a ModelCallError, not a raw throw', async () => {
  resetModelSpend();
  const transport = fakeTransport({ ok: false, status: 500, text: 'boom' });
  const id = new Identifier(undefined, undefined, new GeminiProvider({ apiKey: 'k', transport }));
  await assert.rejects(
    id.read(new Uint8Array(), null, 'basic'),
    (e: unknown) => e instanceof ModelCallError && e.failure === 'model_outage',
  );
  assert.equal(transport.calls.length, 2, 'a 5xx gets exactly one more try, from this provider too');
  resetModelSpend();
});
