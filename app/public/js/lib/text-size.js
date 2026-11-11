/**
 * The phone's text size, followed (D-254, 2026-11-11; Aurik: "do the fix now").
 *
 * Every font size in the app's CSS is fixed px, and a web view does not pass iOS Larger Text or
 * Android's font size through on its own. @capacitor/text-zoom reads the phone's preferred size
 * (1 is the default; iOS goes from about 0.82 up to 3.12 at the largest accessibility size).
 *   iOS:     the plugin's native side only answers getPreferred; it applies the size in JS as
 *            -webkit-text-size-adjust on <body>, which WebKit applies to px text as well. Done
 *            here the same way, so no bundler is needed for the plugin's JS.
 *   Android: the plugin's native set() scales the WebView's text zoom.
 *   Browser: nothing; a desktop browser has its own zoom.
 *
 * Capped at TEXT_ZOOM_RANGE.max: the bar, the keypad and the sheets have fixed heights, and at
 * 3x their text would clip. The cap is a starting point checked in a browser simulation, not on
 * a phone; the phone pass at the largest sizes is still owed.
 *
 * Re-read whenever the app comes back to the front, so a change made in Settings applies
 * without a restart. A build without the plugin (build 6 and older) does nothing and throws nothing.
 */
import { track } from '../track.js';

export const TEXT_ZOOM_RANGE = Object.freeze({ min: 0.85, max: 1.5 });

/** The preferred size, held inside the range; anything that is not a finite number is 1. */
export function clampTextZoom(value) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return 1;
  return Math.min(TEXT_ZOOM_RANGE.max, Math.max(TEXT_ZOOM_RANGE.min, Math.round(n * 100) / 100));
}

function textZoomPlugin(win) {
  const cap = win?.Capacitor;
  if (!cap || typeof cap.getPlatform !== 'function') return null;
  const platform = cap.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return null;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('TextZoom')) return null;
  const plugin = cap.Plugins?.TextZoom ?? (typeof cap.registerPlugin === 'function' ? cap.registerPlugin('TextZoom') : null);
  return plugin ? { platform, plugin } : null;
}

/** Reads the phone's text size and applies it. Resolves to the zoom applied, or null when nothing was. */
export async function applyPhoneTextSize(win = globalThis.window) {
  const found = textZoomPlugin(win);
  if (!found) return null;
  try {
    const { value } = await found.plugin.getPreferred();
    const zoom = clampTextZoom(value);
    if (found.platform === 'ios') win.document.body.style.webkitTextSizeAdjust = `${Math.round(zoom * 100)}%`;
    else await found.plugin.set({ value: zoom });
    return zoom;
  } catch (err) {
    // The text stays at 100%: readable, just not the phone's size. Seen, not swallowed.
    console.error('text size fault:', err);
    try { track('text_zoom_fault', { message: String(err?.message ?? err) }); } catch { /* the log above stands */ }
    return null;
  }
}

/** Applies the phone's text size now and each time the app returns to the front. */
export function startTextSizeSync(win = globalThis.window) {
  if (!textZoomPlugin(win)) return;
  void applyPhoneTextSize(win);
  win.document.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'visible') void applyPhoneTextSize(win);
  });
}
