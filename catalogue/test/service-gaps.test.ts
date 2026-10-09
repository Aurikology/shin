/**
 * The search runs in a worker thread, so the count of misses it could not write down lives in
 * the worker's memory. `/api/health` runs on the request thread and could never read it. The
 * worker now sends the count and its reason back with every reply, and the service hands the
 * latest pair out as `gaps()`.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalogue } from '../src/schema.ts';
import { startCatalogueService } from '../src/service.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-service-gaps-'));
// A file where the gap log's directory has to be, so the worker's miss log cannot open.
writeFileSync(join(dir, 'blocker'), 'not a directory');
process.env.SHIN_GAPS = join(dir, 'blocker', 'sub', 'gaps.db');
const dbPath = join(dir, 'catalogue.db');
openCatalogue(dbPath).close();

const service = startCatalogueService(dbPath, { warm: false });
after(async () => {
  await service.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked; the OS will take it. */
  }
});

test('the service reports the misses its worker could not write down, with the reason', async () => {
  assert.deepEqual(service.gaps(), { dropped: 0, why: '' }, 'nothing has been asked yet');
  const r = await service.search({ gtin: '0000000000017' });
  assert.equal(r.band, 'miss', 'the search still answers');
  const g = service.gaps();
  assert.ok(g.dropped >= 1, `the dropped miss is visible: ${JSON.stringify(g)}`);
  assert.match(g.why, /ENOTDIR|not a directory|mkdir/i);
});
