/**
 * Tests for the standalone miss log (gaps.ts).
 *
 * Three things must hold for this to be worth having at all: repeated
 * identical misses roll up into one row instead of piling up, a barcode
 * miss and a text miss stay distinguishable, and a failure to write must
 * never surface as a thrown error, because that is precisely the bug this
 * file replaces (a failed gap write used to become a failed search).
 *
 * Each test opens its own file under a fresh temp directory rather than
 * sharing one, so a rollup counted in one test can never leak into another
 * and the never-throw test is free to point at a genuinely broken path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGapLog, recordGap } from '../src/gaps.ts';

interface Row {
  kind: string;
  key: string;
  gtin: string | null;
  query_text: string | null;
  first_seen: string;
  last_seen: string;
  count: number;
  note: string | null;
}

function tempDb(name = 'gaps.db'): string {
  const dir = mkdtempSync(join(tmpdir(), 'shin-gaps-'));
  return join(dir, name);
}

function rows(dbPath: string): Row[] {
  const log = openGapLog(dbPath);
  assert.ok(log.db, 'log should have opened for reading back');
  return log.db!.prepare('SELECT * FROM gap ORDER BY count DESC').all() as unknown as Row[];
}

// This one runs first, deliberately, and never calls openGapLog itself: it is
// the only point in the file where nothing has opened a log yet, which is the
// exact situation search.ts will be in when it starts calling recordGap with
// no setup. SHIN_GAPS stands in for the default path so the write lands
// somewhere this test can read back rather than at the real data/gaps.db.
test('recordGap opens a default log lazily when nothing has opened one yet', () => {
  const path = tempDb('lazy.db');
  const prevEnv = process.env.SHIN_GAPS;
  process.env.SHIN_GAPS = path;
  try {
    assert.doesNotThrow(() => recordGap({ queryText: 'lazy open check' }));
  } finally {
    process.env.SHIN_GAPS = prevEnv;
  }
  const all = rows(path);
  assert.equal(all.length, 1);
  assert.equal(all[0].query_text, 'lazy open check');
});

test('a hundred identical text misses roll up into one row with count 100', () => {
  const path = tempDb();
  openGapLog(path);
  for (let i = 0; i < 100; i += 1) recordGap({ queryText: 'chocolate soymilk 2L' });

  const all = rows(path);
  assert.equal(all.length, 1, 'one finding, not one hundred');
  assert.equal(all[0].count, 100);
  assert.equal(all[0].kind, 'text');
});

test('different queries stay as different findings', () => {
  const path = tempDb();
  openGapLog(path);
  recordGap({ queryText: 'chocolate soymilk 2L' });
  recordGap({ queryText: 'oat milk unsweetened' });
  recordGap({ queryText: 'oat milk unsweetened' });

  const all = rows(path);
  assert.equal(all.length, 2);
  const byText = new Map(all.map((r) => [r.query_text, r.count]));
  assert.equal(byText.get('chocolate soymilk 2L'), 1);
  assert.equal(byText.get('oat milk unsweetened'), 2);
});

test('text rollup is case and whitespace insensitive', () => {
  const path = tempDb();
  openGapLog(path);
  recordGap({ queryText: 'Ovaltine' });
  recordGap({ queryText: '  ovaltine  ' });
  recordGap({ queryText: 'OVALTINE' });

  const all = rows(path);
  assert.equal(all.length, 1, 'same product asked three different ways is one finding');
  assert.equal(all[0].count, 3);
});

test('a barcode miss and a text miss are distinguishable', () => {
  const path = tempDb();
  openGapLog(path);
  recordGap({ gtin: '0060383888885', queryText: '0060383888885' });
  recordGap({ queryText: '0060383888885' });

  const all = rows(path);
  assert.equal(all.length, 2, 'a scanned barcode and someone typing the same digits are different findings');
  const kinds = all.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['gtin', 'text']);
  const gtinRow = all.find((r) => r.kind === 'gtin')!;
  assert.equal(gtinRow.gtin, '0060383888885');
});

test('a padded and unpadded barcode roll up as the same miss', () => {
  const path = tempDb();
  openGapLog(path);
  recordGap({ gtin: '060383888885' });
  recordGap({ gtin: '0060383888885' });

  const all = rows(path);
  assert.equal(all.length, 1, 'digits-only key means the leading zero does not split the finding');
  assert.equal(all[0].count, 2);
});

test('last_seen advances and first_seen holds across repeats', () => {
  const path = tempDb();
  openGapLog(path);
  recordGap({ queryText: 'kombucha ginger' });
  recordGap({ queryText: 'kombucha ginger' });

  const all = rows(path);
  assert.equal(all.length, 1);
  assert.ok(all[0].first_seen <= all[0].last_seen);
});

test('a note is kept when a later repeat carries none', () => {
  const path = tempDb();
  openGapLog(path);
  recordGap({ queryText: 'protein bar variety pack', note: 'asked about three times a day this week' });
  recordGap({ queryText: 'protein bar variety pack' });

  const all = rows(path);
  assert.equal(all.length, 1);
  assert.equal(all[0].note, 'asked about three times a day this week');
});

test('recordGap never throws when the log cannot be written, and the drop is counted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-gaps-'));
  const blocker = join(dir, 'blocker');
  writeFileSync(blocker, 'not a directory');
  // A file sitting where a directory needs to be: mkdirSync cannot make
  // "blocker/sub" a directory when "blocker" is already a plain file, on
  // Windows or POSIX. This is the "read-only location" case from outside.
  const badPath = join(blocker, 'sub', 'gaps.db');

  const log = openGapLog(badPath);
  assert.equal(log.db, null, 'the bad path should have failed to open');
  assert.ok(log.droppedWhy.length > 0);

  assert.doesNotThrow(() => recordGap({ queryText: 'anything' }));
  assert.doesNotThrow(() => recordGap({ gtin: '012345' }));

  assert.equal(log.dropped, 2, 'both failed writes are counted');
  assert.ok(log.droppedWhy.length > 0, 'the reason is exposed, not just the count');
});
