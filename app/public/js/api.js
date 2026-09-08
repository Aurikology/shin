/**
 * The only place the client talks to the server.
 *
 * A refusal comes back as a normal 200 with `kind: "refusal"`, because it is a
 * correct answer. Nothing here may turn one into a thrown error: the moment a
 * refusal looks like a failure, every caller starts retrying around the one
 * safety mechanism in the product.
 */

import { getDeviceId } from './device.js';

async function post(path, body, { refusalIsAnswer = false } = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

/** Returns a Verdict or a Refusal. Both are success. */
export function price(query) {
  return post('/api/price', query);
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
export function identify({ gtin, text, brand, sizeValue, sizeUnit } = {}) {
  const params = new URLSearchParams();
  if (gtin) params.set('gtin', gtin);
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
