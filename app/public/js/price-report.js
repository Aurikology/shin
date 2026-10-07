/**
 * Sending a shopper's price and finding out whether the server took it.
 *
 * WHY THIS IS NOT `corrections.js`. That module's contract is "nothing here
 * throws and the thank-you is about the local write", which is right for a
 * price queued in an aisle with no signal and wrong for the two screens that
 * SAY "Recorded" (the correction screen) and "Written down" (the price-only
 * card). Walkthrough D01 and D02: those screens said so while the server
 * answered `stored:false`, because the send was not awaited and the answer was
 * never read. Hard rule 3 (a result records what happened) applies to a screen
 * as much as a log.
 *
 * So these two screens use `fileReport`, which still writes the price to the
 * device FIRST (the local queue is the safety net, and `corrections.js`'s flush
 * at app start will send it if this attempt could not), but then waits for the
 * server and returns what it said. The caller says "Recorded" only for
 * `stored: true`.
 *
 * THREE OUTCOMES, kept apart because the screen words them differently:
 *
 *   stored: true                  the server has it.
 *   stored: false, network: false the server read it and refused; `why` is its
 *                                 sentence. The queue row is marked refused so
 *                                 it is never retried behind the shopper's back.
 *   stored: false, network: true  the request did not get there. The row stays
 *                                 pending: Retry re-sends the SAME clientId
 *                                 (the server is idempotent on it), and so does
 *                                 the app-start flush, so neither can double it.
 *
 * Never throws.
 */

import * as api from './api.js';
import * as store from './store.js';
import { getDeviceId } from './device.js';
import { currentCell } from './geocell.js';

/*
 * THE SCAN THE SHOPPER LAST SAW AN ANSWER FOR, held for the screens that are
 * reached from somewhere other than the verdict ("Report a wrong price" on the
 * You screen). Without it that screen files its price against nothing, which is
 * the other half of D01: no barcode and no scan id means nothing can read the
 * price back. Memory only, never stored: it is a fact about this session.
 */
let lastSeen = null;

/**
 * Called by the camera whenever an answer paints. A call about the same scan
 * merges (a later call can add the code); a call about a different scan
 * replaces, so the last scan's barcode is never carried onto the next one.
 */
export function rememberScan(info) {
  if (!info || typeof info !== 'object') return;
  const same = lastSeen && info.scanId != null && lastSeen.scanId === info.scanId;
  lastSeen = { ...(same ? lastSeen : {}), ...info, at: Date.now() };
}

/** Forgets it, for a new scan that has no answer yet. */
export function forgetScan() {
  lastSeen = null;
}

/** What `rememberScan` last held, or null. */
export function recalledScan() {
  return lastSeen;
}

/** The coarse cell, only with location consent, exactly as `corrections.js` reads it. */
function cellNow() {
  try {
    if (!store.consent().location) return null;
    return currentCell() ?? null;
  } catch {
    return null;
  }
}

/**
 * The wire shape of one queued correction. Same fields, same names as
 * `corrections.js`'s `wireFor`, with `scanId` and `code` carried, which is the
 * whole of D01: the screen used to send both as null.
 */
export function wireForReport(entry) {
  return {
    clientId: entry.clientId,
    deviceId: getDeviceId().id,
    scanId: entry.scanId ?? null,
    cell: cellNow(),
    code: entry.code ?? null,
    productId: entry.productId ?? null,
    label: entry.label ?? null,
    category: entry.category ?? null,
    seller: entry.seller,
    storeId: entry.storeId ?? null,
    storeName: entry.seller || null,
    priceCents: entry.amountCents,
    kind: entry.kind,
    seenOn: entry.seenOn,
  };
}

/**
 * Sends one queued entry and waits for the server's answer.
 *
 * @returns {Promise<{stored: true, id: number|null} | {stored: false, network: boolean, why: string|null}>}
 */
export async function sendReport(entry) {
  let res;
  try {
    res = await api.sendCorrection(wireForReport(entry));
  } catch {
    return { stored: false, network: true, why: null };
  }
  if (res && res.stored === true) {
    store.markCorrectionSent(entry.clientId);
    return { stored: true, id: res.id ?? null };
  }
  const why = typeof res?.why === 'string' && res.why.trim() !== '' ? res.why.trim() : null;
  store.markCorrectionRefused(entry.clientId, why);
  return { stored: false, network: false, why };
}

/**
 * Writes the price to the device, sends it, and says what happened.
 *
 * @returns {Promise<{entry: object} & Awaited<ReturnType<typeof sendReport>>>}
 */
export async function fileReport(fields) {
  const entry = store.recordCorrection(fields);
  return { entry, ...(await sendReport(entry)) };
}

/**
 * The shopper changed the price or the shop after a failed send and filed a new
 * one: the old queued row must not be sent later behind the new one's back.
 */
export function abandonReport(entry) {
  if (entry?.clientId) store.markCorrectionRefused(entry.clientId, 'replaced by a newer entry');
}

/** The same entry again, after a failure. Same clientId: a retry is never a second witness. */
export async function retryReport(entry) {
  return { entry, ...(await sendReport(entry)) };
}
