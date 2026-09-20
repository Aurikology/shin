/**
 * Barcode check-digit validation and zero-pad normalization, wired into the
 * one path that spends a paid Gemini call.
 *
 * ITEM 2 (docs/scanner-build-order-2026-09-19.md, section 2). The check-digit
 * function (`identify/src/gtin.ts`, `isValidGtin`/`gtinFrom`) and a zero-pad
 * normalization pattern (`catalogue/src/search.ts`, `catalogue/src/
 * user-catalogue.ts`) both already existed, correctly, before this file did.
 * Neither was ever called from `/api/identify`, so a misread or short
 * barcode went straight to Gemini and spent the one call the scan gets. This
 * file re-derives the same padStart/strip shape locally rather than
 * importing `catalogue/`'s search index, because app/ has no reason to load
 * a 4 GB catalogue module just to pad a string.
 *
 * Ruling 2 (docs/decisions.md, "Nine rulings so the competitor-survey build
 * could start", 2026-09-19): "The zero-padded barcode retry never re-hits
 * Gemini. It runs before the call, against the cache and Open Food Facts
 * only, and exactly one canonical digit string is sent to Gemini." So the
 * padding here is pre-send sanitization, never a second attempt after a
 * Gemini miss: `canonicalGtin` picks ONE string (the digits as read, or the
 * first padded form that passes the check digit) before anything is spent,
 * and nothing downstream ever sees more than one candidate.
 */

import { gtinFrom, isValidGtin } from '../../identify/src/gtin.ts';

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

/**
 * The one canonical digit string this scan may spend its Gemini call on, or
 * null when nothing about the reading can be made to check out.
 *
 * `gtinFrom` (the digits exactly as read, whitespace/dashes stripped) wins
 * when it already passes the GS1 check digit: that is the common case and it
 * changes nothing about what the phone read. Only when that fails does this
 * try the other paddings, in the fixed order `gtinVariants` returns them, and
 * the first one that checks out is the canonical string -- a repair applied
 * before the one call is made, not a second call after a miss.
 */
export function canonicalGtin(raw: string): string | null {
  const direct = gtinFrom(raw);
  if (direct) return direct;
  for (const variant of gtinVariants(raw)) {
    if (isValidGtin(variant)) return variant;
  }
  return null;
}
