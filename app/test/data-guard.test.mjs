/**
 * The test run never touches real data (Jamin, 2026-09-28: "build it so tests
 * can never touch real data").
 *
 * The run-level checks are in test/setup/global.mjs. This file checks the
 * pieces they rest on: every path setting is recognised, every one points into
 * this process's temp folder, a value a test chose is kept while a real one is
 * replaced, and the folder comparison really does see an added, changed and
 * deleted file (a guard that cannot go red is not a guard).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DEFAULT_DATA_ROOTS,
  RUN_TEMP_VAR,
  isInside,
  pathSettings,
  snapshotTree,
  treeDifferences,
} from './setup/data-paths.mjs';

/** A pin, not the source: the source is settings/src/index.ts. These must never drop out. */
const KNOWN = [
  'SHIN_DATA_DIR',
  'SHIN_PHOTOS',
  'SHIN_SHUTTER_DIR',
  'SHIN_ACCESS_LOG',
  'SHIN_REPEAT_CACHE',
  'SHIN_SCANS',
  'SHIN_GAPS',
  'SHIN_USER_CATALOGUE',
  'SHIN_PEOPLE_DB',
  'SHIN_CATALOGUE',
  'SHIN_PRICES',
  'SHIN_CORRECTIONS',
  'SHIN_SPEND_CAP_STORE_PATH',
  'SHIN_RANGE_ASK_STORE_PATH',
];

test('every known path setting is recognised as a path, and no switch or URL is', async () => {
  const names = (await pathSettings()).map((s) => s.env);
  for (const k of KNOWN) assert.ok(names.includes(k), `${k} is not recognised as a path setting`);
  for (const not of ['SHIN_SHUTTER_LOG', 'SHIN_OVERPASS', 'SHIN_FREE_SCANS_PER_WEEK', 'PORT', 'GEMINI_API_KEY']) {
    assert.ok(!names.includes(not), `${not} was taken for a path`);
  }
});

test('this test process has every path setting in a temp folder, none in real data', async () => {
  const temp = resolve(tmpdir());
  for (const s of await pathSettings()) {
    const v = process.env[s.env];
    assert.ok(v, `${s.env} is unset: run the suite through \`npm test\`, whose global setup sets it`);
    assert.ok(isInside(v, temp), `${s.env} is not in the temp folder: ${v}`);
    for (const root of DEFAULT_DATA_ROOTS) assert.ok(!isInside(v, root), `${s.env} is inside real data: ${v}`);
    if (process.env[RUN_TEMP_VAR]) assert.ok(!isInside(v, process.env[RUN_TEMP_VAR]), `${s.env} is the shared placeholder`);
  }
});

test('child.mjs keeps a temp path a test chose and replaces a real one and the placeholder', () => {
  const child = pathToFileURL(fileURLToPath(new URL('./setup/child.mjs', import.meta.url))).href;
  const scratch = mkdtempSync(join(tmpdir(), 'shin-guard-child-'));
  const runTemp = join(scratch, 'run');
  const chosen = join(scratch, 'chosen-scans.db');
  const realDataDir = DEFAULT_DATA_ROOTS[0];
  const env = { ...process.env, NODE_OPTIONS: '', [RUN_TEMP_VAR]: runTemp, SHIN_SCANS: chosen, SHIN_DATA_DIR: realDataDir, SHIN_GAPS: join(runTemp, 'gaps.db') };
  delete env.SHIN_PHOTOS;
  const out = JSON.parse(
    execFileSync(process.execPath, [`--import=${child}`, '-e', 'console.log(JSON.stringify({s:process.env.SHIN_SCANS,d:process.env.SHIN_DATA_DIR,g:process.env.SHIN_GAPS,p:process.env.SHIN_PHOTOS}))'], { env, encoding: 'utf8' }),
  );
  rmSync(scratch, { recursive: true, force: true });
  assert.equal(out.s, chosen, 'a temp path the test chose was overwritten');
  assert.ok(!isInside(out.d, realDataDir), `a real SHIN_DATA_DIR was kept: ${out.d}`);
  assert.ok(!isInside(out.g, runTemp), `the shared placeholder was kept: ${out.g}`);
  assert.ok(out.p && isInside(out.p, tmpdir()), `an unset SHIN_PHOTOS was not given a temp folder: ${out.p}`);
});

test('the folder comparison names an added, a changed and a deleted file, and nothing when untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'shin-guard-tree-'));
  try {
    mkdirSync(join(root, 'photos'));
    writeFileSync(join(root, 'photos', 'a.jpg'), 'a');
    writeFileSync(join(root, 'scans.db'), 'rows');
    writeFileSync(join(root, 'scans.db-shm'), 'index');
    const before = snapshotTree([root]);
    assert.deepEqual(treeDifferences(before, snapshotTree([root])), [], 'an untouched folder reads as changed');

    writeFileSync(join(root, 'scans.db-shm'), 'index rewritten by a reader');
    assert.deepEqual(treeDifferences(before, snapshotTree([root])), [], 'a -shm rewrite by a reader is not data');

    writeFileSync(join(root, 'new.txt'), 'x');
    utimesSync(join(root, 'scans.db'), new Date(0), new Date(0));
    unlinkSync(join(root, 'photos', 'a.jpg'));
    const lines = treeDifferences(before, snapshotTree([root]));
    assert.ok(lines.includes(`added: ${join(root, 'new.txt')}`), lines.join('; '));
    assert.ok(lines.some((l) => l.startsWith(`changed: ${join(root, 'scans.db')} `)), lines.join('; '));
    assert.ok(lines.includes(`deleted: ${join(root, 'photos', 'a.jpg')}`), lines.join('; '));

    rmSync(join(root, 'photos'), { recursive: true });
    assert.ok(treeDifferences(before, snapshotTree([root])).includes(`deleted: ${join(root, 'photos')}`), 'a deleted folder was not named');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
