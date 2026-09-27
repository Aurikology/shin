/**
 * The last-resort range ask (`src/range-ask.ts`). Added 2026-09-27.
 *
 * Every call here goes through the REAL `GeminiProvider` with a fake transport
 * (the double `gemini.test.ts` uses), so the body asserted is the body the
 * provider would really build, and nothing opens a socket. Every test uses its
 * own temp store and an injected clock, so none touches
 * `identify/data/range-ask.json` and none depends on today's date.
 *
 * What these prove is that the code agrees with itself. They do not prove that
 * Gemini accepts this request, honours the schema, or gives sane Canadian
 * prices: only a live call can.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GeminiProvider, type GeminiTransport } from '../src/providers/gemini.ts';
import { askTypicalRange, rangeCacheKey, type RangeAskDeps, type RangeIdentity } from '../src/range-ask.ts';
import { monthlyRangeCalls } from '../src/range-ask-store.ts';

const IDENTITY: RangeIdentity = {
  name: 'Classic Ketchup',
  brand: 'Heinz',
  size: '1 L',
  category: 'grocery',
  market: 'CA',
};

const SEPT = Date.parse('2026-09-15T12:00:00Z');
const OCT = Date.parse('2026-10-01T00:00:01Z');

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'shin-range-ask-')), 'range-ask.json');
}

interface Sent {
  url: string;
  body: Record<string, unknown>;
}

/** A fake transport answering with `modelText` as the model's output text, counting every send. */
function fake(modelText: string): GeminiTransport & { sent: Sent[] } {
  const sent: Sent[] = [];
  const t = (async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: modelText }] }],
        });
      },
    };
  }) as GeminiTransport & { sent: Sent[] };
  t.sent = sent;
  return t;
}

function goodAnswer(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    known: true,
    low_cents: 399,
    high_cents: 649,
    currency: 'CAD',
    unit: 'one 1 L bottle',
    confidence: 'medium',
    ...over,
  });
}

function deps(transport: GeminiTransport, storePath: string, over: Partial<RangeAskDeps> = {}): RangeAskDeps {
  return {
    provider: new GeminiProvider({ apiKey: 'test-key', baseUrl: 'https://example.invalid/v1beta', transport }),
    storePath,
    monthlyCap: 1000,
    model: 'gemini-3.8-flash',
    now: () => SEPT,
    ...over,
  };
}

test('happy path: one ungrounded call, a validated range in cents, stamped with the call time', async () => {
  const store = tempStore();
  const t = fake(goodAnswer());
  const r = await askTypicalRange(IDENTITY, deps(t, store));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.cached, false);
  assert.equal(r.range.lowCents, 399);
  assert.equal(r.range.highCents, 649);
  assert.equal(r.range.currency, 'CAD');
  assert.equal(r.range.unit, 'one 1 L bottle');
  assert.equal(r.range.confidence, 'medium');
  assert.equal(r.range.askedAt, new Date(SEPT).toISOString());
  assert.equal(t.sent.length, 1);

  const body = t.sent[0]!.body;
  assert.equal('tools' in body, false, 'no tools key at all: the ask is ungrounded');
  assert.equal(typeof body.input, 'string', 'text only, no image part');
  assert.match(String(body.input), /Product: Classic Ketchup/);
  assert.match(String(body.input), /Brand: Heinz/);
  assert.match(String(body.input), /Currency: CAD/);
  assert.equal(body.model, 'gemini-3.8-flash');
  assert.deepEqual(monthlyRangeCalls(store, SEPT), { month: '2026-09', calls: 1 });
});

test('invalid JSON from the model is a failure, never a number, and the attempt still counts', async () => {
  const store = tempStore();
  const r = await askTypicalRange(IDENTITY, deps(fake('the range is about four to six dollars'), store));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'invalid_json');
  assert.equal(monthlyRangeCalls(store, SEPT).calls, 1);
});

test('a currency other than the market one is discarded', async () => {
  const r = await askTypicalRange(IDENTITY, deps(fake(goodAnswer({ currency: 'USD' })), tempStore()));
  assert.deepEqual(r.ok ? null : r.reason, 'currency_mismatch');
});

test('low above high is refused, not swapped', async () => {
  const r = await askTypicalRange(IDENTITY, deps(fake(goodAnswer({ low_cents: 900, high_cents: 400 })), tempStore()));
  assert.deepEqual(r.ok ? null : r.reason, 'low_above_high');
});

test('the other hard checks each refuse', async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ low_cents: 0 }, 'not_positive'],
    [{ low_cents: 3.99 }, 'not_integer_cents'],
    [{ high_cents: 5_000_000 }, 'over_ceiling'],
    [{ currency: 'dollars' }, 'bad_currency'],
    [{ unit: '' }, 'bad_unit'],
    [{ confidence: 'certain' }, 'bad_confidence'],
    [{ known: false, low_cents: null, high_cents: null }, 'model_does_not_know'],
  ];
  for (const [over, reason] of cases) {
    const r = await askTypicalRange(IDENTITY, deps(fake(goodAnswer(over)), tempStore()));
    assert.equal(r.ok ? null : r.reason, reason, JSON.stringify(over));
  }
});

test('a failed answer is not cached: the next ask calls again', async () => {
  const store = tempStore();
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer({ currency: 'USD' })), store));
  const t = fake(goodAnswer());
  const r = await askTypicalRange(IDENTITY, deps(t, store));
  assert.equal(r.ok && !r.cached, true);
  assert.equal(t.sent.length, 1);
});

test('cap reached: no call goes out and the count does not move', async () => {
  const store = tempStore();
  const first = fake(goodAnswer());
  await askTypicalRange(IDENTITY, deps(first, store, { monthlyCap: 1 }));
  const t = fake(goodAnswer());
  const r = await askTypicalRange({ ...IDENTITY, name: 'Relish' }, deps(t, store, { monthlyCap: 1 }));
  assert.deepEqual(r, { ok: false, reason: 'monthly_cap_reached' });
  assert.equal(t.sent.length, 0);
  assert.equal(monthlyRangeCalls(store, SEPT).calls, 1);
});

test('the cap resets when the UTC month turns', async () => {
  const store = tempStore();
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer()), store, { monthlyCap: 1 }));
  const refused = fake(goodAnswer());
  const other = { ...IDENTITY, name: 'Relish' };
  assert.equal((await askTypicalRange(other, deps(refused, store, { monthlyCap: 1 }))).ok, false);
  assert.equal(refused.sent.length, 0);

  const t = fake(goodAnswer());
  const r = await askTypicalRange(other, deps(t, store, { monthlyCap: 1, now: () => OCT }));
  assert.equal(r.ok, true);
  assert.equal(t.sent.length, 1);
  assert.deepEqual(monthlyRangeCalls(store, OCT), { month: '2026-10', calls: 1 });
});

test('cache hit: no call, no count, and the original call time comes back', async () => {
  const store = tempStore();
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer()), store));
  const later = SEPT + 10 * 24 * 60 * 60 * 1000;
  const t = fake(goodAnswer({ low_cents: 1 }));
  // Same product, spelled differently: normalisation must meet it.
  const r = await askTypicalRange(
    { ...IDENTITY, name: '  classic   KETCHUP ', brand: 'heinz', size: '1L' },
    deps(t, store, { now: () => later, monthlyCap: 1 }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.cached, true);
  assert.equal(r.range.lowCents, 399);
  assert.equal(r.range.askedAt, new Date(SEPT).toISOString());
  assert.equal(t.sent.length, 0);
  assert.equal(monthlyRangeCalls(store, later).calls, 1);
});

test('a cached answer older than 30 days is not used', async () => {
  const store = tempStore();
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer()), store));
  const t = fake(goodAnswer());
  const r = await askTypicalRange(IDENTITY, deps(t, store, { now: () => SEPT + 31 * 24 * 60 * 60 * 1000 }));
  assert.equal(r.ok && r.cached, false);
  assert.equal(t.sent.length, 1);
});

test('a different market is a different cache key', () => {
  assert.notEqual(rangeCacheKey(IDENTITY), rangeCacheKey({ ...IDENTITY, market: 'US' }));
});

test('restart keeps the count: a fresh read of the same file refuses at the cap', async () => {
  const store = tempStore();
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer()), store, { monthlyCap: 2 }));
  await askTypicalRange({ ...IDENTITY, name: 'Mustard' }, deps(fake('not json'), store, { monthlyCap: 2 }));
  // Nothing is held in memory between calls; the file alone carries the count.
  const onDisk = JSON.parse(readFileSync(store, 'utf8')) as { month: string; calls: number };
  assert.deepEqual({ month: onDisk.month, calls: onDisk.calls }, { month: '2026-09', calls: 2 });
  const t = fake(goodAnswer());
  const r = await askTypicalRange({ ...IDENTITY, name: 'Relish' }, deps(t, store, { monthlyCap: 2 }));
  assert.equal(r.ok ? null : r.reason, 'monthly_cap_reached');
  assert.equal(t.sent.length, 0);
});

test('no name, or a market with no known currency, asks nothing', async () => {
  const t = fake(goodAnswer());
  const store = tempStore();
  assert.equal((await askTypicalRange({ ...IDENTITY, name: '  ' }, deps(t, store))).ok, false);
  const r = await askTypicalRange({ ...IDENTITY, market: 'FR' }, deps(t, store));
  assert.equal(r.ok ? null : r.reason, 'unsupported_market');
  assert.equal(t.sent.length, 0);
  assert.equal(monthlyRangeCalls(store, SEPT).calls, 0);
});
