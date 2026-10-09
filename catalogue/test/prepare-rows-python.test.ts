/**
 * Runs the Python tests for the two prepare jobs (test_prepare_rows.py) as part of `npm test`.
 *
 * Those tests are plain assertions, runnable by pytest or by `python -I test/test_prepare_rows.py`;
 * this wrapper uses the plain runner so the suite needs nothing but Python and duckdb, the same
 * two things the prepare jobs themselves need. Python missing is a failure, not a skip: a skipped
 * check that nobody sees is the silence this file exists to remove.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./test_prepare_rows.py', import.meta.url));

test('the prepare jobs count and report every value they cannot parse (test_prepare_rows.py)', () => {
  let last = '';
  for (const python of ['python', 'python3']) {
    const r = spawnSync(python, ['-I', script], { encoding: 'utf8' });
    if (r.error) {
      last = `${python}: ${r.error.message}`;
      continue;
    }
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /^ok {4}test_/m);
    assert.doesNotMatch(r.stdout, /^FAIL/m);
    return;
  }
  assert.fail(`no Python found to run test_prepare_rows.py (${last})`);
});
