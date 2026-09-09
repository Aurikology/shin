/**
 * Tests for the model call policy, added 2026-09-08.
 *
 * The beta readiness audit found three things about this path at once: no
 * timeout, no retry policy and no spending cap anywhere in it, and every
 * failure reaching the user as the identical sentence, so that an outage
 * during a beta would have been indistinguishable from bad photographs in the
 * data. These tests pin the policy that answers all three.
 *
 * Every test here still fakes the model, and says so out loud, because the
 * audit's other finding on this path is that none of its tests send a real
 * photo through the real API. That is a separate gap and this file does not
 * close it; what it does close is that the failure handling was never
 * exercised at all, in any form. A fake client is the correct instrument for
 * "a 429 followed by a success" specifically because you cannot ask the real
 * API for one on demand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Identifier,
  ModelCallError,
  modelSpend,
  resetModelSpend,
  selfConfidenceNumber,
  type MessagesClient,
  mediaTypeOf,
} from '../src/model.ts';

const FIELDS = JSON.stringify({
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
});

/** A successful message in the shape the SDK returns one. */
function answer(text = FIELDS): unknown {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
}

/** An HTTP failure in the shape the SDK throws one: an Error carrying a status. */
function httpError(status: number): Error {
  const err = new Error(`http ${status}`);
  (err as Error & { status: number }).status = status;
  return err;
}

/**
 * A client built from a script of responses, one per call.
 *
 * `calls` is the assertion that matters in most of these tests: the retry
 * policy is only observable as how many times the wire was actually touched.
 */
function scripted(steps: (() => Promise<unknown>)[]): MessagesClient & { calls: number } {
  const client = {
    calls: 0,
    messages: {
      async create(): Promise<never> {
        const step = steps[client.calls] ?? steps[steps.length - 1];
        client.calls += 1;
        return (await step()) as never;
      },
    },
  };
  return client as unknown as MessagesClient & { calls: number };
}

/** Puts the environment back however the test found it. */
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

async function failure(fn: () => Promise<unknown>): Promise<ModelCallError> {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof ModelCallError, `expected a ModelCallError, got ${String(err)}`);
    return err;
  }
  assert.fail('the call was expected to fail and did not');
}

test('a call that does not come back inside the budget is a timeout, not a bad photo', async () => {
  await withEnv({ SHIN_MODEL_TIMEOUT_MS: '25' }, async () => {
    const client = scripted([() => new Promise((resolve) => setTimeout(() => resolve(answer()), 400))]);
    const err = await failure(() => new Identifier(undefined, client).read(new Uint8Array(), null, 'basic'));

    assert.equal(err.failure, 'model_timeout');
    // Not retried on purpose: one attempt has already spent the whole p99
    // budget, so the second would be answering a screen nobody is watching.
    assert.equal(client.calls, 1, 'a timeout must not be retried');
  });
});

test('a rate limit is retried once and the second attempt is the answer', async () => {
  await withEnv({}, async () => {
    const client = scripted([
      () => Promise.reject(httpError(429)),
      () => Promise.resolve(answer()),
    ]);
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');

    assert.equal(client.calls, 2, '429 is transient and must be tried again');
    assert.equal(reading.product.brand, 'Acme');
    assert.equal(reading.model, 'claude-haiku-4-5');
  });
});

test('an outage is retried and a run of them still ends as an outage, not a photo problem', async () => {
  await withEnv({}, async () => {
    const client = scripted([() => Promise.reject(httpError(503))]);
    const err = await failure(() => new Identifier(undefined, client).read(new Uint8Array(), null, 'basic'));

    assert.equal(err.failure, 'model_outage');
    assert.equal(client.calls, 2, 'a 5xx gets exactly one more try');
  });
});

test('a 400 is our own bad request and is never sent twice', async () => {
  await withEnv({}, async () => {
    const client = scripted([() => Promise.reject(httpError(400))]);
    const err = await failure(() => new Identifier(undefined, client).read(new Uint8Array(), null, 'basic'));

    assert.equal(err.failure, 'model_client_error');
    assert.equal(client.calls, 1, 'a malformed request repeated is money spent to be told so twice');
  });
});

test('an answer that will not parse is malformed, which is neither the wire nor the photo', async () => {
  await withEnv({}, async () => {
    const client = scripted([() => Promise.resolve(answer('{"brand": "Acme", oops'))]);
    const err = await failure(() => new Identifier(undefined, client).read(new Uint8Array(), null, 'basic'));

    assert.equal(err.failure, 'model_malformed');
    assert.equal(client.calls, 1, 'the same prompt again is a coin flip billed twice');
  });
});

test('a model refusal is the one failure that really is about the photograph', async () => {
  await withEnv({}, async () => {
    const client = scripted([() => Promise.resolve({ stop_reason: 'refusal', content: [] })]);
    const err = await failure(() => new Identifier(undefined, client).read(new Uint8Array(), null, 'basic'));

    assert.equal(err.failure, 'unreadable_photo');
  });
});

test('the cap refuses the call after the last one it allows', async () => {
  await withEnv({ SHIN_MODEL_DAILY_CALLS: '2' }, async () => {
    const client = scripted([() => Promise.resolve(answer())]);
    const identifier = new Identifier(undefined, client);

    await identifier.read(new Uint8Array(), null, 'basic');
    await identifier.read(new Uint8Array(), null, 'basic');
    assert.equal(modelSpend().calls, 2);

    const err = await failure(() => identifier.read(new Uint8Array(), null, 'basic'));
    assert.equal(err.failure, 'spend_cap_reached');
    assert.equal(client.calls, 2, 'the cap has to refuse before the socket opens, not after');
  });
});

test('a shelf tag is a second call and the cap counts it', async () => {
  await withEnv({ SHIN_MODEL_DAILY_CALLS: '10' }, async () => {
    const tag = JSON.stringify({
      regular_cents: 499,
      promotional_cents: null,
      member_cents: null,
      unit_price_text: '$1.00 / 100 g',
      limit: null,
      currency: 'CAD',
    });
    const client = scripted([() => Promise.resolve(answer()), () => Promise.resolve(answer(tag))]);
    const reading = await new Identifier(undefined, client).read(new Uint8Array(), new Uint8Array(), 'pro');

    assert.equal(client.calls, 2);
    assert.equal(reading.tag?.regular_cents, 499);
    assert.equal(modelSpend().calls, 2, 'both calls are billed, so both are counted');
  });
});

/**
 * The vocabulary is copied into two other packages that do not import this one
 * (spine/src/run.ts and app/src/scans.ts, both say so in their own comments).
 * A copy nothing checks is a copy that drifts, so this checks it.
 */
test('every failure class exists in the two files that restate it', () => {
  const here = import.meta.dirname;
  const source = readFileSync(join(here, '..', 'src', 'model.ts'), 'utf8');
  const union = source.slice(source.indexOf('export type FailureClass ='));
  const classes = [...union.slice(0, union.indexOf(';')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(classes.length >= 6, `expected the union to be found, read ${classes.length} members`);

  for (const relative of [['..', '..', 'spine', 'src', 'run.ts'], ['..', '..', 'app', 'src', 'scans.ts']]) {
    const text = readFileSync(join(here, ...relative), 'utf8');
    for (const name of classes) {
      assert.ok(text.includes(`'${name}'`), `${relative.join('/')} is missing the class ${name}`);
    }
  }
});

/*
 * ------------------------------------------------------------------------
 * The two-pass path, added 2026-09-09 (docs/the-photo-path.md section 2).
 * Still a fake client, for the reason this file's header already gives.
 * ------------------------------------------------------------------------
 */

/** A client that keeps every request body, so the prompt itself can be asserted. */
function recording(text: string): MessagesClient & { bodies: Record<string, unknown>[] } {
  const client = {
    bodies: [] as Record<string, unknown>[],
    messages: {
      async create(body: Record<string, unknown>): Promise<unknown> {
        client.bodies.push(body);
        return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
      },
    },
  };
  return client as unknown as MessagesClient & { bodies: Record<string, unknown>[] };
}

function schemaOf(body: Record<string, unknown>): {
  required: string[];
  properties: Record<string, { enum?: unknown[] }>;
} {
  const config = body.output_config as { format: { schema: unknown } };
  return config.format.schema as {
    required: string[];
    properties: Record<string, { enum?: unknown[] }>;
  };
}

test('the extract pass asks for the transcription before it asks for a brand', async () => {
  await withEnv({}, async () => {
    const client = recording(FIELDS);
    await new Identifier(undefined, client).read(new Uint8Array(), null, 'basic');

    const schema = schemaOf(client.bodies[0]);
    assert.equal(schema.required[0], 'front_text', 'front_text has to be generated first');
    assert.ok(schema.properties.front_text, 'the schema must request front_text at all');
    assert.ok(schema.properties.barcode_digits, 'the schema must request barcode_digits');
    assert.ok(
      schema.required.indexOf('front_text') < schema.required.indexOf('brand'),
      'transcription before interpretation is the whole change',
    );
    assert.deepEqual(
      schema.properties.self_confidence.enum,
      ['high', 'medium', 'low'],
      'the self-report is three words now, not an invented probability',
    );
  });
});

test('the model answering in words becomes the number the six signals expect', () => {
  assert.equal(selfConfidenceNumber('high'), 0.9);
  assert.equal(selfConfidenceNumber('medium'), 0.6);
  assert.equal(selfConfidenceNumber('low'), 0.3);
  // A model that ignores the enum, or an older fixture, is honoured rather than
  // silently scored zero.
  assert.equal(selfConfidenceNumber(0.42), 0.42);
  assert.equal(selfConfidenceNumber(null), 0.3, 'nothing readable is not confidence');
});

const PICK_ANSWER = JSON.stringify({
  chosen_index: 1,
  confidence: 'high',
  why: 'the pack says Smooth and row 1 is the smooth one',
  size_question: null,
});

test('the pick pass runs on Sonnet for both tiers and sends the rows as compact JSON', async () => {
  await withEnv({}, async () => {
    const client = recording(PICK_ANSWER);
    const rows = [
      { index: 0, code: 'C0', brand: 'Acme', name: 'Widget', size: '250 g', category: 'widgets' },
      { index: 1, code: 'C1', brand: 'Acme', name: 'Widget', size: '500 g', category: 'widgets' },
    ];
    const basic = await new Identifier(undefined, client).pick(new Uint8Array(), rows, 'basic');
    const pro = await new Identifier(undefined, client).pick(new Uint8Array(), rows, 'pro');

    assert.equal(basic.model, 'claude-sonnet-5', 'the pick is where the precision comes from');
    assert.equal(pro.model, 'claude-sonnet-5');
    assert.equal(basic.pick.chosen_index, 1);

    const schema = schemaOf(client.bodies[0]);
    assert.deepEqual(schema.required, ['chosen_index', 'confidence', 'why', 'size_question']);

    const content = (client.bodies[0].messages as { content: { type: string; text?: string }[] }[])[0]
      .content;
    assert.equal(content[0].type, 'image', 'the pick sees the same photograph');
    assert.match(content[1].text ?? '', /"code":"C1"/, 'the rows travel as JSON, not as prose');
  });
});

test('SHIN_MODEL_PICK overrides the pick model without touching the extract model', async () => {
  await withEnv({ SHIN_MODEL_PICK: 'claude-haiku-4-5' }, async () => {
    const client = recording(PICK_ANSWER);
    const reading = await new Identifier(undefined, client).pick(new Uint8Array(), [], 'pro');
    assert.equal(reading.model, 'claude-haiku-4-5');
  });
});

test('the pick has its own clock and it is not the extract clock', async () => {
  await withEnv({ SHIN_MODEL_PICK_TIMEOUT_MS: '25', SHIN_MODEL_TIMEOUT_MS: '60000' }, async () => {
    const client = scripted([
      () => new Promise((resolve) => setTimeout(() => resolve(answer(PICK_ANSWER)), 400)),
    ]);
    const err = await failure(() => new Identifier(undefined, client).pick(new Uint8Array(), [], 'pro'));
    assert.equal(err.failure, 'model_timeout');
    assert.equal(client.calls, 1, 'a timeout is not retried on either pass');
  });
});

test('the pick is billed like any other call and the cap counts it', async () => {
  await withEnv({ SHIN_MODEL_DAILY_CALLS: '2' }, async () => {
    const client = scripted([() => Promise.resolve(answer(FIELDS)), () => Promise.resolve(answer(PICK_ANSWER))]);
    const identifier = new Identifier(undefined, client);

    await identifier.read(new Uint8Array(), null, 'pro');
    await identifier.pick(new Uint8Array(), [], 'pro');
    assert.equal(modelSpend().calls, 2, 'two vision calls is two calls against the day');

    const err = await failure(() => identifier.pick(new Uint8Array(), [], 'pro'));
    assert.equal(err.failure, 'spend_cap_reached');
    assert.equal(client.calls, 2, 'the cap refuses the pick before the socket opens');
  });
});

test('a missing key is our misconfiguration, classed as a client error and never retried', async () => {
  let calls = 0;
  const client = {
    messages: {
      create: async () => {
        calls += 1;
        throw Object.assign(new Error('Could not resolve authentication method. Expected either apiKey or authToken to be set.'), { name: 'AnthropicError' });
      },
    },
  } as unknown as MessagesClient;
  const id = new Identifier(undefined, client);
  await assert.rejects(id.read(new Uint8Array(), null, 'pro'), (e: unknown) => e instanceof ModelCallError && e.failure === 'model_client_error');
  assert.equal(calls, 1, 'no second attempt against the same empty environment');
});

test('the media type on the wire is sniffed from the bytes, so a JPEG is not sent as a PNG', () => {
  assert.equal(mediaTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(mediaTypeOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'image/png');
  assert.equal(mediaTypeOf(new Uint8Array()), 'image/png');
});
