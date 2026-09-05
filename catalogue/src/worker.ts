/**
 * One search worker. Owns a read-only handle and, lazily, one embedder.
 *
 * WHY THIS EXISTS AT ALL, which is the whole reason the catalogue can be put in
 * front of a user: `node:sqlite` is synchronous. Every query blocks the thread
 * it runs on for its full duration, and the measured durations on 2026-09-05
 * were 0.2 ms for a barcode, 24 to 113 ms for a text search, and 735 ms for one
 * vector KNN with only 6% of the rows embedded. Finished, that KNN is a scan of
 * roughly 8 GB and lands near twelve seconds.
 *
 * On one thread that is not a slow feature, it is an outage: the person who
 * asked for a photo search freezes the barcode lookup of everybody else in the
 * building. Racing a timer against it does nothing, because there is no await
 * inside a synchronous call for a timer to win.
 *
 * So the expensive paths run here, off the request thread, and the request
 * thread keeps answering barcodes at 0.2 ms while this one is busy.
 *
 * Each worker opens its own connection. WAL allows one writer and any number of
 * readers, so several of these coexist with each other and with a loader or an
 * embedding job still writing to the same file.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { openCatalogueReadOnly } from './schema.ts';
import { Catalogue } from './search.ts';
import type { SearchQuery } from './search.ts';
import { defaultEmbedder } from './embed.ts';

if (!parentPort) throw new Error('worker.ts is not a program; the pool starts it');

const { dbPath } = workerData as { dbPath: string };

const db = openCatalogueReadOnly(dbPath);

/**
 * The embedder is constructed now and loads its model on first use, which costs
 * 2197 ms measured. That cost is paid by whichever request is unlucky enough to
 * be first unless something warms it, so the pool sends a `warm` job at boot.
 */
const embedder = defaultEmbedder();
const catalogue = new Catalogue(db, embedder);

export type Job =
  | { readonly kind: 'warm' }
  | { readonly kind: 'search'; readonly query: SearchQuery }
  | { readonly kind: 'gtin'; readonly code: string }
  | {
      readonly kind: 'ring';
      readonly categoryPath: readonly string[];
      readonly want: number;
      readonly exclude?: string;
    };

interface Envelope {
  readonly id: number;
  readonly job: Job;
}

parentPort.on('message', async (msg: Envelope) => {
  const started = Date.now();
  try {
    let value: unknown;
    switch (msg.job.kind) {
      case 'warm':
        // One tiny embed, purely to pull the ONNX model into memory before a
        // person is waiting on it.
        await embedder.embedQuery('warm');
        value = { warm: true, embedder: embedder.id };
        break;
      case 'search':
        value = await catalogue.search(msg.job.query);
        break;
      case 'gtin':
        value = catalogue.byGtin(msg.job.code);
        break;
      case 'ring':
        value = catalogue.ring(msg.job.categoryPath, msg.job.want, msg.job.exclude);
        break;
    }
    parentPort!.postMessage({ id: msg.id, ok: true, value, ms: Date.now() - started });
  } catch (err) {
    // A failed search is reported, never swallowed into an empty result. An
    // empty result and a broken index look identical to the screen otherwise,
    // and the screen would tell the user we do not have their product.
    parentPort!.postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    });
  }
});
