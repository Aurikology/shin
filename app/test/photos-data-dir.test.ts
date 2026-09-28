/**
 * DEFECTS.md D-163: `photosDir` now honours `SHIN_DATA_DIR` (same order as
 * `shutterDir`), and `app/scripts/migrate-photos-to-data-dir.mjs` moves
 * photos already sitting at the old repo-relative location so a server
 * that already set `SHIN_DATA_DIR` does not silently orphan them.
 *
 * The migration test writes into the REAL `legacyPhotosDir()`
 * (`app/data/photos/`), which is the one place this behaviour can actually
 * be exercised -- that directory is the whole subject of D-163. Every name
 * it touches is unique to this run and removed in a `finally`, so it never
 * collides with the real photos already there or with another lane's run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { photosDir, legacyPhotosDir } from '../src/photos.ts';
import { migratePhotos } from '../scripts/migrate-photos-to-data-dir.mjs';

test('with SHIN_PHOTOS set, it always wins, SHIN_DATA_DIR or not', () => {
  assert.equal(photosDir({ SHIN_PHOTOS: '/x/photos', SHIN_DATA_DIR: '/y' }), resolve('/x/photos'));
});

test('with only SHIN_DATA_DIR set, photos live under it, same as shutterDir', () => {
  assert.equal(photosDir({ SHIN_DATA_DIR: '/y' }), join(resolve('/y'), 'photos'));
});

test('with neither set, the old repo-relative default is unchanged', () => {
  assert.equal(photosDir({}), legacyPhotosDir());
});

test('migratePhotos does nothing, and says so, when photosDir did not move', () => {
  const result = migratePhotos({}, () => {});
  assert.equal(result.ranMove, false);
  assert.equal(result.oldDir, result.newDir);
});

test('migratePhotos moves files out of the old location into SHIN_DATA_DIR/photos, and skips a name already there', () => {
  // Both folders are temp folders: the real legacy folder is never passed in,
  // because on the Mac it holds shoppers' photos and this test moves files.
  const root = mkdtempSync(join(tmpdir(), 'shin-photo-migrate-'));
  const oldDir = join(root, 'legacy-photos');
  const marker = 'marker.png';
  const collision = 'collision.png';
  const shelf = join('shelf', '2026-09-22', 'device-a', 'crop.jpg');
  mkdirSync(join(oldDir, 'shelf', '2026-09-22', 'device-a'), { recursive: true });
  writeFileSync(join(oldDir, marker), 'not a real png, just a marker');
  writeFileSync(join(oldDir, collision), 'old copy, must not overwrite the new one');
  writeFileSync(join(oldDir, shelf), 'a shelf crop, nested the way shelf.ts writes it');

  const newDir = join(root, 'data', 'photos');
  mkdirSync(newDir, { recursive: true });
  writeFileSync(join(newDir, collision), 'already at the new location');

  try {
    const result = migratePhotos({ SHIN_DATA_DIR: join(root, 'data') }, () => {}, oldDir);
    assert.equal(result.ranMove, true);
    assert.equal(result.oldDir, oldDir);
    assert.equal(result.newDir, newDir);
    assert.equal(result.moved, 2, 'the marker and the nested shelf crop were not both moved');
    assert.equal(result.skipped, 1, 'the name collision was not skipped');

    assert.ok(existsSync(join(newDir, marker)), 'the marker file did not land in the new directory');
    assert.ok(!existsSync(join(oldDir, marker)), 'the marker file is still in the old directory');
    assert.ok(existsSync(join(newDir, shelf)), 'a shelf crop in a nested folder was left behind');
    // The collision: the new copy is untouched, and the old copy was left where it was rather than overwriting it.
    assert.equal(readFileSync(join(newDir, collision), 'utf8'), 'already at the new location');
    assert.ok(existsSync(join(oldDir, collision)), 'the colliding old file was deleted instead of left alone');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
