/**
 * Jamin's App Store list, items 7 and 8: abandoned typed text is not kept, and nothing is kept past
 * the periods the privacy policy states. Runs on temp databases.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'shin-retention-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_DATA_DIR = dir;
process.env.SHIN_ACCESS_LOG = join(dir, 'access.log');

const { openScanStore, recordScan, getScan } = await import('../src/scans.ts');
const { recordEvent } = await import('../src/events.ts');
const { sweepScanData, sweepRequestLog, sweepShopperPrices, REQUEST_LOG_DAYS, USAGE_EVENT_MONTHS, DEVICE_ID_MONTHS } = await import('../src/retention.ts');
const { openCorrectionStore, recordCorrection } = await import('../../price/src/corrections.ts');

const store = openScanStore(process.env.SHIN_SCANS);
const NOW = new Date('2026-11-06T12:00:00.000Z');
const OLD = '2020-01-01T00:00:00.000Z';

after(() => {
  try {
    store.db?.close();
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

test('item 7: a typed search left unsent keeps no text, through either door', () => {
  const id = recordEvent({ deviceId: 'd-typed', type: 'typed_search', payload: { text: 'something private', abandoned: true } });
  const row = store.db!.prepare('SELECT payload FROM event WHERE id = ?').get(id as number) as { payload: string };
  assert.doesNotMatch(row.payload, /something private/);
  assert.equal(JSON.parse(row.payload).abandoned, true);
});

test('item 7: a typed search that was sent keeps its text', () => {
  const id = recordEvent({ deviceId: 'd-typed', type: 'typed_search', payload: { text: 'oreo', abandoned: false } });
  const row = store.db!.prepare('SELECT payload FROM event WHERE id = ?').get(id as number) as { payload: string };
  assert.equal(JSON.parse(row.payload).text, 'oreo');
});

test('item 7: the phone no longer sends the words of an abandoned search', () => {
  const camera = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');
  assert.ok(!camera.includes('text: abandonedText'));
  assert.ok(camera.includes("track('typed_search', { abandoned: true })"));
});

test('item 8: usage events go at 12 months and not before', () => {
  const old = recordEvent({ deviceId: 'd-ev', type: 'tap', payload: {}, createdAt: OLD });
  const recent = recordEvent({ deviceId: 'd-ev', type: 'tap', payload: {}, createdAt: '2026-01-01T00:00:00.000Z' });
  const r = sweepScanData(NOW);
  assert.deepEqual(r.failed, []);
  const has = (id: number | null) => store.db!.prepare('SELECT 1 FROM event WHERE id = ?').get(id as number) !== undefined;
  assert.equal(has(old), false, 'a usage event past 12 months is still there');
  assert.equal(has(recent), true, 'a usage event inside 12 months was deleted');
});

test('item 8: a scan past 24 months keeps its answer and loses its device id; the database still refuses any other edit', () => {
  const oldId = recordScan({ deviceId: 'd-old', kind: 'barcode', query: '1', resolvedLabel: 'Oats', outcome: 'answered', source: 'catalogue' }) as number;
  const newId = recordScan({ deviceId: 'd-new', kind: 'barcode', query: '2', resolvedLabel: 'Rice', outcome: 'answered', source: 'catalogue' }) as number;
  // Dating the row back is itself an edit the immutable trigger refuses, so the test steps around it.
  const sql = store.db!.prepare("SELECT sql FROM sqlite_master WHERE name = 'scan_shown_answer_immutable'").get() as { sql: string };
  store.db!.exec('DROP TRIGGER scan_shown_answer_immutable');
  store.db!.prepare('UPDATE scan SET scanned_at = ? WHERE id = ?').run(OLD, oldId);
  store.db!.exec(sql.sql);

  const r = sweepScanData(NOW);
  assert.deepEqual(r.failed, []);
  assert.equal(r.deviceIdsRemoved, 1);
  assert.equal(getScan(oldId)?.device_id, `removed:${oldId}`);
  assert.equal(getScan(oldId)?.resolved_label, 'Oats', 'the answer went with the device id');
  assert.equal(getScan(newId)?.device_id, 'd-new');
  assert.throws(() => store.db!.prepare("UPDATE scan SET device_id = 'someone-else' WHERE id = ?").run(newId), /never edited/);
  assert.equal(sweepScanData(NOW).deviceIdsRemoved, 0, 'a second sweep touched the same row');
});

test('item 8: append-only rows take the one edit and refuse every other', () => {
  store.db!.prepare("INSERT INTO scan_pick (scan_id, device_id, picked_code, source, picked_at) VALUES (1, 'd-pick', '1', 'x', ?)").run(OLD);
  const r = sweepScanData(NOW);
  assert.deepEqual(r.failed, []);
  const row = store.db!.prepare('SELECT id, device_id FROM scan_pick').get() as { id: number; device_id: string };
  assert.equal(row.device_id, `removed:${row.id}`);
  assert.throws(() => store.db!.prepare("UPDATE scan_pick SET picked_code = '2'").run(), /never edited/);
  assert.throws(() => store.db!.prepare("UPDATE scan_pick SET device_id = 'someone'").run(), /never edited/);
});

test('item 8: a shopper price past 24 months loses its device id, and two from one phone do not collide', () => {
  const path = join(dir, 'corrections.db');
  const prices = openCorrectionStore(path);
  const put = (clientId: string, seenOn: string) =>
    recordCorrection({ clientId, deviceId: 'd-price', code: '0123456789012', productId: null, label: 'Oats', category: null, seller: 'Shop', priceCents: 300, kind: 'regular', seenOn });
  assert.equal(put('c1', '2020-01-01').ok, true);
  assert.equal(put('c2', '2020-01-02').ok, true);
  prices.db!.prepare("UPDATE correction SET recorded_at = ?").run(OLD);
  assert.equal(put('c3', '2026-11-01').ok, true);
  const r = sweepShopperPrices(path, NOW);
  assert.equal(r.failed, null);
  assert.equal(r.removed, 2);
  const again = openCorrectionStore(path);
  const ids = again.db!.prepare('SELECT device_id FROM correction ORDER BY id').all() as { device_id: string }[];
  assert.match(ids[0].device_id, /^removed:\d+$/);
  assert.notEqual(ids[0].device_id, ids[1].device_id);
  assert.equal(ids[2].device_id, 'd-price');
});

test('item 8: request-log lines go at 90 days, newer ones and unreadable ones stay', async () => {
  const lines = [
    JSON.stringify({ at: OLD, url: '/old' }),
    JSON.stringify({ at: '2026-11-01T00:00:00.000Z', url: '/new' }),
    'not json',
  ];
  writeFileSync(process.env.SHIN_ACCESS_LOG!, `${lines.join('\n')}\n`);
  const r = await sweepRequestLog(NOW);
  assert.deepEqual(r, { deleted: 1, failed: null });
  const kept = readFileSync(process.env.SHIN_ACCESS_LOG!, 'utf8');
  assert.doesNotMatch(kept, /\/old/);
  assert.match(kept, /\/new/);
  assert.match(kept, /not json/);
  assert.deepEqual(await sweepRequestLog(NOW), { deleted: 0, failed: null }, 'a log inside the window was rewritten');
});

test('item 8: the published policy states the periods this file enforces', () => {
  const en = readFileSync(new URL('../../docs/store/privacy.html', import.meta.url), 'utf8');
  assert.ok(en.includes(`${REQUEST_LOG_DAYS} days`));
  assert.ok(en.includes(`${USAGE_EVENT_MONTHS} months`));
  assert.ok(en.includes(`${DEVICE_ID_MONTHS} months`));
  assert.doesNotMatch(en, /no automatic deletion schedule/);
  const fr = readFileSync(new URL('../../docs/store/privacy-fr.html', import.meta.url), 'utf8');
  assert.ok(fr.includes(`${REQUEST_LOG_DAYS} jours`));
  assert.ok(fr.includes(`${USAGE_EVENT_MONTHS} mois`));
  assert.ok(fr.includes(`${DEVICE_ID_MONTHS} mois`));
});

test('item 8: the sweep is on the daily timer', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const closure = server.slice(server.indexOf('const sweep = () => {'), server.indexOf('sweep();'));
  for (const call of ['sweepScanData(', 'sweepShopperPrices(', 'sweepRequestLog(']) assert.ok(closure.includes(call), `${call} is not on the timer`);
});
