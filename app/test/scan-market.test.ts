/**
 * The scan row records the market its answer was shaped for (migration 23: `country`, `currency`), so the
 * no-result and wrong-range rates can be split by market. NULL means no market was resolved, never a default.
 *
 * Two halves: the store (an old-schema file gains the columns with its rows intact, recordScan round-trips
 * them) and the route (a real socket: a request naming the US writes US/USD, one naming nothing writes NULL).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-scan-market-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
delete process.env.REVENUECAT_SECRET_KEY;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { server, setCatalogueForTests } = await import('../server.ts');
const { openScanStore, recordScan, getScan, allScans } = await import('../src/scans.ts');

let port = 0;
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  setCatalogueForTests({ byGtin: () => null });
});
after(async () => {
  setCatalogueForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

test('an old scan table gains country and currency on open, and its rows stay', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'shin-scan-market-old-')), 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE scan (
    id INTEGER PRIMARY KEY, device_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('barcode', 'text', 'photo')),
    query_text TEXT, resolved_code TEXT, resolved_label TEXT, confidence REAL, source TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'refused', 'corrected')),
    corrected_code TEXT, scanned_at TEXT NOT NULL
  ) STRICT;`);
  old.prepare(`INSERT INTO scan (device_id, kind, query_text, outcome, scanned_at) VALUES (?, ?, ?, ?, ?)`)
    .run('old-dev', 'text', 'milk', 'answered', '2026-08-01T10:00:00.000Z');
  old.close();

  const store = openScanStore(path);
  assert.ok(store.db, store.droppedWhy);
  const cols = (store.db.prepare('PRAGMA table_info(scan)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes('country') && cols.includes('currency'), 'migration 23 did not add the columns');
  const rows = allScans(store);
  assert.equal(rows.length, 1, 'the upgrade lost the existing row');
  assert.equal(rows[0].query_text, 'milk');
  assert.equal(rows[0].country, null);
  assert.equal(rows[0].currency, null);
  // Back to the shared store for the rest of the file.
  openScanStore(process.env.SHIN_SCANS);
});

test('recordScan stores a US market as US/USD and no market as null', () => {
  const us = recordScan({ deviceId: 'm-store', kind: 'text', query: 'milk', outcome: 'answered', country: 'US', currency: 'USD' })!;
  const none = recordScan({ deviceId: 'm-store', kind: 'text', query: 'milk', outcome: 'answered' })!;
  assert.equal(getScan(us)!.country, 'US');
  assert.equal(getScan(us)!.currency, 'USD');
  assert.equal(getScan(none)!.country, null);
  assert.equal(getScan(none)!.currency, null);
});

async function identifyInvalid(device: string, extra: string): Promise<number | null> {
  const res = await fetch(`http://127.0.0.1:${port}/api/identify?gtin=1234567890123&deviceId=${device}${extra}`);
  const body = (await res.json()) as { scanId?: number };
  assert.equal(res.status, 200, JSON.stringify(body));
  const row = allScans(openScanStore(process.env.SHIN_SCANS)).find((r) => r.device_id === device);
  assert.ok(row, 'the route wrote no scan row');
  return row.id as number;
}

test('the route writes the market the request named, and null when it named none', async () => {
  const usId = await identifyInvalid('m-route-us', '&countryCode=US&currency=USD');
  assert.equal(getScan(usId!)!.failure_class, 'invalid_barcode');
  assert.equal(getScan(usId!)!.country, 'US');
  assert.equal(getScan(usId!)!.currency, 'USD');
  const caId = await identifyInvalid('m-route-ca', '&countryCode=CA');
  assert.equal(getScan(caId!)!.country, 'CA');
  assert.equal(getScan(caId!)!.currency, 'CAD');
  const noneId = await identifyInvalid('m-route-none', '');
  assert.equal(getScan(noneId!)!.country, null);
  assert.equal(getScan(noneId!)!.currency, null);
});
