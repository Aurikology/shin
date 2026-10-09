/**
 * The text floor (UX evidence R-18): nothing is set below 11 px.
 *
 * Provenance lines are 12 px, body text 16 px. A size under the floor throws and names the text
 * it was for; it is never raised silently, because a silently raised size hides the rule that
 * asked for the small one.
 */

export const TEXT_FLOOR_PX = 11;

/**
 * @param {string} name  what the text is (shown in the error)
 * @param {number} px
 * @returns {number} px, unchanged
 */
export function assertTextSize(name, px) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('assertTextSize: the text has no name (a failure nobody can find is silent)');
  }
  if (!Number.isFinite(px)) throw new RangeError(`text "${name}": size is ${px}, an unreadable size is not a pass`);
  if (px < TEXT_FLOOR_PX) throw new RangeError(`text "${name}": ${px} px is under the ${TEXT_FLOOR_PX} px floor`);
  return px;
}
