/**
 * Item 9, 2026-09-17: "If the camera identifies a barcode, there should be
 * prompts on screen that tell the user how to center the camera better."
 *
 * The coaching decision is pure, so it is tested here on numbers. That the
 * words are in Pexi's three voices and about the framing is pinned against
 * voice.js in the second half.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { centreKey, chooseCoach, Coach, CENTRE_TOLERANCE } from '../src/eye/framing.ts';

const base = { cropWidth: 800, glare: 0, choices: 1, codeFrames: 0, canZoom: false };

test('a barcode well left of centre says to aim left; right, up and down likewise', () => {
  assert.equal(chooseCoach({ ...base, codeFrames: 3, codeOffset: { dx: -0.3, dy: 0 } }), 'centre_left');
  assert.equal(chooseCoach({ ...base, codeFrames: 3, codeOffset: { dx: 0.3, dy: 0.02 } }), 'centre_right');
  assert.equal(chooseCoach({ ...base, codeFrames: 3, codeOffset: { dx: 0, dy: -0.35 } }), 'centre_up');
  assert.equal(chooseCoach({ ...base, codeFrames: 3, codeOffset: { dx: 0.05, dy: 0.35 } }), 'centre_down');
});

test('the axis that is further off wins, so one move is asked for at a time', () => {
  assert.equal(centreKey({ dx: -0.2, dy: 0.4 }), 'centre_down');
  assert.equal(centreKey({ dx: -0.4, dy: 0.2 }), 'centre_left');
});

test('a barcode near the middle says only to hold', () => {
  const inside = CENTRE_TOLERANCE * 0.9;
  assert.equal(chooseCoach({ ...base, codeFrames: 3, codeOffset: { dx: inside, dy: -inside } }), 'hold');
  assert.equal(chooseCoach({ ...base, codeFrames: 3 }), 'hold', 'no box known must not invent a direction');
});

test('the coaching stops once the button is showing', () => {
  assert.equal(
    chooseCoach({ ...base, codeFrames: 12, codeConfirmed: true, codeOffset: { dx: -0.4, dy: 0 } }),
    null,
    'the centre line is still up after the vote earned the button',
  );
});

test('no barcode in view means no centre line', () => {
  assert.equal(chooseCoach({ ...base, codeFrames: 0, codeOffset: { dx: -0.4, dy: 0 } }), null);
});

test('a centre line waits to earn its place like every other line', () => {
  const coach = new Coach();
  const s = { ...base, codeFrames: 3, codeOffset: { dx: -0.3, dy: 0 } };
  assert.equal(coach.update(s, 0), null, 'spoke on the first tick');
  assert.equal(coach.update(s, 400), null, 'spoke before the condition had held');
  assert.equal(coach.update(s, 1000), 'centre_left');
});

/* ---------------------------------------------------- the words themselves */

const VOICE = readFileSync(fileURLToPath(new URL('../public/js/voice.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const VOICE_FR = readFileSync(fileURLToPath(new URL('../public/js/voice-fr.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const SCREEN = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

function block(src: string, key: string): string {
  const at = src.indexOf(`  ${key}: {`);
  assert.notEqual(at, -1, `${key} is not in the voice table`);
  return src.slice(at, src.indexOf('\n  },', at));
}

test('every centre line exists in all three attitudes, in English and French', () => {
  for (const key of ['cam_centre_left', 'cam_centre_right', 'cam_centre_up', 'cam_centre_down', 'cam_too_dark']) {
    for (const src of [VOICE, VOICE_FR]) {
      const b = block(src, key);
      for (const attitude of ['deadpan', 'warm', 'blunt']) {
        assert.match(b, new RegExp(`${attitude}: \\(\\)`), `${key} has no ${attitude} variant`);
      }
    }
  }
});

test('the lines are about the framing and never blame the person, and use no em dash', () => {
  for (const key of ['cam_centre_left', 'cam_centre_right', 'cam_centre_up', 'cam_centre_down', 'cam_too_dark']) {
    const b = block(VOICE, key);
    assert.doesNotMatch(b, /\byou\b|\byour\b|\bwrong\b|\bbad\b|\bfault\b/i, `${key} talks about the person`);
    assert.doesNotMatch(b + block(VOICE_FR, key), /—/, `${key} contains an em dash`);
  }
});

test('the screen maps every coach key the eye can produce to a line', () => {
  for (const [key, line] of [
    ['centre_left', 'cam_centre_left'],
    ['centre_right', 'cam_centre_right'],
    ['centre_up', 'cam_centre_up'],
    ['centre_down', 'cam_centre_down'],
    ['dark', 'cam_too_dark'],
  ]) {
    assert.ok(SCREEN.includes(`${key}: '${line}'`), `COACH_LINES has no ${key} entry, so the eye's line would say nothing`);
  }
});
