/**
 * PICK ONE OF 3: text read off a pack or a shelf tag, matched against Shin's
 * own catalogue, and the top three shown for the shopper to tap.
 *
 * RULINGS.md "Catalogue first; Gemini is a capped fallback, never the identity"
 * (2026-09-27): "anything else by reading every piece of text on the object ...
 * and searching the catalogue with it, returning the top 3 for the shopper to
 * pick, never one row forced out of millions; manual entry when nothing
 * matches." The server half is `POST /api/match-text` (app/src/catalogue-first.ts);
 * this is the client half.
 *
 * THREE PIECES, kept apart so each can be tested without the camera:
 *
 *   A READER, `{ start(onLines), stop() }`. It calls `onLines(string[])`
 *   whenever it has read something. Which reader runs is decided in ONE place,
 *   `pickReader`, and the native one plugs in at `nativeTextReader` below.
 *   Shipped today: a development reader (a textarea, only with `?textmatch=dev`
 *   in the address) and a no-op for everything else, so with no native reader
 *   and no query parameter nothing on the camera changes at all.
 *
 *   A MATCHER, `createTextMatcher`. Throttled: at most one request in flight,
 *   and no two sent closer than MIN_INTERVAL_MS apart; lines identical to the
 *   last ones sent are not sent again. A 404 means the server setting is off,
 *   and the matcher turns itself off for the rest of the session, silently.
 *
 *   THE ROWS, `textMatchHtml`. Up to three tappable candidates (name, brand,
 *   size). A tap hands the candidate's barcode to the caller, which runs the
 *   ordinary barcode scan with it. No candidates shows the one action to type
 *   the name, which is the camera's existing Manual Search (`manual-search`),
 *   not a second typed-search flow.
 */

import { t } from './ui-strings.js';
import { escapeHtml } from './lib/dom.js';

/** No two requests closer together than this. */
export const MIN_INTERVAL_MS = 1500;
/** The server caps a body at 60 lines of 200 characters; the client never sends more. */
export const MAX_LINES = 60;
export const MAX_LINE_CHARS = 200;
/** The ruling's own number. */
export const MAX_CANDIDATES = 3;
/** `?textmatch=dev` turns the development reader on. */
export const DEV_PARAM = 'textmatch';

/* ------------------------------------------------------------ session state */

/*
 * Off for the rest of the session once the server has said the route does not
 * exist. Module state, so a camera screen mounted a second time in the same
 * page load does not ask again; a reload asks once more, which is the right
 * cost for noticing that the setting was flipped on.
 */
let offForSession = false;

export function textMatchOff() {
  return offForSession;
}

/** For tests only: the next matcher starts as if the page had just loaded. */
export function resetTextMatchSession() {
  offForSession = false;
}

/* ------------------------------------------------------------------ lines */

/** Trimmed, non-empty, capped lines, in the order the reader gave them. */
export function cleanLines(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const line of raw) {
    if (typeof line !== 'string') continue;
    const s = line.replace(/\s+/g, ' ').trim();
    if (s === '') continue;
    out.push(s.slice(0, MAX_LINE_CHARS));
    if (out.length === MAX_LINES) break;
  }
  return out;
}

/* ---------------------------------------------------------------- readers */

/** No reader on this device: starts nothing, stops nothing. */
export const NO_READER = Object.freeze({ kind: 'none', start() {}, stop() {} });

/**
 * THE NATIVE TEXT READER PLUGS IN HERE, AND ONLY HERE.
 *
 * Return a `{ kind: 'native', start(onLines), stop() }` backed by the phone's
 * on-device text recognition (ML Kit, through a Capacitor plugin in native/)
 * when that plugin is present, and null when it is not. `start` must call
 * `onLines` with the lines of text it read from the current camera frame;
 * the matcher below does all throttling, so the reader may call it as often
 * as it reads. Today no such plugin exists, so this returns null and
 * `pickReader` falls through to the development reader or the no-op.
 */
export function nativeTextReader() {
  return null;
}

/**
 * The development reader: a textarea whose lines are the "text read off the
 * pack". Created only when the page was opened with `?textmatch=dev`, so it is
 * hidden from everyone else by not existing. Each edit sends every line.
 */
export function devReader({ doc = globalThis.document, host } = {}) {
  let area = null;
  let wrap = null;
  return {
    kind: 'dev',
    start(onLines) {
      if (!doc || !host || area) return;
      wrap = doc.createElement('label');
      wrap.setAttribute('class', 'tm-dev');
      const caption = doc.createElement('span');
      caption.textContent = t('tm_dev_label');
      area = doc.createElement('textarea');
      area.setAttribute('rows', '3');
      area.setAttribute('data-tm-dev', '');
      area.setAttribute('autocomplete', 'off');
      area.setAttribute('spellcheck', 'false');
      wrap.appendChild(caption);
      wrap.appendChild(area);
      host.insertBefore ? host.insertBefore(wrap, host.firstChild ?? null) : host.appendChild(wrap);
      area.addEventListener('input', () => onLines(String(area.value ?? '').split(/\r?\n/)));
    },
    stop() {
      wrap?.remove?.();
      area = null;
      wrap = null;
    },
  };
}

/**
 * Which reader runs. The native one when it is present, the development one
 * when the address asks for it, the no-op otherwise.
 */
export function pickReader({ search = globalThis.location?.search ?? '', doc, host, native = nativeTextReader() } = {}) {
  if (native && typeof native.start === 'function' && typeof native.stop === 'function') return native;
  let dev = false;
  try {
    dev = new URLSearchParams(search).get(DEV_PARAM) === 'dev';
  } catch {
    dev = false;
  }
  return dev ? devReader({ doc, host }) : NO_READER;
}

/* ---------------------------------------------------------------- matcher */

/**
 * The throttled matcher.
 *
 * @param {object} o
 * @param {{start(fn: (lines: string[]) => void): void, stop(): void}} o.reader
 * @param {(lines: string[]) => Promise<object>} o.send  api.js `matchText`
 * @param {(candidates: object[], shelfPrice: object | null) => void} o.onResult
 * @param {() => number} [o.now]
 * @param {(fn: () => void, ms: number) => unknown} [o.setTimer]
 * @param {(id: unknown) => void} [o.clearTimer]
 */
export function createTextMatcher({ reader, send, onResult, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let active = true;
  let inFlight = null;
  let lastKey = null;
  let lastSentAt = -Infinity;
  let pending = null;
  let timer = null;
  let started = false;

  function stopTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function turnOff() {
    offForSession = true;
    pending = null;
    stopTimer();
    if (started) reader.stop();
    started = false;
  }

  function pump() {
    if (!pending || inFlight || timer !== null || offForSession || !active) return;
    const wait = lastSentAt + MIN_INTERVAL_MS - now();
    if (wait > 0) {
      timer = setTimer(() => {
        timer = null;
        pump();
      }, wait);
      return;
    }
    const { lines, key } = pending;
    pending = null;
    lastKey = key;
    lastSentAt = now();
    // Sent now, synchronously, so "in flight" means the request has left.
    let sent;
    try {
      sent = Promise.resolve(send(lines));
    } catch (err) {
      sent = Promise.reject(err);
    }
    inFlight = sent
      .then((res) => {
        if (res?.disabled) { turnOff(); return; }
        // Throttled or unreadable: the same lines may be tried again later.
        if (res?.rateLimited || res?.kind !== 'text_match') { lastKey = null; return; }
        if (!active) return;
        const rows = Array.isArray(res.candidates) ? res.candidates : [];
        const usable = rows.filter((c) => c && typeof c.barcode === 'string' && c.barcode.trim() !== '' && typeof c.name === 'string');
        onResult(usable.slice(0, MAX_CANDIDATES), res.shelfPrice ?? null);
      })
      .catch(() => {
        // No connection or a server fault: nothing on screen changes, and the
        // same lines are allowed through again once something new arrives.
        lastKey = null;
      })
      .finally(() => {
        inFlight = null;
        pump();
      });
  }

  function onLines(raw) {
    if (offForSession || !active) return;
    const lines = cleanLines(raw);
    if (lines.length === 0) return;
    const key = lines.join('\n');
    if (key === lastKey) {
      // Unchanged since the last send: nothing to ask. A newer, different read
      // still waiting is dropped too, because the reader has moved back.
      pending = null;
      return;
    }
    pending = { lines, key };
    pump();
  }

  return {
    /** Starts the reader. False, and nothing started, when the route is off for this session. */
    start() {
      if (offForSession || started) return !offForSession && started;
      started = true;
      reader.start(onLines);
      return true;
    },
    stop() {
      pending = null;
      stopTimer();
      if (started) reader.stop();
      started = false;
    },
    /** Idle camera only: while a sheet is up, lines are ignored and nothing is sent. */
    setActive(on) {
      active = Boolean(on);
      if (!active) { pending = null; stopTimer(); }
    },
    /** For tests: the request in flight, or a resolved promise. */
    settled() {
      return inFlight ?? Promise.resolve();
    },
    /** For tests and the camera: feed lines as a reader would. */
    onLines,
  };
}

/* ------------------------------------------------------------------- rows */

function fold(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Title (brand when the name does not already lead with it, name, size) and meta (the brand, when it moved out of the title). */
export function candidateLabel(c) {
  const brand = (c?.brand ?? '').trim();
  const name = (c?.name ?? '').trim();
  const size = c?.size ? String(c.size).trim() : '';
  const leads = brand !== '' && fold(name).startsWith(fold(brand));
  return {
    label: [leads ? '' : brand, name, size].filter(Boolean).join(' '),
    meta: leads ? brand : '',
  };
}

/**
 * The rows, as markup for the camera's text-match slot. Candidates carry
 * `data-tm-barcode`; the empty state carries `data-act="manual-search"`, which
 * the camera already answers with its typed-name field.
 */
export function textMatchHtml(candidates) {
  const rows = Array.isArray(candidates) ? candidates.slice(0, MAX_CANDIDATES) : [];
  if (rows.length === 0) {
    return `<div class="tm" data-text-match data-tm-empty role="group" aria-label="${escapeHtml(t('tm_label'))}">
        <p class="tm-heading">${escapeHtml(t('tm_none'))}</p>
        <button type="button" class="pill solid tm-type" data-act="manual-search">${escapeHtml(t('cat_type_name'))}</button>
      </div>`;
  }
  return `<div class="tm" data-text-match role="group" aria-label="${escapeHtml(t('tm_label'))}">
        <p class="tm-heading">${escapeHtml(t('tm_heading'))}</p>
        <div class="cands tm-cands">
          ${rows
            .map((c) => {
              const { label, meta } = candidateLabel(c);
              return `<button type="button" class="cand" data-tm-barcode="${escapeHtml(c.barcode)}">
                <span class="cand-name">${escapeHtml(label)}</span>
                ${meta ? `<span class="cand-meta">${escapeHtml(meta)}</span>` : ''}
              </button>`;
            })
            .join('')}
        </div>
      </div>`;
}

/**
 * Wires the whole thing into a host element on the camera: picks the reader,
 * paints the rows into `[data-tm-rows]`, and calls `onPick(barcode)` on a tap.
 * Returns null, and touches nothing, when there is no reader (the no-op) or the
 * route is already off for this session: the camera then behaves exactly as it
 * did before this module existed.
 */
export function mountTextMatch({ host, send, onPick, search, doc = globalThis.document, native } = {}) {
  if (!host || offForSession) return null;
  const reader = pickReader({ search, doc, host, ...(native !== undefined ? { native } : {}) });
  if (reader === NO_READER) return null;
  const rows = doc.createElement('div');
  rows.setAttribute('data-tm-rows', '');
  host.appendChild(rows);
  const paint = (candidates) => { rows.innerHTML = textMatchHtml(candidates); };
  const matcher = createTextMatcher({
    reader,
    send,
    onResult: (candidates) => paint(candidates),
  });
  host.addEventListener('click', (e) => {
    const row = e.target?.closest?.('[data-tm-barcode]');
    if (!row) return;
    const code = row.getAttribute('data-tm-barcode');
    rows.innerHTML = '';
    if (code) onPick(code);
  });
  if (!matcher.start()) { host.remove?.(); return null; }
  return {
    matcher,
    setActive(on) {
      matcher.setActive(on);
      host.hidden = !on || offForSession;
      if (!on) rows.innerHTML = '';
    },
    stop() {
      matcher.stop();
      host.remove?.();
    },
  };
}
