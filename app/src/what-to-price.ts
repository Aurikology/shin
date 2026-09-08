/**
 * What to price next, and what nobody can price at all, for a person deciding
 * which seller or discovery path to add.
 *
 * `price/src/queue.ts` has answered this question correctly since it was
 * written and has never been asked it. Its `readScanCounts` seam defaults to an
 * empty map, and with no scans its own MAIN RESULT -- scanned products that no
 * crawler can reach -- is empty by construction. So the module was not merely
 * uncalled (DEFECTS.md D-026); it was uncallable in the only way that would
 * have produced its most useful output. This file is the caller, and
 * `scanCountsByCode` in scans.ts is the reader it needed.
 *
 * THE ORDER THINGS ARE PRINTED IN IS THE POINT, and it is queue.ts's order, not
 * a presentation choice made here. The unreachable list comes first because it
 * is the gap between what people are asking for and what this system can
 * answer, which is the one thing on this page that changes what somebody
 * should go and build. The crawl queue is second: it is work already
 * mechanically possible. Held-back codes are last and are not a to-do list at
 * all, only the reason a code somebody expected is missing from the queue.
 *
 * A REPORT, not a scheduler. Nothing here runs a crawler, and queue.ts's header
 * is explicit that it does not either.
 *
 * Run with `npm run what-to-price` from the app package, or
 * `node src/what-to-price.ts [windowDays] [limit]`.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

import { nextToPrice } from '../../price/src/queue.ts';
import { PRICES_DB_PATH } from '../../price/src/store.ts';
import { openScanStore, scanCountsByCode } from './scans.ts';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function main(): Promise<void> {
  const windowDays = Number(process.argv[2] ?? '7') || 7;
  const limit = Number(process.argv[3] ?? '25') || 25;

  const store = openScanStore();
  if (!store.db) {
    // Named rather than reported as "nothing to price". A scan log that will
    // not open and a week where nobody scanned produce the same empty map, and
    // they mean opposite things to the person reading this.
    console.log(`The scan log could not be opened (${store.path}): ${store.droppedWhy}`);
    console.log('Everything below would be computed from zero scans, so nothing is printed.');
    return;
  }

  /*
   * WHY THIS CHECK IS HERE AND NOT INSIDE `nextToPrice`.
   *
   * That function returns its empty result for three different situations: no
   * prices database, a database with no `observation` table, and a genuinely
   * empty queue. Collapsing them is right for a caller that only wants work to
   * do, and wrong for this one: printing "nothing to price" when the truth is
   * "I could not open the prices database" is the same fault as putting a
   * reassuring sentence on a screen after a failed lookup (D-011), one layer
   * down. Caught the first time this ran: `price/data/prices.db` does not exist
   * on a fresh checkout, and the report cheerfully said every scanned product
   * already had a price.
   */
  if (!existsSync(PRICES_DB_PATH)) {
    console.log(`No prices database at ${PRICES_DB_PATH}.`);
    console.log('Nothing below was computed. This is not "nothing to price".');
    return;
  }
  try {
    const probe = new DatabaseSync(PRICES_DB_PATH, { readOnly: true });
    const has = probe
      .prepare(`SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'observation'`)
      .get() as { n: number } | undefined;
    probe.close();
    if (!has) {
      console.log(`${PRICES_DB_PATH} has no observation table, so nothing has ever been priced.`);
      console.log('Nothing below was computed. This is not "nothing to price".');
      return;
    }
  } catch (err) {
    console.log(`The prices database could not be read (${PRICES_DB_PATH}): ${String(err)}`);
    console.log('Nothing below was computed. This is not "nothing to price".');
    return;
  }

  const counts = scanCountsByCode(windowDays);
  const scanned = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log(`Scans in the last ${plural(windowDays, 'day')}: ${scanned} across ${plural(counts.size, 'product')}.`);
  console.log(`Reading ${store.path}\n`);

  const result = await nextToPrice({ readScanCounts: () => counts, limit });

  console.log('== Asked for, and nothing can price it ==');
  if (result.scannedNoCrawlerCanReach.length === 0) {
    console.log('  (none: every scanned product has a price on file, or nobody scanned)\n');
  } else {
    console.log('  This is the gap. Each line is a product people scanned that no');
    console.log('  crawler here can reach, most-scanned first.\n');
    for (const row of result.scannedNoCrawlerCanReach) {
      console.log(`  ${String(row.scanCount).padStart(4)}x  ${row.code}`);
    }
    /*
     * The reasons print once each, under the list, rather than on every line.
     * queue.ts gives every row its own sentence and they are all currently the
     * same sentence, so repeating it turns a six-line answer into six copies of
     * one paragraph and buries the codes, which are the part somebody acts on.
     * Grouped rather than hardcoded to one, so the day a second reason exists
     * this still prints both.
     */
    for (const reason of new Set(result.scannedNoCrawlerCanReach.map((r) => r.reason))) {
      console.log(`  Why: ${reason}`);
    }
    console.log();
  }

  console.log('== Crawl next, in this order ==');
  if (result.toCrawl.length === 0) {
    console.log('  (nothing is due)\n');
  } else {
    for (const row of result.toCrawl) {
      const age = `${row.priceAgeDays}d old, due every ${row.intervalDays}d`;
      console.log(`  ${row.code}  ${row.reason.padEnd(24)} ${String(row.scanCount).padStart(3)} scans, ${age}`);
      if (row.note) console.log(`      ${row.note}`);
    }
    console.log();
  }

  if (result.heldBack.length > 0) {
    console.log('== Held back, not forgotten ==');
    console.log('  Sitting out a backoff after a recent failure or throttle.\n');
    for (const row of result.heldBack) {
      console.log(
        `  ${row.code}  ${row.seller}  ${row.outcome} ${row.daysSinceAttempt}d ago, backoff ${row.backoffDays}d`,
      );
    }
    console.log();
  }
}

main();
