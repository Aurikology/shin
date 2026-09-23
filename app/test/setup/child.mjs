/**
 * Loaded first in every test process (global.mjs puts it on NODE_OPTIONS), so
 * no test can reach the real user catalogue by leaving SHIN_USER_CATALOGUE
 * unset: each process gets a fresh temp file of its own. A test file that sets
 * its own path at the top still wins, because it runs after this.
 *
 * A path that already points into the temp directory is kept (a test that
 * spawns a server with a chosen file); anything else, including the real file,
 * is replaced.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const current = process.env.SHIN_USER_CATALOGUE;
const temp = resolve(tmpdir());
if (!current || !resolve(current).toLowerCase().startsWith(temp.toLowerCase())) {
  const dir = mkdtempSync(join(tmpdir(), 'shin-test-uc-'));
  process.env.SHIN_USER_CATALOGUE = join(dir, 'user-catalogue.db');
  process.on('exit', () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows keeps an open sqlite file locked; the temp directory is left */
    }
  });
}
