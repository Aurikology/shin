/**
 * NO PHOTOGRAPH IS KEPT (2026-11-26): `savePhoto` refuses and `sweepPhotos` deletes every file. The text below is the history of the old retention window.
 *
 * Where a scanned photograph was kept, and when it stopped being kept.
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
 * KEPT FOREVER BY DEFAULT, changed 2026-09-14 on the founder's word ("build
 * everything for collecting EVERYTHING"), which retired plan item 39d's ninety
 * days. `SHIN_PHOTO_RETENTION_DAYS` unset, blank, zero or unparseable all mean
 * "never sweep": `retentionDays` returns `null` rather than a number, and
 * `sweepPhotos` reads that as its signal to do nothing and say so. It is still
 * an environment variable rather than a constant, for the same reason it
 * always was: the day somebody wants a real window back, it is a deploy
 * setting a value, not a code change. A NEGATIVE number is treated the same as
 * unset (keep forever) rather than as "sweep everything now" -- a typo must
 * never delete a beta's whole photo record.
 *
 * THE SWEEP IS TESTABLE WITHOUT WAITING NINETY DAYS. `sweepPhotos` takes the
 * clock. Nothing in it sleeps, polls, or reads the wall clock except through
 * that argument, so the test that proves a 91-day-old photo is deleted and an
 * 89-day-old one is kept runs in milliseconds and proves the real function.
 *
 * THE ROW SURVIVES THE PHOTO. Deleting the file nulls `photo_path` and touches
 * nothing else on the scan row. What was scanned, what came back and when are
 * the product; the photograph is the part we promised to hold for ninety days.
 *
 * FIXED 2026-09-28, DEFECTS.md D-163. `photosDir` used to honour `SHIN_PHOTOS`
 * then fall back to a path resolved relative to THIS SOURCE FILE, never
 * `SHIN_DATA_DIR` -- unlike `shutterDir` (`shutter-log.ts`), which already
 * falls back to `<SHIN_DATA_DIR>/shutter`. With `SHIN_DATA_DIR` set and no
 * explicit `SHIN_PHOTOS`, shopper photos still landed inside the repo
 * checkout at `app/data/photos/`, which the nightly backup (plan item 1g)
 * never reaches. `photosDir` below now mirrors `shutterDir`'s own order:
 * `SHIN_PHOTOS` (explicit override) > `<SHIN_DATA_DIR>/photos` > the old
 * repo-relative default, kept last so a machine with neither set (every dev
 * box and the test suite) is unchanged.
 *
 * EXISTING PHOTOS ARE NOT SILENTLY ORPHANED BY THIS CHANGE. A server that
 * already set `SHIN_DATA_DIR` and already has photos sitting in the OLD
 * repo-relative location needs them MOVED, once, to the new location this
 * fix now points at -- this file does not do that move itself (walking the
 * old directory on every read, or on every server start, is a permanent
 * cost paid by every future start for a one-time problem). Run
 * `app/scripts/migrate-photos-to-data-dir.mjs` once on that machine instead;
 * see its header for exactly what it moves and how it decides there is
 * nothing to do.
 */

import * as settings from '../../settings/src/index.ts';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeScanStore, openScanStore, updateScan } from './scans.ts';
import { logError } from './errlog.ts';

/**
 * Retired 2026-09-14 alongside the ninety-day default it named. Kept as an
 * alias so nothing that imported it for the old default breaks at the module
 * boundary; nothing in this file reads it any more.
 */
export const DEFAULT_RETENTION_DAYS = null;

/**
 * How long a photograph is kept, in days, or `null` for forever.
 *
 * `null` is unset, blank, zero, negative, or anything that will not parse as
 * a positive number -- every one of those means "keep forever" now, per the
 * header above. Only a genuine positive number turns the sweep on at all.
 */
export function retentionDays(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = settings.SHIN_PHOTO_RETENTION_DAYS(env);
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The folder. Beside the scan database rather than inside the repo tree,
 * because it is data and the nightly backup in plan item 1g copies data.
 *
 * Order: `SHIN_PHOTOS` (an explicit override always wins) > `<SHIN_DATA_DIR>/
 * photos` (so a server that points its data at a backed-up folder gets its
 * photos backed up too, same as `shutterDir`) > the repo-relative default,
 * for a machine with neither set.
 */
export function photosDir(env: NodeJS.ProcessEnv = process.env): string {
  const named = settings.SHIN_PHOTOS(env)?.trim();
  if (named) return resolve(named);
  const dataDir = settings.SHIN_DATA_DIR(env)?.trim();
  if (dataDir) return join(resolve(dataDir), 'photos');
  return fileURLToPath(new URL('../data/photos/', import.meta.url));
}

/** The repo-relative default `photosDir` used before D-163, whatever the environment. Used only by the one-shot migration. */
export function legacyPhotosDir(): string {
  return fileURLToPath(new URL('../data/photos/', import.meta.url));
}

/**
 * Pexi keeps no photographs (decision 2026-11-26, legal review): the app sends none, the routes
 * refuse them, and this is the last door. It writes nothing and returns null, which a caller reads
 * as "not stored", the same value a device that did not consent always got. Whatever turns photo
 * identification on later has to change this function on purpose, in a commit that says so.
 *
 * NEVER THROWS, and has no side effect to fail on.
 */
export async function savePhoto(
  _scanId: number,
  _bytes: Buffer,
  _kind: 'png' | 'jpeg',
  _env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  return null;
}

/** The absolute path of a stored photo, from the relative name on the scan row. */
export function photoPath(relative: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(photosDir(env), relative);
}

export interface SweepResult {
  /** Scan rows that still named a photo. */
  readonly considered: number;
  /** Files removed from the photos folder (rows' photos and any file nobody names). */
  readonly deleted: number;
  /** Rows whose `photo_path` was cleared. */
  readonly cleared: number;
  /** Always null now: there is no age at which a photo is kept. Kept so older readers still compile. */
  readonly cutoff: string | null;
  /** Always false now. Kept so older readers still compile. */
  readonly keptForever: boolean;
}

interface PhotoRow {
  id: number;
  photo_path: string;
}

/** Removes everything inside `dir` (files and folders) and returns how many files went. Never throws. */
function emptyFolder(dir: string): number {
  let removed = 0;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const target = join(dir, name);
    try {
      const st = statSync(target);
      if (st.isDirectory()) removed += emptyFolder(target);
      else removed += 1;
      rmSync(target, { recursive: true, force: true });
    } catch (err) {
      logError({ where: 'photos.sweep', err });
    }
  }
  return removed;
}

/**
 * Deletes every photograph the server holds, whatever its age, and clears the path on the scan rows
 * that named one. Runs at start and daily. The rows go first-found by the database (so a row's file
 * is removed even if it sits outside the folder walk), then the folder is emptied of anything else,
 * the beta's old shelf frames included.
 *
 * `now` and `env` are kept so callers and tests keep their shape; nothing is dated.
 *
 * NEVER THROWS: one file that will not delete is logged and the rest go.
 */
export function sweepPhotos(_now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): SweepResult {
  const store = activeScanStore() ?? openScanStore();
  let deleted = 0;
  let cleared = 0;
  let rows: PhotoRow[] = [];
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    rows = store.db.prepare('SELECT id, photo_path FROM scan WHERE photo_path IS NOT NULL').all() as unknown as PhotoRow[];
  } catch (err) {
    logError({ where: 'photos.sweep', err });
  }
  for (const row of rows) {
    try {
      const file = photoPath(row.photo_path, env);
      if (statSync(file, { throwIfNoEntry: false })?.isFile()) {
        rmSync(file, { force: true });
        deleted += 1;
      }
    } catch (err) {
      logError({ where: 'photos.sweep', scanId: row.id, err });
      continue;
    }
    if (updateScan(row.id, { photoPath: null })) cleared += 1;
  }
  deleted += emptyFolder(photosDir(env));
  return { considered: rows.length, deleted, cleared, cutoff: null, keptForever: false };
}

/** Whether a stored photo is still on disk. Test and inspection helper. */
export function photoExists(relative: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return statSync(photoPath(relative, env)).isFile();
  } catch {
    return false;
  }
}
