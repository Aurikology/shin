/**
 * The browser tab's text, which is `router.js`'s `titleFor`.
 *
 * D-016: the tab read "Shin · Shin" on the camera, because the router appended
 * " · Shin" to every screen title and the camera's own title is "Shin". The
 * decision and its reasoning are on `titleFor` itself; this file is the part
 * that fails when somebody undoes it.
 *
 * The second test is the one with teeth. Asserting `titleFor('Shin')` alone
 * would keep passing on the day a screen is registered under a title the rule
 * has never seen, so the screen titles are read off the screen modules and run
 * through the rule. They are read with a regex rather than by importing the
 * modules: every screen imports `shin.js`, which reaches `document` at import
 * time, and standing up a DOM to read ten string literals would be a worse
 * trade than the regex is. This is the same call `head.test.mjs` makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { titleFor } from '../public/js/router.js';

const SCREENS = new URL('../public/js/screens/', import.meta.url);

/** Every `title: '...'` a screen module registers, as [file, title] pairs. */
function registeredTitles() {
  const out = [];
  for (const name of readdirSync(fileURLToPath(SCREENS))) {
    if (!name.endsWith('.js')) continue;
    const src = readFileSync(fileURLToPath(new URL(name, SCREENS)), 'utf8');
    // The screen contract's own field, at the top level of the default export.
    for (const m of src.matchAll(/^\s{2}title:\s*'([^']*)'/gm)) out.push([name, m[1]]);
  }
  return out;
}

test('a screen whose title is already the app name does not get the app name twice', () => {
  assert.equal(titleFor('Shin'), 'Shin');
});

test('every other screen is named, then placed', () => {
  assert.equal(titleFor('Saved'), 'Saved · Shin');
  assert.equal(titleFor('Past scans'), 'Past scans · Shin');
});

test('a screen with no title at all still names the app', () => {
  assert.equal(titleFor(undefined), 'Shin');
  assert.equal(titleFor(''), 'Shin');
});

test('no registered screen produces a doubled app name', () => {
  const titles = registeredTitles();
  // Guard the guard: a regex that matched nothing would pass this silently.
  assert.ok(titles.length >= 10, `expected to find the screen titles, found ${titles.length}`);

  for (const [file, title] of titles) {
    const tab = titleFor(title);
    assert.notEqual(tab, 'Shin · Shin', `${file} registers "${title}" and the tab doubles it`);
    assert.equal(tab, title === 'Shin' ? 'Shin' : `${title} · Shin`, `${file} registers "${title}"`);
  }
});
