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
  /** The worker's count of misses it could not write down, and why (search.ts gapsDropped). */
  readonly gaps?: { readonly dropped: number; readonly why: string };
}

export interface CatalogueService {
  /** Resolves once the embedder is loaded, so the first real search does not pay for it. */
  readonly ready: Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  ring(categoryPath: readonly string[], want: number, exclude?: string): Promise<NeighbourRing | null>;
  /** Terminates every worker. Used by tests and a clean shutdown; a search after it is refused at once. */
  close(): Promise<number>;
  /** The misses the workers could not write to the gap log, summed over them, and the latest reason; zero and empty until a reply says otherwise. */
  gaps(): { readonly dropped: number; readonly why: string };
  /** How many worker threads are alive right now (0 after `close`, or when every worker kept dying at start). */
  threads(): number;
  /** TEST ONLY: stops one live worker the way a crash would; resolves true when there was one to stop. */
  crashOneForTests(): Promise<boolean>;
}

/**
 * A POOL OF WORKERS, gaps 54 and 67 (load test on the Mac, 2026-11-21).
 *
 * This used to be one worker, on the reasoning that a second concurrent search
 * queueing behind the first is an honest queue, and that the queueing would
 * show up as `ms` on the slower request as the signal to add a pool. The load
 * test was that signal: with typed search alone the server broke at 512
 * continuous users (p95 1.5 to 2.8 s, connections reset) while the process
 * used under 2 of the Mac's 8 cores, the request thread and this one worker.
 *
 * Every worker is the same program (`worker.ts`) on its own read-only handle
 * on the same file, so any one of them gives the same answer; a job goes to the
 * worker with the fewest jobs waiting. WAL lets any number of readers share the
 * file with each other and with a loader writing to it. The ranking itself
 * lives in search.ts and is untouched here.
 *
 * A worker that crashes fails its own in-flight jobs and is replaced. One that
 * dies within a few seconds of starting is retried at most RESTARTS_PER_SLOT
 * times, so a missing or unreadable file costs a few failed starts, not a loop.
 */
/** See the note inside `send`. The number the comments that promised it chose. */
export const SEARCH_TIMEOUT_MS = 5_000;

/** A worker that dies sooner than this after starting counts against its slot's restart budget. */
const EARLY_DEATH_MS = 5_000;
/** Early deaths a slot may have before it is given up on (its jobs then go to the others, or are refused). */
const RESTARTS_PER_SLOT = 3;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

interface Slot {
  worker: Worker;
  readonly pending: Map<number, Pending>;
  gaps: { dropped: number; why: string };
  startedAt: number;
  earlyDeaths: number;
  /** False once the worker has exited or errored; a dead slot takes no jobs. */
  alive: boolean;
}

/**
 * `warm` false skips the boot pre-load of the embedding model (D40). The caller
 * says false when meaning search is off: nothing will embed a query, so loading
 * the model only costs memory and, on a machine whose model file is damaged,
 * logs a load failure about a feature that is not running.
 *
 * `size` is how many worker threads to run (default 1). The server picks it
 * from the core count (app/server.ts `workerThreadsEach`).
 */
export function startCatalogueService(dbPath: string, opts: { warm?: boolean; size?: number } = {}): CatalogueService {
  const size = Math.max(1, Math.floor(opts.size ?? 1));
  const workerFile = fileURLToPath(new URL('./worker.ts', import.meta.url));
  let nextId = 1;
  let closed = false;
  const slots: Slot[] = [];

  function failAll(slot: Slot, err: Error): void {
    for (const [id, p] of slot.pending) {
      slot.pending.delete(id);
      p.reject(err);
    }
  }

  function spawn(slot: Slot | null): Slot {
    const worker = new Worker(workerFile, { workerData: { dbPath } });
    const s: Slot = slot ?? { worker, pending: new Map(), gaps: { dropped: 0, why: '' }, startedAt: 0, earlyDeaths: 0, alive: true };
    s.worker = worker;
    s.startedAt = Date.now();
    s.alive = true;

    worker.on('message', (msg: WorkerReply) => {
      if (msg.gaps) s.gaps = { dropped: msg.gaps.dropped, why: msg.gaps.why };
      const p = s.pending.get(msg.id);
      if (!p) return; // A reply to a request nobody is waiting on any more; drop it.
      s.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new Error(msg.error));
    });

    /*
     * A crashed worker would otherwise leave every in-flight request hanging
     * forever, which is a stuck request pretending to be a slow one. Fail them
     * all loudly instead, so the caller gets its error rather than a timeout,
     * then put a fresh worker in its place. `error` is followed by `exit`, so
     * the replacement is made once, on `exit`.
     */
    let lastError: Error | null = null;
    worker.on('error', (err) => {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (s.worker === worker) failAll(s, lastError);
    });
    worker.on('exit', (code) => {
      if (s.worker !== worker) return; // an older worker of this slot, already replaced
      s.alive = false;
      failAll(s, lastError ?? new Error(`catalogue worker stopped (exit code ${code})`));
      if (closed) return;
      if (Date.now() - s.startedAt < EARLY_DEATH_MS) s.earlyDeaths += 1;
      else s.earlyDeaths = 0;
      if (s.earlyDeaths > RESTARTS_PER_SLOT) {
        console.error(
          `catalogue worker keeps dying at start, slot given up after ${s.earlyDeaths} tries: ${lastError?.message ?? `exit code ${code}`}`,
        );
        return;
      }
      console.error(`catalogue worker stopped (${lastError?.message ?? `exit code ${code}`}); starting a replacement`);
      spawn(s);
    });
    return s;
  }

  for (let i = 0; i < size; i += 1) slots.push(spawn(null));

  /** The live worker with the fewest jobs waiting, or null when none is alive. */
  function leastBusy(): Slot | null {
    let best: Slot | null = null;
    for (const s of slots) if (s.alive && (best === null || s.pending.size < best.pending.size)) best = s;
    return best;
  }

  function send<T>(job: Job, slot: Slot | null = leastBusy()): Promise<T> {
    const id = nextId;
    nextId += 1;
    if (closed) return Promise.reject(new Error('the catalogue service is closed'));
    if (!slot) return Promise.reject(new Error(`no catalogue worker is running (all ${size} kept dying at start)`));
    const worker = slot.worker;
    const pending = slot.pending;
    return new Promise<T>((resolve, reject) => {
      /*
       * THE FIVE-SECOND TIMEOUT THAT THREE COMMENTS IN app/server.ts PROMISED
       * AND NOTHING IMPLEMENTED, added 2026-09-09.
       *
       * `/api/identify` and `/api/search` both documented a 5 second ceiling
       * on this worker, and `/api/alternatives` documented why it is exempt
       * from that ceiling. There was no ceiling. A worker that never replied
       * -- a hung SQLite lock, a crashed embedder, a message lost on
       * terminate -- left the request awaiting forever, and the screen on the
       * working sheet the comments name as the thing to guard against. The
       * `error` handler above covers a worker that CRASHES; this covers one
       * that merely stops answering, which no event announces. A comment
       * reporting a guard that was never installed is D-051's shape.
       *
       * Cleared on settle. On timeout the pending entry is dropped, so a late
       * reply finds nothing and is ignored rather than resolving a promise
       * that already rejected. Five seconds is the number the comments
       * chose: a text search is 24 to 113 ms measured, so this is not a
       * budget, it is the line between slow and gone.
       */
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`catalogue worker did not answer a ${job.kind} within ${SEARCH_TIMEOUT_MS} ms`));
      }, SEARCH_TIMEOUT_MS);
      timer.unref();
      pending.set(id, {
        resolve: (v: unknown) => { clearTimeout(timer); (resolve as (v: unknown) => void)(v); },
        reject: (e: Error) => { clearTimeout(timer); reject(e); },
      });
      worker.postMessage({ id, job });
    });
  }

  /*
   * D-129. The warm job is a PRE-LOAD: worker.ts calls it "one tiny embed,
   * purely to pull the ONNX model into memory before a person is waiting on
   * it". Failing it should cost a slow first query. It was killing the
   * server at boot instead.
   *
   * Loading an ONNX model off a cold disk can take longer than
   * SEARCH_TIMEOUT_MS, so `send` rejects; NOTHING awaits `ready` -- the field
   * is declared on the interface and has no consumer anywhere in the repo --
   * so the rejection is unhandled and Node 24 exits the process. Measured on
   * this machine 2026-09-19: `node app/server.ts` prints its banner, prints
   * `meaning search off: 0 rows embedded`, and then dies on
   * "catalogue worker did not answer a warm within 5000 ms".
   *
   * THE SERVER WAS DYING WAITING FOR A SUBSYSTEM IT HAD JUST TURNED OFF.
   * With no rows embedded, meaning search does not run at all, so the model
   * being warmed is one no query will use.
   *
   * This is the same unhandled-rejection death `app/test/hostile-request
   * .test.mjs` was written for on 2026-09-08, in a second place: there a
   * malformed Host header threw outside a try, here a pre-load misses a
   * deadline. Both end with the process gone for everybody.
   */
  // Every worker loads its own model, so every one is warmed.
  const ready = (opts.warm === false ? Promise.resolve(undefined) : Promise.all(slots.map((s) => send<{ warm: boolean; embedder: string }>({ kind: 'warm' }, s))))
    .then(() => undefined)
    .catch((err: unknown) => {
      // Named on stderr rather than swallowed: a warm that never lands means
      // every first query pays the model load, and that is worth seeing.
      console.error(
        `catalogue warm did not land, serving anyway: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  return {
    ready,
    search: (query) => send<SearchResult>({ kind: 'search', query }),
    ring: (categoryPath, want, exclude) =>
      send<NeighbourRing | null>({ kind: 'ring', categoryPath, want, exclude }),
    close: async () => {
      closed = true;
      const codes = await Promise.all(slots.map((s) => (s.alive ? s.worker.terminate() : Promise.resolve(0))));
      for (const s of slots) s.alive = false;
      return codes[0] ?? 0;
    },
    gaps: () => {
      // Each worker counts its own; the reason shown is the first one any worker gave.
      let dropped = 0;
      let why = '';
      for (const s of slots) {
        dropped += s.gaps.dropped;
        if (!why && s.gaps.why) why = s.gaps.why;
      }
      return { dropped, why };
    },
    threads: () => slots.filter((s) => s.alive).length,
    crashOneForTests: async () => {
      const s = slots.find((x) => x.alive);
      if (!s) return false;
      // terminate() is what a crash looks like from here: the worker's `exit` fires with code 1.
      // `exit` runs the replacement before the awaited terminate resolves.
      await s.worker.terminate();
      return true;
    },
  };
}
