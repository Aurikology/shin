/**
 * A load ends with the placement build (price-category plan Stage 2): the stored
 * paths become the placement tree and every item gets its place, so a newly loaded
 * item is never missing from it. The build reads each department's own taxonomy and
 * checks its pinned hash; a missing or changed file stops the load. `--no-placement`
 * is the explicit opt-out and the load says it skipped.
 *
 * The loader is a script, not a module (importing it runs it), so it is spawned as
 * a separate process against a temp database, the way load-second-source.test.ts
 * does. Temp data only.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'shin-load-placement-'));
const loader = fileURLToPath(new URL('../src/load.ts', import.meta.url));
const catalogueDir = fileURLToPath(new URL('..', import.meta.url));
after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

// A food taxonomy that resolves the rows' labels, and one tiny taxonomy per other department.
const foodTaxonomy = join(dir, 'food.json');
const aliases = join(dir, 'aliases.json');
writeFileSync(foodTaxonomy, JSON.stringify({ 'en:snacks': { name: { en: 'Snacks' }, parents: [] }, 'en:chips': { name: { en: 'Chips' }, parents: ['en:snacks'] } }));
writeFileSync(aliases, JSON.stringify({ aliases: {} }));

const taxDir = join(dir, 'taxonomies');
const files: Record<string, string> = { beauty: 'obf-categories.json', general: 'opf-categories.json', pet: 'opff-categories.json' };
const baseline = join(dir, 'baseline.json');
function installDepartmentTaxonomies(dirPath: string, tamper = false): void {
  rmSync(dirPath, { recursive: true, force: true });
  const pinned: Record<string, { sha256: string }> = {};
  for (const [dept, file] of Object.entries(files)) {
    const body = JSON.stringify({ [`en:${dept}-things`]: { name: { en: `${dept} things` }, parents: [] } });
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, file), body);
    pinned[dept] = { sha256: createHash('sha256').update(body).digest('hex') };
  }
  writeFileSync(baseline, JSON.stringify({ departmentTaxonomies: pinned }));
  if (tamper) writeFileSync(join(dirPath, files.beauty!), JSON.stringify({ 'en:other': { parents: [] } }));
}
function row(code: string, source: string, path: string[]): string {
  return JSON.stringify({
    code, name: `name ${code}`, name_en: `name ${code}`, name_fr: null, brands: null, quantity: null, size_value: null, size_unit: null,
    category_path: path, leaf_category: path.at(-1) ?? null, allergens: [], image_url: null, sold_in_canada: 1, source,
  });
}

function load(db: string, tag: string, extraArgs: string[], env: Record<string, string> = {}) {
  const file = join(dir, `rows-${tag}.jsonl`);
  writeFileSync(
    file,
    [row('0100000000001', 'openfoodfacts', ['en:snacks', 'en:chips']), row('0100000000002', 'openfoodfacts', []), row('0100000000003', 'openbeautyfacts', ['en:beauty-things'])].join('\n') + '\n',
    'utf8',
  );
  return spawnSync(process.execPath, ['--experimental-strip-types', loader, file, ...extraArgs], {
    cwd: catalogueDir,
    env: {
      ...process.env,
      SHIN_CATALOGUE: db,
      SHIN_CATEGORY_TAXONOMY: foodTaxonomy,
      SHIN_CATEGORY_ALIASES: aliases,
      SHIN_DEPARTMENT_TAXONOMY_DIR: taxDir,
      SHIN_CATEGORY_BASELINE: baseline,
      ...env,
    },
    encoding: 'utf8',
  });
}

function tables(db: string): string[] {
  const d = new DatabaseSync(db, { readOnly: true });
  const names = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
  d.close();
  return names;
}

test('a load ends with the placement build: every loaded item has a place, labelled ones placed from their path', () => {
  installDepartmentTaxonomies(taxDir);
  const db = join(dir, 'built.db');
  const r = load(db, 'built', []);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = new DatabaseSync(db, { readOnly: true });
  const placed = d.prepare('SELECT ip.code, ip.placed_by, n.tag, n.kind FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id ORDER BY ip.code').all() as { code: string; placed_by: string; tag: string; kind: string }[];
  d.close();
  assert.equal(placed.length, 3, 'one placement per product');
  assert.deepEqual(placed.map((p) => [p.code, p.placed_by, p.tag]), [
    ['0100000000001', 'path', 'en:chips'],
    ['0100000000002', 'unplaced', '@unplaced'],
    ['0100000000003', 'path', 'en:beauty-things'],
  ]);
  assert.match(r.stdout, /placement build/);
});

test('--no-placement skips the build and SAYS so; the placement tables are then absent', () => {
  installDepartmentTaxonomies(taxDir);
  const db = join(dir, 'skipped.db');
  const r = load(db, 'skipped', ['--no-placement']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /placement build SKIPPED \(--no-placement\)/);
  assert.equal(tables(db).includes('item_placement'), false);
});

test('a missing department taxonomy stops the load, names the fetch command, and does not skip quietly', () => {
  installDepartmentTaxonomies(taxDir);
  rmSync(join(taxDir, files.pet!));
  const db = join(dir, 'missing.db');
  const r = load(db, 'missing', []);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /fetch-categories\.ts --department pet/);
  assert.match(r.stderr, /--no-placement/);
});

test('a department taxonomy whose hash is not the pinned one stops the load', () => {
  installDepartmentTaxonomies(taxDir, true);
  const db = join(dir, 'tampered.db');
  const r = load(db, 'tampered', []);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /beauty taxonomy.*sha256/);
});
