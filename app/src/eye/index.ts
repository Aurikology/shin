/**
 * The eye: everything between pointing a phone at a thing and knowing what it is.
 *
 * One entry point, bundled to `public/js/eye.js`, imported by the hand-written
 * screens as an ordinary module. Nothing in here knows about prices, verdicts or
 * screens; it produces a barcode or a crop and stops.
 */

export { BarcodeScanner, RETAIL_FORMATS, type Reading, type StableRead } from './barcode.ts';
export {
  ObjectDetector,
  salientBox,
  mergeDetections,
  centreFallback,
  type Detection,
  type Box,
} from './detector.ts';
export {
  burst,
  cropTo,
  releaseAllBut,
  sharpnessOf,
  StabilityGate,
  type CropResult,
  type ScoredFrame,
} from './capture.ts';
export { Camera, type CameraEvents, type CameraOptions, type CodeMark } from './camera.ts';
export {
  Coach,
  chooseCoach,
  glareIn,
  zoomFor,
  MIN_CROP_PX,
  GLARE_FRACTION,
  type CoachKey,
  type FrameSignals,
} from './framing.ts';
export {
  enqueue,
  pending,
  resolve as resolveQueued,
  drain,
  autoDrain,
  type PendingCapture,
} from './queue.ts';
