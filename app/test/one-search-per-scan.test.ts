/**
 * ONE SCAN, ONE GROUNDED SEARCH.
 *
 * `/api/identify` and `/api/identify/photo` start the price search in the
 * background the moment they name a product, so it is running while the
 * shopper reads the answer and types the shelf price. `/api/price` is supposed
 * to COLLECT that search. Until 2026-09-15 it started a second one on every
 * single scan: two Gemini bills, and the shopper waited on the slower of the
 * two rather than on neither.
 *
 * WHY THE EXISTING TEST DID NOT CATCH IT, and why this file exists at all.
 * `identify/test/gemini-grounded.test.ts` already asserts "prefetch then
 * lookup is ONE search" -- and it passes, because it calls the adapter
 * directly with a matching device and a matching query. Both of those are
 * exactly what the app did not do:
 *
 *   1. the phone's price body carried no `deviceId`, so the server minted a
 *      fresh `unattributed-request-<uuid>` owner per request and the cache key
 *      (which begins with the owner) could never match;
 *   2. the text differed -- the server prefetched under
 *      "<first brand> <name>" and the phone sent the label it was SHOWING,
 *      which drops the brand when the name already starts with it and appends
 *      the pack size.
 *
 * A unit test on the adapter cannot see either. So the double below is
 * installed through the APP's seam, `setGroundedForTests`, the walk is over a
 * real socket, and what is asserted is a COUNT rather than a shape. Each case
 * has its negative beside it -- strip the device id, or drop the echoed query,
 * and the counter reads 2 -- so the regression is visible rather than implied.
 *
 * THE DOUBLE KEYS THE WAY THE REAL ADAPTER KEYS. `gemini-grounded.ts`'s
 * private `#key` is `${forDevice}|gtin:<digits>` or `${forDevice}|text:<lower,
 * collapsed>`, and the copy below is deliberate: this file is asking whether
 * the two ROUTES agree on a key, which is a question about this repo's own
 * plumbing and not about Google's. If that rule ever changes, this file's copy
 * is the thing that has to be changed with it.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-one-search-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_GEMINI_TIER;

const { server, setGroundedForTests, setCatalogueForTests, setIdentifierForTests } = await import('../server.ts');
const { setGroundedModuleForTests } = await import('../src/grounded-record.ts');
const { Identifier } = await import('../../identify/src/model.ts');
import type { GroundedPriceQuery } from '../server.ts';
import type { Grounded } from '../src/grounded-record.ts';
import type { MessagesClient } from '../../identify/src/model.ts';
import type { CatalogueLookup } from '../../identify/src/identify.ts';

let port = 0;

/* ------------------------------ the counter ------------------------------ */

/** How many DISTINCT searches the double was asked to run since the reset. */
let searches = 0;
const started = new Map<string, Promise<Grounded<unknown>>>();

/** `gemini-grounded.ts`'s `#key`, copied. See the header. */
function keyFor(query: GroundedPriceQuery, forDevice: string): string | null {
  const gtin = query.gtin?.replace(/\D/g, '').replace(/^0+/, '');
  if (gtin) return `${forDevice}|gtin:${gtin}`;
  const text = query.text?.toLowerCase().replace(/\s+/g, ' ').trim();
  return text ? `${forDevice}|text:${text}` : null;
}

function searchOnce(query: GroundedPriceQuery, forDevice: string): Promise<Grounded<unknown>> | null {
  const key = keyFor(query, forDevice);
  if (key === null) return null;
  const kept = started.get(key);
  if (kept) return kept;
  searches += 1;
  // Not a real box: `Grounded` is nominal and only `seal` can build one. The
  // three doors out of it are faked below, which is the same stand-in
  // `grounded-never-shared.test.mjs` uses and for the same reason.
  const box = Promise.resolve({ owner: forDevice, text: 'counted' } as unknown as Grounded<unknown>);
  started.set(key, box);
  return box;
}

/** Lane L2's module, faked to its documented contract. */
const fakeModule = {
  toWire(box: { owner: string }, requestedBy: string) {
    if (!requestedBy) throw new Error('anonymous device');
    if (box.owner !== requestedBy) throw new Error('cross-user request');
    return {
      kind: 'grounded',
      forDevice: requestedBy,
      fetchedAt: '2026-09-15T00:00:00.000Z',
      block: { text: 'counted' },
      suggestionsHtml: '<div class="container">counted</div>',
    };
  },
  historyText(box: { text: string }) {
    return box.text;
  },
  discard() {},
};

/* ------------------------------- the fixtures ---------------------------- */

const ROW = {
  code: '0068100084245',
  name: 'Kraft Dinner Original',
  brands: 'Kraft',
  quantity: '225 g',
  sizeValue: 225,
  sizeUnit: 'g',
  soldInCanada: true,
  leafCategory: 'Macaroni',
  categoryPath: ['Groceries'],
  source: 'openfoodfacts',
};

/**
 * What the phone would have sent as `text` before today: the label it is
 * SHOWING. Deliberately not the string the server prefetched under, because
 * the whole point of the echo is that the two no longer have to agree.
 */
const LABEL_ON_THE_GLASS = 'Kraft Dinner Original 225 g';

const READING = {
  front_text: ['KRAFT DINNER', 'Original', '225 g'],
  barcode_digits: null,
  count: null,
  language_seen: 'en',
  brand: 'Kraft',
  name: 'Dinner',
  variant: 'Original',
  size_value: 225,
  size_unit: 'g',
  category: 'grocery',
  visible_text: 'KRAFT DINNER Original 225 g',
  alternates: [],
  self_confidence: 0.9,
  uncertainty: null,
};

/** A catalogue that has never heard of it, which is what makes an answer "unchecked". */
const MISS: CatalogueLookup = async () => ({
  band: 'miss' as const,
  candidates: [],
  ring: null,
  matchedBy: 'none' as const,
});

const HIT: CatalogueLookup = async () => ({
  band: 'confident',
  candidates: [
    {
      code: ROW.code,
      name: ROW.name,
      brands: ROW.brands,
      quantity: ROW.quantity,
      sizeValue: ROW.sizeValue,
      sizeUnit: ROW.sizeUnit,
      categoryPath: [],
      allergens: [],
      signals: { similarity: 0.92, brandAgrees: true, sizeAgrees: true },
    },
  ],
  ring: null,
  matchedBy: 'hybrid',
});

const answeringClient = (payload: unknown): MessagesClient => ({
  messages: {
    create: async () =>
      ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] }) as never,
  },
});

/** A real 1x1 PNG, so the magic-byte check is reading a genuine header. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: (code: string) => (code === ROW.code ? ROW : null) });
  setIdentifierForTests({ model: new Identifier('test-key-not-used', answeringClient(READING)), lookup: HIT });
  setGroundedModuleForTests(fakeModule as never);
  setGroundedForTests({
    name: 'counting',
    async lookupBarcode(gtin: string, forDevice: string) {
      return searchOnce({ gtin }, forDevice);
    },
    async lookupPrice(query: GroundedPriceQuery, forDevice: string) {
      return searchOnce(query, forDevice);
    },
    prefetchPrice(query: GroundedPriceQuery, forDevice: string) {
      void searchOnce(query, forDevice);
    },
  });
});

after(async () => {
  setGroundedForTests(null);
  setGroundedModuleForTests(null);
  setCatalogueForTests(null);
  setIdentifierForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

beforeEach(() => {
  searches = 0;
  started.clear();
});

const base = () => `http://127.0.0.1:${port}`;

type Identified = { scanId?: number; priceQuery?: GroundedPriceQuery; product?: { code: string } | null };

async function identifyByCode(deviceId: string): Promise<Identified> {
  const res = await fetch(`${base()}/api/identify?gtin=${ROW.code}&deviceId=${deviceId}`);
  assert.equal(res.status, 200);
  return (await res.json()) as Identified;
}

async function identifyByPhoto(deviceId: string): Promise<Identified> {
  const res = await fetch(`${base()}/api/identify/photo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: PNG_1x1.toString('base64'), sharpness: 80, deviceId }),
  });
  assert.equal(res.status, 200);
  return (await res.json()) as Identified;
}

/**
 * The photo walk with the catalogue standing in as "never seen it", so the
 * answer comes back unchecked and its search is keyed on the reading.
 * The double is put back afterwards, because every other walk here needs it.
 */
async function unidentifiedPhoto(deviceId: string): Promise<Identified> {
  setIdentifierForTests({ model: new Identifier('test-key-not-used', answeringClient(READING)), lookup: MISS });
  try {
    const seen = await identifyByPhoto(deviceId);
    assert.equal(seen.product ?? null, null, 'the catalogue matched it after all');
    return seen;
  } finally {
    setIdentifierForTests({ model: new Identifier('test-key-not-used', answeringClient(READING)), lookup: HIT });
  }
}

async function askPrice(body: unknown) {
  const res = await fetch(`${base()}/api/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200);
  return (await res.json()) as Record<string, unknown>;
}

/* --------------------------------- the walks ----------------------------- */

test('the identify route hands back the exact query it started the search under', async () => {
  const seen = await identifyByCode('d-echo');
  assert.ok(seen.priceQuery, 'no priceQuery came back, so the client has nothing to hand over');
  // The server's own string, not the label the screen shows. If these two were
  // the same string the echo would be pointless and so would this file.
  assert.equal(seen.priceQuery!.text, 'Kraft Kraft Dinner Original');
  assert.notEqual(seen.priceQuery!.text, LABEL_ON_THE_GLASS);
  assert.equal(seen.priceQuery!.gtin, ROW.code);
  assert.equal(searches, 1, 'identify started something other than exactly one search');
});

test('identify then price, with the device id and the scan id, is ONE search', async () => {
  const seen = await identifyByCode('d-one');
  assert.equal(searches, 1);
  await askPrice({
    deviceId: 'd-one',
    scanId: seen.scanId,
    priceQuery: seen.priceQuery,
    text: LABEL_ON_THE_GLASS,
    gtin: ROW.code,
    askingCents: 499,
  });
  assert.equal(searches, 1, 'the price route started a second search instead of collecting the first');
});

test('strip the device id and it is TWO: the owner is the front of the cache key', async () => {
  /*
   * The defect as it shipped. The phone's price body had exactly five keys --
   * text, gtin, category, askingCents, askingSeller -- so the server minted a
   * fresh `unattributed-request-<uuid>` owner, and an owner that is new every
   * time cannot match a key filed under a device.
   */
  const seen = await identifyByCode('d-stripped');
  assert.equal(searches, 1);
  await askPrice({
    scanId: seen.scanId,
    priceQuery: seen.priceQuery,
    text: LABEL_ON_THE_GLASS,
    gtin: ROW.code,
    askingCents: 499,
  });
  assert.equal(searches, 2, 'an anonymous price request somehow collected a device-owned search');
});

test('the echoed query is what makes the TEXT branch of the key hit', async () => {
  /*
   * The second, independent half of the defect, and the only walk in this file
   * where the key has no barcode in it.
   *
   * A photo the catalogue cannot match still answers -- whatever the model
   * read, labelled unchecked -- and the search for it is filed under that
   * reading with no gtin at all. So the cache key is the TEXT one, and the
   * text the screen goes on to show is not the text the server searched. This
   * is the case a barcode was quietly covering up: with a code in the body the
   * gtin branch wins and the mismatched text never mattered.
   */
  const seen = await unidentifiedPhoto('d-text');
  assert.equal(searches, 1);
  assert.ok(seen.priceQuery, 'an unchecked photo answer echoed no priceQuery');
  assert.equal(seen.priceQuery!.gtin, undefined, 'the unchecked walk was keyed on a barcode after all');
  assert.equal(seen.priceQuery!.text, 'Kraft Dinner');
  assert.notEqual(seen.priceQuery!.text, LABEL_ON_THE_GLASS);

  await askPrice({
    deviceId: 'd-text',
    scanId: seen.scanId,
    priceQuery: seen.priceQuery,
    text: LABEL_ON_THE_GLASS,
    askingCents: 499,
  });
  assert.equal(searches, 1, 'the echoed text did not reach the lookup');
});

test('without the echo that same text walk is TWO, which is what shipped', async () => {
  const seen = await unidentifiedPhoto('d-text-old');
  assert.equal(searches, 1);
  await askPrice({
    deviceId: 'd-text-old',
    scanId: seen.scanId,
    text: LABEL_ON_THE_GLASS,
    askingCents: 499,
  });
  assert.equal(searches, 2, 'the label on the glass somehow collided with the query the server searched');
});

test('a client old enough not to send the echo still works, and pays for the miss', async () => {
  /*
   * BACKWARD COMPATIBILITY IS THE POINT OF THIS ONE. An app already on
   * somebody's phone sends no `priceQuery`, and it must still get a grounded
   * answer -- it just gets it from a second search, which is what today costs.
   * If this ever asserts 1, the fallback has been removed.
   */
  const seen = await identifyByCode('d-old');
  assert.equal(searches, 1);
  const answer = await askPrice({
    deviceId: 'd-old',
    scanId: seen.scanId,
    text: LABEL_ON_THE_GLASS,
    askingCents: 499,
  });
  assert.equal(searches, 2);
  assert.equal((answer.grounded as { kind?: string } | undefined)?.kind, 'grounded', 'the old client got no answer');
});

test('photo then price, with the device id and the scan id, is ONE search', async () => {
  const seen = await identifyByPhoto('d-photo');
  assert.ok(seen.priceQuery, 'the photo route echoed no priceQuery');
  assert.equal(searches, 1, 'the photo route started something other than exactly one search');
  await askPrice({
    deviceId: 'd-photo',
    scanId: seen.scanId,
    priceQuery: seen.priceQuery,
    text: LABEL_ON_THE_GLASS,
    gtin: ROW.code,
    askingCents: 499,
  });
  assert.equal(searches, 1, 'the price route started a second search after a photo scan');
});

test('photo with the device id stripped off the price body is TWO', async () => {
  const seen = await identifyByPhoto('d-photo-stripped');
  assert.equal(searches, 1);
  await askPrice({
    scanId: seen.scanId,
    priceQuery: seen.priceQuery,
    text: LABEL_ON_THE_GLASS,
    gtin: ROW.code,
    askingCents: 499,
  });
  assert.equal(searches, 2);
});

test('a priceQuery off the wire may not put a key of its own choosing into the lookup', async () => {
  /*
   * The echo arrives from a client, so it is read field by field rather than
   * spread. What is asserted here is the consequence that matters: an
   * unrecognised key changes nothing about which search runs, and cannot reach
   * the lookup at all.
   */
  const seen = await identifyByCode('d-hostile');
  assert.equal(searches, 1);
  await askPrice({
    deviceId: 'd-hostile',
    scanId: seen.scanId,
    priceQuery: { ...seen.priceQuery, brand: 'injected', packCount: 99, nonsense: true },
    askingCents: 499,
  });
  assert.equal(searches, 1, 'an extra key changed the search that ran');
});
