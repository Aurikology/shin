/**
 * THE OUTBOX: posts that must reach the server even when the server is briefly down.
 *
 * Jamin, 2026-11-12 (D-268 A3): the Mac's logs show 13 dropped ratings and events on 2026-11-11, each
 * one during a deploy restart (the server is down for seconds after every push). The phone showed
 * success and dropped the post. His ask: keep each scan-rating / event post in a small queue, retry
 * on any server error or network failure with backoff (the server sends retry-after 60), and say
 * thanks once it is accepted or queued, never as a promise it was sent. This also covers a shopper
 * who loses signal in a store.
 *
 * `track.js` already queues its batches this way; this is the same idea for single posts.
 *
 *   send(path, body)  tries once; ok -> { sent: true, json }; a retryable failure -> queued,
 *                     { queued: true }; a refusal no retry can fix (a 4xx other than 408/429)
 *                     -> { refused: true, status }, not queued.
 *   drain()           sends queued posts oldest first and stops at the first that still fails, so a
 *                     rating and its undo always reach the server in the order they were made.
 *
 * Pure apart from what is passed in (`post`, `storage`, `now`), so tests run it on a fake clock.
 */

export const OUTBOX_KEY = 'pexi.outbox';
/** A small queue: a phone offline all afternoon keeps its newest posts, not every one. */
export const MAX_QUEUED = 200;
/** Give up on one post after this many tries: about a day at the capped wait. */
export const MAX_ATTEMPTS = 30;
/** Waits between tries, by attempt; the last one repeats. The server's retry-after wins when longer. */
export const BACKOFF_MS = Object.freeze([5_000, 15_000, 60_000, 300_000]);

/** A status a later try can fix: the server restarting (5xx), a timeout (408), too many requests (429). */
export function retryable(status) {
  return status >= 500 || status === 408 || status === 429;
}

export function backoffMs(attempts, retryAfterSeconds) {
  const base = BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1];
  const asked = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
  return Math.max(base, asked);
}

/**
 * @param {object} deps
 * @param {(path: string, body: unknown) => Promise<{ ok: boolean, status: number, retryAfter?: number, json?: () => Promise<unknown> }>} deps.post
 *        one HTTP try; throws (or rejects) when there is no network at all
 * @param {Storage} [deps.storage]
 * @param {() => number} [deps.now]
 */
export function createOutbox({ post, storage = globalThis.localStorage, now = () => Date.now() }) {
  let queue = load();
  let draining = false;
  let nextAt = 0;

  function load() {
    try {
      const raw = storage?.getItem(OUTBOX_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.path === 'string') : [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      storage?.setItem(OUTBOX_KEY, JSON.stringify(queue));
    } catch {
      /* A private window or a full quota: the queue still works in memory for this session. */
    }
  }

  function enqueue(path, body, retryAfter) {
    queue.push({ path, body, attempts: 1, queuedAt: now() });
    if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED);
    nextAt = Math.max(nextAt, now() + backoffMs(1, retryAfter));
    save();
  }

  /** One try. Never throws. */
  async function attempt(path, body) {
    try {
      const res = await post(path, body);
      if (res.ok) {
        let json = null;
        try { json = res.json ? await res.json() : null; } catch { json = null; }
        return { outcome: 'sent', json };
      }
      return retryable(res.status)
        ? { outcome: 'retry', retryAfter: res.retryAfter }
        : { outcome: 'refused', status: res.status };
    } catch {
      return { outcome: 'retry' };
    }
  }

  async function send(path, body) {
    // Something older is still waiting: go behind it, so the server sees posts in the order they were made.
    if (queue.length > 0) {
      enqueue(path, body);
      void drain();
      return { queued: true };
    }
    const r = await attempt(path, body);
    if (r.outcome === 'sent') return { sent: true, json: r.json };
    if (r.outcome === 'refused') return { refused: true, status: r.status };
    enqueue(path, body, r.retryAfter);
    return { queued: true };
  }

  /** Sends what is due, oldest first. Resolves to how many were sent this pass. */
  async function drain() {
    if (draining || queue.length === 0 || now() < nextAt) return 0;
    draining = true;
    let sentCount = 0;
    try {
      while (queue.length > 0) {
        const head = queue[0];
        const r = await attempt(head.path, head.body);
        if (r.outcome === 'retry') {
          head.attempts += 1;
          if (head.attempts > MAX_ATTEMPTS) {
            queue.shift();
            console.error(`outbox: gave up on ${head.path} after ${MAX_ATTEMPTS} tries`);
            save();
            continue;
          }
          nextAt = now() + backoffMs(head.attempts, r.retryAfter);
          save();
          break;
        }
        // Sent, or refused for good: either way it leaves the queue.
        if (r.outcome === 'refused') console.error(`outbox: ${head.path} refused ${r.status}, dropped`);
        else sentCount += 1;
        queue.shift();
        save();
      }
    } finally {
      draining = false;
    }
    return sentCount;
  }

  return {
    send,
    drain,
    get size() { return queue.length; },
    get nextAt() { return nextAt; },
  };
}
