/**
 * The refusal reason, on its way to a shopper. D-011's app half.
 *
 * The engine's refusal reasons are a CLOSED union in `spine/src/contract.ts`,
 * and this app has two tables keyed off it: the sentence each code is spoken
 * as (`refusalLabel` in voice.js) and the set of codes that mean "we found
 * prices and none of them settle it" (`isThinReason` in camera.js). Both are
 * seams, and both have already failed at that seam:
 *
 *   The sheet printed `r.reason.replace(/_/g, ' ')`, so "TOO FEW POINTS"
 *   reached a shopper mid aisle, under a sentence that contradicted it.
 *
 *   The thin set was written when there were four codes and stayed at four
 *   when the engine split its filter conditions into seven, so a Tide refusal
 *   holding thirteen prices was titled "could not identify it".
 *
 * Neither is caught by reading either file: they are only wrong RELATIVE to a
 * union that lives in another package. So this reads that union out of
 * contract.ts rather than restating it, and a code added there fails here.
 *
 * Reading a type out of a .ts file by regex is deliberate and is the same
 * trade tokens.test.mjs makes reading tokens.css as text: the app is
 * zero-runtime-dependency by decision, the alternative is a TypeScript parse
 * for one union, and the parse would tell us nothing the union member names do
 * not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { refusalLabel } from '../public/js/voice.js';
import { isThinReason } from '../public/js/screens/camera.js';

/** Every member of the engine's `RefusalReason` union, read from its source. */
function refusalReasons() {
  const src = readFileSync(
    fileURLToPath(new URL('../../spine/src/contract.ts', import.meta.url)), 'utf8',
  ).replace(/\r\n/g, '\n');
  const start = src.indexOf('export type RefusalReason =');
  assert.notEqual(start, -1, 'spine/src/contract.ts no longer declares RefusalReason');
  const end = src.indexOf(';', start);
  const body = src.slice(start, end);
  const out = [...body.matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(out.length >= 8, `read ${out.length} refusal reasons, which cannot be right`);
  return out;
}

const REASONS = refusalReasons();

/**
 * The three the engine gained when D-012 split its four filter conditions
 * apart. They stopped being emitted on 2026-09-08 and they are still members
 * of the union, so a refusal stored before that date and reopened from Past
 * scans still arrives carrying one.
 */
const CODES_ADDED_BY_D012 = [
  'unusable_price_kinds',
  'points_too_stale',
  'all_points_from_asking_seller',
];

/* ------------------------------------------------- the sentence, never a code */

test('every refusal reason the engine can return has a sentence of its own', () => {
  const missing = REASONS.filter((r) => refusalLabel(r) === 'Refused');
  assert.deepEqual(missing, [], `refusal reasons with no sentence, so they fall to the bare word:\n${missing.join('\n')}`);
});

/**
 * The defect itself. `too_few_points` becoming "too few points" on a phone is
 * the whole of D-011: it is an internal identifier, it describes a count, and
 * it was printed over an evidence array holding thirteen prices.
 */
test('no refusal sentence is the raw code, or anything derived from it', () => {
  for (const reason of REASONS) {
    const said = refusalLabel(reason);
    assert.ok(!said.includes('_'), `${reason}: sentence contains an underscore: ${said}`);
    /*
     * The de-underscored code, as a WHOLE string, is what D-011 printed:
     * "TOO FEW POINTS" under an item name. Deliberately not a substring check.
     * `no_asking_price` becomes the words "no asking price", which is ordinary
     * English and appears inside its own perfectly good sentence, so a
     * substring rule would fail a line that is not the defect. The defect is
     * the code standing alone where a sentence should be.
     */
    const spelled = reason.replace(/_/g, ' ');
    const bare = said.toLowerCase().replace(/[.!?]+$/, '').trim();
    assert.notEqual(bare, spelled, `${reason}: the sentence IS the code with spaces: ${said}`);
    assert.notEqual(bare, reason, `${reason}: the sentence IS the raw code: ${said}`);
    // A sentence, not a label: it ends in a full stop and has words either side.
    assert.match(said, /^[A-Z].*\.$/, `${reason}: not written as a sentence: ${said}`);
    assert.ok(said.split(/\s+/).length >= 3, `${reason}: too short to be a sentence: ${said}`);
  }
});

/**
 * The fallback. voice.js returns '' for a key it has no row for, so a reason
 * code the engine adds tomorrow must land on the safe word rather than on
 * nothing and never on the code. A refusal card with no heading is worse than
 * one that does not say why; a refusal card headed `points_future_dated` is
 * worse than both.
 */
test('an unknown reason code gets the safe word and never reaches the screen itself', () => {
  for (const unknown of ['some_future_reason', 'no_identity_v2', '', null, undefined, 42]) {
    const said = refusalLabel(unknown);
    assert.equal(said, 'Refused', `unknown code ${String(unknown)} produced: ${said}`);
    if (typeof unknown === 'string' && unknown !== '') {
      assert.ok(!said.includes(unknown), 'the raw code reached the sentence');
      assert.ok(!said.includes(unknown.replace(/_/g, ' ')), 'the raw code reached the sentence');
    }
  }
});

/* ------------------------------------------------------------- the thin set */

test('the thin set knows the three codes D-012 added to the engine', () => {
  for (const code of CODES_ADDED_BY_D012) {
    assert.ok(REASONS.includes(code), `${code} is no longer a member of the engine's union`);
    assert.ok(isThinReason(code), `${code} falls through to the refuse_unknown title`);
  }
});

/**
 * The three that are NOT thin, stated so the set cannot be fixed by widening
 * it to everything. Those three do not know what the price would be about, so
 * "we found prices and none of them settle it" would be a lie on each.
 */
test('the reasons that are about identity are not thin', () => {
  for (const code of ['no_identity', 'identity_unsure', 'category_unsupported']) {
    assert.ok(REASONS.includes(code), `${code} is no longer a member of the engine's union`);
    assert.ok(!isThinReason(code), `${code} is being titled as a thin-evidence refusal`);
  }
});

test('an unknown reason code is not thin', () => {
  for (const unknown of ['some_future_reason', '', null, undefined]) {
    assert.equal(isThinReason(unknown), false, `${String(unknown)} was treated as thin`);
  }
});
