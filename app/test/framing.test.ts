/**
 * The guidance system's measurements, tested where they are decidable.
 *
 * What is worth testing here is not "does a box get drawn". It is the two
 * things that would fail silently and look like the app being bad at its job:
 * a line firing on a frame that did not earn it, and a line flickering on and
 * off faster than a person can read it. Both are pure functions of numbers, so
 * both are testable without a camera, a canvas or a browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseCoach, Coach, glareIn, zoomFor, MIN_CROP_PX } from '../src/eye/framing.ts';

const base = { cropWidth: 800, glare: 0, choices: 1, codeFrames: 0, canZoom: false };

test('a good frame says nothing', () => {
  assert.equal(chooseCoach(base), null);
});

test('a barcode in progress outranks everything else', () => {
  const key = chooseCoach({ ...base, codeFrames: 1, glare: 0.5, cropWidth: 50, choices: 3 });
  assert.equal(key, 'hold');
});

test('a small crop says nothing while there is zoom left to spend', () => {
  assert.equal(chooseCoach({ ...base, cropWidth: MIN_CROP_PX - 100, canZoom: true }), null);
  assert.equal(chooseCoach({ ...base, cropWidth: MIN_CROP_PX - 100, canZoom: false }), 'closer');
});

test('glare is called before distance, because tilting is cheaper than walking', () => {
  const key = chooseCoach({ ...base, glare: 0.3, cropWidth: 100, canZoom: false });
  assert.equal(key, 'glare');
});

test('one object is never a choice to make', () => {
  assert.equal(chooseCoach({ ...base, choices: 1 }), null);
  assert.equal(chooseCoach({ ...base, choices: 2 }), 'pick');
});

test('a condition has to hold before it is allowed to speak', () => {
  const c = new Coach();
  const bad = { ...base, choices: 2 };
  assert.equal(c.update(bad, 0), null, 'not on the first frame it appears');
  assert.equal(c.update(bad, 400), null, 'not half a second in');
  assert.equal(c.update(bad, 900), 'pick', 'once it has actually persisted');
});

test('a line does not vanish the instant its condition blinks out', () => {
  const c = new Coach();
  const bad = { ...base, glare: 0.5 };
  c.update(bad, 0);
  assert.equal(c.update(bad, 900), 'glare');
  assert.equal(c.update(base, 1000), 'glare', 'one clean frame is not a fix');
  assert.equal(c.update(base, 1500), 'glare', 'still inside its minimum showing time');
  assert.equal(c.update(base, 3000), null, 'gone, once it has been gone a while');
});

test('the tap-to-choose line is spent after one appearance', () => {
  const c = new Coach();
  const many = { ...base, choices: 3 };
  c.update(many, 0);
  assert.equal(c.update(many, 900), 'pick');
  // Clear it, then bring the same condition back.
  c.update(base, 3000);
  c.update(base, 5000);
  c.update(many, 6000);
  assert.equal(c.update(many, 7000), null, 'a control only needs teaching once');
});

test('glare is measured inside the box, not across the frame', () => {
  // A 10 by 10 frame, all black except a blown 4 by 4 block in the top left.
  const width = 10;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const p = (y * width + x) * 4;
      data[p] = 255; data[p + 1] = 255; data[p + 2] = 255; data[p + 3] = 255;
    }
  }
  const frame = { data, width, height };
  const onTheBlock = glareIn(frame, { x: 0, y: 0, width: 4, height: 4 }, width);
  const offTheBlock = glareIn(frame, { x: 5, y: 5, width: 4, height: 4 }, width);
  assert.equal(onTheBlock, 1);
  assert.equal(offTheBlock, 0);
});

test('glare rescales a source-space box onto a downscaled frame', () => {
  // Same frame, but the box arrives in 20-wide source coordinates for a
  // 10-wide scan frame, which is exactly what the camera loop hands it.
  const width = 10;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const p = (y * width + x) * 4;
      data[p] = 255; data[p + 1] = 255; data[p + 2] = 255; data[p + 3] = 255;
    }
  }
  assert.equal(glareIn({ data, width, height }, { x: 0, y: 0, width: 8, height: 8 }, 20), 1);
});

test('zoom holds still inside the deadband and never runs past its ceiling', () => {
  const caps = { min: 1, max: 10, step: 0.1 };
  const frame = { w: 1000, h: 1000 };
  // A box already at 55 percent of the short side: nothing to gain.
  const settled = zoomFor(1, { x: 0, y: 0, width: 550, height: 550 }, frame.w, frame.h, caps);
  assert.equal(settled, 1);
  // A tiny box wants far more magnification than four times the widest setting.
  const tiny = zoomFor(1, { x: 0, y: 0, width: 20, height: 20 }, frame.w, frame.h, caps);
  assert.equal(tiny, 4);
  // A box overflowing the frame zooms back out rather than losing the shot.
  const overflowing = zoomFor(3, { x: 0, y: 0, width: 1400, height: 1400 }, frame.w, frame.h, caps);
  assert.ok(overflowing < 3);
  assert.ok(overflowing >= caps.min);
});
