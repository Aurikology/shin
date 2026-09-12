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

/**
 * Flips one flag (`'photos'` or `'location'`) and returns the new consent
 * object. Turning location on also asks the OS for a position right away,
 * fire-and-forget, so the very next scan already has a cell to attach rather
 * than waiting for a stale reading to expire.
 */
export function toggleConsent(api, key) {
  const before = store.consent();
  const next = store.setConsent({ [key]: !before[key] });
  const device = getDeviceId();
  if (key === 'location' && next.location) void refreshCell();
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
