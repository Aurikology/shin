/**
 * REQUIREMENT 6.7: "Fall to the next basis when Claude is down, capped or slow, and still answer.
 * Pass when the outage test answers 100%." Plan Part 6: "Timeout, circuit breaker, ordered fallback,
 * with forced failures in tests. Fails when any answer is lost when Claude is down. Diagnose by fault
 * injection."
 *
 * The fault injection: the real ask (identify/src/range-ask.ts) through the real Anthropic provider,
 * over a fake Messages client forced into each way Claude fails: overloaded (529), rate limited
 * (429), socket dropped, hung past the ask's timeout, slower than the verdict waits, malformed
 * output, a refusal, "I do not know", the monthly cap at 0, a cap store that cannot be written, and
 * the circuit already open. Every one is run over items that NEED Claude (Pexi holds no usable price
 * for them), and every request must still come back with a range on the next basis, the failure
 * named in `noRangeReason`.
 *
 * In memory and OS temp folders only; no socket opens.
 */
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnthropicProvider, type MessagesClient } from '../../identify/src/providers/anthropic.ts';
import { askTypicalRange, rangeBreaker, type RangeAskDeps, type RangeBreaker, type RangeIdentity } from '../../identify/src/range-ask.ts';
import * as cf from '../src/catalogue-first.ts';
import type { CanonicalBarcode } from '../src/barcode.ts';
import { AS_OF, LONELY, WINES, buildWorld, rangeOk, type World } from './range-world.ts';

afterEach(() => mock.restoreAll());

type Fault = 'outage' | 'rate_limited' | 'reset' | 'hang' | 'slow' | 'malformed' | 'refusal' | 'unknown';

const ok = (body: { model: string }, text: string, stop = 'end_turn') =>
  ({
    id: 'msg', type: 'message', role: 'assistant', model: body.model,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
  }) as never;
const GOOD = JSON.stringify({ known: true, low_cents: 399, high_cents: 649, currency: 'CAD', unit: 'each', confidence: 'low' });

/** A Claude forced into one way of failing; `sent` counts the bodies that reached it. */
function brokenClaude(fault: Fault): MessagesClient & { sent: number } {
  const c = {
    sent: 0,
    messages: {
      async create(body: { model: string }, options?: { signal?: AbortSignal }) {
        c.sent += 1;
        switch (fault) {
          case 'outage': throw Object.assign(new Error('overloaded'), { status: 529 });
          case 'rate_limited': throw Object.assign(new Error('rate limited'), { status: 429 });
          case 'reset': throw new Error('socket hang up');
          case 'hang':
            return await new Promise<never>((_, reject) =>
              options?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
            );
          case 'slow': return await new Promise((res) => setTimeout(() => res(ok(body, GOOD)), 150));
          case 'malformed': return ok(body, 'about four dollars, I think');
          case 'refusal': return ok(body, '', 'refusal');
          case 'unknown': return ok(body, JSON.stringify({ known: false, low_cents: null, high_cents: null, currency: 'CAD', unit: 'each', confidence: 'low' }));
        }
      },
    },
  };
  return c as never;
}

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'shin-claude-down-')), 'range-ask.json');
}

function ask(client: MessagesClient, over: Partial<RangeAskDeps> = {}): cf.BarcodeDeps['askRange'] {
  const storePath = over.storePath ?? tempStore();
  return (identity: RangeIdentity) =>
    askTypicalRange(identity, { provider: new AnthropicProvider(client), storePath, monthlyCap: 1000, timeoutMs: 60, breaker: null, ...over });
}

const code = (gtin: string) => ({ gtin, how: 'as_read', variableMeasure: null }) as unknown as CanonicalBarcode;

/** Items Pexi cannot price on its own: alone in an unpriced department, in a too-wide pool, unplaceable. */
function needClaude(): cf.CatalogueRow[] {
  return [
    { code: '0626990000048', name: 'Lip Balm', brands: 'Nobody', quantity: '15 ml', leafCategory: 'en:lonely-things', categoryPath: LONELY },
    { code: '0626990000055', name: 'Unpriced Red', brands: 'Somebody', quantity: '750 ml', leafCategory: 'en:red-wines', categoryPath: WINES },
    { code: '0626990000062', name: 'Mystery Thing', brands: null, quantity: null, leafCategory: null, categoryPath: [] },
    { code: '0626990000079', name: 'Gadget', brands: null, quantity: 'abc', leafCategory: 'en:unknown-thing', categoryPath: ['en:unknown-thing'] },
  ];
}

async function answerAll(world: World, askRange: cf.BarcodeDeps['askRange'], waitMs = 40): Promise<cf.CatalogueAnswer[]> {
  const out: cf.CatalogueAnswer[] = [];
  for (const row of needClaude()) {
    const deps: cf.BarcodeDeps = {
      lookup: { byGtin: () => row }, prices: world.prices, catalogue: world.catalogue, country: 'CA', currency: 'CAD', asOf: AS_OF,
      askRange, claudeWaitMs: waitMs,
    };
    out.push((await cf.answerBarcodeFromCatalogue(code(row.code), deps)).answer);
  }
  return out;
}

const EXPECTED: Record<Fault, string> = {
  outage: 'model_error', rate_limited: 'model_error', reset: 'model_error', hang: 'model_error',
  slow: 'claude_slow', malformed: 'invalid_json', refusal: 'model_error', unknown: 'model_does_not_know',
};

for (const fault of Object.keys(EXPECTED) as Fault[]) {
  test(`6.7 ${fault}: every item that needed Claude still answers with a range on the next basis, the failure named`, async () => {
    mock.method(console, 'warn', () => {});
    const world = buildWorld();
    const claude = brokenClaude(fault);
    // A hang waits past the ask's own 60 ms timeout (the verdict waits 2 s); a slow answer outlives the verdict's 40 ms wait.
    const answers = await answerAll(world, ask(claude), fault === 'hang' ? 2000 : 40);
    assert.ok(claude.sent > 0, 'the fault was actually reached');
    for (const a of answers) {
      assert.ok(rangeOk(a.range), `${a.barcode}: no range (${a.noRangeReason})`);
      assert.notEqual(a.rangeSource, 'claude_typical');
      assert.ok(a.rangeSource === 'shin_estimate' || a.rangeSource === 'fixed_prior', `${a.barcode}: ${a.rangeSource}`);
      assert.equal(a.range?.confidence, 'low');
      // A too-wide pool keeps its own reason (D-233); every other item names the Claude failure.
      if (a.barcode !== '0626990000055') assert.equal(a.noRangeReason, EXPECTED[fault], a.barcode);
    }
  });
}

test('6.7 capped: a monthly cap of 0 sends nothing, and every item still answers', async () => {
  const world = buildWorld();
  const claude = brokenClaude('outage');
  const answers = await answerAll(world, ask(claude, { monthlyCap: 0 }));
  assert.equal(claude.sent, 0);
  for (const a of answers) assert.ok(rangeOk(a.range), a.barcode);
  assert.ok(answers.filter((a) => a.noRangeReason === 'monthly_cap_reached').length >= 3);
});

test('6.7 a cap store that cannot be written sends nothing, and every item still answers', async () => {
  const world = buildWorld();
  const claude = brokenClaude('outage');
  const blocker = join(mkdtempSync(join(tmpdir(), 'shin-claude-down-')), 'a-file');
  writeFileSync(blocker, 'not a folder');
  const answers = await answerAll(world, ask(claude, { storePath: join(blocker, 'range-ask.json') }));
  assert.equal(claude.sent, 0);
  for (const a of answers) assert.ok(rangeOk(a.range), a.barcode);
  assert.ok(answers.filter((a) => a.noRangeReason === 'cap_store_error').length >= 3);
});

test('6.7 breaker: twenty scans while Claude is down send only the threshold, and all twenty answer', async () => {
  const world = buildWorld();
  const claude = brokenClaude('outage');
  const breaker: RangeBreaker = rangeBreaker({ threshold: 5, cooldownMs: 60_000 });
  const store = tempStore();
  let answered = 0;
  const reasons = new Set<string | null>();
  for (let i = 0; i < 5; i++) {
    for (const a of await answerAll(world, ask(claude, { breaker, storePath: store }))) {
      if (rangeOk(a.range)) answered += 1;
      reasons.add(a.noRangeReason);
    }
  }
  assert.equal(answered, 20, '100% answered');
  assert.equal(claude.sent, 5, 'after five failures in a row the circuit opened and nothing else went out');
  assert.ok(reasons.has('circuit_open'));
});

test('6.7 control: the same outage with the breaker off sends a call for every scan that needs one', async () => {
  const world = buildWorld();
  const claude = brokenClaude('outage');
  for (let i = 0; i < 5; i++) await answerAll(world, ask(claude, { breaker: null }));
  assert.ok(claude.sent > 5, `sent ${claude.sent}`);
});

test('6.7 control: Claude up answers from Claude, so the fallbacks above are a fallback and not the only road', async () => {
  const world = buildWorld();
  const up = {
    sent: 0,
    messages: { async create(body: { model: string }) { up.sent += 1; return ok(body, GOOD); } },
  };
  const answers = await answerAll(world, ask(up as never), 2000);
  assert.ok(answers.filter((a) => a.rangeSource === 'claude_typical').length >= 3, JSON.stringify(answers.map((a) => a.rangeSource)));
});
