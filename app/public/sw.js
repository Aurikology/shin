/*
 * The offline shell.
 *
 * WHY THIS EXISTS, and it is not "because apps have one". With the network cut
 * the barcode reader cannot fetch its WebAssembly, the app's own JavaScript is
 * fetched on every load, and none of it arrives, so the app must still OPEN and
 * say something true rather than show the browser's error page. Since
 * 2026-09-19 (beta gap item 21, Jamin: "For now, the app will not be usable
 * offline") what it says is that it needs a connection: this file opens the
 * shell and nothing else. It never answers a scan.
 *
 * THE RULES, and each one is a decision rather than a default:
 *
 * 1. Nothing under /api/ is ever cached or ever served from cache. Prices are
 *    the whole product and a stale price shown as current is the failure this
 *    system exists to prevent. Offline, an API call fails, and failing is
 *    correct: the screens say they need a connection. This is the rule that
 *    keeps the service worker from answering a scan, and `test/offline-
 *    needs-connection.test.mjs` runs this file to hold it.
 * 2. Only GET, same-origin requests are looked at at all. A POST (a scan, a
 *    rating, an event) is never intercepted, so it cannot be answered from a
 *    cache.
 * 3. Everything else same-origin is fetched from the network first and cached;
 *    the cache answers only when the network does not (see the fetch handler);
 *    a person who is online always gets the current copy, and a person
 *    who is not gets the one that works.
 * 4. A navigation offline falls back to the cached page rather than the
 *    browser's error page, because the app has something useful to do with no
 *    signal and the browser's page does not.
 */

// v4 (2026-09-19): drops every earlier cache, which held the offline pack's
// module graph. The name change is the whole mechanism (see `activate`).
const CACHE = 'shin-shell-v4';

/*
 * The one file that must be there before the first offline load, because
 * everything else is reached from it. The module graph underneath is picked up
 * by rule 3 on the first online visit rather than listed here: a hand-written
 * list of thirty modules is a list that goes stale silently the first time
 * somebody adds a screen.
 */
const SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // Rules 1 and 2.

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          void put(req, res.clone());
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  /*
   * Network first, cache when there is no network. Was cache first until
   * 2026-09-14, when a family phone kept running a copy of the app from before
   * two fixes (the invite read from the link, and the barcode reader surviving
   * a slow download) for several loads after both were live: every API call it
   * made was refused and nothing it scanned reached the server. On the beta the
   * code changes daily, so a stale copy is the common case, not the offline
   * aisle. Offline still gets the cached copy.
   */
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) void put(req, res.clone());
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? Response.error())),
  );
});

async function put(req, res) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(req, res);
  } catch {
    /* Storage full, or a response that cannot be stored. Not worth a failure. */
  }
}
