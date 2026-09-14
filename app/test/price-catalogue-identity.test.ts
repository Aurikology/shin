/**
 * `/api/price` must not lose an identity `/api/identify` just gave, over a real socket.
 *
 * 2026-09-14, the founder's phone: a Kirkland Signature 500 mL water bottle.
 * The barcode read named it (`GET /api/identify?gtin=0096619321841`, matched
 * by gtin), and the price call carrying that same code answered "Could not
 * work out what this is". A photo of the same bottle then picked catalogue row
 * 0055297000189 "Water", and the price call carrying that code refused the
 * same way. No price source held a row for either code, and the price route
 * never asked the catalogue.
 *
 * The catalogue is faked through the same seam the other route tests use,
 * because the real one is 4.13 GB and is not on a machine that runs tests.
 * The real catalogue was checked by hand against the exact request bodies.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-price-catalogue-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;

const { server, setCatalogueForTests } = await import('../server.ts');

let port = 0;

/** The two rows as the catalogue holds them, fields as `byGtin` returns them. */
const ROWS: Record<string, Record<string, unknown>> = {
  '0096619321841': {
    code: '0096619321841',
    name: 'Natural spring water',
    brands: 'Kirkland Signature',
    quantity: '500mL',
    sizeValue: 500,
    sizeUnit: 'ml',
    soldInCanada: true,
    leafCategory: 'en:spring-waters',
    categoryPath: ['en:beverages', 'en:waters'],
    source: 'openfoodfacts',
  },
  '0055297000189': {
    code: '0055297000189',
    name: 'Water',
    brands: null,
    quantity: null,
    sizeValue: null,
    sizeUnit: null,
    soldInCanada: true,
    leafCategory: null,
    categoryPath: [],
    source: 'openfoodfacts',
  },
};

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: (code: string) => ROWS[code] ?? null });
});

after(async () => {
  setCatalogueForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

async function price(body: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}/api/price`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

test('the barcode read of the Kirkland bottle is priced as that product, not "could not work out what this is"', async () => {
  const { status, body } = await price({
    text: 'Kirkland Signature Natural spring water 500mL',
    gtin: '0096619321841',
    category: 'grocery',
    askingCents: null,
  });
  assert.equal(status, 200);
  assert.notEqual(body.reason, 'no_identity', `still refused as no identity: ${body.detail}`);
  assert.equal(body.identity?.gtin, '0096619321841');
  assert.match(String(body.identity?.label), /Kirkland Signature/);
  assert.match(String(body.identity?.label), /Natural spring water/);
  assert.doesNotMatch(String(body.detail), /Could not work out what this is/);
});

test('the photo route\'s "Water" pick, priced with its code, is named too', async () => {
  const { status, body } = await price({
    text: 'Water',
    gtin: '0055297000189',
    category: 'grocery',
    askingCents: 200,
  });
  assert.equal(status, 200);
  assert.notEqual(body.reason, 'no_identity', `still refused as no identity: ${body.detail}`);
  assert.equal(body.identity?.gtin, '0055297000189');
  assert.equal(body.identity?.label, 'Water');
});

test('a code the catalogue does not hold is still an honest no identity', async () => {
  const { body } = await price({ gtin: '0000000000017', category: 'grocery', askingCents: 200 });
  assert.equal(body.reason, 'no_identity');
});
