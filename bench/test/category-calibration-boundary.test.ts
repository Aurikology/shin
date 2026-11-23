/**
 * category_calibration at the float boundary: wilson(n, n).high rounds to
 * 0.9999999999999999 for many n, so a perfect hit rate against a claim of 1
 * must not read as "claim above the interval".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { loadObservations } from '../src/data.ts';
import { buildPredictionKey, buildSaleKey } from '../src/keys.ts';
import { isFold, splitByProduct, type Fold } from '../src/split.ts';
import { runControls } from '../src/controls.ts';
import { wilson } from '../src/audit.ts';
import { gate, scoreAll, type PointResult } from '../src/score.ts';
import { NEW, OLD, SHOPS, fixtureRow, noSealed } from './fixture.ts';

const iv = { lowCents: 100, highCents: 200, midCents: 141 };

/** One category of `products` products, `hit` of them inside the range, the rest outside. */
function category(products: number, hit: number): PointResult[] {
  return Array.from({ length: products }, (_, i) => ({ key: `p${i}`, category: 'x', realCents: i < hit ? 150 : 500, interval: iv }));
}
const catFailure = (pts: PointResult[], claim: number) => gate(scoreAll(pts, [], claim), null).failures.includes('category_calibration');

test('category_calibration: a category of 31 or 100 products all hit against a claim of 1 is not flagged', () => {
  assert.equal(catFailure(category(31, 31), 1), false);
  assert.equal(catFailure(category(100, 100), 1), false);
});

test('category_calibration: a category clearly under-covering (20 of 40 hit, claim 0.9) is still flagged', () => {
  assert.equal(catFailure(category(40, 20), 0.9), true);
});

test('category_calibration: a category clearly over-covering for a real model (40 of 40 hit, claim 0.5) is still flagged', () => {
  assert.equal(catFailure(category(40, 40), 0.5), true);
});

test('7.6 the oracle passes known_good on a fold with a 100-product category', () => {
  const db: DatabaseSync = openPrices(':memory:');
  const cat = new DatabaseSync(':memory:');
  cat.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT,
    category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = cat.prepare('INSERT INTO product (code, name, quantity, size_value, size_unit, category_path, leaf_category) VALUES (?,?,?,?,?,?,?)');
  for (let j = 0; j < 270; j++) {
    const code = `88${String(j).padStart(10, '0')}`;
    const base = Math.round(300 * (1 + 0.01 * j));
    ins.run(code, `item ${code}`, '500 g', 500, 'g', JSON.stringify(['en:root', 'en:big']), 'en:big');
    for (const s of SHOPS) {
      const c = s.seller === 'B' ? '0' + code : code;
      recordObservation(db, fixtureRow({ code: c, seller: s.seller, sellerSku: `${s.seller}-${code}`, priceCents: Math.round(base * s.factor), seenOn: OLD }));
      recordObservation(db, fixtureRow({ code: c, seller: s.seller, sellerSku: `${s.seller}-${code}`, priceCents: Math.round(base * s.factor * 1.01), seenOn: NEW }));
    }
    recordObservation(db, fixtureRow({ code, seller: 'A', sellerSku: `A-${code}`, priceCents: Math.round(base * 0.7), seenOn: '2026-09-16', kind: 'promotional' }));
  }
  const obs = loadObservations(db);
  const fold = splitByProduct(obs, buildPredictionKey(obs), buildSaleKey(obs), noSealed(), 0.5, 1);
  assert.ok(isFold(fold));
  const n = (fold as Fold).testKeys.size;
  assert.ok(wilson(n, n).high < 1, `precondition: wilson(${n}, ${n}).high must round below 1 for this test to bite`);
  const rep = runControls(fold as Fold, { catalogue: cat });
  const kg = rep.results.find((r) => r.name === 'known_good')!;
  assert.ok(kg.hitRate === 1, kg.reason);
  assert.equal(kg.status, 'ok', kg.reason);
});
