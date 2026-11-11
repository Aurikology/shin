/**
 * A seeded random source. Every choice the crawler makes comes from one of these, so a run is
 * its seed: the same seed gives the same start state, the same fault plan and the same choices.
 */

/** 32-bit string hash (FNV-1a). Used to turn (seed, label) into an independent stream. */
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, fast generator with a 32-bit state. */
export function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** A pick weighted by `weights[i]` (non-negative numbers). */
    weighted(list, weights) {
      const total = weights.reduce((s, w) => s + w, 0);
      if (total <= 0) return list[Math.floor(next() * list.length)];
      let r = next() * total;
      for (let i = 0; i < list.length; i += 1) {
        r -= weights[i];
        if (r < 0) return list[i];
      }
      return list.at(-1);
    },
  };
  return rng;
}

/** An independent generator for (seed, label): decisions about unrelated things never disturb each other. */
export const streamFor = (seed, label) => makeRng(hash32(`${seed}:${label}`));
