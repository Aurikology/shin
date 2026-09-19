/**
 * Google Doc audit rows 14, 15, 34: the market and its region travel from the
 * phone's context builder, through the real server, into the one Gemini prompt.
 * Nothing reaches Google: the transport is the recorded fake the one-call tests use.
 *
 * Each behaviour has its negative beside it. If the region stops travelling, if
 * a country the small server tables never heard of stops resolving, or if a
 * Canada default comes back for a user who chose nothing, one of these fails.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { fakeTransport, type Call } from './gemini-double.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-market-wire-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
process.env.GEMINI_API_KEY = 'test-key-never-sent-anywhere';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_GEMINI_MODEL;
delete process.env.SHIN_MODEL_PROVIDER;

const { server, setGeminiTransportForTests, setSpendGuardForTests, setCatalogueForTests, settleBackgroundChecks } = await import('../server.ts');
const { openScanStore } = await import('../src/scans.ts');
// The client module is plain JavaScript; a variable specifier keeps the type checker out of it.
const clientUrl = (p: string) => new URL(`../public/js/${p}`, import.meta.url).href;
const { scanContextFrom } = (await import(clientUrl('lib/scan-body.js'))) as any;

let port = 0;
let calls: Call[] = [];
const base = () => `http://127.0.0.1:${port}`;

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  openScanStore(process.env.SHIN_SCANS);
});
beforeEach(() => {
  setSpendGuardForTests(null);
  const t = fakeTransport();
  calls = t.calls;
  setGeminiTransportForTests(t.transport);
});
after(async () => {
  await settleBackgroundChecks?.();
  setGeminiTransportForTests(null);
  setCatalogueForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the scan database is still open on Windows; the OS will take the temp dir */
  }
});

const userTurn = (c: Call): string => {
  const input = c.body.input;
  return typeof input === 'string' ? input : (input as any[]).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
};

/** One barcode scan, with the query the phone's own context builder produces for this market. */
async function scanWith(market: unknown, device: string): Promise<string> {
  const q = new URLSearchParams({ gtin: '0068100084245', deviceId: device, ...scanContextFrom({ market }) });
  const r = await fetch(`${base()}/api/identify?${q.toString()}`);
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1, 'a scan must be one Gemini call');
  return userTurn(calls[0]);
}

test('the chosen region travels from the phone, through the server, into the Gemini prompt (row 15)', async () => {
  const asked = await scanWith({ country: 'Canada', currency: 'CAD', code: 'CA', region: 'Ontario' }, 'region-a');
  assert.match(asked, /Country: CA/);
  assert.match(asked, /Region \(province, state or similar\): Ontario/, 'the region did not reach the prompt');
  assert.match(asked, /Region-sensitivity hint from Shin: yes/);
});

test('a region nobody chose stays unknown in the prompt, never guessed (row 15)', async () => {
  const asked = await scanWith({ country: 'Canada', currency: 'CAD', code: 'CA', region: '' }, 'region-b');
  assert.match(asked, /Country: CA/);
  assert.match(asked, /Region \(province, state or similar\): unknown/);
});

test('a US state travels the same way, and the country is not Canada (rows 14, 34)', async () => {
  const asked = await scanWith({ country: 'United States', currency: 'USD', code: 'US', region: 'Texas' }, 'region-c');
  assert.match(asked, /Country: US/);
  assert.match(asked, /Region \(province, state or similar\): Texas/);
  assert.match(asked, /Currency: USD/);
  assert.doesNotMatch(asked, /Country: CA/);
});

test('a country the old three-entry picker and the small server table never had resolves from its code (row 14)', async () => {
  const asked = await scanWith({ country: 'Bangladesh', currency: 'BDT', code: 'BD', region: '' }, 'region-d');
  assert.match(asked, /Country: BD/);
  assert.match(asked, /Currency: BDT/);
  assert.match(asked, /Cross-border hint from Shin: different_country_not_comparable/);
});

test('an older phone that sends only the English name still resolves any country (row 14)', async () => {
  const q = new URLSearchParams({ gtin: '0068100084245', deviceId: 'region-e', market: 'Kazakhstan', currency: 'KZT' });
  await fetch(`${base()}/api/identify?${q.toString()}`);
  assert.match(userTurn(calls[0]), /Country: KZ/);
});

test('a region with no country is not sent, and the server calls the market unknown (rows 14, 15)', async () => {
  assert.equal(scanContextFrom({ market: { country: '', currency: '', code: '', region: 'Ontario' } }).region, undefined);
  const q = new URLSearchParams({ gtin: '0068100084245', deviceId: 'region-f', region: 'Ontario' });
  await fetch(`${base()}/api/identify?${q.toString()}`);
  const asked = userTurn(calls[0]);
  assert.match(asked, /Country: unknown/);
  assert.match(asked, /Region \(province, state or similar\): unknown/);
});

test('a user who chose nothing gets no market at all, never Canada (row 34)', async () => {
  const ctx = scanContextFrom({ market: { country: '', currency: '', code: '', region: '' } });
  assert.equal(ctx.market, undefined);
  assert.equal(ctx.countryCode, undefined);
  assert.equal(ctx.currency, undefined);
  assert.equal(ctx.region, undefined);
  const asked = await scanWith({ country: '', currency: '' }, 'region-g');
  assert.match(asked, /Country: unknown/);
  assert.match(asked, /Currency: unknown/);
  assert.doesNotMatch(asked, /Country: CA/);
});
