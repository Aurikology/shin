/**
 * The canonical-category build (docs/category-safeguards-2026-10-08.md; B1, B2, B3):
 * fetch-categories (txt synonyms), resolveLabel and the alias file, pickLeaf and canonicalChain,
 * rebuildCategories, category-canonicalize (with --undo), the A1 record, placement scoring.
 *
 * Every database and file here lives in a temp folder made by this file and removed after.
 * Nothing touches catalogue/data.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  loadAliases,
  loadRingTaxonomy,
  loadTaxonomy,
  logTaxonomyUnavailableOnce,
  normalizeName,
  resetTaxonomyUnavailableLog,
  taxonomyFromObject,
  TaxonomyError,
} from '../src/category-taxonomy.ts';
import { installTaxonomy, mergeSynonyms, parseCategoriesTxt, splitTerms } from '../src/fetch-categories.ts';
import { canonicalChain, pickLeaf } from '../src/category-pick.ts';
import { chooseRingTag } from '../src/search.ts';
import { openCatalogue, rebuildCategories } from '../src/schema.ts';
import { canonicalizeCatalogue, undoCanonicalize } from '../src/category-canonicalize.ts';
import { runCategoryCheck } from '../src/category-check.ts';
import { scorePlacement } from '../src/placement-score.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-category-canonicalize-'));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.error(`could not remove ${dir}: ${String(err)}`);
  }
});

const FIXTURE_JSON = fileURLToPath(new URL('./fixtures/taxonomy-small.json', import.meta.url));
const FIXTURE_TXT = fileURLToPath(new URL('./fixtures/categories-small.txt', import.meta.url));
const SHIPPED_ALIASES = fileURLToPath(new URL('../category-aliases.json', import.meta.url));
const CANONICALIZE = fileURLToPath(new URL('../src/category-canonicalize.ts', import.meta.url));
const FETCH = fileURLToPath(new URL('../src/fetch-categories.ts', import.meta.url));
const tax = loadTaxonomy(FIXTURE_JSON);
const quiet = (): void => {};

/** The fixture JSON with every synonym removed: the shape of the real categories.json. */
function bareJson(): Record<string, Record<string, unknown>> {
  const obj = JSON.parse(readFileSync(FIXTURE_JSON, 'utf8')) as Record<string, Record<string, unknown>>;
  for (const e of Object.values(obj)) delete e.synonyms;
  return obj;
}

/* ------------------------------------------------------------ fetch: txt */

test('splitTerms: commas split, an escaped comma stays inside its term', () => {
  assert.deepEqual(splitTerms('Cheddar, Cheddar\\, aged, Sharp cheddar'), ['Cheddar', 'Cheddar, aged', 'Sharp cheddar']);
});

test('parseCategoriesTxt: blocks, parents, names and synonyms; comments, property lines and header blocks are skipped', () => {
  const blocks = parseCategoriesTxt(readFileSync(FIXTURE_TXT, 'utf8'));
  // The synonyms: header block and the comment-only block are not entries.
  assert.equal(blocks.length, 11);
  const cheddar = blocks.find((b) => b.key === 'en:cheddar')!;
  assert.deepEqual(cheddar.parents, ['en:cheeses']);
  assert.equal(cheddar.names.en, 'Cheddar');
  assert.deepEqual(cheddar.synonyms.en, ['Cheddar, aged', 'Sharp cheddar']);
  assert.deepEqual(cheddar.synonyms.fr, ['Cheddar vieilli']);
  const dairies = blocks.find((b) => b.key === 'en:dairies')!;
  assert.deepEqual(Object.keys(dairies.names).sort(), ['en', 'fr'], 'wikidata:en: and ciqual_food_code:en: are properties, not names');
  const cs = blocks.find((b) => b.key === 'en:cheese-snacks')!;
  assert.deepEqual(cs.parents, ['en:cheeses', 'en:snacks']);
});

test('mergeSynonyms: synonyms land on the matching entries and the match rate is reported', () => {
  const { merged, report } = mergeSynonyms(bareJson(), parseCategoriesTxt(readFileSync(FIXTURE_TXT, 'utf8')));
  assert.equal(report.matched, report.blocks);
  assert.equal(report.rate, 1);
  assert.deepEqual((merged['en:juices']!.synonyms as Record<string, string[]>).en, ['Juice']);
  assert.deepEqual((merged['en:cheddar']!.synonyms as Record<string, string[]>).en, ['Cheddar, aged', 'Sharp cheddar']);
  assert.equal(merged['en:beverages']!.synonyms, undefined, 'an entry with no extra terms gets no synonyms key');
});

test('mergeSynonyms: under 99% matching throws, and the message names the rate and the first unmatched', () => {
  const blocks = parseCategoriesTxt(readFileSync(FIXTURE_TXT, 'utf8'));
  const json = bareJson();
  delete json['en:chips'];
  delete json['en:snacks'];
  assert.throws(() => mergeSynonyms(json, blocks), /matched only 9 of 11.*en:snacks|en:chips/s);
});

test('mergeSynonyms: an empty parse is a fault, not a pass', () => {
  assert.throws(() => mergeSynonyms(bareJson(), []), /holds no entries/);
});

test('mergeSynonyms: an accent-keeping JSON key still matches (OFF keys protected names that way)', () => {
  const blocks = parseCategoriesTxt('< en: Beers\nde: Münchener Biere\n');
  const json = { 'de:münchener-biere': { parents: ['en:beers'] }, 'en:beers': { parents: [] } };
  const { report } = mergeSynonyms(json, blocks);
  assert.equal(report.matched, 1);
});

test('installTaxonomy: merges the txt, writes the merged file, and resolves a synonym through it', () => {
  const out = join(dir, 'installed', 'off-categories.json');
  const txt = readFileSync(FIXTURE_TXT, 'utf8');
  const r = installTaxonomy(Buffer.from(JSON.stringify(bareJson())), out, txt);
  assert.equal(r.report?.rate, 1);
  const installed = loadTaxonomy(out);
  assert.equal(installed.sha256, r.sha256);
  assert.equal(installed.resolveLabel('Sharp cheddar'), 'en:cheddar');
});

test('installTaxonomy: a bad txt writes nothing', () => {
  const out = join(dir, 'never', 'off-categories.json');
  assert.throws(() => installTaxonomy(Buffer.from(JSON.stringify(bareJson())), out, 'en: Unrelated thing\nfr: Autre chose\n'), /matched only 0 of 1/);
  assert.equal(existsSync(out), false);
});

test('the fetch script stops when no txt is named, and says how to proceed', () => {
  const out = join(dir, 'fetch-no-txt', 'x.json');
  const r = spawnSync(process.execPath, [FETCH, FIXTURE_JSON, out], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no categories\.txt named/);
  assert.equal(existsSync(out), false);
});

test('the fetch script with --txt prints the match rate and installs', () => {
  const out = join(dir, 'fetch-txt', 'x.json');
  const jsonIn = join(dir, 'bare.json');
  writeFileSync(jsonIn, JSON.stringify(bareJson()));
  const r = spawnSync(process.execPath, [FETCH, jsonIn, out, '--txt', FIXTURE_TXT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /11 of 11 txt blocks matched a JSON key \(100\.00%\)/);
  assert.equal(existsSync(out), true);
});

/* -------------------------------------------------------------- resolve */

test('normalizeName gives OFF tag form', () => {
  assert.equal(normalizeName("Jus d'orange"), 'jus-d-orange');
  assert.equal(normalizeName('  Boisson  gazeuse! '), 'boisson-gazeuse');
  assert.equal(normalizeName('Eau, eau gazéifiée'), 'eau-eau-gazeifiee');
  assert.equal(normalizeName('Straße'), 'strasse');
});

test('resolveLabel: exact key, then lang:slug by name or synonym, then en and fr for a bare label', () => {
  assert.equal(tax.resolveLabel('en:juices'), 'en:juices');
  assert.equal(tax.resolveLabel('EN:Juices'), 'en:juices', 'case is folded');
  assert.equal(tax.resolveLabel('en:Orange juice'), 'en:orange-juices', 'a synonym with a prefix');
  assert.equal(tax.resolveLabel('Juice'), 'en:juices', 'bare label, English synonym');
  assert.equal(tax.resolveLabel('Jus'), 'en:juices', 'bare label, English has none so French name');
  assert.equal(tax.resolveLabel('Produits laitiers'), 'en:dairies', 'bare French name');
  assert.equal(tax.resolveLabel('fr:Produits laitiers'), 'en:dairies', 'prefixed French name');
});

test('resolveLabel: a non-English orphan duplicate is redirected to the English entry that carries its name', () => {
  assert.equal(tax.resolveLabel('fr:jus-d-orange'), 'en:orange-juices');
  assert.equal(tax.resolveLabel("fr:Jus d'orange"), 'en:orange-juices');
});

test('resolveLabel: nothing matching gives null, never a guess', () => {
  assert.equal(tax.resolveLabel('Mystery label'), null);
  assert.equal(tax.resolveLabel(''), null);
  assert.equal(tax.resolveLabel('en:nonexistent'), null);
  assert.equal(tax.resolveLabel('de:Jus'), null, 'a German label does not match a French name');
});

test('resolveLabel: the alias file resolves what the taxonomy cannot, and only then', () => {
  const aliases = new Map([[normalizeName('Soft Drink'), 'en:juices'], [normalizeName('Juice'), 'en:cheeses']]);
  const t = taxonomyFromObject(JSON.parse(readFileSync(FIXTURE_JSON, 'utf8')), 'x', aliases);
  assert.equal(t.resolveLabel('soft drink'), 'en:juices');
  assert.equal(t.resolveLabel('Juice'), 'en:juices', 'a taxonomy match outranks an alias');
});

test('an alias that points at a key the taxonomy does not hold stops the load', () => {
  const aliasFile = join(dir, 'bad-aliases.json');
  writeFileSync(aliasFile, JSON.stringify({ aliases: { Pop: { to: 'en:no-such-entry' } } }));
  assert.throws(() => loadTaxonomy(FIXTURE_JSON, { aliasesPath: aliasFile }), (e: unknown) => e instanceof TaxonomyError && /no-such-entry/.test(e.message));
  assert.throws(() => loadTaxonomy(FIXTURE_JSON, { aliasesPath: join(dir, 'no-such-file.json') }), TaxonomyError);
});

test('the shipped alias file is well formed: a target, a product count and a reason on every entry', () => {
  const raw = JSON.parse(readFileSync(SHIPPED_ALIASES, 'utf8')) as { aliases: Record<string, { to: string; products: number; reason: string }>; unmapped: { label: string; products: number; reason: string }[] };
  const map = loadAliases(SHIPPED_ALIASES);
  assert.equal(map.size, Object.keys(raw.aliases).length, 'no two aliases normalise to one label');
  for (const [label, a] of Object.entries(raw.aliases)) {
    assert.match(a.to, /^[a-z]{2,3}:/, label);
    assert.equal(typeof a.products, 'number', label);
    assert.ok(a.reason.length > 10, label);
  }
  assert.ok(raw.unmapped.some((u) => u.label === 'Other'), 'Other is left unmapped on purpose');
  assert.equal(Object.keys(raw.aliases).includes('Other'), false);
  for (const u of raw.unmapped) assert.equal(map.has(normalizeName(u.label)), false, `${u.label} must stay unmapped`);
});

/* ----------------------------------------------------------- pick, chain */

test('pickLeaf: more priced products wins; ties go to catalogue members, then depth, then alphabetical', () => {
  const tags = ['en:dairies', 'en:cheeses', 'en:cheddar', 'en:snacks', 'en:salty-snacks', 'en:chips'];
  assert.deepEqual(pickLeaf(tags, tax, (t) => (t === 'en:chips' ? 5 : 0)), { leaf: 'en:chips', rejected: ['en:cheddar'] });
  assert.deepEqual(pickLeaf(tags, tax, () => 0, (t) => (t === 'en:cheddar' ? 9 : 1)), { leaf: 'en:cheddar', rejected: ['en:chips'] });
  // Equal everywhere: the deeper tag wins (chips is 2 below its root, cheddar is 2 below too: alphabetical decides).
  assert.equal(pickLeaf(tags, tax, () => 0).leaf, 'en:cheddar');
  // Depth decides before the alphabet.
  const deeper = pickLeaf(['en:beverages', 'en:juices', 'en:orange-juices', 'en:dairies'], tax, () => 0);
  assert.equal(deeper.leaf, 'en:orange-juices');
  assert.deepEqual(deeper.rejected, ['en:dairies']);
});

test('pickLeaf: a single-branch product has nothing rejected, and no known tag is a thrown fault', () => {
  assert.deepEqual(pickLeaf(['en:cheeses', 'en:cheddar'], tax, () => 0), { leaf: 'en:cheddar', rejected: [] });
  assert.throws(() => pickLeaf(['Mystery'], tax, () => 0), /none of/);
});

test('canonicalChain: root to leaf, one parent per node, own tags first, then members, then alphabetical', () => {
  assert.deepEqual(canonicalChain('en:cheddar', [], tax), ['en:dairies', 'en:cheeses', 'en:cheddar']);
  // en:cheese-snacks has two parents.
  assert.deepEqual(canonicalChain('en:cheese-snacks', [], tax), ['en:dairies', 'en:cheeses', 'en:cheese-snacks'], 'alphabetical: cheeses before snacks');
  assert.deepEqual(canonicalChain('en:cheese-snacks', ['en:snacks'], tax), ['en:snacks', 'en:cheese-snacks'], 'a parent among the own tags wins');
  assert.deepEqual(canonicalChain('en:cheese-snacks', [], tax, (t) => (t === 'en:snacks' ? 100 : 1)), ['en:snacks', 'en:cheese-snacks'], 'more members wins when no own tag decides');
  assert.deepEqual(canonicalChain('en:beverages', [], tax), ['en:beverages']);
});

/* ------------------------------------------------------------ ring */

test('chooseRingTag with a taxonomy: a leaf the taxonomy does not know has no parent step', () => {
  const probes = { size: () => 10, hasNeighbour: (t: string) => t !== 'en:mystery' };
  assert.equal(chooseRingTag(['en:cheeses', 'en:mystery'], probes, tax), null);
  assert.deepEqual(chooseRingTag(['en:cheeses', 'en:mystery'], probes), { tag: 'en:cheeses', level: 'parent', distanceOut: 1 }, 'the old rule, without a taxonomy');
});

test('chooseRingTag with a taxonomy: of several parents the one in the product\'s own path is tried first', () => {
  const probes = { size: () => 10, hasNeighbour: (t: string) => t !== 'en:cheese-snacks' };
  assert.equal(chooseRingTag(['en:snacks', 'en:cheese-snacks'], probes, tax)?.tag, 'en:snacks');
  assert.equal(chooseRingTag(['en:cheeses', 'en:cheese-snacks'], probes, tax)?.tag, 'en:cheeses');
});

test('a missing taxonomy for the ring logs [category-fault] taxonomy_unavailable ONCE and returns null', () => {
  resetTaxonomyUnavailableLog();
  const lines: string[] = [];
  assert.equal(loadRingTaxonomy(join(dir, 'absent.json'), (l) => lines.push(l)), null);
  assert.equal(loadRingTaxonomy(join(dir, 'absent.json'), (l) => lines.push(l)), null);
  logTaxonomyUnavailableOnce('again', (l) => lines.push(l));
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^\[category-fault\] taxonomy_unavailable/);
  assert.ok(loadRingTaxonomy(FIXTURE_JSON, (l) => lines.push(l)) !== null, 'a present file loads');
  resetTaxonomyUnavailableLog();
});

/* --------------------------------------------------------------- rebuild */

function catalogue(rows: { code: string; path: unknown; source?: string; leaf?: string | null }[]): DatabaseSync {
  const db = openCatalogue(':memory:');
  const ins = db.prepare(`INSERT INTO product (code, name, category_path, leaf_category, sold_in_canada, source) VALUES (?,?,?,?,?,?)`);
  for (const r of rows) ins.run(r.code, `name ${r.code}`, typeof r.path === 'string' ? r.path : JSON.stringify(r.path), r.leaf ?? null, 1, r.source ?? 'openfoodfacts');
  return db;
}

test('rebuildCategories without a taxonomy throws a clear error and writes nothing', () => {
  const db = catalogue([{ code: 'a', path: ['en:cheeses'] }]);
  db.exec(`INSERT INTO product_category (rowid_ref, tag, depth) VALUES (1, 'en:keep-me', 0)`);
  assert.throws(() => (rebuildCategories as unknown as (d: DatabaseSync) => void)(db), /needs a taxonomy/);
  assert.throws(() => (rebuildCategories as unknown as (d: DatabaseSync, o: object) => void)(db, {}), /needs a taxonomy/);
  assert.equal((db.prepare('SELECT count(*) AS n FROM product_category').get() as { n: number }).n, 1, 'the old index is untouched');
});

test('rebuildCategories returns and prints {products, groupsWritten, unresolvedLabels, productsWithNoGroup}', () => {
  const db = catalogue([
    { code: 'a', path: ['Juice'] },
    { code: 'b', path: ['Jus', 'Mystery'] },
    { code: 'c', path: ['Mystery'] },
    { code: 'd', path: [] },
  ]);
  const lines: string[] = [];
  const r = rebuildCategories(db, { taxonomy: tax, log: (l) => lines.push(l) });
  assert.deepEqual(r, {
    products: 4,
    groupsWritten: 2,
    unresolvedLabels: 1,
    productsWithNoGroup: 2,
    bySource: { openfoodfacts: { products: 4, groupsWritten: 2, unresolvedLabels: 1, productsWithNoGroup: 2 } },
  });
  assert.match(lines[0]!, /"products":4,"groupsWritten":2,"unresolvedLabels":1,"productsWithNoGroup":2/);
  assert.match(lines[1]!, /openfoodfacts: 4 products, 2 groups written, 1 unresolved labels, 2 with no group/);
  assert.match(lines[2]!, /Mystery/);
  const tags = (db.prepare('SELECT DISTINCT tag FROM product_category').all() as { tag: string }[]).map((x) => x.tag);
  assert.deepEqual(tags, ['en:juices'], 'only the resolved canonical tag is written; the unresolved label is no group');
});

test('rebuildCategories: only openfoodfacts rows are resolved; every other source keeps its own lower-cased label as its group', () => {
  const db = catalogue([
    { code: 'off', path: ['Juice'], source: 'openfoodfacts' },
    { code: 'ice', path: ['Computers', 'Laptops & Notebooks'], source: 'icecat' },
    { code: 'ret', path: ['Bottle Deposit 10c'], source: 'returnit' },
    { code: 'usd', path: ['Juice'], source: 'usda' },
  ]);
  const lines: string[] = [];
  const r = rebuildCategories(db, { taxonomy: tax, log: (l) => lines.push(l) });
  const tagsOf = (code: string) =>
    (db.prepare('SELECT pc.tag FROM product_category pc JOIN product p ON p.rowid = pc.rowid_ref WHERE p.code = ? ORDER BY pc.tag').all(code) as { tag: string }[]).map((x) => x.tag);
  assert.deepEqual(tagsOf('off'), ['en:juices']);
  assert.deepEqual(tagsOf('ice'), ['computers', 'laptops & notebooks']);
  assert.deepEqual(tagsOf('ret'), ['bottle deposit 10c']);
  assert.deepEqual(tagsOf('usd'), ['juice'], 'a usda "Juice" is not resolved against the food taxonomy');
  assert.equal(r.unresolvedLabels, 0, 'no label of another source is ever counted unresolved');
  assert.deepEqual(r.bySource.icecat, { products: 1, groupsWritten: 2, unresolvedLabels: 0, productsWithNoGroup: 0 });
  assert.deepEqual(Object.keys(r.bySource), ['icecat', 'openfoodfacts', 'returnit', 'usda']);
  assert.ok(lines.some((l) => /icecat: 1 products, 2 groups written/.test(l)), 'groups written are printed per source');
});

test('rebuildCategories reads the table a page at a time and gets the same result across pages', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ code: `p${i}`, path: [i % 2 ? 'Juice' : 'Mystery', 'en:cheddar'], source: i % 3 ? 'openfoodfacts' : 'icecat' }));
  const db = catalogue(rows);
  const whole = rebuildCategories(db, { taxonomy: tax, log: quiet });
  const index = db.prepare('SELECT rowid_ref, tag, depth FROM product_category ORDER BY rowid_ref, tag').all();
  const paged = rebuildCategories(db, { taxonomy: tax, log: quiet, pageSize: 7 });
  assert.equal(paged.products, 120);
  assert.deepEqual(paged, whole);
  assert.deepEqual(db.prepare('SELECT rowid_ref, tag, depth FROM product_category ORDER BY rowid_ref, tag').all(), index);
});

test('rebuildCategories stops on a stored path that is not valid JSON', () => {
  const db = catalogue([{ code: 'a', path: '{not json' }]);
  assert.throws(() => rebuildCategories(db, { taxonomy: tax, log: quiet }), /category_path of a is not valid JSON/);
  const db2 = catalogue([{ code: 'b', path: '"a string"' }]);
  assert.throws(() => rebuildCategories(db2, { taxonomy: tax, log: quiet }), /not a JSON array/);
});

/* --------------------------------------------------------- canonicalize */

function rowsOf(db: DatabaseSync): Record<string, unknown>[] {
  return db.prepare('SELECT * FROM product ORDER BY code').all() as Record<string, unknown>[];
}

function migrationFixture(): DatabaseSync {
  return catalogue([
    { code: 'cheddar', path: ['en:dairies', 'en:cheeses', 'en:cheddar'], leaf: 'en:cheddar' },
    { code: 'juice', path: ['Juice'], leaf: 'Juice' },
    { code: 'oj', path: ["fr:jus-d-orange"], leaf: 'fr:jus-d-orange' },
    { code: 'two', path: ['en:cheddar', 'en:chips'], leaf: 'en:chips' }, // two branches; the last tag is the lighter
    { code: 'mystery', path: ['Mystery label'], leaf: 'Mystery label' }, // nothing resolves
    { code: 'notoff', path: ['Juice'], leaf: 'Juice', source: 'usda' }, // other source: untouched
    { code: 'empty', path: [], leaf: null }, // no tags
  ]);
}

test('canonicalize: rewrites OFF rows to one chain, keeps raw, records the rejected, counts in equals count out', () => {
  const db = migrationFixture();
  const before = rowsOf(db);
  const lines: string[] = [];
  const r = canonicalizeCatalogue(db, { taxonomy: tax, log: (l) => lines.push(l) });
  assert.equal(r.ok, true);
  assert.equal(r.rowsBefore, 7);
  assert.equal(r.rowsAfter, 7);
  assert.equal(r.examined, 5, 'five OFF rows carry tags');
  assert.equal(r.rewritten, 4);
  assert.equal(r.unresolved, 1);
  assert.equal(r.malformed, 0);
  assert.match(lines.join('\n'), /examined 5, rewritten 4, left unresolved 1, malformed 0; product rows before 7, after 7/);

  const after = new Map(rowsOf(db).map((x) => [x.code as string, x]));
  const was = new Map(before.map((x) => [x.code as string, x]));
  const p = (code: string) => JSON.parse(after.get(code)!.category_path as string) as string[];
  assert.deepEqual(p('cheddar'), ['en:dairies', 'en:cheeses', 'en:cheddar']);
  assert.deepEqual(p('juice'), ['en:beverages', 'en:juices']);
  assert.equal(after.get('juice')!.leaf_category, 'en:juices');
  assert.deepEqual(p('oj'), ['en:beverages', 'en:juices', 'en:orange-juices']);
  assert.deepEqual(p('two'), ['en:dairies', 'en:cheeses', 'en:cheddar'], 'cheddar has more catalogue members than chips');
  assert.deepEqual(JSON.parse(after.get('two')!.category_rejected as string), ['en:chips']);
  assert.deepEqual(JSON.parse(after.get('cheddar')!.category_rejected as string), []);

  // Raw is exactly what was there.
  for (const code of ['cheddar', 'juice', 'oj', 'two']) assert.equal(after.get(code)!.category_tags_raw, was.get(code)!.category_path, `${code} raw`);
  // Unresolved, other-source and empty rows are byte for byte unchanged.
  for (const code of ['mystery', 'notoff', 'empty']) {
    assert.equal(after.get(code)!.category_path, was.get(code)!.category_path, code);
    assert.equal(after.get(code)!.leaf_category, was.get(code)!.leaf_category, code);
    assert.equal(after.get(code)!.category_tags_raw, null, code);
    assert.equal(after.get(code)!.category_rejected, null, code);
  }
  // The index was rebuilt from the new paths: only canonical tags.
  const tags = (db.prepare('SELECT DISTINCT tag FROM product_category ORDER BY tag').all() as { tag: string }[]).map((x) => x.tag);
  assert.deepEqual(tags, ['en:beverages', 'en:cheddar', 'en:cheeses', 'en:dairies', 'en:juices', 'en:orange-juices', 'juice'], 'the usda row keeps its own lower-cased label as its group');
  assert.equal(r.rebuild.productsWithNoGroup, 2, 'mystery and empty');
  assert.equal(r.rebuild.unresolvedLabels, 1);
  assert.deepEqual(r.rebuild.bySource.usda, { products: 1, groupsWritten: 1, unresolvedLabels: 0, productsWithNoGroup: 0 });
});

test('canonicalize is idempotent: a second run changes nothing and reports 0 rewritten', () => {
  const db = migrationFixture();
  canonicalizeCatalogue(db, { taxonomy: tax, log: quiet });
  const once = rowsOf(db);
  const index = db.prepare('SELECT rowid_ref, tag, depth FROM product_category ORDER BY rowid_ref, tag').all();
  const r2 = canonicalizeCatalogue(db, { taxonomy: tax, log: quiet });
  assert.equal(r2.rewritten, 0);
  assert.equal(r2.ok, true);
  assert.deepEqual(rowsOf(db), once);
  assert.deepEqual(db.prepare('SELECT rowid_ref, tag, depth FROM product_category ORDER BY rowid_ref, tag').all(), index);
});

test('canonicalize never overwrites raw: a changed path with raw already set is read from raw', () => {
  const db = migrationFixture();
  canonicalizeCatalogue(db, { taxonomy: tax, log: quiet });
  const raw = (db.prepare(`SELECT category_tags_raw AS r FROM product WHERE code = 'juice'`).get() as { r: string }).r;
  assert.equal(raw, JSON.stringify(['Juice']));
  db.exec(`UPDATE product SET category_path = '["en:chips"]' WHERE code = 'juice'`); // something else wrote the path
  canonicalizeCatalogue(db, { taxonomy: tax, log: quiet });
  const row = db.prepare(`SELECT category_path, category_tags_raw FROM product WHERE code = 'juice'`).get() as { category_path: string; category_tags_raw: string };
  assert.equal(row.category_tags_raw, raw, 'raw is untouched');
  assert.equal(row.category_path, JSON.stringify(['en:beverages', 'en:juices']), 'the path is rebuilt from raw');
});

test('canonicalize --undo restores every path and leaf byte for byte, clears the records, keeps the row count', () => {
  const db = migrationFixture();
  const before = rowsOf(db).map((r) => ({ code: r.code, category_path: r.category_path, leaf_category: r.leaf_category }));
  canonicalizeCatalogue(db, { taxonomy: tax, log: quiet });
  const u = undoCanonicalize(db, { taxonomy: tax, log: quiet });
  assert.equal(u.ok, true);
  assert.equal(u.restored, 4);
  assert.equal(u.rowsBefore, u.rowsAfter);
  const after = rowsOf(db).map((r) => ({ code: r.code, category_path: r.category_path, leaf_category: r.leaf_category }));
  assert.deepEqual(after, before);
  assert.equal((db.prepare('SELECT count(*) AS n FROM product WHERE category_rejected IS NOT NULL').get() as { n: number }).n, 0);
  // And forward again gives the same canonical result as the first time.
  const again = canonicalizeCatalogue(db, { taxonomy: tax, log: quiet });
  assert.equal(again.rewritten, 4);
});

test('canonicalize: a row whose tags are not valid JSON is left alone and the job stops loudly at the index rebuild', () => {
  const db = catalogue([
    { code: 'good', path: ['en:cheddar'], leaf: 'en:cheddar' },
    { code: 'bad', path: '[oops', leaf: null },
  ]);
  assert.throws(() => canonicalizeCatalogue(db, { taxonomy: tax, log: quiet }), /category_path of bad is not valid JSON/);
  assert.equal((db.prepare(`SELECT category_path AS p FROM product WHERE code = 'bad'`).get() as { p: string }).p, '[oops');
});

test('canonicalize: malformed RAW tags with a valid path are counted and make the job not ok', () => {
  const db = catalogue([{ code: 'bad', path: ['en:cheddar'], leaf: 'en:cheddar' }]);
  db.exec(`UPDATE product SET category_tags_raw = '[oops'`);
  const r = canonicalizeCatalogue(db, { taxonomy: tax, log: quiet });
  assert.equal(r.malformed, 1);
  assert.equal(r.ok, false);
});

test('canonicalize in small batches gives the same result as one batch', () => {
  const a = migrationFixture();
  const b = migrationFixture();
  canonicalizeCatalogue(a, { taxonomy: tax, log: quiet });
  canonicalizeCatalogue(b, { taxonomy: tax, log: quiet, batchSize: 1 });
  assert.deepEqual(rowsOf(b), rowsOf(a));
});

test('canonicalize without a taxonomy throws before touching anything', () => {
  const db = migrationFixture();
  const before = rowsOf(db);
  assert.throws(() => (canonicalizeCatalogue as unknown as (d: DatabaseSync, o: object) => unknown)(db, {}), /needs a taxonomy/);
  assert.deepEqual(rowsOf(db), before);
});

test('the canonicalize CLI: a missing taxonomy stops the job, exits non-zero, and the database is unchanged', () => {
  const dbFile = join(dir, 'cli-missing.db');
  const seed = openCatalogue(dbFile);
  seed.prepare(`INSERT INTO product (code, name, category_path, source) VALUES ('a','a','["Juice"]','openfoodfacts')`).run();
  seed.close();
  const r = spawnSync(process.execPath, [CANONICALIZE, '--db', dbFile, '--taxonomy', join(dir, 'absent.json'), '--aliases', join(dir, 'also-absent.json')], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /FAILED before touching anything.*missing/);
  const check = new DatabaseSync(dbFile, { readOnly: true });
  assert.equal((check.prepare(`SELECT category_path AS p FROM product WHERE code = 'a'`).get() as { p: string }).p, '["Juice"]');
  check.close();
});

test('the canonicalize CLI runs forward and --undo on a fixture database, exit 0 both ways', () => {
  const dbFile = join(dir, 'cli-ok.db');
  const aliasFile = join(dir, 'cli-aliases.json');
  writeFileSync(aliasFile, JSON.stringify({ aliases: { 'Soft Drink': { to: 'en:beverages' } } }));
  const seed = openCatalogue(dbFile);
  seed.prepare(`INSERT INTO product (code, name, category_path, leaf_category, source) VALUES ('a','a','["Juice"]','Juice','openfoodfacts'), ('b','b','["Soft Drink"]','Soft Drink','openfoodfacts')`).run();
  seed.close();
  const args = ['--db', dbFile, '--taxonomy', FIXTURE_JSON, '--aliases', aliasFile];
  const fwd = spawnSync(process.execPath, [CANONICALIZE, ...args], { encoding: 'utf8' });
  assert.equal(fwd.status, 0, fwd.stderr);
  assert.match(fwd.stdout, /examined 2, rewritten 2, left unresolved 0, malformed 0; product rows before 2, after 2/);
  const back = spawnSync(process.execPath, [CANONICALIZE, ...args, '--undo'], { encoding: 'utf8' });
  assert.equal(back.status, 0, back.stderr);
  const check = new DatabaseSync(dbFile, { readOnly: true });
  const paths = (check.prepare('SELECT category_path AS p FROM product ORDER BY code').all() as { p: string }[]).map((x) => x.p);
  check.close();
  assert.deepEqual(paths, ['["Juice"]', '["Soft Drink"]']);
});

/* ----------------------------------------------------------------- A1 */

test('A1 counts a two-branch product only when no category_rejected record names what was left', () => {
  const dbFile = join(dir, 'a1.db');
  const seed = openCatalogue(dbFile);
  const ins = seed.prepare(`INSERT INTO product (code, name, category_path, source, sold_in_canada, category_rejected) VALUES (?,?,?,?,1,?)`);
  const twoBranch = JSON.stringify(['en:cheddar', 'en:chips']);
  ins.run('unrecorded', 'u', twoBranch, 'openfoodfacts', null);
  ins.run('empty-record', 'e', twoBranch, 'openfoodfacts', '[]');
  ins.run('recorded', 'r', twoBranch, 'openfoodfacts', JSON.stringify(['en:chips']));
  ins.run('single', 's', JSON.stringify(['en:cheeses', 'en:cheddar']), 'openfoodfacts', null);
  seed.close();
  const baseline = join(dir, 'a1-baseline.json');
  writeFileSync(baseline, JSON.stringify({ recorded: '2026-10-08', taxonomy: { sha256: tax.sha256, fetchedAt: '2026-10-08', source: 'fixture' }, counts: { A1: 99, A2: 99, A3: 99, A4: 99, A6: 99, A7: 99 } }));
  const r = runCategoryCheck({ db: dbFile, taxonomy: FIXTURE_JSON, baseline });
  assert.equal(r.counts.A1, 2, 'unrecorded and empty-record count; the recorded one does not');
});

/* ------------------------------------------------------------ placement */

test('scorePlacement: reports exact, at-or-above-parent, unknown and other', () => {
  const s = scorePlacement(
    [
      { truth: 'en:cheddar', placed: 'en:cheddar' },
      { truth: 'en:cheddar', placed: 'en:cheeses' },
      { truth: 'en:cheddar', placed: 'en:dairies' },
      { truth: 'en:cheddar', placed: 'en:chips' },
      { truth: 'en:cheddar', placed: 'en:nonsense' },
    ],
    tax,
  );
  assert.deepEqual(s, { n: 5, exact: 0.2, atOrAboveParent: 0.4, placedUnknown: 0.2, other: 0.2 });
});

test('scorePlacement: nothing to score, or a true category outside the taxonomy, is a thrown fault', () => {
  assert.throws(() => scorePlacement([], tax), /no items/);
  assert.throws(() => scorePlacement([{ truth: 'en:nonsense', placed: 'en:cheddar' }], tax), /not in the taxonomy/);
});
