/**
 * Part A of docs/category-safeguards-2026-10-08.md: the category safeguards.
 * Each safeguard is tested on a BAD fixture it must catch and a GOOD one it must
 * pass, because a check that has never gone red is not a check.
 *
 * Every database and file here lives in a temp folder made by this file and
 * removed after. Nothing touches catalogue/data.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  deepestTags,
  faultsOfPath,
  loadTaxonomy,
  parentRungFault,
  taxonomyFromObject,
  TaxonomyError,
} from '../src/category-taxonomy.ts';
import { COUNT_KEYS, findSwallows, runCategoryCheck } from '../src/category-check.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-category-safeguards-'));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const FIXTURE_TAXONOMY = fileURLToPath(new URL('./fixtures/taxonomy-small.json', import.meta.url));
const CHECK_SCRIPT = fileURLToPath(new URL('../src/category-check.ts', import.meta.url));
const SHIPPED_BASELINE = fileURLToPath(new URL('../category-baseline.json', import.meta.url));
const tax = loadTaxonomy(FIXTURE_TAXONOMY);

/* ------------------------------------------------------------- taxonomy */

test('taxonomy: ancestors are transitive and strict, and tags fold case', () => {
  assert.equal(tax.isAncestor('en:dairies', 'en:cheddar'), true);
  assert.equal(tax.isAncestor('EN:Cheeses', 'en:cheddar'), true);
  assert.equal(tax.isAncestor('en:cheddar', 'en:cheddar'), false, 'a tag is not its own ancestor');
  assert.equal(tax.isAncestor('en:snacks', 'en:cheddar'), false);
  assert.equal(tax.isAncestor('en:cheddar', 'en:cheeses'), false, 'descendants are not ancestors');
  assert.equal(tax.has('Juice'), false);
  assert.equal(tax.has('en:juices'), true);
  assert.deepEqual([...tax.parentsOf('en:cheese-snacks')].sort(), ['en:cheeses', 'en:snacks']);
});

test('A5: a missing, unreadable or empty taxonomy file throws a named error, never an empty taxonomy', () => {
  assert.throws(() => loadTaxonomy(join(dir, 'nope.json')), (e: unknown) => e instanceof TaxonomyError && e.reason === 'missing');
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  assert.throws(() => loadTaxonomy(bad), (e: unknown) => e instanceof TaxonomyError && e.reason === 'unreadable');
  const empty = join(dir, 'empty.json');
  writeFileSync(empty, '{}');
  assert.throws(() => loadTaxonomy(empty), (e: unknown) => e instanceof TaxonomyError && e.reason === 'empty');
  const arr = join(dir, 'arr.json');
  writeFileSync(arr, '[]');
  assert.throws(() => loadTaxonomy(arr), (e: unknown) => e instanceof TaxonomyError);
  // The good fixture loads and carries the hash of its own bytes.
  assert.equal(tax.sha256, createHash('sha256').update(readFileSync(FIXTURE_TAXONOMY)).digest('hex'));
  assert.ok(tax.size >= 10);
});

test('a cycle in the taxonomy data does not hang the ancestor walk', () => {
  const cyc = taxonomyFromObject({ 'en:a': { parents: ['en:b'] }, 'en:b': { parents: ['en:a'] } }, 'x');
  assert.equal(cyc.isAncestor('en:a', 'en:b'), true);
  assert.equal(cyc.isAncestor('en:c', 'en:b'), false);
});

/* ------------------------------------------------------ A1 to A4, per path */

test('A1: two deepest categories on separate branches are caught; a single branch passes', () => {
  assert.deepEqual(deepestTags(['en:chips', 'en:cheddar'], tax).sort(), ['en:cheddar', 'en:chips']);
  assert.ok(faultsOfPath(['en:chips', 'en:cheddar'], tax).includes('two_branches'));
  // Good: one branch, broad to specific.
  assert.deepEqual(faultsOfPath(['en:dairies', 'en:cheeses', 'en:cheddar'], tax), []);
  assert.deepEqual(deepestTags(['en:dairies', 'en:cheeses', 'en:cheddar'], tax), ['en:cheddar']);
  // A repeated tag in another case is still one tag.
  assert.ok(!faultsOfPath(['en:cheddar', 'EN:CHEDDAR'], tax).includes('two_branches'));
});

test('A2: a "parent" that is not an ancestor of the last tag is caught; a true parent or grandparent passes', () => {
  assert.ok(faultsOfPath(['en:cheeses', 'en:snacks', 'en:cheddar'], tax).includes('parent_not_ancestor'));
  assert.ok(!faultsOfPath(['en:dairies', 'en:cheeses', 'en:cheddar'], tax).includes('parent_not_ancestor'));
  assert.ok(!faultsOfPath(['en:dairies', 'en:cheddar'], tax).includes('parent_not_ancestor'), 'any ancestor counts');
  assert.ok(!faultsOfPath(['en:cheddar'], tax).includes('parent_not_ancestor'), 'one tag has no parent to check');
  // An unknown parent is not an ancestor: a missing reference is a fault.
  assert.ok(faultsOfPath(['Cheese', 'en:cheddar'], tax).includes('parent_not_ancestor'));
});

test('A3: a tag outside the taxonomy is caught (raw labels, other-language duplicates); canonical tags pass', () => {
  assert.ok(faultsOfPath(['Juice'], tax).includes('unknown_tag'));
  assert.ok(faultsOfPath(['en:beverages', 'Jus'], tax).includes('unknown_tag'));
  assert.ok(!faultsOfPath(['en:beverages', 'en:juices'], tax).includes('unknown_tag'));
  assert.ok(!faultsOfPath(['EN:Beverages'], tax).includes('unknown_tag'), 'case does not make a tag unknown');
});

test('A4: a leaf that is an ancestor of another of the product\'s own tags is caught; a true leaf passes', () => {
  assert.ok(faultsOfPath(['en:cheddar', 'en:cheeses'], tax).includes('leaf_is_ancestor'));
  assert.ok(!faultsOfPath(['en:cheeses', 'en:cheddar'], tax).includes('leaf_is_ancestor'));
  assert.deepEqual(faultsOfPath([], tax), []);
});

test('serve time: a parent rung whose parent is not an ancestor of the leaf is a fault; a taxonomy parent is not', () => {
  assert.equal(parentRungFault('en:cheddar', 'en:snacks', tax), 'parent_not_ancestor');
  assert.equal(parentRungFault('en:cheddar', 'en:cheeses', tax), null);
  assert.equal(parentRungFault('en:cheddar', 'not-a-tag', tax), 'parent_not_ancestor');
});

/* ------------------------------------------------------- the load check */

interface Fx {
  code: string;
  source?: string;
  canada?: number;
  path: unknown;
  categorySource?: string | null;
}

function makeDb(name: string, rows: readonly Fx[]): string {
  const p = join(dir, name);
  const db = new DatabaseSync(p);
  db.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, source TEXT NOT NULL, sold_in_canada INTEGER NOT NULL,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT, category_source TEXT)`);
  const ins = db.prepare('INSERT INTO product VALUES (?,?,?,?,?,?)');
  for (const r of rows) {
    ins.run(r.code, r.source ?? 'openfoodfacts', r.canada ?? 1, typeof r.path === 'string' ? r.path : JSON.stringify(r.path), null, r.categorySource === undefined ? 'declared' : r.categorySource);
  }
  db.close();
  return p;
}

const GOOD_ROWS: Fx[] = [
  { code: '1', path: ['en:dairies', 'en:cheeses', 'en:cheddar'] },
  { code: '2', path: ['en:beverages', 'en:juices', 'en:orange-juices'] },
  { code: '3', path: ['en:snacks', 'en:salty-snacks', 'en:chips'] },
];

function writeBaseline(name: string, over: Partial<Record<'A1' | 'A2' | 'A3' | 'A4' | 'A6' | 'A7', number>> = {}, sha = tax.sha256): string {
  const p = join(dir, name);
  writeFileSync(
    p,
    JSON.stringify({
      recorded: '2026-10-08',
      taxonomy: { sha256: sha, fetchedAt: '2026-10-08', source: 'fixture' },
      counts: { A1: 0, A2: 0, A3: 0, A4: 0, A6: 0, A7: 0, ...over },
    }),
  );
  return p;
}

/** A7 scanned over a one-file temp root, so the real source tree never moves these tests. */
function a7Root(name: string, source: string): { root: string; files: string[] } {
  const root = join(dir, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'x.ts'), source);
  return { root, files: ['x.ts'] };
}
const CLEAN_ROOT = a7Root('a7-clean', 'export const x = 1;\n');

function check(db: string, baseline: string, taxonomy = FIXTURE_TAXONOMY, a7 = CLEAN_ROOT) {
  return runCategoryCheck({ db, taxonomy, baseline, root: a7.root, a7Files: a7.files });
}

test('load check, good fixture: clean rows at a zero baseline pass, and all seven counts are printed', () => {
  const r = check(makeDb('good.db', GOOD_ROWS), writeBaseline('b-zero.json'));
  assert.equal(r.ok, true, r.failures.join('; '));
  assert.deepEqual(r.failures, []);
  for (const k of COUNT_KEYS) assert.ok(r.lines.some((l) => l.startsWith(`${k} `)), `${k} is printed`);
  assert.deepEqual(r.counts, { A1: 0, A2: 0, A3: 0, A4: 0, A5: 0, A6: 0, A7: 0 });
});

test('load check, bad fixtures: each fault pushed above a zero baseline fails and names its count', () => {
  const cases: { key: 'A1' | 'A2' | 'A3' | 'A4' | 'A6'; rows: Fx[] }[] = [
    { key: 'A1', rows: [{ code: '9', path: ['en:chips', 'en:cheddar'] }] },
    { key: 'A2', rows: [{ code: '9', path: ['en:cheeses', 'en:snacks', 'en:cheddar'] }] },
    { key: 'A3', rows: [{ code: '9', path: ['Juice'] }] },
    { key: 'A4', rows: [{ code: '9', path: ['en:cheddar', 'en:cheeses'] }] },
    { key: 'A6', rows: [{ code: '9', path: ['en:dairies', 'en:cheeses'], categorySource: null }] },
  ];
  for (const c of cases) {
    const r = check(makeDb(`bad-${c.key}.db`, [...GOOD_ROWS, ...c.rows]), writeBaseline(`b-${c.key}.json`));
    assert.equal(r.ok, false, `${c.key} must fail`);
    assert.ok(r.counts[c.key] >= 1, `${c.key} counted`);
    assert.ok(r.failures.some((f) => f.startsWith(`${c.key} is `)), `${c.key} named in: ${r.failures.join('; ')}`);
  }
});

test('A2 reports its split: proven not the parent versus cannot be checked because the last tag is not in the taxonomy', () => {
  const rows: Fx[] = [
    ...GOOD_ROWS,
    { code: '9', path: ['en:cheeses', 'en:snacks', 'en:cheddar'] }, // last tag known, parent not its ancestor: proven
    { code: '8', path: ['en:cheeses', 'Some raw label'] }, // last tag unknown: cannot be checked
    { code: '7', path: ['Another raw', 'Raw leaf'] },
  ];
  const r = check(makeDb('a2split.db', rows), writeBaseline('b-a2s.json', { A2: 3, A3: 2, A1: 1 }));
  assert.deepEqual(r.a2, { proven: 1, unchecked: 2 });
  assert.equal(r.counts.A2, 3);
  assert.ok(r.lines.some((l) => /A2 split: 1 proven not the parent; 2 cannot be checked/.test(l)), r.lines.join('|'));
  assert.ok(r.lines.some((l) => l.startsWith('A2 ') && l.includes('not a confirmed ancestor')));
});

test('load check: a count AT its baseline passes, one above fails (the ratchet)', () => {
  const db = makeDb('ratchet.db', [...GOOD_ROWS, { code: '9', path: ['en:chips', 'en:cheddar'] }]);
  assert.equal(check(db, writeBaseline('b-a1-1.json', { A1: 1, A2: 1 })).ok, true);
  assert.equal(check(db, writeBaseline('b-a1-0.json', { A1: 0, A2: 1 })).ok, false);
});

test('load check only counts Canadian rows, and A1 to A4 only openfoodfacts rows', () => {
  const rows: Fx[] = [
    ...GOOD_ROWS,
    { code: '8', canada: 0, path: ['en:chips', 'en:cheddar'] },
    { code: '7', source: 'icecat', path: ['Laptops', 'Computers'], categorySource: 'declared' },
  ];
  const r = check(makeDb('scope.db', rows), writeBaseline('b-scope.json'));
  assert.equal(r.ok, true, r.failures.join('; '));
});

test('A5: a missing taxonomy fails and says A1 to A4 were NOT CHECKED, never zero', () => {
  const r = check(makeDb('a5-missing.db', GOOD_ROWS), writeBaseline('b-a5.json'), join(dir, 'gone.json'));
  assert.equal(r.ok, false);
  assert.equal(r.counts.A5, 1);
  assert.ok(r.failures.some((f) => f.startsWith('A5 ')));
  assert.ok(r.failures.some((f) => f.includes('NOT CHECKED')));
  assert.ok(r.lines.some((l) => l.startsWith('A1 ') && l.includes('NOT CHECKED')));
});

test('A5: a taxonomy whose hash is not the baseline\'s fails; the matching one passes', () => {
  const db = makeDb('a5-changed.db', GOOD_ROWS);
  const changed = join(dir, 'changed-taxonomy.json');
  const obj = JSON.parse(readFileSync(FIXTURE_TAXONOMY, 'utf8')) as Record<string, unknown>;
  obj['en:new-entry'] = { parents: [] };
  writeFileSync(changed, JSON.stringify(obj));
  const r = check(db, writeBaseline('b-a5b.json'), changed);
  assert.equal(r.ok, false);
  assert.equal(r.counts.A5, 1);
  assert.ok(r.failures.some((f) => f.includes('taxonomy changed')));
  assert.equal(check(db, writeBaseline('b-a5c.json')).ok, true);
});

test('a missing or malformed baseline, or a missing database, fails rather than passing on nothing', () => {
  const db = makeDb('nobase.db', GOOD_ROWS);
  assert.equal(check(db, join(dir, 'no-baseline.json')).ok, false);
  const bad = join(dir, 'b-bad.json');
  writeFileSync(bad, '{"counts":{"A1":"many"}}');
  assert.equal(check(db, bad).ok, false);
  const r = check(join(dir, 'no-such.db'), writeBaseline('b-nodb.json'));
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.startsWith('database unusable')));
});

test('a category_path that is not a JSON array of strings is a failure, not a skipped row', () => {
  const r = check(makeDb('unparsable.db', [...GOOD_ROWS, { code: '9', path: '{broken' }]), writeBaseline('b-unp.json'));
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.includes('not a JSON array')));
});

test('the check opens the database read only: the file is byte-identical afterwards', () => {
  const db = makeDb('readonly.db', GOOD_ROWS);
  const before = createHash('sha256').update(readFileSync(db)).digest('hex');
  check(db, writeBaseline('b-ro.json'));
  assert.equal(createHash('sha256').update(readFileSync(db)).digest('hex'), before);
});

/* ------------------------------------------------------------------ A7 */

test('A7: a catch that swallows is found with its line; one that rethrows or logs is not', () => {
  const bad = ['function f() {', '  try { g(); } catch {', '    return null;', '  }', '}', ''].join('\n');
  const found = findSwallows('x.ts', bad);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.line, 2);
  const good = [
    'try { g(); } catch (err) { throw err; }',
    'try { g(); } catch (err) { console.error("[category-fault]", err); }',
    'try { g(); } catch (err) { logError({ where: "x", err }); }',
    'try { g(); } catch { // a comment only\n }',
  ].join('\n');
  const f2 = findSwallows('x.ts', good);
  assert.equal(f2.length, 1, 'only the comment-only catch swallows');
  assert.equal(f2[0]!.line, 4);
});

test('A7: a python except that passes is found; one that raises or prints is not', () => {
  const bad = 'def f():\n    try:\n        g()\n    except ValueError:\n        return None\n';
  assert.equal(findSwallows('x.py', bad).length, 1);
  const good = 'try:\n    g()\nexcept ValueError:\n    raise\ntry:\n    g()\nexcept ValueError:\n    print("bad")\n';
  assert.equal(findSwallows('x.py', good).length, 0);
});

test('A7 as a ratchet: a new swallowing catch in the scanned code fails the load check', () => {
  const swallowing = a7Root('a7-bad', 'try { a(); } catch { /* nothing */ }\n');
  const db = makeDb('a7.db', GOOD_ROWS);
  const r = check(db, writeBaseline('b-a7.json'), FIXTURE_TAXONOMY, swallowing);
  assert.equal(r.counts.A7, 1);
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.startsWith('A7 is 1')));
  assert.equal(check(db, writeBaseline('b-a7ok.json', { A7: 1 }), FIXTURE_TAXONOMY, swallowing).ok, true);
});

test('A7: a scanned file that cannot be read is a failure, not a zero', () => {
  const r = runCategoryCheck({
    db: makeDb('a7-unreadable.db', GOOD_ROWS),
    taxonomy: FIXTURE_TAXONOMY,
    baseline: writeBaseline('b-a7u.json'),
    root: dir,
    a7Files: ['does-not-exist.ts'],
  });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.startsWith('A7 could not read')));
});

/* ------------------------------------------------------------------ CLI */

test('CLI: exit 0 at baseline, non-zero above it, with the seven counts printed either way', () => {
  const okDb = makeDb('cli-ok.db', GOOD_ROWS);
  const badDb = makeDb('cli-bad.db', [...GOOD_ROWS, { code: '9', path: ['en:chips', 'en:cheddar'] }]);
  // The CLI scans the real source tree for A7, so the baseline's A7 is the shipped one.
  const shipped = JSON.parse(readFileSync(SHIPPED_BASELINE, 'utf8')) as { counts: { A7: number } };
  const base = writeBaseline('b-cli.json', { A7: shipped.counts.A7 });
  const run = (db: string) => spawnSync(process.execPath, [CHECK_SCRIPT, '--db', db, '--taxonomy', FIXTURE_TAXONOMY, '--baseline', base], { encoding: 'utf8' });
  const ok = run(okDb);
  assert.equal(ok.status, 0, ok.stderr);
  const bad = run(badDb);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /A1 is 1, above its baseline 0/);
  for (const out of [ok.stdout, bad.stdout]) for (const k of COUNT_KEYS) assert.match(out, new RegExp(`^${k} `, 'm'));
  // A missing database is non-zero too.
  const missing = spawnSync(process.execPath, [CHECK_SCRIPT, '--db', join(dir, 'x.db'), '--taxonomy', FIXTURE_TAXONOMY, '--baseline', base], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
});

test('CLI: every run leaves category-check-last.json beside the db with exit status, counts, baseline and time', () => {
  const shipped = JSON.parse(readFileSync(SHIPPED_BASELINE, 'utf8')) as { counts: { A7: number } };
  const base = writeBaseline('b-last.json', { A7: shipped.counts.A7 });
  const run = (db: string) => spawnSync(process.execPath, [CHECK_SCRIPT, '--db', db, '--taxonomy', FIXTURE_TAXONOMY, '--baseline', base], { encoding: 'utf8' });
  const read = (folder: string) => JSON.parse(readFileSync(join(folder, 'category-check-last.json'), 'utf8')) as {
    at: string; exit: number; counts: Record<string, number> | null; baseline: Record<string, number> | null; failures: string[];
  };
  // Good run: exit 0 on record.
  const okDir = join(dir, 'last-ok');
  mkdirSync(okDir);
  const okDb = join(okDir, 'c.db');
  writeFileSync(okDb, readFileSync(makeDb('last-ok-src.db', GOOD_ROWS)));
  assert.equal(run(okDb).status, 0);
  const ok = read(okDir);
  assert.equal(ok.exit, 0);
  assert.deepEqual(ok.failures, []);
  assert.equal(ok.counts!.A1, 0);
  assert.equal(ok.baseline!.A7, shipped.counts.A7);
  assert.ok(Math.abs(Date.parse(ok.at) - Date.now()) < 120_000, 'the time is now');
  // Bad run: the file records the failure and the count above baseline.
  const badDir = join(dir, 'last-bad');
  mkdirSync(badDir);
  const badDb = join(badDir, 'c.db');
  writeFileSync(badDb, readFileSync(makeDb('last-bad-src.db', [...GOOD_ROWS, { code: '9', path: ['en:chips', 'en:cheddar'] }])));
  assert.notEqual(run(badDb).status, 0);
  const bad = read(badDir);
  assert.equal(bad.exit, 1);
  assert.equal(bad.counts!.A1, 1);
  assert.ok(bad.failures.some((f) => f.startsWith('A1 is 1')));
  // A missing database is on record too (exit 2), when its folder exists.
  const goneDir = join(dir, 'last-gone');
  mkdirSync(goneDir);
  assert.equal(run(join(goneDir, 'none.db')).status, 2);
  assert.equal(read(goneDir).exit, 2);
});

/* ------------------------------------------------- the shipped baseline */

test('the shipped baseline holds the spec counts and the fetched taxonomy hash', () => {
  const b = JSON.parse(readFileSync(SHIPPED_BASELINE, 'utf8')) as {
    taxonomy: { sha256: string; fetchedAt: string };
    counts: Record<string, number>;
  };
  assert.deepEqual({ A1: b.counts.A1, A2: b.counts.A2, A3: b.counts.A3, A4: b.counts.A4, A6: b.counts.A6 }, { A1: 6003, A2: 8273, A3: 12469, A4: 74, A6: 387904 });
  assert.match(b.taxonomy.sha256, /^[0-9a-f]{64}$/);
  assert.match(b.taxonomy.fetchedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof b.counts.A7, 'number');
});

test('the fetch script takes a local path, validates it before installing, and refuses a bad file', () => {
  const out = join(dir, 'fetched', 'off-categories.json');
  const script = fileURLToPath(new URL('../src/fetch-categories.ts', import.meta.url));
  const good = execFileSync(process.execPath, [script, FIXTURE_TAXONOMY, out], { encoding: 'utf8' });
  assert.match(good, new RegExp(tax.sha256));
  assert.equal(createHash('sha256').update(readFileSync(out)).digest('hex'), tax.sha256);
  const badSrc = join(dir, 'not-taxonomy.json');
  writeFileSync(badSrc, '[]');
  const out2 = join(dir, 'fetched2', 'x.json');
  const r = spawnSync(process.execPath, [script, badSrc, out2], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.throws(() => readFileSync(out2), 'nothing was installed from the bad file');
});
