/**
 * Beta gap item 21: with no network the app says it needs a connection and
 * answers nothing from local data.
 *
 * His word, 2026-09-17: "For now, the app will not be usable offline." What
 * used to happen: a barcode scan with no signal was named from a 1.5 MB pack of
 * products on the phone (`offline-aisle.js`), and the service worker kept a
 * copy of the shell so the camera could open to do it. What may still happen:
 * the shell opens. What may not: a name, a price, or any answer to a scan.
 *
 * Three surfaces, each tested where it lives:
 *   1. `offline-aisle.js`, the function the camera calls when the request fails.
 *   2. `needsConnectionSheet`, the one screen the camera shows for it.
 *   3. `sw.js`, run for real in a `vm` with the browser's `self` replaced, since
 *      the rule that matters is what its fetch handler does and does not answer.
 *
 * What none of this can prove: a real phone in airplane mode. That needs the
 * device and is reported as not verified.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { identifyOffline, primeOfflineAisle } from '../public/js/offline-aisle.js';
import { needsConnectionSheet } from '../public/js/screens/camera.js';
import { say } from '../public/js/voice.js';
import { LINES_FR } from '../public/js/voice-fr.js';

const TONES = ['deadpan', 'warm', 'blunt'];
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/* ---------------------------------------------------------- offline-aisle -- */

test('a barcode with no connection is marked as needing one, and is not named', async () => {
  // 270013810754 is a code the offline pack knew ("Extra Lean Ground Beef",
  // Farm Boy). It must come back with no name whatever the pack holds.
  const out = await identifyOffline('270013810754');
  assert.equal(out.needsConnection, true, 'the camera has nothing to stop on');
  assert.equal(out.offline, true);
  assert.equal(out.text, '', 'a product name was produced with no network');
  assert.equal(out.category, null);
  assert.equal(out.gtin, '270013810754', 'the code that was read must go back unchanged, leading zeros included');
  assert.equal((await identifyOffline('0632565000159')).gtin, '0632565000159');
});

test('the offline aisle no longer reads the pack or downloads it', async () => {
  // Code only: the header comment names the pack to say why it is gone.
  const src = read('../public/js/offline-aisle.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /^\s*import\s/m, 'offline-aisle.js imports something again');
  assert.doesNotMatch(src, /pack\.js|lookupOffline|primePack|checkForUpdate/, 'the pack is being consulted again');

  const calls = [];
  const realFetch = globalThis.fetch;
  const realIdle = globalThis.requestIdleCallback;
  globalThis.fetch = (...args) => {
    calls.push(args);
    return Promise.reject(new Error('no network in this test'));
  };
  globalThis.requestIdleCallback = (fn) => fn();
  try {
    primeOfflineAisle();
    await new Promise((r) => setTimeout(r, 25));
  } finally {
    globalThis.fetch = realFetch;
    if (realIdle === undefined) delete globalThis.requestIdleCallback;
    else globalThis.requestIdleCallback = realIdle;
  }
  assert.deepEqual(calls, [], 'start-up still downloads the offline pack');
});

/* ------------------------------------------------------- the camera sheet -- */

test('the sheet says plainly that a connection is needed, in every tone and both languages', () => {
  const html = needsConnectionSheet();
  assert.match(html, /data-needs-connection/);
  for (const tone of TONES) {
    const en = say('cam_offline_no_price', {}, tone);
    const fr = LINES_FR.cam_offline_no_price[tone]();
    assert.match(en, /connection/i, `${tone} English line does not say it needs a connection`);
    assert.match(fr, /connexion/i, `${tone} French line does not say it needs a connection`);
    for (const text of [en, fr, say('cam_needs_connection', {}, tone), LINES_FR.cam_needs_connection[tone]()]) {
      assert.ok(text.length > 0);
      assert.ok(!text.includes('—'), 'an em dash is in the offline copy');
      // The old copy said the phone knew what the thing was. Never again.
      assert.doesNotMatch(text, /what it is|what this is|already had|ce que c'est|déjà/i);
    }
  }
  // The default tone's sentence is what is actually on the sheet.
  const shown = say('cam_offline_no_price');
  assert.ok(html.includes(shown.replace(/&/g, '&amp;')), 'the sheet does not carry the offline sentence');
});

test('the sheet offers no price, no product name and no way to answer from the phone', () => {
  const html = needsConnectionSheet();
  assert.doesNotMatch(html, /\$\s?\d|\d\s?\$|data-act="(correct|typeit|keepit)"/, 'the offline sheet carries a price or a local-answer action');
  assert.doesNotMatch(html, /itemname|cheaper|because/, 'the offline sheet shows product or evidence sections');
});

test('the camera stops on the marker and never sends it on to be priced', () => {
  const cam = read('../public/js/screens/camera.js');
  // The lookup returns the marker only when the request itself failed...
  assert.match(cam, /return id === null \? identifyOffline\(code\) : null;/);
  // ...and the caller shows the sheet and returns before `proceed` is reached.
  const stop = cam.indexOf('if (found?.needsConnection)');
  const proceedCall = cam.indexOf('proceed({ ...found, scannedGtin: code }, cents ?? undefined)');
  assert.ok(proceedCall > 0, 'the priced call moved or was renamed');
  assert.ok(stop > 0, 'the camera no longer stops on the needs-connection marker');
  assert.ok(stop < proceedCall, 'the marker check moved below the price call');
  assert.match(cam.slice(stop, proceedCall), /needsConnectionSheet\(\)[\s\S]*return;/);
});

/* -------------------------------------------------------------- sw.js run -- */

/**
 * Runs sw.js with a fake `self` and returns what it registered. The fetch
 * handler is exercised with fake events; `answered` lists what it chose to
 * answer, which is the whole question.
 */
function loadServiceWorker({ cached = {}, network = 'down', staleCaches = [] } = {}) {
  const listeners = {};
  const deleted = [];
  const puts = [];
  const cache = {
    addAll: async () => {},
    put: async (req) => {
      puts.push(new URL(req.url).pathname);
    },
  };
  const caches = {
    open: async () => cache,
    keys: async () => staleCaches,
    delete: async (n) => {
      deleted.push(n);
      return true;
    },
    // Even a cache that HOLDS an answer to /api/... must never be asked for it.
    match: async (req) => {
      const path = new URL(typeof req === 'string' ? `https://shin.test${req}` : req.url).pathname;
      return cached[path] ?? undefined;
    },
  };
  const self = {
    location: { origin: 'https://shin.test' },
    addEventListener: (name, fn) => {
      listeners[name] = fn;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const sandbox = {
    self,
    caches,
    URL,
    Response,
    Promise,
    fetch: async () => {
      if (network === 'down') throw new TypeError('Failed to fetch');
      return new Response('online', { status: 200 });
    },
  };
  vm.runInNewContext(read('../public/sw.js'), sandbox, { filename: 'sw.js' });
  return { listeners, deleted, puts, sandbox };
}

/** Fires a fetch event and reports whether the worker took the request. */
async function fire(sw, { method = 'GET', url, mode = 'cors' }) {
  let answered = null;
  sw.listeners.fetch({
    request: { method, url, mode },
    respondWith: (p) => {
      answered = Promise.resolve(p);
    },
  });
  return answered === null ? { took: false } : { took: true, response: await answered };
}

test('the worker never answers a scan: no /api/ path is ever taken over, even when cached', async () => {
  const sw = loadServiceWorker({
    network: 'down',
    cached: { '/api/identify': new Response('a stale product'), '/api/price': new Response('a stale price') },
  });
  for (const path of ['/api/identify?gtin=1', '/api/price', '/api/identify/photo', '/api/scan-rating']) {
    const out = await fire(sw, { url: `https://shin.test${path}` });
    assert.equal(out.took, false, `the worker took ${path} and could answer it from a cache`);
  }
});

test('a POST is never intercepted, so a scan or a rating cannot be answered from a cache', async () => {
  const sw = loadServiceWorker({ network: 'down' });
  for (const path of ['/api/identify', '/api/scan-rating', '/api/events', '/anything']) {
    const out = await fire(sw, { method: 'POST', url: `https://shin.test${path}` });
    assert.equal(out.took, false, `POST ${path} was intercepted`);
  }
});

test('another origin is left alone', async () => {
  const sw = loadServiceWorker({ network: 'down' });
  const out = await fire(sw, { url: 'https://example.com/prices.json' });
  assert.equal(out.took, false);
});

test('nothing under /api/ is written to the cache when online', async () => {
  const sw = loadServiceWorker({ network: 'up' });
  await fire(sw, { url: 'https://shin.test/api/price' });
  await fire(sw, { url: 'https://shin.test/js/main.js' });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(sw.puts.includes('/js/main.js'), 'the shell is no longer cached');
  assert.ok(!sw.puts.some((p) => p.startsWith('/api/')), 'an API answer was cached');
});

test('the shell may still open with no network', async () => {
  const sw = loadServiceWorker({ network: 'down', cached: { '/index.html': new Response('<html>shell</html>') } });
  const out = await fire(sw, { url: 'https://shin.test/', mode: 'navigate' });
  assert.equal(out.took, true);
  assert.equal(await out.response.text(), '<html>shell</html>');
});

test('the old cache generation, which held the offline pack module graph, is dropped', async () => {
  const sw = loadServiceWorker({ staleCaches: ['shin-shell-v3', 'shin-shell-v4'] });
  const waits = [];
  sw.listeners.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(sw.deleted, ['shin-shell-v3']);
});
