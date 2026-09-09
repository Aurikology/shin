/**
 * The router, and the screen contract every screen module implements.
 *
 * A screen module default-exports:
 *   { id, title, render(root, ctx) }
 * where `ctx` is { go, params, store, api, shin }. `render` fills `root` and may
 * return a cleanup function.
 *
 * Screens never import one another. They move by calling ctx.go(id, params),
import { escapeHtml } from './lib/dom.js';
 * which is what keeps the walkthrough's branches (06b off 06, the paywall off
 * 07) from turning into a tangle.
 *
 * Navigation is also an accessibility event, and until 2026-09-06 it was not
 * treated as one (docs/design/FLAWS.md item 4). `paint` emptied #screen, wrote
 * the new screen, set document.title and stopped. Nothing moved focus, so a
 * keyboard user who went camera -> Saved was left on <body> and had to tab from
 * the top of the document to reach the list they had just asked for; nothing
 * announced the change, so a screen reader user got silence -- document.title
 * is announced on a real page load and on nothing else. The three functions
 * below the paint (focus, announce, scroll) are that fix, and they run in that
 * order on purpose: focus first so the reader's cursor is already inside the
 * new screen when the live region speaks.
 */

const routes = new Map();
let current = null;
/*
 * Counts paints. A screen that navigates DURING its own render -- share.js
 * does, when the scan it was asked to show is gone -- re-enters `paint`, which
 * renders the next screen and stores that screen's cleanup. Control then
 * returns to the OUTER paint, whose next statement stored its own screen's
 * return value over it: undefined, from a screen that had already handed off.
 * The camera's cleanup was lost that way, so its stream, its eye and its
 * listeners kept running under whatever screen came next, and every return to
 * the camera stacked another set. Each paint takes a number; a render's return
 * value is kept only if no later paint began while it ran.
 */
let paintGen = 0;
let cleanup = null;
let rootEl = null;
let ctxBase = null;
let painted = false;

/**
 * Where each screen was scrolled to when it was last left.
 *
 * Kept per screen id rather than per history entry: the ids are few and stable,
 * and coming back to Saved from a scan should land where Saved was, whether the
 * back button or a button in the interface brought you there.
 */
const scrollTops = new Map();

/**
 * Which screens have been opened at least once this session.
 *
 * Drives `#screen[data-fresh]`, which is the whole of the entrance animation in
 * shell.css now (FLAWS.md item 9). The old blanket rule replayed a fade-and-rise
 * on every child of every screen on every arrival, including the camera -> Saved
 * -> camera loop the app is mostly made of. An entrance is worth one element the
 * first time you see a screen and worth nothing the twentieth.
 */
const seen = new Set();

/** The scroll container is `.page`, not #screen. #screen is `overflow: hidden`
 *  and the page is absolutely positioned inside it, which is why the old
 *  `rootEl.scrollTop = 0` was a no-op every time it ran. The camera has no
 *  `.page` and scrolls nothing, so this is null there and every caller copes. */
function scroller() {
  return rootEl && rootEl.querySelector('.page');
}

/** The app's name, and the suffix every screen title is hung off. One literal. */
const APP_NAME = 'Shin';

/**
 * The browser tab's text for a screen title.
 *
 * D-016: the tab read "Shin · Shin". Two things were producing the app name and
 * exactly one of them is redundant. The redundant one is the SUFFIX, not the
 * camera's title, and here is why.
 *
 * The camera's registered title being "Shin" is not an oversight. Every other
 * screen is a place inside the app and is titled after itself ("Saved", "Past
 * scans"). The camera is not a place inside the app, it is the app: it is the
 * cold-start screen, it has no h1, and the honest name of the tab a person
 * opened is the app's name. Retitling it to make the suffix rule uniform would
 * buy uniformity by putting a wrong word in the tab ("Camera · Shin" names a
 * screen nobody navigated to) and would still leave this function needing to
 * know something, because a screen title that IS the app name can arrive again.
 *
 * So the suffix is the conditional half. It exists to say which app a screen
 * belongs to, and a screen whose title is already the app name has said that.
 * Appending it there adds no information, which is the definition of redundant.
 *
 * Exported and pure so `test/title.test.mjs` can assert it without a DOM.
 */
export function titleFor(screenTitle) {
  if (!screenTitle) return APP_NAME;
  return screenTitle === APP_NAME ? APP_NAME : `${screenTitle} · ${APP_NAME}`;
}

export function register(screen) {
  routes.set(screen.id, screen);
}

export function screens() {
  return [...routes.values()];
}

export function currentId() {
  return current;
}

export function go(id, params = {}) {
  if (!routes.has(id)) {
    console.warn(`no screen "${id}"`);
    return;
  }
  const next = new URLSearchParams();
  next.set('s', id);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) next.set(k, String(v));
  }
  history.pushState({ id, params }, '', `?${next.toString()}`);
  paint(id, params);
}

/**
 * Moves focus into the screen that was just painted.
 *
 * Preference order is the screen's own `h1`, then #screen itself. Nine screens
 * have an h1 and the camera does not (FLAWS.md item 12 names that separately;
 * it is camera.js's to fix, and this copes either way rather than depending on
 * it). `tabindex="-1"` is set here rather than in each screen's markup so a
 * screen author cannot forget it, and it is programmatic focus only -- the
 * element never enters the tab order.
 *
 * `preventScroll` matters: without it the browser scrolls the newly focused
 * heading into view, which fights the scroll restore three lines later and, on
 * a restored Saved, snaps the list back to the top after putting it right.
 */
function focusScreen() {
  const target = rootEl.querySelector('h1') || rootEl;
  target.setAttribute('tabindex', '-1');
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

/**
 * Announces the arrival through the region in index.html.
 *
 * The region has to live OUTSIDE #screen, because #screen is emptied on every
 * navigation and a live region that is removed and re-inserted in the same tick
 * announces nothing -- the platform has no old value to diff against.
 *
 * The text is cleared and rewritten on a later task for the same reason in
 * miniature: navigating from Saved to Saved writes an identical string, and an
 * identical string is not a change, so it would be silent exactly when the user
 * most needs to hear that something happened.
 *
 * `setTimeout` and not `requestAnimationFrame`, which is what this was first
 * written with. rAF does not run at all while the tab is hidden -- measured, not
 * assumed: a hidden tab here returned "rAF did not fire in 300ms" -- so the
 * region was cleared and then never rewritten, and the announcement for the
 * screen the user is on was permanently empty. A background tab is not a corner
 * case for an app you switch away from to read a receipt.
 */
function announce(screen) {
  const region = document.getElementById('route-status');
  if (!region || !screen.title) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = screen.title; }, 50);
}

/** Replace without adding a history entry. Used when a screen redirects itself. */
export function replace(id, params = {}) {
  const next = new URLSearchParams();
  next.set('s', id);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) next.set(k, String(v));
  }
  history.replaceState({ id, params }, '', `?${next.toString()}`);
  paint(id, params);
}

/**
 * @param restore  true on a back/forward navigation, where the user expects the
 *                 screen to be where they left it. A forward move to a screen is
 *                 a fresh arrival and starts at the top.
 */
function paint(id, params, restore = false) {
  const screen = routes.get(id);
  if (!screen) return;
  // Remember where the outgoing screen was, before its DOM is thrown away.
  const leaving = scroller();
  if (leaving && current) scrollTops.set(current, leaving.scrollTop);
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch (err) {
      console.error('cleanup failed for', current, err);
    }
  }
  cleanup = null;
  current = id;
  rootEl.innerHTML = '';
  rootEl.dataset.screen = id;
  // Set before render so the animation is already armed when the markup lands;
  // setting it after would restart the animation a frame late and show the
  // pre-animation state for that frame.
  if (seen.has(id)) delete rootEl.dataset.fresh;
  else rootEl.dataset.fresh = '';
  seen.add(id);
  // The rule and the reasoning live on `titleFor` above (FLAWS.md item 12,
  // DEFECTS.md D-016).
  document.title = titleFor(screen.title);
  const gen = ++paintGen;
  try {
    const returned = screen.render(rootEl, { ...ctxBase, go, replace, params }) ?? null;
    if (gen === paintGen) cleanup = returned;
  } catch (err) {
    console.error('render failed for', id, err);
    if (gen !== paintGen) return;
    /*
     * The message stays in the console. It was printed here raw and
     * unescaped: an internal string on the screen of somebody who cannot act
     * on it (D-011), and an injection sink for whatever the error carried.
     * The one thing a person can do from this page is leave it.
     */
    rootEl.innerHTML = `<div class="screen-error">
      <h2>That screen did not open.</h2>
      <p>Something on it broke before it could draw. Going back to the camera will clear it.</p>
      <button type="button" class="btn" data-act="screen-error-home">${escapeHtml('Back to the camera')}</button>
    </div>`;
    rootEl.querySelector('[data-act="screen-error-home"]')?.addEventListener('click', () => replace('camera'));
  }
  /*
   * The first paint is a page load, not a navigation. The browser has already
   * put focus at the top of the document and a screen reader has already read
   * the title, so moving focus and announcing here would be a second, wrong
   * arrival -- and stealing focus on load is its own defect. Everything after
   * the first is a real route change.
   */
  if (painted) {
    focusScreen();
    announce(screen);
  }
  painted = true;

  const page = scroller();
  if (page) page.scrollTop = restore ? (scrollTops.get(id) ?? 0) : 0;

  window.dispatchEvent(new CustomEvent('shin:navigated', { detail: { id, params } }));
}

export function start(root, base, fallbackId) {
  rootEl = root;
  ctxBase = base;
  window.addEventListener('popstate', () => {
    const q = new URLSearchParams(location.search);
    const id = q.get('s');
    const params = Object.fromEntries([...q.entries()].filter(([k]) => k !== 's'));
    // Back and forward restore the scroll position; every other arrival is a
    // fresh one and starts at the top.
    paint(routes.has(id) ? id : fallbackId, params, true);
  });
  const q = new URLSearchParams(location.search);
  const id = q.get('s');
  const params = Object.fromEntries([...q.entries()].filter(([k]) => k !== 's'));
  paint(routes.has(id) ? id : fallbackId, params);
}
