/**
 * Hold-out validation of price/src/hammer-match.ts. Hides the barcode of every with-barcode Hammer product,
 * matches it against the with-barcode products of the OTHER chains, and compares with the true barcode.
 *
 *   node price/scripts/hammer-match-eval.ts <dir with hammer-4-product.csv> [minScore] [margin]
 *
 * With no bar given it prints a sweep over the tuning half. With a bar it reports that bar on the other half
 * (split by a hash of the product id, so no product is in both), prints 20 random accepted matches and every
 * wrong one in a random sample of 200 accepted matches, plus every wrong one overall.
 *
 * "Matchable" rows are those whose true barcode is carried, with a parseable size, by a product at another
 * chain: only those CAN be matched, so recall is reported over them and over all rows.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readProducts } from '../src/hammer.ts';
import { HammerMatcher, decide, parseSizes, type MatchProduct, type RankOutcome } from '../src/hammer-match.ts';

function half(id: string): 0 | 1 {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return ((h >>> 11) & 1) as 0 | 1;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node price/scripts/hammer-match-eval.ts <dir> [minScore] [margin]'); process.exit(2); }
const products = [...readProducts(readFileSync(join(dir, 'hammer-4-product.csv'), 'utf8')).values()];
// INDEP=1: chains of one company (Loblaws and No Frills, Sobeys and Voila) do not vouch for each other, since their barcodes were found the same way.
const GROUP: Record<string, string> = { Loblaws: 'loblaw', NoFrills: 'loblaw', Sobeys: 'sobeys', Voila: 'sobeys' };
const matcher = new HammerMatcher(products, { minScore: 0, margin: -1 }, process.env.INDEP ? (v) => GROUP[v] ?? v : undefined);
const withCode = products.filter((p) => p.code !== null);

// Which barcodes does each chain carry with a parseable size?
const chainsOf = new Map<string, Set<string>>();
for (const p of withCode) {
  if (parseSizes(p.units, p.name).length === 0) continue;
  const s = chainsOf.get(p.code!) ?? new Set();
  s.add(p.vendor);
  chainsOf.set(p.code!, s);
}

interface Row { p: MatchProduct; r: RankOutcome; matchable: boolean; half: 0 | 1 }
const rows: Row[] = [];
for (const p of withCode) {
  const chains = chainsOf.get(p.code!);
  const matchable = !!chains && [...chains].some((v) => (process.env.INDEP ? (GROUP[v] ?? v) !== (GROUP[p.vendor] ?? p.vendor) : v !== p.vendor)) && parseSizes(p.units, p.name).length > 0;
  rows.push({ p, r: matcher.rank(p), matchable, half: half(p.id) });
}

function run(sel: Row[], minScore: number, margin: number) {
  let accepted = 0;
  let right = 0;
  let matchable = 0;
  const wrong: Array<{ row: Row; res: Extract<ReturnType<typeof decide>, { ok: true }>['result'] }> = [];
  const acc: Array<{ row: Row; res: Extract<ReturnType<typeof decide>, { ok: true }>['result']; ok: boolean }> = [];
  for (const row of sel) {
    if (row.matchable) matchable++;
    if (!row.r.ok) continue;
    const d = decide(row.r, { minScore, margin });
    if (!d.ok) continue;
    accepted++;
    const ok = d.result.code === row.p.code;
    if (ok) right++;
    else wrong.push({ row, res: d.result });
    acc.push({ row, res: d.result, ok });
  }
  return { n: sel.length, accepted, right, matchable, wrong, acc };
}

function pct(a: number, b: number): string {
  return b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(2)}%`;
}

const tune = rows.filter((r) => r.half === 0);
const test = rows.filter((r) => r.half === 1);
console.log(`with-barcode products ${rows.length}; tuning half ${tune.length}; test half ${test.length}; matchable ${rows.filter((r) => r.matchable).length}`);

if (process.argv[3] === undefined) {
  console.log('minScore margin accepted precision recall(matchable)');
  for (const minScore of [0.8, 0.85, 0.9, 0.95, 0.999]) {
    for (const margin of [0.15, 0.25, 0.35, 0.45, 0.6]) {
      const x = run(tune, minScore, margin);
      console.log(`${minScore} ${margin} ${x.accepted} ${pct(x.right, x.accepted)} ${pct(x.right, x.matchable)}`);
    }
  }
} else {
  const minScore = Number(process.argv[3]);
  const margin = Number(process.argv[4] ?? 0.15);
  for (const [label, sel] of [['TUNING half', tune], ['TEST half (not used for tuning)', test], ['ALL', rows]] as const) {
    const x = run(sel, minScore, margin);
    console.log(`${label}: bar ${minScore}/${margin}: rows ${x.n}, accepted ${x.accepted}, correct ${x.right}, precision ${pct(x.right, x.accepted)}, recall over matchable ${pct(x.right, x.matchable)} (${x.matchable}), recall over all ${pct(x.right, x.n)}`);
  }
  const all = run(rows, minScore, margin);
  const byVendor: Record<string, { acc: number; right: number }> = {};
  for (const a of all.acc) {
    const v = (byVendor[a.row.p.vendor] ??= { acc: 0, right: 0 });
    v.acc++;
    if (a.ok) v.right++;
  }
  for (const [v, x] of Object.entries(byVendor)) console.log(`  query chain ${v}: accepted ${x.acc}, precision ${pct(x.right, x.acc)}`);
  const bucket = (label: string, f: (a: (typeof all.acc)[number]) => boolean): void => {
    const sel = all.acc.filter(f);
    console.log(`  ${label}: accepted ${sel.length}, precision ${pct(sel.filter((a) => a.ok).length, sel.length)}`);
  };
  bucket('1 chain backs it', (a) => a.res.chains === 1);
  bucket('2 chains back it', (a) => a.res.chains === 2);
  bucket('3+ chains back it', (a) => a.res.chains >= 3);
  bucket('score 1.00', (a) => a.res.score >= 0.999);
  bucket('score under 1.00', (a) => a.res.score < 0.999);
  const DIRECT = new Set(['Metro', 'Galleria', 'SaveOnFoods']);
  bucket('a vendor-direct barcode backs it (Metro, Galleria, Save-On)', (a) => a.res.vendors.some((v) => DIRECT.has(v)));
  bucket('only fuzzy-joined barcodes back it', (a) => !a.res.vendors.some((v) => DIRECT.has(v)));
  bucket('direct-backed, 2+ chains', (a) => a.res.chains >= 2 && a.res.vendors.some((v) => DIRECT.has(v)));
  bucket('direct-backed, 1 chain', (a) => a.res.chains === 1 && a.res.vendors.some((v) => DIRECT.has(v)));
  bucket('fuzzy only, 2+ chains', (a) => a.res.chains >= 2 && !a.res.vendors.some((v) => DIRECT.has(v)));
  bucket('fuzzy only, 1 chain', (a) => a.res.chains === 1 && !a.res.vendors.some((v) => DIRECT.has(v)));
  bucket('query is a direct vendor', (a) => DIRECT.has(a.row.p.vendor));
  bucket('query is a direct vendor and a direct vendor backs it', (a) => DIRECT.has(a.row.p.vendor) && a.res.vendors.some((v) => DIRECT.has(v)));
  console.log('  grid (chains backing x score band): accepted / precision');
  for (const c of [1, 2, 3]) {
    const cells: string[] = [];
    for (const [lo, hi] of [[0, 0.9], [0.9, 0.999], [0.999, 2]]) {
      const sel = all.acc.filter((a) => (c === 3 ? a.res.chains >= 3 : a.res.chains === c) && a.res.score >= lo && a.res.score < hi);
      cells.push(`${sel.length}/${pct(sel.filter((a) => a.ok).length, sel.length)}`);
    }
    console.log(`   chains ${c}${c === 3 ? '+' : ' '}: score<0.9 ${cells[0]}   0.9-0.999 ${cells[1]}   1.0 ${cells[2]}`);
  }
  const rand = rng(20261114);
  const pool = [...all.acc];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const show = (a: (typeof pool)[number]) =>
    `${a.ok ? 'OK   ' : 'WRONG'} ${a.row.p.vendor} | ${a.row.p.brand} | ${a.row.p.name} | ${a.row.p.units}  ==>  ${a.res.twin.vendor} | ${a.res.twin.brand} | ${a.res.twin.name} | ${a.res.twin.units}  score ${a.res.score.toFixed(2)} runner ${a.res.runnerUp.toFixed(2)} chains ${a.res.chains}` +
    (a.ok ? '' : `  true ${a.row.p.code} got ${a.res.code}`);
  console.log('\n--- 20 random accepted matches');
  for (const a of pool.slice(0, 20)) console.log(show(a));
  const sample = pool.slice(0, 200);
  console.log(`\n--- wrong ones in a random sample of 200 accepted (${sample.filter((a) => !a.ok).length})`);
  for (const a of sample.filter((a) => !a.ok)) console.log(show(a));
  const shown = Number(process.env.NWRONG ?? 60);
  console.log(`\n--- every wrong one overall (${all.wrong.length}), first ${shown}`);
  for (const a of pool.filter((a) => !a.ok).slice(0, shown)) console.log(show(a));
}
