/**
 * D04: ONE ANSWER FOR ONE PRODUCT, WHETHER THE SHOPPER SCANS IT OR TYPES IT.
 *
 * docs/verdict-distribution-design-2026-09-30.md cases 7 and 8 and RULINGS.md
 * "A scanned barcode answers with Pexi's own prices too": a typed name that
 * resolves to a catalogue product is answered exactly as that product's
 * barcode, and one that matches nothing is answered from the typed words.
 *
 * Found on 2026-10-06 against the real catalogue: barcode 055773000795 at $5.49
 * answered "reasonable" while "McCain Tasti Taters" at $5.49 answered "bad",
 * because the typed route priced the product without its catalogue category and
 * so sat it in another category with another centre and spread. The fixture
 * below has the same shape: one product held twice (a bare row and a sized row
 * with a category), a category of priced siblings, and a product with its own
 * price. Everything is read out of HTTP responses; no model is called.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'shin-typed-parity-'));

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
process.env.GEMINI_API_KEY = 'test-key-never-sent';

function withCheck(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

const TATERS_SIZED = withCheck('062699001001'); // "Tasti Tater's" 800 g, in a category
const TATERS_BARE = withCheck('062699001002'); // "Tasti Taters", no size, no category
const FRIES = ['062699001010', '062699001011', '062699001012', '062699001013', '062699001014'].map(withCheck);
const WEDGES = withCheck('062699001020'); // a shop prices this one itself
const COLA_A = withCheck('062699001030');
const COLA_B = withCheck('062699001031');
const FRIES_PATH = '["en:frozen-foods","en:frozen-fried-potatoes"]';
const COLA_PATH = '["en:beverages","en:sodas","en:colas"]';

const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
const { rebuildCategoriesFromPaths: rebuildCategories } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
const { Catalogue } = await import('../../catalogue/src/search.ts');

const catDb = openCatalogue(':memory:');
{
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  insert.run(TATERS_SIZED, "Tasti Tater's", "Tasti Tater's", 'McCain', '800g', 800, 'g', FRIES_PATH, 'en:frozen-fried-potatoes');
  insert.run(TATERS_BARE, 'Tasti Taters', 'Tasti Taters', 'McCain', null, null, null, '[]', null);
  FRIES.forEach((code, i) => insert.run(code, `Crinkle Fries Number ${i}`, `Crinkle Fries Number ${i}`, `Frost${i}`, '750 g', 750, 'g', FRIES_PATH, 'en:frozen-fried-potatoes'));
  insert.run(WEDGES, 'Crispy Wedges', 'Crispy Wedges', 'Spudco', '1 kg', 1000, 'g', FRIES_PATH, 'en:frozen-fried-potatoes');
  insert.run(COLA_A, 'Cola Classic', 'Cola Classic', 'Fizzco', '2 L', 2000, 'ml', COLA_PATH, 'en:colas');
  insert.run(COLA_B, 'Cola Zero', 'Cola Zero', 'Fizzco', '2 L', 2000, 'ml', COLA_PATH, 'en:colas');
  rebuildFts(catDb);
  rebuildCategories(catDb);
}
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

const today = new Date().toISOString().slice(0, 10);
const { openPrices, recordObservation } = await import('../../price/src/store.ts');
{
  const prices = openPrices(process.env.SHIN_PRICES!);
  let sku = 0;
  const price = (code: string, seller: string, cents: number, name = 'Item') =>
    recordObservation(prices, {
      code,
      seller,
      sellerSku: `SKU-${(sku += 1)}`,
      sellerName: name,
      sellerBrand: null,
      priceCents: cents,
      kind: 'regular',
      unitPriceCents: null,
      unitLabel: null,
      currency: 'CAD',
      country: 'CA',
      region: 'British Columbia',
      joinMethod: 'gtin',
      seenOn: today,
      url: null,
      imageUrl: null,
      inStock: null,
      storeName: `${seller} store`,
      storeCity: 'Victoria',
      basePriceCents: null,
    });
  [350, 420, 480, 550, 690].forEach((c, i) => price(FRIES[i]!, `shop${i}`, c));
  price(WEDGES, 'shopw', 899, 'Crispy Wedges 1 kg');
  prices.close();
}

const fakeClaude = {
  name: 'fake-claude-range',
  async send<T>() {
    return {
      value: { known: true, low_cents: 299, high_cents: 599, currency: 'CAD', unit: 'one pack', confidence: 'medium' } as T,
      usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    };
  },
};

const { server, setCatalogueForTests, setCatalogueFirstForTests } = await import('../server.ts');
const { resolveTypedName } = await import('../src/catalogue-first.ts');

let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setCatalogueForTests(catalogue);
  setCatalogueFirstForTests({ searcher: catalogue, db: catDb, rangeAskProvider: fakeClaude as never });
});

after(async () => {
  setCatalogueForTests(null);
  setCatalogueFirstForTests(null);
  delete process.env.SHIN_CATALOGUE_FIRST;
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

async function get(path: string): Promise<Record<string, any>> {
  const r = await fetch(`${base}${path}`);
  assert.equal(r.status, 200, path);
  return (await r.json()) as Record<string, any>;
}

const market = 'countryCode=CA&region=British%20Columbia&deviceId=typed-parity';
const byBarcode = (gtin: string, cents: number) => get(`/api/identify?gtin=${gtin}&shelfPriceCents=${cents}&${market}`);
const byName = (text: string, cents: number) => get(`/api/identify?text=${encodeURIComponent(text)}&shelfPriceCents=${cents}&${market}`);

/** The same shelf prices the real check used, bracketed wide enough to cross every zone. */
const SHELF_CENTS = [149, 299, 399, 449, 499, 549, 599, 699, 799, 999, 1299, 2499];

async function sameAnswer(text: string, gtin: string): Promise<string[]> {
  const words: string[] = [];
  for (const cents of SHELF_CENTS) {
    const barcode = await byBarcode(gtin, cents);
    const typed = await byName(text, cents);
    assert.ok(barcode.verdict, `barcode ${gtin} at ${cents} carried no verdict`);
    assert.ok(typed.verdict, `"${text}" at ${cents} carried no verdict`);
    const at = `"${text}" vs ${gtin} at ${cents}`;
    assert.equal(typed.verdict.shopper.zone, barcode.verdict.shopper.zone, `word differs, ${at}`);
    assert.equal(typed.verdict.centreCents, barcode.verdict.centreCents, `centre differs, ${at}`);
    assert.equal(typed.verdict.basis, barcode.verdict.basis, `basis differs, ${at}`);
    // Everything else the bell draws from: spread, ends, thresholds, notes, dots.
    assert.deepEqual(typed.verdict, barcode.verdict, `verdict differs, ${at}`);
    words.push(`${typed.verdict.shopper.zone}/${barcode.verdict.shopper.zone}`);
  }
  return words;
}

test('D04: a typed name that names a product held under two spellings answers as that product\'s barcode, at every shelf price', async () => {
  const words = await sameAnswer('McCain Tasti Taters', TATERS_SIZED);
  // The control: the answer is not one word repeated, so a match of centre and spread is a real match.
  assert.ok(new Set(words.map((w) => w.split('/')[0])).size >= 3, `the shelf prices did not cross zones: ${words.join(' ')}`);
});

test('D04: a typed name for a product a shop prices itself answers as its barcode, at every shelf price', async () => {
  await sameAnswer('Spudco Crispy Wedges', WEDGES);
  const typed = await byName('Spudco Crispy Wedges', 799);
  assert.equal(typed.verdict.basis, 'own_prices');
});

test('D04: the typed answer carries the top three candidates and says how it chose', async () => {
  const typed = await byName('McCain Tasti Taters', 549);
  assert.equal(typed.resolvedBy, 'covers_all_words_no_rival');
  assert.equal(typed.ownMatch.code, TATERS_SIZED);
  assert.ok(Array.isArray(typed.pickCandidates) && typed.pickCandidates.length >= 2 && typed.pickCandidates.length <= 3);
  const codes = typed.pickCandidates.map((c: { barcode: string }) => c.barcode);
  assert.ok(codes.includes(TATERS_SIZED) && codes.includes(TATERS_BARE), `candidates were ${codes.join(', ')}`);
  for (const c of typed.pickCandidates) for (const k of ['barcode', 'name', 'brand', 'size', 'category']) assert.ok(k in c, `${k} missing`);
});

test('D04 case 7: two different products carry the typed words, so no pick is made for the shopper, and the candidates are offered', async () => {
  const typed = await byName('Fizzco Cola', 399);
  assert.equal(typed.resolvedBy, null);
  const codes = typed.pickCandidates.map((c: { barcode: string }) => c.barcode).sort();
  assert.deepEqual(codes, [COLA_A, COLA_B].sort());
  assert.ok(typed.verdict, 'an ambiguous typed name still answers, from the typed words');
});

test('D04 case 8: a typed name that matches nothing answers from the typed words alone', async () => {
  const typed = await byName('zzqxv blorfle', 399);
  assert.equal(typed.resolvedBy, null);
  assert.deepEqual(typed.pickCandidates, []);
  assert.ok(typed.verdict, 'it still answers');
  assert.equal(typed.ownMatch, undefined, 'it named no product');
});

test('resolveTypedName: the rule, on its own', () => {
  const row = (code: string, name: string, brands: string | null, quantity: string | null = null) => ({ code, name, brands, quantity });
  const twin = [row('1', "Tasti Tater's", 'McCain', '800g'), row('2', 'Tasti Taters', 'McCain')];
  assert.equal(resolveTypedName('McCain Tasti Taters', twin, 'ambiguous').row?.code, '1');
  const rivals = [row('1', 'Cola Classic', 'Fizzco'), row('2', 'Cola Zero', 'Fizzco')];
  assert.equal(resolveTypedName('Fizzco Cola', rivals, 'ambiguous').rule, 'ambiguous');
  assert.equal(resolveTypedName('Fizzco Cola', rivals, 'confident').rule, 'search_confident');
  // The top row must carry every typed word: a near miss is a guess, not a resolution.
  assert.equal(resolveTypedName('McCain Tasti Taters Large', twin, 'ambiguous').rule, 'ambiguous');
  assert.equal(resolveTypedName('anything', [], 'miss').rule, 'no_match');
});
