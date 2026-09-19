/**
 * The one Gemini call, unit level: which model, what is asked, how the reply is
 * read, and the hidden arithmetic check. No key and no network: every call goes
 * through a recorded transport (Jamin: the key is for live phone testing only).
 * The socket-level version is app/test/gemini-one-call.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GEMINI_25,
  DEFAULT_GEMINI_3,
  buildRequestBody,
  checkMath,
  interpretText,
  labelOf,
  modelForScan,
  readAnswer,
  readShelfPriceCents,
  readThresholds,
  repairJson,
  runGeminiScan,
  toAnswerBlock,
  DEFAULT_THRESHOLDS,
} from '../src/providers/gemini-scan.ts';
import { fakeTransport, goodAnswer, httpBody } from '../../app/test/gemini-double.ts';

const NO_ENV = {} as NodeJS.ProcessEnv;
const on = (family: '2.5' | '3.x'): string => {
  for (let i = 0; i < 200; i++) if (modelForScan(`d${i}`, NO_ENV).family === family) return `d${i}`;
  throw new Error('none');
};
const scan = { kind: 'barcode' as const, barcode: '0068100084245' };
const parsed = (over: Record<string, unknown> = {}) => readAnswer(goodAnswer(over));

test('the model is a stable function of the device, defaults to 2.5, and SHIN_GEMINI_MODEL overrides it (item 4)', () => {
  assert.equal(DEFAULT_GEMINI_25, 'gemini-2.5-flash');
  const a = modelForScan('device-1', NO_ENV);
  assert.deepEqual(modelForScan('device-1', NO_ENV), a, 'the same device got two different models');
  const seen = new Set(Array.from({ length: 60 }, (_, i) => modelForScan(`d${i}`, NO_ENV).model));
  assert.deepEqual([...seen].sort(), [DEFAULT_GEMINI_25, DEFAULT_GEMINI_3].sort(), 'both models must be in use');
  const forced = modelForScan('device-1', { SHIN_GEMINI_MODEL: 'gemini-x-9' } as NodeJS.ProcessEnv);
  assert.equal(forced.model, 'gemini-x-9');
  assert.equal(forced.via, 'env');
});

test('on 2.5 the JSON shape is in the prompt text with no schema; on 3.x the schema is sent (item 5)', () => {
  const c25 = modelForScan(on('2.5'), NO_ENV);
  const c3 = modelForScan(on('3.x'), NO_ENV);
  const b25 = buildRequestBody(scan, c25).body as unknown as Record<string, unknown>;
  const b3 = buildRequestBody(scan, c3).body as unknown as Record<string, unknown>;
  assert.equal(b25.response_format, undefined);
  assert.equal(b25.generation_config, undefined);
  assert.match(JSON.stringify(b25.input), /Return ONLY one JSON object/);
  assert.ok(b3.response_format, 'the 3.x request lost its schema');
  assert.deepEqual(b25.tools, [{ type: 'google_search' }]);
});

test('the shelf price and the thresholds are in the prompt, and a missing range falls back to the default (item 6)', () => {
  const choice = modelForScan(on('2.5'), NO_ENV);
  const withBoth = buildRequestBody(
    { ...scan, shelfPriceCents: 449, thresholds: readThresholds({ lineUnderPct: 15, lineOverPct: 25 }) },
    choice,
  ).prompt.user;
  assert.match(withBoth, /4\.49/);
  assert.match(withBoth, /Good range: 15% or more below the median/);
  assert.match(withBoth, /Bad range: more than 25% above the median/);
  const bare = buildRequestBody({ ...scan, thresholds: DEFAULT_THRESHOLDS }, choice).prompt.user;
  assert.match(bare, /Good range: 10% or more below the median/);
  assert.match(bare, /Great range: 20% or more below the median/);
  assert.match(bare, /default range/);
  assert.equal(readThresholds('{"lineUnderPct":5,"lineOverPct":30}').underPct, 5);
  assert.equal(readThresholds('not json').source, 'default');
  assert.equal(readShelfPriceCents(-3), null);
  assert.equal(readShelfPriceCents('449'), 449);
});

test('a barcode request carries no image part, a photo request carries one (item 1)', () => {
  const choice = modelForScan(on('3.x'), NO_ENV);
  const parts = (r: ReturnType<typeof buildRequestBody>) => (r.body as unknown as { input: Array<{ type: string }> | string }).input;
  const barcode = parts(buildRequestBody(scan, choice));
  assert.ok(typeof barcode === 'string' || !barcode.some((p) => p.type === 'image'));
  const photo = parts(
    buildRequestBody({ kind: 'photo', image: { bytes: Buffer.from('89504e470d0a1a0a', 'hex'), mediaType: 'image/png' } }, choice),
  );
  assert.ok(Array.isArray(photo) && photo.some((p) => p.type === 'image'));
});

test('a reply cut off mid-string is repaired; prose with no JSON is marked failed, not thrown (item 5)', () => {
  const whole = JSON.stringify(goodAnswer());
  const cut = whole.slice(0, whole.indexOf('"reviews"') + 12);
  const r = interpretText(cut);
  assert.equal(r.status, 'repaired');
  assert.ok(r.value && typeof r.value === 'object');
  assert.equal(interpretText(whole).status, 'clean');
  assert.equal(interpretText('sorry, I cannot help').status, 'failed');
  assert.equal(interpretText(null).status, 'none');
  assert.equal(repairJson('no braces here'), null);
});

test('runGeminiScan never throws: garbage text and an HTTP 503 both come back marked low confidence (item 5)', async () => {
  const garbage = fakeTransport(() => ({ text: httpBody('{"product": {"name": "brok') }));
  const g = await runGeminiScan(scan, { apiKey: 'k', deviceId: on('2.5'), transport: garbage.transport });
  assert.equal(g.lowConfidence, true);
  assert.equal(garbage.calls.length, 1, 'a parse failure was retried');
  const down = fakeTransport(() => ({ status: 503, text: 'unavailable' }));
  const d = await runGeminiScan(scan, { apiKey: 'k', deviceId: on('2.5'), transport: down.transport });
  assert.equal(d.lowConfidence, true);
  assert.ok(d.failure, 'an outage carried no failure class');
  assert.equal(down.calls.length, 1, 'an outage fell back to a second call');
  const nokey = await runGeminiScan(scan, { apiKey: '', deviceId: 'x', env: { GEMINI_API_KEY: '' } as NodeJS.ProcessEnv });
  assert.equal(nokey.failure, 'model_client_error');
});

// 2026-09-19 (audit rows 16 and 32): a guard that says `false` now means the HARD runaway
// ceiling only; the soft cap is the next test and never stops a call.
test('the spend guard stops the call before it is sent only at the hard ceiling', async () => {
  const t = fakeTransport();
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport, spendGuard: () => false });
  assert.equal(run.failure, 'spend_cap_reached');
  assert.equal(run.overCap, true);
  assert.equal(run.lowConfidence, true, 'a stopped call is marked, never silent');
  assert.equal(t.calls.length, 0);
});

test('crossing the SOFT spend cap marks the run over_cap and still makes the call (always an answer)', async () => {
  const t = fakeTransport();
  const run = await runGeminiScan(scan, {
    apiKey: 'k',
    deviceId: 'x',
    transport: t.transport,
    spendGuard: () => ({ allowed: true, overCap: true }),
  });
  assert.equal(t.calls.length, 1, 'the soft cap refused a scan');
  assert.equal(run.overCap, true);
  assert.equal(run.failure, null);
  assert.ok(run.answer, 'the scan came back without an answer');
  const under = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: fakeTransport().transport, spendGuard: () => true });
  assert.equal(under.overCap, false);
});

test('the block shows Gemini\'s own median, not one recomputed from its offers (item 3)', async () => {
  const wrong = goodAnswer({ price_verdict: { ...(goodAnswer().price_verdict as object), median_unit_price: 7.5 } });
  const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(wrong)) }));
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  const block = toAnswerBlock(run) as unknown as { verdict: { median: number } };
  assert.equal(block.verdict.median, 7.5);
  assert.match(labelOf(run)?.label ?? '', /^Kraft Dinner Original/);
});

test('the hidden math check passes a consistent answer and flags a wrong median (item 14)', () => {
  const ok = checkMath(parsed(), DEFAULT_THRESHOLDS);
  assert.equal(ok.checked, true);
  assert.deepEqual(ok.mismatches, []);
  const bad = checkMath(parsed({ price_verdict: { ...(goodAnswer().price_verdict as object), median_unit_price: 9 } }), DEFAULT_THRESHOLDS);
  assert.ok(bad.mismatches.some((m) => m.field === 'median_unit_price'));
  const wrongLine = checkMath(parsed(), { underPct: 20, overPct: 20, source: 'user' });
  assert.ok(wrongLine.mismatches.length > 0, 'an answer computed on the wrong thresholds passed');
  assert.equal(checkMath(null, DEFAULT_THRESHOLDS).checked, false);
});

test('three ranges and a unit are read, 30 percent is allowed, and an older client still works (item 44, W9)', () => {
  const t = readThresholds({ unit: 'percent', great: 30, good: 15, bad: 25 });
  assert.deepEqual([t.greatPct, t.underPct, t.overPct, t.unit, t.source], [30, 15, 25, 'percent', 'user']);
  assert.equal(readThresholds({ unit: 'percent', great: 5, good: 15 }).greatPct, 15, 'great is never shallower than good');
  const old = readThresholds('{"lineUnderPct":5,"lineOverPct":30}');
  assert.deepEqual([old.underPct, old.overPct, old.greatPct], [5, 30, 20]);
  const d = readThresholds({ unit: 'amount', great: 3, good: 1.5, bad: 2 });
  assert.equal(d.unit, 'amount');
  assert.deepEqual(d.amounts, { great: 3, good: 1.5, bad: 2 });
  assert.equal(readThresholds({ unit: 'amount' }).source, 'default', 'an amount unit with no amounts is the default range');
  assert.equal(readThresholds({ unit: 'percent', good: -4 }).source, 'default');
});

test('dollar mode reaches the prompt as amounts and, with no typed price, the hidden check skips the zone', () => {
  const t = readThresholds({ unit: 'amount', great: 3, good: 1.5, bad: 2 });
  const p = buildRequestBody({ ...scan, thresholds: t }, modelForScan(on('2.5'), NO_ENV)).prompt.user;
  assert.match(p, /Unit: DOLLAR AMOUNTS/);
  assert.match(p, /Great range: 3 or more below the median/);
  assert.doesNotMatch(p, /Good range: [\d.]+%/);
  assert.equal(checkMath(parsed(), { ...t, underPct: 20, overPct: 20 }).mismatches.length, 0, 'zone numbers were checked against a percent that is not the user\'s');
});

/*
 * Dollar mode, item 14. The fixture answer: median 3.00 per 100 g in CAD, a 225 g shelf, so the
 * median at the shelf's size is 3.00 x 2.25 = 6.75. The user's lines: good 1.50 below, bad 2.00 above.
 * A typed price of 6.00 is 0.75 under (middle), 5.00 is 1.75 under (under_your_line), 9.00 is 2.25
 * over (over_your_line). The shelf unit price is the typed price over 2.25 (hundreds of grams).
 */
const DOLLARS = readThresholds({ unit: 'amount', great: 3, good: 1.5, bad: 2 });
function shelfAnswer(typed: number, zone: string | null, extra: Record<string, unknown> = {}, verdict: Record<string, unknown> = {}) {
  return parsed({
    price_verdict: {
      ...(goodAnswer().price_verdict as object),
      shelf: { unit_price: Math.round((typed / 2.25) * 1000) / 1000, pct_vs_median: 0, position: 50, zone, label: 'x' },
      ...verdict,
    },
    ...extra,
  });
}
const ctx = (cents: number | null, currency: string | null = 'CAD') => ({ shelfPriceCents: cents, currency });

test('dollar mode: the zone is recomputed from Gemini\'s median, the typed price and the dollar lines, and a match passes', () => {
  for (const [typed, zone] of [[6, 'middle'], [5, 'under_your_line'], [9, 'over_your_line']] as const) {
    const r = checkMath(shelfAnswer(typed, zone), DOLLARS, ctx(typed * 100));
    assert.deepEqual(r.mismatches, [], `${typed} stated ${zone}`);
    assert.deepEqual(r.skipped, [], `${typed} was skipped though every input was there`);
  }
});

test('dollar mode: a zone that does not follow from the median and the typed price is marked like percent mode marks it', () => {
  const r = checkMath(shelfAnswer(9, 'middle'), DOLLARS, ctx(900));
  assert.deepEqual(r.mismatches, [{ field: 'shelf.zone', stated: 'middle', recomputed: 'over_your_line' }]);
  const under = checkMath(shelfAnswer(5, 'over_your_line'), DOLLARS, ctx(500));
  assert.deepEqual(under.mismatches.map((m) => [m.field, m.stated, m.recomputed]), [['shelf.zone', 'over_your_line', 'under_your_line']]);
  // The comparison unit "item" needs no size: median 3.00 an item, typed 5.00 is 2.00 over, bad is more than 2.00 over.
  const item = { comparison_unit: 'item', median_unit_price: 3, shelf: { unit_price: 5, pct_vs_median: 66, position: 90, zone: 'over_your_line', label: 'x' } };
  const edge = checkMath(parsed({ price_verdict: { ...(goodAnswer().price_verdict as object), ...item } }), DOLLARS, ctx(500));
  assert.deepEqual(edge.mismatches, [], 'exactly on the bad line is inside the rounding band, so either zone passes');
  const clear = checkMath(parsed({ price_verdict: { ...(goodAnswer().price_verdict as object), ...item, shelf: { ...item.shelf, unit_price: 6, zone: 'middle' } } }), DOLLARS, ctx(600));
  assert.equal(clear.mismatches.length, 1, '3.00 over the median at one item, stated middle, is over');
});

test('dollar mode: each input that is missing skips the zone with its reason and never guesses or passes it', () => {
  const skipped = (r: ReturnType<typeof checkMath>) => r.skipped.map((s) => s.reason);
  assert.deepEqual(skipped(checkMath(shelfAnswer(9, 'middle'), DOLLARS, ctx(null))), ['no_shelf_price']);
  assert.deepEqual(skipped(checkMath(shelfAnswer(9, 'middle'), DOLLARS)), ['no_shelf_price']);
  assert.deepEqual(skipped(checkMath(shelfAnswer(9, 'middle'), DOLLARS, ctx(900, 'USD'))), ['currency_differs'], 'a typed price in USD against a CAD answer');
  assert.deepEqual(skipped(checkMath(shelfAnswer(9, 'middle'), DOLLARS, ctx(900, null))), ['user_currency_unknown']);
  const eur = shelfAnswer(9, 'middle', { pricing_summary: { shelf_price: 9, shelf_currency: 'EUR' } });
  assert.deepEqual(skipped(checkMath(eur, DOLLARS, ctx(900))), ['currency_differs'], 'Gemini read the shelf in another currency');
  assert.deepEqual(skipped(checkMath(shelfAnswer(9, null), DOLLARS, ctx(900))), ['no_stated_shelf_zone']);
  const noSize = parsed({ price_verdict: { ...(goodAnswer().price_verdict as object), shelf: { unit_price: null, pct_vs_median: 0, position: 50, zone: 'middle', label: 'x' } } });
  assert.deepEqual(skipped(checkMath(noSize, DOLLARS, ctx(900))), ['shelf_size_unknown']);
  for (const r of [checkMath(shelfAnswer(9, 'middle'), DOLLARS, ctx(null)), checkMath(shelfAnswer(9, 'middle'), DOLLARS, ctx(900, 'USD'))]) {
    assert.deepEqual(r.mismatches, [], 'a skipped zone must not be reported as a mismatch');
  }
});

test('dollar mode still checks the median and the count, and percent mode is unchanged by the new context', () => {
  const badMedian = checkMath(shelfAnswer(6, 'middle', {}, { median_unit_price: 9 }), DOLLARS, ctx(600));
  assert.ok(badMedian.mismatches.some((m) => m.field === 'median_unit_price'));
  assert.deepEqual(checkMath(parsed(), DEFAULT_THRESHOLDS, ctx(900, 'USD')).mismatches, [], 'percent mode ignores the dollar context');
  assert.deepEqual(checkMath(parsed(), DEFAULT_THRESHOLDS, ctx(900, 'USD')).skipped, []);
});
