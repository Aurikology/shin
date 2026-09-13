/**
 * Getting corrections off the phone and onto the server.
 *
 * One place, because there are two callers with different timing and only one
 * correct behaviour between them: the correction screen, which sends the thing
 * that was just typed, and app start, which drains whatever an earlier aisle
 * left behind. Both are the same operation and neither may block a screen.
 *
 * NOTHING HERE THROWS AT A CALLER. A screen that awaits a flush and shows an
 * error because a supermarket has no signal has turned a working feature into a
 * broken-looking one: the correction is already saved locally at that point and
 * will go out later. The person is told it is recorded because it is recorded.
 *
 * WHAT COUNTS AS DONE, and the distinction the whole queue rests on:
 *
 *   stored              the server has it. Mark sent.
 *   stored: false       the server judged it and will never take it. Mark sent
 *                       too, with the reason, or this row is retried forever.
 *   threw               the network did not get there. Leave it pending. This is
 *                       the ordinary case in the place this feature is used.
 */

import * as api from './api.js';
import * as store from './store.js';
import { getDeviceId } from './device.js';
import { currentCell } from './geocell.js';

/**
 * Guards against two flushes overlapping, which would send every pending row
 * twice. The server is idempotent on `clientId` so the duplicate is harmless
 * there, but harmless-because-something-else-catches-it is not a reason to send
 * it.
 */
let flushing = false;

/**
 * The coarse square the phone is in, or nothing.
 *
 * Consent-gated here rather than at the server alone, which is belt and braces
 * on purpose: `locationFor` already drops a cell from a device that has not
 * said yes, and this stops it leaving the phone in the first place. Same rule,
 * same shape, as `identifyExtras` in api.js.
 */
function cellNow() {
  try {
    if (!store.consent().location) return null;
    return currentCell() ?? null;
  } catch {
    return null; // A geolocation that will not answer is not a reason to lose the price.
  }
}

function wireFor(entry) {
  return {
    clientId: entry.clientId,
    deviceId: getDeviceId().id,
    /* Null for every correction typed before this field existed, and for the
       corrections screen, which is reached from a list and not from a live
       scan. The server falls back to its own lookup in exactly that case. */
    scanId: entry.scanId ?? null,
    cell: cellNow(),
    code: entry.code,
    productId: entry.productId,
    label: entry.label,
    category: entry.category,
    seller: entry.seller,
    priceCents: entry.amountCents,
    kind: entry.kind,
    seenOn: entry.seenOn,
  };
}

/**
 * Sends everything the server has not acknowledged, oldest first.
 *
 * Stops at the first network failure rather than working through the rest. If
 * one send could not reach the server, the next one cannot either, and trying
 * anyway spends a phone's radio in a place that has already said no.
 *
 * Returns what happened, for tests and for a future screen that wants to say
 * how many are waiting. No caller has to read it.
 */
export async function flushCorrections() {
  if (flushing) return { sent: 0, refused: 0, pending: store.pendingCorrections().length };
  flushing = true;
  let sent = 0;
  let refused = 0;
  try {
    for (const entry of store.pendingCorrections()) {
      let res;
      try {
        res = await api.sendCorrection(wireFor(entry));
      } catch {
        break; // offline. Everything from here stays pending, in order.
      }
      if (res && res.stored) {
        store.markCorrectionSent(entry.clientId);
        sent += 1;
      } else {
        store.markCorrectionRefused(entry.clientId, res && res.why);
        refused += 1;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, refused, pending: store.pendingCorrections().length };
}

/**
 * Files a correction and tries to send it, in that order and never the other
 * way round. The local write is synchronous and cannot fail on a network; the
 * send is allowed to fail. The caller gets the local entry immediately and does
 * not wait for the network.
 */
export function submitCorrection(fields) {
  const entry = store.recordCorrection(fields);
  // Deliberately not awaited. The screen's thank-you is about the local write,
  // which has already happened by this line.
  void flushCorrections();
  return entry;
}
