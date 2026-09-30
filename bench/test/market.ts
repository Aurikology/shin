// Synthetic A1-shaped market, copied from the 2026-09-28 bench audit probe (benchaudit/probe/market.ts) as a standing fixture.
import { DatabaseSync } from 'node:sqlite';
import { openPrices, recordObservation } from '../../price/src/store.ts';
import { rng } from '../src/audit.ts';

export interface MarketOpts { seed?: number; perCat?: number; catalogueLeaves?: number; smallCats?: boolean }

function gauss(r: () => number) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function upc(n: number): string {
  const body = ('6' + String(n).padStart(10, '0')).slice(0, 11);
  let s = 0; for (let i = 0; i < 11; i++) s += Number(body[i]) * (i % 2 === 0 ? 3 : 1);
  return body + String((10 - (s % 10)) % 10);
}
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

export const SHOPS = [
  { seller: 'S1', f: 1.0, promo: true, ean13: true },
  { seller: 'S2', f: 1.04, promo: true, ean13: false },
  { seller: 'S3', f: 0.97, promo: false, ean13: false },
  { seller: 'S4', f: 1.07, promo: false, ean13: false },
  { seller: 'S5', f: 0.95, promo: false, ean13: false },
];

export function buildMarket(o: MarketOpts = {}) {
  const r = rng(o.seed ?? 7);
  const perCat = o.perCat ?? 60;
  const cats = [
    { leaf: 'en:wine', lo: 1200, hi: 4000 }, { leaf: 'en:snacks', lo: 150, hi: 900 }, { leaf: 'en:cheese', lo: 400, hi: 2500 },
    { leaf: 'en:cereal', lo: 300, hi: 900 }, { leaf: 'en:tools', lo: 1500, hi: 30000 }, { leaf: 'en:soda', lo: 99, hi: 700 },
  ];
  const prices = openPrices(':memory:');
  const cat = new DatabaseSync(':memory:');
  cat.exec(`CREATE TABLE product (code TEXT PRIMARY KEY, name TEXT NOT NULL, quantity TEXT, size_value REAL, size_unit TEXT, category_path TEXT NOT NULL DEFAULT '[]', leaf_category TEXT)`);
  const ins = cat.prepare('INSERT INTO product VALUES (?,?,?,?,?,?,?)');
  const weeks = Array.from({ length: 26 }, (_, i) => addDays('2026-03-02', 7 * i));
  let n = 0;
  const truth: { code: string; leaf: string; base: number; prone: boolean }[] = [];
  prices.exec('BEGIN');
  for (const c of cats) {
    for (let j = 0; j < perCat; j++) {
      const code = upc(++n);
      const base = Math.exp(Math.log(c.lo) + r() * (Math.log(c.hi) - Math.log(c.lo)));
      const prone = r() < 0.35;
      truth.push({ code, leaf: c.leaf, base, prone });
      const leaf = o.smallCats ? `${c.leaf}-${j % 4}` : c.leaf;
      ins.run(code, `item ${n}`, null, null, null, JSON.stringify(['en:root', c.leaf, ...(o.smallCats ? [leaf] : [])]), leaf);
      for (const s of SHOPS) {
        const persist = gauss(r) * 0.04;
        for (const w of weeks) {
          if (r() > 0.3) continue;
          const reg = Math.max(1, Math.round(base * s.f * Math.exp(persist + gauss(r) * 0.02)));
          const sale = s.promo && prone && r() < 0.25;
          const cents = sale ? Math.round(reg * (0.7 + 0.15 * r())) : reg;
          recordObservation(prices, {
            code: s.ean13 ? '0' + code : code, seller: s.seller, sellerSku: `${s.seller}-${code}`, sellerName: `item ${n}`, sellerBrand: null,
            priceCents: cents, kind: sale ? 'promotional' : 'regular', unitPriceCents: null, unitLabel: null, currency: 'CAD', country: 'CA',
            region: null, joinMethod: 'gtin', seenOn: w, url: null, imageUrl: null, inStock: null,
            ...(sale && r() < 0.5 ? { wasCents: reg, isSale: 1 } : sale ? { isSale: 1 } : { isSale: 0 }),
          } as any);
        }
      }
    }
  }
  prices.exec('COMMIT');
  return { prices, catalogue: cat, truth, weeks };
}
