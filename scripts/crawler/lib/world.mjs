/**
 * One crawl run: build the start state, launch the real app in the fake browser, take steps, and
 * judge the screen after every one.
 *
 * A run is a pure function of (start state, step list). In generating mode the steps are chosen by
 * `chooser` (seeded, coverage-guided) and recorded as explicit, replayable descriptions; in replay
 * mode the given steps are executed as written (a step whose target is not on screen is skipped),
 * which is what shrinking needs.
 */
import './fast-timers.mjs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launchApp, settle } from '../../../app/test/ux/ux-b5-harness.test.mjs';
import { normalRoutes, withFaults, serverHasPath } from './routes.mjs';
import { allowedDeadEnd } from './allow.mjs';
import { expectedEntry } from './expected.mjs';

const REAL = { Date, setTimeout: globalThis.setTimeout, consoleError: console.error };
const APP_ROOT_URL = pathToFileURL(fileURLToPath(new URL('../../../app/public/js/', import.meta.url))).href;

/** How much faster than real the app's own long timers run (a 4 s hint takes 100 ms). */
export const WARP = 40;
/** Timers at or above this many ms are warped; shorter ones (debounces, zero-delay turns) are left alone. */
const WARP_FROM_MS = 1000;

/* ------------------------------------------------------------------ flags */

let flagsHookInstalled = false;
/**
 * The app reads feature flags from public/js/flags.js. For one launch the crawler swaps that module
 * for one that exports the flags of the start state, stamped with the launch number so the swap is
 * as fresh per launch as every other module. The real file is never edited.
 */
function installFlagsHook() {
  if (flagsHookInstalled) return;
  flagsHookInstalled = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      // `/js/eye.js` is the eye bundle scripts/build-eye.mjs writes at build time; it is not in the source tree. The
      // offline photo queue imports it by that absolute path, which Node cannot resolve: stand in for it.
      if (specifier === '/js/eye.js') {
        return { url: `data:text/javascript,${encodeURIComponent('export async function enqueue() { return 1; }\nexport async function startCaptureQueue() { return () => {}; }\nexport const SHELF_START = { lastAt: null, sent: 0, lastSignature: null };\nexport const SHELF_MIN_GAP_MS = 5000;\nexport const coverCrop = () => ({ sx: 0, sy: 0, width: 1, height: 1 });\nexport const shelfSize = () => ({ width: 1, height: 1 });\nexport const signatureOf = () => [];\nexport const shouldSendShelf = () => ({ send: false, why: \"crawler stub\" });')}`, shortCircuit: true };
      }
      const out = nextResolve(specifier, context);
      const inst = /[?&]inst=(\d+)/.exec(context.parentURL ?? '')?.[1];
      if (inst && globalThis.__crawlerFlags && out.url.startsWith(`${APP_ROOT_URL}flags.js`)) {
        const src = `export const FLAGS = ${JSON.stringify(globalThis.__crawlerFlags)};\n// launch ${inst}`;
        return { url: `data:text/javascript,${encodeURIComponent(src)}`, shortCircuit: true };
      }
      return out;
    },
  });
}

let flagKeysCache = null;
/** The flag names the app has, read from the real flags.js, with the values it ships with. */
export async function realFlags() {
  if (flagKeysCache) return flagKeysCache;
  const mod = await import(`${APP_ROOT_URL}flags.js`);
  flagKeysCache = { ...mod.FLAGS };
  return flagKeysCache;
}

/* ------------------------------------------------------------------ the eye */

/**
 * The harness's camera-reader stub is minimal: its eye object has a torch that answers nothing and
 * lacks two methods the real one (eye-attach.js) has. A crawl taps everything, so it taps the torch,
 * and the app (correctly) expects a promise back. This makes the stub eye answer the way the real
 * one does, without touching the harness: launchApp assigns the hub to globalThis.__uxb5Eye, and the
 * setter below wraps the hub's attach.
 *
 *   setTorch(on)        a promise of whether the torch lit (real: camera.setTorch)
 *   capture()           a promise; the real one hands the screen a crop through onCapture
 *   setTorchSetting(s)  present on the real eye
 *   select(i)           present on the real eye
 */
function installEyeFidelity() {
  let hub = null;
  Object.defineProperty(globalThis, '__uxb5Eye', {
    configurable: true,
    get: () => hub,
    set(h) {
      hub = h;
      if (!h || h.__crawlerWrapped) return;
      h.__crawlerWrapped = true;
      const attach = h.attach.bind(h);
      h.attach = async (video, surfaces, handlers) => {
        const eye = await attach(video, surfaces, handlers);
        eye.setTorch = async (on) => Boolean(on);
        eye.setTorchSetting = () => {};
        eye.select = () => {};
        eye.capture = async () => {
          await settle(1);
          handlers?.onCapture?.({ blob: new Blob(['crawler-frame'], { type: 'image/jpeg' }), width: 320, height: 320 }, null);
        };
        return eye;
      };
    },
  });
}

/* ------------------------------------------------------------------ clock */

function installClock(offsetMs) {
  const Real = REAL.Date;
  class CrawlerDate extends Real {
    constructor(...a) { if (a.length === 0) super(Real.now() + offsetMs); else super(...a); }
    static now() { return Real.now() + offsetMs; }
  }
  globalThis.Date = CrawlerDate;
}
const restoreClock = () => { globalThis.Date = REAL.Date; };

/* ------------------------------------------------------------------ start state */

/**
 * The seed for localStorage and the launch arguments a start state stands for.
 * Start state: { first, consent: {photos, location}, claude, plus, flags, lang, clockDays, search, faults }.
 */
function launchArgs(start) {
  const seed = {};
  if (!start.first) {
    seed['shin.v1'] = {
      seenIntro: true, consentSeen: true, permissionsSeen: true,
      onboarding: { doneAt: '2026-10-01T00:00:00.000Z', answers: {} },
      consent: { photos: start.consent.photos, location: start.consent.location, updatedAt: '2026-10-01T00:00:00.000Z' },
      agreement: { at: '2026-11-06T00:00:00.000Z', version: 1, claude: start.claude },
    };
  }
  if (start.plus) seed['shin.plus'] = '1';
  if (start.packRead) seed['shin.dev.packRead'] = '1';
  if (start.dev) seed['shin.dev'] = '1';
  if (start.lang === 'fr') seed['shin.locale'] = 'fr';
  return { seed, firstRunAnswered: !start.first, search: start.search ?? '' };
}

/* ------------------------------------------------------------------ reading the screen */

const isEl = (n) => n && n.nodeType === 1;
const attr = (el, name) => el.getAttribute(name) ?? '';

function hiddenSelf(el) {
  if (el.hasAttribute('hidden') || el.hasAttribute('inert')) return true;
  const d = el.style?.display;
  return d === 'none';
}
function hiddenAnywhere(el) {
  for (let n = el; isEl(n); n = n.parentNode) if (hiddenSelf(n)) return true;
  return false;
}

/** All text a person could read on the screen: text nodes outside hidden parts, scripts and styles. */
export function visibleText(root) {
  const parts = [];
  const walk = (n) => {
    if (n.nodeType === 3) { parts.push(n.data); return; }
    if (!isEl(n)) return;
    if (hiddenSelf(n) || n.localName === 'script' || n.localName === 'style') return;
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const CLICKY = new Set(['click', 'pointerdown', 'pointerup', 'touchstart', 'mousedown']);
const ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox', 'radio', 'option']);

function isDisabled(el) {
  for (let n = el; isEl(n); n = n.parentNode) {
    if (n.hasAttribute('disabled') && /^(button|input|select|textarea|fieldset)$/.test(n.localName)) return true;
    if (n.getAttribute('aria-disabled') === 'true') return true;
  }
  return false;
}

/** The detent rule of the verdict sheet: a control in its half or full part cannot be tapped while the sheet is shorter. */
function sheetBlocks(el) {
  const part = el.closest('.sheet-half, .sheet-full');
  const sheet = el.closest('.sheet');
  if (!part || !sheet) return false;
  const order = ['peek', 'half', 'full'];
  const at = order.indexOf(sheet.dataset.detent || 'peek');
  return at < (part.classList.contains('sheet-full') ? 2 : 1);
}

/** Every element a person could act on right now, in document order. */
export function actionables(root) {
  const out = [];
  const walk = (el, insideControl) => {
    if (hiddenSelf(el) || el.localName === 'script' || el.localName === 'style') return;
    const tag = el.localName;
    const type = attr(el, 'type').toLowerCase();
    let control = false;
    let isCandidate = false;
    if (tag === 'button' || tag === 'select' || tag === 'textarea' || tag === 'summary') isCandidate = true;
    else if (tag === 'a') isCandidate = el.hasAttribute('href') || el.hasAttribute('data-act') || el._listeners.some((l) => CLICKY.has(l.type));
    else if (tag === 'input') isCandidate = type !== 'hidden';
    else if (ROLES.has(attr(el, 'role')) || el.hasAttribute('data-act') || el._listeners.some((l) => CLICKY.has(l.type))) isCandidate = true;
    if (isCandidate && !insideControl) {
      control = /^(button|a|summary)$/.test(tag);
      if (!isDisabled(el) && !sheetBlocks(el)) out.push(el);
    } else if (isCandidate) control = false;
    for (const c of el.childNodes) if (isEl(c)) walk(c, insideControl || control);
  };
  for (const c of root.childNodes) if (isEl(c)) walk(c, false);
  return out;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);
const ownText = (el) => clip(visibleText(el), 28);

/** A description of an element that survives a repaint: what it is, not where it sits in memory. */
export function keyOf(el) {
  return [
    el.localName,
    attr(el, 'data-act'), attr(el, 'data-pad'), attr(el, 'type'), attr(el, 'name'), attr(el, 'id'),
    attr(el, 'aria-label'), attr(el, 'data-textroute-input') ? 'textroute' : '', attr(el, 'data-q') ? 'q' : '',
    ownText(el),
  ].join('|');
}

/** Find the element a step names: the nth visible actionable with the same key, else the first, else null. */
export function resolve(root, key, nth) {
  const same = actionables(root).filter((e) => keyOf(e) === key);
  if (same.length === 0) return null;
  return same[Math.min(nth, same.length - 1)];
}


/* ------------------------------------------------------------------ steps */

export function describeStep(s) {
  switch (s.k) {
    case 'tap': return `tap [${s.key.replace(/\|+/g, ' | ').trim()}]${s.nth ? ` #${s.nth}` : ''}`;
    case 'type': return `type ${JSON.stringify(clip(s.text, 24))}${s.text.length > 24 ? `(${s.text.length} chars)` : ''} into [${s.key.replace(/\|+/g, ' | ').trim()}]${s.enter ? ' + Enter' : ''}`;
    case 'slider': return `drag [${s.key.replace(/\|+/g, ' | ').trim()}] to ${Math.round(s.frac * 100)}%`;
    case 'price': return `press pad keys ${JSON.stringify(s.text)}`;
    case 'ready': return `hold barcode ${JSON.stringify(s.code)} in view`;
    case 'lost': return 'barcode leaves the view';
    case 'hold': return `hold barcode ${JSON.stringify(s.code)} steady until it fires itself`;
    case 'coach': return s.key ? `the eye coaches: ${s.key}` : 'the eye clears its coaching line';
    case 'unreadable': return `the eye cannot read barcode ${JSON.stringify(s.code)}`;
    case 'torchEvent': return `the eye turns the torch ${s.on ? 'on' : 'off'}`;
    case 'back': return 'press back';
    case 'wait': return 'wait a moment';
    default: return JSON.stringify(s);
  }
}

class FakeFailure extends Error {}

/** Run one step against the live app. Returns false when the step could not be performed (its target is not there). */
async function perform(app, s, env) {
  const root = app.root;
  switch (s.k) {
    case 'tap': {
      const el = resolve(root, s.key, s.nth ?? 0);
      if (!el) return false;
      try { await app.tap(el, s.key); } catch (e) {
        if (e instanceof assert.AssertionError) return false;
        throw e;
      }
      // The scan press holds the frame on the code for CAPTURE_HOLD_MS before the price pad rises. A
      // shopper's next tap is always later than that, so the step ends after it (the harness's pressScan does the same).
      if (/\|scan-barcode\|/.test(s.key)) {
        const { CAPTURE_HOLD_MS } = await app.mod('lib/haptics.js');
        await app.wait(CAPTURE_HOLD_MS + 40);
      }
      return true;
    }
    case 'type': {
      const el = resolve(root, s.key, s.nth ?? 0);
      if (!el) return false;
      const t = attr(el, 'type').toLowerCase();
      let text = s.text;
      if (t === 'number' && !/^-?\d+(\.\d+)?$/.test(text.trim())) text = '';
      el.focus?.();
      el.value = text;
      const FEvent = globalThis.Event;
      const mk = (type, init = {}) => { const ev = new FEvent(type, init); ev.target = el; return ev; };
      el.dispatchEvent(mk('input', { data: text }));
      el.dispatchEvent(mk('change'));
      if (s.enter) {
        el.dispatchEvent(mk('keydown', { key: 'Enter', code: 'Enter' }));
        el.dispatchEvent(mk('keyup', { key: 'Enter', code: 'Enter' }));
        const form = el.closest('form');
        if (form) el.dispatchEvent(mk('submit'));
      }
      app.keystrokes += 1;
      await settle();
      return true;
    }
    case 'slider': {
      const el = resolve(root, s.key, s.nth ?? 0);
      if (!el) return false;
      const lo = Number(attr(el, 'min') || 0);
      const hi = Number(attr(el, 'max') || 100);
      el.value = String(Math.round(lo + (hi - lo) * s.frac));
      const FEvent = globalThis.Event;
      for (const type of ['input', 'change']) { const ev = new FEvent(type); ev.target = el; el.dispatchEvent(ev); }
      await settle();
      return true;
    }
    case 'price': {
      let any = false;
      for (const ch of s.text) {
        const sel = `[data-pad="${ch}"]`;
        const el = root.querySelector(sel);
        if (!el || hiddenAnywhere(el) || isDisabled(el)) continue;
        try { await app.tap(el, `pad ${ch}`); any = true; } catch (e) { if (!(e instanceof assert.AssertionError)) throw e; }
      }
      return any;
    }
    case 'ready': {
      if (!app.hub.handlers || !app.cam) return false;
      app.hub.ready(s.code);
      await settle();
      return true;
    }
    case 'lost': {
      if (!app.hub.handlers || !app.cam) return false;
      app.hub.lost();
      await settle();
      return true;
    }
    case 'hold': {
      // The eye keeps reporting the settled code while it stays in view; the screen fires the scan itself after a moment (R-25).
      if (!app.hub.handlers || !app.cam) return false;
      const t0 = Date.now();
      while (Date.now() - t0 < (s.ms ?? 450) && app.state === 'idle') { app.hub.ready(s.code); await app.wait(30); }
      return true;
    }
    case 'coach': {
      if (!app.hub.handlers?.onCoach || !app.cam) return false;
      app.hub.handlers.onCoach(s.key ?? null);
      await settle();
      return true;
    }
    case 'unreadable': {
      if (!app.hub.handlers?.onUnreadable || !app.cam) return false;
      app.hub.handlers.onUnreadable({ value: s.code, format: 'EAN13', frames: 40 });
      await settle();
      return true;
    }
    case 'torchEvent': {
      if (!app.hub.handlers?.onTorch || !app.cam) return false;
      app.hub.handlers.onTorch(Boolean(s.on));
      await settle();
      return true;
    }
    case 'back': {
      app.hist.back();
      await settle();
      return true;
    }
    case 'wait': {
      await app.wait(90);
      return true;
    }
    default:
      throw new FakeFailure(`unknown step kind ${s.k}`);
  }
}

/* ------------------------------------------------------------------ the rules */

const BAD_TEXT = /\b(undefined|NaN|null)\b|\[object Object\]/;

const normaliseMessage = (m) => String(m).replace(/\s+/g, ' ').replace(/\d+/g, '#').slice(0, 140);

function topAppFrame(err) {
  const stack = String(err?.stack ?? '');
  const m = /public\/js\/([^\s:?)]+)[^\s)]*?:(\d+):\d+/.exec(stack);
  return m ? `${m[1]}:${m[2]}` : '';
}

/** Where on the screen text sits, as a stable short label for the failure signature. */
function whereText(root, token) {
  let found = '';
  const walk = (n, path) => {
    if (found) return;
    if (n.nodeType === 3) { if (new RegExp(`\\b${token}\\b|\\[object Object\\]`).test(n.data)) found = path; return; }
    if (!isEl(n) || hiddenSelf(n) || n.localName === 'script' || n.localName === 'style') return;
    const c = (attr(n, 'class').split(/\s+/)[0] ?? '');
    const here = n.localName === 'main' ? path : `${path}>${n.localName}${c ? `.${c}` : ''}`;
    for (const k of n.childNodes) walk(k, here);
  };
  walk(root, '');
  return found.slice(-60);
}

function failure(rule, severity, screen, message, extra = {}) {
  // `sig` groups failures (rule + screen + message). `cause` is the same without the screen: the screen a
  // failure is seen on can change as steps are removed, the cause cannot, so shrinking matches on it.
  return { rule, severity, screen, message, sig: `${rule} @ ${screen} :: ${message}`, cause: `${rule} :: ${message}`, ...extra };
}

const screenLabel = (app) => `${app.screen ?? 'none'}${app.state ? `/${app.state}` : ''}`;

/** What on the app's surface a tap could have changed. Equal before and after means the tap did nothing. */
function surface(app) {
  let storeLen = 0;
  // The telemetry queue grows on every tap (the app records the tap itself), so it says nothing about what the tap did.
  for (const [k, v] of app.storage.map) if (k !== 'shin.track.queue') storeLen += k.length + v.length;
  return [app.root.innerHTML, app.loc.search, app.hist.length, app.server.calls.length, storeLen, app.phone.shares.length, app.phone.copied.length, app.phone.downloads.length, app.win.__vibrations.length].join('\u0001');
}

/* ------------------------------------------------------------------ the run */

/**
 * @param o.start    the start state
 * @param o.seed     the run's seed (fault decisions)
 * @param o.maxSteps most steps to take
 * @param o.plan     explicit steps to replay; omit to generate with `o.choose`
 * @param o.choose   async (ctx) => step | null. ctx = { app, actions }.
 * @param o.routes   route overrides (a test plants a bug here)
 * @param o.onStep   called after every step with { step, app, screen }
 * @param o.stopAt   (replay) a signature: stop as soon as it is seen
 * @returns { steps, failures, screens, states, injected, gaps, boot }
 */
export async function runOnce(o) {
  const { start, seed, maxSteps } = o;
  installFlagsHook();
  installEyeFidelity();
  const failures = [];
  const seenSig = new Set();
  const screens = new Set();
  const states = new Set();
  const gaps = new Set();
  const steps = [];
  const injected = [];
  let stepNo = -1;
  let curScreen = 'boot';

  const add = (f) => {
    if (seenSig.has(f.sig)) return;
    seenSig.add(f.sig);
    // A deliberate loud signal (lib/expected.mjs) is counted, never failed.
    const known = expectedEntry(f.rule, f.message, injected.length > 0);
    failures.push({ ...f, ...(known ? { severity: 'expected', expectedAt: known.at } : {}), step: stepNo });
  };

  // console.error is a failure: the app says out loud that something broke.
  console.error = (...args) => {
    const msg = args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ');
    add(failure('console-error', 'high', curScreen, normaliseMessage(msg)));
  };

  const delays = new Set();
  const sleep = (ms) => new Promise((res) => { const h = REAL.setTimeout(res, ms); h.unref?.(); delays.add(h); });
  let faultsThisStep = [];
  const table = withFaults({ ...normalRoutes(), ...(o.routes ?? {}) }, {
    faults: start.faults, seed, warp: WARP, sleep,
    onFault: (f) => { faultsThisStep.push(f); injected.push({ ...f, step: stepNo }); },
  });

  globalThis.__crawlerFlags = start.flags;
  installClock((start.clockDays ?? 0) * 86400000);
  const args = launchArgs(start);
  let app = null;
  try {
    try {
      app = await launchApp({ ...args, server: table });
    } catch (e) {
      add(failure('uncaught-error', 'high', 'boot', `${normaliseMessage(`${e?.name}: ${e?.message}`)} ${topAppFrame(e)}`.trim()));
      return { steps, failures, screens, states, injected, gaps };
    }
    // Long timers run WARP times faster, so "the 4 s hint" and "the 5 s delay" are reachable in a crawl.
    const base = globalThis.setTimeout;
    const warped = (cb, ms, ...a) => base(cb, typeof ms === 'number' && ms >= WARP_FROM_MS ? ms / WARP : ms, ...a);
    globalThis.setTimeout = warped;
    app.win.setTimeout = warped;

    let unroutedSeen = 0;
    const collectErrors = () => {
      for (const e of app.takeErrors()) {
        const msg = `${e?.name ?? 'Error'}: ${e?.message ?? e}`;
        add(failure('uncaught-error', 'high', curScreen, `${normaliseMessage(msg)} ${topAppFrame(e)}`.trim()));
      }
    };

    /** Judge the screen as it stands. `afterFault` adds the "must show something" checks. */
    const judge = async (afterFault) => {
      collectErrors();
      curScreen = screenLabel(app);
      screens.add(app.screen ?? 'none');
      states.add(curScreen);
      const text = visibleText(app.root);
      const bad = BAD_TEXT.exec(text);
      if (bad) {
        const token = bad[0] === '[object Object]' ? 'object' : bad[1];
        add(failure('bad-text', 'high', curScreen, `"${bad[0]}" on screen in ${whereText(app.root, token) || 'text'}`));
      }
      if (text === '') add(failure(afterFault ? 'blank-after-fault' : 'blank-screen', 'high', curScreen, 'no visible text'));
      let acts = actionables(app.root);
      if (acts.length === 0 && !allowedDeadEnd(app)) {
        await app.wait(120);
        collectErrors();
        acts = actionables(app.root);
        if (acts.length === 0 && !allowedDeadEnd(app)) add(failure(afterFault ? 'dead-end-after-fault' : 'dead-end', 'high', screenLabel(app), 'no actionable element and no way back'));
      }
      if (afterFault && app.state === 'reading') {
        // A request failed and the camera is still "reading": give the app's own timeouts a fair wait, then call it stuck.
        for (let i = 0; i < 16 && app.state === 'reading'; i += 1) await app.wait(50);
        if (app.state === 'reading') add(failure('stuck-after-fault', 'high', curScreen, 'still reading after the server failed'));
      }
      const un = app.server.unrouted;
      for (; unroutedSeen < un.length; unroutedSeen += 1) {
        const path = un[unroutedSeen].path;
        if (serverHasPath(path)) gaps.add(path);
        else add(failure('bad-route', 'high', curScreen, `request to ${path}, which the server does not have`));
      }
    };

    if (o.setup) await o.setup(app, start); // a test plants a fake screen or a stub here
    await judge(false);

    let lastTap = null; // { key, noop }
    const plan = o.plan ?? null;
    // Generating, a step that cannot be performed is dropped and does not count; give up after a few such misses.
    let attempts = 0;
    for (let i = 0; plan ? i < plan.length : (steps.length < maxSteps && attempts < maxSteps * 3); i += 1) {
      attempts += 1;
      stepNo = steps.length;
      faultsThisStep = [];
      let step = plan ? plan[i] : null;
      if (!plan) {
        step = await o.choose({ app, actions: actionables(app.root) });
        if (!step) break;
      }
      const before = step.k === 'tap' ? surface(app) : null;
      // A link leaves the app (the fake browser cannot follow it), and a radio, tab or toggle that is already
      // chosen has nothing left to do: neither is a button that "does nothing".
      let inert = false;
      if (step.k === 'tap') {
        const el = actionables(app.root).filter((e) => keyOf(e) === step.key)[step.nth ?? 0];
        inert = !!el && (el.localName === 'a' || ['aria-checked', 'aria-pressed', 'aria-selected'].some((a) => el.getAttribute(a) === 'true'));
      }
      let did;
      try {
        did = await perform(app, step, {});
      } catch (e) {
        add(failure('uncaught-error', 'high', curScreen, `${normaliseMessage(`${e?.name}: ${e?.message}`)} ${topAppFrame(e)}`.trim()));
        did = true;
      }
      if (!did) { if (!plan) continue; steps.push({ ...step, skipped: true }); continue; }
      steps.push(step);
      await judge(faultsThisStep.some((f) => f.kind !== 'delay'));
      if (faultsThisStep.some((f) => f.kind === 'delay')) {
        // A late answer is still a screen: it must not be blank while it waits.
        const t = visibleText(app.root);
        if (t === '') add(failure('blank-after-fault', 'high', curScreen, 'no visible text while a request is late'));
      }
      if (step.k === 'tap') {
        const noop = surface(app) === before && !inert;
        if (noop && lastTap?.noop && lastTap.key === step.key) {
          add(failure('tap-does-nothing', 'low', curScreen, `tapping [${step.key.replace(/\|+/g, ' ').trim()}] twice changed nothing`));
        }
        lastTap = { key: step.key, noop };
      } else lastTap = null;
      o.onStep?.({ step, app, screen: curScreen });
      if (o.cause && failures.some((f) => f.cause === o.cause)) break;
    }
    await app.wait(30);
    stepNo = steps.length;
    collectErrors();
  } finally {
    for (const h of delays) clearTimeout(h);
    try { app?.stop(); } catch { /* errors were already taken; stop() only re-checks them */ }
    console.error = REAL.consoleError;
    restoreClock();
    globalThis.setTimeout = REAL.setTimeout;
    delete globalThis.__crawlerFlags;
  }
  return { steps, failures, screens, states, injected, gaps };
}


