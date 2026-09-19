/**
 * The only place the client talks to the server.
 *
 * A refusal comes back as a normal 200 with `kind: "refusal"`, because it is a
 * correct answer. Nothing here may turn one into a thrown error: the moment a
 * refusal looks like a failure, every caller starts retrying around the one
 * safety mechanism in the product.
 */

import { getDeviceId } from './device.js';
import { APP_VERSION } from './version.js';
import { currentCell } from './geocell.js';
import { consent, get as storeState } from './store.js';
import { locale, localeTag } from './lib/locale.js';
import { thresholdsFrom, shelfPriceOf, scanContextFrom } from './lib/scan-body.js';

/**
 * The shop the user has picked, held by shops.js. It registers a getter here at
 * load (shops.js already imports this file, so this direction adds no import
 * cycle). Absent, no shop rides on the scan and the server reads the store type
 * as unknown.
 */
let shopProvider = null;
export function setScanShopProvider(fn) {
  shopProvider = typeof fn === 'function' ? fn : null;
}

/**
 * What THIS scan is for, set by the camera when a scan goes out and cleared when
 * it ends: the user's validation or switching choice and, in Price Tag mode, the
 * hint that the picture is a shelf tag. Rides in `scanContext()` below, so the
 * identify, photo and price calls all carry it. See lib/scan-body.js.
 */
let scanIntent = {};
export function setScanIntent(intent) {
  scanIntent = intent && typeof intent === 'object' ? { ...intent } : {};
}

/** Where and how the user shops, for the one Gemini call: see lib/scan-body.js. */
function scanContext() {
  let shop = null;
  try {
    shop = shopProvider ? shopProvider() : null;
  } catch {
    shop = null;
  }
  return scanContextFrom({ market: storeState()?.market, language: localeTag(), shop, intent: scanIntent });
}

/**
 * The three facts every identify body carries, per the fixed contract: an
 * app version and platform always, and a coarse cell only when location
 * consent is actually on right now. Read at call time, not at module load,
 * because consent can flip mid-session on the You screen and the very next
 * scan has to reflect it -- sending last session's cell after consent was
 * withdrawn would be exactly the leak withdrawal exists to stop.
 *
 * `platform` reads a wrapper-set global with the same naming convention as
 * `SHIN_API_BASE` and `SHIN_INVITE_CODE`; nothing here has been told what the
 * wrapper actually calls it, so this is this file's own assumption, named as
 * one. Absent, it is `'web'`, which is true for every build that exists today.
 *
 * The exact reading never leaves the phone. For one push on 2026-09-14 the
 * `lat`/`lon`/`accuracy`/`locatedAt` behind the cell rode along with it; Aurik
 * ruled the same day for the design he approved on 2026-09-13, the coarse
 * cell only, so `geocell.js` keeps the exact point for snapping and nothing
 * here reads it. `server.ts`'s `locationFor` writes null into the exact
 * columns whatever arrives, so the two halves agree even against an old
 * client.
 */
function identifyExtras() {
  const extras = {
    appVersion: APP_VERSION,
    platform: globalThis.window?.SHIN_PLATFORM ?? 'web',
    /* On the body and the query string as well as in the header, alongside
       appVersion and platform, which are the same kind of fact: a condition
       the answer was produced under. The server drops an unknown parameter
       today, so this costs nothing and is there the day a scan row wants a
       column for it. A header is not written to a scan row; this can be. */
    locale: locale(),
  };
  if (consent().location) {
    const cell = currentCell();
    if (cell) extras.cell = cell;
  }
  return extras;
}

/**
 * Item 2a. Read once, at module load, never again: `window.SHIN_API_BASE` is
 * set by the wrapper lane before this module is first imported (its own
 * contract, not this file's), so a value that changed after this line ran
 * would mean two different callers on the same page talking to two different
 * hosts, which is worse than the wrapper forgetting to set it at all. In the
 * browser the global is absent, `??` falls through to `''`, and every path
 * below is unchanged from before this item existed: a relative fetch against
 * whatever origin served the page.
 */
const BASE = globalThis.window?.SHIN_API_BASE ?? '';

/**
 * The beta invite code (plan item 1j), a header rather than a query param or
 * body field so it rides on every request from one place instead of being
 * added to every function below by hand and forgotten on the next one. Read
 * once for the same reason `BASE` is: the wrapper sets it before this module
 * loads and it does not change under a running page.
 *
 * The browser beta has no wrapper, so the family link carries the code
 * instead: https://<host>/#invite=<code>. The first visit stores it on the
 * phone and wipes it from the address bar; later visits read it back.
 * Added 2026-09-13 for the family beta on the Mac.
 */
const INVITE_CODE = globalThis.window?.SHIN_INVITE_CODE ?? inviteFromLink();

function inviteFromLink() {
  const w = globalThis.window;
  if (!w?.location) return null;
  const KEY = 'shin-invite';
  const match = /(?:^#|&)invite=([^&]+)/.exec(w.location.hash ?? '');
  try {
    if (match) {
      const code = decodeURIComponent(match[1]);
      w.localStorage?.setItem(KEY, code);
      w.history?.replaceState?.(null, '', w.location.pathname + w.location.search);
      return code;
    }
    return w.localStorage?.getItem(KEY) ?? null;
  } catch {
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * What language the person on the other end of this request is reading.
 *
 * A HEADER, on every request, rather than a field added to each body: it is
 * true of the whole client and not of any one call, which is the same argument
 * `x-shin-invite` above is here on. Read at call time, never cached, because
 * the You screen's language row can flip it under a running page and the very
 * next request has to carry the new one.
 *
 * THE SERVER DOES NOT READ THIS YET AND THAT IS THE POINT. Every sentence a
 * verdict carries today (`lines`, `because`, `detail`) is written in English
 * by the engine, and the client cannot translate them: they are assembled from
 * facts the client does not have. The fix is line codes plus facts, which the
 * spine lane is adding, and the server will need to know which language to
 * resolve them in. Sending it now costs one header and means the day the
 * server can answer in French, no client has to ship first.
 *
 * `x-shin-locale` carries the BCP 47 tag (fr-CA), which is what an
 * Accept-Language-shaped consumer expects; `x-shin-lang` carries the bare id
 * (fr), which is what a table lookup wants. Two headers rather than making the
 * server parse one, because a parse is a place to be wrong.
 */
/**
 * The shutter log. Each shutter press gets an id; the whole camera frame is
 * sent to the server at the press, and every request after it carries the id
 * until the next press, so the server keeps what the camera saw next to
 * exactly what it answered (app/src/shutter-log.ts). Added 2026-09-13.
 */
let shutterId = null;

function newShutterId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** Call at the shutter press with the live video element. Never throws. */
export function beginShutter(video) {
  shutterId = newShutterId();
  const id = shutterId;
  const takenAt = new Date().toISOString();
  try {
    const width = video?.videoWidth ?? 0;
    const height = video?.videoHeight ?? 0;
    if (!width || !height || !globalThis.document) return id;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const frame = await blobToBase64(blob);
        await fetch(`${BASE}/api/shutter/frame`, {
          method: 'POST',
          headers: headers({ 'content-type': 'application/json' }),
          body: JSON.stringify({ id, frame, width, height, takenAt }),
        });
      } catch (err) {
        console.error('shutter frame not sent:', err);
      }
    }, 'image/jpeg', 0.92);
  } catch (err) {
    console.error('shutter frame not captured:', err);
  }
  return id;
}

function headers(extra = {}) {
  const h = { ...extra };
  if (INVITE_CODE) h['x-shin-invite'] = INVITE_CODE;
  if (shutterId) h['x-shin-shutter'] = shutterId;
  h['x-shin-locale'] = localeTag();
  h['x-shin-lang'] = locale();
  return h;
}

async function post(path, body, { refusalIsAnswer = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    /* A 4xx from a caller that can act on one is an answer, not a failure. The
       server read this and declined it; retrying an unchanged body against an
       unchanged rule cannot ever succeed. Only sendCorrection asks for this,
       and its own header says why. A 5xx still throws for everybody: a server
       that fell over has not looked at anything, so the request is still live. */
    if (refusalIsAnswer && res.status >= 400 && res.status < 500) {
      const why = await res.json().then((b) => b?.error).catch(() => null);
      return { stored: false, why: why ?? `the server declined it (${res.status})` };
    }
    throw new Error(`${path} returned ${res.status}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

/**
 * Best-effort variants for the routes in the "API CONTRACTS" list that a scan
 * must never depend on to still work: consent, rating, events, the store
 * picker. All four "may not exist yet" while the server lane builds them, and
 * a 404 (or any other failure) from one of these must degrade quietly rather
 * than throwing into a screen that has nothing to do with it -- the exact
 * rule sendCorrection's own comment states for a 4xx, widened here to cover a
 * route that is not there at all yet, not just one that looked at a body and
 * said no.
 */
async function postSoft(path, body, fallback) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback; // Offline, or the route is not there yet. Same outcome either way.
  }
}

async function getSoft(path, fallback) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: headers() });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

/**
 * Returns a Verdict or a Refusal. Both are success.
 *
 * THE DEVICE ID IS ATTACHED HERE, NOT BY THE CALLER, 2026-09-15.
 *
 * `identify`, `identifyPhoto`, `scans` and `search` all send it and this one
 * did not, which read as a privacy nicety and was a bug: `/api/identify` and
 * `/api/identify/photo` start the price search in the background filed under
 * the device that asked, and `/api/price` picks that search up by the same
 * key. A price body with no device is a different owner every time, so the
 * started search was never the one collected -- every scan paid for two
 * searches instead of one, and the second one made the shopper wait.
 *
 * In here rather than in each screen for the reason `identify` gives: a screen
 * that forgets is a screen that silently doubles the bill, and there is no
 * outward sign of it on any glass.
 *
 * The caller still wins. A body that names its own `deviceId` (the catalogue
 * screen pricing something nobody scanned) keeps it.
 */
export function price(query) {
  const device = getDeviceId()?.id;
  // The user's own lines ride on every scan request (2026-09-17), the price
  // call included. Nothing is sent when they have none set; the caller wins.
  const thresholds = thresholdsFrom(storeState());
  const withLines = { ...scanContext(), ...(thresholds ? { thresholds } : {}), ...query };
  return post('/api/price', device ? { deviceId: device, ...withLines } : withLines);
}

/**
 * What is this thing, asked of the real catalogue: 5,182,591 products, 618,364
 * of them sold in Canada.
 *
 * A barcode answers in about 2 ms and never counts against anything, which is
 * why the scan loop fires this the instant a code is read rather than waiting
 * for a shutter press. Text answers in tens of milliseconds.
 *
 * Three outcomes, and the screen has to tell them apart:
 *   product set                 we know what it is
 *   product null, catalogueUp   read fine, we have never seen it
 *   catalogueUp false           the catalogue is not attached, we did not look
 *
 * `category` null is a fourth state and not a failure: we know the product and
 * have no fair way to price that kind of thing. `categoryWhy` is the sentence
 * for it, already written in words a person can read.
 */
export function identify({ gtin, text, brand, sizeValue, sizeUnit, shelfPriceCents } = {}) {
  const params = new URLSearchParams();
  if (gtin) params.set('gtin', gtin);
  /* The shelf price, asked at scan time so it rides in the one call
     (2026-09-17). Absent when the shopper skipped it: skipping still gets an
     answer. `thresholds` is the user's own lines, exactly as the store holds
     them; this is a GET, so the object travels as JSON in one parameter. */
  const shelf = shelfPriceOf(shelfPriceCents);
  if (shelf !== undefined) params.set('shelfPriceCents', String(shelf));
  const thresholds = thresholdsFrom(storeState());
  if (thresholds) params.set('thresholds', JSON.stringify(thresholds));
  for (const [k, v] of Object.entries(scanContext())) params.set(k, String(v));
  if (text) params.set('text', text);
  if (brand) params.set('brand', brand);
  if (sizeValue) params.set('sizeValue', String(sizeValue));
  if (sizeUnit) params.set('sizeUnit', sizeUnit);
  // The device's own random id rides along so the scan can be written down
  // against somebody rather than against nobody. It is the same coin-flip id
  // corrections already send: no name, no email, no account, and nothing
  // derived from the phone. A scan that arrives without it is still recorded,
  // filed under "unattributed", which counts in the answer rate and in nothing
  // about people.
  const device = getDeviceId();
  if (device?.id) params.set('deviceId', device.id);
  for (const [k, v] of Object.entries(identifyExtras())) params.set(k, String(v));
  return get(`/api/identify?${params.toString()}`);
}

/**
 * What the scan log says, for the profile screen.
 *
 * Every rate in the reply is either a number or null, and null means the
 * denominator was empty. A screen must print those differently: a week with no
 * scans in it is unknown, not zero percent, and this product's first priority
 * is that the difference survives all the way to the glass.
 */
export function scans() {
  const device = getDeviceId();
  const params = new URLSearchParams();
  if (device?.id) params.set('deviceId', device.id);
  return get(`/api/scans?${params.toString()}`);
}

/**
 * The ranked list behind identify's single pick, for "not this?".
 *
 * `identify` answers with the one product it will price; this is the rest of
 * what the same search found. A screen asks for it only when identify came back
 * `ambiguous`, because that is the band that means there was genuinely more
 * than one plausible row. Asking after a `confident` answer would be offering a
 * choice that does not exist, which reads as Shin hedging rather than as Shin
 * being careful.
 *
 * Text only, and that is the endpoint's shape rather than an omission here: a
 * barcode either resolves to one row or to none, so there is no second
 * candidate for a code to offer.
 */
export function search({ text, limit = 5 }) {
  const params = new URLSearchParams({ q: text, limit: String(limit) });
  /*
   * The same device id identify sends, for the same reason it sends one: the
   * server routes both by this device's own scan history, and a list fetched
   * without it would be narrowed differently from the pick it is offering
   * alternatives to.
   */
  const device = getDeviceId();
  if (device?.id) params.set('deviceId', device.id);
  return get(`/api/search?${params.toString()}`);
}

/**
 * The cheaper same-category swaps for a product at a given asking price.
 *
 * Three at most, and the server writes each row's sentence: the rule about what
 * counts as cheaper (same category, comparable size, lower price per unit, a
 * seller with a real price) lives in the catalogue package and this client is
 * not allowed to have an opinion about it. Allergen differences come back on
 * the row and are printed, never used to hide one.
 *
 * A missing catalogue and a product we have never seen both come back 200 with
 * an empty list and a sentence saying which, because neither is an error and a
 * screen that treats them as one starts retrying around them.
 */
export function alternatives({ code, askingCents }) {
  const params = new URLSearchParams({ code, askingCents: String(askingCents) });
  // The market rides along so the server compares like with like (same country,
  // region when known, same currency). Only what the user chose is sent: with no
  // market chosen nothing goes and the server calls it unknown, never Canada.
  const ctx = scanContext();
  if (ctx.countryCode) params.set('country', ctx.countryCode);
  if (ctx.region) params.set('region', ctx.region);
  if (ctx.currency) params.set('currency', ctx.currency);
  return get(`/api/alternatives?${params.toString()}`);
}

export function catalogue() {
  return get('/api/catalogue');
}

export function categories() {
  return get('/api/categories');
}

/**
 * What Shin can plausibly be pointed at, with the asking price the hand pilot
 * actually recorded. `observed` false means the asking price is a stated
 * stand-in and the screen must label it as one.
 */
export function scenarios() {
  return get('/api/scenarios');
}

/**
 * The open datasets this app is built on, with each one's licence.
 *
 * Fetched rather than written into the client, because the list is a legal
 * statement and a second copy of one drifts. The server holds the single fixed
 * list; this is the only way the screen gets it, so an empty result means the
 * fetch failed rather than that there is nothing to credit.
 */
export function attribution() {
  return get('/api/attribution');
}

/**
 * Sends one correction: a price a person read off a tag, with the shop it was
 * read in.
 *
 * Three outcomes and the caller has to tell them apart, because the right
 * response to each is different and two of them are not failures:
 *
 *   { stored: true }             kept. Drop it from the queue.
 *   { stored: false, why }       the server looked at it and will never take it
 *                                (no shop, price not a number). Drop it too, and
 *                                a queue that keeps retrying this is a queue
 *                                that never empties.
 *   { stored: false, why }       ALSO how a 4xx comes back, as of 2026-09-07.
 *                                See below: a server that has looked at this and
 *                                refused it is the same outcome whether it says
 *                                so in a 200 body or in a status code.
 *   throws                       the network did not reach the server. KEEP it.
 *                                This is the aisle-with-no-signal case and it is
 *                                the normal one, not the exception.
 *
 * This is the only function here that is allowed to fail into a retry, which is
 * why it is the only one that says so out loud.
 *
 * WHY A 4xx IS NOT A THROW HERE. `post` throws on any non-2xx, and a throw means
 * KEEP by the contract above, so any status the server uses to say no would make
 * this queue retry that item forever. The server gained a 413 on 2026-09-07 when
 * the request reader got a size cap (D-032), which made that reachable for the
 * first time: not with today's fields, which cannot approach 8 KB, but certainly
 * the day the photo route lands. A queue that never empties is the exact failure
 * the second outcome above was written to prevent, so the rule is the same one
 * stated in different words: **the server having looked at it and said no is a
 * drop, whatever shape the no arrives in.** A 5xx still throws, because a server
 * that fell over has not looked at anything.
 */
export function sendCorrection(correction) {
  return post('/api/correction', correction, { refusalIsAnswer: true });
}

/**
 * A blob, as the base64 the photo route wants. No `data:` prefix: the route
 * takes a bare base64 PNG (docs/the-photo-path.md section 3).
 *
 * `btoa`, not `Buffer`: both the browser and the Node this repo's tests run
 * under carry it as a global, and `Buffer` does not exist in the first of
 * those. Chunked so a multi-megabyte crop does not blow `String.fromCharCode`'s
 * argument limit.
 */
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * The picture the eye captured, sent to be read. docs/the-photo-path.md
 * section 3 is the contract this talks to.
 *
 * Four outcomes, and the caller has to tell them apart without a throw hiding
 * one of them -- the same discipline `identify` and `sendCorrection` already
 * keep:
 *
 *   product set              an identity, the same shape `identify` returns.
 *   candidates set            unsure: a short list to offer as a pick.
 *   failure set               the route declined it or the model could not:
 *                             'too_large' | 'rate_limited' | 'unreadable_photo'
 *                             | 'model_timeout' | 'model_outage' |
 *                             'model_rate_limited' | 'spend_cap_reached'.
 *   failure: 'offline'        the request never reached the server, or came
 *                             back in a shape this function was not told to
 *                             expect. The crop is still good either way, and
 *                             this is the signal the capture queue keeps it
 *                             on rather than losing the one thing the shopper
 *                             cannot retake.
 *
 * 413 and 429 are answers here, never throws, for the reason `sendCorrection`'s
 * own comment gives: a caller building a queue on this has to tell "the server
 * looked and said no" from "the request never arrived", and only the second is
 * worth trying again.
 */
export async function identifyPhoto(blob, { sharpness, deviceId, tier, shelfPriceCents } = {}) {
  const body = {};
  try {
    body.image = await blobToBase64(blob);
  } catch (err) {
    console.error('photo could not be read for sending:', err);
    return { product: null, failure: 'offline' };
  }
  if (typeof sharpness === 'number') body.sharpness = sharpness;
  // Same two facts every scan request carries; see lib/scan-body.js.
  const shelf = shelfPriceOf(shelfPriceCents);
  if (shelf !== undefined) body.shelfPriceCents = shelf;
  const thresholds = thresholdsFrom(storeState());
  if (thresholds) body.thresholds = thresholds;
  Object.assign(body, scanContext());
  if (tier) body.tier = tier;
  const device = deviceId ?? getDeviceId()?.id;
  if (device) body.deviceId = device;
  Object.assign(body, identifyExtras());

  let res;
  try {
    res = await fetch(`${BASE}/api/identify/photo`, {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch {
    // The aisle with no signal. Ordinary, and the crop is still good.
    return { product: null, failure: 'offline' };
  }

  if (res.status === 413 || res.status === 429) {
    const says = await res.json().then((b) => b?.error ?? b?.says ?? null).catch(() => null);
    return { product: null, failure: res.status === 413 ? 'too_large' : 'rate_limited', says };
  }
  if (!res.ok) {
    // A status this function was not built against. The crop is real and the
    // aisle it was taken in may already be gone, so it is kept rather than
    // thrown away on an error nobody named.
    console.error(`/api/identify/photo returned ${res.status}`);
    return { product: null, failure: 'offline' };
  }
  return res.json();
}

/* ------------------------------------------------------------- item 8: rating */

/**
 * Posts one thumbs rating for a scan. `{ stored: true }` on success; on any
 * failure (offline, the route not shipped yet, a refusal because the scan id
 * was missing server-side) this resolves to `{ stored: false }` rather than
 * throwing, because a rating is feedback about an answer already on screen --
 * losing the network here must never take the verdict down with it.
 */
export function postScanRating({ deviceId, scanId, rating, reason }) {
  const body = { deviceId, scanId, rating };
  if (reason) body.reason = reason;
  return postSoft('/api/scan-rating', body, { stored: false });
}

/** The undo: deletes the rating just posted. Same quiet-failure rule as the post. */
export function deleteScanRating({ deviceId, scanId }) {
  return postSoft('/api/scan-rating/delete', { deviceId, scanId }, { deleted: false });
}

/* ------------------------------------------------------------ item 6: consent */

/**
 * The server's record of this device's consent, so a screen can show what is
 * actually on file rather than only what this phone last wrote (a reinstall,
 * or a second device under the same beta invite, could disagree). Both flags
 * default to the route's own default on any failure (photos kept, location
 * off, `app/src/consent.ts` DEFAULT_CONSENT), so a screen that cannot reach the
 * server shows the same state the server would.
 */
export function getConsent(deviceId) {
  const params = new URLSearchParams({ deviceId });
  return getSoft(`/api/consent?${params.toString()}`, { photos: true, location: false, updatedAt: null });
}

/** Writes this device's consent choice. Quiet on failure: the local copy (store.js) is the source of truth the app itself reads from. */
export function postConsent({ deviceId, photos, location }) {
  return postSoft('/api/consent', { deviceId, photos, location }, { stored: false });
}

/* -------------------------------------------------------------- item 10: event */

/**
 * One client event. Never awaited by a caller and never allowed to affect
 * one: an event log with an opinion about whether the thing it is logging is
 * allowed to happen is a contradiction, so this always resolves and never
 * throws, and every call site here is `void`.
 */
export function postEvent({ deviceId, type, payload }) {
  return postSoft('/api/event', { deviceId, type, payload: payload ?? {} }, { stored: false });
}

/**
 * Flushes a batch of `track.js` events. `keepalive: true` is the whole reason
 * this is not `postSoft` calling `/api/events/batch`: keeping the request
 * alive past a page being hidden or unloaded is exactly what `track.js`'s own
 * header explains it needs `sendBeacon` cannot give it (no custom header, so
 * no `x-shin-invite`, so a beacon is refused 401 on every gated beta build).
 * Resolves to whether the server took the batch; never throws, matching every
 * other function on this file that a background queue depends on.
 */
export function postEventsBatch(events) {
  return fetch(`${BASE}/api/events/batch`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    keepalive: true,
    body: JSON.stringify({ events }),
  })
    .then((res) => res.ok)
    .catch(() => false);
}

/* -------------------------------------------------------------- item 11: stores */

/** The nearest few stores for a cell, at most three, per the fixed contract. Empty on any failure, never a throw a picker would have to guard against. */
export function stores(cell) {
  const params = new URLSearchParams({ cell });
  return getSoft(`/api/stores?${params.toString()}`, { stores: [] });
}

/* --------------------------------------------------- item 16: shelf capture */

/**
 * One picture of what the camera sees, sent to be stored. Nothing is asked of
 * the server but a place to keep it: no model runs on it, and nothing on the
 * screen waits for or shows the outcome.
 *
 * Resolves to whether the server kept it; never throws, like every other
 * background sender here. The caller (eye-shelf.js) has already checked the
 * photo consent and the server checks it again.
 */
export function uploadShelfFrame({ frame, width, height, takenAt }) {
  const device = getDeviceId()?.id;
  if (!device || !frame) return Promise.resolve(false);
  const extras = identifyExtras();
  return fetch(`${BASE}/api/shelf/frame`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      deviceId: device,
      frame,
      width,
      height,
      takenAt,
      appVersion: extras.appVersion,
      ...(extras.cell ? { cell: extras.cell } : {}),
    }),
  })
    .then((res) => res.status === 204 || res.ok)
    .catch(() => false);
}
