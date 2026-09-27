/**
 * The canonical spelling of a barcode, in one importable place.
 *
 * WHY ITS OWN FILE. This lived in `load.ts` for about an hour, and a test that
 * imported it from there executed the loader, because `load.ts` is a script with a
 * top-level run: importing it loaded 122,158 prepared rows into the live 4.13 GB
 * catalogue and collided with the dedupe pass running at the same time. The upsert
 * made that harmless, but the lesson is the rule: anything a test needs to import
 * does not live in a file that does work when imported.
 *
 * WHY IT EXISTS AT ALL, counted on the live catalogue 2026-09-26. `load.ts` upserts
 * on `code` exactly as the prepared row spells it, and nothing canonicalised the
 * spelling first, so one barcode written two ways was two rows and the conflict
 * clause never fired: **1,375,443 products were stored under both a 12-digit code
 * and its zero-padded 13-digit twin**, which was every 12-digit row in the table,
 * and **198,095 of those pairs were Canadian, 32% of the 618,365 rows the phone
 * downloads**. A third of that file was a product it already had.
 *
 * THE 13-DIGIT FORM WINS: prepending one zero is how GS1 writes a 12-digit UPC-A as
 * a GTIN-13, 3.79 million rows already use it, and `search.ts`'s `byGtin` and the
 * phone's pack both already handle it.
 */

/**
 * Deliberately narrow, because a loader is the wrong place to be clever about a
 * barcode. A 12-digit code is padded, a 14-digit code whose leading digit is 0 is
 * shortened since a GTIN-14 with a zero indicator is the same trade item, and now
 * an 8-digit code is padded too (see below). Anything else, including an 11-digit
 * or 15-plus-digit code, or a code holding a letter or a space, passes through
 * untouched: the 11- and 15-plus-digit rows are damaged codes, not a zero-padding
 * shape, and padding one would invent a barcode nobody printed; rejecting any of
 * them here would silently drop a row, and that row belongs in the table where
 * somebody can see it and fix it.
 *
 * WHY AN 8-DIGIT CODE USED TO BE LEFT ALONE, AND WHY THAT WAS ONLY HALF RIGHT.
 * This comment used to say an 8-digit EAN-8 is left alone because "it is a
 * different code, not a short EAN-13." That is still true about NOT padding an
 * EAN-8 out to 12 digits: an EAN-8 is its own GS1 number space, not a truncated
 * UPC-A, so treating it as one would invent a barcode nobody printed. It was wrong
 * about the 13-digit form. GS1 also writes an EAN-8 right-aligned in a 13- or
 * 14-digit field with leading zeros, exactly how a 12-digit UPC-A becomes a
 * GTIN-13 above, and a GTIN's check digit is computed from the right with
 * alternating 3/1 weights, so zero-padding never changes it. `00128582` and
 * `0000000128582` are one trade item written two ways.
 *
 * Found 2026-09-26 by reading the shipped phone pack rather than the code:
 * `export-pack.ts`'s own layout comment says the barcode array is strictly
 * ascending so the phone can binary search it, and it was not -- 118 adjacent
 * pairs in `data/pack-canada.bin` were EQUAL, because an 8-digit code and its
 * zero-padded 13-digit twin collapsed to the same unsigned 64-bit integer with
 * nothing canonicalising them to one spelling first. Counted on the live
 * catalogue: 8,414 rows carry an 8-digit code, and 406 pairs (812 rows) exist
 * where an 8-digit code and '00000' plus that code are BOTH present -- 119 of
 * the pairs Canadian, 404 of the 406 carrying the same name on both rows
 * already. Counted by numeric value instead of the zero-padding string rule,
 * the total is the same 406 pairs, and 13 and 8 are the only shapes involved,
 * so this class is closed.
 */
export function canonicalCode(code: string): string {
  const digits = code.trim();
  if (!/^\d+$/.test(digits)) return code;
  if (digits.length === 8) return `00000${digits}`;
  if (digits.length === 12) return `0${digits}`;
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
