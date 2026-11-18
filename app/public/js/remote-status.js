/**
 * The app's start-up question to the server: "is this build still supported, and is anything switched
 * off?" (R13 and R14, docs/readiness/REGISTER.md; the server half is app/src/app-status.ts).
 *
 * WHAT IT DOES
 *   - A build below the server's minimum gets one plain screen, "Please update Pexi", and nothing
 *     behind it can be reached. This is the only way to stop a bad or broken build in minutes rather
 *     than the days an Apple review takes.
 *   - Features the server names are hidden: the screen's route is refused (router.js) and every
 *     button that opens it is hidden by one style rule, keyed on the `data-act` the buttons already
 *     carry. A flag-backed feature is switched off in flags.js's table for the session.
 *
 * WHAT IT NEVER DOES
 *   - Block on a failed question. A missing, refused, slow, malformed or HTML answer (a Cloudflare
 *     challenge page, say) is "no answer", and no answer means the app runs exactly as it did before
 *     this file existed. The question is also never awaited by main.js: the viewfinder comes first.
 *   - Replay a kept "block". The last good switch-off list is kept on the phone and re-applied at the
 *     next launch before the answer arrives, so a hidden feature stays hidden offline; the update
 *     gate needs a fresh yes every launch, so a server that lowers the minimum (or a phone that goes
 *     offline) is never stuck behind a stale one.
 *
 * VERSION. `APP_VERSION` (version.js), `YYYY-MM-DD.N`, compared part by part as numbers. It is bumped
 * by hand for each TestFlight build; the server's SHIN_APP_MIN_VERSION is the same format.
 */

import * as router from './router.js';
import { FLAGS } from './flags.js';
import { APP_VERSION } from './version.js';

const CACHE_KEY = 'shin.appStatus';
const VERSION = /^(\d{4})-(\d{2})-(\d{2})\.(\d{1,4})$/;
const FEATURE = /^[a-z][a-z0-9_-]{0,31}$/;
const ASK_TIMEOUT_MS = 4000;

/** Pexi's App Store page: the same app id the "Rate Pexi" row opens (plus-config.js REVIEW_URLS). */
const APP_STORE_URL = 'https://apps.apple.com/app/id6821190920';

/**
 * Every feature name the server may switch off, and what switching it off does. A name the server
 * sends that is not here is ignored, so a typo in the setting hides nothing.
 *
 *   screen    routes the named screens off (router.setSwitchedOff)
 *   hide      the `data-act` values of the buttons that lead there, hidden by one style rule
 *   flag      the FLAGS entry set false for the session
 */
export const FEATURES = Object.freeze({
  watchlist: { screen: ['watchlist'], hide: ['watchlist', 'watch'] },
  savings: { screen: ['savings'], hide: ['savings'] },
  pastscans: { screen: ['pastscans'], hide: ['pastscans'] },
  removed: { screen: ['removed'], hide: ['removed'] },
  share: { screen: ['share'], hide: ['share'] },
  correct: { screen: ['correct'], hide: ['correct', 'report'] },
  centsfirstpad: { flag: 'centsFirstPad' },
  feed: { flag: 'feed' },
});

/** The oldest-first parts of a `YYYY-MM-DD.N` version, or null when it is not one. */
export function parseVersion(v) {
  const m = VERSION.exec(typeof v === 'string' ? v.trim() : '');
  return m ? m.slice(1).map(Number) : null;
}

/** True only when both parse and `version` is older than `min`. Unknown is never "below". */
export function versionBelow(version, min) {
  const a = parseVersion(version);
  const b = parseVersion(min);
  if (!a || !b) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** Whatever the server sent, reduced to the two fields this file reads. Junk is "nothing to say". */
export function normaliseStatus(raw) {
  const out = { minVersion: null, featuresOff: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (parseVersion(raw.minVersion)) out.minVersion = raw.minVersion.trim();
  if (Array.isArray(raw.featuresOff)) {
    out.featuresOff = [...new Set(raw.featuresOff.filter((n) => typeof n === 'string').map((n) => n.trim().toLowerCase()).filter((n) => FEATURE.test(n)))];
  }
  return out;
}

/** Whether a feature is currently switched off by the server. Unknown names are never off. */
export function featureOff(name) {
  return off.has(String(name).toLowerCase());
}

/* ------------------------------------------------------------ applying -- */

let off = new Set();
/** The flag values as they were before this file touched them, per flags object, so a later status can restore them. */
const flagBaseline = new WeakMap();
/** The one style element per document, so a second status replaces the rule instead of piling up. */
const styleOf = new WeakMap();

function updateScreenHtml() {
  const wrap = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:32px';
  const title = 'margin:0;font:600 28px/1.15 system-ui,-apple-system,sans-serif';
  const body = 'margin:0;max-width:22em;font:400 17px/1.45 system-ui,-apple-system,sans-serif;opacity:.8';
  const button = 'display:inline-block;margin-top:8px;padding:14px 28px;min-height:44px;border-radius:999px;background:var(--ink,#111);color:var(--ground,#fff);font:600 17px/1.2 system-ui,-apple-system,sans-serif;text-decoration:none';
  return `<div style="${wrap}">
    <h1 id="update-gate-title" style="${title}">Please update Pexi</h1>
    <p id="update-gate-body" style="${body}">This version is out of date and can no longer check prices. Update Pexi in the App Store, then open it again.</p>
    <a href="${APP_STORE_URL}" style="${button}" data-update-link>Update Pexi</a>
  </div>`;
}

function showUpdateScreen(doc) {
  if (!doc?.body) return;
  const already = doc.body.childNodes.some((n) => n.hasAttribute?.('data-update-gate'));
  if (already) return;
  const gate = doc.createElement('div');
  gate.setAttribute('data-update-gate', '');
  gate.setAttribute('role', 'alertdialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'update-gate-title');
  gate.setAttribute('aria-describedby', 'update-gate-body');
  gate.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:var(--ground,#fff);color:var(--ink,#111)');
  gate.innerHTML = updateScreenHtml();
  doc.body.appendChild(gate);
  // Nothing behind the gate may be tapped or read by VoiceOver.
  const screenRoot = doc.getElementById?.('screen');
  screenRoot?.setAttribute('inert', '');
  screenRoot?.setAttribute('aria-hidden', 'true');
}

function hideRule(names) {
  const selectors = [];
  for (const n of names) for (const act of FEATURES[n]?.hide ?? []) selectors.push(`[data-act="${act}"]`);
  return selectors.length ? `${selectors.join(',')}{display:none !important}` : '';
}

/**
 * Applies a status to this session. Returns `{ updateRequired, off }`. Pure apart from the document,
 * the flags object and the router, all of which can be handed in.
 */
export function applyStatus(status, { flags = FLAGS, doc = globalThis.document, version = APP_VERSION } = {}) {
  const s = normaliseStatus(status);
  const names = s.featuresOff.filter((n) => Object.hasOwn(FEATURES, n));
  off = new Set(names);

  // Screens: the router refuses these ids.
  router.setSwitchedOff(names.flatMap((n) => FEATURES[n].screen ?? []));

  // Flags: restore what an earlier status changed, then change what this one names.
  const baseline = flagBaseline.get(flags) ?? new Map();
  for (const [k, v] of baseline) flags[k] = v;
  baseline.clear();
  for (const n of names) {
    const key = FEATURES[n].flag;
    if (key && key in flags) {
      baseline.set(key, flags[key]);
      flags[key] = false;
    }
  }
  flagBaseline.set(flags, baseline);

  // Buttons: one style rule, replaced every time.
  const host = doc?.head ?? doc?.documentElement ?? doc?.body;
  if (host) {
    let style = styleOf.get(doc);
    const rule = hideRule(names);
    if (!style && rule) {
      style = doc.createElement('style');
      style.setAttribute('data-switched-off', '');
      host.appendChild(style);
      styleOf.set(doc, style);
    }
    if (style) style.textContent = rule;
  }

  const updateRequired = versionBelow(version, s.minVersion);
  if (updateRequired) showUpdateScreen(doc);
  return { updateRequired, off: names };
}

/* ------------------------------------------------------------ asking -- */

/**
 * Asks the server. Resolves the normalised status, or null for no answer of any kind. Never rejects,
 * never waits longer than `timeoutMs`. No custom headers: a plain GET needs no CORS preflight.
 */
export async function fetchAppStatus({ fetchFn = globalThis.fetch, base = globalThis.window?.SHIN_API_BASE ?? '', timeoutMs = ASK_TIMEOUT_MS } = {}) {
  let timer;
  try {
    const asked = (async () => {
      const res = await fetchFn(`${base}/api/app-status`);
      if (!res?.ok) return null;
      const type = res.headers?.get?.('content-type') ?? 'application/json';
      if (!/json/i.test(type)) return null;
      return normaliseStatus(await res.json());
    })();
    const gaveUp = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([asked.catch(() => null), gaveUp]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readKept(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(CACHE_KEY) ?? 'null');
    return normaliseStatus(raw);
  } catch {
    return normaliseStatus(null);
  }
}

function keep(storage, status) {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(status));
  } catch {
    /* private window or full storage: the next launch simply asks again */
  }
}

/**
 * The whole start-up check, for main.js: apply the kept switch-off list at once, ask, apply the
 * answer and keep it. Never throws. A failed question changes nothing.
 */
export async function startRemoteStatus({
  fetchFn,
  base,
  timeoutMs,
  storage = globalThis.localStorage,
  doc = globalThis.document,
  flags = FLAGS,
  version = APP_VERSION,
} = {}) {
  try {
    const kept = readKept(storage);
    // Only the switch-off list is replayed; the update gate always needs a fresh answer.
    if (kept.featuresOff.length) applyStatus({ minVersion: null, featuresOff: kept.featuresOff }, { flags, doc, version });
    const status = await fetchAppStatus({ fetchFn, base, timeoutMs });
    if (!status) return { updateRequired: false, status: null };
    keep(storage, status);
    const out = applyStatus(status, { flags, doc, version });
    return { ...out, status };
  } catch {
    return { updateRequired: false, status: null };
  }
}
