/**
 * The test run's own setup (`npm test` passes it as --test-global-setup).
 *
 * 1. Refuses to run at all in the live server's folder: mac/run-server.sh
 *    writes `.shin-live-server` at the repo root before it starts the server.
 * 2. Every path-type setting is set to a placeholder inside this run's temp
 *    folder, so a value in the shell running the suite never reaches a test,
 *    and child.mjs (added to NODE_OPTIONS here, inherited by every test
 *    process) swaps each placeholder for a fresh per-process temp folder.
 * 3. Every real data folder (data-paths.mjs: app/data, identify/data,
 *    price/data, catalogue/data, spine/data, the repo-root data/, and wherever
 *    the shell pointed a path setting) is snapshotted by path, size and
 *    modified time before the run and compared after it. Any file added,
 *    changed or deleted fails the run and is named. Stats only: no file is
 *    opened, so a large folder stays fast.
 *
 * A server on this machine serving real scans during the run writes the same
 * folders, and the guard reports that too: stop it, or run the suite when it
 * is idle. That is a false alarm the right way round.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LIVE_MARKER,
  RUN_TEMP_VAR,
  pathSettings,
  realDataRoots,
  snapshotTree,
  treeDifferences,
} from './data-paths.mjs';

let roots = null;
let before = null;
let runTemp = null;

export async function globalSetup() {
  if (existsSync(LIVE_MARKER)) {
    const message = [
      `Tests refused to run: ${LIVE_MARKER} exists.`,
      'That file means the live Shin server runs from this folder (mac/run-server.sh writes it),',
      'and a test run here could change the real data testers are using.',
      'Run the tests in a separate copy of the repo. If the live server does not run from this',
      'folder, delete that file and run again.',
    ].join('\n');
    // Printed as well as thrown: the test runner exits 1 on a throw here but prints nothing.
    console.error(message);
    process.exitCode = 1;
    throw new Error(message);
  }

  const settings = await pathSettings();
  roots = realDataRoots(settings, process.env);
  before = snapshotTree(roots);

  runTemp = mkdtempSync(join(tmpdir(), 'shin-test-run-'));
  process.env[RUN_TEMP_VAR] = runTemp;
  for (const s of settings) process.env[s.env] = join(runTemp, s.name);

  const child = pathToFileURL(fileURLToPath(new URL('./child.mjs', import.meta.url))).href;
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--import=${child}`].filter(Boolean).join(' ');
}

export async function globalTeardown() {
  if (runTemp) {
    try {
      rmSync(runTemp, { recursive: true, force: true });
    } catch {
      /* a locked file on Windows; the temp folder is left */
    }
  }
  if (!before) return;
  const changed = treeDifferences(before, snapshotTree(roots));
  if (changed.length === 0) return;
  const shown = changed.slice(0, 50);
  const message = [
    `REAL DATA CHANGED DURING THE TEST RUN (${changed.length} path${changed.length === 1 ? '' : 's'}):`,
    ...shown.map((c) => `  ${c}`),
    ...(changed.length > shown.length ? [`  ... and ${changed.length - shown.length} more`] : []),
    'A test wrote to, created in, or deleted from a real data folder. Every test must use the temp',
    'paths test/setup/child.mjs gives it (SHIN_DATA_DIR and every other path setting).',
  ].join('\n');
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}
