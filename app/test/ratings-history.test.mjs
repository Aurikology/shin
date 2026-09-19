/**
 * Beta gap item 13, the rating half: every rating a person gives a scan is kept.
 *
 * His word, 2026-09-17: "all user data should be recorded", and the verdict a
 * person gives is their own reading of an answer. `scan_rating` holds ONE row
 * per scan and is the LATEST rating; `scan_rating_history` (migration 11) holds
 * every tap. Each test below fails if the behaviour is removed: put `rateScan`
 * back to an upsert alone and the first three go red, drop the copy step from
 * migration 11 and the fourth does.
 *
 * NO SERVER, NO NETWORK. A temp scan database opened by the shipped
 * `openScanStore`, so the migration under test is the one that ships. The
 * route-level behaviour is checked over a socket in `server-beta-routes.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openScanStore } from '../src/scans.ts';
import { rateScan, deleteRating, ratingFor, ratingHistory, ratingCounts } from '../src/ratings.ts';
import { runMigrations, SCAN_MIGRATIONS } from '../src/migrations.ts';

const fresh = () => join(mkdtempSync(join(tmpdir(), 'shin-ratings-')), 'scans.db');
const at = (n) => new Date(Date.UTC(2026, 8, 19, 12, 0, n));

test('a second rating adds a row to the history instead of replacing the first', () => {
  const store = openScanStore(fresh());
  assert.ok(store.db, store.droppedWhy);
  assert.equal(rateScan({ scanId: 1, deviceId: 'd1', rating: 'up' }, at(1)), true);
  assert.equal(rateScan({ scanId: 1, deviceId: 'd1', rating: 'down', reason: 'wrong_price' }, at(2)), true);
  assert.equal(rateScan({ scanId: 1, deviceId: 'd1', rating: 'up' }, at(3)), true);

  const history = ratingHistory(1);
  assert.equal(history.length, 3, 'a later tap overwrote an earlier one');
  assert.deepEqual(
    history.map((h) => h.rating),
    ['up', 'down', 'up'],
    'the history is not in the order the taps happened',
  );
  assert.equal(history[1].reason, 'wrong_price', 'the reason on the middle tap was lost');
  assert.deepEqual(
    history.map((h) => h.rated_at),
    [at(1), at(2), at(3)].map((d) => d.toISOString()),
  );
  assert.ok(history.every((h) => h.undone_at === null && h.device_id === 'd1'));
});

test('the latest reader still answers with the newest rating, once per scan', () => {
  const store = openScanStore(fresh());
  assert.ok(store.db, store.droppedWhy);
  rateScan({ scanId: 7, deviceId: 'd7', rating: 'up' }, at(1));
  rateScan({ scanId: 7, deviceId: 'd7', rating: 'down', reason: 'too_slow' }, at(2));
  const latest = ratingFor(7);
  assert.equal(latest.rating, 'down');
  assert.equal(latest.reason, 'too_slow');
  const rows = store.db.prepare('SELECT COUNT(*) AS n FROM scan_rating WHERE scan_id = 7').get();
  assert.equal(Number(rows.n), 1, 'the latest table holds more than one row for a scan');
  // The profile screen's counts read the latest table: two taps on one scan is
  // one rating on that screen, not two.
  assert.deepEqual(ratingCounts('d7'), { up: 0, down: 1, reasons: { too_slow: 1 } });
});

test('a reason on a thumbs-up is dropped from the history too', () => {
  const store = openScanStore(fresh());
  assert.ok(store.db, store.droppedWhy);
  rateScan({ scanId: 3, deviceId: 'd3', rating: 'up', reason: 'too_slow' }, at(1));
  assert.equal(ratingHistory(3)[0].reason, null);
});

test('undo removes the latest and keeps the tap, marked as undone', () => {
  const store = openScanStore(fresh());
  assert.ok(store.db, store.droppedWhy);
  rateScan({ scanId: 5, deviceId: 'd5', rating: 'up' }, at(1));
  rateScan({ scanId: 5, deviceId: 'd5', rating: 'down' }, at(2));

  assert.equal(deleteRating(5, at(3)), true);
  assert.equal(ratingFor(5), null, 'undo left a latest rating behind');
  let history = ratingHistory(5);
  assert.equal(history.length, 2, 'undo deleted history');
  assert.equal(history[0].undone_at, null, 'undo reached back past the newest tap');
  assert.equal(history[1].undone_at, at(3).toISOString(), 'the retracted tap is not marked');

  // A double-tapped undo is still success and must not retract an older tap.
  assert.equal(deleteRating(5, at(4)), true);
  history = ratingHistory(5);
  assert.equal(history[0].undone_at, null, 'a second undo retracted the older tap');
  assert.equal(history[1].undone_at, at(3).toISOString(), 'a second undo moved the mark');

  // A new rating after an undo is a new row in the same history.
  rateScan({ scanId: 5, deviceId: 'd5', rating: 'up' }, at(5));
  assert.equal(ratingHistory(5).length, 3);
  assert.equal(ratingFor(5).rating, 'up');
});

test('ratings that existed before the history did become its first rows on upgrade', () => {
  const path = fresh();
  // The database as it stood before migration 11: `scan_rating` exists, the
  // history does not, and one person had already rated one scan.
  const before = openScanStore(path);
  assert.ok(before.db, before.droppedWhy);
  before.db.exec('DROP TABLE scan_rating_history');
  // Every later migration is cleared too: the runner applies versions above the highest one recorded.
  before.db.exec('DELETE FROM schema_version WHERE version >= 11');
  before.db
    .prepare('INSERT INTO scan_rating (scan_id, device_id, rating, reason, rated_at) VALUES (?, ?, ?, ?, ?)')
    .run(42, 'old-device', 'down', 'wrong_product', '2026-09-10T10:00:00.000Z');
  before.db.close();
  assert.ok(SCAN_MIGRATIONS.some((m) => m.version === 11), 'migration 11 is gone');

  const store = openScanStore(path);
  assert.ok(store.db, store.droppedWhy);
  const history = ratingHistory(42);
  assert.equal(history.length, 1, 'an existing rating was not carried into the history');
  assert.equal(history[0].rating, 'down');
  assert.equal(history[0].reason, 'wrong_product');
  assert.equal(history[0].rated_at, '2026-09-10T10:00:00.000Z');
  assert.equal(ratingFor(42).rating, 'down', 'the latest reader lost the rating in the upgrade');

  // Running the migrations again copies nothing twice.
  assert.deepEqual(runMigrations(store.db).applied, []);
  assert.equal(ratingHistory(42).length, 1);
});
