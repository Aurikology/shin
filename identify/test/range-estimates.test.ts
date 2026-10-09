/**
 * Requirement 6.2 (docs/price-category-requirements-2026-10-01.md): every
 * Claude answer is stored with item, model, date and category; 100% stored.
 * Plan row 6.2: an append-only estimates table written BEFORE the answer
 * returns; it fails on "an answer with no stored row"; diagnose by counting
 * calls against rows.
 *
 * The "table" is identify's own `<store>.answers.jsonl` (not the app's
 * scans.db: that would share a schema across packages). Written first, run red
 * on the code as it stood, then built (RULINGS "Errors never go unnoticed").
 *
 * No network: every call goes through the real AnthropicProvider over a fake
 * MessagesClient. The store module is imported as a namespace so a missing
 * export fails ITS test rather than the whole file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AnthropicProvider, type MessagesClient } from '../src/providers/anthropic.ts';
import { askTypicalRange, type RangeAskDeps, type RangeIdentity } from '../src/range-ask.ts';
import * as store from '../src/range-ask-store.ts';

const IDENTITY: RangeIdentity = { name: 'Classic Ketchup', brand: 'Heinz', size: '1 L', category: 'Condiments', market: 'CA' };
const SEPT = Date.parse('2026-09-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'shin-estimates-')), 'range-ask.json');
}

function client(modelText: string, stopReason = 'end_turn'): MessagesClient {
  return {
    messages: {
      async create(body) {
        return {
          id: 'm',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [{ type: 'text', text: modelText, citations: null }],
          stop_reason: stopReason,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        } as never;
      },
    },
  };
}

function throwing(make: () => Error): MessagesClient {
  return {
    messages: {
      async create() {
        throw make();
      },
    },
  };
}

const GOOD = JSON.stringify({ known: true, low_cents: 399, high_cents: 649, currency: 'CAD', unit: 'one 1 L bottle', confidence: 'medium' });

function deps(c: MessagesClient, storePath: string, over: Partial<RangeAskDeps> = {}): RangeAskDeps {
  return { provider: new AnthropicProvider(c), storePath, monthlyCap: 1000, now: () => SEPT, ...over };
}

type Row = Record<string, unknown>;
function rows(storePath: string): Row[] {
  const p = store.rangeAnswersPath(storePath);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as Row);
}

function captureErrors(): { logged: string[]; restore: () => void } {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => {
    logged.push(a.map(String).join(' '));
  };
  return { logged, restore: () => { console.error = original; } };
}

const faultCount = (): (() => number) | undefined =>
  (store as unknown as { rangeLogFaults?: () => number }).rangeLogFaults;

test('6.2 a stored row carries item, model, date and category', async () => {
  const s = tempStore();
  await askTypicalRange(IDENTITY, deps(client(GOOD), s));
  const got = rows(s);
  assert.equal(got.length, 1);
  assert.equal(got[0]!.item, 'Classic Ketchup');
  assert.equal(got[0]!.model, 'claude-haiku-4-5-20251001');
  assert.equal(got[0]!.askedAt, new Date(SEPT).toISOString());
  assert.equal(got[0]!.category, 'Condiments');
});

test('6.2 a missing category is stored as null, not dropped and not invented', async () => {
  const s = tempStore();
  await askTypicalRange({ ...IDENTITY, category: undefined }, deps(client(GOOD), s));
  const got = rows(s);
  assert.equal(got.length, 1);
  assert.ok('category' in got[0]!, 'the field is always present');
  assert.equal(got[0]!.category, null);
});

const TRANSPORT: [string, () => Error][] = [
  ['non-2xx 503', () => Object.assign(new Error('overloaded'), { status: 503 })],
  ['non-2xx 429', () => Object.assign(new Error('slow down'), { status: 429 })],
  ['non-2xx 400', () => Object.assign(new Error('bad request'), { status: 400 })],
  ['network error (no status)', () => new Error('socket hang up')],
  ['timeout / abort', () => Object.assign(new Error('aborted'), { name: 'AbortError' })],
];

for (const [label, make] of TRANSPORT) {
  test(`6.2 transport failure is still one row: ${label}`, async () => {
    const s = tempStore();
    const r = await askTypicalRange(IDENTITY, deps(throwing(make), s));
    assert.equal(r.ok ? null : r.reason, 'model_error');
    const got = rows(s);
    assert.equal(got.length, 1, 'a call with no row is the defect');
    assert.equal(got[0]!.outcome, 'transport_error');
    assert.equal(got[0]!.item, 'Classic Ketchup');
    assert.equal(got[0]!.category, 'Condiments');
    assert.equal(got[0]!.model, 'claude-haiku-4-5-20251001');
    assert.equal(got[0]!.raw, null);
    assert.equal(typeof got[0]!.detail, 'string');
  });
}

test('6.2 calls counted against rows: a mixed batch leaves calls === rows', async () => {
  const s = tempStore();
  const unknown = JSON.stringify({ known: false, low_cents: null, high_cents: null, currency: 'CAD', unit: 'x', confidence: 'low' });
  const batch: [string, MessagesClient][] = [
    ['a', client(GOOD)],
    ['b', client(unknown)],
    ['c', client(GOOD.replace('CAD', 'USD'))],
    ['d', client('about five dollars')],
    ['e', client('', 'refusal')],
    ['f', throwing(() => Object.assign(new Error('down'), { status: 500 }))],
    ['g', throwing(() => new Error('ECONNRESET'))],
  ];
  for (const [name, c] of batch) await askTypicalRange({ ...IDENTITY, name }, deps(c, s));
  const calls = store.monthlyRangeCalls(s, SEPT).calls;
  assert.equal(calls, batch.length);
  assert.equal(rows(s).length, calls);
});

test('6.2 control: a cache hit and a cap refusal make no call and write no row', async () => {
  const s = tempStore();
  await askTypicalRange(IDENTITY, deps(client(GOOD), s));
  await askTypicalRange(IDENTITY, deps(client(GOOD), s, { now: () => SEPT + DAY })); // cache hit
  await askTypicalRange({ ...IDENTITY, name: 'Other' }, deps(client(GOOD), s, { monthlyCap: 1 })); // capped
  assert.equal(store.monthlyRangeCalls(s, SEPT).calls, 1);
  assert.equal(rows(s).length, 1);
});

test('6.2 the row is on disk before the answer returns (and at every clock read after the model answered)', async () => {
  // After provider.send resolves, the row is saved before any further clock()
  // read (the cache write is the next one). A clock that peeks at the file
  // there sees whether the row preceded it.
  for (const make of [() => client(GOOD), () => client('about five dollars'), () => throwing(() => new Error('down'))]) {
    const s = tempStore();
    const seen: number[] = [];
    let answered = false;
    const inner = new AnthropicProvider(make());
    const provider = {
      name: inner.name,
      async send(req: Parameters<typeof inner.send>[0]) {
        try {
          return await inner.send(req);
        } finally {
          answered = true;
        }
      },
    } as unknown as RangeAskDeps['provider'];
    const r = await askTypicalRange(IDENTITY, {
      provider,
      storePath: s,
      monthlyCap: 1000,
      now: () => {
        if (answered) seen.push(rows(s).length);
        return SEPT;
      },
    });
    assert.equal(rows(s).length, 1, `row present when the answer returned (ok=${r.ok})`);
    for (const n of seen) assert.equal(n, 1, 'row already present at every clock read after the model answered');
  }
});

test('6.2 append-only: earlier lines stay byte-identical as rows, cache expiry and a month turn pass', async () => {
  const s = tempStore();
  const p = store.rangeAnswersPath(s);
  let before = '';
  const steps: [string, MessagesClient, number][] = [
    ['one', client(GOOD), SEPT],
    ['two', throwing(() => new Error('down')), SEPT],
    ['three', client('junk'), SEPT + 40 * DAY],
    ['one', client(GOOD), SEPT + 80 * DAY],
  ];
  for (const [name, c, at] of steps) {
    await askTypicalRange({ ...IDENTITY, name }, deps(c, s, { now: () => at }));
    const after = readFileSync(p, 'utf8');
    assert.ok(after.startsWith(before), 'earlier bytes unchanged');
    assert.ok(after.length > before.length, 'one new row each call');
    before = after;
  }
  assert.equal(rows(s).length, 4);
});

test('6.2 append-only: the store exports no way to delete, rewrite or edit a row', () => {
  const names = Object.keys(store);
  assert.deepEqual(names.filter((n) => /delete|remove|rewrite|update|truncate|clear|purge|edit/i.test(n)), []);
  const src = readFileSync(new URL('../src/range-ask-store.ts', import.meta.url), 'utf8');
  assert.match(src, /appendFileSync\(path,/);
  assert.equal(/writeFileSync\(path|unlinkSync|rmSync|truncateSync/.test(src), false);
});

test('control for the append-only check: a clean append passes the prefix test, a rewrite fails it', () => {
  const s = tempStore();
  const p = store.rangeAnswersPath(s);
  writeFileSync(p, '{"a":1}\n{"a":2}\n');
  const before = readFileSync(p, 'utf8');
  appendFileSync(p, '{"a":3}\n');
  assert.ok(readFileSync(p, 'utf8').startsWith(before));
  writeFileSync(p, '{"a":9}\n{"a":2}\n{"a":3}\n');
  assert.equal(readFileSync(p, 'utf8').startsWith(before), false);
});

test('6.2 a failed log write is loud: answer still returns, fault counted, flagged, logged with a fixed tag', async () => {
  const s = tempStore();
  mkdirSync(store.rangeAnswersPath(s), { recursive: true }); // a directory where the file should be: every append throws
  const cap = captureErrors();
  try {
    const f = faultCount();
    assert.equal(typeof f, 'function', 'the store exports rangeLogFaults()');
    const before = f!();
    const r = await askTypicalRange(IDENTITY, deps(client(GOOD), s));
    assert.equal(r.ok, true, 'Always answer: the shopper still gets the range');
    assert.equal((r as { logFault?: boolean }).logFault, true);
    const r2 = await askTypicalRange({ ...IDENTITY, name: 'B' }, deps(throwing(() => new Error('down')), s));
    assert.equal((r2 as { logFault?: boolean }).logFault, true);
    assert.equal(f!() - before, 2);
    assert.equal(cap.logged.filter((l) => l.includes('[range-log-fault]')).length, 2);
  } finally {
    cap.restore();
  }
});

test('6.2 control: a healthy log write is silent and counts no fault', async () => {
  const s = tempStore();
  const cap = captureErrors();
  try {
    const f = faultCount();
    const before = f ? f() : 0;
    const r = await askTypicalRange(IDENTITY, deps(client(GOOD), s));
    assert.equal(r.ok, true);
    assert.equal((r as { logFault?: boolean }).logFault, undefined);
    assert.equal(f ? f() : 0, before);
    assert.deepEqual(cap.logged.filter((l) => l.includes('[range-log-fault]')), []);
  } finally {
    cap.restore();
  }
});
