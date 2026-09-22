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
  blockStarts,
  runGeminiScan,
  toAnswerBlock,
  DEFAULT_THRESHOLDS,
} from '../src/providers/gemini-scan.ts';
import { fakeTransport, goodAnswer, httpBody } from '../../app/test/gemini-double.ts';

// These tests exercise the 2.5/3.x comparison, which runs only with SHIN_GEMINI_SPLIT=1 (default is 3.x for every scan).
const NO_ENV = { SHIN_GEMINI_SPLIT: '1' } as NodeJS.ProcessEnv;
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

test('with no split setting every scan goes to 3.x, because 2.5 is not accessible on the beta server (Jamin 2026-09-22)', () => {
  const plain = {} as NodeJS.ProcessEnv;
  const seen = new Set(Array.from({ length: 60 }, (_, i) => modelForScan(`d${i}`, plain).model));
  assert.deepEqual([...seen], [DEFAULT_GEMINI_3], 'a device was routed to a model other than 3.x');
  assert.equal(modelForScan('d1', plain).via, 'default');
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

/**
 * One offer in the median, as Gemini's answer reads under the scan prompt's PRICE MATH after
 * 2026-09-19: the median is that one price, so the span is 1.5 times the range (15), the offer
 * sits at 50, and the boundaries are 50 -/+ 10/15*50.
 */
function oneOfferAnswer(verdict: Record<string, unknown> = {}, offerOver: Record<string, unknown> = {}): Record<string, unknown> {
  const base = goodAnswer();
  const first = (base.offers as Record<string, unknown>[])[0];
  return goodAnswer({
    offers: [{ ...first, unit_price: 3, price: 3, pct_vs_median: 0, position: 50, in_median: true, ...offerOver }],
    price_verdict: {
      ...(base.price_verdict as object),
      offers_in_median: 1,
      median_unit_price: 3,
      span_pct: 15,
      zone_under_boundary: 16.667,
      zone_over_boundary: 83.333,
      confidence: 'thin',
      ...verdict,
    },
  });
}

test('the hidden math check accepts one offer as a verdict, and still flags none as one (one price is the median)', () => {
  const ok = checkMath(parsed(oneOfferAnswer()), DEFAULT_THRESHOLDS);
  assert.equal(ok.checked, true);
  assert.deepEqual(ok.mismatches, [], 'a correct one-offer verdict was logged as a mismatch');
  const refused = checkMath(parsed(oneOfferAnswer({ verdict_available: false, no_verdict_reason: 'no_offers_on_line' })), DEFAULT_THRESHOLDS);
  assert.ok(
    refused.mismatches.some((m) => m.field === 'verdict_available' && m.stated === false && m.recomputed === true),
    'a refusal at one offer is now the wrong answer, and the check must say so',
  );
  const none = checkMath(parsed(oneOfferAnswer({}, { in_median: false, unit_price: null, position: null, pct_vs_median: null })), DEFAULT_THRESHOLDS);
  assert.ok(
    none.mismatches.some((m) => m.field === 'verdict_available' && m.stated === true && m.recomputed === false),
    'a verdict with no offer in the median is still a mismatch',
  );
});

test('a members-only and a marketplace offer stay in the median and reach the phone marked', async () => {
  const base = goodAnswer();
  const offers = (base.offers as Record<string, unknown>[]).map((o, i) =>
    i === 0 ? { ...o, membership_required: true } : i === 2 ? { ...o, marketplace_status: 'marketplace' } : o,
  );
  const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(goodAnswer({ offers }))) }));
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  const block = toAnswerBlock(run) as unknown as {
    verdict: { n: number; points: { retailer: string; marks: string[] }[]; excluded: unknown[] };
  };
  assert.equal(block.verdict.n, 3);
  assert.deepEqual(block.verdict.excluded, [], 'neither offer was left out');
  assert.deepEqual(block.verdict.points.map((p) => [p.retailer, p.marks]), [
    ['Alpha Market', ['member_only']],
    ['Beta Foods', []],
    ['Gamma Grocer', ['marketplace']],
  ]);
  assert.deepEqual(checkMath(run.answer, DEFAULT_THRESHOLDS).mismatches, [], 'the marked offers are in the recomputed median too');
});

test('a one-offer answer reaches the phone as a verdict, and none as no line', async () => {
  const one = fakeTransport(() => ({ text: httpBody(JSON.stringify(oneOfferAnswer())) }));
  const oneBlock = toAnswerBlock(await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: one.transport })) as unknown as {
    verdict: { n: number; median: number; confidence: string } | null;
    noLineReason: string | null;
  };
  assert.equal(oneBlock.verdict?.n, 1);
  assert.equal(oneBlock.verdict?.median, 3);
  assert.equal(oneBlock.verdict?.confidence, 'thin');
  assert.equal(oneBlock.noLineReason, null);
  const none = fakeTransport(() => ({
    text: httpBody(JSON.stringify(goodAnswer({
      offers: [],
      price_verdict: { ...(goodAnswer().price_verdict as object), verdict_available: false, no_verdict_reason: 'no_offers_on_line', median_unit_price: null, offers_in_median: 0 },
    }))),
  }));
  const noneBlock = toAnswerBlock(await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: none.transport })) as unknown as {
    verdict: unknown;
    noLineReason: string | null;
  };
  assert.equal(noneBlock.verdict, null);
  assert.equal(noneBlock.noLineReason, 'no_offers_on_line');
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

/*
 * ITEM 7. Grounding is skipped in exactly one case (ruling 6, docs/decisions.md
 * 2026-09-19): the scan has no searchable identity at all, where a grounded
 * query would be spent on nothing. Every other scan, including a bare typed
 * name or a bare photo, grounds exactly as before.
 */
test('grounding is skipped only when the scan has no searchable identity at all (item 7)', () => {
  const choice = modelForScan(on('2.5'), NO_ENV);
  const nothing = buildRequestBody({ kind: 'text' }, choice).body as unknown as Record<string, unknown>;
  assert.deepEqual(nothing.tools, [], 'a scan with nothing to search for still spent a grounded query');
  const barcode = buildRequestBody(scan, choice).body as unknown as Record<string, unknown>;
  assert.deepEqual(barcode.tools, [{ type: 'google_search' }], 'a barcode scan lost its grounding');
  const typed = buildRequestBody({ kind: 'text', text: 'kraft dinner' }, choice).body as unknown as Record<string, unknown>;
  assert.deepEqual(typed.tools, [{ type: 'google_search' }]);
  const typedInput = buildRequestBody({ kind: 'text', userInput: 'kraft dinner' }, choice).body as unknown as Record<string, unknown>;
  assert.deepEqual(typedInput.tools, [{ type: 'google_search' }]);
  const photo = buildRequestBody(
    { kind: 'photo', image: { bytes: Buffer.from('89504e470d0a1a0a', 'hex'), mediaType: 'image/png' } },
    choice,
  ).body as unknown as Record<string, unknown>;
  assert.deepEqual(photo.tools, [{ type: 'google_search' }]);
});

test('a scan with no searchable identity is marked ungrounded on the run, every other scan is marked grounded (item 7)', async () => {
  const withId = fakeTransport();
  const gotId = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: withId.transport });
  assert.equal(gotId.grounded, true);
  const noId = fakeTransport();
  const gotNone = await runGeminiScan({ kind: 'text' }, { apiKey: 'k', deviceId: 'x', transport: noId.transport });
  assert.equal(gotNone.grounded, false);
});

/*
 * ITEM 20. A stage breakdown carried alongside the single total that already
 * exists (`ms`), never replacing it. Each stage is a non-negative number and
 * the four stages never sum past the total the run already reports.
 */
test('the stage latency breakdown is carried alongside the total, and never sums past it (item 20)', async () => {
  const t = fakeTransport();
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  const stage = run.stageMs;
  assert.ok(stage, 'no stage breakdown was returned');
  for (const [name, v] of Object.entries(stage)) assert.ok(typeof v === 'number' && v >= 0, `${name} was not a non-negative number`);
  assert.ok(
    stage.promptBuildMs + stage.requestMs + stage.parseMs + stage.validateMs <= run.ms + 1,
    'the stages summed to more than the one total already reported',
  );
});

/*
 * ITEM 4. Two of the three live price guards (the math cross-check stays
 * audit-only, per the item 3 test above: Gemini's own median is shown as
 * stated, never recomputed). A withheld price is dropped from what the phone
 * is shown, the rest of the answer still goes out, and the withholding is
 * recorded rather than silent (ruling 4, docs/decisions.md 2026-09-19).
 */
test('an offer in the wrong currency is withheld from the phone, never replaced, and the suppression is recorded (item 4)', async () => {
  const base = goodAnswer();
  const offers = (base.offers as Record<string, unknown>[]).map((o, i) => (i === 0 ? { ...o, currency: 'USD' } : o));
  const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(goodAnswer({ offers }))) }));
  const run = await runGeminiScan({ ...scan, currency: 'CAD' }, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  const block = toAnswerBlock(run);
  assert.ok(!block.offers.some((o) => o.retailer === 'Alpha Market'), 'a USD offer against a CAD scan reached the phone');
  assert.deepEqual(run.priceSuppressions, [{ retailer: 'Alpha Market', reason: 'currency_mismatch' }]);
  assert.ok(run.answer && run.answer.product.name, 'the rest of the answer must still go out');
});

test("an offer far outside the plausibility band around Gemini's own stated median is withheld (item 4)", async () => {
  const base = goodAnswer();
  const offers = (base.offers as Record<string, unknown>[]).map((o, i) => (i === 1 ? { ...o, unit_price: 40, price: 40 } : o));
  const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(goodAnswer({ offers }))) }));
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  const block = toAnswerBlock(run);
  assert.ok(!block.offers.some((o) => o.retailer === 'Beta Foods'), 'an implausible price reached the phone');
  assert.deepEqual(run.priceSuppressions, [{ retailer: 'Beta Foods', reason: 'implausible_price' }]);
});

test('a guard with no reference to check against (no currency, no median) withholds nothing, never guesses (item 4)', async () => {
  const base = goodAnswer();
  const offers = (base.offers as Record<string, unknown>[]).map((o, i) => (i === 0 ? { ...o, currency: 'USD' } : o));
  const noVerdict = {
    ...goodAnswer({ offers }),
    price_verdict: { ...(goodAnswer().price_verdict as object), verdict_available: false, median_unit_price: null, offers_in_median: 0 },
  };
  const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(noVerdict)) }));
  // No `currency` on the scan input either, so the reference currency is unknown too.
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  assert.deepEqual(run.priceSuppressions, [], 'a guard with nothing to check against invented a suppression');
});

/*
 * ITEM 17. Re-validation is independent of whether the model was ever sent the
 * schema (2.5 never is): every unknown key is counted, never silently dropped,
 * and the count/list is recorded on the run rather than used to refuse the
 * answer (rule 6, an unchecked answer beats no answer).
 */
test('a key the schema does not allow is counted and recorded, never silently dropped (item 17)', async () => {
  const withExtra = goodAnswer({ product: { ...(goodAnswer().product as object), unexpected_field: 'nope' } });
  const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(withExtra)) }));
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  assert.equal(run.unknownKeyCount, 1);
  assert.ok(run.schemaViolations.some((v) => v.kind === 'unknown_key' && v.detail === 'unexpected_field'));
  assert.ok(run.answer, 'an unknown key must never refuse the rest of the answer');
});

test('more offers than the schema allows is counted as a violation, not silently truncated (item 17)', async () => {
  const base = goodAnswer();
  const one = (base.offers as Record<string, unknown>[])[0];
  const many = Array.from({ length: 31 }, (_, i) => ({ ...one, retailer: `Store ${i}` }));
  const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(goodAnswer({ offers: many }))) }));
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport });
  assert.ok(run.schemaViolations.some((v) => v.kind === 'too_many_items'));
});

/*
 * ITEM 17, the recovery step. A doubly-encoded reply -- the whole answer is a
 * JSON STRING holding the JSON, not the object itself -- is a known SDK
 * malformation, confirmed here to defeat both existing passes (a direct parse
 * yields a string, not an object; the balanced-bracket pass never runs because
 * there is no unescaped `{` in the outer text). It is tried only on the
 * schema-less path (family other than '3.x'): a 3.x reply was sent a schema
 * and this file trusts that path's own adherence instead. Recovery never
 * invents a field: one that was not in the reply comes back absent, not 0 or ''.
 */
test('a doubly-encoded reply is recovered on the schema-less path only, and no field is ever invented (item 17)', () => {
  const inner = { product: { brand: 'Acme', name: 'Widget' } };
  const doubled = JSON.stringify(JSON.stringify(inner));
  const recovered = interpretText(doubled, '2.5');
  assert.equal(recovered.status, 'repaired');
  assert.deepEqual(recovered.value, inner);
  assert.equal(interpretText(doubled, '3.x').status, 'failed', 'the schema-sent path got a recovery it was never asked for');
  assert.equal(interpretText(doubled).status, 'failed', 'no family named defaults to the 3.x behaviour, not the lenient one');
  const partial = JSON.stringify(JSON.stringify({ product: { brand: 'Acme' } }));
  const answer = readAnswer(interpretText(partial, '2.5').value);
  assert.equal(answer?.product.name, null, 'a field the reply never carried came back as something other than absent');
});

/*
 * TWO JSON BLOCKS IN ONE REPLY. Not a hypothetical: the recorded website run
 * (test/fixtures/gemini-website/piece4-prices-reviews-description.json) says
 * "Two JSON blocks came back concatenated in one reply, not one", the first cut
 * off mid-object and the second complete. `parseJson` already prefers the LAST
 * FENCED block for exactly that reason, but an unfenced pair got neither of the
 * two treatments: the balanced-bracket repair walked back into the TRUNCATED
 * first block and returned it as the answer, so the shopper was shown the draft
 * (one offer, no reviews, no verdict) while the complete answer sat further
 * down the same string; and two complete unfenced blocks parsed to nothing at
 * all, which is the one outcome rule 6 forbids.
 */
test('two JSON blocks in one reply: the complete LAST one is the answer, and neither case loses the reply', () => {
  const cut = '{"product":{"name":"Dove Dry Spray"},"offers":[{"retailer":"Walmart","price":9.46},{"retailer":"No Frills"';
  const whole =
    '{"product":{"name":"Dove Men+Care Dry Spray Antiperspirant Clean Comfort 107 g"},' +
    '"offers":[{"retailer":"Walmart","price":9.46,"in_median":true},{"retailer":"No Frills","price":8.99,"in_median":true}],' +
    '"reviews":[{"rating":4.5,"review_count":12,"summary":"Holds up all day."}],' +
    '"price_verdict":{"verdict_available":true,"median_unit_price":9.22,"offers_in_median":2}}';

  const pair = interpretText(`${cut}\n${whole}`, '2.5');
  assert.equal(pair.status, 'repaired');
  const fromPair = readAnswer(pair.value);
  assert.equal(fromPair?.product.name, 'Dove Men+Care Dry Spray Antiperspirant Clean Comfort 107 g', 'the truncated draft was returned instead of the complete answer');
  assert.equal(fromPair?.offers.length, 2, 'the complete block\'s offers were lost to the truncated one');
  assert.equal(fromPair?.reviews.length, 1, 'the reviews only the complete block carried were lost');
  assert.equal(fromPair?.verdict?.median, 9.22, 'the price verdict only the complete block carried was lost');

  const twoWhole = interpretText(`{"product":{"name":"a draft"}}\n${whole}`, '2.5');
  assert.equal(twoWhole.status, 'repaired', 'two complete blocks came back as no answer at all');
  assert.equal(readAnswer(twoWhole.value)?.offers.length, 2);

  // The 3.x path was sent a schema, and this recovery must not change what a
  // single clean object already does on either path.
  assert.equal(interpretText(whole, '2.5').status, 'clean');
  assert.equal(interpretText(whole, '3.x').status, 'clean');
  assert.equal(readAnswer(interpretText(`{"product":{"name":"a draft"}}\n${whole}`, '3.x').value)?.offers.length, 2);

  /* A PRETTY-PRINTED REPLY IS ONE BLOCK, however many `{` open a line in it.
     Every array element and nested value in an indented answer also begins a
     line, so a "last block wins" rule that counted those would answer a
     truncated reply with its own last offer: worse than the reading this test
     exists to fix, and silent. */
  const pretty = JSON.stringify(JSON.parse(whole), null, 2);
  assert.deepEqual(blockStarts(pretty), [0], 'a pretty-printed answer was read as several blocks');
  const cutPretty = interpretText(pretty.slice(0, pretty.length - 40), '2.5');
  assert.equal(cutPretty.status, 'repaired');
  assert.equal(readAnswer(cutPretty.value)?.offers.length, 2, 'a truncated indented reply came back as one of its own offers');
  assert.equal(readAnswer(cutPretty.value)?.product.name, 'Dove Men+Care Dry Spray Antiperspirant Clean Comfort 107 g');
});

/*
 * NO LINE AND NO SENTENCE IS THE ONE THING THE BLOCK MAY NEVER BE.
 * `app/public/js/grounded.js` prints its "why there is no line" note only for
 * `no_shelf_size` or `no_offers_on_line`; a null reason with a null verdict
 * draws nothing whatsoever, which is the defect that file's own comment
 * records ("a shopper saw nothing where a line they had seen on a previous
 * scan was missing"). Gemini can produce exactly that pair: `verdict_available`
 * false with `no_verdict_reason` null, or `verdict_available` true with a null
 * median. `no_verdict_reason` is nullable in response_schema.json and nothing
 * makes the two fields agree, so the reader has to close it, not the model.
 */
test('a verdict that cannot be drawn always names a reason, so the phone is never given a blank (rule 6)', async () => {
  const blank = async (verdict: Record<string, unknown>, shelfPriceCents: number | null) => {
    const t = fakeTransport(() => ({
      text: httpBody(JSON.stringify(goodAnswer({ price_verdict: { ...(goodAnswer().price_verdict as object), ...verdict } }))),
    }));
    return toAnswerBlock(
      await runGeminiScan({ ...scan, shelfPriceCents }, { apiKey: 'k', deviceId: 'x', transport: t.transport }),
    ) as unknown as { verdict: unknown; noLineReason: string | null };
  };

  const noReason = await blank({ verdict_available: false, no_verdict_reason: null, median_unit_price: null }, 499);
  assert.equal(noReason.verdict, null);
  assert.equal(noReason.noLineReason, 'no_offers_on_line', 'a verdict with no line and no reason left the phone with nothing to draw and nothing to say');

  const availableButNoMedian = await blank({ verdict_available: true, no_verdict_reason: null, median_unit_price: null }, 499);
  assert.equal(availableButNoMedian.verdict, null);
  assert.equal(availableButNoMedian.noLineReason, 'no_offers_on_line');

  // The two reasons already in use are unchanged.
  const noPriceTyped = await blank({ verdict_available: false, no_verdict_reason: null, median_unit_price: null }, null);
  assert.equal(noPriceTyped.noLineReason, 'no_shelf_size');
  const stated = await blank({ verdict_available: false, no_verdict_reason: 'no_offers_on_line', median_unit_price: null }, 499);
  assert.equal(stated.noLineReason, 'no_offers_on_line');
});
