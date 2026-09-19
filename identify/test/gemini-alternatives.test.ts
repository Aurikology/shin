/**
 * Alternatives ride in the ONE Gemini call (docs/beta-gaps-2026-09-19.md item 18,
 * with the market rules of item 19). Four places carry them, and each test below
 * fails if its place drops them: the PROMPT (mode, constraints, market rules), the
 * SCHEMA (the section and its required fields), the PARSER (tolerant, never fails
 * the scan) and the ANSWER BLOCK the phone is sent. The sheet is
 * app/test/gemini-alternatives-sheet.test.mjs; the server wire is
 * app/test/gemini-one-call.test.ts. No key and no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ALTERNATIVES,
  alternativesModeFor,
  buildRequestBody,
  buildScanPrompt,
  loadEngine,
  modelForScan,
  readAlternatives,
  readAnswer,
  runGeminiScan,
  skeleton,
  toAnswerBlock,
} from '../src/providers/gemini-scan.ts';
import { fakeTransport, goodAnswer, httpBody } from '../../app/test/gemini-double.ts';

const NO_ENV = {} as NodeJS.ProcessEnv;
const on = (family: '2.5' | '3.x'): string => {
  for (let i = 0; i < 200; i++) if (modelForScan(`d${i}`, NO_ENV).family === family) return `d${i}`;
  throw new Error('none');
};
const scan = { kind: 'barcode' as const, barcode: '0068100084245' };

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Store-brand macaroni',
  brand: 'No Name',
  kind: 'substitute',
  reason: 'Not organic, two dollars less.',
  store_name: 'Beta Foods',
  store_type: 'supermarket',
  condition: 'new',
  price_text: '$1.99',
  price_cents: 199,
  currency: 'CAD',
  size: { value: 225, unit: 'g' },
  unit_price_cents: null,
  membership_required: false,
  distance_km: null,
  attributes: [],
  url: 'https://example.com/nn',
  constraint_notes: [],
  ...over,
});

/* ------------------------------------------------------------------ prompt */

test('the prompt carries the alternatives section, the mode, the constraints and the market rules, with no placeholder left open', () => {
  const p = buildScanPrompt(
    {
      ...scan,
      shelfPriceCents: 449,
      alternatives: { mode: 'validation', storeType: 'supermarket' },
      marketFields: { MARKET_COUNTRY_OR_UNKNOWN: 'FR', MARKET_CURRENCY_OR_UNKNOWN: 'EUR', CROSS_BORDER_HINT: 'possibly_alike' },
    },
    '2.5',
  ).user;
  assert.match(p, /## ALTERNATIVES/);
  assert.match(p, /Mode for this scan: validation/);
  assert.match(p, /Where the user shops \(store type, if known\): supermarket/);
  for (const constraint of [/Bulk\./, /Farm versus store/, /New versus used/, /Upgrades/, /decide sensibly on a constraint not listed/]) {
    assert.match(p, constraint, `the prompt lost the constraint ${constraint}`);
  }
  assert.match(p, /## MARKET RULES/);
  assert.match(p, /Never convert currencies/);
  assert.match(p, /Country: FR/);
  assert.match(p, /Currency: EUR/);
  assert.match(p, /Cross-border hint from Shin: possibly_alike/);
  assert.doesNotMatch(p, /\{\{[A-Z0-9_]+\}\}/, 'a placeholder was left unfilled');
});

test('with no location and no shop the market and the store type say unknown, never a default country', () => {
  const p = buildScanPrompt(scan, '2.5').user;
  assert.match(p, /Country: unknown/);
  assert.match(p, /Currency: unknown/);
  assert.match(p, /Where the user shops \(store type, if known\): unknown/);
  assert.doesNotMatch(p, /Country: (CA|Canada)/);
  assert.doesNotMatch(p, /\{\{[A-Z0-9_]+\}\}/);
});

test('the mode is read from whether a shelf price came with the scan, and an explicit mode wins', () => {
  assert.equal(alternativesModeFor(449), 'validation');
  assert.equal(alternativesModeFor(null), 'switching');
  assert.equal(alternativesModeFor(0), 'switching');
  assert.equal(alternativesModeFor(undefined), 'switching');
  assert.equal(alternativesModeFor(449, 'switching'), 'switching');
  assert.equal(alternativesModeFor(null, 'validation'), 'validation');
  assert.equal(alternativesModeFor(449, 'nonsense'), 'validation', 'an unknown explicit mode is ignored');
  // ...and it is what the prompt says when nothing else was given.
  assert.match(buildScanPrompt({ ...scan, shelfPriceCents: 300 }, '2.5').user, /Mode for this scan: validation/);
  assert.match(buildScanPrompt(scan, '2.5').user, /Mode for this scan: switching/);
});

/* ------------------------------------------------------------------ schema */

test('the schema has a required alternatives array with the fields the parser and the sheet read', () => {
  const schema = loadEngine().schema as any;
  const alt = schema.properties.alternatives;
  assert.equal(alt.type, 'array', 'alternatives is not an array in the schema');
  assert.ok(schema.required.includes('alternatives'), 'alternatives is not required by the schema');
  for (const field of ['name', 'kind', 'reason', 'store_type', 'condition', 'price_text', 'price_cents', 'currency', 'size', 'constraint_notes']) {
    assert.ok(alt.items.properties[field], `the schema dropped alternatives[].${field}`);
  }
  // On 3.x the schema is sent as the response format; on 2.5 its shape is written into the prompt.
  const three = buildRequestBody(scan, { model: 'gemini-3.8-flash', family: '3.x', via: 'env' }).body;
  assert.ok((three.response_format?.schema as any).properties.alternatives, 'the 3.x request lost alternatives');
  const two = buildRequestBody(scan, { model: 'gemini-2.5-flash', family: '2.5', via: 'env' });
  assert.equal(two.body.response_format, undefined);
  assert.match(two.prompt.user, /"alternatives":\[\{"name"/, 'the 2.5 prompt does not show the alternatives shape');
  assert.ok(JSON.stringify(skeleton(schema)).includes('constraint_notes'));
});

/* ------------------------------------------------------------------ parser */

test('the parser keeps good rows as returned, price text untouched, at most five', () => {
  const r = readAlternatives([row(), row({ name: 'Second', price_text: '1.5 CAD' })]);
  assert.equal(r.status, 'ok');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].name, 'Store-brand macaroni');
  assert.equal(r.items[0].priceText, '$1.99', 'the price text was reformatted');
  assert.equal(r.items[1].priceText, '1.5 CAD', 'the price text was reformatted');
  assert.equal(r.items[0].reason, 'Not organic, two dollars less.');
  assert.equal(r.items[0].size, '225 g');
  assert.equal(readAlternatives(Array.from({ length: 9 }, (_, i) => row({ name: `n${i}` }))).items.length, MAX_ALTERNATIVES);
});

test('with no price text the price is written as text from the minor units, and a zero-decimal currency is not divided', () => {
  assert.match(readAlternatives([row({ price_text: null, price_cents: 199, currency: 'CAD' })]).items[0].priceText, /1\.99/);
  const yen = readAlternatives([row({ price_text: null, price_cents: 500, currency: 'JPY' })]).items[0].priceText;
  assert.match(yen, /500/);
  assert.doesNotMatch(yen, /5\.00/, 'a currency with no minor unit was divided by 100');
});

test('a bad or missing alternatives section never throws: it is marked, and the good rows survive', () => {
  assert.equal(readAlternatives(undefined).status, 'missing');
  assert.equal(readAlternatives('none').status, 'missing');
  assert.equal(readAlternatives({}).status, 'missing');
  assert.equal(readAlternatives([]).status, 'empty');
  for (const junk of [null, 7, 'x', [], [[]], [null], [{}], [{ name: '' }], [{ name: 'A' }], [{ name: 'A', price_text: 5 }]]) {
    assert.doesNotThrow(() => readAlternatives(junk));
    assert.deepEqual(readAlternatives(junk).items, [], `junk ${JSON.stringify(junk)} produced a row`);
  }
  const mixed = readAlternatives([row(), { name: 'No price' }, { price_text: '$1' }, 'text', row({ name: 'Last' })]);
  assert.equal(mixed.status, 'partial');
  assert.deepEqual(mixed.items.map((i) => i.name), ['Store-brand macaroni', 'Last']);
  assert.equal(mixed.dropped.length, 3);
  // an unknown kind and condition are repaired, not dropped
  const odd = readAlternatives([row({ kind: 'wat', condition: 'mint' })]).items[0];
  assert.equal(odd.kind, 'other');
  assert.equal(odd.condition, 'unknown');
});

/* ------------------------------------------------------------- the answer */

test('alternatives reach the answer block the phone is sent, and stay out of the verdict', () => {
  const answer = readAnswer(goodAnswer({ alternatives: [row()] }));
  assert.equal(answer?.alternatives.items.length, 1);
  const block = toAnswerBlock({
    answer,
    offers: [],
    searchQueries: [],
    citations: [],
    model: 'gemini-2.5-flash',
    lowConfidence: false,
    confidenceReasons: [],
    parseStatus: 'clean',
    shelfPriceCents: null,
  } as any);
  assert.equal(block.alternatives.length, 1);
  assert.equal(block.alternatives[0].priceText, '$1.99');
  assert.equal(block.alternativesStatus, 'ok');
  assert.equal(block.verdict?.median, 3, 'an alternative moved the verdict');
});

test('a scan whose alternatives are broken or absent is still answered in full and not marked unsure (rule 6)', async () => {
  for (const alternatives of [undefined, 'oops', [{ nope: true }], [row()]]) {
    const t = fakeTransport(() => ({ text: httpBody(JSON.stringify(goodAnswer(alternatives === undefined ? {} : { alternatives }))) }));
    const run = await runGeminiScan(scan, { apiKey: 'k', deviceId: on('2.5'), transport: t.transport });
    const block = toAnswerBlock(run);
    assert.equal(run.lowConfidence, false, `alternatives ${JSON.stringify(alternatives)} lowered confidence`);
    assert.equal(block.name, 'Kraft Dinner Original');
    assert.equal(block.verdict?.median, 3);
    assert.equal(t.calls.length, 1, 'alternatives cost a second call');
  }
  const good = await runGeminiScan(scan, {
    apiKey: 'k',
    deviceId: on('2.5'),
    transport: fakeTransport(() => ({ text: httpBody(JSON.stringify(goodAnswer({ alternatives: [row()] }))) })).transport,
  });
  assert.equal(toAnswerBlock(good).alternatives.length, 1);
});
