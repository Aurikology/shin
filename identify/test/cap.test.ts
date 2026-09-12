/**
 * Tests for item 13c's dollar cap, added 2026-09-11.
 *
 * "The call before the cap goes through, the call after it is refused, the
 * counter resets at the day boundary" is the exact test the plan item asked
 * for; the three tests below are those three sentences. A fourth covers
 * persistence, because "survives a restart" is the one property a plain
 * in-memory counter (which is what model.ts's own, different, call-count cap
 * uses) cannot have, and it is the whole reason this file exists as a
 * separate store rather than a variable.
 *
 * `SpendCapOptions.storePath` is used throughout instead of the real default
 * path, so this suite never touches `identify/data/spend-cap.json` and can
 * run in parallel with anything else that might. `capCad` is passed
 * explicitly too, so a real `SHIN_PHOTO_DAILY_CAP_CAD` left in a developer's
 * shell can never change what these tests measure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelCallError, type MessagesClient } from '../src/model.ts';
import {
  currentSpend,
  estimatedCostCad,
  reserveSpend,
  resetSpendCap,
  spendCapRefusalMessage,
  withSpendCap,
  type SpendCapOptions,
} from '../src/cap.ts';

function tempStore(): SpendCapOptions {
  const dir = mkdtempSync(join(tmpdir(), 'shin-spend-cap-'));
  return { storePath: join(dir, 'spend-cap.json'), capCad: 10 };
}

/** A client that answers once and records how many times it was actually called. */
function fakeClient(): MessagesClient & { calls: number } {
  const client = {
    calls: 0,
    messages: {
      async create(): Promise<never> {
        client.calls += 1;
        return { stop_reason: 'end_turn', content: [] } as never;
      },
    },
  };
  return client as unknown as MessagesClient & { calls: number };
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

test('the call before the cap goes through', async () => {
  const opts = tempStore();
  const cost = estimatedCostCad();
  // A cap that fits exactly one call at the estimated cost.
  const oneCall: SpendCapOptions = { ...opts, capCad: cost };
  const client = fakeClient();
  const wrapped = withSpendCap(client, oneCall);

  await wrapped.messages.create({} as never, undefined);
  assert.equal(client.calls, 1);
  assert.equal(currentSpend(oneCall).cad, cost);
});

test('the call after the cap is refused, and it is a normal outcome for the caller to hand upward', async () => {
  const opts = tempStore();
  const cost = estimatedCostCad();
  const oneCall: SpendCapOptions = { ...opts, capCad: cost };
  const client = fakeClient();
  const wrapped = withSpendCap(client, oneCall);

  await wrapped.messages.create({} as never, undefined);
  const err = await failure(() => wrapped.messages.create({} as never, undefined));

  assert.equal(err.failure, 'spend_cap_reached');
  assert.equal(err.message, spendCapRefusalMessage());
  assert.equal(client.calls, 1, 'the refused call never reaches the real client');
  assert.equal(currentSpend(oneCall).cad, cost, 'a refused call is never charged');
});

test('the counter resets at the day boundary', () => {
  const opts = tempStore();
  const cost = estimatedCostCad();
  const oneCall: SpendCapOptions = { ...opts, capCad: cost };

  assert.equal(reserveSpend(cost, oneCall), true);
  assert.equal(reserveSpend(cost, oneCall), false, 'the same day, the second call is refused');

  // A day that has already turned over, written directly to the store the
  // way yesterday's process would have left it -- not through resetSpendCap,
  // which is the test-only escape hatch this case is deliberately not using.
  writeFileSync(opts.storePath!, JSON.stringify({ day: '2020-01-01', cad: cost }), 'utf8');
  assert.equal(reserveSpend(cost, oneCall), true, "yesterday's spend does not carry into today");
});

test('spend survives a restart: a fresh read of the same store sees the earlier charge', () => {
  const opts = tempStore();
  const cost = estimatedCostCad();

  assert.equal(reserveSpend(cost, opts), true);

  // Nothing here is a live process handle -- currentSpend/reserveSpend hold
  // no module-level state of their own between calls, unlike model.ts's
  // in-memory `spend` object, so re-reading the same path IS the "after a
  // restart" case, not a simulation of one.
  const raw = JSON.parse(readFileSync(opts.storePath!, 'utf8')) as { day: string; cad: number };
  assert.equal(raw.cad, cost, 'the charge is on disk, not only in memory');
  assert.equal(currentSpend(opts).cad, cost);
});

test('resetSpendCap is the test-only escape hatch, not something production calls', () => {
  const opts = tempStore();
  const cost = estimatedCostCad();
  assert.equal(reserveSpend(cost, opts), true);
  resetSpendCap(opts);
  assert.equal(currentSpend(opts).cad, 0);
});

test('the refusal sentence is the app talking about its own budget, never at the user', () => {
  const message = spendCapRefusalMessage();
  assert.ok(!message.includes('—'), 'no em dashes in anything generated');
  assert.ok(!/\byou\b|\byour\b/i.test(message), 'the limit is named, not blamed on the person holding the phone');
});
