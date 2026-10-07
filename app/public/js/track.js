/**
 * Everything the client does, queued and sent. Added 2026-09-14 on the
 * founder's word, "build everything for collecting EVERYTHING": the vision
 * doc's own sentence is that all of a user's scanned data trains Pexi's
 * models and answers other shoppers, and until today the only client events
 * that existed were the handful `consent-actions.js` and `eye-attach.js`
 * called `api.postEvent` for by hand. This is the one place that captures the
 * rest -- app opens, screens, every tap, visibility, errors -- so a screen
 * author never has to remember to instrument a new button.
 *
 * ONE SMALL MODULE, STARTED FROM MAIN.JS, per the brief, and it earns that by
 * doing its setup as an import side effect rather than needing a second call:
 * `main.js` writes `import './track.js'` once and everything below is armed.
 * `camera.js` and anywhere else that wants a semantic event past what this
 * file captures on its own imports `{ track }` and calls it directly -- a
 * barcode read, a candidate pick, a typed search -- for the facts a generic
 * tap or a page-load listener cannot know.
 *
 * QUEUED IN MEMORY, PERSISTED TO localStorage, FLUSHED OVER THE NETWORK. The
 * aisle with no signal is this app's normal case (`corrections.js`'s own
 * header states the same discipline), so an event written down here survives
 * a reload before it has ever reached the server. Every mutation of the queue
 * is followed by a write to storage; a private window or a full quota simply
 * means the queue lives only in memory for that session; there is nothing to
 * throw over.
 *
 * fetch WITH keepalive, NOT sendBeacon. `sendBeacon` cannot carry a custom
 * header, and `x-shin-invite` (api.js's own `headers()`) is what gets a
 * request past the beta gate at all -- a beacon would arrive and be refused
 * 401, silently, on every browser that has one. `keepalive: true` on `fetch`
 * is what actually buys the thing sendBeacon is usually reached for: the
 * request outlives a page that is being hidden or unloaded. The fetch itself
 * goes through `api.js`'s own `postEventsBatch`, because api.js's header
 * comment is "the only place the client talks to the server" and this file
 * does not get to be the second one.
 *
 * WHAT MAY BE IN A PAYLOAD, changed alongside `events.ts`'s own header the
 * same day: coordinates and typed text, including text typed and then
 * abandoned, are captured on purpose now. Never a photo's own bytes -- those
 * still go through the photo route behind the photo consent flag, never
 * through this queue.
 */
import { getDeviceId } from './device.js';
import { postEventsBatch } from './api.js';
import { APP_VERSION } from './version.js';
import * as router from './router.js';

const QUEUE_KEY = 'shin.track.queue';
/** Sent per flush, at most. `events.ts`'s route cap is ~200; this stays under it
    with room for a second module to queue something the same tick. */
const BATCH_SIZE = 150;
/** The queue itself is bounded so a runaway loop (a tap handler retriggering
    itself, say) fills memory and storage rather than growing forever. Old
    events are dropped first: the newest ones are the ones still actionable. */
const MAX_QUEUED = 2000;
const FLUSH_MS = 5000;

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let queue = loadQueue();
let flushing = false;

function saveQueue() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // A private window, or a full quota. The queue still works in memory for
    // the rest of this session; there is nothing here worth surfacing.
  }
}

/**
 * Queues one event. Never throws, and never awaited by a caller: exactly the
 * contract `api.js`'s own `postEvent` states for the same reason -- a log
 * with an opinion about whether the thing it is logging may happen is a
 * contradiction.
 */
export function track(type, payload = {}) {
  try {
    const device = getDeviceId();
    queue.push({
      deviceId: device?.id ?? null,
      type: String(type).slice(0, 64),
      payload: payload ?? {},
      createdAt: new Date().toISOString(),
    });
    if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED);
    saveQueue();
  } catch (err) {
    console.error('track failed:', err);
  }
}

/**
 * Sends up to one batch's worth and drops only what the server actually took.
 * A failed send (offline, or the route not up yet) leaves the whole queue in
 * place for the next timer or the next visibility change to try again.
 */
async function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    const batch = queue.slice(0, BATCH_SIZE);
    const ok = await postEventsBatch(batch);
    if (ok) {
      queue = queue.slice(batch.length);
      saveQueue();
    }
  } catch {
    // Offline, or the server declined it outright. Left queued either way.
  } finally {
    flushing = false;
  }
}

/*
 * `.unref()` when it exists (Node, not a browser) so this timer never keeps a
 * process alive on its own account. A page never needs that: the tab is what
 * keeps the browser's event loop running, not this interval. A Node process
 * that imports this file for anything other than serving the page -- every
 * test in this suite that imports `camera.js` for a pure function, with no
 * DOM and no intention of ever running the event loop for five seconds -- is
 * exactly the case an un-unref'd timer breaks: `node --test` would wait on a
 * timer that fires forever, in a subprocess nothing is ever going to flush.
 */
setInterval(() => { void flush(); }, FLUSH_MS)?.unref?.();

/*
 * NO DOM IS A REAL CALLER HERE, not a hypothetical one. `camera.js` imports
 * `{ track }` from this file directly (not only through `main.js`), and
 * `wire-seam.test.mjs`, `shops.test.mjs` and several other suites import
 * `camera.js` in a plain Node process with no `window`, `document`,
 * `navigator` or `screen` at all -- `shops.test.mjs`'s own header states the
 * contract those suites are written against: "NO DOM, NO NETWORK, NO
 * GEOLOCATION". A module-load-time reference to any browser global is exactly
 * the kind of thing that contract forbids and this file broke it once
 * already: the first version read `screen.width` as a bare top-level
 * statement and took down every one of those suites the moment `camera.js`
 * pulled this file in. Everything below that arms a listener or reads a
 * browser global up front is gated on this one check so importing this file
 * is safe anywhere `camera.js` itself is safe to import; `track()` itself
 * stays callable regardless; it already degrades a missing `localStorage` to
 * an in-memory-only queue the same way.
 */
const hasBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

if (hasBrowser) {
  /* -------------------------------------------------------- app_open ---- */

  const connectionType = () => {
    const c = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
    return c?.effectiveType ?? null;
  };

  const isStandalone = () => {
    try {
      return Boolean(navigator.standalone) || matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  };

  track('app_open', {
    appVersion: APP_VERSION,
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio ?? null,
    language: navigator.language ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    connectionEffectiveType: connectionType(),
    standalone: isStandalone(),
  });

  /* ------------------------------------------------------ screen_view --- */

  /*
   * `router.js` dispatches `shin:navigated` on `window` after every paint,
   * with `{ id, params }`. That is the one moment a screen change is
   * knowable from outside the router, and it is already there for exactly
   * this kind of listener (its own header names theme sync as the first
   * tenant).
   */
  let lastScreen = null;
  let lastScreenAt = Date.now();

  window.addEventListener('shin:navigated', (e) => {
    const now = Date.now();
    const previous = lastScreen;
    const msOnPrevious = previous === null ? null : now - lastScreenAt;
    track('screen_view', { screen: e.detail?.id ?? router.currentId() ?? null, previousScreen: previous, msOnPrevious });
    lastScreen = e.detail?.id ?? router.currentId() ?? null;
    lastScreenAt = now;
  });

  /* ----------------------------------------------------------- taps ----- */

  /*
   * ONE LISTENER, CAPTURE PHASE, ON THE DOCUMENT. The alternative is every
   * screen wiring its own tap tracking into its own click handler, which is
   * exactly the kind of thing a screen author forgets to do on the next
   * button they add. Capture rather than bubble so a screen's own handler
   * calling `stopPropagation` (none do today, but nothing here should
   * depend on that staying true) still lets the tap get counted.
   */
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    /*
     * THE ONE REGION THIS LISTENER MUST NOT SEE, and it is a contract rather
     * than a preference. Google's Gemini API terms for Grounded Results
     * (eff. 2026-03-23) say we "will not track whether those interactions
     * were specifically with a given Search Suggestion or Grounded Result...
     * including any specific Link". This listener's whole job is to record
     * which element was tapped, by label, tag and class, which is exactly
     * that. `grounded.js` stamps `data-no-track` on the root of the block it
     * renders and puts nothing of Pexi's own inside it, so one ancestor
     * check covers every offer row, every review and Google's own rendered
     * Search Suggestions in a single statement.
     *
     * IT IS DELIBERATELY THE FIRST THING AFTER THE NULL CHECK, before the
     * `[data-act]` lookup below. A guard that runs after the label has been
     * computed still leaks the label into a closure and, worse, invites a
     * later refactor to move the `track()` call above it. A test in
     * `test/grounded-client.test.mjs` asserts this guard's source index is
     * LOWER than the `[data-act]` lookup's, so a refactor that quietly
     * demotes it fails even though both lines are still present.
     *
     * Screen-level events (`screen_view`, `visibility`) are untouched: they
     * record that a screen was open, never which link on it was pressed.
     */
    if (target.closest('[data-no-track]')) return;
    const actionEl = target.closest('[data-act]');
    const linkish = target.closest('button, a, [role="button"]');
    const label =
      actionEl?.dataset.act ??
      linkish?.getAttribute('aria-label') ??
      linkish?.textContent?.trim().slice(0, 80) ??
      null;
    const el = linkish ?? actionEl ?? target;
    track('tap', {
      screen: router.currentId() ?? null,
      label,
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      class: typeof el.className === 'string' ? el.className : null,
      xFraction: window.innerWidth ? e.clientX / window.innerWidth : null,
      yFraction: window.innerHeight ? e.clientY / window.innerHeight : null,
    });
  }, { capture: true });

  /* ------------------------------------------------------ visibility ---- */

  document.addEventListener('visibilitychange', () => {
    track('visibility', { state: document.hidden ? 'hidden' : 'visible' });
    if (document.hidden) void flush();
  });

  /* ----------------------------------------------------------- errors --- */

  window.addEventListener('error', (e) => {
    track('window_error', {
      message: e.message ?? String(e.error ?? 'unknown error'),
      filename: e.filename ?? null,
      lineno: e.lineno ?? null,
      colno: e.colno ?? null,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    track('unhandled_rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });
}
