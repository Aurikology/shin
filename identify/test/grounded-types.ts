/**
 * A test that runs at COMPILE time, not at test time.
 *
 * `node --test` never opens this file (its name is not `*.test.ts`). `tsc` does,
 * because `identify/tsconfig.json` includes `test/**\/*.ts`, and that is the
 * whole mechanism: every `@ts-expect-error` below is an assertion that the line
 * under it IS an error. If a box ever becomes assignable to a scan write or a
 * price-store write, the directive stops being used and TypeScript reports
 * "Unused '@ts-expect-error' directive", which turns
 * `npm run typecheck` red. The check therefore fails in the direction that
 * matters: it breaks when the guard breaks, not when the guard holds.
 *
 * WHY THIS FILE IS NOT A `.test.ts`. There is nothing to run. Asserting at
 * runtime that a type is not assignable is impossible; the compiler is the only
 * thing that can make this claim, so the compiler is where the claim lives.
 *
 * D-090 IS WHY THE INCLUDE IS SPELLED OUT ABOVE. This repo has already had a
 * file that "typechecked" and had never been compiled, because nothing in the
 * tsconfig reached it. `grounded.test.ts`'s own allowlist test reads this file
 * off disk, so a rename that moved it out of `test/` would be noticed there too.
 *
 * The imports below reach into `app/` and `price/` on purpose. A locally
 * declared lookalike of `ScanPatch` would be a check against a copy, and a copy
 * drifts: the point is that the REAL write in the REAL server cannot take a box.
 */

import type { Grounded } from '../src/grounded.ts';
import type { ScanInput, ScanPatch } from '../../app/src/scans.ts';
import type { ObservationRow } from '../../price/src/store.ts';

declare const box: Grounded<string>;

/* A scan write. `verdictTier` is a string, and the box is not one. */
// @ts-expect-error a Grounded Result may not be written to a scan row
export const scanTier: ScanPatch['verdictTier'] = box;

/* The other scan write: the raw model JSON column. */
// @ts-expect-error a Grounded Result may not be written to the model_json column
export const scanModelJson: ScanInput['modelJson'] = box;

/* A price-store write. The price spine never sees a grounded value at all. */
// @ts-expect-error a Grounded Result may not be written to the price store
export const observationSeller: ObservationRow['seller'] = box;

/* And the reverse direction: nothing structural can pose as a box. */
// @ts-expect-error only seal() can produce a Grounded value
export const forged: Grounded<string> = { phantom: () => {} };
