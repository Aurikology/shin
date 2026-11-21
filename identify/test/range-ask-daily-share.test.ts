/**
 * Abuse review 2026-11-21, finding 5 (gap 56), and Jamin's word the same day: the Claude price-range
 * estimate moves to Claude Haiku 5.5 with a 10,000-a-month cap, and no day may use more than twice its
 * even share of what is left of the month, so one caller with many networks costs a day, not the month.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AnthropicProvider, type MessagesClient } from '../src/providers/anthropic.ts';
import * as rangeAsk from '../src/range-ask.ts';
import * as store from '../src/range-ask-store.ts';
import { LIST_PRICES_USD_PER_MTOK } from '../src/provider.ts';

const { askTypicalRange } = rangeAsk;
const s = store as unknown as Record<string, unknown>;

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'shin-range-share-')), 'range-ask.json');
}

/** A fake Messages client that always knows the range, and counts the calls that reached it. */
function fake(): MessagesClient & { calls: number } {
  const f = {
    calls: 0,
    messages: {
      async create(body: { model: string }) {
        f.calls += 1;
        const text = JSON.stringify({ known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'each', confidence: 'medium' });
        return {
          id: 'msg_test', type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text, citations: null }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 20 },
        } as never;
      },
    },
  };
  return f as unknown as MessagesClient & { calls: number };
}

const item = (i: number) => ({ name: `Share Test Item ${i}`, brand: 'Brand', size: '1 L', category: 'grocery', market: 'CA' });

test('Jamin 2026-11-21: the estimate model is Claude Haiku 5.5, priced, and the default cap is 10,000 a month', () => {
  assert.equal(rangeAsk.RANGE_ASK_MODEL, 'claude-haiku-5-5');
  assert.equal(rangeAsk.DEFAULT_MONTHLY_CAP, 10_000);
  assert.deepEqual(LIST_PRICES_USD_PER_MTOK['claude-haiku-5-5'], { input: 0.1, output: 0.5 });
});

test('abuse 5: on the 21st of a 30-day month, a 1,000 cap lets one day send its share, then refuses until tomorrow', async () => {
  const path = tempStore();
  const client = fake();
  const day1 = Date.parse('2026-11-21T10:00:00Z'); // 10 days left, today included
  const share = Math.ceil((2 * 1_000) / 10);
  const deps = { provider: new AnthropicProvider(client), storePath: path, monthlyCap: 1_000, now: () => day1 };
  let ok = 0;
  let daily = 0;
  for (let i = 0; i < share + 25; i += 1) {
    const r = await askTypicalRange(item(i), deps);
    if (r.ok) ok += 1;
    else if (r.reason === ('daily_cap_reached' as string)) daily += 1;
  }
  assert.equal(client.calls, share, `Claude was called ${client.calls} times on one day`);
  assert.equal(ok, share);
  assert.equal(daily, 25);
  // The next day has its own share of what is left.
  const day2 = Date.parse('2026-11-22T00:00:01Z');
  const r = await askTypicalRange(item(99_999), { ...deps, now: () => day2 });
  assert.equal(r.ok, true, 'the next day was refused');
});

test('abuse 5: the day is kept in the store file, so a restart does not hand out a fresh share', () => {
  assert.equal(typeof s.reserveMonthlyRangeCall, 'function');
  const reserve = store.reserveMonthlyRangeCall;
  const path = tempStore();
  const now = Date.parse('2026-11-21T10:00:00Z');
  let allowed = 0;
  for (let i = 0; i < 3_000; i += 1) if (reserve(path, 10_000, now, 86_400_000).allowed) allowed += 1;
  // A second reader of the same file (a restarted process) sees today's count.
  const again = reserve(path, 10_000, now + 1000, 86_400_000);
  assert.equal(allowed, 2_000);
  assert.equal(again.allowed, false);
});

test('abuse 5: a small cap is not cut to one a day, and the last day may use what is left', () => {
  const path = tempStore();
  const now = Date.parse('2026-11-01T10:00:00Z');
  let allowed = 0;
  for (let i = 0; i < 40; i += 1) if (store.reserveMonthlyRangeCall(path, 30, now, 86_400_000).allowed) allowed += 1;
  assert.equal(allowed, 30, 'a 30-a-month cap should allow 30 on its first day');
  const last = tempStore();
  let lastDay = 0;
  for (let i = 0; i < 600; i += 1) if (store.reserveMonthlyRangeCall(last, 500, Date.parse('2026-11-30T10:00:00Z'), 86_400_000).allowed) lastDay += 1;
  assert.equal(lastDay, 500);
});
