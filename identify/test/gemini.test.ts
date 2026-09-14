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

import {
  Identifier,
  makeProvider,
  resetModelSpend,
  type Provider,
  type ProviderRequest,
} from '../src/model.ts';
import { ProviderError } from '../src/provider.ts';
import {
  GeminiProvider,
  MAX_INLINE_IMAGE_BYTES,
  forGeminiSchema,
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
      { type: 'thought', content: [{ type: 'text', text: 'looking at the label' }] },
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ brand: 'Acme' }) }] },
    ],
    usageMetadata: {
      promptTokenCount: 2_600,
      candidatesTokenCount: 180,
      thoughtsTokenCount: 320,
      cachedContentTokenCount: 2_459,
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
 * REWRITTEN 2026-09-14, and the reason is worth keeping.
 *
 * This test first shipped asserting `input_image`, a top-level
 * `thinking_level`, and an `input` of two role-tagged turns. All three were
 * this adapter's own guesses, written from a reverted file rather than from
 * Google, and the test pinned them faithfully. Then the reference was actually
 * read (ai.google.dev/api/interactions-api and the image-understanding page)
 * and all three were wrong: the part type is `image`, the thinking level and
 * the resolution live inside `generation_config`, and `system_instruction` is
 * a top-level string beside a flat `input`.
 *
 * A test holds a claim still. It cannot tell you the claim was true. That is
 * what the documentation is for, and it is why every assumption in the
 * adapter's header carries the date it was checked.
 */
test('the body is the Interactions shape Google documents, image before text', async () => {
  const transport = fakeTransport({ text: answer() });
  await new GeminiProvider({ apiKey: 'k', transport, baseUrl: BASE }).send(request());

  const body = transport.calls[0].body;
  assert.equal(body.model, 'gemini-3.8-flash');
  // `system_instruction` is its own top-level string, not a turn inside `input`.
  assert.equal(body.system_instruction, 'shared prefix');
  const gen = body.generation_config as Record<string, unknown>;
  assert.equal(gen.thinking_level, 'low');
  assert.equal(gen.media_resolution, 'media_resolution_medium');
  assert.equal(body.thinking_level, undefined, 'the thinking level must not also sit at the top level');
  assert.deepEqual(body.response_format, {
    type: 'text',
    mime_type: 'application/json',
    schema: { type: 'OBJECT' },
  });

  const input = body.input as Record<string, unknown>[];
  // A FLAT array of parts, not role-tagged turns. Render order is still
  // load-bearing: `model.ts`'s cache lever needs the pass-specific instruction
  // to sit AFTER the image.
  assert.equal(input.length, 2);
  assert.equal(input[0].type, 'image');
  assert.equal(input[0].mime_type, 'image/jpeg');
  assert.equal(input[0].data, Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'));
  assert.equal(input[0].resolution, undefined, 'the resolution hint belongs in generation_config');
  assert.equal(input[1].type, 'text');
  assert.equal(input[1].text, 'the pass-specific instruction');
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

test('a nullable string becomes an uppercase type plus nullable, and additionalProperties is dropped', () => {
  assert.deepEqual(
    forGeminiSchema({ type: ['string', 'null'], description: 'the brand' }),
    { type: 'STRING', description: 'the brand', nullable: true },
  );
  assert.deepEqual(
    forGeminiSchema({ type: 'object', additionalProperties: false, properties: { a: { type: 'integer' } } }),
    { type: 'OBJECT', properties: { a: { type: 'INTEGER' } } },
  );
});

test('a nullable enum drops the null member and says nullable instead', () => {
  assert.deepEqual(
    forGeminiSchema({ type: ['string', 'null'], enum: ['g', 'ml', null] }),
    { type: 'STRING', enum: ['g', 'ml'], nullable: true },
  );
});

test('nesting is translated all the way down, and a property literally named type survives', () => {
  const translated = forGeminiSchema({
    type: 'object',
    properties: {
      // A field called `type` is DATA. If the walker read property names as
      // keywords this would come back uppercased into nonsense.
      type: { type: ['string', 'null'] },
      alternates: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: false },
      },
    },
  }) as Record<string, unknown>;

  assert.deepEqual(translated, {
    type: 'OBJECT',
    properties: {
      type: { type: 'STRING', nullable: true },
      alternates: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: { name: { type: 'STRING' } } },
      },
    },
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
  const transport = fakeTransport({ text: answer({ usageMetadata: undefined }) });
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

/* ------------------------------------------------------- the model.ts wiring */

/** Sets several variables at once and puts every one of them back afterwards. */
async function withVars(vars: Record<string, string | undefined>, body: () => Promise<void>): Promise<void> {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetModelSpend();
  try {
    await body();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetModelSpend();
  }
}

test('named gemini with a key, the seam is Gemini with Claude standing behind it', async () => {
  await withVars(
    { SHIN_MODEL_PROVIDER: 'gemini', GEMINI_API_KEY: 'g-key', ANTHROPIC_API_KEY: 'a-key' },
    async () => {
      assert.equal(makeProvider().name, 'gemini+fallback:anthropic');
    },
  );
});

test('named gemini with NO key, the seam is Anthropic unchanged, byte for byte', async () => {
  // A machine with the setting and not the secret is a machine mid-rollout, and
  // the worst thing to hand it is a provider that refuses every scan.
  await withVars(
    { SHIN_MODEL_PROVIDER: 'gemini', GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: 'a-key' },
    async () => {
      assert.equal(makeProvider().name, 'anthropic');
    },
  );
});

/** A provider that answers every pass with the same low-confidence reading, and counts the models asked for. */
function countingProvider(): Provider & { models: string[] } {
  const provider = {
    name: 'fake',
    models: [] as string[],
    async send<T>(request: ProviderRequest) {
      provider.models.push(request.model);
      return {
        value: LOW_CONFIDENCE_FIELDS as unknown as T,
        usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: null, cacheCreationTokens: null },
        provider: 'fake',
        model: request.model,
      };
    },
  };
  return provider;
}

const LOW_CONFIDENCE_FIELDS = {
  front_text: ['ACME'],
  barcode_digits: null,
  brand: 'Acme',
  name: 'Widget',
  variant: null,
  size_value: null,
  size_unit: null,
  count: null,
  category: null,
  language_seen: 'en',
  alternates: [],
  self_confidence: 'low',
  uncertainty: null,
};

test('cheap-first escalation is ON by default under gemini: a low answer is re-read on the bigger model', async () => {
  await withVars({ SHIN_MODEL_PROVIDER: 'gemini', SHIN_MODEL_ESCALATE: undefined }, async () => {
    const provider = countingProvider();
    await new Identifier(undefined, undefined, provider).read(new Uint8Array([1]), null, 'basic');
    // The tier table's own names, translated to Gemini ids by `geminiModelFor`
    // at the wire: the cheap model first, then the bigger one.
    assert.deepEqual(provider.models, ['claude-haiku-4-5', 'claude-sonnet-5']);
    assert.deepEqual(provider.models.map(geminiModelFor), ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  });
});

test('nothing was ruled for Anthropic, so an environment that never heard of Gemini escalates exactly as before', async () => {
  await withVars({ SHIN_MODEL_PROVIDER: '', SHIN_MODEL_ESCALATE: undefined }, async () => {
    const provider = countingProvider();
    await new Identifier(undefined, undefined, provider).read(new Uint8Array([1]), null, 'basic');
    assert.deepEqual(provider.models, ['claude-haiku-4-5']);
  });
});

test('SHIN_MODEL_ESCALATE wins in both directions, which is why a plain flag read would not do', async () => {
  await withVars({ SHIN_MODEL_PROVIDER: 'gemini', SHIN_MODEL_ESCALATE: '0' }, async () => {
    const provider = countingProvider();
    await new Identifier(undefined, undefined, provider).read(new Uint8Array([1]), null, 'basic');
    assert.deepEqual(provider.models, ['claude-haiku-4-5'], 'an explicit 0 did not turn escalation off');
  });
  await withVars({ SHIN_MODEL_PROVIDER: '', SHIN_MODEL_ESCALATE: '1' }, async () => {
    const provider = countingProvider();
    await new Identifier(undefined, undefined, provider).read(new Uint8Array([1]), null, 'basic');
    assert.equal(provider.models.length, 2, 'an explicit 1 did not turn escalation on');
  });
});
