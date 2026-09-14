/**
 * Reproduction script for the piece5-verdict-resubmission.json finding, not a
 * committed test (not named *.test.ts, so `npm test` never runs it and a real
 * fix to codeMatchesGauge or verdictResubmissionRequest cannot turn this red
 * on someone else's machine). Run by hand: `node check-piece5.ts` from this
 * directory.
 *
 * Shows, against the real exported functions in ../../src/gauge.ts:
 *   1. codeMatchesGauge rejects the full block Gemini's sandbox actually ran
 *      (function definition + the call site Gemini had to add to invoke it).
 *   2. codeMatchesGauge accepts the function definition alone, once the call
 *      site is stripped off -- proving the function itself came back
 *      unmodified and the rejection in (1) is a match-checking gap, not a
 *      sign Gemini changed the arithmetic.
 */
import { readFileSync } from 'node:fs';
import { codeMatchesGauge, GAUGE_PYTHON_SOURCE } from '../../../src/gauge.ts';

const executed = readFileSync(new URL('./piece5-executed-code-run-a.txt', import.meta.url), 'utf8');

console.log('codeMatchesGauge(full captured block, def+callsite):', codeMatchesGauge(executed));

const cutIdx = executed.indexOf('\nshelf = {"price"');
const defOnly = executed.slice(0, cutIdx);
console.log('codeMatchesGauge(function definition only, no call site):', codeMatchesGauge(defOnly));

console.log('GAUGE_PYTHON_SOURCE length:', GAUGE_PYTHON_SOURCE.length);
console.log('defOnly length:', defOnly.length);
console.log('executed length:', executed.length);
