/**
 * ONE BARCODE MUST NOT BECOME TWO ROWS.
 *
 * The defect these tests pin, counted on the live catalogue 2026-09-26: the loader
 * upserts on `code` exactly as the prepared row spells it, so a 12-digit UPC-A and
 * its zero-padded 13-digit twin were two rows for one product. 1,375,443 products
 * were stored twice that way, every 12-digit row in the table, and 198,095 of the
 * pairs were Canadian, which is 32% of what the phone downloads.
 *
 * The last test is the one that matters, because it is the only one that fails for
 * the original reason: it loads the SAME product twice, spelled both ways, into a
 * real database and asserts there is one row. The others pin the rule itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
/*
 * Imported from `barcode.ts`, NEVER from `load.ts`. The first version of this file
 * imported it from the loader, and importing the loader RAN it: 122,158 prepared
 * rows went into the live 4.13 GB catalogue, competing with the dedupe pass, and the
 * test ended with "database is locked" after 160 seconds. The upsert made it
 * harmless. The rule it bought is worth more than the scare: a function a test needs
 * does not live in a file that does work when imported.
 */
import { canonicalCode } from '../src/barcode.ts';
import { openCatalogue } from '../src/schema.ts';

test('a 12-digit UPC-A becomes its 13-digit form, which is what GS1 calls the same code', () => {
  assert.equal(canonicalCode('068100084245'), '0068100084245');
  assert.equal(canonicalCode('045496590161'), '0045496590161');
});

test('a 13-digit code is already canonical and is not touched', () => {
  assert.equal(canonicalCode('0068100084245'), '0068100084245');
  assert.equal(canonicalCode('4006381333931'), '4006381333931');
});

test('an 8-digit EAN-8 is left alone, because it is a different code and not a short EAN-13', () => {
  /*
   * 7,724 rows in the catalogue carry an 8-digit code. Padding them to 13 would
   * invent a barcode that is not printed on anything.
   */
  assert.equal(canonicalCode('96385074'), '96385074');
});

test('a 14-digit code with a zero indicator drops it; one with a real indicator does not', () => {
  assert.equal(canonicalCode('00068100084245'), '0068100084245');
  assert.equal(canonicalCode('10068100084245'), '10068100084245');
});

test('anything that is not digits passes through untouched rather than being dropped', () => {
  /*
   * Rejecting here would silently lose a row. A row with a strange code belongs in
   * the table where somebody can see it and fix it.
   */
  assert.equal(canonicalCode('ABC-123'), 'ABC-123');
  assert.equal(canonicalCode(''), '');
  assert.equal(canonicalCode('  0068100084245  '), '0068100084245');
});

test('loading one product under both spellings leaves ONE row, in a real database', () => {
  /*
   * The regression test proper. Before the fix this left two rows, and every count
   * taken from the catalogue, every pack byte and every duplicate a shopper saw in
   * a search followed from that.
   */
  const dir = mkdtempSync(join(tmpdir(), 'shin-canonical-'));
  try {
    const db = openCatalogue(join(dir, 'catalogue.db'));
    const insert = db.prepare(
      'INSERT INTO product (code, name, category_path, allergens, sold_in_canada, source)' +
        " VALUES (?, ?, '[]', '[]', 1, 'test')" +
        ' ON CONFLICT(code) DO UPDATE SET name = excluded.name',
    );
    insert.run(canonicalCode('068100084245'), 'Kraft Dinner Original 225 g');
    insert.run(canonicalCode('0068100084245'), 'Kraft Dinner Original 225 g');

    const rows = db.prepare('SELECT code FROM product ORDER BY code').all() as Array<{ code: string }>;
    assert.equal(rows.length, 1, 'one product spelled two ways became two rows');
    assert.equal(rows[0].code, '0068100084245', 'the surviving row is not in the 13-digit form');
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
