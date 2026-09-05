/**
 * The catalogue as something an HTTP handler can call without freezing.
 *
 * `worker.ts` explains why a search cannot run on the same thread that answers
 * barcodes: `node:sqlite` is synchronous, and a text search's vector arm was
 * measured at 735 ms with only 6% of the catalogue embedded, heading toward
 * roughly twelve seconds finished. This file is the other half: the client
 * that owns the worker, gives every request an id, and resolves the matching
 * promise when the worker answers, in whatever order the jobs finish.
 *
 * Barcode lookups do NOT go through here. They are 0.2 ms of synchronous work
 * against their own read-only handle (`app/server.ts`'s `fastLookup`), and
 * routing them through this worker would put them in the same single-threaded
 * queue as whatever slow search is already running, which defeats the entire
 * point. This service exists for the one thing that actually needs to get off
 * the request thread: text search.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { SearchQuery, SearchResult, NeighbourRing } from './search.ts';
import type { Job } from './worker.ts';

interface WorkerReply {
  readonly id: number;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
  readonly ms: number;
}

export interface CatalogueService {
  /** Resolves once the embedder is loaded, so the first real search does not pay for it. */
  readonly ready: Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  ring(categoryPath: readonly string[], want: number, exclude?: string): Promise<NeighbourRing | null>;
  /** Terminates the worker. Used by tests; the app process never calls this. */
  close(): Promise<number>;
}

/**
 * Starts one worker against `dbPath` and returns a client for it.
 *
 * One worker, not a pool: this app serves one till warmed, and a second
 * concurrent photo search queueing behind the first is an honest queue, not a
 * bug. If concurrent search volume ever justifies a pool, the queueing shows
 * up as `ms` on the slower request, which is the signal to add one.
 */
export function startCatalogueService(dbPath: string): CatalogueService {
  const worker = new Worker(fileURLToPath(new URL('./worker.ts', import.meta.url)), {
    workerData: { dbPath },
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  worker.on('message', (msg: WorkerReply) => {
    const p = pending.get(msg.id);
    if (!p) return; // A reply to a request nobody is waiting on any more; drop it.
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error));
  });

  // A crashed worker would otherwise leave every in-flight request hanging
  // forever, which is a stuck request pretending to be a slow one. Fail them
  // all loudly instead, so the caller gets a 500 rather than a timeout.
  worker.on('error', (err) => {
    for (const [id, p] of pending) {
      p.reject(err instanceof Error ? err : new Error(String(err)));
      pending.delete(id);
    }
  });

  function send<T>(job: Job): Promise<T> {
    const id = nextId;
    nextId += 1;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, job });
    });
  }

  const ready = send<{ warm: boolean; embedder: string }>({ kind: 'warm' }).then(() => undefined);

  return {
    ready,
    search: (query) => send<SearchResult>({ kind: 'search', query }),
    ring: (categoryPath, want, exclude) =>
      send<NeighbourRing | null>({ kind: 'ring', categoryPath, want, exclude }),
    close: () => worker.terminate(),
  };
}
