/**
 * Price-category plan, Stage 3: requirement 2.2's measurement (docs/price-category-
 * requirements-2026-10-01.md line 46): "95%+ right at category-or-parent (190 of 200)
 * on 200+ random hand-checked items per route, with the 95% lower bound reported".
 *
 * A sampler draws 200 random placed items per route into a sheet a PERSON marks; a
 * scorer reads the marked sheet and gives the share right and its exact one-sided
 * 95% lower bound. Nothing here marks anything. Written before placement-audit.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AUDIT_COLUMNS,
  AUDIT_PER_ROUTE,
  auditSheetCsv,
  clopperPearsonLower,
  drawAuditSample,
  parseCsv,
  scoreAuditSheet,
  writeAuditSheet,
} from '../src/placement-audit.ts';
import { placedFixture, type FixtureRow } from './helpers/placement-fixture.ts';
import { runCascade } from '../src/placement-cascade.ts';

/* ---------------------------------------------------------- the bound */

test('2.2 the lower bound is the exact one-sided 95% Clopper-Pearson bound', () => {
  assert.ok(Math.abs(clopperPearsonLower(59, 59) - 0.05 ** (1 / 59)) < 1e-6, '59 of 59 is the smallest all-right sample that proves 95%');
  assert.ok(clopperPearsonLower(59, 59) >= 0.95);
  assert.ok(clopperPearsonLower(58, 58) < 0.95);
  assert.ok(Math.abs(clopperPearsonLower(48, 50) - 0.879) < 0.001, `the requirement's own figure: 48 of 50 proves only 0.879, got ${clopperPearsonLower(48, 50)}`);
  assert.equal(clopperPearsonLower(0, 10), 0);
  const b = clopperPearsonLower(190, 200);
  assert.ok(b > 0.91 && b < 0.93, `190 of 200 gives about 0.917, got ${b}`);
  assert.throws(() => clopperPearsonLower(5, 4), /k/);
  assert.throws(() => clopperPearsonLower(0, 0), /n/);
});

/* ------------------------------------------------------------ the draw */

function bigFixture(): FixtureRow[] {
  const rows: FixtureRow[] = [];
  for (let i = 0; i < 250; i++) rows.push({ code: `P${i}`, source: 'openfoodfacts', path: ['en:dairies', 'en:cheeses'], name: `cheese, "aged" ${i}` });
  for (let i = 0; i < 30; i++) rows.push({ code: `U${i}`, source: 'openfoodfacts', path: [], name: `unknown ${i}\nsecond line` });
  return rows;
}

test('2.2 the sampler draws 200 random placed items per route, the same 200 for the same seed, with every mark column blank', async () => {
  assert.equal(AUDIT_PER_ROUTE, 200);
  const db = placedFixture(bigFixture());
  await runCascade(db, { routes: [], log: () => {} });
  const a = drawAuditSample(db, { seed: 42 });
  const b = drawAuditSample(db, { seed: 42 });
  const c = drawAuditSample(db, { seed: 43 });
  const path = a.rows.filter((r) => r.route === 'path');
  assert.equal(path.length, 200, '250 available, 200 drawn');
  assert.equal(new Set(path.map((r) => r.code)).size, 200, 'no item twice');
  assert.deepEqual(a.rows.map((r) => r.code), b.rows.map((r) => r.code));
  assert.notDeepEqual(a.rows.map((r) => r.code), c.rows.map((r) => r.code));
  for (const r of a.rows) {
    assert.equal(r.right_at_category_or_parent, '');
    assert.equal(r.marked_by, '');
  }
  const top = a.rows.filter((r) => r.route === 'top-level');
  assert.equal(top.length, 30);
  assert.deepEqual(a.shortfall['top-level'], { wanted: 200, available: 30 }, 'a route with fewer than 200 is drawn whole and the shortfall is reported');
});

test('2.2 the sheet round-trips through CSV with commas, quotes and line breaks in names; an existing sheet is never overwritten', async () => {
  const db = placedFixture(bigFixture());
  await runCascade(db, { routes: [], log: () => {} });
  const { rows } = drawAuditSample(db, { seed: 1 });
  const csv = auditSheetCsv(rows);
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed[0], [...AUDIT_COLUMNS]);
  assert.equal(parsed.length, rows.length + 1);
  const nameCol = AUDIT_COLUMNS.indexOf('name');
  assert.ok(parsed.slice(1).some((r) => r[nameCol]!.includes('"aged"')));
  assert.ok(parsed.slice(1).some((r) => r[nameCol]!.includes('\n')));
  const dir = mkdtempSync(join(tmpdir(), 'shin-audit-'));
  try {
    const out = join(dir, 'sheet.csv');
    writeAuditSheet(rows, out);
    assert.ok(existsSync(out));
    assert.throws(() => writeAuditSheet(rows, out), /exists|overwrite/, 'a sheet a person may have marked is never written over');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ----------------------------------------------------------- the score */

function sheet(route: string, right: number, wrong: number, unmarked = 0, markedBy = 'Jamin'): string {
  const rows: string[][] = [[...AUDIT_COLUMNS]];
  const idx = (c: string) => AUDIT_COLUMNS.indexOf(c as (typeof AUDIT_COLUMNS)[number]);
  const add = (mark: string, by: string) => {
    const r = AUDIT_COLUMNS.map(() => '');
    r[idx('route')] = route;
    r[idx('code')] = `X${rows.length}`;
    r[idx('right_at_category_or_parent')] = mark;
    r[idx('marked_by')] = by;
    rows.push(r);
  };
  for (let i = 0; i < right; i++) add('y', markedBy);
  for (let i = 0; i < wrong; i++) add('n', markedBy);
  for (let i = 0; i < unmarked; i++) add('', '');
  return rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
}

test('2.2 190 right of 200 passes a route, 189 does not, and both report the 95% lower bound', () => {
  const pass = scoreAuditSheet(sheet('meaning', 190, 10));
  assert.equal(pass.routes.meaning!.pass, true);
  assert.equal(pass.routes.meaning!.right, 190);
  assert.ok(Math.abs(pass.routes.meaning!.lowerBound95 - clopperPearsonLower(190, 200)) < 1e-12);
  const fail = scoreAuditSheet(sheet('meaning', 189, 11));
  assert.equal(fail.routes.meaning!.pass, false);
  assert.equal(fail.pass, false);
});

test('2.2 fewer than 200 marked is never a pass, even all right', () => {
  const s = scoreAuditSheet(sheet('text', 150, 0, 50));
  assert.equal(s.routes.text!.marked, 150);
  assert.equal(s.routes.text!.unmarked, 50);
  assert.equal(s.routes.text!.pass, false);
  assert.equal(s.complete, false);
});

test('2.2 the scorer refuses a mark it cannot read, and a mark nobody signed', () => {
  assert.throws(() => scoreAuditSheet(sheet('text', 1, 0).replace('"y"', '"maybe"')), /maybe/);
  assert.throws(() => scoreAuditSheet(sheet('text', 5, 0, 0, '')), /marked_by/);
  assert.throws(() => scoreAuditSheet('route,code\n"a","b"'), /column/);
  assert.throws(() => scoreAuditSheet(''), /empty|header/);
});

test('2.2 a sheet with marks typed as yes/no or Y/N reads the same as y/n', () => {
  const text = sheet('text', 200, 0).replace(/"y"/g, '"Yes"');
  assert.equal(scoreAuditSheet(text).routes.text!.right, 200);
  assert.equal(scoreAuditSheet(sheet('text', 0, 200).replace(/"n"/g, '"N"')).routes.text!.wrong, 200);
});
