/**
 * Prints the catalogue's most-missed searches and barcodes, for a person
 * deciding what to add next.
 *
 * Reads the standalone miss log built in gaps.ts (`data/gaps.db` by
 * default, or `SHIN_GAPS`, or a path given on the command line). Most
 * frequent first, because a hundred people asking for the same missing
 * product outweighs one person asking for something rare, and that is
 * exactly the ordering a person filling gaps wants to work down.
 *
 * This is a list for reading, not a data dump: one line per finding, a
 * count, when it was last seen, and the note if there is one. Run with
 * `npm run gaps:report` from the catalogue package, or
 * `node src/gaps-report.ts [path] [limit]`.
 */

import { openGapLog } from './gaps.ts';

interface GapRow {
  readonly kind: string;
  readonly gtin: string | null;
  readonly query_text: string | null;
  readonly first_seen: string;
  readonly last_seen: string;
  readonly count: number;
  readonly note: string | null;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function describe(row: GapRow): string {
  if (row.kind === 'gtin') {
    const rest = row.query_text ? ` (searched as "${row.query_text}")` : '';
    return `barcode ${row.gtin}${rest}`;
  }
  return `"${row.query_text ?? ''}"`;
}

function main(): void {
  const path = process.argv[2];
  const limit = Number(process.argv[3] ?? 50) || 50;

  const log = path ? openGapLog(path) : openGapLog();

  if (!log.db) {
    console.log(`Could not open the miss log at ${log.path}: ${log.droppedWhy}`);
    process.exitCode = 1;
    return;
  }

  const rows = log.db
    .prepare(
      `SELECT kind, gtin, query_text, first_seen, last_seen, count, note
       FROM gap
       ORDER BY count DESC, last_seen DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as GapRow[];

  const total = log.db.prepare('SELECT COUNT(*) AS n FROM gap').get() as { n: number };

  if (total.n === 0) {
    console.log(`No misses recorded yet in ${log.path}.`);
    return;
  }

  console.log(`Catalogue gaps: ${total.n} distinct finding(s) in ${log.path}`);
  console.log(`Showing the top ${Math.min(limit, total.n)}, most missed first.\n`);

  const countWidth = Math.max(...rows.map((r) => String(r.count).length), 5);
  for (const row of rows) {
    const countCol = String(row.count).padStart(countWidth);
    const kindCol = row.kind.padEnd(4);
    const seenCol = row.first_seen === row.last_seen
      ? `seen ${dateOnly(row.last_seen)}`
      : `first ${dateOnly(row.first_seen)}, last ${dateOnly(row.last_seen)}`;
    const noteCol = row.note ? `  -- ${row.note}` : '';
    console.log(`${countCol}x  ${kindCol} ${describe(row)}  (${seenCol})${noteCol}`);
  }
}

main();
