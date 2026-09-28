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
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
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
const { fakeTransport, goodAnswer, httpBody } = await import('./gemini-double.ts');

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

let seenCalls: Array<{ body: Record<string, unknown> }> = [];
function gemini(reply?: Parameters<typeof fakeTransport>[0]) {
  const t = fakeTransport(reply);
  seenCalls = t.calls;
  setGeminiTransportForTests(t.transport);
}
const promptOf = (i: number) => JSON.stringify(seenCalls[i].body.input);

after(async () => {
  setCatalogueForTests(null);
  setGeminiTransportForTests(null);
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

/*
 * THE SHAPE OF THE BUG, NOW. The catalogue is no longer asked to name anything
 * (beta gap item 2): the price call hands Gemini the code and the text it was
 * given, in ONE call, and the name on the sheet is Gemini's. What must still
 * never happen is a price call that drops the identity it was handed and
 * answers "could not work out what this is".
 */
test('the barcode read of the Kirkland bottle is priced as that product, with its code and words in the one call', async () => {
  gemini(() => ({
    text: httpBody(
      JSON.stringify(goodAnswer({ product: { ...(goodAnswer().product as object), name: 'Natural spring water', brand: 'Kirkland Signature', size: '500 mL' } })),
    ),
  }));
  const { status, body } = await price({
    text: 'Kirkland Signature Natural spring water 500mL',
    gtin: '0096619321841',
    category: 'grocery',
    askingCents: null,
  });
  assert.equal(status, 200);
  assert.equal(seenCalls.length, 1, 'a price call is one Gemini call');
  assert.match(promptOf(0), /0096619321841/, 'the code the client sent never reached Gemini');
  assert.match(promptOf(0), /Kirkland Signature Natural spring water 500mL/, 'the words the client sent never reached Gemini');
  assert.notEqual(body.reason, 'no_identity');
  assert.equal(body.grounded.block.name, 'Natural spring water');
  assert.equal(body.grounded.block.brand, 'Kirkland Signature');
});

test('the photo route\'s "Water" pick, priced with its code, is named too', async () => {
  gemini(() => ({ text: httpBody(JSON.stringify(goodAnswer({ product: { ...(goodAnswer().product as object), name: 'Water', brand: null } }))) }));
  const { status, body } = await price({
    text: 'Water',
    gtin: '0055297000189',
    category: 'grocery',
    askingCents: 200,
  });
  assert.equal(status, 200);
  assert.match(promptOf(0), /0055297000189/);
  assert.notEqual(body.reason, 'no_identity');
  assert.equal(body.grounded.block.name, 'Water');
});

test('a code Gemini cannot place is still an answer, marked low confidence, never an identity refusal', async () => {
  gemini(() => ({ text: httpBody('I could not identify this barcode.') }));
  const { status, body } = await price({ gtin: '0000000000017', category: 'grocery', askingCents: 200 });
  assert.equal(status, 200);
  assert.notEqual(body.reason, 'no_identity');
  assert.equal(body.lowConfidence, true);
  assert.equal(seenCalls.length, 1);
});
