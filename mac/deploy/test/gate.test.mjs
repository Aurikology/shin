// The deploy gate's test list (review 2026-11-21, old-lists finding 4; D-124's class).
//
// The gate left out the price package ("97 s against 1 s for the others") and four folders of tests
// ran in no gate at all: mac/test, mac/deploy/test, scripts/test, bench/test. price/src/estimate.ts
// computes every verdict, so a push that broke it deployed green. This pins two things: the named
// packages are in the gate, and ANY folder of tests added later is either in the gate or named below
// as left out on purpose, so a new folder cannot silently run nowhere again.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { gateJobs } from '../lib.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const T = { test: 1, typecheck: 2, pkgTest: 3, scriptTest: 99 };

/** Folders of tests the gate does not run, each with the reason. Adding a folder here is a decision. */
const LEFT_OUT = {
  'app/test/ux': 'browser tests (npm run test:ux in app); they need a real browser the stage clone does not drive',
};

const gate = gateJobs(T);
const all = [gate.first, ...gate.rest];

test('the price tests are in the gate: price/src/estimate.ts computes every verdict', () => {
  const job = gate.rest.find((j) => j.covers.includes('price/test'));
  assert.ok(job, 'no gate job covers price/test');
  assert.deepEqual([job.cmd, job.cwd, ...job.args], ['npm', 'price', 'test']);
});

test('the app suite stays first and alone (its teardown snapshots every package data folder)', () => {
  assert.deepEqual(gate.first.covers, ['app/test']);
  assert.ok(!gate.rest.some((j) => j.covers.includes('app/test')));
});

test('the four folders that ran in no gate are in it now', () => {
  const covered = new Set(all.flatMap((j) => j.covers));
  for (const d of ['mac/test', 'mac/deploy/test', 'scripts/test', 'bench/test']) assert.ok(covered.has(d), `${d} runs in no gate job`);
});

test('every folder of tests in the repo is in the gate or named as left out', () => {
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data' || e.name === 'www') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.test\.(ts|mjs|js|cjs)$/.test(e.name)) found.push(relative(REPO, dir).split(sep).join('/'));
    }
  };
  walk(REPO);
  const folders = [...new Set(found)].sort();
  assert.ok(folders.length >= 9, `walked the wrong place: ${folders.join(', ')}`);
  const covered = new Set(all.flatMap((j) => j.covers));
  const loose = folders.filter((f) => !covered.has(f) && !(f in LEFT_OUT));
  assert.deepEqual(loose, [], `these test folders run in no gate job: ${loose.join(', ')}`);
});

test('the script folders run from the stage root through node, each its own job with the long timeout', () => {
  for (const d of ['mac/test', 'mac/deploy/test', 'scripts/test']) {
    const job = all.find((j) => j.covers.includes(d));
    assert.deepEqual(job.covers, [d], `${d} shares a job`);
    assert.equal(job.cmd, 'node');
    assert.equal(job.cwd, '.');
    assert.deepEqual(job.args, ['--test', `${d}/*.test.mjs`]);
    assert.equal(job.t, 99, `${d} should use the scriptTest timeout`);
  }
  assert.equal(new Set(all.map((j) => j.name)).size, all.length, 'job names are log file names and must differ');
  for (const j of all) assert.ok(j.t > 0, `${j.name} has no timeout`);
});
