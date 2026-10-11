/**
 * THE CLAUDE READ OF THE PACK IS DEVELOPER-ONLY, AT THE SOCKET.
 *
 * RULINGS.md "A scan never ends with no result", amended 2026-10-10. Jamin:
 * "sending picture to claude is a developer only setting". Step (2), the camera
 * frame sent to Claude to read the pack, is off for every shopper; the server
 * refuses it for anyone it does not know as a developer, because a client flag
 * can be spoofed and the call costs money. A developer is a device id listed in
 * SHIN_DEVELOPER_DEVICES, or a request carrying the admin token. A shopper's
 * double miss (the catalogue and Open Food Facts) goes to typing the name,
 * logged loudly with the reason `pack_read_developer_only`.
 *
 * Also here, D-231 (a): the Claude range ask is logged on the scan row as
 * `claude_typical`, never `gemini_typical`; and (b): `verdict_zone` is the
 * Gemini path's column, so a catalogue-first scan writes its zone to
 * `estimate_zone` and leaves `verdict_zone` null.
 *
 * No socket leaves this machine: Open Food Facts, the range ask and the pack
 * read all get doubles that count their calls.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-pack-dev-only-'));
const scansPath = join(dir, 'scans.db');

process.env.SHIN_SCANS = scansPath;
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = join(dir, 'prices.db');
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.SHIN_PACK_READ_STORE_PATH = join(dir, 'pack-read.json');
process.env.PORT = '0';
process.env.SHIN_CATALOGUE_FIRST = '1';
process.env.SHIN_DEVELOPER_DEVICES = ' dev-phone , dev-laptop ';
process.env.SHIN_ADMIN_TOKEN = 'admin-secret-for-test';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
delete process.env.SHIN_PACK_READ_MONTHLY_CAP;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;

function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

const SHOPPER_MISS = withCheck('006230000001'); // nobody knows it: a shopper scans it
const SPOOFED = withCheck('006230000002');
const DEV_MISS = withCheck('006230000003');
const ADMIN_MISS = withCheck('006230000004');
const OFF_HIT = withCheck('006230000005'); // Open Food Facts names it; Pexi holds no price

const FRAME = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]).toString('base64');

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const catDb = openCatalogue(':memory:');
rebuildFts(catDb);
const NO_EMBEDDER = {
  id: 'test:none',
  dim: 384,
  async embedPassages() {
    throw new Error('vector arm should be off');
  },
  async embedQuery() {
    throw new Error('vector arm should be off');
  },
};
const catalogue = new Catalogue(catDb, NO_EMBEDDER as unknown as ConstructorParameters<typeof Catalogue>[1]);

const rangeAsks: string[] = [];
const rangeAskProvider = {
  name: 'fake-claude-range',
  async send<T>(req: { user: string }) {
    rangeAsks.push(req.user);
    return {
      value: { known: true, low_cents: 349, high_cents: 549, currency: 'CAD', unit: 'one pack', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};
let packCalls = 0;
const packReadProvider = {
  name: 'fake-claude-pack',
  async send<T>() {
    packCalls += 1;
    return {
      value: { known: true, name: 'Sea Salt Coconut Sandwich Cookies', brand: 'Oreo', size: '97 g' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};
const errorLines: Record<string, unknown>[] = [];

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
const { setOffFetchForTests, clearOffCacheForTests } = await import('../src/open-food-facts.ts');
const { setErrorSinkForTests } = await import('../src/errlog.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({
    searcher: catalogue,
    db: catDb,
    rangeAskProvider: rangeAskProvider as never,
    packReadProvider: packReadProvider as never,
    claudeWaitMs: 2000,
  } as never);
  clearOffCacheForTests();
  setOffFetchForTests(async (url) => {
    const code = /product\/(\d+)\.json/.exec(url)?.[1] ?? '';
    if (code !== OFF_HIT) return { ok: false, status: 404, json: async () => ({ status: 0 }) };
    return { ok: true, status: 200, json: async () => ({ code, product: { code, product_name: 'Oreo Chocolate Sandwich Cookies', brands: 'Oreo', quantity: '303 g' } }) };
  });
  setErrorSinkForTests((line) => errorLines.push(JSON.parse(line) as Record<string, unknown>));
});

after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  setOffFetchForTests(null);
  setErrorSinkForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    catDb.close();
  } catch {
    /* already closed */
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

async function identify(gtin: string, device: string, extra = ''): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=CA${extra}`);
  assert.equal(r.status, 200, `/api/identify answered ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

async function sendFrame(gtin: string, device: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${base}/api/identify/pack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ gtin, deviceId: device, countryCode: 'CA', frame: FRAME }),
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

function scanRow(id: unknown): Record<string, unknown> {
  assert.equal(typeof id, 'number', 'the answer carried no scanId, so no scan row can be checked');
  const db = new DatabaseSync(scansPath, { readOnly: true });
  try {
    return db.prepare('SELECT * FROM scan WHERE id = ?').get(id as number) as Record<string, unknown>;
  } finally {
    db.close();
  }
}

test('a shopper device that says it holds a frame is never asked for it: typing, logged loudly as developer-only', async () => {
  const packs = packCalls;
  const body = await identify(SHOPPER_MISS, 'shop-1', '&canSendFrame=1');
  assert.notEqual(body.outcome, 'frame_wanted', 'the server asked a shopper for the camera frame: the pack read is developer-only');
  assert.equal(body.outcome, 'not_in_catalogue');
  assert.equal(body.offerManualEntry, true, 'a shopper whose barcode nobody knows was not offered typing the name');
  const reasons = body.noNameReasons as string[] | undefined;
  assert.ok(Array.isArray(reasons) && reasons.includes('pack_read_developer_only'), `the reason does not say the pack read is developer-only: ${JSON.stringify(reasons)}`);
  assert.equal(packCalls, packs, 'Claude was sent a frame for a shopper');
  const line = errorLines.find((l) => l.where === 'identify.no_name' && (l.detail as Record<string, unknown> | undefined)?.gtin === SHOPPER_MISS);
  assert.ok(line, 'a shopper scan that ended with typing was not logged loudly');
  assert.match(String((line.detail as Record<string, unknown>).reasons), /pack_read_developer_only/, 'the loud line does not carry the developer-only reason');
  assert.match(String(scanRow(body.scanId).range_miss_reason), /pack_read_developer_only/, 'the scan row does not record why the pack was not read');
});

test('a spoofed frame call from a shopper device is refused with a named reason and costs nothing', async () => {
  const packs = packCalls;
  const r = await sendFrame(SPOOFED, 'shop-1');
  assert.equal(r.status, 403, `the server took a frame from a shopper device (status ${r.status}): a client flag is not proof of a developer`);
  assert.equal(r.body.failure, 'pack_read_developer_only', `the refusal does not name its reason: ${JSON.stringify(r.body)}`);
  assert.equal(packCalls, packs, 'the refused frame still reached Claude');
  const line = errorLines.find((l) => l.where === 'identify.pack_refused' && l.deviceId === 'shop-1');
  assert.ok(line, 'the refused pack read was not logged');
});

test('a frame call naming no device is refused too', async () => {
  const packs = packCalls;
  const r = await fetch(`${base}/api/identify/pack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gtin: SPOOFED, countryCode: 'CA', frame: FRAME }),
  });
  assert.equal(r.status, 403, 'a frame with no device id was read');
  assert.equal(packCalls, packs);
});

test('a listed developer device is asked for the frame, and the frame is read', async () => {
  const asked = await identify(DEV_MISS, 'dev-phone', '&canSendFrame=1');
  assert.equal(asked.outcome, 'frame_wanted', `control failed: a developer device was not asked for the frame (${JSON.stringify(asked)})`);
  const packs = packCalls;
  const r = await sendFrame(DEV_MISS, 'dev-phone');
  assert.equal(r.status, 200, `the developer's frame was refused (${r.status}: ${JSON.stringify(r.body)})`);
  assert.equal(packCalls - packs, 1, 'the developer frame did not reach Claude exactly once');
  assert.equal(r.body.outcome, 'named_outside_catalogue');
  assert.equal(r.body.identitySource, 'claude_reading');
});

test('the admin token counts as a developer, whatever the device id', async () => {
  const packs = packCalls;
  const r = await sendFrame(ADMIN_MISS, 'some-other-phone', { 'x-shin-admin': 'admin-secret-for-test' });
  assert.equal(r.status, 200, `a request with the admin token was refused (${r.status})`);
  assert.equal(packCalls - packs, 1);
  const wrong = await sendFrame(withCheck('006230000006'), 'some-other-phone', { 'x-shin-admin': 'not-the-token' });
  assert.equal(wrong.status, 403, 'a wrong admin token was let through');
});

test('D-231: the Claude range ask is logged as claude_typical on the scan row, never gemini_typical', async () => {
  const asks = rangeAsks.length;
  const body = await identify(OFF_HIT, 'shop-2', '&shelfPriceCents=499');
  assert.equal(rangeAsks.length - asks, 1, 'setup: the named item did not take the ladder down to the Claude range ask');
  assert.equal(body.rangeSource, 'claude_typical', `the answer says its range came from ${String(body.rangeSource)}, but Claude answered it`);
  const row = scanRow(body.scanId);
  assert.notEqual(row.range_source, 'gemini_typical', 'the scan row says Gemini priced this, but the range ask is Claude');
  assert.equal(row.range_source, 'claude_typical');
  // D-231 (b): the zone shown goes to estimate_zone; verdict_zone is the Gemini path's column and stays null here.
  assert.equal(typeof row.estimate_zone, 'string', 'a catalogue-first scan with a shelf price wrote no zone at all');
  // D-235: the zone the sheet showed is on the row in both columns, so a reader of either finds it.
  assert.equal(row.verdict_zone, row.estimate_zone, 'verdict_zone must carry the zone the catalogue-first sheet showed');
});
