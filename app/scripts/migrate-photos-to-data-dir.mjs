#!/usr/bin/env node
/**
 * One-shot migration for DEFECTS.md D-163.
 *
 * `app/src/photos.ts`'s `photosDir()` used to ignore `SHIN_DATA_DIR` and
 * always fall back to the repo-relative `app/data/photos/` when `SHIN_PHOTOS`
 * was not set. That is fixed now: with `SHIN_DATA_DIR` set and no explicit
 * `SHIN_PHOTOS`, photos land at `<SHIN_DATA_DIR>/photos` instead, same as
 * `shutterDir`.
 *
 * That fix alone would ORPHAN every photo a server already wrote under the
 * old repo-relative path before this ran: the server would start reading and
 * writing a different folder and the old files would just sit there,
 * unreachable from `/api/admin/file` and invisible to the nightly backup,
 * which is the exact failure D-163 named. This script moves them once.
 *
 * WHAT IT DOES. Computes the OLD location (the repo-relative default,
 * `legacyPhotosDir()`) and the NEW location (`photosDir(process.env)`, the
 * fixed function, read with today's real environment). If they are the same
 * path -- true on a machine with no `SHIN_DATA_DIR` set, which is every dev
 * box and the test suite -- it says so and does nothing. Otherwise, for
 * every file in the old directory it does not already have, it moves it
 * (rename, falling back to copy-then-delete across a filesystem boundary)
 * into the new one. A file already present in the new directory with the
 * same name is left alone in both places and counted as "skipped", never
 * overwritten -- a name collision here means something already wrote to
 * the new location under that name, and guessing which copy is right is
 * not this script's job.
 *
 * NEVER DELETES THE OLD DIRECTORY. Once every file has moved, the old
 * directory is empty but still there; nothing here removes it, so a run
 * against the wrong environment (or a second run) can never lose data by
 * deleting a folder that turned out to still matter.
 *
 * RUN ON THE MACHINE THAT HAS THE PHOTOS, with the SAME environment the
 * server itself runs under (so `SHIN_DATA_DIR`, or `SHIN_PHOTOS` if that is
 * what is actually set, resolves the same way):
 *
 *   node app/scripts/migrate-photos-to-data-dir.mjs
 *
 * or, on the Mac, with the process manager's env sourced first exactly the
 * way `mac/run-server.sh` does:
 *
 *   set -a; . mac/config.env; set +a; node app/scripts/migrate-photos-to-data-dir.mjs
 */
import { existsSync, mkdirSync, readdirSync, renameSync, copyFileSync, unlinkSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { photosDir, legacyPhotosDir } from '../src/photos.ts';

// `oldDir` is a parameter so tests move files between two temp folders and
// never touch the real legacy folder, which on the Mac holds shoppers' photos.
export function migratePhotos(env = process.env, log = console.log, oldDir = legacyPhotosDir()) {
  const newDir = photosDir(env);

  if (oldDir === newDir) {
    log(`Nothing to migrate: photosDir resolves to the same place (${newDir}) with this environment.`);
    return { moved: 0, skipped: 0, failed: 0, oldDir, newDir, ranMove: false };
  }

  if (!existsSync(oldDir)) {
    log(`Nothing to migrate: the old location (${oldDir}) does not exist.`);
    return { moved: 0, skipped: 0, failed: 0, oldDir, newDir, ranMove: false };
  }

  mkdirSync(newDir, { recursive: true });

  let moved = 0;
  let skipped = 0;
  let failed = 0;
  // Every file under the old folder, folders included: shelf crops live at
  // shelf/<day>/<device>/, so a top-level-only move would leave them outside
  // the backed-up folder, which is the whole point of D-163.
  const files = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(oldDir, rel))) {
      const r = join(rel, name);
      let st;
      try { st = statSync(join(oldDir, r)); } catch { continue; }
      if (st.isDirectory()) walk(r);
      else if (st.isFile()) files.push(r);
    }
  };
  walk('');
  for (const rel of files) {
    const from = join(oldDir, rel);
    const to = join(newDir, rel);
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(to)) {
      skipped += 1;
      continue;
    }
    try {
      renameSync(from, to);
      moved += 1;
    } catch (err) {
      if ((err && err.code) === 'EXDEV') {
        try {
          copyFileSync(from, to);
          unlinkSync(from);
          moved += 1;
          continue;
        } catch (err2) {
          log(`FAILED to move ${from} -> ${to}: ${err2.message}`);
          failed += 1;
          continue;
        }
      }
      log(`FAILED to move ${from} -> ${to}: ${err.message}`);
      failed += 1;
    }
  }

  log(`Moved ${moved} photo(s) from ${oldDir} to ${newDir}. Skipped ${skipped} (already present). Failed ${failed}.`);
  return { moved, skipped, failed, oldDir, newDir, ranMove: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migratePhotos();
}
