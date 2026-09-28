DRAFT ONLY. Not submitted to Apple or Google. The founder reviews and submits these declarations
himself through App Store Connect and the Play Console (plan item 41). Re-checked 2026-09-28
directly against `app/src/consent.ts`, `app/public/js/flags.js`, `app/public/js/screens/camera.js`,
and `app/public/js/geocell.js`, which had moved since the 2026-09-11 data statement this file used
to be grounded in: photos default **off**, not on (reversed 2026-09-28, `DEFAULT_CONSENT` in
`consent.ts`, per RULINGS.md's "Location and photo consent default off until answered"; they had
briefly defaulted on from 2026-09-19 until that ruling), matching location, which has stayed off
by default throughout. The app also still reads and transiently transmits exact GPS coordinates to
compute the coarse cell, even though the server never stores them. Separately, the shelf capture
loop in `camera.js`'s `startShelf` only runs when both `FLAGS.photoId` and photo consent are true,
and the tester build ships with `FLAGS.photoId` set to `false`, so no shelf photo is taken or sent
in that build regardless of the consent toggle; confirm `FLAGS.photoId` against the build under
review before submitting. Nothing here claims a collection practice the code does not actually do.

## Apple App Privacy (App Store Connect "App Privacy" questionnaire)

Apple groups declared data by category and asks, per category: is it collected, is it linked to
the user's identity, is it used for tracking.

**User Content: Photos.**
- Collected: Yes, when the photo-identification feature is used. A photo you take to identify a
  product is sent once to Google's Gemini AI model to produce an answer, regardless of the
  photo-saving toggle. Whether it is then KEPT depends on the "Save my photos" toggle, which is
  **off by default** (reversed 2026-09-28, `DEFAULT_CONSENT` in `app/src/consent.ts`); a user can
  turn it on from the You screen. The tester build ships with photo identification itself off
  (`FLAGS.photoId` is `false` in `app/public/js/flags.js`), so no photo is taken or sent in that
  build at all; confirm `FLAGS.photoId` matches the build being submitted before this is filed.
- Linked to identity: No. Linked only to the app's own random per-install ID, not to a name,
  email, or account; there is no account.
- Used for tracking (per Apple's definition, i.e. linking to data from other companies for
  advertising or shared with a data broker): No.
- Purpose to declare: App Functionality (human review of a wrong identification, model training).

**Location.**
- Collected: Yes, only when the user turns on the "Save my location" toggle. Off by default.
- Precise vs. coarse: declare as **Precise Location**, not Coarse. The phone reads the device's
  exact GPS position and, as of the 2026-09-14 change to `app/public/js/geocell.js`, that exact
  reading is transmitted off the device to our server alongside the coarse cell (so the server can
  independently verify the snap). Our server discards the exact reading immediately and stores
  only the coarse, approximately one-kilometre cell (`app/server.ts`'s `locationFor`) -- but Apple's
  question is about what the app's practice transmits off the device, not what the server ends up
  keeping, and precise coordinates do leave the device. Declare Precise Location collected, used
  transiently, not stored, per the purpose below.
- Linked to identity: No, same basis as above.
- Used for tracking: No.
- Purpose to declare: App Functionality (nearby store selection, per-store pricing).

**Identifiers (device or other IDs).**
- Collected: Yes. A random ID the app generates on first launch and stores locally, sent back
  on every scan.
- Linked to identity: No. It identifies the install, not a person; nothing else in the app ties
  it to a name or account.
- Used for tracking: No, it is not shared with any third party or combined with outside data.
- Purpose to declare: App Functionality (free-scan counting, matching corrections to the
  original scan).

**Note for whoever submits this:** Apple's questionnaire asks about the app's practice as a
whole, not per-toggle; the "collected: yes, only if the user opts in" phrasing above needs to be
represented using Apple's own optional-collection mechanism in the questionnaire, not answered
as an unconditional yes.

## Google Play Data Safety form

Google's form asks, per data type: is it collected or shared, is collection required or
optional, and the purpose.

**Photos and videos.**
- Collected: Yes, when the photo-identification feature is used. Every photo taken to identify a
  product is sent once to Google's Gemini AI model (a processor use, not "shared," see below)
  regardless of the toggle. Whether it is then STORED depends on the in-app toggle, which is
  **off by default** (reversed 2026-09-28, `DEFAULT_CONSENT` in `app/src/consent.ts`); a user can
  turn it on. The tester build ships with photo identification itself off (`FLAGS.photoId` is
  `false`), so no photo is taken or sent in that build at all; confirm this matches the build
  being submitted before filing.
- Shared with third parties: No, except the one-time transient send to Gemini to produce an
  answer; Google's form has a separate question for this kind of processor use and it should be
  answered accordingly rather than folded into "shared."
- Purpose: App functionality, and (when the toggle is on and the photo is kept) improving Shin's
  own model.
- Data deleted on request: Yes (by email during the beta; see the privacy policy).

**Location.**
- Collected: Yes, optional (opt-in toggle, off by default).
- Precise or approximate: **Precise**, not approximate. The app reads exact GPS on-device and
  transmits it to our server as part of computing the coarse cell (`app/public/js/geocell.js`,
  2026-09-14); the server discards the exact reading immediately and stores only the coarse,
  approximately one-kilometre cell. Google's form asks what is collected (transmitted off device),
  which is the precise reading, even though only the coarse cell is retained; declare Precise
  Location collected and not stored beyond the immediate request.
- Shared with third parties: No.
- Purpose: App functionality.
- Data deleted on request: Yes.

**Device or other IDs.**
- Collected: Yes, required for the app's core counting and correction features to work (the
  free-tier meter and correction matching depend on it), but it is a random per-install value,
  never a hardware identifier.
- Shared with third parties: No.
- Purpose: App functionality, analytics (internal only).

**Encryption in transit:** confirm with the Mac/Server lane before submitting; declare Yes only
once verified against the actual tunnel configuration, not assumed.

## What this draft does not cover

It does not cover Aurik's items (accounts, item 44) or anything not yet built; if accounts ship
later, both forms need a fresh pass, not an amendment written from memory of this one.
