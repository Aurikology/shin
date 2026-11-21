/**
 * Gap 54 and 67 (load test, 2026-11-21): typed search ran on ONE worker thread, so past a few hundred
 * shoppers every search queued behind it while 6 of the Mac's 8 cores sat idle. The service is now a
 * pool of identical workers, each with its own read-only handle on the same file.
 *
 * What this pins: the pool answers exactly what a single worker and a direct `Catalogue` answer, a
 * worker that dies takes only its own in-flight request with it (the pool replaces it and keeps
 * answering), a pool whose workers cannot even start stops retrying instead of spinning, and
 * `close()` ends every thread.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalogue, openCatalogueReadOnly, rebuildFts } from '../src/schema.ts';
import { rebuildCategoriesFromPaths } from './helpers/path-taxonomy.ts';
import { Catalogue } from '../src/search.ts';
import { defaultEmbedder } from '../src/embed.ts';
import { startCatalogueService } from '../src/service.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-service-pool-'));
process.env.SHIN_GAPS = join(dir, 'gaps.db');
const dbPath = join(dir, 'catalogue.db');
{
  const db = openCatalogue(dbPath);
  const insert = db.prepare(`INSERT INTO product (code, name, name_en, brands, quantity, size_value, size_unit,
    category_path, leaf_category, allergens, sold_in_canada, source) VALUES (?,?,?,?,?,?,?,?,?,'[]',1,'test')`);
  const MILK = '["en:dairies","en:milks"]';
  const rows: [string, string, string, string, number, string, string, string][] = [
    ['0068700011009', 'Partly Skimmed Milk 2%', 'Neilson', '2 L', 2000, 'ml', MILK, 'en:milks'],
    ['0068700011016', 'Homogenized Milk', 'Neilson', '4 L', 4000, 'ml', MILK, 'en:milks'],
    ['0055872010001', 'Skim Milk', 'Natrel', '1 L', 1000, 'ml', MILK, 'en:milks'],
    ['0068100084245', 'Smooth Peanut Butter', 'Kraft', '1 kg', 1000, 'g', '["en:spreads","en:peanut-butters"]', 'en:peanut-butters'],
    ['0068100084276', 'Crunchy Peanut Butter', 'Kraft', '1 kg', 1000, 'g', '["en:spreads","en:peanut-butters"]', 'en:peanut-butters'],
    ['0064200116473', 'Old Cheddar Cheese', 'Black Diamond', '400 g', 400, 'g', '["en:dairies","en:cheeses"]', 'en:cheeses'],
    ['0048500001233', 'Orange Juice No Pulp', 'Tropicana', '1.54 L', 1540, 'ml', '["en:beverages","en:orange-juices"]', 'en:orange-juices'],
  ];
  for (const r of rows) insert.run(...r.slice(0, 1), r[1], r[1], r[2], r[3], r[4], r[5], r[6], r[7]);
  rebuildFts(db);
  rebuildCategoriesFromPaths(db);
  db.close();
}

const pool = startCatalogueService(dbPath, { warm: false, size: 3 });
const single = startCatalogueService(dbPath, { warm: false, size: 1 });
const direct = new Catalogue(openCatalogueReadOnly(dbPath), defaultEmbedder());

after(async () => {
  await pool.close();
  await single.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const QUERIES = [
  { text: 'milk', limit: 5, vectors: false },
  { text: 'neilson milk 2 L', limit: 3, vectors: false },
  { text: 'peanut butter', limit: 5, vectors: false },
  { text: 'cheddar', limit: 5, vectors: false },
  { text: 'orange juice', limit: 5, vectors: false },
  { text: 'nothing like this at all', limit: 5, vectors: false, recordMiss: false },
  { gtin: '0068700011009' },
  { gtin: '68700011009' },
];

test('the pool starts the number of threads it was asked for', () => {
  assert.equal(pool.threads(), 3);
  assert.equal(single.threads(), 1);
});

test('the pool answers exactly what one worker and a direct search answer', async () => {
  let found = 0;
  for (const q of QUERIES) {
    const [a, b, c] = await Promise.all([pool.search(q), single.search(q), direct.search(q)]);
    if (a.band !== 'miss' && a.candidates.length > 0) found += 1;
    assert.deepEqual(a, b, `pool and single worker differ for ${JSON.stringify(q)}`);
    assert.deepEqual(a, JSON.parse(JSON.stringify(c)), `pool and direct differ for ${JSON.stringify(q)}`);
  }
  assert.ok(found >= 6, `the fixture is searched, not missed: ${found} of ${QUERIES.length} found something`);
});

test('many searches at once all come back, each with its own answer', async () => {
  const asked = Array.from({ length: 60 }, (_, i) => QUERIES[i % QUERIES.length]!);
  const got = await Promise.all(asked.map((q) => pool.search(q)));
  const want = await Promise.all(asked.map((q) => single.search(q)));
  assert.deepEqual(got, want);
});

test('a worker that dies fails only its own request, and the pool replaces it', async () => {
  const inFlight = pool.search({ text: 'milk', limit: 5, vectors: false });
  const killed = await pool.crashOneForTests();
  assert.ok(killed, 'a live worker was found to stop');
  // The request may have finished before the stop landed; either way it settles, it never hangs.
  await inFlight.then(() => undefined, (err: Error) => assert.match(err.message, /stopped|exited|terminated|worker/i));
  const after = await pool.search({ text: 'peanut butter', limit: 5, vectors: false });
  assert.deepEqual(after, await single.search({ text: 'peanut butter', limit: 5, vectors: false }));
  assert.equal(pool.threads(), 3, 'back to full size');
});

test('a pool whose workers cannot start rejects searches instead of hanging or respawning forever', async () => {
  const broken = startCatalogueService(join(dir, 'no-such-dir', 'catalogue.db'), { warm: false, size: 2 });
  try {
    await assert.rejects(broken.search({ text: 'milk', limit: 5 }), /catalogue|worker|open|no such|unable/i);
    // Give the restart budget time to run out, then the pool reports it has no threads left.
    for (let i = 0; i < 50 && broken.threads() > 0; i += 1) await new Promise((r) => setTimeout(r, 100));
    assert.equal(broken.threads(), 0, 'it stopped restarting a worker that dies at start');
    await assert.rejects(broken.search({ text: 'milk', limit: 5 }), /no catalogue worker/);
  } finally {
    await broken.close();
  }
});

test('close ends every thread, and a search after close is refused at once', async () => {
  const s = startCatalogueService(dbPath, { warm: false, size: 2 });
  await s.search({ text: 'milk', limit: 5, vectors: false });
  await s.close();
  assert.equal(s.threads(), 0);
  await assert.rejects(s.search({ text: 'milk', limit: 5 }), /closed/);
});
