/**
 * Feature switches. Two of them are named in docs/design/AVATAR.md and
 * docs/design/USAGE.md, and both are false-until-a-real-thing-exists.
 *
 * `feed` gates every string and every face state that implies Shin is watching
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
/**
 * `onboarding` is the third, and it is the other kind: on until somebody
 * decides otherwise, rather than off until something exists. docs/mvp-plan.md
 * asks for the welcome flow switched off for the MVP, and this is the switch
 * for it. False sends a first launch to the permission screen instead of the
 * welcome flow (onboarding-flow.js `firstScreen`), then on through setup and
 * consent to the camera as before. Off means hidden and not called, never
 * deleted: the flow, its answers and "Watch the welcome again" all still work
 * and `?s=onboarding` still opens it.
 *
 * It is left TRUE here. Flipping it is the owner's call and a separate change
 * from building the screen the flip needs, which is what 2026-09-21 did.
 */
export const FLAGS = {
  feed: false,
  placeholderLabels: false,
  onboarding: true,
};
