/**
 * Claude reads the pack (`src/pack-read.ts`). RULINGS.md "A scan never ends
 * with no result" (2026-10-10): a barcode the catalogue and Open Food Facts
 * both miss sends the camera frame to the cheapest Claude model, which reads
 * the name, brand and size off the pack, never searching the web, and its name
 * is labelled as Claude's reading.
 *
 * Every call goes through the REAL `AnthropicProvider` with a fake
 * `MessagesClient`, so the body asserted is the body the provider would send,
 * and nothing opens a socket. Each test has its own temp store and clock.
 *
 * What these prove is that the code agrees with itself. They do not prove that
 * Claude reads a real Oreo pack correctly: only a live call can.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AnthropicProvider, type MessagesClient } from '../src/providers/anthropic.ts';
import { RANGE_ASK_MODEL } from '../src/range-ask.ts';
import {
  PACK_READ_MODEL,
  packAnswersPath,
  readPack,
  savedPackReading,
  monthlyPackReads,
  type PackReadDeps,
} from '../src/pack-read.ts';

const OCT = Date.parse('2026-10-10T12:00:00Z');
const NOV = Date.parse('2026-11-01T00:00:01Z');
const OREO = '0044000032029';
/** The smallest real JPEG header: enough for the provider to call it a JPEG. */
const FRAME = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]), mediaType: 'image/jpeg' as const };

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'shin-pack-read-')), 'pack-read.json');
}

type Body = Record<string, unknown>;

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

function failing(): MessagesClient & { sent: Body[] } {
  const sent: Body[] = [];
  return {
    sent,
    messages: {
      async create(body) {
        sent.push(body as unknown as Body);
        throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      },
    },
  };
}

const READ = JSON.stringify({ known: true, name: 'Oreo Chocolate Sandwich Cookies', brand: 'Oreo', size: '303 g' });

function deps(client: MessagesClient, storePath: string, over: Partial<PackReadDeps> = {}): PackReadDeps {
  return { provider: new AnthropicProvider(client), storePath, monthlyCap: 100, now: () => OCT, ...over };
}

test('one frame goes to the cheapest Claude with no tools at all, and the name it reads comes back labelled as its reading', async () => {
  const store = tempStore();
  const t = fake(READ);
  const r = await readPack(FRAME, OREO, deps(t, store));
  assert.equal(r.ok, true, `the pack read failed: ${JSON.stringify(r)}`);
  if (!r.ok) return;
  assert.equal(r.reading.name, 'Oreo Chocolate Sandwich Cookies');
  assert.equal(r.reading.brand, 'Oreo');
  assert.equal(r.reading.size, '303 g');
  assert.equal(r.reading.source, 'claude_reading', 'the name is not labelled as Claude reading the pack');
  assert.equal(r.cached, false);
  assert.equal(t.sent.length, 1, 'the frame was not sent exactly once');
  const body = t.sent[0]!;
  assert.equal(body.model, RANGE_ASK_MODEL, 'the pack read is not on the same cheapest model as the range ask');
  assert.equal(PACK_READ_MODEL, RANGE_ASK_MODEL);
  assert.equal('tools' in body, false, 'a tools key was sent: Claude must never be offered web search');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  const content = ((body.messages as Body[])[0]!.content as Body[]);
  assert.equal(content.filter((c) => c.type === 'image').length, 1, 'the request did not carry exactly one image');
});

test('the reading is saved by barcode, apart from the catalogue, and the next scan of that barcode needs no call', async () => {
  const store = tempStore();
  const t = fake(READ);
  await readPack(FRAME, OREO, deps(t, store));
  const saved = savedPackReading(store, OREO);
  assert.ok(saved, 'the reading was not saved under its barcode');
  assert.equal(saved.source, 'claude_reading');
  assert.equal(saved.name, 'Oreo Chocolate Sandwich Cookies');
  assert.equal(typeof saved.readAt, 'string');
  const again = await readPack(FRAME, OREO, deps(t, store));
  assert.equal(again.ok, true);
  assert.equal(again.ok && again.cached, true, 'a saved reading was not used');
  assert.equal(t.sent.length, 1, 'a second scan of a barcode already read called Claude again');
  // Every call is a row in the answer log, with the raw object.
  const lines = readFileSync(packAnswersPath(store), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1, 'the answer log does not hold one row per call');
  assert.equal(JSON.parse(lines[0]!).outcome, 'ok');
});

test('a misread (no valid barcode) is read but not saved under any key', async () => {
  const store = tempStore();
  const t = fake(READ);
  const r = await readPack(FRAME, null, deps(t, store));
  assert.equal(r.ok, true);
  assert.equal(savedPackReading(store, ''), null);
  assert.equal(existsSync(packAnswersPath(store)), true, 'the call was not logged');
});

test('a cap of 0 sends nothing; the cap counts per UTC month', async () => {
  const store = tempStore();
  const t = fake(READ);
  const off = await readPack(FRAME, OREO, deps(t, store, { monthlyCap: 0 }));
  assert.deepEqual(off, { ok: false, reason: 'monthly_cap_reached' });
  assert.equal(t.sent.length, 0, 'the frame went to Claude past a cap of 0');
  await readPack(FRAME, '0044000032036', deps(t, store, { monthlyCap: 1 }));
  const second = await readPack(FRAME, '0044000032043', deps(t, store, { monthlyCap: 1 }));
  assert.deepEqual(second, { ok: false, reason: 'monthly_cap_reached' }, 'a second read in the month passed a cap of 1');
  assert.equal(monthlyPackReads(store, OCT).calls, 1);
  assert.equal(monthlyPackReads(store, NOV).calls, 0, 'the count did not reset when the month turned');
});

test('no ANTHROPIC_API_KEY and no provider: no_api_key, nothing counted, nothing sent', async () => {
  const store = tempStore();
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = '';
  try {
    const r = await readPack(FRAME, OREO, { storePath: store, monthlyCap: 100, now: () => OCT });
    assert.deepEqual(r, { ok: false, reason: 'no_api_key' });
    assert.equal(monthlyPackReads(store, OCT).calls, 0);
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  }
});

test('Claude cannot read the pack, answers junk, or the call fails: a reason, never a made-up name, nothing saved', async () => {
  const cases: [MessagesClient & { sent: Body[] }, string][] = [
    [fake(JSON.stringify({ known: false, name: null, brand: null, size: null })), 'model_cannot_read'],
    [fake(JSON.stringify({ known: true, name: '', brand: null, size: null })), 'no_name'],
    [fake(JSON.stringify({ known: true, name: 'Oreo', brand: null, size: null, price: 399 })), 'extra_fields'],
    [fake('not json at all'), 'invalid_json'],
    [failing(), 'model_error'],
  ];
  for (const [client, reason] of cases) {
    const store = tempStore();
    const r = await readPack(FRAME, OREO, deps(client, store));
    assert.equal(r.ok, false, `expected ${reason}, got a reading`);
    assert.equal(!r.ok && r.reason, reason, `the failure reason is wrong: ${JSON.stringify(r)}`);
    assert.equal(savedPackReading(store, OREO), null, `a failed read (${reason}) was saved as a reading`);
  }
});

test('no frame at all: no_frame, nothing sent', async () => {
  const store = tempStore();
  const t = fake(READ);
  const r = await readPack({ bytes: new Uint8Array(), mediaType: 'image/jpeg' }, OREO, deps(t, store));
  assert.deepEqual(r, { ok: false, reason: 'no_frame' });
  assert.equal(t.sent.length, 0);
});
