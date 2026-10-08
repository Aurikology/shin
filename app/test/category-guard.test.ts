/**
 * The serve-time category safeguard (docs/category-safeguards-2026-10-08.md,
 * Part A, A2 and A5): when an answer's range, verdict or ring used a parent rung,
 * the tag read as "parent" must be an ancestor of the leaf in the taxonomy.
 *
 * Each case has a BAD fixture the guard must catch and a GOOD one it must pass,
 * and every case also pins the rule that matters most: the answer is the same
 * with the guard on, off, or broken. A fault is recorded, never acted on.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, type ObservationRow } from '../../price/src/store.ts';
import { appendFault, createCategoryGuard, MAX_FAULT_ENTRIES, positionalParent, ringLeaf, type FaultsFile } from '../src/category-guard.ts';
import { answerBarcodeFromCatalogue, type BarcodeDeps } from '../src/catalogue-first.ts';
import { canonicalBarcode } from '../src/barcode.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-category-guard-'));
process.env.SHIN_CATALOGUE_FIRST = '0';
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const TAXONOMY = fileURLToPath(new URL('../../catalogue/test/fixtures/taxonomy-small.json', import.meta.url));
const { server, setCategoryGuardForTests, setSearchServiceForTests } = await import('../server.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  setSearchServiceForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const base = () => `http://127.0.0.1:${port}`;
/** One connection per request: a socket kept alive across tests can be reset by the server under load. */
const get = (path: string) => fetch(`${base()}${path}`, { headers: { connection: 'close' } });

/** A guard on the fixture taxonomy that writes its lines to an array instead of the console. */
function guard(opts: { taxonomyPath?: string; baselinePath?: string; faultsFile?: string } = {}) {
  const lines: string[] = [];
  const g = createCategoryGuard({ taxonomyPath: opts.taxonomyPath ?? TAXONOMY, ...(opts.baselinePath ? { baselinePath: opts.baselinePath } : {}), ...(opts.faultsFile ? { faultsFile: opts.faultsFile } : {}), log: (l) => lines.push(l) });
  return { g, lines };
}

/* ------------------------------------------------------------ the guard */

test('guard: a parent that is not an ancestor is a fault, logged with the fixed tag and counted by kind', () => {
  const { g, lines } = guard();
  assert.equal(g.check({ via: 'range', barcode: '0068100084245', leaf: 'en:cheddar', parent: 'en:snacks' }), 'parent_not_ancestor');
  assert.deepEqual(lines, ['[category-fault] parent_not_ancestor 0068100084245']);
  assert.equal(g.check({ via: 'ring', barcode: '555', leaf: 'en:cheddar', parent: 'en:snacks' }), 'parent_not_ancestor');
  const h = g.health();
  assert.equal(h.categoryCheck, 'on');
  assert.deepEqual(h.categoryFaults, { parent_not_ancestor: 2 });
  assert.equal(h.categoryChecked, 2);
});

test('guard: a true parent, or any ancestor, is no fault and logs nothing', () => {
  const { g, lines } = guard();
  assert.equal(g.check({ via: 'range', barcode: '1', leaf: 'en:cheddar', parent: 'en:cheeses' }), null);
  assert.equal(g.check({ via: 'verdict', barcode: '1', leaf: 'en:cheddar', parent: 'en:dairies' }), null);
  assert.deepEqual(lines, []);
  assert.deepEqual(g.health().categoryFaults, {});
});

test('guard: tags compare case-folded, so the ring\'s lower-cased tag is not a false fault', () => {
  const { g } = guard();
  assert.equal(g.check({ via: 'ring', barcode: '1', leaf: 'EN:Cheddar', parent: 'en:cheeses' }), null);
});

test('guard: no taxonomy means the check is OFF, says so in those words, and a check that did not run never reads as zero faults', () => {
  const { g, lines } = guard({ taxonomyPath: join(dir, 'missing.json') });
  assert.match(lines[0]!, /^\[category-fault\] taxonomy_unavailable - category check off/);
  assert.equal(g.check({ via: 'range', barcode: '1', leaf: 'en:cheddar', parent: 'en:snacks' }), null);
  const h = g.health();
  assert.equal(h.categoryCheck, 'category check off');
  assert.ok(h.categoryCheckWhy && h.categoryCheckWhy.includes('missing'));
  assert.equal(h.categoryChecked, 0, 'nothing was checked, and the count says so');
});

test('guard: a taxonomy whose hash is not the baseline\'s is reported as changed, and still checks', () => {
  const wrong = join(dir, 'baseline-wrong.json');
  writeFileSync(wrong, JSON.stringify({ taxonomy: { sha256: 'f'.repeat(64) } }));
  const { g, lines } = guard({ baselinePath: wrong });
  assert.ok(lines.some((l) => l.startsWith('[category-fault] taxonomy_changed')));
  assert.equal(g.health().taxonomy, 'changed since baseline');
  assert.equal(g.check({ via: 'range', barcode: '1', leaf: 'en:cheddar', parent: 'en:snacks' }), 'parent_not_ancestor');
});

test('guard: the matching baseline hash raises no change flag', async () => {
  const { loadTaxonomy } = await import('../../catalogue/src/category-taxonomy.ts');
  const right = join(dir, 'baseline-right.json');
  writeFileSync(right, JSON.stringify({ taxonomy: { sha256: loadTaxonomy(TAXONOMY).sha256 } }));
  const { g, lines } = guard({ baselinePath: right });
  assert.deepEqual(lines, []);
  assert.equal(g.health().taxonomy, undefined);
});

test('the positional parent and the ring leaf are read the way the ladder reads them', () => {
  assert.deepEqual(positionalParent('en:cheddar', ['en:cheeses', 'en:snacks', 'en:cheddar']), { leaf: 'en:cheddar', parent: 'en:snacks' });
  assert.deepEqual(positionalParent(null, ['en:dairies', 'en:cheeses']), { leaf: 'en:cheeses', parent: 'en:dairies' });
  assert.deepEqual(positionalParent(null, []), { leaf: null, parent: null });
  assert.equal(ringLeaf(['en:cheeses', 'en:snacks', 'en:cheddar'], 'EN:SNACKS'), 'en:cheddar');
  assert.equal(ringLeaf(['en:cheeses', 'en:snacks'], 'en:gone'), null);
});

/* ------------------------------- the range and the verdict, through the real answer */

const SELF = '0068100084245';
const AS_OF = '2026-09-27';

function obs(code: string, cents: number, sku: string): ObservationRow {
  return {
    code,
    seller: 'Walmart',
    sellerSku: sku,
    sellerName: 'x',
    sellerBrand: null,
    priceCents: cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency: 'CAD',
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: '2026-09-20',
    url: null,
    imageUrl: null,
    inStock: null,
  };
}

/** Five 500 g products on `othersPath`, one price each; the scanned product is in the catalogue on `selfPath`. */
function world(selfPath: string[], othersPath: string[]): { prices: DatabaseSync; catalogue: DatabaseSync } {
  const prices = openPrices(':memory:');
  const catalogue = new DatabaseSync(':memory:');
  catalogue.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, brands TEXT, quantity TEXT,
    size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = catalogue.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  ins.run(SELF, 'Cheddar', '500 g', 500, 'g', JSON.stringify(selfPath), selfPath[selfPath.length - 1]!);
  for (let i = 0; i < 5; i++) {
    const code = String(1000 + i).padStart(13, '0');
    ins.run(code, 'other', '500 g', 500, 'g', JSON.stringify(othersPath), othersPath[othersPath.length - 1]!);
    recordObservation(prices, obs(code, 400 + i * 100, `s${i}`));
  }
  return { prices, catalogue };
}

function deps(w: { prices: DatabaseSync; catalogue: DatabaseSync }, selfPath: string[], extra: Partial<BarcodeDeps> = {}): BarcodeDeps {
  const row = { code: SELF, name: 'Cheddar', brands: null, quantity: '500 g', leafCategory: selfPath[selfPath.length - 1]!, categoryPath: selfPath };
  return { lookup: { byGtin: () => row }, prices: w.prices, catalogue: w.catalogue, country: 'CA', currency: 'CAD', asOf: AS_OF, ...extra };
}

async function answer(selfPath: string[], othersPath: string[], extra: Partial<BarcodeDeps> = {}) {
  const canonical = canonicalBarcode(SELF);
  assert.ok(canonical);
  return answerBarcodeFromCatalogue(canonical, deps(world(selfPath, othersPath), selfPath, extra));
}

// The scanned cheddar lists en:snacks just before its leaf, as 6,003 real products do. The ladder reads
// that position as the parent. Five other products sit under en:snacks only, so the parent rung is used.
const BAD_SELF = ['en:cheeses', 'en:snacks', 'en:cheddar'];
const BAD_OTHERS = ['en:snacks', 'en:chips'];
// The good world: the tag before the leaf is the taxonomy parent.
const GOOD_SELF = ['en:dairies', 'en:cheeses', 'en:cheddar'];
const GOOD_OTHERS = ['en:dairies', 'en:cheeses'];

/** The same guard, but the ladder is not handed its taxonomy: the old position rule runs and the guard is the net under it. */
function netOnly(g: ReturnType<typeof guard>['g']): ReturnType<typeof guard>['g'] {
  return { check: (use) => g.check(use), health: () => g.health(), taxonomy: () => null };
}

test('B2 wiring: the range ladder gets the guard\'s taxonomy, so the parent rung is the taxonomy parent and not the tag before the leaf', async () => {
  const { g, lines } = guard();
  // Products under en:snacks (before the leaf) AND under en:cheeses (the taxonomy parent), five of each.
  const both = (selfPath: string[]) => {
    const w = world(selfPath, BAD_OTHERS);
    const ins = w.catalogue.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
    for (let i = 0; i < 5; i++) {
      const code = String(2000 + i).padStart(13, '0');
      ins.run(code, 'cheese', '500 g', 500, 'g', JSON.stringify(GOOD_OTHERS), 'en:cheeses');
      recordObservation(w.prices, obs(code, 900 + i * 100, `c${i}`));
    }
    return w;
  };
  const canonical = canonicalBarcode(SELF)!;
  const on = await answerBarcodeFromCatalogue(canonical, deps(both(BAD_SELF), BAD_SELF, { categoryGuard: g }));
  const off = await answerBarcodeFromCatalogue(canonical, deps(both(BAD_SELF), BAD_SELF, { categoryGuard: netOnly(g) }));
  assert.ok(on.answer.kind === 'catalogue' && on.answer.range?.category?.tag === 'en:cheeses', 'taxonomy passed: the taxonomy parent');
  assert.ok(off.answer.kind === 'catalogue' && off.answer.range?.category?.tag === 'en:snacks', 'control: no taxonomy, the position rule reads the non-ancestor');
  // The verdict ladder takes the same taxonomy parent, so the guard reports neither rung when the taxonomy is handed over.
  assert.equal(on.record.categoryFaults, undefined, 'range and verdict both on the taxonomy parent: nothing to report');
  assert.deepEqual(off.record.categoryFaults, ['parent_not_ancestor'], 'where the ladders were not given the taxonomy the guard catches the non-ancestor');
  assert.ok(lines.includes(`[category-fault] parent_not_ancestor ${SELF}`), lines.join('|'));
});

test('range and verdict: a parent rung on a non-ancestor is caught, put on the record, logged and counted', async () => {
  const { g: full, lines } = guard();
  const g = netOnly(full);
  const r = await answer(BAD_SELF, BAD_OTHERS, { categoryGuard: g });
  assert.equal(r.record.rangeBasis, 'parent_category', 'the fixture really does reach the parent rung');
  assert.equal(r.answer.kind, 'catalogue');
  assert.ok(r.answer.kind === 'catalogue' && r.answer.range?.category?.tag === 'en:snacks');
  assert.deepEqual(r.record.categoryFaults, ['parent_not_ancestor']);
  assert.ok(lines.includes(`[category-fault] parent_not_ancestor ${SELF}`), lines.join('|'));
  assert.ok((g.health().categoryFaults.parent_not_ancestor ?? 0) >= 1);
});

test('range and verdict: a parent rung on the taxonomy parent passes clean', async () => {
  const { g, lines } = guard();
  const r = await answer(GOOD_SELF, GOOD_OTHERS, { categoryGuard: g });
  assert.equal(r.record.rangeBasis, 'parent_category', 'the good fixture reaches the parent rung too, so the pass means something');
  assert.equal(r.record.categoryFaults, undefined);
  assert.deepEqual(lines, []);
  assert.deepEqual(g.health().categoryFaults, {});
  assert.ok(g.health().categoryChecked >= 1, 'it did check');
});

test('the answer is identical with the guard on, off, or with no taxonomy: a fault is recorded, never acted on', async () => {
  const strip = (r: Awaited<ReturnType<typeof answer>>) => ({ answer: r.answer, record: { ...r.record, categoryFaults: undefined } });
  const without = await answer(BAD_SELF, BAD_OTHERS);
  // Recording the fault changes nothing (the guard as a net under the old position rule).
  const on = await answer(BAD_SELF, BAD_OTHERS, { categoryGuard: netOnly(guard().g) });
  const off = await answer(BAD_SELF, BAD_OTHERS, { categoryGuard: guard({ taxonomyPath: join(dir, 'missing.json') }).g });
  assert.deepEqual(strip(on), strip(without));
  assert.deepEqual(strip(off), strip(without));
  assert.equal(without.record.categoryFaults, undefined);
  assert.equal(off.record.categoryFaults, undefined);
  assert.equal(on.record.rangeBasis, 'parent_category');
  // And the guard that DOES hand the ladder its taxonomy changes the range on purpose (B2): the non-ancestor is not read.
  const handed = await answer(BAD_SELF, BAD_OTHERS, { categoryGuard: guard().g });
  assert.notEqual(handed.record.rangeBasis, 'parent_category');
  assert.equal(handed.record.categoryFaults, undefined);
});

/* ------------------------------------------------- the ring and /api/health */

async function health(): Promise<Record<string, unknown>> {
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  return (await res.json()) as Record<string, unknown>;
}

function ringSearch(ring: Record<string, unknown>, categoryPath: string[]) {
  return {
    search: async () => ({
      band: 'confident',
      matchedBy: 'hybrid',
      candidates: [{ code: '0068100084245', name: 'Cheddar', categoryPath, leafCategory: categoryPath[categoryPath.length - 1] }],
      ring: { label: 'snacks', distanceOut: 1, members: [], ringTag: ring.tag, ...ring },
    }),
  };
}

test('/api/health: counts a ring fault by kind and the answer still comes back unchanged', async () => {
  const { g, lines } = guard();
  setCategoryGuardForTests(g);
  const ring = { tag: 'en:snacks', ring: 'parent' };
  setSearchServiceForTests(ringSearch(ring, BAD_SELF));
  const res = await get('/api/search?q=cheddar');
  const body = (await res.json()) as { band: string; ring: { tag: string; ring: string } };
  assert.equal(res.status, 200);
  assert.equal(body.band, 'confident', 'the answer is not blocked or downgraded');
  assert.equal(body.ring.tag, 'en:snacks', 'the ring is returned exactly as it was');
  assert.ok(lines.includes('[category-fault] parent_not_ancestor 0068100084245'), lines.join('|'));
  const h = await health();
  assert.equal(h.ok, true);
  assert.equal(h.categoryCheck, 'on');
  assert.deepEqual(h.categoryFaults, { parent_not_ancestor: 1 });
});

test('/api/health: a ring on the taxonomy parent, and a leaf-level ring, are not faults', async () => {
  const { g, lines } = guard();
  setCategoryGuardForTests(g);
  setSearchServiceForTests(ringSearch({ tag: 'en:cheeses', ring: 'parent' }, GOOD_SELF));
  await get('/api/search?q=cheddar');
  setSearchServiceForTests(ringSearch({ tag: 'en:snacks', ring: 'leaf' }, BAD_SELF));
  await get('/api/search?q=cheddar');
  assert.deepEqual(lines, []);
  const h = await health();
  assert.deepEqual(h.categoryFaults, {});
  assert.equal(h.categoryChecked, 1, 'only the parent ring is a parent rung to check');
});

test('/api/health: with no taxonomy it says "category check off" and the ring is still answered', async () => {
  const { g } = guard({ taxonomyPath: join(dir, 'missing.json') });
  setCategoryGuardForTests(g);
  setSearchServiceForTests(ringSearch({ tag: 'en:snacks', ring: 'parent' }, BAD_SELF));
  const res = await get('/api/search?q=cheddar');
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { band: string }).band, 'confident');
  const h = await health();
  assert.equal(h.categoryCheck, 'category check off');
  assert.equal(h.ok, true, 'health stays ok: the shopper is served');
  assert.deepEqual(h.categoryFaults, {});
  assert.equal(h.categoryChecked, 0);
});

/* ------------------------------- faults reach a file a person sees */

const readFaults = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as FaultsFile;

test('faults file: each fault is appended with kind, barcode and time, and the total counts them', () => {
  const file = join(dir, 'faults-1.json');
  const { g } = guard({ faultsFile: file });
  g.check({ via: 'range', barcode: '111', leaf: 'en:cheddar', parent: 'en:snacks' });
  g.check({ via: 'ring', barcode: '222', leaf: 'en:cheddar', parent: 'en:snacks' });
  const f = readFaults(file);
  assert.equal(f.total, 2);
  assert.deepEqual(f.faults.map((x) => [x.kind, x.barcode]), [['parent_not_ancestor', '111'], ['parent_not_ancestor', '222']]);
  assert.ok(f.faults.every((x) => Math.abs(Date.parse(x.at) - Date.now()) < 120_000));
});

test('faults file: a sound rung writes nothing, so no file appears', () => {
  const file = join(dir, 'faults-2.json');
  const { g } = guard({ faultsFile: file });
  g.check({ via: 'range', barcode: '111', leaf: 'en:cheddar', parent: 'en:cheeses' });
  assert.throws(() => readFileSync(file), 'no fault, no file');
});

test('faults file: a taxonomy that did not load is recorded too, once per start', () => {
  const file = join(dir, 'faults-3.json');
  guard({ taxonomyPath: join(dir, 'missing.json'), faultsFile: file });
  const f = readFaults(file);
  assert.deepEqual(f.faults.map((x) => [x.kind, x.barcode]), [['taxonomy_unavailable', '-']]);
});

test('faults file: keeps the latest entries and the true total; an unreadable file is started again, not crashed on', () => {
  const file = join(dir, 'faults-4.json');
  for (let i = 0; i < MAX_FAULT_ENTRIES + 5; i++) appendFault(file, { kind: 'k', barcode: String(i), at: new Date().toISOString() });
  const f = readFaults(file);
  assert.equal(f.total, MAX_FAULT_ENTRIES + 5);
  assert.equal(f.faults.length, MAX_FAULT_ENTRIES);
  assert.equal(f.faults[f.faults.length - 1]!.barcode, String(MAX_FAULT_ENTRIES + 4));
  const bad = join(dir, 'faults-5.json');
  writeFileSync(bad, '{ nope');
  appendFault(bad, { kind: 'k', barcode: '1', at: new Date().toISOString() });
  assert.equal(readFaults(bad).total, 1);
});

test('faults file: a ring fault through the route reaches the file and the answer is unchanged', async () => {
  const file = join(dir, 'faults-6.json');
  const { g } = guard({ faultsFile: file });
  setCategoryGuardForTests(g);
  setSearchServiceForTests(ringSearch({ tag: 'en:snacks', ring: 'parent' }, BAD_SELF));
  const res = await get('/api/search?q=cheddar');
  assert.equal(((await res.json()) as { band: string }).band, 'confident');
  assert.deepEqual(readFaults(file).faults.map((x) => [x.kind, x.barcode]), [['parent_not_ancestor', '0068100084245']]);
});
