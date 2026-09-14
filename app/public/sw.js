/*
 * The offline shell.
 *
 * WHY THIS EXISTS, and it is not "because apps have one". The offline pack put
 * 122,101 products on the phone so a scan in a dead aisle still gets a name.
 * That was half a feature, and the missing half was invisible until the whole
 * thing was walked with the network cut: the barcode reader fetches its
 * WebAssembly every time the camera mounts, the app's own JavaScript is fetched
 * on every load, and with no signal none of it arrives. The screen then says
 * "No barcode there" while pointed straight at a barcode, which is the worst
 * kind of wrong answer this product can give: confident, specific, and about
 * something it never actually looked at. A pack the app cannot start to read is
 * not an offline aisle.
 *
 * THE RULES, and each one is a decision rather than a default:
 *
 * 1. Nothing under /api/ is ever cached or ever served from cache. Prices are
 *    the whole product and a stale price shown as current is the failure this
 *    system exists to prevent. Offline, an API call fails, and failing is
 *    correct: the screens already know what to say about it.
 * 2. /api/pack is not cached here either, even though it is a big static file,
 *    because pack.js already stores it in IndexedDB with a version it checks.
 *    Two copies with two expiry rules is how a phone ends up answering from a
 *    pack nobody can account for.
 * 3. Everything else same-origin is served from cache first and refreshed in
 *    the background. The app is small and versioned by this file's CACHE name;
 *    a person who is online gets the new copy on their next load, and a person
 *    who is not gets the one that works.
 * 4. A navigation offline falls back to the cached page rather than the
 *    browser's error page, because the app has something useful to do with no
 *    signal and the browser's page does not.
 */

const CACHE = 'shin-shell-v2';

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

  event.respondWith(
    caches.match(req).then((hit) => {
      // Served from cache, refreshed behind the reader's back. The refresh is
      // deliberately not awaited and deliberately not allowed to fail loudly:
      // being offline is the normal case this whole file is written for.
      const live = fetch(req)
        .then((res) => {
          if (res && res.ok) void put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return hit ?? live.then((res) => res ?? Response.error());
    }),
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
