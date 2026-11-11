/**
 * Screens that legitimately have nothing to act on. The "no actionable element and no way back" rule
 * skips a screen listed here. Each entry says why, because a hole in a safety rule needs a reason
 * written next to it, and an entry nobody can explain is a bug being hidden.
 *
 * Nothing is listed yet that the crawler has not seen with its own eyes: add an entry only after a
 * real crawl shows the screen and you have looked at it.
 */
export const ALLOWED_DEAD_ENDS = [
  // { screen: 'camera', state: 'framing', why: 'a one-frame transition while the frame is held; the sheet opens next' },
];

export function allowedDeadEnd(app) {
  return ALLOWED_DEAD_ENDS.some((a) => a.screen === app.screen && (a.state === undefined || a.state === app.state));
}
