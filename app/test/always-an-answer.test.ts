/**
 * Every scan ends with an answer, 2026-09-15.
 *
 * Jamin: "Having a response that is not checked is infinitely better than
 * having the user scan something, wait 10 seconds, only to get told the app
 * doesn't know, because that will make the user just uninstall the app."
 *
 * Over a real socket, with the vision model and the grounded search both
 * doubled: there is no key on this machine, and nothing here reaches Google.
 *
 *   (1) a photo the catalogue cannot match comes back as an UNCHECKED answer,
 *       and its price search is started straight away;
 *   (1) a barcode the catalogue does not know comes back named from the
 *       search, unchecked;
 *   (2) the price route hands the search the shelf price and the catalogue's
 *       size, so a line can be drawn from the grounded offers even when our
 *       own engine refuses for want of sellers;
 *   (3) is in identify/test/always-an-answer.test.ts, where the two vendors
 *       can be failed one pass at a time.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-always-answer-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;

const { server, setIdentifierForTests, setGroundedForTests, setCatalogueForTests } = await import('../server.ts');
const { setGroundedModuleForTests } = await import('../src/grounded-record.ts');
const { Identifier } = await import('../../identify/src/model.ts');
import type { MessagesClient } from '../../identify/src/model.ts';
import type { CatalogueLookup } from '../../identify/src/identify.ts';

let port = 0;

interface Asked {
  kind: 'barcode' | 'price' | 'prefetch';
  query: unknown;
  forDevice: string;
}
const asked: Asked[] = [];

const BARCODE_BLOCK = {
  kind: 'barcode',
  checked: false,
  name: 'Dry Spray Antiperspirant Clean Comfort',
  brand: 'Dove Men+Care',
  size: '107 g',
  facts: [],
};

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  // The sealed box's own module, doubled to its contract: the block goes out to its owner.
  setGroundedModuleForTests({
    toWire(box: { owner: string; block: unknown }, requestedBy: string) {
      if (box.owner !== requestedBy) throw new Error('cross-user request');
      return { kind: 'grounded', forDevice: requestedBy, fetchedAt: '2026-09-15T00:00:00.000Z', block: box.block, suggestionsHtml: '' };
    },
    historyText: () => 'history',
    discard() {},
  provenanceOf() {
    return {
      forDevice: 'device-A',
      fetchedAt: '2026-09-16T00:00:00.000Z',
      promptId: 'prices_reviews_description',
      provider: 'gemini' as const,
      searchQueries: 0,
      model: 'gemini-3.5-flash-lite',
      usage: null,
    };
  },
  } as never);
  setGroundedForTests({
    name: 'fake',
    async lookupBarcode(gtin, forDevice) {
      asked.push({ kind: 'barcode', query: gtin, forDevice });
      return { owner: forDevice, block: BARCODE_BLOCK } as never;
    },
    async lookupPrice(query, forDevice) {
      asked.push({ kind: 'price', query, forDevice });
      return { owner: forDevice, block: { kind: 'prices', offers: [], reviews: [], verdict: null } } as never;
    },
    prefetchPrice(query, forDevice) {
      asked.push({ kind: 'prefetch', query, forDevice });
    },
  });
});

after(async () => {
  setGroundedForTests(null);
  setGroundedModuleForTests(null);
  setIdentifierForTests(null);
  setCatalogueForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const READING = {
  front_text: ['DOVE MEN+CARE', 'Clean Comfort', '107 g'],
  barcode_digits: null,
  count: null,
  language_seen: 'en',
  brand: 'Dove Men+Care',
  name: 'Dry Spray',
  variant: 'Clean Comfort',
  size_value: 107,
  size_unit: 'g',
  category: 'personal_care',
  visible_text: 'DOVE MEN+CARE Clean Comfort 107 g',
  alternates: [],
  self_confidence: 'medium',
  uncertainty: null,
};

function answeringClient(payload: unknown): MessagesClient {
  return {
    messages: {
      create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] }) as never,
    },
  };
}

const NOTHING: CatalogueLookup = async () => ({ band: 'miss', candidates: [], ring: null, matchedBy: 'none' });

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('REQUIREMENT 1: a photo the catalogue cannot match is an unchecked answer, and its price search has started', async () => {
  asked.length = 0;
  setIdentifierForTests({ model: new Identifier('test-key-not-used', answeringClient(READING)), lookup: NOTHING });
  const res = await fetch(`http://127.0.0.1:${port}/api/identify/photo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: PNG_1x1.toString('base64'), sharpness: 80, deviceId: 'photo-device' }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { product: unknown; unchecked?: { checked: boolean; label: string; source: string } };
  assert.equal(body.product, null);
  assert.ok(body.unchecked, 'a photo that was read came back with nothing to show');
  assert.equal(body.unchecked.checked, false);
  assert.equal(body.unchecked.source, 'photo');
  assert.equal(body.unchecked.label, 'Dove Men+Care Dry Spray');
  assert.equal('grounded' in body, false, 'the photo route served a grounded block itself');
  const prefetch = asked.find((a) => a.kind === 'prefetch');
  assert.ok(prefetch, 'the price search did not start with the answer');
  assert.deepEqual(prefetch.query, { text: 'Dove Men+Care Dry Spray' });
  assert.equal(prefetch.forDevice, 'photo-device');
});

test('REQUIREMENT 1: a barcode the catalogue does not know is named from the search, unchecked, for an anonymous scan too', async () => {
  setCatalogueForTests({ byGtin: () => null });
  for (const deviceId of ['barcode-device', '']) {
    asked.length = 0;
    const res = await fetch(`http://127.0.0.1:${port}/api/identify?gtin=0079400450828&deviceId=${deviceId}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { product: unknown; unchecked?: { label: string; gtin: string; source: string }; grounded?: { block: unknown } };
    assert.equal(body.product, null);
    assert.ok(body.unchecked, `no unchecked answer for device "${deviceId}"`);
    assert.equal(body.unchecked.source, 'search');
    assert.equal(body.unchecked.label, 'Dove Men+Care Dry Spray Antiperspirant Clean Comfort 107 g');
    assert.equal(body.unchecked.gtin, '0079400450828');
    assert.deepEqual(body.grounded?.block, BARCODE_BLOCK);
  }
  setCatalogueForTests(null);
});

test('REQUIREMENT 1: a catalogue hit is unchanged, and only starts the price search', async () => {
  asked.length = 0;
  setCatalogueForTests({
    byGtin: (code: string) =>
      code === '0068100084245'
        ? { code, name: 'Kraft Dinner Original', brands: 'Kraft', quantity: '225 g', sizeValue: 225, sizeUnit: 'g', soldInCanada: true, nameFr: null, leafCategory: null, categoryPath: [], source: 'off' }
        : null,
  });
  const res = await fetch(`http://127.0.0.1:${port}/api/identify?gtin=0068100084245&deviceId=hit-device`);
  const body = (await res.json()) as { product: { code: string } | null; unchecked?: unknown; grounded?: unknown };
  assert.equal(body.product?.code, '0068100084245');
  assert.equal(body.unchecked, undefined);
  assert.equal(body.grounded, undefined);
  assert.deepEqual(asked.map((a) => a.kind), ['prefetch']);
  assert.deepEqual(asked[0].query, { text: 'Kraft Kraft Dinner Original', gtin: '0068100084245', sizeValue: 225, sizeUnit: 'g' });
  setCatalogueForTests(null);
});

test('REQUIREMENT 2: the price search gets the shelf price and the size, and its block rides on a refusal too', async () => {
  asked.length = 0;
  const res = await fetch(`http://127.0.0.1:${port}/api/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Dove Men+Care Dry Spray', deviceId: 'price-device', askingCents: 899, sizeValue: 107, sizeUnit: 'g' }),
  });
  const body = (await res.json()) as { kind: string; grounded?: { block: { kind: string } } };
  assert.equal(body.grounded?.block.kind, 'prices', 'the grounded prices did not reach the answer');
  const price = asked.find((a) => a.kind === 'price');
  assert.ok(price);
  assert.deepEqual(price.query, { text: 'Dove Men+Care Dry Spray', gtin: undefined, askingCents: 899, sizeValue: 107, sizeUnit: 'g' });
});
