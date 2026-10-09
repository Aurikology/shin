/**
 * Requirement 5.1 (docs/price-category-requirements-2026-10-01.md): "Record
 * every scan: item, typed shelf price, store, time, the shopper's own
 * good/bad/great call, picks, corrections; photo and area only with consent.
 * Pass when: every field stored for 100 test scans." Plan Part 6, 5.1: "consent
 * on each row"; fails when "a field [is] missing in the 100 test scans",
 * diagnosed by "which screen dropped it".
 *
 * Written before the fix. On 2026-10-09 the scan row had no column for the
 * shopper's own call, no record of a pick, no consent on the row, and the store
 * a shopper typed with their price went to the corrections store only, never
 * onto the scan.
 *
 * 100 scans, half barcode and half typed, half from devices with consent on and
 * half from devices that never answered, every one driven through the routes
 * the phone calls. Controls: a consent-off scan must carry NO area and NO photo
 * (a build that stored everything would pass the "present" half and fail
 * here), and a second call on the same scan is refused rather than overwriting
 * the first (the shopper's own call is never edited, 3.9).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, TATERS, TATERS_TEXT, FRIES, type Harness } from './customer-data-harness.ts';

let h: Harness;
before(async () => {
  h = await startHarness('scan-record');
});
after(async () => {
  await h.close();
});

const CALLS = ['great', 'good', 'reasonable', 'bad'] as const;
const CELL = '48.43,-123.37';

interface Driven {
  scanId: number;
  device: string;
  consent: boolean;
  call: string;
  pick: string;
  store: string;
  cents: number;
}

/** Every route that refused, collected so the audit reports the whole gap at once rather than the first hole. */
const routeFailures: string[] = [];

async function driveOne(i: number): Promise<Driven> {
  const consent = i % 2 === 0;
  const device = `rec-${consent ? 'yes' : 'no'}-${i}`;
  if (consent) {
    const c = await h.post('/api/consent', { deviceId: device, photos: true, location: true });
    assert.equal(c.body.stored, true);
  }
  const market = `countryCode=CA&region=British%20Columbia&deviceId=${device}&cell=${encodeURIComponent(CELL)}`;
  const answer =
    i % 4 < 2
      ? await h.get(`/api/identify?gtin=${TATERS}&${market}`)
      : await h.get(`/api/identify?text=${encodeURIComponent(TATERS_TEXT)}&${market}`);
  const scanId = answer.scanId as number;
  assert.equal(typeof scanId, 'number', `scan ${i} came back with no scan id`);

  const call = CALLS[i % CALLS.length]!;
  const callRes = await h.post('/api/scan-call', { deviceId: device, scanId, call, beforeVerdict: i % 3 === 0 });
  if (callRes.body.stored !== true) routeFailures.push(`scan-call ${i}: ${JSON.stringify(callRes.body)}`);

  const pick = FRIES[i % FRIES.length]!;
  const pickRes = await h.post('/api/scan-pick', { deviceId: device, scanId, code: pick, source: 'typed_pick' });
  if (pickRes.body.stored !== true) routeFailures.push(`scan-pick ${i}: ${JSON.stringify(pickRes.body)}`);

  const store = `Shop ${i % 7}`;
  const cents = 300 + i;
  const priced = await h.post('/api/scan-price', { deviceId: device, scanId, priceCents: cents, storeName: store });
  if (priced.body.stored !== true) routeFailures.push(`scan-price ${i}: ${JSON.stringify(priced.body)}`);

  const corrected = await h.post('/api/correction', {
    clientId: `rec-corr-${i}`,
    deviceId: device,
    scanId,
    code: TATERS,
    label: "Tasti Tater's",
    seller: store,
    priceCents: cents,
    kind: 'regular',
  });
  if (corrected.body.stored !== true) routeFailures.push(`correction ${i}: ${JSON.stringify(corrected.body)}`);
  return { scanId, device, consent, call, pick, store, cents };
}

test('5.1: 100 scans through the real routes store every field, and photo and area only with consent', async () => {
  const driven: Driven[] = [];
  for (let i = 0; i < 100; i += 1) driven.push(await driveOne(i));

  const missing: string[] = [];
  for (const d of driven) {
    const [row] = h.rows<Record<string, any>>('SELECT * FROM scan WHERE id = ?', d.scanId);
    let picks: Record<string, any>[] = [];
    try {
      picks = h.rows<Record<string, any>>('SELECT * FROM scan_pick WHERE scan_id = ?', d.scanId);
    } catch (err) {
      // No pick table at all is a missing field on every scan, reported below, not a crash of the audit.
      if (!/no such table/.test(String(err))) throw err;
    }
    const need = (field: string, ok: boolean) => {
      if (!ok) missing.push(`scan ${d.scanId} (${d.device}): ${field}`);
    };
    need('item', !!row && !!row.resolved_code && !!row.query_text);
    need('typed shelf price', row?.typed_price_cents === d.cents);
    need('store', row?.store_name === d.store);
    need('time', !!row && !Number.isNaN(Date.parse(row.scanned_at)));
    need("shopper's own call", row?.shopper_call === d.call);
    need("own call's time", !!row?.shopper_call_at);
    need('own call before or after the verdict', row?.shopper_call_before_verdict === 0 || row?.shopper_call_before_verdict === 1);
    need('pick', picks.length === 1 && picks[0]!.picked_code === d.pick);
    need('correction', row?.outcome === 'corrected' && !!row?.corrected_code);
    need('consent on the row (photos)', row?.consent_photos === (d.consent ? 1 : 0));
    need('consent on the row (location)', row?.consent_location === (d.consent ? 1 : 0));
    // Area and photo only with consent.
    if (d.consent) need('area with consent', row?.cell === CELL);
    else {
      need('no area without consent', row?.cell === null);
      need('no photo without consent', row?.photo_path === null);
    }
  }
  const counts = new Map<string, number>();
  for (const m of missing) {
    const field = m.split(': ').slice(1).join(': ');
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  const byField = [...counts].map(([f, n]) => `${f}: missing on ${n} of 100`);
  assert.deepEqual(
    byField,
    [],
    `fields missing across the 100 scans:\n${byField.join('\n')}\nfirst route refusals:\n${routeFailures.slice(0, 4).join('\n')}`,
  );
  assert.deepEqual(missing.slice(0, 40), [], `${missing.length} field(s) missing across the 100 scans:\n${missing.slice(0, 40).join('\n')}`);
  assert.equal(driven.length, 100);
});

test("5.1 control: the shopper's own call is kept as first given; a second call is refused, not written over it", async () => {
  const device = 'rec-twice';
  const answer = await h.get(`/api/identify?gtin=${TATERS}&deviceId=${device}`);
  const scanId = answer.scanId as number;
  assert.equal((await h.post('/api/scan-call', { deviceId: device, scanId, call: 'great', beforeVerdict: true })).body.stored, true);
  const again = await h.post('/api/scan-call', { deviceId: device, scanId, call: 'bad', beforeVerdict: false });
  assert.equal(again.body.stored, false);
  const [row] = h.rows<Record<string, any>>('SELECT shopper_call, shopper_call_before_verdict FROM scan WHERE id = ?', scanId);
  assert.equal(row!.shopper_call, 'great');
  assert.equal(row!.shopper_call_before_verdict, 1);
});

test('5.1 known-bad: a call outside the four words, or on another device\'s scan, is refused and stores nothing', async () => {
  const answer = await h.get(`/api/identify?gtin=${TATERS}&deviceId=rec-owner`);
  const scanId = answer.scanId as number;
  for (const call of ['fantastic', '', null, 3]) {
    const res = await h.post('/api/scan-call', { deviceId: 'rec-owner', scanId, call });
    assert.equal(res.body.stored, false, `${String(call)} was accepted`);
  }
  const thief = await h.post('/api/scan-call', { deviceId: 'rec-thief', scanId, call: 'good' });
  assert.equal(thief.body.stored, false);
  const pickThief = await h.post('/api/scan-pick', { deviceId: 'rec-thief', scanId, code: FRIES[0] });
  assert.equal(pickThief.body.stored, false);
  const [row] = h.rows<Record<string, any>>('SELECT shopper_call FROM scan WHERE id = ?', scanId);
  assert.equal(row!.shopper_call, null);
  assert.equal(h.rows('SELECT * FROM scan_pick WHERE scan_id = ?', scanId).length, 0);
});
