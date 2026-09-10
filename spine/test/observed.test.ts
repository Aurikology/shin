/**
 * Tests for the observed-price source against small fixture databases built
 * with the same schema as `price/src/store.ts`, never against the shared
 * `price/data/prices.db` a background crawl is writing to right now.
 *
 * Two fixtures. `FIXTURE_PATH` has no `store_name`/`store_osm` columns, which
 * is what the live database actually looks like today (checked 2026-09-05:
 * `PRAGMA table_info` on `price/data/prices.db` carries neither column yet).
 * `STORE_FIXTURE_PATH` adds them, populated for some rows and not others, to
 * exercise the seam for the migration that will eventually fill them in.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObservedSource } from '../src/sources/observed.ts';
import { priceIt } from '../src/spine.ts';

const DIR = mkdtempSync(join(tmpdir(), 'shin-observed-test-'));
const FIXTURE_PATH = join(DIR, 'fixture-prices.db');
const STORE_FIXTURE_PATH = join(DIR, 'fixture-prices-with-store-columns.db');

interface FixtureRow {
  code: string | null;
  seller: string;
  seller_sku: string;
  seller_name: string;
  seller_brand: string | null;
  price_cents: number;
  kind: 'regular' | 'promotional';
  unit_price_cents: number | null;
  unit_label: string | null;
  join_method: 'gtin' | 'name' | 'none';
  seen_on: string;
  url: string | null;
  store_name?: string | null;
  store_osm?: string | null;
}

const GTIN_JOINED_CODE = '0060383820466';
const NAME_JOINED_CODE = '0729906410033';
const UNJOINED_ROW: FixtureRow = {
  code: null,
  seller: 'openprices',
  seller_name: 'Mystery Snack',
  seller_brand: null,
  seller_sku: 'unjoined-1',
  price_cents: 250,
  kind: 'regular',
  unit_price_cents: null,
  unit_label: null,
  join_method: 'none',
  seen_on: '2026-01-01',
  url: null,
};

const FIXTURE_ROWS: FixtureRow[] = [
  {
    code: GTIN_JOINED_CODE,
    seller: 'openprices',
    seller_sku: 'op-1',
    seller_name: 'PC Thins Whole Grain Round Buns',
    seller_brand: 'Blue Menu',
    price_cents: 449,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-08-01',
    url: null,
  },
  {
    code: GTIN_JOINED_CODE,
    seller: 'openprices',
    seller_sku: 'op-2',
    seller_name: 'PC Thins Whole Grain Round Buns',
    seller_brand: 'Blue Menu',
    price_cents: 349,
    kind: 'promotional',
    unit_price_cents: 87,
    unit_label: '$0.87/100g',
    join_method: 'gtin',
    seen_on: '2026-08-15',
    url: null,
  },
  {
    code: NAME_JOINED_CODE,
    seller: 'walmart.ca',
    seller_sku: 'wm-1',
    seller_name: "Nature's Path Oats - Organic - Steel Cut",
    seller_brand: "Nature's Path",
    price_cents: 1199,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'name',
    seen_on: '2026-09-01',
    url: null,
  },
  UNJOINED_ROW,
];

/** The exact schema `price/data/prices.db` has today: no store columns at all. */
const DDL_WITHOUT_STORE_COLUMNS = `
  CREATE TABLE observation (
    code            TEXT,
    seller          TEXT NOT NULL,
    seller_sku      TEXT NOT NULL,
    seller_name     TEXT NOT NULL,
    seller_brand    TEXT,
    price_cents     INTEGER NOT NULL,
    kind            TEXT NOT NULL,
    unit_price_cents INTEGER,
    unit_label      TEXT,
    currency        TEXT NOT NULL DEFAULT 'CAD',
    country         TEXT NOT NULL DEFAULT 'CA',
    region          TEXT,
    join_method     TEXT NOT NULL,
    seen_on         TEXT NOT NULL,
    url             TEXT,
    image_url       TEXT,
    in_stock        INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (seller, seller_sku, seen_on)
  );
`;

/** The schema the uncommitted migration adds: store_name and store_osm alongside everything above. */
const DDL_WITH_STORE_COLUMNS = `
  CREATE TABLE observation (
    code            TEXT,
    seller          TEXT NOT NULL,
    seller_sku      TEXT NOT NULL,
    seller_name     TEXT NOT NULL,
    seller_brand    TEXT,
    price_cents     INTEGER NOT NULL,
    kind            TEXT NOT NULL,
    unit_price_cents INTEGER,
    unit_label      TEXT,
    currency        TEXT NOT NULL DEFAULT 'CAD',
    country         TEXT NOT NULL DEFAULT 'CA',
    region          TEXT,
    join_method     TEXT NOT NULL,
    seen_on         TEXT NOT NULL,
    url             TEXT,
    image_url       TEXT,
    in_stock        INTEGER NOT NULL DEFAULT 1,
    store_name      TEXT,
    store_city      TEXT,
    store_osm       TEXT,
    PRIMARY KEY (seller, seller_sku, seen_on)
  );
`;

function buildDb(path: string, ddl: string, rows: FixtureRow[]): void {
  const db = new DatabaseSync(path);
  db.exec(ddl);
  const hasStoreCols = /store_osm/.test(ddl);
  const cols = hasStoreCols
    ? 'code, seller, seller_sku, seller_name, seller_brand, price_cents, kind, unit_price_cents, unit_label, join_method, seen_on, url, store_name, store_osm'
    : 'code, seller, seller_sku, seller_name, seller_brand, price_cents, kind, unit_price_cents, unit_label, join_method, seen_on, url';
  const placeholders = cols.split(',').map(() => '?').join(',');
  const insert = db.prepare(`INSERT INTO observation (${cols}) VALUES (${placeholders})`);
  for (const r of rows) {
    const base = [
      r.code,
      r.seller,
      r.seller_sku,
      r.seller_name,
      r.seller_brand,
      r.price_cents,
      r.kind,
      r.unit_price_cents,
      r.unit_label,
      r.join_method,
      r.seen_on,
      r.url,
    ];
    insert.run(...(hasStoreCols ? [...base, r.store_name ?? null, r.store_osm ?? null] : base));
  }
  db.close();
}

const STORE_CODE = '0011122233334';
const MIXED_CODE = '0022233344445';
const CHAIN_CODE = '0055566677778';

/**
 * Three rows at the shopper's own store (FreshMart Downtown), priced high, and
 * one real distinct store each at genuinely lower prices. Chosen so that
 * INCLUDING the shopper's own rows in the comparison (the defect the
 * coordinator described) changes the outcome: median of all five is 900
 * (the shopper's own price), which reads as 'fair'. EXCLUDING them correctly
 * leaves only 500 and 520, and 900 against that is a 'walk_away'. This is the
 * test that fails today if self-exclusion or seller identity regresses.
 */
const STORE_ROWS: FixtureRow[] = [
  {
    code: STORE_CODE,
    seller: 'openprices',
    seller_sku: 'fm-1',
    seller_name: 'Store Brand Pasta Sauce',
    seller_brand: null,
    price_cents: 900,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: 'FreshMart Downtown',
    store_osm: 'NODE/111',
  },
  {
    code: STORE_CODE,
    seller: 'openprices',
    seller_sku: 'fm-2',
    seller_name: 'Store Brand Pasta Sauce',
    seller_brand: null,
    price_cents: 900,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-02',
    url: null,
    store_name: 'FreshMart Downtown',
    store_osm: 'NODE/111',
  },
  {
    code: STORE_CODE,
    seller: 'openprices',
    seller_sku: 'fm-3',
    seller_name: 'Store Brand Pasta Sauce',
    seller_brand: null,
    price_cents: 900,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-03',
    url: null,
    store_name: 'FreshMart Downtown',
    store_osm: 'NODE/111',
  },
  {
    code: STORE_CODE,
    seller: 'openprices',
    seller_sku: 'vm-1',
    seller_name: 'Store Brand Pasta Sauce',
    seller_brand: null,
    price_cents: 500,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: 'ValuMart',
    store_osm: 'NODE/222',
  },
  {
    code: STORE_CODE,
    seller: 'openprices',
    seller_sku: 'gc-1',
    seller_name: 'Store Brand Pasta Sauce',
    seller_brand: null,
    price_cents: 520,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: 'GroceryCo',
    store_osm: 'WAY/333',
  },
];

/** One row with a real store_osm, one without: the per-row fallback must not be table-wide. */
const MIXED_ROWS: FixtureRow[] = [
  {
    code: MIXED_CODE,
    seller: 'openprices',
    seller_sku: 'known-1',
    seller_name: 'Frozen Peas',
    seller_brand: null,
    price_cents: 300,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: 'Corner Grocer',
    store_osm: 'NODE/999',
  },
  {
    code: MIXED_CODE,
    seller: 'openprices',
    seller_sku: 'unknown-1',
    seller_name: 'Frozen Peas',
    seller_brand: null,
    price_cents: 310,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: null,
    store_osm: null,
  },
];

/**
 * D-081, the case the defect names. Two branches of one chain: one display name
 * ("FreshMart"), two OpenStreetMap ids, and two genuinely different shops. Plus
 * two unrelated stores at real lower prices.
 *
 * Chosen so the two properties in tension are both observable on one fixture.
 * Counted by NAME the chain is one seller, so this set reports three sellers
 * where it holds four. Matched by ID the shopper's typed "FreshMart" excludes
 * neither branch, so the 900-cent rows they are standing in front of stay in
 * the comparison and set their own bar. The fix has to satisfy both at once,
 * which is why it is a second field and not a different value in the first.
 */
const CHAIN_ROWS: FixtureRow[] = [
  {
    code: CHAIN_CODE,
    seller: 'openprices',
    seller_sku: 'fm-dt-1',
    seller_name: 'Store Brand Olive Oil',
    seller_brand: null,
    price_cents: 900,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: 'FreshMart',
    store_osm: 'NODE/111',
  },
  {
    code: CHAIN_CODE,
    seller: 'openprices',
    seller_sku: 'fm-up-1',
    seller_name: 'Store Brand Olive Oil',
    seller_brand: null,
    price_cents: 940,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-02',
    url: null,
    store_name: 'FreshMart',
    store_osm: 'NODE/444',
  },
  {
    code: CHAIN_CODE,
    seller: 'openprices',
    seller_sku: 'vm-2',
    seller_name: 'Store Brand Olive Oil',
    seller_brand: null,
    price_cents: 500,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: 'ValuMart',
    store_osm: 'NODE/222',
  },
  {
    code: CHAIN_CODE,
    seller: 'openprices',
    seller_sku: 'gc-2',
    seller_name: 'Store Brand Olive Oil',
    seller_brand: null,
    price_cents: 520,
    kind: 'regular',
    unit_price_cents: null,
    unit_label: null,
    join_method: 'gtin',
    seen_on: '2026-09-01',
    url: null,
    store_name: 'GroceryCo',
    store_osm: 'WAY/333',
  },
];

buildDb(FIXTURE_PATH, DDL_WITHOUT_STORE_COLUMNS, FIXTURE_ROWS);
buildDb(STORE_FIXTURE_PATH, DDL_WITH_STORE_COLUMNS, [...STORE_ROWS, ...MIXED_ROWS, ...CHAIN_ROWS]);

after(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup; leaving a temp fixture behind fails no gate.
  }
});

/**
 * The brand field on a receipt-feed row is a contributor-written list, not a
 * brand. Both shapes below are copied from the live table rather than invented:
 * 215 of the 838 rows carrying a brand hold a bullet-separated list, and 41
 * repeat the brand at the head of the name. Printed raw they put a competitor's
 * name, a city and a flag inside the product's own title, and print the brand
 * twice. Codes are outside the ranges the other fixtures use.
 */
const LABEL_FIXTURE_PATH = join(DIR, 'fixture-prices-labels.db');
const LIST_BRAND_CODE = '0033344455556';
const REPEATED_BRAND_CODE = '0044455566667';

buildDb(LABEL_FIXTURE_PATH, DDL_WITHOUT_STORE_COLUMNS, [
  {
    ...UNJOINED_ROW,
    code: LIST_BRAND_CODE,
    seller: 'openprices',
    seller_sku: 'label-1',
    seller_name: 'Unsalted Tortilla Chips, Organic',
    seller_brand: 'Que Pasa • Richmond BC \u{1F1E8}\u{1F1E6}',
    join_method: 'gtin',
  },
  {
    ...UNJOINED_ROW,
    code: REPEATED_BRAND_CODE,
    seller: 'openprices',
    seller_sku: 'label-2',
    seller_name: 'Green Giant Restaurant Sides Tri-Coloured Potatoes, 396 g',
    seller_brand: 'Green Giant',
    join_method: 'gtin',
  },
]);

test('a contributor-written brand list never reaches the label as a retailer, a city or a flag', async () => {
  const src = new ObservedSource(LABEL_FIXTURE_PATH);
  const identity = await src.identify({ gtin: LIST_BRAND_CODE, category: 'grocery' });
  assert.ok(identity, 'the row should resolve by barcode');
  assert.equal(identity.brand, 'Que Pasa');
  assert.equal(identity.label, 'Que Pasa Unsalted Tortilla Chips, Organic');
  assert.ok(!identity.label.includes('Richmond'), 'a city is not part of a product name');
  assert.ok(!/[\u{1F1E6}-\u{1F1FF}]/u.test(identity.label), 'no flag in the label');
});

test('a name that already opens with its brand is not given the brand twice', async () => {
  const src = new ObservedSource(LABEL_FIXTURE_PATH);
  const identity = await src.identify({ gtin: REPEATED_BRAND_CODE, category: 'grocery' });
  assert.ok(identity, 'the row should resolve by barcode');
  assert.equal(identity.label, 'Green Giant Restaurant Sides Tri-Coloured Potatoes, 396 g');
  assert.ok(!identity.label.startsWith('Green Giant Green Giant'), 'brand printed once');
});

test('the source declares tech as well as grocery, because prices we hold are otherwise unreachable', () => {
  /*
   * spine.ts filters sources by this list BEFORE asking any of them anything,
   * so a category missing here is not a narrower source, it is a set of prices
   * that can never be served and whose absence reads as "no price found".
   * Measured against the live data: of 438 distinct priced codes, 409 join to
   * openfoodfacts, 16 to openbeautyfacts, 10 to openproductsfacts and 2 to
   * icecat. Those 2 are electronics. Grocery alone made them unreachable.
   */
  const cats = source().categories;
  assert.ok(cats.includes('grocery'), 'the bulk of the table is food and household');
  assert.ok(cats.includes('tech'), 'two electronics rows exist and must be reachable');
});

function source(): ObservedSource {
  return new ObservedSource(FIXTURE_PATH);
}

function storeSource(): ObservedSource {
  return new ObservedSource(STORE_FIXTURE_PATH);
}

test('opens the fixture read-only and reports available', () => {
  const src = source();
  assert.equal(src.available().ok, true);
});

test('a gtin with observations returns points', async () => {
  const src = source();
  const identity = await src.identify({ gtin: GTIN_JOINED_CODE, category: 'grocery' });
  assert.ok(identity, 'expected an identity for a gtin with real rows');
  const points = await src.prices(identity!);
  assert.equal(points.length, 2);
  assert.ok(points.every((p) => p.sourceId === 'observed'));
});

test('a gtin with no observations returns nothing', async () => {
  const src = source();
  const identity = await src.identify({ gtin: '9999999999999', category: 'grocery' });
  assert.equal(identity, null);
});

test('an unjoined row (code IS NULL) is never returned, even when its name matches perfectly', async () => {
  const src = source();
  // There is no barcode to query the unjoined row by at all: its code is
  // NULL and `code = ?` can never match NULL, so the only place this row
  // could leak in is the text path, which scans by name. Give it a query
  // that overlaps the unjoined row's name completely and confirm it still
  // comes back empty, because that path filters to `code IS NOT NULL` first.
  assert.equal(UNJOINED_ROW.code, null);
  const identity = await src.identify({ text: 'mystery snack', category: 'grocery' });
  assert.equal(identity, null, 'a perfect name match on an unjoined row must not produce an identity');
});

test('a promotional row comes back marked promotional, not regular', async () => {
  const src = source();
  const identity = await src.identify({ gtin: GTIN_JOINED_CODE, category: 'grocery' });
  const points = await src.prices(identity!);
  const promo = points.find((p) => p.amountCents === 349);
  const regular = points.find((p) => p.amountCents === 449);
  assert.equal(promo?.kind, 'promotional');
  assert.equal(regular?.kind, 'regular');
  assert.equal(promo?.unitAmountCents, 87);
});

test('the zero-padded 13-digit form of a gtin matches too', async () => {
  const src = source();
  const short = GTIN_JOINED_CODE.replace(/^0+/, '');
  assert.notEqual(short, GTIN_JOINED_CODE, 'the fixture code must have a leading zero for this test to mean anything');
  const identity = await src.identify({ gtin: short, category: 'grocery' });
  assert.ok(identity);
  assert.equal(identity!.gtin, GTIN_JOINED_CODE);
});

test('a barcode-joined row gives higher identity confidence than a name-joined one', async () => {
  const src = source();
  const barcode = await src.identify({ gtin: GTIN_JOINED_CODE, category: 'grocery' });
  const named = await src.identify({ gtin: NAME_JOINED_CODE, category: 'grocery' });
  assert.ok(barcode && named);
  assert.ok(barcode!.confidence > named!.confidence);
  // The reduced confidence must be explained, not just quieter.
  assert.ok((src.identityNote(named!.id)?.length ?? 0) > 0);
  assert.equal(src.identityNote(barcode!.id), undefined);
});

test('a name-joined row carries a join-quality note on its price point', async () => {
  const src = source();
  const identity = await src.identify({ gtin: NAME_JOINED_CODE, category: 'grocery' });
  const points = await src.prices(identity!);
  assert.equal(points.length, 1);
  assert.ok(points[0].note?.includes('did not publish this barcode'));
});

test('a text query resolves by name overlap when there is no gtin', async () => {
  const src = source();
  const identity = await src.identify({ text: 'pc thins whole grain buns', category: 'grocery' });
  assert.ok(identity);
  assert.equal(identity!.gtin, GTIN_JOINED_CODE);
});

test('a text query below the overlap floor returns nothing, never a guess', async () => {
  const src = source();
  const identity = await src.identify({ text: 'a completely unrelated search term', category: 'grocery' });
  assert.equal(identity, null);
});

test('walmart.ca keeps its real seller name; it is never treated as shop-unknown', async () => {
  const src = source();
  const identity = await src.identify({ gtin: NAME_JOINED_CODE, category: 'grocery' });
  const points = await src.prices(identity!);
  assert.equal(points[0].seller, 'walmart.ca');
  assert.equal(points[0].note?.includes('shop behind this price is unknown'), false);
});

test('an openprices row with no store_osm column is reported under one shared unknown-shop sentinel, never as if "openprices" were a store', async () => {
  const src = source();
  const identity = await src.identify({ gtin: GTIN_JOINED_CODE, category: 'grocery' });
  const points = await src.prices(identity!);
  assert.ok(points.every((p) => p.seller === 'openprices (shop unknown)'));
  assert.ok(points.every((p) => p.note?.includes('shop behind this price is unknown')));
});

test('a shopper standing at a seller this source can name is excluded from its own comparison', async () => {
  const src = source();
  // walmart.ca is a real, specific seller this source already emits correctly.
  // Standing there and pricing the same code the fixture holds must exclude
  // it, leaving nothing to compare it against (it is the only row for this code).
  const result = await priceIt(
    {
      gtin: NAME_JOINED_CODE,
      category: 'grocery',
      askingCents: 1199,
      askingSeller: 'Walmart',
      asOf: '2026-09-05T00:00:00Z',
    },
    { sources: [src] },
  );
  /*
   * CHANGED 2026-09-08. This asserted a refusal. Since the price judge reached
   * production that set answers against the store's own history rather than
   * withholding, so the refusal is no longer the observable and the exclusion
   * itself is asserted instead: the shopper's own store is recognised as the
   * only seller here, and cannot be counted as a second one under a second
   * spelling.
   */
  assert.equal(result.kind, 'verdict');
  assert.equal(result.confidence.distinctSellers, 1);
  assert.match(result.confidence.because, /same store/);
});

test('REGRESSION SEAM: once store_osm identifies real shops, excluding the shopper\'s own store changes the verdict, and the shared shop-unknown sentinel never gets to stand in for a real one', async () => {
  const src = storeSource();
  const identity = await src.identify({ gtin: STORE_CODE, category: 'grocery' });
  assert.ok(identity);

  const result = await priceIt(
    {
      gtin: STORE_CODE,
      category: 'grocery',
      askingCents: 900,
      askingSeller: 'FreshMart Downtown',
      asOf: '2026-09-05T00:00:00Z',
    },
    { sources: [src] },
  );
  assert.equal(result.kind, 'verdict');
  if (result.kind === 'verdict') {
    // Without correct exclusion by store_osm identity, the shopper's own three
    // 900-cent rows dominate the median (900) and 900 against 900 reads
    // 'fair'. Excluded correctly, only 500 and 520 remain and 900 against
    // that is a 'walk_away'. This is the exact defect the coordinator named.
    assert.equal(result.tier, 'walk_away', 'the shopper\'s own store must not set its own bar');
    assert.equal(result.confidence.distinctSellers, 2, 'ValuMart and GroceryCo, not 1');
  }
});

test('within one product, a row with store_osm keeps a real distinct seller and a row without falls back to the shared sentinel', async () => {
  const src = storeSource();
  const identity = await src.identify({ gtin: MIXED_CODE, category: 'grocery' });
  const points = await src.prices(identity!);
  assert.equal(points.length, 2);
  const known = points.find((p) => p.amountCents === 300);
  const unknown = points.find((p) => p.amountCents === 310);
  assert.equal(known?.seller, 'Corner Grocer');
  assert.equal(unknown?.seller, 'openprices (shop unknown)');
});

test('D-081: two branches of one chain carry one store_name and two store_osm ids on the price point', async () => {
  const src = storeSource();
  const identity = await src.identify({ gtin: CHAIN_CODE, category: 'grocery' });
  assert.ok(identity);
  const points = await src.prices(identity!);
  const branches = points.filter((p) => p.seller === 'FreshMart');
  assert.equal(branches.length, 2, 'both branches print the name on the sign');
  assert.deepEqual(
    [...new Set(branches.map((p) => p.sellerId))].sort(),
    ['NODE/111', 'NODE/444'],
    'the identity is the OSM id, exactly as the header of this file has always said',
  );
});

test('D-081: two branches of one chain count as two sellers', async () => {
  const src = storeSource();
  const result = await priceIt(
    {
      gtin: CHAIN_CODE,
      category: 'grocery',
      askingCents: 700,
      askingSeller: 'Sobeys',
      asOf: '2026-09-05T00:00:00Z',
    },
    { sources: [src] },
  );
  assert.equal(result.kind, 'verdict');
  if (result.kind === 'verdict') {
    // Four shops, two of them the same chain. Counted on store_name this reads
    // 3, which is the understatement the defect describes.
    assert.equal(result.confidence.distinctSellers, 4, 'two FreshMart branches, ValuMart, GroceryCo');
  }
});

test('D-081: the same chain is still excluded as the shopper\'s own store by the name they typed', async () => {
  const src = storeSource();
  const result = await priceIt(
    {
      gtin: CHAIN_CODE,
      category: 'grocery',
      askingCents: 900,
      askingSeller: 'FreshMart',
      asOf: '2026-09-05T00:00:00Z',
    },
    { sources: [src] },
  );
  assert.equal(result.kind, 'verdict');
  if (result.kind === 'verdict') {
    assert.ok(
      result.comparisonSet.every((p) => p.seller !== 'FreshMart'),
      'a shopper types a name, so the exclusion must still match on the name',
    );
    assert.equal(result.confidence.distinctSellers, 2, 'ValuMart and GroceryCo remain');
    // 900 against 500 and 520 is a walk_away. It reads 'fair' if the chain's
    // own 900 and 940 stay in and set the bar.
    assert.equal(result.tier, 'walk_away');
  }
});

test('D-081: a row with no store_osm carries no sellerId, so it counts under the shared sentinel as before', async () => {
  const src = storeSource();
  const identity = await src.identify({ gtin: MIXED_CODE, category: 'grocery' });
  const points = await src.prices(identity!);
  const known = points.find((p) => p.amountCents === 300);
  const unknown = points.find((p) => p.amountCents === 310);
  assert.equal(known?.sellerId, 'NODE/999');
  assert.equal(unknown?.sellerId, undefined, 'no id means the normalised name, which is the sentinel');
});

test('walmart.ca sets no sellerId: the name is already a specific merchant', async () => {
  const src = source();
  const identity = await src.identify({ gtin: NAME_JOINED_CODE, category: 'grocery' });
  const points = await src.prices(identity!);
  assert.equal(points[0].seller, 'walmart.ca');
  assert.equal(points[0].sellerId, undefined);
});
