/**
 * The eye, attached to the camera screen that already exists.
 *
 * The screen in `screens/camera.js` owns the surface: the reticle, the shutter,
 * the torch, the sheets and the whole pilot flow. This file does not replace any
 * of that. It gives the surface three things it did not have, and nothing else:
 *
 *   a barcode read on every frame, which skips the model entirely,
 *   a live box on what the camera is actually pointed at, which moves the
 *     reticle onto the object instead of leaving it a fixed square in the middle
 *     that the user has to line things up inside,
 *   an automatic crop at the shutter, so the fine print on the label survives
 *     being sent as a photo of a whole shelf.
 *
 * DEGRADING IS THE NORMAL CASE, NOT THE ERROR CASE. A denied permission, a
 * desktop with no camera, a private window, a browser that will not run the
 * detector, and a phone with no torch are all ordinary. Every one of them falls
 * back to exactly what the screen did before, with the same controls in the same
 * places. `attachEye` returning a handle whose `live` is false is a success.
 *
 * THE RETICLE FOLLOWS THE OBJECT AND IT SNAPS RATHER THAN CHASES. A box that
 * tracks every frame jitters, and a jittering reticle reads as the app being
 * unsure. It moves when the box has actually moved, and it is smoothed on the
 * way, so what the user sees is a thing being locked onto rather than a
 * rectangle vibrating around it.
 */

/** How far the box must move before the reticle bothers, as a fraction of the frame. */
const SNAP = 0.045;
/** How much of the new box each update takes. Low enough to settle, high enough to keep up. */
const EASE = 0.35;

/**
 * Attaches the eye to a live viewfinder.
 *
 * Returns a handle even when nothing loaded, so the caller never has to branch
 * on whether the import worked.
 */
export async function attachEye(video, reticle, handlers = {}) {
  const dead = { value: false };
  let camera = null;
  let smoothed = null;

  const paint = (boxes, fw, fh) => {
    if (!reticle || dead.value) return;
    const box = boxes[0];
    if (!box) {
      // Nothing found is not a failure and does not get its own message. The
      // reticle returns to where the CSS put it and the user keeps pointing.
      reticle.style.removeProperty('left');
      reticle.style.removeProperty('top');
      reticle.style.removeProperty('width');
      reticle.style.removeProperty('height');
      smoothed = null;
      return;
    }

    const target = {
      x: (box.x + box.width / 2) / fw,
      y: (box.y + box.height / 2) / fh,
      w: box.width / fw,
      h: box.height / fh,
    };

    if (!smoothed) {
      smoothed = target;
    } else {
      const moved =
        Math.abs(target.x - smoothed.x) + Math.abs(target.y - smoothed.y) +
        Math.abs(target.w - smoothed.w) + Math.abs(target.h - smoothed.h);
      if (moved < SNAP) return;
      smoothed = {
        x: smoothed.x + (target.x - smoothed.x) * EASE,
        y: smoothed.y + (target.y - smoothed.y) * EASE,
        w: smoothed.w + (target.w - smoothed.w) * EASE,
        h: smoothed.h + (target.h - smoothed.h) * EASE,
      };
    }

    // The video is object-fit: cover, so the frame is cropped to the element
    // and a straight percentage would put the box in the wrong place on any
    // aspect ratio but one. Scale by the cover factor and offset by the half
    // that got cropped away.
    const er = video.clientWidth / video.clientHeight;
    const fr = fw / fh;
    const sx = fr > er ? er / fr : 1;
    const sy = fr > er ? 1 : fr / er;
    const left = ((smoothed.x - 0.5) / sx + 0.5) * 100;
    const top = ((smoothed.y - 0.5) / sy + 0.5) * 100;

    reticle.style.left = `${clamp(left, 12, 88)}%`;
    reticle.style.top = `${clamp(top, 14, 78)}%`;
    reticle.style.width = `${clamp((smoothed.w / sx) * video.clientWidth, 96, video.clientWidth * 0.92)}px`;
    reticle.style.height = `${clamp((smoothed.h / sy) * video.clientHeight, 96, video.clientHeight * 0.7)}px`;
  };

  let mod;
  try {
    mod = await import('/js/eye.js');
  } catch {
    // The bundle did not load. The screen keeps its own camera and its own
    // fixed reticle, which is what it had before any of this existed.
    return inert();
  }

  /*
   * The trained detector is an upgrade, not a requirement, and it is not
   * vendored: the saliency pass in the eye finds a box with no model at all,
   * and most retail packaging is not one of the eighty classes a generic
   * detector knows anyway. Pointing at a file that is not there would look like
   * graceful degradation and would in fact be a permanent silent failure, so
   * the URL is passed only when the asset actually exists. Drop
   * efficientdet_lite0.tflite into public/js/vendor/ and it starts being used
   * on the next load, with no code change.
   */
  const modelUrl = '/js/vendor/efficientdet_lite0.tflite';
  let hasModel = false;
  try {
    hasModel = (await fetch(modelUrl, { method: 'HEAD' })).ok;
  } catch {
    hasModel = false;
  }

  try {
    camera = new mod.Camera({
      video,
      wasmUrl: '/js/vendor/zxing_reader.wasm',
      mediapipeWasmBase: '/js/vendor/mediapipe-wasm',
      detectorModelUrl: hasModel ? modelUrl : undefined,
      autoCapture: handlers.autoCapture ?? false,
      events: {
        onBarcode: (read) => { if (!dead.value) handlers.onBarcode?.(read); },
        onBoxes: (boxes, fw, fh) => {
          if (dead.value) return;
          paint(boxes, fw, fh);
          handlers.onBoxes?.(boxes);
        },
        onCapture: (crop, detection) => { if (!dead.value) handlers.onCapture?.(crop, detection); },
        onTorch: (on) => { if (!dead.value) handlers.onTorch?.(on); },
        onTrouble: (message) => { if (!dead.value) handlers.onTrouble?.(message); },
      },
    });
    await camera.start();
  } catch {
    // Permission denied, no camera, or the stream would not start. Same
    // outcome as no bundle: the screen is the screen it always was.
    try { camera?.stop(); } catch { /* nothing to stop */ }
    return inert();
  }

  return {
    live: true,
    /** The manual shutter, which stays the override however good the auto one gets. */
    capture: () => camera.capture(),
    setTorch: (on) => camera.setTorch(on),
    stop: () => {
      dead.value = true;
      try { camera.stop(); } catch { /* already gone */ }
    },
  };

  function inert() {
    return {
      live: false,
      capture: async () => {},
      setTorch: async () => false,
      stop: () => { dead.value = true; },
    };
  }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The offline queue, wired to the page rather than to a screen.
 *
 * A capture taken in a basement aisle is the one most worth keeping, and a
 * screen that unmounts on navigation is the wrong owner for it. Called once
 * from the shell.
 */
export async function startCaptureQueue(send) {
  try {
    const mod = await import('/js/eye.js');
    return mod.autoDrain(send);
  } catch {
    return () => {};
  }
}
