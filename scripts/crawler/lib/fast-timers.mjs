/**
 * Zero-delay timers that really are fast.
 *
 * The fake browser lets promises and zero-delay timers "settle" after every tap by waiting a few
 * setTimeout(0) turns. On Windows one setTimeout(0) takes about 13 ms (the system timer ticks every
 * 15.6 ms), so six turns cost 80 ms and a crawl spends nearly all its time asleep. This module is
 * imported BEFORE the harness, which captures globalThis.setTimeout when it loads; a timer of 1 ms
 * or less is run as a setImmediate (same order relative to other zero timers, no tick wait).
 * Longer timers are untouched.
 */
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

function fastSetTimeout(cb, ms, ...args) {
  if (ms === undefined || ms === null || Number(ms) <= 1) return setImmediate(cb, ...args);
  return realSetTimeout(cb, ms, ...args);
}
function fastClearTimeout(h) {
  if (h && typeof h === 'object' && '_onImmediate' in h) clearImmediate(h);
  else realClearTimeout(h);
}

if (!globalThis.__crawlerFastTimers) {
  globalThis.__crawlerFastTimers = true;
  globalThis.setTimeout = fastSetTimeout;
  globalThis.clearTimeout = fastClearTimeout;
}
