/**
 * `withFallback`, which shipped on 2026-09-14 with no coverage at all.
 *
 * WHY THIS FILE EXISTS. `withFallback` is the thing standing between a Gemini
 * outage and a refusal, and it is also the thing standing between the spend cap
 * and a SECOND vendor's invoice. Both of those are decided by one `ReadonlySet`
 * in `provider.ts` with nothing checking it, and a wrong member in that set
 * fails in the direction of spending money quietly rather than crashing loudly.
 * These tests are the check.
 *
 * No network, no Gemini, no Anthropic: the two providers below are plain
 * objects, because `Provider` is a structural interface and the wrapper does
 * not care who is behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ProviderError,
  withFallback,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type TokenUsage,
} from '../src/provider.ts';
import type { FailureClass } from '../src/model.ts';

const USAGE: TokenUsage = {
  inputTokens: 10,
  outputTokens: 2,
  cacheReadTokens: null,
  cacheCreationTokens: null,
};

function request(): ProviderRequest {
  return {
    model: 'claude-sonnet-5',
    images: [{ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' }],
    system: 'system',
    user: 'user',
    schema: { name: 'product_identity', schema: { type: 'object' } },
    maxOutputTokens: 512,
    signal: new AbortController().signal,
  };
}

interface Counted extends Provider {
  calls: number;
}

/** A provider that answers, and says who it was. */
function answering(name: string): Counted {
  const provider: Counted = {
    name,
    calls: 0,
    async send<T>(): Promise<ProviderResponse<T>> {
      provider.calls += 1;
      return { value: { who: name } as T, usage: USAGE, provider: name, model: name + '-model' };
    },
  };
  return provider;
}

/** A provider that fails with one named class, every time. */
function failing(name: string, failure: FailureClass): Counted {
  const provider: Counted = {
    name,
    calls: 0,
    async send<T>(): Promise<ProviderResponse<T>> {
      provider.calls += 1;
      throw new ProviderError(failure, `${name} failed with ${failure}`);
    },
  };
  return provider;
}

/** Runs `body` with console.error captured, and restores it whatever happens. */
async function capturingErrors(body: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const before = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  try {
    await body();
  } finally {
    console.error = before;
  }
  return lines;
}

test('the wrapper names both vendors, so a log line says what it is', () => {
  const wrapped = withFallback(answering('gemini'), answering('anthropic'));
  assert.equal(wrapped.name, 'gemini+fallback:anthropic');
});

test('a primary that succeeds is the only one ever called', async () => {
  const primary = answering('gemini');
  const fallback = answering('anthropic');
  const response = await withFallback(primary, fallback).send(request());

  assert.deepEqual(response.value, { who: 'gemini' });
  assert.equal(response.provider, 'gemini');
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0, 'the fallback was called on a successful primary');
});

test('a retryable primary failure is answered by the fallback, and the answer says who answered', async () => {
  // Every class a second vendor could plausibly fix. `model_client_error` is in
  // here on purpose: a missing GEMINI_API_KEY is exactly the mid-rollout machine
  // the fallback exists for, and it is the one this repo is most likely to meet.
  for (const failure of [
    'model_outage',
    'model_timeout',
    'model_rate_limited',
    'model_malformed',
    'model_client_error',
  ] as FailureClass[]) {
    const primary = failing('gemini', failure);
    const fallback = answering('anthropic');
    const response = await withFallback(primary, fallback).send(request());

    assert.equal(primary.calls, 1);
    assert.equal(fallback.calls, 1, `${failure} did not reach the fallback`);
    // The scan row has to be able to say a Claude model answered rather than
    // pretending to be a Gemini answer that happened to run on Claude's id.
    assert.equal(response.provider, 'anthropic');
    assert.equal(response.model, 'anthropic-model');
  }
});

test('the spend cap does NOT fall back, because spending a second vendor is the cap doing the opposite of its job', async () => {
  const primary = failing('gemini', 'spend_cap_reached');
  const fallback = answering('anthropic');

  await assert.rejects(
    () => withFallback(primary, fallback).send(request()),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.failure, 'spend_cap_reached');
      return true;
    },
  );
  assert.equal(fallback.calls, 0, 'the cap was reached and a second vendor was billed anyway');
});

test('an unreadable photo does NOT fall back, because a thumb is a thumb at both vendors', async () => {
  const primary = failing('gemini', 'unreadable_photo');
  const fallback = answering('anthropic');

  await assert.rejects(
    () => withFallback(primary, fallback).send(request()),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.failure, 'unreadable_photo');
      return true;
    },
  );
  assert.equal(fallback.calls, 0, 'a refused photo was paid for twice');
});

test('both failing throws the fallbacks own error, and the primarys goes to the log', async () => {
  const primary = failing('gemini', 'model_outage');
  const fallback = failing('anthropic', 'model_rate_limited');
  let thrown: unknown;

  const lines = await capturingErrors(async () => {
    try {
      await withFallback(primary, fallback).send(request());
    } catch (err) {
      thrown = err;
    }
  });

  // The fallback's failure is the last thing that actually happened, and it is
  // what model.ts's retry policy has to react to.
  assert.ok(thrown instanceof ProviderError);
  assert.equal(thrown.failure, 'model_rate_limited');
  // The primary's is not swallowed: a Gemini outage that surfaces nowhere is
  // the "an outage looks like bad photos" confusion moved one layer up.
  assert.equal(lines.length, 1);
  assert.match(lines[0], /gemini failed/);
  assert.match(lines[0], /model_outage/);
});

test('an unclassifiable primary failure still falls back, because no status reads as the wire', async () => {
  // A reset socket or a DNS failure arrives with no status and no failure
  // field. `classifyProviderError` calls that `model_outage`, so it is not in
  // the no-second-vendor set and the fallback gets its turn.
  const primary: Counted = {
    name: 'gemini',
    calls: 0,
    async send<T>(): Promise<ProviderResponse<T>> {
      primary.calls += 1;
      throw new Error('socket hang up');
    },
  };
  const fallback = answering('anthropic');
  const response = await withFallback(primary, fallback).send(request());
  assert.equal(response.provider, 'anthropic');
});
