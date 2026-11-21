/**
 * Gap 54 and 67: the request thread's side of the barcode worker threads (`barcode-worker.ts`).
 *
 * `answer` hands one scanned barcode to the least busy worker and resolves with the very answer
 * `answerBarcodeFromCatalogue` gives on this thread, or with `done: null` when the worker did not
 * answer it: a barcode the catalogue lacks (its next steps are network calls that stay here), a
 * worker that failed, crashed or ran out of time. The caller then answers on this thread exactly
 * as it did before the pool existed, so a broken worker costs speed, never an answer.
 *
 * While a job is out the worker may ask this thread for the two things it cannot do itself: the
 * paid Claude range ask and the name search (`call`). If a job dies after its Claude ask was
 * made, the fallback is told (`askSpent`) so the shopper is not charged a second ask for one scan.
 *
 * A worker that crashes is replaced; one that dies within seconds of starting is given up on after
 * a few tries, so a missing catalogue cannot spin. Shut down with `close()`.
 */
import { Worker } from 'node:worker_threads';
import type { CanonicalBarcode } from './barcode.ts';
import type { BarcodeDeps, CatalogueAnswer, CatalogueRecord, Identity } from './catalogue-first.ts';
import type { RungUse } from './category-guard.ts';
import type { PricesDbState } from './prices-health.ts';

/** One scan, as plain data: everything `withCatalogueFirstDeps` (app/server.ts) puts in the deps that is not a handle or a function. */
export interface BarcodeJob {
  readonly canonical: CanonicalBarcode;
  readonly country: string | null;
  readonly currency: string;
  readonly asOf: string;
  readonly region: string | null;
  readonly shopper: { readonly cents: number; readonly thresholds?: unknown } | null;
  readonly claudeWaitMs?: number;
  /** The Statistics Canada rung is offered (the client said it can show it). */
  readonly nationalAverage: boolean;
  readonly hasAskRange: boolean;
  readonly hasSortName: boolean;
  readonly shopperVoiceOff: boolean;
  /** The corrections file shoppers' prices are read from, or null for none. */
  readonly correctionsPath: string | null;
  readonly identity?: Identity;
}

export type MainToWorker =
  | { readonly type: 'job'; readonly id: number; readonly job: BarcodeJob }
  | { readonly type: 'called'; readonly call: number; readonly ok: boolean; readonly value?: unknown; readonly error?: string };

export type WorkerToMain =
  | {
      readonly type: 'answer';
      readonly id: number;
      readonly answer: CatalogueAnswer;
      readonly record: CatalogueRecord;
      readonly guardUses: readonly RungUse[];
      readonly pricesState: PricesDbState;
      readonly pricesError: string | null;
      readonly faults: { readonly catalogue: Record<string, number>; readonly range: Record<string, number> };
    }
  | { readonly type: 'skip'; readonly id: number; readonly why: 'miss' | 'lookup_failed' }
  | { readonly type: 'error'; readonly id: number; readonly error: string }
  | { readonly type: 'call'; readonly job: number; readonly call: number; readonly fn: 'askRange' | 'sortName'; readonly arg: unknown };

/** What a job may ask of this thread. Absent means the request offered none. */
export interface BarcodeCalls {
  readonly askRange?: BarcodeDeps['askRange'];
  readonly sortName?: BarcodeDeps['sortName'];
}

export type PoolResult =
  | { readonly done: { answer: CatalogueAnswer; record: CatalogueRecord } }
  | { readonly done: null; readonly why: string; readonly askSpent: boolean };

export interface BarcodePoolOptions {
  readonly size: number;
  readonly cataloguePath: string;
  readonly pricesPath: string;
  /** The taxonomy the server's category guard loaded (off-categories.json), or null for no guard. */
  readonly taxonomyPath: string | null;
  /** Each category check an answer made, for the server's own guard to replay (it logs, counts and files). */
  readonly onGuardUse?: (use: RungUse) => void;
  /** The prices-file state each answered scan met, for /api/health (prices-health.ts `notePricesState`). */
  readonly onPricesState?: (state: PricesDbState, openError: string | null) => void;
  /** A worker failed, crashed or timed out on a job; the scan is answered on this thread instead. */
  readonly onFault?: (err: Error) => void;
  /** How long a job may take before it is answered on this thread instead. Default 30 s (a Claude ask waits inside it). */
  readonly timeoutMs?: number;
}

export interface BarcodePool {
  answer(job: BarcodeJob, calls: BarcodeCalls): Promise<PoolResult>;
  /** This pool's workers' fault counts, summed, including workers since replaced; added to /api/health's own. */
  faults(): { catalogue: Record<string, number>; range: Record<string, number> };
  threads(): number;
  close(): Promise<void>;
  /** TEST ONLY: stops one live worker the way a crash would. */
  crashOneForTests(): Promise<boolean>;
}

/**
 * Threads for EACH pool (catalogue search and barcode) from SHIN_WORKER_THREADS. OFF by default:
 * unset, empty, 0 or anything not a whole number gives 0, today's wiring (one search thread, every
 * barcode priced on the request thread), because the memory of one spelling vocabulary per search
 * thread on the real catalogue is unmeasured. A positive whole number turns the pools on, capped at 32.
 */
export function workerThreadsFrom(raw: string | undefined): number {
  const t = raw?.trim();
  if (!t || !/^\d+$/.test(t)) return 0;
  return Math.min(Number(t), 32);
}

const EARLY_DEATH_MS = 5_000;
const RESTARTS_PER_SLOT = 3;

interface Waiting {
  readonly calls: BarcodeCalls;
  readonly resolve: (r: PoolResult) => void;
  readonly timer: NodeJS.Timeout;
  askSpent: boolean;
}

interface Slot {
  worker: Worker;
  readonly waiting: Map<number, Waiting>;
  lastFaults: { catalogue: Record<string, number>; range: Record<string, number> };
  startedAt: number;
  earlyDeaths: number;
  alive: boolean;
}

function addInto(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

export function startBarcodePool(opts: BarcodePoolOptions): BarcodePool {
  const size = Math.max(1, Math.floor(opts.size));
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const workerFile = new URL('./barcode-worker.ts', import.meta.url);
  const slots: Slot[] = [];
  /** Fault counts of workers that have since stopped, so a replacement does not lose them. */
  const retired = { catalogue: {} as Record<string, number>, range: {} as Record<string, number> };
  let seq = 0;
  let closed = false;

  const fault = (err: Error): void => {
    try {
      opts.onFault?.(err);
    } catch {
      /* a faulty reporter must not break a scan */
    }
  };

  function settle(slot: Slot, id: number, r: PoolResult): void {
    const w = slot.waiting.get(id);
    if (!w) return;
    clearTimeout(w.timer);
    slot.waiting.delete(id);
    holdWorker(slot);
    w.resolve(r.done === null ? { ...r, askSpent: w.askSpent } : r);
  }

  /** Keeps the process waiting on a worker only while one of its jobs is out (as own-prices.ts does). */
  function holdWorker(slot: Slot): void {
    if (!slot.alive) return;
    if (slot.waiting.size > 0) slot.worker.ref();
    else slot.worker.unref();
  }

  function failAll(slot: Slot, why: string): void {
    for (const id of [...slot.waiting.keys()]) settle(slot, id, { done: null, why, askSpent: false });
  }

  function spawn(existing: Slot | null): Slot {
    const worker = new Worker(workerFile, {
      workerData: { cataloguePath: opts.cataloguePath, pricesPath: opts.pricesPath, taxonomyPath: opts.taxonomyPath },
    });
    worker.unref();
    const s: Slot = existing ?? { worker, waiting: new Map(), lastFaults: { catalogue: {}, range: {} }, startedAt: 0, earlyDeaths: 0, alive: true };
    s.worker = worker;
    s.startedAt = Date.now();
    s.alive = true;
    s.lastFaults = { catalogue: {}, range: {} };

    worker.on('message', (msg: WorkerToMain) => {
      if (msg.type === 'call') {
        void runCall(s, worker, msg);
        return;
      }
      if (msg.type === 'answer') {
        s.lastFaults = { catalogue: msg.faults.catalogue, range: msg.faults.range };
        if (!s.waiting.has(msg.id)) return; // timed out already; the scan was answered here
        try {
          opts.onPricesState?.(msg.pricesState, msg.pricesError);
          for (const use of msg.guardUses) opts.onGuardUse?.(use);
        } catch (err) {
          fault(err instanceof Error ? err : new Error(String(err)));
        }
        settle(s, msg.id, { done: { answer: msg.answer, record: msg.record } });
      } else if (msg.type === 'skip') {
        settle(s, msg.id, { done: null, why: msg.why, askSpent: false });
      } else {
        fault(new Error(`barcode worker failed a scan: ${msg.error}`));
        settle(s, msg.id, { done: null, why: 'worker_error', askSpent: false });
      }
    });

    let lastError: Error | null = null;
    worker.on('error', (err) => {
      lastError = err instanceof Error ? err : new Error(String(err));
    });
    worker.on('exit', (code) => {
      if (s.worker !== worker) return;
      s.alive = false;
      addInto(retired.catalogue, s.lastFaults.catalogue);
      addInto(retired.range, s.lastFaults.range);
      s.lastFaults = { catalogue: {}, range: {} };
      const why = lastError ? `barcode worker crashed: ${lastError.message}` : `barcode worker stopped (exit code ${code})`;
      if (s.waiting.size > 0 || !closed) fault(new Error(why));
      failAll(s, 'worker_stopped');
      if (closed) return;
      s.earlyDeaths = Date.now() - s.startedAt < EARLY_DEATH_MS ? s.earlyDeaths + 1 : 0;
      if (s.earlyDeaths > RESTARTS_PER_SLOT) {
        console.error(`barcode worker keeps dying at start, slot given up after ${s.earlyDeaths} tries: ${why}`);
        return;
      }
      spawn(s);
    });
    return s;
  }

  async function runCall(slot: Slot, worker: Worker, msg: Extract<WorkerToMain, { type: 'call' }>): Promise<void> {
    const w = slot.waiting.get(msg.job);
    let reply: MainToWorker;
    try {
      const fn = w ? (msg.fn === 'askRange' ? w.calls.askRange : w.calls.sortName) : undefined;
      if (!fn) throw new Error(`no ${msg.fn} for this scan`);
      if (msg.fn === 'askRange' && w) w.askSpent = true;
      const value = await (fn as (arg: unknown) => Promise<unknown>)(msg.arg);
      reply = { type: 'called', call: msg.call, ok: true, value };
    } catch (err) {
      reply = { type: 'called', call: msg.call, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    try {
      worker.postMessage(reply);
    } catch {
      /* the worker stopped meanwhile; its job is already settled */
    }
  }

  for (let i = 0; i < size; i += 1) slots.push(spawn(null));

  function leastBusy(): Slot | null {
    let best: Slot | null = null;
    for (const s of slots) if (s.alive && (best === null || s.waiting.size < best.waiting.size)) best = s;
    return best;
  }

  return {
    answer(job, calls) {
      if (closed) return Promise.resolve({ done: null, why: 'pool_closed', askSpent: false });
      const slot = leastBusy();
      if (!slot) return Promise.resolve({ done: null, why: 'no_worker', askSpent: false });
      const id = (seq += 1);
      return new Promise<PoolResult>((resolve) => {
        const timer = setTimeout(() => {
          fault(new Error(`barcode worker did not answer ${job.canonical.gtin} within ${timeoutMs} ms`));
          settle(slot, id, { done: null, why: 'timeout', askSpent: false });
        }, timeoutMs);
        timer.unref();
        slot.waiting.set(id, { calls, resolve, timer, askSpent: false });
        try {
          slot.worker.postMessage({ type: 'job', id, job } satisfies MainToWorker);
          holdWorker(slot);
        } catch (err) {
          fault(err instanceof Error ? err : new Error(String(err)));
          settle(slot, id, { done: null, why: 'post_failed', askSpent: false });
        }
      });
    },
    faults() {
      const out = { catalogue: { ...retired.catalogue }, range: { ...retired.range } };
      for (const s of slots) {
        addInto(out.catalogue, s.lastFaults.catalogue);
        addInto(out.range, s.lastFaults.range);
      }
      return out;
    },
    threads: () => slots.filter((s) => s.alive).length,
    async close() {
      closed = true;
      await Promise.all(slots.map((s) => (s.alive ? s.worker.terminate() : Promise.resolve(0))));
      for (const s of slots) s.alive = false;
    },
    async crashOneForTests() {
      const s = slots.find((x) => x.alive);
      if (!s) return false;
      await s.worker.terminate();
      return true;
    },
  };
}
