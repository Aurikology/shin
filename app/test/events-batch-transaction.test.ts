/**
 * R93: a batch of events is written in ONE transaction, not one commit per event. Every commit on the
 * scan store is a disk sync; 200 of them in a row hold the one server thread for seconds on a slow
 * disk and every other request waits behind it. The route wraps the whole batch in `inEventTransaction`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openScanStore } from '../src/scans.ts';
import { recordEvent, inEventTransaction } from '../src/events.ts';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'pexi-evtx-'));
  const store = openScanStore(join(dir, 'scans.db'));
  return { dir, store };
}
const count = (store: ReturnType<typeof openScanStore>) => (store.db!.prepare('SELECT COUNT(*) AS n FROM event').get() as { n: number }).n;

test('every write inside inEventTransaction shares one open transaction, and it is closed after', () => {
  const { dir, store } = fresh();
  try {
    const seen: boolean[] = [];
    inEventTransaction(() => {
      for (let i = 0; i < 5; i += 1) {
        recordEvent({ deviceId: 'dev-1', type: 'tap', payload: { i } });
        seen.push(store.db!.isTransaction);
      }
    });
    assert.deepEqual(seen, [true, true, true, true, true]);
    assert.equal(store.db!.isTransaction, false, 'the transaction was left open');
    assert.equal(count(store), 5);
  } finally {
    try { store.db?.close(); rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps the file locked a moment */ }
  }
});

test('outside it, a single event still commits on its own', () => {
  const { dir, store } = fresh();
  try {
    recordEvent({ deviceId: 'dev-1', type: 'tap' });
    assert.equal(store.db!.isTransaction, false);
    assert.equal(count(store), 1);
  } finally {
    try { store.db?.close(); rmSync(dir, { recursive: true, force: true }); } catch { /* see above */ }
  }
});

test('a throw inside rolls the batch back and still throws', () => {
  const { dir, store } = fresh();
  try {
    assert.throws(() => inEventTransaction(() => {
      recordEvent({ deviceId: 'dev-1', type: 'tap' });
      throw new Error('boom');
    }), /boom/);
    assert.equal(count(store), 0);
    assert.equal(store.db!.isTransaction, false);
  } finally {
    try { store.db?.close(); rmSync(dir, { recursive: true, force: true }); } catch { /* see above */ }
  }
});

test('nested use joins the outer transaction instead of failing', () => {
  const { dir, store } = fresh();
  try {
    inEventTransaction(() => {
      inEventTransaction(() => { recordEvent({ deviceId: 'dev-1', type: 'tap' }); });
      assert.equal(store.db!.isTransaction, true, 'the inner call closed the outer transaction');
    });
    assert.equal(count(store), 1);
  } finally {
    try { store.db?.close(); rmSync(dir, { recursive: true, force: true }); } catch { /* see above */ }
  }
});

test('with the store closed, the wrapper just runs the work (events are dropped and counted, as before)', () => {
  const store = openScanStore(join(tmpdir(), 'pexi-evtx-nope', 'x', '\0bad'));
  assert.equal(store.db, null);
  let ran = false;
  inEventTransaction(() => { ran = true; recordEvent({ deviceId: 'd', type: 't' }); });
  assert.equal(ran, true);
  assert.equal(store.dropped, 1);
});
