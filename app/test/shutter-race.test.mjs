/*
 * D-083. With the eye live, the shutter's answer comes from
 * handlePhotoCapture and never from the 420 ms stand-in timer; that timer
 * exists only for the no-eye fallback, where there is no crop to send.
 * Source-asserted, the convention for code inside camera.js's render closure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8');
const shoot = src.slice(src.indexOf('function shoot()'), src.indexOf('async function proceed('));

test('a live eye returns from shoot() before the stand-in timer is scheduled', () => {
  const live = shoot.indexOf('if (eye?.live) {');
  const ret = shoot.indexOf('return;', live);
  const timer = shoot.indexOf('setTimeout(');
  assert.ok(live > 0, 'the live-eye branch exists');
  assert.ok(ret > live && ret < timer, 'the live branch returns before the timer, so the demo list cannot race a real answer');
});

test('the stand-in list is only ever scheduled on the no-eye path', () => {
  const timerBody = shoot.slice(shoot.indexOf('setTimeout('));
  assert.ok(timerBody.includes('candidateSheet(scenarios)'), 'the fallback still lands on the hand-priced list');
  assert.equal((shoot.match(/candidateSheet\(scenarios\)/g) ?? []).length, 1, 'exactly one stand-in paint in shoot()');
});
