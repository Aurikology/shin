/**
 * An 8-digit code that passes both the UPC-E check and the EAN-8 check is read as a UPC-E first (Shin scans North
 * American shelves), and used to be read as nothing else: the expanded UPC-A went to the catalogue, the US index and
 * Open Food Facts, and a miss there was a miss, though the printed number may have been an EAN-8 all along.
 * Now the EAN-8 reading is retried, free steps only, before the shopper is told nothing was found.
 *
 * The three codes are real 8-digit shapes that pass both checks (counted with `canonicalBarcode` on 2026-11-26).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBarcode } from '../src/barcode.ts';
import { answerBarcodeFromCatalogue, catalogueHitIdentity, type BarcodeDeps } from '../src/catalogue-first.ts';

const DUAL: ReadonlyArray<readonly [string, string]> = [
  ['00007580', '000075000080'],
  ['06104696', '061046000096'],
  ['09141209', '091000004129'],
];

test('an 8-digit code valid as UPC-E and as EAN-8 is read as UPC-E and carries its EAN-8 reading', () => {
  for (const [eight, upca] of DUAL) {
    const c = canonicalBarcode(eight);
    assert.ok(c, `${eight} was not read as a barcode`);
    assert.equal(c.how, 'upc_e_expanded');
    assert.equal(c.gtin, upca);
    assert.deepEqual(c.alternate, { gtin: eight, how: 'as_read', variableMeasure: null });
  }
});

test('a code valid as only one of the two has no alternate', () => {
  // 07078004: valid UPC-E, fails the EAN-8 check. 96385074: valid EAN-8 with a prefix that is no UPC-E. Plus an EAN-13.
  for (const [raw, how] of [['07078004', 'upc_e_expanded'], ['96385074', 'as_read'], ['0068100084245', 'as_read']] as const) {
    const c = canonicalBarcode(raw);
    assert.ok(c, `${raw} was not read as a barcode`);
    assert.equal(c.how, how);
    assert.equal(c.alternate, undefined, `${raw} gained an alternate`);
  }
});

/* ---------------------------------------------------------------- the answer */

const row = (code: string, name: string) => ({ code, name, brands: null, quantity: null, leafCategory: null, categoryPath: [] as string[] });

function deps(catalogue: Record<string, ReturnType<typeof row>>, extra: Partial<BarcodeDeps> = {}): BarcodeDeps {
  return {
    lookup: { byGtin: (c: string) => catalogue[c] ?? null },
    prices: null,
    catalogue: null,
    country: 'US',
    currency: 'USD',
    asOf: '2026-11-26',
    ...extra,
  };
}

const EIGHT = '06104696';
const EXPANDED = '061046000096';

test('UPC-E expansion finds nothing, the EAN-8 reading is in the catalogue: the catalogue answers', async () => {
  const c = canonicalBarcode(EIGHT)!;
  const { answer } = await answerBarcodeFromCatalogue(c, deps({ [EIGHT]: row(EIGHT, 'Fixture Mint Candy') }));
  assert.equal(answer.outcome, 'catalogue_hit');
  assert.equal(answer.identity?.name, 'Fixture Mint Candy');
  assert.equal(answer.barcode, EIGHT);
});

test('the price pad preview names the EAN-8 row too', () => {
  const c = canonicalBarcode(EIGHT)!;
  const id = catalogueHitIdentity(c, { byGtin: (g: string) => (g === EIGHT ? row(EIGHT, 'Fixture Mint Candy') : null) });
  assert.equal(id?.name, 'Fixture Mint Candy');
  assert.equal(catalogueHitIdentity(c, { byGtin: () => null }), null);
});

test('a UPC-E expansion the catalogue holds wins; the EAN-8 reading is never asked', async () => {
  const asked: string[] = [];
  const c = canonicalBarcode(EIGHT)!;
  const { answer } = await answerBarcodeFromCatalogue(
    c,
    deps(
      { [EXPANDED]: row(EXPANDED, 'Upc E Product'), [EIGHT]: row(EIGHT, 'Ean 8 Product') },
      { nameElsewhere: async (g) => (asked.push(g), { ok: false, reasons: [], frameWanted: false }) },
    ),
  );
  assert.equal(answer.identity?.name, 'Upc E Product');
  assert.deepEqual(asked, []);
});

test('nothing holds the UPC-E expansion, a name source holds the EAN-8: it is named, by the free steps only', async () => {
  const calls: Array<[string, boolean]> = [];
  const c = canonicalBarcode(EIGHT)!;
  const { answer } = await answerBarcodeFromCatalogue(
    c,
    deps(
      {},
      {
        nameElsewhere: async (g, opts) => {
          calls.push([g, opts?.freeOnly === true]);
          return g === EIGHT
            ? { ok: true, named: { name: 'Fixture Mint Candy', brand: 'Fixtureco', size: '50 g', source: 'open_food_facts' } }
            : { ok: false, reasons: ['off_not_found'], frameWanted: true };
        },
      },
    ),
  );
  assert.equal(answer.outcome, 'named_outside_catalogue');
  assert.equal(answer.identitySource, 'open_food_facts');
  assert.equal(answer.identity?.name, 'Fixture Mint Candy');
  assert.deepEqual(calls, [
    [EXPANDED, false],
    [EIGHT, true],
  ]);
});

test('neither reading is found anywhere: the first reading answers as it always did, frame request included', async () => {
  const c = canonicalBarcode(EIGHT)!;
  const { answer } = await answerBarcodeFromCatalogue(
    c,
    deps({}, { nameElsewhere: async (_g, opts) => ({ ok: false, reasons: ['off_not_found'], frameWanted: opts?.freeOnly !== true }) }),
  );
  assert.equal(answer.outcome, 'frame_wanted', 'the retry replaced the first reading\'s request for the frame');
  assert.equal(answer.barcode, EXPANDED);
});

test('a code with no alternate makes exactly one name lookup', async () => {
  const asked: string[] = [];
  const c = canonicalBarcode('0068100084245')!;
  await answerBarcodeFromCatalogue(c, deps({}, { nameElsewhere: async (g) => (asked.push(g), { ok: false, reasons: [], frameWanted: false }) }));
  assert.equal(asked.length, 1);
});
