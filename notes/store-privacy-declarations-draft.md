DRAFT ONLY. Not submitted to Apple or Google. The founder reviews and submits these declarations
himself through App Store Connect and the Play Console (plan item 41). Grounded in
`notes/data-statement-2026-09-11.md` and the code it was checked against; nothing here claims a
collection practice the code does not actually do.

## Apple App Privacy (App Store Connect "App Privacy" questionnaire)

Apple groups declared data by category and asks, per category: is it collected, is it linked to
the user's identity, is it used for tracking.

**User Content: Photos.**
- Collected: Yes, only when the user turns on the "Save my photos" toggle. Off by default.
- Linked to identity: No. Linked only to the app's own random per-install ID, not to a name,
  email, or account; there is no account.
- Used for tracking (per Apple's definition, i.e. linking to data from other companies for
  advertising or shared with a data broker): No.
- Purpose to declare: App Functionality (human review of a wrong identification).

**Location.**
- Collected: Yes, only when the user turns on the "Save my location" toggle. Off by default.
  Coarse only: the phone computes an approximately one-kilometre cell and never sends exact
  coordinates.
- Precise vs. coarse: declare as Coarse Location, because raw GPS coordinates never leave the
  device.
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
- Collected: Yes, optional (user must opt in via the in-app toggle, off by default).
- Shared with third parties: No, except the one-time transient send to the identification
  service to produce an answer, which happens whether or not the photo is subsequently stored;
  Google's form has a separate question for this kind of processor use and it should be
  answered accordingly rather than folded into "shared."
- Purpose: App functionality.
- Data deleted on request: Yes (by email during the beta; see the privacy policy draft).

**Location (approximate).**
- Collected: Yes, optional (opt-in toggle, off by default).
- Precise or approximate: Approximate only.
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
