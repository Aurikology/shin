/**
 * The replay's price-tree variants (price/src/claude-share.ts, --tree), on a small world:
 * a scan whose own price is missing and whose category holds priced items ends at the tree rung;
 * a scan with no category data falls through to the next rung as before; and without the
 * tree option the output is the two variants it always was.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { measure } from '../src/claude-share.ts';
import { openCatalogue } from '../../catalogue/src/schema.ts';
import { recordObservation } from '../src/store.ts';
import { buildWorld, obs, WINES, WINE_CODES } from '../../app/test/range-world.ts';

// Valid GTIN-13 check digits (canonicalBarcode refuses a bad one and the scan would not be replayed).
const UNPRICED_RED = '0626990000051';
const LONELY_UNPRICED = '0626990000044';
const NO_CATEGORY = '0626990000068';

/** The world's products copied into a catalogue of the real schema (the replay's Catalogue class reads columns range-world's does not make). */
function world() {
  const w = buildWorld();
  // The tree links chains through items sold at both and leaves an unlinked chain out (price-tree.ts), so
  // every wine is also priced at two shared chains; the world's one-shop-per-item prices would link nothing.
  const wide = [718, 1299, 2450, 3199, 4999, 8999, 14249];
  WINE_CODES.forEach((code, i) => {
    recordObservation(w.prices, obs({ code, priceCents: wide[i]!, seller: 'linkA' }));
    recordObservation(w.prices, obs({ code, priceCents: Math.round(wide[i]! * 1.05), seller: 'linkB' }));
  });
  const catalogue = openCatalogue(':memory:');
  const ins = catalogue.prepare(
    'INSERT INTO product (code, name, brands, quantity, category_path, leaf_category, source, sold_in_canada) VALUES (?,?,?,?,?,?,?,1)',
  );
  for (const r of w.catalogue.prepare('SELECT code, name, brands, quantity, category_path, leaf_category, source FROM product').all() as Record<string, string | null>[]) {
    ins.run(r.code!, r.name!, r.brands ?? null, r.quantity ?? null, r.category_path!, r.leaf_category ?? null, r.source!);
  }
  ins.run(UNPRICED_RED, 'Unpriced Red', 'Somebody', '750 ml', JSON.stringify(WINES), WINES[WINES.length - 1]!, 'openfoodfacts');
  ins.run(LONELY_UNPRICED, 'Lip Balm', 'Nobody', '15 ml', JSON.stringify(['en:cosmetics', 'en:lonely-things']), 'en:lonely-things', 'openbeautyfacts');
  ins.run(NO_CATEGORY, 'Mystery Thing', null, null, '[]', null, 'openfoodfacts');
  const scans = new DatabaseSync(':memory:');
  scans.exec('CREATE TABLE scan (resolved_code TEXT, query_text TEXT, device_id TEXT, kind TEXT, scanned_at TEXT, is_demo INTEGER)');
  const s = scans.prepare("INSERT INTO scan (resolved_code, query_text, device_id, kind, scanned_at, is_demo) VALUES (?, NULL, 'phone-1', 'barcode', '2026-11-01', 0)");
  for (const code of [UNPRICED_RED, UNPRICED_RED, LONELY_UNPRICED, NO_CATEGORY]) s.run(code);
  return { prices: w.prices, catalogue, scans };
}

const run = (w: ReturnType<typeof world>, extra: { tree?: boolean; treeOverride?: null } = {}) =>
  measure({ scans: w.scans, prices: w.prices, catalogue: w.catalogue, since: '2000-01-01', region: 'ON', ...extra });

test('without --tree the replay is the two variants it always was, with no rung fields', async () => {
  const out = await run(world());
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.rungs === undefined));
  assert.equal(out[0]!.barcodes, 3);
  assert.equal(out[0]!.scans, 4);
});

test('with --tree: an unpriced item in a priced category ends at the tree rung, one with no category falls through', async () => {
  const out = await run(world(), { tree: true });
  assert.equal(out.length, 4);
  const [base, , withTree] = out;
  assert.match(withTree!.variant, /price tree/);
  assert.ok(base!.rungs && withTree!.rungs);
  const askedByBase = base!.askedScans;
  assert.ok(askedByBase >= 2, `today the wine scans reach the ask (${askedByBase})`);

  // The tree answers the wine (7 priced wines in its category): both of its scans, which no longer reach the ask.
  assert.equal(withTree!.rungs!.byRungScans.price_tree, 2);
  assert.equal(base!.askedScans - withTree!.askedScans, 2);
  assert.equal(base!.rungs!.byRungScans.price_tree, undefined);

  // The lonely balm and the item with no category data have no tree answer: they stay exactly where today's ladder put them.
  const others = (r: NonNullable<typeof base>) => Object.entries(r.rungs!.byRungScans).filter(([k]) => k !== 'price_tree' && !k.startsWith('claude_ask>'));
  const otherAsks = (r: NonNullable<typeof base>) => Object.entries(r.rungs!.byRungScans).filter(([k]) => k.startsWith('claude_ask>'));
  assert.deepEqual(others(withTree!), others(base!));
  assert.equal(otherAsks(withTree!).reduce((a, [, v]) => a + v, 0), withTree!.askedScans);

  // Every scan is accounted for in each variant.
  for (const r of [base!, withTree!]) assert.equal(Object.values(r.rungs!.byRungScans).reduce((a, b) => a + b, 0), r.scans);
});

test('with --tree and no tree to read, every scan falls through as before', async () => {
  const out = await run(world(), { tree: true, treeOverride: null });
  const [base, , withTree] = out;
  assert.equal(withTree!.askedBarcodes, base!.askedBarcodes);
  assert.deepEqual(withTree!.rungs!.byRungScans, base!.rungs!.byRungScans);
  assert.equal(withTree!.rungs!.byRungScans.price_tree, undefined);
});
