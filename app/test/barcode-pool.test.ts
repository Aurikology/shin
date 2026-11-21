/**
 * Gaps 54 and 67 (load test on the Mac, 2026-11-21): a barcode scan was priced on the request
 * thread, so with scans in the mix the server broke at 256 continuous users on 2 of 8 cores. The
 * answer now runs on barcode worker threads (src/barcode-pool.ts, src/barcode-worker.ts).
 *
 * The one promise that matters: the answer is the same. Each scan here is answered twice over the
 * same files on disk, once through a worker and once with `answerBarcodeFromCatalogue` on this
 * thread, wired the way app/server.ts wires it, and the two must be deep-equal: catalogue hits,
 * a product priced only by its category, one with no price that asks Claude (a stub, called on
 * this thread by message), loose produce, and the category checks the answer made. Then the
 * failure cases: a miss comes back unanswered (the request thread does its network steps), a
 * worker that dies mid-scan does not hang the scan or the process and is replaced, a catalogue
 * that cannot open stops restarting, and close() ends the threads.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openCatalogue, openCatalogueReadOnly, rebuildFts } from '../../catalogue/src/schema.ts';
import { rebuildCategoriesFromPaths } from '../../catalogue/test/helpers/path-taxonomy.ts';
import { Catalogue } from '../../catalogue/src/search.ts';
import { defaultEmbedder } from '../../catalogue/src/embed.ts';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';
import { answerBarcodeFromCatalogue, type BarcodeDeps } from '../src/catalogue-first.ts';
import { canonicalBarcode } from '../src/barcode.ts';
import { createCategoryGuard, type RungUse } from '../src/category-guard.ts';
import { startBarcodePool, workerThreadsFrom, type BarcodeJob } from '../src/barcode-pool.ts';
import type { RangeAskResult } from '../../identify/src/range-ask.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-barcode-pool-'));
process.env.SHIN_GAPS = join(dir, 'gaps.db');
const cataloguePath = join(dir, 'catalogue.db');
const pricesPath = join(dir, 'prices.db');
const taxonomyPath = fileURLToPath(new URL('../../catalogue/test/fixtures/taxonomy-small.json', import.meta.url));
const AS_OF = new Date().toISOString().slice(0, 10);
const SEEN = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

const OJ = ['en:beverages', 'en:juices', 'en:orange-juices'];
const JUICE = ['en:beverages', 'en:juices'];
const OWN = '0048500001233'; // priced itself, several shops
const LEAF_ONLY = '0048500001240'; // no price of its own; its leaf has only a few priced products
const PARENT = '0048500001257'; // a juice whose leaf is the parent pool
const UNPRICED = '0099999000016'; // a category with no price anywhere: the ladder asks Claude
const NO_CATEGORY = '0099999000023'; // no category: the name search sorts it
const MISS = '0012345678905'; // a valid barcode the catalogue lacks

{
  const db = openCatalogue(cataloguePath);
  const ins = db.prepare(`INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit, category_path,
    leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?,?,?,'[]',1,'test')`);
  ins.run(OWN, 'Orange Juice No Pulp', 'Orange Juice No Pulp', 'Tropicana', '1.54 L', 1540, 'ml', JSON.stringify(OJ), 'en:orange-juices');
  ins.run(LEAF_ONLY, 'Orange Juice Pulp', 'Orange Juice Pulp', 'Tropicana', '1.54 L', 1540, 'ml', JSON.stringify(OJ), 'en:orange-juices');
  ins.run(PARENT, 'Apple Juice', 'Apple Juice', 'Oasis', '1.89 L', 1890, 'ml', JSON.stringify(JUICE), 'en:juices');
  ins.run(UNPRICED, 'Pickled Quail Eggs', 'Pickled Quail Eggs', 'Nobody', '250 g', 250, 'g', '["en:groceries","en:quail-eggs"]', 'en:quail-eggs');
  ins.run(NO_CATEGORY, 'Mango Nectar', 'Mango Nectar', 'Del Monte', '960 ml', 960, 'ml', '[]', null);
  for (let i = 0; i < 12; i += 1) {
    const code = String(4850000100 + i).padStart(13, '0');
    ins.run(code, `Juice ${i}`, `Juice ${i}`, 'Oasis', '1.75 L', 1750, 'ml', JSON.stringify(i < 2 ? OJ : JUICE), i < 2 ? 'en:orange-juices' : 'en:juices');
  }
  rebuildFts(db);
  rebuildCategoriesFromPaths(db);
  db.close();

  const p = openPrices(pricesPath);
  const obs = (code: string, cents: number, seller: string): ObservationRow => ({
    code, seller, sellerSku: `${seller}-${code}`, sellerName: 'x', sellerBrand: null, priceCents: cents, kind: 'regular',
    unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA', region: null, joinMethod: 'gtin',
    seenOn: SEEN, url: null, imageUrl: null, inStock: null,
  });
  [449, 499, 529, 549].forEach((c, i) => recordObservation(p, obs(OWN, c, `shop${i}`)));
  for (let i = 0; i < 12; i += 1) recordObservation(p, obs(String(4850000100 + i).padStart(13, '0'), 400 + i * 3, `shop${i % 5}`));
  p.close();
}

const pool = startBarcodePool({ size: 2, cataloguePath, pricesPath, taxonomyPath });
after(async () => {
  await pool.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const CLAUDE: RangeAskResult = {
  ok: true,
  range: { lowCents: 400, highCents: 900, currency: 'CAD', unit: 'one 250 g jar', confidence: 'medium', askedAt: '2026-11-21T12:00:00.000Z', model: 'stub' },
  cached: false,
};

/** One scan answered on this thread, wired as app/server.ts `withCatalogueFirstDeps` wires it. */
async function direct(code: string, opts: { ask?: boolean; sort?: boolean; shopper?: { cents: number } | null } = {}) {
  const catDb = openCatalogueReadOnly(cataloguePath);
  const prices = new DatabaseSync(pricesPath, { readOnly: true });
  const uses: RungUse[] = [];
  const guard = createCategoryGuard({ taxonomyPath, log: () => {} });
  try {
    const deps: BarcodeDeps = {
      lookup: new Catalogue(catDb, defaultEmbedder()) as unknown as BarcodeDeps['lookup'],
      prices,
      catalogue: catDb,
      categoryGuard: { taxonomy: () => guard.taxonomy(), health: () => guard.health(), check: (u) => (uses.push(u), guard.check(u)) },
      country: 'CA',
      currency: 'CAD',
      asOf: AS_OF,
      region: 'Ontario',
      shopper: opts.shopper ?? null,
      ...(opts.ask ? { askRange: async () => CLAUDE } : {}),
      ...(opts.sort ? { sortName: async () => ({ leafCategory: 'en:juices', categoryPath: JUICE }) } : {}),
      claudeWaitMs: 2000,
      shopperVoice: () => null,
    };
    return { out: await answerBarcodeFromCatalogue(canonicalBarcode(code)!, deps), uses };
  } finally {
    prices.close();
    catDb.close();
  }
}

function job(code: string, opts: { ask?: boolean; sort?: boolean; shopper?: { cents: number } | null } = {}): BarcodeJob {
  return {
    canonical: canonicalBarcode(code)!,
    country: 'CA',
    currency: 'CAD',
    asOf: AS_OF,
    region: 'Ontario',
    shopper: opts.shopper ?? null,
    claudeWaitMs: 2000,
    nationalAverage: false,
    hasAskRange: opts.ask === true,
    hasSortName: opts.sort === true,
    shopperVoiceOff: false,
    correctionsPath: null,
  };
}

test('a scan through a worker is the same answer as the same scan on this thread', async () => {
  const cases: [string, { ask?: boolean; sort?: boolean; shopper?: { cents: number } | null }][] = [
    [OWN, {}],
    [OWN, { shopper: { cents: 399 } }],
    [LEAF_ONLY, { shopper: { cents: 499 } }],
    [PARENT, {}],
    [UNPRICED, { ask: true }],
    [NO_CATEGORY, { sort: true }],
    ['4011', {}], // loose produce: bananas, priced per lb through the same ladder
  ];
  let priced = 0;
  for (const [code, opts] of cases) {
    const asked: string[] = [];
    const want = await direct(code, opts);
    const r = await pool.answer(job(code, opts), {
      ...(opts.ask ? { askRange: async (id) => (asked.push(id.name), CLAUDE) } : {}),
      ...(opts.sort ? { sortName: async () => ({ leafCategory: 'en:juices', categoryPath: JUICE }) } : {}),
    });
    assert.ok(r.done, `${code} was answered by the worker (${r.done === null ? r.why : ''})`);
    assert.deepEqual(r.done, structuredClone(want.out), `${code} differs`);
    if (r.done.answer.range || r.done.answer.verdict) priced += 1;
    if (opts.ask) assert.equal(asked.length, 1, 'the Claude ask was made once, on this thread');
  }
  assert.ok(priced >= 5, `the fixture is priced, not empty: ${priced} of ${cases.length}`);
});

test('the category checks an answer made are handed back for the server guard to replay', async () => {
  const replayed: RungUse[] = [];
  const p = startBarcodePool({ size: 1, cataloguePath, pricesPath, taxonomyPath, onGuardUse: (u) => replayed.push(u) });
  try {
    for (const code of [OWN, LEAF_ONLY, PARENT]) {
      const want = await direct(code, { shopper: { cents: 499 } });
      const before = replayed.length;
      const r = await p.answer(job(code, { shopper: { cents: 499 } }), {});
      assert.ok(r.done);
      assert.deepEqual(replayed.slice(before), want.uses, `${code}: the same checks, in order`);
    }
    assert.ok(replayed.length > 0, 'the fixture reaches a parent rung, so there is something to replay');
  } finally {
    await p.close();
  }
});

test('a barcode the catalogue lacks comes back unanswered, for the request thread to name', async () => {
  const r = await pool.answer(job(MISS), {});
  assert.equal(r.done, null);
  assert.equal(r.done === null && r.why, 'miss');
});

test('a worker that dies mid-scan fails only that scan, back to this thread, and is replaced', async () => {
  const p = startBarcodePool({ size: 1, cataloguePath, pricesPath, taxonomyPath });
  try {
    // A scan that waits on this thread (the Claude ask) is in flight when the worker stops.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let asked!: () => void;
    const askedYet = new Promise<void>((r) => (asked = r));
    const inFlight = p.answer(job(UNPRICED, { ask: true }), { askRange: async () => (asked(), await gate, CLAUDE) });
    await askedYet;
    assert.equal(await p.crashOneForTests(), true);
    release();
    const r = await inFlight;
    assert.equal(r.done, null, 'the scan is handed back, not hung');
    assert.equal(r.done === null && r.askSpent, true, 'and says its Claude ask was already made, so it is not made twice');
    const again = await p.answer(job(OWN), {});
    assert.ok(again.done, 'a replacement worker answers the next scan');
    assert.deepEqual(again.done, structuredClone((await direct(OWN)).out));
    assert.equal(p.threads(), 1);
  } finally {
    await p.close();
  }
});

test('a catalogue that cannot be opened stops restarting and every scan is handed back', async () => {
  const p = startBarcodePool({ size: 2, cataloguePath: join(dir, 'missing', 'catalogue.db'), pricesPath, taxonomyPath });
  try {
    const first = await p.answer(job(OWN), {});
    assert.equal(first.done, null);
    for (let i = 0; i < 50 && p.threads() > 0; i += 1) await new Promise((r) => setTimeout(r, 100));
    assert.equal(p.threads(), 0, 'it gave up on a worker that dies at start');
    const later = await p.answer(job(OWN), {});
    assert.deepEqual(later, { done: null, why: 'no_worker', askSpent: false });
  } finally {
    await p.close();
  }
});

test('close ends the threads; a scan after it is handed back at once', async () => {
  const p = startBarcodePool({ size: 2, cataloguePath, pricesPath, taxonomyPath });
  assert.ok((await p.answer(job(OWN), {})).done);
  await p.close();
  assert.equal(p.threads(), 0);
  assert.deepEqual(await p.answer(job(OWN), {}), { done: null, why: 'pool_closed', askSpent: false });
});

test('the pools are off unless SHIN_WORKER_THREADS is a positive whole number', () => {
  for (const off of [undefined, '', '  ', '0', '-2', '1.5', 'four', 'on']) assert.equal(workerThreadsFrom(off), 0, `${JSON.stringify(off)} is off`);
  assert.equal(workerThreadsFrom('3'), 3);
  assert.equal(workerThreadsFrom(' 2 '), 2);
  assert.equal(workerThreadsFrom('500'), 32, 'capped');
});
