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
  assert.match(withBoth, /15% below the median/);
  assert.match(withBoth, /25% above the median/);
  const bare = buildRequestBody({ ...scan, thresholds: DEFAULT_THRESHOLDS }, choice).prompt.user;
  assert.match(bare, /10% below the median/);
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

test('the spend guard stops the call before it is sent (rule: the cap stands)', async () => {
  const t = fakeTransport();
  const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: 'x', transport: t.transport, spendGuard: () => false });
  assert.equal(run.failure, 'spend_cap_reached');
  assert.equal(t.calls.length, 0);
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
