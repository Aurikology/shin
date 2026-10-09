/**
 * The cents-first price pad's arithmetic (UX build 5, R-26).
 *
 * Digits fill from the right, like a card machine: the buffer is a string of
 * digits that IS the price in cents. "4" is $0.04, "49" is $0.49, "499" is $4.99,
 * "49900" is $499.00. There is no point key, so there is no point in the buffer,
 * and a price can only be made of digits.
 *
 * The old pad (a point key, dollars first) is still in camera.js, behind
 * FLAGS.centsFirstPad, and none of its functions are touched by this file.
 *
 * FAILS LOUDLY. `applyCentsKey` throws on anything that is not one digit or the
 * backspace key: a stray character, a decimal point, a two-digit value, an empty
 * value. Such a key is a bug in whoever built the key, and silently appending it
 * (or silently dropping it) is how a wrong price reaches a verdict. The buffer is
 * returned unchanged on the throw because nothing is assigned before it.
 */

/** $99,999.99. A tag longer than this is a slip of the thumb, not a price; the press is ignored, not stored. */
export const PAD_MAX_DIGITS = 7;
export const BACKSPACE = '⌫';

/** The buffer after one key press. Throws on a key that is not a digit or backspace. */
export function applyCentsKey(buffer, key) {
  if (typeof buffer !== 'string' || !/^\d*$/.test(buffer)) {
    throw new Error(`pad: the price buffer ${JSON.stringify(buffer)} is not a string of digits`);
  }
  if (key === BACKSPACE) return buffer.slice(0, -1);
  if (typeof key !== 'string' || !/^\d$/.test(key)) {
    throw new Error(`pad: ${JSON.stringify(key)} is not a digit or backspace, so it was not added to the price`);
  }
  // A zero before any other digit changes nothing: "05" is five cents, and the buffer says "5".
  if (buffer === '' && key === '0') return '';
  if (buffer.length >= PAD_MAX_DIGITS) return buffer;
  return buffer + key;
}

/** The buffer as cents, or null when nothing has been typed. */
export function centsOfDigits(buffer) {
  if (typeof buffer !== 'string' || !/^\d*$/.test(buffer)) {
    throw new Error(`pad: the price buffer ${JSON.stringify(buffer)} is not a string of digits`);
  }
  return buffer === '' ? null : Number(buffer);
}

/** The two halves of what the amount line shows: dollars and two-digit cents, or null for an untouched pad. */
export function centsParts(buffer) {
  const cents = centsOfDigits(buffer);
  if (cents === null) return null;
  return { whole: String(Math.floor(cents / 100)), frac: String(cents % 100).padStart(2, '0') };
}
