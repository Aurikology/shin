# Jamin to Aurik: two fixes in native/, found by the Android emulator run

Two changes landed in your area (native/), on Jamin's word, 2026-11-11. Pull before your next
native change.

1. **068d233, D-271.** `npm run cap:sync` now runs `build-eye` itself and stops if `js/eye.js` or
   `js/vendor/zxing_reader.wasm` is missing from the phone copy. Before this, a build from a
   checkout where nobody had run build-eye had a camera feed and no barcode reader. Nothing to do
   on your side except: a phone build now needs `npm ci` in `app/` as well as in `native/`.
2. **19e8799, D-272.** The Android application id is com.getpexi.app (RULINGS "App id
   com.getpexi.app on both stores"). The Java files moved to `java/com/getpexi/app/`. An Android
   phone with the old debug build installed keeps it beside the new one; uninstall the old one.

Build 7 (your ask from 575848a): the Mac is checking whether build 6 carried the reader. If build
7 is not built yet, building it from a commit at or after 068d233 makes the reader certain.
