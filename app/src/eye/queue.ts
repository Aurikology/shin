/**
 * Captures that could not be resolved yet. Decision 13.
 *
 * A grocery store basement, a concrete-walled aisle, a phone that has decided
 * this is a good moment to hand off between towers: the network is not reliable
 * in the exact place this product is used. A capture lost there is not a retry,
 * it is the end of the session, because the shopper has already walked on.
 *
 * So a capture is written to durable storage the moment it is taken, before any
 * network call, and only removed once something has come back for it. The queue
 * survives the tab being closed and the phone being locked.
 *
 * IndexedDB rather than localStorage because the payload is a Blob and
 * localStorage would mean base64, a third more bytes, and a synchronous write on
 * the main thread while the camera is running.
 */

const DB_NAME = 'shin-eye';
const STORE = 'pending';
const VERSION = 1;

export interface PendingCapture {
  readonly id: string;
  readonly blob: Blob;
  readonly gtin: string | null;
  readonly takenAt: number;
  /** What the user was told when it was queued, so the screen can be honest later. */
  readonly note: string | null;
  attempts: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function enqueue(capture: Omit<PendingCapture, 'id' | 'attempts'>): Promise<string> {
  const id = `${capture.takenAt}-${Math.random().toString(36).slice(2, 8)}`;
  await tx('readwrite', (s) => s.put({ ...capture, id, attempts: 0 }));
  return id;
}

export async function pending(): Promise<PendingCapture[]> {
  const all = await tx<PendingCapture[]>('readonly', (s) => s.getAll() as IDBRequest<PendingCapture[]>);
  return all.sort((a, b) => a.takenAt - b.takenAt);
}

export async function resolve(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

export async function noteAttempt(id: string): Promise<void> {
  const item = await tx<PendingCapture | undefined>(
    'readonly',
    (s) => s.get(id) as IDBRequest<PendingCapture | undefined>,
  );
  if (!item) return;
  item.attempts += 1;
  await tx('readwrite', (s) => s.put(item));
}

/**
 * Drains the queue when the network comes back.
 *
 * Serial rather than parallel on purpose: the network has just returned and is
 * usually still weak, and six simultaneous uploads on a recovering connection is
 * how you get six timeouts instead of one success.
 *
 * A capture is never discarded here for failing. It is only removed when the
 * caller says it was handled, because the alternative is deleting the one thing
 * the user cannot retake: a photo of a shelf they are no longer standing at.
 */
export async function drain(
  send: (item: PendingCapture) => Promise<boolean>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ sent: number; left: number }> {
  const items = await pending();
  let sent = 0;
  for (const item of items) {
    if (!navigator.onLine) break;
    await noteAttempt(item.id);
    let ok = false;
    try {
      ok = await send(item);
    } catch {
      ok = false;
    }
    if (ok) {
      await resolve(item.id);
      sent += 1;
    }
    onProgress?.(sent, items.length);
  }
  return { sent, left: (await pending()).length };
}

/** Fires the drain whenever the browser thinks it is back online. */
export function autoDrain(send: (item: PendingCapture) => Promise<boolean>): () => void {
  const run = () => {
    void drain(send);
  };
  addEventListener('online', run);
  // Also on wake: a phone that was locked in a pocket never fires 'online'.
  // NAMED, so the teardown can remove it. It was an anonymous closure, which
  // the returned function could not reference, so every re-entry of the
  // capture queue left one more permanent handler firing a full IndexedDB
  // drain on every tab-visibility change for the life of the page.
  const onWake = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) run();
  };
  document.addEventListener('visibilitychange', onWake);
  return () => {
    removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onWake);
  };
}
