/**
 * Three screen-layer rules, pinned by source because the code they guard needs a
 * DOM and this suite has none. Same convention as notthis.test.mjs: the string
 * check is the guard against the line being quietly removed; the behaviour was
 * verified by reading the call path, and the rows in DEFECTS.md say so.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (rel) => readFileSync(new URL(`../public/js/${rel}`, import.meta.url), 'utf8');
const tsSrc = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

test('a nested paint cannot have its cleanup overwritten by the paint it interrupted', () => {
  const router = src('router.js');
  // share.js calls ctx.replace('camera') during its own render, which paints
  // the camera and stores its cleanup; the OUTER paint then stored `undefined`
  // over it, and the camera's stream, eye and listeners outlived every
  // navigation after that. A render's return value is kept only if no later
  // paint began while it ran.
  assert.match(router, /const gen = \+\+paintGen;/);
  assert.match(router, /if \(gen === paintGen\) cleanup = returned;/);
  assert.doesNotMatch(router, /cleanup = screen\.render\(/, 'the unguarded assignment is back');
});

test('the router error page shows no exception text and escapes what it does show', () => {
  const router = src('router.js');
  assert.doesNotMatch(router, /\$\{String\(err && err\.message/, 'err.message is printed to the shopper again');
  assert.match(router, /console\.error\('render failed for'/);
  assert.match(router, /data-act="screen-error-home"/, 'the page has no way out');
});

test('the scan store error message never reaches the profile screen', () => {
  const you = src('screens/you.js');
  // droppedWhy is SQLITE_CANTOPEN and its cousins. It is logged, not printed.
  assert.doesNotMatch(you, /\$\{s\.droppedWhy\}/);
  assert.doesNotMatch(you, /why: s\.droppedWhy/);
  assert.match(you, /console\.error\('scan log could not be written:', s\.droppedWhy\)/);
});

test('the alt-object buttons are inert whenever a sheet is up, not just faded', () => {
  const camera = src('screens/camera.js');
  // Opacity hides them from the pointer and not from the keyboard.
  assert.match(camera, /marks\.inert = next !== 'idle'/);
});

test('the capture queue removes every listener it attached', () => {
  const queue = tsSrc('eye/queue.ts');
  const auto = queue.slice(queue.indexOf('export function autoDrain'), queue.indexOf('}', queue.indexOf('return () => {')) + 1);
  // It attached two and removed one. The visibility handler was an anonymous
  // closure the teardown could not name, so every re-entry of the queue left a
  // permanent handler draining IndexedDB on every tab-visibility change.
  assert.match(auto, /document\.addEventListener\('visibilitychange', onWake\)/);
  assert.match(auto, /document\.removeEventListener\('visibilitychange', onWake\)/);
  assert.doesNotMatch(auto, /addEventListener\('visibilitychange', \(\) =>/, 'the anonymous listener is back');
});

test('a list screen retry asks storage again instead of assuming it will work now', () => {
  for (const file of ['screens/watchlist.js', 'screens/pastscans.js', 'screens/removed.js']) {
    const screen = src(file);
    assert.match(screen, /phase = store\.reload\(\) \? 'error' : 'ready'/, `${file} retries on hope`);
    assert.doesNotMatch(screen, /retry"\]'\)\) \{ phase = 'ready'/, `${file} still sets ready blindly`);
  }
});
