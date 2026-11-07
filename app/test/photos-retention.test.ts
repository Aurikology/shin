/**
 * The photograph retention sweep, pinned without a server.
 *
 * These three tests used to run through the photo route in `server-photo-record.test.ts`. That
 * route no longer reads a photograph (RULINGS.md, "Pexi uses Gemini for nothing, and photo scanning
 * is not a shipped feature"), but `sweepPhotos` still runs on the daily timer over whatever
 * photographs are on disk, so the retention rules it keeps stay pinned here: a photo past the
 * window is deleted and its path cleared, the scan row survives, and with no window set nothing is
 * ever swept. The clock is injected, so this proves the shipped function and runs in milliseconds.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'shin-photos-retention-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
delete process.env.SHIN_PHOTO_RETENTION_DAYS;

const { openScanStore, recordScan, getScan, updateScan } = await import('../src/scans.ts');
const { savePhoto, photoExists, sweepPhotos } = await import('../src/photos.ts');

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

/** A photo scan row with a stored file, the way the shelf and frame routes leave one. */
async function photoScan(device: string): Promise<{ scanId: number; kept: string }> {
  const scanId = recordScan({ deviceId: device, kind: 'photo', query: '', outcome: 'answered' });
  assert.ok(scanId !== null, 'the scan row was not written');
  const kept = await savePhoto(scanId, PNG_1x1, 'png');
  assert.ok(kept, 'the photo was not stored');
  updateScan(scanId, { photoPath: kept });
  assert.ok(photoExists(kept));
  return { scanId, kept };
}

test('a photograph past a configured retention window is deleted and its path is cleared', async () => {
  const { scanId, kept } = await photoScan('p-39d');
  process.env.SHIN_PHOTO_RETENTION_DAYS = '90';
  try {
    // Eighty-nine days on: still inside the window, still there.
    const soon = new Date(Date.now() + 89 * 24 * 60 * 60 * 1000);
    assert.equal(sweepPhotos(soon).deleted, 0);
    assert.ok(photoExists(kept), 'a photo was deleted a day early');

    // Ninety-one days on: gone from disk and gone from the row.
    const later = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
    const result = sweepPhotos(later);
    assert.ok(result.deleted >= 1);
    assert.ok(!photoExists(kept), 'the file outlived the retention window');
    assert.equal(getScan(scanId)!.photo_path, null, 'the row still claims a file that is gone');
    // The scan itself survives. The photograph is the part with a date on it.
    assert.equal(getScan(scanId)!.kind, 'photo');
  } finally {
    delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  }
});

test('with no retention window set, a photo is never swept, however far the clock runs', async () => {
  const { scanId, kept } = await photoScan('p-39d-forever');
  delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  // A thousand days out. Forever means forever, not a long default.
  const farFuture = new Date(Date.now() + 1000 * 24 * 60 * 60 * 1000);
  const result = sweepPhotos(farFuture);
  assert.equal(result.deleted, 0);
  assert.equal(result.considered, 0);
  assert.equal(result.keptForever, true);
  assert.ok(photoExists(kept), 'a photo was swept with no retention window configured');
  assert.equal(getScan(scanId)!.photo_path, kept);
});

test('the retention window is a setting, so the privacy wording and the behaviour move together', async () => {
  const { scanId } = await photoScan('p-39d-short');
  process.env.SHIN_PHOTO_RETENTION_DAYS = '1';
  try {
    sweepPhotos(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    assert.equal(getScan(scanId)!.photo_path, null);
  } finally {
    delete process.env.SHIN_PHOTO_RETENTION_DAYS;
  }
});
