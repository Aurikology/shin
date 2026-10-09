/**
 * Opening the phone's own share sheet with the card image attached (UX build 5,
 * R-31). Two routes, tried in this order:
 *
 *   1. The native wrapper. Capacitor's Share plugin takes a file URI, not a Blob,
 *      so the image is written to the cache folder through the Filesystem plugin
 *      first. Used only when the wrapper was built with BOTH plugins.
 *   2. The browser's navigator.share with the PNG as a File, where
 *      navigator.canShare says the phone takes files.
 *
 * With neither there is no share sheet, and `canShareCard` says so before the
 * button is drawn: the Share control is then not on the card, and Save image and
 * Copy text are the ways out (they stay on the card either way).
 *
 * FAILS LOUDLY (RULINGS.md "Errors never go unnoticed"). An empty image throws,
 * and so does a phone with no way to share one: this file never falls back to
 * sharing the text alone, because a text-only message to a group chat is a
 * different thing from the card the shopper looked at. The shopper changing their
 * mind (dismissing the sheet) is not an error and returns 'dismissed'.
 *
 * The native route is written against Capacitor's documented plugin shapes and has
 * not been run on a device from here; the web route is covered by test.
 */

const SHARE_PLUGIN = 'Share';
const FILES_PLUGIN = 'Filesystem';

/** The same lookup purchases.js and haptics.js use: a registered plugin, or null. */
function pluginOf(win, name) {
  const cap = win?.Capacitor;
  if (!cap) return null;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(name)) return null;
  if (cap.Plugins?.[name]) return cap.Plugins[name];
  if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(name);
  return null;
}

function nativeRoute(win) {
  const share = pluginOf(win, SHARE_PLUGIN);
  const files = pluginOf(win, FILES_PLUGIN);
  return share && files ? { share, files } : null;
}

function sampleFile() {
  return new File([new Uint8Array(1)], 'card.png', { type: 'image/png' });
}

/** Whether a share sheet that takes an image exists on this phone. Decides whether the card draws a Share control. */
export function canShareCard(win = globalThis) {
  if (nativeRoute(win)) return true;
  const nav = win?.navigator;
  if (typeof nav?.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [sampleFile()] }) === true;
  } catch {
    return false;
  }
}

/** True for the shopper closing the sheet, from either route. */
export function isDismissal(err) {
  return err?.name === 'AbortError' || /cancel/i.test(String(err?.message ?? ''));
}

async function base64Of(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Opens the share sheet with the image attached.
 *
 * @param {object} p
 * @param {Blob} p.blob   the card as a PNG.
 * @param {string} p.name file name, ending .png.
 * @param {string} [p.title]
 * @param {string} [p.text]  carries no link; the card has none.
 * @returns {Promise<'native'|'web'|'dismissed'>}
 */
export async function shareCard({ blob, name, title, text, win = globalThis }) {
  if (!blob || typeof blob.size !== 'number' || blob.size === 0) {
    throw new Error('share: the card image is empty, so nothing was shared');
  }
  const route = nativeRoute(win);
  try {
    if (route) {
      const { uri } = await route.files.writeFile({ path: name, data: await base64Of(blob), directory: 'CACHE' });
      await route.share.share({ title, text, files: [uri], dialogTitle: title });
      return 'native';
    }
    const file = new File([blob], name, { type: 'image/png' });
    const nav = win?.navigator;
    if (typeof nav?.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) === true) {
      await nav.share({ files: [file], title, text });
      return 'web';
    }
  } catch (err) {
    if (isDismissal(err)) return 'dismissed';
    throw err;
  }
  throw new Error('share: this phone has no share sheet that takes an image, so the card image was not shared');
}
