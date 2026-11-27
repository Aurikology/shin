/**
 * `src/us-names-index.ts`: the offline US names index the server reads after a catalogue miss and before the
 * live Open Food Facts call. The fixture is built by catalogue/src/fetch_us_names.py from a made-up three-row
 * source (catalogue/test/fixtures/); the builder itself is tested in catalogue/test/us-names-builder.test.ts.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { indexKey, lookupUsName, setUsNamesIndexForTests, usNamesIndexWarnedForTests } from '../src/us-names-index.ts';

const FIXTURE = fileURLToPath(new URL('../../catalogue/test/fixtures/us-names-index.db', import.meta.url));
const POLAND_SPRING = '0075720000814';

after(() => setUsNamesIndexForTests(null));

test('indexKey is the numeric spelling: leading zeros off, only 6 to 14 digits', () => {
  assert.equal(indexKey('0075720000814'), '75720000814');
  assert.equal(indexKey('075720000814'), '75720000814');
  assert.equal(indexKey('75720000814'), '75720000814');
  assert.equal(indexKey('06104696'), '6104696');
  assert.equal(indexKey('12345'), null);
  assert.equal(indexKey('000000000000'), null);
  assert.equal(indexKey('12ab5678'), null);
  assert.equal(indexKey(''), null);
});

test('a popular US product is named from the index in every zero-padded spelling', () => {
  setUsNamesIndexForTests(FIXTURE);
  for (const code of [POLAND_SPRING, '075720000814', '75720000814', '00075720000814']) {
    const hit = lookupUsName(code);
    assert.ok(hit, `${code} was not found`);
    assert.equal(hit.name, 'Poland Spring Natural Spring Water');
    assert.equal(hit.brand, 'Poland Spring');
    assert.equal(hit.size, '1 L');
    assert.deepEqual(hit.categories, ['en:non-sparkling-waters', 'en:spring-waters', 'en:waters']);
  }
});

test('an 8-digit code and a name that has no brand, size or categories', () => {
  setUsNamesIndexForTests(FIXTURE);
  assert.equal(lookupUsName('06104696')?.name, 'Fixture Mint Candy');
  const bare = lookupUsName('0041000000011');
  assert.equal(bare?.name, 'Biscuits au chocolat');
  assert.equal(bare?.brand, null);
  assert.equal(bare?.size, null);
  assert.deepEqual(bare?.categories, []);
});

test('a code the index does not hold, and codes the builder left out, are null', () => {
  setUsNamesIndexForTests(FIXTURE);
  assert.equal(lookupUsName('0012345678905'), null);
  assert.equal(lookupUsName('0068100084245'), null, 'a product also sold in Canada is the catalogue\'s, not the index\'s');
  assert.equal(lookupUsName('0049000028911'), null, 'a code the catalogue already held was left out');
  assert.equal(lookupUsName('garbage'), null);
});

test('a missing index file is null, logged once, and the server carries on', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-us-names-'));
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
  try {
    setUsNamesIndexForTests(join(dir, 'not-built-yet.db'));
    assert.equal(lookupUsName(POLAND_SPRING), null);
    assert.equal(lookupUsName(POLAND_SPRING), null);
    assert.equal(lookupUsName('06104696'), null);
    assert.equal(warnings.length, 1, `expected one log line, got ${warnings.length}`);
    assert.match(warnings[0]!, /no file at .*not-built-yet\.db/);
    assert.equal(usNamesIndexWarnedForTests('missing'), true);
  } finally {
    console.warn = realWarn;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file that is not an index (no us_name table) is null, logged once, never a throw', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-us-names-'));
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
  try {
    const path = join(dir, 'wrong.db');
    const other = new DatabaseSync(path);
    other.exec('CREATE TABLE something_else (a TEXT)');
    other.close();
    setUsNamesIndexForTests(path);
    assert.equal(lookupUsName(POLAND_SPRING), null);
    assert.equal(lookupUsName(POLAND_SPRING), null);
    assert.equal(warnings.length, 1, `expected one log line, got ${warnings.length}: ${warnings.join(' | ')}`);
    assert.equal(usNamesIndexWarnedForTests('query'), true);
  } finally {
    setUsNamesIndexForTests(null);
    console.warn = realWarn;
    rmSync(dir, { recursive: true, force: true });
  }
});
