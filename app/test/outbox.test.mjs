/**
 * D-268 A3 (Jamin, 2026-11-12): ratings and events posted while the server restarts on a deploy were
 * dropped, and the phone showed success. The outbox keeps them and retries; the thumbs say thanks once
 * a rating is sent or queued. Pure parts run on a fake clock; the wiring is source-asserted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createOutbox, retryable, backoffMs, OUTBOX_KEY, MAX_ATTEMPTS } from '../public/js/lib/outbox.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A server that answers from a script: each entry is a status, or 'offline' to throw. */
function scriptedServer(script) {
  const seen = [];
  const post = async (path, body) => {
    seen.push({ path, body });
    const next = script.length ? script.shift() : 200;
    if (next === 'offline') throw new TypeError('Failed to fetch');
    return { ok: next >= 200 && next < 300, status: next, retryAfter: next === 502 ? 60 : undefined, json: async () => ({ stored: true }) };
  };
  return { post, seen };
}

test('a post during a deploy restart (502) is kept and sent once the server is back', async () => {
  let clock = 1_000_000;
  const server = scriptedServer([502, 200]);
  const box = createOutbox({ post: server.post, storage: memoryStorage(), now: () => clock });

  const first = await box.send('/api/scan-rating', { scanId: 7, rating: 'up' });
  assert.deepEqual(first, { queued: true });
  assert.equal(box.size, 1, 'the rating is still waiting, not dropped');

  assert.equal(await box.drain(), 0, 'not retried before the wait is over');
  clock += 60_000; // the server's retry-after
  assert.equal(await box.drain(), 1);
  assert.equal(box.size, 0);
  assert.deepEqual(server.seen.map((s) => s.body.scanId), [7, 7]);
});

test('no network at all is retried the same way', async () => {
  let clock = 0;
  const server = scriptedServer(['offline', 'offline', 200]);
  const box = createOutbox({ post: server.post, storage: memoryStorage(), now: () => clock });
  assert.deepEqual(await box.send('/api/event', { type: 'x' }), { queued: true });
  clock += 5_000;
  assert.equal(await box.drain(), 0, 'still offline');
  clock += 15_000;
  assert.equal(await box.drain(), 1);
});

test('a rating and its undo reach the server in the order they were made', async () => {
  let clock = 0;
  const server = scriptedServer([503]);
  const box = createOutbox({ post: server.post, storage: memoryStorage(), now: () => clock });
  await box.send('/api/scan-rating', { scanId: 1, rating: 'down' });
  const undo = await box.send('/api/scan-rating/delete', { scanId: 1 });
  assert.deepEqual(undo, { queued: true }, 'the undo waits behind the rating instead of overtaking it');
  clock += 60_000;
  await box.drain();
  // The first try (503) is seen too; then the rating again, then its undo, never the undo first.
  assert.deepEqual(server.seen.map((s) => s.path), ['/api/scan-rating', '/api/scan-rating', '/api/scan-rating/delete']);
  assert.equal(box.size, 0);
});

test('a refusal no retry can fix (400) is not queued', async () => {
  const box = createOutbox({ post: scriptedServer([400]).post, storage: memoryStorage(), now: () => 0 });
  assert.deepEqual(await box.send('/api/scan-rating', {}), { refused: true, status: 400 });
  assert.equal(box.size, 0);
  assert.equal(retryable(429), true);
  assert.equal(retryable(408), true);
  assert.equal(retryable(404), false);
});

test('the queue survives the app being closed (stored under its key)', async () => {
  const storage = memoryStorage();
  await createOutbox({ post: scriptedServer([502]).post, storage, now: () => 0 }).send('/api/event', { type: 'kept' });
  assert.match(storage.getItem(OUTBOX_KEY), /"kept"/);
  let clock = 0;
  const reopened = createOutbox({ post: scriptedServer([200]).post, storage, now: () => clock });
  assert.equal(reopened.size, 1);
  assert.equal(await reopened.drain(), 1);
});

test('a post that never gets through is given up after MAX_ATTEMPTS, not retried forever', async () => {
  let clock = 0;
  const box = createOutbox({ post: async () => ({ ok: false, status: 500 }), storage: memoryStorage(), now: () => clock });
  const err = console.error; console.error = () => {};
  try {
    await box.send('/api/event', {});
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) { clock += 10 * 60_000; await box.drain(); }
  } finally { console.error = err; }
  assert.equal(box.size, 0);
});

test('waits grow and honour a longer retry-after', () => {
  assert.equal(backoffMs(1), 5_000);
  assert.equal(backoffMs(3), 60_000);
  assert.equal(backoffMs(99), 300_000);
  assert.equal(backoffMs(1, 60), 60_000);
});

test('wiring: ratings, their undo and single events go through the outbox; the thumbs thank a queued rating', () => {
  const api = read('../public/js/api.js');
  assert.match(api, /async function postKept[\s\S]*?outbox\.send\(path, body\)/);
  assert.match(api, /export function postScanRating[\s\S]*?postKept\('\/api\/scan-rating'/);
  assert.match(api, /export function deleteScanRating[\s\S]*?postKept\('\/api\/scan-rating\/delete'/);
  assert.match(api, /export function postEvent[\s\S]*?postKept\('\/api\/event'/);
  const cam = read('../public/js/screens/camera.js');
  assert.match(cam, /res\?\.stored === true \|\| res\?\.queued === true/);
});
