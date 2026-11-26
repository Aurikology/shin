/**
 * The photograph rule, pinned without a server: Pexi keeps no photographs. The store refuses a new
 * one, and the daily sweep deletes every file it finds (a scan row's, an orphan, an old shelf frame)
 * whatever its age, with no retention window to configure.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'shin-photos-retention-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
delete process.env.SHIN_PHOTO_RETENTION_DAYS;

const { openScanStore, recordScan, getScan, updateScan } = await import('../src/scans.ts');
const { savePhoto, photoExists, sweepPhotos, photosDir } = await import('../src/photos.ts');

openScanStore(process.env.SHIN_SCANS);

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A scan row that names a file already on disk, the way the beta's old photo and shelf routes left one. */
function oldPhotoScan(device: string, name: string): { scanId: number; file: string } {
  const scanId = recordScan({ deviceId: device, kind: 'photo', query: '', outcome: 'answered' });
  assert.ok(scanId !== null, 'the scan row was not written');
  mkdirSync(photosDir(), { recursive: true });
  const file = join(photosDir(), name);
  writeFileSync(file, PNG_1x1);
  updateScan(scanId, { photoPath: name });
  assert.ok(photoExists(name));
  return { scanId, file };
}

test('the store refuses a new photograph: nothing is written, whatever the consent or the window', async () => {
  const scanId = recordScan({ deviceId: 'p-refuse', kind: 'photo', query: '', outcome: 'answered' }) as number;
  process.env.SHIN_PHOTO_RETENTION_DAYS = '90';
  try {
    assert.equal(await savePhoto(scanId, PNG_1x1, 'png'), null);
    assert.equal(await savePhoto(scanId, PNG_1x1, 'jpeg'), null);
  } finally {
    delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  }
  assert.ok(!photoExists(`${scanId}.png`));
  assert.ok(!photoExists(`${scanId}.jpg`));
  assert.deepEqual(existsSync(photosDir()) ? readdirSync(photosDir()) : [], []);
});

test('the sweep deletes a photograph of any age, with no retention window set, and clears its path', () => {
  const { scanId, file } = oldPhotoScan('p-any-age', 'fresh-today.png');
  delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  const result = sweepPhotos(new Date());
  assert.ok(result.deleted >= 1);
  assert.ok(!existsSync(file), 'a photograph is still on disk');
  assert.equal(getScan(scanId)!.photo_path, null, 'the row still claims a file that is gone');
  assert.equal(getScan(scanId)!.kind, 'photo', 'the scan itself survives');
});

test('the sweep also removes files no scan row names, shelf frames included', () => {
  const orphan = join(photosDir(), 'orphan.jpg');
  const shelfDir = join(photosDir(), 'shelf', '2026-09-01', 'some-device');
  mkdirSync(shelfDir, { recursive: true });
  writeFileSync(orphan, PNG_1x1);
  writeFileSync(join(shelfDir, 'frame.jpg'), PNG_1x1);
  const result = sweepPhotos(new Date());
  assert.ok(result.deleted >= 2);
  assert.deepEqual(readdirSync(photosDir()), [], 'something is left in the photos folder');
});
