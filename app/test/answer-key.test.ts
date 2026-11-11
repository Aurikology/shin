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
import { checkProduct, readAnswer, type AskResult, type Asker, type KeyProduct } from '../../scripts/answer-key/core.ts';
import { runAnswerKey } from '../../scripts/answer-key/run.mts';
import { buildSynthetic, SYNTHETIC_ROWS } from '../../scripts/answer-key/synthetic.ts';

const asKey = (code: string): KeyProduct => {
  const r = SYNTHETIC_ROWS.find((x) => x.code === code)!;
  const sorted = [...r.prices].sort((a, b) => a - b);
  return { code: r.code, name: r.name, brand: r.brand, size: r.quantity, medianCents: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null };
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
  });
  const detail = () => JSON.stringify(result.summary?.findings.filter((f) => f.rule === 'R2' || f.rule === 'R1' || f.rule === 'ERR').slice(0, 5), null, 1);
  assert.equal(result.failures.length, 0, `${result.failures.join(' | ')}\n${detail()}`);
  assert.equal(result.summary?.productsChecked, products.length);
  assert.ok((result.summary?.asks ?? 0) >= products.length * 6, 'a run that asks almost nothing must not pass');
  assert.equal(result.summary?.perRule.R2, 0, detail());
  assert.equal(result.summary?.perRule.R1, 0, detail());
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
