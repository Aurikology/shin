/**
 * `withSpendCapProvider`, which shipped on 2026-09-14 with no coverage at all.
 *
 * `cap.test.ts` covers the older `withSpendCap`, which wraps an
 * Anthropic-shaped `MessagesClient`. This wrapper is the one the live photo
 * route uses now that the Anthropic bypass is gone: it wraps a `Provider`,
 * whoever is behind it. The property that matters is the same one, and it is
 * the sharp one: a capped day must refuse WITHOUT the provider being called,
 * because a cap that refuses after the request went out is a log line rather
 * than a cap.
 *
 * `storePath` and `capCad` are passed explicitly throughout, so this suite
 * never touches `identify/data/spend-cap.json` and a real
 * `SHIN_PHOTO_DAILY_CAP_CAD` left in a developer's shell cannot change what is
 * measured here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ModelCallError } from '../src/model.ts';
import {
  currentSpend,
  estimatedCostCad,
  spendCapRefusalMessage,
  withSpendCapProvider,
  type SpendCapOptions,
} from '../src/cap.ts';
import type { Provider, ProviderRequest, ProviderResponse, TokenUsage } from '../src/provider.ts';

function tempStore(capCad: number): SpendCapOptions {
  const dir = mkdtempSync(join(tmpdir(), 'shin-cap-provider-'));
  return { storePath: join(dir, 'spend-cap.json'), capCad };
}

const USAGE: TokenUsage = {
  inputTokens: null,
  outputTokens: null,
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

function fakeProvider(): Counted {
  const provider: Counted = {
    name: 'gemini',
    calls: 0,
    async send<T>(): Promise<ProviderResponse<T>> {
      provider.calls += 1;
      return { value: { brand: 'Acme' } as T, usage: USAGE, provider: 'gemini', model: 'gemini-3.8-flash' };
    },
  };
  return provider;
}

test('the wrapper keeps the wrapped providers name, so a scan row still says who answered', () => {
  assert.equal(withSpendCapProvider(fakeProvider(), tempStore(10)).name, 'gemini');
});

test('an uncapped day passes straight through and charges the call', async () => {
  const opts = tempStore(10);
  const provider = fakeProvider();
  const response = await withSpendCapProvider(provider, opts).send(request());

  assert.deepEqual(response.value, { brand: 'Acme' });
  assert.equal(provider.calls, 1);
  // Reserve-then-spend: the charge is on disk before the caller was told to go.
  assert.equal(currentSpend(opts).cad, estimatedCostCad());
});

// REWRITTEN 2026-09-19 (audit rows 16 and 32): only the HARD runaway ceiling refuses.
test('a day past the hard ceiling throws spend_cap_reached and the provider is never called', async () => {
  // Soft cap and hard ceiling both zero is a day already past the ceiling: the
  // first call is refused, which is the state being tested without having to
  // spend a thousand fake calls to reach it.
  const opts = tempStore(0);
  const provider = fakeProvider();

  await assert.rejects(
    () => withSpendCapProvider(provider, opts).send(request()),
    (err: unknown) => {
      assert.ok(err instanceof ModelCallError, `expected a ModelCallError, got ${String(err)}`);
      assert.equal(err.failure, 'spend_cap_reached');
      assert.equal(err.message, spendCapRefusalMessage());
      return true;
    },
  );
  assert.equal(provider.calls, 0, 'the cap was reached and the request went out anyway');
});

test('a call past the SOFT cap still goes through and is reported; the one past the HARD ceiling is refused', async () => {
  // One call of headroom exactly under each line, so the boundaries themselves
  // are what is measured rather than numbers comfortably either side of them.
  const reported: boolean[] = [];
  const opts: SpendCapOptions = {
    ...tempStore(estimatedCostCad()),
    hardCapCad: estimatedCostCad() * 2,
    onOverCap: (d) => reported.push(d.allowed),
  };
  const provider = fakeProvider();
  const capped = withSpendCapProvider(provider, opts);

  await capped.send(request());
  assert.equal(provider.calls, 1);
  assert.deepEqual(reported, [], 'inside the soft cap nothing is reported');

  await capped.send(request());
  assert.equal(provider.calls, 2, 'past the soft cap the call still went out');
  assert.deepEqual(reported, [true]);

  await assert.rejects(
    () => capped.send(request()),
    (err: unknown) => {
      assert.ok(err instanceof ModelCallError);
      assert.equal(err.failure, 'spend_cap_reached');
      return true;
    },
  );
  assert.equal(provider.calls, 2, 'the third call was past the hard ceiling and still reached the provider');
});
