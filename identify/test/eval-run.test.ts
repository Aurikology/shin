/**
 * The eval runner is guarded, because for a while nothing guarded it.
 *
 * D-090: `identify/tsconfig.json` included only `src/**` and `test/**`, and
 * `eval/run.ts` invoked `run()` at module load so nothing could import it. A
 * broken string literal in that file produced a clean `tsc --noEmit` AND a
 * clean 96-test run, and surfaced only when somebody executed the script by
 * hand. That file computes cost per correct identification, which `QUEUE.md`
 * P2 names as the number that chooses the model tiers.
 *
 * The single most valuable line in this file is the import at the top. Every
 * assertion below could be deleted and a parse error in the runner would still
 * fail here, which is the thing that was missing. The rest guards the argument
 * surface, because a flag that silently parses to the wrong value spends real
 * money on the wrong model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../eval/run.ts';

test('the runner can be imported at all, which is the whole point of this file', () => {
  assert.equal(typeof parseArgs, 'function');
});

test('defaults: pro tier, whole manifest, no dry run, no matrix, real catalogue', () => {
  const a = parseArgs([]);
  assert.equal(a.tier, 'pro');
  assert.equal(a.limit, null);
  assert.equal(a.only, null);
  assert.equal(a.dryRun, false);
  assert.equal(a.matrix, false);
  assert.equal(a.fakeCatalogue, false);
});

test('--tier basic is honoured, because the tier decides which model is billed', () => {
  assert.equal(parseArgs(['--tier', 'basic']).tier, 'basic');
  assert.equal(parseArgs(['--tier', 'pro']).tier, 'pro');
});

test('--limit parses as a number and not as a string, so N rows means N rows', () => {
  const a = parseArgs(['--limit', '7']);
  assert.equal(a.limit, 7);
  assert.equal(typeof a.limit, 'number');
});

test('--only carries a single code through untouched', () => {
  assert.equal(parseArgs(['--only', '0057000013165']).only, '0057000013165');
});

test('--dry-run and --matrix are independent flags', () => {
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--dry-run']).matrix, false);
  assert.equal(parseArgs(['--matrix']).matrix, true);
  assert.equal(parseArgs(['--matrix']).dryRun, false);
  const both = parseArgs(['--matrix', '--dry-run']);
  assert.equal(both.matrix, true);
  assert.equal(both.dryRun, true);
});

test('--fake-catalogue is OFF unless asked for, and a number out of it is not a result', () => {
  // Guarded explicitly because this flag grades the manifest against itself.
  // The default must never drift to true: a silent fake-catalogue run would
  // print a perfect top-1 that means nothing, which is exactly the misreading
  // the repo has already had once with a dry run's 40 of 40.
  assert.equal(parseArgs([]).fakeCatalogue, false);
  assert.equal(parseArgs(['--dry-run']).fakeCatalogue, false);
  assert.equal(parseArgs(['--matrix']).fakeCatalogue, false);
  assert.equal(parseArgs(['--fake-catalogue']).fakeCatalogue, true);
});

test('flag order does not change the parse', () => {
  const a = parseArgs(['--dry-run', '--tier', 'basic', '--limit', '3']);
  const b = parseArgs(['--limit', '3', '--tier', 'basic', '--dry-run']);
  assert.deepEqual(a, b);
});
