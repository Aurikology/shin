/**
 * Item 7B.8 (QUEUE.md): UPC-E expansion and variable-weight codes in
 * `canonicalBarcode` / `canonicalGtin` (src/barcode.ts). Pure, no server, no
 * network. Every fixture's check digit is a real GS1 mod-10 digit, asserted
 * with `isValidGtin` where it matters so a typo cannot pass silently.
 *
 * RULINGS.md "Always answer": a real printed barcode is never refused as
 * invalid. "Barcode plumbing": exactly one canonical digit string reaches
 * cache, Open Food Facts and Gemini. "Caching and cancellation": the key is
 * barcode + market + currency, so a weighed label must not be a new barcode
 * every time it is weighed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBarcode, canonicalGtin, gtinVariants, isValidGtin } from '../src/barcode.ts';
import { gtinFrom } from '../../identify/src/gtin.ts';

/* --------------------------------- UPC-E --------------------------------- */

test('the Coke Zero can: its printed UPC-E fails EAN-8 but is expanded, not refused', () => {
  // The catalogue's own fixture (catalogue/test/upce.test.ts), scanned 2026-09-14.
  assert.equal(isValidGtin('06781901'), false, 'fixture premise: this is not a valid EAN-8');
  assert.equal(canonicalGtin('06781901'), '067000008191');
  const hit = canonicalBarcode('06781901');
  assert.equal(hit?.how, 'upc_e_expanded');
  assert.equal(hit?.variableMeasure, null);
});

test('the same can read in its long form and its short form share one canonical string', () => {
  assert.equal(canonicalGtin('067000008191'), canonicalGtin('06781901'));
  assert.equal(canonicalBarcode('067000008191')?.how, 'as_read');
});

test('a UPC-E with its leading zero dropped (7 digits, check digit still present) expands', () => {
  assert.equal(canonicalGtin('6781901'), '067000008191');
  assert.equal(canonicalBarcode('6781901')?.how, 'upc_e_expanded');
});

/** canonicalGtin exactly as it was before 7B.8: as read, then zero paddings against the plain GS1 check. */
function preChangeCanonical(raw: string): string | null {
  const direct = gtinFrom(raw);
  if (direct) return direct;
  for (const variant of gtinVariants(raw)) if (isValidGtin(variant)) return variant;
  return null;
}

test('a bare 6-digit UPC-E body is NOT expanded: it carries no check digit', () => {
  // Coke Zero's body. Expanding it would be a guess with no check to catch a misread.
  assert.notEqual(canonicalGtin('678190'), '067000008191');
  assert.equal(canonicalGtin('678190'), preChangeCanonical('678190'));
  assert.notEqual(canonicalBarcode('678190')?.how, 'upc_e_expanded');
});

test('every 6-digit reading behaves exactly as before 7B.8', () => {
  let accepted = 0;
  for (let n = 0; n < 1_000_000; n += 997) {
    const six = String(n).padStart(6, '0');
    const now = canonicalGtin(six);
    assert.equal(now, preChangeCanonical(six), `6-digit ${six} changed behaviour`);
    if (now) {
      accepted += 1;
      assert.notEqual(canonicalBarcode(six)?.how, 'upc_e_expanded');
    }
  }
  assert.ok(accepted > 0, 'sample never hit the zero-padded EAN-8 path, so it proves nothing');
});

test('a UPC-E whose expansion fails its check digit is still refused', () => {
  // 06781902: one digit off the Coke Zero can. Neither EAN-8 nor UPC-E checks out.
  assert.equal(isValidGtin('06781902'), false);
  assert.equal(isValidGtin('067000008192'), false);
  assert.equal(canonicalGtin('06781902'), null);
});

test('a UPC-A with no UPC-E form is unchanged', () => {
  assert.equal(canonicalGtin('012345678905'), '012345678905');
  assert.equal(canonicalBarcode('012345678905')?.how, 'as_read');
});

test('an ordinary 12-digit code starting with 0 stays exactly as read', () => {
  assert.equal(canonicalGtin('068100084245'), '068100084245');
  assert.equal(canonicalBarcode('068100084245')?.variableMeasure, null);
});

test('an 8-digit code valid as BOTH EAN-8 and UPC-E is read as the UPC-E', () => {
  assert.equal(isValidGtin('01234565'), true, 'fixture premise: valid EAN-8');
  assert.equal(isValidGtin('012345000065'), true, 'fixture premise: its UPC-E expansion checks out too');
  assert.equal(canonicalGtin('01234565'), '012345000065');
  assert.equal(canonicalBarcode('01234565')?.how, 'upc_e_expanded');
});

test('an EAN-8 that is not a UPC-E (leading digit outside 0 and 1) is untouched', () => {
  assert.equal(isValidGtin('96385074'), true);
  assert.equal(canonicalGtin('96385074'), '96385074');
});

/* --------------------------- variable-weight codes --------------------------- */

// Item 01234, weighed twice. Digit 7 is the GS1 4-digit price check digit.
const WEIGH_1 = '201234105992'; // $5.99, price check 1
const WEIGH_2 = '201234004127'; // $4.12, price check 0
const FAMILY = '201234000006';

test('two weigh events of the same item map to one key', () => {
  assert.ok(isValidGtin(WEIGH_1) && isValidGtin(WEIGH_2) && isValidGtin(FAMILY));
  assert.equal(canonicalGtin(WEIGH_1), FAMILY);
  assert.equal(canonicalGtin(WEIGH_2), FAMILY);
});

test('the embedded price is exposed, in cents, beside the family key', () => {
  const a = canonicalBarcode(WEIGH_1);
  assert.equal(a?.how, 'variable_measure');
  assert.deepEqual(a?.variableMeasure, { label: WEIGH_1, itemCode: '01234', embeddedPriceCents: 599, priceCheckVerified: true });
  assert.equal(canonicalBarcode(WEIGH_2)?.variableMeasure?.embeddedPriceCents, 412);
});

test('the 13-digit 02 spelling of a weighed label lands on the same key', () => {
  assert.equal(canonicalGtin(`0${WEIGH_1}`), FAMILY);
  assert.equal(canonicalBarcode(`0${WEIGH_1}`)?.variableMeasure?.label, WEIGH_1);
});

test('a different item is a different key', () => {
  // Item 01235, $5.99.
  assert.ok(isValidGtin('201235105991'));
  assert.equal(canonicalGtin('201235105991'), '201235000005');
});

test('a price field that does not verify still collapses the key but reports no price', () => {
  // Digit 7 is 5, not the price check digit of 0599 (which is 1): a weight, a
  // price over $100, or another layout. The key is still the item family.
  assert.ok(isValidGtin('201234505990'));
  const hit = canonicalBarcode('201234505990');
  assert.equal(hit?.gtin, FAMILY);
  assert.equal(hit?.variableMeasure?.embeddedPriceCents, null);
  assert.equal(hit?.variableMeasure?.priceCheckVerified, false);
});

test('a number-system-2 label that fails its own check digit is refused, not collapsed', () => {
  assert.equal(isValidGtin('201234105993'), false);
  assert.equal(canonicalGtin('201234105993'), null);
});

test('an EAN-13 in the European 20-29 in-store range is left unchanged', () => {
  assert.ok(isValidGtin('2101234005996'));
  assert.equal(canonicalGtin('2101234005996'), '2101234005996');
  assert.equal(canonicalBarcode('2101234005996')?.variableMeasure, null);
});
