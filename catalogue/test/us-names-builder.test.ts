/**
 * `src/fetch_us_names.py`: the builder of the US names index. Run against a made-up eight-row stand-in for
 * food.parquet (fixtures/us-names-source.parquet, made by fixtures/make_us_names_source.py), with a tiny
 * Canada catalogue that holds one of the barcodes. It needs Python with duckdb, the same as fetch_canada.py;
 * on a machine without it the build test is skipped and says so, and the committed fixture index is still
 * checked for shape (the app tests read it).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = fileURLToPath(new URL('.', import.meta.url));
const BUILDER = join(here, '..', 'src', 'fetch_us_names.py');
const SOURCE = join(here, 'fixtures', 'us-names-source.parquet');
const FIXTURE_INDEX = join(here, 'fixtures', 'us-names-index.db');

/** A Python that can import duckdb, or null. SHIN_PYTHON first, then the usual names, then the Windows per-user install. */
function findPython(): string | null {
  const candidates = [
    process.env.SHIN_PYTHON,
    'python3',
    'python',
    'py',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe') : undefined,
  ].filter((c): c is string => Boolean(c));
  for (const py of candidates) {
    const r = spawnSync(py, ['-I', '-c', 'import duckdb, sqlite3'], { encoding: 'utf8' });
    if (r.status === 0) return py;
  }
  return null;
}

function rows(path: string): Array<Record<string, unknown>> {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare('SELECT key, code, name, brand, quantity, categories FROM us_name ORDER BY key').all() as Array<Record<string, unknown>>;
  } finally {
    db.close();
  }
}

const EXPECTED = [
  { key: '41000000011', code: '0041000000011', name: 'Biscuits au chocolat', brand: null, quantity: null, categories: null },
  { key: '6104696', code: '06104696', name: 'Fixture Mint Candy', brand: 'Fixtureco', quantity: '50 g', categories: 'en:snacks' },
  {
    key: '75720000814',
    code: '0075720000814',
    name: 'Poland Spring Natural Spring Water',
    brand: 'Poland Spring',
    quantity: '1 L',
    categories: 'en:non-sparkling-waters,en:spring-waters,en:waters',
  },
];

test('the committed fixture index has the layout the server reads and the rows the builder makes', () => {
  assert.ok(existsSync(FIXTURE_INDEX), 'the fixture index is missing');
  assert.deepEqual(rows(FIXTURE_INDEX).map((r) => ({ ...r })), EXPECTED);
});

test('the builder keeps US-only named products, and leaves out Canada, non-US, nameless, junk and catalogue-held codes', (t) => {
  const py = findPython();
  if (!py) {
    t.skip('no Python with duckdb on this machine (set SHIN_PYTHON); the builder was not run');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'shin-us-builder-'));
  try {
    const catalogue = join(dir, 'catalogue.db');
    const cat = new DatabaseSync(catalogue);
    cat.exec("CREATE TABLE product (code TEXT); INSERT INTO product VALUES ('0049000028911');");
    cat.close();

    const out = join(dir, 'us-names.db');
    const r = spawnSync(py, ['-I', BUILDER, out, SOURCE, catalogue], { encoding: 'utf8' });
    assert.equal(r.status, 0, `the builder failed: ${r.stderr}`);
    assert.match(r.stdout, /wrote 3 US names/);
    assert.deepEqual(rows(out).map((x) => ({ ...x })), EXPECTED);

    // Without a catalogue to subtract, the catalogue-held code stays in.
    const all = join(dir, 'us-names-all.db');
    const r2 = spawnSync(py, ['-I', BUILDER, all, SOURCE], { encoding: 'utf8' });
    assert.equal(r2.status, 0, `the builder failed: ${r2.stderr}`);
    assert.deepEqual(
      rows(all).map((x) => x.name),
      ['Biscuits au chocolat', 'Cola Test', 'Fixture Mint Candy', 'Poland Spring Natural Spring Water'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
