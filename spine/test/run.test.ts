/**
 * Tests for the order things arrive in and the shape of every refusal.
 *
 * The ordering tests are the point. A change that awaits price before starting
 * alternatives breaks nothing, throws nothing, and costs every user a second of
 * silence on every scan; only an assertion about order catches it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, REFUSALS, overBudget, type ScanEvent, type ScanPorts } from '../src/run.ts';

function defer<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const identified = {
  kind: 'identified' as const,
  name: 'Kraft Smooth Peanut Butter 1 kg',
  confidence: { band: 'high' },
  sizeValue: 1000,
  sizeUnit: 'g',
  shelfCents: 799,
  key: 'A',
};

function ports(over: Partial<ScanPorts> = {}): ScanPorts {
  return {
    gtin: null,
    identify: async () => identified,
    prices: async () => ({ verdict: { tier: 'good' }, sellerCount: 3 }),
    alternatives: async () => [{ code: 'B' }],
    verdictAvailable: true,
    upgradeOffer: null,
    ...over,
  };
}

async function collect(p: ScanPorts): Promise<ScanEvent[]> {
  const out: ScanEvent[] = [];
  for await (const e of scan(p)) out.push(e);
  return out;
}

const types = (es: ScanEvent[]) => es.map((e) => e.type);

test('the name arrives before the price', async () => {
  const es = await collect(ports());
  assert.ok(types(es).indexOf('identity') < types(es).indexOf('verdict'));
});

test('every step is named before it runs', async () => {
  const es = await collect(ports());
  const steps = es.filter((e) => e.type === 'step').map((e) => (e as { step: string }).step);
  assert.deepEqual(steps, ['looking at the photo', 'checking prices', 'finding cheaper options']);
});

test('cheaper options do not wait for a slow shop', async () => {
  const slowPrice = defer<{ verdict: unknown; sellerCount: number }>();
  const es: ScanEvent[] = [];
  const it = scan(ports({
    prices: () => slowPrice.promise,
    alternatives: async () => [{ code: 'B' }],
  }));

  // Pull events until the alternatives land, with price still outstanding. If
  // this file ever awaits price first, this loop never reaches them.
  const pump = (async () => { for await (const e of it) es.push(e); })();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(
    es.some((e) => e.type === 'alternatives'),
    'alternatives were held behind an unresolved price call',
  );

  slowPrice.resolve({ verdict: { tier: 'good' }, sellerCount: 2 });
  await pump;
  assert.ok(es.some((e) => e.type === 'verdict'));
});

test('a call past the cap shows what landed and names what did not', async () => {
  // A shop that never answers. The name and the cheaper options still arrive,
  // the stall is named as its own step, and nothing is left spinning.
  const es = await collect(ports({
    prices: () => new Promise(() => {}),
    capMs: 20,
  }));
  assert.ok(es.some((e) => e.type === 'identity'));
  assert.ok(es.some((e) => e.type === 'alternatives'));
  const t = es.find((e) => e.type === 'timed_out') as { step: string; says: string };
  assert.equal(t.step, 'checking prices');
  assert.ok(!/error|failed/i.test(t.says), `a stall was reported as a failure: ${t.says}`);
  assert.equal(es[es.length - 1].type, 'done');
});

test('identification itself stalling is our failure, with a repair', async () => {
  const es = await collect(ports({
    identify: () => new Promise(() => {}),
    capMs: 20,
  }));
  const r = es.find((e) => e.type === 'refusal') as { refusal: { fault: string; repair: string | null } };
  assert.equal(r.refusal.fault, 'ours');
  assert.ok(r.refusal.repair);
});

test('a blurry photo is our failure and comes with one repair', async () => {
  const es = await collect(ports({
    identify: async () => ({ kind: 'unreadable', reason: 'blurry' }),
  }));
  const r = es.find((e) => e.type === 'refusal') as { refusal: typeof REFUSALS.blurry };
  assert.equal(r.refusal.fault, 'ours');
  assert.ok(r.refusal.repair, 'our failure with nothing the user can do about it');
  assert.equal(r.refusal.step, 'looking at the photo');
});

test('a product nobody sells is the world, and asks nothing of the user', async () => {
  const es = await collect(ports({ prices: async () => null }));
  const r = es.find((e) => e.type === 'refusal') as { refusal: typeof REFUSALS.no_prices };
  assert.equal(r.refusal.fault, 'world');
  assert.equal(r.refusal.repair, null, 'the user was asked to fix the world');
});

test('a catalogue miss still shows the ring', async () => {
  const es = await collect(ports({
    identify: async () => ({
      kind: 'not_in_catalogue',
      readAs: 'Blood orange',
      ring: { label: 'oranges', members: [{ code: '1' }, { code: '2' }] },
    }),
  }));
  assert.ok(types(es).includes('ring'));
  assert.ok(!types(es).includes('verdict'));
});

test('past the limit the name and the options still ship and only the verdict is held', async () => {
  const es = await collect(ports({
    verdictAvailable: false,
    upgradeOffer: 'Unlock the price check.',
  }));
  assert.ok(types(es).includes('identity'));
  assert.ok(types(es).includes('alternatives'));
  assert.ok(!types(es).includes('verdict'));
  const g = es.find((e) => e.type === 'gated') as { offer: string };
  assert.equal(g.offer, 'Unlock the price check.');
});

test('one seller shows the going rate and says it is not a verdict', async () => {
  const es = await collect(ports({
    prices: async () => ({ verdict: { tier: null }, sellerCount: 1 }),
  }));
  const r = es.find((e) => e.type === 'refusal') as { refusal: typeof REFUSALS.one_seller };
  assert.match(r.refusal.says, /not enough/i);
});

test('every refusal names its step, and none of them shrugs', async () => {
  for (const [key, r] of Object.entries(REFUSALS)) {
    assert.ok(r.step, `${key} has no step`);
    assert.ok(r.says.length > 15, `${key} says too little`);
    assert.ok(!/error|failed|invalid|null|undefined/i.test(r.says), `${key} leaked machinery: ${r.says}`);
    // Decision 54: no best guess with a shrug.
    assert.ok(!/maybe|probably|might be|not sure/i.test(r.says), `${key} shrugged: ${r.says}`);
    if (r.fault === 'ours') assert.ok(r.repair, `${key} is ours and offers no repair`);
  }
});

test('the speed budget is a barcode second and a photo four', () => {
  assert.equal(overBudget('123', 900), false);
  assert.equal(overBudget('123', 1200), true);
  assert.equal(overBudget(null, 3500), false);
  assert.equal(overBudget(null, 4500), true);
});
