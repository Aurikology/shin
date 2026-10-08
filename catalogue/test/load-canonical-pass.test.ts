/**
 * The load ends with the canonical category pass (category-canonicalize.ts). The loader is a script,
 * so it is spawned against a temp database; nothing here touches catalogue/data.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'shin-load-canonical-'));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.error(`could not remove ${dir}: ${String(err)}`);
  }
});
const loader = fileURLToPath(new URL('../src/load.ts', import.meta.url));
const catalogueDir = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/taxonomy-small.json', import.meta.url));
const aliases = join(dir, 'aliases.json');
writeFileSync(aliases, JSON.stringify({ aliases: {} }));

function row(code: string, path: string[], source = 'openfoodfacts'): Record<string, unknown> {
  return {
    code, name: `name ${code}`, name_en: null, name_fr: null, brands: null, quantity: null, size_value: null, size_unit: null,
    category_path: path, leaf_category: path[path.length - 1] ?? null, allergens: [], image_url: null, sold_in_canada: 1, source,
  };
}

function load(db: string, tag: string, rows: Record<string, unknown>[], taxonomy: string) {
  const file = join(dir, `rows-${tag}.jsonl`);
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return spawnSync(process.execPath, ['--experimental-strip-types', loader, file], {
    cwd: catalogueDir,
    env: { ...process.env, SHIN_CATALOGUE: db, SHIN_CATEGORY_TAXONOMY: taxonomy, SHIN_CATEGORY_ALIASES: aliases },
    encoding: 'utf8',
  });
}

function readRow(db: string, code: string): { category_path: string; leaf_category: string; category_tags_raw: string | null; category_rejected: string | null } {
  const d = new DatabaseSync(db, { readOnly: true });
  const r = d.prepare('SELECT category_path, leaf_category, category_tags_raw, category_rejected FROM product WHERE code = ?').get(code) as never;
  d.close();
  return r;
}

test('the load ends with the canonical pass: one chain, raw kept, the index holds canonical tags only', () => {
  const db = join(dir, 'a.db');
  const r = load(db, 'a', [row('1', ['Juice']), row('2', ['en:cheddar', 'en:chips'])], FIXTURE);
  assert.equal(r.status, 0, r.stderr);
  const one = readRow(db, '1');
  assert.equal(one.category_path, JSON.stringify(['en:beverages', 'en:juices']));
  assert.equal(one.leaf_category, 'en:juices');
  assert.equal(one.category_tags_raw, JSON.stringify(['Juice']));
  assert.deepEqual(JSON.parse(readRow(db, '2').category_rejected ?? 'null'), ['en:chips']);
  assert.match(r.stdout, /category-canonicalize: examined 2, rewritten 2/);
});

test('a reload of the same source brings fresh raw tags, and the pass reads them, not the stale copy', () => {
  const db = join(dir, 'b.db');
  assert.equal(load(db, 'b1', [row('1', ['Juice'])], FIXTURE).status, 0);
  assert.equal(load(db, 'b2', [row('1', ['en:cheddar'])], FIXTURE).status, 0);
  const one = readRow(db, '1');
  assert.equal(one.category_tags_raw, JSON.stringify(['en:cheddar']));
  assert.equal(one.category_path, JSON.stringify(['en:dairies', 'en:cheeses', 'en:cheddar']));
});

test('a missing taxonomy stops the load with a message and a non-zero exit', () => {
  const db = join(dir, 'c.db');
  const r = load(db, 'c', [row('1', ['Juice'])], join(dir, 'absent.json'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /load STOPPED: the category taxonomy is unavailable/);
});
