/**
 * Where a scanned photograph is kept, and when it stops being kept.
 *
 * Plan items 9a and 39d, and they are one file because a retention rule that
 * lives anywhere other than beside the code that writes the file is a rule
 * that stops matching reality the first time the path changes.
 *
 * ONLY WITH CONSENT, and the check is not in here. `consent.ts` answers
 * whether this device said yes and the ROUTE asks before calling `savePhoto`,
 * so there is exactly one place that decides and it is the place that also
 * decides about the location. A consent check buried in a storage helper is a
 * check nobody can find when they need to confirm what the privacy screen
 * claims is true.
 *
 * KEYED BY SCAN ID, which is what makes the record complete: the row says
 * `photo_path`, the file is named after the row, and a photograph with no scan
 * behind it cannot exist because the id is assigned by the insert. It also
 * means deletion is a join rather than a search, which is what makes the
 * retention sweep below a few lines instead of a directory walk with a date
 * parser in it.
 *
 * NINETY DAYS, then gone. The number is `SHIN_PHOTO_RETENTION_DAYS` and
 * defaults to 90 because that is what plan item 39d says and what the privacy
 * statement will say. It is an environment variable rather than a constant so
 * that the sentence on the privacy screen and the behaviour of the server can
 * be changed together by the person who approves the wording, without a
 * deploy. A value that will not parse falls back to 90 rather than to zero:
 * misreading the setting must never delete everything.
 *
 * THE SWEEP IS TESTABLE WITHOUT WAITING NINETY DAYS. `sweepPhotos` takes the
 * clock. Nothing in it sleeps, polls, or reads the wall clock except through
 * that argument, so the test that proves a 91-day-old photo is deleted and an
 * 89-day-old one is kept runs in milliseconds and proves the real function.
 *
 * THE ROW SURVIVES THE PHOTO. Deleting the file nulls `photo_path` and touches
 * nothing else on the scan row. What was scanned, what came back and when are
 * the product; the photograph is the part we promised to hold for ninety days.
 */

import { mkdirSync, rmSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeScanStore, openScanStore, updateScan } from './scans.ts';
import { logError } from './errlog.ts';

export const DEFAULT_RETENTION_DAYS = 90;

/** How long a photograph is kept, in days. See the header on why it is a variable. */
export function retentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SHIN_PHOTO_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_RETENTION_DAYS;
  const n = Number(raw);
  // Above zero, because 0 would mean "delete on the next sweep", which is a
  // thing somebody might want and is not a thing a typo should achieve.
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
}

/**
 * The folder. Beside the scan database rather than inside the repo tree,
 * because it is data and the nightly backup in plan item 1g copies data.
 */
export function photosDir(env: NodeJS.ProcessEnv = process.env): string {
  const named = env.SHIN_PHOTOS?.trim();
  if (named) return resolve(named);
  return fileURLToPath(new URL('../data/photos/', import.meta.url));
}

/**
 * Writes one photograph and returns the path stored on the scan row, or null.
 *
 * NEVER THROWS, and the null matters: a disk that is full or a folder that
 * will not create must not turn a scan that was answered correctly into an
 * error on somebody's screen. The scan row keeps a null `photo_path`, which is
 * the same value it has for a device that did not consent, and the difference
 * between the two is in the consent table where it belongs.
 *
 * THE PATH STORED IS RELATIVE to the photos folder, never absolute. An
 * absolute path in a database row is a row that stops resolving the day the
 * server moves from the Windows laptop to the Mac to a rented box, which plan
 * item 1 says will happen twice.
 */
export async function savePhoto(
  scanId: number,
  bytes: Buffer,
  kind: 'png' | 'jpeg',
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const name = `${scanId}.${kind === 'png' ? 'png' : 'jpg'}`;
  try {
    const dir = photosDir(env);
    mkdirSync(dir, { recursive: true });
    await writeFile(join(dir, name), bytes);
    return name;
  } catch (err) {
    logError({ where: 'photos.save', scanId, err });
    return null;
  }
}

/** The absolute path of a stored photo, from the relative name on the scan row. */
export function photoPath(relative: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(photosDir(env), relative);
}

export interface SweepResult {
  /** Rows whose photo was older than the cutoff. */
  readonly considered: number;
  /** Files that are gone from disk after this call. */
  readonly deleted: number;
  /** Rows whose `photo_path` was cleared. */
  readonly cleared: number;
  /** The moment before which a photo is too old to keep. */
  readonly cutoff: string;
}

interface AgedRow {
  id: number;
  photo_path: string;
}

/**
 * Deletes every photograph older than the retention window and clears the path
 * on its scan row.
 *
 * DRIVEN BY THE DATABASE, NOT BY THE DIRECTORY. The rows are the record of
 * what we hold; a directory walk would find files whose row was deleted and
 * would be at the mercy of a filesystem timestamp that a backup restore
 * rewrites. `scanned_at` is the time the person scanned, which is the time the
 * ninety days is counted from and the only time the privacy statement can
 * honestly describe.
 *
 * A MISSING FILE IS A SUCCESS. `rmSync` with `force` does not complain about a
 * file that is already gone, and the row is cleared either way: the state this
 * function exists to produce is "no photograph and no path", and a file
 * somebody deleted by hand has done half the work.
 *
 * NEVER THROWS. It runs at start and on a timer, where the only thing a throw
 * could do is take down a server that was otherwise fine.
 */
export function sweepPhotos(now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): SweepResult {
  const days = retentionDays(env);
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const store = activeScanStore() ?? openScanStore();
  let deleted = 0;
  let cleared = 0;
  let rows: AgedRow[] = [];
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    rows = store.db
      .prepare('SELECT id, photo_path FROM scan WHERE photo_path IS NOT NULL AND scanned_at < ?')
      .all(cutoff) as unknown as AgedRow[];
  } catch (err) {
    logError({ where: 'photos.sweep', err });
    return { considered: 0, deleted: 0, cleared: 0, cutoff };
  }

  for (const row of rows) {
    try {
      rmSync(photoPath(row.photo_path, env), { force: true });
      deleted += 1;
    } catch (err) {
      // Logged and carried on: one file that will not delete (a lock, a
      // permission) must not stop the other eighty-nine from going.
      logError({ where: 'photos.sweep', scanId: row.id, err });
      continue;
    }
    if (updateScan(row.id, { photoPath: null })) cleared += 1;
  }
  return { considered: rows.length, deleted, cleared, cutoff };
}

/** Whether a stored photo is still on disk. Test and inspection helper. */
export function photoExists(relative: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return statSync(photoPath(relative, env)).isFile();
  } catch {
    return false;
  }
}
