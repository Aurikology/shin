/**
 * R15: the thread that runs the typed-name scan (see own-prices-scan.ts) so the server's own thread
 * stays free. Started lazily by `scanPriceNamesOffThread`; one request in, one answer out, the answer
 * carrying the request's id. It opens the prices file read-only for each request (a cheap open) so it
 * never holds a handle that a nightly file swap would leave pointing at the old file.
 */
import { parentPort } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { scanPriceNames } from './own-prices-scan.ts';

if (!parentPort) throw new Error('own-prices-worker.ts must be started as a worker');
const port = parentPort;

port.on('message', (msg: { id: number; path: string; like: string | null }) => {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(msg.path, { readOnly: true });
    port.postMessage({ id: msg.id, rows: scanPriceNames(db, msg.like) });
  } catch (err) {
    port.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) });
  } finally {
    try { db?.close(); } catch { /* nothing to close */ }
  }
});
