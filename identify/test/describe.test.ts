/**
 * Tests for item 26's description module, added 2026-09-11.
 *
 * No key exists on this machine (the contract this whole lane works under),
 * so every test here fakes the model, the same instrument
 * `identify/test/model.test.ts` already uses for its own no-real-API
 * constraint. What these tests actually pin is the part that has nothing to
 * do with the model being real or not: the cache, and `verifyDescription`'s
 * refusal to let an added fact through regardless of how it got there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MessagesClient } from '../src/model.ts';
import {
  cachedDescription,
  describeProduct,
  DescriptionCheckError,
  verifyDescription,
  type CatalogueFacts,
  type DescribeOptions,
} from '../src/describe.ts';

const FACTS: CatalogueFacts = {
  name: 'Tomato Ketchup',
  brand: 'Heinz',
  quantity: '750 mL',
  category: 'condiments',
};

function tempOpts(): DescribeOptions {
  const dir = mkdtempSync(join(tmpdir(), 'shin-describe-'));
  return { cachePath: join(dir, 'descriptions.json') };
}

/** A client that answers with a scripted text, once per call, recording how many times it was actually asked. */
function scripted(...answers: string[]): MessagesClient & { calls: number } {
  const client = {
    calls: 0,
    messages: {
      async create(): Promise<never> {
        const text = answers[client.calls] ?? answers[answers.length - 1];
        client.calls += 1;
        return { content: [{ type: 'text', text }] } as never;
      },
    },
  };
  return client as unknown as MessagesClient & { calls: number };
}

test('a description built only from the facts passes the check', () => {
  assert.doesNotThrow(() =>
    verifyDescription('Heinz Tomato Ketchup comes in a 750 mL bottle. It is filed under condiments.', FACTS),
  );
});

test('a number nowhere in the facts fails the check, not the prompt', () => {
  assert.throws(
    () => verifyDescription('Heinz Tomato Ketchup has 40 calories per serving. It comes in a 750 mL bottle.', FACTS),
    (err: unknown) => err instanceof DescriptionCheckError && err.message.includes('40'),
  );
});

test('anything other than exactly two sentences fails the check', () => {
  assert.throws(() => verifyDescription('Heinz Tomato Ketchup.', FACTS), DescriptionCheckError);
  assert.throws(
    () => verifyDescription('Heinz Tomato Ketchup. It comes in 750 mL. Filed under condiments.', FACTS),
    DescriptionCheckError,
  );
});

test('an em dash fails the check on its own, even with the right facts', () => {
  assert.throws(
    () => verifyDescription('Heinz Tomato Ketchup — a 750 mL bottle. Filed under condiments.', FACTS),
    DescriptionCheckError,
  );
});

test('a number that is genuinely in the facts (the quantity) is never mistaken for an added one', () => {
  assert.doesNotThrow(() => verifyDescription('This is 750 mL of Heinz Tomato Ketchup. It is a condiment.', FACTS));
});

test('a fresh call is cached, and the same code and language never call the model twice', async () => {
  const opts = tempOpts();
  const client = scripted('Heinz Tomato Ketchup comes in a 750 mL bottle. It is filed under condiments.');

  const first = await describeProduct('0057000013165', FACTS, 'en', client, opts);
  assert.equal(first.cached, false);
  assert.equal(client.calls, 1);

  const second = await describeProduct('0057000013165', FACTS, 'en', client, opts);
  assert.equal(second.cached, true);
  assert.equal(second.text, first.text);
  assert.equal(client.calls, 1, 'the second call never touched the model');
});

test('the same product in a different language is a different cache entry, and calls the model again', async () => {
  const opts = tempOpts();
  const client = scripted(
    'Heinz Tomato Ketchup comes in a 750 mL bottle. It is filed under condiments.',
    'Le ketchup aux tomates Heinz se vend en bouteille de 750 mL. Il est classe dans les condiments.',
  );

  await describeProduct('0057000013165', FACTS, 'en', client, opts);
  const fr = await describeProduct('0057000013165', FACTS, 'fr', client, opts);

  assert.equal(client.calls, 2);
  assert.equal(fr.language, 'fr');
});

test('a description that fails its own check is never cached, and the error reaches the caller', async () => {
  const opts = tempOpts();
  const client = scripted('Heinz Tomato Ketchup has 40 calories. It comes in a 750 mL bottle.');

  await assert.rejects(() => describeProduct('0057000013165', FACTS, 'en', client, opts), DescriptionCheckError);
  assert.equal(cachedDescription('0057000013165', 'en', FACTS, opts), null, 'a failed check leaves no cache entry');
});

test('changed facts for the same product and language miss the cache rather than serve stale copy', async () => {
  const opts = tempOpts();
  const client = scripted(
    'Heinz Tomato Ketchup comes in a 750 mL bottle. It is filed under condiments.',
    'Heinz Tomato Ketchup comes in a 1 L bottle. It is filed under condiments.',
  );

  await describeProduct('0057000013165', FACTS, 'en', client, opts);
  const changed: CatalogueFacts = { ...FACTS, quantity: '1 L' };
  const second = await describeProduct('0057000013165', changed, 'en', client, opts);

  assert.equal(client.calls, 2, 'a real quantity change is not the same product any cache entry should still answer for');
  assert.ok(second.text.includes('1 L'));
});

test('the cache file itself is JSON, keyed by product and language, readable after a restart', async () => {
  const opts = tempOpts();
  const client = scripted('Heinz Tomato Ketchup comes in a 750 mL bottle. It is filed under condiments.');
  await describeProduct('0057000013165', FACTS, 'en', client, opts);

  const raw = JSON.parse(readFileSync(opts.cachePath!, 'utf8')) as Record<string, unknown>;
  assert.ok('0057000013165::en' in raw, 'keyed by code and language, not by an opaque id');

  // No live process state involved in cachedDescription/describeProduct
  // between calls, so re-reading the same path from a second call IS the
  // after-a-restart case.
  const rehydrated = cachedDescription('0057000013165', 'en', FACTS, opts);
  assert.ok(rehydrated?.cached);
});
