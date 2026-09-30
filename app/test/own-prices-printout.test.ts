/**
 * A store-printout row never reaches an own-prices answer.
 *
 * Audit probe, 2026-09-28: a printout Rollback at $2.97 for Kraft peanut butter
 * (unjoined: the printout matcher is paused, so it carries no barcode) was merged
 * by name and size into a barcoded Loblaws Kraft peanut butter answer as that
 * product's cheapest price. A printout row has no identity anyone checked; it
 * belongs to the raw-derived layer (price/src/capture-printout.ts) until an
 * identity link says what it is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { intakeRaw, type Word } from '../../price/src/capture-printout.ts';
import { lookupOwnPrices } from '../src/own-prices.ts';

function words(lines: readonly (readonly [string, number])[]): Word[] {
  const out: Word[] = [];
  lines.forEach(([text, y], block) => {
    let x = 10;
    text.split(' ').forEach((t, i) => {
      out.push([x, y - 9, x + t.length * 5, y + 3, t, block, 0, i]);
      x += t.length * 5 + 3;
    });
  });
  return out;
}

function probeDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shin-own-printout-'));
  const path = join(dir, 'prices.db');
  const db = openPrices(path);
  recordObservation(db, {
    code: '0068100084245', seller: 'loblaws', sellerSku: 'lb-1', sellerName: 'Kraft Smooth Peanut Butter 1 kg',
    sellerBrand: 'Kraft', priceCents: 649, kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD',
    country: 'CA', region: null, joinMethod: 'gtin', seenOn: '2026-09-20', url: null, imageUrl: null, inStock: null,
    storeName: 'Loblaws', storeCity: 'Ottawa',
  });
  intakeRaw(
    db,
    {
      sha256: 'b'.repeat(64), page_count: 1, doc_title: 'Peanut Butter | Walmart Canada',
      creation_date: "D:20260927231000-04'00'", mtime: '2026-09-28T03:10:00Z',
      links: [{
        page: 1, bbox: [0, 0, 190, 240], image: null,
        uri: 'https://www.walmart.ca/en/ip/Kraft-Smooth-Peanut-Butter-1-kg/6000200000044',
        words: words([['Rollback', 20], ['2$ 97', 130], ['Was $4.27', 145], ['Kraft Smooth Peanut Butter 1 kg', 165]]),
      }],
    },
    { filePath: 'probe.pdf' },
  );
  const n = (db.prepare('SELECT COUNT(*) n FROM observation WHERE capture_tile_id IS NOT NULL').get() as { n: number }).n;
  assert.equal(n, 1, 'the printout row is really in the file');
  db.close();
  return path;
}

test('audit probe: a printout Rollback is not merged into a barcoded answer as its cheapest price', () => {
  const out = lookupOwnPrices('kraft smooth peanut butter 1 kg', { pricesDbPath: probeDb(), userCataloguePath: null });
  assert.ok(out.match, 'the Loblaws product still answers');
  assert.equal(out.match.code, '0068100084245');
  assert.deepEqual(
    out.match.prices.map((p) => [p.store, p.amount]),
    [['Loblaws (Ottawa)', 6.49]],
    'no printout price, least of all as the cheapest',
  );
});

test('a printout row alone is never an own-prices answer', () => {
  const path = probeDb();
  const db = new DatabaseSync(path);
  db.exec("DELETE FROM observation WHERE seller = 'loblaws'");
  db.close();
  const out = lookupOwnPrices('kraft smooth peanut butter', { pricesDbPath: path, userCataloguePath: null });
  assert.equal(out.match, null);
});

test('a prices file from before capture_tile_id existed is still read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-own-unmigrated-'));
  const path = join(dir, 'prices.db');
  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE observation (
      code TEXT, seller TEXT NOT NULL, seller_sku TEXT NOT NULL, seller_name TEXT NOT NULL,
      seller_brand TEXT, price_cents INTEGER NOT NULL, kind TEXT NOT NULL,
      unit_price_cents INTEGER, unit_label TEXT, currency TEXT NOT NULL, country TEXT NOT NULL,
      region TEXT, join_method TEXT NOT NULL, seen_on TEXT NOT NULL, url TEXT, image_url TEXT,
      in_stock INTEGER, store_name TEXT, store_city TEXT, store_osm TEXT, page_gtin TEXT, base_price_cents INTEGER,
      PRIMARY KEY (seller, seller_sku, seen_on)
    );
    INSERT INTO observation (code, seller, seller_sku, seller_name, seller_brand, price_cents, kind, currency, country,
                             join_method, seen_on, store_name)
    VALUES ('0068100084245','loblaws','lb-1','Kraft Smooth Peanut Butter 1 kg','Kraft',649,'regular','CAD','CA','gtin','2026-09-20','Loblaws');
  `);
  old.close();
  const out = lookupOwnPrices('kraft smooth peanut butter', { pricesDbPath: path, userCataloguePath: null });
  assert.ok(!out.unavailable.includes('prices'), 'the old file is read, not refused');
  assert.equal(out.match?.prices[0]?.amount, 6.49);
});
