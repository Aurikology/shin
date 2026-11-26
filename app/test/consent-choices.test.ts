/**
 * Legal review 2026-11-26, A G1 to G3 (Apple 5.1.1(ii), 5.1.2(i), Quebec P-39.1 s.14): two optional choices, both
 * off until the shopper says yes, both stored with a time, both enforced by the SERVER rather than trusted to the
 * phone. Read out of HTTP responses, with a fake Claude that counts its calls.
 *
 *  - "Help improve Pexi" (`improve`): without a stored yes, a usage event is not kept; a yes keeps it; a
 *    withdrawal stops it again. The record of a choice itself is always kept.
 *  - Typed words to Claude (`aiText`): without a stored yes, a typed search sends nothing to Claude and is
 *    still answered from Pexi's own data; a yes lets it ask; "not now" (false) stops it again.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-consent-choices-'));
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.SHIN_PRICES = join(dir, 'prices.db');
process.env.SHIN_RANGE_ASK_STORE_PATH = join(dir, 'range-ask.json');
process.env.PORT = '0';
process.env.SHIN_CATALOGUE_FIRST = '1';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_RANGE_ASK_MONTHLY_CAP;
delete process.env.SHIN_RANGE_ASK_CEILING_CENTS;
delete process.env.SHIN_FREE_SCANS_PER_WEEK;
delete process.env.ANTHROPIC_API_KEY;
process.env.GEMINI_API_KEY = 'test-key-never-sent';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');
const { openPrices } = await import('../../price/src/store.ts');
const { readConsent, DEFAULT_CONSENT } = await import('../src/consent.ts');
openPrices(process.env.SHIN_PRICES!).close();

const NAME = 'zorbo fizz cola two litre';
const catDb = openCatalogue(':memory:');
const insert = catDb.prepare(`
  INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
    size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
  VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
insert.run('0627990010033', NAME, NAME, 'Zorbo', '2 L', 2000, 'ml', '["en:beverages","en:sodas","en:colas"]', 'en:colas');
rebuildFts(catDb);
rebuildCategories(catDb);
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

const asked: string[] = [];
const rangeAskProvider = {
  name: 'fake-claude-range',
  async send(req: { user: string }) {
    asked.push(req.user);
    return {
      value: { known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'one 2 L bottle', confidence: 'medium' },
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-test',
    };
  },
};

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  // `requireClaudeConsent: true` is the real check on the phone's header; the typed-words choice is checked
  // on top of it, so every typed search below carries the header the phone sends after accepting.
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: rangeAskProvider as never, requireClaudeConsent: true });
});
after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  delete process.env.SHIN_CATALOGUE_FIRST;
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows keeps the sqlite file locked. */
  }
});

const postJson = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const typed = async (device: string, text = NAME) => {
  const r = await fetch(
    `${base}/api/identify?text=${encodeURIComponent(text)}&countryCode=CA&region=Ontario&deviceId=${device}`,
    { headers: { 'x-shin-claude': '1' } },
  );
  assert.equal(r.status, 200);
  return (await r.json()) as Record<string, any>;
};
const event = async (device: string, type: string) =>
  (await (await postJson('/api/event', { deviceId: device, type, payload: {} })).json()) as { stored: boolean };

test('the stored columns start empty: a new device has no choice on file and reads as no', () => {
  assert.equal(DEFAULT_CONSENT.improve, false);
  assert.equal(DEFAULT_CONSENT.aiText, null);
  assert.equal(readConsent('never-seen-device').improve, false);
  assert.equal(readConsent('never-seen-device').aiText, null);
});

test('typed words: no stored yes sends nothing to Claude, and the shopper still gets an answer', async () => {
  const device = 'choices-typed-1';
  const before = asked.length;
  const body = await typed(device);
  assert.equal(asked.length, before, 'typed words went to Claude with no stored yes');
  assert.ok(body && (body.range || body.product || body.reason || body.kind), 'no answer at all came back');
});

test('typed words: the stored yes lets a typed search ask, and not now stops it again', async () => {
  const device = 'choices-typed-2';
  const stored = (await (await postJson('/api/consent', { deviceId: device, aiText: true })).json()) as { stored: boolean };
  assert.equal(stored.stored, true);
  const c = readConsent(device);
  assert.equal(c.aiText, true);
  assert.equal(typeof c.aiTextAt, 'string', 'the yes carries its time');
  assert.equal(c.photos, false, 'a choices-only body rewrote the photos answer');
  const before = asked.length;
  await typed(device, `${NAME} again`);
  assert.equal(asked.length, before + 1, 'the stored yes changed nothing, so the no above could never have failed');
  assert.ok(asked.at(-1)?.includes('zorbo'), 'the typed words were not what was sent');

  await postJson('/api/consent', { deviceId: device, aiText: false });
  assert.equal(readConsent(device).aiText, false);
  const mid = asked.length;
  await typed(device, `${NAME} third`);
  assert.equal(asked.length, mid, 'Not now still sent typed words to Claude');
});

test('typed words: another device cannot use this device\'s yes', async () => {
  await postJson('/api/consent', { deviceId: 'choices-typed-yes', aiText: true });
  const before = asked.length;
  await typed('choices-typed-other', `${NAME} fourth`);
  assert.equal(asked.length, before);
});

test('typed words: a request with no device id is never a yes', async () => {
  const before = asked.length;
  const r = await fetch(`${base}/api/identify?text=${encodeURIComponent(`${NAME} fifth`)}&countryCode=CA`, { headers: { 'x-shin-claude': '1' } });
  assert.equal(r.status, 200);
  assert.equal(asked.length, before);
});

test('improve: without the yes a usage event is not kept', async () => {
  const device = 'choices-improve-1';
  assert.equal((await event(device, 'screen_opened')).stored, false);
  const batch = await postJson('/api/events/batch', { events: [{ deviceId: device, type: 'screen_opened' }] });
  const out = (await batch.json()) as { stored: number; dropped: number };
  assert.equal(out.stored, 0);
  assert.equal(out.dropped, 1);
});

test('improve: the yes keeps events, the withdrawal stops them, each with its time', async () => {
  const device = 'choices-improve-2';
  await postJson('/api/consent', { deviceId: device, improve: true });
  assert.equal(readConsent(device).improve, true);
  assert.equal(typeof readConsent(device).improveAt, 'string');
  assert.equal((await event(device, 'screen_opened')).stored, true, 'the yes did not turn recording on');
  const batch = await postJson('/api/events/batch', { events: [{ deviceId: device, type: 'screen_opened' }] });
  assert.equal(((await batch.json()) as { stored: number }).stored, 1);

  await postJson('/api/consent', { deviceId: device, improve: false });
  assert.equal(readConsent(device).improve, false);
  assert.equal((await event(device, 'screen_opened')).stored, false, 'a withdrawn yes still recorded usage');
});

test('improve: the record of a choice itself is kept even with usage off', async () => {
  const device = 'choices-improve-3';
  assert.equal((await event(device, 'agreement')).stored, true);
});

test('accepting the terms does not turn either choice on', async () => {
  const device = 'choices-accept-1';
  await postJson('/api/consent', { deviceId: device, accepted: true, photos: true, location: true, improve: false });
  const c = readConsent(device);
  assert.equal(c.photos, true);
  assert.equal(c.improve, false);
  assert.equal(c.aiText, null, 'accepting the terms answered the typed-words notice');
  assert.equal((await event(device, 'screen_opened')).stored, false);
});

test('a choice that is not a plain true or false changes nothing', async () => {
  const device = 'choices-junk-1';
  await postJson('/api/consent', { deviceId: device, improve: 'yes', aiText: 1 });
  assert.equal(readConsent(device).improve, false);
  assert.equal(readConsent(device).aiText, null);
});
