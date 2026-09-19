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

// REWRITTEN 2026-09-19 (audit rows 16 and 32). This test used to pin "the call after
// the cap is refused". His words, "No rule is ever more important than the correct
// functionality of our system", now make crossing the SOFT cap a mark, not a refusal.
test('the call after the soft cap is NOT refused: it goes out, is charged, and is reported over the cap', async () => {
  const opts = tempStore();
  const cost = estimatedCostCad();
  const seen: boolean[] = [];
  const oneCall: SpendCapOptions = { ...opts, capCad: cost, onOverCap: (d) => seen.push(d.allowed) };
  const client = fakeClient();
  const wrapped = withSpendCap(client, oneCall);

  await wrapped.messages.create({} as never, undefined);
  assert.deepEqual(seen, [], 'the call that fits the cap is not over it');
  await wrapped.messages.create({} as never, undefined);

  assert.equal(client.calls, 2, 'the soft cap crossed and the scan still went out');
  assert.deepEqual(seen, [true], 'the crossing was reported once, as allowed');
  assert.equal(currentSpend(oneCall).cad, cost * 2, 'spend past the soft cap is still counted');
});

test('the HARD ceiling is 10 times the soft cap by default and is the only refusal', async () => {
  const opts = tempStore();
  const cost = estimatedCostCad();
  const soft: SpendCapOptions = { ...opts, capCad: cost };
  assert.equal(currentSpend(soft).hardCapCad, cost * 10);

  const client = fakeClient();
  const wrapped = withSpendCap(client, soft);
  for (let i = 0; i < 10; i += 1) await wrapped.messages.create({} as never, undefined);
  assert.equal(client.calls, 10, 'ten calls fit under ten times the cap');

  const err = await failure(() => wrapped.messages.create({} as never, undefined));
  assert.equal(err.failure, 'spend_cap_reached');
  assert.equal(err.message, spendCapRefusalMessage());
  assert.equal(client.calls, 10, 'the refused call never reaches the real client');
  assert.ok(Math.abs(currentSpend(soft).cad - cost * 10) < 1e-9, 'a refused call is never charged');
});

test('the hard ceiling can be named with SHIN_PHOTO_HARD_CAP_CAD, and never sits below the soft cap', () => {
  const opts = tempStore();
  const before = process.env.SHIN_PHOTO_HARD_CAP_CAD;
  try {
    process.env.SHIN_PHOTO_HARD_CAP_CAD = '25';
    assert.equal(currentSpend({ ...opts, capCad: 1 }).hardCapCad, 25);
    process.env.SHIN_PHOTO_HARD_CAP_CAD = '0.5';
    assert.equal(currentSpend({ ...opts, capCad: 1 }).hardCapCad, 1, 'a ceiling under the cap would turn the ceiling into the cap');
  } finally {
    if (before === undefined) delete process.env.SHIN_PHOTO_HARD_CAP_CAD;
    else process.env.SHIN_PHOTO_HARD_CAP_CAD = before;
  }
});

test('the refusal at the hard ceiling is kind and says to try again', () => {
  const message = spendCapRefusalMessage();
  assert.match(message, /try again/i);
  assert.ok(!/budget|spent|cost|bill/i.test(message), 'a retryable answer does not talk about billing');
});

test('the counter resets at the day boundary', () => {
  const opts = tempStore();
  const cost = estimatedCostCad();
  // Soft cap and hard ceiling both one call wide, so the second call is the refused one.
  const oneCall: SpendCapOptions = { ...opts, capCad: cost, hardCapCad: cost };

  assert.equal(reserveSpend(cost, oneCall), true);
  assert.equal(reserveSpend(cost, oneCall), false, 'the same day, past the hard ceiling, the second call is refused');

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
