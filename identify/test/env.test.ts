import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnv } from '../src/env.ts';

test('a repo-root .env fills only names that are not already set, and quotes come off', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-env-'));
  const file = join(dir, '.env');
  writeFileSync(file, '# comment\nSHIN_TEST_A="quoted"\nSHIN_TEST_B=plain\nSHIN_TEST_C=kept\n\nnot a pair\n');
  process.env.SHIN_TEST_C = 'already';
  const loaded = loadDotEnv(file);
  assert.deepEqual(loaded, ['SHIN_TEST_A', 'SHIN_TEST_B']);
  assert.equal(process.env.SHIN_TEST_A, 'quoted');
  assert.equal(process.env.SHIN_TEST_B, 'plain');
  assert.equal(process.env.SHIN_TEST_C, 'already', 'a set variable is never overwritten by the file');
});

test('a missing .env is not an error', () => {
  assert.deepEqual(loadDotEnv(join(tmpdir(), 'shin-no-such-dir', '.env')), []);
});
