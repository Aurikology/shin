# Ten scanners read, and what they do that we do not

This is an inspiration list for our barcode scanner, built by reading the source of ten scanner apps. Everything they do that we do not is written down, including methods that conflict with our own rules, because the point is the idea, not the fit.

| Repo | Stack | What it scans | How deep it was read |
|---|---|---|---|
| food-scanner-gemini | Dart/Flutter + GetX, `mobile_scanner`, `flutter_gemini`, Firebase (Firestore/Auth) | Barcodes via mobile_scanner, looked up against Open Food Facts; a separate on-demand Gemini text call adds a pros/cons blurb | Full: scan flow, all mechanisms, numbers, dead/aspirational code |
| sugar-no-scanner-demo | TypeScript/Next.js 16 + React 19, native `BarcodeDetector`, `@google/genai`, Supabase, Stripe | Barcodes (native detector) and full shelf photos (multi-product vision, up to 10 SKUs per frame) | Full: scan flow, all mechanisms, numbers, dead/aspirational code (largest file read, 439 lines) |
| nutrigo | TypeScript/Next.js frontend + Express backend, `tesseract.js`, `@google/generative-ai`, Supabase | A single captured/uploaded photo, run through an OCR-then-lookup-then-vision fallback ladder | Full: scan flow, mechanisms, numbers, dead/aspirational code |
| WhiteChristmas | Unity/C# + native Android for Meta Quest, MLKit + ZXing, Firebase Genkit + Python FastAPI Gemini backend | QR codes and real-world objects (shoes) via AR headset display-mirroring capture | Full: scan flow, mechanisms, numbers, dead/aspirational code |
| Scanly | Kotlin/Compose Android, CameraX, ML Kit + ZXing-cpp + local PaddleOCR/ONNX, multi-provider AI (Gemini/Claude/Mistral/OpenAI-compatible) | Barcodes, QR payloads, documents, and freeform text via a local OCR pipeline or an AI "photocopier" transcription | Full: scan flow, mechanisms, numbers, dead/aspirational code (largest mechanism count, 52 new) |
| Mivro | Flutter mobile app + Chrome extension + Flask/Python backend | Barcodes (mobile app, wired to a hardcoded demo, never reaches the backend) and retailer product-page names (browser extension, no barcode) | Full: scan flow, mechanisms, numbers, dead/aspirational code |
| ai-calorie-counter | Flutter client + Firebase Cloud Function (Node), `mobile_scanner`, Gemini 2.5 Flash | Barcodes (direct Open Food Facts lookup, no AI) and food photos (Gemini vision call via Cloud Function) | Full: scan flow, mechanisms, numbers, dead/aspirational code |
| Scan-It | TypeScript/React (Vite) + Express/Mongoose backend, no barcode library | Uploaded photos only (ingredient label or packaging/barcode), identified and judged by Gemini in one call | Full: scan flow, mechanisms, numbers, dead/aspirational code |
| ha-wine-cellar | Python Home Assistant integration + TypeScript/Lit frontend, native `BarcodeDetector` | Wine barcodes and wine label photos, cross-checked against Vivino | Full: scan flow, mechanisms, numbers, dead/aspirational code |
| qr-quiz | TypeScript/React + PartyKit (Cloudflare Workers), `qr-scanner`, Gemini REST | QR codes read either as keystrokes from a hardware HID scanner wedge or via a phone camera relayed over websocket | Full: scan flow, mechanisms, numbers, dead/aspirational code |

## What we do today

From `_ours.md` (the shin scanner, our baseline):

- Camera: `getUserMedia` environment-facing, 1920x1080 ideal, no focus constraint.
- Hardware zoom control (`zoomFor()`) targets 55% frame fill, deadbanded, 1200ms cooldown.
- Torch: auto mode (luminance threshold 52/255) or off, with glare-triggered shutoff for the session.
- Frame throttling: barcode decode every animation frame; object/coach checks at most every 180ms; frame downscaled to 960px.
- Barcode decode: `zxing-wasm`, not native `BarcodeDetector` (missing in WebKit/iOS Safari).
- 19 explicit barcode symbologies (no ROI crop, decodes the full downscaled frame).
- Decode wedge detection: 1500ms per-decode ceiling, 3 consecutive strikes marks the reader wedged.
- GS1 GTIN extraction from DataBar AI(01) wrapper.
- Multi-frame barcode voting: sliding window (1500ms/min 5 frames), strict majority to confirm, nothing auto-emitted.
- Barcode read requires a manual button press; resets the vote after each read.
- Object/product framing: MediaPipe COCO detector + hand-written Sobel saliency pass, merged.
- Detection merge by IOU>0.4, capped at 3 boxes, centered-square fallback if nothing found.
- Tap-to-pick object selection, geometry-pinned, survives 1600ms of detector loss.
- Burst capture: 7 frames 45ms apart, sharpest kept by Laplacian variance.
- Auto-capture stability gate: box held 500ms, drift <6%, sharpness at/above window median; suppressed with 2+ objects.
- Photo crop: box + 8% padding, max long edge 1568px, lossless PNG.
- Framing coach: debounced guidance messages (hold-still, glare, closer, pick, dark).
- Continuous background shelf-photo capture for storage only, gated on consent/idle/luminance-change.
- Offline capture queue (IndexedDB) for the photo path only; barcode/text path has no offline queue.
- Two endpoints share one scan function: `/api/identify` (barcode/text) and `/api/identify/photo` (base64 image, 3MB cap).
- Client: single fetch attempt, no retry; four named outcomes (product/candidates/failure code/offline).
- Rate limiting: 30/10min per device (photo route), plus invite-code and IP limiters before any paid call.
- Two Gemini models split ~50/50 by hashed device id.
- Prompts built from external template files with placeholder substitution; JSON shape spelled out in-prompt on 2.5 (no schema+search together).
- Google Search grounding unconditionally on for every scan.
- Only `thinking_level` and `media_resolution` configured; no temperature/topP/topK anywhere.
- Real JSON schema sent only on Gemini 3.x models.
- 30-second call timeout via `AbortController`.
- One HTTP attempt, no retry, on the live scan path (a second grounded call was deliberately removed 2026-09-15).
- Soft/hard CAD spend caps (soft marks `overCap` but serves; hard refuses with `spend_cap_reached`).
- Two cost mechanisms: a list-price estimate and a real token/usage-based calculator.
- Grounded results retained unshown for 60 minutes, 2 years max, ownership re-checked server-side.
- Scan rows updated after the fact with `verdict_zone` (Gemini's own placement) and `over_cap`.
- Photo storage requires three conditions including an exact boolean `true` consent flag.
- Telemetry: client-queued, localStorage-bounded (2000 events), flushed in batches of 150 via `fetch keepalive`.

**Written but unwired:** an older retry-with-backoff implementation (`identify/src/model.ts`) is not reachable from current server routes; a multi-pass extract/tag/"pick" escalation pipeline with a six-signal confidence scorer, Anthropic/xAI providers, and a `DAILY_CALL_CAP` (`identify/src/identify.ts`, `model.ts`, `confidence.ts`) is not imported by `server.ts`.

## Camera acquisition and control

### Permission denial path - sugar-no-scanner-demo
`NotAllowedError` and `SecurityError` set a denied state, fire a `permission_denied` event, and show a panel with "Enable camera" (re-invoking start) plus a "Show demo" escape; any other camera error shows "Try again" instead and fires no permission event.
Source: src/components/scanner-app.tsx:1032, 1743
Ours: nothing like it documented (our own torch/glare/dark states are handled by the framing coach, but a dedicated permission-denied UI path with its own telemetry event is not described in `_ours.md`).
Fit: always answering, unsurprising - distinguishing a permission denial (with a clear recovery action and a demo escape) from a generic camera error is a concrete, testable UX improvement.

### Default camera configuration (no explicit tuning) - food-scanner-gemini
`MobileScanner` is constructed with only `onDetect`, `overlay`, and `scanWindow`; no controller, facing, detection speed, torch, format allow-list, or resolution is passed, so the plugin's own defaults govern autofocus, resolution and frame rate.
Source: lib/pages/barcode_page.dart:25-30
Ours: explicit `getUserMedia` request (1920x1080), explicit hardware zoom and torch control (camera.ts:205-212, 333-366, 558-608).
Fit: none of our objectives served by relying on defaults; noted for contrast only.

### No explicit permission-request UI - food-scanner-gemini
No in-app camera-permission pre-prompt, rationale dialog, or fallback screen exists; the app relies entirely on the plugin's own runtime permission handling, and neither the Android manifest nor the iOS Info.plist declares an explicit camera usage string in this checkout.
Source: android/app/src/main/AndroidManifest.xml; ios/Runner/Info.plist
Ours: nothing like it documented in `_ours.md`.
Fit: none directly; a documented permission flow would serve "unsurprising."

### getUserMedia constraint set - sugar-no-scanner-demo
Already ours: matches our own `getUserMedia` request for the environment-facing camera at 1920x1080; they additionally request `frameRate:{ideal:30,max:30}` explicitly.
Source: src/components/scanner-app.tsx:983

### Continuous autofocus opt in - sugar-no-scanner-demo
After playback starts, it reads `videoTrack.getCapabilities()` and only calls `applyConstraints({advanced:[{focusMode:"continuous"}]})` if `"continuous"` is listed, wrapped in try/catch as best effort.
Source: src/components/scanner-app.tsx:1004
Ours: no focus constraint is requested anywhere (camera.ts:205-212).
Fit: accurate, cheap - a capability-gated best-effort call, no cost.

### Video element readiness poll - sugar-no-scanner-demo
After the stream resolves, the code waits for the `<video>` ref to mount by looping up to 10 times, each iteration awaiting one `requestAnimationFrame` tick, and throws if the ref is still null.
Source: src/components/scanner-app.tsx:997
Ours: nothing like it.
Fit: unsurprising - removes a class of "video never starts" failure.

### Camera constraint request - nutrigo
Already ours: requests only `facingMode:"environment"`, a subset of our own environment-facing request.
Source: app/dashboard/scanner/page.tsx:169

### Runtime screen-capture permission flow - WhiteChristmas
A dedicated transparent Activity requests the OS `MediaProjectionManager.createScreenCaptureIntent()` consent dialog and immediately finishes, forwarding the result code/intent back to the singleton capture manager.
Source: Assets/DisplayCapture/DisplayCaptureRequestActivity.java:16-33
Ours: nothing like it (not applicable to a browser camera, but the pattern of a dedicated one-shot permission activity is portable to native wrapper work).
Fit: none of our objectives directly; XR-specific.

### getUserMedia error classification by err.name + secure-context precheck - ha-wine-cellar
Checks `window.isSecureContext` and `navigator.mediaDevices` existence before calling `getUserMedia` (a plain `http://` origin makes the API not exist at all, otherwise reading as a mysterious `TypeError`), then classifies failures by `err.name` (`NotAllowedError`, `NotFoundError`, `OverconstrainedError`, `NotReadableError`, `AbortError`) rather than substring-matching `err.message`, because Safari's message text does not match other browsers' substrings.
Source: frontend-src/src/utils/camera.ts:1-45
Ours: nothing like it documented.
Fit: calibration, unsurprising - a wrong or generic camera-error message is exactly the kind of confidently-wrong output the priority order forbids.

## Frame selection and image quality gating

### Scan-window cropping - food-scanner-gemini
`MobileScanner` is given a `scanWindow` rect covering 80% of screen width and 45% of screen width in height, centered but shifted up 48px; only barcodes inside that rect are expected to be reported.
Source: lib/pages/barcode_page.dart:12-16
Ours: no manual ROI/crop before decode; the decoder reads the full downscaled frame (barcode.ts `read()`).
Fit: instant, accurate - a smaller decode region can be cheaper per frame, but conflicts with nothing in our rules; worth testing against our full-frame approach.

### Decorative overlay widget, unused - food-scanner-gemini
A `BarcodeScannerOverlay` draws a static white-bordered 16:9 box that is purely visual and geometrically decoupled from the actual `scanWindow` used for detection, so the visual guide does not represent the real detection region.
Source: lib/pages/barcode_page.dart:38-62
Ours: nothing like it (no overlay guide separate from the framing coach's real detection state).
Fit: breaks "unsurprising" - a guide that lies about the detection region is a hazard to avoid, not copy.

### Two stage timer loop instead of requestAnimationFrame - sugar-no-scanner-demo
Capture is driven by `setTimeout(captureStableFrame, 340)` then `setInterval(captureStableFrame, 240)`, roughly 4 evaluations per second, rather than a per-frame rAF loop.
Source: src/components/scanner-app.tsx:1030
Ours: barcode decode runs every animation-frame tick; detection/coach checks run at most every 180ms (camera.ts:113, 368-383).
Fit: cheap - a fixed-interval timer is simpler than rAF-gating logic, at the cost of a slightly less adaptive cadence.

### Tiny sampling canvas with willReadFrequently - sugar-no-scanner-demo
Motion and blur scoring run on a 96x72 canvas created with `{willReadFrequently:true}`, so the repeated `getImageData` every 240ms is browser-optimized and never touches the full-resolution frame.
Source: src/components/scanner-app.tsx:841
Ours: our Sobel saliency pass runs at a 192px working width (detector.ts:55-175), larger than 96x72.
Fit: instant, cheap - a smaller sampling canvas with the read-optimization flag is a direct performance lever.

### Luminance edge score as a blur gate - sugar-no-scanner-demo
`luminanceEdgeScore` walks every second pixel in both axes, computes `0.299R+0.587G+0.114B`, sums horizontal/vertical neighbour differences, and returns the mean; frames scoring below 4.1 are rejected as too blurry.
Source: src/lib/frame-quality.ts:1, src/components/scanner-app.tsx:901
Ours: sharpness is scored by variance of the Laplacian on a downscaled greyscale copy, applied to burst-captured frames, not a rejection gate on the live feed (capture.ts:41-72).
Fit: accurate - a cheap live-feed blur gate ahead of capture, distinct from our post-capture sharpness ranking.

### Motion gate by strided pixel diff - sugar-no-scanner-demo
Current and previous 96x72 RGBA buffers are compared at a stride of 16 bytes; mean absolute difference >=13 (0-255 scale) rejects the frame and resets the stability counter.
Source: src/components/scanner-app.tsx:914
Ours: nothing like it (our stability gate tracks box drift and hold time, not a raw pixel-diff motion score, capture.ts:189-231).
Fit: instant, cheap - a strided diff is far cheaper than full-frame comparison.

### Forced capture escape hatch - sugar-no-scanner-demo
If the app has waited 1250ms for a stable frame, `forceCapture` bypasses both the edge-score and motion gates so a shaky or dim scene still produces a scan rather than hanging.
Source: src/components/scanner-app.tsx:899
Ours: nothing like it; our auto-capture gate has no forced-timeout escape (capture.ts:189-231).
Fit: always answering - directly serves the "always answering" objective by refusing to let a quality gate hang the scan forever.

### Minimum capture interval - sugar-no-scanner-demo
Even when every quality gate passes, a capture is discarded unless 1000ms has elapsed since the last one, capping the camera path at one Gemini call per second before any server rate limit applies.
Source: src/components/scanner-app.tsx:927
Ours: no fixed minimum interval between auto-captures; gated instead by the stability hold (capture.ts:189-231).
Fit: cost control - a client-side floor on call frequency independent of the server limiter.

### Edge density candidate proposal grid - sugar-no-scanner-demo
`proposeCameraCandidates` divides the luma frame into a 6x5 grid, scores each cell by mean neighbour edge difference, keeps cells at or above `max(13, 68th percentile)`, takes the top 6, and pads each box outward 1.2-3%.
Source: src/lib/live-camera-tracking.ts:96
Ours: our saliency pass finds the single largest coherent high-detail region, not a multi-cell candidate grid (detector.ts:55-175).
Fit: accurate - a cheap non-ML way to propose multiple candidate regions on a shelf, complementary to a single-object picker.

### Single fixed-frame capture (no live decode loop) - nutrigo
There is no continuous frame-sampling or live barcode-decode loop; capture happens once, on a user tap, by drawing one video frame to a 640x480 canvas.
Source: app/dashboard/scanner/page.tsx:178-217
Ours: barcode decode runs on every animation-frame tick continuously (camera.ts:113).
Fit: none - strictly worse for "instant"; noted for contrast.

### JPEG export via canvas.toBlob - nutrigo
The captured frame is serialized with `canvas.toBlob(callback,"image/jpeg")` with no explicit quality parameter (browser default, ~0.92) and no resizing/downscaling before upload.
Source: app/dashboard/scanner/page.tsx:184-216
Ours: crop is downscaled only if needed to a max long edge of 1568px and encoded as lossless PNG specifically to avoid compression artifacts on small text (capture.ts:142-180).
Fit: none - an unresized, uncontrolled-quality JPEG is worse for both cost and accuracy than our approach; noted for contrast.

### MLKit object detector configuration - WhiteChristmas
`ObjectDetectorOptions.Builder().setDetectorMode(STREAM_MODE).enableMultipleObjects().enableClassification().build()` runs MLKit in streaming (not single-image) mode with multi-object and on-device classification labels.
Source: Assets/DisplayCapture/ObjectDetection/CustomObjectDetector.java:97-104
Ours: MediaPipe `ObjectDetector` over 80 COCO classes at score threshold 0.35, GPU delegate (detector.ts:1-27).
Fit: nothing new - same class of tool, different SDK; no change to our objectives.

### ROI crop before the Gemini shoe-detect call - WhiteChristmas
The MLKit bounding box (Y-flipped) is used to crop only that sub-rectangle into a new texture before JPEG-encoding at quality 75; only the cropped region is ever sent to the AI call, not the full frame.
Source: Assets/Utilities/ImageUtils.cs:7-31; Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:266-284
Ours: no manual ROI/crop selection before decode or before the AI call; our photo crop uses the detected/picked box plus 8% padding, which is a form of ROI crop for the photo path specifically (capture.ts:142-180), but nothing crops before the AI call independent of that.
Fit: cheap, accurate - sending a tighter crop to the model can cut tokens and reduce background confusion; worth testing against our full-crop-with-padding approach.

### Picker-level downscale and compress - ai-calorie-counter
Resizing/compression is delegated entirely to the `image_picker` plugin call (`maxWidth:1920, maxHeight:1920, imageQuality:85`) rather than any manual canvas step.
Source: lib/screens/analysis_screen.dart:93
Ours: our own crop/downscale pipeline explicitly targets a max long edge of 1568px and encodes lossless PNG (capture.ts:142-180).
Fit: cheap - delegating resize to the OS picker is less code, at the cost of losing control over quality/format (they accept lossy JPEG at 85).

## Decode engines and symbologies

### Native BarcodeDetector probe with three state memo - sugar-no-scanner-demo
`barcodeDetectorRef` starts `undefined` (not yet probed), becomes a constructed detector if `window.BarcodeDetector` exists, and `null` if missing or if `detect()` throws; the probe happens once per session and never repeats.
Source: src/components/scanner-app.tsx:783
Ours: we explicitly avoid the native `BarcodeDetector` entirely and use `zxing-wasm` because the native API does not exist in WebKit/iOS Safari and fails silently there (barcode.ts:1-24).
Fit: none - this is exactly the gap our own choice is designed around; kept for contrast, not adoption.

### Requested barcode symbologies - sugar-no-scanner-demo
The native detector is constructed with only `{formats:["ean_13","ean_8","upc_a","upc_e"]}`; QR, Code 128 and DataMatrix are deliberately not requested.
Source: src/components/scanner-app.tsx:786
Ours: 19 explicit symbologies including DataBar variants, QRCode, DataMatrix (barcode.ts:55-75).
Fit: none - narrower than ours; noted for contrast.

### Barcode value sanitizing - sugar-no-scanner-demo
Each `rawValue` is stripped to digits with `replace(/\D/g,"")` and only accepted if it matches `/^\d{8,14}$/`, filtering the detector's own partial or non-numeric reads.
Source: src/components/scanner-app.tsx:794
Ours: nothing explicit like it documented; GS1 extraction strips the AI wrapper but general digit sanitizing is not called out (barcode.ts:94-99).
Fit: accurate - a cheap regex guard against a detector's own garbage reads.

### GTIN check digit validation server side - sugar-no-scanner-demo
`validWebGtin` requires 8, 12, 13 or 14 digits, rejects all-zero strings, recomputes the mod-10 check digit with alternating 3/1 weights, and returns the value zero-padded to 14, rejecting a misread barcode before any lookup.
Source: src/server/web-product-evidence.ts:42
Ours: nothing like it; our GS1 extraction pulls the GTIN from application identifier (01) but does not checksum-validate it (barcode.ts:94-99).
Fit: accurate - a real checksum catches misreads our pipeline currently would not.

### No UA sniffing anywhere on the scan path - sugar-no-scanner-demo
The native-vs-AI decision is made purely by feature probe; there is no `navigator.userAgent` check anywhere in the scanner component.
Source: src/components/scanner-app.tsx:1033
Ours: already ours in spirit - we also choose `zxing-wasm` unconditionally rather than branching on UA, though for the opposite reason (avoiding the native API altogether rather than probing it).
Fit: n/a - not a distinct mechanism to add.

### Barcode decode on a spawned Thread - WhiteChristmas
Each accepted frame for barcode reading spawns a brand-new `Thread` (not a shared pool) that builds a `Bitmap`, extracts pixels, and decodes with ZXing's `QRCodeReader` via `RGBLuminanceSource` -> `HybridBinarizer` -> `BinaryBitmap`.
Source: Assets/DisplayCapture/Barcode/BarcodeReader.java:137-171
Ours: `zxing-wasm` runs per-frame in the browser's own event loop, not on a spawned OS thread.
Fit: none - a native-thread pattern, not applicable to our browser runtime.

### Barcode format is QR-only via ZXing, not MLKit - WhiteChristmas
Despite `barcode-scanning:17.3.0` being a declared gradle dependency, all MLKit barcode imports are commented out; the live path only decodes QR through ZXing's `QRCodeReader`.
Source: Assets/DisplayCapture/Barcode/BarcodeReader.java:9-13, 96-101, 173-208
Ours: 19 symbologies via zxing-wasm, not QR-only.
Fit: none - narrower than ours; noted for contrast.

### Runtime-switchable barcode decoder with max-capability ZXing config - Scanly
A settings key swaps the entire barcode backend between ML Kit and ZXing-cpp at runtime; the ZXing reader is configured for exhaustive decoding with `tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`, `tryDenoise` all true, `textMode=HRI`, and an empty `formats` set meaning every supported format.
Source: core/barcode/BarcodeAnalyzer.kt:22-56, core/barcode/ZxingBarcodeDecoder.kt:8-22
Ours: zxing-wasm is run with `tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale` on and an explicit 19-symbology list, not an empty/all-formats set, and there is no user-facing switch between decode engines (barcode.ts:1-24, 55-75).
Fit: accurate - `tryDenoise` and a genuinely open format set are two knobs we do not currently set; worth testing.

### Manual re-implementation of ML Kit's structured barcode grammar - Scanly
Because ZXing-cpp returns only raw text, `BarcodeContentParser` hand-parses `WIFI:`, `MATMSG:`, `mailto:`, `tel:`, `smsto:`/`sms:`, `BEGIN:VCARD`, `MECARD:`, `geo:`, and `BEGIN:VEVENT` payloads, including a backslash-escaped `K:V;K:V;;` field splitter, so both decoder backends produce identical downstream actions.
Source: core/barcode/BarcodeContentParser.kt:1-234
Ours: nothing like it (our barcode path is product identity only, not a structured-payload grammar).
Fit: none of our objectives - out of scope for a product scanner, kept because the rules say nothing is dropped.

### Barcode read embedded inside the vision-recognition schema - ha-wine-cellar
The label-recognition JSON schema itself has a `barcode` field asking the model to read printed digits next to the barcode symbol in the photo (not decode the symbol), validated post-hoc as 8-14 digits.
Source: custom_components/wine_cellar/gemini.py:172, 180, 357-360
Ours: nothing like it; our barcode and photo paths are fully separate, and the photo path never asks Gemini to also read a barcode's printed digits.
Fit: always answering - a fallback way to recover a barcode from a photo when the symbol itself does not decode, at zero extra AI calls since it rides the existing vision call.

### OCR-then-regex barcode extraction - nutrigo
`Tesseract.recognize(buffer, "eng")` runs full-page English OCR on the raw uploaded image buffer with no preprocessing, cropping, thresholding, or upscaling, then the extracted text is matched against a single regex `/\b\d{8,13}\b/` to guess a barcode-shaped number.
Source: backend/src/controllers/scan.controller.ts:87-90
Ours: nothing like it (we decode the barcode symbol itself via zxing-wasm; we never OCR a photo to guess a barcode number by digit-count regex).
Fit: accurate - a regex on OCR text has no checksum and no symbology to anchor against, so it can match an unrelated 8-13 digit number printed anywhere on the label; a bare fallback of last resort at best.

## Multi-frame stability, tracking and dedup

### Single-frame, first-match decode - food-scanner-gemini
`onDetect` reads the whole `BarcodeCapture.barcodes` list but only ever uses `.first`; there is no scoring, no requirement that multiple frames agree, and no handling of multiple simultaneous barcodes in frame.
Source: lib/controllers/barcode_controller.dart:18-24
Ours: `BarcodeVote` keeps a sliding window and only confirms a value once it holds a strict majority of frames (votes.ts:74-80, 104-175).
Fit: none - strictly less accurate than our vote; kept for contrast.

### Value-equality debounce - food-scanner-gemini
The only de-dup mechanism is `if (barcode.value == value) return;` inside `setBarcode`, suppressing repeat navigation only when the new decode is byte-identical to the last stored value; a single differing misread passes straight through.
Source: lib/controllers/barcode_controller.dart:10-13
Ours: our vote requires a strict majority across a time window rather than exact repeat-suppression (votes.ts:104-175).
Fit: none - weaker than our approach; kept for contrast.

### Immediate navigate-away-from-scanner - food-scanner-gemini
On the first accepted barcode, the app replaces the scanner route, tearing down the camera session after exactly one accepted decode, so there is no continuous/multi-scan session.
Source: lib/controllers/barcode_controller.dart:15
Ours: the camera session stays open; a confirmed value requires a manual button press and the vote resets so the same code cannot re-trigger without re-earning a fresh majority (camera.ts:275-291).
Fit: none - a one-shot session is simpler but removes the option to correct or re-scan; kept for contrast.

### Frame to frame translation tracking - sugar-no-scanner-demo
`estimateFrameTranslation` brute-forces a block search over dx/dy in steps of 2 across +/-8px, sampling every third row/column, returning the best mean absolute difference plus `confidence=1-difference/42`.
Source: src/lib/live-camera-tracking.ts:31
Ours: nothing like it; our stability gate tracks box drift as a percentage of frame width, not a pixel-level translation estimate (capture.ts:189-231).
Fit: instant - lets the app track the whole scene moving (not just one box), useful for a multi-product shelf view.

### Same scene test and box drift correction - sugar-no-scanner-demo
A translation is accepted only when `difference<=25` and `confidence>=0.38`; when accepted, `translateDetection` slides existing overlay boxes by the measured dx/dy so boxes track the shelf between recognitions instead of being re-requested.
Source: src/lib/live-camera-tracking.ts:92, 78
Ours: nothing like it.
Fit: instant, cheap - avoids a re-recognition call purely to keep overlay boxes visually attached to a moving shelf.

### Two strike scene change debounce - sugar-no-scanner-demo
A single failed scene match is tolerated; the mismatch counter must reach 2 before the app declares a scene change, clears the tray, and restarts recognition, preventing one blurred tick from wiping results.
Source: src/components/scanner-app.tsx:869
Ours: nothing like it in this exact shape; our wedge-strike counter (3 consecutive decode timeouts) is a related but different debounce for barcode decode failures, not scene continuity (barcode.ts:44-53).
Fit: unsurprising - protects a multi-product result tray from flicker on one bad frame.

### Stale result discard after scene change - sugar-no-scanner-demo
When a recognition response arrives, the frame it was computed from is re-compared with the live frame; if the scene no longer matches, the whole response is thrown away and the next capture is delayed 250ms.
Source: src/components/scanner-app.tsx:641
Ours: nothing like it.
Fit: accurate - prevents showing a result for a product the user has already moved the camera away from.

### Detection dedupe key ladder - sugar-no-scanner-demo
`productDetectionKey` keys on `catalog:<id>` first, then `retailer:<slug>`, then `resolved:<productId>`, and only falls back to a normalized identity key built from brand+name+variant+pack tokens with generic words stripped.
Source: src/lib/product-detection-dedupe.ts:31
Ours: nothing like it (we scan one product at a time, not a multi-product tray needing key-based dedup).
Fit: accurate - directly relevant if we ever move to multi-product shelf scanning.

### Multilingual same SKU merge - sugar-no-scanner-demo
`samePhysicalMultilingualSku` merges two detections when boxes overlap >=65% of the smaller box, brands normalize identical, and pack sizes canonicalize to the same value, collapsing the Latvian and Russian faces of one package.
Source: src/lib/product-detection-dedupe.ts:85
Ours: nothing like it.
Fit: accurate - relevant for bilingual-label markets; low priority for a single-product scanner.

### Merge prefers resolution strength then confidence - sugar-no-scanner-demo
`mergeDetections` ranks candidates 3 for an inline/catalog product, 2 for any non-visual match, 1 otherwise, breaking ties by confidence only; the merged box is the union or the containing box.
Source: src/lib/product-detection-dedupe.ts:95
Ours: nothing like it (our merge is IOU>0.4 with the class-labelled box winning, not a resolution-strength rank, detector.ts:267-304).
Fit: accurate - a resolution-strength-first rank is a different tie-break philosophy worth comparing against our IOU merge.

### Upload result merge with generic duplicate suppression - sugar-no-scanner-demo
`mergeUploadScanResults` remaps crop boxes to full-frame coordinates, dedupes, drops a non-source-backed detection when a source-backed one with a related identity overlaps it by >=50% of the smaller box, sorts source-backed first then by confidence, slices to 10, re-sorts top-to-bottom.
Source: src/lib/upload-scan.ts:76
Ours: nothing like it (we do not fan an upload into multiple crops).
Fit: accurate - relevant only if we adopt the multi-crop upload fan-out below.

### No cross-frame voting/dedup on the scan path - nutrigo
There is no continuous frame-sampling, debounce timer, or majority-vote logic anywhere in the camera/OCR/lookup code; a single capture produces at most one OCR pass and one set of lookups.
Source: app/dashboard/scanner/page.tsx (whole capture flow), backend/src/controllers/scan.controller.ts:79-125
Ours: `BarcodeVote` sliding-window majority vote (votes.ts:74-80, 104-175).
Fit: none - our own approach is strictly ahead here; kept for contrast.

### Busy-flag frame dropping (both detectors) - WhiteChristmas
Both the barcode reader and the object detector track a boolean; if a previous inference on that detector hasn't finished, the new frame is dropped entirely rather than queued.
Source: Assets/DisplayCapture/Barcode/BarcodeReader.java:131-135; Assets/DisplayCapture/ObjectDetection/CustomObjectDetector.java:129-134
Ours: nothing explicit like it; our decode wedge/timeout logic races a 1500ms ceiling per decode rather than a busy-flag frame-drop (barcode.ts:44-53, 180-252).
Fit: instant, cheap - a plain busy flag is a simpler guard against overlapping inference than a per-decode race with a ceiling.

### MLKit tracking id passthrough with sentinel - WhiteChristmas
Each `DetectedObject`'s built-in `trackingId` is serialized directly; a null id (no track yet) is coerced to `-1`.
Source: Assets/DisplayCapture/ObjectDetection/CustomObjectDetector.java:56-66
Ours: our tap-to-pick reassociates a pinned object by geometry (IOU>0.3) each tick rather than trusting a detector-provided tracking id (camera.ts:134-136, 254-264).
Fit: none directly - MediaPipe's `ObjectDetector` in our stack does not expose a persistent tracking id the way MLKit's streaming mode does.

### Capture-timestamp-based pose lookup (latency compensation) - WhiteChristmas
Every detection result carries the frame's native capture timestamp; downstream, the historical head pose matching that exact capture time (not the current pose) is fetched before reprojecting.
Source: Assets/DisplayCapture/DisplayCaptureManager.java:133; Assets/DisplayCapture/Barcode/BarcodeTracker.cs:65-68; Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:212-215
Ours: nothing like it (no world-space reprojection in a 2D web camera scanner).
Fit: none - XR-specific latency compensation, not applicable to our stack.

### Fixed-FOV pinhole unprojection + depth snap - WhiteChristmas
A hardcoded 82-degree FOV projection is inverted to unproject a detection's UV into camera space, then re-sampled onto the real environment depth mesh via a GPU compute shader rather than trusted as-is.
Source: Assets/DisplayCapture/Barcode/BarcodeTracker.cs:12-14, 45-48, 103-109; Assets/DepthKit/DepthToWorld.cs:29-93
Ours: nothing like it; not applicable outside AR.
Fit: none.

### Corner-derived plane pose for barcodes - WhiteChristmas
Barcode orientation/pose is derived purely from the 4 detected corner points: up/right vectors from corner differences, normal from their cross product, center as the diagonal midpoint.
Source: Assets/DisplayCapture/Barcode/BarcodeTracker.cs:89-95
Ours: nothing like it; not applicable outside AR world placement.
Fit: none.

### Per-tracking-id position history buffer - WhiteChristmas
A `Queue<Vector3>` capped at 30 entries is kept per MLKit tracking id, oldest dequeued once the cap is hit.
Source: Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:17, 60-66
Ours: nothing like it; our object pick has a 1600ms grace period on loss but no positional history buffer (camera.ts:469-486).
Fit: accurate - a bounded position history is a general smoothing technique that could steady our own tap-to-pick box against jitter.

### Median + outlier-filtered smoothing (no Kalman filter) - WhiteChristmas
Stable position is the average of buffered positions within 0.5m of the buffer's coordinate-sum-sorted median; a true Kalman filter was considered but never implemented.
Source: Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:68-90
Ours: nothing like it.
Fit: accurate - a lightweight alternative to a Kalman filter for smoothing a jittery box position.

### Stability gate before any anchor/AI action - WhiteChristmas
An object is "stable" only once at least 15 samples exist and every buffered sample is within 0.1m of the current stable position; only then does the code proceed to anchor creation (and, downstream, the AI call).
Source: Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:92-98, 199-204
Ours: our own stability gate requires a box held 500ms with drift under 6% of frame width before auto-capture fires (capture.ts:189-231) - same idea, different units (time+percent vs sample-count+absolute distance).
Fit: n/a - conceptually already ours; noted for the numeric comparison only.

### Track eviction on timeout - WhiteChristmas
A coroutine wakes every 5 seconds and removes any tracked-object history whose last-seen timestamp is older than that same 5-second window.
Source: Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:21, 132-149
Ours: nothing like it as a standalone sweep; our tap-to-pick grace period (1600ms) is the closest analogue but is per-pick, not a periodic sweep (camera.ts:469-486).
Fit: cheap - a periodic sweep is a simple way to bound memory for any tracked-object history we might add.

### Anchor dedup by proximity - WhiteChristmas
Before creating a new spatial anchor, existing anchors are scanned for one within 0.1m of the new stable position; if found, the existing anchor's mapping is updated instead of spawning a duplicate.
Source: Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:248-257
Ours: nothing like it; not applicable without persistent spatial anchors.
Fit: none directly for our 2D scanner.

### Stale response revision guard - sugar-no-scanner-demo
Every async enrichment result is compared against the current camera-request reference before it is applied, so a response belonging to a superseded scan is dropped instead of repainting the tray.
Source: src/components/scanner-app.tsx:468
Ours: nothing like it explicitly documented for a single-product scan, though our barcode vote reset after a manual read (camera.ts:275-291) serves a related purpose of not letting a stale value linger.
Fit: accurate - discarding a response that no longer matches the current scan request is directly relevant if we ever pipeline more than one in-flight request per session.

## The fallback ladder when a scan fails

### Error surfacing via snackbar + auto pop - food-scanner-gemini
On any lookup exception the app pops back to the previous screen and shows a snackbar that is either the raw API exception message, a hardcoded "Product not found" string, or - for any other exception type - nothing but a `print`, so the user sees no error message for generic failures.
Source: lib/controllers/barcode_info_controller.dart:22-47
Ours: four named outcomes (product, candidates, named failure code, offline) are distinguished explicitly on the client (api.js:473-543).
Fit: none - a silent generic-failure branch breaks "always answering"; kept for contrast.

### Four-step fallback ladder - nutrigo
Sequential ladder inside `lookupByImage`: OCR digit match -> OpenFoodFacts barcode lookup; if no product and OCR text length>2, first 50 chars of OCR text -> OpenFoodFacts text search; if still nothing, full image -> Gemini Vision; each step runs only if the previous produced no product.
Source: backend/src/controllers/scan.controller.ts:92-117
Ours: one shared scan function serves barcode, photo and typed-text with no OCR-first ladder (server.ts:2312-2393).
Fit: always answering - an OCR-then-lookup-then-vision ladder is a genuine idea for recovering a product identity before spending an AI call, though it does not fit "one AI call per scan" if OCR itself fails silently first.

### Gemini text-only fallback (barcode-lookup miss) - nutrigo
When a manually-entered barcode has no OpenFoodFacts match, a separate call to `gemini-1.5-flash` (an older model than the vision path's `gemini-2.5-flash`) runs a one-line prompt asking for JSON nutrition fields from the barcode/text alone.
Source: backend/src/controllers/scan.controller.ts:251-283
Ours: a failed request on the barcode/text path falls back to a local pack lookup (`catalogueLookup()`), never a second AI call (camera.js:3044-3056).
Fit: breaks "one AI call per scan" if added as a second call; already served differently by our local pack fallback.

### GMS document scanner with degoogled-device fallback - Scanly
`DocumentScannerManager` checks `GoogleApiAvailability` before offering Google's full document-scanner intent; devices without Play Services fall back to a CameraX capture plus the app's own manual filters.
Source: core/scan/DocumentScannerManager.kt:1-32
Ours: nothing like it (no document-capture mode).
Fit: none of our current objectives - out of scope for a product barcode scanner.

### Three-tier table rendering fallback - Scanly
Table output prefers SLANet structure, falls back to a geometric grid built from line-box positions when SLANet isn't installed, and falls back further to plain paragraph text if neither applies.
Source: core/ocr/paddle/DocumentStructure.kt:85-212
Ours: nothing like it.
Fit: always answering - the general pattern (degrade gracefully through named tiers rather than failing) is directly relevant even outside OCR.

### Three-layer OCR fallback ladder (engine -> model -> structure) - Scanly
`TextOcrService` falls the whole OCR engine back to ML Kit on any Paddle error ("a broken/missing model must never cost the user their scan"); `PaddleModelStore` substitutes the bundled universal recognizer for any uninstalled script pack; structured-markdown extraction is wrapped so a failure there still leaves the plain-text OCR result intact.
Source: core/ocr/TextOcrService.kt:32-61, core/ocr/paddle/PaddleModelStore.kt:162-169, core/ocr/paddle/PaddleOcrService.kt:284-331
Ours: nothing like it as a layered ladder; our decode wedge detection skips frames after 3 strikes rather than falling back to a different engine (barcode.ts:44-53).
Fit: always answering - three independently-failing layers, each with its own safe fallback, is a strong pattern for never returning nothing.

### Fixed-order, opt-in cross-provider fallback with bundled-key isolation - Scanly
`AI_PROVIDER_FALLBACK` tries providers in a fixed order (`GEMINI -> MISTRAL -> OPENROUTER -> ...`); a user on their own key never falls through to a bundled-key provider, while a user already on a bundled key can fall through to other bundled providers freely; the chain only advances on `Exhausted`, not on `Fatal`.
Source: core/ai/ProviderConfig.kt:152-246, core/ai/GenerativeAiService.kt:96-108
Ours: two Gemini models split by hashed device id, no cross-provider fallback chain (gemini-scan.ts:56-89).
Fit: always answering, cost control - a multi-provider ladder is a bigger structural change than our two-model split, but the key-isolation rule (never spend someone else's paid key on your own overflow) is a clean idea if we ever support user-supplied keys.

### Silent model auto-downgrade for one OCR endpoint - Scanly
If the default OCR model returns an HTTP 4xx other than 429, the call is retried once with a hardcoded fallback model id, only when the model in use is exactly the default constant; a user-overridden model is never auto-swapped.
Source: core/ai/ProviderClient.kt:250-264, 272
Ours: nothing like it; our model selection is fixed per device by hash, with no per-call downgrade on error (gemini-scan.ts:56-89).
Fit: always answering - a narrow, safe auto-downgrade (default model only) that avoids ever silently overriding an explicit user/developer choice.

### Mid-request streaming-to-non-streaming mode fallback - Scanly
If a streaming call returns HTTP 200 with zero SSE data events, the same provider's next retry attempt switches to non-streaming before retrying, rather than treating it as a hard failure.
Source: core/ai/ProviderExecutor.kt:75-78, 111
Ours: we do not stream Gemini responses at all (gemini-scan.ts:846-959).
Fit: none currently applicable - relevant only if we ever adopt streaming responses.

### Fallback model only for overload - sugar-no-scanner-demo
`runRecognitionWithFailover` retries on the fallback model only when the classified reason is `provider_overloaded`; quota, rate-limit and configuration failures return immediately without a second model call, and an unclassified error is rethrown.
Source: src/server/recognition.ts:74
Ours: two Gemini models are split by hashed device id up front, not chosen as an overload fallback; there is no second-model retry on the live scan path (gemini-scan.ts:56-89, 846-959).
Fit: always answering, cost control - reserving the fallback call specifically for overload (not for every failure class) avoids paying twice for a quota or config error that a retry cannot fix.

### Named failure messages per provider reason - sugar-no-scanner-demo
A `provider_unavailable` response maps to distinct copy: `quota_exhausted` -> "Today's scanning limit has been reached", `rate_limited` -> "Scanning is busy", anything else -> "Recognition is temporarily unavailable", each keeping the entry point available.
Source: src/components/scanner-app.tsx:528
Ours: named failure codes exist (`model_timeout`, `spend_cap_reached`, `rate_limited`, `too_large`) but the mapping to user-facing copy per code is not documented in `_ours.md` (api.js:473-543).
Fit: unsurprising, calibration - distinct copy per failure reason, rather than one generic error string, is a small, cheap win.

### AbortError suppression across every fetch - sugar-no-scanner-demo
Each catch block tests `error instanceof DOMException && error.name==="AbortError"` and returns without touching state, so user-driven cancellation never surfaces as an error screen.
Source: src/components/scanner-app.tsx:507, 625, 640, 660, 713
Ours: nothing like it documented.
Fit: unsurprising - a cancelled request should not look like a failure.

## Turning a code into a product identity

### Barcode resolution waterfall - sugar-no-scanner-demo
`resolveBarcodeFromKnownCatalogs` tries the managed catalog by exact/canonical GTIN, then the external retailer catalog, then the Open Food Facts bulk index, then an external catalog identity record, returning a synthetic detection with confidence 1 and a fixed box.
Source: src/server/barcode-resolution.ts:22
Ours: our barcode path sends only the digits to Gemini for identification; there is no local multi-catalog waterfall before the AI call, and the catalogue is not consulted for the answer (server.ts:2312-2393, 910-913).
Fit: cheap, instant - a catalog-first waterfall could resolve many barcodes for free before ever spending an AI call, but conflicts with nothing in our rules since it happens before the one allowed AI call.

### Barcode route lookup ladder and cache header - sugar-no-scanner-demo
`/api/barcode` validates `^\d{8,14}$`, resolves against the local catalog, then the Open Food Facts live API, then the shared web catalog, and returns `cache-control: private, max-age=300` on both hit and miss.
Source: src/app/api/barcode/route.ts:34
Ours: no HTTP cache-control header is documented for our identify endpoints.
Fit: cheap - caching a miss for 5 minutes as well as a hit avoids re-querying the same barcode repeatedly from the same client.

### Local catalog fuzzy match scoring - sugar-no-scanner-demo
`matchCatalogProductWithConfidence` normalizes by NFKD accent stripping and non-alphanumeric collapse, requires substring containment of the brand, scores `matches/queryTokens.size+0.35`, and accepts only a score of 0.9 or more.
Source: src/server/recognition.ts:294
Ours: nothing like it (we have no local product catalog to fuzzy-match against).
Fit: cheap, accurate - relevant only if we build a local catalog; the accent-stripping/brand-containment approach is a reasonable baseline if we do.

### Searchable identity gate before any web call - sugar-no-scanner-demo
`hasSearchableIdentityEvidence` allows an external/web lookup only when a pack size exists, or the barcode matches `^\d{8,14}$`, or at least two identity tokens remain after removing the brand and generic words.
Source: src/server/recognition.ts:350
Ours: nothing like it; grounding is unconditionally on for every scan regardless of how much identity information is present (gemini-scan.ts:17, 396).
Fit: cost control - a pre-check that a query is specific enough to search before paying for a web-grounded call is a direct lever on our own always-on grounding.

### Cross-category barcode overlap with no disambiguation - Scanly
`isEanUpc` (8-13 digits) and `isIsbn` (13-digit 978/979-prefixed, or 10-digit+check) can both be true for one 978-prefixed EAN-13, so a single barcode launches all six lookup engines (food/beauty/pet-food/OpenFDA/GoogleBooks/OpenLibrary) concurrently with no pre-dispatch category decision.
Source: core/lookup/BarcodeMatch.kt:11-21, core/lookup/LookupOrchestrator.kt:26-27
Ours: nothing like it; our scanner has one identity path (Gemini), not category-routed local lookup engines.
Fit: none currently - relevant only if we build category-specific local lookups.

### False-positive-guarded phone-number regex - Scanly
A detected phone-number candidate is accepted only if it starts with `+`/`00`, has 10-15 digits, and additionally contains a separator character or starts with `+` - explicitly to avoid a barcode's own digit run misreading as a phone number.
Source: core/actions/ScanActionDetector.kt:20-22, 78-108
Ours: nothing like it (we do not classify scanned content into action types).
Fit: none for a product scanner; the general principle (guard a loose regex with a structural requirement to avoid barcode false positives) is worth remembering if we ever add OCR-based classification.

### Wi-Fi detection short-circuits all other action detection - Scanly
If the `WIFI:` QR grammar matches, the detector returns immediately with only a `ConnectWifi` action, skipping URL/email/phone regex passes entirely on that text.
Source: core/actions/ScanActionDetector.kt:48-63
Ours: nothing like it.
Fit: none for a product scanner.

### Android-version-branched Wi-Fi join - Scanly
On Android 10+ joining a scanned network uses `WifiNetworkSuggestion`; on pre-Q it just opens Wi-Fi settings with a toast telling the user to connect manually, since programmatic join isn't available pre-Q.
Source: core/actions/ActionExecutor.kt:115-141
Ours: nothing like it.
Fit: none for a product scanner.

### Dialer-prefill instead of direct call - Scanly
`CallPhone` triggers `ACTION_DIAL` (pre-fills the dialer) rather than `ACTION_CALL`, avoiding the `CALL_PHONE` runtime permission entirely.
Source: core/actions/ActionExecutor.kt
Ours: nothing like it.
Fit: none for a product scanner; the general idea (prefer the OS action that needs no extra permission) is portable.

### Extension-side product identity via per-hostname DOM scrape, no barcode involved - Mivro
Switches on `window.location.hostname` and pulls the product title out of a hardcoded CSS selector per retailer (BigBasket, Zepto, Swiggy Instamart, JioMart, Amazon.in, Flipkart, Blinkit), falling back to a literal "not found" string per site, then strips to letters/spaces and lowercases the name as the search key.
Source: browser-extension/content-scripts/content-script.js:5-64, 153-161
Ours: nothing like it (identity always comes from a barcode scan, a photo, or typed text, never a scraped page).
Fit: always answering - a per-hostname DOM scrape is a way to get a product identity with zero camera use at all, relevant only if we ever add a browser-extension or retailer-page input route.

### Vintage-year regex extraction from free-text titles - ha-wine-cellar
Both the UPC Item DB and Open Food Facts paths, which have no structured vintage field, pull a 4-digit `(19|20)\d{2}` year out of the product title/name as a best-effort vintage.
Source: custom_components/wine_cellar/vivino.py:685-688, 747-750
Ours: nothing like it.
Fit: accurate - a cheap regex extraction of a structured fact from an unstructured title, applicable wherever a lookup source lacks a field we want.

### Wine-relevance keyword filter on UPC Item DB - ha-wine-cellar
Since UPC Item DB is a general grocery/retail barcode database, a hit is only accepted if its title contains one of ~16 wine keywords (wine, cabernet, merlot, chardonnay, ..., 750ml, bottle); non-wine hits are discarded.
Source: custom_components/wine_cellar/vivino.py:645-670
Ours: nothing like it (our lookup source is Gemini itself, not a general-purpose barcode database needing a category filter).
Fit: accurate - relevant if we ever add a general external barcode database as a source; a keyword filter is a cheap sanity check against an off-category hit.

### QR code as a UI-command grammar, not a product identity - qr-quiz
Scanned values are never looked up; they either match a hardcoded table of minimal command strings (`c:r`, `c:c`, `c:i`, `c:s`) that call local UI handlers, or are matched directly as an option id/trailing letter - a scanned code's entire "identity" is either a literal command or a currently-displayed answer id.
Source: src/store/uiSignals.ts:4-10, src/utils/qrCommands.ts:14-83
Ours: nothing like it; every barcode is treated as a product identity to resolve.
Fit: none for a product scanner - kept because the rules say nothing is dropped.

### Keyword-regex category/subcategory detection - nutrigo
`detectProductCategory` runs ten hand-written case-insensitive regexes in a fixed priority order (snacks -> biscuits -> beverages -> sweets -> dairy -> grains -> proteins -> breakfast -> condiments) against the product name, defaulting to `'snacks'` if nothing matches; a second nested pass finds a subcategory only for snacks/biscuits.
Source: backend/src/utils/categoryDetector.ts:1-72
Ours: nothing like it; product categorization, if any, is left to Gemini's own judgment rather than a local regex ladder.
Fit: cheap - a free, deterministic category tag ahead of or alongside an AI call, at the cost of being only as good as the regex list.

## Lookup sources and how several are combined

### Product lookup via Open Food Facts v3 API - food-scanner-gemini
A single unauthenticated GET to `world.openfoodfacts.org/api/v3/product/<barcode>` with no query params, headers, key, or locale/field filter, dispatching on HTTP status (404 -> not found, non-200 -> exception, else parse `data['product']`).
Source: lib/resources/api.dart:9-21
Ours: no product database of any kind is consulted; the catalogue is not used for the answer on either the barcode or photo route, and price never comes from our own data (server.ts:910-913).
Fit: cheap, accurate - Open Food Facts is a free structured source we do not currently use at all for nutrition/identity facts, ahead of or alongside the AI call.

### Nutri-Score dual-schema parser - food-scanner-gemini
Detects `json.containsKey('2023')` to pick between the 2021 and 2023 Open Food Facts scoring schema, then extracts points from different JSON shapes per branch with hardcoded array indices and a fixed points-max fallback table.
Source: lib/models/nutriscore.dart:189-251
Ours: nothing like it (no Nutri-Score computation).
Fit: none of our stated objectives - relevant only if we add nutrition scoring.

### OpenFoodFacts barcode endpoint + field normalization - nutrigo
`GET v2/product/{barcode}.json` with an 8000ms axios timeout, custom User-Agent, and `validateStatus:status<500` so 4xx is read as normal data, not thrown; nutrient keys are remapped with a unit-conversion fallback (`energy_kcal_100g = kcal || kJ/4.184 || 0`, `salt_100g = salt || sodium*2.5 || 0`).
Source: backend/src/lib/openFoodFacts.ts:16-57
Ours: nothing like it.
Fit: cheap - a free structured nutrition source with a documented timeout and unit-conversion fallback, directly reusable if we add OFF as a lookup source.

### OpenFoodFacts text-search endpoint - nutrigo
`GET cgi/search.pl?search_terms=...&search_simple=1&action=process&json=1&page_size=1`, query length >=2 required, same 8000ms timeout and User-Agent, returns only the first result.
Source: backend/src/lib/openFoodFacts.ts:62-90
Ours: nothing like it.
Fit: cheap - a free fallback identity search when a barcode has no direct match.

### Barcode existence HEAD check (unused on scan path) - nutrigo
`checkBarcodeExists()` issues a HEAD request to the v0 endpoint with a 5000ms timeout, returning a boolean; exported but never called from the scan controller or routes.
Source: backend/src/lib/openFoodFacts.ts:95-103
Ours: nothing like it.
Fit: cheap - a HEAD check is a near-free way to know a barcode exists in OFF before spending a full GET or an AI call.

### Alternatives ladder: Gemini-generated first, static DB fallback, Supabase legacy fallback - nutrigo
The backend tries an AI-generated alternatives list first; if empty, falls back to a large hardcoded ~2900-line static object filtered by `health_score>=currentHealthScore-10`, sorted, sliced to 12; if the frontend's own fetch throws, it falls back again to a third, separate static list with a fixed `matchScore:50`.
Source: lib/getSmartAlternatives.ts:79-155, backend/src/routes/alternatives.routes.ts:2914-2966
Ours: nothing like it (we do not generate alternatives).
Fit: always answering - a three-deep fallback (AI, hardcoded DB, hardcoded mock) guarantees an alternatives list never comes back empty, at the cost of the last tier being disconnected from reality.

### Purchase-link generation (no verification) - nutrigo
`generatePurchaseLinks()` builds four hardcoded search-URL templates by URL-encoding "{brand} {productName}" into each retailer's search query string; none of the links are validated against real inventory.
Source: backend/src/routes/alternatives.routes.ts:3068-3076
Ours: nothing like it.
Fit: unsurprising, cheap - a zero-cost way to give the user a next step, as long as it is clearly a search link and not a guaranteed match.

### Client-side alternative match scoring - nutrigo
`calculateMatchScore()` is a hand-weighted additive score (max 100): health-score improvement 40/30/20/10 in buckets, same subcategory 30 vs 10, calorie closeness 20/10/5, different brand 10 vs 5; results sorted descending, sliced to top 12.
Source: lib/getSmartAlternatives.ts:157-201
Ours: nothing like it.
Fit: accurate - a simple, auditable additive score is easy to explain and tune, an alternative to letting the model alone rank options.

### Open Food Facts client with its own cache - sugar-no-scanner-demo
Product lookups hit `v3/product/<barcode>?fields=...` and searches hit `search.openfoodfacts.org/search`, both with a 4000ms `AbortSignal.timeout`, a named user agent, and results memoized under `barcode:<code>` or `search:<normalized>` keys for 30 minutes.
Source: src/server/open-food-facts.ts:73, 387, 497
Ours: no memoized OFF client exists (we do not call OFF at all).
Fit: cheap - both an explicit timeout and a 30-minute memo are directly reusable design choices if OFF is added as a source.

### Confirmed nutrition short circuit - sugar-no-scanner-demo
`hasConfirmedNutrition` is `typeof matchScore==="number" && ratingSignalCount>=2`; the first candidate satisfying it wins the whole waterfall, so expensive web-search steps only run for products nothing cheaper could confirm.
Source: src/server/recognition.ts:604, 867
Ours: nothing like it; grounding runs unconditionally on every scan rather than only when cheaper sources fail to confirm (gemini-scan.ts:17, 396).
Fit: cost control - a confirmation short-circuit ahead of any web-grounded call is a direct way to cut spend without changing our one-call-per-scan rule, since it decides whether grounding runs, not how many calls are made.

### Concurrent multi-source barcode lookup with fixed preference order - ha-wine-cellar
UPC Item DB and Open Food Facts are queried with `asyncio.gather` at the same time; UPC Item DB's result wins if both succeed (not "whichever answered first"); Vivino's HTML search is excluded from this pair and only tried after both miss, because it is slow and rarely recognizes a barcode at all.
Source: custom_components/wine_cellar/vivino.py:144-175
Ours: nothing like it (single AI call, no multi-source barcode lookup).
Fit: instant, accurate - concurrent-then-prefer is faster than a strict ladder while still being deterministic about which source wins a tie.

### Query-result relevance guard (generic-word-filtered Jaccard overlap) - ha-wine-cellar
Vivino's search API has been observed to silently return a fixed "trending" list for unrelated queries; both the search and refresh paths strip a ~30-word stopword set then require word-overlap `>=0.15` (intersection/union) before trusting the match, otherwise falling back to HTML search or skipping the write.
Source: custom_components/wine_cellar/vivino.py:86-113; custom_components/wine_cellar/websocket.py:134-148
Ours: nothing like it.
Fit: calibration, accurate - a cheap post-hoc relevance check against a source known to silently return junk on a miss is directly generalizable to any external API we start trusting.

### Vintage-preferring result reorder - ha-wine-cellar
`_prefer_matching_vintage` moves an exact-vintage-year match to the front of the results list instead of filtering the rest out, so a wine whose exact vintage isn't indexed still falls back to a close match rather than nothing.
Source: custom_components/wine_cellar/vivino.py:116-134
Ours: nothing like it.
Fit: always answering - reorder-don't-filter is a generalizable pattern for any exact-match preference that should degrade gracefully.

### Locale pinning via Accept-Language - ha-wine-cellar
Vivino's HTML page localizes based on IP/session heuristics with no explicit header, so `Accept-Language` is pinned per configured language on every Vivino request instead of leaving it to chance.
Source: custom_components/wine_cellar/vivino.py:63-83, 496, 595
Ours: nothing like it.
Fit: calibration, unsurprising - pinning locale removes a source of nondeterministic results from an external scrape.

### Currency-to-country substitution for a regional pricing API - ha-wine-cellar
Vivino's explore API requires a country_code alongside currency_code; since there's no real "user's country," a fixed table picks a country whose market Vivino actually prices in that currency (USD->US, EUR->DE, GBP->GB, CHF->CH).
Source: custom_components/wine_cellar/vivino.py:40-47, 479, 488-489
Ours: nothing like it; price never comes from our own data and is not currency-converted, per our prompt rule.
Fit: none against our own rule (we explicitly forbid currency conversion in the prompt), but the substitution-table technique is worth knowing if a source ever requires a parameter we cannot supply directly.

### Mobile-app backend UA spoofing - ha-wine-cellar
A separate mobile-app-facing Vivino endpoint is hit with an Android Chrome user-agent string to get by-id wine/vintage/grape/food lookups with no cookies or session, in exchange for it being id-only.
Source: custom_components/wine_cellar/vivino.py:25-30, 63-69, 177-251
Ours: nothing like it.
Fit: none against calibration/unsurprising as a general practice (spoofing a client to access an undocumented endpoint is fragile and outside the terms most APIs expect) - kept plainly as a bug/anti-pattern, not to copy.

### Concurrent structured+HTML dual fetch with field-level backfill merge - ha-wine-cellar
`search_wine` fires the explore API (structured, has price) and the HTML scrape (has description/food pairings the explore API never returns) concurrently, uses explore as primary, and only copies description/food_pairings from the HTML hit when explore's own result lacks them; a `fetch_extras=false` mode skips the HTML half for batch refreshes.
Source: custom_components/wine_cellar/vivino.py:380-452
Ours: nothing like it (single AI call is our only source).
Fit: accurate, cost control - field-level backfill from a second concurrent source, with an opt-out for batch jobs, is a clean pattern for combining two imperfect sources without doubling request volume by default.

### Neighbor-bounded HTML segment windowing - ha-wine-cellar
Each scraped wine's fields used to be read from a fixed 200-3000 char window that could reach past the next wine's JSON blob and back into the previous one, so a wine missing a field would silently pick up its neighbor's value; the window is now clamped to the actual previous/next match boundaries.
Source: custom_components/wine_cellar/vivino.py:832-844
Ours: nothing like it (no HTML scraping).
Fit: accurate - a documented fix for a real cross-contamination bug in windowed text extraction, worth remembering if we ever parse concatenated HTML/text blobs.

### JSON-escape decoding via re-wrapped json.loads - ha-wine-cellar
Regex-captured string bodies from an embedded-JSON HTML blob are unescaped by wrapping the raw captured text in quotes and running it through `json.loads`, correctly handling `\"`, `\/`, and accented-character escapes rather than leaving literal escape sequences in the data.
Source: custom_components/wine_cellar/vivino.py:779-787
Ours: nothing like it.
Fit: accurate - a small, reusable trick for correctly unescaping a regex-captured JSON string fragment.

### Scrape error-page keyword filter - ha-wine-cellar
A scraped description is discarded if it contains any of `forbidden, underage, try searching, page is blocked`, to avoid ingesting a bot-wall/age-gate/error page as if it were a tasting note; the same filter is applied retroactively when a wine is refreshed later.
Source: custom_components/wine_cellar/vivino.py:930-939; custom_components/wine_cellar/websocket.py:1131-1136
Ours: nothing like it (no scraping).
Fit: calibration - a cheap keyword denylist against known error-page phrasing is a reusable guard against ingesting a blocked-page response as real content.

### Barcode zero-pad retry against Open Food Facts - ha-wine-cellar
The OFF lookup is tried twice per call: once with the barcode exactly as scanned, once zero-padded to 13 digits, to catch UPC-A codes stored 13-digit in OFF.
Source: custom_components/wine_cellar/vivino.py:716-718
Ours: nothing like it (we do not call OFF).
Fit: accurate - a near-free second attempt that catches a known formatting mismatch, directly reusable if OFF is added.

### Priority-ordered concurrent-launch, sequential-await lookup orchestration - Scanly
Every matching lookup engine is launched together via `async`, but results are consumed strictly in ascending priority order - a slow high-priority engine blocks the response even if a lower-priority engine already finished with a Found result sitting idle; a Found result cancels all remaining jobs.
Source: core/lookup/LookupOrchestrator.kt:26-58
Ours: nothing like it (single AI call, no multi-engine orchestration).
Fit: accurate, none for speed - this pattern trades instant-ness for a deterministic winner; worth knowing the tradeoff before copying it, since "instant" is one of our objectives and a slow high-priority engine would violate it here.

### Error-vs-notfound aggregation rule - Scanly
The orchestrator only surfaces a hard Error if every supporting engine errored; if even one engine cleanly returned NotFound, errors from the others are downgraded into a NotFound response.
Source: core/lookup/LookupOrchestrator.kt:60-68
Ours: nothing like it; our four named outcomes distinguish a failure code from "no product" already, but do not aggregate across multiple concurrent lookups since there is only one AI call (api.js:473-543).
Fit: calibration - a documented rule for turning mixed success/failure across sources into one honest answer, relevant only if we combine multiple lookup sources.

### Retry nested inside a fresh per-attempt timeout - Scanly
Each lookup engine call gets a fresh 10-second timeout on every retry attempt (2 attempts, fixed 500ms delay), rather than one 10-second budget shared across the whole retry sequence.
Source: core/lookup/LookupOrchestrator.kt:19-23, 72-77
Ours: our own call timeout (30s) and retry policy (none, single attempt) do not use a per-attempt-timeout-within-retry structure (gemini-scan.ts:826, 846-959).
Fit: instant vs accurate tradeoff - a fresh timeout per retry means a flaky source gets more total time than a shared budget would allow; worth naming as a deliberate choice, not free.

### Cross-user, full-collection fuzzy text search for the "no barcode" path - Mivro
`database_search()` streams every user document in the Firestore `users` collection, then for each user's entire scan history computes `fuzzywuzzy.fuzz.token_set_ratio()` against 4 fields with a fixed >70 cutoff, collecting all matches across all users into one list and returning the single highest-similarity hit - this doubles as a de facto shared catalog assembled from every user's scan history.
Source: python-app/database.py:43-78
Ours: nothing like it (no cross-user data sharing, and the price never comes from our own data).
Fit: none against our data/privacy posture - a shared catalog built silently from every user's own scan history without consent framing is a privacy hazard worth naming plainly, not copying as-is; the underlying idea (a growing catalog assembled from real scans) is worth revisiting with explicit consent.

### Alternative-product suggestion resolved by a self-call to the app's own search API - Mivro
`swapr()` sends the scanned product to a persona that returns a bare product name, strips markdown bold markers, then issues an internal HTTP POST from the Flask process back to its own database-search endpoint to resolve that name against Firestore fuzzy search; on failure it silently returns just `{'product_name':<model text>}` with no verification the product exists.
Source: python-app/gemini.py:94-117
Ours: nothing like it (Gemini's own answer is not re-validated against an internal search step).
Fit: accurate - self-calling an existing lookup endpoint to verify a model-suggested name is a cheap sanity check before trusting a free-text AI answer, though the silent unverified fallback here is a bug to avoid, not copy.

## AI request construction

### AI call is a single unstructured text completion, not vision - food-scanner-gemini
`generateContent` calls `gemini.text(prompt)` with a plain string built from already-fetched product fields; no image is sent, no JSON schema, and a commented-out `GenerationConfig` (temperature 0.5, maxOutputTokens 6000, topP 1.0, topK 40) is never actually passed to the call.
Source: lib/controllers/barcode_info_controller.dart:51-69
Ours: vision (photo) and grounded text (barcode/typed-text) calls only, no plain-text-completion-on-already-known-fields path.
Fit: none - narrower and less structured than ours; kept for contrast.

### On-demand AI generation, not on the scan path by default - food-scanner-gemini
`generateContent` only runs when the user explicitly taps "Generate Analysis (AI)"; it is not invoked automatically after a scan, decoupling the AI call from the barcode-to-product pipeline.
Source: lib/pages/barcode_info.dart:126-129
Ours: our own AI call is not decoupled - it is the only source of product identity/price on every scan (server.ts 2312-2393).
Fit: cost control - an explicitly user-triggered secondary call is one way to keep "one AI call per scan" strict while still offering deeper analysis on request.

### Gemini model selection with a single conditional fallback - sugar-no-scanner-demo
Primary model defaults to `gemini-3.5-flash`, fallback to `gemini-3.7-flash`; `recognitionFallbackModel()` returns null when the two resolve to the same id so no pointless second call is made.
Source: src/server/recognition.ts:33
Ours: two models split ~50/50 by a stable hash of the device id, not a primary/fallback pair (gemini-scan.ts:56-89).
Fit: cost control - the null-fallback-when-identical guard is a small, free correctness check worth having regardless of which model-selection strategy we use.

### Image encoding for the AI call - sugar-no-scanner-demo
The data URL must match a strict `data:image/(jpeg|png|webp);base64,...` regex or the code throws `unsupported_image`; the base64 body passes straight to `createPartFromBase64` with no server-side resize, downscaling delegated entirely to `MEDIA_RESOLUTION_MEDIUM`.
Source: src/server/recognition.ts:227, 970
Ours: photo route accepts base64 PNG/JPEG up to a 3MB cap (server.ts:2562-2649); no explicit format-regex validation is documented.
Fit: calibration - validating the data URL's exact shape before sending it to the model catches a malformed upload before spending a call on it.

### SDK level 503 retry policy - sugar-no-scanner-demo
The primary attempt passes `{attempts:2, initialDelay:0.4, maxDelay:0.8, expBase:2, jitter:0.25, httpStatusCodes:[503]}`; the fallback attempt passes `{attempts:1, httpStatusCodes:[503]}`, giving at most three Gemini calls for one recognition.
Source: src/server/recognition.ts:137
Ours: one HTTP attempt, no retry, on the live scan path - a second grounded call was deliberately removed 2026-09-15 because the product rule is one Gemini call per scan (gemini-scan.ts:846-959).
Fit: breaks "one AI call per scan" as written - a 503-only retry inside the SDK is narrower than a general retry, but still spends more than one call; noted for contrast against our explicit one-call rule.

### Two speed resolution modes - sugar-no-scanner-demo
`resolveVisibleDetections` takes `mode:"fast"|"complete"`; in fast mode every network-bound lookup is nulled out so the first response is identity-only, and the client re-requests the same detections in complete mode.
Source: src/server/recognition.ts:593, 788
Ours: nothing like it; our single call returns everything at once (server.ts:2312-2393).
Fit: instant - a fast first-paint followed by progressive enrichment could make the app feel faster without changing what is ultimately shown, at the cost of a second request.

### Second vision pass for ambiguous SKUs - sugar-no-scanner-demo
When a detection's best candidate scores 0.62+ (0.52 for uploads with a single-candidate allowance), up to 4 ambiguous detections are collected, up to 2 packshot images per detection are fetched, and a second `generateContent` call compares the original frame against those packshots.
Source: src/server/recognition.ts:495, 217
Ours: our own second grounded call for verdict-resubmission was deliberately removed to enforce one call per scan (gemini-grounded.ts:447-458).
Fit: breaks "one AI call per scan" directly - the accuracy benefit (visual disambiguation against real packshots) is real, but conflicts with our current standing rule; named plainly as a rule conflict, not a recommendation.

### In flight guard against overlapping recognitions - sugar-no-scanner-demo
`inFlightRef` is checked and set at the top of every recognize function, and the capture loop pauses recognition immediately before firing a request, so only one recognition exists at a time and the timer never queues work behind it.
Source: src/components/scanner-app.tsx:612, 957
Ours: nothing like it explicitly documented for the barcode vote/manual-trigger flow, though our manual-trigger-and-reset design (camera.ts:275-291) achieves a similar one-at-a-time effect.
Fit: cost control - an explicit in-flight guard is a cheap way to prevent a second AI call from firing while one is still outstanding.

### Progressive enrichment at concurrency 5 - sugar-no-scanner-demo
Enrichment posts one detection per request through a concurrency-5 pool and merges each response as it lands, preferring the higher-resolution rank and keeping non-null fields from either side.
Source: src/components/scanner-app.tsx:462, src/lib/detection-merge.ts:9
Ours: nothing like it (single product per scan).
Fit: instant - relevant only for a multi-product shelf-scanning mode.

### Server side resolution concurrency - sugar-no-scanner-demo
`resolveVisibleDetections` defaults to concurrency 3, but the resolve route overrides it to 5 with an explicit comment that five visible products is the common case and should resolve in one wave.
Source: src/server/recognition.ts:648, src/app/api/resolve-products/route.ts:55
Ours: nothing like it (single product per scan).
Fit: instant - relevant only for multi-product scanning.

### Upload path multi crop fan out - sugar-no-scanner-demo
`uploadScanCrops` returns the full frame alone for ordinary aspect ratios, but for long portraits (height>=width*1.6) or dense landscapes (width>=height*1.15) it returns the full frame plus three overlapping horizontal bands, recognized in parallel.
Source: src/lib/upload-scan.ts:13
Ours: nothing like it (our photo crop is a single crop to the picked box plus 8% padding, capture.ts:142-180).
Fit: accurate - relevant for a long receipt/shelf photo, at the cost of tripling the AI call count for that upload.

### Iterative downscale until the payload fits - sugar-no-scanner-demo
Each upload crop is drawn at `min(1,1280/max(w,h))` scale and encoded at JPEG quality 0.78, then the loop multiplies scale by 0.8 and re-encodes while the data URL exceeds 2,650,000 characters, aborting below scale 0.25.
Source: src/lib/client-image.ts:8
Ours: our own crop downscales only if needed to a max long edge of 1568px and never upscales, but does not iteratively shrink to meet a byte/character budget (capture.ts:142-180).
Fit: cheap, always answering - an iterative shrink-to-fit loop guarantees the payload clears a size cap instead of failing outright on one oversized image.

### Google grounding timeout floor - sugar-no-scanner-demo
`webNutritionTimeoutMs` clamps the configured timeout between 10,000 and 30,000ms with a 12,000ms default, because Google Search grounding rejects deadlines below 10 seconds.
Source: src/server/web-nutrition.ts:13, .env.example:26
Ours: our own 30s call timeout is fixed, not clamped around a documented grounding-specific floor (gemini-scan.ts:826, 927-928).
Fit: calibration - a documented floor specific to grounded calls is a fact worth carrying into our own timeout configuration since we also use grounding unconditionally.

### Gemini tool-calling for shoe matching - WhiteChristmas
`detectShoe` defines a tool backed by a Firestore query and instructs the model to call it to get the canonical name list before answering, rather than passing the whole catalog in-prompt.
Source: firebase/functions/src/services/shoe-detection/index.ts:15-34, 51-84
Ours: nothing like it; our prompts are built from static templates with placeholder substitution, not tool-calling against a live catalog (scan_prompt.md:1-40).
Fit: cheap, accurate - tool-calling avoids stuffing a large or changing catalog into every prompt, relevant if we ever need the model to check against a live list rather than open-world knowledge.

### Inline base64 image, no separate upload for inference - WhiteChristmas
Already ours: the image sent for inference is passed as a base64 `data:` URL directly in the request, not fetched back from a separate storage upload; our own photo route similarly accepts base64-encoded PNG/JPEG directly in the request body.
Source: firebase/functions/src/services/shoe-detection/index.ts:76-83

### Concurrent upload + AI call - WhiteChristmas
The Storage upload and the Gemini shoe-detect call are launched together and awaited with `Task.WhenAll` rather than sequentially, to hide upload latency behind inference latency.
Source: Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:286-296
Ours: nothing like it documented; our photo storage step (server.ts:2667-2673) is not explicitly parallelized against the AI call in `_ours.md`.
Fit: instant - a free latency win when both the upload and the AI call are independent.

### Confidence-gated secondary AI path - WhiteChristmas
A second, heavier Gemini analysis pass only fires for tracked objects whose detector-reported label confidence exceeds 0.8.
Source: Assets/Scripts/GCP/ObjectDetectionGCPIntegration.cs:36-41
Ours: nothing like it (no confidence-gated second AI call; our second-pass verdict-resubmission call was removed entirely).
Fit: breaks "one AI call per scan" if adopted as a second call; the confidence-gating idea itself (only escalate when the detector is already fairly sure) is the interesting part.

### Full-frame (uncropped) copy for the secondary path - WhiteChristmas
Unlike the shoe-detect path, this second pipeline JPEG-encodes the entire screen-capture texture, so the model sees the whole scene rather than the ROI.
Source: Assets/Scripts/GCP/ObjectDetectionGCPIntegration.cs:52-61
Ours: our photo path always crops to the detected/picked box plus 8% padding, never the full uncropped frame (capture.ts:142-180).
Fit: accurate - sending the whole scene rather than a crop trades tokens/cost for scene context; worth testing against our crop-first approach for cases where surrounding context (e.g. a whole shelf) matters.

### Image-grid batching to cut API calls - WhiteChristmas
Up to 4 separate images are resized (longest side capped at 512px) and tiled into one square grid canvas with a 10px border, sent as a single Gemini call; the prompt spells out row-major reading order and demands a same-length JSON array back in that exact order.
Source: backend/src/main.py:34-86, 141-189, 456-472
Ours: nothing like it (one photo per scan, one AI call per scan).
Fit: cost control - batching multiple images into one grid to answer with one call is directly relevant if we ever need to analyze more than one photo per scan without breaking the one-call rule.

### 30s hard timeout, no retry, on secondary-path HTTP call - WhiteChristmas
Already ours: `request.timeout=30` with no retry on failure matches our own 30-second `AbortController` timeout and single-attempt policy on the live scan call.
Source: Assets/Scripts/GCP/ObjectAnalysisService.cs:55, 69-90

### Single shared, unbounded, process-global chat session per persona - Mivro
Three `GenerativeModel.start_chat(history=[])` sessions are created once at module import time and reused for every HTTP request from every user for the lifetime of the process, so one user's product data becomes prior context for the next unrelated user's call.
Source: python-app/gemini.py:70-72, 85/99/140
Ours: nothing like it; our model calls are stateless per scan with no shared chat history across users (gemini-scan.ts:56-89).
Fit: none - a serious cross-user data leak and a correctness hazard; named plainly as a bug to avoid, not copy.

### Gemini File API upload for multimodal chat, not inline base64 - Mivro
The chat endpoint's media branch saves an uploaded file to disk, calls `genai.upload_file(temp_path)` (a separate Gemini File API upload step), then references the uploaded file handle in the generation call, deleting the temp file afterward. Accepted types include `.pdf`/`.txt` alongside images.
Source: python-app/gemini.py:143-161
Ours: base64 inline only, no File API upload step, images/PNG-JPEG only (server.ts:2562-2649).
Fit: cheap for large files - the File API avoids re-sending large bytes inline on repeated reference, and PDF/TXT support is a genuinely broader input surface than our image-only path.

### All four Gemini safety categories set to BLOCK_NONE - Mivro
`HARM_CATEGORY_HARASSMENT`, `HATE_SPEECH`, `SEXUALLY_EXPLICIT`, and `DANGEROUS_CONTENT` are all set to `BLOCK_NONE` for every model, with a code comment explaining this is so the safety filter doesn't fire on product-data content like ingredient/allergen text.
Source: python-app/gemini.py:28-35
Ours: no safety-category overrides are documented in `_ours.md`.
Fit: always answering - a safety filter firing on ordinary ingredient/allergen text is a real failure mode for "always answering"; worth checking whether our own calls hit this and whether a narrower override is warranted.

### Vision call combines Google Search grounding with a forced JSON schema - Scan-It
The same `generateContent` call sets both `tools:[{googleSearch:{}}]` and a full `responseSchema`, letting the model ground the identification in a live web search while still being forced into strict JSON in one round trip.
Source: src/App.tsx:105-107
Ours: grounding is unconditionally on, but a real JSON schema is sent only on Gemini 3.x models - on 2.5, Google does not allow schema+search together, so the JSON shape is instead spelled out as literal instruction text (gemini-scan.ts:26-29, 327-333, 400).
Fit: accurate - confirms that combining grounding with a schema is possible on models that support it; a reason to weight scans toward our 3.x model tier when both matter most.

### Dual AI-transport abstraction (Gemini direct vs OpenAI-compatible relay) - ha-wine-cellar
One base client holds all prompt-building and response validation; two subclasses only implement the actual HTTP call, letting the same prompts run against a generic OpenAI-compatible relay with just a base URL, bearer token and model name, no Google API key required.
Source: custom_components/wine_cellar/gemini.py:1-8, 265-284, 685-882
Ours: our provider is Gemini only, selected between two model tiers by device hash, with no transport abstraction for a non-Google backend (gemini-scan.ts:56-89).
Fit: none currently against our rules (we are committed to Gemini), but the abstraction shape (prompt logic separate from transport) is a clean pattern if we ever need a second provider for redundancy.

### Provider-conditional reasoning suppression plus universal think-tag stripping - Scanly
For OpenAI-compatible requests to a specific host with a model name containing "qwen", `reasoning_effort` is set to `"none"`; independently, all provider output is regex-stripped of `<think>...</think>` (or a trailing unterminated tag) as a universal safety net.
Source: core/ai/AiRequestFactory.kt:36-44, core/ai/ProviderClient.kt:109-110, 147-151, 214-219, 276
Ours: nothing like it (single provider, no reasoning-trace leakage to strip).
Fit: none currently - relevant only for a reasoning-model provider whose raw output can leak its chain-of-thought into the response text.

### Per-request image cap enforced by trimming, not batching or splitting - Scanly
Because every scan is exactly one HTTP request, each provider has a hardcoded max-images-per-request; excess pages are silently dropped and a truncation notice is appended to the result text rather than the request being split or grid-batched.
Source: core/ai/AiProvider.kt:186-215, core/ai/ScanBudget.kt:263-293
Ours: nothing like it (one photo per scan already).
Fit: cost control - directly relevant if we ever accept more than one image per scan while keeping one call per scan; trimming with a visible notice is more honest than silently truncating without saying so.

### Partial-stream salvage on mid-stream disconnect - Scanly
If an SSE stream throws after some text has already accumulated, the partial text is returned as a success rather than retried, specifically to avoid re-billing the user's key for a duplicate request; only re-raises if zero characters were accumulated.
Source: core/ai/ProviderClient.kt:88-96
Ours: we do not stream Gemini responses (gemini-scan.ts:846-959).
Fit: cost control - relevant only if we adopt streaming; the "salvage partial output rather than retry the whole call" idea maps to always answering too.

### Image-count-scaled per-attempt timeout - Scanly
`ATTEMPT_TIMEOUT_BASE_MS=90000` plus 20000ms per image beyond the first, capped at 240000ms, wrapped around the whole network call via a coroutine timeout.
Source: core/ai/ProviderExecutor.kt:41, 82-131, 167-169
Ours: our own timeout is a fixed 30s regardless of payload (gemini-scan.ts:826, 927-928).
Fit: calibration - scaling the timeout by expected payload size avoids timing out a genuinely larger request too early; relevant if we ever accept multiple images per call.

### Dual-mode request body parsing - ai-calorie-counter
The Cloud Function accepts the payload two ways in one line - `const {imageBase64,mimeType,languageCode='en'} = req.body.data || req.body` - so it works whether called as a raw HTTP POST or via a client wrapping the payload in a `data` envelope (the Firebase Callable-functions convention), without maintaining two code paths.
Source: functions/index.js:26
Ours: nothing like it documented.
Fit: cheap - a one-line compatibility shim, low cost if we ever need to support two calling conventions.

### Gemini Vision multimodal request - nutrigo
POSTs directly via raw `node-fetch` (not the SDK) to the `generateContent` REST endpoint with a `contents[0].parts` array holding one text part and one `inline_data` part (base64 JPEG re-read from disk).
Source: backend/src/controllers/scan.controller.ts:131-224
Ours: our own photo call also sends inline base64 image data, but through the `@google/genai`-style provider code rather than raw `node-fetch`, and combined unconditionally with Google Search grounding (gemini-scan.ts:17, 396).
Fit: none new - same base pattern as ours; kept because it is a distinct heading in the source file.

## Prompt design

### Gemini Vision prompt (verbatim) - nutrigo
A six-section numbered prompt instructs the model to identify the product, extract nutrition facts from a visible label, or if not visible, predict them from the product name using its own training knowledge, then compute a health score and warnings and return one fixed JSON shape. Full text quoted in "Prompts, verbatim" below.
Source: backend/src/controllers/scan.controller.ts:147-211
Ours: our prompts are built from external template files with placeholder substitution and never instruct the model to predict facts it cannot see (scan_prompt.md:1-40).
Fit: breaks "no fabricated evidence" directly - kept for contrast, not adoption.

### LLM told to hallucinate nutrition when label is unreadable - nutrigo
The prompt explicitly instructs the model to fabricate ("predict") full nutrition numbers, ingredients and warnings from the product name alone when the label is unreadable, with a hard rule "NEVER return 0 or null for all values if you know the product name"; there is no code-level guard rejecting or flagging a fully-predicted response, only a `dataSource` string and an "(estimated)" warning suffix.
Source: backend/src/controllers/scan.controller.ts:159-211
Ours: nothing like it; no rule instructs Gemini to fabricate facts, and a scan row records `verdict_zone` as Gemini's own placement, never a fabricated number presented as measured.
Fit: breaks HARD RULE 1 (no unsourced statement presented as fact) and HARD RULE 3 (no fabricated evidence) directly - named plainly as a rule violation, kept because the instructions say nothing is dropped for being against our rules.

### Alternatives AI prompt (verbatim) - nutrigo
Asks the model for 5-7 real Indian packaged-food alternatives in the same category with a higher health score, forcing the returned health-score range to 60-95 regardless of the actual product. Full text quoted below.
Source: backend/src/routes/alternatives.routes.ts:3016-3044
Ours: nothing like it (no alternatives generation).
Fit: none of our rules broken directly, but forcing a score range rather than reporting what the model actually assesses is a small fabrication-adjacent pattern worth avoiding if we add alternatives.

### Full literal detection prompt - sugar-no-scanner-demo
Three interpolated pieces (a broad-scan scope, a focused-crop scope, and a saved-image-specific paragraph) plus a fixed tail are concatenated per call; the tail explicitly forbids guessing a pack size, forbids treating a nutrition claim as a size, and instructs the model to return an empty detections array "rather than guessing when no product identity is readable." Full text quoted below.
Source: src/server/recognition.ts:368
Ours: our own prompt templates substitute barcode/market/currency/language placeholders per scan, but the exact never-guess instruction language differs (scan_prompt.md:1-40).
Fit: calibration - the explicit "return empty rather than guess" instruction is a direct, reusable calibration technique worth comparing against our own prompt wording.

### Full literal candidate confirmation prompt - sugar-no-scanner-demo
Instructs the model to compare an original frame against packshot candidates for an already-detected package, choosing a candidate "only when the exact SKU is visually supported," explicitly forbidding a match on brand-and-category alone, and returning an empty choice at low confidence rather than guessing. Full text quoted below.
Source: src/server/recognition.ts:530
Ours: nothing like it (no candidate-confirmation second pass).
Fit: breaks "one AI call per scan" if adopted as a second call; the prompt's calibration language ("never choose merely because brand and type match") is independently valuable regardless of the call-count question.

### Full literal web nutrition search prompt - sugar-no-scanner-demo
Instructs a grounded search call to find the exact product, return `exactProductMatch` only when brand/variant/pack identity truly match, return null (not zero) for any unverifiable nutrient, and cite the supporting page; ends with a fixed single-line JSON marker `NUTRITION_JSON:`. Full text quoted below.
Source: src/server/web-nutrition.ts:206
Ours: our own grounded call is the identification/pricing call itself, not a separate nutrition-verification call; our prompt forbids currency conversion but its exact null-vs-zero handling for unverifiable fields is not documented in `_ours.md`.
Fit: calibration - "never substitute zero for missing data" is exactly aligned with HARD RULE 1 and worth checking our own prompt explicitly states it.

### Verbatim shoe-detection prompt - WhiteChristmas
Instructs the model to call a tool for the canonical shoe list, match on style/brand/color/features, require 70%+ confidence, and return exactly one of a matched name, `UNKNOWN_SHOE`, or `SHOE_NOT_FOUND` with no additional text. Full text quoted below.
Source: firebase/functions/src/services/shoe-detection/index.ts:53-84
Ours: nothing like it (product identity is not matched against a fixed local catalog).
Fit: calibration - a numeric confidence bar (70%) paired with two distinct "no match" states (unknown vs not-present) is a clean way to force a model into an honest three-way answer.

### Same prompt-classification pattern reused for foot measurement - WhiteChristmas
`validateFootMeasurement` reuses an identical system-prompt + inline-base64 + free-text pattern to classify a foot image into exactly one of three states, with an explicit "err toward WEARING_FOOTWEAR if unsure" instruction and a code-level fallback to that same safe default on any unrecognized output.
Source: firebase/functions/src/services/foot-measurement/index.ts:26-51
Ours: nothing like it.
Fit: calibration - reusing one classification pattern across tasks, with an explicit safe-default bias stated in the prompt itself, is a reusable idea for any of our own closed-set classification prompts.

### Per-persona system prompts loaded from separate Markdown files at import time - Mivro
Three files (`lumi_instructions.md`, `swapr_instructions.md`, `savora_instructions.md`) are read once and passed as `system_instruction` to three separately configured models, all `gemini-1.5-flash-latest` with the same generation config. Excerpts quoted below.
Source: instructions/lumi_instructions.md, instructions/swapr_instructions.md (read by python-app/gemini.py:38-42)
Ours: prompts also come from external template files (`GEMINI_SYSTEM.md`, `PRICING_GUIDE.md`, `scan_prompt.md`), matching the "load from a file, not an inline string" approach; ours differs by substituting placeholders per scan rather than using one fixed persona per call.
Fit: n/a - the file-based prompt loading pattern is already ours; the three-persona split is new and not something we do.

### "Photocopier" system-prompt framing to defeat LLM summarization - Scanly
The transcription prompt frames the model as a photocopier reproducing the page exactly, with a dedicated section on digit transcription because digit corruption, not letter confusion, is named as the dominant error mode; instructs marking unclear text `[unclear]` and illegible regions `[illegible]` rather than guessing. Full text quoted below.
Source: core/ai/AiPrompts.kt:86-125
Ours: nothing like it (no document-transcription mode).
Fit: calibration - the metaphor ("works like a photocopier... never interpret, improve, complete or summarise") plus explicit uncertainty markers is a strong, reusable anti-hallucination framing for any prompt where we want literal reproduction rather than judgment.

### Language-directive prompt sandwiching - ha-wine-cellar
The non-English instruction is repeated once before the schema and once after it, on the theory a single trailing note is easy for the model to under-weight against an all-English prompt. Full text quoted below.
Source: custom_components/wine_cellar/gemini.py:114-137
Ours: nothing like it (language handling in our prompts is not documented as a repeated sandwiched instruction).
Fit: unsurprising - a cheap, testable technique if we ever localize scan output beyond English.

### AI-computed health score requested inline - ai-calorie-counter
Rather than computing a health/usefulness score locally from returned macros, the prompt asks Gemini to emit the score directly as one JSON field (`"usefulness": [0-10]`); the barcode path never gets this field and hardcodes it to 0.0, so AI-analyzed and barcode-looked-up entries sit on different scoring bases with no reconciliation.
Source: functions/index.js:57
Ours: our `verdict_zone` is likewise Gemini's own placement, never computed by the app - a matching philosophy of letting the model score rather than a local formula.
Fit: n/a - conceptually already ours (see "Already ours" list); the two-different-bases inconsistency across paths is a bug to avoid, not copy.

### User-language-steered field localization - ai-calorie-counter
A `userLanguage` value read from the user's Firestore profile is sent as `languageCode` and used to steer only one output field's language, while the JSON keys and every other value stay fixed in English: "the dish_name must be in that language."
Source: functions/index.js:46; lib/screens/analysis_screen.dart:34, 58
Ours: our prompt substitutes a language placeholder for market/language hints per scan, but the exact scope (which fields localize vs stay fixed) is not documented in `_ours.md`.
Fit: unsurprising - a narrowly-scoped localization instruction (one field, not the whole schema) avoids destabilizing a structured response while still speaking the user's language where it matters.

## Structured output and schemas

### Structured output schema for detection - sugar-no-scanner-demo
The call sets `responseMimeType:"application/json"` and a hand-written `responseJsonSchema` whose detections array has `maxItems:10`, a full field list, and `additionalProperties:false` at both levels; a separate Zod schema re-validates the same shape after parsing.
Source: src/server/recognition.ts:982, 156
Ours: a real JSON schema is sent only on Gemini 3.x models; on 2.5 no schema is sent because Google does not allow schema+search together below Gemini 3, so the shape is described in the prompt text instead (gemini-scan.ts:26-29, 327-333, 400).
Fit: accurate - `additionalProperties:false` plus a maxItems cap and a second independent re-validation (Zod on top of the model's own schema adherence) is stricter than relying on the schema alone; worth adopting on our 3.x path.

### Generation params are thinking level and media resolution only - sugar-no-scanner-demo
Already ours: no temperature, topK, topP, or maxOutputTokens is set anywhere in the recognition module; only `thinkingConfig` and `mediaResolution` are configured. This matches our own generation-parameter policy exactly (only `thinking_level` and `media_resolution` are configured, never temperature/topP/topK).
Source: src/server/recognition.ts:979

### Thinking level chosen by model id prefix - sugar-no-scanner-demo
`recognitionThinkingLevel` returns `LOW` when the target model id starts with `"gemini-3.7"` and `MINIMAL` otherwise, so the cheaper primary model runs with the least thinking and only the fallback pays for more.
Source: src/server/recognition.ts:124
Ours: `thinking_level` defaults to `'low'` and is configurable via `SHIN_GEMINI_THINKING`, but is not documented as varying automatically by which of our two models was hash-selected (gemini.ts:191-207).
Fit: cost control - tying thinking level to model tier automatically (rather than one global default) is a small, free way to spend more reasoning only on the model already chosen for harder cases.

### Single combined schema for identification + ingredients + alternatives - Scan-It
One `responseSchema` asks for product name, the full ingredients array with per-ingredient health-impact enum and reasoning, a summary, an overall safety enum, and 1-3 healthier alternatives, all in the same response object rather than a ladder of separate calls.
Source: src/App.tsx:107-149
Ours: our own response schema (3.x models) likewise returns identity and pricing/verdict fields in one object, but does not include a per-ingredient breakdown or alternatives.
Fit: accurate, cost control - combining more judgments into the one already-allowed call is directly aligned with "one AI call per scan"; worth evaluating which of these fields (ingredient-level judgment, alternatives) would earn their place in our schema.

### Zero deterministic scoring - the LLM is the only judge - Scan-It
Already ours: there is no local health-score formula, no ingredient database, and every judgment is produced entirely by the model's own classification, with a reasoning field also generated by the model rather than computed. Our own `verdict_zone` is likewise Gemini's own placement against thresholds, never computed by the app itself.
Source: src/App.tsx:78-149

### Free-text response parsed by string matching, not structured output - WhiteChristmas
The model is asked for exact plain text (not JSON), then the function trims, strips surrounding quotes, and does a substring search against the live shoe list, defaulting to `UNKNOWN_SHOE` if nothing matches.
Source: firebase/functions/src/services/shoe-detection/index.ts:86-120
Ours: a real JSON schema is used wherever the model supports it (3.x); string-matching a free-text reply is not our approach.
Fit: none against accuracy/calibration - structured output is strictly safer than substring-matching free text; kept for contrast.

### Explicit generation params for the (unreachable) Cloud Run Gemini call - WhiteChristmas
`temperature=0`, `top_p=0.95`, `max_output_tokens=8192`, `response_mime_type="application/json"`, all four safety categories set to `"OFF"`, Google Search tool attached by default, response streamed and concatenated chunk-by-chunk.
Source: backend/src/main.py:227-264
Ours: no temperature/topP/topK is set anywhere in our own calls; this path sets both, plus safety categories fully off.
Fit: none against our own generation-parameter policy - kept for contrast, and flagged that the safety-categories-off choice is a real content-policy decision, not incidental.

### Response parsing for the Gemini call - food-scanner-gemini
The response's `text.content?.parts` (a list of parts) is mapped to `.text` and joined with a single space into one flat string, with no further structuring, markdown handling, or validation of non-null/non-empty content beyond a `?? ''` fallback.
Source: lib/controllers/barcode_info_controller.dart:70
Ours: a JSON schema constrains the shape of the response wherever the model supports it (Gemini 3.x); flattening parts into an unstructured string with no emptiness check is not our approach.
Fit: none against calibration - an empty or malformed response silently becomes an empty string shown to the user as if it were a real answer, rather than a distinguishable failure.

## Validating what the model returns

### Confidence threshold split by mode - sugar-no-scanner-demo
`recognitionConfidenceThreshold` reads a default of 0.72 for a broad scan and 0.58 for a focused rescan, each clamped 0-1.
Source: src/server/recognition.ts:262
Ours: nothing like it (no confidence-threshold gating documented on our scan responses).
Fit: calibration - a mode-specific acceptance bar (looser once the model is already focused on a crop) is a concrete number worth testing against our own always-answer policy.

### Post parse detection filter - sugar-no-scanner-demo
Detections survive only if confidence clears the threshold and both box dimensions are at least 0.02 of the frame, then are sorted by descending confidence and sliced to the max.
Source: src/server/recognition.ts:1061
Ours: nothing like it (single-product scans have no post-parse detection list to filter).
Fit: accurate - directly relevant if we ever return multiple detections per scan.

### Gemini box2d conversion - sugar-no-scanner-demo
`geminiBox2dToFrame` reads the model's `[ymin,xmin,ymax,xmax]` integers, divides by 1000, and clamps the result into the unit square via `fitBoxToFrame`.
Source: src/server/recognition.ts:183
Ours: nothing like it (we do not ask Gemini for bounding boxes; our own object framing comes from MediaPipe/Sobel, not the AI call).
Fit: none currently - relevant only if we ask Gemini itself to return a box.

### Confirmation acceptance threshold - sugar-no-scanner-demo
A returned choice from the candidate-confirmation call is applied only when confidence is 0.92 or higher and the slug is in the allowed candidate set for that detection index, ties broken by highest confidence.
Source: src/server/recognition.ts:450, 549
Ours: nothing like it (no second confirmation call, consistent with one call per scan).
Fit: calibration - a high, explicit acceptance bar (0.92) on a second-pass answer is a strong number; only relevant if that second call is ever added.

### Confirmation failures are swallowed - sugar-no-scanner-demo
The entire confirmation call sits in a try/catch whose catch returns the original unconfirmed detections, so a fetch error, malformed JSON, or schema violation silently degrades with no log and no telemetry.
Source: src/server/recognition.ts:544
Ours: our rule is to record as much as possible about every scan; a silently swallowed failure with no telemetry breaks that.
Fit: breaks "record as much as possible about every scan" - named plainly as an anti-pattern, not to copy.

### Error classification before any fallback - sugar-no-scanner-demo
Already ours in spirit: `geminiErrorStatus` reads the error's status/code and maps 429 to `quota_exhausted` or `rate_limited` by message pattern, 500+ to `provider_overloaded`, and 400/401/403/404 to `configuration` before any fallback decision is made. Our own client distinguishes named failure codes (`model_timeout`, `spend_cap_reached`, `rate_limited`, `too_large`) the same way, before deciding the next step.
Source: src/server/recognition.ts:52, 63

### Model numbers are never trusted, only model found URLs - sugar-no-scanner-demo
When the shared catalog is enabled, a grounded search answer is used only to pick a URL, and only if `exactProductMatch` is true with confidence >=0.9; the actual nutrients come from a separate deterministic page fetch, with the code comment "Search discovers a page; its generated nutrient numbers are NEVER facts."
Source: src/server/web-nutrition.ts:231
Ours: our own rule that the price never comes from our own data is a related but distinct guarantee (it is about provenance, not about re-verifying a grounded number against the source page); we do not currently re-fetch and parse a page to confirm a Gemini-grounded number.
Fit: calibration, no fabricated evidence - this is close to the strongest match in the whole survey for HARD RULE 1 (no unsourced statement presented as fact): treat a model's own grounded claim as a lead to verify, not as the answer.

### Deterministic retailer page verifier - sugar-no-scanner-demo
`fetchVerifiedWebProduct` fetches the approved HTTPS URL with a 5-second timeout, `redirect:"manual"` following at most 2 redirects, requires `text/html`, aborts past 1,500,000 bytes, then parses JSON-LD Product blocks, per-100g/100ml tables, and one retailer's escaped-JSON-in-script table.
Source: src/server/web-product-evidence.ts:249, 117
Ours: nothing like it (no deterministic page-parsing step exists; grounding's own answer is used directly).
Fit: accurate, no fabricated evidence - a deterministic parse of a real page is the concrete mechanism behind the "never trust model numbers" rule above; the two are one idea.

### Nutrition plausibility self check - sugar-no-scanner-demo
A parsed nutrition table is discarded wholesale when sugars exceed carbohydrates, when protein+carbohydrate+fat exceeds 101g, or when `protein*4 > energyKcal+5`, and a nutrient appearing twice with different values on one page also voids the table.
Source: src/server/web-product-evidence.ts:184, 172
Ours: nothing like it (no plausibility check on Gemini's returned nutrition/price numbers).
Fit: calibration - a handful of physically-impossible-value checks is a cheap, high-value validation layer we do not currently have on any returned number.

### Gemini response parsing: strip markdown fences, JSON.parse - nutrigo
Both Gemini calls take the raw response text, strip ` ```json `/` ``` ` fences with a regex, then `JSON.parse` the remainder with no schema validation, no try/catch separate from the outer one, and no retry on parse failure - a malformed response just falls through to the catch and returns null.
Source: backend/src/controllers/scan.controller.ts:236-241, 277
Ours: a real JSON schema plus parsing is used on our 3.x path; on 2.5 the shape is prompted rather than schema-enforced, but `_ours.md` does not document our own fence-stripping/parse-failure behavior in detail.
Fit: calibration - a bare `JSON.parse` with no schema validation is weaker than our own 3.x schema path; worth confirming our 2.5 parsing path has an equivalent safety net.

### Nutrition field coalescing with `||` (falsy-zero bug) - nutrigo
`resolvedNutrition` chains `||` across up to three possible sources per field, so a genuine value of 0 from an earlier source (e.g. legitimately 0g sugar) is silently overwritten by a later, wrong non-zero source, or defaults to 0 for the wrong reason.
Source: backend/src/controllers/scan.controller.ts:301-309
Ours: nothing like it documented; our own field resolution is not a chained `||` coalesce in `_ours.md`.
Fit: breaks "no fabricated evidence" (a genuine zero silently becomes a fabricated non-zero) - named plainly as a bug to avoid, not copy.

### Local health-score formula (backend, used at save time) - nutrigo
`calculateHealthScore()` starts at 100 and applies capped linear penalties/bonuses per nutrient, clamped to 0-100 and rounded; an identical copy exists client-side.
Source: backend/src/controllers/scan.controller.ts:15-38
Ours: nothing like it; our `verdict_zone` is Gemini's own placement, never a locally computed formula (scan-marks.ts:1-45).
Fit: none against our current design (we deliberately let the model score); kept for contrast, and as a fallback pattern if a local formula is ever needed when the model gives no score.

### Health score precedence order - nutrigo
When there's no cache hit, the LLM-provided health score (if present) takes precedence over the locally computed formula score; only when the LLM gave no score does the formula run.
Source: backend/src/controllers/scan.controller.ts:322-326
Ours: nothing like it (we have no local formula to arbitrate against).
Fit: none currently against our design; the precedence rule itself (model wins, formula is only a fallback) is consistent with letting the model be the primary judge, as ours already does.

### Response text repair before JSON parsing - WhiteChristmas
Before `json.loads`, the code strips a leading/trailing triple-backtick fence and also handles a stray `text='...'` wrapper artifact, reapplying the fence-strip afterward.
Source: backend/src/main.py:89-111
Ours: nothing like it documented beyond schema-based parsing on 3.x.
Fit: calibration - a second, narrower repair pass (the stray wrapper case) beyond simple fence-stripping is a real edge case worth checking against our own 2.5 parsing path.

### Hardcoded fallback object on parse failure - WhiteChristmas
If the cleaned response still fails `json.loads`, a fixed `{"main_object":"unknown","confidence":0.0,...}` object is returned instead of surfacing an error to the caller.
Source: backend/src/main.py:270-307
Ours: our client distinguishes a named failure code (e.g. `model_timeout`) from a resolved product rather than substituting a fake "unknown" object that looks like a real answer (api.js:473-543).
Fit: breaks calibration if the fallback object is indistinguishable from a real low-confidence answer downstream; the always-answering intent is right, but our own named-failure-code approach is more honest about what happened.

### Gemini response executed as Python via eval() - Mivro
After getting the model's reply, the code strips code-fence markers and calls Python's builtin `eval()` directly on the resulting string, trusting the model to emit a literal Python dict/list; invoked twice per barcode scan.
Source: python-app/gemini.py:87-89
Ours: nothing like it; a real JSON schema plus parser is used, never a language-level `eval()` of model output.
Fit: none - `eval()` on model output is a direct code-execution vulnerability (a crafted or hallucinated response can run arbitrary Python); named plainly as a security hole, not copied.

### Balanced-bracket JSON extractor - ha-wine-cellar
When a direct `json.loads` fails, `parse_json_response` scans forward from the first `{` or `[`, tracking string state (with backslash-escape awareness) and bracket depth to find the exact matching close bracket, rather than assuming `{...}` - fixing arrays truncated after their first inner object; a final pass also strips trailing commas.
Source: custom_components/wine_cellar/gemini.py:63-108
Ours: nothing like it documented; a real schema is used on 3.x, avoiding this class of parse failure entirely, but our 2.5 free-text path's exact recovery strategy is not documented.
Fit: calibration, always answering - a genuinely more robust JSON-recovery step than plain fence-stripping; directly useful for our own 2.5 (schema-less) parsing path.

## Defending a price specifically

### Shelf price trust gate with digit cross check - sugar-no-scanner-demo
A detected shelf price is accepted only when `shelfPriceLabelVisible` is true, cents are above zero, `shelfPriceConfidence>=0.9`, and the observed price text itself contains a decimal amount whose parsed cents equal the reported `shelfPriceCents`, so the model cannot report a number that contradicts its own quoted text.
Source: src/server/recognition.ts:244
Ours: our rule is that the price never comes from our own data, and `verdict_zone` is Gemini's own placement, but `_ours.md` does not document a self-consistency check between a quoted price string and a separately reported price field.
Fit: no fabricated evidence, calibration - checking that the model's own two representations of the same fact agree before trusting either is a strong, cheap validation directly applicable to our own price/verdict fields.

### Minimum-price plausibility floor - ha-wine-cellar
Prices pulled from Vivino's explore API are only accepted if the amount is at least $6.00, a floor against implausible near-zero placeholder values, in addition to being numeric and rounded to 2 decimals.
Source: custom_components/wine_cellar/vivino.py:527-532
Ours: nothing like it (no plausibility floor on a returned price documented).
Fit: calibration - a category-appropriate minimum-price floor is a cheap sanity check against a clearly-wrong external number.

### Deliberate non-extraction of scraped price - ha-wine-cellar
The HTML-scrape parser hardcodes `price=None` for every result with an explicit comment that the page's embedded price is boilerplate/template text identical across every search query, so only the explore API's structured price field is ever trusted.
Source: custom_components/wine_cellar/vivino.py:957-960
Ours: our rule that the price never comes from our own data is a related but distinct guarantee; this is a case of actively distrusting a specific source known to be unreliable for price specifically, while still trusting it for other fields.
Fit: no fabricated evidence, calibration - deliberately not extracting a field from a source known to return template junk for that field, while still using the source for everything else, is a precise and reusable pattern.

### Fill-empty-only price overwrite protection - ha-wine-cellar
Background auto-enrich after adding a wine fills `retail_price` only if the wine has no price at all, with an explicit comment that this field used to overwrite an AI estimate the user had already seen on screen and was fixed to fill-empty-only.
Source: custom_components/wine_cellar/websocket.py:235-241
Ours: nothing like it documented (our own price is always the current scan's Gemini answer, not a persisted field a background job could later overwrite).
Fit: calibration, unsurprising - a documented fixed bug (a background job silently replacing a price the user already saw) is a concrete failure mode worth guarding against in any future persisted-price feature.

### Fire-and-forget background auto-enrich, decoupled from the response - ha-wine-cellar
Adding a wine returns immediately; a separate background task runs the Vivino search/merge afterward and pushes an event when it finishes, rather than making the add-wine call wait on a network round trip. This is the async pattern that carries the fill-empty-only price guard described just above.
Source: custom_components/wine_cellar/websocket.py:193-258, 441
Ours: nothing like it documented (our own scan/verdict marks are written synchronously after the fact by scan id, scan-marks.ts:1-45, not via a decoupled background enrichment task).
Fit: instant - returning to the user immediately and enriching in the background is a direct way to keep the user-facing path fast while still doing slower cross-checking work, as long as the later write cannot silently clobber something the user already saw (see the fill-empty-only guard above).

### Three-context price prompt with only one currency-parameterized - ha-wine-cellar
Three separate AI prompts ask for a price, each phrased slightly differently: label recognition hardcodes "US retail price" regardless of configured currency; wine-list extraction separates a printed `list_price` from the model's own `estimated_retail_price` guess; single-wine re-analysis is the only one of the three that is currency-parameterized ("in {currency}"). No web search, retailer scrape, or external price API backs any of the three; the number is purely the model's own training-data knowledge, with no confidence field and no price range.
Source: custom_components/wine_cellar/gemini.py:197, 216-218, 240-243, 585
Ours: the price never comes from our own data, and grounding (Google Search) is unconditionally on for every scan, so our price is at least search-grounded rather than pure model recall; our prompt also explicitly forbids currency conversion.
Fit: breaks "accurate" if copied as-is (pure recall with no grounding, and two of three prompts ignoring the configured currency) - named plainly as a weaker approach than our own grounded pricing, kept for contrast.

### Consent gate before any paid AI price call - ha-wine-cellar
AI is only invoked automatically to fill a missing price if a setting is enabled; otherwise the response sets a `price_needs_ai` flag and the frontend must ask the user first, with an explicit comment "a plain 'Vivino' click must never call AI silently."
Source: custom_components/wine_cellar/websocket.py:1124-1129, wine-detail-dialog.ts:804
Ours: our rule is to always return an answer and that one AI call per scan is standard, not gated behind a separate user consent step for price specifically.
Fit: none against "always answering" and "effortless" as written for us - a consent gate before a paid call is the opposite of our instant/always-answering design; kept for contrast, not adoption.

### Currency-mismatch invalidation and price provenance bookkeeping - ha-wine-cellar
On a manual refresh, an existing stored price is treated as not present (eligible to be overwritten) if its stored currency does not match the currently configured currency, with an explicit comment that an unconverted number in the wrong currency is worse than no number; separately, `ai_price_used`/`ai_updated_at` are tracked distinctly from `vivino_updated_at` so the record shows which source last touched the price.
Source: custom_components/wine_cellar/websocket.py:1102-1112, 1113-1123
Ours: our cost accounting distinguishes an estimate from a real token-based cost (model-cost.ts:43-56), a related but different kind of provenance tracking; nothing in `_ours.md` tracks which source last set a price field.
Fit: no fabricated evidence, calibration - "wrong currency is worse than no number" is a direct instance of our own no-fabrication principle; the source-provenance timestamp split is a cheap, generally useful record-keeping pattern.

## Caching and reuse

### History dedup keyed by barcode string - food-scanner-gemini
Before writing to Firestore, an in-memory list already loaded by the home screen is searched for a matching barcode and that record is updated instead of inserting a duplicate; if the list is stale/empty (cold start before the stream first emits) a duplicate history row is created instead.
Source: lib/controllers/barcode_info_controller.dart:27-34
Ours: nothing like it (no per-user scan history dedup documented in `_ours.md`).
Fit: unsurprising - a cheap dedup keyed on the identity we already have, with a documented stale-cache failure mode worth avoiding.

### Firestore persistence with per-user scoping and typed converter - food-scanner-gemini
A typed converter wraps the history collection, and a live snapshot stream queries by `uid` with no `limit()`, so the entire per-user history streams every time.
Source: lib/resources/database.dart:9-26
Ours: our scan rows are updated after the fact by scan id with a small never-throwing UPDATE, not a live unbounded per-user stream (scan-marks.ts:1-45).
Fit: none against "instant" as documented (no `limit()` on a live stream can only get slower as history grows); kept for contrast.

### Catalog memoization - sugar-no-scanner-demo
`listProducts` caches the scored Supabase catalog in module memory for 60,000ms, and the alternatives pool built from four sources is cached the same way; a Supabase error or empty table falls back to the bundled static catalog with a named fallback log.
Source: src/server/catalog-repository.ts:39, 80
Ours: nothing like it (we hold no local catalog to cache).
Fit: cheap - a 60-second in-memory cache with a documented static-fallback path is directly reusable if we ever build a local catalog.

### Web nutrition cache with stale while revalidate - sugar-no-scanner-demo
Misses are cached 6 hours, stale memory entries live 5 minutes, a persistent layer is read separately, and concurrent refreshes are deduplicated through an in-flight set.
Source: src/server/web-nutrition.ts:16, 328
Ours: our grounded-result retention nulls an unshown result after 60 minutes and in any case after 2 years (grounded-record.ts:110-252), a different kind of cache (retention window vs stale-while-revalidate reuse).
Fit: cost control - a documented negative (miss) cache alongside a positive cache is a distinct lever from our own retention window; worth having both if we ever cache lookups.

### Client persistence map - sugar-no-scanner-demo
`sessionStorage` holds the browser session id for the anonymous funnel; `localStorage` holds onboarding completion, the access token, the free-scan count, and acquisition attribution; no IndexedDB is used anywhere.
Source: src/components/scanner-app.tsx:380, 1225
Ours: our telemetry events persist to `localStorage` (bounded at 2000, batched flush); our offline photo queue uses IndexedDB specifically for the photo path (queue.ts:1-138, track.js:1-100).
Fit: none new - a lighter persistence footprint than ours in one area (no IndexedDB at all) at the cost of not being able to queue anything offline.

### CSV/Supabase product-name cache short-circuits the health score - nutrigo
Before computing/using any health score, the code looks up a `products_cache` table by case-insensitive name (+ optional brand); on a hit it reuses the stored score verbatim "so all future scans get the same score" for that product name; on a miss it computes fresh and upserts.
Source: backend/src/utils/csvCache.ts:73-144, backend/src/controllers/scan.controller.ts:311-350
Ours: nothing like it (our `verdict_zone` is per-scan, not cached by product name).
Fit: cost control, calibration - reusing a prior scored answer by product name avoids re-scoring (and re-spending an AI call on) something already judged, though it also means a later, better answer can never override a stale cached one without an explicit cache-bust.

### Supabase-scan cache short-circuits the whole pipeline (exact barcode) - nutrigo
`lookupByBarcode` checks the scans table for an existing row with that exact barcode and returns it immediately with zero further lookups (no OpenFoodFacts call, no Gemini call, no re-scoring) if found.
Source: backend/src/controllers/scan.controller.ts:53-60
Ours: nothing like it (every scan calls Gemini; there is no exact-barcode short-circuit that skips the AI call entirely).
Fit: cost control directly - an exact-barcode cache hit that skips the AI call entirely is the single biggest cost lever in this whole survey, since a barcode's identity rarely changes; conflicts with nothing in "one AI call per scan" since it means zero calls, not two.

### Cross-client anchor/shoe mapping sync - WhiteChristmas
A single Firestore document holds a UUID-to-shoe-id map, updated with dotted-path writes and mirrored to every client via a live snapshot listener, so multiple headsets in the same room converge on one shoe-per-anchor mapping without re-running detection.
Source: Assets/Firebase/AnchorMappingManager.cs:69-138
Ours: nothing like it (no multi-device shared state).
Fit: none currently - relevant only for a shared-session feature.

### Size-bounded FIFO barcode cache, no time expiry - ha-wine-cellar
Barcode lookups are cached forever (no TTL) inside the same JSON file as the whole cellar; once the cache exceeds 500 entries, entries are evicted oldest-first to keep the file (rewritten on every save) from growing unbounded.
Source: custom_components/wine_cellar/wine_storage.py:455-476
Ours: nothing like it (no local barcode-to-answer cache; every scan calls Gemini).
Fit: cost control - a barcode's identity almost never changes, so a size-bounded no-expiry cache is a defensible way to never re-spend an AI call on a previously-seen barcode.

### checked_at / updated_at split - ha-wine-cellar
Both the Vivino refresh and AI batch-analysis paths write a `checked_at` timestamp on every attempt but only move `updated_at` when something in the record actually changed, so a retry that found nothing new is distinguishable from a record that was never looked up.
Source: custom_components/wine_cellar/websocket.py:1149-1159, 1269-1275
Ours: nothing like it documented for our scan rows.
Fit: calibration - distinguishing "we checked and nothing changed" from "we never checked" is a small, valuable bookkeeping fact for any record we periodically re-verify.

### Disk-backed photo storage with cache-busted filenames - ha-wine-cellar
Captured label photos are written to disk under `<id>-<front|back>-<epoch_ms>.<ext>`, served from a registered static path with cache headers; embedding a millisecond timestamp in the filename means a replaced photo gets a new URL, so a long-lived browser cache can never serve a stale image for a re-taken one.
Source: custom_components/wine_cellar/photos.py:33-97
Ours: our own photo consent/storage logic (server.ts:2667-2673) does not document a cache-busting filename scheme.
Fit: unsurprising - a one-line fix (timestamp in the filename) for a real class of stale-image bugs.

### Reference-counted photo pruning (mark-and-sweep, not TTL) - ha-wine-cellar
A prune step walks the current wine list and drink-history list, collects every filename still referenced by either, and deletes any file on disk not in that set, driven by what's still referenced rather than by what was just deleted.
Source: custom_components/wine_cellar/photos.py:173-201
Ours: nothing like it (no photo-pruning mechanism documented).
Fit: cheap - mark-and-sweep against live references is safer than a TTL for any asset that might still be needed by a record created long ago.

### Backup-time photo inlining round-trip - ha-wine-cellar
Photos live as disk files day-to-day, but are read back into base64 `data:` URLs only when a backup file is produced, so a single backup file is self-contained and restorable without the photo directory.
Source: custom_components/wine_cellar/photos.py:125-157
Ours: nothing like it.
Fit: none of our current objectives - relevant only if we ever ship a self-contained export/backup feature.

### Write-tmp-then-rename history with corruption quarantine - Scanly
Scan history is a flat JSON array written atomically (tmp file + rename); if the file fails to parse on load, it is renamed to a `.corrupt.json` file (preserved for manual recovery) rather than deleted or overwritten, and an empty list is returned to the caller. Capped at 50 items.
Source: history/data/HistoryManager.kt:17-168
Ours: nothing like it documented for any local file-based history.
Fit: calibration, no fabricated evidence - quarantining rather than silently discarding a corrupt file preserves the ability to find out what actually happened, matching our own "record as much as possible" instinct.

### Server-side self-replenishing question cache per room - qr-quiz
Each room keeps its own durable-storage array of pre-generated questions; a request drops the remaining cache below a low-water mark, which kicks off a non-blocking replenish call to top it back up, only falling through to a synchronous call when the cache does not have enough for the immediate request.
Source: party/index.ts:23-28, 41-125
Ours: nothing like it (no pre-generation/replenishment pattern; every scan is a fresh call).
Fit: instant, cost control - pre-generating and replenishing in the background so the user-facing request almost always hits a warm cache is a genuinely different latency/cost model than our per-scan call, worth considering for any predictable, repeatable AI output.

### Client-side prefetch pool mirroring the server cache - qr-quiz
Independent of the server cache, the browser keeps its own persisted pool sized to a small multiple of what's needed per round, calling the server ahead of running out, and only falling back to hardcoded demo content if both the pool and a live generation attempt come up short.
Source: src/store/quiz.ts:59-169, 270-288, 306-315
Ours: nothing like it (no client-side prefetch of any kind; our photo path's offline queue is for outgoing captures, not prefetched answers).
Fit: instant - a client-side prefetch buffer is a different latency lever than anything we currently have, relevant only where output is generic enough to prefetch ahead of a specific scan.

### Scan path never caches through the service worker - sugar-no-scanner-demo
The service worker skips all non-GET requests and every `/api/` path, serving an offline page for failed navigations and cached shell assets otherwise, so no recognition or lookup response is ever served from a stale cache.
Source: public/sw.js:26
Ours: nothing like it documented (we have no service worker layer described in `_ours.md`); our own no-fabricated-evidence posture is served the same way our AI answers are never cached and replayed as if fresh.
Fit: no fabricated evidence, calibration - an explicit rule that scan/lookup responses are excluded from any offline-shell cache is a clean, general guarantee that a stale answer is never silently served as current.

## Cost control, rate limiting and quotas

### Fixed window rate limiter keyed by hashed IP - sugar-no-scanner-demo
Allows 36 requests per 60 seconds by default, evicts the oldest entry once 5,000 keys are held, keyed on a hash of the forwarded IP; the comment states the camera produces roughly 29 frames per minute at a 2.1s cadence, so 36 is a deliberate margin over the client's own cadence.
Source: src/server/rate-limit.ts:16, 67
Ours: sliding-window limiter (30 calls/10min per device), plus invite-code and IP limiters before any paid call (server.ts:792-844).
Fit: cost control - sizing the limit explicitly against the client's own measured request cadence (rather than a round number) is a small, testable calibration idea for our own limiter.

### Deterministic sample scenes bypass the provider entirely - sugar-no-scanner-demo
For two named sample sources, a scripted answer tagged `model:"deterministic-sample-v1"` is returned with no Gemini call and no rate-limit charge, which is how the onboarding "sample results" screen works without camera permission.
Source: src/server/recognition.ts:931, src/app/api/recognize/route.ts:71
Ours: nothing like it (no demo/sample mode that bypasses the AI call).
Fit: cost control, effortless - a scripted demo path costs nothing and lets a new user see the product before granting camera permission.

### Retry-After honouring on 429 - sugar-no-scanner-demo
`retryAfterSeconds()` parses the `retry-after` header and defaults to 30 seconds when missing, non-numeric or non-positive; the UI shows "Scanning paused. Try again in Ns" and the loop stays paused.
Source: src/components/scanner-app.tsx:169, 626
Ours: `rate_limited` is a named failure code (api.js:473-543), but `_ours.md` does not document honouring a server `retry-after` header with a countdown.
Fit: unsurprising, calibration - showing the user an accurate countdown rather than a generic "try again" message is a small, honest improvement.

### Free scan paywall gate before the camera opens - sugar-no-scanner-demo
`realScanRequiresPayment` blocks starting the camera/upload once a free-scan count is exceeded, opening a paywall dialog instead of acquiring a stream; the free-scan count is deduplicated per session id.
Source: src/components/scanner-app.tsx:425, 1044, 1422
Ours: nothing like it (no paywall on the scan path).
Fit: none against "effortless" and "always answering" as our objectives are stated; kept for contrast, not adoption.

### Access expiry polled locally, not server side - sugar-no-scanner-demo
When paid access is active, the client re-checks expiry on a 60-second interval plus a window-focus listener, comparing a parsed expiry timestamp locally rather than making a billing round trip.
Source: src/components/scanner-app.tsx:1308
Ours: nothing like it (no paid-access expiry to poll).
Fit: none currently applicable.

### Bundled-key-only rate limiter - Scanly
The 5-request/5-minute cooldown applies only when the AI request uses the app's own bundled provider key; any provider where the user supplied their own key bypasses the limiter unconditionally.
Source: ui/ScanViewModel.kt:100-107, ui/ratelimit/RateLimitManager.kt:21-84
Ours: nothing like it (we do not support user-supplied keys; all calls are on our own budget, gated by device/IP/invite-code limiters).
Fit: cost control - relevant only if we ever let a user bring their own API key.

### Partial-reward-not-full-reset ad grant - Scanly
Watching a rewarded ad doesn't zero the quota counter; it sets the request count to one below the max, granting exactly one more request before the cooldown re-triggers, with no server-side verification of ad completion and no cap on repeats.
Source: core/ads/RewardedAdManager.kt:88-108, ui/ratelimit/RateLimitManager.kt:163-174
Ours: nothing like it (no ad-based quota mechanic).
Fit: none against our objectives - out of scope; the "grant one, not a full reset" shape is a calibration idea worth remembering if a reward mechanic is ever added.

### Ad-refresh cadence ahead of SDK expiry - Scanly
A loaded rewarded ad is discarded and reloaded every 55 minutes to stay ahead of AdMob's 1-hour ad expiry, in addition to reload-on-dismiss/show/fail.
Source: core/ads/RewardedAdManager.kt:29-30, 46-51, 78-107
Ours: nothing like it (no ads).
Fit: none currently applicable.

### Sequential batch AI with a fixed inter-call sleep - ha-wine-cellar
Batch "analyze all wines" runs one wine at a time in a loop with a 0.5-second sleep between calls specifically to avoid rate limits; only one storage save and one update event fire for the whole batch, not per wine.
Source: custom_components/wine_cellar/websocket.py:1255-1293
Ours: nothing like it (each scan is one independent call, no batch-analysis mode).
Fit: cost control - relevant only if we ever add a batch/bulk re-scan feature; a fixed inter-call delay is a simple, low-risk way to avoid bursting a provider's rate limit.

## Offline and queueing

### Firestore offline persistence enabled globally - food-scanner-gemini
`FirebaseFirestore.instance.settings = Settings(persistenceEnabled:true)` is set once at app start, giving local disk caching/offline read-through for every Firestore collection via the SDK's own built-in mechanism; it is the only caching layer in the app.
Source: lib/main.dart:25-27
Ours: our own offline handling is a purpose-built IndexedDB queue for the photo path specifically, not an SDK-level blanket offline cache (queue.ts:1-138).
Fit: effortless - a one-line SDK setting gives offline read-through for free, at the cost of far less control than our own queue's explicit retry/confirm semantics.

### Optional-DB no-op success stub - Scan-It
`POST /api/scans` and `GET /api/scans` both check for a database connection string at request time; if absent, POST returns HTTP 200 pretending success without writing anything, and GET returns an empty array, rather than erroring or running an in-memory store.
Source: server.ts:40-42, 53-55
Ours: our own storage writes are conditioned on real checks (a real scan row, a real device, an exact boolean consent flag) before anything is kept (server.ts:2667-2673, 2866-2886); we do not fake a 200 for an unconfigured store.
Fit: breaks "record as much as possible about every scan" and calibration - a fake-success response for a write that never happened is exactly the kind of confidently-wrong signal the priority order forbids; named plainly as an anti-pattern.

### Dual connectivity cross-check before surfacing "offline" - Scanly
An `IOException` is only classified as an offline message if a live connectivity poll independently confirms no connection at that exact moment; otherwise it's treated as a transient provider hiccup and retried. This determines whether the whole provider-fallback chain aborts early or keeps trying other providers.
Source: core/ai/GenerativeAiService.kt:102-105, core/ai/ProviderExecutor.kt:108-110
Ours: our client distinguishes `failure:'offline'` (a request that never reached the server or came back unrecognized) from other named failure codes, and only that case re-queues the capture (api.js:473-543).
Fit: calibration - independently confirming "no connection" before labeling a failure as offline (rather than inferring it from the exception type alone) avoids mislabeling a real provider error as a connectivity problem.

## Security, keys and abuse

### Hardcoded Gemini API key placeholder - food-scanner-gemini
`Gemini.init(apiKey:'your_api_key')` is called unconditionally at startup with a literal placeholder string, not an environment variable or secret store, so the AI feature is wired but non-functional as committed.
Source: lib/main.dart:17-18
Ours: our keys are server-side, read from environment variables (per CLAUDE.md hard rule: no secrets in the repo).
Fit: none - a hardcoded placeholder is a shipping bug, not a technique; kept for contrast.

### Build-time inlining of the Gemini key into the client bundle - Scan-It
Vite's `define` replaces the API key env var with its literal value at build time, baking the key as a string constant directly into the shipped browser JS; the SDK is instantiated and called straight from the browser with no server proxy route at all.
Source: vite.config.ts:6-12, src/App.tsx:11
Ours: our Gemini calls happen entirely server-side (identify/src/providers/); no client-side SDK key exists.
Fit: none - a client-visible API key is a direct abuse/cost vector (anyone can extract it and spend on our account); named plainly as a security hole, not copied.

### Header-based credential re-validation on every API call (no session token) - Mivro
Before every request (except four whitelisted auth routes), plaintext email/password headers are re-read and checked against a Firestore document plus a password-hash comparison on literally every scan/search/AI call - no session token, JWT, or cookie is issued despite a JWT library being present unused.
Source: python-app/middleware.py:7-38, python-app/database.py:143-158
Ours: nothing like it documented (our own auth model is not detailed in `_ours.md`, but device/IP/invite-code limiting is used instead of per-request password checks).
Fit: none against "instant" or "cheap" - re-validating a password hash against Firestore on every single call is unnecessary latency and cost for something a signed session token would solve for free; named as an anti-pattern.

### Hardcoded shared account baked into the browser extension - Mivro
Every install of the Chrome extension authenticates as the same literal credentials on every product-info fetch; there is no per-user login flow in the extension at all.
Source: browser-extension/background.js:29-30
Ours: nothing like it.
Fit: none - a shared hardcoded account defeats any per-user attribution or rate limiting; named plainly as a security hole.

### Client-activated, server-unenforced App Check - ai-calorie-counter
`FirebaseAppCheck.instance.activate(...)` runs at startup, attaching device-attestation tokens to outgoing calls, but the Cloud Function's `onRequest` options never set `enforceAppCheck:true` and the handler never inspects or verifies the attestation header, so it is generated but not checked anywhere on the actual paid endpoint.
Source: lib/main.dart:21-24; functions/index.js:9-16
Ours: nothing like it documented; our own abuse controls are rate limiters and invite/IP checks rather than device attestation (server.ts:792-844).
Fit: cost control if actually enforced - App Check is a real device-attestation mechanism that is half-wired here (present, unchecked); worth adopting fully (activate and enforce) rather than as shown, since an unenforced attestation provides zero actual protection against a scripted caller.

### Config-time live probe of an OpenAI-compatible relay - ha-wine-cellar
Saving a relay provider config sends a real 1-token request to the resolved chat endpoint before accepting the config, treating any non-5xx/non-401/403 response as proof the endpoint and auth work; the probe is skipped if the base URL and key are unchanged from the stored config.
Source: custom_components/wine_cellar/config_flow.py:194-252
Ours: nothing like it (no user-configurable provider endpoint to validate).
Fit: calibration - validating a user-supplied credential/endpoint with a near-zero-cost real call before accepting it, and skipping the probe when nothing changed, is a clean pattern if we ever accept user-supplied configuration.

### Cheap read-only key-verification probes - Scanly
`KeyVerifier` validates a key with a near-zero-cost call (mostly `GET /models`, or a 1-token chat completion for one provider) instead of a real generation; HTTP 429 during verification is treated as valid (key works, just rate-limited); two providers specifically treat 400 as invalid since their APIs return 400 for a bad key instead of 401/403. Debounced 500ms client-side.
Source: core/ai/KeyVerifier.kt:56-133
Ours: nothing like it (no user-supplied-key verification flow).
Fit: calibration, cost control - per-provider status-code interpretation (knowing that provider X returns 400, not 401, for a bad key) is exactly the kind of calibrated detail that avoids a false "invalid key" report.

### Scheme-injection guard on custom AI endpoints - Scanly
A user-typed custom endpoint missing a scheme is coerced to `https://`, specifically because a scheme-relative URL resolved against the app's own base URL could otherwise silently send the request (and the user's key) to the wrong host; only an absolute `http(s)` URL is allowed through.
Source: core/ai/EndpointUrl.kt:229-255
Ours: nothing like it (no user-configurable endpoint).
Fit: none currently applicable; a real, specific vulnerability class (credential exfiltration via URL resolution) worth remembering if we ever accept a user-typed endpoint.

### Regex-based API-key redaction in debug logs - Scanly
A fixed ordered list of regexes strips bearer tokens, key-bearing query params, and provider key-prefix patterns from any debug log line, active only in debug builds.
Source: core/ai/AiLog.kt:46-65
Ours: nothing like it documented for our own logging.
Fit: security - a cheap, mechanical guard against a key ending up in a log line, worth confirming we have an equivalent wherever we log request details.

### AES-GCM Keystore-backed key encryption with migration-safe read - Scanly
Provider keys are encrypted with a 256-bit hardware-backed AES-GCM key; a 12-byte IV is generated per encryption and prepended to the ciphertext; on decrypt failure the raw stored value is returned instead, tolerating pre-encryption plaintext already on disk, and a hardware-key-invalidated exception forces re-entry rather than silently failing.
Source: core/security/KeyCipher.kt, settings/data/datastore/SettingsDataStore.kt:28-41, 124-145
Ours: our keys live server-side in environment variables, not encrypted-at-rest on a client device; not directly comparable.
Fit: none currently applicable (we hold no client-side secrets to encrypt); the migration-safe fallback-to-plaintext-then-re-encrypt pattern is worth remembering if that ever changes.

### Download-on-demand script packs with SHA-256/size verification - Scanly
Per-script OCR packs and larger models are pulled from a remote repo at runtime; each download is verified against a published SHA-256 and size while streaming in 64KB chunks, rejected if under 1,000,000 bytes, and atomically renamed into place only after the hash matches.
Source: core/ocr/paddle/PaddleModelStore.kt:36-61, 213-249
Ours: nothing like it (no runtime model downloads).
Fit: security, no fabricated evidence - verifying a downloaded binary's hash and size before trusting it is a direct, reusable integrity check for any future runtime asset download.

### Same origin enforcement on every scan endpoint - sugar-no-scanner-demo
`hasTrustedBrowserOrigin` builds the trusted set from the request origin and forwarded host, accepts a matching origin or referer, rejects `sec-fetch-site:cross-site`, and deliberately permits a missing Origin header because Chromium omits it on same-origin JSON POSTs.
Source: src/server/request-origin.ts:1
Ours: nothing like it documented for our own endpoints.
Fit: security - a same-origin check on every scan endpoint is a cheap guard against another site driving calls against our budget.

### Streaming body size cap - sugar-no-scanner-demo
`readBoundedJson` checks the declared content-length then counts bytes while reading the stream, cancelling the reader and throwing past the limit; the recognize route allows 3,000,000 bytes, resolve 64,000, events 32,000, offers 8,000, barcode 2,000.
Source: src/server/request-body.ts:6, src/app/api/recognize/route.ts:24
Ours: our photo route caps at 3MB (server.ts:2562-2649), a similar order of magnitude but a simple check rather than a streaming byte-count-while-reading enforcement.
Fit: security - streaming enforcement (cancel mid-read past the cap) is stricter than checking content-length alone, since a client can lie about content-length; worth comparing to how our own 3MB cap is enforced.

### Image payload size cap in the schema - sugar-no-scanner-demo
The recognize request schema caps `imageDataUrl` at 2,800,000 characters, which is why the client's own downscale loop targets 2,650,000.
Source: src/app/api/recognize/route.ts:15, src/lib/client-image.ts:32
Ours: our 3MB cap is enforced but `_ours.md` does not document a matching client-side target below the server cap to guarantee the client never even attempts an oversized payload.
Fit: cheap - setting the client's own target comfortably below the server's hard cap avoids a client ever hitting a rejection it could have avoided.

### Camera permission declared at the header level - sugar-no-scanner-demo
`Permissions-Policy: camera=(self), microphone=()` plus `X-Frame-Options: DENY` and HSTS on every route, so the camera works only first-party and never inside an iframe embed.
Source: next.config.ts:47
Ours: nothing like it documented.
Fit: security - a header-level policy against iframe embedding of the camera is a cheap, standard hardening step.

### Source host allowlist - sugar-no-scanner-demo
`approvedWebProductUrl` accepts only HTTPS, no credentials, no port, a hostname in a fixed allowlist, a non-root path, explicitly rejects Open Food Facts hosts/localhost/bare IPs, then strips tracking parameters and sorts the rest.
Source: src/server/web-product-evidence.ts:17
Ours: nothing like it (we do not fetch third-party pages).
Fit: security, no fabricated evidence - an explicit allowlist (not a denylist) for any URL discovered via grounding, before ever fetching it, is directly relevant if we ever fetch a page a grounded search points to.

### Multer disk storage, unbounded - nutrigo
Uploads are written to disk with no `limits` (fileSize/files) and no `fileFilter` (no MIME/type check), so any file size or type is accepted onto disk before processing.
Source: backend/src/routes/scan.routes.ts:9
Ours: our photo route enforces a 3MB cap before processing (server.ts:2562-2649).
Fit: none - an unbounded, untyped upload accepted onto disk is a denial-of-service and storage-abuse vector; named plainly as a security hole, not copied.

### CORS wide open by default - nutrigo
Backend CORS middleware allows `origin: FRONTEND_URL || '*'` (wildcard if unset) with `credentials:true`.
Source: backend/src/app.ts:13-18
Ours: nothing like it documented (our origin policy is not detailed in `_ours.md`, but same-origin enforcement is a documented pattern seen elsewhere in this survey).
Fit: none - a wildcard origin combined with credentials is a known-bad CORS combination; named plainly as a security hole.

### Uploaded file always deleted after processing - nutrigo
The multer temp upload is deleted unconditionally after the OCR/lookup/vision chain completes, whether or not a product was found; the image is not persisted for later re-processing or audit.
Source: backend/src/controllers/scan.controller.ts:113
Ours: our own photo storage is consent-gated and conditional (three conditions including an exact boolean consent flag) rather than unconditionally deleted (server.ts:2667-2673, 2866-2886).
Fit: no fabricated evidence, record as much as possible - always deleting the source image means a disputed or wrong answer can never be audited against what was actually seen; our own consent-gated retention serves "record as much as possible about every scan" better, so this is worth noting as a tradeoff we already made correctly, not a gap.

## Telemetry and measurement

### No telemetry/analytics on the scan path - food-scanner-gemini
No analytics, crash-reporting, or logging-to-backend calls exist anywhere in the reviewed controllers/resources; the only logging is local debug `log`/`print` calls.
Source: lib/controllers/barcode_info_controller.dart:37, 75
Ours: every tap, screen view, and named scan event is queued client-side and flushed in batches (track.js:1-100).
Fit: none - the opposite of "record as much as possible about every scan"; kept for contrast.

### Telemetry dispatcher - sugar-no-scanner-demo
`track()` posts session id, browser session id, event name, source, product id, and metadata to an events endpoint with `keepalive:true`, swallows all errors, mirrors the event into a Meta pixel funnel, and is disabled entirely when owner access is true.
Source: src/components/scanner-app.tsx:394
Ours: our own telemetry batches up to 150 events via `fetch keepalive` deliberately instead of `sendBeacon`, because a beacon cannot carry our invite-code header (track.js:1-100).
Fit: none new for the transport; the owner-access opt-out and dual-destination mirroring (internal + Meta pixel) are the two details we do not currently document doing.

### Server side event pipeline - sugar-no-scanner-demo
The events route accepts only 26 enumerated event names, runs its own 300/minute limiter, rejects unsafe metadata, upserts a session row with a coarse user-agent class, inserts the event, stamps a completion timestamp on the terminal event, and forwards to Amplitude.
Source: src/app/api/events/route.ts:11, 98
Ours: nothing like it documented as a single pipeline (our events are persisted to localStorage and batched, but the server-side enum/limiter/completion-stamp shape is not described in `_ours.md`).
Fit: calibration, record as much as possible - an enumerated (not free-text) event name list plus a dedicated per-route rate limit is a concrete, cheap way to keep telemetry both bounded and structured.

### Amplitude forwarding with bucketing and property whitelist - sugar-no-scanner-demo
Posts to Amplitude with a 1500ms timeout, drops any string property longer than 80 characters, buckets recognition latency into four named ranges, and reduces free-form error messages to four fixed categories.
Source: src/server/amplitude.ts:103, 28, 35
Ours: nothing like it documented (we hold raw events, not a bucketed/whitelisted forward to a third-party analytics tool).
Fit: record as much as possible, but note the tension - bucketing latency and reducing error messages to four categories is a deliberate loss of detail in exchange for a bounded, query-friendly analytics property; worth deciding explicitly whether our own third-party forwarding (if any) should keep full detail or bucket the same way.

### Per-call latency instrumentation returned to caller - WhiteChristmas
Upload time, model-analysis time, and total time are measured with wall-clock deltas around each stage and returned in the response metadata block rather than sent to any external telemetry system.
Source: backend/src/main.py:309-318, 360-389
Ours: nothing like it (our cost accounting tracks token/dollar cost, not per-stage latency returned in the response, model-cost.ts:130-133).
Fit: calibration - returning latency breakdown in-band (not just logging it) makes debugging a slow call possible from the client side alone, with zero extra infrastructure.

### Firestore-append error/telemetry logging keyed by function name - Mivro
`runtime_error(function_name, error_message, **kwargs)` writes into an `errors` collection document named after the failing function, appending to a growing array via `ArrayUnion` so every function's failures accumulate in one place; called from nearly every route's except block.
Source: python-app/database.py:96-117
Ours: nothing like it documented as a single per-function error ledger.
Fit: record as much as possible - a simple, function-keyed running error log is a cheap way to see which part of the pipeline fails most, without building a full logging stack.

### "Not found" values are logged for later gap analysis - Mivro
Every barcode or keyword that produced a 404 is appended into one of two Firestore documents via `ArrayUnion`, called from both search misses - a running list of demand the catalog can't currently satisfy.
Source: python-app/database.py:80-94, python-app/search.py:35, 136
Ours: our rule is "a zero result is UNKNOWN until something proves the search could have found a hit" and "never report a sample's emptiness as a fact about the world" - a running miss-log is a direct, concrete instrument for exactly that standing rule.
Fit: calibration - this is one of the strongest direct matches to our own priority-order rule in the whole survey: a persistent, growing record of every miss is the mechanism that would let us actually prove or disprove "the search could have found a hit" over time.

### Debug request logger on every request - nutrigo
A blanket middleware logs every incoming request with method/URL before any route handling, and each route-mount step also logs to console; there is no structured/sampled telemetry, correlation id, or metrics.
Source: backend/src/app.ts:24-27
Ours: nothing like it (our telemetry is structured named events, not a blanket per-request console log).
Fit: none new - a plain console logger is strictly less useful than our structured event queue; kept for contrast.

## Performance tricks

### Double-buffered ImageReader - WhiteChristmas
`ImageReader.newInstance` is created with a hardcoded buffer count of 2 (double buffering), listener running on the main looper.
Source: Assets/DisplayCapture/DisplayCaptureManager.java:168-170
Ours: nothing like it (no native frame-buffer pipeline in a browser camera stream).
Fit: none directly applicable to our stack.

### Single reused direct ByteBuffer, no per-frame allocation - WhiteChristmas
One direct ByteBuffer sized exactly for the frame format is allocated once and reused every frame via clear+put, rather than allocating fresh per frame.
Source: Assets/DisplayCapture/DisplayCaptureManager.java:163-170
Ours: our own scan frame is downscaled to 960px before either decode pass touches it (camera.ts:113), but `_ours.md` does not document buffer reuse for that downscale step specifically.
Fit: cheap - reusing one buffer instead of allocating per frame is a general GC-pressure reduction technique applicable to our own canvas/pixel-buffer work if profiling shows allocation churn.

### Zero-copy handoff into Unity texture - WhiteChristmas
Unity takes the native buffer's raw pointer once and loads texture data directly from that pointer every frame, avoiding per-frame JNI byte marshalling.
Source: Assets/DisplayCapture/DisplayCaptureManager.cs:49-53, 105-109
Ours: nothing like it (not applicable across a JS/WASM boundary the same way, though zxing-wasm's own memory handling may have an analogous concern).
Fit: none directly verifiable without reading zxing-wasm's own internals.

### Optional GPU-side vertical flip - WhiteChristmas
If configured, the loaded texture is blitted into a same-size RenderTexture with a flipped UV scale then copied back, instead of flipping on CPU.
Source: Assets/DisplayCapture/DisplayCaptureManager.cs:111-115
Ours: nothing like it.
Fit: none directly applicable.

### GPU compute-shader batched depth sampling - WhiteChristmas
Depth lookups for a whole array of UV/world points are done in one compute-buffer dispatch per call instead of one shader dispatch per point.
Source: Assets/DepthKit/DepthToWorld.cs:29-60
Ours: nothing like it; not applicable outside AR depth sensing.
Fit: none directly applicable.

### Batched spatial-anchor load/erase - WhiteChristmas
Saved anchor UUIDs are persisted as a comma-joined string; loading/erasing chunks them into groups of 32 to respect the underlying anchor API's per-call batch limit.
Source: Assets/DisplayCapture/SpatialAnchorManager.cs:17-18, 84-89, 103-113, 198-207
Ours: nothing like it; not applicable without persistent spatial anchors.
Fit: none directly applicable.

### UI indicator pooling (only for detector-timing context) - WhiteChristmas
Both barcode and object indicator drivers pre-instantiate a fixed pool (capacity 5) of indicator objects at startup, growing it only if more simultaneous detections appear, toggling active state rather than destroying/recreating per frame.
Source: Assets/DisplayCapture/Barcode/IndicatorDriver.cs:11-21
Ours: nothing like it documented for our own coach/overlay UI.
Fit: cheap - object pooling for any per-frame UI indicator is a standard, portable technique if our own framing coach ever renders per-detection markers at high frequency.

### Integral-image adaptive local-threshold binarization - Scanly
The document "Black & White" filter builds a summed-area table over per-pixel luminance for O(1) local-mean lookups, then thresholds each pixel against its own neighborhood mean instead of one global threshold, so uneven lighting/shadow doesn't turn into black bands.
Source: core/image/DocumentFilters.kt:70-129
Ours: nothing like it (no document-filter mode).
Fit: accurate - a real technique for handling uneven shelf lighting if we ever apply a binarization pass ourselves.

### Per-task preprocessing profiles - Scanly
Three distinct bitmap pipelines are tuned separately: OCR retry (scale to 1024px min dimension, contrast x1.4, brightness +15), barcode retry (grayscale, contrast x1.6, no scaling), and GMS-less document fallback (scale to 1400px, contrast x1.25, brightness +10).
Source: core/image/ImagePreprocessor.kt:109-128
Ours: no equivalent retry-specific preprocessing profile is documented for our own barcode decode; we rely on zxing's own `tryHarder`/`tryDownscale` rather than app-side pre-processing (barcode.ts:1-24).
Fit: accurate - a dedicated grayscale+contrast retry pass specifically for barcode decode is a concrete, testable addition to our own decode-wedge recovery path.

### Fully local PP-OCRv6 pipeline over ONNX Runtime - Scanly
Five ONNX graphs run entirely on-device with a CPU-only execution provider (a code comment notes XNNPACK/NNAPI both abort natively on these graphs) and intra-op threads capped at min(cores,4).
Source: core/ocr/paddle/PaddleOcrEngine.kt:46-54
Ours: nothing like it (no local OCR pipeline).
Fit: none of our current objectives - OCR is out of scope for a barcode/price scanner; kept because nothing is dropped.

### Download-on-demand script packs with SHA-256/size verification - (see security theme)
Already placed under "security, keys and abuse."

### PaddleOCR-style CTC charset assembly with a blank gate - Scanly
The class list is blank+dictionary+space, matching PaddleOCR's own decoder; a manual softmax runs only if logits aren't already normalized, and an argmax blank can be overridden by the best non-blank alternative only if it clears a 0.15 gate and doesn't repeat the previous emitted class.
Source: core/ocr/paddle/PaddleModelStore.kt:271-299, core/ocr/paddle/PaddleOcrEngine.kt:454-567
Ours: nothing like it (no CTC decoding anywhere in our pipeline).
Fit: none of our objectives - OCR-specific, out of scope.

### DBNet detection post-processing without NMS - Scanly
A binarized probability map is connected-component-segmented; each component becomes a minimum-area rectangle, filtered by mean in-box probability and minimum short side, expanded by the DB "unclip" formula, capped at 3,000 candidates - box separation relies on connected-component segmentation, not IoU-based NMS.
Source: core/ocr/paddle/DbPostProcessor.kt:6-69
Ours: our own object detection merge uses IOU>0.4, the opposite approach (detector.ts:267-304).
Fit: accurate - worth knowing connected-component segmentation is a real alternative to IOU-based merging, though not obviously better for our COCO-class object framing use case.

### Perspective-warp line cropping with a skew-gated fast path - Scanly
Detected quads are unprojected with a linear solve plus bilinear sampling, except when computed skew is under a small threshold, in which case a native subrect copy replaces the full warp; crops taller than 1.5x their width are rotated 90 degrees before recognition.
Source: core/ocr/paddle/ImageOps.kt:167-337
Ours: nothing like it (no line-level OCR cropping).
Fit: instant - the general pattern (skip an expensive transform when the input is already close enough to straight) is a reusable performance idea beyond OCR specifically.

### Aspect-ratio-sorted recognition batching - Scanly
Line crops are sorted by aspect ratio before being chunked into fixed-size batches, so similarly-shaped crops share a batch and zero-padding waste is minimized.
Source: core/ocr/paddle/ImageOps.kt:108-148, core/ocr/paddle/PaddleOcrEngine.kt:190-213
Ours: nothing like it (no batched inference on variable-sized crops in our pipeline).
Fit: none of our current objectives - relevant only for a batched-inference OCR/vision pipeline we do not have.

### Cross-model page-flip detection - Scanly
Page upright/upside-down is decided by sampling the widest line crops and running them both ways through every bundled recognizer, not just the active script pack, because a wrong-script pack can score confident nonsense in one orientation; a flip is only applied if the best score clears a floor and beats the other orientation by a margin.
Source: core/ocr/paddle/PaddleOcrService.kt:25-45, 219-257, 378-383
Ours: nothing like it.
Fit: none of our current objectives - OCR-specific.

### Automatic script-pack correction pass - Scanly
If the primary script's read isn't densely Latin, every other bundled pack re-reads the same crops; a candidate only wins if it recovers more confident characters and its RTL fraction clears a threshold, guarding a roughly bilingual card against flipping to the wrong pack.
Source: core/ocr/paddle/PaddleOcrService.kt:259-282, 386-401
Ours: nothing like it.
Fit: none of our current objectives - OCR-specific.

### Per-line mixed-script re-recognition and merge - Scanly
Any line containing a non-dominant-script character, or scoring below a confidence floor, is recognized a second time with the universal/Latin model; a confident Latin run is spliced into the primary reading by shared position, only where the primary's own confidence over that span is weak.
Source: core/ocr/paddle/ScriptMerge.kt:19-147
Ours: nothing like it.
Fit: none of our current objectives - OCR-specific.

### Arabic word-space recovery from character pitch - Scanly
CTC recognition emits no explicit space class for Arabic script, so a space is inserted wherever the gap between characters exceeds 2.3x the line's median inter-character pitch and both neighbors fall in the Arabic Unicode block.
Source: core/ocr/paddle/RtlText.kt:14-144
Ours: nothing like it.
Fit: none of our current objectives - OCR-specific.

### Visual-to-logical RTL reorder preserving embedded LTR runs - Scanly
A decoded RTL line is reversed, then embedded Latin/number runs are re-reversed back to normal order and paired brackets/quotes are mirrored, rather than treating the whole line as one direction.
Source: core/ocr/paddle/RtlText.kt:24-71
Ours: nothing like it.
Fit: none of our current objectives - OCR-specific, though relevant if we ever localize into an RTL-language market.

### Recursive XY-cut reading order with axis tie-breaking - Scanly
Text boxes are ordered by recursively splitting the group on whichever axis has the wider normalized gap, gated by minimum gap size and side-coverage ratios, to a max recursion depth; RTL pages swap visiting order at each split.
Source: core/ocr/paddle/ReadingOrder.kt:5-151
Ours: nothing like it.
Fit: none of our current objectives - OCR-specific.

### Table structure decoded from an autoregressive HTML-token stream - Scanly
A table model's per-step token output is walked for row/cell tokens to build a grid; span attributes are clamped to survive model hallucination, and occupied grid cells are tracked in a packed set to prevent double-assignment from overlapping spans.
Source: core/ocr/paddle/TableDecoder.kt:14-145
Ours: nothing like it.
Fit: no fabricated evidence - clamping a hallucinated span value to a sane range before trusting it is a general validation idea applicable well beyond tables.

### Furniture-suppression heuristic in layout rendering - Scanly
Regions labeled header/footer/aside/page-number/seal are dropped from output only if their extracted text is short (<=24 chars), so a real heading mislabeled as a header still survives; lines the layout model missed entirely become synthetic full-width regions banded by row.
Source: core/ocr/paddle/DocumentStructure.kt:22-159
Ours: nothing like it.
Fit: none of our current objectives - OCR-specific.

### Read/write-lock-guarded ONNX session lifecycle - Scanly
ONNX sessions are singletons; inference calls take a shared read lock so concurrent recognitions can proceed together, while close takes the write lock and defers via a pending flag if inference is in flight, so native memory is never freed mid-run.
Source: core/ocr/paddle/PaddleOcrEngine.kt:56-125, 418-434
Ours: nothing like it (zxing-wasm's own lifecycle is not documented in `_ours.md`).
Fit: none directly verifiable; a sound concurrency pattern if we ever manage a native/WASM module's lifecycle ourselves.

### Cached raw-pixel buffer per source bitmap - Scanly
One `getPixels()` call (48MB for a 12MP photo) is cached per source bitmap and computed lazily, because repeated per-quad pixel extraction was previously the slowest stage of an offline scan.
Source: core/ocr/paddle/ImageOps.kt:150-163
Ours: nothing like it documented; our own downscale-to-960px happens once per scan frame rather than repeated per-region extraction (camera.ts:113).
Fit: cheap - lazily caching one expensive pixel-read per source image, rather than repeating it per region, is a general technique worth checking against any multi-pass processing we add.

### Streaming one-page-at-a-time PDF OCR - Scanly
PDF pages are rendered at a resolution matched to the recognizer's line height and OCR'd one page at a time, bounding peak memory to a single page bitmap rather than the whole document.
Source: core/pdf/PdfRendererHelper.kt:18-114
Ours: nothing like it (no PDF handling).
Fit: none currently applicable.

### Lazy-injected, memory-trimmed OCR engine - Scanly
The OCR engine is injected lazily so app startup doesn't build the inference graph, and it is explicitly closed (not just backgrounded) on a low-memory trim callback to free roughly 30MB of native memory, then rebuilt lazily on next use.
Source: App.kt:17-30
Ours: nothing like it documented for our own MediaPipe/zxing-wasm lifecycle.
Fit: cheap - lazy construction plus explicit release under memory pressure is a general mobile-performance pattern worth checking against our own MediaPipe detector's lifecycle (detector.ts:1-27).

### Pre-integration on-device VLM research harness (not shipped) - Scanly
An instrumentation-test-only harness loads a bundled on-device vision-language model via a local runtime and benchmarks OCR/table-recognition prompts against fixed local documents, logging per-case latency and memory to a report file; never reachable from shipped app code.
Source: app/src/androidTest/java/.../PaddleVlHarnessTest.kt:1-111
Ours: nothing like it (no on-device VLM evaluation).
Fit: cheap, calibration - a disciplined "benchmark before integrating" harness (latency + memory, fixed test cases, never shipped until proven) is a reusable evaluation methodology, independent of the specific model.

### In-band page-marker text repagination - Scanly
Multi-page OCR output is flattened into one text blob delimited by literal `--- Page N ---` marker lines, which the exporter regex-parses back into per-page PDF pages rather than carrying page boundaries as structured data through the pipeline.
Source: core/pdf/ScanExporter.kt:53
Ours: nothing like it (no multi-page document handling).
Fit: none currently applicable.

### Exponential-backoff websocket reconnect gated on clean-close - qr-quiz
On an unclean websocket close, the client schedules a reconnect at `1000*2^attempts` ms, capped at 5000ms; a clean close does not reconnect at all.
Source: src/store/partyConnection.ts:27-30, 76-89
Ours: nothing like it (no persistent websocket in our scanner).
Fit: none currently applicable - relevant only if we ever add a live/multi-device sync channel.

### Keystroke-driven idle timer that reloads the page - qr-quiz
An inactivity watchdog listens for mouse/keyboard/touch activity; after a delay it shows a countdown, and if it reaches zero it calls a full page reload rather than resetting any in-memory state - the app's only failure/reset path on the whole pipeline.
Source: src/components/InactivityTimer.tsx:14-41
Ours: nothing like it (no kiosk-mode idle reset).
Fit: none of our current objectives - relevant only for an unattended kiosk deployment; a full-page-reload reset is a blunt but reliable recovery mechanism worth remembering for that case.

### Detection overlay box mapping for object-fit - sugar-no-scanner-demo
`mapBoxToObjectCover` scales by the max of width/height ratios and clamps to the visible rectangle; `mapBoxToObjectContain` uses the min and keeps letterboxing, so model coordinates land correctly on both a cropped live preview and a fully visible uploaded photo.
Source: src/lib/camera-focus.ts:43, 77
Ours: nothing like it documented; our own overlay/coach positioning logic is not detailed in `_ours.md` at this level.
Fit: unsurprising - correct coordinate mapping between two different CSS object-fit modes is a small, exact-correctness detail worth checking our own overlay code against.

## Input routes other than a phone camera

### Left-eye MediaProjection capture - WhiteChristmas
`MediaProjection.createVirtualDisplay` mirrors the headset display via `VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR` into an ImageReader sized to the capture resolution (1024x1024 by default), starting 100ms after permission grant.
Source: Assets/DisplayCapture/DisplayCaptureManager.java:90-111
Ours: nothing like it (browser `getUserMedia` only).
Fit: none directly - an AR-headset-specific capture route, not a phone camera alternative.

### Foreground-service + notification workaround for background capture - WhiteChristmas
`MediaProjection` capture is kept alive via a foreground Service backed by a low-importance notification channel, a workaround since the platform's SDK does not expose passthrough directly.
Source: Assets/DisplayCapture/DisplayCaptureNotificationService.java:41-65
Ours: nothing like it (not applicable to a browser tab).
Fit: none directly applicable to our stack.

### Native camera-app fallback via `<input capture>` - ha-wine-cellar
When live `getUserMedia` is blocked or throws, the label-capture UI still offers a file input with `accept="image/*" capture="environment"`, which opens the device's own camera app (works even over insecure HTTP) and runs the same client-side resize/base64 pipeline on the result.
Source: frontend-src/src/components/label-camera.ts:231-273, 308-313
Ours: nothing like it (our photo path relies on `getUserMedia`; no documented fallback to the OS camera app if that API is blocked).
Fit: always answering - a native-camera-app fallback is a genuine input route we lack for the case where `getUserMedia` fails entirely (e.g. insecure context, permission denial with no recovery path).

### Barcode-miss auto-switch to label camera, capability-gated - ha-wine-cellar
On a failed/empty barcode lookup, the dialog checks a server-reported capability flag and, if true, automatically flips into label-photo mode instead of dead-ending on manual entry.
Source: custom_components/wine_cellar/add-wine-dialog.ts:622-631, 687-701
Ours: nothing like it; our barcode/text failure path falls back to a local pack lookup, not an automatic camera-mode switch (camera.js:3044-3056).
Fit: always answering - automatically offering the photo path the moment the barcode path fails, gated on whether AI is actually configured, is a direct way to avoid a dead end without a second AI call being guaranteed (it only fires if the user then captures a photo).

### Hidden always-focused input as a hardware-scanner wedge - qr-quiz
A permanently invisible, always-refocused `<input>` is the only "camera" the main app needs: a USB/Bluetooth barcode-scanner wedge device types into it like a fast typist, read purely through `onKeyDown`; no `getUserMedia`, no decode library, no camera permission prompt anywhere in this path.
Source: src/components/BarcodeScanner.tsx:11-69
Ours: nothing like it (we have no HID-wedge input route; every scan goes through `getUserMedia` and zxing-wasm).
Fit: instant, effortless, cheap - a hardware scanner needs zero decode cost, zero camera permission friction, and zero latency once it types; directly relevant if we ever support a kiosk/checkout-counter deployment with a physical scanner.

### Dual-trigger scan termination (Enter OR idle-300ms) - qr-quiz
Because a wedge scanner may or may not send a terminating Enter keystroke, every keystroke both checks for Enter (immediate submit) and resets a 300ms timeout that submits whatever is in the field if no further keystroke arrives; both paths read and clear the same value so only one ever fires.
Source: src/components/BarcodeScanner.tsx:72-103
Ours: nothing like it (not applicable without a HID-wedge input route).
Fit: instant - directly reusable if the hardware-wedge input route above is ever added; a genuinely correct way to end a scan the app doesn't otherwise control the framing of.

### Camera-scan-then-manual-submit remote control over HTTP+WebSocket - qr-quiz
A second device's camera scan is deliberately not auto-submitted; the user taps a button which does a plain `fetch()` GET to a room's HTTP endpoint, which decides command-vs-selection and re-broadcasts the value as JSON over the room's websocket to the display device - the phone's camera and the display's rendering are two different devices, bridged by an HTTP write plus a websocket fan-out.
Source: src/qr.ts:220-264, party/index.ts:127-148
Ours: nothing like it (single-device scanning only).
Fit: none of our current objectives - relevant only for a companion-device or shared-display scanning mode we do not have.

## Already ours

- No retry, no timeout, no offline path (food-scanner-gemini) - matches ours: single fetch attempt, no client-side retry, on the live scan call (`identify/src/providers/gemini-scan.ts`, per `_ours.md`).
- Server-side API-key proxy with Secret Manager (ai-calorie-counter) - matches ours: Gemini keys are server-side environment variables, never shipped to a client (per CLAUDE.md hard rule 5 and `_ours.md`'s server-side provider code).

Six further matches (getUserMedia constraint set and Generation params are thinking level and media resolution only, both sugar-no-scanner-demo; Camera constraint request, nutrigo; Inline base64 image no separate upload for inference and 30s hard timeout no retry on secondary-path HTTP call, both WhiteChristmas; Zero deterministic scoring - the LLM is the only judge, Scan-It; Error classification before any fallback, sugar-no-scanner-demo) are written as full body entries in their theme sections instead of repeated here, each one marked "Already ours" in place of a Fit line, to keep the source citation next to the theme it belongs to. Counted as body in Coverage.

## Numbers

| Value | Governs | Repo | Source |
|---|---|---|---|
| 400x150 px | scan-window crop, centered | Mivro | flutter-app/lib/widgets/barcode/barcode_scanner_list_view.dart:554-559 |
| 80% width x 45% width, offset -48px | scan-window crop | food-scanner-gemini | lib/pages/barcode_page.dart:12-16 |
| 10% inset, 16:9 | decorative overlay box (misaligned with scan window) | food-scanner-gemini | lib/pages/barcode_page.dart:44-48 |
| temperature 0.5, maxOutputTokens 6000, topP 1.0, topK 40 | unused (commented-out) Gemini generation config | food-scanner-gemini | lib/controllers/barcode_info_controller.dart:59-65 |
| energy/sugars/satFat/sodium=10, fiber/fruitsVeg/protein=5 | Nutri-Score 2021 point-max fallback | food-scanner-gemini | lib/models/nutriscore.dart:210-247 |
| 640x480 px | capture canvas | nutrigo | app/dashboard/scanner/page.tsx:366 |
| 8000 ms | OFF barcode/text-search timeout | nutrigo | backend/src/lib/openFoodFacts.ts:22, 71 |
| 5000 ms | OFF HEAD existence-check timeout (unused) | nutrigo | backend/src/lib/openFoodFacts.ts:98 |
| 10000 ms | generic httpClient default timeout (unused on scan path) | nutrigo | backend/src/utils/httpClient.ts:6 |
| 300 s | Next.js scan-image route maxDuration | nutrigo | app/api/scan/image/route.ts:5 |
| 8-13 digits | OCR barcode-shaped regex | nutrigo | backend/src/controllers/scan.controller.ts:90 |
| 50 chars | OCR text sent to OFF text search | nutrigo | backend/src/controllers/scan.controller.ts:103 |
| >2 chars | minimum OCR text length to attempt text search | nutrigo | backend/src/controllers/scan.controller.ts:101 |
| page_size 1 (scan) / 6 (alternatives) | OFF search result count | nutrigo | backend/src/lib/openFoodFacts.ts:67; scan.controller.ts:397 |
| sugar>25g/-30 cap, cal>300/-20 cap, sodium>500mg/-15 cap, protein>5g/+15 cap, fiber>3g/+10 cap | local health-score formula | nutrigo | backend/src/controllers/scan.controller.ts:31-35 |
| low 0-39, med 40-69, high 70-100 | Gemini-prompt health-score bands | nutrigo | backend/src/controllers/scan.controller.ts:176-178 |
| fat>20g, sugar>10g, sodium>500mg per 100g | Gemini-prompt warning thresholds | nutrigo | backend/src/controllers/scan.controller.ts:180-182 |
| currentScore-10, top 12 | alternatives static-DB score filter/cap | nutrigo | backend/src/routes/alternatives.routes.ts:2950-2954 |
| 5-7 items, score range 60-95 | AI-generated alternatives count/range | nutrigo | backend/src/routes/alternatives.routes.ts:3018, 3042 |
| 40/30/20/10, 30/10, 20/10/5, 10/5 | client match-score weight buckets (health/subcat/calorie/brand) | nutrigo | lib/getSmartAlternatives.ts:164-198 |
| x2.5 | salt-from-sodium conversion factor | nutrigo | backend/src/lib/openFoodFacts.ts:49 |
| /4.184 | kJ-to-kcal conversion divisor | nutrigo | backend/src/lib/openFoodFacts.ts:41 |
| 1024x1024 px | AR display-capture texture size | WhiteChristmas | Assets/DisplayCapture/DisplayCaptureManager.cs:15 |
| 2 | ImageReader buffer count (double buffered) | WhiteChristmas | Assets/DisplayCapture/DisplayCaptureManager.java:168 |
| 300 dpi | virtual display DPI | WhiteChristmas | Assets/DisplayCapture/DisplayCaptureManager.java:109 |
| 100 ms | capture-start delay after permission grant | WhiteChristmas | Assets/DisplayCapture/DisplayCaptureManager.java:90 |
| 82 deg | assumed FOV for AR reprojection | WhiteChristmas | BarcodeTracker.cs:12, ObjectTracker.cs:16 |
| 30 samples | position history length per tracked object | WhiteChristmas | ObjectTracker.cs:17 |
| 0.5 m | outlier distance threshold | WhiteChristmas | ObjectTracker.cs:20 |
| 15 samples | minimum samples before anchor creation | WhiteChristmas | ObjectTracker.cs:19 |
| 0.1 m | position stability threshold / anchor dedup radius | WhiteChristmas | ObjectTracker.cs:18, 250 |
| 5 s | tracked-object timeout | WhiteChristmas | ObjectTracker.cs:21 |
| JPEG quality 75 | ROI crop before shoe-detect AI call | WhiteChristmas | ImageUtils.cs:25 |
| >0.8 confidence | secondary-AI confidence gate | WhiteChristmas | ObjectDetectionGCPIntegration.cs:37 |
| 70% | prompted shoe-match confidence bar | WhiteChristmas | shoe-detection/index.ts:62 |
| 30 s | Cloud Run request timeout, no retry | WhiteChristmas | ObjectAnalysisService.cs:55 |
| 32 | spatial-anchor batch size (load/erase) | WhiteChristmas | SpatialAnchorManager.cs:18 |
| temperature 0, top_p 0.95, max_output_tokens 8192 | Cloud Run Gemini generation config | WhiteChristmas | backend/src/main.py:233-236 |
| 4 images/call, 512px cell, 10px border | image-grid batching | WhiteChristmas | backend/src/main.py:26, 56, 69 |
| 1500 ms | decode-ceiling per barcode decode (wedge detection) | shin (ours) | app/src/eye/barcode.ts:44-53 |
| 3 strikes | consecutive decode timeouts before wedge state | shin (ours) | app/src/eye/barcode.ts:44-53 |
| 1500 ms window / 1000 ms min span / 5 frames min | barcode vote window | shin (ours) | app/src/eye/votes.ts:74-80 |
| 55% frame fill, 4x zoom cap, 0.9-1.25 deadband | zoom targeting | shin (ours) | app/src/eye/camera.ts:333-366 |
| luminance 52/255 threshold, 700ms hold, 1.6x clear | torch auto mode | shin (ours) | app/src/eye/torch.ts:74-90 |
| 20% clipped pixels | torch glare shutoff | shin (ours) | app/src/eye/camera.ts:584-608 |
| 180 ms | detect/coach cadence ceiling | shin (ours) | app/src/eye/camera.ts:368-383 |
| 960 px | scan frame downscale width | shin (ours) | app/src/eye/camera.ts:113 |
| 7 frames, 45 ms apart | burst capture | shin (ours) | app/src/eye/capture.ts:41-72 |
| 500 ms hold, 6% drift | auto-capture stability gate | shin (ours) | app/src/eye/capture.ts:189-231 |
| 8% padding, 1568px max long edge | photo crop | shin (ours) | app/src/eye/capture.ts:142-180 |
| 1600 ms | tap-to-pick grace period | shin (ours) | app/src/eye/camera.ts:469-486 |
| 40 shots/visit, 5000ms min gap, luminance>=12, 0.08 signature distance | background shelf-photo capture gate | shin (ours) | app/src/eye/shelf.ts:1-33, 102-148 |
| 30s | Gemini call timeout | shin (ours) | identify/src/providers/gemini-scan.ts:826 |
| CAD $10 soft / $100 hard | spend caps | shin (ours) | identify/src/cap.ts |
| 60 min unshown expiry, 2 yr max | grounded-result retention | shin (ours) | app/src/grounded-record.ts:110-252 |
| 30 calls/10 min per device | photo-route rate limit | shin (ours) | app/server.ts:792-844 |
| 3 MB | photo upload cap | shin (ours) | app/server.ts:2562-2649 |
| 2000 events, batches of 150 | telemetry queue bounds | shin (ours) | app/public/js/track.js:1-100 |
| 4.1 | luminance-edge blur-rejection threshold | sugar-no-scanner-demo | src/components/scanner-app.tsx:147 |
| 13 (0-255), stride 16 | motion-rejection threshold | sugar-no-scanner-demo | src/components/scanner-app.tsx:914 |
| 96x72 px | motion/blur sampling canvas | sugar-no-scanner-demo | src/components/scanner-app.tsx:148 |
| 1920x1080 @ 30fps | camera request | sugar-no-scanner-demo | src/components/scanner-app.tsx:986 |
| 960 px max width, JPEG q0.68 | camera capture canvas/quality | sugar-no-scanner-demo | src/components/scanner-app.tsx:933, 952 |
| JPEG q0.78, 1280px max, 0.8x shrink/pass, floor 0.25 | upload downscale loop | sugar-no-scanner-demo | src/lib/client-image.ts:11 |
| 2,650,000 chars | upload data-URL ceiling (client) | sugar-no-scanner-demo | src/lib/client-image.ts:32 |
| 2,800,000 chars / 3,000,000 bytes | server imageDataUrl schema cap / recognize body cap | sugar-no-scanner-demo | src/app/api/recognize/route.ts:15 |
| 340 ms kickoff, 240 ms interval, 1000 ms min capture, 1250 ms forced capture | camera capture cadence | sugar-no-scanner-demo | src/components/scanner-app.tsx:141-147 |
| difference<=25, confidence>=0.38, formula 1-diff/42 | same-scene acceptance | sugar-no-scanner-demo | src/lib/live-camera-tracking.ts:92, 74, 42 |
| 6x5 grid, threshold max(13, p68), top 6 | candidate proposal grid | sugar-no-scanner-demo | src/lib/live-camera-tracking.ts:96 |
| 10 | max products per scan (MAX_SCAN_PRODUCTS) | sugar-no-scanner-demo | src/lib/scan-limits.ts:1 |
| overlap 0.5 (generic) / 0.65 (multilingual) | dedupe merge thresholds | sugar-no-scanner-demo | src/lib/upload-scan.ts:87; product-detection-dedupe.ts:86 |
| 0.72 broad / 0.58 focused | recognition confidence threshold | sugar-no-scanner-demo | src/server/recognition.ts:35 |
| 0.02 x 0.02 normalized | minimum detection box size | sugar-no-scanner-demo | src/server/recognition.ts:1064 |
| 15,000 ms default, clamp 1,000-60,000 | Gemini call timeout | sugar-no-scanner-demo | src/server/recognition.ts:132 |
| attempts 2, delay 0.4-0.8s, expBase 2, jitter 0.25 (primary); 1 attempt (fallback) | Gemini 503 retry policy | sugar-no-scanner-demo | src/server/recognition.ts:145 |
| max 4 ambiguous sets, 2 packshots each, 2500ms image fetch timeout, 750,000 byte cap | candidate confirmation | sugar-no-scanner-demo | src/server/recognition.ts:511, 515, 473, 479 |
| trigger 0.62 (0.52 single-candidate), accept 0.92 | confirmation thresholds | sugar-no-scanner-demo | src/server/recognition.ts:222, 452 |
| accept 0.9, base bonus 0.35 | catalog fuzzy match | sugar-no-scanner-demo | src/server/recognition.ts:323 |
| ratingSignalCount>=2 | confirmed-nutrition requirement | sugar-no-scanner-demo | src/server/recognition.ts:605 |
| confidence 0.9 | shelf-price trust gate | sugar-no-scanner-demo | src/server/recognition.ts:253 |
| concurrency 3 default / 5 override / 5 client | resolution concurrency | sugar-no-scanner-demo | src/server/recognition.ts:648; resolve-products/route.ts:55; scanner-app.tsx:462 |
| 12,000 ms default, clamp 10,000-30,000 | web-nutrition/grounding timeout floor | sugar-no-scanner-demo | src/server/web-nutrition.ts:13, 221 |
| 6 hr miss cache, 5 min stale TTL | web-nutrition cache | sugar-no-scanner-demo | src/server/web-nutrition.ts:16 |
| confidence 0.9 | web-nutrition exact-match acceptance (pre page-verification) | sugar-no-scanner-demo | src/server/web-nutrition.ts:235 |
| 5000 ms, max 2 redirects, 1,500,000 byte cap | retailer page fetch | sugar-no-scanner-demo | src/server/web-product-evidence.ts:253, 254, 273 |
| 45,000 ms, temperature 0, max 3 URLs | shelf-research URL discovery (disabled by default) | sugar-no-scanner-demo | src/server/shelf-research.ts:55, 61 |
| 4000 ms timeout, 30 min cache TTL | OFF API client | sugar-no-scanner-demo | src/server/open-food-facts.ts:387, 76 |
| 60,000 ms | catalog memory cache TTL | sugar-no-scanner-demo | src/server/catalog-repository.ts:39 |
| 36 req/60s per IP, 5,000 max keys | scan rate limit | sugar-no-scanner-demo | src/server/rate-limit.ts:16, 31 |
| 300 req/60s | events-route rate limit | sugar-no-scanner-demo | src/app/api/events/route.ts:11 |
| 30 s default | retry-after fallback | sugar-no-scanner-demo | src/components/scanner-app.tsx:171 |
| 1500 ms timeout, 80-char property cap | Amplitude ingestion | sugar-no-scanner-demo | src/server/amplitude.ts:119, 15 |
| private, max-age=300 | barcode/offers response cache header | sugar-no-scanner-demo | src/app/api/barcode/route.ts:42 |
| 60,000 ms | paid-access expiry re-check interval | sugar-no-scanner-demo | src/components/scanner-app.tsx:1319 |
| 24 pool cap | alternatives ranking pool | sugar-no-scanner-demo | src/server/catalog-repository.ts:138 |
| 2 | consecutive matching frames required before barcode accepted | Scanly | BarcodeAnalyzer.kt:20 |
| 100 ms | barcode-decode throttle interval | Scanly | BarcodeAnalyzer.kt:59 |
| 960 px | DBNet detection resize cap | Scanly | PaddleOcrService.kt:21 |
| 0.2 / 0.45 | DB binarization / box-score threshold | Scanly | DbPostProcessor.kt:7-8 |
| 1.4 | DB unclip (box expansion) ratio | Scanly | DbPostProcessor.kt:9 |
| 3000 | max detected boxes per page | Scanly | DbPostProcessor.kt:11 |
| 48px height, [16,3200]px width, batch 6 | recognition crop/batch | Scanly | PaddleOcrEngine.kt:17,21,22 |
| 0.15 | CTC blank-vs-alternative gate | Scanly | PaddleOcrEngine.kt:456 |
| 1.15x / 3.0 | page-flip margin / min score to act | Scanly | PaddleOcrService.kt:30,34 |
| 25 chars/line | dense-Latin-page threshold | Scanly | PaddleOcrService.kt:39 |
| 0.6 | RTL fraction required to switch script pack | Scanly | PaddleOcrService.kt:45 |
| 2.3x | Arabic word-gap-to-pitch ratio | Scanly | RtlText.kt:14 |
| 14 | reading-order recursion depth cap | Scanly | ReadingOrder.kt:12 |
| 1,000,000 bytes | minimum accepted downloaded-model size | Scanly | PaddleModelStore.kt:216 |
| 1536px / q85 | max image edge / JPEG quality before an AI call | Scanly | PayloadFactory.kt:200-201 |
| 20 | MAX_SCAN_PAGES hard ceiling | Scanly | AiProvider.kt:215 |
| 1 / 5 / unlimited | per-provider max images per AI request | Scanly | AiProvider.kt:191-201 |
| 0.1 | fixed temperature (Gemini, OpenAI-compatible providers) | Scanly | GeminiApi.kt:61 |
| 3 attempts, 1200ms base + 600ms jitter backoff | AI provider retry | Scanly | ProviderExecutor.kt:149,164-165 |
| 90s base + 20s/image, cap 240s | AI per-attempt timeout | Scanly | ProviderExecutor.kt:167-169 |
| 5 req / 300 s | bundled-key AI rate limit | Scanly | RateLimitManager.kt:21-23 |
| 55 min | rewarded-ad reload interval | Scanly | RewardedAdManager.kt:30 |
| 10 s, 2 attempts, 500ms delay | per-lookup-engine timeout/retry | Scanly | LookupOrchestrator.kt:13,20-22 |
| 50 items | max scan-history retained | Scanly | HistoryManager.kt:73,77 |
| 1920x1920 px, quality 85 | image-picker downscale | ai-calorie-counter | analysis_screen.dart:93 |
| 512 MiB, 60 s | Cloud Function memory/timeout | ai-calorie-counter | functions/index.js:14,36 |
| 60 s | client HTTP timeout on analyze call | ai-calorie-counter | firebase_service.dart:33 |
| 0-10 | AI-assigned usefulness/health score scale | ai-calorie-counter | functions/index.js:57 |
| 250x250 px | decorative barcode overlay (unused) | ai-calorie-counter | barcode_scanner_screen.dart:72-73 |
| gemini-3.1-pro-preview | single hardcoded model, no fallback | Scan-It | src/App.tsx:90 |
| 50 mb | Express JSON body size limit | Scan-It | server.ts:11 |
| 10 | history list cap | Scan-It | server.ts:56 |
| 1-3 items | healthierAlternatives schema count | Scan-It | src/App.tsx:141 |
| 500 entries, FIFO, no TTL | barcode cache | ha-wine-cellar | wine_storage.py:455-476 |
| 12 hr | Vivino auto-sync interval | ha-wine-cellar | const.py |
| 0.15 word-overlap (Jaccard) | query relevance threshold | ha-wine-cellar | vivino.py:113 |
| $6.00 floor | price plausibility check | ha-wine-cellar | vivino.py:531 |
| 0.5 s | batch AI inter-call sleep | ha-wine-cellar | websocket.py:1283 |
| 45s label/single-wine, 180s wine-list/collection | AI call timeouts | ha-wine-cellar | gemini.py:312,398,598,673 |
| 15s Vivino explore/HTML/mobile, 10s UPC/OFF/grape | Vivino/other lookup timeouts | ha-wine-cellar | vivino.py |
| 10s, max_tokens 1 | config-flow AI probe | ha-wine-cellar | config_flow.py:226,236 |
| temperature 0.1 (label/list), 0.2 (single-wine) | AI temperature | ha-wine-cellar | gemini.py:312,398,598 |
| page_size 5 | Vivino explore results per query | ha-wine-cellar | vivino.py:487 |
| 5 formats | barcode symbologies requested | ha-wine-cellar | barcode-scanner.ts:165 |
| 1280x720 (barcode), 960x1280 (label) | camera constraints | ha-wine-cellar | barcode-scanner.ts:153, label-camera.ts:172-176 |
| 1024px @ q0.8 (capture), 640px @ q0.78 (thumbnail) | image resize | ha-wine-cellar | label-camera.ts:202,215; image.ts:5 |
| 8-14 digits | AI-read barcode field length check | ha-wine-cellar | gemini.py:359 |
| 1900-2030 | vintage sanity range | ha-wine-cellar | gemini.py:329 |
| 300 ms | wedge-scanner idle-submit timeout | qr-quiz | BarcodeScanner.tsx:76,93 |
| maxScansPerSecond 5 | companion-page camera scan rate cap | qr-quiz | src/qr.ts:188 |
| 1000ms base, doubling, 5000ms cap | websocket reconnect backoff | qr-quiz | partyConnection.ts:27-28,83 |
| 20 initial / 50 low-water / 30 replenish | question cache sizing | qr-quiz | party/index.ts:25-27 |
| 5s delay / 25s total | inactivity countdown/reload | qr-quiz | uiSignals.ts:20-21 |
| gemini-2.0-flash | model used for question generation | qr-quiz | party/questionGenerator.ts:81 |

## Prompts, verbatim

food-scanner-gemini, lib/controllers/barcode_info_controller.dart:66
```
Give me advantange and disadvantage of this product: ${product.name} ${product.brands}  Barcode: ${barcode}
```

nutrigo, backend/src/controllers/scan.controller.ts:147-211 (Gemini Vision prompt)
```
You are a nutrition expert analyzing a food product image. Follow these instructions carefully:

1. PRODUCT IDENTIFICATION (MANDATORY):
   - Extract the product name and brand from the package
   - Identify the specific product type (e.g., "potato chips","Bingo","Lays" ,"chocolate cookies", "energy drink")
   - Determine the product category (snacks, beverages, dairy, bakery, etc.)

2. NUTRITION FACTS EXTRACTION:
   - First, look for the nutrition facts table/label on the package (back, side panel, near barcode)
   - If VISIBLE, extract exact values per 100g: Calories (kcal), Fat (g), Sugar (g), Protein (g), Carbs (g), Sodium (mg)
   - If nutrition facts are NOT visible, set "nutritionVisible": false

3. NUTRITION PREDICTION (WHEN LABEL NOT VISIBLE):
   - If you identified the product name but nutrition label is NOT visible:
     * Use your knowledge of typical nutritional values for that specific product name
     * Predict realistic values based on the product name and category
     * Example: "Lays Classic Potato Chips" → ~536 kcal, 34g fat, 1g sugar, 6g protein, 53g carbs per 100g
     * Example: "Coca Cola" → ~42 kcal, 0g fat, 10.6g sugar, 0g protein, 10.6g carbs per 100ml
     * Mark predictions with "dataSource": "predicted from product name"
   - NEVER return 0 or null for all values if you know the product name

4. INGREDIENTS:
   - Look for the ingredients list (usually starts with "Ingredients:")
   - Extract all ingredients in order if visible
   - If NOT visible but you know the product, predict typical ingredients
   - Set "ingredientsVisible": true (if read from image) or false (if predicted)

5. HEALTH ASSESSMENT:
   - Calculate health score (0-100) based on nutritional values:
     * Low score (0-39): High sugar (>15g/100g), high fat (>25g/100g), high sodium (>600mg/100g), ultra-processed
     * Medium score (40-69): Moderate values, some processing
     * High score (70-100): Low sugar/fat, high protein/fiber, minimal processing
   - Generate specific warnings:
     * "High fat (estimated)" if fat > 20g/100g
     * "High sugar (estimated)" if sugar > 10g/100g
     * "High sodium (estimated)" if sodium > 500mg/100g
     * "Ultra-processed" for chips, soda, candy, instant noodles
     * Add "(estimated)" suffix for predicted values

6. RESPONSE FORMAT:
Return ONLY valid JSON (no markdown, no code blocks):
{
  "name": "specific product name",
  "brand": "brand name",
  "category": "product category",
  "servingSize": "per 100g",
  "nutritionVisible": true or false,
  "calories": number (REQUIRED - never null),
  "fat": number (REQUIRED - never null),
  "sugar": number (REQUIRED - never null),
  "protein": number (REQUIRED - never null),
  "carbs": number (REQUIRED - never null),
  "sodium": number (REQUIRED - never null),
  "ingredientsVisible": true or false,
  "ingredients": ["ingredient1", "ingredient2"],
  "healthScore": number 0-100,
  "warnings": ["warning 1", "warning 2"],
  "dataSource": "nutrition label visible" OR "predicted from product name"
}

CRITICAL RULES:
- ALWAYS provide nutritional values (never 0, never null for all fields)
- If nutrition label is NOT visible, predict values based on the product name and type
- Be realistic and accurate with predictions based on your knowledge
- Add "(estimated)" to warnings when values are predicted
```

nutrigo, backend/src/controllers/scan.controller.ts:251-283 (text-only fallback)
```
Analyze this food: ${input}. Return ONLY valid JSON with fields { name, brand, calories, fat, sugar, protein, carbs, category, healthScore (0-100), ingredients, warnings }
```

nutrigo, backend/src/routes/alternatives.routes.ts:3016-3044 (alternatives)
```
You are a nutrition expert. The user scanned "${currentProduct}" which has a health score of ${currentScore}/100 in the ${category} category (${subCategory}).

Suggest 5-7 REAL Indian packaged food alternatives that are:
1. In the SAME category (${subCategory} ${category})
2. Healthier (higher health score)
3. Actually available in Indian stores (Blinkit, Zepto, BigBasket, Swiggy)

Return ONLY a JSON array with this exact structure:
[
  {
    "name": "Product name",
    "brand": "Brand name",
    "health_score": 75,
    "nutrition": {
      "calories": 120,
      "sugar": "5g",
      "protein": "3g",
      "fiber": "2g"
    },
    "benefits": ["Benefit 1", "Benefit 2", "Benefit 3"],
    "description": "One sentence description"
  }
]

IMPORTANT: 
- Only suggest REAL products available in India
- Health scores must be 60-95 range
- All products must be better than ${currentScore}
- Focus on ${subCategory} alternatives
```

WhiteChristmas, firebase/functions/src/services/shoe-detection/index.ts:53-84 (shoe detection)
```
You are a shoe detection expert. Your task is to identify shoes in images and find the best match from our database.
              
              Follow these guidelines:
              1. If you see a shoe in the image, use the getShoesList tool to fetch the list of known shoes.
              2. Try to find the closest match from the database, considering:
                 - The overall style and design of the shoe
                 - The brand if visible
                 - The color scheme (though color alone shouldn't determine a match)
                 - Distinctive features or patterns
              3. Return the best matching shoe name from the database if you're reasonably confident (70% or higher similarity)
              4. Only return "UNKNOWN_SHOE" if:
                 - The shoe is clearly different from all options in the database
                 - You can't make out enough details to make a reasonable match
              5. Return "SHOE_NOT_FOUND" only if there is no shoe visible in the image
              
              IMPORTANT: Your response must be EXACTLY one of:
              - A shoe name that exactly matches one from the database
              - "UNKNOWN_SHOE"
              - "SHOE_NOT_FOUND"
              
              DO NOT include any additional text, explanations, or sentences. Just return the exact match or status.
```
Followed by a second user-turn message: `"What is the name of this shoe? Use the getShoesList tool and return ONLY the exact matching name or status."`

Scan-It, src/App.tsx:96 (vision + grounding + schema)
```
Analyze this product image. If it shows an ingredient label, extract the ingredients. If it shows a barcode or product packaging, identify the product and determine its typical ingredients using Google Search. For each ingredient, provide its simple common name, a brief description, its health impact ('Positive', 'Neutral', or 'Negative'), and a scientific/nutritional reasoning for this impact. Also provide a guessed product name, an overall safety assessment, and suggest 1-3 specific healthier alternative products available in the market with a reason why they are better. If no ingredients can be found, return an empty array for ingredients and explain in the summary.
```

Scanly, core/ai/AiPrompts.kt:86-125 (photocopier transcription)
```
You are a document transcription engine that works like a photocopier with Markdown as its paper: whatever is printed on the page comes out unchanged, in the same order, with the same emphasis and the same spacing. You reproduce documents. You never interpret, improve, complete or summarise them.

TEXT — copy, never rewrite
- Transcribe every visible character: body text, titles, headers, footers, page numbers, captions, labels, form fields, stamps, watermarks, handwriting, margin notes, and text inside logos, charts or figures.
- Keep the printed spelling, casing and word order — including typos, ALL CAPS, and unusual capitalisation. Never correct, translate, modernise, expand or reword anything.
- Keep every diacritic and accent exactly as printed (é, ü, ñ, ç, Arabic tashkeel and hamza forms).
- Keep the original script; never transliterate.

NUMBERS — the easiest thing to get wrong; slow down here
- Read digits one at a time and copy them exactly. Never round, recompute, reorder or "fix" a number that looks wrong to you.
- Keep the printed digit script (0-9, ٠-٩, ۰-۹), thousands separators, decimal marks, leading zeros, signs, percent signs and currency symbols in their printed positions.
- Copy dates, phone numbers, IDs, invoice and reference numbers, IBANs and codes character for character, including their separators (/ - . and spaces).
- If a digit is ambiguous, pick the most likely reading and mark that number [unclear]. Never invent a digit.

EMPHASIS — map what you SEE
- Bold -> **bold**; italic -> *italic*; bold italic -> ***both***; underline -> <u>text</u>; strikethrough -> ~~text~~.
- Titles and headings -> # ## ### #### by visual rank (size, weight, position); the largest is #. A bold line that acts as a section title is a heading, not bold body text.
- Superscript -> <sup>x</sup>; subscript -> <sub>x</sub>.
- Bulleted lists -> "- ". Numbered lists keep the printed number and its punctuation ("3." stays "3.", "b)" stays "b)").
- Checkboxes -> "- [ ]" or "- [x]" matching the mark actually on the page.

LAYOUT — preserve the shape of the page
- Break lines exactly where the page breaks them. Never merge, re-wrap or join lines.
- Keep blank lines between blocks, and keep leading indentation as spaces.
- Keep deliberate alignment gaps (right-aligned totals, dotted leaders, columns of figures) using spaces.
- Tables -> Markdown tables, one row per printed row, every column present. Empty cells stay empty; a cell merged across columns repeats its text in each cell it spans.
- Multi-column pages: finish one column completely, then move to the next, following the page's reading order.
- Printed horizontal rules -> ---.
- Right-to-left text (Arabic, Hebrew): transcribe in normal reading order; never reverse characters, words or lines.
- With more than one page or image, separate them with a line reading exactly: --- Page N ---

UNCERTAINTY — transcribe, never guess at content
- Only write what is actually visible. Never add, complete or infer text that is not on the page.
- Partly legible text -> best reading followed by [unclear]. A region you cannot read at all -> [illegible].
- A handwritten signature -> [signature]. A stamp or seal -> transcribe its text and mark it [stamp].
- A photo, drawing or decorative element with no text -> skip it silently; never describe it.

OUTPUT
- Output the transcription and nothing else: no preamble, no closing note, no explanation, no "Here is…".
- Never wrap the whole transcription in a ``` fence; use fences only for text that is printed as code.
```
Also core/ai/AiPrompts.kt:70-75 (user-turn prompts): "Transcribe this image completely, following the transcription rules. Output the transcription only." / "Transcribe every page of this document completely, following the transcription rules. Output the transcription only."

ha-wine-cellar, custom_components/wine_cellar/gemini.py:114-137 (language directive, sandwiched before and after the schema)
```
Respond in {name}. Every free-text field in your JSON output
(description, notes, food pairings, tasting profile) MUST be written
in {name} — not English. This instruction overrides the language of
the rest of this prompt. Wine names, winery names, dates, and numbers
stay as-is.
```

sugar-no-scanner-demo, src/server/recognition.ts:368 (detection prompt, focusMode true)
```
This is a center crop after a broad scan was uncertain. Identify the most prominent readable package in the crop. Repeated copies of the same package are one SKU; return it once rather than returning an empty result.
```

sugar-no-scanner-demo, src/server/recognition.ts:368 (detection prompt, focusMode false)
```
Scan the complete frame from left to right and top to bottom. Identify up to 10 of the most confidently readable distinct front-facing packaged retail SKUs, including several different products on the same shelf. Do not stop after the central or most prominent package. Include that package as a fallback, but also return readable products elsewhere in the frame. Repeated facings of the same SKU are one product type and must be returned once.
```

sugar-no-scanner-demo, src/server/recognition.ts:368 (saved-image extra paragraph)
```
This saved image may be a supermarket shelf, a checkout photo, a long screenshot, or an online grocery or catalog page. On an online-store page, treat every visible product card as a candidate SKU. Read each product image together with its adjacent title, brand, variant and pack size, and return one detection for every distinct readable product card. Keep each card's text inside that card: never combine a brand, title, pack size or image from neighboring cards. Merge repeated copies of the same card or SKU rather than counting them twice. A price shown on an online-store page is not a physical shelf price label and must never be returned as shelfPrice.
```

sugar-no-scanner-demo, src/server/recognition.ts:368 (fixed tail, always appended)
```
Read the front label and preserve every clearly visible distinguishing word in productName: exact brand, product type, variant or flavor, and exact pack size or multipack count. Do not omit a readable size and do not guess one that is not visible. A nutrition claim such as "17 g protein" is not a pack size. Never copy a nutrient amount into the size, and never combine a size from a neighboring package. Classify retailCategory as snack for packaged sweet or salty snacks, dairy_dessert for yogurts, puddings, sweet curd creams or glazed curd snacks, and other for everything else. searchQuery should repeat the identity using useful English or Latvian equivalents of foreign flavor words for retailer matching. If a complete EAN-8, EAN-13 or UPC barcode number is clearly readable, return only its digits in barcode; otherwise return an empty string. Only when a separate physical shelf price label outside the package is clearly visible and associated with that exact package, set shelfPriceLabelVisible true and return its EUR price in cents, the exact observed price digits plus any visible currency, and a separate confidence. A Latvian shelf label may omit the € symbol; a clear comma-decimal amount such as 0,99 is still valid when it is visibly printed on a separate shelf label. The label must be on the immediate shelf edge for that package and horizontally aligned with it. Do not use distant header or promotion labels; when two labels could plausibly belong to the package, mark the shelf price as not visible instead of guessing. Otherwise set shelfPriceLabelVisible false, price cents and confidence to zero, and price text to an empty string. Never treat nutrition claims, pack size, deposit text or any number printed on the package as a shelf price. Return an empty detections array rather than guessing when no product identity is readable. Return no more than 10 boxes, at most one per distinct front-facing SKU, and do not enumerate repeated or blurry background packages. For every product, box2d must tightly enclose only that product package, excluding shelf labels, display trays, neighboring facings and empty space. Use the Gemini object-detection convention box2d [ymin, xmin, ymax, xmax] as integers normalized from 0 to 1000.
```

sugar-no-scanner-demo, src/server/recognition.ts:530 (candidate confirmation)
```
The first image is the original supermarket frame. The text lists ambiguous exact Barbora SKU candidates for some already detected packages. Use the stated normalized box to inspect only that package, then compare its visible variant, container format, design and pack size with the candidate packshots that follow. Choose a candidate only when the exact SKU is visually supported. If the size/variant cannot be distinguished, return an empty candidateSlug and low confidence. Never choose merely because the brand and generic product type match. Return at most one choice per listed detection.
```
Each appended line: `Detection {index}: observed "{brand} {productName}"; coarse category {retailCategory}; box x=..., y=..., w=..., h=....`, followed by `- {slug}: {brand} {title}; pack {packSize or "not listed"}.` per candidate.

sugar-no-scanner-demo, src/server/web-nutrition.ts:206 (web nutrition search)
```
Use Google Search now. Find the exact packaged food "${exactProductQuery}". Search manufacturer, retailer or exact product-database pages for its nutrition table. Return exactProductMatch true only when brand, product, flavor/variant and visible pack identity refer to the same SKU. Return energy kcal, protein, total sugars and carbohydrates per 100 g or per 100 ml exactly as a source lists them. Do not estimate, convert serving values, borrow a similar flavor, or average conflicting sources. exactProductMatch describes identity, not table completeness. If a nutrient is not verifiable, return null; if the basis is missing return unknown. Never substitute zero for missing data. Cite the supporting page in the answer. End with exactly one single-line JSON object prefixed NUTRITION_JSON:. The object must contain exactProductMatch, matchedBrand, matchedProductName, nutritionBasis as 100g/100ml/unknown, energyKcal, proteinG, totalSugarG, carbohydrateG (each number or null when not listed) and confidence from 0 to 1, plus a short evidence string. Include sourceProductUrl: the direct HTTPS product page, not a search/grounding redirect. The observed barcode is ${input.lookup.barcode}; it must match the source product.
```

Mivro, instructions/lumi_instructions.md (read by python-app/gemini.py:38-42)
```
# Lumi Instructions

You are Lumi, an intelligent product nutrient analyzer. Your role is to categorize nutrients into positive and negative groups based on an individual's health profile. ...
   - Provide the output in the form of a Python dictionary with the following structure:
     - **positive_nutrient**: ... `name`, `icon`, `quantity`, `text` (max 6 words, humorous), `color` (#8AC449 / #F8A72C / #DF5656)
     - **negative_nutrient**: (same shape)
   - Skip health risk identification if the `nutriments` key is the **only** key present...
3. **Health Risk Identification**: ... Provide the output as a Python list of possible high-risk issues under **ingredient_warnings**...
```

Mivro, instructions/swapr_instructions.md (read by python-app/gemini.py:38-42)
```
# Swapr Instructions

You are Swapr, a smart recommendation engine for healthier product choices. ...
4. **Availability in India**: Ensure that recommended products are available for purchase in India...
5. **Output Format**: Provide your recommendation as the name of the recommended product only. Do not include any additional words or phrases.
```


## Coverage

ai-calorie-counter
- Server-side API-key proxy with Secret Manager - already ours
- Dual-mode request body parsing - body
- AI-computed health score requested inline - body
- User-language-steered field localization - body
- Picker-level downscale and compress - body
- Client-activated, server-unenforced App Check - body

food-scanner-gemini
- Scan-window cropping - body
- Single-frame, first-match decode - body
- Value-equality debounce - body
- Immediate navigate-away-from-scanner - body
- Default camera configuration (no explicit tuning) - body
- Decorative overlay widget, unused - body
- Product lookup via Open Food Facts v3 API - body
- No retry, no timeout, no offline path - already ours
- Error surfacing via snackbar + auto pop - body
- Nutri-Score dual-schema parser - body
- AI call is a single unstructured text completion, not vision - body
- Response parsing for the Gemini call - body
- On-demand AI generation, not on the scan path by default - body
- History dedup keyed by barcode string - body
- Firestore persistence with per-user scoping and typed converter - body
- Firestore offline persistence enabled globally - body
- Hardcoded Gemini API key placeholder - body
- No explicit permission-request UI - body
- No telemetry/analytics on the scan path - body

ha-wine-cellar
- Dual AI-transport abstraction (Gemini direct vs OpenAI-compatible relay) - body
- Balanced-bracket JSON extractor - body
- Language-directive prompt sandwiching - body
- Barcode read embedded inside the vision-recognition schema - body
- Concurrent multi-source barcode lookup with fixed preference order - body
- Query-result relevance guard (generic-word-filtered Jaccard overlap) - body
- Vintage-preferring result reorder - body
- Locale pinning via Accept-Language - body
- Currency-to-country substitution for a regional pricing API - body
- Mobile-app backend UA spoofing - body
- Concurrent structured+HTML dual fetch with field-level backfill merge - body
- Minimum-price plausibility floor - body
- Deliberate non-extraction of scraped price - body
- Neighbor-bounded HTML segment windowing - body
- JSON-escape decoding via re-wrapped json.loads - body
- Scrape error-page keyword filter - body
- Wine-relevance keyword filter on UPC Item DB - body
- Vintage-year regex extraction from free-text titles - body
- Barcode zero-pad retry against Open Food Facts - body
- Size-bounded FIFO barcode cache, no time expiry - body
- Fire-and-forget background auto-enrich, decoupled from the response - body
- checked_at / updated_at split - body
- Disk-backed photo storage with cache-busted filenames - body
- Reference-counted photo pruning (mark-and-sweep, not TTL) - body
- Backup-time photo inlining round-trip - body
- Config-time live probe of an OpenAI-compatible relay - body
- Sequential batch AI with a fixed inter-call sleep - body
- getUserMedia error classification by err.name + secure-context precheck - body
- Native camera-app fallback via `<input capture>` - body
- Barcode-miss auto-switch to label camera, capability-gated - body

Mivro
- Gemini response executed as Python via eval() - body
- Single shared, unbounded, process-global chat session per persona - body
- Per-persona system prompts loaded from separate Markdown files at import time - body
- Alternative-product suggestion resolved by a self-call to the app's own search API - body
- Gemini File API upload for multimodal chat, not inline base64 - body
- All four Gemini safety categories set to BLOCK_NONE - body
- Header-based credential re-validation on every API call (no session token) - body
- Hardcoded shared account baked into the browser extension - body
- Extension-side product identity via per-hostname DOM scrape, no barcode involved - body
- Cross-user, full-collection fuzzy text search for the "no barcode" path - body
- Firestore-append error/telemetry logging keyed by function name - body
- "Not found" values are logged for later gap analysis - body

nutrigo
- Camera constraint request - body
- Single fixed-frame capture (no live decode loop) - body
- JPEG export via canvas.toBlob - body
- Multer disk storage, unbounded - body
- OCR-then-regex barcode extraction - body
- Four-step fallback ladder - body
- OpenFoodFacts barcode endpoint + field normalization - body
- OpenFoodFacts text-search endpoint - body
- Barcode existence HEAD check (unused on scan path) - body
- Gemini Vision multimodal request - body
- Gemini Vision prompt (verbatim) - body
- LLM told to hallucinate nutrition when label is unreadable - body
- Gemini response parsing: strip markdown fences, JSON.parse - body
- Gemini text-only fallback (barcode-lookup miss) - body
- Local health-score formula (backend, used at save time) - body
- CSV/Supabase product-name cache short-circuits the health score - body
- Health score precedence order - body
- Nutrition field coalescing with `||` (falsy-zero bug) - body
- Keyword-regex category/subcategory detection - body
- Supabase-scan cache short-circuits the whole pipeline (exact barcode) - body
- Uploaded file always deleted after processing - body
- Alternatives ladder: Gemini-generated first, static DB fallback, Supabase legacy fallback - body
- Alternatives AI prompt (verbatim) - body
- Client-side alternative match scoring - body
- Purchase-link generation (no verification) - body
- CORS wide open by default - body
- Debug request logger on every request - body
- No cross-frame voting/dedup on the scan path - body

qr-quiz
- Hidden always-focused input as a hardware-scanner wedge - body
- Dual-trigger scan termination (Enter OR idle-300ms) - body
- QR code as a UI-command grammar, not a product identity - body
- Camera-scan-then-manual-submit remote control over HTTP+WebSocket - body
- Exponential-backoff websocket reconnect gated on clean-close - body
- Server-side self-replenishing question cache per room - body
- Client-side prefetch pool mirroring the server cache - body
- Keystroke-driven idle timer that reloads the page - body

Scan-It
- Vision call combines Google Search grounding with a forced JSON schema - body
- Single combined schema for identification + ingredients + alternatives - body
- Zero deterministic scoring - the LLM is the only judge - body
- Build-time inlining of the Gemini key into the client bundle - body
- Optional-DB no-op success stub - body

Scanly
- Runtime-switchable barcode decoder with max-capability ZXing config - body
- Manual re-implementation of ML Kit's structured barcode grammar - body
- GMS document scanner with degoogled-device fallback - body
- Integral-image adaptive local-threshold binarization - body
- Per-task preprocessing profiles - body
- Fully local PP-OCRv6 pipeline over ONNX Runtime - body
- Download-on-demand script packs with SHA-256/size verification - body
- PaddleOCR-style CTC charset assembly with a blank gate - body
- DBNet detection post-processing without NMS - body
- Perspective-warp line cropping with a skew-gated fast path - body
- Aspect-ratio-sorted recognition batching - body
- Cross-model page-flip detection - body
- Automatic script-pack correction pass - body
- Per-line mixed-script re-recognition and merge - body
- Arabic word-space recovery from character pitch - body
- Visual-to-logical RTL reorder preserving embedded LTR runs - body
- Recursive XY-cut reading order with axis tie-breaking - body
- Table structure decoded from an autoregressive HTML-token stream - body
- Three-tier table rendering fallback - body
- Furniture-suppression heuristic in layout rendering - body
- Three-layer OCR fallback ladder (engine → model → structure) - body
- Read/write-lock-guarded ONNX session lifecycle - body
- Cached raw-pixel buffer per source bitmap - body
- Streaming one-page-at-a-time PDF OCR - body
- "Photocopier" system-prompt framing to defeat LLM summarization - body
- Fixed-order, opt-in cross-provider fallback with bundled-key isolation - body
- Provider-conditional reasoning suppression plus universal think-tag stripping - body
- Per-request image cap enforced by trimming, not batching or splitting - body
- Partial-stream salvage on mid-stream disconnect - body
- Mid-request streaming-to-non-streaming mode fallback - body
- Silent model auto-downgrade for one OCR endpoint - body
- Image-count-scaled per-attempt timeout - body
- Dual connectivity cross-check before surfacing "offline" - body
- Cheap read-only key-verification probes - body
- Scheme-injection guard on custom AI endpoints - body
- Regex-based API-key redaction in debug logs - body
- AES-GCM Keystore-backed key encryption with migration-safe read - body
- Cross-category barcode overlap with no disambiguation - body
- Priority-ordered concurrent-launch, sequential-await lookup orchestration - body
- Error-vs-notfound aggregation rule - body
- Retry nested inside a fresh per-attempt timeout - body
- False-positive-guarded phone-number regex - body
- Wi-Fi detection short-circuits all other action detection - body
- Android-version-branched Wi-Fi join - body
- Dialer-prefill instead of direct call - body
- Write-tmp-then-rename history with corruption quarantine - body
- Bundled-key-only rate limiter - body
- Partial-reward-not-full-reset ad grant - body
- Ad-refresh cadence ahead of SDK expiry - body
- Lazy-injected, memory-trimmed OCR engine - body
- Pre-integration on-device VLM research harness (not shipped) - body
- In-band page-marker text repagination - body

sugar-no-scanner-demo
- getUserMedia constraint set - body
- Continuous autofocus opt in - body
- Video element readiness poll - body
- Two stage timer loop instead of requestAnimationFrame - body
- Tiny sampling canvas with willReadFrequently - body
- Luminance edge score as a blur gate - body
- Motion gate by strided pixel diff - body
- Forced capture escape hatch - body
- Minimum capture interval - body
- Frame to frame translation tracking - body
- Same scene test and box drift correction - body
- Two strike scene change debounce - body
- Stale result discard after scene change - body
- Edge density candidate proposal grid - body
- Native BarcodeDetector probe with three state memo - body
- Requested barcode symbologies - body
- Barcode value sanitizing - body
- GTIN check digit validation server side - body
- No UA sniffing anywhere on the scan path - body
- Upload path multi crop fan out - body
- Iterative downscale until the payload fits - body
- Upload result merge with generic duplicate suppression - body
- Detection dedupe key ladder - body
- Multilingual same SKU merge - body
- Merge prefers resolution strength then confidence - body
- Gemini model selection with a single conditional fallback - body
- Full literal detection prompt - body
- Structured output schema for detection - body
- Generation params are thinking level and media resolution only - body
- Thinking level chosen by model id prefix - body
- Image encoding for the AI call - body
- SDK level 503 retry policy - body
- Error classification before any fallback - body
- Fallback model only for overload - body
- Confidence threshold split by mode - body
- Post parse detection filter - body
- Gemini box2d conversion - body
- Shelf price trust gate with digit cross check - body
- Second vision pass for ambiguous SKUs - body
- Full literal candidate confirmation prompt - body
- Confirmation acceptance threshold - body
- Confirmation failures are swallowed - body
- Two speed resolution modes - body
- Confirmed nutrition short circuit - body
- Searchable identity gate before any web call - body
- Local catalog fuzzy match scoring - body
- Barcode resolution waterfall - body
- Barcode route lookup ladder and cache header - body
- Open Food Facts client with its own cache - body
- Full literal web nutrition search prompt - body
- Model numbers are never trusted, only model found URLs - body
- Deterministic retailer page verifier - body
- Nutrition plausibility self check - body
- Source host allowlist - body
- Web nutrition cache with stale while revalidate - body
- Google grounding timeout floor - body
- Catalog memoization - body
- Fixed window rate limiter keyed by hashed IP - body
- Same origin enforcement on every scan endpoint - body
- Streaming body size cap - body
- Image payload size cap in the schema - body
- In flight guard against overlapping recognitions - body
- Progressive enrichment at concurrency 5 - body
- Server side resolution concurrency - body
- Stale response revision guard - body
- Retry-After honouring on 429 - body
- Named failure messages per provider reason - body
- AbortError suppression across every fetch - body
- Permission denial path - body
- Free scan paywall gate before the camera opens - body
- Client persistence map - body
- Telemetry dispatcher - body
- Server side event pipeline - body
- Amplitude forwarding with bucketing and property whitelist - body
- Scan path never caches through the service worker - body
- Camera permission declared at the header level - body
- Deterministic sample scenes bypass the provider entirely - body
- Detection overlay box mapping for object-fit - body
- Access expiry polled locally, not server side - body

WhiteChristmas
- Left-eye MediaProjection capture - body
- Double-buffered ImageReader - body
- Single reused direct ByteBuffer, no per-frame allocation - body
- Zero-copy handoff into Unity texture - body
- Optional GPU-side vertical flip - body
- Busy-flag frame dropping (both detectors) - body
- Barcode decode on a spawned Thread - body
- Barcode format is QR-only via ZXing, not MLKit - body
- MLKit object detector configuration - body
- MLKit tracking id passthrough with sentinel - body
- Capture-timestamp-based pose lookup (latency compensation) - body
- Fixed-FOV pinhole unprojection + depth snap - body
- GPU compute-shader batched depth sampling - body
- Corner-derived plane pose for barcodes - body
- Per-tracking-id position history buffer - body
- Median + outlier-filtered smoothing (no Kalman filter) - body
- Stability gate before any anchor/AI action - body
- Track eviction on timeout - body
- Anchor dedup by proximity - body
- ROI crop before the Gemini shoe-detect call - body
- Concurrent upload + AI call - body
- Confidence-gated secondary AI path - body
- Full-frame (uncropped) copy for the secondary path - body
- Gemini tool-calling for shoe matching - body
- Verbatim shoe-detection prompt - body
- Inline base64 image, no separate upload for inference - body
- Free-text response parsed by string matching, not structured output - body
- Same prompt-classification pattern reused for foot measurement - body
- Cross-client anchor/shoe mapping sync - body
- Batched spatial-anchor load/erase - body
- 30s hard timeout, no retry, on secondary-path HTTP call - body
- Explicit generation params for the (unreachable) Cloud Run Gemini call - body
- Response text repair before JSON parsing - body
- Hardcoded fallback object on parse failure - body
- Image-grid batching to cut API calls - body
- Per-call latency instrumentation returned to caller - body
- Foreground-service + notification workaround for background capture - body
- Runtime screen-capture permission flow - body
- UI indicator pooling (only for detector-timing context) - body
