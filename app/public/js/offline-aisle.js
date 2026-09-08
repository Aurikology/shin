/**
 * The offline aisle: the policy layer over pack.js.
 *
 * pack.js knows the file format and the storage. It deliberately knows nothing
 * about which pack this app wants, when to fetch it, or what a miss should mean
 * to a screen. All of that is here, in one place, because those are product
 * decisions and they change for reasons that have nothing to do with the binary
 * format.
 *
 * WHY THE PACK EXISTS AT ALL. The grocery store is where the signal dies. A
 * concrete-walled aisle in a basement Loblaws is the single most likely place
 * for this app to be opened and the single least likely place for it to have a
 * connection, so a scanner that can only answer online is a scanner that fails
 * exactly where it is used.
 *
 * WHAT IT CAN AND CANNOT DO, and the screens say the same thing. The pack holds
 * identity: name, brand, size. It holds no prices, and it never will -- prices
 * move weekly and a stale one shown as current is the confidently-wrong answer
 * this whole product is built to avoid. So offline, Shin can tell you what you
 * are holding and cannot tell you whether the price is fair. That is a partial
 * answer, and a partial answer beats "I don't know", which is the worst thing
 * this app can say.
 *
 * WHICH PACK. Grocery, 1.5 MB compressed, which is the only category the price
 * side supports today. The national pack is 6.8 MB and would be four times the
 * download for products the judge would refuse anyway.
 */

import { lookupOffline, checkForUpdate, primePack, storedVersion } from './pack.js';

const SCOPE = 'grocery';
const VERSION_URL = `/api/pack-version?scope=${SCOPE}`;
const FILE_URL = `/api/pack?scope=${SCOPE}`;

/**
 * A barcode answered from the phone alone, or null.
 *
 * The shape matches what the catalogue route hands `proceed`, with one field it
 * does not have: `offline`. That flag is not decoration. It is how the price
 * step knows that a failure to reach the server is the expected ending of this
 * scan rather than a surprise, and how the sheet knows to say what it knows
 * instead of saying nothing.
 *
 * `category` is null on purpose and is not a guess dressed as a value. The
 * category comes off the server's own classifier and the pack does not carry
 * it; inventing one here would hand the judge a fabricated input.
 */
export async function identifyOffline(code) {
  const row = await lookupOffline(SCOPE, code);
  if (!row) return null;
  /*
   * The code that goes back out is the one that came in, never the pack's own.
   * The pack stores codes as 64-bit numbers, so a leading zero does not survive
   * the round trip: 0632565000159 comes back as 632565000159. That is the same
   * product and the wrong string, and the wrong string is what a later exact
   * lookup on the server would be handed once the signal returns.
   */
  return {
    id: code,
    text: label(row),
    category: null,
    categoryWhy: null,
    gtin: code,
    offline: true,
  };
}

/** Brand, name and size, without repeating the brand when the name has it. */
function label(row) {
  const parts = [];
  const brand = (row.brands ?? '').split(',')[0].trim();
  if (brand && !row.name.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
  parts.push(row.name);
  if (row.quantity && !row.name.toLowerCase().includes(String(row.quantity).toLowerCase())) {
    parts.push(row.quantity);
  }
  return parts.join(' ');
}

/** Whether this phone can answer a barcode with the network off. */
export async function aisleReady() {
  return (await storedVersion(SCOPE)) != null;
}

/**
 * Fetches the pack if this phone does not already have the current one.
 *
 * Never awaited by its caller and never throws. Three deliberate restraints:
 *
 * 1. It waits for the browser to be idle. The viewfinder is the app and a
 *    1.5 MB download on the same connection as the first identify call would
 *    make a cold start slower to serve a case that has not happened yet.
 * 2. It respects Data Saver. A person who has told their phone to spend less
 *    has already answered this question, and asking them again in a modal is
 *    not respect.
 * 3. It asks for the version first, a few bytes, and downloads only on a known
 *    mismatch. `upToDate` null means the check itself failed, which is not the
 *    same as stale: on a bad connection this does nothing rather than pulling
 *    a megabyte and a half through a link that just refused to answer.
 */
export function primeOfflineAisle() {
  const idle = globalThis.requestIdleCallback
    ? (fn) => globalThis.requestIdleCallback(fn, { timeout: 8000 })
    : (fn) => setTimeout(fn, 3000);
  idle(() => void run());
}

async function run() {
  try {
    if (navigator.connection?.saveData) return;
    const { upToDate, remoteVersion } = await checkForUpdate(SCOPE, VERSION_URL);
    if (upToDate !== false || !remoteVersion) return;
    await primePack(SCOPE, FILE_URL, remoteVersion);
  } catch {
    /* Opportunistic. A phone without the pack is the normal starting state. */
  }
}
