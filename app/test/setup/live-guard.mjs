/**
 * What the test run must never change: the real user catalogue.
 *
 * WHY. Until 2026-09-23 most server tests left SHIN_USER_CATALOGUE unset, so
 * every scan a test made was fed into app/data/user-catalogue.db, the file the
 * running server keeps. On the PC that file was almost all test rows (the
 * double's "Alpha Market", a Walmart fixture), and since typed search answers
 * from it (Jamin, 2026-09-23) a shopper would have been shown them as prices.
 *
 * `snapshot` reads the file read-only: whether it exists, the modified time of
 * the file and of its write-ahead log, and the row count of every table a scan
 * writes. `differences` names what changed between two snapshots. The global
 * setup (global.mjs) takes one before the run and one after, and fails the run
 * on any difference.
 *
 * A server on this machine that is serving real scans during the run writes the
 * same file, and the guard will report that too: stop it, or run the suite when
 * it is idle. That is a false alarm the right way round.
 */
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/**
 * The file the server uses when nothing overrides it (server.ts, USER_CATALOGUE_PATH).
 * SHIN_TEST_REAL_USER_CATALOGUE exists only so the guard itself can be shown to go
 * red against a scratch file; nothing else sets it.
 */
export const REAL_USER_CATALOGUE =
  process.env.SHIN_TEST_REAL_USER_CATALOGUE || fileURLToPath(new URL('../../data/user-catalogue.db', import.meta.url));

const TABLES = ['user_product', 'user_observation', 'user_offer', 'user_review', 'user_branch'];

function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

export function snapshot(path = REAL_USER_CATALOGUE) {
  if (!existsSync(path)) return { path, exists: false, mtime: null, walMtime: null, rows: {} };
  const rows = {};
  let db = null;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    for (const t of TABLES) {
      try {
        rows[t] = db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n;
      } catch {
        rows[t] = null;
      }
    }
  } catch (err) {
    rows.error = err instanceof Error ? err.message : String(err);
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
  return { path, exists: true, mtime: mtime(path), walMtime: mtime(`${path}-wal`), rows };
}

export function differences(before, after) {
  const out = [];
  if (before.exists !== after.exists) out.push(`exists: ${before.exists} -> ${after.exists}`);
  if (before.mtime !== after.mtime) out.push('modified time of the file changed');
  if (before.walMtime !== after.walMtime) out.push('modified time of its write-ahead log changed');
  for (const t of new Set([...Object.keys(before.rows), ...Object.keys(after.rows)])) {
    if (before.rows[t] !== after.rows[t]) out.push(`${t}: ${before.rows[t]} -> ${after.rows[t]} rows`);
  }
  return out;
}
