/**
 * The camera stream, held once for the whole app (R-11, docs/design/ux-evidence-2026-10-09.md).
 *
 * WHY THIS EXISTS. The camera screen used to ask the phone for a new stream on
 * every visit and stop every track on the way out, so five trips from the
 * camera to Saved and back were five calls to getUserMedia. An installed web
 * app on iOS has a history of turning each of those into a fresh permission
 * prompt, and on any phone each one restarts the sensor, which is the second
 * or so of black before the viewfinder comes back. Now the stream is asked for
 * once; leaving the camera page disables its tracks (the frames stop, the
 * stream is kept) and coming back turns them on again.
 *
 * Nothing else may call getUserMedia, apart from the one-time priming ask in
 * permissions-panel.js, which stops its stream at once
 * (test/ux/ux-b3-camera-permission.test.mjs checks every file).
 *
 * A REPEAT PROMPT IS COUNTED, NOT GUESSED. A grant is remembered in
 * localStorage; when the browser reports 'prompt' again on a later launch, the
 * phone forgot the decision and is about to ask a second time, and that is
 * reported as `camera_prompt_repeat` before it asks.
 */

import { track } from './track.js';

const GRANTED_KEY = 'shin.camera.granted';
const STATES = new Set(['granted', 'denied', 'prompt']);

/** The eye's own constraints: the back camera, as high as it will go, because fine print is cropped to a fifth of the frame. */
const CONSTRAINTS = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

/** @type {MediaStream | null} */
let held = null;

const live = (stream) => !!stream && stream.getTracks().some((t) => t.readyState === 'live');

function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * The browser's own word for the camera permission: 'granted', 'denied' or
 * 'prompt', or 'unsupported' when it cannot say (Safari without a 'camera'
 * permission name throws from query). Any other state is a browser this code
 * does not understand, and it throws rather than guessing.
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>}
 */
export async function cameraPermission(nav = globalThis.navigator) {
  if (typeof nav?.permissions?.query !== 'function') return 'unsupported';
  let status;
  try {
    status = await nav.permissions.query({ name: 'camera' });
  } catch {
    return 'unsupported';
  }
  const state = status?.state;
  if (!STATES.has(state)) throw new Error(`camera permission state ${JSON.stringify(state)} is not granted, denied or prompt`);
  return state;
}

/**
 * The stream, asked for only when none is held. A held stream is turned back
 * on and returned with `reused: true`. A refusal rejects with the browser's
 * own error (NotAllowedError), never a falsy value.
 * @returns {Promise<{ stream: MediaStream, reused: boolean }>}
 */
export async function acquire({ nav = globalThis.navigator } = {}) {
  if (live(held)) {
    for (const t of held.getTracks()) t.enabled = true;
    return { stream: held, reused: true };
  }
  held = null;
  if (typeof nav?.mediaDevices?.getUserMedia !== 'function') {
    throw Object.assign(new Error('this browser has no camera API'), { name: 'NotFoundError' });
  }
  const store = storage();
  if (store?.getItem(GRANTED_KEY) === '1') {
    const state = await cameraPermission(nav).catch(() => 'unsupported');
    if (state === 'prompt') track('camera_prompt_repeat', { state });
  }
  const stream = await nav.mediaDevices.getUserMedia(CONSTRAINTS);
  held = stream;
  try { store?.setItem(GRANTED_KEY, '1'); } catch { /* storage full or blocked: the next launch just cannot compare */ }
  return { stream, reused: false };
}

/**
 * The camera page was left: the tracks are disabled, not stopped, and the
 * stream is kept. A lit torch is put out first, because a disabled track is
 * not guaranteed to drop it.
 */
export function suspend() {
  if (!held) return;
  for (const t of held.getTracks()) {
    if (t.kind === 'video' && typeof t.applyConstraints === 'function') {
      t.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
    }
    t.enabled = false;
  }
}

/** Stops every track and forgets the stream; the next acquire asks again. */
export function release() {
  if (!held) return;
  for (const t of held.getTracks()) t.stop();
  held = null;
}

/* The app going away (closed, or put in the background on a phone that unloads
   it) gives the camera back: a kept stream is for page changes inside the app,
   never for holding the sensor while nobody is looking. */
globalThis.addEventListener?.('pagehide', release);
