/**
 * Save-On-Foods reader and runner, unit A3.
 *
 * NOTHING HERE OPENS THE NETWORK. Every answer is a body recorded from the live
 * gateway on 2026-09-30 (test/fixtures/saveonfoods/), except
 * challenge-403.SYNTHETIC.html: the gateway never challenged a request, and
 * provoking a block to record one is exactly what the sourcing ruling forbids,
 * so that body is a Cloudflare-shaped page written by hand and named as such.
 * stores-trimmed.json is the real list cut from 196 stores to 7, every field
 * of each kept store verbatim.
 *
 * Every database, catalogue and list file is made in a fresh temp folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as sof from '../src/saveonfoods.ts';
import {
  loadTargets,
  observationOf,
  parseArgs,
  pickStores,
  run,
  sheetCsv,
  spreadStores,
  type LookupFn,
  type Target,
} from '../src/saveonfoods-run.ts';
import { openPrices } from '../src/store.ts';
import { joinToProduct } from '../src/sources.ts';

const FIX = new URL('./fixtures/saveonfoods/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIX), 'utf8');

const FOUND = fixture('product-found-1982-00068100084245.json');
const SALE = fixture('product-sale-2241-00064100143135.json');
const NOT_FOUND = fixture('product-404-2241-00012345678905.txt');
const CHALLENGE = fixture('challenge-403.SYNTHETIC.html');
const STORES = sof.parseStores(JSON.parse(fixture('stores-trimmed.json')));

const JSON_CT = 'application/json; charset=utf-8';
const TEXT_CT = 'text/plain; charset=utf-8';
const HTML_CT = 'text/html; charset=UTF-8';
const DAY = '2026-09-30';

const tempDir = () => mkdtempSync(join(tmpdir(), 'shin-saveon-'));
const store = (id: string) => STORES.find((s) => s.retailerStoreId === id)!;

function found(body: string): sof.Product {
  const c = sof.classify(200, JSON_CT, body);
  assert.equal(c.kind, 'found');
  return (c as Extract<sof.Lookup, { kind: 'found' }>).product;
}

/* ---------- the reader ---------- */

test('a catalogue code pads to the GTIN-14 the gateway echoed back as sku', () => {
  assert.equal(sof.toGtin14('0068100084245'), '00068100084245');
  assert.equal(found(FOUND).sku, sof.toGtin14('0068100084245'));
  assert.equal(sof.toGtin14('068100084245'), '00068100084245');
  assert.throws(() => sof.toGtin14('12345'));
  assert.throws(() => sof.toGtin14('000681000842451'));
});

test('a regular item reads price, unit price, stock, and no promotion', () => {
  const p = found(FOUND);
  assert.equal(p.name, 'Kraft - Smooth Peanut Butter');
  assert.equal(p.brand, 'Kraft');
  assert.equal(p.priceText, '$8.29');
  assert.equal(p.priceCents, 829);
  assert.equal(p.wasPriceCents, null);
  assert.equal(p.unitPriceText, '$0.83/100g');
  assert.equal(p.unitPriceCents, 83);
  assert.equal(p.unitPricePer, '100g');
  assert.equal(p.onPromotion, false);
  assert.equal(p.priceSource, 'regular');
  assert.equal(p.available, true);
});

test('a sale item with a wasPrice and a tprInfo is a promotion', () => {
  const p = found(SALE);
  assert.equal(p.priceCents, 599);
  assert.equal(p.wasPriceText, '$8.29');
  assert.equal(p.wasPriceCents, 829);
  assert.equal(p.onPromotion, true);
  assert.equal(p.priceSource, 'tpr');
});

test('a tprInfo alone, or a non-empty promotions list alone, still counts as a promotion', () => {
  const base = JSON.parse(FOUND);
  assert.equal(found(JSON.stringify({ ...base, tprInfo: { markdown: '$7.00' } })).onPromotion, true);
  assert.equal(found(JSON.stringify({ ...base, promotions: [{ id: 'x' }] })).onPromotion, true);
  assert.equal(found(JSON.stringify({ ...base, promotions: [] })).onPromotion, false);
});

test('available absent is null, never a guess', () => {
  const base = JSON.parse(FOUND);
  delete base.available;
  assert.equal(found(JSON.stringify(base)).available, null);
  assert.equal(found(JSON.stringify({ ...JSON.parse(FOUND), available: false })).available, false);
});

test('prices the reader cannot read exactly are null, not guessed', () => {
  assert.equal(sof.dollarsToCents('$1,299.00'), 129900);
  assert.equal(sof.dollarsToCents('$5'), 500);
  assert.equal(sof.dollarsToCents('$5.9'), 590);
  assert.equal(sof.dollarsToCents('2 for $5.00'), null);
  assert.equal(sof.dollarsToCents('$0.00'), null);
  assert.equal(sof.dollarsToCents(null), null);
  assert.deepEqual(sof.parseUnitPrice('$1.07/100g'), { cents: 107, per: '100g' });
  assert.deepEqual(sof.parseUnitPrice('$0.083/100ml'), { cents: 8.3, per: '100ml' });
  assert.deepEqual(sof.parseUnitPrice('$4.40/kg'), { cents: 440, per: 'kg' });
  assert.deepEqual(sof.parseUnitPrice('$1.99/ea'), { cents: 199, per: 'each' });
  assert.deepEqual(sof.parseUnitPrice('$0.96 each'), { cents: 96, per: 'each' }, 'seen live, Fun Pac Cereal');
  assert.deepEqual(sof.parseUnitPrice('$0.50/sheet'), { cents: null, per: null });
});

test('a 404 is "not carried here", not an error', () => {
  assert.deepEqual(sof.classify(404, TEXT_CT, NOT_FOUND), { kind: 'absent', status: 404 });
});

test('403, 429 and a challenge page are all refusals, whatever the status', () => {
  assert.equal(sof.classify(403, HTML_CT, CHALLENGE).kind, 'blocked');
  assert.equal(sof.classify(429, TEXT_CT, 'rate limited').kind, 'blocked');
  assert.equal(sof.classify(200, HTML_CT, CHALLENGE).kind, 'blocked');
  assert.equal(sof.classify(503, HTML_CT, CHALLENGE).kind, 'blocked');
  assert.equal(sof.classify(500, TEXT_CT, 'oops').kind, 'error');
  assert.equal(sof.classify(200, 'text/html', '<html>hello</html>').kind, 'error');
});

test('lookup sends the honest user agent, one request, and throws Blocked without retrying', async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fake = (status: number, ct: string, body: string): sof.FetchLike => async (url, init) => {
    calls.push({ url, headers: init.headers });
    return { status, headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? ct : null) }, text: async () => body };
  };
  const r = await sof.lookup('1982', '0068100084245', fake(200, JSON_CT, FOUND));
  assert.equal(r.kind, 'found');
  assert.equal(calls[0]!.url, 'https://storefrontgateway.saveonfoods.com/api/stores/1982/products/00068100084245');
  assert.deepEqual(calls[0]!.headers, { 'user-agent': 'ShinPriceCheck/0.1', accept: 'application/json' });

  calls.length = 0;
  await assert.rejects(sof.lookup('2241', '0064100143135', fake(403, HTML_CT, CHALLENGE)), sof.Blocked);
  assert.equal(calls.length, 1);
});

test('the store list parses, and every store in it is read as Save-On-Foods', () => {
  assert.equal(STORES.length, 7);
  assert.deepEqual(store('2241'), {
    retailerStoreId: '2241',
    name: 'Dunbar',
    city: 'Vancouver',
    province: 'British Columbia',
    type: 'Regular',
  });
  assert.equal(sof.SAVE_ON_FOODS_SELLER, 'Save-On-Foods');
});

test('the source joins by barcode and the gateway sku joins to the catalogue code', async () => {
  const fake: sof.FetchLike = async () => ({ status: 200, headers: { get: () => JSON_CT }, text: async () => FOUND });
  const src = sof.saveOnFoodsSource('1982', fake);
  assert.equal(src.joins, 'gtin');
  const listings = await src.fetch({ gtin: '0068100084245' });
  const j = await joinToProduct('0068100084245', listings, [src], async () => null);
  assert.equal(j.observations.length, 1);
  assert.equal(j.observations[0]!.amountCents, 829);
});

/* ---------- the row ---------- */

test('a sale row stores promotional, wasCents, isSale, unit price as published, the store, and the join', () => {
  const row = observationOf(found(SALE), store('2241'), { barcode: '0064100143135', catalogueCode: '0064100143135' }, DAY)!;
  assert.equal(row.code, '0064100143135');
  assert.equal(row.joinMethod, 'gtin');
  assert.equal(row.pageGtin, '00064100143135');
  assert.equal(row.seller, 'Save-On-Foods');
  assert.equal(row.sellerSku, '2241:00064100143135');
  assert.equal(row.priceCents, 599);
  assert.equal(row.kind, 'promotional');
  assert.equal(row.wasCents, 829);
  assert.equal(row.isSale, 1);
  assert.equal(row.unitPriceCents, 107);
  assert.equal(row.unitPricePer, '100g');
  assert.equal(row.unitLabel, '$1.07/100g');
  assert.equal(row.inStock, 1);
  assert.equal(row.storeName, 'Dunbar');
  assert.equal(row.storeCity, 'Vancouver');
  assert.equal(row.region, 'British Columbia');
});

test('a barcode not known to be a catalogue code is kept unjoined with its pageGtin', () => {
  const row = observationOf(found(FOUND), store('1982'), { barcode: '0068100084245', catalogueCode: null }, DAY)!;
  assert.equal(row.code, null);
  assert.equal(row.joinMethod, 'none');
  assert.equal(row.pageGtin, '00068100084245');
  assert.equal(row.kind, 'regular');
  assert.equal(row.wasCents, null);
  assert.equal(row.isSale, 0);
});

test('a catalogue code the gateway answered with a different sku does not join', () => {
  const row = observationOf(found(FOUND), store('1982'), { barcode: '0064100143135', catalogueCode: '0064100143135' }, DAY)!;
  assert.equal(row.code, null);
  assert.equal(row.pageGtin, '00068100084245');
});

/* ---------- the runner ---------- */

function recorded(map: Record<string, [number, string, string]>): LookupFn & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (storeId: string, barcode: string) => {
    calls.push(`${storeId}/${barcode}`);
    const hit = map[`${storeId}/${barcode}`] ?? [404, TEXT_CT, NOT_FOUND];
    const c = sof.classify(hit[0], hit[1], hit[2]);
    if (c.kind === 'blocked') throw new sof.Blocked(c.status, c.why);
    return c;
  }) as LookupFn & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const T = (barcode: string): Target => ({ barcode, catalogueCode: barcode });

test('one row per (store, barcode, day); a 404 writes nothing; a second day adds rows, overwrites none', async () => {
  const db = openPrices(join(tempDir(), 'prices.db'));
  const lookupFn = recorded({
    '1982/0068100084245': [200, JSON_CT, FOUND],
    '2241/0068100084245': [200, JSON_CT, FOUND],
    '2241/0064100143135': [200, JSON_CT, SALE],
  });
  const stores = [store('1982'), store('2241')];
  const targets = [T('0068100084245'), T('0064100143135')];
  const opts = { delayMs: 0, maxRequests: null, dryRun: false };

  const r1 = await run(db, stores, targets, lookupFn, opts, '2026-09-30');
  assert.equal(r1.stoppedBecause, null);
  assert.deepEqual(r1.asked.map((a) => a.outcome), ['written', 'absent', 'written', 'written']);
  await run(db, stores, targets, lookupFn, opts, '2026-10-01');

  const rows = db
    .prepare('SELECT seller_sku, seen_on, code, price_cents, kind FROM observation ORDER BY seen_on, seller_sku')
    .all() as unknown as { seller_sku: string; seen_on: string; code: string; price_cents: number; kind: string }[];
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.filter((r) => r.seen_on === '2026-09-30').map((r) => `${r.seller_sku} ${r.price_cents} ${r.kind}`),
    ['1982:00068100084245 829 regular', '2241:00064100143135 599 promotional', '2241:00068100084245 829 regular'],
  );
  db.close();
});

test('the first refusal stops the run: nothing after it is asked', async () => {
  const db = openPrices(':memory:');
  const lookupFn = recorded({
    '1982/0068100084245': [200, JSON_CT, FOUND],
    '1982/0064100143135': [403, HTML_CT, CHALLENGE],
  });
  const r = await run(db, [store('1982'), store('2241')], [T('0068100084245'), T('0064100143135')], lookupFn, {
    delayMs: 0,
    maxRequests: null,
    dryRun: false,
  });
  assert.match(r.stoppedBecause ?? '', /^blocked at store 1982/);
  assert.deepEqual(lookupFn.calls, ['1982/0068100084245', '1982/0064100143135']);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 1);
});

test('a dry run asks nothing and writes nothing; --max-requests caps a live one', async () => {
  const lookupFn = recorded({});
  const dry = await run(null, [store('1982')], [T('0068100084245')], lookupFn, { delayMs: 0, maxRequests: null, dryRun: true });
  assert.equal(lookupFn.calls.length, 0);
  assert.equal(dry.asked.length, 0);

  const capped = await run(openPrices(':memory:'), STORES, [T('0068100084245')], lookupFn, { delayMs: 0, maxRequests: 3, dryRun: false });
  assert.equal(lookupFn.calls.length, 3);
  assert.match(capped.stoppedBecause ?? '', /max-requests 3/);
});

test('the delay between requests is honoured', async () => {
  const lookupFn = recorded({});
  const started = Date.now();
  await run(null, [store('1982')], [T('0068100084245'), T('0064100143135'), T('0012345678905')], lookupFn, {
    delayMs: 50,
    maxRequests: null,
    dryRun: false,
  });
  assert.ok(Date.now() - started >= 100, 'three requests need two gaps');
});

test('--stores N spreads across provinces; --store-ids picks exactly and refuses an unknown id', () => {
  const four = spreadStores(STORES, 4);
  assert.equal(four.length, 4);
  assert.ok(new Set(four.map((s) => s.province)).size >= 3, JSON.stringify(four.map((s) => s.province)));
  assert.deepEqual(pickStores(STORES, { storeIds: ['2202', '1982'], stores: null }).map((s) => s.retailerStoreId), ['2202', '1982']);
  assert.throws(() => pickStores(STORES, { storeIds: ['9999'], stores: null }), /9999/);
  assert.equal(spreadStores(STORES, 50).length, 7);
  assert.equal(new Set(spreadStores(STORES, 7).map((s) => s.retailerStoreId)).size, 7);
  assert.deepEqual(spreadStores(STORES, 4), spreadStores([...STORES].reverse(), 4), 'the same stores every day');
});

test('arguments: --db is required for a live run, the delay has a floor, one barcode source, one store choice', () => {
  const base = ['--barcodes', 'x.txt', '--stores', '3'];
  assert.throws(() => parseArgs(base), /--db PATH is required/);
  assert.equal(parseArgs([...base, '--dry-run']).db, null);
  assert.equal(parseArgs([...base, '--db', 'a.db']).delayMs, 1200);
  assert.throws(() => parseArgs([...base, '--db', 'a.db', '--delay-ms', '500']), /floor/);
  assert.throws(() => parseArgs(['--barcodes', 'x', '--from-prices', 'y', '--stores', '1', '--db', 'a']), /exactly one of --barcodes/);
  assert.throws(() => parseArgs(['--barcodes', 'x', '--db', 'a']), /exactly one of --store-ids/);
  assert.deepEqual(parseArgs(['--barcodes', 'x', '--store-ids', '1982, 2241', '--db', 'a']).storeIds, ['1982', '2241']);
});

test('targets: a list file is unjoined unless --catalogue confirms it; catalogue and prices sources are catalogue codes', () => {
  const dir = tempDir();
  const list = join(dir, 'codes.txt');
  writeFileSync(list, '# test\n0068100084245\n068100084245  # same code, 12 digits\n0012345678905\n');

  const catPath = join(dir, 'catalogue.db');
  const cat = new DatabaseSync(catPath);
  cat.exec("CREATE TABLE product (code TEXT PRIMARY KEY); INSERT INTO product VALUES ('0068100084245'), ('0064100143135');");
  cat.close();

  const base = parseArgs(['--barcodes', list, '--stores', '1', '--dry-run']);
  assert.deepEqual(loadTargets(base).map((t) => t.catalogueCode), [null, null, null]);
  assert.deepEqual(
    loadTargets({ ...base, catalogue: catPath }).map((t) => `${t.barcode}=${t.catalogueCode}`),
    ['0068100084245=0068100084245', '068100084245=0068100084245', '0012345678905=null'],
  );
  assert.deepEqual(
    loadTargets(parseArgs(['--from-catalogue', catPath, '--stores', '1', '--dry-run', '--limit', '1'])),
    [{ barcode: '0064100143135', catalogueCode: '0064100143135' }],
  );
});

test('--from-prices reads only joined codes, read only', async () => {
  const dir = tempDir();
  const pricesPath = join(dir, 'prices.db');
  const db = openPrices(pricesPath);
  await run(db, [store('2241')], [T('0064100143135'), { barcode: '0068100084245', catalogueCode: null }], recorded({
    '2241/0064100143135': [200, JSON_CT, SALE],
    '2241/0068100084245': [200, JSON_CT, FOUND],
  }), { delayMs: 0, maxRequests: null, dryRun: false });
  db.close();
  const targets = loadTargets(parseArgs(['--from-prices', pricesPath, '--stores', '1', '--dry-run']));
  assert.deepEqual(targets, [{ barcode: '0064100143135', catalogueCode: '0064100143135' }]);
});

test('the re-read sheet puts the raw price fields beside what was stored', async () => {
  const r = await run(openPrices(':memory:'), [store('2241')], [T('0064100143135'), T('0012345678905')], recorded({
    '2241/0064100143135': [200, JSON_CT, SALE],
  }), { delayMs: 0, maxRequests: null, dryRun: false }, DAY);
  const lines = sheetCsv(r.asked).trim().split('\n');
  assert.equal(lines.length, 3);
  const header = lines[0]!.split(',');
  const cells = lines[1]!.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, ''));
  const at = (name: string) => cells[header.indexOf(name)];
  assert.equal(at('raw_price'), '$5.99');
  assert.equal(at('raw_wasPrice'), '$8.29');
  assert.equal(at('stored_priceCents'), '599');
  assert.equal(at('stored_wasCents'), '829');
  assert.equal(at('stored_kind'), 'promotional');
  assert.match(lines[2]!, /^2241,0012345678905,absent,/);
});
