/**
 * The check digit of a printed barcode, on the phone (UX build 5, R-25).
 *
 * WHY THIS EXISTS. A barcode that fires on its own (lib/auto-fire.js) is no
 * longer confirmed by a press, so the one moment a person looked at the code and
 * said "that one" is gone. A misread digit string that passes on would be looked
 * up and priced as some other product, and a confidently wrong verdict is the
 * worst outcome this app has. The check digit is the cheapest proof a read is
 * what was printed, so the auto-fire asks for it and THROWS when it fails
 * (RULINGS.md, "Errors never go unnoticed"). It never repairs, never pads and
 * never drops a code quietly.
 *
 * The scan press is NOT guarded here: a shopper who presses with a code the
 * reader could not verify still gets an answer (the server asks for the name),
 * which is "Always answer, never refuse".
 *
 * The server holds the full normalisation (app/src/barcode.ts: zero padding, the
 * weighed-item labels). This file is only the arithmetic, small enough to carry
 * to the phone, and it covers the lengths a retail barcode really has:
 * 8 (EAN-8, or UPC-E), 12 (UPC-A), 13 (EAN-13), 14 (GTIN-14).
 */

const LENGTHS = new Set([8, 12, 13, 14]);

/** GS1 mod-10 over the whole digit string: weights 3,1,3,1 from the digit left of the check digit. */
function mod10Holds(digits) {
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return (sum + Number(digits[digits.length - 1])) % 10 === 0;
}

/** The 12-digit UPC-A an 8-digit UPC-E stands for (number system 0 or 1), else null. Same table as catalogue/src/upc.ts. */
function upcAOf(upce) {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const ns = upce[0];
  const d = upce.slice(1, 7);
  const check = upce[7];
  const last = Number(d[5]);
  let body;
  if (last <= 2) body = d.slice(0, 2) + d[5] + '0000' + d.slice(2, 5);
  else if (last === 3) body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === 4) body = d.slice(0, 4) + '00000' + d[4];
  else body = d.slice(0, 5) + '0000' + d[5];
  return ns + body + check;
}

/** Whether `code` is a string of digits of a retail length whose check digit holds. */
export function hasValidCheckDigit(code) {
  if (typeof code !== 'string' || !/^\d+$/.test(code) || !LENGTHS.has(code.length)) return false;
  if (mod10Holds(code)) return true;
  // A short UPC-E fails the EAN-8 arithmetic by design; its check digit is the expanded UPC-A's.
  const expanded = code.length === 8 ? upcAOf(code) : null;
  return expanded !== null && mod10Holds(expanded);
}

/** Returns `code` when its check digit holds; throws an Error naming the code and the check digit when it does not. */
export function assertCheckDigit(code) {
  if (!hasValidCheckDigit(code)) {
    throw new Error(`barcode ${JSON.stringify(code)} fails its check digit (or is not a retail barcode length); it was not looked up`);
  }
  return code;
}
