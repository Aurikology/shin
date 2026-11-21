/**
 * The camera screen's source as one text: screens/camera.js followed by every module split out of
 * it into screens/camera/ (the camera.js split, 2026-11-21). Not a test file.
 *
 * Many tests read camera.js as text and hold it to a rule ("no haptic on the offline sheet", "no
 * English string", "every selector still exists"). When code moves out of camera.js, a test that
 * reads only camera.js silently stops covering it. Reading through here keeps every rule on the
 * whole screen wherever its code sits. Line endings are normalised to \n.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SCREENS = fileURLToPath(new URL('../public/js/screens/', import.meta.url));

/** The files, camera.js first, then screens/camera/*.js in name order, as [label, path]. */
export function cameraFiles() {
  const parts = readdirSync(join(SCREENS, 'camera')).filter((f) => f.endsWith('.js')).sort();
  return [['camera.js', join(SCREENS, 'camera.js')], ...parts.map((f) => [`camera/${f}`, join(SCREENS, 'camera', f)])];
}

/** camera.js and its split-out modules, joined by a blank line. */
export function cameraSource() {
  return cameraFiles().map(([, p]) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).join('\n\n');
}
