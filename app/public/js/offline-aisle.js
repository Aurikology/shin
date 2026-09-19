/**
 * What a scan does with no connection: it says it needs one.
 *
 * REWRITTEN 2026-09-19 (beta gap item 21). This file used to be the offline
 * aisle: a 1.5 MB pack of product names downloaded to the phone, and a barcode
 * scan with no signal answered from it ("that is Farm Boy Extra Lean Ground
 * Beef"). Jamin's word, 2026-09-17: "For now, the app will not be usable
 * offline." So the pack is no longer consulted and no longer downloaded, and a
 * barcode scan that cannot reach the server answers with one plain sentence
 * (`cam_offline_no_price` in voice.js and voice-fr.js) and nothing else: no
 * name, no guess, no price.
 *
 * WHY THE SCREEN STILL CALLS `identifyOffline`. `screens/camera.js` imports
 * this name and treats whatever it returns as "the lookup ended here". It now
 * returns a marker, `needsConnection: true`, that the camera shows as the
 * plain sentence and does not send on to be priced. The name is kept so the
 * camera's import does not change; what the function does is the opposite of
 * what it was called.
 *
 * WHAT MAY STAY OFFLINE. The app shell (`sw.js`) still opens without a
 * connection, and the phone's own history of past scans is still on the phone.
 * Neither produces a price answer. That line is the whole rule: with no
 * network, nothing in this app identifies a barcode or answers a scan from
 * local data.
 *
 * `pack.js` and its tests stay in the repo. It is a format and a storage
 * layer, it is not wrong, and the catalogue is expected back "once more user
 * data comes in"; nothing calls it.
 */

/**
 * The answer to a barcode when the server could not be reached.
 *
 * Never looks anything up. The shape carries only what the camera needs to
 * show the sentence: the code that was read, `offline` so the price step and
 * the sheet know this is the expected ending, and `needsConnection`, which is
 * the flag the camera stops on. `text` is empty and `category` null on purpose:
 * naming the product here is exactly the offline answer this file no longer
 * gives.
 */
export async function identifyOffline(code) {
  return {
    id: code,
    text: '',
    category: null,
    categoryWhy: null,
    gtin: code,
    offline: true,
    needsConnection: true,
  };
}

/**
 * Kept as a no-op so `main.js` can keep calling it at start-up. It used to
 * fetch the offline pack when the browser was idle; with no offline scans
 * there is nothing to fetch, and a 1.5 MB download that nothing reads is a
 * cost with no benefit.
 */
export function primeOfflineAisle() {}
