/**
 * The eye, attached to the camera screen that already exists.
 *
 * The screen in `screens/camera.js` owns the surface: the reticle, the shutter,
 * the torch, the sheets and the whole pilot flow. This file does not replace any
 * of that. It gives the surface what it did not have, and nothing else:
 *
 *   a barcode read on every frame, which skips the model entirely,
 *   a mark on a barcode that is being read but has not resolved yet, which is
 *     the only way anybody ever learns that pointing at the barcode is the fast
 *     path,
 *   a live box on what the camera is actually pointed at, which moves the
 *     reticle onto the object instead of leaving it a fixed square in the middle
 *     that the user has to line things up inside,
 *   the other objects it also found, as things that can be tapped, so a shelf
 *     of six jars is a choice rather than a guess,
 *   an automatic crop at the shutter, so the fine print on the label survives
 *     being sent as a photo of a whole shelf,
 *   one measured coaching line at a time, handed to the screen to say in Shin's
 *     own voice rather than painted here as chrome.
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
 *
 * WHAT THE RETICLE DRAWS IS WHAT GETS SENT. The crop takes eight percent of
 * padding around the detected box, because labels run to the edges of a
 * package. The reticle draws that padded rectangle rather than the bare box,
 * so there is no version of this where the user frames one thing and the model
 * is handed another.
 */

import { postEvent } from './api.js';
import { getDeviceId } from './device.js';

/** How far the box must move before the reticle bothers, as a fraction of the frame. */
const SNAP = 0.045;
/** How much of the new box each update takes. Low enough to settle, high enough to keep up. */
const EASE = 0.35;
/** The padding `cropTo` adds. Drawn, so the frame shown is the frame sent. */
const CROP_PAD = 0.08;

/**
 * Attaches the eye to a live viewfinder.
 *
 * Returns a handle even when nothing loaded, so the caller never has to branch
 * on whether the import worked.
 */
export async function attachEye(video, surfaces, handlers = {}) {
  const reticle = surfaces?.reticle ?? null;
  const marks = surfaces?.marks ?? null;
  const dead = { value: false };
  let camera = null;
  let smoothed = null;
  let altCount = 0;

  /**
   * The cover transform, once.
   *
   * The video is `object-fit: cover`, so the frame is cropped to the element and
   * a straight percentage would put every box in the wrong place on any aspect
   * ratio but one. Everything drawn over the feed goes through this.
   */
  const project = (box, fw, fh) => {
    const er = video.clientWidth / video.clientHeight;
    const fr = fw / fh;
    const sx = fr > er ? er / fr : 1;
    const sy = fr > er ? 1 : fr / er;
    const cx = (box.x + box.width / 2) / fw;
    const cy = (box.y + box.height / 2) / fh;
    return {
      left: ((cx - 0.5) / sx + 0.5) * 100,
      top: ((cy - 0.5) / sy + 0.5) * 100,
      width: (box.width / fw / sx) * video.clientWidth,
      height: (box.height / fh / sy) * video.clientHeight,
    };
  };

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
      w: (box.width * (1 + CROP_PAD * 2)) / fw,
      h: (box.height * (1 + CROP_PAD * 2)) / fh,
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

  /**
   * The objects that are not the one currently framed, drawn as things you can
   * tap.
   *
   * This is the whole of "object selection" as a control. The detectors already
   * return up to three separate things and the app already promised that two
   * objects means the user chooses rather than the app guessing; until now the
   * screen kept the first and threw the rest away, so the promise had nowhere
   * to land. A dimmed rectangle you can hit is a choice offered without a word
   * of instruction, which is the only kind of instruction that works on
   * somebody standing in an aisle.
   *
   * Real buttons, not divs with click handlers: this is a control, it is
   * reachable by keyboard on the desktop build, and the screen reader has to be
   * able to say what tapping it does.
   */
  const paintAlts = (boxes, fw, fh) => {
    if (!marks || dead.value) return;
    const alts = boxes.slice(1);
    const pool = marks.querySelectorAll('.alt-box');
    for (let i = 0; i < Math.max(alts.length, altCount); i += 1) {
      let el = pool[i];
      if (!el && i < alts.length) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'alt-box';
        el.setAttribute('aria-label', 'Scan this one instead');
        marks.appendChild(el);
      }
      if (!el) continue;
      if (i >= alts.length) {
        el.hidden = true;
        continue;
      }
      const p = project(alts[i].box, fw, fh);
      el.hidden = false;
      el.dataset.alt = String(i + 1);
      el.style.left = `${p.left}%`;
      el.style.top = `${p.top}%`;
      el.style.width = `${Math.max(44, p.width)}px`;
      el.style.height = `${Math.max(44, p.height)}px`;
    }
    altCount = alts.length;
  };

  /**
   * The barcode being read, marked while it is still being read.
   *
   * Three separate jobs in one rectangle. It teaches the fast path, because a
   * mark appearing over a barcode is the only moment anybody learns the app
   * wants one. It shows progress, so a read that is nearly there says "hold
   * still" instead of looking like nothing is happening. And it explains the
   * jump, because a screen that leaps to an answer with no cause looks like a
   * misfire even when it is right.
   */
  const paintCode = (mark, fw, fh) => {
    if (!marks || dead.value) return;
    let el = marks.querySelector('.code-mark');
    if (!mark) {
      if (el) el.hidden = true;
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'code-mark';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<i></i>';
      marks.appendChild(el);
    }
    const p = project(mark.box, fw, fh);
    el.hidden = false;
    el.style.left = `${p.left}%`;
    el.style.top = `${p.top}%`;
    el.style.width = `${Math.max(56, p.width)}px`;
    el.style.height = `${Math.max(28, p.height)}px`;
    el.style.setProperty('--code-progress', String(Math.min(1, mark.frames / mark.needed)));
  };

  /*
   * Every fall back to the plain camera is reported to the server, with the
   * step and the browser's own error. Added 2026-09-14: on a family iPhone the
   * barcode never read and the shutter sent nothing, which is exactly what the
   * plain camera does, and every catch below swallowed the reason. Degrading
   * stays the normal case; degrading without anybody learning why does not.
   */
  const report = (stage, err) => {
    void postEvent({
      deviceId: getDeviceId().id,
      type: stage === 'live' ? 'eye_live' : 'eye_trouble',
      payload: {
        stage,
        error: err ? String(err?.stack ?? err).slice(0, 1500) : null,
        ua: navigator.userAgent,
        secure: globalThis.isSecureContext ?? null,
        offscreen: typeof OffscreenCanvas !== 'undefined',
        wasm: typeof WebAssembly !== 'undefined',
        video: { w: video?.videoWidth ?? null, h: video?.videoHeight ?? null },
      },
    });
  };
  const onLoopError = (e) => {
    if (dead.value || loopErrors >= 3) return;
    loopErrors += 1;
    report('loop', e?.reason ?? e?.error ?? e?.message ?? e);
  };
  let loopErrors = 0;
  globalThis.addEventListener?.('unhandledrejection', onLoopError);
  globalThis.addEventListener?.('error', onLoopError);

  let mod;
  try {
    mod = await import('/js/eye.js');
  } catch (err) {
    /*
     * Once more under a fresh address. Seen 2026-09-14 on an iPhone (Chrome,
     * WebKit): "Importing a module script failed" with no request for the file
     * ever reaching the server, so whatever failed was a copy held on the phone
     * (an old offline cache or the browser's own module map). A query string is
     * a different URL to both.
     */
    // What a plain fetch of the same file gets, so the report says whether the
    // file is unreachable from this phone or arrives and will not run.
    let probe = null;
    try {
      const res = await fetch('/js/eye.js', { cache: 'no-store' });
      const text = await res.text();
      probe = `status ${res.status} type ${res.headers.get('content-type')} bytes ${text.length} sw ${Boolean(navigator.serviceWorker?.controller)}`;
    } catch (fetchErr) {
      probe = `fetch failed: ${fetchErr}`;
    }
    report('import', `${err} | probe: ${probe}`);
    try {
      mod = await import(`/js/eye.js?fresh=${Date.now()}`);
      report('import-retry-worked', null);
    } catch (err2) {
      // The bundle did not load. The screen keeps its own camera and its own
      // fixed reticle, which is what it had before any of this existed.
      report('import-retry', err2);
      return inert();
    }
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
      autoZoom: handlers.autoZoom ?? true,
      events: {
        onBarcode: (read) => { if (!dead.value) handlers.onBarcode?.(read); },
        onBoxes: (boxes, fw, fh) => {
          if (dead.value) return;
          paint(boxes, fw, fh);
          paintAlts(boxes, fw, fh);
          handlers.onBoxes?.(boxes);
        },
        onCode: (mark, fw, fh) => {
          if (dead.value) return;
          paintCode(mark, fw, fh);
          handlers.onCode?.(mark);
        },
        onCoach: (key) => { if (!dead.value) handlers.onCoach?.(key); },
        onCapture: (crop, detection) => { if (!dead.value) handlers.onCapture?.(crop, detection); },
        onTorch: (on) => { if (!dead.value) handlers.onTorch?.(on); },
        onTrouble: (message) => {
          report('trouble', message);
          if (!dead.value) handlers.onTrouble?.(message);
        },
      },
    });
    await camera.start();
    report('live', null);
  } catch (err) {
    // Permission denied, no camera, or the stream would not start. Same
    // outcome as no bundle: the screen is the screen it always was.
    report(camera ? 'start' : 'construct', err);
    try { camera?.stop(); } catch { /* nothing to stop */ }
    return inert();
  }

  return {
    live: true,
    /** The manual shutter, which stays the override however good the auto one gets. */
    capture: () => camera.capture(),
    setTorch: (on) => camera.setTorch(on),
    /** The tap. Index into the boxes last drawn, 0 being the one already framed. */
    select: (index) => camera.select(index),
    clearSelection: () => camera.clearSelection(),
    stop: () => {
      dead.value = true;
      globalThis.removeEventListener?.('unhandledrejection', onLoopError);
      globalThis.removeEventListener?.('error', onLoopError);
      try { camera.stop(); } catch { /* already gone */ }
    },
  };

  function inert() {
    return {
      live: false,
      capture: async () => {},
      setTorch: async () => false,
      select: () => {},
      clearSelection: () => {},
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
