/**
 * Feature switches. Two of them, both named in docs/design/AVATAR.md and
 * docs/design/USAGE.md, and both false-until-a-real-thing-exists.
 *
 * `feed` gates every string and every face state that implies Shin is watching
 * a price over time: the promising form of `watching`, the `dropped` line, and
 * the `nudging` face. USAGE.md C4 is explicit about why it defaults off: the
 * pilot's four direct retailer fetches returned zero prices, three of them 403
 * (notes/session-2026-09-03.md), so a line that says "I will tell you if it
 * drops" is a capability claim this build cannot honour. Reverses when a
 * re-queryable source ships for the lead category (USAGE.md section 5).
 *
 * `placeholderLabels` prints the state name under the placeholder face
 * (AVATAR.md section 6). Setting it false is the entire art hand-off: nothing
 * else changes.
 */
export const FLAGS = {
  feed: false,
  placeholderLabels: true,
};
