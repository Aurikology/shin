/**
 * D-261: the name a shopper reads, built once for search results and barcode lookups.
 *
 * Shoppers saw source titles as the feed wrote them: shop listings in capitals,
 * names with no brand or size, a word said twice where brand and name were
 * joined ("Gillette Clinical Deodorant Deodorant", "Lynx Deodorant Deodorant
 * 150ml"), a flag emoji and a trailing full stop. Nothing here is invented: a
 * brand or size the row does not carry is never added.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCatalogue, rebuildFts, EMBED_DIM } from '../src/schema.ts';
import { Catalogue } from '../src/search.ts';
import { shopperName, cleanSourceText } from '../src/display-name.ts';
import type { Embedder } from '../src/embed.ts';

const row = (name: string, brands: string | null = null, quantity: string | null = null, sizeValue: number | null = null, sizeUnit: string | null = null) =>
  ({ name, brands, quantity, sizeValue, sizeUnit });

test('a brand that ends with the name is not followed by the name again', () => {
  assert.equal(shopperName(row('Deodorant', 'Gillette Clinical Deodorant')), 'Gillette Clinical Deodorant');
  assert.equal(shopperName(row('Deodorant', 'Lynx Deodorant', '150ml')), 'Lynx Deodorant 150ml');
});

test('a name with the same long word twice in a row says it once', () => {
  assert.equal(shopperName(row('Deodorant Deodorant', 'Lynx', '150ml')), 'Lynx Deodorant 150ml');
  assert.equal(shopperName(row('Clinical Deodorant Deodorant', 'Gillette')), 'Gillette Clinical Deodorant');
  // Short doubled words are real names, not a feed's mistake.
  assert.equal(shopperName(row('Mahi Mahi Fillets', 'High Liner')), 'High Liner Mahi Mahi Fillets');
});

test('the brand leads when the name lacks it, and is not repeated when the name has it', () => {
  assert.equal(shopperName(row('Smooth Peanut Butter', 'Kraft', '1 kg')), 'Kraft Smooth Peanut Butter 1 kg');
  assert.equal(shopperName(row('Kraft Dinner Original', 'Kraft', '225 g')), 'Kraft Dinner Original 225 g');
  // Accent and case aside, the brand is already there (D-014).
  assert.equal(shopperName(row('HAAGEN-DAZS Strawberry Cheesecake Ice Cream', 'Häagen-Dazs', '450 ml')), 'HAAGEN-DAZS Strawberry Cheesecake Ice Cream 450 ml');
  // A comma list: any of its brands already in the name counts.
  assert.equal(shopperName(row('Honey Nut Cheerios', 'Plus, Cheerios', '430 g')), 'Honey Nut Cheerios 430 g');
});

test('the size is added when known and absent, and never written twice', () => {
  assert.equal(shopperName(row('Thompson Raisins, 600 Gram', 'Redland Farms', '600g')), 'Redland Farms Thompson Raisins, 600 Gram');
  assert.equal(shopperName(row('Black Bean Spaghetti 200 Gram', null, '200g')), 'Black Bean Spaghetti 200 Gram');
  assert.equal(shopperName(row('Coca-Cola 2L', 'Coca-Cola', '2 L')), 'Coca-Cola 2L');
  // From the stored size when the row has no quantity text.
  assert.equal(shopperName(row('Navel Oranges', 'Sunkist', null, 1360, 'g')), 'Sunkist Navel Oranges 1360 g');
  // A model number is not a size.
  assert.equal(shopperName(row('Model 1000 Blender', 'Ninja', '1000 ml')), 'Ninja Model 1000 Blender 1000 ml');
});

test('nothing is invented: no brand, no size, the name alone', () => {
  assert.equal(shopperName(row('Deodorant')), 'Deodorant');
});

test('a shop title in capitals reads in title case; short capitals and units stay', () => {
  assert.equal(shopperName(row('PINOT GRIS - VILLA MARIA PRIVATE BIN MARLBOROUGH')), 'Pinot Gris - Villa Maria Private Bin Marlborough');
  assert.equal(shopperName(row('PC BLUE MENU OATS 1KG')), 'PC Blue Menu Oats 1KG');
  assert.equal(shopperName(row('T&T BBQ PORK BUNS 6 X 60 G')), 'T&T BBQ Pork Buns 6 X 60 G');
  assert.equal(shopperName(row("KELLOGG'S CORN FLAKES", null, '510 g')), "Kellogg's Corn Flakes 510 g");
  // Deliberate casing is kept.
  assert.equal(shopperName(row('OREO Cookies', 'Oreo')), 'OREO Cookies');
  assert.equal(shopperName(row('iPhone 15 Case', 'Apple')), 'Apple iPhone 15 Case');
});

test('trailing punctuation and flag emoji are dropped', () => {
  assert.equal(shopperName(row('Red Leaf Lettuce, whole, fresh.')), 'Red Leaf Lettuce, whole, fresh');
  assert.equal(shopperName(row('Strawberries', 'Avery Family Farms 🇨🇦')), 'Avery Family Farms Strawberries');
  assert.equal(cleanSourceText('Maple Syrup 🇨🇦 -'), 'Maple Syrup');
});

const NO_EMBEDDER: Embedder = {
  id: 'test:none',
  dim: EMBED_DIM,
  embedPassages: async () => [],
  embedQuery: async () => new Float32Array(EMBED_DIM),
};

function catalogue(): Catalogue {
  const db = openCatalogue(':memory:');
  const insert = db.prepare(`
    INSERT INTO product (code, name, name_en, brands, quantity, category_path, allergens, sold_in_canada, source)
    VALUES (?, ?, ?, ?, ?, '[]', '[]', 1, 'test')`);
  insert.run('1000000000001', 'Deodorant', 'Deodorant', 'Lynx Deodorant', '150ml');
  insert.run('1000000000002', 'PINOT GRIS - VILLA MARIA PRIVATE BIN MARLBOROUGH', 'PINOT GRIS - VILLA MARIA PRIVATE BIN MARLBOROUGH', null, null);
  rebuildFts(db);
  return new Catalogue(db, NO_EMBEDDER, null);
}

test('a barcode lookup answers with the shopper name and keeps the raw one', () => {
  const hit = catalogue().byGtin('1000000000001');
  assert.equal(hit?.name, 'Lynx Deodorant 150ml');
  assert.equal(hit?.rawName, 'Deodorant');
});

test('a search result answers with the shopper name and keeps the raw one', async () => {
  const r = await catalogue().search({ text: 'pinot gris', vectors: false, recordMiss: false });
  assert.equal(r.candidates[0]?.name, 'Pinot Gris - Villa Maria Private Bin Marlborough');
  assert.equal(r.candidates[0]?.nameEn, 'Pinot Gris - Villa Maria Private Bin Marlborough');
  assert.equal(r.candidates[0]?.rawName, 'PINOT GRIS - VILLA MARIA PRIVATE BIN MARLBOROUGH');
});

// A name that reads like an advert is shortened for display (live scan log 2026-11-15, the Nutella case).
import { adShortName } from '../src/display-name.ts';

const NUTELLA_AD = 'Nutella BISCUITS, Golden Cookies Filled with Rich Hazelnut Spread, Pack of 20 Cookies 276g';

test('an advert-style name past 40 characters is brand, product and size', () => {
  assert.equal(adShortName(NUTELLA_AD, 'Nutella', '276 g'), 'Nutella Biscuits 276 g');
});

test('a name of 40 characters or fewer is left exactly as it is', () => {
  assert.equal(adShortName('Lynx Deodorant Spray 150ml', 'Lynx', '150 ml'), 'Lynx Deodorant Spray 150ml');
  assert.equal(adShortName('SHOUTED BUT SHORT NAME', 'Brand', null), 'SHOUTED BUT SHORT NAME');
});

test('a long name with nothing to cut at is left as it is', () => {
  const plain = 'Dove Men Care Antiperspirant Deodorant Stick Extra Fresh 48h Protection';
  assert.equal(adShortName(plain, 'Dove', '76 g'), plain);
});

test('the brand is added when the short product name does not carry it, and the size comes from the name when the row has none', () => {
  assert.equal(adShortName('GOLDEN COOKIES filled with rich hazelnut spread, pack of 20 cookies 276g', 'Nutella', null), 'Nutella Golden Cookies 276g');
});

test('a clause that is only the brand takes the next clause with it', () => {
  assert.equal(adShortName('Nutella, Hazelnut Spread with Cocoa, Family Size Jar for Breakfast 750g', 'Nutella', '750 g'), 'Nutella Hazelnut Spread 750 g');
});
