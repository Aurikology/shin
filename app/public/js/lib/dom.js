/**
 * The three things every screen was writing for itself.
 *
 * Added 2026-09-06 as the shared floor under the screens. Deliberately small:
 * five exports and no framework. A screen that needs a sixth thing should say
 * so rather than growing this file, because five modules import it and a file
 * five modules import is a file that has to stay boring.
 */

/**
 * Text into HTML, safely.
 *
 * Every screen builds its markup by interpolating into a template literal and
 * assigning `innerHTML`, and before this there was no escape helper anywhere in
 * `public/js` -- zero hits, repo-wide. `pastscans.js` put a user-typed item name
 * straight into a row, so correcting an item to `<img src=x onerror=...>` and
 * opening Past scans ran it. That is self-XSS today, and a real hole the moment
 * any of this is shared between two people.
 *
 * Escapes the five characters that matter in both element and attribute
 * positions, so one function covers `<p>${x}</p>` and `title="${x}"` alike.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tagged template that escapes every interpolation.
 *
 *   html`<p>${untrusted}</p>`
 *
 * The opt-out is deliberate and explicit: to embed markup you already built,
 * pass it through `raw()`. A screen that wants unescaped output has to say the
 * word, which is the whole point.
 */
export function html(strings, ...values) {
  return strings.reduce((out, chunk, i) => {
    if (i === 0) return chunk;
    const v = values[i - 1];
    return out + (v instanceof Raw ? v.value : escapeHtml(v)) + chunk;
  }, '');
}

class Raw {
  constructor(value) {
    this.value = value ?? '';
  }
}

/** Mark already-built markup as safe to embed in an `html` template. */
export const raw = (value) => new Raw(value);

/**
 * "12 min ago", "3 h ago", "2 d ago".
 *
 * Was three functions in three screens. `watchlist.js` and `pastscans.js` were
 * near-identical -- this is theirs, keeping pastscans' `Number.isFinite` guard,
 * because watchlist's version returned "NaN min ago" on an unparseable date
 * rather than falling back.
 *
 * `removed.js` is NOT one of the duplicates and did not fold in here: it counts
 * whole days against a 30-day retention window, which is a different question.
 * It is `agoDays` below.
 */
export function ago(iso) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'just now';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * "today", "1 day ago", "12 days ago". Whole days only.
 *
 * The recently-removed list is a 30-day window, and an item's age there is the
 * thing that decides whether it still exists. Minutes would be noise.
 */
export function agoDays(iso) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'today';
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Add a listener that the router can take away again.
 *
 * Every screen attached its handlers to the persistent `#screen` element and
 * none of them removed them, so navigating camera -> you -> camera left two
 * live camera handlers on the same node. `camera.js` fixed this for itself with
 * an `AbortController`; this is that fix, available to the other nine.
 *
 * Pass the signal from a controller the screen aborts in its cleanup:
 *
 *   const ac = new AbortController();
 *   on(root, 'click', handler, ac.signal);
 *   return () => ac.abort();
 */
export function on(el, type, fn, signal, options) {
  el.addEventListener(type, fn, signal ? { ...options, signal } : options);
}
