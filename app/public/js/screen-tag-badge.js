/**
 * The screen tag badge: a tiny "a12" fixed in one corner of the viewport that
 * names whatever screen, sheet or modal is showing, so the owner can say "on a12
 * the button is wrong". The names are in screen-tags.js; this file only decides
 * which one applies right now and draws it.
 *
 * HIDDEN BY DEFAULT. A real user never sees it and never pays for it: while tags
 * are off there is no element and no observer. It is switched on by
 *
 *   - opening the app with ?tags=1 (?tags=0 switches it off), which is then
 *     remembered in localStorage under `shin.tags`, or
 *   - the "Show screen tags" switch in the Developer row at the bottom of You.
 *
 * ONE CENTRAL PLACE, NO LINE PER SCREEN. The router calls `mountTags` once and
 * `refreshTag` at the end of every paint, and a MutationObserver on `#screen`
 * calls it again whenever the DOM changes underneath a screen: a sheet rising over
 * the camera, a detent moving, a list going empty, a modal opening or closing. A
 * new screen or sheet therefore needs an entry in screen-tags.js and nothing here.
 * If it has no entry the badge reads "a?", which is the visible sign of the gap
 * (and test/screen-tags.test.mjs fails before it ships).
 *
 * No DOM at import time, so the router and the tests can load this in Node.
 */

import { SCREEN_TAGS } from './screen-tags.js';

const STORE_KEY = 'shin.tags';

let on = false;
let started = false;
let rootEl = null;
let badgeEl = null;
let observer = null;
let pending = false;

/**
 * Which tag applies. Pure so a test can drive it with a fake DOM.
 *
 * @param routeId  the current screen id, or null
 * @param matches  (selector) => boolean, is that selector present right now
 * @param tags     the registry
 * @returns the tag ("a12"), or null when the registry has nothing for this route
 *
 * Highest `rank` among the matching entries wins; an entry with no `sel` always
 * matches; a tie goes to the entry that appears first in the registry. When
 * nothing matches, the route's first entry is used, so the badge never keeps the
 * previous screen's tag. Entries with route '*' apply on every route.
 */
export function pickTag(routeId, matches, tags = SCREEN_TAGS) {
  let first = null;
  let best = null;
  let bestRank = -Infinity;
  for (const [tag, e] of Object.entries(tags)) {
    if (e.route !== routeId && e.route !== '*') continue;
    // A retired tag (screen-tags.js rule 1) keeps its number and never matches.
    if (e.retired) continue;
    if (e.route === routeId && first === null) first = tag;
    if (e.sel) {
      let hit = false;
      try { hit = Boolean(matches(e.sel)); } catch { hit = false; }
      if (!hit) continue;
    }
    const rank = e.rank ?? 0;
    if (rank > bestRank) { best = tag; bestRank = rank; }
  }
  return best ?? first;
}

function readStored() {
  try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}

function writeStored(value) {
  try {
    if (value) localStorage.setItem(STORE_KEY, '1');
    else localStorage.removeItem(STORE_KEY);
  } catch { /* private window: the choice lasts for this session only */ }
}

/** Whether tags are switched on right now. */
export function tagsOn() {
  return on;
}

/** Switch tags on or off, remember the choice, and update the badge at once. */
export function setTagsOn(value) {
  on = Boolean(value);
  writeStored(on);
  refreshTag();
}

/**
 * Reads the switch from the address (?tags=1 or ?tags=0, which also becomes the
 * remembered choice) and otherwise from storage. Exported for the test.
 */
export function readTagsSwitch(search, stored) {
  const q = new URLSearchParams(search).get('tags');
  if (q === '1') return { on: true, persist: true };
  if (q === '0') return { on: false, persist: true };
  return { on: stored, persist: false };
}

/** Called once by the router with the `#screen` element. */
export function mountTags(root, search = typeof location === 'undefined' ? '' : location.search) {
  rootEl = root;
  const sw = readTagsSwitch(search, readStored());
  on = sw.on;
  if (sw.persist) writeStored(on);
  refreshTag();
}

function ensureBadge() {
  if (badgeEl && badgeEl.parentNode) return badgeEl;
  badgeEl = document.createElement('div');
  badgeEl.setAttribute('class', 'screen-tag');
  badgeEl.setAttribute('aria-hidden', 'true');
  badgeEl.setAttribute('data-no-track', '');
  document.body.appendChild(badgeEl);
  return badgeEl;
}

function schedule() {
  if (pending) return;
  pending = true;
  /* setTimeout, not requestAnimationFrame: a hidden tab never runs rAF (router.js
     `announce` says the same) and the badge should be right when the tab returns. */
  setTimeout(() => { pending = false; refreshTag(); }, 0);
}

function watch() {
  if (observer || !rootEl || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(schedule);
  observer.observe(rootEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-screen', 'data-state', 'data-camera', 'data-detent', 'hidden', 'aria-busy'],
  });
}

function unwatch() {
  if (observer) observer.disconnect();
  observer = null;
}

/** Sets the badge from the screen that is showing now. Cheap, and a no-op while tags are off. */
export function refreshTag() {
  if (!on || !rootEl) {
    unwatch();
    if (badgeEl) { badgeEl.remove(); badgeEl = null; }
    started = false;
    return;
  }
  started = true;
  watch();
  const route = rootEl.dataset?.screen ?? null;
  const tag = pickTag(route, (sel) => rootEl.querySelector(sel));
  ensureBadge().textContent = tag ?? 'a?';
}

/** For the test: whether the badge has been started. */
export function badgeStarted() {
  return started;
}
