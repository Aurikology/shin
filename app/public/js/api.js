/**
 * The only place the client talks to the server.
 *
 * A refusal comes back as a normal 200 with `kind: "refusal"`, because it is a
 * correct answer. Nothing here may turn one into a thrown error: the moment a
 * refusal looks like a failure, every caller starts retrying around the one
 * safety mechanism in the product.
 */

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
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
  return get(`/api/identify?${params.toString()}`);
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
 *   throws                       the network did not reach the server. KEEP it.
 *                                This is the aisle-with-no-signal case and it is
 *                                the normal one, not the exception.
 *
 * This is the only function here that is allowed to fail into a retry, which is
 * why it is the only one that says so out loud.
 */
export function sendCorrection(correction) {
  return post('/api/correction', correction);
}
