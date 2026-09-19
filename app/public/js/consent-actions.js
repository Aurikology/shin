/**
 * Item 6's one write path, shared by the first-launch consent screen
 * (screens/consent.js) and the You screen's withdrawal toggles (screens/
 * you.js), so the two places a person can change these flags cannot drift
 * into two different ideas of what a toggle does.
 *
 * Local write first, then best-effort to the server, in that order and never
 * the other way round -- the same rule `corrections.js`'s own header states
 * for a correction: the local flag is what every check in this app reads
 * immediately (`api.js`'s `identify`/`identifyPhoto` read `store.consent()`
 * on every call), and it must never wait on a network round trip to take
 * effect.
 */
import * as store from './store.js';
import { getDeviceId } from './device.js';
import { refreshCell } from './geocell.js';
import { clearChosen } from './shops.js';

/**
 * Flips one flag (`'photos'` or `'location'`) and returns the new consent
 * object. Turning location on also asks the OS for a position right away,
 * fire-and-forget, so the very next scan already has a cell to attach rather
 * than waiting for a stale reading to expire.
 */
/**
 * Continue on the first-launch screen: writes down what the person saw and
 * left in place, defaults included, with a timestamp, locally and on the
 * server. Photos are on by default (2026-09-19, `app/src/consent.ts`), so a
 * person who taps Continue without touching anything has answered by leaving
 * the switch alone, and that answer is a fact the record should hold with the
 * time it was given, not an absence of a row. Same local-first, best-effort
 * order as `toggleConsent`; nothing here can change what a switch says.
 */
export function confirmConsent(api) {
  const current = store.consent();
  const next = store.setConsent({ photos: current.photos, location: current.location });
  const device = getDeviceId();
  if (device?.id) {
    void api.postConsent({ deviceId: device.id, photos: next.photos, location: next.location });
    void api.postEvent({
      deviceId: device.id,
      type: 'consent change',
      payload: { photos: next.photos, location: next.location, via: 'continue' },
    });
  }
  return next;
}

export function toggleConsent(api, key) {
  const before = store.consent();
  const next = store.setConsent({ [key]: !before[key] });
  const device = getDeviceId();
  if (key === 'location' && next.location) void refreshCell();
  /*
   * WITHDRAWAL HAS TO TAKE THE PATTERN WITH IT. 2026-09-13, with the shop
   * shortlist. `store.js`'s `shops` field is a record of which shops this
   * person confirmed and how often, and which one they were in in each
   * kilometre square -- which `app/src/stores.ts` names for what it is: a
   * cell plus a repeated visit is a home or a workplace. Leaving that on the
   * device after somebody has switched location off would mean the toggle
   * stopped the collecting and kept the collection, which is not what the
   * word off means on the screen it is written on.
   */
  if (key === 'location' && !next.location) {
    store.forgetShops();
    clearChosen();
  }
  if (device?.id) {
    void api.postConsent({ deviceId: device.id, photos: next.photos, location: next.location });
    void api.postEvent({
      deviceId: device.id,
      type: 'consent change',
      payload: { photos: next.photos, location: next.location },
    });
  }
  return next;
}
