/**
 * Is this string of digits a real barcode number?
 *
 * WHY THIS FILE EXISTS (2026-09-09, the photo path, section 2). The extract
 * pass is now allowed to report digits it can actually read underneath a
 * barcode, and those digits are the one thing in the whole reading that can be
 * checked without asking anybody. Decision 15 says a fact beats an opinion, so
 * a photo-read GTIN that checks out goes straight to the catalogue by code and
 * the text cascade never runs.
 *
 * That shortcut is only safe because of the check digit. Every GTIN carries one,
 * and a single misread digit fails it about ninety per cent of the time, which
 * is exactly the protection needed when the reader is a vision model looking at
 * a curved, glossy, half-lit strip of bars. Without this check the shortcut
 * would be the fastest way in the codebase to confidently price the wrong
 * product.
 *
 * Pure, no I/O, no dependency: it is arithmetic over a string, and it is kept
 * on its own so the rule is readable and the tests for it are cheap.
 */

/** The four lengths in use: EAN-8, UPC-A, EAN-13, GTIN-14. */
const GTIN_LENGTHS: ReadonlySet<number> = new Set([8, 12, 13, 14]);

/**
 * The GS1 mod-10 check.
 *
 * Read right to left starting at the digit just left of the check digit, the
 * weights alternate 3, 1, 3, 1. The weighted sum plus the check digit must be a
 * multiple of ten. Anchoring the weights at the right-hand end rather than the
 * left is what makes one implementation cover all four lengths.
 */
export function isValidGtin(digits: string): boolean {
  if (!/^[0-9]+$/.test(digits)) return false;
  if (!GTIN_LENGTHS.has(digits.length)) return false;

  const body = digits.slice(0, -1);
  const check = Number(digits[digits.length - 1]);

  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(body[i]) * weight;
  }

  return (sum + check) % 10 === 0;
}

/**
 * The digits from a model reading, or null.
 *
 * Whitespace and the separators printed under the bars come off first, because
 * "0 60383 75601 1" and "060383756011" are the same barcode and only one of
 * them is a number. Everything else is rejected rather than repaired: a reading
 * that needs repairing is a reading that was not legible, which is what the
 * schema told the model to report as null in the first place.
 */
export function gtinFrom(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/[\s-]/g, '');
  return isValidGtin(digits) ? digits : null;
}
