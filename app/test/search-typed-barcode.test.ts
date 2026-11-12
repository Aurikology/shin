/**
 * D-255: a barcode typed into manual search never found the product.
 *
 * `/api/search` built { text, limit, vectors } and never passed `gtin`, so the
 * catalogue's barcode branch (query.gtin) was unreachable from the search box.
 * Digits that check out as a barcode must reach that branch; names and digit
 * strings that are not a barcode must not.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-search-barcode-'));
process.env.SHIN_CATALOGUE_FIRST = '0';
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setSearchServiceForTests } = await import('../server.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
});
after(async () => {
  setSearchServiceForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, { headers: { connection: 'close' } });

/** Records what the route asked the catalogue, answers like a barcode hit when a gtin came. */
async function asked(q: string): Promise<{ gtin?: string; text?: string }> {
  const seen: Array<{ gtin?: string; text?: string }> = [];
  setSearchServiceForTests({
    search: async (query: { gtin?: string; text?: string }) => {
      seen.push(query);
      return { band: 'miss', matchedBy: 'none', candidates: [], ring: null };
    },
  } as never);
  const res = await get(`/api/search?q=${encodeURIComponent(q)}`);
  assert.equal(res.status, 200);
  assert.equal(seen.length, 1);
  return seen[0]!;
}

test('a typed 12-digit UPC-A that checks out is sent to the catalogue as a barcode', async () => {
  assert.equal((await asked('036000291452')).gtin, '036000291452');
});

test('a typed 13-digit EAN, an 8-digit EAN-8 and a 14-digit GTIN reach the barcode branch', async () => {
  assert.equal((await asked('4006381333931')).gtin, '4006381333931');
  assert.equal((await asked('96385074')).gtin, '96385074');
  assert.equal((await asked('10036000291459')).gtin, '10036000291459');
});

test('digits typed with spaces or dashes, as printed under the bars, are the same barcode', async () => {
  assert.equal((await asked('0 36000 29145 2')).gtin, '036000291452');
  assert.equal((await asked('036000-291452')).gtin, '036000291452');
});

test('a UPC-A typed with a leading zero (its EAN-13 form) is sent as typed', async () => {
  const q = await asked('0036000291452');
  assert.equal(q.gtin, '0036000291452');
});

test('a name, a number that is not a barcode, and short digit strings carry no gtin', async () => {
  assert.equal((await asked('milk')).gtin, undefined);
  assert.equal((await asked('2')).gtin, undefined);
  assert.equal((await asked('12 pack coke')).gtin, undefined);
  assert.equal((await asked('036000291453')).gtin, undefined, 'a wrong check digit is a typo, not a barcode');
});
