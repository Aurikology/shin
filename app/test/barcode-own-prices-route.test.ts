/**
 * A FUNCTION WITH TESTS AND NO CALL SITE IS NOT A FEATURE.
 *
 * Why this file exists, 2026-09-26. `lookupOwnPricesByBarcode` was built and
 * covered by ten unit tests, and nothing called it, so a scanned barcode still
 * could not reach any of the 17,994 priced barcodes two loads had just put in
 * the price store. A unit test on a function cannot see a missing call site.
 * These tests only pass if the route itself answers with our prices, read out of
 * the HTTP response body.
 *
 * WHAT THEY PIN, and it is two facts that pull in opposite directions:
 *
 *   1. ON BY DEFAULT since 2026-09-26. These tests were written the other way
 *      round on the day the seam was built, pinning "off by default" to keep
 *      Jamin's barcode rule honest: "The server will not check shins own product
 *      list for now. The only thing the server will do is call gemini." He lifted
 *      that for a TYPED search on 2026-09-23, and on 2026-09-26 he asked why
 *      Gemini was still in the way of a scan, which is the ruling for scans too.
 *      So the first test now pins the opposite: a scan answers with our price
 *      without anyone setting anything.
 *
 *   2. THE SWITCH STILL CLOSES. With `SHIN_BARCODE_OWN_PRICES=0` the same scan
 *      comes back with NO own prices at all. That test is what makes this a
 *      one-line reversal rather than a claim that it is one, and the pair of
 *      tests is why the direction of the default is a decision and not a drift.
 *
 * WHY TWO SERVER PROCESSES. The flag is read once when the module loads, which
 * is what makes it a one-line switch rather than a per-request cost, so one
 * process cannot show both states. The second process is started as a child with
 * the variable set, and its answer is read over HTTP exactly like the first.
 * That is also the only honest way to prove the default: a test that reached in
 * and overwrote the constant would be testing itself.
 *
 * WHY THE BARCODE HAS A REAL CHECK DIGIT. The route refuses a barcode whose
 * checksum does not work out, with reason invalid_barcode, several lines before
 * any of this runs. 0000000000093 is valid and holds no real product.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-own-price-route-'));
const pricesPath = join(dir, 'prices.db');

process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = pricesPath;
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_BARCODE_OWN_PRICES;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const SCANNED = '0000000000093';
const OUR_PRICE_CENTS = 499;
/**
 * The store holds cents and the answer carries dollars: `OwnPrice.amount` is a
 * dollar figure, the same as every other offer the answer sheet renders, which
 * the first run of this file found by asserting 499 and being handed 4.99. Both
 * numbers are written out rather than one being derived, so a change to either
 * side is a red test instead of an arithmetic coincidence.
 */
const OUR_PRICE_DOLLARS = 4.99;
const OUR_STORE = 'ANBL Fredericton';

/*
 * The price is written before the server is imported, because the lookup opens
 * the file on demand: a store created afterwards would be a test that passes for
 * the wrong reason.
 */
const { openPrices, recordObservation } = await import('../../price/src/store.ts');
const prices = openPrices(pricesPath);
recordObservation(prices, {
  code: SCANNED,
  seller: 'anbl',
  sellerSku: 'TEST-1',
  sellerName: 'Test Cider 473 mL',
  sellerBrand: null,
  priceCents: OUR_PRICE_CENTS,
  kind: 'regular',
  unitPriceCents: null,
  unitLabel: null,
  currency: 'CAD',
  country: 'CA',
  region: 'NB',
  joinMethod: 'gtin',
  seenOn: '2026-09-26',
  url: null,
  imageUrl: null,
  inStock: null,
  storeName: OUR_STORE,
  storeCity: null,
  basePriceCents: 434,
});

const { server, setGeminiTransportForTests } = await import('../server.ts');
const { fakeTransport } = await import('./gemini-double.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setGeminiTransportForTests(fakeTransport().transport);
});

let child: ChildProcess | null = null;
after(async () => {
  setGeminiTransportForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  if (child && !child.killed) child.kill();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

const identify = (base: string) =>
  fetch(`${base}/api/identify?gtin=${SCANNED}&deviceId=own-price-route`).then(async (r) => ({
    status: r.status,
    body: (await r.json()) as Record<string, unknown>,
  }));

/** Every offer the answer carries, wherever in the shape it sits. */
function allOffers(body: Record<string, unknown>): Record<string, unknown>[] {
  const own = Array.isArray(body.ownOffers) ? (body.ownOffers as Record<string, unknown>[]) : [];
  const grounded = body.grounded as { block?: { offers?: unknown } } | null | undefined;
  const inBlock = Array.isArray(grounded?.block?.offers)
    ? (grounded!.block!.offers as Record<string, unknown>[])
    : [];
  return [...own, ...inBlock];
}

test('with nothing set at all, a scanned barcode is answered with our own price on it', async () => {
  const { status, body } = await identify(`http://127.0.0.1:${port}`);
  assert.equal(status, 200);
  const ours = allOffers(body).filter((o) => o.retailer === OUR_STORE);
  assert.equal(ours.length >= 1, true, `our price did not reach the answer: ${JSON.stringify(body).slice(0, 600)}`);
  assert.equal(ours[0]!.price, OUR_PRICE_DOLLARS);
  assert.equal(ours[0]!.currency, 'CAD');
  assert.equal(ours[0]!.trusted, false, 'a crawled price is never presented as checked');
  assert.equal(ours[0]!.seenOn, '2026-09-26', 'the date printed is when the price was seen, never now');
});

test('the price really is there to be found, so the test below is a rule and not an empty store', async () => {
  // The negative control. Without this, the OFF test passes just as well
  // against a price store that was never written, which would prove nothing.
  const { lookupOwnPricesByBarcode } = await import('../src/own-prices.ts');
  const match = lookupOwnPricesByBarcode(SCANNED, { pricesDbPath: pricesPath }).match;
  assert.ok(match, 'the fixture price is not readable at all, so the OFF test proves nothing');
  assert.equal(match.prices.some((p) => p.amount === OUR_PRICE_DOLLARS), true);
});

/**
 * A port nothing else is on, taken by opening a listener, reading the number the
 * OS gave, and closing it. The child is told to use that number, because with
 * PORT=0 the server prints "localhost:0" and there is no way to ask it what it
 * actually took.
 */
async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise<number>((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const p = (probe.address() as AddressInfo).port;
      probe.close(() => resolve(p));
    });
  });
}

test('with SHIN_BARCODE_OWN_PRICES=0 the same scan comes back with none of our prices, so the reversal is real', async () => {
  /*
   * The child has no Gemini key that works and no way to be handed the test
   * double, so its model call fails and the route answers with
   * failure: model_client_error. That is the case our own price is worth the most
   * in, and the reason the lookup happens before the model call rather than
   * after: a price we already hold is the only thing left to show. Which is
   * exactly why the OFF case is worth pinning here rather than in the easy path:
   * if the switch leaked anywhere, it would leak here.
   */
  const serverPath = fileURLToPath(new URL('../server.ts', import.meta.url));
  const chosen = await freePort();
  child = spawn(process.execPath, ['--experimental-strip-types', serverPath], {
    env: {
      ...process.env,
      SHIN_BARCODE_OWN_PRICES: '0',
      PORT: String(chosen),
      SHIN_SCANS: join(dir, 'scans-on.db'),
      SHIN_REPEAT_CACHE: join(dir, 'repeat-cache-on.db'),
      SHIN_GAPS: join(dir, 'gaps-on.db'),
      SHIN_CORRECTIONS: join(dir, 'corrections-on.db'),
      SHIN_PHOTOS: join(dir, 'photos-on'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let said = '';
  child.stdout?.on('data', (c: Buffer) => {
    said += c.toString();
  });
  child.stderr?.on('data', (c: Buffer) => {
    said += c.toString();
  });
  const base = `http://127.0.0.1:${chosen}`;
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`the second server exited with ${child.exitCode} before answering: ${said.slice(0, 600)}`);
    }
    try {
      const r = await fetch(`${base}/api/health`).catch(() => null);
      if (r) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(ready, true, `the second server never came up: ${said.slice(0, 600)}`);

  const { status, body } = await identify(base);
  assert.equal(status, 200);
  assert.equal(body.ownOffers, undefined, 'the switch was set to 0 and our data was read anyway');
  const ours = allOffers(body).filter((o) => o.retailer === OUR_STORE);
  assert.deepEqual(ours, [], 'our price reached the answer with the switch closed');
});
