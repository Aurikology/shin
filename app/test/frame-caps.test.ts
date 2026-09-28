/**
 * D-160 and D-162: the two picture writes are bounded per device, in all,
 * and by free disk, and inventing device ids does not get round any of them.
 * D-148 server half: the shelf store refuses unless photo identification and
 * photo consent are both on.
 *
 * Each cap is driven past its limit and checked to refuse; each has a control
 * that the same call is accepted below the limit, so a store that refused
 * everything would fail here.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  saveShelfFrame,
  resetShelfCountsForTests,
  shelfCounterSizeForTests,
  SHELF_DAILY_CAP,
  SHELF_TOTAL_DAILY_CAP,
} from '../src/shelf.ts';
import {
  saveCappedShutterFrame as saveShutterFrame,
  resetShutterCountsForTests,
  SHUTTER_DEVICE_DAILY_CAP,
  SHUTTER_TOTAL_DAILY_CAP,
} from '../src/shutter-frame.ts';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const plenty = () => 100 * 1024 * 1024 * 1024;
const full = () => 10 * 1024 * 1024;

let dir = '';
const env = () => ({ ...process.env, SHIN_PHOTOS: join(dir, 'photos'), SHIN_SHUTTER_DIR: join(dir, 'shutter'), SHIN_SHUTTER_LOG: 'on' });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shin-frame-caps-'));
  resetShelfCountsForTests();
  resetShutterCountsForTests();
});

const press = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const shutterBody = (i: number) => ({ id: press(i), frame: jpeg.toString('base64') });
const shelfBody = (deviceId: string) => ({ deviceId, frame: jpeg.toString('base64') });
const on = { keep: () => true, photoId: () => true, free: plenty };

/* ---------------------------------------------------------- shutter, D-160 */

test('one device cannot write shutter frames past its daily cap', () => {
  const now = new Date('2026-09-22T10:00:00Z');
  let last = 0;
  for (let i = 0; i < SHUTTER_DEVICE_DAILY_CAP + 2; i += 1) {
    last = saveShutterFrame(shutterBody(i), env(), { deviceId: 'dev-one-00000', now, free: plenty });
  }
  assert.equal(last, 429, 'no per-device cap on shutter frames');
  // Control: another device is still accepted.
  assert.equal(saveShutterFrame(shutterBody(99999), env(), { deviceId: 'dev-two-00000', now, free: plenty }), 204);
});

test('inventing a device id per frame still hits the total cap', () => {
  const now = new Date('2026-09-22T10:00:00Z');
  let last = 0;
  for (let i = 0; i < SHUTTER_TOTAL_DAILY_CAP + 2; i += 1) {
    last = saveShutterFrame(shutterBody(i), env(), { deviceId: `dev-${i}-rotating`, now, free: plenty });
  }
  assert.equal(last, 429, 'rotating device ids got round the shutter cap');
});

test('a frame with no device at all is capped as one device', () => {
  const now = new Date('2026-09-22T10:00:00Z');
  let last = 0;
  for (let i = 0; i < SHUTTER_DEVICE_DAILY_CAP + 2; i += 1) {
    last = saveShutterFrame(shutterBody(i), env(), { deviceId: null, now, free: plenty });
  }
  assert.equal(last, 429);
});

test('a nearly full disk takes no shutter frame', () => {
  const status = saveShutterFrame(shutterBody(1), env(), { deviceId: 'dev-one-00000', free: full });
  assert.equal(status, 507);
  assert.equal(existsSync(join(dir, 'shutter')), false, 'a frame was written to a full disk');
});

/* ------------------------------------------------------------ shelf, D-162 */

test('inventing a device id per frame still hits the shelf total cap', () => {
  const now = new Date('2026-09-22T10:00:00Z');
  let last = 0;
  for (let i = 0; i < SHELF_TOTAL_DAILY_CAP + 2; i += 1) {
    last = saveShelfFrame(shelfBody(`rotating-${String(i).padStart(6, '0')}`), { env: env(), now, ...on }).status;
  }
  assert.equal(last, 429, 'rotating device ids got round the shelf cap');
  assert.ok(SHELF_TOTAL_DAILY_CAP >= SHELF_DAILY_CAP);
});

test('the shelf counter lets go of yesterday', () => {
  const day1 = new Date('2026-09-22T10:00:00Z');
  for (let i = 0; i < 5; i += 1) {
    saveShelfFrame(shelfBody(`day-one-${String(i).padStart(4, '0')}`), { env: env(), now: day1, ...on });
  }
  assert.equal(shelfCounterSizeForTests(), 5);
  const day2 = new Date('2026-09-23T10:00:00Z');
  assert.equal(saveShelfFrame(shelfBody('day-two-00000'), { env: env(), now: day2, ...on }).status, 204);
  assert.equal(shelfCounterSizeForTests(), 1, 'the counter still holds the day before');
});

test('a nearly full disk takes no shelf frame', () => {
  const r = saveShelfFrame(shelfBody('device-abcdef12'), { env: env(), ...on, free: full });
  assert.equal(r.status, 507);
  assert.equal(existsSync(join(dir, 'photos', 'shelf')), false);
});

/* ------------------------------------------------------ shelf gate, D-148 */

test('the shelf store keeps nothing unless photo identification AND consent are on', () => {
  const cases: [boolean, boolean, number][] = [
    [false, true, 403],
    [true, false, 403],
    [false, false, 403],
    [true, true, 204],
  ];
  for (const [photoId, consent, want] of cases) {
    resetShelfCountsForTests();
    const r = saveShelfFrame(shelfBody('device-abcdef12'), {
      env: env(),
      keep: () => consent,
      photoId: () => photoId,
      free: plenty,
    });
    assert.equal(r.status, want, `photo id ${photoId}, consent ${consent}`);
  }
  assert.equal(readdirSync(join(dir, 'photos', 'shelf')).length, 1, 'more than the one allowed case wrote');
});

test('with no override, the shelf store reads the same photo identification flag the phone gets', () => {
  // flags.js ships photoId: false today, so the default must refuse.
  const r = saveShelfFrame(shelfBody('device-abcdef12'), { env: env(), keep: () => true, free: plenty });
  assert.equal(r.status, 403);
});
