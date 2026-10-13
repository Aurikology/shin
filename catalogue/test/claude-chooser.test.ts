/**
 * Price-category plan 2.1, the Claude slot: Claude chooses among a FIXED short list
 * of candidate categories the cascade hands it, or abstains. This file tests the
 * chooser behind that slot with a FAKE client: no key, no network, no live call.
 *
 *   - it can only return a node that is on the list it was given; an id Claude
 *     invents is refused (counted, abstained), never placed;
 *   - calls per run are capped; past the cap it abstains without calling;
 *   - one answer per item: asking again about the same item with the same list is
 *     served from the cache, not a second call;
 *   - the client is injected, and a client that throws stops the run (nothing is
 *     swallowed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeChooser, type ClaudeClient, type ClaudeRequest } from '../src/claude-chooser.ts';
import { runCascade, type PlacementRoute } from '../src/placement-cascade.ts';
import { nodeIdOf, placedFixture, placementOf, type FixtureRow } from './helpers/placement-fixture.ts';

const quiet = () => {};

const ITEM = { code: 'U1', department: 'food', name: 'Kettle potato chips' };
const LIST = [
  { nodeId: 101, path: ['en:snacks', 'en:chips'] },
  { nodeId: 102, path: ['en:snacks', 'en:crackers'] },
  { nodeId: 103, path: ['en:dairies'] },
];

function fake(replies: (req: ClaudeRequest, n: number) => string): ClaudeClient & { requests: ClaudeRequest[] } {
  const c = {
    requests: [] as ClaudeRequest[],
    async complete(req: ClaudeRequest) {
      c.requests.push(req);
      return replies(req, c.requests.length);
    },
  };
  return c;
}

test('2.1 Claude picks an id from the list: the chooser returns that node and Claude\'s stated confidence', async () => {
  const client = fake(() => '{"id": 101, "confidence": 0.9}');
  const chooser = claudeChooser({ client, maxCalls: 10 });
  const pick = await chooser.choose(ITEM, LIST);
  assert.deepEqual(pick, { nodeId: 101, confidence: 0.9 });
  assert.equal(client.requests.length, 1);
  const prompt = `${client.requests[0]!.system}\n${client.requests[0]!.user}`;
  assert.match(prompt, /Kettle potato chips/);
  for (const c of LIST) assert.match(prompt, new RegExp(String(c.nodeId)), 'every candidate is shown with its id');
  assert.match(prompt, /snacks.*chips|chips/i);
});

test('2.1 an id that is not on the list is refused: the chooser abstains and counts it, it never returns it', async () => {
  const client = fake(() => '{"id": 999, "confidence": 0.99}');
  const chooser = claudeChooser({ client, maxCalls: 10 });
  assert.equal(await chooser.choose(ITEM, LIST), null);
  assert.equal(chooser.stats().rejectedNotOnList, 1);
});

test('2.1 Claude may abstain: null is a fine answer and is counted as one', async () => {
  const chooser = claudeChooser({ client: fake(() => '{"id": null}'), maxCalls: 10 });
  assert.equal(await chooser.choose(ITEM, LIST), null);
  assert.equal(chooser.stats().abstained, 1);
});

test('2.1 a reply that is not the JSON asked for, or a confidence outside 0..1, is an abstention counted as unreadable', async () => {
  for (const reply of ['I think chips', '{"id": "101"}', '{"id": 101}', '{"id": 101, "confidence": 1.4}', '{"id": 101, "confidence": "high"}', '']) {
    const chooser = claudeChooser({ client: fake(() => reply), maxCalls: 10 });
    assert.equal(await chooser.choose(ITEM, LIST), null, reply);
    assert.equal(chooser.stats().unreadable, 1, reply);
  }
});

test('2.1 a reply wrapped in prose or a code fence is still read', async () => {
  const chooser = claudeChooser({ client: fake(() => 'Sure.\n```json\n{"id": 102, "confidence": 0.7}\n```'), maxCalls: 10 });
  assert.deepEqual(await chooser.choose(ITEM, LIST), { nodeId: 102, confidence: 0.7 });
});

test('2.1 calls per run are capped: past the cap the chooser abstains WITHOUT calling the client', async () => {
  const client = fake(() => '{"id": 101, "confidence": 0.9}');
  const chooser = claudeChooser({ client, maxCalls: 2 });
  assert.ok(await chooser.choose({ ...ITEM, code: 'A' }, LIST));
  assert.ok(await chooser.choose({ ...ITEM, code: 'B' }, LIST));
  assert.equal(await chooser.choose({ ...ITEM, code: 'C' }, LIST), null);
  assert.equal(await chooser.choose({ ...ITEM, code: 'D' }, LIST), null);
  assert.equal(client.requests.length, 2, 'two calls and no more');
  assert.equal(chooser.stats().calls, 2);
  assert.equal(chooser.stats().skippedForCap, 2);
});

test('2.1 one answer per item: the same item with the same list is served from the cache and costs no call, not even past the cap', async () => {
  const client = fake(() => '{"id": 101, "confidence": 0.9}');
  const chooser = claudeChooser({ client, maxCalls: 1 });
  const a = await chooser.choose(ITEM, LIST);
  const b = await chooser.choose(ITEM, LIST);
  assert.deepEqual(a, b);
  assert.equal(client.requests.length, 1);
  assert.equal(chooser.stats().cacheHits, 1);
  // an abstention is cached too
  const none = fake(() => '{"id": null}');
  const c2 = claudeChooser({ client: none, maxCalls: 5 });
  await c2.choose(ITEM, LIST);
  await c2.choose(ITEM, LIST);
  assert.equal(none.requests.length, 1);
  // a different list is a different question
  const d = fake(() => '{"id": 101, "confidence": 0.9}');
  const c3 = claudeChooser({ client: d, maxCalls: 5 });
  await c3.choose(ITEM, LIST);
  await c3.choose(ITEM, LIST.slice(0, 2));
  assert.equal(d.requests.length, 2);
});

test('2.1 a shared cache survives the chooser: a second chooser on the same cache makes no call for an answered item', async () => {
  const cache = new Map();
  const first = fake(() => '{"id": 101, "confidence": 0.9}');
  await claudeChooser({ client: first, maxCalls: 5, cache }).choose(ITEM, LIST);
  const second = fake(() => {
    throw new Error('must not be called');
  });
  assert.deepEqual(await claudeChooser({ client: second, maxCalls: 5, cache }).choose(ITEM, LIST), { nodeId: 101, confidence: 0.9 });
  assert.equal(second.requests.length, 0);
});

test('2.1 fails loudly: a client that throws stops the run, an empty list or a bad cap is refused', async () => {
  const boom: ClaudeClient = { async complete() { throw new Error('529 overloaded'); } };
  await assert.rejects(claudeChooser({ client: boom, maxCalls: 5 }).choose(ITEM, LIST), /529 overloaded/);
  await assert.rejects(claudeChooser({ client: fake(() => '{}'), maxCalls: 5 }).choose(ITEM, []), /empty list/);
  assert.throws(() => claudeChooser({ client: fake(() => '{}'), maxCalls: -1 }), /maxCalls/);
  assert.throws(() => claudeChooser({ client: fake(() => '{}'), maxCalls: 1.5 }), /maxCalls/);
});

test('2.1 behind the cascade\'s Claude slot: it places on route "claude" only from the offered list, within its call cap, and the fake client is the only thing called', async () => {
  const ROWS: FixtureRow[] = [
    { code: 'S1', source: 'openfoodfacts', path: ['en:snacks', 'en:chips'], name: 'Salted bag' },
    { code: 'Y1', source: 'openfoodfacts', path: ['en:dairies', 'en:yogurts'], name: 'Vanilla tub' },
    { code: 'U-a', source: 'openfoodfacts', path: [], name: 'Kettle potato chips' },
    { code: 'U-b', source: 'openfoodfacts', path: [], name: 'Greek yoghurt' },
    { code: 'U-c', source: 'openfoodfacts', path: [], name: 'Mystery' },
  ];
  const db = placedFixture(ROWS);
  const chips = nodeIdOf(db, 'food', 'en:chips');
  const yogurts = nodeIdOf(db, 'food', 'en:yogurts');
  const route: PlacementRoute = { name: 'label', propose: () => null, suggest: () => [chips, yogurts] };
  const client = fake((req) => {
    const m = /Kettle potato chips/.test(req.user) ? chips : yogurts;
    return JSON.stringify({ id: m, confidence: 0.8 });
  });
  const chooser = claudeChooser({ client, maxCalls: 2 });
  await runCascade(db, { routes: [route], claude: chooser, log: quiet });
  assert.equal(client.requests.length, 2, 'the cap held');
  const placed = ['U-a', 'U-b', 'U-c'].map((c) => placementOf(db, c).placedBy).sort();
  assert.deepEqual(placed, ['claude', 'claude', 'top-level']);
  assert.equal(placementOf(db, 'U-a').tag, 'en:chips');
  assert.equal(chooser.stats().skippedForCap, 1);
});
