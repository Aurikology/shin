/**
 * THE SCENARIO CHECK (scripts/scenarios). Tests are evidence: the tool reports numbers per scenario and only true
 * breakages fail a run, so these tests pin (1) that each finder returns the right real examples from a small fixture,
 * (2) that the judge flags a converted currency and a wrong-product answer (the negative controls: a check that has
 * never been seen to fail is not a check), (3) that a scenario with no example is said so and never faked, and (4) one
 * run end to end on the fixture through the real server, which must leave the fixture files byte for byte unchanged.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildScenarios, findExamples, judge, loadAgg, summarise, trafficShare, loadTraffic, isoDay,
  type AskResult, type Example, type FinderCtx, type Row, type Scenario,
} from '../../scripts/scenarios/core.ts';
import { PRICE_ONLY_CODE, PRODUCTS } from '../../scripts/scenarios/fixture.mts';
import { phonePath } from '../../scripts/scenarios/scenario-check.mts';
import { rng } from '../../scripts/answer-key/run.mts';

let dir = '';
let cataloguePath = '';
let pricesPath = '';
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
const code = (key: string): string => PRODUCTS.find((x) => x.key === key)!.code;
const scenario = (id: string): Scenario => buildScenarios().scenarios.find((s) => s.id === id)!;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'scenario-test-'));
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', '..', 'scripts', 'scenarios', 'fixture.mts'), dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  cataloguePath = join(dir, 'catalogue.db');
  pricesPath = join(dir, 'prices.db');
});
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a locked file on Windows */
  }
});

function withCtx<T>(f: (ctx: FinderCtx) => T): T {
  const cat = new DatabaseSync(cataloguePath, { readOnly: true });
  const prices = new DatabaseSync(pricesPath, { readOnly: true });
  try {
    const asOf = isoDay(new Date());
    return f({ cat, prices, corrections: null, asOf, rand: rng(7), agg: loadAgg(prices, asOf) });
  } finally {
    cat.close();
    prices.close();
  }
}
const codesFor = (id: string, n = 10): string[] => withCtx((ctx) => findExamples(scenario(id), ctx, n).map((e) => e.code));

test('scenarios: unique ids, each with a stated formation, and the dropped combinations are listed', () => {
  const { scenarios, dropped } = buildScenarios();
  assert.equal(new Set(scenarios.map((s) => s.id)).size, scenarios.length);
  assert.ok(scenarios.length >= 30);
  for (const s of scenarios) assert.ok(s.how.length > 10, s.id);
  assert.ok(dropped.length > 0);
});

test('finders: priced barcode scenarios pick the right fixture products', () => {
  assert.deepEqual(new Set(codesFor('barcode/own_price/many_recent')), new Set(['milkA', 'milkB', 'milkC', 'milkD', 'matcher'].map(code)));
  assert.deepEqual(codesFor('barcode/own_price/single'), [code('single')]);
  assert.deepEqual(codesFor('barcode/own_price/only_old'), [code('old')]);
  assert.deepEqual(codesFor('barcode/own_price/only_sale'), [code('sale')]);
  assert.deepEqual(codesFor('barcode/matcher_linked'), [code('matcher')]);
});

test('finders: a price with no barcode is found by name and is not linked', () => {
  const found = withCtx((ctx) => findExamples(scenario('barcode/unlinked_name_only'), ctx, 5));
  assert.deepEqual(found.map((e) => e.code), [code('unlinked')]);
  assert.equal(found[0].knownCents, 649);
  assert.match(found[0].note ?? '', /unlinked/);
});

test('finders: peers only, nothing, and the markets', () => {
  assert.deepEqual(new Set(codesFor('barcode/peers_only')), new Set([code('milkUnpriced'), code('unlinked')]));
  assert.deepEqual(new Set(codesFor('barcode/nothing')), new Set([code('nothing'), code('nothing2')]));
  assert.deepEqual(codesFor('market_US/own_price_in_USD'), [code('usd')]);
  assert.deepEqual(codesFor('market_CA/price_only_in_USD'), [code('usd')]);
  assert.ok(codesFor('market_US/price_only_in_CAD').includes(code('cadOnlyUs')));
  assert.ok(!codesFor('market_US/price_only_in_CAD').includes(code('usd')));
  assert.deepEqual(codesFor('barcode_not_in_catalogue/price_on_barcode_only'), [PRICE_ONLY_CODE]);
});

test('finders: invalid, made-up and store-internal codes are absent from both files and shaped right', () => {
  const absent = codesFor('barcode_not_in_catalogue/nothing');
  assert.equal(absent.length, 10);
  const invalid = withCtx((ctx) => findExamples(scenario('barcode_invalid'), ctx, 5));
  const internal = withCtx((ctx) => findExamples(scenario('barcode_store_internal'), ctx, 5));
  const cat = new DatabaseSync(cataloguePath, { readOnly: true });
  try {
    for (const c of [...absent, ...invalid.map((e) => e.code), ...internal.map((e) => e.code)]) assert.equal(cat.prepare('SELECT 1 FROM product WHERE code = ?').get(c), undefined, c);
  } finally {
    cat.close();
  }
  assert.ok(internal.every((e) => e.code.startsWith('2') && e.expectsNoProduct));
  assert.ok(invalid.every((e) => e.expectsNoProduct && e.value.length === 13));
});

test('finders: typed forms are built from the product, and the 12-digit twin drops the leading zero', () => {
  const full = withCtx((ctx) => findExamples(scenario('typed_full/own_price'), ctx, 10));
  const milk = full.find((e) => e.code === code('milkA'))!;
  assert.equal(milk.value, 'Dairyco Whole Milk 2 L');
  const noBrand = withCtx((ctx) => findExamples(scenario('typed_no_brand/own_price'), ctx, 10)).find((e) => e.code === code('milkA'))!;
  assert.equal(noBrand.value, 'Whole Milk 2 L');
  const typo = withCtx((ctx) => findExamples(scenario('typed_typo/own_price'), ctx, 10)).find((e) => e.code === code('milkA'))!;
  assert.notEqual(typo.value, 'Dairyco Whole Milk 2 L');
  assert.equal(typo.value.length, 'Dairyco Whole Milk 2 L'.length);
  const twin = withCtx((ctx) => findExamples(scenario('barcode_12_vs_13/own_price'), ctx, 10)).find((e) => e.code === code('milkA'))!;
  assert.equal(twin.altValue, code('milkA').slice(1));
});

test('finders: a scenario with no real example is reported as none, never faked', () => {
  const none = withCtx((ctx) => findExamples(scenario('barcode/own_price/shopper_only'), ctx, 10));
  assert.deepEqual(none, []);
  const s = scenario('barcode/own_price/shopper_only');
  const out = summarise([s], [{ scenario: s, example: null, outcome: null }], new Map(), null);
  assert.equal(out[0].examples, 0);
  assert.equal(out[0].note, "no example in today's data");
  assert.equal(out[0].noResultShare, null);
});

test('finders: the same seed picks the same examples', () => {
  assert.deepEqual(codesFor('barcode_not_in_catalogue/nothing'), codesFor('barcode_not_in_catalogue/nothing'));
});

/* ---- the judge, with stubbed answers */

const answer = (json: Record<string, any>, status = 200): AskResult => ({ status, json, ms: 5, error: status === 200 ? null : `http ${status}` });
const exampleFor = (key: string, over: Partial<Example> = {}): Example => {
  const x = PRODUCTS.find((p) => p.key === key)!;
  return {
    code: x.code, name: x.name, brand: x.brand, size: x.quantity, kind: 'barcode', value: x.code, expectsNoProduct: false,
    target: { code: x.code, name: x.name, brand: x.brand, size: x.quantity, medianCents: null }, knownCents: 449, knownCurrency: 'CAD', dataCurrencies: ['CAD'], ...over,
  };
};
const named = (key: string) => {
  const x = PRODUCTS.find((p) => p.key === key)!;
  return { name: x.name, brand: x.brand, size: x.quantity, barcode: x.code };
};
const own = (low: number, high: number, currency = 'CAD') => ({ lowCents: low, highCents: high, medianCents: null, n: 3, basis: 'this_product', currency });

test('judge: a good own-price answer is clean and checked in-sample', () => {
  const o = judge(exampleFor('milkA'), scenario('barcode/own_price/many_recent'), answer({ identity: named('milkA'), range: own(430, 460), rangeSource: 'shin_prices' }));
  assert.deepEqual(o.breakages, []);
  assert.equal(o.rung, 'own_price');
  assert.equal(o.inSample, true);
  assert.equal(o.nameMatches, true);
});

test('negative control: a converted currency is flagged (CAD data shown to a US shopper as USD, from Pexi prices)', () => {
  const s = scenario('market_US/price_only_in_CAD');
  const o = judge(exampleFor('cadOnlyUs'), s, answer({ identity: named('cadOnlyUs'), range: own(410, 440, 'USD'), rangeSource: 'shin_prices' }));
  assert.ok(o.breakages.some((b) => b.startsWith('other_market_price_used')), JSON.stringify(o.breakages));
  const wrongLabel = judge(exampleFor('milkA'), scenario('barcode/own_price/many_recent'), answer({ identity: named('milkA'), range: own(300, 400, 'USD'), rangeSource: 'shin_prices' }));
  assert.ok(wrongLabel.breakages.some((b) => b.startsWith('currency_mismatch')), JSON.stringify(wrongLabel.breakages));
});

test('negative control: Canadian national-average money shown to a US market is flagged', () => {
  const o = judge(exampleFor('cadOnlyUs'), scenario('market_US/price_only_in_CAD'), answer({ identity: named('cadOnlyUs'), range: { lowCents: 365, highCents: 859, basis: 'category_prior', currency: 'USD' }, rangeSource: 'national_average' }));
  assert.equal(o.rung, 'national');
  assert.ok(o.breakages.some((b) => b.startsWith('canadian_average_shown_to_us_market')));
});

test('negative control: a wrong-product answer is flagged, for a barcode always and for a typed name when confident', () => {
  const barcode = judge(exampleFor('milkA'), scenario('barcode/own_price/many_recent'), answer({ identity: named('single'), range: own(430, 460), rangeSource: 'shin_prices' }));
  assert.ok(barcode.breakages.some((b) => b.startsWith('wrong_product')));
  assert.equal(barcode.nameMatches, false);
  const typed = exampleFor('milkA', { kind: 'text', value: 'Dairyco Whole Milk 2 L' });
  const confident = judge(typed, scenario('typed_full/own_price'), answer({ product: { code: code('single'), name: 'Smooth Peanut Butter', brands: 'Skippy', quantity: '500 g' }, verdict: { confidence: 'high', basis: 'own_prices', currency: 'CAD' }, range: own(500, 600) }));
  assert.ok(confident.breakages.some((b) => b.startsWith('wrong_product')));
  const hedged = judge(typed, scenario('typed_full/own_price'), answer({ product: { code: code('single'), name: 'Smooth Peanut Butter', brands: 'Skippy', quantity: '500 g' }, verdict: { confidence: 'low', basis: 'own_prices', currency: 'CAD' }, range: own(500, 600) }));
  assert.equal(hedged.breakages.filter((b) => b.startsWith('wrong_product')).length, 0);
  assert.ok(hedged.bad.length > 0);
});

test('judge: crashes, invalid ranges, a made-up code that names a product, and 12-vs-13 disagreement are breakages', () => {
  const s = scenario('barcode/own_price/many_recent');
  assert.ok(judge(exampleFor('milkA'), s, { status: 500, json: null, ms: 3, error: 'http 500' }).breakages.some((b) => b.startsWith('no_answer')));
  assert.ok(judge(exampleFor('milkA'), s, { status: null, json: null, ms: 25000, error: 'timeout 25000 ms' }).breakages.some((b) => b.startsWith('no_answer')));
  assert.ok(judge(exampleFor('milkA'), s, answer({ identity: named('milkA'), range: own(900, 100), rangeSource: 'shin_prices' })).breakages.some((b) => b.startsWith('invalid_range')));
  const made = exampleFor('milkA', { expectsNoProduct: true, target: null });
  assert.ok(judge(made, scenario('barcode_invalid'), answer({ identity: named('milkA'), range: own(430, 460) })).breakages.some((b) => b.startsWith('named_a_product')));
  const twin = judge(exampleFor('milkA'), s, answer({ identity: named('milkA'), range: own(430, 460), rangeSource: 'shin_prices' }), answer({ identity: named('milkA'), range: own(300, 900), rangeSource: 'shin_prices' }));
  assert.ok(twin.breakages.some((b) => b.startsWith('forms_disagree')));
});

test('judge: no result is counted as no result, a known price outside an own-price range as a bad result', () => {
  const none = judge(exampleFor('milkA'), scenario('barcode/own_price/many_recent'), answer({ outcome: 'not_in_catalogue', identity: null, range: null, verdict: null }));
  assert.equal(none.noResult, true);
  assert.equal(none.rung, 'none');
  const miss = judge(exampleFor('milkA'), scenario('barcode/own_price/many_recent'), answer({ identity: named('milkA'), range: own(100, 200), rangeSource: 'shin_prices' }));
  assert.equal(miss.inSample, false);
  assert.deepEqual(miss.breakages, []);
  assert.ok(miss.bad.some((b) => b.startsWith('range_misses_known_price')));
});

test('summary: shares, rung mix, change against a previous summary, and traffic shares need the scans', () => {
  const s = scenario('barcode/own_price/many_recent');
  const ok = judge(exampleFor('milkA'), s, answer({ identity: named('milkA'), range: own(430, 460), rangeSource: 'shin_prices' }));
  const none = judge(exampleFor('milkA'), s, answer({ identity: null, range: null, verdict: null }));
  const rows: Row[] = [{ scenario: s, example: exampleFor('milkA'), outcome: ok }, { scenario: s, example: exampleFor('milkA'), outcome: none }];
  const first = summarise([s], rows, new Map(), null)[0];
  assert.equal(first.noResultShare, 0.5);
  assert.deepEqual(first.rungMix, { own_price: 1, none: 1 });
  const second = summarise([s], rows.slice(0, 1), new Map(), { scenarios: [first] })[0];
  assert.equal(second.change?.noResultShare, -0.5);
  assert.equal(trafficShare(s, null), null);
  const scans = new DatabaseSync(':memory:');
  scans.exec(`CREATE TABLE scan (id INTEGER PRIMARY KEY, device_id TEXT, kind TEXT, query_text TEXT, resolved_code TEXT, failure_class TEXT, is_demo INTEGER DEFAULT 0, country TEXT, range_source TEXT, range_basis TEXT);
    CREATE TABLE event (device_id TEXT, type TEXT);
    INSERT INTO scan (device_id, kind, resolved_code, country, range_source, range_basis) VALUES ('d1','barcode','x','CA','shin_prices','this_product'),('d1','barcode','y','CA','shin_prices','this_product'),
      ('d2','text',NULL,'CA',NULL,NULL),('probe-1','barcode','z','CA','shin_prices','this_product'),('load','barcode','z','CA','shin_prices','this_product');
    INSERT INTO event VALUES ('load','load_test');`);
  const t = loadTraffic(scans, [], ['zzqxwv']);
  assert.equal(t.total, 3);
  assert.equal(trafficShare(s, t), 2 / 3);
});

test('phone path: the identify query carries what api.js sends for each market', () => {
  const ca = phonePath('barcode', '0626990020011', 'CA', 'd');
  assert.match(ca, /^\/api\/identify\?gtin=0626990020011&market=Canada&currency=CAD&countryCode=CA&region=British\+Columbia&language=en-CA&knows=national_average&deviceId=d$/);
  assert.match(phonePath('text', 'oreo cookies', 'US', 'd'), /text=oreo\+cookies&market=United\+States&currency=USD&countryCode=US/);
  assert.doesNotMatch(phonePath('barcode', '1', 'unknown', 'd'), /market=|currency=/);
});

/* ---- one run end to end on the fixture, through the real server */

test('end to end on the fixture: every scenario answered or reported empty, no model call, the fixture files untouched', { timeout: 600_000 }, async () => {
  const filesBefore = [sha(cataloguePath), sha(pricesPath)];
  const outRoot = mkdtempSync(join(tmpdir(), 'scenario-out-'));
  const out = join(outRoot, 'out');
  // A child process on purpose: the CLI ends with process.exit (as the answer-key run does), because the server it
  // starts leaves worker threads that would keep a test process open.
  const cliPath = join(import.meta.dirname, '..', '..', 'scripts', 'scenarios', 'scenario-check.mts');
  const run = (args: string[]) => spawnSync(process.execPath, [cliPath, '--catalogue', cataloguePath, '--prices', pricesPath, ...args], { encoding: 'utf8', timeout: 300_000 });
  const r = run(['--n', '2', '--out', out]);
  assert.ok([0, 1].includes(r.status ?? 2), `exit ${r.status}: ${r.stderr.slice(-800)}`);
  assert.doesNotMatch(r.stderr, /RUN PROBLEM/);
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as { totals: { examples: number; modelCalls: number; stubbedClaudeAsks: number }; scenarios: { id: string; examples: number; breakages: number; breakageKinds: Record<string, number>; rungMix: Record<string, number> }[] };
  assert.equal(summary.totals.modelCalls, 0, 'a real model was called');
  assert.ok(summary.totals.stubbedClaudeAsks > 0, 'the stubbed Claude ask was never reached, so the no-price path was not exercised');
  const { scenarios } = buildScenarios();
  assert.equal(summary.scenarios.length, scenarios.length);
  const empty = summary.scenarios.filter((x) => x.examples === 0).map((x) => x.id);
  assert.ok(empty.includes('barcode/own_price/shopper_only'));
  assert.ok(summary.totals.examples > 30);
  // The fixture's 12- and 13-digit forms agree, and a priced milk is answered from its own prices.
  const own12 = summary.scenarios.find((x) => x.id === 'barcode_12_vs_13/own_price')!;
  assert.equal(own12.breakages, 0, JSON.stringify(own12));
  assert.ok((summary.scenarios.find((x) => x.id === 'barcode/own_price/many_recent')!.rungMix.own_price ?? 0) > 0);
  // No breakage of any kind. The first run (2026-11-22) found the Statistics Canada national average offered to a US
  // market as USD; server.ts marketOfContext now keeps that rung to non-US markets, and this pins it.
  const kinds = new Set(summary.scenarios.flatMap((x) => Object.keys(x.breakageKinds)));
  assert.deepEqual([...kinds], []);
  for (const f of ['summary.md', 'summary.json', 'findings.jsonl']) assert.ok(existsSync(join(out, f)), f);
  const md = readFileSync(join(out, 'summary.md'), 'utf8');
  assert.match(md, /\| scenario \| examples \| no-result \| bad-result \| rung mix \| breakages \| traffic share \| change vs previous \|/);
  assert.match(md, /no example in today's data/);
  assert.match(md, /node src\/run\.ts --db .* --catalogue .* --no-write/);
  assert.deepEqual([sha(cataloguePath), sha(pricesPath)], filesBefore, 'the fixture files changed');
  // A second run against the first run's summary shows change columns.
  // (A child process on purpose: the server module starts once per process.)
  const out2 = join(outRoot, 'out2');
  const cli = run(['--n', '1', '--out', out2, '--previous', join(out, 'summary.json')]);
  assert.ok([0, 1].includes(cli.status ?? 2), cli.stderr.slice(-600));
  const second = JSON.parse(readFileSync(join(out2, 'summary.json'), 'utf8'));
  const row = second.scenarios.find((x: { id: string }) => x.id === 'barcode/own_price/many_recent');
  assert.equal(row.change.breakages, 0);
  assert.ok(row.change.examples < 0, 'n 1 against n 2 should show fewer examples');
  assert.deepEqual([sha(cataloguePath), sha(pricesPath)], filesBefore, 'the fixture files changed after the CLI run');
});
