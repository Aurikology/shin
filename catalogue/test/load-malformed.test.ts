/**
 * A MALFORMED LINE IN THE PREPARED FILE IS OUR BUG, SO THE LOAD MUST SAY SO AND FAIL.
 *
 * load.ts reads rows/*.jsonl that prepare_rows*.py wrote itself. Every line in it is
 * JSON by construction, so a line that will not parse means the prepare step broke
 * (a truncated write, a full disk, a crashed job). The loader used to count it into a
 * "malformed" line of the summary and exit 0, so the catalogue went live with rows
 * missing and nothing red anywhere. The loader writes into the database in place (it
 * does not build a new file and swap it in), so there is no swap to stop before: it
 * finishes the whole run, so the database it leaves is consistent and indexed, and
 * then it exits non-zero naming the count and the first three line numbers.
 *
 * It runs the loader as a separate process for the reason load-second-source.test.ts
 * gives: importing load.ts executes it.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'shin-load-malformed-'));
const loader = fileURLToPath(new URL('../src/load.ts', import.meta.url));
const catalogueDir = fileURLToPath(new URL('..', import.meta.url));
const noopTaxonomy = join(dir, 'noop-taxonomy.json');
const noopAliases = join(dir, 'noop-aliases.json');
writeFileSync(noopTaxonomy, JSON.stringify({ 'en:placeholder': { parents: [] } }));
writeFileSync(noopAliases, JSON.stringify({ aliases: {} }));

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

function row(code: string): string {
  return JSON.stringify({
    code, name: `Product ${code}`, name_en: `Product ${code}`, name_fr: null, brands: null, quantity: null,
    size_value: null, size_unit: null, category_path: [], leaf_category: null, allergens: [], image_url: null,
    sold_in_canada: 1, source: 'openfoodfacts',
  });
}

function load(tag: string, lines: string[]) {
  const dbPath = join(dir, `${tag}.db`);
  const rowsPath = join(dir, `${tag}.jsonl`);
  writeFileSync(rowsPath, lines.join('\n') + '\n', 'utf8');
  const r = spawnSync(process.execPath, ['--experimental-strip-types', loader, rowsPath], {
    cwd: catalogueDir,
    env: { ...process.env, SHIN_CATALOGUE: dbPath, SHIN_CATEGORY_TAXONOMY: noopTaxonomy, SHIN_CATEGORY_ALIASES: noopAliases },
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, dbPath };
}

function count(dbPath: string): number {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const n = (db.prepare('SELECT count(*) AS n FROM product').get() as { n: number }).n;
  db.close();
  return n;
}

test('malformed lines fail the load, naming the count and the first three line numbers', () => {
  const { status, stderr, stdout, dbPath } = load('bad', [
    row('0000000000017'), // 1
    '{"code": "0000000000024", "name"', // 2 truncated
    row('0000000000031'), // 3
    '', // 4 blank, skipped but still a line
    'not json at all', // 5
    '[1, 2', // 6
    '}{', // 7
  ]);
  assert.notEqual(status, 0, `a malformed prepared line must fail the load\n${stdout}\n${stderr}`);
  assert.match(stderr, /4 malformed/, stderr);
  assert.match(stderr, /first line numbers 2, 5, 6\b/, stderr);
  assert.doesNotMatch(stderr, /first line numbers [^.]*\b7\b/,'only the first three line numbers are named');
  // The good rows are in and indexed: the run finished, it only refuses to call itself a success.
  assert.equal(count(dbPath), 2);
});

test('control: a clean prepared file still loads and exits 0', () => {
  const { status, stderr, dbPath } = load('good', [row('0000000000017'), row('0000000000031'), '', row('0000000000048')]);
  assert.equal(status, 0, stderr);
  assert.equal(stderr.includes('malformed'), false, stderr);
  assert.equal(count(dbPath), 3);
});
