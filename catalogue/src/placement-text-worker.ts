/**
 * One worker thread of placement-cascade.ts `textNeighbours`: opens the catalogue
 * READ ONLY and runs the word search for its share of the items. Any failure is
 * posted back as an error and stops the run; nothing is swallowed.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { openCatalogueReadOnly } from './schema.ts';
import { searchBatch, type TextQuery } from './placement-cascade.ts';

const { dbPath, queries } = workerData as { dbPath: string; queries: TextQuery[] };
try {
  const db = openCatalogueReadOnly(dbPath);
  const result = await searchBatch(db, queries);
  db.close();
  parentPort!.postMessage({ ok: true, result });
} catch (err) {
  console.error(`placement-text-worker: ${err instanceof Error ? err.message : String(err)}`);
  parentPort!.postMessage({ ok: false, error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) });
}
