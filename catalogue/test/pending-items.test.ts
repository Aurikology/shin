/**
 * Requirement 5.7: every unknown barcode or unmatched typed name becomes a pending
 * catalogue item that keeps its raw text, and "count in against stored" is a check
 * that fails loudly, not an assumption.
 *
 * Each test has a reason it can go red. The reconciliation tests carry a known-good
 * control (an honest run reconciles) and known-bad controls (a row deleted, a count
 * wound back, a pending item deleted, a log that cannot open) that it must reject.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGapLog, recordGap, reconcileGaps, assertGapsReconciled } from '../src/gaps.ts';
import { createUserCatalogue } from '../src/user-catalogue.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'shin-pending-'));
}

function pending(dir: string) {
  const uc = createUserCatalogue(join(dir, 'user-catalogue.db'));
  return uc.db!.prepare('SELECT name, gtin, bare FROM user_product ORDER BY id').all() as unknown as {
    name: string;
    gtin: string | null;
    bare: number;
  }[];
}

// ── the gaps in the audit ────────────────────────────────────────────────────

test('5.7 a two-letter typed name that misses is kept as a pending item with its raw text', () => {
  const dir = tempDir();
  const log = openGapLog(join(dir, 'gaps.db'));
  recordGap({ queryText: 'Ab' });
  const g = log.db!.prepare('SELECT query_text, count FROM gap').all() as unknown as { query_text: string; count: number }[];
  assert.deepEqual(g.map((r) => r.query_text), ['Ab'], 'the review log keeps the raw text');
  assert.deepEqual(pending(dir).map((r) => r.name), ['Ab'], 'and so does the pending-item table');
});

test('5.7 different short names are different pending items, not one merged blank', () => {
  const dir = tempDir();
  openGapLog(join(dir, 'gaps.db'));
  recordGap({ queryText: 'Ab' });
  recordGap({ queryText: 'Zq' });
  recordGap({ queryText: 'a' }); // a stop word: no tokens at all
  recordGap({ queryText: 'the' });
  assert.deepEqual(pending(dir).map((r) => r.name).sort(), ['Ab', 'Zq', 'a', 'the']);
});

test('5.7 control: a normal name and a bare barcode are kept (passes before and after)', () => {
  const dir = tempDir();
  openGapLog(join(dir, 'gaps.db'));
  recordGap({ queryText: 'Maple Sriracha Sauce' });
  recordGap({ gtin: '5449000000996' });
  const rows = pending(dir);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.name === 'Maple Sriracha Sauce'));
  assert.ok(rows.some((r) => r.gtin === '5449000000996' && r.bare === 1));
});

test('5.7 recording does not depend on a catalogue being attached: no catalogue anywhere, barcode and name both kept', () => {
  const dir = tempDir();
  // Nothing opens a catalogue in this test. catalogueMissing is false: "nobody looked", not "we hold it".
  const log = openGapLog(join(dir, 'gaps.db'));
  recordGap({ gtin: '9300633603990', catalogueMissing: false });
  recordGap({ queryText: 'oat drink', catalogueMissing: false });
  const g = log.db!.prepare('SELECT kind, catalogue_missing FROM gap ORDER BY kind').all() as unknown as {
    kind: string;
    catalogue_missing: number;
  }[];
  assert.deepEqual(g.map((r) => ({ ...r })), [
    { kind: 'gtin', catalogue_missing: 0 },
    { kind: 'text', catalogue_missing: 0 },
  ]);
  assert.equal(pending(dir).length, 2);
  assert.equal(reconcileGaps(log).ok, true);
});

test('5.7 a barcode miss that arrives first without words does not lose the words that arrive later', () => {
  const dir = tempDir();
  const log = openGapLog(join(dir, 'gaps.db'));
  recordGap({ gtin: '5449000000996' });
  recordGap({ gtin: '5449000000996', queryText: 'Coca-Cola 330 ml' });
  const [r] = log.db!.prepare('SELECT query_text, count FROM gap').all() as unknown as { query_text: string | null; count: number }[];
  assert.equal(r.count, 2);
  assert.equal(r.query_text, 'Coca-Cola 330 ml');
});

test('5.7 a pending item that cannot be written is said out loud, not swallowed', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'blocker'), 'not a directory');
  process.env.SHIN_USER_CATALOGUE = join(dir, 'blocker', 'sub', 'uc.db');
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...a: unknown[]) => {
    warnings.push(a.join(' '));
  };
  try {
    openGapLog(join(dir, 'gaps.db'));
    recordGap({ queryText: 'Maple Sriracha Sauce' });
  } finally {
    console.warn = realWarn;
    delete process.env.SHIN_USER_CATALOGUE;
  }
  assert.ok(warnings.some((w) => /pending_item_dropped/.test(w)), `expected a pending_item_dropped warning, got ${JSON.stringify(warnings)}`);
});

// ── count in against stored ──────────────────────────────────────────────────

function honestRun(dir: string) {
  const log = openGapLog(join(dir, 'gaps.db'));
  recordGap({ gtin: '0123456789012', queryText: 'Maple Sriracha Sauce' });
  recordGap({ gtin: '123456789012' }); // the same barcode, zero-padded: one finding
  recordGap({ queryText: 'Ovaltine' });
  recordGap({ queryText: 'ovaltine' });
  recordGap({ queryText: 'xy' });
  return log;
}

test('5.7 control (known good): an honest run reconciles, offered equals stored', () => {
  const dir = tempDir();
  const log = honestRun(dir);
  const r = reconcileGaps(log);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.offered, 5);
  assert.equal(r.stored, 5);
  assert.equal(r.pendingOffered, 5);
  assert.equal(r.pendingStored, 5);
  assert.doesNotThrow(() => assertGapsReconciled(log));
});

test('5.7 control (known bad): a deleted gap row fails reconciliation, with counts and the lost text', () => {
  const dir = tempDir();
  const log = honestRun(dir);
  log.db!.prepare("DELETE FROM gap WHERE key = 'xy'").run();
  const r = reconcileGaps(log);
  assert.equal(r.ok, false);
  assert.equal(r.offered, 5);
  assert.equal(r.stored, 4);
  assert.match(JSON.stringify(r.lost), /xy/);
  assert.throws(
    () => assertGapsReconciled(log),
    (e: Error) => /offered 5/.test(e.message) && /stored 4/.test(e.message) && /xy/.test(e.message),
  );
});

test('5.7 control (known bad): a count wound back fails reconciliation', () => {
  const dir = tempDir();
  const log = honestRun(dir);
  log.db!.prepare("UPDATE gap SET count = 1 WHERE key = 'ovaltine'").run();
  const r = reconcileGaps(log);
  assert.equal(r.ok, false);
  assert.equal(r.stored, 4);
  assert.match(JSON.stringify(r.lost), /Ovaltine/);
});

test('5.7 control (known bad): a missing raw text on a text miss fails reconciliation', () => {
  const dir = tempDir();
  const log = honestRun(dir);
  log.db!.prepare("UPDATE gap SET query_text = NULL WHERE key = 'ovaltine'").run();
  const r = reconcileGaps(log);
  assert.equal(r.ok, false);
  assert.match(JSON.stringify(r.rawTextMissing), /ovaltine/i);
});

test('5.7 control (known bad): a pending item deleted from the user catalogue fails reconciliation', () => {
  const dir = tempDir();
  const log = honestRun(dir);
  const uc = createUserCatalogue(join(dir, 'user-catalogue.db'));
  uc.db!.prepare("DELETE FROM user_product WHERE name = 'xy'").run();
  const r = reconcileGaps(log);
  assert.equal(r.ok, false);
  assert.equal(r.pendingStored, 4);
  assert.match(JSON.stringify(r.pendingLost), /xy/);
});

test('5.7 control (known bad): a log that never opened loses every miss, and reconciliation says so', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'blocker'), 'not a directory');
  const log = openGapLog(join(dir, 'blocker', 'sub', 'gaps.db'));
  recordGap({ gtin: '5449000000996' });
  recordGap({ queryText: 'Ovaltine' });
  const r = reconcileGaps(log);
  assert.equal(r.ok, false);
  assert.equal(r.offered, 2);
  assert.equal(r.stored, 0);
  assert.throws(() => assertGapsReconciled(log), /offered 2.*stored 0/s);
});

test('5.7 an existing file keeps its history: misses from before this handle opened are not counted as lost', () => {
  const dir = tempDir();
  openGapLog(join(dir, 'gaps.db'));
  recordGap({ queryText: 'Ovaltine' });
  const log = openGapLog(join(dir, 'gaps.db'));
  recordGap({ queryText: 'Ovaltine' });
  const r = reconcileGaps(log);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.offered, 1);
  assert.equal(r.stored, 1);
});
