/**
 * THE US NAMES INDEX AT THE SOCKET. A popular US product the Canada catalogue does not hold (Poland Spring water)
 * is named from the offline index before the live Open Food Facts call, so a throttled or failed live call no longer
 * ends the scan with "not in catalogue" (RULINGS.md "A scan never ends with no result", 2026-10-10). A hit is
 * treated exactly like a live Open Food Facts name: same `identitySource`, same price ladder after it.
 *
 * Also the 8-digit retry: a code valid as UPC-E and as EAN-8 whose UPC-E expansion is found nowhere is retried as an
 * EAN-8. No socket leaves this machine: Open Food Facts gets the module's own fetch double, which records its calls,
 * and the range ask gets a fake provider. The index is the fixture the builder test checks.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-us-names-route-'));
const FIXTURE = fileURLToPath(new URL('../../catalogue/test/fixtures/us-names-index.db', import.meta.url));

process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = join(dir, 'prices.db');
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.SHIN_PACK_READ_STORE_PATH = join(dir, 'pack-read.json');
process.env.SHIN_US_NAMES_INDEX = FIXTURE;
process.env.PORT = '0';
process.env.SHIN_CATALOGUE_FIRST = '1';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;

const POLAND_SPRING = '0075720000814';
const EIGHT_DIGIT = '06104696';
const EIGHT_DIGIT_EXPANDED = '061046000096';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const catDb = openCatalogue(':memory:');
rebuildFts(catDb);
const NO_EMBEDDER = {
  id: 'test:none',
  dim: 384,
  async embedPassages() {
    throw new Error('vector arm should be off');
  },
  async embedQuery() {
    throw new Error('vector arm should be off');
  },
};
const catalogue = new Catalogue(catDb, NO_EMBEDDER as unknown as ConstructorParameters<typeof Catalogue>[1]);

const offCalls: string[] = [];
const rangeAsks: string[] = [];
const rangeAskProvider = {
  name: 'fake-claude-range',
  async send<T>(req: { user: string }) {
    rangeAsks.push(req.user);
    return {
      value: { known: true, low_cents: 149, high_cents: 249, currency: 'USD', unit: 'one bottle', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
const { setOffFetchForTests, clearOffCacheForTests } = await import('../src/open-food-facts.ts');
const { setUsNamesIndexForTests } = await import('../src/us-names-index.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: rangeAskProvider as never, claudeWaitMs: 2000 } as never);
  clearOffCacheForTests();
  // Open Food Facts, if it is asked at all, knows only the one product the missing-index test needs it to know.
  setOffFetchForTests(async (url) => {
    const code = /product\/(\d+)\.json/.exec(url)?.[1] ?? '';
    offCalls.push(code);
    if (code === POLAND_SPRING) {
      return { ok: true, status: 200, json: async () => ({ code, product: { code, product_name: 'Poland Spring (live)', brands: 'Poland Spring', quantity: '1 L' } }) };
    }
    return { ok: false, status: 404, json: async () => ({ status: 0 }) };
  });
});

after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  setOffFetchForTests(null);
  setUsNamesIndexForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    catDb.close();
  } catch {
    /* already closed */
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

async function identify(gtin: string, extra = '', device = 'usn-test'): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=US${extra}`);
  assert.equal(r.status, 200, `/api/identify answered ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

test('a US product in the index is named without a live Open Food Facts call, and takes the price ladder', async () => {
  setUsNamesIndexForTests(FIXTURE);
  const calls = offCalls.length;
  const asks = rangeAsks.length;
  const body = await identify(POLAND_SPRING);
  assert.equal(body.outcome, 'named_outside_catalogue');
  assert.equal(body.identitySource, 'open_food_facts', 'an index name must read exactly like a live Open Food Facts name');
  assert.equal(body.offerManualEntry, false);
  const identity = body.identity as Record<string, unknown>;
  assert.equal(identity.name, 'Poland Spring Natural Spring Water');
  assert.equal(identity.brand, 'Poland Spring');
  assert.equal(identity.size, '1 L');
  assert.equal(offCalls.length, calls, 'Open Food Facts was asked although the index held the barcode');
  assert.equal(rangeAsks.length - asks, 1, 'the named item did not take the price ladder down to the range ask');
  assert.ok(body.verdict || body.range, 'the named item came back with neither a verdict nor a range');
});

test('the price pad preview names it too, with no live call', async () => {
  setUsNamesIndexForTests(FIXTURE);
  const calls = offCalls.length;
  const body = await identify(POLAND_SPRING, '&preview=1');
  assert.equal(body.preview, true);
  assert.equal((body.identity as Record<string, unknown> | null)?.name, 'Poland Spring Natural Spring Water');
  assert.equal(body.identitySource, 'open_food_facts');
  assert.equal(offCalls.length, calls);
});

test('with no index file the server still answers: the live Open Food Facts lookup names it, as before', async () => {
  setUsNamesIndexForTests(join(dir, 'never-built.db'));
  clearOffCacheForTests();
  const calls = offCalls.length;
  const body = await identify(POLAND_SPRING);
  assert.equal(body.outcome, 'named_outside_catalogue');
  assert.equal((body.identity as Record<string, unknown>).name, 'Poland Spring (live)');
  assert.equal(offCalls.length - calls, 1);
});

test('an 8-digit code: the UPC-E expansion is asked, then the EAN-8 reading is named from the index', async () => {
  setUsNamesIndexForTests(FIXTURE);
  clearOffCacheForTests();
  const calls = offCalls.length;
  const body = await identify(EIGHT_DIGIT);
  assert.equal(body.outcome, 'named_outside_catalogue', 'the EAN-8 reading was not tried after the UPC-E expansion found nothing');
  assert.equal((body.identity as Record<string, unknown>).name, 'Fixture Mint Candy');
  assert.deepEqual(offCalls.slice(calls), [EIGHT_DIGIT_EXPANDED], 'the retry should name the EAN-8 from the index, not spend a second live call');
});
