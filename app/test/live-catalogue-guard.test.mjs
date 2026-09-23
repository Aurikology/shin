/**
 * The test run never touches the real user catalogue (2026-09-23).
 *
 * The run-level check is in test/setup/global.mjs: it snapshots the real file
 * before the run and fails the run if the row counts or modified times differ
 * after. This file checks the two halves that check rests on: every test
 * process really is pointed at a temp file, and the snapshot comparison really
 * does see a write (a guard that cannot go red is not a guard).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { REAL_USER_CATALOGUE, differences, snapshot } from './setup/live-guard.mjs';

test('this test process was given a temp user catalogue, never the real one', () => {
  const path = process.env.SHIN_USER_CATALOGUE;
  assert.ok(path, 'SHIN_USER_CATALOGUE is unset: run the suite through `npm test`, whose global setup sets it');
  assert.ok(resolve(path).toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()), `not a temp file: ${path}`);
  assert.notEqual(resolve(path).toLowerCase(), resolve(REAL_USER_CATALOGUE).toLowerCase());
});

test('the snapshot comparison sees a scan written into a catalogue, and nothing when there was none', async () => {
  const { createUserCatalogue, recordUserScan } = await import('../../catalogue/src/user-catalogue.ts');
  const path = join(mkdtempSync(join(tmpdir(), 'shin-guard-')), 'user-catalogue.db');
  const uc = createUserCatalogue(path);
  uc.db.close();
  const before = snapshot(path);
  assert.deepEqual(differences(before, snapshot(path)), [], 'a catalogue nobody wrote to reads as changed');
  const again = createUserCatalogue(path);
  recordUserScan({ name: 'Guard Test Beans', brand: 'Nobody', offers: [{ retailer: 'Somewhere', price: 1, raw: { currency: 'CAD' } }] }, { log: again });
  again.db.close();
  const changed = differences(before, snapshot(path));
  assert.ok(changed.some((c) => c.startsWith('user_product: 0 -> 1')), `the new product was not seen: ${changed.join('; ')}`);
  assert.ok(changed.some((c) => c.startsWith('user_offer: 0 -> 1')), `the new offer was not seen: ${changed.join('; ')}`);
});
