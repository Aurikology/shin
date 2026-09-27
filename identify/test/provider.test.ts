/**
 * The price table in `provider.ts`.
 *
 * 2026-09-19: the prompt-lever tests this file used to hold (added
 * 2026-09-13, beta plan items 22 and 21 -- caching, output ceilings,
 * cheap-first escalation, and the `Identifier`/`makeProvider` seam they ran
 * through) went with the two-pass `Identifier` they exercised. Every scan is
 * one Gemini call now (`identify/src/providers/gemini-scan.ts`), which never
 * builds an `Identifier` and never calls `makeProvider`.
 *
 * WHAT STAYS: the price table itself. `claude-haiku-4-5`/`claude-sonnet-5`/
 * `claude-opus-5` are still the internal tier names `gemini.ts` and
 * `describe.ts` map their own models onto (see `identify/src/providers/gemini.ts`'s
 * `GEMINI_FOR`), so a call still gets billed against these rows even though it
 * never reaches Anthropic. (The xAI adapter these tier names also fed, `xai.ts`,
 * was removed 2026-09-27: it was never wired into any provider seam and never
 * ran against a real key.)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LIST_PRICES_USD_PER_MTOK, NO_USAGE, addUsage, costUsd } from '../src/provider.ts';

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
