/**
 * The Gemini adapter. Added 2026-09-14 for the switch to Google.
 *
 * THESE TESTS PROVE THE ADAPTER AGREES WITH ITSELF, AND NOTHING MORE. There is
 * no `GEMINI_API_KEY` on this machine and this lane made no network call, so
 * every request shape asserted below is asserted against
 * `identify/src/providers/gemini.ts`'s own assumptions about Google's wire
 * format, the thirteen listed in that file's header. If assumption 4 (a
 * role-tagged `input` list rather than a plain string) or assumption 3 (the
 * schema dialect) is wrong, every test here still passes and every real call
 * still fails. The first real call is the measurement; this file is the
 * scaffolding that makes the first real call worth attempting.
 *
 * The two checks that are NOT about Google's agreement, and that would still be
 * worth having if Google's docs were perfect, are the first two: the key never
 * reaches the URL, and no `tools` field is ever sent. Those are about what this
 * repo promises, not about what Google accepts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ProviderError } from '../src/provider.ts';
import {
  GeminiProvider,
  MAX_INLINE_IMAGE_BYTES,
  geminiModelFor,
  type GeminiTransport,
} from '../src/providers/gemini.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

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
): GeminiTransport & { calls: Call[] } {
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

/** One well-formed Interactions answer, in the shape assumptions 8 and 9 describe. */
function answer(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    steps: [
      { type: 'thought', signature: 'sig', summary: [{ type: 'text', text: 'looking at the label' }] },
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ brand: 'Acme' }) }] },
    ],
    status: 'completed',
    // The spec's `Usage` names (https://ai.google.dev/static/api/interactions.openapi.json, 2026-09-15).
    usage: {
      total_input_tokens: 2_600,
      total_output_tokens: 180,
      total_thought_tokens: 320,
      total_cached_tokens: 2_459,
      total_tokens: 3_100,
    },
    ...over,
  });
}

/** Runs `body` with `name` set to `value`, and puts the environment back whatever happens. */
async function withEnv(name: string, value: string | undefined, body: () => Promise<void>): Promise<void> {
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await body();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

test('the API key is a header and never appears in the URL', async () => {
  const transport = fakeTransport({ text: answer() });
  const provider = new GeminiProvider({ apiKey: 'sk-secret-123', transport, baseUrl: BASE });
  await provider.send(request());

  const call = transport.calls[0];
  assert.equal(call.headers['x-goog-api-key'], 'sk-secret-123');
  // The reverted attempt (commit ccbd0cc) sent `?key=<secret>`, which is how a
  // secret lands in a proxy log and a screenshot. Both halves are asserted: no
  // query parameter named key, and the secret itself nowhere in the string.
  assert.ok(!call.url.includes('key='), `the key leaked into the URL: ${call.url}`);
  assert.ok(!call.url.includes('sk-secret-123'), `the key leaked into the URL: ${call.url}`);
});

test('the endpoint is the Interactions API, not legacy generateContent', async () => {
  const transport = fakeTransport({ text: answer() });
  await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());
  assert.equal(transport.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.ok(!transport.calls[0].url.includes('generateContent'));
});

test('a base URL that already names the endpoint does not grow a second one', async () => {
  const transport = fakeTransport({ text: answer() });
  await new GeminiProvider({ apiKey: 'k', transport, baseUrl: `${BASE}/interactions/` }).send(request());
  assert.equal(transport.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
});

test('SHIN_GEMINI_BASE_URL is the override, and it is read at construction', async () => {
  await withEnv('SHIN_GEMINI_BASE_URL', 'https://example.test/v9', async () => {
    const transport = fakeTransport({ text: answer() });
    await new GeminiProvider({ apiKey: 'k', transport }).send(request());
    assert.equal(transport.calls[0].url, 'https://example.test/v9/interactions');
  });
});

test('no tools field is ever sent, because an ungrounded answer is the whole point', async () => {
  const transport = fakeTransport({ text: answer() });
  await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());

  const body = transport.calls[0].body;
  // Absent, not empty: an empty array is still a request that mentions tools.
  assert.ok(!('tools' in body), 'the ungrounded adapter sent a tools field');
  assert.ok(!JSON.stringify(body).includes('google_search'));
});

/*
 * REWRITTEN TWICE, and the second time is the one worth keeping.
 *
 * 2026-09-14 this test pinned `generation_config.media_resolution` and an
 * uppercase schema, both read off the docs and never sent. 2026-09-15 the
 * phone's first real call came back HTTP 400: "Unknown parameter
 * 'media_resolution' at 'generation_config'". The OpenAPI spec
 * (https://ai.google.dev/static/api/interactions.openapi.json, read
 * 2026-09-15) has no such member of GenerationConfig; the resolution is
 * `resolution` on the image part. This test now pins the spec's shape, field
 * by field, and asserts the rejected field is absent so it cannot come back.
 *
 * A test holds a claim still. It cannot tell you the claim was true.
 */
test('the body is the Interactions shape the OpenAPI spec documents, image before text', async () => {
  const transport = fakeTransport({ text: answer() });
  await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());

  const body = transport.calls[0].body;
  assert.deepEqual(Object.keys(body).sort(), [
    'generation_config',
    'input',
    'model',
    'response_format',
    'store',
    'system_instruction',
  ]);
  assert.equal(body.system_instruction, 'shared prefix');
  assert.equal(body.store, false);
  assert.deepEqual(body.generation_config, { thinking_level: 'low' });
  assert.ok(!JSON.stringify(body).includes('media_resolution'), 'the field Google rejected is back');
  assert.deepEqual(body.response_format, {
    type: 'text',
    mime_type: 'application/json',
    // Plain JSON Schema, passed through untranslated.
    schema: { type: 'object' },
  });

  const input = body.input as Record<string, unknown>[];
  assert.equal(input.length, 2);
  assert.deepEqual(Object.keys(input[0]).sort(), ['data', 'mime_type', 'resolution', 'type']);
  assert.equal(input[0].type, 'image');
  assert.equal(input[0].mime_type, 'image/jpeg');
  assert.equal(input[0].data, Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'));
  assert.equal(input[0].resolution, 'medium');
  assert.deepEqual(input[1], { type: 'text', text: 'the pass-specific instruction' });
});

test('the resolution and thinking level are only ever sent as values the spec enumerates', async () => {
  for (const [raw, expected] of [
    ['high', 'high'],
    ['MEDIA_RESOLUTION_LOW', 'low'],
    ['ultra_high', 'ultra_high'],
    ['enormous', 'medium'],
  ] as const) {
    await withEnv('SHIN_GEMINI_MEDIA_RESOLUTION', raw, async () => {
      const transport = fakeTransport({ text: answer() });
      await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());
      assert.equal((transport.calls[0].body.input as Record<string, unknown>[])[0].resolution, expected);
    });
  }
  await withEnv('SHIN_GEMINI_THINKING', 'thoughtful', async () => {
    const transport = fakeTransport({ text: answer() });
    await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());
    assert.deepEqual(transport.calls[0].body.generation_config, { thinking_level: 'low' });
  });
});

test('a nullable schema travels as plain JSON Schema, type arrays and all', async () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: { brand: { type: ['string', 'null'] }, unit: { type: ['string', 'null'], enum: ['g', 'ml', null] } },
    required: ['brand', 'unit'],
  };
  const transport = fakeTransport({ text: answer() });
  await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(
    request({ schema: { name: 'product_identity', schema } }),
  );
  assert.deepEqual((transport.calls[0].body.response_format as { schema: unknown }).schema, schema);
});

test('a failed interaction with no answer is malformed, and carries Google\'s own error text', async () => {
  const transport = fakeTransport({
    text: JSON.stringify({ status: 'failed', steps: [], errors: [{ code: 'internal', message: 'boom' }] }),
  });
  await assert.rejects(
    new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request()),
    (err: unknown) =>
      err instanceof ProviderError && err.failure === 'model_malformed' && /failed: internal: boom/.test(err.message),
  );
});
test('SHIN_GEMINI_THINKING overrides the thinking level', async () => {
  await withEnv('SHIN_GEMINI_THINKING', 'high', async () => {
    const transport = fakeTransport({ text: answer() });
    await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());
    const gen = transport.calls[0].body.generation_config as Record<string, unknown>;
    assert.equal(gen.thinking_level, 'high');
  });
});

test('the cheap model carries the basic tier and the bigger one the pro tier', () => {
  assert.equal(geminiModelFor('claude-haiku-4-5'), 'gemini-3.5-flash-lite');
  assert.equal(geminiModelFor('claude-sonnet-5'), 'gemini-3.8-flash');
  assert.equal(geminiModelFor('claude-opus-5'), 'gemini-3.8-flash');
  // A caller that already named a Gemini model is taken at its word; anything
  // unknown falls back rather than being sent to Google as a Claude id.
  assert.equal(geminiModelFor('gemini-4-experimental'), 'gemini-4-experimental');
  assert.equal(geminiModelFor('something-else'), 'gemini-3.5-flash-lite');
});

test('SHIN_GEMINI_MODEL overrides every tier with one id', async () => {
  await withEnv('SHIN_GEMINI_MODEL', 'gemini-3.9-pro', async () => {
    assert.equal(geminiModelFor('claude-haiku-4-5'), 'gemini-3.9-pro');
    assert.equal(geminiModelFor('claude-sonnet-5'), 'gemini-3.9-pro');
    const transport = fakeTransport({ text: answer() });
    await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request({ model: 'claude-haiku-4-5' }));
    assert.equal(transport.calls[0].body.model, 'gemini-3.9-pro');
  });
});

test('a successful call returns the parsed value, the usage, and who answered', async () => {
  const transport = fakeTransport({ text: answer() });
  const response = await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());

  assert.deepEqual(response.value, { brand: 'Acme' });
  assert.equal(response.provider, 'gemini');
  assert.equal(response.model, 'gemini-3.8-flash');
});

test('thinking tokens are counted as output, because they bill at the output rate', async () => {
  const transport = fakeTransport({ text: answer() });
  const response = await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());

  assert.equal(response.usage.inputTokens, 2_600);
  assert.equal(response.usage.outputTokens, 180 + 320);
  assert.equal(response.usage.cacheReadTokens, 2_459);
  // Absence, never a zero: this adapter has no cache-write count to report and
  // a zero would claim a measurement it never took.
  assert.equal(response.usage.cacheCreationTokens, null);
});

test('a response reporting no usage at all comes back as four absences', async () => {
  const transport = fakeTransport({ text: answer({ usage: undefined }) });
  const response = await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());
  assert.deepEqual(response.usage, {
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheCreationTokens: null,
  });
});

test('the model the response echoes wins over the one that was asked for', async () => {
  const transport = fakeTransport({ text: answer({ model: 'gemini-3.8-flash-002' }) });
  const response = await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());
  assert.equal(response.model, 'gemini-3.8-flash-002');
});

test('the last model_output step is the answer, not the first', async () => {
  const transport = fakeTransport({
    text: JSON.stringify({
      steps: [
        { type: 'model_output', content: [{ type: 'text', text: '{"brand":"first"}' }] },
        { type: 'model_output', content: [{ type: 'text', text: '{"brand":"corrected"}' }] },
      ],
    }),
  });
  const response = await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());
  assert.deepEqual(response.value, { brand: 'corrected' });
});

test('an HTTP status keeps the class model.ts already knows how to retry on', async () => {
  const cases: [number, string][] = [
    [429, 'model_rate_limited'],
    [401, 'model_client_error'],
    [403, 'model_client_error'],
    [500, 'model_outage'],
    [503, 'model_outage'],
  ];
  for (const [status, failure] of cases) {
    const transport = fakeTransport({ ok: false, status, text: 'nope' });
    const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE });
    await assert.rejects(
      () => provider.send(request()),
      (err: unknown) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.failure, failure, `HTTP ${status} was classed ${err.failure}`);
        assert.equal(err.status, status);
        return true;
      },
    );
  }
});

test('an aborted call is a timeout, not an outage', async () => {
  const transport: GeminiTransport = async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  };
  const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE });
  // The adapter does not catch this one: `classifyProviderError` in model.ts
  // reads `name` off whatever came up, which is the same contract xai.ts has.
  await assert.rejects(() => provider.send(request()), { name: 'AbortError' });
});

test('safety, recitation, prohibited content and spii are the failures that really are about the photograph', async () => {
  for (const reason of ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'BLOCKLIST']) {
    const transport = fakeTransport({
      text: JSON.stringify({ steps: [{ type: 'model_output', content: [], finish_reason: reason }] }),
    });
    const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE });
    await assert.rejects(
      () => provider.send(request()),
      (err: unknown) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.failure, 'unreadable_photo', `${reason} was classed ${err.failure}`);
        return true;
      },
    );
  }
});

test('any block reason at all is about the photograph', async () => {
  const transport = fakeTransport({ text: JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' }, steps: [] }) });
  const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE });
  await assert.rejects(
    () => provider.send(request()),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.failure, 'unreadable_photo');
      return true;
    },
  );
});

test('a generic OTHER finish reason is NOT blamed on the photograph', async () => {
  // The reverted attempt (commit ccbd0cc) put OTHER in its refusal set, which
  // reads an "the service did not say" bucket back as a bad photographer. Hard
  // rule 3: nothing points at the user, the diagnosis included.
  const transport = fakeTransport({
    text: JSON.stringify({ steps: [{ type: 'model_output', content: [], finish_reason: 'OTHER' }] }),
  });
  const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE });
  await assert.rejects(
    () => provider.send(request()),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.failure, 'model_malformed');
      return true;
    },
  );
});

test('an answer that is not JSON, or has no answer step at all, is malformed and neither wire nor photo', async () => {
  const bodies = [
    'not json at all',
    JSON.stringify({ steps: [{ type: 'thought', content: [{ type: 'text', text: 'hm' }] }] }),
    JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '   ' }] }] }),
    JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'sorry, I cannot' }] }] }),
  ];
  for (const text of bodies) {
    const transport = fakeTransport({ text });
    const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE });
    await assert.rejects(
      () => provider.send(request()),
      (err: unknown) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.failure, 'model_malformed', `${text.slice(0, 40)} was classed ${err.failure}`);
        return true;
      },
    );
  }
});

test('an image past the inline ceiling is refused before a socket is opened', async () => {
  const transport = fakeTransport({ text: answer() });
  const provider = new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE });
  const tooBig = { bytes: new Uint8Array(MAX_INLINE_IMAGE_BYTES + 1), mediaType: 'image/jpeg' as const };

  await assert.rejects(
    () => provider.send(request({ images: [tooBig] })),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.failure, 'model_client_error');
      assert.match(err.message, /inline limit/);
      return true;
    },
  );
  assert.equal(transport.calls.length, 0, 'an oversized image still reached the wire');
});

test('no key is our misconfiguration, classed as a client error, and never reaches a socket', async () => {
  await withEnv('GEMINI_API_KEY', undefined, async () => {
    const transport = fakeTransport({ text: answer() });
    const provider = new GeminiProvider({ transport, baseUrl: BASE });
    await assert.rejects(
      () => provider.send(request()),
      (err: unknown) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.failure, 'model_client_error');
        return true;
      },
    );
    assert.equal(transport.calls.length, 0);
  });
});

test('a cache hint is accepted and ignored, because this surface is assumed to have no breakpoint', async () => {
  const transport = fakeTransport({ text: answer() });
  await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request({ cache: 'after_image' }));
  assert.ok(!JSON.stringify(transport.calls[0].body).includes('cache'));
});
