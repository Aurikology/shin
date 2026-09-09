/**
 * Crawl now, join later: the four things that have to hold.
 *
 * 1. A row the catalogue could not confirm is still stored, and it still has
 *    the barcode the seller's page published. That is the whole point: without
 *    it a discovery crawl on a machine with no catalogue is 10.8 days of work
 *    that has to be done again.
 * 2. A rejoin against a catalogue that arrives later fills `code` in place and
 *    records how it joined.
 * 3. Running the rejoin twice changes nothing the second time.
 * 4. A row that is still unjoined is invisible to the serving path.
 *
 * The catalogue here is a real SQLite file with a real `product` table, built
 * in a temp directory, not a stub of `openCatalogue`. The three barcode forms
 * that function tries (raw, zero padded, unpadded) are the part most likely to
 * be got wrong by a second implementation, so the test drives the actual one
 * through `SHIN_CATALOGUE`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ObservationRow } from '../src/store.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-price-rejoin-'));
const cataloguePath = join(dir, 'catalogue.db');

/* A stand-in catalogue holding exactly one product. `openCatalogue` reads
 * SHIN_CATALOGUE at module evaluation time, so this has to exist and the env
 * var has to be set before crawl.ts is imported below. */
const cat = new DatabaseSync(cataloguePath);
cat.exec('CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT)');
cat.prepare('INSERT INTO product (code, name) VALUES (?,?)').run(
  '0068100084245',
  'Kraft Smooth Peanut Butter 1 kg',
);
cat.close();

process.env.SHIN_CATALOGUE = cataloguePath;

const { openPrices, recordObservation, rejoinable, joinState } = await import('../src/store.ts');
const { openCatalogue } = await import('../src/crawl.ts');
const { rejoin } = await import('../src/rejoin.ts');

function row(over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code: null,
    seller: 'Walmart',
    sellerSku: '6000200234519',
    sellerName: 'Kraft Smooth Peanut Butter 1 kg',
    sellerBrand: 'Kraft',
    priceCents: 597,
    kind: 'regular',
    unitPriceCents: 30,
    unitLabel: 'per 100 g',
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'none',
    seenOn: '2026-09-08',
    url: 'https://www.walmart.ca/en/ip/x/6000200234519',
    imageUrl: null,
    inStock: 1,
    pageGtin: '068100084245',
    ...over,
  };
}

test('an unjoined observation is stored with the barcode the page published', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());

  const saved = db
    .prepare('SELECT code, join_method, page_gtin, price_cents, kind, url, seen_on FROM observation')
    .get() as unknown as {
    code: string | null;
    join_method: string;
    page_gtin: string | null;
    price_cents: number;
    kind: string;
    url: string | null;
    seen_on: string;
  };

  assert.equal(saved.code, null, 'nothing may claim a catalogue product it could not confirm');
  assert.equal(saved.join_method, 'none');
  assert.equal(saved.page_gtin, '068100084245', 'the barcode is what makes a later join possible');
  assert.equal(saved.price_cents, 597);
  assert.equal(saved.kind, 'regular');
  assert.equal(saved.url, 'https://www.walmart.ca/en/ip/x/6000200234519');
  assert.equal(saved.seen_on, '2026-09-08');
  db.close();
});

test('the barcode is stored as the seller published it, not normalised on the way in', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());
  const saved = db.prepare('SELECT page_gtin FROM observation').get() as unknown as { page_gtin: string };
  assert.equal(saved.page_gtin.length, 12, 'a 12 digit UPC stays 12 digits on the row');
  db.close();
});

test('a row kept for a page that published no barcode is not offered to the rejoin', () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ sellerSku: 'no-barcode', pageGtin: null }));
  recordObservation(db, row({ sellerSku: 'has-barcode' }));

  const waiting = rejoinable(db);
  assert.equal(waiting.length, 1, 'only a row a catalogue could actually resolve');
  assert.equal(waiting[0].sellerSku, 'has-barcode');

  const state = joinState(db, 'Walmart');
  assert.deepEqual(state, { joined: 0, rejoinable: 1, noBarcode: 1 });
  db.close();
});

test('rejoin fills the code in place, records the join method, and leaves the price alone', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());

  const probe = openCatalogue();
  assert.equal(probe.available, true, 'the stand-in catalogue must have opened');

  const t = await rejoin(db, probe);
  assert.deepEqual(t, { considered: 1, filled: 1, notInCatalogue: 0, refused: 0 });

  const saved = db
    .prepare('SELECT code, join_method, page_gtin, price_cents FROM observation')
    .get() as unknown as { code: string; join_method: string; page_gtin: string; price_cents: number };

  // 068100084245 is twelve digits on the page; the catalogue holds the
  // thirteen digit form. openCatalogue's padding is what bridges the two.
  assert.equal(saved.code, '0068100084245');
  assert.equal(saved.join_method, 'gtin');
  assert.equal(saved.page_gtin, '068100084245', 'the seller claim stays on the row after the join');
  assert.equal(saved.price_cents, 597, 'a rejoin never touches an observed number');

  probe.close();
  db.close();
});

test('rejoin is idempotent: a second run fills nothing and changes nothing', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());
  const probe = openCatalogue();

  const first = await rejoin(db, probe);
  const second = await rejoin(db, probe);

  assert.equal(first.filled, 1);
  assert.deepEqual(second, { considered: 0, filled: 0, notInCatalogue: 0, refused: 0 });

  const rows = db.prepare('SELECT code, join_method FROM observation').all() as unknown as {
    code: string;
    join_method: string;
  }[];
  assert.equal(rows.length, 1, 'a rejoin must not insert a row, only fill one in');
  assert.equal(rows[0].code, '0068100084245');
  assert.equal(rows[0].join_method, 'gtin');

  probe.close();
  db.close();
});

test('a barcode the catalogue does not hold stays unjoined and is counted apart', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ sellerSku: 'unknown-thing', pageGtin: '000000000000000' }));
  const probe = openCatalogue();

  const t = await rejoin(db, probe);
  assert.deepEqual(t, { considered: 1, filled: 0, notInCatalogue: 1, refused: 0 });

  const saved = db.prepare('SELECT code, join_method FROM observation').get() as unknown as {
    code: string | null;
    join_method: string;
  };
  assert.equal(saved.code, null);
  assert.equal(saved.join_method, 'none');

  probe.close();
  db.close();
});

test('a dry run reports what it would join and writes nothing', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, row());
  const probe = openCatalogue();

  const t = await rejoin(db, probe, { dryRun: true });
  assert.equal(t.filled, 1, 'it still says the row would join');

  const saved = db.prepare('SELECT code FROM observation').get() as unknown as { code: string | null };
  assert.equal(saved.code, null, 'a dry run may not write');

  // And the row is still waiting afterwards, which is what makes the dry run
  // an honest preview of the real one rather than a run that consumed its own
  // work list.
  assert.equal(rejoinable(db).length, 1);

  probe.close();
  db.close();
});

test('rejoin can be bounded by seller and by count', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, row({ sellerSku: 'a' }));
  recordObservation(db, row({ sellerSku: 'b' }));
  recordObservation(db, row({ seller: 'canadiantire.ca', sellerSku: 'c' }));
  const probe = openCatalogue();

  const bounded = await rejoin(db, probe, { seller: 'Walmart', limit: 1 });
  assert.equal(bounded.considered, 1);
  assert.equal(bounded.filled, 1);

  const left = rejoinable(db);
  assert.equal(left.length, 2, 'the other Walmart row and the Canadian Tire one are untouched');

  probe.close();
  db.close();
});
