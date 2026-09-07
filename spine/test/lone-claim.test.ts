/**
 * D-022: a lone unwitnessed claim that disagrees with everything else is held
 * back rather than published.
 *
 * The defect, in its own words: "A single typed price moves a verdict, and
 * nothing holds an outlier... No corroboration is required before a report
 * counts, a photographed tag does not outweigh a typed number, a price far
 * outside the known range is published rather than held, and there is no
 * reliability score per person." It is marked "Open, and it gates opening the
 * app to anybody else."
 *
 * These tests cover the third of those four. What they deliberately do NOT
 * claim is that this detects lies: a fake that sits inside the range everybody
 * else reports passes through, and the last test in this file asserts that on
 * purpose, so nobody later reads the mechanism as stronger than it is.
 *
 * `witnesses` is the field the contract carries. Undefined means the source
 * vouches for the price itself, which is every crawled feed. A number means a
 * member of the public wrote it and that many independent devices stand behind
 * it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceIt, LONE_CLAIM_FLOOR, LONE_CLAIM_CEILING } from '../src/spine.ts';
import type { Refusal, Verdict } from '../src/contract.ts';
import { AS_OF, StubSource, identity, point } from './helpers.ts';

function deps(source: StubSource) {
  return { sources: [source] };
}

function asVerdict(r: Verdict | Refusal): Verdict {
  assert.equal(r.kind, 'verdict', `expected a verdict, got ${r.kind === 'refusal' ? r.reason : ''}`);
  return r as Verdict;
}

const GOING = 400;

/** Two prices from feeds that vouch for themselves, the honest baseline. */
function vouched() {
  return [point('Walmart', GOING), point('Metro', GOING + 20)];
}

async function priceWith(points: ReturnType<typeof point>[], askingCents = GOING) {
  const src = new StubSource(identity('grocery'), points);
  return asVerdict(await priceIt({ text: 'x', askingCents, asOf: AS_OF }, deps(src)));
}

test('a lone claim far below the going rate is held out of the comparison', async () => {
  const liar = point('No Frills', Math.round(GOING * LONE_CLAIM_FLOOR) - 50, 'regular', '2026-09-03', { witnesses: 1 });
  const v = await priceWith([...vouched(), liar]);
  const sellers = v.comparisonSet.map((p) => p.seller);
  assert.ok(!sellers.includes('No Frills'), `the lone low claim reached the comparison: ${sellers.join(', ')}`);
  assert.equal(v.comparisonSet.length, 2);
});

test('a lone claim far above the going rate is held too', async () => {
  const liar = point('Sobeys', Math.round(GOING * LONE_CLAIM_CEILING) + 50, 'regular', '2026-09-03', { witnesses: 1 });
  const v = await priceWith([...vouched(), liar]);
  assert.ok(!v.comparisonSet.map((p) => p.seller).includes('Sobeys'));
});

test('holding is named on the answer, never a silent disappearance', async () => {
  const liar = point('No Frills', 20, 'regular', '2026-09-03', { witnesses: 1 });
  const v = await priceWith([...vouched(), liar]);
  assert.match(
    v.confidence.because,
    /held back/i,
    `a held price has to be visible, got: ${v.confidence.because}`,
  );
});

test('a corroborated claim at the same price is not held', async () => {
  // Same number, same shelf, but two independent devices saw it. That is a
  // reading, not a claim, and the whole point of counting witnesses.
  const seen = point('No Frills', 20, 'regular', '2026-09-03', { witnesses: 2 });
  const v = await priceWith([...vouched(), seen]);
  assert.ok(
    v.comparisonSet.map((p) => p.seller).includes('No Frills'),
    'a corroborated reading was held as though one person had claimed it',
  );
});

test('a lone claim inside the range is published, because it is ordinary', async () => {
  const honest = point('No Frills', GOING - 30, 'regular', '2026-09-03', { witnesses: 1 });
  const v = await priceWith([...vouched(), honest]);
  assert.ok(v.comparisonSet.map((p) => p.seller).includes('No Frills'));
  assert.doesNotMatch(v.confidence.because, /held back/i);
});

test('nothing is held when there is no vouched evidence to judge against', async () => {
  // Two typed claims and nothing else. There is no basis for an accusation, and
  // inventing one from the claims themselves is how two colluding devices would
  // establish their own normal.
  const a = point('No Frills', 20, 'regular', '2026-09-03', { witnesses: 1 });
  const b = point('Metro', 900, 'regular', '2026-09-03', { witnesses: 1 });
  const v = await priceWith([a, b]);
  assert.equal(v.comparisonSet.length, 2, 'a claim was held with nothing to judge it against');
});

test('a hold never turns a verdict into a refusal', async () => {
  // Priority 1 is always answer. One vouched price and one wild claim: there is
  // not enough baseline to judge, so nothing is held, and the answer stands.
  const src = new StubSource(identity('grocery'), [
    point('Walmart', GOING),
    point('No Frills', 5, 'regular', '2026-09-03', { witnesses: 1 }),
  ]);
  const r = await priceIt({ text: 'x', askingCents: GOING, asOf: AS_OF }, deps(src));
  assert.equal(r.kind, 'verdict', `holding turned an answer into a ${r.kind}`);
});

test('the going rate a claim is judged against excludes other lone claims', async () => {
  // Three colluding claims at 20 cents cannot make 20 cents the normal and get
  // the honest 400 cent feed price held as the outlier.
  const collusion = [1, 2, 3].map((i) =>
    point(`Shop ${i}`, 20, 'regular', '2026-09-03', { witnesses: 1 }),
  );
  const v = await priceWith([point('Walmart', GOING), point('Metro', GOING + 20), ...collusion]);
  const sellers = v.comparisonSet.map((p) => p.seller);
  assert.ok(sellers.includes('Walmart') && sellers.includes('Metro'), 'the vouched prices were held');
});

test('a plausible fake passes through, and this file says so out loud', async () => {
  // Not a defect. It is the stated limit of the mechanism: a number inside the
  // range everybody else reports is indistinguishable from a real reading by
  // anything the spine can see. Catching it needs a reliability history per
  // device, which D-022 also asks for and which is not built.
  const plausible = point('No Frills', GOING - 40, 'regular', '2026-09-03', { witnesses: 1 });
  const v = await priceWith([...vouched(), plausible]);
  assert.ok(v.comparisonSet.map((p) => p.seller).includes('No Frills'));
});
