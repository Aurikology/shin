/**
 * The last-resort range ask (`src/range-ask.ts`). Added 2026-09-27; moved from
 * Gemini to Claude 2026-09-28 (RULINGS.md "Catalogue first; Claude, with no
 * web search, is the capped price-range fallback").
 *
 * Every call here goes through the REAL `AnthropicProvider` with a fake
 * `MessagesClient` (the seam the provider's own tests build against), so the
 * body asserted is the body the provider would really send, and nothing opens
 * a socket. Every test uses its own temp store and an injected clock, so none
 * touches `identify/data/range-ask.json` and none depends on today's date.
 *
 * What these prove is that the code agrees with itself. They do not prove that
 * Claude accepts this request, honours the schema, or gives sane Canadian
 * prices: only a live call can.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AnthropicProvider, type MessagesClient } from '../src/providers/anthropic.ts';
import {
  askTypicalRange,
  capOf,
  DEFAULT_MONTHLY_CAP,
  MAX_OUTPUT_TOKENS,
  rangeCacheKey,
  RANGE_ASK_MODEL,
  validateRange,
  type RangeAskDeps,
  type RangeIdentity,
} from '../src/range-ask.ts';
import { monthlyRangeCalls, rangeAnswersPath } from '../src/range-ask-store.ts';

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

type Body = Record<string, unknown>;

/** A fake Messages client answering with `modelText` as the text block, recording every body sent. */
function fake(modelText: string, stopReason = 'end_turn'): MessagesClient & { sent: Body[] } {
  const sent: Body[] = [];
  return {
    sent,
    messages: {
      async create(body) {
        sent.push(JSON.parse(JSON.stringify(body)) as Body);
        return {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [{ type: 'text', text: modelText, citations: null }],
          stop_reason: stopReason,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 20 },
        } as never;
      },
    },
  };
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

function deps(client: MessagesClient, storePath: string, over: Partial<RangeAskDeps> = {}): RangeAskDeps {
  return {
    provider: new AnthropicProvider(client),
    storePath,
    monthlyCap: 1000,
    now: () => SEPT,
    ...over,
  };
}

test('happy path: one Claude call with no tools, a validated range in cents, stamped with the call time', async () => {
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
  assert.equal(r.range.model, 'claude-haiku-4-5-20251001');
  assert.equal(t.sent.length, 1);

  const body = t.sent[0]!;
  assert.equal('tools' in body, false, 'no tools key at all: no web search exists for the model');
  assert.equal('tool_choice' in body, false);
  assert.equal(body.model, 'claude-haiku-4-5-20251001');
  assert.equal(RANGE_ASK_MODEL, 'claude-haiku-4-5-20251001');
  assert.equal(body.max_tokens, 1024);
  assert.equal(typeof body.system, 'string');
  const messages = body.messages as { role: string; content: { type: string; text?: string }[] }[];
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.role, 'user');
  assert.deepEqual(messages[0]!.content.map((c) => c.type), ['text'], 'text only, never an image');
  const text = messages[0]!.content[0]!.text ?? '';
  assert.match(text, /Product: Classic Ketchup/);
  assert.match(text, /Brand: Heinz/);
  assert.match(text, /Currency: CAD/);
  const format = (body.output_config as { format: { type: string; schema: Record<string, unknown> } }).format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.schema.additionalProperties, false);
  assert.deepEqual(monthlyRangeCalls(store, SEPT), { month: '2026-09', calls: 1 });
});

test('the answer is saved as data: the store holds the range, its call time and the model', async () => {
  const store = tempStore();
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer()), store));
  const onDisk = JSON.parse(readFileSync(store, 'utf8')) as {
    cache: Record<string, { askedAt: string; range: Record<string, unknown> }>;
  };
  const entry = onDisk.cache[rangeCacheKey(IDENTITY)];
  assert.ok(entry, 'the answer was not stored');
  assert.equal(entry.askedAt, new Date(SEPT).toISOString());
  assert.equal(entry.range.lowCents, 399);
  assert.equal(entry.range.highCents, 649);
  assert.equal(entry.range.model, 'claude-haiku-4-5-20251001');
});

test('a caller-named model is the one sent', async () => {
  const t = fake(goodAnswer());
  await askTypicalRange(IDENTITY, deps(t, tempStore(), { model: 'claude-haiku-4-5' }));
  assert.equal(t.sent[0]!.model, 'claude-haiku-4-5');
});

test('a refusal is a failure with no number, and the attempt still counts', async () => {
  const store = tempStore();
  const r = await askTypicalRange(IDENTITY, deps(fake('', 'refusal'), store));
  assert.equal(r.ok, false);
  assert.equal(monthlyRangeCalls(store, SEPT).calls, 1);
});

test('no ANTHROPIC_API_KEY and no provider: no_api_key, nothing counted, nothing sent', async () => {
  const store = tempStore();
  const saved = process.env.ANTHROPIC_API_KEY;
  // Empty, not deleted: loadDotEnv only fills unset keys, so a developer's .env cannot turn this into a live call.
  process.env.ANTHROPIC_API_KEY = '';
  try {
    const r = await askTypicalRange(IDENTITY, { storePath: store, monthlyCap: 1000, now: () => SEPT });
    assert.deepEqual(r, { ok: false, reason: 'no_api_key' });
    assert.equal(monthlyRangeCalls(store, SEPT).calls, 0);
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  }
});

test('a cap of 0 turns the ask off: nothing is sent', async () => {
  const store = tempStore();
  const t = fake(goodAnswer());
  const r = await askTypicalRange(IDENTITY, deps(t, store, { monthlyCap: 0 }));
  assert.deepEqual(r, { ok: false, reason: 'monthly_cap_reached' });
  assert.equal(t.sent.length, 0);
  assert.equal(monthlyRangeCalls(store, SEPT).calls, 0);
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

/* ------------------------------------------- audit fixes, 2026-09-28 */

function answersOf(store: string): { outcome: string; detail?: string; raw: unknown; model: string; askedAt: string }[] {
  const path = rangeAnswersPath(store);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('thinking is disabled and the ceiling is 1024, so a thinking model cannot eat the answer', async () => {
  const t = fake(goodAnswer());
  await askTypicalRange(IDENTITY, deps(t, tempStore()));
  const body = t.sent[0]!;
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.max_tokens, 1024);
  assert.equal(MAX_OUTPUT_TOKENS, 1024);
});

test('a request that names no thinking sends no thinking key: other callers are unchanged', async () => {
  const t = fake(goodAnswer());
  const p = new AnthropicProvider(t);
  const request = {
    model: 'claude-haiku-4-5-20251001',
    images: [{ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png' as const }],
    system: 's',
    user: 'u',
    schema: { name: 'x', schema: { type: 'object', properties: {}, additionalProperties: false } },
    maxOutputTokens: 64,
    signal: new AbortController().signal,
  };
  await p.send(request);
  assert.equal('thinking' in t.sent[0]!, false);
  assert.deepEqual(Object.keys(t.sent[0]!), ['model', 'max_tokens', 'system', 'output_config', 'messages']);
});

test('a photo refusal keeps its old message; a text refusal says refused', async () => {
  const p = new AnthropicProvider(fake('', 'refusal'));
  const base = {
    model: 'm', system: 's', user: 'u', maxOutputTokens: 64, signal: new AbortController().signal,
    schema: { name: 'x', schema: { type: 'object' } },
  };
  await assert.rejects(
    p.send({ ...base, images: [{ bytes: new Uint8Array([1]), mediaType: 'image/png' }] }),
    (e: { failure: string; message: string }) => e.failure === 'unreadable_photo' && e.message === 'model declined to read this image',
  );
  await assert.rejects(
    p.send({ ...base, images: [] }),
    (e: { failure: string; message: string }) => e.failure === 'unreadable_photo' && e.message === 'refused',
  );
  const r = await askTypicalRange(IDENTITY, deps(fake('', 'refusal'), tempStore()));
  assert.deepEqual(r, { ok: false, reason: 'model_error', detail: 'refused' });
});

test('every answer is saved: valid, known:false, invalid (with its reason), and unparseable', async () => {
  const store = tempStore();
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer()), store));
  await askTypicalRange({ ...IDENTITY, name: 'A' }, deps(fake(goodAnswer({ known: false, low_cents: null, high_cents: null })), store));
  await askTypicalRange({ ...IDENTITY, name: 'B' }, deps(fake(goodAnswer({ currency: 'USD' })), store));
  await askTypicalRange({ ...IDENTITY, name: 'C' }, deps(fake('about five dollars'), store));
  const log = answersOf(store);
  assert.deepEqual(log.map((a) => a.outcome), ['ok', 'model_does_not_know', 'currency_mismatch', 'invalid_json']);
  assert.equal((log[2]!.raw as { currency: string }).currency, 'USD', 'the raw answer is kept');
  assert.match(log[2]!.detail ?? '', /USD is not CAD/);
  assert.equal(log[3]!.raw, null);
  assert.equal(log[0]!.model, 'claude-haiku-4-5-20251001');
  assert.equal(log[0]!.askedAt, new Date(SEPT).toISOString());
});

test('known:false is cached for 30 days: a rescan sends nothing and costs no cap slot', async () => {
  const store = tempStore();
  const unknown = goodAnswer({ known: false, low_cents: null, high_cents: null });
  const first = await askTypicalRange(IDENTITY, deps(fake(unknown), store));
  assert.deepEqual(first, { ok: false, reason: 'model_does_not_know' });
  const t = fake(goodAnswer());
  const later = SEPT + 5 * 24 * 60 * 60 * 1000;
  const again = await askTypicalRange(IDENTITY, deps(t, store, { now: () => later }));
  assert.deepEqual(again, { ok: false, reason: 'model_does_not_know', cached: true });
  assert.equal(t.sent.length, 0);
  assert.equal(monthlyRangeCalls(store, later).calls, 1);
  // Past 30 days it is asked again.
  const t2 = fake(goodAnswer());
  const r = await askTypicalRange(IDENTITY, deps(t2, store, { now: () => SEPT + 31 * 24 * 60 * 60 * 1000 }));
  assert.equal(r.ok, true);
  assert.equal(t2.sent.length, 1);
});

test('an invalid answer or a transport failure is not cached; a transport failure is not logged', async () => {
  const store = tempStore();
  const failing: MessagesClient & { sent: Body[] } = {
    sent: [],
    messages: {
      async create() {
        throw Object.assign(new Error('socket hang up'), { status: 503 });
      },
    },
  };
  const r = await askTypicalRange(IDENTITY, deps(failing, store));
  assert.equal(r.ok ? null : r.reason, 'model_error');
  assert.equal(answersOf(store).length, 0);
  await askTypicalRange(IDENTITY, deps(fake(goodAnswer({ currency: 'cad' })), store));
  const t = fake(goodAnswer());
  const ok = await askTypicalRange(IDENTITY, deps(t, store));
  assert.equal(ok.ok && !ok.cached, true);
  assert.equal(t.sent.length, 1);
  assert.equal(monthlyRangeCalls(store, SEPT).calls, 3);
});

test('a bad cap fails closed: NaN, negative or fractional is 0 and nothing is sent; absent is the default', async () => {
  for (const bad of [Number.NaN, -1, 2.5, Number.POSITIVE_INFINITY]) {
    const t = fake(goodAnswer());
    const r = await askTypicalRange(IDENTITY, deps(t, tempStore(), { monthlyCap: bad }));
    assert.deepEqual(r, { ok: false, reason: 'monthly_cap_reached' }, String(bad));
    assert.equal(t.sent.length, 0, String(bad));
  }
  assert.equal(capOf(undefined), DEFAULT_MONTHLY_CAP);
  assert.equal(capOf(0), 0);
  assert.equal(capOf(7), 7);
});

test('the validator refuses extra fields, a missing or non-boolean known, and a lowercased or padded currency', async () => {
  const cases: [string, string][] = [
    [goodAnswer({ note: 'hi' }), 'extra_fields'],
    [JSON.stringify({ low_cents: 399, high_cents: 649, currency: 'CAD', unit: 'each', confidence: 'low' }), 'bad_known'],
    [goodAnswer({ known: 'true' }), 'bad_known'],
    [goodAnswer({ known: 1 }), 'bad_known'],
    [goodAnswer({ currency: 'cad' }), 'bad_currency'],
    [goodAnswer({ currency: ' CAD' }), 'bad_currency'],
    [goodAnswer({ currency: 'CAD ' }), 'bad_currency'],
  ];
  for (const [text, reason] of cases) {
    const r = await askTypicalRange(IDENTITY, deps(fake(text), tempStore()));
    assert.equal(r.ok ? null : r.reason, reason, text);
  }
  assert.deepEqual(validateRange({ ...JSON.parse(goodAnswer()), extra: 1 }, 'CAD', 1e6), { ok: false, reason: 'extra_fields', detail: 'extra' });
});
