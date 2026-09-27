/**
 * Barcode check-digit validation and zero-pad normalization, wired into the
 * one path that spends a paid Gemini call.
 *
 * ITEM 2 (docs/scanner-build-order-2026-09-19.md, section 2). The check-digit
 * function (`identify/src/gtin.ts`, `isValidGtin`/`gtinFrom`) and a zero-pad
 * normalization pattern (`catalogue/src/search.ts`, `catalogue/src/
 * user-catalogue.ts`) both already existed, correctly, before this file did.
 * Neither was ever called from `/api/identify`, so a misread or short
 * barcode went straight to Gemini and spent the one call the scan gets. The
 * padStart/strip shape is re-derived locally; the UPC-E expansion is NOT, it
 * is `upcAOf` from `catalogue/src/upc.ts`, a file with no imports, so this
 * never loads `search.ts` or its native sqlite-vec module at server start.
 *
 * Ruling 2 (docs/decisions.md, "Nine rulings so the competitor-survey build
 * could start", 2026-09-19): "The zero-padded barcode retry never re-hits
 * Gemini. It runs before the call, against the cache and Open Food Facts
 * only, and exactly one canonical digit string is sent to Gemini." So the
 * padding here is pre-send sanitization, never a second attempt after a
 * Gemini miss: `canonicalGtin` picks ONE string (the digits as read, or the
 * first padded form that passes the check digit) before anything is spent,
 * and nothing downstream ever sees more than one candidate.
 *
 * ITEM 7B.8 (QUEUE.md), 2026-09-27. Two real printed shapes used to go wrong:
 *   - UPC-E, the 8-digit short code on small cans and packs. Run through the
 *     EAN-8 check it usually fails, and was refused as `invalid_barcode`,
 *     which RULINGS.md "Always answer" forbids for a real printed barcode. It
 *     is now expanded to its 12-digit UPC-A, the same string a reader that
 *     emits the long form sends for the same can, so both share one cache key.
 *   - Store-printed weighed-item labels (UPC-A number system 2). The right-hand
 *     digits carry the price, so every weigh event was a new cache key and a
 *     new Gemini query. The price field is now zeroed and the check digit
 *     recomputed, so every weigh event of one item shares one key, and the
 *     embedded price is exposed separately (`canonicalBarcode`).
 */

import { gtinFrom, isValidGtin } from '../../identify/src/gtin.ts';
import { upcAOf } from '../../catalogue/src/upc.ts';

export { isValidGtin };

/**
 * Every zero-padded / zero-stripped form of a barcode worth trying against a
 * local or third-party source (the repeat-scan cache, Open Food Facts).
 * Canonical (as-typed) form first. Never sent to Gemini as more than one
 * string; see `canonicalGtin`.
 */
export function gtinVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return [];
  const forms = [
    digits,
    digits.padStart(8, '0'),
    digits.padStart(12, '0'),
    digits.padStart(13, '0'),
    digits.padStart(14, '0'),
    digits.replace(/^0+(?=\d)/, ''),
  ];
  return [...new Set(forms)].filter((f) => f.length > 0);
}

/** What a store-printed weighed-item label carried besides the item it names. */
export interface VariableMeasure {
  /** The 12-digit label exactly as scanned (a 13-digit `02...` reading loses its leading zero). */
  readonly label: string;
  /** The store's own 5-digit item code (label digits 2-6). */
  readonly itemCode: string;
  /**
   * The price printed into the label, in cents, or null when it cannot be read.
   * Read from label digits 8-11. Set when digit 7 verifies as the GS1 4-digit
   * price check digit, or when digit 7 is 0 (a 5-digit price field under
   * $100.00 reads the same either way). Otherwise null: the field may be a
   * price over $100.00, a weight, or a layout this does not know.
   */
  readonly embeddedPriceCents: number | null;
  /** True only when label digit 7 is the GS1 price check digit over digits 8-11. */
  readonly priceCheckVerified: boolean;
}

/** The one canonical barcode a scan may spend on, and how it was reached. */
export interface CanonicalBarcode {
  /** The one digit string for the cache, Open Food Facts and Gemini. Same value `canonicalGtin` returns. */
  readonly gtin: string;
  /** `as_read` and `zero_padded` are the pre-7B.8 cases; the other two are new. */
  readonly how: 'as_read' | 'zero_padded' | 'upc_e_expanded' | 'variable_measure';
  /** Present only when `how` is `variable_measure`. */
  readonly variableMeasure: VariableMeasure | null;
}

/** The GS1 mod-10 check digit that completes `body`, found with the one existing validator. */
function checkDigitFor(body: string): string {
  for (let d = 0; d <= 9; d += 1) {
    if (isValidGtin(body + d)) return String(d);
  }
  /* unreachable for an all-digit body of a GS1 length minus one */
  return '0';
}

/** The 12-digit UPC-A an 8-digit UPC-E stands for, only when its own check digit passes. */
function upcEExpanded(eight: string): string | null {
  const upca = upcAOf(eight);
  return upca && isValidGtin(upca) ? upca : null;
}

// GS1 price check digit weights (General Specifications, price/weight field check):
// "2-" multiply by 2 and subtract the tens digit from the units digit; "3" units
// digit of times 3; "5-" multiply by 5 and subtract the tens from the units.
const W2_MINUS = [0, 2, 4, 6, 8, 9, 1, 3, 5, 7];
const W3 = [0, 3, 6, 9, 2, 5, 8, 1, 4, 7];
const W5_MINUS = [0, 5, 9, 4, 8, 3, 7, 2, 6, 1];

/** The GS1 check digit for a 4-digit price field: weights 2-, 2-, 3, 5-, sum times 3, units digit. */
function priceCheckDigit4(price: string): number {
  const [a, b, c, d] = [...price].map(Number);
  return ((W2_MINUS[a] + W2_MINUS[b] + W3[c] + W5_MINUS[d]) * 3) % 10;
}

/**
 * A valid 12-digit `2...` UPC-A (or its 13-digit `02...` twin) as a weighed-item
 * label, or null. North American layout: digit 1 is 2, digits 2-6 the item,
 * digit 7 a price check digit on some systems, digits 8-11 the price, digit
 * 12 the check digit. Digits 7-11 are zeroed and the check digit recomputed.
 */
function variableMeasure(valid: string): { key: string; vm: VariableMeasure } | null {
  // EAN-13 prefixes 20-29 are Europe's in-store range with country-specific layouts: left unchanged on purpose.
  const label = valid.length === 12 && valid[0] === '2' ? valid : valid.length === 13 && valid.startsWith('02') ? valid.slice(1) : null;
  if (!label) return null;
  const itemCode = label.slice(1, 6);
  const priceField = label.slice(7, 11);
  const priceCheckVerified = priceCheckDigit4(priceField) === Number(label[6]);
  const embeddedPriceCents = priceCheckVerified || label[6] === '0' ? Number(priceField) : null;
  const body = label.slice(0, 6) + '00000';
  return { key: body + checkDigitFor(body), vm: { label, itemCode, embeddedPriceCents, priceCheckVerified } };
}

/** One candidate digit string read as a barcode, or null when it is not one. */
function interpret(digits: string, how: 'as_read' | 'zero_padded', allowUpcE: boolean): CanonicalBarcode | null {
  // Valid as both EAN-8 and UPC-E: UPC-E wins, because Shin scans North American shelves, where a short code starting 0 or 1 is a UPC-E (EAN-8 prefix 0 is restricted-circulation, and US-issued EAN-8s are rare).
  if (allowUpcE && /^[01]\d{7}$/.test(digits)) {
    const upca = upcEExpanded(digits);
    if (upca) return { gtin: upca, how: 'upc_e_expanded', variableMeasure: null };
  }
  if (!isValidGtin(digits)) return null;
  const weighed = variableMeasure(digits);
  if (weighed) return { gtin: weighed.key, how: 'variable_measure', variableMeasure: weighed.vm };
  return { gtin: digits, how, variableMeasure: null };
}

/**
 * The one canonical barcode this scan may spend on, with how it was reached
 * and, for a weighed-item label, the price the label carried. Null when
 * nothing about the reading can be made to check out.
 *
 * Order: the digits as read, then the zero paddings in `gtinVariants` order.
 * Each candidate is tried as UPC-E before EAN-8 (see `interpret`), and a
 * weighed-item label collapses to its item-family key.
 *
 * UPC-E is tried only when the reading had at least 7 digits: 8 as printed,
 * or 7 with the leading zero dropped, both still carrying their own check
 * digit. A reading of 6 digits or fewer behaves exactly as before 7B.8 (zero
 * padding against the EAN-8 check only); a bare 6-digit UPC-E body carries no
 * check digit, so one misread digit would be a confident wrong product.
 */
export function canonicalBarcode(raw: string): CanonicalBarcode | null {
  const direct = gtinFrom(raw);
  if (direct) return interpret(direct, 'as_read', true);
  const digits = raw.replace(/\D/g, '');
  const allowUpcE = digits.length >= 7;
  for (const variant of gtinVariants(raw)) {
    const hit = interpret(variant, variant === digits ? 'as_read' : 'zero_padded', allowUpcE);
    if (hit) return hit;
  }
  return null;
}

/**
 * The one canonical digit string this scan may spend its Gemini call on, or
 * null when nothing about the reading can be made to check out.
 *
 * `gtinFrom` (the digits exactly as read, whitespace/dashes stripped) wins
 * when it already passes the GS1 check digit: that is the common case and it
 * changes nothing about what the phone read. Only when that fails does this
 * try the other paddings, in the fixed order `gtinVariants` returns them, and
 * the first one that checks out is the canonical string -- a repair applied
 * before the one call is made, not a second call after a miss. Since 7B.8 a
 * UPC-E reading comes back as its 12-digit UPC-A and a weighed-item label as
 * its item-family key; `canonicalBarcode` says which, and carries the price.
 */
export function canonicalGtin(raw: string): string | null {
  return canonicalBarcode(raw)?.gtin ?? null;
}
