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
 * barcode. Only a 12-digit code is padded, and only a 14-digit code whose leading
 * digit is 0 is shortened, since a GTIN-14 with a zero indicator is the same trade
 * item. An 8-digit EAN-8 is left alone: it is a different code, not a short EAN-13,
 * and 7,724 rows carry one. Anything else, including a code holding a letter or a
 * space, passes through untouched, because rejecting it here would silently drop a
 * row and that row belongs in the table where somebody can see it and fix it.
 */
export function canonicalCode(code: string): string {
  const digits = code.trim();
  if (!/^\d+$/.test(digits)) return code;
  if (digits.length === 12) return `0${digits}`;
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
