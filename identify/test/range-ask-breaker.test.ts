/**
 * REQUIREMENT 6.7, the ask's half: "Fall to the next basis when Claude is down, capped or slow, and
 * still answer." Plan Part 6: "Timeout, circuit breaker, ordered fallback, with forced failures in
 * tests." The fallback itself is the caller's (app/test/claude-down-still-answers.test.ts); this file
 * proves the ask never hangs past its timeout, and that a down Claude opens the circuit so later
 * scans stop paying the timeout and stop spending cap slots.
 *
 * Every Claude here is a fake Messages client; nothing opens a socket. Stores are OS temp folders.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnthropicProvider, type MessagesClient } from '../src/providers/anthropic.ts';
import {
  askTypicalRange,
  rangeBreaker,
  BREAKER_THRESHOLD,
  type RangeAskDeps,
  type RangeIdentity,
} from '../src/range-ask.ts';
import { monthlyRangeCalls } from '../src/range-ask-store.ts';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const tempStore = () => join(mkdtempSync(join(tmpdir(), 'shin-range-breaker-')), 'range-ask.json');
const item = (i: number): RangeIdentity => ({ name: `Thing ${i}`, brand: null, size: '1 L', category: null, market: 'CA' });

const GOOD = JSON.stringify({ known: true, low_cents: 399, high_cents: 649, currency: 'CAD', unit: 'each', confidence: 'medium' });

type Mode = 'up' | 'outage' | 'hang' | 'rate_limited' | 'reset';

/** A Claude that is up, down (500), rate limited (429), drops the socket, or never answers (until aborted). */
function claude(mode: () => Mode): MessagesClient & { sent: number } {
  const c = {
    sent: 0,
    messages: {
      async create(body: { model: string }, options?: { signal?: AbortSignal }) {
        c.sent += 1;
        const m = mode();
        if (m === 'outage') throw Object.assign(new Error('overloaded'), { status: 529 });
        if (m === 'rate_limited') throw Object.assign(new Error('rate limited'), { status: 429 });
        if (m === 'reset') throw new Error('socket hang up');
        if (m === 'hang') {
          return await new Promise<never>((_, reject) => {
            options?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          });
        }
        return {
          id: 'msg', type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text: GOOD, citations: null }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        } as never;
      },
    },
  };
  return c as never;
}

function deps(client: MessagesClient, storePath: string, over: Partial<RangeAskDeps> = {}): RangeAskDeps {
  return { provider: new AnthropicProvider(client), storePath, monthlyCap: 1000, now: () => NOW, ...over };
}

test('6.7 timeout: a Claude that never answers is cut off at the timeout, and the ask resolves model_error', async () => {
  const store = tempStore();
  const c = claude(() => 'hang');
  const t0 = Date.now();
  const r = await askTypicalRange(item(1), deps(c, store, { timeoutMs: 30, breaker: null }));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'model_error');
  assert.equal(!r.ok && r.detail, 'model_timeout');
  assert.ok(Date.now() - t0 < 2000, 'it did not wait for the hang');
});

for (const mode of ['outage', 'hang', 'rate_limited', 'reset'] as const) {
  test(`6.7 breaker (${mode}): after ${BREAKER_THRESHOLD} failures in a row the circuit opens; the next ask sends nothing and takes no cap slot`, async () => {
    const store = tempStore();
    const c = claude(() => mode);
    const breaker = rangeBreaker({ threshold: BREAKER_THRESHOLD, cooldownMs: 60_000 });
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      const r = await askTypicalRange(item(i), deps(c, store, { breaker, timeoutMs: 20 }));
      assert.equal(!r.ok && r.reason, 'model_error');
    }
    assert.equal(c.sent, BREAKER_THRESHOLD);
    const counted = monthlyRangeCalls(store, NOW).calls;
    const r = await askTypicalRange(item(99), deps(c, store, { breaker, timeoutMs: 20 }));
    assert.deepEqual(r, { ok: false, reason: 'circuit_open' });
    assert.equal(c.sent, BREAKER_THRESHOLD, 'nothing sent while open');
    assert.equal(monthlyRangeCalls(store, NOW).calls, counted, 'no cap slot spent while open');
    assert.equal(breaker.state(NOW), 'open');
  });
}

test('6.7 breaker: after the cooldown one trial goes out; Claude back up closes the circuit', async () => {
  const store = tempStore();
  let mode: Mode = 'outage';
  const c = claude(() => mode);
  let now = NOW;
  const breaker = rangeBreaker({ threshold: 2, cooldownMs: 1000 });
  const d = (over: Partial<RangeAskDeps> = {}) => deps(c, store, { breaker, now: () => now, ...over });
  await askTypicalRange(item(1), d());
  await askTypicalRange(item(2), d());
  assert.equal(breaker.state(now), 'open');
  assert.equal((await askTypicalRange(item(3), d())).ok, false);
  assert.equal(c.sent, 2);
  now += 1000;
  assert.equal(breaker.state(now), 'half_open');
  mode = 'up';
  const back = await askTypicalRange(item(4), d());
  assert.equal(back.ok, true, 'the trial answered');
  assert.equal(c.sent, 3);
  assert.equal(breaker.state(now), 'closed');
  assert.equal((await askTypicalRange(item(5), d())).ok, true);
});

test('6.7 breaker: a failed trial opens the circuit again for a fresh cooldown, and only one trial goes out at a time', async () => {
  const store = tempStore();
  const c = claude(() => 'outage');
  let now = NOW;
  const breaker = rangeBreaker({ threshold: 1, cooldownMs: 1000 });
  const d = () => deps(c, store, { breaker, now: () => now });
  await askTypicalRange(item(1), d());
  now += 1000;
  assert.equal(breaker.allow(now), true, 'the trial');
  assert.equal(breaker.allow(now), false, 'a second ask while the trial is out is refused');
  breaker.failed(now);
  assert.equal(breaker.state(now), 'open');
  assert.equal(breaker.state(now + 999), 'open');
  assert.equal(breaker.state(now + 1000), 'half_open');
});

test('6.7 breaker: an answer the validator refuses is still an answer; it resets the failure count', async () => {
  const store = tempStore();
  let n = 0;
  const c = {
    sent: 0,
    messages: {
      async create(body: { model: string }) {
        n += 1;
        if (n % 2 === 1) throw Object.assign(new Error('overloaded'), { status: 529 });
        return {
          id: 'msg', type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text: JSON.stringify({ known: false, low_cents: null, high_cents: null, currency: 'CAD', unit: 'each', confidence: 'low' }), citations: null }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        } as never;
      },
    },
  };
  const breaker = rangeBreaker({ threshold: 2, cooldownMs: 60_000 });
  for (let i = 0; i < 10; i++) await askTypicalRange(item(i), deps(c as never, store, { breaker }));
  assert.equal(breaker.state(NOW), 'closed', 'failures were never two in a row');
  assert.equal(n, 10);
});

test('6.7 breaker: a cap refusal hands a half-open trial back, so the circuit can still close later', async () => {
  const store = tempStore();
  let mode: Mode = 'outage';
  const c = claude(() => mode);
  let now = NOW;
  const breaker = rangeBreaker({ threshold: 1, cooldownMs: 1000 });
  await askTypicalRange(item(1), deps(c, store, { breaker, now: () => now }));
  now += 1000;
  const capped = await askTypicalRange(item(2), deps(c, store, { breaker, now: () => now, monthlyCap: 1 }));
  assert.equal(!capped.ok && capped.reason, 'monthly_cap_reached');
  mode = 'up';
  const r = await askTypicalRange(item(3), deps(c, store, { breaker, now: () => now, monthlyCap: 10 }));
  assert.equal(r.ok, true, 'the trial was not lost to the capped ask');
  assert.equal(breaker.state(now), 'closed');
});

test('6.7 control: with the breaker off (null), a down Claude is asked every time: the breaker tests above can fail', async () => {
  const store = tempStore();
  const c = claude(() => 'outage');
  for (let i = 0; i < BREAKER_THRESHOLD + 3; i++) await askTypicalRange(item(i), deps(c, store, { breaker: null }));
  assert.equal(c.sent, BREAKER_THRESHOLD + 3);
});
