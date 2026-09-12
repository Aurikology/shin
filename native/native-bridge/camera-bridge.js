/**
 * Native camera/barcode fallback, behind the same client calls the web app
 * already uses.
 *
 * WHY THIS FILE EXISTS: inside a wrapped app, `navigator.mediaDevices.getUserMedia`
 * can fail where a real mobile browser would have succeeded (some WebViews
 * restrict camera access more than Safari/Chrome do). The web app's own
 * fallback for a failed getUserMedia is the drawn shelf (a simulated camera,
 * see app/public/js/screens/camera.js, `startCamera`) -- correct for "no
 * camera", wrong for "camera exists but the WebView blocked script access to
 * it". This module is the second fallback: real hardware, reached through the
 * two native plugins installed in this project, instead of through the
 * WebView's camera APIs.
 *
 * THE FLAG: `window.SHIN_NATIVE_CAMERA_FALLBACK`, set from
 * native/config/shin-api.config.json (nativeCameraFallback: true/false) by
 * scripts/sync-web.mjs, the same way SHIN_API_BASE is set. Flip that one
 * value; nothing else changes.
 *
 * THE THREE CALL SITES THIS IS MEANT TO SIT BEHIND (all in app/, not edited
 * here -- see native/README.md "Wiring this into camera.js"):
 *   1. `startCamera(video)` in app/public/js/screens/camera.js (~line 71):
 *      today calls getUserMedia directly. If it fails AND
 *      window.SHIN_NATIVE_CAMERA_FALLBACK is true, the barcode path should
 *      call scanBarcodeNative() below instead of falling through to the
 *      drawn shelf.
 *   2. `eye.setTorch(on)` in app/public/js/eye.js (~line 2692, called from
 *      camera.js ~line 1790): applies a MediaStreamTrack torch constraint.
 *      With no live web MediaStream (native fallback active), there is no
 *      track to constrain; setTorchNative() below does the same thing through
 *      the native camera plugin.
 *   3. `eye.capture()` in app/public/js/eye.js (called from camera.js
 *      ~line 2076): grabs a still frame from the live video element for the
 *      photo-identify path. With no live video element, capturePhotoNative()
 *      below returns an equivalent image (a data URL) through the native
 *      camera plugin.
 *
 * None of app/ is edited by this file or by anything in native/. Wiring these
 * three functions into the three call sites above is a small future change
 * in app/, reported to the boss rather than made here (native's file
 * ownership stops at native/).
 */

import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/** True only when native fallback is turned on AND we are actually running
 *  inside the Capacitor native shell (never inside a plain mobile browser,
 *  where the web camera path is correct and should never be bypassed). */
export function nativeFallbackAvailable() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.SHIN_NATIVE_CAMERA_FALLBACK === true &&
      window.Capacitor?.isNativePlatform?.()
  );
}

/**
 * Barcode path. Returns { value, format } on a decoded barcode, or null on a
 * cancelled scan. Throws if the plugin itself fails (permission denied,
 * module not installed on device) -- the caller decides what "no barcode
 * path at all" looks like, same as a rejected getUserMedia does today.
 */
export async function scanBarcodeNative() {
  const { available } = await BarcodeScanner.isSupported();
  if (!available) throw new Error('barcode scanning not supported on this device');

  const granted = await ensureBarcodePermission();
  if (!granted) throw new Error('camera permission denied');

  const { barcodes } = await BarcodeScanner.scan();
  const first = barcodes?.[0];
  return first ? { value: first.rawValue, format: first.format } : null;
}

async function ensureBarcodePermission() {
  const { camera } = await BarcodeScanner.checkPermissions();
  if (camera === 'granted' || camera === 'limited') return true;
  const req = await BarcodeScanner.requestPermissions();
  return req.camera === 'granted' || req.camera === 'limited';
}

/**
 * Photo path. Returns a data URL, matching the shape camera.js already
 * expects from a canvas-captured frame (see `thumbFromCrop` / `captureThumb`
 * in app/public/js/screens/camera.js, which also hand back data URLs).
 */
export async function capturePhotoNative() {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    quality: 85,
    saveToGallery: false,
  });
  return photo.dataUrl;
}

/**
 * Torch path. The barcode plugin (ML Kit) owns the camera hardware while a
 * native scan is running, so torch goes through it, not through
 * @capacitor/camera (which has no torch control). Returns whether it worked,
 * same contract as camera.js's own setTorch(on) -> worked boolean.
 */
export async function setTorchNative(on) {
  try {
    if (on) await BarcodeScanner.enableTorch();
    else await BarcodeScanner.disableTorch();
    return true;
  } catch {
    return false;
  }
}
