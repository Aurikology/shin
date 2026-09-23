/**
 * The test run's own setup (`npm test` passes it as --test-global-setup).
 *
 * 1. Every test process gets a temp user catalogue: child.mjs is added to
 *    NODE_OPTIONS here, and the test runner's processes inherit it.
 * 2. The real user catalogue is snapshotted before the run and compared after
 *    it (live-guard.mjs). Any change fails the run: tests must never write the
 *    file the server serves typed-search prices from.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { differences, snapshot, REAL_USER_CATALOGUE } from './live-guard.mjs';

let before = null;

export async function globalSetup() {
  before = snapshot(REAL_USER_CATALOGUE);
  const child = pathToFileURL(fileURLToPath(new URL('./child.mjs', import.meta.url))).href;
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--import=${child}`].filter(Boolean).join(' ');
}

export async function globalTeardown() {
  if (!before) return;
  const changed = differences(before, snapshot(REAL_USER_CATALOGUE));
  if (changed.length === 0) return;
  const message = [
    `LIVE USER CATALOGUE CHANGED DURING THE TEST RUN: ${REAL_USER_CATALOGUE}`,
    ...changed.map((c) => `  ${c}`),
    'A test wrote to the real file. Every test must use a temp SHIN_USER_CATALOGUE (test/setup/child.mjs).',
  ].join('\n');
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}
