/**
 * One worker thread of name-meaning.ts `knnTopK`: the exact top-k by dot product
 * for its slice of the queries, over vectors shared with the main thread. A failure
 * is posted back and stops the run.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { topKSlice } from './knn.ts';

const d = workerData as { L: SharedArrayBuffer; nL: number; Q: SharedArrayBuffer; from: number; to: number; dim: number; k: number };
try {
  const r = topKSlice(new Float32Array(d.L), d.nL, new Float32Array(d.Q), d.from, d.to, d.dim, d.k);
  parentPort!.postMessage({ ok: true, idx: r.idx, sim: r.sim }, [r.idx.buffer as ArrayBuffer, r.sim.buffer as ArrayBuffer]);
} catch (err) {
  console.error(`knn-worker: ${err instanceof Error ? err.message : String(err)}`);
  parentPort!.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
}
