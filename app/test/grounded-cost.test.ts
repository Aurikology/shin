/**
 * What a grounded call cost, written to the scan row. Rule 4.
 *
 * THIS FILE EXISTS BECAUSE THE TESTS PASSED WITHOUT IT. `keepGroundedForOwner`
 * wraps the cost lookup in a try/catch so that a cost it cannot read never
 * costs the shopper their history -- which means a broken cost path writes
 * three nulls and every existing test stays green. That is the same shape as
 * D-117 one layer up: code that reports nothing, indistinguishable from code
 * that reports nothing because there was nothing to report.
 *
 * So these tests assert the columns hold REAL NUMBERS, not that the write
 * returned true.
 *
 * `app/tsconfig.json` does not include `test/`, so a stub that stops matching
 * `GroundedModule` is caught by neither the typechecker nor the runtime. That
 * is D-118 and it is why the fake below is kept complete by hand.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openScanStore, recordScan } from '../src/scans.ts';
import {
  keepGroundedForOwner,
  setGroundedModuleForTests,
  type Grounded,
  type GroundedModule,
} from '../src/grounded-record.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-grounded-cost-'));

interface FakeBox {
  owner: string;
  text: string;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  searchQueries: number;
}

const fakeModule: GroundedModule = {
  toWire(box, requestedBy) {
    const b = box as unknown as FakeBox;
    if (b.owner !== requestedBy) throw new Error('cross-user request');
    return { kind: 'grounded', forDevice: requestedBy, fetchedAt: 'T', block: {}, suggestionsHtml: '<div></div>' };
  },
  historyText(box, owner) {
    const b = box as unknown as FakeBox;
    if (b.owner !== owner) throw new Error('cross-user request');
    return b.text;
  },
  discard() {},
  provenanceOf(box) {
    const b = box as unknown as FakeBox;
    return {
      forDevice: b.owner,
      fetchedAt: '2026-09-16T00:00:00.000Z',
      promptId: 'prices_reviews_description',
      provider: 'gemini',
      searchQueries: b.searchQueries,
      model: b.model,
      usage: b.usage,
    };
  },
};

/** A real grounded price call, as measured on 2026-09-16: four search queries. */
const box = (over: Partial<FakeBox> = {}): Grounded<unknown> =>
  ({
    owner: 'device-A',
    text: 'the answer',
    model: 'gemini-3.5-flash-lite',
    usage: { inputTokens: 2459, outputTokens: 600 },
    searchQueries: 4,
    ...over,
  }) as unknown as Grounded<unknown>;

function scanFor(device: string): number {
  const id = recordScan({ deviceId: device, kind: 'barcode', query: '0068100084245', outcome: 'answered' });
  assert.ok(id !== null, 'the scan log would not write');
  return id as number;
}

interface CostRow {
  c: number | null;
  m: string | null;
  q: number | null;
}

function costOf(scanId: number): CostRow {
  const db = openScanStore(join(dir, 'scans.db')).db;
  assert.ok(db, 'the scan store is not open');
  const row = db
    .prepare('SELECT grounded_cost_cents AS c, grounded_model AS m, grounded_queries AS q FROM scan WHERE id = ?')
    .get(scanId) as unknown as CostRow | undefined;
  assert.ok(row, 'no scan row');
  return row;
}

before(() => {
  openScanStore(join(dir, 'scans.db'));
  setGroundedModuleForTests(fakeModule);
});

after(() => {
  setGroundedModuleForTests(null);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /*
     * Windows holds the SQLite file open until the handle is collected, so the
     * directory refuses to go and `force` does not cover EPERM. It is a temp
     * directory the OS clears anyway, and failing the suite over it would
     * report a passing feature as broken.
     */
  }
});

test('a grounded call writes what it cost, the model that answered, and how much searching it did', () => {
  const id = scanFor('device-A');
  assert.equal(keepGroundedForOwner(id, 'device-A', box()), true);

  const row = costOf(id);
  assert.equal(row.m, 'gemini-3.5-flash-lite');
  assert.equal(row.q, 4);
  // (2459 x 0.30 + 600 x 2.50) / 1e6 USD = 0.0022377 -> 0.2238 cents. The four
  // searches add nothing because the first 5,000 a month are free.
  assert.equal(row.c, 0.2238);
});

test('the cost is a fraction of a cent, so the column must not be an integer', () => {
  /*
   * An INTEGER column would have stored 0.2238 as 0 and every scan would have
   * read as free. Asserted rather than assumed because the schema is the only
   * place that decides it and nothing else would ever complain.
   */
  const id = scanFor('device-A');
  keepGroundedForOwner(id, 'device-A', box());
  const stored = costOf(id).c;
  assert.ok(stored !== null && stored > 0 && stored < 1, `a sub-cent cost did not survive the column: ${stored}`);
  assert.notEqual(stored, 0, 'the cost was rounded to zero by the column type');
});

test('the better model is recorded as costing more, which is the decision this table has to answer', () => {
  const lite = scanFor('device-A');
  const flash = scanFor('device-A');
  keepGroundedForOwner(lite, 'device-A', box());
  keepGroundedForOwner(flash, 'device-A', box({ model: 'gemini-3.8-flash' }));

  const a = costOf(lite).c;
  const b = costOf(flash).c;
  assert.ok(a !== null && b !== null);
  assert.equal(a, 0.2238);
  assert.equal(b, 0.4094);
  assert.ok(b > a);
});

test('a call that reported no usage is unknown, never a recorded zero', () => {
  /*
   * HARD RULE 3's shape: a null is the absence of a measurement and a zero is
   * a measurement. A model with no rate, or a response with no counts, must
   * not land in this column as free.
   */
  const noUsage = scanFor('device-A');
  keepGroundedForOwner(noUsage, 'device-A', box({ usage: null, searchQueries: 0 }));
  assert.equal(costOf(noUsage).c, null);

  const unknownModel = scanFor('device-A');
  keepGroundedForOwner(unknownModel, 'device-A', box({ model: 'gemini-9-unreleased', searchQueries: 0 }));
  assert.equal(costOf(unknownModel).c, null, 'a model with no rate was priced as free');
  // The model name is still recorded, because knowing WHICH model we could not
  // price is how the rate table gets fixed.
  assert.equal(costOf(unknownModel).m, 'gemini-9-unreleased');
});

test('a cost that cannot be read does not cost the shopper their history', () => {
  /*
   * The try/catch this file's header is about, asserted in the one direction
   * that matters: the text still lands, and the columns are honestly null.
   */
  const broken: GroundedModule = {
    ...fakeModule,
    provenanceOf() {
      throw new Error('the envelope could not be read');
    },
  };
  setGroundedModuleForTests(broken);
  const id = scanFor('device-A');
  try {
    assert.equal(keepGroundedForOwner(id, 'device-A', box()), true, 'the history write was lost with the cost');
    const row = costOf(id);
    assert.equal(row.c, null);
    assert.equal(row.m, null);
    assert.equal(row.q, null);
  } finally {
    setGroundedModuleForTests(fakeModule);
  }
});

test('a cross-user write stores no cost either, because it stores nothing', () => {
  const id = scanFor('device-A');
  assert.equal(keepGroundedForOwner(id, 'device-B', box({ owner: 'device-B' })), false);
  assert.equal(costOf(id).c, null, 'a refused write left a cost behind');
});
