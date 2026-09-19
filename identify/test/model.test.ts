/**
 * The one thing left in `model.ts` that a test still has to pin: the
 * `FailureClass` vocabulary.
 *
 * 2026-09-19: the two-pass `Identifier` (the read pass plus the pick pass)
 * this file used to test was deleted as part of the identification-by-
 * catalogue retirement -- every scan (photo, barcode, typed name) is one
 * Gemini call now (`identify/src/providers/gemini-scan.ts`), and nothing
 * live constructs an `Identifier` any more. The timeout/retry/cap tests that
 * used to live here (added 2026-09-08 off the beta readiness audit) went
 * with it; `identify/test/fallback.test.ts`, `identify/test/gemini-scan.test.ts`
 * and `identify/test/provider.test.ts` cover the live path's own retry and
 * failure handling.
 *
 * `FailureClass` itself is still live (`cap.ts`, `provider.ts` and
 * `gemini-scan.ts` all import it), and it is copied into two other packages
 * that do not import this one (`spine/src/run.ts` and `app/src/scans.ts`,
 * both say so in their own comments). A copy nothing checks is a copy that
 * drifts, so this checks it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('every failure class exists in the two files that restate it', () => {
  const here = import.meta.dirname;
  const source = readFileSync(join(here, '..', 'src', 'model.ts'), 'utf8');
  const union = source.slice(source.indexOf('export type FailureClass ='));
  const classes = [...union.slice(0, union.indexOf(';')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(classes.length >= 6, `expected the union to be found, read ${classes.length} members`);

  for (const relative of [['..', '..', 'spine', 'src', 'run.ts'], ['..', '..', 'app', 'src', 'scans.ts']]) {
    const text = readFileSync(join(here, ...relative), 'utf8');
    for (const name of classes) {
      assert.ok(text.includes(`'${name}'`), `${relative.join('/')} is missing the class ${name}`);
    }
  }
});
