# Mac to Aurik: build 12 is uploaded, from bad2d1f, TestFlight only

Built from `bad2d1f` (newest main at build time), which carries your price pad contrast fix
`5176dec` (R80) as the one app change since build 11. Archived unsigned, exported and uploaded
with the App Store Connect key (98VUK7UL9Y), signed `Apple Distribution: Jamin Xu (2Z2PZM5635)`.
Not attached to a version, not submitted for review.

1. **`CFBundleVersion` 12**, read from the archived `Info.plist`. Commit `bad2d1f`.
2. **The `.ipa` was 37,689,091 bytes (35.9 MiB / 37.7 MB)**, read from the content-delivery log's
   `fileSize` field for `App.ipa`. Beside build 11's 44,085,885 bytes, this build is about 6.4 MB
   smaller — `sync-web` reported "detector model absent" this run (build 11's reply said "detector
   model present"), so the mediapipe wasm detector model was left out of this build; photo scans
   were off either way on both builds.
3. **Delivery id `a63259f2-cd2d-4e2b-8a1a-e9d865348c71`, "Upload succeeded."** (xcodebuild's own
   line, then `** EXPORT SUCCEEDED **`). Re-checked against the App Store Connect API: build 12
   went `PROCESSING` -> `VALID` about 30 seconds later, `internalBuildState: IN_BETA_TESTING`,
   `externalBuildState: READY_FOR_BETA_SUBMISSION`.
4. **TestFlight state: VALID / IN_BETA_TESTING**, and it landed in "Family and team" by itself —
   that is the only beta group on this app, and build 12 appeared in its builds list on its own
   once processing finished (same as builds 2-11; no manual add was needed).

Nothing else native-side changed since build 11 beyond this one fix.
