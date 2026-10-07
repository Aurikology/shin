/**
 * Feature switches. Two of them are named in docs/design/AVATAR.md and
 * docs/design/USAGE.md, and both are false-until-a-real-thing-exists.
 *
 * `feed` gates every string and every face state that implies Pexi is watching
 * a price over time: the promising form of `watching`, the `dropped` line, and
 * the `nudging` face. USAGE.md C4 is explicit about why it defaults off: the
 * pilot's four direct retailer fetches returned zero prices, three of them 403
 * (notes/session-2026-09-03.md), so a line that says "I will tell you if it
 * drops" is a capability claim this build cannot honour. Reverses when a
 * re-queryable source ships for the lead category (USAGE.md section 5).
 *
 * `placeholderLabels` printed the state name under the placeholder face
 * (AVATAR.md section 6), and this file said setting it false "is the entire art
 * hand-off: nothing else changes."
 *
 * Turned off 2026-09-06, because the hand-off happened. The faces are no longer
 * placeholders: face-art.js draws all thirteen Deadpan states, build-faces.mjs
 * generates them to public/faces/deadpan/*.svg, and test/faces.test.mjs fails if
 * the two ever disagree. The condition the flag was waiting for is met.
 *
 * What it was costing while it stayed on: every face on every screen printed its
 * own internal state name underneath itself, in mono caps -- "ANGRY" under the
 * verdict, "FAIR" on the profile, "ASLEEP" on an empty list. That is debug
 * output, on the surface, in front of users. It also measured 1.63 against the
 * walk field until it was repointed at the field's own ink earlier today, which
 * is a lot of work spent making a debug string legible.
 *
 * Warm and Blunt still have no art of their own and fall back to Deadpan. That
 * is a real gap and it is tracked, but a state name in mono caps was never what
 * made it visible, so it is not a reason to keep printing one.
 */
/*
 * THE MVP SWITCHES, 2026-09-21 (docs/mvp-plan.md, "What ships OFF"). Jamin's
 * call the same day: keep what is built, switch off the welcome screen, photo
 * identification and languages for now. Off means hidden and not called, never
 * deleted: every one of these reverses by writing `true` here and nothing else.
 *
 * `onboarding`  the 30-step welcome and the setup screen after it. Off, a fresh
 *               install goes Permissions -> Consent -> Camera and Pexi keeps
 *               its default voice (onboarding-flow.js `firstScreen`).
 * `photoId`     the shutter and the photo route. Off, the camera has no photo
 *               button, never sends a photo, and a press with no barcode read
 *               says "Point me at the barcode" (screens/camera.js).
 * `languages`   the French table and the language row. Off, the locale is
 *               pinned to English whatever the phone asks for.
 * `market`      the country picker. Off, the market is pinned to Canada, where
 *               the testers are; barcode lookup is global already, so this is
 *               one line to reverse.
 *
 * The last two become pins at boot (flags-boot.js, called from main.js); the
 * first two are read where they decide, at call time.
 *
 * WHY `onboarding` OFF DOES NOT DROP THE PERMISSION ASK, and it did for a day.
 * The camera and location ask was step 24 INSIDE the welcome flow, so the
 * first version of this switch took it off with the flow: a fresh install went
 * straight to Consent and was never asked. It is now screens/permissions.js, a
 * screen of its own drawing the same panel step 24 draws (permissions-panel.js),
 * and `firstScreen` puts it first when this flag is off. Turning the flag back
 * on returns the ask to its place inside the flow and the standalone screen is
 * simply not routed to.
 */
export const FLAGS = {
  feed: false,
  placeholderLabels: false,
  onboarding: false,
  photoId: false,
  languages: false,
  market: false,
};
