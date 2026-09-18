/**
 * Re-run the cascade-miss language split over a SAVED results file.
 *
 * Added 2026-09-18 alongside the reading capture in `run.ts`/`metrics.ts`.
 * The point of recording a reading is answerable questions on runs that
 * already happened, and the three most recent runs on disk --
 * `results/2026-09-15.json`, `-16`, `-17` -- all predate the field. This
 * script proves the report degrades honestly on exactly those files: every
 * row in them classifies as `undetermined`, reason "not recorded in this
 * run", never as a false zero.
 *
 * Deliberately thin: it does no scoring of its own. `reportCascadeMissLanguage`
 * (`run.ts`) is the same function a live `node run.ts` call uses, so a saved
 * file and a live run are read by identical code and cannot drift apart.
 *
 * Usage: `node --experimental-strip-types analyze-results.ts results/2026-09-17.json`
 * (or via tsx/ts-node in whatever this repo's `npm run` scripts use).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { reportCascadeMissLanguage } from './run.ts';
import type { StageObservation } from './metrics.ts';

interface SavedResults {
  readonly dryRun?: boolean;
  readonly results: readonly { readonly obs: StageObservation | null }[];
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: analyze-results.ts <path to a results/*.json file>');
    process.exit(1);
  }
  const path = resolve(process.cwd(), file);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as SavedResults;
  const obs = parsed.results
    .map((r) => r.obs)
    .filter((o): o is StageObservation => o !== null);

  console.log(`loaded ${path}`);
  console.log(`${obs.length} scoreable row(s) with an observation`);
  const captureFieldPresent = obs.some((o) => o.captureStatus !== undefined);
  if (!captureFieldPresent) {
    console.log(
      'NONE of them carry a captureStatus: this file predates the reading-capture field entirely.',
    );
    console.log('Every cascade_miss below will read "not recorded in this run" -- that is correct, not a bug.');
  }

  reportCascadeMissLanguage(obs, { fakeCatalogue: false });
}

// Only run when invoked directly (`node analyze-results.ts ...`), not when
// imported -- the same guard style `run.ts` itself does not need because it
// is only ever a CLI entry point, but this file is also meant to be testable.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
