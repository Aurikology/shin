/**
 * UX build 5, R-25: lib/auto-fire.js (steady means the same code, reported again
 * 150 ms later) and lib/gtin.js (the check digit that guards a scan nobody pressed).
 * The camera screen's own behaviour is in test/ux/ux-b5-scan.test.mjs; these are the
 * pure rules under it, with a clock the test moves so nothing here waits.
 *
 * Negative controls are in the tests themselves: each "does not fire" case sits
 * next to a case that does, on the same controller, so a controller that never
 * fires cannot pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoFire, AUTO_FIRE_STEADY_MS } from '../public/js/lib/auto-fire.js';
import { hasValidCheckDigit, assertCheckDigit } from '../public/js/lib/gtin.js';

function rig(extra = {}) {
  let t = 1000;
  const fired = [];
  const af = createAutoFire({ now: () => t, fire: (r) => fired.push(r.value), ...extra });
  return { af, fired, at: (ms) => { t = 1000 + ms; } };
}

test('a code reported again 150 ms later fires once, and not before', () => {
  const { af, fired, at } = rig();
  af.ready({ value: '111' });
  at(AUTO_FIRE_STEADY_MS - 1);
  af.ready({ value: '111' });
  assert.deepEqual(fired, [], 'fired before 150 ms');
  at(AUTO_FIRE_STEADY_MS);
  af.ready({ value: '111' });
  assert.deepEqual(fired, ['111']);
  at(900);
  af.ready({ value: '111' });
  assert.deepEqual(fired, ['111'], 'a code still in frame fired a second time');
});

test('losing the code, or another code taking its place, restarts the wait', () => {
  const { af, fired, at } = rig();
  af.ready({ value: '111' });
  at(100);
  af.ready(null);
  at(400);
  af.ready({ value: '111' });
  assert.deepEqual(fired, [], 'a code that left the frame kept its old start time');
  at(450);
  af.ready({ value: '222' });
  at(500);
  af.ready({ value: '111' });
  assert.deepEqual(fired, [], 'two codes taking turns fired');
  at(700);
  af.ready({ value: '111' });
  assert.deepEqual(fired, ['111'], 'control: a steady code did not fire');
});

test('a code that has fired fires again only after it left the frame', () => {
  const { af, fired, at } = rig();
  af.ready({ value: '111' });
  at(200);
  af.ready({ value: '111' });
  af.ready(null);
  at(210);
  af.ready({ value: '111' });
  at(400);
  af.ready({ value: '111' });
  assert.deepEqual(fired, ['111', '111']);
});

test('a busy screen does not lose the code: the next report fires it', () => {
  let busy = true;
  const { af, fired, at } = rig({ canFire: () => !busy });
  af.ready({ value: '111' });
  at(300);
  af.ready({ value: '111' });
  assert.deepEqual(fired, []);
  busy = false;
  at(330);
  af.ready({ value: '111' });
  assert.deepEqual(fired, ['111']);
});

test('fire that throws marks the code spent: one error, not one per report', () => {
  let calls = 0;
  const { af, at } = rig({ fire: () => { calls += 1; throw new Error('bad check digit'); } });
  af.ready({ value: '111' });
  at(200);
  assert.throws(() => af.ready({ value: '111' }), /bad check digit/);
  at(400);
  af.ready({ value: '111' });
  assert.equal(calls, 1);
});

test('a read with no value throws instead of firing on nothing', () => {
  const { af } = rig();
  assert.throws(() => af.ready({ format: 'EAN13' }), /no value/);
  assert.throws(() => createAutoFire({}), /fire function/);
  assert.throws(() => createAutoFire({ fire() {}, steadyMs: 0 }), /steadyMs/);
});

test('check digits: EAN-13, UPC-A, EAN-8 and UPC-E hold; a changed digit, a short code and a letter do not', () => {
  assert.equal(hasValidCheckDigit('0068100084245'), true, 'EAN-13');
  assert.equal(hasValidCheckDigit('068100084245'), true, 'the same product as a 12-digit UPC-A');
  assert.equal(hasValidCheckDigit('068100084240'), false, 'UPC-A with its last digit changed');
  assert.equal(hasValidCheckDigit('036000291452'), true, 'UPC-A');
  assert.equal(hasValidCheckDigit('96385074'), true, 'EAN-8');
  assert.equal(hasValidCheckDigit('04252614'), true, 'UPC-E 04252614 is UPC-A 042100005264');
  assert.equal(hasValidCheckDigit('04252615'), false, 'UPC-E with its check digit changed');
  assert.equal(hasValidCheckDigit('0068100084240'), false, 'last digit changed');
  assert.equal(hasValidCheckDigit('12345'), false, 'not a retail length');
  assert.equal(hasValidCheckDigit('00681000842x5'), false, 'a letter');
  assert.equal(hasValidCheckDigit(68100084245), false, 'a number, not a string');
  assert.equal(assertCheckDigit('0068100084245'), '0068100084245');
  assert.throws(() => assertCheckDigit('0068100084240'), /check digit/);
});
