/**
 * The native text reader (public/js/native-text-reader.js): inside the
 * Capacitor wrapper, a still frame of the camera's own preview about once a
 * second, read by ML Kit ON THE PHONE, and only the lines of text handed on.
 *
 * What this file holds shut:
 *   - lines come out in reading order (top to bottom, left to right in a row);
 *   - an empty or number-only read never reaches onLines;
 *   - never more than one recognition in flight: a tick that finds one running is skipped;
 *   - stop() halts the ticks and drops a read that finishes afterwards;
 *   - a hidden page pauses the ticks, and a visible one resumes them;
 *   - no wrapper, or a missing plugin, answers null, so nothing on the camera changes;
 *   - the frame is written only to the app's cache for ML Kit, and no network
 *     call anywhere carries image data (RULINGS "Product identification takes a
 *     string or GTIN, never an image").
 *
 * NOT VERIFIED HERE: real ML Kit on a real phone (quality, time per frame),
 * and that a real WebView canvas can draw the getUserMedia video.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

/** Every network call any module makes during this file. */
const fetches = [];
globalThis.fetch = async (url, init = {}) => {
  fetches.push({ url: String(url), body: typeof init.body === 'string' ? init.body : String(init.body ?? '') });
  return new Response(JSON.stringify({ kind: 'text_match', candidates: [], shelfPrice: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const {
  createNativeTextReader, linesFromResult, hasLetter, grabFrame, MAX_EDGE, FRAME_FILE, CACHE_DIR, TICK_MS,
} = await import('../public/js/native-text-reader.js');
const { nativeTextReader, pickReader, createTextMatcher, resetTextMatchSession, NO_READER } = await import('../public/js/text-match.js');
const api = await import('../public/js/api.js');

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Bytes no line of text would ever contain, so their presence anywhere is proof of a leak. */
const FRAME_B64 = '/9j/4AAQSkZJRgABAQSHINFRAMEBYTES';

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => { id += 1; timers.set(id, { fn, ms }); return id; },
    clearTimer: (i) => { timers.delete(i); },
    /** Fires every timer that is due now (all are one tick long). */
    fire() {
      const due = [...timers];
      timers.clear();
      for (const [, tm] of due) tm.fn();
    },
    count: () => timers.size,
    delays: () => [...timers.values()].map((t) => t.ms),
  };
}

function fakeDoc() {
  const listeners = new Map();
  const drawn = [];
  const doc = {
    hidden: false,
    drawn,
    addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    listenerCount: (type) => listeners.get(type)?.size ?? 0,
    dispatch(type) { for (const fn of listeners.get(type) ?? []) fn({ type }); },
    querySelector: () => null,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: (src, x, y, w, h) => drawn.push({ src, x, y, w, h }) }),
        toDataURL: (type, q) => { canvas.type = type; canvas.quality = q; return `data:image/jpeg;base64,${FRAME_B64}`; },
      };
      return canvas;
    },
  };
  return doc;
}

const VIDEO = { videoWidth: 1920, videoHeight: 1080, readyState: 4 };

/** A wrapper with both plugins; `recognise` answers each processImage call. */
function fakeWrapper({ recognise, textPlugin = true, fsPlugin = true, platform = 'android' } = {}) {
  const calls = { process: [], write: [], del: [] };
  const TextRecognition = {
    processImage: (opts) => { calls.process.push(opts); return recognise(opts); },
  };
  const Filesystem = {
    writeFile: async (opts) => { calls.write.push(opts); return { uri: `file:///data/user/0/app/cache/${opts.path}` }; },
    deleteFile: async (opts) => { calls.del.push(opts); },
  };
  const plugins = {
    ...(textPlugin ? { TextRecognition } : {}),
    ...(fsPlugin ? { Filesystem } : {}),
  };
  const win = {
    Capacitor: {
      getPlatform: () => platform,
      isPluginAvailable: (name) => name in plugins,
      Plugins: plugins,
    },
  };
  return { win, calls };
}

function makeReader({ recognise, ...rest } = {}) {
  const wrap = fakeWrapper({ recognise: recognise ?? (async () => ({ text: '', blocks: [] })), ...rest });
  const doc = fakeDoc();
  const time = fakeTimers();
  const reader = createNativeTextReader({ win: wrap.win, doc, setTimer: time.setTimer, clearTimer: time.clearTimer, getVideo: () => VIDEO });
  return { reader, doc, time, ...wrap };
}

const L = (text, left, top, right, bottom) => ({ text, boundingBox: { left, top, right, bottom }, elements: [] });
const B = (lines) => {
  const bb = lines.reduce((a, l) => ({
    left: Math.min(a.left, l.boundingBox.left), top: Math.min(a.top, l.boundingBox.top),
    right: Math.max(a.right, l.boundingBox.right), bottom: Math.max(a.bottom, l.boundingBox.bottom),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  return { text: lines.map((l) => l.text).join('\n'), boundingBox: bb, lines };
};

/* ======================================================= reading order == */

test('lines come out in reading order: rows top to bottom, left to right within a row', () => {
  // ML Kit's own order scrambled: price block first, then the brand, then the name.
  const result = {
    text: 'ignored',
    blocks: [
      B([L('$4.99', 600, 110, 760, 170)]),
      B([L('Crunchy Peanut Butter', 40, 200, 560, 240), L('1 kg', 40, 250, 140, 290)]),
      B([L('KRAFT', 40, 100, 300, 180)]),
    ],
  };
  assert.deepEqual(linesFromResult(result), ['KRAFT', '$4.99', 'Crunchy Peanut Butter', '1 kg']);
});

test('lines inside a block are ordered too, and a block is never interleaved with its neighbour', () => {
  const result = {
    blocks: [
      B([L('second', 0, 60, 100, 90), L('first', 0, 10, 100, 40)]),
      B([L('beside', 400, 20, 500, 50)]),
    ],
  };
  assert.deepEqual(linesFromResult(result), ['first', 'second', 'beside']);
});

test('no boxes: ML Kit order is kept; no blocks: the full text split on newlines', () => {
  assert.deepEqual(linesFromResult({ blocks: [{ text: 'a', lines: [{ text: 'Oat' }, { text: 'Milk' }] }] }), ['Oat', 'Milk']);
  assert.deepEqual(linesFromResult({ text: 'Oat Milk\n\n 1 L ', blocks: [] }), ['Oat Milk', '1 L']);
  assert.deepEqual(linesFromResult(null), []);
});

test('hasLetter: a number-only read has none; any letter, any script, counts', () => {
  assert.equal(hasLetter(['4.99', '0068100084245', '$ 3']), false);
  assert.equal(hasLetter(['4.99', 'lait']), true);
  assert.equal(hasLetter(['é']), true);
});

/* ============================================================ the frame == */

test('the frame is downscaled so its long edge is at most 1280 px, and sent as bare base64 JPEG', () => {
  const doc = fakeDoc();
  const data = grabFrame({ videoWidth: 3840, videoHeight: 2160, readyState: 4 }, doc);
  assert.equal(data, FRAME_B64);
  assert.equal(doc.drawn.length, 1);
  assert.equal(doc.drawn[0].w, MAX_EDGE);
  assert.equal(doc.drawn[0].h, 720);
  // A small frame is not upscaled.
  grabFrame({ videoWidth: 640, videoHeight: 480, readyState: 4 }, doc);
  assert.deepEqual([doc.drawn[1].w, doc.drawn[1].h], [640, 480]);
  // No frame yet: nothing drawn.
  assert.equal(grabFrame({ videoWidth: 0, videoHeight: 0 }, doc), null);
  assert.equal(grabFrame({ videoWidth: 640, videoHeight: 480, readyState: 1 }, doc), null);
  assert.equal(grabFrame(null, doc), null);
});

/* =========================================================== the reader == */

test('a read with a letter in it reaches onLines, in reading order, about once a second', async () => {
  const { reader, time, calls } = makeReader({
    recognise: async () => ({ blocks: [B([L('4.99', 500, 0, 600, 40)]), B([L('Lactantia', 0, 0, 200, 40)])] }),
  });
  const got = [];
  reader.start((lines) => got.push(lines));
  assert.deepEqual(time.delays(), [TICK_MS]);
  time.fire();
  await flush();
  assert.deepEqual(got, [['Lactantia', '4.99']]);
  assert.equal(calls.write.length, 1);
  assert.deepEqual(calls.write[0], { path: FRAME_FILE, data: FRAME_B64, directory: CACHE_DIR });
  assert.deepEqual(calls.process, [{ path: `file:///data/user/0/app/cache/${FRAME_FILE}` }]);
  assert.equal(time.count(), 1, 'the next tick was not scheduled');
  reader.stop();
});

test('an empty read and a number-only read never reach onLines', async () => {
  const answers = [
    { text: '', blocks: [] },
    { text: '4.99\n0068100084245', blocks: [B([L('4.99', 0, 0, 100, 40)]), B([L('0068100084245', 0, 60, 300, 90)])] },
  ];
  const { reader, time } = makeReader({ recognise: async () => answers.shift() });
  const got = [];
  reader.start((lines) => got.push(lines));
  time.fire(); await flush();
  time.fire(); await flush();
  assert.deepEqual(got, []);
  reader.stop();
});

test('never more than one recognition in flight: a tick that finds one running is skipped', async () => {
  const held = [];
  const { reader, time, calls } = makeReader({ recognise: () => new Promise((resolve) => held.push(resolve)) });
  const got = [];
  reader.start((lines) => got.push(lines));
  time.fire(); await flush();
  assert.equal(calls.process.length, 1);
  assert.equal(reader.busy(), true);
  time.fire(); await flush();
  time.fire(); await flush();
  assert.equal(calls.process.length, 1, 'a second recognition started while the first was running');
  assert.equal(calls.write.length, 1, 'a frame was grabbed on a skipped tick');
  held[0]({ blocks: [B([L('Oat milk', 0, 0, 100, 40)])] });
  await flush();
  assert.equal(reader.busy(), false);
  assert.deepEqual(got, [['Oat milk']]);
  time.fire(); await flush();
  assert.equal(calls.process.length, 2, 'the next tick after the first finished did not read');
  reader.stop();
});

test('stop() halts the ticks, drops a read that finishes afterwards, and removes the cached frame', async () => {
  const held = [];
  const { reader, time, calls, doc } = makeReader({ recognise: () => new Promise((resolve) => held.push(resolve)) });
  const got = [];
  reader.start((lines) => got.push(lines));
  assert.equal(doc.listenerCount('visibilitychange'), 1);
  time.fire(); await flush();
  reader.stop();
  assert.equal(time.count(), 0, 'a tick was still scheduled after stop()');
  assert.equal(doc.listenerCount('visibilitychange'), 0, 'the visibility listener leaked');
  held[0]({ blocks: [B([L('too late', 0, 0, 100, 40)])] });
  await flush();
  assert.deepEqual(got, [], 'a read that finished after stop() still reached onLines');
  assert.deepEqual(calls.del, [{ path: FRAME_FILE, directory: CACHE_DIR }], 'the cached frame was left on the phone');
  time.fire(); await flush();
  assert.equal(calls.process.length, 1);
});

test('a hidden page pauses the ticks; visible again, they resume', async () => {
  const { reader, time, doc, calls } = makeReader({ recognise: async () => ({ blocks: [B([L('Brie', 0, 0, 100, 40)])] }) });
  const got = [];
  reader.start((lines) => got.push(lines));
  doc.hidden = true;
  doc.dispatch('visibilitychange');
  assert.equal(time.count(), 0, 'still ticking on a hidden page');
  time.fire(); await flush();
  assert.equal(calls.process.length, 0);
  doc.hidden = false;
  doc.dispatch('visibilitychange');
  assert.equal(time.count(), 1, 'did not resume when the page came back');
  time.fire(); await flush();
  assert.deepEqual(got, [['Brie']]);
  reader.stop();
});

test('a failed recognition or cache write reads nothing and the next tick tries again', async () => {
  let n = 0;
  const { reader, time } = makeReader({
    recognise: async () => { n += 1; if (n === 1) throw new Error('ML Kit could not load the image'); return { blocks: [B([L('Gouda', 0, 0, 100, 40)])] }; },
  });
  const got = [];
  reader.start((lines) => got.push(lines));
  time.fire(); await flush();
  assert.deepEqual(got, []);
  time.fire(); await flush();
  assert.deepEqual(got, [['Gouda']]);
  reader.stop();
});

/* ========================================================= availability == */

test('plugin absent, Filesystem absent, or not the wrapper: no reader, and pickReader falls through', () => {
  const doc = fakeDoc();
  const opts = (w) => ({ win: w.win, doc, getVideo: () => VIDEO });
  assert.equal(createNativeTextReader(opts(fakeWrapper({ textPlugin: false }))), null);
  assert.equal(createNativeTextReader(opts(fakeWrapper({ fsPlugin: false }))), null);
  assert.equal(createNativeTextReader(opts(fakeWrapper({ platform: 'web' }))), null);
  assert.equal(createNativeTextReader({ win: {}, doc }), null);
  assert.equal(nativeTextReader({ win: fakeWrapper({ textPlugin: false }).win, doc }), null);
  // In this test process there is no window.Capacitor at all.
  assert.equal(nativeTextReader(), null);
  assert.equal(pickReader({ search: '', native: nativeTextReader() }), NO_READER);
  // With both plugins, text-match's plug point hands back the native reader.
  const r = nativeTextReader({ win: fakeWrapper({ recognise: async () => ({}) }).win, doc });
  assert.equal(r?.kind, 'native');
  assert.equal(pickReader({ search: '?textmatch=dev', native: r }), r);
});

test('registerPlugin is used when the plugin is not already on Capacitor.Plugins', () => {
  const doc = fakeDoc();
  const registered = [];
  const win = {
    Capacitor: {
      getPlatform: () => 'ios',
      isPluginAvailable: () => true,
      registerPlugin: (name) => { registered.push(name); return name === 'TextRecognition' ? { processImage: async () => ({}) } : { writeFile: async () => ({}) }; },
    },
  };
  assert.equal(createNativeTextReader({ win, doc })?.kind, 'native');
  assert.deepEqual(registered.sort(), ['Filesystem', 'TextRecognition']);
});

/* ======================================================= never an image == */

test('no network call carries image data: the frame goes to the cache and ML Kit, only lines reach /api/match-text', async () => {
  resetTextMatchSession();
  fetches.length = 0;
  const { reader, time, calls } = makeReader({
    recognise: async () => ({ blocks: [B([L('KRAFT', 0, 0, 200, 40)]), B([L('Crunchy Peanut Butter', 0, 60, 400, 100)])] }),
  });
  const matcher = createTextMatcher({ reader, send: (lines) => api.matchText(lines), onResult: () => {} });
  assert.equal(matcher.start(), true);
  time.fire(); await flush();
  await matcher.settled(); await flush();
  matcher.stop();
  assert.equal(fetches.length, 1, 'the lines were never sent, so the check below proves nothing');
  assert.match(fetches[0].url, /\/api\/match-text$/);
  assert.deepEqual(JSON.parse(fetches[0].body).lines, ['KRAFT', 'Crunchy Peanut Butter']);
  for (const f of fetches) {
    assert.ok(!f.body.includes(FRAME_B64), `image bytes in a request to ${f.url}`);
    assert.ok(!/data:image|base64|\/9j\//.test(f.body), `image data in a request to ${f.url}`);
  }
  // The frame went to exactly one place: the app's own cache, for ML Kit on the phone.
  assert.equal(calls.write.length, 1);
  assert.equal(calls.write[0].directory, CACHE_DIR);
});

test('the reader module itself has no way to reach the network', () => {
  const src = read('../public/js/native-text-reader.js');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|from '\.\/api\.js'/);
});
