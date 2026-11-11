/**
 * EVERY deliberate loud signal the app sends, in one list. Nothing else is expected.
 *
 * A console.error or an uncaught error that matches an entry here is the app doing what it was written
 * to do (a misread barcode is said out loud, a failed request is logged where it was caught). It gets
 * severity 'expected', is reported as a count only, is never shrunk and never fails the crawl. A signal
 * that is not on this list stays a failure. To add one, the app has to do it ON PURPOSE: name the file and
 * line where it does, and why in one line. A message that is merely frequent does not belong here.
 *
 * kind        'console-error' (a console.error call) or 'uncaught-error' (a throw nobody caught)
 * pattern     tested against the message after the crawler has normalised it (digits become #)
 * at          where the app does it on purpose, app/public/js/<file>:<line>
 * why         one line
 * afterFault  true: expected only once the crawler has injected a server failure in that run (the app is
 *             logging a failure it was handed); with no injected failure the same line is a real finding
 */
export const EXPECTED = [
  {
    kind: 'console-error', pattern: /^scan ended with no name:/,
    at: 'screens/camera.js:4218, 4259, 4663, 4697, 6904',
    why: 'RULINGS "A scan never ends with no result": a scan that ends on typing the name is logged loudly on purpose (D-232).',
  },
  {
    kind: 'uncaught-error', pattern: /fails its check digit/,
    at: 'screens/camera.js:3449',
    why: 'autoFire rethrows a failed check digit after onMisread: "must be loud and must not be looked up".',
  },
  { kind: 'console-error', pattern: /^suggestion search failed:/, at: 'screens/camera.js:3728', why: 'a failed typing-suggestion request is logged where it is caught.', afterFault: true },
  { kind: 'console-error', pattern: /^capture lookup failed:/, at: 'screens/camera.js:4378', why: 'a failed barcode lookup is logged where it is caught, and the shopper is shown the typing route.', afterFault: true },
  { kind: 'console-error', pattern: /^frame send failed:/, at: 'screens/camera.js:4692', why: 'a failed pack-frame upload is logged where it is caught.', afterFault: true },
  { kind: 'console-error', pattern: /^not-this search failed:/, at: 'screens/camera.js:4887', why: 'a failed "not this one" search is logged where it is caught.', afterFault: true },
  { kind: 'console-error', pattern: /^scan failed:/, at: 'screens/camera.js:5536', why: 'a failed scan request is logged to the console and not onto the screen (D-011).', afterFault: true },
  { kind: 'console-error', pattern: /^photo identify failed:/, at: 'screens/camera.js:5607', why: 'a failed photo identify is logged where it is caught.', afterFault: true },
  { kind: 'console-error', pattern: /^shutter frame not sent:/, at: 'api.js:216', why: 'a failed shutter-frame upload is logged and dropped on purpose; it never blocks the shopper.', afterFault: true },
  { kind: 'console-error', pattern: /^\/api\/identify\/photo returned/, at: 'api.js:853', why: 'a status the client was not built against is logged, and the crop is kept.', afterFault: true },
];

/** The entry a signal matches, or null. `faultSeen` is whether the crawler injected a failure in this run. */
export function expectedEntry(kind, message, faultSeen) {
  for (const e of EXPECTED) {
    if (e.kind !== kind || !e.pattern.test(message)) continue;
    if (e.afterFault && !faultSeen) continue;
    return e;
  }
  return null;
}
