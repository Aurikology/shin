/**
 * A SCAN NEVER ENDS WITH NO RESULT, AT THE SOCKET.
 *
 * RULINGS.md "A scan never ends with no result" (2026-10-10). Jamin: "i scanned
 * a pack of oreos and i didn't get any result. This is a huge problem. There
 * should never be somethig with no result. Not only did it not identify it
 * didn't ask claude either." A barcode the catalogue does not hold goes, in
 * order, to (1) a live Open Food Facts lookup, identity only; (2) when that
 * finds nothing, the camera frame, sent to the cheapest Claude model to read
 * the name, brand and size off the pack; then the named item takes the
 * ordinary price ladder. Typing the name is the last step, only after every
 * one of these failed, and that failure is logged loudly with its reason.
 *
 * Everything is read out of HTTP responses, the scan log, the error log and
 * the photos folder. No socket leaves this machine: Open Food Facts gets the
 * module's own fetch double, the range ask and the pack read each get a fake
 * `Provider` that counts its calls. The catalogue is a real in-memory one.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-scan-never-empty-'));
const scansPath = join(dir, 'scans.db');
const photosDir = join(dir, 'photos');

process.env.SHIN_SCANS = scansPath;
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = photosDir;
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = join(dir, 'prices.db');
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.SHIN_PACK_READ_STORE_PATH = join(dir, 'pack-read.json');
process.env.PORT = '0';
process.env.SHIN_CATALOGUE_FIRST = '1';
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

const OFF_HIT = withCheck('006210000001'); // Open Food Facts knows it, the catalogue does not
const OFF_HIT_PREVIEW = withCheck('006210000002');
const READ_OK = withCheck('006210000003'); // nobody knows it; Claude reads the pack
const READ_FAIL = withCheck('006210000004');
const READ_CAP = withCheck('006210000005');
const READ_NOKEY = withCheck('006210000006');
const OLD_CLIENT = withCheck('006210000007');
const CONSENT_NO = withCheck('006210000008');
const CONSENT_YES = withCheck('006210000009');
const IN_CATALOGUE = withCheck('006700010001');
/** READ_OK with its last digit changed: the check digit fails, a misread. */
const MISREAD = READ_OK.slice(0, -1) + String((Number(READ_OK.slice(-1)) + 1) % 10);

/** The smallest real JPEG header the server's own `imageKind` accepts. */
const FRAME = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]).toString('base64');

/* ------------------------------------------------------------ fixtures */

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const catDb = openCatalogue(':memory:');
catDb
  .prepare(`INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value, size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
            VALUES (?, 'Cola Classic', 'Cola Classic', NULL, 'Fizzco', '2 L', 2000, 'ml', '["en:beverages","en:colas"]', 'en:colas', '[]', 1, 'test')`)
  .run(IN_CATALOGUE);
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

/* ------------------------------------------------- the doubles */

const OFF_KNOWS: Record<string, { product_name: string; brands: string; quantity: string }> = {
  [OFF_HIT]: { product_name: 'Oreo Chocolate Sandwich Cookies', brands: 'Oreo', quantity: '303 g' },
  [OFF_HIT_PREVIEW]: { product_name: 'Oreo Golden', brands: 'Oreo', quantity: '303 g' },
};
const offCalls: string[] = [];

const rangeAsks: string[] = [];
const rangeAskProvider = {
  name: 'fake-claude-range',
  async send<T>(req: { user: string }) {
    rangeAsks.push(req.user);
    return {
      value: { known: true, low_cents: 349, high_cents: 549, currency: 'CAD', unit: 'one 303 g pack', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};

interface PackCall {
  model: string;
  images: number;
  hasTools: boolean;
  grounding: unknown;
}
const packCalls: PackCall[] = [];
let packMode: 'ok' | 'throw' = 'ok';
const packReadProvider = {
  name: 'fake-claude-pack',
  async send<T>(req: Record<string, unknown>) {
    packCalls.push({
      model: String(req.model),
      images: Array.isArray(req.images) ? req.images.length : -1,
      hasTools: 'tools' in req,
      grounding: req.grounding,
    });
    if (packMode === 'throw') throw Object.assign(new Error('overloaded'), { status: 529 });
    return {
      value: { known: true, name: 'Sea Salt Coconut Sandwich Cookies', brand: 'Oreo', size: '97 g' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};

const errorLines: Record<string, unknown>[] = [];

/* -------------------------------------------------------------- server */

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
    offCalls.push(code);
    const known = OFF_KNOWS[code];
    if (!known) return { ok: false, status: 404, json: async () => ({ status: 0 }) };
    return { ok: true, status: 200, json: async () => ({ code, product: { code, ...known } }) };
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

async function identify(gtin: string, extra = '', device = 'sne-test'): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/api/identify?gtin=${gtin}&deviceId=${device}&countryCode=CA${extra}`);
  assert.equal(r.status, 200, `/api/identify answered ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

async function sendFrame(gtin: string, device = 'sne-test', frame: string | null = FRAME): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${base}/api/identify/pack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gtin, deviceId: device, countryCode: 'CA', ...(frame ? { frame } : {}) }),
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

function scanCount(): number {
  if (!existsSync(scansPath)) return 0;
  const db = new DatabaseSync(scansPath, { readOnly: true });
  try {
    return (db.prepare('SELECT count(*) AS n FROM scan').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

function photoFiles(): string[] {
  return existsSync(photosDir) ? readdirSync(photosDir) : [];
}

/** The loud line for a scan that ended with typing, for one barcode. */
function noNameLine(gtin: string): Record<string, unknown> | undefined {
  return errorLines.find((l) => l.where === 'identify.no_name' && (l.detail as Record<string, unknown> | undefined)?.gtin === gtin);
}

/* -------------------------------------------------------------- tests */

test('a catalogue miss that Open Food Facts knows is named by Open Food Facts and priced by the ordinary ladder', async () => {
  const asks = rangeAsks.length;
  const body = await identify(OFF_HIT);
  assert.notEqual(body.outcome, 'not_in_catalogue', 'Open Food Facts knows this barcode and the answer still said "not found"');
  assert.equal(body.offerManualEntry, false, 'typing the name was offered although Open Food Facts named the item');
  assert.equal(body.outcome, 'named_outside_catalogue');
  assert.equal(body.identitySource, 'open_food_facts', 'the name is not labelled as coming from Open Food Facts');
  const identity = body.identity as Record<string, unknown> | null;
  assert.ok(identity, 'no identity came back for a barcode Open Food Facts names');
  assert.equal(identity.name, 'Oreo Chocolate Sandwich Cookies');
  assert.equal(identity.brand, 'Oreo');
  assert.equal(identity.size, '303 g');
  assert.ok(offCalls.includes(OFF_HIT), 'Open Food Facts was never asked about the barcode');
  // Pexi holds no price for it, so the price ladder ends in the one capped Claude range ask.
  assert.equal(rangeAsks.length - asks, 1, 'the named item did not take the price ladder down to the Claude range ask');
  assert.match(rangeAsks[rangeAsks.length - 1]!, /Product: Oreo Chocolate Sandwich Cookies/);
  assert.ok(body.verdict || body.range, 'the named item came back with neither a verdict nor a range');
  assert.equal(packCalls.length, 0, 'the frame reader was asked although Open Food Facts named the item');
  const row = scanRow(body.scanId);
  assert.equal(row.outcome, 'answered', 'the scan row says the scan was refused');
  assert.equal(row.answer_path, 'open_food_facts');
  assert.match(String(row.resolved_label), /Oreo/);
});

test('preview=1 names an Open Food Facts item for the price pad, free: no scan row, no Claude of any kind', async () => {
  const rows = scanCount();
  const asks = rangeAsks.length;
  const packs = packCalls.length;
  const body = await identify(OFF_HIT_PREVIEW, '&preview=1');
  assert.equal(body.preview, true);
  const identity = body.identity as Record<string, unknown> | null;
  assert.ok(identity, 'the price pad would show digits: the preview named nothing although Open Food Facts knows the item');
  assert.equal(identity.name, 'Oreo Golden');
  assert.equal(body.identitySource, 'open_food_facts');
  assert.equal(scanCount(), rows, 'a preview wrote a scan row');
  assert.equal(rangeAsks.length, asks, 'a preview made the paid range ask');
  assert.equal(packCalls.length, packs, 'a preview sent a frame to Claude');
});

test('a full miss from a client that holds a frame is asked for it, and writes no scan row until the frame arrives', async () => {
  const rows = scanCount();
  const body = await identify(READ_OK, '&canSendFrame=1');
  assert.equal(body.outcome, 'frame_wanted', 'the server did not ask for the frame although the catalogue and Open Food Facts both missed');
  assert.equal(body.offerManualEntry, false, 'typing was offered before the frame was tried');
  assert.equal(scanCount(), rows, 'the frame request wrote a scan row, so one scan would count twice');
  assert.equal(packCalls.length, 0, 'Claude was called before any frame was sent');
});

test('the frame goes to the cheapest Claude with no tools, and the name it reads takes the price ladder', async () => {
  const packs = packCalls.length;
  const asks = rangeAsks.length;
  const r = await sendFrame(READ_OK);
  assert.equal(r.status, 200, `the frame route answered ${r.status}: ${JSON.stringify(r.body)}`);
  const body = r.body;
  assert.equal(packCalls.length - packs, 1, 'the frame was not sent to Claude exactly once');
  const call = packCalls[packCalls.length - 1]!;
  assert.equal(call.images, 1, 'Claude was not sent exactly one frame');
  assert.equal(call.hasTools, false, 'a tools key went to Claude: it must never be offered web search');
  assert.equal(call.grounding, undefined, 'the frame read asked for grounding');
  assert.equal(call.model, 'claude-haiku-4-5-20251001', 'the frame read is not on the cheapest Claude');
  assert.equal(body.outcome, 'named_outside_catalogue', `the frame read did not name the item: ${JSON.stringify(body)}`);
  assert.equal(body.identitySource, 'claude_reading', "the name is not labelled as Claude's reading");
  assert.equal(body.offerManualEntry, false);
  assert.equal((body.identity as Record<string, unknown>).name, 'Sea Salt Coconut Sandwich Cookies');
  assert.equal(rangeAsks.length - asks, 1, 'the name Claude read did not take the price ladder down to the range ask');
  assert.match(rangeAsks[rangeAsks.length - 1]!, /Product: Sea Salt Coconut Sandwich Cookies/);
  const row = scanRow(body.scanId);
  assert.equal(row.outcome, 'answered');
  assert.equal(row.answer_path, 'claude_reading');
});

test('the second scan of a barcode Claude already read uses the saved reading: zero Claude reads', async () => {
  const packs = packCalls.length;
  const body = await identify(READ_OK, '&canSendFrame=1');
  assert.equal(body.outcome, 'named_outside_catalogue', 'a barcode Claude already read was not named from the saved reading');
  assert.equal(body.identitySource, 'claude_reading');
  assert.equal((body.identity as Record<string, unknown>).name, 'Sea Salt Coconut Sandwich Cookies');
  assert.equal(packCalls.length, packs, 'a barcode already read sent its frame to Claude again');
});

test('a misread (check digit fails) with a frame is read off the pack, never answered "not found"', async () => {
  const packs = packCalls.length;
  const r = await sendFrame(MISREAD, 'sne-misread');
  assert.equal(r.status, 200, `the frame route answered ${r.status}`);
  assert.notEqual(r.body.failure, 'invalid_barcode', 'a misread with a frame was answered as an invalid barcode');
  assert.notEqual(r.body.outcome, 'not_in_catalogue', 'a misread was answered "not found"');
  assert.equal(r.body.outcome, 'named_outside_catalogue');
  assert.equal(r.body.identitySource, 'claude_reading');
  assert.equal(packCalls.length - packs, 1, 'a misread frame was not read once (a misread has no saved reading to use)');
});

for (const [label, gtin, setUp, reason] of [
  ['Claude fails', READ_FAIL, () => { packMode = 'throw'; }, 'claude_model_error'],
  ['the monthly cap is reached', READ_CAP, () => { process.env.SHIN_PACK_READ_MONTHLY_CAP = '0'; }, 'claude_monthly_cap_reached'],
  ['there is no Claude key', READ_NOKEY, () => {
    setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: rangeAskProvider as never, claudeWaitMs: 2000 } as never);
    process.env.ANTHROPIC_API_KEY = '';
  }, 'claude_no_api_key'],
] as const) {
  test(`${label}: typing the name is offered AND the failure is logged loudly with its reason`, async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    setUp();
    try {
      const r = await sendFrame(gtin, 'sne-fail');
      assert.equal(r.status, 200, `the frame route answered ${r.status}`);
      assert.equal(r.body.outcome, 'not_in_catalogue');
      assert.equal(r.body.offerManualEntry, true, `after every step failed (${label}) typing the name was not offered: the scan ended with nothing`);
      const reasons = r.body.noNameReasons as string[] | undefined;
      assert.ok(Array.isArray(reasons), 'the answer does not say why nothing named the item');
      assert.ok(reasons.includes('off_not_found'), `the Open Food Facts miss is missing from the reasons: ${JSON.stringify(reasons)}`);
      assert.ok(reasons.includes(reason), `the Claude failure "${reason}" is missing from the reasons: ${JSON.stringify(reasons)}`);
      const line = noNameLine(gtin);
      assert.ok(line, `no loud error line was logged for a scan that ended with typing (${label})`);
      assert.match(String((line.detail as Record<string, unknown>).reasons), new RegExp(reason), 'the logged line does not carry the reason');
      const row = scanRow(r.body.scanId);
      assert.equal(row.outcome, 'refused');
      assert.match(String(row.range_miss_reason), new RegExp(reason), 'the scan row does not record why nothing named the item');
    } finally {
      packMode = 'ok';
      delete process.env.SHIN_PACK_READ_MONTHLY_CAP;
      if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = savedKey;
      setCatalogueFirstForTests({
        searcher: catalogue,
        db: catDb,
        rangeAskProvider: rangeAskProvider as never,
        packReadProvider: packReadProvider as never,
        claudeWaitMs: 2000,
      } as never);
    }
  });
}

test('a client that cannot send a frame still gets typing, and the reason (no frame) is logged loudly', async () => {
  const body = await identify(OLD_CLIENT);
  assert.equal(body.outcome, 'not_in_catalogue');
  assert.equal(body.offerManualEntry, true);
  assert.deepEqual(body.noNameReasons, ['off_not_found', 'no_frame']);
  const line = noNameLine(OLD_CLIENT);
  assert.ok(line, 'a scan that ended with typing for want of a frame was not logged');
  const row = scanRow(body.scanId);
  assert.match(String(row.range_miss_reason), /no_frame/);
});

test('the frame is written to disk only with photo consent (and is written with it, so the check can fail)', async () => {
  const before = photoFiles().length;
  const no = await sendFrame(CONSENT_NO, 'sne-no-consent');
  assert.equal(no.status, 200);
  assert.equal(photoFiles().length, before, 'the frame was written to disk for a device that never consented to photos');
  assert.equal(scanRow(no.body.scanId).photo_path, null);
  const c = await fetch(`${base}/api/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: 'sne-consent', photos: true, location: false }),
  });
  assert.equal(c.status, 200);
  const yes = await sendFrame(CONSENT_YES, 'sne-consent');
  assert.equal(yes.status, 200);
  assert.equal(photoFiles().length, before + 1, 'control failed: a consenting device kept no frame, so the check above proves nothing');
  assert.equal(typeof scanRow(yes.body.scanId).photo_path, 'string');
});

test('the frame route refuses a body with no frame, and a catalogue hit never reaches it', async () => {
  const r = await sendFrame(IN_CATALOGUE, 'sne-test', null);
  assert.equal(r.status, 400, 'a frame route call with no frame was accepted');
  const hit = await identify(IN_CATALOGUE, '&canSendFrame=1');
  assert.equal(hit.outcome, 'catalogue_hit', 'a catalogue hit was asked for its frame');
});
