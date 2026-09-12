/**
 * The export command behind plan item 10c: dump a date range of the event log
 * as JSON lines.
 *
 *   node src/export-events.ts                          everything
 *   node src/export-events.ts 2026-09-11               that day and after
 *   node src/export-events.ts 2026-09-11 2026-09-14    through the fourteenth
 *   node src/export-events.ts 2026-09-11 2026-09-14 <device-id>
 *
 * JSON LINES, not a JSON array, and it matters for the one use this has: a
 * range of a beta's events is piped into `jq` or read line by line, and an
 * array has to be complete and parsed whole before the first record is
 * readable. Lines stream, survive being cut off half way, and concatenate.
 *
 * THE DATES ARE INCLUSIVE AT BOTH ENDS, which takes one line of arithmetic
 * (`endOfDay` in `events.ts`) and is the only behaviour anybody typing two
 * dates expects. A `to` of 2026-09-14 compared directly against a timestamp
 * would exclude the whole of the fourteenth, silently, and the person reading
 * the output would have no way to tell.
 *
 * STDOUT IS THE DATA AND STDERR IS THE COMMENTARY. The count and any complaint
 * go to stderr, so `> events.jsonl` is a clean file and a failed export is
 * still visible in the terminal. A scan database that will not open is NAMED
 * rather than printed as an empty export, the same rule `what-to-price.ts`
 * states: an empty file and a file that could not be read mean opposite things
 * to whoever is looking at them.
 */

import { openScanStore } from './scans.ts';
import { eventLine, readEvents } from './events.ts';

function main(): void {
  const from = process.argv[2]?.trim() || undefined;
  const to = process.argv[3]?.trim() || undefined;
  const deviceId = process.argv[4]?.trim() || undefined;

  const store = openScanStore();
  if (!store.db) {
    console.error(`The event log could not be opened (${store.path}): ${store.droppedWhy}`);
    console.error('Nothing was exported. An empty file here would have looked like a quiet week.');
    process.exitCode = 1;
    return;
  }

  const rows = readEvents({ from, to, deviceId });
  for (const row of rows) console.log(eventLine(row));

  const range = from || to ? ` between ${from ?? 'the beginning'} and ${to ?? 'now'}` : '';
  const who = deviceId ? ` for ${deviceId}` : '';
  console.error(`${rows.length} event${rows.length === 1 ? '' : 's'}${range}${who}, from ${store.path}`);
}

main();
