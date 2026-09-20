/**
 * A price with no product on it, over a real socket.
 *
 * `/api/correction` has refused this shape since the fix for plan item 19d,
 * and the refusal was right: a correction with no code and no product id is
 * accepted by `recordCorrection` and then unreadable forever, because
 * `correctionsFor` -- the only reader -- matches on a code or a product id and
 * can never match a text subject. That price is stored, backed up, and can
 * never appear in any verdict for the rest of its life.
 *
 * Nothing below weakens that. What it asserts is the second, narrower door
 * added 2026-09-13 for the shopper standing in front of a tag whose barcode is
 * not visible: when the body names a REAL SCAN, the price goes on that scan
 * row's `typed_price_cents` -- a column that exists for exactly this, migration
 * 2 item 9c -- and not into the corrections store at all. The old refusal is
 * still the answer for a body with no scan either, which is the first test
 * here and the one that would catch a future widening of this door.
 *
 * RUNS A REAL SERVER, for the reason `server-beta-routes.test.ts` gives: every
 * case here is about the HTTP edge and about two routes agreeing on a field
 * name. The catalogue is faked, as it is there, because the real one is 4.13 GB
 * and is not on a machine that runs tests.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-price-only-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;

process.env.GEMINI_API_KEY = 'test-key-never-sent';
const { server, setCatalogueForTests, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');
const { geminiCallsForScan } = await import('../src/scans.ts');
const { getScan } = await import('../src/scans.ts');

let port = 0;

const ROW = {
  code: '0068100084245',
  name: 'Kraft Dinner Original',
  brands: 'Kraft',
  quantity: '225 g',
  sizeValue: 225,
  sizeUnit: 'g',
  soldInCanada: true,
  leafCategory: 'Macaroni',
  categoryPath: ['Groceries'],
  source: 'openfoodfacts',
};

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: (code: string) => (code === ROW.code ? ROW : null) });
  setGeminiTransportForTests(fakeTransport().transport);
});

after(async () => {
  setCatalogueForTests(null);
  setGeminiTransportForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const base = () => `http://127.0.0.1:${port}`;

async function post(path: string, body: unknown) {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/**
 * A scan row whose identification FAILED, which is the row this whole feature
 * hangs a price on. A typed search produces exactly that: a real row, a real
 * id, and no resolved code on it (a barcode scan now records the digits it
 * read, so it is no longer the fixture).
 */
async function unidentifiedScan(deviceId: string): Promise<number> {
  const res = await fetch(`${base()}/api/identify?text=${encodeURIComponent('something nobody named')}&deviceId=${deviceId}`);
  const seen = (await res.json()) as { scanId?: number };
  assert.ok(typeof seen.scanId === 'number', 'identify wrote no scan row');
  return seen.scanId as number;
}

/* ------------------------------------------------------------------ */

test('a price with no product and no scan is still refused, exactly as before', async () => {
  const { status, body } = await post('/api/correction', {
    clientId: 'c-orphan',
    deviceId: 'd-orphan',
    priceCents: 499,
  });
  assert.equal(status, 200);
  assert.equal(body.stored, false, 'a price nothing could ever read back was accepted');
  assert.match(String(body.why), /no product attached/);
});

test('a price-only correction naming a real scan is accepted as an observation', async () => {
  const scanId = await unidentifiedScan('d-observe');
  assert.equal(getScan(scanId)!.resolved_code, null, 'the fixture scan was identified after all');

  const { status, body } = await post('/api/correction', {
    clientId: 'c-observe',
    deviceId: 'd-observe',
    scanId,
    priceCents: 499,
  });
  assert.equal(status, 200);
  assert.equal(body.stored, true, 'the price was refused even though it named a scan');
  assert.equal(body.observation, true, 'the route did not say this was an observation');
  assert.equal(body.scanId, scanId);
});

test('the price lands on the scan row, which is the one place anything can read it', async () => {
  const scanId = await unidentifiedScan('d-lands');
  await post('/api/correction', {
    clientId: 'c-lands',
    deviceId: 'd-lands',
    scanId,
    priceCents: 1234,
  });
  assert.equal(getScan(scanId)!.typed_price_cents, 1234);
});

test('an observation is not a correction: it never claims a product', async () => {
  /*
   * The guarantee the 19d refusal exists to give. An observation must not
   * become evidence in anybody's verdict, so it may not acquire a code on the
   * way in, and the scan it points at must stay as unidentified as it was.
   */
  const scanId = await unidentifiedScan('d-notacorrection');
  await post('/api/correction', {
    clientId: 'c-notacorrection',
    deviceId: 'd-notacorrection',
    scanId,
    priceCents: 750,
  });
  const row = getScan(scanId)!;
  assert.equal(row.resolved_code, null, 'the observation invented a product code');
  assert.equal(row.corrected_code, null, 'the observation was filed as a correction');
  assert.notEqual(row.outcome, 'corrected', 'an unidentified scan was marked corrected');
});

test('a price-only body with no usable price is refused rather than stored as zero', async () => {
  const scanId = await unidentifiedScan('d-noprice');
  for (const priceCents of [0, -1, undefined, 'four ninety-nine']) {
    const { body } = await post('/api/correction', {
      clientId: `c-noprice-${String(priceCents)}`,
      deviceId: 'd-noprice',
      scanId,
      priceCents,
    });
    assert.equal(body.stored, false, `a price of ${String(priceCents)} was accepted`);
  }
  assert.equal(getScan(scanId)!.typed_price_cents, null, 'a refused price was written anyway');
});

test('a scan id that names nothing falls back to the refusal, not to a silent write', async () => {
  const { body } = await post('/api/correction', {
    clientId: 'c-ghost',
    deviceId: 'd-ghost',
    scanId: 999_999,
    priceCents: 499,
  });
  assert.equal(body.stored, false);
});

test('a correction that DOES name a product is unaffected by any of this', async () => {
  /*
   * The regression that would matter most: the new branch sits in front of the
   * ordinary path, so the ordinary path has to still be the ordinary path.
   */
  const res = await fetch(`${base()}/api/identify?gtin=${ROW.code}&deviceId=d-normal`);
  const seen = (await res.json()) as { scanId?: number };
  const scanId = seen.scanId as number;

  const { body } = await post('/api/correction', {
    clientId: 'c-normal',
    deviceId: 'd-normal',
    scanId,
    code: ROW.code,
    label: ROW.name,
    /* The corrections store requires one, and that requirement is untouched by
       this change -- it is also a third, independent reason an observation must
       not be filed as a correction: the shopper is never asked for a shop on
       this route, so every observation would be refused at that gate anyway. */
    seller: 'Metro',
    priceCents: 399,
  });
  assert.equal(body.stored, true, `the ordinary correction path broke: ${String(body.why)}`);
  assert.equal(body.observation, undefined, 'a real correction was reported as an observation');
  assert.equal(getScan(scanId)!.typed_price_cents, 399);
});

/* ------------------- the verdict as it was shown, written down ----------- */

/**
 * THE OTHER HALF OF `scanId` ON A PRICE BODY, 2026-09-15.
 *
 * `/api/price` has written `verdict_tier`, `verdict_confidence` and
 * `verdict_sellers` onto the named scan since plan item 9d, and until today it
 * had never once run in production: the guard is `Number.isInteger(scanId)`,
 * and the phone's price body had exactly five keys with no `scanId` among
 * them. Three columns that were always NULL, and a feature nobody could tell
 * was off by reading either side of it.
 *
 * The three cases below are the whole of the guard: a body that names a scan,
 * a body that does not, and an answer that was a refusal rather than a
 * verdict. Asserted against the response's OWN tier and band rather than
 * against literals, because the verdict is a function of price evidence whose
 * age moves every day -- a hardcoded `walk_away` here would be a test that
 * fails on a Tuesday for a reason that has nothing to do with this code.
 */

test('a price body naming a scan attaches to that scan: its Gemini call is linked to the row, and no Shin verdict is written onto it', async () => {
  const scanId = await unidentifiedScan('d-verdict');
  // A fresh double clears the answer the scan held, so the price call has to make its own.
  const t = fakeTransport();
  setGeminiTransportForTests(t.transport);
  const { body } = await post('/api/price', { scanId, deviceId: 'd-verdict', text: 'something nobody named', askingCents: 499 });
  assert.equal(body.kind, 'gemini');
  assert.equal(t.calls.length, 1, 'a price call is one Gemini call');
  assert.equal(geminiCallsForScan(scanId).length, 2, 'the scan holds its own call and the price call, both linked to it');
  const row = getScan(scanId)!;
  assert.equal(row.verdict_tier, null, 'Shin wrote a verdict of its own onto the row');
  assert.equal(row.verdict_confidence, null);
  assert.equal(row.verdict_sellers, null);
});

test('a price body with no scan prices the thing and writes nothing to any scan row', async () => {
  const bystander = await unidentifiedScan('d-noscan');
  setGeminiTransportForTests(fakeTransport().transport);
  const { status, body } = await post('/api/price', { text: 'Kraft Dinner Original 225 g', askingCents: 499 });
  assert.equal(status, 200);
  assert.equal(body.kind, 'gemini');
  const row = getScan(bystander)!;
  assert.equal(row.verdict_tier, null);
  assert.equal(geminiCallsForScan(bystander).length, 1, 'a call for another question was linked to a bystander scan (it should hold only its own)');
});

test('a price body that names nothing is a marked answer, not a Gemini call', async () => {
  const t = fakeTransport();
  setGeminiTransportForTests(t.transport);
  const { status, body } = await post('/api/price', { askingCents: 499 });
  assert.equal(status, 200);
  assert.equal(body.reason, 'nothing_to_price');
  assert.equal(t.calls.length, 0, 'an empty question spent a Gemini call');
});
