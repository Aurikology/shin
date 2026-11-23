// mac/kroger-codes.mjs -- pick the barcodes the daily Kroger refresh should re-price.
//
//   node mac/kroger-codes.mjs <prices.db> <out-file> <max-codes>
//
// Distinct barcodes that have a Kroger observation (rows whose barcode did not join the catalogue
// keep it in page_gtin), ordered by when Kroger last answered about them, OLDEST FIRST, cut to
// <max-codes>. "Last answered" is the later of the newest Kroger observation and the newest Kroger
// crawl_attempt: a barcode Kroger no longer returns writes no observation but still gets an attempt,
// so it rotates to the back instead of taking the budget every day. Writes one barcode per line and
// prints the count. Read-only on the database. Exits non-zero on any problem.
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

export const SELLER = 'Kroger';

export function pickCodes(db, max) {
  const rows = db
    .prepare(
      `WITH seen AS (
         SELECT COALESCE(code, page_gtin) AS c, MAX(seen_on) AS d
           FROM observation WHERE seller = ? AND COALESCE(code, page_gtin) IS NOT NULL GROUP BY 1
         UNION ALL
         SELECT code AS c, MAX(attempted_on) AS d FROM crawl_attempt WHERE seller = ? GROUP BY 1
       ),
       latest AS (SELECT c, MAX(d) AS d FROM seen GROUP BY c)
       SELECT c FROM latest
        WHERE c IN (SELECT COALESCE(code, page_gtin) FROM observation WHERE seller = ?)
        ORDER BY d ASC, c ASC LIMIT ?`,
    )
    .all(SELLER, SELLER, SELLER, max);
  return rows.map((r) => String(r.c));
}

if (import.meta.filename === process.argv[1]) {
  try {
    const [dbPath, out, maxArg] = process.argv.slice(2);
    const max = Number(maxArg);
    if (!dbPath || !out || !Number.isInteger(max) || max < 1) throw new Error('usage: kroger-codes.mjs <prices.db> <out-file> <max-codes>');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const codes = pickCodes(db, max);
    db.close();
    writeFileSync(out, codes.map((c) => c + '\n').join(''));
    console.log(`kroger-codes: ${codes.length} barcodes, oldest first, written to ${out}`);
  } catch (e) {
    console.error(`kroger-codes: FAILED: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
