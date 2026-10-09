/**
 * TWO HANDLERS IN catalogue-first.ts USED TO SWALLOW AN ERROR IN SILENCE (category-check.ts, A7).
 *
 * Both run in front of a shopper, so neither may throw or block the answer. But each one hid a
 * fault behind a plausible answer, and a plausible answer is the worst place to hide one:
 *
 *   byGtin throws       the shopper was told "not in the catalogue". That is a lie: the lookup
 *                       FAILED, and the product may well be there. The answer now says the
 *                       catalogue was not reachable (`catalogueUp: false`, the existing value for
 *                       "we did not look"; the client then asks the pack instead of saying "never
 *                       seen", and the server does not write a false catalogue-miss gap).
 *   brandLookupFromDb   the text match ran without brands and nobody could tell.
 *
 * Each now logs one `[catalogue-fault]` line with the reason and counts it
 * (`catalogueFaults()`, shown by `/api/health`).
 */
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices } from '../../price/src/store.ts';
import { openCatalogue } from '../../catalogue/src/schema.ts';
import * as cf from '../src/catalogue-first.ts';
import { canonicalBarcode } from '../src/barcode.ts';

const SELF = '0068100084245';

const faults = (): Record<string, number> => (cf as Partial<typeof cf>).catalogueFaults?.() ?? {};

let lines: string[] = [];
beforeEach(() => {
  (cf as Partial<typeof cf>).resetCatalogueFaultsForTests?.();
  lines = [];
  mock.method(console, 'warn', (...a: unknown[]) => { lines.push(a.join(' ')); });
  mock.method(console, 'error', (...a: unknown[]) => { lines.push(a.join(' ')); });
});
afterEach(() => mock.restoreAll());

function deps(lookup: cf.BarcodeDeps['lookup']): cf.BarcodeDeps {
  return { lookup, prices: openPrices(':memory:'), catalogue: null, country: 'CA', currency: 'CAD', asOf: '2026-09-27' };
}
const scan = (lookup: cf.BarcodeDeps['lookup']) => cf.answerBarcodeFromCatalogue(canonicalBarcode(SELF)!, deps(lookup));

/* --------------------------------------------- line 364: byGtin throws */

test('a byGtin that throws is not "not in the catalogue": the answer says the catalogue was not reachable, and it is logged and counted', async () => {
  const { answer } = await scan({ byGtin: () => { throw new Error('database disk image is malformed'); } });
  assert.equal(answer.kind, 'catalogue');
  assert.equal(answer.catalogueUp, false, 'the truthful existing value: we could not look, which is not the same as "never seen"');
  assert.equal(answer.identity, null);
  assert.equal(faults().lookup_failed, 1);
  assert.ok(
    lines.some((l) => l.startsWith('[catalogue-fault] lookup_failed') && l.includes('database disk image is malformed') && l.includes(SELF)),
    lines.join('|'),
  );
});

test('control: a lookup that finds nothing still says "not in the catalogue" with the catalogue up, and logs nothing', async () => {
  const { answer, record } = await scan({ byGtin: () => null });
  assert.equal(answer.outcome, 'not_in_catalogue');
  assert.equal(answer.offerManualEntry, true);
  assert.equal(answer.catalogueUp, true, 'it looked and the product is not there');
  assert.equal(record.answerPath, 'not_in_catalogue');
  assert.deepEqual(faults(), {});
  assert.deepEqual(lines, []);
});

test('control: a lookup that finds the product still answers it, uncounted', async () => {
  const row = { code: SELF, name: 'Cheddar', brands: 'Kraft', quantity: '500 g', leafCategory: 'en:cheddar', categoryPath: ['en:cheeses', 'en:cheddar'] };
  const { answer } = await scan({ byGtin: () => row });
  assert.equal(answer.outcome, 'catalogue_hit');
  assert.equal(answer.catalogueUp, true);
  assert.equal(answer.identity?.name, 'Cheddar');
  assert.deepEqual(faults(), {});
  assert.deepEqual(lines, []);
});

test('control: no catalogue attached is still catalogueUp false, and is not a fault', async () => {
  const { answer } = await scan(null);
  assert.equal(answer.catalogueUp, false);
  assert.deepEqual(faults(), {});
});

/* ------------------------------------ line 632: brandLookupFromDb throws */

function searcher() {
  const asked: unknown[] = [];
  return {
    asked,
    search: async (q: unknown) => {
      asked.push(q);
      return { band: 'miss', candidates: [], ring: null, matchedBy: 'none', wordsMatched: 'n/a' };
    },
  };
}

test('a brand lookup that throws is logged and counted, and the match still runs without brands', async () => {
  const s = searcher();
  // A database with no product or text-index tables: preparing the brand query throws.
  const r = await cf.matchText(['Kraft Smooth Peanut Butter'], { searcher: s, catalogue: new DatabaseSync(':memory:') });
  assert.equal(r.kind, 'text_match');
  assert.equal(r.catalogueUp, true);
  assert.ok(s.asked.length > 0, 'the match ran');
  assert.equal(faults().brand_lookup_failed, 1);
  assert.ok(lines.some((l) => l.startsWith('[catalogue-fault] brand_lookup_failed') && /no such table/i.test(l)), lines.join('|'));
});

test('control: a working catalogue handle, and no handle at all, are not faults', async () => {
  const s = searcher();
  await cf.matchText(['Kraft Smooth Peanut Butter'], { searcher: s, catalogue: openCatalogue(':memory:') });
  await cf.matchText(['Kraft Smooth Peanut Butter'], { searcher: s, catalogue: null });
  assert.ok(s.asked.length >= 2);
  assert.deepEqual(faults(), {});
  assert.deepEqual(lines, []);
});
