/**
 * Continuous shelf capture, on the camera screen (item 16, 2026-09-17).
 *
 * "Cropped photos of what the camera sees can be constantly sent to the server
 * to be saved." Every few seconds, while the viewfinder is idle, the visible
 * part of the frame is kept as a small JPEG and uploaded. STORAGE ONLY: nothing
 * about a picture is ever sent to a model, and nothing on screen reacts to one.
 *
 * WHAT MAKES IT SAFE TO LEAVE RUNNING.
 *   - The decision to send is `shouldSendShelf` (src/eye/shelf.ts): consent,
 *     not busy, online, a minimum gap, a per-visit cap, and a view that has
 *     actually changed. It is tested without a phone.
 *   - It never runs while a scan, sheet or pad is up (`isBusy`), so it cannot
 *     slow the scan, and the work it does (one 1280px canvas draw, an async JPEG
 *     encode, one background fetch) is done in idle time, one at a time.
 *   - Consent is the existing photo consent, read on every tick, so withdrawing
 *     it on the You screen stops the next picture. The server checks again.
 *   - Every failure is swallowed: a shelf picture is a bonus, never an error.
 *
 * NOT MEASURED. Battery and data use need a real phone; the dials are
 * SHELF_MIN_GAP_MS and SHELF_MAX_PER_VISIT in src/eye/shelf.ts.
 */

import { uploadShelfFrame } from './api.js';

const TICK_MS = 1000;

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function whenIdle(fn) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 0);
  }
}

/**
 * Starts sampling. `video` is the live viewfinder element; `isBusy()` says a
 * scan is under way; `consentOn()` says photo consent is currently on.
 * Returns `{ stop }`. Inert (and harmless) when the eye bundle will not load.
 */
export async function startShelfCapture({ video, isBusy, consentOn }) {
  let mod;
  try {
    mod = await import('/js/eye.js');
  } catch {
    return { stop() {} };
  }

  let state = mod.SHELF_START;
  let stopped = false;
  let inFlight = false;
  const canvas = document.createElement('canvas');
  const small = document.createElement('canvas');

  const tick = () => {
    if (stopped || inFlight) return;
    const now = Date.now();
    // The cheap refusals first, before a single pixel is read.
    if (!consentOn() || isBusy() || navigator.onLine === false) return;
    if (state.lastAt !== null && now - state.lastAt < mod.SHELF_MIN_GAP_MS) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    inFlight = true;
    whenIdle(() => {
      const finish = () => { inFlight = false; };
      try {
        if (stopped || isBusy()) return finish();
        const crop = mod.coverCrop(vw, vh, video.clientWidth, video.clientHeight);
        const size = mod.shelfSize(crop.width, crop.height);
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);

        // The signature and the brightness come off a 64 by 48 copy, not the
        // full crop: this is the cost of deciding, so it has to be small.
        small.width = 64;
        small.height = 48;
        const sctx = small.getContext('2d', { willReadFrequently: true });
        sctx.drawImage(canvas, 0, 0, 64, 48);
        const px = sctx.getImageData(0, 0, 64, 48);
        const signature = mod.signatureOf(px);
        const mean = signature.reduce((a, b) => a + b, 0) / signature.length * 255;

        const verdict = mod.shouldSendShelf(state, {
          now: Date.now(),
          consent: consentOn(),
          busy: isBusy(),
          online: navigator.onLine !== false,
          signature,
          mean,
        });
        if (!verdict.send) return finish();
        // Claimed before the encode, so a slow encode cannot let a second
        // picture start behind it.
        state = verdict.next;

        canvas.toBlob(
          async (blob) => {
            try {
              if (blob && !stopped) {
                const frame = await toBase64(blob);
                await uploadShelfFrame({
                  frame,
                  width: size.width,
                  height: size.height,
                  takenAt: new Date().toISOString(),
                });
              }
            } catch {
              /* a shelf picture is a bonus, never an error */
            } finally {
              finish();
            }
          },
          'image/jpeg',
          0.7,
        );
      } catch {
        finish();
      }
    });
  };

  const timer = setInterval(tick, TICK_MS);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
