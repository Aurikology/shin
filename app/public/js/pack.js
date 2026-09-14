/**
 * The offline barcode pack: what a scan can answer with the phone in
 * airplane mode.
 *
 * THE FORMAT (written by catalogue/src/export-pack.ts, read here):
 *
 *   magic     8 bytes   "SHINPK01"
 *   count     4 bytes   little endian
 *   codes     8 bytes each, ASCENDING, so this file binary searches them
 *   offsets   4 bytes each, into the blob, plus one terminator
 *   blob      each row's fields, tab separated, UTF-8
 *
 * The codes region starts at byte 12, which is not a multiple of 8, so a
 * BigUint64Array cannot be laid directly over the file's own ArrayBuffer --
 * the browser throws "start offset ... should be a multiple of 8" (checked
 * directly, this is not a guess). `buffer.slice()` copies those bytes into a
 * new ArrayBuffer starting at 0, which is always aligned, and that copy is
 * the only one this module makes.
 *
 * WHAT THIS CAN NEVER DO, said plainly because the screen has to say it too:
 * this answers what a thing IS -- its name, brand, and size -- never what it
 * should cost. Prices change weekly and only live on the server; a match
 * from this file is never enough to show a verdict on its own.
 *
 * STORAGE. Six and a half megabytes does not fit in localStorage (browsers
 * cap it at 5 to 10 MB and it is synchronous, string-only besides). This
 * keeps the raw file in IndexedDB instead, which browsers size against a
 * fraction of free disk (commonly tens of percent, gigabytes in practice),
 * comfortably clear of both the 1.7 MB grocery pack and the 7.5 MB national
 * one. It is still per-origin browser storage, not guaranteed: a private
 * window, a user clearing site data, or Safari's eviction of unused origins
 * can empty it at any time. Every function below is written to treat that
 * as normal, not exceptional -- it returns null and the caller is expected
 * to fall through to the network, the same as a cold cache.
 */

const DB_NAME = 'shin-pack';
const DB_VERSION = 1;
const BLOB_STORE = 'blob';
const META_STORE = 'meta';

const MAGIC = 'SHINPK01';
const HEADER_BYTES = 8 + 4;

/** Parsed packs kept in memory for the life of the page, one per scope. */
const memoryCache = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
  });
}

function idbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error(`get ${store}/${key} failed`));
  });
}

function idbSet(db, store, key, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`put ${store}/${key} failed`));
  });
}

/**
 * Turns the raw file bytes into the three views a lookup needs. Throws with
 * a specific reason on anything that does not match export-pack.ts's own
 * layout -- a truncated download, a half-written cache entry, or a stray
 * file that is not a pack at all must never be searched as if it were one,
 * because a binary search over garbage still returns an answer, just a
 * wrong one.
 */
export function parsePack(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error('pack must be an ArrayBuffer');
  }
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error(`pack too short for a header: ${buffer.byteLength} bytes`);
  }
  const view = new DataView(buffer);
  let magic = '';
  for (let i = 0; i < 8; i += 1) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) {
    throw new Error(`bad magic "${magic}", expected "${MAGIC}"`);
  }

  const count = view.getUint32(8, true);
  const codesStart = HEADER_BYTES;
  const codesBytes = count * 8;
  const offsetsStart = codesStart + codesBytes;
  const offsetsBytes = (count + 1) * 4;
  const blobStart = offsetsStart + offsetsBytes;

  if (buffer.byteLength < blobStart) {
    throw new Error(
      `pack truncated: needs ${blobStart} bytes for ${count} rows, has ${buffer.byteLength}`,
    );
  }

  // Copied out because byte 12 is not 8-aligned; see the header comment.
  const codes = new BigUint64Array(buffer.slice(codesStart, codesStart + codesBytes));
  const offsets = new Uint32Array(buffer, offsetsStart, count + 1);

  const blobLength = offsets[count];
  if (blobStart + blobLength !== buffer.byteLength) {
    throw new Error(
      `pack blob length mismatch: offsets claim ${blobLength} bytes, file has ` +
        `${buffer.byteLength - blobStart} left`,
    );
  }
  if (count > 0) {
    // Ascending order is what makes the search below correct; two spot
    // checks catch a shuffled or reversed file for the cost of two reads
    // rather than paying for a full O(n) scan on every load.
    if (codes[0] > codes[count - 1]) {
      throw new Error('pack codes are not ascending');
    }
  }

  const blob = new Uint8Array(buffer, blobStart, blobLength);
  return { count, codes, offsets, blob };
}

const decoder = new TextDecoder('utf-8');

function recordAt(parsed, index) {
  const start = parsed.offsets[index];
  const end = parsed.offsets[index + 1];
  const text = decoder.decode(parsed.blob.subarray(start, end));
  const [name, brands, quantity, sizeValueRaw, sizeUnit, image] = text.split('\t');
  return {
    name: name ?? '',
    brands: brands ?? '',
    quantity: quantity ?? '',
    sizeValue: sizeValueRaw ? Number(sizeValueRaw) : 0,
    sizeUnit: sizeUnit ?? '',
    image: image ?? '',
  };
}

/**
 * Binary search over the ascending code array. Returns the row index or -1.
 * Exported on its own so a caller that already has a parsed pack (the scan
 * loop, firing on every frame) never re-runs parsePack's validation.
 */
export function lookupCode(parsed, code) {
  const target = typeof code === 'bigint' ? code : BigInt(code);
  let lo = 0;
  let hi = parsed.count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midCode = parsed.codes[mid];
    if (midCode === target) {
      return { code: midCode.toString(), ...recordAt(parsed, mid) };
    }
    if (midCode < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/**
 * Loads a scope's pack from IndexedDB into memory, parses it once, and
 * caches the parsed views for the rest of the page's life. Never throws:
 * a missing entry, a closed database, a private window, or a corrupted
 * blob all come back as null, and the caller falls through to the network
 * exactly as it would on a cold cache. This is the one place corruption
 * is treated as "not available" rather than surfaced, because by the time
 * a scan is in flight there is nothing useful to do with the distinction.
 */
async function loadFromStorage(scope) {
  if (memoryCache.has(scope)) return memoryCache.get(scope);
  let db;
  try {
    db = await openDb();
    const buffer = await idbGet(db, BLOB_STORE, scope);
    if (!buffer) return null;
    const parsed = parsePack(buffer);
    memoryCache.set(scope, parsed);
    return parsed;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * The scan-loop entry point. Resolves a barcode against whatever pack is
 * already on the phone, or returns null for "ask the network" -- a miss in
 * the pack, a barcode not in the pack's coverage, storage being unavailable,
 * and a pack that was never downloaded all look identical from here on
 * purpose: the caller has exactly one fallback for all of them.
 */
export async function lookupOffline(scope, code) {
  try {
    const parsed = await loadFromStorage(scope);
    if (!parsed) return null;
    return lookupCode(parsed, code);
  } catch {
    return null;
  }
}

/**
 * The version already sitting in storage, or null if there is none. Kept
 * separate from checkForUpdate so a caller that already knows the server's
 * current version (e.g. it came back on another response) can compare
 * without an extra request.
 */
export async function storedVersion(scope) {
  let db;
  try {
    db = await openDb();
    return await idbGet(db, META_STORE, `${scope}:version`);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Asks the server for the current version WITHOUT downloading the pack --
 * versionUrl is expected to answer with a few bytes of JSON, not the file
 * itself. Returns { upToDate, remoteVersion } with upToDate null when the
 * check itself failed (offline, server down), which is not the same as
 * false: null means "don't know", false means "known stale".
 */
/**
 * The family invite, which every /api/ call must carry. The pack fetches were
 * written before the invite gate and sent none, so on the beta server the
 * offline pack answered 401 and never downloaded (seen 2026-09-14 in the
 * access log). Read from where api.js stores it rather than imported, so this
 * file keeps running before the rest of the app has loaded.
 */
function inviteHeaders() {
  let code = globalThis.window?.SHIN_INVITE_CODE ?? null;
  try { code = code ?? localStorage.getItem('shin-invite'); } catch { /* storage blocked */ }
  return code ? { 'x-shin-invite': code } : {};
}

export async function checkForUpdate(scope, versionUrl) {
  const stored = await storedVersion(scope);
  try {
    const res = await fetch(versionUrl, { headers: inviteHeaders() });
    if (!res.ok) return { upToDate: null, remoteVersion: null, storedVersion: stored };
    const info = await res.json();
    return {
      upToDate: stored != null && stored === info.version,
      remoteVersion: info.version,
      storedVersion: stored,
    };
  } catch {
    return { upToDate: null, remoteVersion: null, storedVersion: stored };
  }
}

/**
 * Downloads a scope's pack and stores it, replacing whatever was there.
 * Validates with parsePack BEFORE writing anything to storage, so a
 * truncated download (connection dropped mid-fetch) never overwrites a
 * good, previously-stored pack with a broken one. Returns true on success;
 * false covers a failed fetch, a corrupt download, and a storage write
 * that could not complete, none of which should ever throw into a caller
 * that is usually doing this opportunistically in the background.
 */
export async function primePack(scope, fileUrl, version) {
  let db;
  try {
    const res = await fetch(fileUrl, { headers: inviteHeaders() });
    if (!res.ok) return false;
    const buffer = await res.arrayBuffer();
    parsePack(buffer); // throws before anything is written if corrupt
    db = await openDb();
    await idbSet(db, BLOB_STORE, scope, buffer);
    await idbSet(db, META_STORE, `${scope}:version`, version);
    memoryCache.delete(scope);
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
