/**
 * The nightly name rejoin, item 17's "rejoin unmatched rows nightly".
 *
 * The barcode leg in `rejoin.test.ts` covers the rows that carry a barcode. This
 * covers the rows that never will: Canadian Tire publishes none at all, so its
 * unjoined rows are invisible to that leg forever, and the only thing that can
 * ever join them is a catalogue name.
 *
 * The catalogue here is a real SQLite file with a real `product` table and a real
 * FTS5 index over it, built in a temp directory, because the part most likely to
 * be got wrong is the full text query itself: a product title is full of
 * punctuation, and an unquoted word that happens to be an FTS operator is a
 * syntax error that would show up as "nothing matched" rather than as a failure.
 *
 * Nothing here opens a network connection. A rejoin never does: that is the whole
 * reason it exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ObservationRow } from '../src/store.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-price-namerejoin-'));
const cataloguePath = join(dir, 'catalogue.db');

/*
 * A stand-in catalogue with the two columns this leg reads and the index it
 * searches. `openCatalogueNames` takes its default path from crawl.ts's
 * CATALOGUE_PATH, which is read at module evaluation time, so the file and the
 * environment variable both have to exist before the imports below.
 */
const cat = new DatabaseSync(cataloguePath);
cat.exec(
  'CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT, name_en TEXT, name_fr TEXT, brands TEXT, leaf_category TEXT)',
);
cat.exec(
  `CREATE VIRTUAL TABLE product_fts USING fts5(
     name_en, name_fr, brands, leaf_category,
     content='product', content_rowid='rowid',
     tokenize="unicode61 remove_diacritics 2")`,
);
const insert = cat.prepare(
  'INSERT INTO product (code, name, name_en, name_fr, brands, leaf_category) VALUES (?,?,?,?,?,?)',
);
insert.run('0885909950805', 'Duracell Coppertop AA 24 Pack', 'Duracell Coppertop AA 24 Pack', null, 'Duracell', 'en:batteries');
insert.run('0039800119162', 'Energizer Max AA 24 Pack', 'Energizer Max AA 24 Pack', null, 'Energizer', 'en:batteries');
insert.run('0068100084245', 'Kraft Smooth Peanut Butter 1 kg', 'Kraft Smooth Peanut Butter 1 kg', null, 'Kraft', 'en:peanut-butters');
cat.exec("INSERT INTO product_fts(product_fts) VALUES('rebuild')");
cat.close();

process.env.SHIN_CATALOGUE = cataloguePath;

const { openPrices, recordObservation, nameRejoinable } = await import('../src/store.ts');
const { rejoinByName, openCatalogueNames } = await import('../src/rejoin.ts');

function ctRow(over: Partial<ObservationRow> = {}): ObservationRow {
  return {
    code: null,
    seller: 'Canadian Tire',
    sellerSku: '3996591P',
    sellerName: 'Duracell Coppertop AA Alkaline Batteries, 24-pk',
    sellerBrand: 'Duracell',
    priceCents: 2499,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'none',
    seenOn: '2026-09-11',
    url: 'https://www.canadiantire.ca/en/pdp/3996591P.html',
    imageUrl: null,
    inStock: 1,
    /* The measured fact this whole leg follows from: this seller publishes none. */
    pageGtin: null,
    ...over,
  };
}

test('a barcode-less unjoined row is what this leg walks, and the barcode leg cannot see it', () => {
  const db = openPrices(':memory:');
  recordObservation(db, ctRow());
  const rows = nameRejoinable(db, 'Canadian Tire');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sellerName, 'Duracell Coppertop AA Alkaline Batteries, 24-pk');
  db.close();
});

test('a row whose title names a catalogue product is joined, in place, as a name join', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, ctRow());
  const names = openCatalogueNames();
  assert.equal(names.available, true, 'the stand-in catalogue has no text index, so this proves nothing');

  const t = await rejoinByName(db, names, { seller: 'Canadian Tire' });
  assert.deepEqual(
    [t.considered, t.filled, t.noMatch, t.noCandidates, t.refused],
    [1, 1, 0, 0, 0],
  );

  const saved = db.prepare('SELECT code, join_method FROM observation').get() as unknown as {
    code: string | null;
    join_method: string;
  };
  assert.equal(saved.code, '0885909950805');
  assert.equal(saved.join_method, 'name', 'a name join must never be recorded as a barcode one');
  names.close();
  db.close();
});

test('the brand decides between two products that share every other word', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, ctRow({ sellerName: 'Energizer Max AA Alkaline Batteries, 24-pk', sellerBrand: 'Energizer' }));
  const names = openCatalogueNames();

  await rejoinByName(db, names, { seller: 'Canadian Tire' });
  const saved = db.prepare('SELECT code FROM observation').get() as unknown as { code: string | null };
  assert.equal(saved.code, '0039800119162', 'the row landed on the other brand"s battery');
  names.close();
  db.close();
});

test('a title the catalogue has nothing like is left alone, and said so separately', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, ctRow({ sellerName: 'MotoMaster Eliminator Booster Cables', sellerBrand: 'MotoMaster' }));
  const names = openCatalogueNames();

  const t = await rejoinByName(db, names, { seller: 'Canadian Tire' });
  assert.equal(t.filled, 0);
  assert.equal(t.noCandidates + t.noMatch, 1, 'a row nothing matched has to be counted as one or the other');
  const saved = db.prepare('SELECT code FROM observation').get() as unknown as { code: string | null };
  assert.equal(saved.code, null, 'a row was joined to a product that shares no brand with it');
  names.close();
  db.close();
});

test('a dry run reports the join it would make and writes nothing', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, ctRow());
  const names = openCatalogueNames();

  const t = await rejoinByName(db, names, { seller: 'Canadian Tire', dryRun: true });
  assert.equal(t.filled, 1);
  const saved = db.prepare('SELECT code FROM observation').get() as unknown as { code: string | null };
  assert.equal(saved.code, null, 'a dry run wrote a code');
  names.close();
  db.close();
});

test('running it twice changes nothing the second time', async () => {
  const db = openPrices(':memory:');
  recordObservation(db, ctRow());
  const names = openCatalogueNames();

  const first = await rejoinByName(db, names, { seller: 'Canadian Tire' });
  const second = await rejoinByName(db, names, { seller: 'Canadian Tire' });
  assert.equal(first.filled, 1);
  assert.deepEqual([second.considered, second.filled], [0, 0], 'a joined row came back as rejoinable');
  names.close();
  db.close();
});

test('punctuation in a title cannot break the search, which is how a syntax error would hide', async () => {
  // "AND", a bare hyphen and a quote are all FTS operators or syntax. A title
  // carrying them has to come back as a normal search, not as zero results that
  // look like a catalogue with nothing in it.
  const db = openPrices(':memory:');
  recordObservation(
    db,
    ctRow({ sellerName: 'Duracell "Coppertop" AA AND AAA - Alkaline Batteries, 24-pk', sellerBrand: 'Duracell' }),
  );
  const names = openCatalogueNames();

  const t = await rejoinByName(db, names, { seller: 'Canadian Tire' });
  assert.equal(t.noCandidates, 0, 'the text search threw and the row was reported as unmatchable');
  names.close();
  db.close();
});

test('with no catalogue at all the leg reports itself unavailable rather than joining nothing quietly', () => {
  const names = openCatalogueNames(join(dir, 'there-is-no-catalogue-here.db'));
  assert.equal(names.available, false);
  assert.deepEqual(names.candidates('anything', null), []);
});
