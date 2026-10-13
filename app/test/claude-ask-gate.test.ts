/**
 * REQUIREMENT 6.1: "Call Claude only when the catalogue cannot produce a range: cheapest model, no
 * web search, under the monthly cap. Pass when 0 calls with a search tool; 0 calls where a range
 * existed." Plan Part 6: "One guarded call with no tools, captured and checked in tests."
 *
 * The capture is the outgoing request itself: the real ask (identify/src/range-ask.ts) through the
 * real Anthropic provider, over a fake Messages client that records every body it is handed. So what
 * is checked is the body that would go on the wire, not what a wrapper says it sent.
 *
 * "A range existed" is judged where the shopper meets it: a request that sent a call and then
 * answered with Pexi's own range (`rangeSource: 'shin_prices'`) spent a paid call it did not need.
 *
 * In memory and OS temp folders only; no socket opens.
 */
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnthropicProvider, type MessagesClient } from '../../identify/src/providers/anthropic.ts';
import { askTypicalRange, RANGE_ASK_MODEL, type RangeIdentity } from '../../identify/src/range-ask.ts';
import * as cf from '../src/catalogue-first.ts';
import type { CanonicalBarcode } from '../src/barcode.ts';
import { AS_OF, COOKIES, LONELY_CODE, NAMES, SIZES, WINES, buildWorld, pick, rangeOk, rng, type World } from './range-world.ts';

afterEach(() => mock.restoreAll());

type Body = Record<string, unknown>;

/** A Claude that answers every ask with a valid range, keeping a copy of every body it was sent. */
export function capturingClaude(): MessagesClient & { sent: Body[] } {
  const sent: Body[] = [];
  return {
    sent,
    messages: {
      async create(body) {
        sent.push(JSON.parse(JSON.stringify(body)) as Body);
        const currency = /Currency: ([A-Z]{3})/.exec(JSON.stringify(body))?.[1] ?? 'CAD';
        return {
          id: 'msg', type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text: JSON.stringify({ known: true, low_cents: 399, high_cents: 649, currency, unit: 'each', confidence: 'low' }), citations: null }],
          stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        } as never;
      },
    },
  };
}

/** The shipped ask, over the capturing client: no cache reuse (every ask is a fresh call), no breaker. */
function realAsk(client: MessagesClient, monthlyCap = 100_000): cf.BarcodeDeps['askRange'] {
  const storePath = join(mkdtempSync(join(tmpdir(), 'shin-ask-gate-')), 'range-ask.json');
  let t = Date.parse('2026-10-13T00:00:00Z');
  return (identity: RangeIdentity) =>
    askTypicalRange(identity, { provider: new AnthropicProvider(client), storePath, monthlyCap, cacheTtlMs: 1, now: () => (t += 1000), breaker: null });
}

function deps(world: World, askRange: cf.BarcodeDeps['askRange'], over: Partial<cf.BarcodeDeps> = {}): cf.BarcodeDeps {
  return {
    lookup: null, prices: world.prices, catalogue: world.catalogue, country: 'CA', currency: 'CAD', asOf: AS_OF,
    askRange, claudeWaitMs: 2000, ...over,
  };
}
const code = (gtin: string) => ({ gtin, how: 'as_read', variableMeasure: null }) as unknown as CanonicalBarcode;

/** Every body that went out: no tool of any kind, no search anywhere in it, the cheapest model. */
function assertGuarded(sent: readonly Body[]): void {
  for (const body of sent) {
    assert.equal('tools' in body, false, 'no tools key: no web search exists for the model');
    assert.equal('tool_choice' in body, false);
    assert.equal(/web_search|"type":"tool/i.test(JSON.stringify(body)), false, 'nothing in the body names a tool');
    assert.equal(body.model, RANGE_ASK_MODEL);
  }
}

test('6.1: an item in a priced category with a size outside the verdict\'s pack band makes 0 calls; the range is Pexi\'s own', async () => {
  mock.method(console, 'warn', () => {});
  const world = buildWorld();
  const claude = capturingClaude();
  const row: cf.CatalogueRow = { code: '0626990000031', name: 'Big Cookie Tub', brands: 'Tubco', quantity: '2 kg', leafCategory: 'en:cookies', categoryPath: COOKIES };
  const { answer } = await cf.answerBarcodeFromCatalogue(code(row.code), deps(world, realAsk(claude), { lookup: { byGtin: () => row } }));
  assert.equal(answer.rangeSource, 'shin_prices', JSON.stringify(answer.range));
  assert.equal(claude.sent.length, 0, 'a range existed, so Claude was not called');
});

test('6.1: an item Pexi holds no price for in its department makes exactly one guarded call, and its range is Claude\'s', async () => {
  const world = buildWorld();
  const claude = capturingClaude();
  const row = world.rows.find((r) => r.code === LONELY_CODE)!;
  const { answer } = await cf.answerBarcodeFromCatalogue(code(row.code), deps(world, realAsk(claude), { lookup: { byGtin: () => row } }));
  assert.equal(claude.sent.length, 1);
  assertGuarded(claude.sent);
  assert.equal(answer.rangeSource, 'claude_typical');
  assert.deepEqual([answer.range?.lowCents, answer.range?.highCents], [399, 649]);
});

test('6.1: under the monthly cap: with a cap of 3, six unpriced items send 3 calls, and all six still answer with a range', async () => {
  const world = buildWorld();
  const claude = capturingClaude();
  const ask = realAsk(claude, 3);
  const reasons: (string | null)[] = [];
  for (let i = 0; i < 6; i++) {
    const row: cf.CatalogueRow = { code: `06269900001${i}0`, name: `Balm ${i}`, brands: null, quantity: '15 ml', leafCategory: 'en:lonely-things', categoryPath: ['en:cosmetics', 'en:lonely-things'] };
    const { answer } = await cf.answerBarcodeFromCatalogue(code(row.code), deps(world, ask, { lookup: { byGtin: () => row } }));
    assert.ok(rangeOk(answer.range), `item ${i} has a range`);
    reasons.push(answer.noRangeReason);
  }
  assert.equal(claude.sent.length, 3);
  assertGuarded(claude.sent);
  assert.deepEqual(reasons.slice(3), ['monthly_cap_reached', 'monthly_cap_reached', 'monthly_cap_reached']);
});

const N = Number(process.env.SHIN_PROPERTY_N ?? 800);

test(`6.1 sweep: ${N} random requests over real prices; every outgoing body is guarded, and 0 calls went out where a range existed`, async () => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  const world = buildWorld();
  const claude = capturingClaude();
  const ask = realAsk(claude);
  const r = rng(61);
  const wasted: string[] = [];
  let shin = 0;
  for (let i = 0; i < N; i++) {
    const before = claude.sent.length;
    const base = pick(r, world.rows);
    const row: cf.CatalogueRow = {
      ...base,
      code: `5${String(i).padStart(12, '0')}`,
      name: pick(r, [base.name, ...NAMES]),
      quantity: pick(r, [base.quantity, ...SIZES]),
    };
    const named = { name: pick(r, NAMES), brand: null, size: pick(r, SIZES), source: 'open_food_facts' as const };
    const sortTo = pick(r, [COOKIES, WINES, null]);
    const d = deps(world, ask, {
      lookup: { byGtin: () => row },
      sortName: async () => (sortTo ? { leafCategory: sortTo[sortTo.length - 1]!, categoryPath: sortTo } : null),
    });
    const entry = pick(r, ['barcode', 'named'] as const);
    const { answer } =
      entry === 'barcode' ? await cf.answerBarcodeFromCatalogue(code(row.code), d) : await cf.answerNamedItem(named, row.code, null, d);
    assert.ok(rangeOk(answer.range), `request ${i} has a range`);
    if (answer.rangeSource === 'shin_prices') shin += 1;
    if (claude.sent.length > before && answer.rangeSource === 'shin_prices') {
      wasted.push(`request ${i}: ${entry} ${JSON.stringify(entry === 'barcode' ? { q: row.quantity, leaf: row.leafCategory } : { ...named, sortTo })} -> ${answer.range?.basis}`);
    }
  }
  assertGuarded(claude.sent);
  assert.ok(claude.sent.length > 0, 'the sweep reached the Claude rung at least once');
  assert.ok(shin > 0, 'the sweep reached Pexi\'s own ranges at least once');
  assert.equal(wasted.length, 0, `${wasted.length} calls went out where a range existed. First five:\n${wasted.slice(0, 5).join('\n')}`);
});
