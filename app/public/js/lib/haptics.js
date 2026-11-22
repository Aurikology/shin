/**
 * The phone's own feedback, in one place. UX build 1 (blocks R-1 to R-5 of
 * docs/design/ux-evidence-2026-10-09.md).
 *
 * WHAT THIS REPLACES. camera.js used to call `navigator.vibrate` through a
 * private `buzz(ms)` at eleven sites: 8 to 16 ms pulses on the barcode press,
 * the shop pick, the price confirm, a refusal, a stored observation and the
 * verdict. That is three buzzes a scan, a pulse nobody has felt through a
 * glove, and nothing at all on an iPhone, whose Safari (and so, by inference,
 * its installed web app) has no vibrate call.
 *
 * FOUR EVENTS AND NO OTHERS (R-1, amended 2026-11-22): the barcode is
 * captured, a verdict lands, a verdict is saved, and a press (Aurik: "add
 * haptics to presses"; one app-wide listener, startPressHaptics, fires it). An
 * error, an offline or server fault and a low-confidence verdict have no name
 * in the table, so nothing can fire them by accident: `haptic()` THROWS on any
 * name outside it.
 *
 * WHICH FEEL (R-2, R-3). iPhone: a "success" notification for the verdict, a
 * light impact for capture and Save, through Capacitor's Haptics plugin
 * (@capacitor/haptics). Android: the system presets, TICK for capture and
 * CONFIRM for the verdict and Save, through the wrapper's own ShinHaptics
 * plugin (native/android/.../ShinHapticsPlugin.java; @capacitor/haptics on
 * Android has only raw millisecond waveforms and no preset, and one plugin
 * name cannot be registered twice, so the Android plugin has its own name).
 * Android older than the preset, and the plain web where `navigator.vibrate`
 * exists, keep the vibration call with the row's `fallbackMs`. A plain
 * browser with no vibrate call is "off", which is a fact about the browser,
 * not a fault.
 *
 * FAILS LOUDLY (RULINGS.md "Errors never go unnoticed"). An unknown event
 * name, a native iOS or Android wrapper with no haptics plugin, a bridge call
 * that throws: each THROWS here. The caller (camera.js) catches at the call
 * site, so the shopper's answer still lands, and reports the fault through
 * `reportHapticFault`, which writes it to the console and to the server's
 * event queue (track.js, type `haptic_fault`). A bridge promise that rejects
 * later has no caller to throw to, so it is reported the same way from here.
 * Nothing is swallowed and no failure turns into a quiet default.
 *
 * NO HIDDEN-SWITCH TRICK (R-2): iOS 18's `<input type=checkbox switch>` tap is
 * an undocumented side effect that one report says a later iOS removed.
 */
import * as store from '../store.js';
import { track } from '../track.js';

/**
 * The only events. `ios` is what the Haptics plugin is asked for, `android`
 * the preset the ShinHaptics plugin is asked for, `fallbackMs` the vibration
 * call for the web and for an Android without the preset. 12 and 16 ms are
 * the old pulses lengthened past the 8 ms floor the spec fails on (R-5): they
 * are the app's own numbers and stay unproven until three Android phones in a
 * loud store report them.
 */
export const HAPTIC_EVENTS = Object.freeze({
  'barcode-captured': Object.freeze({
    ios: Object.freeze({ kind: 'impact', style: 'LIGHT' }),
    android: Object.freeze({ effect: 'TICK' }),
    fallbackMs: 12,
  }),
  'verdict-landed': Object.freeze({
    ios: Object.freeze({ kind: 'notification', type: 'SUCCESS' }),
    android: Object.freeze({ effect: 'CONFIRM' }),
    fallbackMs: 16,
  }),
  saved: Object.freeze({
    ios: Object.freeze({ kind: 'impact', style: 'LIGHT' }),
    android: Object.freeze({ effect: 'CONFIRM' }),
    fallbackMs: 12,
  }),
  /* Aurik, 2026-11-22: "add haptics to presses". A light tap on every button,
     row, switch and link the shopper presses, fired by startPressHaptics below
     and by nothing else. It amends R-1's "none on pad keys, price confirm, shop
     pick": those are presses. The lightest feel each phone has (iOS LIGHT
     impact, Android TICK), so the verdict's success notification still reads
     as the bigger moment. Uses presets the wrappers already carry: no rebuild. */
  press: Object.freeze({
    ios: Object.freeze({ kind: 'impact', style: 'LIGHT' }),
    android: Object.freeze({ effect: 'TICK' }),
    fallbackMs: 10,
  }),
});

/**
 * What counts as a press: anything a shopper taps to make something happen.
 * A range slider is a drag, not a press, and is left out.
 */
export const PRESSABLE = 'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="checkbox"], [role="tab"], summary';

/** Two presses closer than this are one finger (a click that bubbles twice, a double fire), so one tap. */
export const PRESS_GAP_MS = 40;

/**
 * The element a click pressed, or null when it should not tap: not a
 * pressable, disabled, or marked `data-haptic="own"` because that control
 * fires a haptic of its own at the right moment (the barcode button's tick
 * is the capture, R-4; Save fires 'saved'). Exported for the test.
 */
export function pressTarget(target) {
  const el = target && typeof target.closest === 'function' ? target.closest(PRESSABLE) : null;
  if (!el) return null;
  if (el.disabled === true || el.getAttribute?.('aria-disabled') === 'true') return null;
  if (typeof el.closest === 'function' && el.closest('[data-haptic="own"]')) return null;
  return el;
}

/**
 * One listener for the whole app: every press taps. On the capture phase, so a
 * handler that stops the click from bubbling cannot swallow the tap. A fault
 * (a native wrapper with no plugin, a bridge that throws) is reported once per
 * launch, through reportHapticFault, and the press itself always goes on:
 * reporting it on every tap would flood the event queue with one fault.
 * Returns a stop function.
 */
export function startPressHaptics(doc = globalThis.document, { win = globalThis.window, now = () => Date.now() } = {}) {
  if (!doc || typeof doc.addEventListener !== 'function') return () => {};
  let last = -Infinity;
  let reported = false;
  const onClick = (e) => {
    if (!pressTarget(e.target)) return;
    const at = now();
    if (at - last < PRESS_GAP_MS) return;
    last = at;
    try {
      haptic('press', win);
    } catch (err) {
      if (!reported) { reported = true; reportHapticFault(err, 'press'); }
    }
  };
  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}

/** R-4: how long the frozen frame and its highlight are held before the price pad rises (a vendor project's 150 ms). */
export const CAPTURE_HOLD_MS = 150;

/** The plugin each native platform reaches, by the name it is registered under. */
export const NATIVE_PLUGIN = Object.freeze({ ios: 'Haptics', android: 'ShinHaptics' });

/** 'ios', 'android' or 'web'. Anything Capacitor does not report as a store platform is the web. */
function platformOf(win) {
  const cap = win?.Capacitor;
  const p = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** The native plugin object, or null when this wrapper was built without it. Same lookup as purchases.js. */
function pluginOf(win, name) {
  const cap = win.Capacitor;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(name)) return null;
  if (cap.Plugins?.[name]) return cap.Plugins[name];
  if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(name);
  return null;
}

/** Writes a haptics fault where it will be seen: the console now, the server's event queue for the next flush. */
export function reportHapticFault(err, where = 'unknown') {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`haptic fault (${where}):`, err);
  track('haptic_fault', { where, message });
}

/** A bridge call's promise that rejects after `haptic()` has returned: nobody can catch it, so it is reported here. */
function watch(result, name) {
  if (result && typeof result.then === 'function') {
    result.then(undefined, (err) => reportHapticFault(err, name));
  }
  return result;
}

function vibrate(win, ms) {
  const nav = win?.navigator;
  if (!nav || typeof nav.vibrate !== 'function') return 'off';
  // `false` is the browser refusing (no tap yet); that is its rule, not a fault of ours.
  return nav.vibrate(ms) === false ? 'off' : 'vibrate';
}

/**
 * Fires one event. Returns 'native', 'vibrate' or 'off'. THROWS on a name not
 * in the table (even with haptics off, so a typo cannot hide behind the
 * switch), on a native wrapper with no haptics plugin, and on a bridge call
 * that throws.
 */
export function haptic(name, win = globalThis.window) {
  const row = typeof name === 'string' && Object.hasOwn(HAPTIC_EVENTS, name) ? HAPTIC_EVENTS[name] : null;
  if (!row) throw new Error(`haptic(): ${JSON.stringify(name)} is not an event; the events are ${Object.keys(HAPTIC_EVENTS).join(', ')}`);
  if (!store.buzzOn()) return 'off';

  const platform = platformOf(win);
  if (platform === 'web') return vibrate(win, row.fallbackMs);

  const pluginName = NATIVE_PLUGIN[platform];
  const plugin = pluginOf(win, pluginName);
  if (!plugin) throw new Error(`haptic(): this ${platform} wrapper has no ${pluginName} plugin; rebuild it with the haptics plugin (native/README.md)`);

  if (platform === 'ios') {
    const { kind, style, type } = row.ios;
    if (kind === 'impact') watch(plugin.impact({ style }), name);
    else watch(plugin.notification({ type }), name);
    return 'native';
  }

  // Android: a plugin with no `perform` is one built before the presets existed.
  if (typeof plugin.perform !== 'function') return vibrate(win, row.fallbackMs);
  const result = plugin.perform({ effect: row.android.effect });
  if (result && typeof result.then === 'function') {
    // An Android older than the preset answers { performed: false } and keeps the vibration call.
    result.then((done) => { if (done && done.performed === false) vibrate(win, row.fallbackMs); }, (err) => reportHapticFault(err, name));
  }
  return 'native';
}

/**
 * The verdict's haptic from its confidence: lib/history-answer.js DIST_CONF,
 * 'certain' | 'sure' | 'thin'. A confident or fairly sure answer fires one
 * 'verdict-landed' (the same for great, good, reasonable and bad: the word,
 * colour and face carry the judgment, R-3) and returns its name. A thin one
 * fires nothing and returns null. Anything else THROWS, so a confidence that
 * was never mapped cannot pass for either.
 */
export function verdictHaptic(conf, win = globalThis.window) {
  if (conf === 'thin') return null;
  if (conf !== 'certain' && conf !== 'sure') throw new Error(`verdictHaptic(): ${JSON.stringify(conf)} is not a confidence; expected certain, sure or thin`);
  haptic('verdict-landed', win);
  return 'verdict-landed';
}
