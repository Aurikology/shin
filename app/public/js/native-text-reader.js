/**
 * THE NATIVE TEXT READER: text read ON THE PHONE from the camera preview the
 * shopper is already looking at, so only text ever leaves the device.
 *
 * RULINGS.md "Catalogue first; Gemini is a capped fallback, never the identity"
 * and "Product identification takes a string or GTIN, never an image"
 * (2026-09-27). This reader never calls fetch, never builds a request, and
 * never hands the frame to anything but the phone's own ML Kit.
 *
 * HOW A FRAME IS READ, about once a second:
 *   1. The frame comes from the SAME `<video class="feed-video">` the camera
 *      screen shows (camera.js template, fed by getUserMedia in `startCamera`),
 *      the element eye.js already samples for barcodes. No second camera
 *      session is opened.
 *   2. It is drawn to a small canvas, long edge at most MAX_EDGE px, as a JPEG.
 *   3. `@capacitor-mlkit/text-recognition` recognises a still image only from
 *      a LOCAL FILE PATH (its `processImage({ path })`; no base64 input, read
 *      from its README and types, v8.2.1). So the JPEG is written to the app's
 *      private cache directory through the Capacitor Filesystem plugin, always
 *      to the same file name, and that file's URI is what ML Kit reads. The
 *      file is deleted when the reader stops.
 *   4. Blocks and lines come back; they are put in reading order and handed to
 *      `onLines` only when at least one line has a letter in it.
 *
 * AVAILABLE ONLY when all of these hold, and `nativeTextReader()` answers null
 * otherwise (so the browser and the `?textmatch=dev` textarea are unchanged):
 * the page runs inside the Capacitor wrapper (`platformOf`, the check
 * purchases.js already uses), the TextRecognition plugin is there, and the
 * Filesystem plugin is there to write the frame to the cache.
 *
 * Never more than one recognition in flight: a tick that finds the previous
 * one still running is skipped. Ticks pause while the page is hidden and stop
 * for good on `stop()`.
 */

import { platformOf } from './purchases.js';

/** About once a second. */
export const TICK_MS = 1000;
/** The long edge of the frame handed to ML Kit, in pixels. */
export const MAX_EDGE = 1280;
export const JPEG_QUALITY = 0.8;
/** One file in the app's private cache, overwritten each tick, deleted on stop. */
export const FRAME_FILE = 'shin-text-frame.jpg';
/** Capacitor Filesystem's `Directory.Cache`. */
export const CACHE_DIR = 'CACHE';

const LETTER = /\p{L}/u;

/** A native plugin by name, the way purchases.js reaches Purchases; null when absent. */
function plugin(win, name) {
  const cap = win?.Capacitor;
  if (!cap || platformOf(win) === 'web') return null;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(name)) return null;
  if (cap.Plugins?.[name]) return cap.Plugins[name];
  if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(name);
  return null;
}

/* --------------------------------------------------------- reading order */

function box(item) {
  const b = item?.boundingBox;
  if (!b || ![b.left, b.top, b.right, b.bottom].every(Number.isFinite)) return null;
  return b;
}

/**
 * Top to bottom, and left to right within a row. Two items share a row when
 * the second one's vertical centre falls inside the first one's height, so a
 * price beside a name on a shelf tag reads name first, then price. Items with
 * no box keep the order ML Kit gave them, after the ones that have one.
 */
function readingOrder(items) {
  const boxed = [];
  const loose = [];
  items.forEach((item, i) => {
    const b = box(item);
    if (b) boxed.push({ item, b, i });
    else loose.push(item);
  });
  boxed.sort((x, y) => x.b.top - y.b.top || x.b.left - y.b.left || x.i - y.i);
  const rows = [];
  for (const entry of boxed) {
    const row = rows[rows.length - 1];
    const centre = (entry.b.top + entry.b.bottom) / 2;
    if (row && centre < row[0].b.bottom) row.push(entry);
    else rows.push([entry]);
  }
  const out = [];
  for (const row of rows) {
    row.sort((x, y) => x.b.left - y.b.left || x.i - y.i);
    for (const entry of row) out.push(entry.item);
  }
  return out.concat(loose);
}

/**
 * ML Kit's `{ text, blocks: [{ lines: [{ text, boundingBox }] }] }` as an
 * array of trimmed line strings in reading order. Blocks are ordered first,
 * then the lines inside each block, so a paragraph is never interleaved with
 * the column beside it. With no blocks, the full text split on newlines.
 */
export function linesFromResult(result) {
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const out = [];
  for (const block of readingOrder(blocks)) {
    const lines = Array.isArray(block?.lines) && block.lines.length > 0
      ? readingOrder(block.lines).map((l) => l?.text)
      : String(block?.text ?? '').split(/\r?\n/);
    for (const text of lines) {
      if (typeof text !== 'string') continue;
      const s = text.replace(/\s+/g, ' ').trim();
      if (s !== '') out.push(s);
    }
  }
  if (out.length === 0 && typeof result?.text === 'string') {
    for (const text of result.text.split(/\r?\n/)) {
      const s = text.replace(/\s+/g, ' ').trim();
      if (s !== '') out.push(s);
    }
  }
  return out;
}

/** Whether any line has a letter in it: number-only reads (a price, a barcode's digits) are not worth a search. */
export function hasLetter(lines) {
  return lines.some((l) => LETTER.test(l));
}

/* ------------------------------------------------------------- the frame */

/** The live preview the camera screen shows; null when there is none yet. */
function feedVideo(doc) {
  return doc?.querySelector?.('video.feed-video') ?? null;
}

/**
 * The current preview frame as bare base64 JPEG (no `data:` prefix), long
 * edge at most MAX_EDGE; null when the video has no frame yet.
 */
export function grabFrame(video, doc) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  if (typeof video.readyState === 'number' && video.readyState < 2) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.drawImage(video, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const comma = typeof url === 'string' ? url.indexOf(',') : -1;
  if (comma < 0 || !url.startsWith('data:image/jpeg')) return null;
  return url.slice(comma + 1);
}

/* ------------------------------------------------------------- the reader */

/**
 * The reader, or null when this is not the wrapper or a plugin it needs is
 * missing. Everything it touches is passed in so a test can fake it.
 */
export function createNativeTextReader({
  win = globalThis.window,
  doc = globalThis.document,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  getVideo = () => feedVideo(doc),
  tickMs = TICK_MS,
} = {}) {
  const recogniser = plugin(win, 'TextRecognition');
  const files = plugin(win, 'Filesystem');
  if (!recogniser || typeof recogniser.processImage !== 'function') return null;
  if (!files || typeof files.writeFile !== 'function') return null;
  if (!doc) return null;

  let onLines = null;
  let timer = null;
  let busy = false;
  let wroteFile = false;
  // Bumped on every stop, so a recognition that finishes after stop() is dropped.
  let generation = 0;
  let listening = false;

  function schedule() {
    if (timer !== null || !onLines || doc.hidden) return;
    timer = setTimer(() => {
      timer = null;
      tick();
      schedule();
    }, tickMs);
  }

  function unschedule() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function onVisibility() {
    if (doc.hidden) unschedule();
    else schedule();
  }

  async function readOnce(gen) {
    const data = grabFrame(getVideo(), doc);
    if (!data) return;
    const written = await files.writeFile({ path: FRAME_FILE, data, directory: CACHE_DIR });
    wroteFile = true;
    if (gen !== generation || !written?.uri) return;
    const result = await recogniser.processImage({ path: written.uri });
    if (gen !== generation || !onLines) return;
    const lines = linesFromResult(result);
    if (lines.length > 0 && hasLetter(lines)) onLines(lines);
  }

  /** The cached frame is removed once nothing is reading it. */
  function removeFrame() {
    if (!wroteFile || typeof files.deleteFile !== 'function') return;
    wroteFile = false;
    Promise.resolve()
      .then(() => files.deleteFile({ path: FRAME_FILE, directory: CACHE_DIR }))
      .catch(() => {});
  }

  function tick() {
    if (busy || !onLines || doc.hidden) return;
    busy = true;
    const gen = generation;
    readOnce(gen)
      .catch(() => {
        // A frame ML Kit could not read, or a cache write that failed: this
        // tick reads nothing and the next one tries a fresh frame.
      })
      .finally(() => {
        busy = false;
        // Stopped while this one ran: stop() left the file for us to remove.
        if (!onLines) removeFrame();
      });
  }

  return {
    kind: 'native',
    start(fn) {
      if (onLines || typeof fn !== 'function') return;
      onLines = fn;
      if (!listening) {
        doc.addEventListener?.('visibilitychange', onVisibility);
        listening = true;
      }
      schedule();
    },
    stop() {
      generation += 1;
      onLines = null;
      unschedule();
      if (listening) {
        doc.removeEventListener?.('visibilitychange', onVisibility);
        listening = false;
      }
      if (!busy) removeFrame();
    },
    /** For tests: whether a recognition is running right now. */
    busy: () => busy,
  };
}
