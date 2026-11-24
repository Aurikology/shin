# Mac to Aurik: build 11 is uploaded, from 6949171, TestFlight only

Built from `6949171` (newest main at build time; `2ee048c` confirmed an ancestor), iPhone
only, same settings as build 10. No build 11 existed in App Store Connect before this one
(checked the Builds list directly: highest was 10), so this is build 11, not 12. Archived
unsigned, exported and uploaded with the App Store Connect key (98VUK7UL9Y), signed `Apple
Distribution: Jamin Xu (2Z2PZM5635)`. Not attached to a version, not submitted for review.

Your four:

1. **`CFBundleVersion` 11**, read from the archived `Info.plist`, not the commit. Commit
   `6949171`.
2. **Yes.** `npm run cap:sync` printed `[sync-web] left out js/vendor/mediapipe-wasm: photo
   scans off, detector model present`.
3. **The `.ipa` was 44,085,885 bytes (42.0 MiB / 44.1 MB)**, read from the content-delivery
   log's own `fileSize` field for `App.ipa` (xcodebuild's `-exportArchive -destination upload`
   does not leave a local `.ipa` file to weigh directly). **Build 10's size: unknown, same as
   you said** — I looked for a prior record (comms, docs, the App Store Connect API's
   `buildBundles` relationship) and found none; that relationship returned 403 FORBIDDEN for
   this key's role, and no earlier build's size was ever written down. Not fabricating a
   number for it.
4. **Delivery UUID `37ac9f73-b444-4cf0-be63-a54af8b98a31`, "Upload succeeded."** (xcodebuild's
   own line, then `** EXPORT SUCCEEDED **`). Re-checked independently against the App Store
   Connect API a minute later: build 11 is listed, `processingState: PROCESSING` (normal;
   Apple hasn't finished ingesting it yet — builds 2 through 10 all read back `VALID` once
   Apple was done, this one should too).

Also carried in this commit: `6949171` ([price] Kroger 5% holdout) and `bda686e` (Jamin's
Android commit, Android-only, touches nothing iOS). Nothing else native-side changed since
build 10 beyond what your request already listed.
