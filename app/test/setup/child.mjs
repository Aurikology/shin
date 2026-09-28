/**
 * Loaded first in every test process (global.mjs puts it on NODE_OPTIONS), so
 * no test can reach real data by leaving a path setting unset: every path-type
 * setting in settings/src/index.ts (SHIN_DATA_DIR, SHIN_SCANS, SHIN_PHOTOS,
 * SHIN_REPEAT_CACHE, the user catalogue and the rest; data-paths.mjs says how
 * a path setting is recognised) is pointed into a fresh temp folder of this
 * process's own. A new path setting added to that table is covered with no
 * edit here.
 *
 * WHAT IS KEPT. A value a test chose is kept: a test file that sets its own
 * path at the top runs after this and wins, and a server a test spawns with
 * its own temp path keeps it. What is replaced: an unset value, the run-level
 * placeholder global.mjs sets (so parallel test processes never share a file),
 * and any value that points inside a real data folder.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_DATA_ROOTS, RUN_TEMP_VAR, isInside, pathSettings } from './data-paths.mjs';

const runTemp = process.env[RUN_TEMP_VAR];
let dir = null;
for (const s of await pathSettings()) {
  const current = process.env[s.env]?.trim();
  const chosen =
    current &&
    !(runTemp && isInside(current, runTemp)) &&
    !DEFAULT_DATA_ROOTS.some((root) => isInside(current, root));
  if (chosen) continue;
  dir ??= mkdtempSync(join(tmpdir(), 'shin-test-'));
  const path = join(dir, s.name);
  if (s.kind === 'dir') mkdirSync(path, { recursive: true });
  process.env[s.env] = path;
}

if (dir) {
  process.on('exit', () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows keeps an open sqlite file locked; the temp folder is left */
    }
  });
}
