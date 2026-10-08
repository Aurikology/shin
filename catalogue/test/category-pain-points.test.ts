/**
 * Part B of docs/category-safeguards-2026-10-08.md: the pain-point tests, written
 * BEFORE any fix, for the catalogue half (B1, B2 ring, B3, B7, B8).
 *
 * HOW THIS FILE WORKS.
 *   - Each pain point is a `node:test` test marked `todo`, so every normal run
 *     lists it as open without failing the build. The fix's commit removes the
 *     `todo`. Set PAINPOINTS_STRICT=1 to run them as ordinary tests and watch
 *     them go red (that is how "red today for the stated reason" was checked).
 *   - Each pain point has a pass PREDICATE and two CONTROL tests that are NOT
 *     todo: a known-good case the predicate must pass and a known-bad case it
 *     must fail. A predicate that has never gone red is not a test
 *     (RULINGS.md, "Everything is an assumption until tested").
 *   - Where the code under test is not built yet, the test fixes the interface
 *     the build must meet (named in the test) and imports it dynamically INSIDE
 *     the test, so a missing module fails that one test, not the file.
 *
 * Numbers 95%, 10% and half are Claude's proposals (2026-10-07 chat), changeable on his word.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadTaxonomy, deepestTags } from '../src/category-taxonomy.ts';
import type { Taxonomy } from '../src/category-taxonomy.ts';
import { chooseRingTag, type RingProbes } from '../src/search.ts';
import { rebuildCategories, openCatalogue } from '../src/schema.ts';
import { rebuildCategoriesFromPaths } from './helpers/path-taxonomy.ts';
import { alternativesFor } from '../src/alternatives.ts';
import type { Candidate } from '../src/search.ts';

/** Import a module that may not exist yet. A variable specifier keeps the typechecker from demanding it. */
const later = (path: string): Promise<unknown> => import(path);

const STRICT = process.env.PAINPOINTS_STRICT === '1';
/** `todo` text while the fix is unbuilt; false under PAINPOINTS_STRICT=1. */
const open = (reason: string): string | false => (STRICT ? false : reason);

const FIXTURE = fileURLToPath(new URL('./fixtures/taxonomy-small.json', import.meta.url));
const tax = loadTaxonomy(FIXTURE);
interface FixtureEntry {
  name?: Record<string, string>;
  synonyms?: Record<string, string[]>;
}
const FIXTURE_ENTRIES = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, FixtureEntry>;

/* ------------------------------------------------------------------- B1 */

/*
 * B1. Two-branch products picked silently.
 *
 * Interface the fix must meet: catalogue/src/category-pick.ts exports
 *   pickLeaf(tags: readonly string[], tax: Taxonomy, pricedCount: (tag: string) => number)
 *     => { leaf: string; rejected: string[] }
 * The written rule: among the product's deepest tags, the branch with more
 * priced products wins; every other deepest tag is returned in `rejected` so the
 * load can record it. Today (prepare_rows.py:276, prepare_rows_jsonl.py:133) the
 * last tag is taken and nothing is recorded.
 */
type Pick = (tags: readonly string[], t: Taxonomy, pricedCount: (tag: string) => number) => { leaf: string; rejected: string[] };

const B1_PRICED: Record<string, number> = { 'en:cheddar': 40, 'en:chips': 10 };
const b1Count = (tag: string) => B1_PRICED[tag] ?? 0;
const B1_PRODUCTS: string[][] = [
  ['en:dairies', 'en:cheeses', 'en:cheddar', 'en:snacks', 'en:salty-snacks', 'en:chips'], // last tag is the lighter branch
  ['en:snacks', 'en:salty-snacks', 'en:chips', 'en:dairies', 'en:cheeses', 'en:cheddar'], // last tag is the heavier branch
];

/** The written rule, as the test's own reference. */
const referencePick: Pick = (tags, t, count) => {
  const deep = deepestTags(tags, t);
  const sorted = [...deep].sort((a, b) => count(b) - count(a));
  return { leaf: sorted[0]!, rejected: sorted.slice(1) };
};
/** Today's behaviour: the last tag, nothing recorded. */
const lastTagPick: Pick = (tags) => ({ leaf: tags[tags.length - 1]!, rejected: [] });

function b1Holds(pick: Pick): boolean {
  return B1_PRODUCTS.every((tags) => {
    const got = pick(tags, tax, b1Count);
    const want = referencePick(tags, tax, b1Count);
    return got.leaf === want.leaf && [...got.rejected].sort().join() === [...want.rejected].sort().join();
  });
}

test('B1 control: the written rule passes the predicate', () => {
  assert.equal(b1Holds(referencePick), true);
});
test('B1 control: taking the last tag and recording nothing fails the predicate', () => {
  assert.equal(b1Holds(lastTagPick), false);
  // And the fixture is a real two-branch case: the lighter branch is last on the first product.
  assert.equal(deepestTags(B1_PRODUCTS[0]!, tax).length, 2);
});
test('B1: every two-branch product has a leaf chosen by the written rule and the other recorded', async () => {
  const mod = (await later('../src/category-pick.ts')) as { pickLeaf: Pick };
  assert.equal(b1Holds(mod.pickLeaf), true);
});

/* ------------------------------------------------------------- B2, ring */

/*
 * B2 (ring half). Parent fallback reads a non-parent.
 *
 * Interface the fix must meet: chooseRingTag(path, probes, taxonomy?) takes the
 * taxonomy as a third argument and steps up to the taxonomy parent of the leaf,
 * not the tag in the second-last position. Today chooseRingTag takes the
 * second-last tag (search.ts, levels[1]).
 * The price ladder half of B2 is in price/test/category-pain-points.test.ts.
 */
type Ring = (path: readonly string[], probes: RingProbes, t: Taxonomy) => { tag: string; level: string } | null;

const realRing: Ring = (path, probes, t) => (chooseRingTag as unknown as (p: readonly string[], pr: RingProbes, t: Taxonomy) => ReturnType<typeof chooseRingTag>)(path, probes, t);
/** The leaf has no neighbour, so the walk must step to the parent; every other tag is a fine ring. */
const probes: RingProbes = { size: () => 10, hasNeighbour: (tag) => tag !== 'en:cheddar' };

/** A reference that reads the taxonomy: the nearest tag in the path that is an ancestor of the leaf. */
const taxonomyRing: Ring = (path, pr, t) => {
  const leaf = path[path.length - 1]!;
  if (pr.hasNeighbour(leaf)) return { tag: leaf, level: 'leaf' };
  const parent = [...path].reverse().find((x) => t.isAncestor(x, leaf));
  return parent && pr.hasNeighbour(parent) ? { tag: parent, level: 'parent' } : null;
};
/** Today's rule: the tag in the second-last position. */
const positionRing: Ring = (path, pr) => {
  const p = path[path.length - 2];
  return p && pr.hasNeighbour(p) ? { tag: p, level: 'parent' } : null;
};

const BAD_PATH = ['en:cheeses', 'en:snacks', 'en:cheddar']; // second-last is en:snacks, not a parent of cheddar
const GOOD_PATH = ['en:dairies', 'en:cheeses', 'en:cheddar']; // second-last IS the taxonomy parent

function b2RingHolds(ring: Ring, path: readonly string[]): boolean {
  const got = ring(path, probes, tax);
  return got !== null && tax.isAncestor(got.tag, path[path.length - 1]!);
}

test('B2 ring control: a ring that reads the taxonomy passes on the two-parent fixture', () => {
  assert.equal(b2RingHolds(taxonomyRing, BAD_PATH), true);
  assert.equal(b2RingHolds(taxonomyRing, GOOD_PATH), true);
});
test('B2 ring control: the position rule fails the predicate where the second-last tag is not the parent, and passes where it is', () => {
  assert.equal(b2RingHolds(positionRing, BAD_PATH), false);
  assert.equal(b2RingHolds(positionRing, GOOD_PATH), true, 'the good path is why nobody noticed');
});
test('B2: the parent ring is the taxonomy parent of the leaf, on a path whose second-last tag is not', () => {
  assert.equal(b2RingHolds(realRing, GOOD_PATH), true, 'control inside the test: the real function passes the good path');
  assert.equal(b2RingHolds(realRing, BAD_PATH), true);
});

/* ------------------------------------------------------------------- B3 */

/*
 * B3. One idea under two names.
 *
 * Interface the fix must meet: rebuildCategories(db, { taxonomy }) writes
 * product_category with every label resolved to its taxonomy entry, so "Juice",
 * "Jus" and "Juices" land in one group (en:juices) and fr:jus-d-orange lands
 * with en:orange-juices; a label that resolves to no entry is not written as a
 * group at all. Today rebuildCategories lower-cases the label and nothing else.
 */
type Rebuild = (db: DatabaseSync, t: Taxonomy) => void;

/*
 * Only Open Food Facts rows carry food-taxonomy labels. Every other source (icecat, returnit,
 * consignaction, usda, metro ...) has its own labels, and its rows must keep the group their own
 * lower-cased label gives them, or their substitutes break. The fixture therefore has an icecat
 * row and a returnit row whose labels are in no food taxonomy and must still be written.
 */
function b3Db(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, source TEXT NOT NULL, category_path TEXT NOT NULL DEFAULT '[]')`);
  db.exec(`CREATE TABLE product_category (rowid_ref INTEGER NOT NULL, tag TEXT NOT NULL, depth INTEGER NOT NULL, PRIMARY KEY (rowid_ref, tag)) STRICT, WITHOUT ROWID`);
  const ins = db.prepare('INSERT INTO product (code, source, category_path) VALUES (?, ?, ?)');
  ins.run('juice', 'openfoodfacts', JSON.stringify(['Juice']));
  ins.run('jus', 'openfoodfacts', JSON.stringify(['Jus']));
  ins.run('canon', 'openfoodfacts', JSON.stringify(['en:beverages', 'en:juices']));
  ins.run('oj-en', 'openfoodfacts', JSON.stringify(['en:orange-juices']));
  ins.run('oj-fr', 'openfoodfacts', JSON.stringify(['fr:jus-d-orange']));
  ins.run('ice', 'icecat', JSON.stringify(['Computers', 'Laptops & Notebooks']));
  ins.run('ret', 'returnit', JSON.stringify(['Bottle Deposit 10c']));
  return db;
}

function tagsOf(db: DatabaseSync, code: string): string[] {
  return (db.prepare(`SELECT pc.tag FROM product_category pc JOIN product p ON p.rowid = pc.rowid_ref WHERE p.code = ? ORDER BY pc.tag`).all(code) as { tag: string }[]).map((r) => r.tag);
}

function b3Holds(rebuild: Rebuild): boolean {
  const db = b3Db();
  rebuild(db, tax);
  const juice = tagsOf(db, 'juice');
  const jus = tagsOf(db, 'jus');
  const canon = tagsOf(db, 'canon');
  const ojEn = tagsOf(db, 'oj-en');
  const ojFr = tagsOf(db, 'oj-fr');
  const sameGroup = juice.length > 0 && juice.join() === jus.join() && juice.includes('en:juices') && canon.includes('en:juices');
  const pairGroup = ojEn.length > 0 && ojEn.join() === ojFr.join();
  const offTags = db.prepare(`SELECT DISTINCT pc.tag FROM product_category pc JOIN product p ON p.rowid = pc.rowid_ref WHERE p.source = 'openfoodfacts'`).all() as { tag: string }[];
  const allKnown = offTags.every((r) => tax.has(r.tag));
  // Other sources keep their own labels as groups.
  const otherSources = tagsOf(db, 'ice').join() === ['computers', 'laptops & notebooks'].join() && tagsOf(db, 'ret').join() === 'bottle deposit 10c';
  return sameGroup && pairGroup && allKnown && otherSources;
}

/** Resolve a label to its entry by key, name or synonym, in any language (the reference, from the fixture file itself). */
function referenceResolver(): (label: string) => string | null {
  const byName = new Map<string, string>();
  for (const [key, e] of Object.entries(FIXTURE_ENTRIES)) {
    byName.set(key.toLowerCase(), key);
    for (const n of Object.values(e.name ?? {})) byName.set(n.toLowerCase(), key);
    for (const list of Object.values(e.synonyms ?? {})) for (const s of list) byName.set(s.toLowerCase(), key);
  }
  return (label) => {
    const entry = byName.get(label.toLowerCase());
    if (!entry) return null;
    // fr:jus-d-orange is a duplicate of the en entry that carries the same French name.
    return entry === 'fr:jus-d-orange' ? 'en:orange-juices' : entry;
  };
}

/** A rebuild with a rule per source: `resolveSources` decides which sources go through the resolver. */
function ruleRebuild(resolveSource: (source: string) => boolean): Rebuild {
  return (db) => {
    const resolve = referenceResolver();
    db.exec('DELETE FROM product_category');
    const ins = db.prepare('INSERT OR IGNORE INTO product_category (rowid_ref, tag, depth) VALUES (?,?,?)');
    for (const r of db.prepare('SELECT rowid, source, category_path FROM product').all() as { rowid: number; source: string; category_path: string }[]) {
      (JSON.parse(r.category_path) as string[]).forEach((label, depth) => {
        const tag = resolveSource(r.source) ? resolve(label) : label.toLowerCase();
        if (tag !== null) ins.run(BigInt(r.rowid), tag, depth);
      });
    }
  };
}
/** The right rule: Open Food Facts labels are resolved, every other source keeps its own lower-cased label. */
const resolvingRebuild: Rebuild = ruleRebuild((s) => s === 'openfoodfacts');
/** The first draft's bug: resolve EVERY row against the food taxonomy, which deletes the other sources' groups. */
const resolveEverythingRebuild: Rebuild = ruleRebuild(() => true);
/** Before the fix: lower-case the label and nothing else. */
const lowercaseRebuild: Rebuild = ruleRebuild(() => false);
const realRebuild: Rebuild = (db, t) => (rebuildCategories as unknown as (d: DatabaseSync, o: { taxonomy: Taxonomy; log: () => void }) => void)(db, { taxonomy: t, log: () => {} });

test('B3 control: a rebuild that resolves Open Food Facts labels and keeps other sources\' own labels passes the predicate', () => {
  assert.equal(b3Holds(resolvingRebuild), true);
});
test('B3 control: a rebuild that only lower-cases fails it (Juice and Jus stay two groups, raw labels stay)', () => {
  assert.equal(b3Holds(lowercaseRebuild), false);
  const db = b3Db();
  lowercaseRebuild(db, tax);
  assert.deepEqual(tagsOf(db, 'juice'), ['juice']);
  assert.deepEqual(tagsOf(db, 'jus'), ['jus']);
});
test('B3 control: a rebuild that resolves EVERY row fails it, because the icecat and returnit rows lose their groups', () => {
  assert.equal(b3Holds(resolveEverythingRebuild), false);
  const db = b3Db();
  resolveEverythingRebuild(db, tax);
  assert.deepEqual(tagsOf(db, 'ice'), [], 'the icecat row was left in no group');
  assert.deepEqual(tagsOf(db, 'ret'), [], 'the returnit row was left in no group');
  // And the OFF half alone is fine, so the new assertion is the only thing that catches it.
  assert.deepEqual(tagsOf(db, 'juice'), tagsOf(db, 'jus'));
});
test('B3: "Juice" and "Jus" and an en:/fr: pair land in one group each, no OFF product sits on a label outside the taxonomy, and other sources keep their own labels', () => {
  assert.equal(b3Holds(realRebuild), true);
});

/* ------------------------------------------------------------------- B7 */

/*
 * B7. Substitutes read the price groups.
 *
 * Interface the fix must meet: price/src/price-tree.ts exports
 *   buildPriceTree(items, prices) => { groupOf(code): string, pathsOf(code): string[][],
 *     storeAdjustment(chainA, chainB): number | null, judge(code, shelfCents, chain?): string }
 * (see B4/B5 in price/test/category-pain-points.test.ts). This test cannot go red
 * on substitutes until that tree exists; until then it is red because the tree
 * is not built, and its broken-stub control (substitutes drawn from the price
 * group) must fail the predicate. After the tree exists, the real alternativesFor
 * must still offer the cheaper store brand for the name brand.
 */
const PB = ['en:spreads', 'en:nut-butters', 'en:peanut-butters'];

function candidate(code: string, name: string): Candidate {
  return {
    code, name, nameEn: null, nameFr: null, brands: null, quantity: null, sizeValue: 500, sizeUnit: 'g',
    leafCategory: 'en:peanut-butters', categoryPath: PB, allergens: [], soldInCanada: true, source: 'openfoodfacts',
    genericName: null, nutriscoreGrade: null, novaGroup: null, additivesN: null, ingredientsText: null,
    signals: { textRank: null, vectorRank: null, bm25: null, similarity: null, rrf: 0, brandAgrees: null, sizeAgrees: null },
  };
}

function b7Db(): DatabaseSync {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`INSERT INTO product (code, name, name_en, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const [code, name] of [['NAME', 'Kraft Smooth 500 g'], ['STORE', 'Store Brand Smooth 500 g']] as const) {
    insert.run(code, name, name, 500, 'g', JSON.stringify(PB), 'en:peanut-butters', '[]', 1, 'openfoodfacts');
  }
  rebuildCategoriesFromPaths(db);
  return db;
}

const b7Lookup = async (codes: readonly string[]) => {
  const prices: Record<string, number> = { NAME: 800, STORE: 500 };
  const out = new Map<string, import('../src/alternatives.ts').PricedProduct>();
  for (const c of codes) {
    if (prices[c] === undefined) continue;
    out.set(c, { code: c, amountCents: prices[c]!, seller: 'walmart.ca', observedAt: '2026-09-04', storeName: null, storeCity: null, joinMethod: 'name' });
  }
  return out;
};

/** A tree that splits store brand from name brand, the way the price tree should. */
const splitTree = { groupOf: (code: string) => (code === 'STORE' ? 'store-brand' : 'name-brand') };

type Substitutes = (code: string) => Promise<string[]>;
const categorySubstitutes: Substitutes = async (code) => {
  const db = b7Db();
  const alts = await alternativesFor(db, candidate(code, 'Kraft Smooth 500 g'), 800, b7Lookup);
  return alts.map((a) => a.product.code);
};
/** The broken design: substitutes read the price groups, so the other group is invisible. */
const priceGroupSubstitutes: Substitutes = async (code) => ['NAME', 'STORE'].filter((c) => c !== code && splitTree.groupOf(c) === splitTree.groupOf(code));

async function b7Holds(subs: Substitutes): Promise<boolean> {
  return (await subs('NAME')).includes('STORE');
}

test('B7 control: substitutes drawn from the category still offer the cheaper store brand', async () => {
  assert.equal(await b7Holds(categorySubstitutes), true);
});
test('B7 control: the broken stub, substitutes read from the price groups, fails the predicate', async () => {
  assert.equal(splitTree.groupOf('NAME') === splitTree.groupOf('STORE'), false, 'the tree splits them');
  assert.equal(await b7Holds(priceGroupSubstitutes), false);
});
test('B7: with a price tree that splits store brand from name brand, substitutes for the name brand still offer the store brand', { todo: open('B7 cannot go red on substitutes until the price tree exists (price/src/price-tree.ts is not built)') }, async () => {
  const priceTree = (await later('../../price/src/price-tree.ts')) as { buildPriceTree: (items: unknown[], prices: unknown[]) => { groupOf(code: string): string } };
  const tree = priceTree.buildPriceTree(
    [
      { code: 'NAME', name: 'Kraft Smooth 500 g', brand: 'Kraft', storeBrand: false, categoryPath: PB },
      { code: 'STORE', name: 'Store Brand Smooth 500 g', brand: 'No Name', storeBrand: true, categoryPath: PB },
    ],
    [
      { code: 'NAME', chain: 'a', cents: 800 },
      { code: 'STORE', chain: 'a', cents: 500 },
    ],
  );
  assert.notEqual(tree.groupOf('NAME'), tree.groupOf('STORE'), 'precondition: the tree splits store brand from name brand');
  assert.equal(await b7Holds(categorySubstitutes), true);
});

/* ------------------------------------------------------------------- B8 */

/*
 * B8. Placement scored only for correctness.
 *
 * Interface the fix must meet: catalogue/src/placement-score.ts exports
 *   scorePlacement(items: { truth: string; placed: string }[], tax: Taxonomy)
 *     => { n: number; exact: number; atOrAboveParent: number }
 * where `atOrAboveParent` is the share of items placed at the parent of their
 * true category or at any ancestor of that parent (a placer that stops short).
 * The gate is atOrAboveParent <= 0.10. Today no depth score exists.
 */
type Scorer = (items: { truth: string; placed: string }[], t: Taxonomy) => Record<string, unknown>;

const TRUTHS = ['en:cheddar', 'en:chips', 'en:orange-juices', 'en:cheddar', 'en:chips', 'en:orange-juices', 'en:cheddar', 'en:chips', 'en:orange-juices', 'en:cheddar'];
const exactPlacer = TRUTHS.map((truth) => ({ truth, placed: truth }));
const oneShortPlacer = TRUTHS.map((truth) => ({ truth, placed: tax.parentsOf(truth)[0]! }));

const referenceScorer: Scorer = (items, t) => {
  const exact = items.filter((i) => i.placed === i.truth).length / items.length;
  const short = items.filter((i) => i.placed !== i.truth && t.parentsOf(i.truth).some((p) => p === i.placed || t.isAncestor(i.placed, p))).length / items.length;
  return { n: items.length, exact, atOrAboveParent: short };
};
const correctnessOnlyScorer: Scorer = (items) => ({ n: items.length, exact: items.filter((i) => i.placed === i.truth).length / items.length });

function b8Holds(score: Scorer): boolean {
  const good = score(exactPlacer, tax).atOrAboveParent;
  const bad = score(oneShortPlacer, tax).atOrAboveParent;
  return typeof good === 'number' && typeof bad === 'number' && good <= 0.1 && bad > 0.1;
}

test('B8 control: a scorer that reports depth passes the predicate (exact placer within 10%, one-level-short placer over it)', () => {
  assert.equal(b8Holds(referenceScorer), true);
  assert.equal(referenceScorer(oneShortPlacer, tax).atOrAboveParent, 1);
});
test('B8 control: a correctness-only scorer fails it (no depth to gate on)', () => {
  assert.equal(b8Holds(correctnessOnlyScorer), false);
  // It scores the short placer as plain wrong, which is all it can say.
  assert.equal(correctnessOnlyScorer(oneShortPlacer, tax).exact, 0);
});
test('B8: the scorer reports depth, and a placer that always stops one level short fails the gate', async () => {
  const mod = (await later('../src/placement-score.ts')) as { scorePlacement: Scorer };
  assert.equal(b8Holds(mod.scorePlacement), true);
});
