/**
 * Learned barcode links, decided 2026-11-15 (docs/decisions.md): a barcode the catalogue does not know, scanned,
 * then named by the shopper typing the product's name, is recorded by /api/scan-pick. Nothing reused it. Now the
 * identify path does, under one trust rule: 2 or more different devices picked the same product for the same
 * canonical barcode and no other product was picked as often; it never overrides a barcode the catalogue knows;
 * the answer says it came from shoppers' picks and is never sure.
 *
 * Real case: an orange's grower sticker decodes to 09354765000036, in no catalogue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scans = await import('../src/scans.ts');
const cf = await import('../src/catalogue-first.ts');

const STICKER = '09354765000036';
const ORANGE = '0000000094012';
const LEMON = '0000000094053';

scans.openScanStore(join(mkdtempSync(join(tmpdir(), 'shin-learned-')), 'scans.db'));

/** One device scans the sticker, then picks `code` from the typed-name list. */
function devicePicks(device: string, code: string, sticker = STICKER): void {
  const id = scans.recordScan({ deviceId: device, kind: 'barcode', query: sticker, outcome: 'refused', failureClass: 'not_in_catalogue' });
  assert.ok(id, 'the scan row was written');
  assert.equal(scans.recordPick(device, id!, code, 'typed_pick').stored, true);
}

test('no picks: no link', () => {
  assert.equal(scans.learnedPickFor(STICKER), null);
});

test('one device is not enough, however often it picks', () => {
  devicePicks('lbl-a', ORANGE);
  devicePicks('lbl-a', ORANGE);
  devicePicks('lbl-a', ORANGE);
  assert.equal(scans.learnedPickFor(STICKER), null);
});

test('two different devices picking the same product make the link', () => {
  devicePicks('lbl-b', ORANGE);
  assert.equal(scans.learnedPickFor(STICKER), ORANGE);
  // the same sticker read with a different zero padding is the same canonical barcode
  assert.equal(scans.learnedPickFor('9354765000036'), ORANGE);
});

test('another sticker has no link', () => {
  assert.equal(scans.learnedPickFor('0068100084245'), null);
});

test('a different product picked by as many devices, or more, breaks the link', () => {
  devicePicks('lbl-c', LEMON);
  assert.equal(scans.learnedPickFor(STICKER), ORANGE, 'one device for lemon, two for orange: orange stands');
  devicePicks('lbl-d', LEMON);
  assert.equal(scans.learnedPickFor(STICKER), null, 'two and two: nothing is learned');
  devicePicks('lbl-e', LEMON);
  assert.equal(scans.learnedPickFor(STICKER), LEMON, 'three for lemon beat two for orange');
});

test('a pick made on a text scan, not a barcode scan, is no link', () => {
  const id = scans.recordScan({ deviceId: 'lbl-t1', kind: 'text', query: '0068100084245', outcome: 'answered' });
  scans.recordPick('lbl-t1', id!, ORANGE, 'typed_pick');
  const id2 = scans.recordScan({ deviceId: 'lbl-t2', kind: 'text', query: '0068100084245', outcome: 'answered' });
  scans.recordPick('lbl-t2', id2!, ORANGE, 'typed_pick');
  assert.equal(scans.learnedPickFor('0068100084245'), null);
});

const row = (code: string, name: string, brands: string | null, quantity: string | null) => ({
  code,
  name,
  brands,
  quantity,
  leafCategory: null,
  categoryPath: [] as string[],
});
const CATALOGUE: Record<string, ReturnType<typeof row>> = {
  [ORANGE]: row(ORANGE, 'Navel Orange', null, null),
};
const deps = (extra: Partial<import('../src/catalogue-first.ts').BarcodeDeps>): import('../src/catalogue-first.ts').BarcodeDeps => ({
  lookup: { byGtin: (c: string) => CATALOGUE[c] ?? null },
  prices: null,
  catalogue: null,
  country: 'CA',
  currency: 'CAD',
  asOf: '2026-11-15',
  ...extra,
});
const canonical = (gtin: string) => ({ gtin, how: 'as_read', variableMeasure: null }) as never;

test('an unknown barcode with a learned link is named from the picked product, from shoppers, never sure', async () => {
  const { answer } = await cf.answerBarcodeFromCatalogue(canonical(STICKER), deps({ learnedPick: () => ORANGE }));
  assert.equal(answer.outcome, 'named_outside_catalogue');
  assert.equal(answer.identitySource, 'shopper_picks');
  assert.equal(answer.identity?.name, 'Navel Orange');
  assert.equal(answer.barcode, STICKER);
  assert.ok(answer.range === null || answer.range.confidence === 'low', `range was ${JSON.stringify(answer.range)}`);
  assert.notEqual(answer.verdict?.confidence, 'high');
  assert.notEqual(answer.verdict?.confidence, 'medium');
});

test('the learned link is used only when its product is in the catalogue to name it', async () => {
  const { answer } = await cf.answerBarcodeFromCatalogue(canonical(STICKER), deps({ learnedPick: () => '0000000099999' }));
  assert.equal(answer.outcome, 'not_in_catalogue');
});

test('a barcode the catalogue knows is never overridden by a learned link', async () => {
  let asked = false;
  const { answer } = await cf.answerBarcodeFromCatalogue(
    canonical(LEMON),
    deps({
      lookup: { byGtin: (c: string) => (c === LEMON ? row(LEMON, 'Lemon', null, null) : CATALOGUE[c] ?? null) },
      learnedPick: () => {
        asked = true;
        return ORANGE;
      },
    }),
  );
  assert.equal(answer.outcome, 'catalogue_hit');
  assert.equal(answer.identity?.name, 'Lemon');
  assert.equal(answer.identitySource ?? null, null);
  assert.equal(asked, false, 'the link was not even looked up');
});

test('no learned link: the answer is what it was', async () => {
  const { answer } = await cf.answerBarcodeFromCatalogue(canonical(STICKER), deps({ learnedPick: () => null }));
  assert.equal(answer.outcome, 'not_in_catalogue');
});
