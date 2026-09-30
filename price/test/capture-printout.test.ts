/**
 * Printout intake (units A1 and A2, docs/price-system-build-plan-2026-09-28.md).
 *
 * Two kinds of test here. The first half builds raw printouts by hand, in
 * TypeScript, so the parsing rules, the two standing checks and the rebuild
 * check run on every machine. The second half builds a real PDF with PyMuPDF
 * (scripts/make-printout-fixture.py) and runs the whole path through
 * scripts/read-printout.py; it is SKIPPED, visibly, where Python with PyMuPDF
 * is not installed.
 *
 * None of this has seen a real Walmart printout: the 29 real ones were not on
 * the machine this was written on. The fixture mimics the layout the
 * prototype reader handled, including the `5$ 98` and `$598` spellings.
 *
 * The "AUDIT" tests are the cases an independent audit of 2026-09-28 found
 * being stored as silent wrong prices.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, appendFileSync, renameSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation, nameRejoinable, type ObservationRow } from '../src/store.ts';
import {
  checkRawFiles,
  checkRebuild,
  intakePrintout,
  intakeRaw,
  nameFromSlug,
  pricesOnLine,
  pythonCommand,
  readPrintout,
  readTile,
  seenOn,
  byWeightAgrees,
  tileLines,
  type RawLink,
  type RawPrintout,
  type Word,
  type WordInfo,
} from '../src/capture-printout.ts';

const SELLER = 'Walmart';
const DAY = '2026-09-27';

/** One printed line per entry: [text, y]. Each line is its own PyMuPDF block. */
function words(lines: readonly (readonly [string, number])[], x = 10): Word[] {
  const out: Word[] = [];
  lines.forEach(([text, y], block) => {
    let cx = x;
    text.split(' ').forEach((t, i) => {
      out.push([cx, y - 9, cx + t.length * 5, y + 3, t, block, 0, i]);
      cx += t.length * 5 + 3;
    });
  });
  return out;
}

/**
 * A tile in column `col` of a 190-wide grid, 240 tall from `y0`, unless a
 * rectangle is given. Words are placed from the tile's left edge; their y is absolute.
 */
function link(
  slug: string,
  id: string,
  lines: readonly (readonly [string, number])[],
  at: { col?: number; y0?: number; bbox?: readonly [number, number, number, number] } = {},
): RawLink {
  const col = at.col ?? 0;
  const y0 = at.y0 ?? 0;
  const bbox = at.bbox ?? ([col * 200, y0, col * 200 + 190, y0 + 240] as const);
  return {
    page: 1,
    bbox,
    uri: `https://www.walmart.ca/en/ip/${slug}/${id}`,
    words: words(lines, bbox[0] + 10),
    image: null,
  };
}

function printout(links: RawLink[], sha = 'a'.repeat(64)): RawPrintout {
  return {
    sha256: sha,
    page_count: 1,
    doc_title: 'Pasta & Pasta Sauce | Walmart Canada',
    creation_date: "D:20260927231000-04'00'",
    mtime: '2026-09-28T03:10:00Z',
    links,
  };
}

/** Standing-check fixture 1: tile A's rectangle holds a neighbour's printed name, and it comes first. */
const NEIGHBOUR = link('Catelli-Smart-Spaghetti-375-g', 'A1', [
  ['Heinz Tomato Ketchup 1 L', 25], // the neighbour's name, inside A's link rectangle
  ['Add', 45],
  ['2$ 47', 130],
  ['Catelli Smart Spaghetti 375 g', 165],
  ['65.9¢/100g', 185],
], { col: 0 });
/** Standing-check fixture 2: 4.99 / 650 ml is 76.8¢/100ml, printed $2.62/100ml. */
const DISAGREE = link('Classico-Tomato-Basil-Pasta-Sauce-650-ml', 'D1', [
  ['4$ 99', 130],
  ['Classico Tomato Basil Pasta Sauce 650 ml', 165],
  ['$2.62/100ml', 185],
], { col: 1 });
const AGREE = link('Great-Value-Spaghetti-900-g', 'S1', [
  ['1$ 98', 130],
  ['Great Value Spaghetti 900 g', 165],
  ['22¢/100g', 185],
], { col: 2 });
const ROLLBACK = link('Kraft-Smooth-Peanut-Butter-1-kg', 'R1', [
  ['Rollback', 20],
  ['$347', 130],
  ['Was $4.27', 145],
  ['Kraft Smooth Peanut Butter 1 kg', 165],
  ['34.7¢/100g', 185],
], { col: 3 });
const NO_PRICE = link('Ronzoni-Lasagna-454-g', 'O1', [['Out of stock', 130], ['Ronzoni Lasagna 454 g', 165]], { col: 4 });

function stored(db: DatabaseSync, sku: string): Record<string, unknown> {
  const r = db.prepare('SELECT * FROM observation WHERE seller_sku = ?').get(sku) as Record<string, unknown> | undefined;
  assert.ok(r, `a row for ${sku}`);
  return r;
}

function flagsOf(db: DatabaseSync, sku: string): string[] {
  const f = stored(db, sku).flags;
  return f === null ? [] : (JSON.parse(String(f)) as string[]);
}

function intakeAll(db: DatabaseSync, links = [NEIGHBOUR, DISAGREE, AGREE, ROLLBACK, NO_PRICE]) {
  return intakeRaw(db, printout(links), { filePath: 'fixture.pdf' });
}

/** One tile alone on a page, intaken, its row returned (or undefined when dropped). */
function single(lines: readonly (readonly [string, number])[], slug = 'Some-Product-500-g') {
  const db = openPrices(':memory:');
  const r = intakeRaw(db, printout([link(slug, 'X1', lines)]), { filePath: 'x.pdf' });
  const row = db.prepare("SELECT * FROM observation WHERE seller_sku = 'X1'").get() as Record<string, unknown> | undefined;
  const flags = row?.flags ? (JSON.parse(String(row.flags)) as string[]) : [];
  db.close();
  return { row, flags, drops: r.apply.drops };
}

test('both price spellings of the printout text layer are read, and the plain one', () => {
  assert.deepEqual(pricesOnLine('5$ 98'), [598]);
  assert.deepEqual(pricesOnLine('10$ 97'), [1097]);
  assert.deepEqual(pricesOnLine('$598'), [598]);
  assert.deepEqual(pricesOnLine('$5.98'), [598]);
  assert.deepEqual(pricesOnLine('Heinz Tomato Ketchup 1 L'), []);
});

test('a tile reading keeps the printed unit price, the "was" price and the sale mark apart from the price', () => {
  const r = readTile(ROLLBACK.words);
  assert.deepEqual(r.prices.map((p) => p.cents), [347], 'neither the was price nor the unit price is a shelf price');
  assert.equal(r.wasCents, 427);
  assert.equal(r.saleMark, true);
  assert.equal(r.unitPrinted, '34.7¢/100g');
  assert.equal(r.unitCents, 34.7);
  assert.equal(r.unitPer, '100g');
  const d = readTile(DISAGREE.words);
  assert.equal(d.unitCents, 262);
  assert.equal(d.unitPer, '100ml');
});

test('a slug becomes the name, decimals and possessives mended', () => {
  assert.equal(nameFromSlug('Kraft-Smooth-Peanut-Butter-1-kg'), 'Kraft Smooth Peanut Butter 1 kg');
  assert.equal(nameFromSlug('Great-Value-Flour-2-5-kg'), 'Great Value Flour 2.5 kg');
  assert.equal(nameFromSlug('Campbell-s-Tomato-Soup-284-ml'), "Campbell's Tomato Soup 284 ml");
  assert.equal(nameFromSlug('Coke-12-355-ml'), 'Coke 12 355 ml', 'a three digit group is not a decimal');
});

test('STANDING CHECK 1: a link rectangle over the neighbour tile still takes the link name', () => {
  // Proves the fixture exercises the defect: the first printed line inside A's
  // rectangle is the NEIGHBOUR's name, which is what the prototype's first reader picked.
  const firstPrinted = tileLines(NEIGHBOUR.words).find((l) => /[A-Za-z]{3,}/.test(l) && !/^Add$/.test(l));
  assert.equal(firstPrinted, 'Heinz Tomato Ketchup 1 L');

  const db = openPrices(':memory:');
  intakeAll(db);
  const a = stored(db, 'A1');
  assert.equal(a.seller_name, 'Catelli Smart Spaghetti 375 g');
  assert.notEqual(a.seller_name, firstPrinted);
  assert.equal(a.price_cents, 247);
  db.close();
});

test('STANDING CHECK 2: price / size against the printed unit price is flagged, never silently used', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  const d = stored(db, 'D1');
  assert.equal(d.unit_price_cents, null, 'the disagreeing unit price is withheld');
  assert.equal(d.unit_label, '$2.62/100ml', 'the printed text is kept');
  assert.ok(flagsOf(db, 'D1').some((f) => f.startsWith('unit_price_disagrees:printed=262/100ml,computed=76.8')));

  const s = stored(db, 'S1');
  assert.equal(s.flags, null, 'an agreeing tile is not flagged');
  assert.equal(s.unit_price_cents, 22);
  assert.equal(s.unit_price_per, '100g');
  db.close();
});

test('a Rollback tile is a sale row with its "was" price; store unknown; category from the page title', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  const r = stored(db, 'R1');
  assert.equal(r.kind, 'promotional', 'range.ts reads regular rows only, so a sale price cannot drag a range down');
  assert.equal(r.is_sale, 1);
  assert.equal(r.was_cents, 427);
  assert.equal(r.price_cents, 347);
  assert.deepEqual(
    JSON.parse(String(r.flags)),
    ['ambiguous_dollar_spelling:347'],
    'judged on its own block: "Was $4.27" in another block does not disarm `$347`',
  );
  assert.equal(r.store_name, null, 'NULL is store.ts\'s "unknown"');
  assert.equal(r.store_category, 'Pasta & Pasta Sauce');
  assert.equal(r.seen_on, DAY, 'the day as written in the PDF\'s own timestamp, not UTC');
  assert.equal(r.code, null);
  assert.equal(r.join_method, 'none');
  const cap = db.prepare('SELECT store, source_kind FROM capture').get() as { store: string; source_kind: string };
  assert.equal(cap.store, 'unknown');
  assert.equal(cap.source_kind, 'printout_pdf');
  db.close();
});

test('every product is a row or a logged drop', () => {
  const db = openPrices(':memory:');
  const r = intakeAll(db);
  assert.equal(r.products, 5);
  assert.equal(r.apply.written, 4);
  assert.deepEqual(
    r.apply.drops.map((d) => [d.retailerProductId, d.reason]),
    [['O1', 'no_price_in_tile']],
  );
  const logged = db.prepare('SELECT retailer_product_id, reason FROM capture_drop').all() as Record<string, unknown>[];
  assert.deepEqual(logged.map((x) => [x.retailer_product_id, x.reason]), [['O1', 'no_price_in_tile']]);
  const tile = db.prepare("SELECT words_json FROM capture_tile WHERE retailer_product_id = 'O1'").get() as { words_json: string };
  assert.match(tile.words_json, /Ronzoni/, 'the dropped product is still kept in raw');
  db.close();
});

// ---------------------------------------------------------------------------
// AUDIT 2026-09-28: silent wrong prices
// ---------------------------------------------------------------------------

test('AUDIT multi-buy: "2 for $5.00", "2/$5.00" and "2/$500" store 250 each, flagged', () => {
  for (const offer of ['2 for $5.00', '2/$5.00', '2/$500', '2 for 5$ 00']) {
    const { row, flags } = single([[offer, 130], ['Some Product 500 g', 165]]);
    assert.equal(row?.price_cents, 250, offer);
    assert.ok(flags.includes('multi_buy:2 for 500'), `${offer}: ${flags}`);
  }
  // A shelf price next to a multi-buy offer is the price; the offer is flagged.
  const both = single([['$2.97', 130], ['2 for $5.00', 145], ['Some Product 500 g', 165]]);
  assert.equal(both.row?.price_cents, 297);
  assert.ok(both.flags.includes('multi_buy_offer:2 for 500'), String(both.flags));
});

test('AUDIT overlap: an out-of-stock tile reaching over a neighbour\'s price does not take it', () => {
  // M's price sits at y 130. N (out of stock) is below M, and its rectangle
  // reaches 120 pt up into M's tile, over M's price.
  const M = link('Barilla-Penne-500-g', 'M1', [['4$ 49', 130], ['Barilla Penne 500 g', 165]], { bbox: [0, 0, 190, 240] });
  const N = link('Ronzoni-Lasagna-454-g', 'N1', [['Out of stock', 380], ['Ronzoni Lasagna 454 g', 415]], { bbox: [0, 120, 190, 490] });
  const nWords = [...words([['4$ 49', 130]], 10), ...N.words];
  const db = openPrices(':memory:');
  const r = intakeRaw(db, printout([M, { ...N, words: nWords }]), { filePath: 'x.pdf' });
  assert.equal(stored(db, 'M1').price_cents, 449, 'the neighbour still reads its own price');
  assert.equal(db.prepare("SELECT 1 FROM observation WHERE seller_sku = 'N1'").get(), undefined, 'N stores no price');
  assert.deepEqual(r.apply.drops.map((d) => [d.retailerProductId, d.reason]), [['N1', 'price_only_in_overlap']]);
  db.close();
});

test('AUDIT overlap: a tile with its own price ignores a neighbour\'s price in the overlap, and says so', () => {
  const M = link('Barilla-Penne-500-g', 'M1', [['4$ 49', 130], ['Barilla Penne 500 g', 165]], { bbox: [0, 0, 190, 240] });
  const N = link('Catelli-Spaghetti-375-g', 'N1', [['2$ 47', 380], ['Catelli Spaghetti 375 g', 415]], { bbox: [0, 120, 190, 490] });
  const db = openPrices(':memory:');
  intakeRaw(db, printout([M, { ...N, words: [...words([['4$ 49', 130]], 10), ...N.words] }]), { filePath: 'x.pdf' });
  assert.equal(stored(db, 'N1').price_cents, 247, 'its own price, not the first one inside its rectangle');
  assert.ok(flagsOf(db, 'N1').includes('neighbour_price_ignored'));
  db.close();
});

test('AUDIT overlap: when neither rectangle clearly owns a price, neither takes it; both are dropped with a reason', () => {
  const P = link('Barilla-Penne-500-g', 'P1', [['4$ 49', 130], ['Barilla Penne 500 g', 165]], { bbox: [0, 0, 190, 240] });
  const Q = { ...link('Catelli-Spaghetti-375-g', 'Q1', [], { bbox: [0, 0, 190, 240] }), words: P.words };
  const db = openPrices(':memory:');
  const r = intakeRaw(db, printout([P, Q]), { filePath: 'x.pdf' });
  assert.equal((db.prepare('SELECT COUNT(*) n FROM observation').get() as { n: number }).n, 0);
  assert.deepEqual(r.apply.drops.map((d) => d.reason).sort(), ['price_only_in_overlap', 'price_only_in_overlap']);
  db.close();
});

test('AUDIT unit price spellings: `1$ 99/100g` is 199 and `$120/100g` is 120, the label verbatim', () => {
  const a = readTile(words([['1$ 99/100g', 185]]));
  assert.deepEqual([a.unitCents, a.unitPer, a.unitPrinted, a.prices.length], [199, '100g', '1$ 99/100g', 0]);
  const b = readTile(words([['$120/100g', 185]]));
  assert.deepEqual([b.unitCents, b.unitPer, b.unitPrinted, b.prices.length], [120, '100g', '$120/100g', 0]);
  const c = readTile(words([['$1.20/100g', 185]]));
  assert.deepEqual([c.unitCents, c.unitPrinted], [120, '$1.20/100g']);
});

test('AUDIT was price at or below the sale price is flagged', () => {
  const same = single([['Rollback', 20], ['$4.27', 130], ['Was $4.27', 145], ['Some Product 500 g', 165]]);
  assert.equal(same.row?.price_cents, 427);
  assert.ok(same.flags.includes('was_not_above_price:was=427,price=427'), String(same.flags));
  const below = single([['$4.27', 130], ['Was $3.99', 145], ['Some Product 500 g', 165]]);
  assert.ok(below.flags.includes('was_not_above_price:was=399,price=427'), String(below.flags));
  const fine = single([['$3.99', 130], ['Was $4.27', 145], ['Some Product 500 g', 165]]);
  assert.deepEqual(fine.flags, []);
});

test('AUDIT a no-decimal `$NNN` on a tile with no decimal anywhere is flagged as ambiguous', () => {
  const tv = single([['$100', 130], ['Onn 32 inch TV', 165]], 'onn-32-inch-TV');
  assert.equal(tv.row?.price_cents, 100);
  assert.ok(tv.flags.includes('ambiguous_dollar_spelling:100'), String(tv.flags));
  const five = single([['$5', 130], ['Some Product 500 g', 165]]);
  assert.ok(five.flags.includes('ambiguous_dollar_spelling:500'), String(five.flags));
  const superscript = single([['5$ 98', 130], ['Some Product 500 g', 165]]);
  assert.deepEqual(superscript.flags, [], '`5$ 98` shows its cents: not ambiguous');
});

test('AUDIT a price sharing a line with a "was" price or a unit price is still read', () => {
  const a = readTile(words([['3$ 47 Was $4.27', 130]]));
  assert.deepEqual([a.prices.map((p) => p.cents), a.wasCents], [[347], 427]);
  const b = readTile(words([['$5.47 26.2¢/100g', 130]]));
  assert.deepEqual([b.prices.map((p) => p.cents), b.unitCents, b.unitPrinted], [[547], 26.2, '26.2¢/100g']);
  const c = readTile(words([['Was $4.27 3$ 47', 130]]));
  assert.deepEqual([c.prices.map((p) => p.cents), c.wasCents], [[347], 427]);
});

test('Walmart sale layout: the struck-through price after "Now" is the "was" price, and "You save" is not a shelf price', () => {
  const a = readTile(words([['Rollback', 100], ['Now $3.97 $4.97 $1.13/100g + tax', 130], ['You save $1.00', 150]]));
  assert.deepEqual([a.prices.map((p) => p.cents), a.wasCents, a.saveCents, a.unitCents], [[397], 497, 100, 113]);
  const b = readTile(words([['Now $2.67 $3.18 53¢/100ml', 130]]));
  assert.deepEqual([b.prices.map((p) => p.cents), b.wasCents], [[267], 318]);
  const plain = readTile(words([['$2.67 53¢/100ml', 130]]));
  assert.deepEqual([plain.prices.map((p) => p.cents), plain.wasCents], [[267], null], 'no "Now": nothing is a was price');
  assert.deepEqual(pricesOnLine('Now $3.97 $4.97'), [397]);
});

// ---------------------------------------------------------------------------
// RE-AUDIT 2026-09-28: fail closed. One standing test per audit case.
// ---------------------------------------------------------------------------

/** A word with explicit geometry: text, x0, y0, x1, y1, block, line. */
function W(text: string, x0: number, y0: number, x1: number, y1: number, block: number, line = 0): Word {
  return [x0, y0, x1, y1, text, block, line, 0];
}

test('RE-AUDIT a: an out-of-stock tile over a neighbour\'s left-aligned price is never stored unflagged', () => {
  // Side by side. A (out of stock) reaches 130 pt right into B, over B's price at B's left edge,
  // deep enough that the depth rule hands the whole price to A: the audit's 449.
  const A = {
    ...link('Ronzoni-Lasagna-454-g', 'A1', [], { bbox: [0, 0, 330, 240] }),
    words: [W('Out', 10, 121, 25, 133, 0), W('of', 28, 121, 38, 133, 0), W('stock', 41, 121, 66, 133, 0),
      W('4$', 210, 121, 220, 133, 1), W('49', 223, 121, 233, 133, 1)],
  };
  const B = {
    ...link('Barilla-Penne-500-g', 'B1', [], { bbox: [200, 0, 390, 240] }),
    words: [W('4$', 210, 121, 220, 133, 1), W('49', 223, 121, 233, 133, 1), W('Barilla', 210, 156, 245, 168, 2)],
  };
  const db = openPrices(':memory:');
  intakeRaw(db, printout([A, B]), { filePath: 'x.pdf' });
  const rows = db.prepare('SELECT seller_sku, price_cents, flags FROM observation').all() as Record<string, unknown>[];
  assert.ok(rows.length > 0, 'the fixture must reach the depth rule and store something');
  for (const r of rows) {
    assert.ok(String(r.flags).includes('overlap_assigned'), `${r.seller_sku} stored ${r.price_cents} with flags ${r.flags}`);
  }
  db.close();
});

test('RE-AUDIT a′: a price the depth rule confidently kept is still flagged overlap_assigned', () => {
  const M = link('Barilla-Penne-500-g', 'M1', [['4$ 49', 130], ['Barilla Penne 500 g', 165]], { bbox: [0, 0, 190, 240] });
  const N = link('Ronzoni-Lasagna-454-g', 'N1', [['Out of stock', 380], ['Ronzoni Lasagna 454 g', 415]], { bbox: [0, 120, 190, 490] });
  const db = openPrices(':memory:');
  intakeRaw(db, printout([M, { ...N, words: [...words([['4$ 49', 130]], 10), ...N.words] }]), { filePath: 'x.pdf' });
  assert.equal(stored(db, 'M1').price_cents, 449);
  assert.ok(flagsOf(db, 'M1').includes('overlap_assigned'), String(flagsOf(db, 'M1')));
  db.close();
});

test('RE-AUDIT b: a thousands separator is read whole or the tile is dropped, never a prefix', () => {
  assert.deepEqual(pricesOnLine('$1,299.00'), [129900]);
  assert.deepEqual(pricesOnLine('1,299$ 00'), [129900]);
  assert.deepEqual(pricesOnLine('$1,299'), [129900]);
  const whole = single([['$1,299.00', 130], ['Some Product 500 g', 165]]);
  assert.deepEqual([whole.row?.price_cents, whole.flags], [129900, []]);
  const sup = single([['1,299$ 00', 130], ['Some Product 500 g', 165]]);
  assert.deepEqual([sup.row?.price_cents, sup.flags], [129900, []]);
  const bare = single([['$1,299', 130], ['Some Product 500 g', 165]]);
  assert.deepEqual([bare.row?.price_cents, bare.flags], [129900, ['ambiguous_dollar_spelling:129900']]);
  for (const odd of ['$1,2999.00', '$12,34.00', '12,345,6$ 00']) {
    const r = single([[odd, 130], ['Some Product 500 g', 165]]);
    assert.equal(r.row, undefined, `${odd} stored ${r.row?.price_cents}`);
    assert.ok(r.drops.length === 1 && ['unparsed_price', 'comma_decimal'].includes(r.drops[0].reason), `${odd}: ${JSON.stringify(r.drops)}`);
  }
});

test('RE-AUDIT c: ambiguity is judged on the price\'s own line and block, never tile-wide', () => {
  // A decimal in the name ("2.5 kg") and a decimal unit price in another block do not disarm `$598`.
  const potatoes = single([['$598', 130], ['Potatoes 2.5 kg', 165], ['$2.39/kg', 185]], 'Potatoes-2-5-kg');
  assert.ok(potatoes.flags.includes('ambiguous_dollar_spelling:598'), String(potatoes.flags));
  // A decimal money token in the SAME block does.
  const db = openPrices(':memory:');
  const x = link('Some-Product-500-g', 'X1', []);
  intakeRaw(db, printout([{ ...x, words: [
    W('$598', 10, 121, 30, 133, 0, 0), W('Reg', 10, 136, 25, 148, 0, 1), W('$6.49', 28, 136, 50, 148, 0, 1),
    W('Some', 10, 156, 30, 168, 1), W('Product', 33, 156, 60, 168, 1),
  ] }]), { filePath: 'x.pdf' });
  assert.equal(stored(db, 'X1').price_cents, 598);
  assert.ok(!flagsOf(db, 'X1').some((f) => f.startsWith('ambiguous')), String(flagsOf(db, 'X1')));
  db.close();
});

test('RE-AUDIT d: split superscript cents are joined by geometry, and flagged when the geometry is unclear', () => {
  const raised = readTile([W('$5', 10, 120, 22, 134, 0), W('98', 23, 120, 30, 127, 1)]);
  assert.deepEqual(raised.prices.map((p) => [p.cents, p.ambiguous]), [[598, false]], 'small, raised: superscript');
  const flat = readTile([W('$5', 10, 120, 22, 134, 0), W('98', 23, 120, 35, 134, 1)]);
  assert.deepEqual(flat.prices.map((p) => [p.cents, p.ambiguous]), [[598, true]], 'same size, same line: unclear');
  const far = readTile([W('$5', 10, 120, 22, 134, 0), W('98', 80, 120, 92, 134, 1)]);
  assert.ok(far.prices.length > 0 && far.prices.every((p) => p.ambiguous), 'not adjacent: not joined, and `$5` alone is ambiguous');
});

test('RE-AUDIT e: money per a unit word is a unit price, never the shelf price', () => {
  for (const u of ['$0.26/sheet', '$0.26/sheets', '$1.99/ct', '$1.99/count', '$0.45/oz', '$1.99/each', '$0.50 per roll', '12.5¢/sheet']) {
    const r = single([[u, 130], ['Some Product 500 g', 165]]);
    assert.equal(r.row, undefined, `${u} became a shelf price ${r.row?.price_cents}`);
    assert.deepEqual(r.drops.map((d) => d.reason), ['no_shelf_price'], u);
  }
  const both = single([['$3.99', 130], ['$0.50 per roll', 145], ['Some Product 500 g', 165]]);
  assert.deepEqual([both.row?.price_cents, both.row?.unit_price_cents, both.row?.unit_price_per], [399, 50, 'roll']);
});

test('RE-AUDIT f: French comma decimals are not parsed: flagged, and a comma shelf price is dropped', () => {
  for (const fr of ['3,47$', '$3,47', '3,47 $']) {
    const r = single([[fr, 130], ['Some Product 500 g', 165]]);
    assert.equal(r.row, undefined, `${fr} stored ${r.row?.price_cents}`);
    assert.deepEqual(r.drops.map((d) => d.reason), ['comma_decimal'], fr);
  }
  const unit = single([['$5.98', 130], ['Some Product 500 g', 165], ['26,2¢/100g', 185]]);
  assert.equal(unit.row?.price_cents, 598);
  assert.equal(unit.row?.unit_price_cents, null, 'no prefix of 26,2 is read as a unit price');
  assert.ok(unit.flags.includes('comma_decimal:26,2¢'), String(unit.flags));
});

test('RE-AUDIT ledger: capture_written refuses UPDATE and DELETE, and a row missing from it turns the check red', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  assert.throws(() => db.exec("DELETE FROM capture_written WHERE retailer_product_id = 'S1'"), /ledger and is never edited/);
  assert.throws(() => db.exec('UPDATE capture_written SET capture_tile_id = 0'), /ledger and is never edited/);
  // Bypass the trigger, as a careless hand edit would.
  db.exec('DROP TRIGGER capture_written_no_delete');
  db.exec("DELETE FROM capture_written WHERE retailer_product_id = 'S1'");
  const red = checkRebuild(db);
  assert.equal(red.ok, false);
  assert.deepEqual(red.unledgered, [`${SELLER}/S1/${DAY}`]);
  db.close();
});

test('the same file read twice is one capture', () => {
  const db = openPrices(':memory:');
  const first = intakeAll(db);
  const again = intakeAll(db);
  assert.equal(again.newCapture, false);
  assert.equal(again.captureId, first.captureId);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM capture_tile').get() as { n: number }).n, 5);
  assert.equal(checkRebuild(db).ok, true);
  db.close();
});

test('raw is never edited: an UPDATE on capture or capture_tile is refused', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  assert.throws(() => db.exec("UPDATE capture_tile SET words_json = '[]'"), /raw and is never edited/);
  assert.throws(() => db.exec("UPDATE capture SET store = 'Kanata'"), /raw and is never edited/);
  db.close();
});

test('REBUILD CHECK: green when intact, red when a raw tile is deleted', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  const green = checkRebuild(db);
  assert.equal(green.ok, true, JSON.stringify(green));
  assert.equal(green.compared, 4);

  db.exec("DELETE FROM capture_tile WHERE retailer_product_id = 'R1'");
  const red = checkRebuild(db);
  assert.equal(red.ok, false);
  assert.deepEqual(red.extra, [`${SELLER}/R1/${DAY}`], 'the stored row no longer has a raw source');
  db.close();
});

test('REBUILD CHECK: red when a whole raw file is deleted', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  db.exec('DELETE FROM capture_tile');
  db.exec('DELETE FROM capture');
  const red = checkRebuild(db);
  assert.equal(red.ok, false);
  assert.equal(red.extra.length, 4);
  db.close();
});

test('REBUILD CHECK: red when a stored row is edited away from what raw says', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  db.exec("UPDATE observation SET price_cents = 199 WHERE seller_sku = 'S1'");
  const red = checkRebuild(db);
  assert.equal(red.ok, false);
  assert.deepEqual(red.differ, [{ key: `${SELLER}/S1/${DAY}`, column: 'price_cents', stored: 199, rebuilt: 198 }]);
  db.close();
});

test('AUDIT REBUILD CHECK: a printout row whose capture_tile_id was nulled is a finding, not "held"', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  db.exec("UPDATE observation SET capture_tile_id = NULL WHERE seller_sku = 'S1'");
  const red = checkRebuild(db);
  assert.equal(red.ok, false);
  assert.deepEqual(red.unlinked, [`${SELLER}/S1/${DAY}`]);
  assert.equal(red.heldByOther, 0);
  // Re-running intake does not launder it into an expected "held" drop.
  const again = intakeAll(db);
  assert.ok(!again.apply.drops.some((d) => d.reason === 'key_held_by_other_source'));
  assert.equal(checkRebuild(db).ok, false);
  db.close();
});

test('AUDIT REBUILD CHECK: a printout row replaced by another writer after intake is a finding', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  recordObservation(db, {
    code: '0068100084245', seller: SELLER, sellerSku: 'S1', sellerName: 'GV Spaghetti', sellerBrand: 'Great Value',
    priceCents: 197, kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA',
    region: null, joinMethod: 'gtin', seenOn: DAY, url: null, imageUrl: null, inStock: 1,
  });
  const red = checkRebuild(db);
  assert.equal(red.ok, false);
  assert.deepEqual(red.unlinked, [`${SELLER}/S1/${DAY}`]);
  db.close();
});

test('a key already held by a crawled row BEFORE intake is not overwritten; the drop is logged and the check stays green', () => {
  const db = openPrices(':memory:');
  const crawl: ObservationRow = {
    code: '0068100084245', seller: SELLER, sellerSku: 'S1', sellerName: 'GV Spaghetti', sellerBrand: 'Great Value',
    priceCents: 197, kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA',
    region: null, joinMethod: 'gtin', seenOn: DAY, url: null, imageUrl: null, inStock: 1,
  };
  recordObservation(db, crawl);
  const r = intakeAll(db);
  assert.ok(r.apply.drops.some((d) => d.retailerProductId === 'S1' && d.reason === 'key_held_by_other_source'));
  const s = stored(db, 'S1');
  assert.equal(s.code, '0068100084245', 'the crawled row, code and all, survives');
  assert.equal(s.price_cents, 197);
  const c = checkRebuild(db);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.heldByOther, 1);
  db.close();
});

test('printout rows are not handed to the name rejoin: that is the paused matcher', () => {
  const db = openPrices(':memory:');
  intakeAll(db);
  recordObservation(db, {
    code: null, seller: 'Canadian Tire', sellerSku: 'ct1', sellerName: 'Mastercraft Hammer', sellerBrand: 'Mastercraft',
    priceCents: 1999, kind: 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA',
    region: null, joinMethod: 'none', seenOn: DAY, url: null, imageUrl: null, inStock: null, pageGtin: null,
  });
  assert.deepEqual(nameRejoinable(db).map((r) => r.sellerSku), ['ct1']);
  db.close();
});

test('RAW VS FILE: a capture whose file is gone is reported, apart from the rebuild check', () => {
  const db = openPrices(':memory:');
  intakeAll(db); // filePath 'fixture.pdf' does not exist
  const f = checkRawFiles(db);
  assert.equal(f.ok, false);
  assert.equal(f.missingFile.length, 1);
  assert.equal(checkRebuild(db).ok, true, 'the rebuild check is a separate question');
  db.close();
});

// ---------------------------------------------------------------------------
// Through a real PDF. Skipped where Python + PyMuPDF are not installed.
// ---------------------------------------------------------------------------

const havePyMuPDF = spawnSync(pythonCommand(), ['-c', 'import pymupdf'], { encoding: 'utf8' }).status === 0;
const FIXTURE_SCRIPT = fileURLToPath(new URL('../scripts/make-printout-fixture.py', import.meta.url));
const skip = havePyMuPDF ? false : `needs ${pythonCommand()} with PyMuPDF`;

function pdfIntake() {
  const dir = mkdtempSync(join(tmpdir(), 'shin-printout-'));
  const pdf = join(dir, 'printout.pdf');
  execFileSync(pythonCommand(), [FIXTURE_SCRIPT, pdf]);
  const db = openPrices(join(dir, 'prices.db'));
  const r = intakePrintout(db, pdf, { imagesDir: join(dir, 'tiles') });
  return { dir, pdf, db, r };
}

test('a synthetic printout PDF goes through read, keep and derive', { skip }, () => {
  const { db, r } = pdfIntake();

  assert.equal(r.tiles, 12, 'every product link rectangle, the nav link left out');
  assert.equal(r.otherLinks, 1);
  assert.equal(r.products, 9);
  assert.equal(r.apply.written + r.apply.drops.length, 9, 'every product is a row or a logged drop');
  assert.deepEqual(r.apply.drops.map((d) => d.reason), ['no_price_in_tile']);

  // Standing check 1 on the PDF: tile A's rectangle reaches over tile B's name.
  const aTile = db.prepare("SELECT words_json FROM capture_tile WHERE retailer_product_id = '6000200000033'").get() as {
    words_json: string;
  };
  assert.equal((JSON.parse(aTile.words_json) as Word[])[0][4], 'Heinz', 'the fixture really overlaps the neighbour');
  assert.equal(stored(db, '6000200000033').seller_name, 'Catelli Smart Spaghetti 375 g');
  assert.equal(stored(db, '6000200000033').price_cents, 247);

  // The two text-layer spellings.
  assert.equal(stored(db, '6000200000011').price_cents, 198, '`1$ 98`');
  assert.equal(stored(db, '6000200000022').price_cents, 598, '`$598`');

  // Standing check 2 on the PDF.
  const d = stored(db, '6000200000055');
  assert.equal(d.unit_price_cents, null);
  assert.match(String(d.flags), /unit_price_disagrees/);

  // Rollback, was, sale.
  const k = stored(db, '6000200000044');
  assert.deepEqual([k.kind, k.is_sale, k.was_cents, k.price_cents], ['promotional', 1, 427, 347]);

  // Same product seen twice at two prices: one row, flagged.
  assert.match(String(stored(db, '6000200000022').flags), /conflicting_prices:598,549/);
  // By weight, `$152` with no decimal anywhere on the tile: flagged both ways.
  const banana = flagsOf(db, '6000200000077');
  assert.ok(banana.includes('price_by_weight') && banana.includes('ambiguous_dollar_spelling:152'), String(banana));
  // One product, two link rectangles: one row, priced from the rectangle that holds the price.
  const tide = stored(db, '6000200000088');
  assert.equal(tide.price_cents, 1097);
  assert.equal(tide.unit_price_per, 'each');
  assert.ok(existsSync(String(tide.tile_image)), 'the tile crop was saved');

  assert.equal(checkRebuild(db).ok, true);
  db.exec("DELETE FROM capture_tile WHERE retailer_product_id = '6000200000044'");
  assert.equal(checkRebuild(db).ok, false, 'deleting one raw tile turns the rebuild check red');
  db.close();
});

test('RAW VS FILE on a real PDF: green, then red on a re-read tile mismatch, a changed file, a missing file', { skip }, () => {
  const { pdf, db } = pdfIntake();
  const green = checkRawFiles(db, { reread: true });
  assert.equal(green.ok, true, JSON.stringify(green));
  assert.equal(green.checked, 1);

  db.exec("DELETE FROM capture_tile WHERE retailer_product_id = '6000200000044'");
  const reread = checkRawFiles(db, { reread: true });
  assert.equal(reread.ok, false);
  assert.equal(reread.tileMismatch.length, 1, 'the file holds a tile raw no longer does');

  appendFileSync(pdf, '\n% edited\n');
  const changed = checkRawFiles(db);
  assert.deepEqual([changed.ok, changed.hashMismatch.length], [false, 1]);

  renameSync(pdf, pdf + '.moved');
  const gone = checkRawFiles(db);
  assert.deepEqual([gone.ok, gone.missingFile.length], [false, 1]);
  db.close();
});

// ---------------------------------------------------------------------------
// THIRD AUDIT 2026-09-28: the inverted model. A price is verified only when
// every positive check holds; everything else is price_verified = 0.
// ---------------------------------------------------------------------------

const DRAWN: WordInfo = { r: 0, u: true, f: 'Helvetica', s: 9 };

/** Printed lines as words that carry how they were drawn (the PDF reader always gives this). */
function drawn(lines: readonly (readonly [string, number])[], x = 10, info: Partial<WordInfo> = {}): Word[] {
  return words(lines, x).map((w) => [w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], { ...DRAWN, ...info }] as Word);
}

/** The unit price that agrees with 4$ 97 for 500 g: 497 / 5 = 99.4¢ per 100 g. */
const AGREEING_UNIT: readonly [string, number] = ['99.4¢/100g', 185];

/** One product tile laid out like a real one: price above its printed title, an agreeing unit price, near words known. */
function clean(
  lines: readonly (readonly [string, number])[] = [['4$ 97', 130], ['Clean Product 500 g', 165], AGREEING_UNIT],
  slug = 'Clean-Product-500-g',
  id = 'V1',
): RawLink {
  return { ...link(slug, id, []), words: drawn(lines), near: [] };
}

/** clean() with the default title and agreeing unit price, and `price` in place of the price line. */
function cleanWith(price: readonly [string, number], extra: readonly (readonly [string, number])[] = []): RawLink {
  return clean([price, ['Clean Product 500 g', 165], AGREEING_UNIT, ...extra]);
}

function verifiedOf(links: RawLink[], sku = 'V1', store?: string) {
  const db = openPrices(':memory:');
  const r = intakeRaw(db, printout(links), { filePath: 'x.pdf', ...(store ? { store } : {}) });
  const row = db.prepare('SELECT price_cents, price_verified, flags FROM observation WHERE seller_sku = ?').get(sku) as
    | { price_cents: number; price_verified: number; flags: string | null }
    | undefined;
  db.close();
  return { row, drops: r.apply.drops };
}

test('VERIFIED: two reads agree, a whole shelf price over its own title and a unit price that matches price / size', () => {
  for (const spelling of ['4$ 97', '4$97', '$4.97']) {
    const { row } = verifiedOf([cleanWith([spelling, 130])]);
    assert.deepEqual([row?.price_cents, row?.price_verified, row?.flags], [497, 1, null], spelling);
  }
});

test('VERIFIED needs the second read: no unit price, a disagreeing one, or no size is never verified on one read', () => {
  const none = verifiedOf([clean([['4$ 97', 130], ['Clean Product 500 g', 165]])]);
  assert.deepEqual([none.row?.price_cents, none.row?.price_verified], [497, 0], 'no unit price');
  const off = verifiedOf([clean([['4$ 97', 130], ['Clean Product 500 g', 165], ['$1.20/100g', 185]])]);
  assert.equal(off.row?.price_verified, 0, 'unit price 120 vs price/size 99.4');
  const noSize = verifiedOf([clean([['4$ 97', 130], ['Clean Product', 165], AGREEING_UNIT], 'Clean-Product')]);
  assert.equal(noSize.row?.price_verified, 0, 'no size in the slug or the printed title');
  // The 3% bar: 102.4 is 3.0% off 99.4 and agrees; 102.5 does not.
  assert.equal(verifiedOf([clean([['4$ 97', 130], ['Clean Product 500 g', 165], ['102.4¢/100g', 185]])]).row?.price_verified, 1);
  assert.equal(verifiedOf([clean([['4$ 97', 130], ['Clean Product 500 g', 165], ['102.5¢/100g', 185]])]).row?.price_verified, 0);
  // Small unit prices: 97 / 5 = 19.4¢; 20.1¢ is within the old 1¢ disagreement floor (no flag) but 3.5% off.
  const small = verifiedOf([clean([['$0.97', 130], ['Clean Product 500 g', 165], ['20.1¢/100g', 185]])]);
  assert.deepEqual([small.row?.flags, small.row?.price_verified], [null, 0], 'the 3% bar, not the 1¢ floor');
  assert.equal(verifiedOf([clean([['$0.97', 130], ['Clean Product 500 g', 165], ['19.9¢/100g', 185]])]).row?.price_verified, 1);
  // The size may come from the printed title when the slug has none.
  const printed = verifiedOf([clean([['4$ 97', 130], ['Clean Product 500 g', 165], AGREEING_UNIT], 'Clean-Product')]);
  assert.equal(printed.row?.price_verified, 1, 'size from the printed title');
});

test('SHELF READ: the largest bold money word is the shelf price; a bold `$NNN` there reads as dollars and cents', () => {
  // The real layout: "$644" in 18 pt bold, the unit price after it in 10.5 pt regular.
  const big = { r: 0, u: true, f: 'EverydaySansUIWeb-Bold', s: 18 };
  const small = { r: 0, u: true, f: 'EverydaySansUIWeb-Regular', s: 10.5 };
  const tile: RawLink = {
    ...link('Sealtest-Partly-Skimmed-2-Milk-4-L', 'M4', []),
    near: [],
    words: [
      [10, 115, 50, 133, '$644', 3, 0, 0, big], [60, 122, 110, 133, '16.1¢/100ml', 3, 0, 1, small],
      [10, 156, 60, 168, 'Sealtest', 4, 0, 0, small], [63, 156, 100, 168, 'Partly', 4, 0, 1, small],
      [103, 156, 150, 168, 'Skimmed', 4, 0, 2, small], [153, 156, 170, 168, 'Milk', 4, 0, 3, small],
      [173, 156, 180, 168, '4', 4, 0, 4, small], [182, 156, 188, 168, 'L', 4, 0, 5, small],
    ],
  };
  const { row } = verifiedOf([tile], 'M4');
  assert.deepEqual([row?.price_cents, row?.price_verified], [644, 1], JSON.stringify(row));
  // The same `$644` in regular weight is not shelf style: never verified.
  const regular = { ...tile, words: tile.words.map((w, i): Word => (i === 0 ? [w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], small] : w)) };
  assert.equal(verifiedOf([regular], 'M4').row?.price_verified, 0);
  // The larger word wins over an earlier smaller one.
  const two: RawLink = { ...tile, words: [[10, 100, 40, 108, '$2.00', 2, 0, 0, small], ...tile.words] };
  assert.equal(verifiedOf([two], 'M4').row?.price_cents, 644);
});

test('SECOND READ by_weight: avg price = unit price x the upper weight, within printed rounding', () => {
  assert.equal(byWeightAgrees(35, ['Banana, Sold in singles, 0.15 - 0.23 KG'], 15, '100g', '15¢/100g'), true);
  assert.equal(byWeightAgrees(648, ['Grapes, 1 Bag, 0.63 - 1.00 KG'], 65, '100g', '65¢/100g'), true);
  assert.equal(byWeightAgrees(40, ['Banana, 0.15 - 0.23 KG'], 15, '100g', '15¢/100g'), false);
  assert.equal(byWeightAgrees(35, ['Banana, Sold in singles'], 15, '100g', '15¢/100g'), false, 'no weight range: no second read');
  const bananas = clean([['avg price', 115], ['$0.35', 130], ['Banana, Sold in singles, 0.15 - 0.23 KG', 165], ['15¢/100g', 185]], 'Banana-Sold-in-singles');
  const { row } = verifiedOf([bananas]);
  assert.deepEqual([row?.price_cents, row?.price_verified], [35, 1], JSON.stringify(row));
});

test('VERIFIED (a): any other money in the tile besides the shelf price and its unit price leaves it unverified', () => {
  for (const extra of ['$1.20/100g', '22¢/100g', 'Was $5.97', 'Save $1.00', '$0.10 deposit', 'or 2.49', '2 for $9.00']) {
    const { row } = verifiedOf([cleanWith(['4$ 97', 130], [[extra, 205]])]);
    assert.equal(row?.price_verified, 0, extra);
  }
  // A decimal size or a weight range is not money.
  const decimalSize = verifiedOf([clean([['4$ 97', 130], ['Clean Product 0.50 kg', 165], AGREEING_UNIT], 'Clean-Product-0-50-kg')]);
  assert.equal(decimalSize.row?.price_verified, 1, JSON.stringify(decimalSize.row));
  // A no-decimal spelling not in bold shelf style is never verified.
  assert.equal(verifiedOf([cleanWith(['$497', 130])]).row?.price_verified, 0);
});

test('VERIFIED (b): a price inside another product\'s rectangle is never verified, however deep', () => {
  const M = { ...link('Clean-Product-500-g', 'V1', [], { bbox: [0, 0, 190, 240] }), words: drawn([['4$ 97', 130], ['Clean Product 500 g', 165], AGREEING_UNIT]), near: [] };
  const N = { ...link('Other-Thing', 'N1', [], { bbox: [0, 120, 190, 490] }), words: drawn([['4$ 97', 130], ['Other Thing', 415]]), near: [] };
  const { row } = verifiedOf([M, N]);
  assert.equal(row?.price_cents, 497);
  assert.equal(row?.price_verified, 0);
  // Money touching the tile from outside (near words) blocks it too.
  assert.equal(verifiedOf([{ ...clean(), near: drawn([['$9.99', 245]]) }]).row?.price_verified, 0);
  // Raw written without near words cannot be verified at all.
  assert.equal(verifiedOf([{ ...clean(), near: undefined }]).row?.price_verified, 0);
});

test('VERIFIED (c): count, range, From, minus and US context around the price leaves it unverified', () => {
  for (const line of ['2 for $4.97', 'From $4.97', 'Starting at $4.97', '$4.97 - $5.97', '$4.97 to $5.97', '−$4.97', 'US$4.97', '$4.97 USD', '3 x $4.97']) {
    const { row } = verifiedOf([cleanWith([line, 130])]);
    assert.notEqual(row?.price_verified, 1, `${line}: ${JSON.stringify(row)}`);
  }
  assert.notEqual(verifiedOf([cleanWith(['$4.97', 130], [['2 for', 118]])]).row?.price_verified, 1, 'count on the line above');
  // The unit price right after the shelf price on its line is NOT context (the real layout).
  const sameLine = clean([['4$ 97 99.4¢/100g', 130], ['Clean Product 500 g', 165]]);
  assert.equal(verifiedOf([sameLine]).row?.price_verified, 1, JSON.stringify(verifiedOf([sameLine]).row));
});

test('VERIFIED (d): invisible, rotated or undrawn price text is never verified', () => {
  const rest = drawn([['Clean Product 500 g', 165], AGREEING_UNIT]).map((w) => [w[0], w[1], w[2], w[3], w[4], w[5] + 1, 0, w[7], w[8]] as Word);
  assert.equal(verifiedOf([{ ...clean(), words: [...drawn([['4$ 97', 130]], 10, { r: 3 }), ...rest] }]).row?.price_verified, 0, 'render mode 3');
  assert.equal(verifiedOf([{ ...clean(), words: [...drawn([['4$ 97', 130]], 10, { u: false }), ...rest] }]).row?.price_verified, 0, 'rotated');
  assert.equal(verifiedOf([{ ...clean(), words: words([['4$ 97', 130], ['Clean Product 500 g', 165], AGREEING_UNIT]) }]).row?.price_verified, 0, 'no render info');
});

test('VERIFIED (e): a price not directly above the tile\'s own printed title is never verified', () => {
  assert.equal(verifiedOf([clean([['Clean Product 500 g', 130], ['4$ 97', 165], AGREEING_UNIT])]).row?.price_verified, 0, 'price under the title');
  assert.equal(verifiedOf([clean([['4$ 97', 130], ['Heinz Tomato Ketchup 1 L', 165], AGREEING_UNIT])]).row?.price_verified, 0, 'the printed title is another product\'s');
  assert.equal(verifiedOf([clean([['4$ 97', 60], ['Clean Product 500 g', 165], AGREEING_UNIT])]).row?.price_verified, 0, 'more than 60 pt above');
});

test('VERIFIED (f, g): out of stock text, or any flag the second read does not resolve, leaves it unverified', () => {
  assert.equal(verifiedOf([cleanWith(['4$ 97', 130], [['Out of stock', 110]])]).row?.price_verified, 0);
  const twin = { ...cleanWith(['5$ 97', 130]), bbox: [200, 0, 390, 240] as const, words: drawn([['5$ 97', 130], ['Clean Product 500 g', 165], AGREEING_UNIT], 210) };
  const twice = verifiedOf([clean(), twin]);
  assert.match(String(twice.row?.flags), /conflicting_prices/);
  assert.equal(twice.row?.price_verified, 0);
});

test('SEEN ON: the local date in America/Toronto, not UTC', () => {
  assert.equal(seenOn('2026-09-28T03:18:23+00:00'), '2026-09-27', 'a page saved 11:18 PM Toronto time');
  assert.equal(seenOn('2026-09-28T03:18:23Z'), '2026-09-27');
  assert.equal(seenOn('2026-09-27T23:10:00-04:00'), '2026-09-27');
  assert.equal(seenOn('2026-09-27T23:10:00'), '2026-09-27', 'no zone: already local');
});

test('INTAKE RUN: with no store, one run is one unknown store; the same price merges, a different price is a flagged conflict', () => {
  const db = openPrices(':memory:');
  const run = 'run-test';
  intakeRaw(db, printout([clean()], '3'.repeat(64)), { filePath: 'pasta.pdf', intakeRun: run });
  intakeRaw(db, printout([clean()], '4'.repeat(64)), { filePath: 'rollbacks.pdf', intakeRun: run });
  const same = db.prepare('SELECT price_cents, price_verified, flags FROM observation').all() as Record<string, unknown>[];
  assert.deepEqual(same.map((r) => [r.price_cents, r.flags]), [[497, null]], 'one row, no drop');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM capture_drop').get() as { n: number }).n, 0);
  intakeRaw(db, printout([cleanWith(['5$ 97', 130])], '5'.repeat(64)), { filePath: 'third.pdf', intakeRun: run });
  const conflict = db.prepare('SELECT price_verified, flags FROM observation').get() as Record<string, unknown>;
  assert.match(String(conflict.flags), /conflicting_prices:497,597/);
  assert.equal(conflict.price_verified, 0);
  assert.equal(checkRebuild(db).ok, true);
  db.close();
});

test('SPACE THOUSANDS: `1 299$ 00`, `1 299$ 00` and `$1 299.00` are flagged and never verified', () => {
  for (const t of ['1 299$ 00', '1 299$ 00', '$1 299.00', '$1 299.00']) {
    const { row, drops } = verifiedOf([clean([[t, 130], ['Clean Product 500 g', 165]])]);
    if (row) {
      assert.equal(row.price_verified, 0, t);
      assert.match(String(row.flags), /space_thousands/, t);
    } else {
      assert.equal(drops.length, 1, t);
    }
  }
});

test('NO SILENT LOSS: every product link, slug or not, is a tile, and every product a row or a drop', () => {
  const links: RawLink[] = [
    clean(),
    { ...clean(), uri: 'https://www.walmart.ca/en/ip/6000900000063', bbox: [200, 0, 390, 240] },
    { ...clean(), uri: 'https://www.walmart.ca/ip/item/6000900000065', bbox: [400, 0, 590, 240] },
    { ...clean(), uri: 'https://www.walmart.ca/en/ip/Has-A-Slug-But-No-Id', bbox: [600, 0, 790, 240] },
    { ...clean(), uri: 'https://www.walmart.ca/en/browse/grocery', bbox: [800, 0, 990, 240] },
  ];
  const db = openPrices(':memory:');
  const r = intakeRaw(db, printout(links), { filePath: 'x.pdf' });
  const productLinks = links.filter((l) => /\/ip\//.test(l.uri)).length;
  const tiles = (db.prepare('SELECT COUNT(*) n FROM capture_tile').get() as { n: number }).n;
  assert.equal(tiles, productLinks, 'links in = tiles');
  assert.equal(r.otherLinks, 1);
  const products = (db.prepare('SELECT DISTINCT retailer_product_id p FROM capture_tile').all() as { p: string }[]).map((x) => x.p);
  const rows = (db.prepare('SELECT seller_sku s FROM observation').all() as { s: string }[]).map((x) => x.s);
  const drops = (db.prepare('SELECT retailer_product_id p, reason FROM capture_drop').all() as { p: string; reason: string }[]);
  for (const p of products) assert.ok(rows.includes(p) || drops.some((d) => d.p === p), `${p} vanished`);
  assert.equal(rows.length + drops.length, products.length, 'tiles in = rows + drops, per product');
  assert.ok(drops.some((d) => d.p === '6000900000063' && d.reason === 'no_name_in_link'));
  assert.ok(drops.some((d) => d.p.startsWith('?') && d.reason === 'no_product_id'));
  db.close();
});

test('STORES NEVER MERGE: one product, one day, two stores is one row flagged and a logged drop, never a merge', () => {
  const db = openPrices(':memory:');
  intakeRaw(db, printout([clean()], 'e'.repeat(64)), { filePath: 'kanata.pdf', store: 'Kanata' });
  intakeRaw(db, printout([clean([['6$ 97', 130], ['Clean Product 500 g', 165]])], 'f'.repeat(64)), { filePath: 'orleans.pdf', store: 'Orleans' });
  const rows = db.prepare('SELECT price_cents, store_name, price_verified, flags FROM observation').all() as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].price_cents, rows[0].store_name, rows[0].price_verified], [497, 'Kanata', 0]);
  assert.match(String(rows[0].flags), /other_store_same_day/);
  const drops = db.prepare('SELECT store, reason FROM capture_drop').all() as Record<string, unknown>[];
  assert.deepEqual(drops.map((d) => [d.store, d.reason]), [['Orleans', 'same_key_other_store']]);
  assert.equal(checkRebuild(db).ok, true, JSON.stringify(checkRebuild(db)));
  db.close();
  // Two unknown-store captures are two possible stores: the same rule.
  const db2 = openPrices(':memory:');
  intakeRaw(db2, printout([clean()], '1'.repeat(64)), { filePath: 'a.pdf' });
  intakeRaw(db2, printout([clean()], '2'.repeat(64)), { filePath: 'b.pdf' });
  assert.deepEqual(
    (db2.prepare('SELECT reason FROM capture_drop').all() as { reason: string }[]).map((d) => d.reason),
    ['same_key_other_store'],
  );
  db2.close();
});

const ADVERSARIAL_SCRIPT = fileURLToPath(new URL('../scripts/make-adversarial-fixtures.py', import.meta.url));

test('ADVERSARIAL: the third audit\'s 54 printouts store no verified wrong price and lose no product', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'shin-adversarial-'));
  execFileSync(pythonCommand(), [ADVERSARIAL_SCRIPT, dir]);
  const expect = JSON.parse(readFileSync(join(dir, 'expect.json'), 'utf8')) as Record<string, { expect: Record<string, number | string | null> }>;
  const wrong: string[] = [];
  const lost: string[] = [];
  let verified = 0;
  let cases = 0;
  for (const [name, { expect: truth }] of Object.entries(expect)) {
    cases += 1;
    const db = openPrices(':memory:');
    const pdf = join(dir, `${name}.pdf`);
    const raw = readPrintout(pdf);
    intakeRaw(db, raw, { filePath: pdf });
    const tiles = (db.prepare('SELECT COUNT(*) n FROM capture_tile').get() as { n: number }).n;
    assert.equal(tiles, raw.links.filter((l) => /\/ip\//.test(l.uri)).length, `${name}: product links in = tiles`);
    for (const [pid, want] of Object.entries(truth)) {
      const row = db.prepare('SELECT price_cents, price_verified FROM observation WHERE seller_sku = ?').get(pid) as
        | { price_cents: number; price_verified: number }
        | undefined;
      const drop = db.prepare('SELECT 1 FROM capture_drop WHERE retailer_product_id = ?').get(pid);
      if (!row && !drop) lost.push(`${name}/${pid}`);
      if (row?.price_verified === 1) {
        verified += 1;
        if (row.price_cents !== want) wrong.push(`${name}/${pid}: verified ${row.price_cents}, true ${want}`);
      }
    }
    assert.equal(checkRebuild(db).ok, true, `${name}: rebuild check`);
    db.close();
  }
  assert.equal(cases, 54);
  assert.deepEqual(wrong, [], 'price_verified = 1 with a wrong price');
  assert.deepEqual(lost, [], 'a product link that became neither a row nor a drop');
  // No synthetic case carries a unit price that agrees with its shelf price, so under the
  // two-reads rule none verifies; the rule is exercised by the VERIFIED tests above.
  assert.equal(verified, 0, 'a synthetic case verified: it must carry an agreeing unit price by construction');
});
