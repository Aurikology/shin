/**
 * Exact nearest neighbours by dot product (cosine, on unit vectors), the brute-force
 * way. Kept in its own file so a worker can import it without loading anything else.
 *
 * Order is deterministic: higher similarity first, and on a tie the lower index
 * first, so a run in one thread and a run across workers give the same lists.
 */

export interface TopK {
  /** nQ * k neighbour indexes, -1 where fewer than k labelled vectors exist. */
  readonly idx: Int32Array;
  readonly sim: Float32Array;
}

export function topKSlice(L: Float32Array, nL: number, Q: Float32Array, from: number, to: number, dim: number, k: number): TopK {
  const n = to - from;
  const idx = new Int32Array(n * k).fill(-1);
  const sim = new Float32Array(n * k).fill(Number.NEGATIVE_INFINITY);
  const bs = new Float64Array(k);
  const bi = new Int32Array(k);
  for (let q = from; q < to; q++) {
    const qo = q * dim;
    let filled = 0;
    for (let j = 0; j < nL; j++) {
      const lo = j * dim;
      let s = 0;
      for (let i = 0; i < dim; i++) s += Q[qo + i]! * L[lo + i]!;
      if (filled === k && s <= bs[k - 1]!) continue;
      // Insert after every entry with a score >= s (a tie keeps the earlier index first).
      let p = filled < k ? filled : k - 1;
      while (p > 0 && bs[p - 1]! < s) {
        bs[p] = bs[p - 1]!;
        bi[p] = bi[p - 1]!;
        p--;
      }
      bs[p] = s;
      bi[p] = j;
      if (filled < k) filled++;
    }
    const o = (q - from) * k;
    for (let t = 0; t < filled; t++) {
      idx[o + t] = bi[t]!;
      sim[o + t] = bs[t]!;
    }
  }
  return { idx, sim };
}
