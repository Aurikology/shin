/**
 * Security finding F3 (docs/security-check/v4-v5-poison-dynamic.md), owner's call 2026-11-16.
 *
 * Before: two free phones could rename an unknown barcode. Each scanned the barcode, then posted a pick for any
 * product code in the catalogue; two different devices were enough (learnedPickFor).
 * Now: a pick counts only when the picked code was one of the matches the server offered that device just before
 * (recordOffer, written by /api/search and /api/match-text), and the link needs 3 devices from 2 networks.
 *
 * The rows reproduce the sim: 2 phones rename an unknown barcode; then each attack is refused, and 3 honest phones
 * from 2 networks still count.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scans = await import('../src/scans.ts');

scans.openScanStore(join(mkdtempSync(join(tmpdir(), 'shin-pick-poison-')), 'scans.db'));

const ORANGE = '0000000094012';
const LEMON = '0000000094053';
const T0 = new Date('2026-11-16T12:00:00Z');
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

/** One device scans `sticker`, is offered `offered`, then picks `code` from a network. */
function phone(device: string, net: string | null, sticker: string, code: string, offered: string[]): boolean {
  const id = scans.recordScan({ deviceId: device, kind: 'barcode', query: sticker, outcome: 'refused', failureClass: 'not_in_catalogue', scannedAt: T0.toISOString() });
  assert.ok(id, 'the scan row was written');
  scans.recordOffer(device, offered, T0);
  return scans.recordPick(device, id!, code, 'typed_pick', { networkHash: net, now: later(1) }).stored === true;
}

test('SIM: two phones that pick a product nobody offered them do not rename the barcode', () => {
  const S = '09354765000036';
  phone('atk-1', 'net-a', S, LEMON, []);
  phone('atk-2', 'net-b', S, LEMON, []);
  assert.equal(scans.learnedPickFor(S), null);
});

test('SIM: even picks of an offered product need 3 phones: two are not enough', () => {
  const S = '09354765000043';
  phone('two-1', 'net-a', S, ORANGE, [ORANGE]);
  phone('two-2', 'net-b', S, ORANGE, [ORANGE]);
  assert.equal(scans.learnedPickFor(S), null);
});

test('three phones on one network are not enough', () => {
  const S = '09354765000050';
  for (const d of ['one-1', 'one-2', 'one-3', 'one-4']) phone(d, 'net-a', S, ORANGE, [ORANGE]);
  assert.equal(scans.learnedPickFor(S), null);
});

test('phones with no known network are not counted', () => {
  const S = '09354765000067';
  for (const d of ['nn-1', 'nn-2', 'nn-3']) phone(d, null, S, ORANGE, [ORANGE]);
  assert.equal(scans.learnedPickFor(S), null);
});

test('three honest phones from two networks, each offered the product, make the link', () => {
  const S = '09354765000074';
  phone('ok-1', 'net-a', S, ORANGE, [LEMON, ORANGE]);
  phone('ok-2', 'net-b', S, ORANGE, [ORANGE]);
  assert.equal(scans.learnedPickFor(S), null, 'two so far');
  phone('ok-3', 'net-a', S, ORANGE, [ORANGE, LEMON]);
  assert.equal(scans.learnedPickFor(S), ORANGE);
  assert.equal(scans.learnedPickFor('9354765000074'), ORANGE, 'same barcode under another zero padding');
});

test('a pick that was not offered is still stored, and does not count; an offer for another device does not help', () => {
  const S = '09354765000081';
  assert.equal(phone('mix-1', 'net-a', S, ORANGE, [ORANGE]), true);
  assert.equal(phone('mix-2', 'net-b', S, ORANGE, [ORANGE]), true);
  // mix-3 was offered nothing, mix-4 was offered it by another device's search
  assert.equal(phone('mix-3', 'net-a', S, ORANGE, []), true);
  scans.recordOffer('someone-else', [ORANGE], T0);
  const id = scans.recordScan({ deviceId: 'mix-4', kind: 'barcode', query: S, outcome: 'refused', failureClass: 'not_in_catalogue' });
  assert.equal(scans.recordPick('mix-4', id!, ORANGE, 'typed_pick', { networkHash: 'net-b', now: later(1) }).stored, true);
  assert.equal(scans.learnedPickFor(S), null, 'two counted picks only');
});

test('an offer is good for a few hours, not for ever', () => {
  const S = '09354765000098';
  for (const [d, n] of [['old-1', 'net-a'], ['old-2', 'net-b'], ['old-3', 'net-a']] as const) {
    const id = scans.recordScan({ deviceId: d, kind: 'barcode', query: S, outcome: 'refused', failureClass: 'not_in_catalogue' });
    scans.recordOffer(d, [ORANGE], T0);
    scans.recordPick(d, id!, ORANGE, 'typed_pick', { networkHash: n, now: later(60 * 24) });
  }
  assert.equal(scans.learnedPickFor(S), null);
});

test('a pick is still refused for another device\'s scan, and a pick with no code', () => {
  const id = scans.recordScan({ deviceId: 'own-1', kind: 'barcode', query: '09354765000104', outcome: 'refused' });
  assert.equal(scans.recordPick('own-2', id!, ORANGE, 'typed_pick', { networkHash: 'n', now: later(1) }).stored, false);
  assert.equal(scans.recordPick('own-1', id!, '  ', 'typed_pick', { networkHash: 'n', now: later(1) }).stored, false);
});

test('the setting SHIN_SHOPPER_VOICE=off stops learned picks, and only that setting', () => {
  const S = '09354765000111';
  phone('sw-1', 'net-a', S, ORANGE, [ORANGE]);
  phone('sw-2', 'net-b', S, ORANGE, [ORANGE]);
  phone('sw-3', 'net-a', S, ORANGE, [ORANGE]);
  assert.equal(scans.learnedPickFor(S), ORANGE);
  assert.equal(scans.learnedPickFor(S, { SHIN_SHOPPER_VOICE: 'off' } as NodeJS.ProcessEnv), null);
  assert.equal(scans.learnedPickFor(S, { SHIN_SHOPPER_VOICE: 'on' } as NodeJS.ProcessEnv), ORANGE);
});

test('retention takes the network off a pick with its device id, and the pick stays', async () => {
  const { sweepScanData } = await import('../src/retention.ts');
  const S = '09354765000128';
  phone('ret-1', 'net-a', S, ORANGE, [ORANGE]);
  const store = scans.activeScanStore()!;
  const before = store.db!.prepare("SELECT net_hash, device_id FROM scan_pick WHERE device_id = 'ret-1'").all() as { net_hash: string | null }[];
  assert.equal(before.length, 1);
  assert.equal(before[0]!.net_hash, 'net-a');
  const result = sweepScanData(new Date('2031-01-01T00:00:00Z'));
  assert.deepEqual(result.failed, []);
  const left = store.db!.prepare("SELECT net_hash, device_id, picked_code FROM scan_pick WHERE device_id LIKE 'removed:%' AND picked_code = ?").all(ORANGE) as {
    net_hash: string | null;
    device_id: string;
  }[];
  assert.ok(left.length >= 1);
  assert.equal(left.every((r) => r.net_hash === null), true);
  assert.equal((store.db!.prepare("SELECT COUNT(*) AS n FROM scan_pick WHERE device_id = 'ret-1'").get() as { n: number }).n, 0);
});
