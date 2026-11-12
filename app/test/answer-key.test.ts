/**
 * THE ANSWER KEY, on a small made-up catalogue (scripts/answer-key). For products with a barcode the right
 * answer is known, so each is typed in several forms into the real server and the answers are checked: a typed
 * name that names a DIFFERENT product must never be confident (R2), and so on (rules in
 * scripts/answer-key/core.ts). The made-up catalogue holds the shapes that went wrong live on 2026-11-11
 * (milk / 2% milk / coconut milk, the Kraft Dinner box / 12-pack, see wrong-product-answers.test.ts) and five
 * more near-duplicate pairs. The runner points every store at a temp folder, serves a prices file it wrote
 * itself, and makes a model call impossible; no real data and no model is touched.
 *
 * NEGATIVE CONTROL: a check that has never been seen to fail is not a check, so one test hands the checker an
 * answer that names Coconut Milk with confidence 'high' for "milk" and asserts it IS flagged R2. A second one
 * was done by hand when this was written: ceee6d1's fix reverted, this file went red on the milk and Kraft
 * Dinner products (recorded in the commit that added it).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProduct, codeKey, listFindings, readsAs, readAnswer, wrongWordName, type AskResult, type Asker, type KeyProduct, type ListAnswer, type ListRow, type Lister } from '../../scripts/answer-key/core.ts';
import { runAnswerKey } from '../../scripts/answer-key/run.mts';
import { buildSynthetic, LIST_PROBES, LOOKALIKE_ROWS, SYNTHETIC_ROWS } from '../../scripts/answer-key/synthetic.ts';

const asKey = (code: string): KeyProduct => {
  const r = SYNTHETIC_ROWS.find((x) => x.code === code)!;
  const sorted = [...r.prices].sort((a, b) => a - b);
  return { code: r.code, name: r.name, brand: r.brand, size: r.quantity, medianCents: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, sizeValue: r.sizeValue, sizeUnit: r.sizeUnit };
};

test('answer key: no typed form of any made-up product answers confidently with a different product', async () => {
  const products = SYNTHETIC_ROWS.map((r) => asKey(r.code));
  const result = await runAnswerKey({
    cataloguePath: null,
    pricesPath: null,
    products,
    buildInjected: (dir) => buildSynthetic(dir),
    concurrency: 2,
    quiet: true,
    listProbes: LIST_PROBES,
  });
  const detail = () => JSON.stringify(result.summary?.findings.filter((f) => f.rule === 'R2' || f.rule === 'R1' || f.rule === 'R6' || f.rule === 'R7' || f.rule === 'ERR').slice(0, 5), null, 1);
  assert.equal(result.failures.length, 0, `${result.failures.join(' | ')}\n${detail()}`);
  assert.equal(result.summary?.productsChecked, products.length);
  assert.ok((result.summary?.asks ?? 0) >= products.length * 6, 'a run that asks almost nothing must not pass');
  assert.equal(result.summary?.perRule.R2, 0, detail());
  assert.equal(result.summary?.perRule.R1, 0, detail());
  assert.equal(result.summary?.perRule.R6, 0, detail());
  assert.equal(result.summary?.perRule.R7, 0, detail());
  assert.equal(result.summary?.perRule.ERR, 0, detail());
  assert.equal(result.modelCalls, 0, 'a model was called');
  assert.equal(result.exitCode, 0);
});

test('answer key: a run that checks nothing is a failure, never a pass', async () => {
  const result = await runAnswerKey({ cataloguePath: null, pricesPath: null, products: [], buildInjected: (dir) => buildSynthetic(dir), quiet: true });
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join(' '), /zero products/);
});

test('negative control: "milk" answered as Coconut Milk with confidence high IS flagged R2', async () => {
  const milk = asKey(SYNTHETIC_ROWS[0].code);
  const coconut = SYNTHETIC_ROWS[2];
  const okBarcode: AskResult = {
    status: 200, ms: 1, error: null,
    json: { identity: { barcode: milk.code, name: milk.name, brand: milk.brand, size: milk.size }, verdict: { basis: 'own_prices', confidence: 'high', centreCents: 299 } },
  };
  const wrong: AskResult = {
    status: 200, ms: 1, error: null,
    json: {
      identity: { barcode: coconut.code, name: coconut.name, brand: coconut.brand, size: coconut.quantity },
      verdict: { kind: 'distribution', basis: 'own_prices', confidence: 'high', centreCents: 299 },
      range: { basis: 'this_product', medianCents: 299 },
    },
  };
  const ask: Asker = async (kind) => (kind === 'barcode' ? okBarcode : wrong);
  const { findings } = await checkProduct(milk, ask, 'negative-control');
  const r2 = findings.filter((f) => f.rule === 'R2');
  assert.ok(r2.length > 0, 'the checker missed a confidently wrong answer');
  assert.ok(r2.some((f) => f.variant === 'name' && f.text === 'Milk'), 'the typed "Milk" case was not flagged');
  assert.match(r2[0].why, /Coconut Milk/);
  assert.match(r2[0].repro, /^\/api\/identify\?text=/);
});

test('negative control: a guessed, low-confidence answer for another product is not flagged', async () => {
  const milk = asKey(SYNTHETIC_ROWS[0].code);
  const coconut = SYNTHETIC_ROWS[2];
  const ok = readAnswer({ identity: { barcode: milk.code, name: milk.name, brand: milk.brand, size: milk.size } });
  assert.equal(ok.named?.name, 'Milk');
  const guessed: AskResult = {
    status: 200, ms: 1, error: null,
    json: { identity: { barcode: coconut.code, name: coconut.name, brand: coconut.brand, size: coconut.quantity }, verdict: { basis: 'category', confidence: 'low' } },
  };
  const barcode: AskResult = { status: 200, ms: 1, error: null, json: { identity: { barcode: milk.code, name: milk.name, brand: milk.brand, size: milk.size } } };
  const { findings } = await checkProduct(milk, async (kind) => (kind === 'barcode' ? barcode : guessed), 'control');
  assert.equal(findings.filter((f) => f.rule === 'R2').length, 0);
});

/* ---------------------------------------------------------------- R6: a wrong-word form is never confident (D-074) */

const kraft = () => asKey(SYNTHETIC_ROWS.find((r) => r.name === 'Kraft Dinner Original')!.code);
const barcodeOk = (p: KeyProduct): AskResult => ({ status: 200, ms: 1, error: null, json: { identity: { barcode: p.code, name: p.name, brand: p.brand, size: p.size } } });
const row = (p: KeyProduct): ListRow => ({ code: p.code, name: p.name, brand: p.brand, size: p.size });

test('negative control R6: the in-process search answering confident to brand, size and one wrong word IS flagged', async () => {
  const p = kraft();
  const confident: Lister = async () => ({ band: 'confident', rows: [row(p)], error: null });
  const { findings } = await checkProduct(p, async () => barcodeOk(p), 'r6-control', 'British Columbia', { pinned: confident });
  const r6 = findings.filter((f) => f.rule === 'R6');
  assert.equal(r6.length, 1, JSON.stringify(findings.map((f) => f.rule)));
  assert.equal(r6[0].text, wrongWordName(p.name));
  // and the same search answering ambiguous (what the shipped band does) is not
  const ambiguous: Lister = async () => ({ band: 'ambiguous', rows: [row(p)], error: null });
  const clean = await checkProduct(p, async () => barcodeOk(p), 'r6-control', 'British Columbia', { pinned: ambiguous });
  assert.equal(clean.findings.filter((f) => f.rule === 'R6').length, 0);
});

test('negative control R6: the typed route naming the product at medium confidence for a wrong-word form IS flagged', async () => {
  const p = kraft();
  const ask: Asker = async (kind, value) =>
    kind === 'barcode' || !value.includes(wrongWordName(p.name))
      ? barcodeOk(p)
      : { status: 200, ms: 1, error: null, json: { identity: { barcode: p.code, name: p.name, brand: p.brand, size: p.size }, verdict: { basis: 'category', confidence: 'medium' } } };
  const { findings } = await checkProduct(p, ask, 'r6-http-control');
  const r6 = findings.filter((f) => f.rule === 'R6');
  assert.equal(r6.length, 1);
  assert.equal(r6[0].variant, 'wrong');
});

/* ---------------------------------------------------------------- R7: no two rows of a typed list read the same (D-245) */

test('what a shopper reads: repeated words once, size spelled one way, order kept', () => {
  assert.equal(readsAs('Oreo', 'Oreo / OREO', null), readsAs('OREO', 'Oreo', ''));
  assert.equal(readsAs('Kraft', 'Dinner', '225 g'), readsAs('kraft', 'DINNER', '225g'));
  assert.notEqual(readsAs(null, 'Chocolate Milk', null), readsAs(null, 'Milk Chocolate', null));
  assert.notEqual(readsAs('Kraft', 'Dinner', '225 g'), readsAs('Kraft', 'Dinner', '12 x 225 g'));
});

test('negative control R7: a list holding "Oreo / OREO" and "Oreo" IS flagged, a list of distinct rows is not', async () => {
  const [a, b] = LOOKALIKE_ROWS;
  const dup: Lister = async (): Promise<ListAnswer> => ({
    band: 'ambiguous', error: null,
    rows: [{ code: a.code, name: a.name, brand: a.brand, size: null }, { code: b.code, name: b.name, brand: b.brand, size: null }],
  });
  const found = await listFindings('oreo', dup, '', 'list');
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'R7');
  const distinct: Lister = async () => ({
    band: 'ambiguous', error: null,
    rows: [{ code: '1', name: 'Milk', brand: 'Dairyco', size: '2 L' }, { code: '2', name: 'Milk', brand: 'Dairyco', size: '4 L' }],
  });
  assert.equal((await listFindings('milk', distinct, '', 'list')).length, 0);
  const failed: Lister = async () => ({ band: null, rows: [], error: 'http 500' });
  assert.equal((await listFindings('milk', failed, '', 'list'))[0].rule, 'ERR', 'a list that could not be fetched must be a finding, not a pass');
});

test('the made-up catalogue really holds the lookalike rows R7 needs, so the R7 pass above is not an empty list', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const syn = await buildSynthetic(mkdtempSync(join(tmpdir(), 'ak-lookalike-')));
  const have = syn.db.prepare('SELECT count(*) AS n FROM product WHERE code IN (?, ?)').get(LOOKALIKE_ROWS[0].code, LOOKALIKE_ROWS[1].code) as { n: number };
  assert.equal(have.n, 2);
  assert.ok(LIST_PROBES.length > 0);
});

// 2026-11-12, real catalogue: "06999108" answered as 0069000009918 was counted a different product; it is the
// same Pepsi 591 ml, UPC-E and its long UPC-A form. An EAN-8 whose UPC-E reading fails its check digit stays itself.
test('a UPC-E and its UPC-A are one code to the key', () => {
  assert.equal(codeKey('06999108'), codeKey('0069000009918'));
  assert.equal(codeKey('06748605'), codeKey('0067000004865'));
  assert.equal(codeKey('05630804'), codeKey('0056000003084'));
  assert.equal(codeKey('00008735'), '8735');
});
