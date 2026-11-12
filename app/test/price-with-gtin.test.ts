/**
 * D-266 C1: a "Not this" pick, then a typed price, ended on a failure sheet.
 *
 * The pick opens the price pad with the picked product's barcode set, and the
 * phone sends `/api/price` with both the typed words and that barcode.
 * `/api/price` answered from Pexi's own data only when no barcode came along,
 * so every pick fell to `no_model_call`. A barcode that rides with the words is
 * the shopper's choice and the answer must be about that product.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, FRIES, type Harness } from './customer-data-harness.ts';

let h: Harness;
before(async () => {
  h = await startHarness('price-gtin');
});
after(async () => {
  await h.close();
});

test("a typed price sent with the picked product's barcode is answered from Pexi's own data, about that product", async () => {
  const device = 'gtin-pick';
  // The words fit all five fries, which is why the shopper had to pick one.
  const res = await h.post('/api/price', { deviceId: device, text: 'crinkle fries', gtin: FRIES[2], askingCents: 480 });
  assert.equal(res.status, 200);
  assert.equal(res.body.failure ?? null, null, `answered with a failure: ${JSON.stringify(res.body).slice(0, 200)}`);
  assert.equal(res.body.ownData, true);
  assert.equal(res.body.ownMatch?.code, FRIES[2], 'the answer is about a different product than the one picked');
});

test('the same words with no barcode still answer from the words, as before', async () => {
  const res = await h.post('/api/price', { deviceId: 'gtin-none', text: 'crinkle fries', askingCents: 480 });
  assert.equal(res.status, 200);
  assert.equal(res.body.ownData, true);
  assert.equal(res.body.failure ?? null, null);
});

test('a barcode with no words and no scan is not answered here, as before', async () => {
  const res = await h.post('/api/price', { deviceId: 'gtin-only', gtin: FRIES[0] });
  assert.equal(res.status, 200);
  // A barcode scan is answered by /api/identify; this route has never priced a bare barcode.
  assert.equal(res.body.failure, 'no_model_call');
});
