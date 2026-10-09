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
 * THREE EVENTS AND NO OTHERS (R-1): the barcode is captured, a verdict lands,
 * a verdict is saved. A pad key, the price confirm, a shop pick, an error, an
 * offline or server fault and a low-confidence verdict have no name in the
 * table, so nothing can fire them by accident: `haptic()` THROWS on any name
 * outside it.
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
});

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
