# Pexi in an Android emulator with a fake barcode

Runs the real Android app (Capacitor shell, debug build) in an emulator on Windows, points the
emulator's virtual camera at a poster of an EAN-13, and lets Maestro drive one scan.

What it proves: native camera, WebView getUserMedia, ML Kit text recognition, the zxing-wasm
barcode reader, and the call to the live server (relay.anjiawenda.com). Note the barcode is read by
zxing-wasm inside the WebView (src/eye), NOT by the ML Kit barcode plugin, which is installed but unused.

Paths below assume `C:\Android\Sdk`, worktree `C:\shin-lanes\android-run`, tools in `%USERPROFILE%\tools`.
No admin, reboot or paid account is needed. Package id is `com.useshinapp.shin`.

## 1. System image and AVD (about 2.3 GB image, 5.7 GB AVD while running)

    C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat "system-images;android-36;google_apis_playstore;x86_64"
    echo no | C:\Android\Sdk\cmdline-tools\latest\bin\avdmanager.bat create avd -n pexi36 -k "system-images;android-36;google_apis_playstore;x86_64" -d pixel_6

Edit the AVD's `config.ini` (in `%USERPROFILE%\.android\avd\pexi36.avd`, check `avdmanager list avd` for the path):
`hw.camera.back = virtualscene`, `hw.ramSize = 3072`, `hw.gpu.enabled = yes`.

## 2. Build the debug APK from a worktree

    node scripts/lane-worktree.mjs create android-run        (from C:\shin; worktree + npm ci)

Create `C:\shin-lanes\android-run\native\config\shin-api.config.json` (gitignored) so the app targets the live server:

    {"apiBase":"https://relay.anjiawenda.com","inviteCode":"","nativeCameraFallback":false}

The live server answered without an invite header when this was written. Then:

    cd C:\shin-lanes\android-run\app && npm run build-eye
    cd C:\shin-lanes\android-run\native && npm run cap:sync
    set ANDROID_HOME=C:\Android\Sdk
    cd android && gradlew.bat assembleDebug --no-daemon

**`npm run build-eye` is required and is not part of `cap:sync`.** It writes the gitignored `public/js/eye.js`
and `public/js/vendor/zxing_reader.wasm`. Without it the camera loads (and shows a feed) but there is no barcode
reader at all: three 404s in the WebView console, the button says "Point me at the barcode", nothing is ever sent.

APK: `native\android\app\build\outputs\apk\debug\app-debug.apk` (80 MB).

## 3. Poster, emulator, install

    node scripts/phone-run/make-ean13.mjs 0065633134652 C:\temp\ean13.png      (2048 px, validates the check digit)

0065633134652 is Cheerios 570 g, taken from the live catalogue (`/api/search?q=cheerios`).

    cd C:\Android\Sdk\emulator
    emulator.exe -avd pexi36 -camera-back virtualscene -virtualscene-poster wall="C:\temp\ean13.png" -no-snapshot -no-audio -no-boot-anim

If `adb devices` says `unauthorized`: `adb kill-server && adb start-server`.

    adb install -r app-debug.apk
    adb shell pm grant com.useshinapp.shin android.permission.CAMERA

## 4. Aim the virtual camera at the wall poster

`adb emu sensor set` does not move the virtual scene. Use the emulator's gRPC (camera-pose.mjs):

    mkdir C:\temp\grpc && cd C:\temp\grpc && npm i @grpc/grpc-js @grpc/proto-loader
    set GRPC_DIR=C:\temp\grpc
    node scripts/phone-run/camera-pose.mjs pos -3.0 0.3 1.5
    node scripts/phone-run/camera-pose.mjs rot 0 210 0

That pose puts the code about 330 px wide in the 960x1280 video frame, inside the guide brackets. The pose
survives app restarts but not emulator restarts.

## 5. Maestro

    Download https://github.com/mobile-dev-inc/maestro/releases (maestro.zip, 2.12.1 used), unzip to %USERPROFILE%\tools\maestro
    set PATH=%USERPROFILE%\tools\maestro\bin;C:\Android\Sdk\platform-tools;%PATH%
    maestro test scripts/phone-run/scan.yaml

The flow clears app data, does the consent and permission screens, waits for "Barcode. Hold it there." (the reader
has seen the code), taps the round scan button (50%,90%, it has no text label), then expects the product name
and the "What's the shelf price?" sheet. It stops there and never enters a price. Each run makes one
`/api/identify?...&preview=1` call to the live server.

## Debugging helpers

- `cdp-log.mjs` prints WebView console and network events: `adb forward tcp:9222 localabstract:webview_devtools_remote_<app pid>`, then `node cdp-log.mjs 20`. Filter out the TextRecognition/writeFile plugin traffic.
- `grab-frame.mjs out.png` saves the frame the barcode decoder actually sees.

## Shut down

    adb emu kill
