/**
 * The provider seam and the four prompt levers. Added 2026-09-13, beta plan
 * items 22 and 21.
 *
 * WHAT THESE TESTS ARE AND ARE NOT. Every one of them runs against a fake
 * client, the same instrument `model.test.ts`'s header defends: you cannot ask a
 * real API for a 429 on demand, and you certainly cannot ask it to prove that a
 * lever is OFF. What they establish is that the request this repo builds is the
 * request it believes it builds, and that with an empty environment it is byte
 * for byte the request that went out before any of this existed.
 *
 * WHAT THEY ESTABLISH ABOUT COST OR CACHING: NOTHING. A cache hit is visible
 * only as a non-zero `cache_read_input_tokens` from a real provider, and there
 * is no key on this machine. The cache tests below assert the SHAPE of the
 * request -- one shared system prefix, one breakpoint, the pass-specific text
 * after the image -- which is the precondition for a hit, not evidence of one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Identifier,
  ModelCallError,
  resetModelSpend,
  type MessagesClient,
  type Provider,
  type ProviderRequest,
} from '../src/model.ts';
import { LIST_PRICES_USD_PER_MTOK, NO_USAGE, addUsage, costUsd } from '../src/provider.ts';

const FIELDS = {
  front_text: ['ACME', 'Widget', '500 g'],
  barcode_digits: null,
  brand: 'Acme',
  name: 'Widget',
  variant: null,
  size_value: 500,
  size_unit: 'g',
  count: null,
  category: null,
  language_seen: 'en',
  alternates: [],
  self_confidence: 'medium',
  uncertainty: null,
};

const TAG = {
  regular_cents: 499,
  promotional_cents: null,
  member_cents: null,
  unit_price_text: null,
  limit: null,
  currency: 'CAD',
};

const PICK = { chosen_index: 1, confidence: 'high', why: 'the pack says Smooth', size_question: null };

interface Body {
  model: string;
  max_tokens: number;
  system: string;
  messages: { content: { type: string; text?: string; cache_control?: unknown }[] }[];
}

/**
 * A recording Anthropic-shaped client that can also report usage.
 *
 * `usage` is the shape the SDK actually returns one in. A client built without
 * it stands in for every fake in this package today, which is why the
 * "undefined, not zero" assertions below are worth having.
 */
function recording(
  answers: unknown[],
  usage?: Record<string, number>,
): MessagesClient & { bodies: Body[] } {
  const client = {
    bodies: [] as Body[],
    messages: {
      async create(body: Body): Promise<unknown> {
        const answer = answers[client.bodies.length] ?? answers[answers.length - 1];
        client.bodies.push(body);
        return {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(answer) }],
          ...(usage ? { usage } : {}),
        };
      },
    },
  };
  return client as unknown as MessagesClient & { bodies: Body[] };
}

function withEnv(vars: Record<string, string>, run: () => Promise<void>): Promise<void> {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    process.env[k] = v;
  }
  resetModelSpend();
  return run().finally(() => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetModelSpend();
  });
}

function imageBlock(body: Body) {
  return body.messages[0].content[0];
}

function userText(body: Body): string {
  return body.messages[0].content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
}

/* ------------------------------------------------------------ the seam itself */

test('a Provider can be handed straight in, and it is the only thing model.ts talks to', async () => {
  await withEnv({}, async () => {
    const seen: ProviderRequest[] = [];
    const provider: Provider = {
      name: 'fake',
      async send<T>(request: ProviderRequest) {
        seen.push(request);
        return {
          value: FIELDS as unknown as T,
          usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: null, cacheCreationTokens: null },
          provider: 'fake',
          model: request.model,
        };
      },
    };

    const reading = await new Identifier(undefined, undefined, provider).read(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      null,
      'basic',
    );

    assert.equal(reading.product.brand, 'Acme');
    assert.equal(seen.length, 1);
    // The neutral request, not an Anthropic body: bytes and a media type, a
    // system string, a user string, a schema, a ceiling and a signal.
    assert.equal(seen[0].images.length, 1);
    assert.equal(seen[0].images[0].mediaType, 'image/png');
    assert.equal(seen[0].schema.name, 'product_identity');
    assert.equal(typeof seen[0].system, 'string');
    assert.ok(seen[0].signal instanceof AbortSignal, 'the clock reaches the provider as a signal');
  });
});

test('a provider failure keeps its class on the way through #send, and 429 is still retried once', async () => {
  await withEnv({}, async () => {
    let calls = 0;
    const provider: Provider = {
      name: 'fake',
      async send<T>(request: ProviderRequest) {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('slow down'), { status: 429 });
        return {
          value: FIELDS as unknown as T,
          usage: NO_USAGE,
          provider: 'fake',
          model: request.model,
        };
      },
    };
    const reading = await new Identifier(undefined, undefined, provider).read(new Uint8Array(), null, 'basic');
    assert.equal(calls, 2, 'the retry policy lives in model.ts and applies to any provider');
    assert.equal(reading.product.brand, 'Acme');
  });
});

/* ------------------------------------------------------------- usage capture */

test('usage is off by default, and off means absent rather than zero', async () => {
  await withEnv({}, async () => {
    const client = recording([FIELDS], { input_tokens: 2600, output_tokens: 180 });
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');
    assert.equal(reading.usage, undefined, 'nothing reads usage unless the lever is on');
  });
});

test('with the lever on, the provider\'s own token counts come back and the tag call is added in', async () => {
  await withEnv({ SHIN_MODEL_USAGE: '1' }, async () => {
    const client = recording([FIELDS, TAG], {
      input_tokens: 2600,
      output_tokens: 180,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 2459,
    });
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), new Uint8Array(), 'pro');

    assert.equal(reading.usage?.inputTokens, 5200, 'two calls, both counted');
    assert.equal(reading.usage?.outputTokens, 360);
    assert.equal(reading.usage?.cacheReadTokens, 0, 'a reported zero is a measurement and is kept as one');
    assert.equal(reading.usage?.cacheCreationTokens, 4918);
  });
});

test('a provider that reports nothing reports four nulls, which is not four zeroes', async () => {
  await withEnv({ SHIN_MODEL_USAGE: '1' }, async () => {
    const client = recording([FIELDS]);
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');
    assert.deepEqual(reading.usage, NO_USAGE);
    assert.equal(
      costUsd('claude-haiku-4-5', reading.usage!),
      null,
      'a usage record with no counts in it cannot be priced, and must not be priced at zero',
    );
  });
});

test('the pick pass reports its own usage too', async () => {
  await withEnv({ SHIN_MODEL_USAGE: '1' }, async () => {
    const client = recording([PICK], { input_tokens: 2700, output_tokens: 40 });
    const picked = await new Identifier(undefined, client).pick(new Uint8Array(), [], 'pro');
    assert.equal(picked.usage?.inputTokens, 2700);
    assert.equal(picked.usage?.outputTokens, 40);
  });
});

/* ------------------------------------------------------------ prompt caching */

test('with the cache lever off the two passes send exactly the prompts they always sent', async () => {
  await withEnv({}, async () => {
    const client = recording([FIELDS, PICK]);
    const id = new Identifier(undefined, client);
    await id.read(new Uint8Array(), null, 'pro');
    await id.pick(new Uint8Array(), [], 'pro');

    assert.notEqual(client.bodies[0].system, client.bodies[1].system, 'two prompts, as before');
    assert.match(client.bodies[0].system, /Transcribe first, reason second/);
    assert.match(client.bodies[1].system, /numbered\s+list of candidate rows/);
    assert.equal(userText(client.bodies[0]), 'Identify this product.');
    assert.equal(imageBlock(client.bodies[0]).cache_control, undefined, 'no breakpoint is sent');
  });
});

test('with the cache lever on both passes share one system prefix and one breakpoint sits on the image', async () => {
  await withEnv({ SHIN_MODEL_PROMPT_CACHE: '1' }, async () => {
    const client = recording([FIELDS, PICK]);
    const id = new Identifier(undefined, client);
    await id.read(new Uint8Array(), null, 'pro');
    await id.pick(
      new Uint8Array(),
      [{ index: 0, code: 'C0', brand: 'Acme', name: 'Widget', size: '500 g', category: null }],
      'pro',
    );

    const [extract, pick] = client.bodies;
    assert.equal(
      extract.system,
      pick.system,
      'byte-identical or the prefix diverges before the image and the breakpoint hits nothing',
    );

    for (const body of [extract, pick]) {
      const image = imageBlock(body);
      assert.equal(image.type, 'image', 'the image is still the first block in the turn');
      assert.deepEqual(image.cache_control, { type: 'ephemeral' }, 'exactly one breakpoint, on the image');
      assert.equal(
        body.messages[0].content.filter((b) => b.cache_control !== undefined).length,
        1,
        'one breakpoint, not one per block',
      );
    }

    // The pass-specific instruction moved behind the image, which is the whole
    // mechanism: everything before the breakpoint is shared, everything after it
    // is the part that differs.
    assert.match(userText(extract), /Transcribe first, reason second/);
    assert.match(userText(pick), /chosen_index is null/);
    assert.doesNotMatch(extract.system, /Transcribe first, reason second/);
    assert.doesNotMatch(pick.system, /chosen_index/);
    // The rows still travel as JSON and still travel last.
    assert.match(userText(pick), /"code":"C0"/);
  });
});

/* -------------------------------------------------------------- output caps */

test('the output ceilings are the numbers they have always been, and each is tunable', async () => {
  await withEnv({}, async () => {
    const client = recording([FIELDS, TAG, PICK]);
    const id = new Identifier(undefined, client);
    await id.read(new Uint8Array(), new Uint8Array(), 'pro');
    await id.pick(new Uint8Array(), [], 'pro');
    assert.equal(client.bodies[0].max_tokens, 1024, 'extract');
    assert.equal(client.bodies[1].max_tokens, 512, 'tag');
    assert.equal(client.bodies[2].max_tokens, 512, 'pick');
  });

  await withEnv(
    {
      SHIN_MODEL_MAX_TOKENS_EXTRACT: '256',
      SHIN_MODEL_MAX_TOKENS_TAG: '128',
      SHIN_MODEL_MAX_TOKENS_PICK: '64',
    },
    async () => {
      const client = recording([FIELDS, TAG, PICK]);
      const id = new Identifier(undefined, client);
      await id.read(new Uint8Array(), new Uint8Array(), 'pro');
      await id.pick(new Uint8Array(), [], 'pro');
      assert.equal(client.bodies[0].max_tokens, 256);
      assert.equal(client.bodies[1].max_tokens, 128);
      assert.equal(client.bodies[2].max_tokens, 64);
    },
  );
});

/* ---------------------------------------------------------- cheap-first escalation */

const UNSURE = { ...FIELDS, self_confidence: 'low', brand: 'Acne' };

test('an unconfident basic read is NOT escalated unless the lever is on', async () => {
  await withEnv({}, async () => {
    const client = recording([UNSURE]);
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');
    assert.equal(client.bodies.length, 1, 'one call, the way it has always been');
    assert.equal(reading.model, 'claude-haiku-4-5');
  });
});

test('with the lever on, a low basic read is re-asked of the pro model and that answer wins', async () => {
  await withEnv({ SHIN_MODEL_ESCALATE: '1' }, async () => {
    const client = recording([UNSURE, FIELDS]);
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');

    assert.equal(client.bodies.length, 2);
    assert.equal(client.bodies[0].model, 'claude-haiku-4-5', 'cheap first');
    assert.equal(client.bodies[1].model, 'claude-sonnet-5', 'then, and only then, the dearer one');
    assert.equal(reading.product.brand, 'Acme', "the escalated read is the one that ships");
    assert.equal(reading.model, 'claude-sonnet-5', 'the reading names the model that actually answered');
  });
});

test('escalation fires on low only, and never from the pro tier, which has nothing above it', async () => {
  await withEnv({ SHIN_MODEL_ESCALATE: '1' }, async () => {
    const medium = recording([FIELDS]);
    await new Identifier(undefined, medium).read(new Uint8Array(), null, 'basic');
    assert.equal(medium.bodies.length, 1, 'medium is not a reason to spend a second call');

    const pro = recording([UNSURE]);
    await new Identifier(undefined, pro).read(new Uint8Array(), null, 'pro');
    assert.equal(pro.bodies.length, 1, 'pro has nowhere to escalate to');
  });
});

test('an escalation that fails leaves the cheap answer standing, because priority 1 is always answer', async () => {
  await withEnv({ SHIN_MODEL_ESCALATE: '1' }, async () => {
    let calls = 0;
    const client = {
      messages: {
        async create(): Promise<unknown> {
          calls += 1;
          if (calls === 1) {
            return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(UNSURE) }] };
          }
          throw Object.assign(new Error('http 500'), { status: 500 });
        },
      },
    } as unknown as MessagesClient;

    const reading = await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');
    assert.equal(reading.product.brand, 'Acne', 'the unconfident reading is still an answer');
    assert.equal(reading.model, 'claude-haiku-4-5');
    assert.ok(calls >= 2, 'the escalation was attempted');
  });
});

test('an escalated call is a real call and the daily cap counts it', async () => {
  await withEnv({ SHIN_MODEL_ESCALATE: '1', SHIN_MODEL_DAILY_CALLS: '1' }, async () => {
    const client = recording([UNSURE, FIELDS]);
    // One call allowed: the extract spends it, the escalation is refused, and
    // the cheap answer still ships.
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');
    assert.equal(client.bodies.length, 1, 'the cap refuses before the socket opens, on the second call too');
    assert.equal(reading.product.self_confidence, 'low');
  });
});

/* -------------------------------------------------------------- the price list */

test('the price table prices a measured call and refuses to price an unmeasured one', () => {
  const usage = {
    inputTokens: 2_459,
    outputTokens: 200,
    cacheReadTokens: null,
    cacheCreationTokens: null,
  };
  // Sonnet 5 at $2 / $10 per million: 2459 * 2e-6 + 200 * 10e-6.
  assert.equal(costUsd('claude-sonnet-5', usage), 2_459 * 2e-6 + 200 * 10e-6);
  // Haiku at $1 / $5 is exactly half of it, which is the only cross-check this
  // table can give itself without an invoice.
  assert.equal(costUsd('claude-haiku-4-5', usage), (2_459 * 2e-6 + 200 * 10e-6) / 2);
  assert.equal(costUsd('grok-4', usage), null, 'no row means unknown, never zero');
  assert.equal(costUsd('claude-sonnet-5', NO_USAGE), null);
});

test('a cache read is priced at a tenth of input and a cache write at one and a quarter', () => {
  const read = costUsd('claude-sonnet-5', { ...NO_USAGE, inputTokens: 0, cacheReadTokens: 1_000_000 });
  const write = costUsd('claude-sonnet-5', { ...NO_USAGE, inputTokens: 0, cacheCreationTokens: 1_000_000 });
  assert.equal(read, 0.2);
  assert.equal(write, 2.5);
});

test('adding usage keeps an absence an absence', () => {
  assert.deepEqual(addUsage(NO_USAGE, NO_USAGE), NO_USAGE);
  assert.equal(addUsage(NO_USAGE, { ...NO_USAGE, inputTokens: 5 }).inputTokens, 5);
  assert.equal(addUsage(NO_USAGE, { ...NO_USAGE, inputTokens: 5 }).outputTokens, null);
});

test('every model the tier tables can name has a row in the price table', () => {
  for (const model of ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5']) {
    assert.ok(LIST_PRICES_USD_PER_MTOK[model], `${model} has no price`);
  }
});

test('the default provider is Gemini and there is no Claude default: an unset environment builds Gemini, or throws', async () => {
  // Beta gap item 1, Jamin 2026-09-19: "Claude should currently not be used
  // anywhere inside shin." This test failed before the change (it asserted an
  // Anthropic default) and fails again if the Anthropic default comes back.
  await withEnv({ GEMINI_API_KEY: 'g-key-for-construction-only', ANTHROPIC_API_KEY: 'a-key' }, async () => {
    assert.equal(process.env.SHIN_MODEL_PROVIDER, undefined);
    const { makeProvider } = await import('../src/model.ts');
    assert.equal(makeProvider('a-key').name, 'gemini');
  });
  await withEnv({ GEMINI_API_KEY: '', ANTHROPIC_API_KEY: 'a-key' }, async () => {
    const { makeProvider } = await import('../src/model.ts');
    assert.throws(() => makeProvider('a-key'), /GEMINI_API_KEY/, 'an Anthropic key must not turn into an answer from Claude');
  });
});

test('an unknown provider name is not silently accepted as a working one', async () => {
  await withEnv({ SHIN_MODEL_PROVIDER: 'xai', XAI_API_KEY: '' }, async () => {
    const id = new Identifier();
    await assert.rejects(
      id.read(new Uint8Array(), null, 'basic'),
      (e: unknown) => e instanceof ModelCallError && e.failure === 'model_client_error',
      'no key for the named provider is our misconfiguration, not an outage',
    );
  });
});
