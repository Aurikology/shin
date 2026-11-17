/**
 * SHOPPER PRICES, AT THE SOCKET (docs/decisions.md, 2026-11-15, "Shopper prices").
 *
 * A price typed on the pad for a product Pexi identified by its barcode is saved for the next shopper;
 * the identify answer says so (`contributed`, `pricesAdded`), and the name preview says whether Pexi
 * has any price for the product (`priceKnown`). Everything is read out of HTTP responses and the
 * corrections database the route writes. No model is called.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-shopper-prices-'));
const pricesPath = join(dir, 'prices.db');
const correctionsPath = join(dir, 'corrections.db');

process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = correctionsPath;
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = pricesPath;
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_CATALOGUE_FIRST;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

const NEW_HIT = withCheck('006810009101'); // in the catalogue, no price anywhere
const SHOP_HIT = withCheck('006810009102'); // in the catalogue, two shops price it
const MISSING = withCheck('006999999991'); // valid, in no catalogue
const PATH = '["en:spreads","en:peanut-butters"]';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(NEW_HIT, 'Smooth Peanut Butter', 'Smooth Peanut Butter', 'Kraft', '1 kg', 1000, 'g', PATH, 'en:peanut-butters');
  insert.run(SHOP_HIT, 'Crunchy Peanut Butter', 'Crunchy Peanut Butter', 'Kraft', '1 kg', 1000, 'g', PATH, 'en:peanut-butters');
  rebuildFts(catDb);
  rebuildCategories(catDb);
}
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

const today = new Date().toISOString().slice(0, 10);
const { openPrices, recordObservation } = await import('../../price/src/store.ts');
{
  const prices = openPrices(pricesPath);
  let sku = 0;
  for (const [seller, store, cents] of [
    ['alpha', 'Alpha One', 599],
    ['beta', 'Beta One', 649],
  ] as const) {
    recordObservation(prices, {
      code: SHOP_HIT,
      seller,
      sellerSku: `SKU-${(sku += 1)}`,
      sellerName: `${store} item`,
      sellerBrand: null,
      priceCents: cents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
      currency: 'CAD',
      country: 'CA',
      region: 'ON',
      joinMethod: 'gtin',
      seenOn: today,
      url: null,
      imageUrl: null,
      inStock: null,
      storeName: store,
      storeCity: null,
      basePriceCents: null,
    });
  }
  prices.close();
}

const { server, setCatalogueForTests, setCatalogueFirstForTests, setSearchServiceForTests } = await import('../server.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb });
  setSearchServiceForTests(catalogue as never);
});

after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  setSearchServiceForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    catDb.close();
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

/** `from` is the client address the tunnel would name (cf-connecting-ip is believed on this loopback connection). */
async function identify(gtin: string, device: string, extra = '', from: string | null = null): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=CA&region=Ontario${extra}`, {
    headers: from ? { 'cf-connecting-ip': from } : {},
  });
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

async function preview(gtin: string, device = 'sp-preview'): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=CA&preview=1`);
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, unknown>;
}

function savedRows(): Record<string, unknown>[] {
  const db = new DatabaseSync(correctionsPath, { readOnly: true });
  try {
    return db.prepare('SELECT * FROM shopper_price ORDER BY id').all() as Record<string, unknown>[];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

test('preview: a product with no price of any kind says priceKnown false, and a shop-priced one true', async () => {
  const none = await preview(NEW_HIT);
  assert.equal(none.preview, true);
  assert.equal(none.outcome, 'catalogue_hit');
  assert.equal(none.priceKnown, false);
  const shop = await preview(SHOP_HIT);
  assert.equal(shop.priceKnown, true);
});

test('preview: a barcode no one names says priceKnown false and stays a plain preview', async () => {
  const b = await preview(MISSING);
  assert.equal(b.preview, true);
  assert.equal(b.priceKnown, false);
  const bad = await preview('12345');
  assert.equal(bad.outcome, 'preview_unavailable');
  assert.equal(bad.priceKnown, false);
});

test('a typed price on an identified product is saved: contributed true, pricesAdded 1, with region and shop', async () => {
  const body = await identify(NEW_HIT, 'sp-dev-1', '&shelfPriceCents=649&storeName=Loblaws');
  assert.equal(body.outcome, 'catalogue_hit');
  assert.equal(body.contributed, true);
  assert.equal(body.pricesAdded, 1);
  assert.equal(body.contributedWhy, undefined);
  const rows = savedRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.device_id, 'sp-dev-1');
  assert.equal(rows[0]!.price_cents, 649);
  assert.equal(rows[0]!.store, 'Loblaws');
  assert.equal(rows[0]!.region, 'Ontario', 'the region as the phone sent it');
  assert.equal(rows[0]!.seen_on, today);
});

test('the same device, product and day again: not saved twice, the count stays 1, and the reason is named', async () => {
  const body = await identify(NEW_HIT, 'sp-dev-1', '&shelfPriceCents=599');
  assert.equal(body.contributed, false);
  assert.equal(body.contributedWhy, 'already_today');
  assert.equal(body.pricesAdded, 1);
  assert.equal(savedRows().length, 1);
});

test('the network is kept as a hash, never as the address', () => {
  const rows = savedRows();
  const net = String(rows[0]!.net_hash);
  assert.match(net, /^[0-9a-f]{24}$/);
  assert.equal(JSON.stringify(rows).includes('127.0.0'), false);
});

test('SIM: one fake phone typing a price does not set the next shopper\'s answer; preview still says Pexi has a price', async () => {
  const body = await identify(NEW_HIT, 'sp-dev-2');
  const verdict = body.verdict as Record<string, unknown> | null;
  assert.notEqual(verdict?.basis, 'own_prices', 'one phone is not a price');
  assert.notEqual(verdict?.centreCents, 649);
  assert.equal(body.contributed, false);
  assert.equal(body.contributedWhy, undefined, 'no price typed: nothing to explain');
  assert.equal(body.pricesAdded, 0);
  const p = await preview(NEW_HIT);
  assert.equal(p.priceKnown, true);
});

test('the next shopper benefits once 3 phones from 2 networks agree: a verdict from them, low confidence', async () => {
  assert.equal((await identify(NEW_HIT, 'sp-dev-7', '&shelfPriceCents=659', '198.51.100.5')).contributed, true);
  const two = await identify(NEW_HIT, 'sp-dev-2');
  assert.notEqual((two.verdict as Record<string, unknown> | null)?.basis, 'own_prices', 'two phones are not enough');
  assert.equal((await identify(NEW_HIT, 'sp-dev-8', '&shelfPriceCents=639', '198.51.100.77')).contributed, true);
  const three = await identify(NEW_HIT, 'sp-dev-2');
  const verdict = three.verdict as Record<string, unknown>;
  assert.equal(verdict.basis, 'own_prices');
  assert.equal(verdict.centreCents, 649, 'phones 1 and 8 are on different networks: the median of 639, 649, 659');
  assert.equal(verdict.confidence, 'low');
});

test('SHIN_SHOPPER_VOICE=off: the same three phones no longer move the answer, and nothing is lost', async () => {
  process.env.SHIN_SHOPPER_VOICE = 'off';
  try {
    const off = await identify(NEW_HIT, 'sp-dev-2');
    assert.notEqual((off.verdict as Record<string, unknown> | null)?.basis, 'own_prices');
    assert.equal(savedRows().length >= 3, true, 'the typed prices are still stored');
  } finally {
    delete process.env.SHIN_SHOPPER_VOICE;
  }
  const on = await identify(NEW_HIT, 'sp-dev-2');
  assert.equal((on.verdict as Record<string, unknown>).basis, 'own_prices');
});

test('typo guard: a price under a third or over three times the product\'s centre is not saved', async () => {
  const low = await identify(SHOP_HIT, 'sp-dev-3', '&shelfPriceCents=100');
  assert.equal(low.contributed, false);
  assert.equal(low.contributedWhy, 'typo_guard');
  const high = await identify(SHOP_HIT, 'sp-dev-3', '&shelfPriceCents=9999');
  assert.equal(high.contributed, false);
  assert.equal(high.contributedWhy, 'typo_guard');
  assert.equal(high.pricesAdded, 0);
  const fine = await identify(SHOP_HIT, 'sp-dev-3', '&shelfPriceCents=699');
  assert.equal(fine.contributed, true);
  assert.equal(fine.pricesAdded, 1);
});

test('with two shop prices a shopper price changes nothing in the answer', async () => {
  const before = await identify(SHOP_HIT, 'sp-dev-4');
  const after = await identify(SHOP_HIT, 'sp-dev-5');
  assert.deepEqual((after.verdict as Record<string, unknown>).centreCents, (before.verdict as Record<string, unknown>).centreCents);
  assert.equal(((after.verdict as Record<string, unknown>).dots as unknown[]).length, 2);
});

test('probe devices are never recorded', async () => {
  const body = await identify(NEW_HIT, 'probe-e2e-sp', '&shelfPriceCents=650');
  assert.equal(body.contributed, false);
  assert.equal(body.contributedWhy, 'probe_device');
  assert.equal(body.pricesAdded, 0);
  assert.equal(savedRows().filter((r) => String(r.device_id).startsWith('probe')).length, 0);
});

test('a barcode nobody names is not recorded: there is no product to hang the price on', async () => {
  const body = await identify(MISSING, 'sp-dev-6', '&shelfPriceCents=500');
  assert.equal(body.contributed, false);
  assert.equal(body.contributedWhy, 'not_identified');
  assert.equal(body.pricesAdded, 0);
});

test('no price typed: contributed false, no reason, and the count is still there', async () => {
  const body = await identify(NEW_HIT, 'sp-dev-1');
  assert.equal(body.contributed, false);
  assert.equal(body.contributedWhy, undefined);
  assert.equal(body.pricesAdded, 1);
});

test('the matches /api/search offers a device are remembered for its picks (F3), and a search with no device remembers nothing', async () => {
  const r = await fetch(`${base}/api/search?q=${encodeURIComponent('peanut butter')}&limit=3&deviceId=sp-offer-dev`);
  assert.equal(r.status, 200);
  const body = (await r.json()) as { candidates: { code: string }[] };
  assert.ok(body.candidates.length > 0, 'the fixture catalogue offered something: ' + JSON.stringify(body).slice(0, 300));
  await fetch(`${base}/api/search?q=${encodeURIComponent('peanut butter')}&limit=3`);
  const db = new DatabaseSync(process.env.SHIN_SCANS!, { readOnly: true });
  try {
    const rows = db.prepare('SELECT device_id, code_key FROM scan_offer').all() as { device_id: string; code_key: string }[];
    assert.equal(rows.length, body.candidates.length);
    assert.equal(rows.every((x) => x.device_id === 'sp-offer-dev'), true);
    const offered = new Set(body.candidates.map((c) => c.code.replace(/^0+/, '')));
    assert.equal(rows.every((x) => offered.has(x.code_key)), true);
  } finally {
    db.close();
  }
});
