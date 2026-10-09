/**
 * 7.7 Check the answer key by hand before scoring: under 2% wrong.
 *
 * THE BOUND. The key passes when a one-sided 95% exact upper bound on its
 * error rate is under 2%. For a large key that is the Clopper-Pearson bound
 * (binomial); for a key of N rows it is the exact hypergeometric bound (the
 * sample is drawn without replacement from those N rows). The sample size is
 * the smallest n for which finding `allowedWrong` wrong rows (default 0)
 * would still prove the bar: P(X <= allowedWrong | the key is just failing)
 * <= 5%. For a large key and 0 wrong that is n = 149 (0.98^149 = 0.049).
 * A key too small to sample is checked in full (a census): the rate is then
 * exact.
 *
 * FRESH EACH ROUND. Every round draws a new uniform random sample from the
 * key as it stands, from a recorded seed; a seed already used in an earlier
 * round is refused. Re-reading the rows of the last round would pass a key
 * whose only fixes were the rows that round happened to find.
 *
 * NOTHING HERE LABELS A ROW. The sheet is written with every hand column
 * blank; the scorer counts only `right` or `wrong` written by a person, and
 * a sheet with any blank or unreadable verdict is "incomplete", never a pass.
 * The older re-read sheet (bench/results/reread-sheet.csv) is not read: its
 * 2026-09-30 marks were made by Claude, not a person, so they are not a hand
 * audit.
 *
 * The sheet shows the row as the key holds it, plus, for a sale, the regular
 * price the key paired it with (that pairing is part of what can be wrong).
 * It does NOT show the audit's flags or disagreement, so the person is not
 * anchored on them.
 */

import { createHash, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, rng, rowId, type AuditRow } from './audit.ts';

/** Requirement 7.7: under 2% wrong. */
export const ERROR_BAR = 0.02;
/** One-sided confidence for the bound. DEFAULT, changeable by Jamin. */
export const CONFIDENCE = 0.95;

/* ------------------------------------------------------------ the maths */

const lf: number[] = [0];
function logFact(n: number): number {
  for (let i = lf.length; i <= n; i++) lf[i] = lf[i - 1]! + Math.log(i);
  return lf[n]!;
}
const logC = (n: number, k: number) => (k < 0 || k > n ? -Infinity : logFact(n) - logFact(k) - logFact(n - k));

/** P(X <= k), X ~ Binomial(n, p). */
export function binomialCdf(k: number, n: number, p: number): number {
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let s = 0;
  for (let x = 0; x <= k; x++) s += Math.exp(logC(n, x) + x * Math.log(p) + (n - x) * Math.log(1 - p));
  return Math.min(1, s);
}

/** P(X <= k), X the wrong rows in a sample of n drawn without replacement from N rows of which D are wrong. */
export function hypergeometricCdf(k: number, N: number, D: number, n: number): number {
  let s = 0;
  const den = logC(N, n);
  for (let x = 0; x <= Math.min(k, n, D); x++) s += Math.exp(logC(D, x) + logC(N - D, n - x) - den);
  return Math.min(1, s);
}

export interface SampleSize {
  readonly n: number;
  readonly method: 'binomial' | 'hypergeometric';
  readonly census: boolean;
  /** For a finite key: the fewest wrong rows that make it fail the bar (ceil(bar x N)). */
  readonly failingWrong: number | null;
  readonly allowedWrong: number;
  readonly statement: string;
}

/** The smallest sample that proves "under `bar` wrong" at `confidence` if at most `allowedWrong` wrong rows are found. */
export function requiredSampleSize(o: { population?: number; allowedWrong?: number; bar?: number; confidence?: number }): SampleSize {
  const k = o.allowedWrong ?? 0;
  const bar = o.bar ?? ERROR_BAR;
  const alpha = 1 - (o.confidence ?? CONFIDENCE);
  const conf = `${Math.round((1 - alpha) * 100)}%`;
  if (o.population === undefined) {
    let n = k + 1;
    while (binomialCdf(k, n, bar) > alpha) n++;
    return {
      n,
      method: 'binomial',
      census: false,
      failingWrong: null,
      allowedWrong: k,
      statement: `one-sided ${conf} exact (Clopper-Pearson) upper bound under ${bar * 100}%: ${n} rows with at most ${k} wrong`,
    };
  }
  const N = o.population;
  const D = Math.max(1, Math.ceil(bar * N - 1e-9));
  if (k >= D) throw new Error(`a key of ${N} rows fails at ${D} wrong rows; allowing ${k} can never prove the bar`);
  let n = k + 1;
  while (n < N && hypergeometricCdf(k, N, D, n) > alpha) n++;
  const census = n >= N;
  return {
    n: Math.min(n, N),
    method: 'hypergeometric',
    census,
    failingWrong: D,
    allowedWrong: k,
    statement: census
      ? `census of all ${N} rows (the key is too small to sample): passes with fewer than ${D} wrong`
      : `one-sided ${conf} exact hypergeometric upper bound under ${bar * 100}% of a ${N}-row key (fails at ${D} wrong): ${n} rows with at most ${k} wrong`,
  };
}

/**
 * One-sided upper bound on the key's error rate from `wrong` of `n` checked.
 * Binomial (Clopper-Pearson) without a population; hypergeometric with one
 * (exact, and equal to wrong / N on a census).
 */
export function upperBound(wrong: number, n: number, population?: number, confidence = CONFIDENCE): { rate: number; method: 'binomial' | 'hypergeometric' } {
  const alpha = 1 - confidence;
  if (population === undefined) {
    if (wrong >= n) return { rate: 1, method: 'binomial' };
    let lo = wrong / n;
    let hi = 1;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (binomialCdf(wrong, n, mid) > alpha) lo = mid;
      else hi = mid;
    }
    return { rate: hi, method: 'binomial' };
  }
  const N = population;
  // The largest count of wrong rows in the key still consistent with what was found.
  let D = wrong;
  while (D + 1 <= N - (n - wrong) && hypergeometricCdf(wrong, N, D + 1, n) > alpha) D++;
  return { rate: D / N, method: 'hypergeometric' };
}

/* ----------------------------------------------------------- the sample */

export interface HandAuditMeta {
  readonly kind: 'shin-bench-hand-audit';
  readonly round: number;
  readonly seed: number;
  readonly drawnOn: string;
  readonly population: number;
  /** sha256 of the sorted row ids of the whole key the sample was drawn from. */
  readonly populationSha256: string;
  readonly n: number;
  readonly census: boolean;
  readonly allowedWrong: number;
  readonly bar: number;
  readonly confidence: number;
  readonly bound: string;
  readonly rowIds: readonly string[];
}

export interface HandAuditSample {
  readonly meta: HandAuditMeta;
  readonly rows: readonly AuditRow[];
}

/** Draws this round's sample: uniform without replacement, sized by the bound, from a seed never used before. */
export function drawHandAudit(
  population: readonly AuditRow[],
  o: { round: number; seed?: number; drawnOn: string; allowedWrong?: number },
  previous: readonly Pick<HandAuditMeta, 'seed' | 'round'>[] = [],
): HandAuditSample {
  const seed = o.seed ?? randomInt(1, 2 ** 31 - 1);
  const used = previous.find((p) => p.seed === seed);
  if (used) throw new Error(`seed ${seed} was used in round ${used.round}; each round draws a fresh sample from a new seed`);
  const byId = new Map<string, AuditRow>();
  for (const r of population) byId.set(rowId(r), r);
  if (byId.size === 0) throw new Error('the key is empty: nothing to audit');
  const ids = [...byId.keys()].sort();
  const size = requiredSampleSize({ population: ids.length, ...(o.allowedWrong !== undefined ? { allowedWrong: o.allowedWrong } : {}) });
  const pool = [...ids];
  const rand = rng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, size.n);
  return {
    meta: {
      kind: 'shin-bench-hand-audit',
      round: o.round,
      seed,
      drawnOn: o.drawnOn,
      population: ids.length,
      populationSha256: createHash('sha256').update(ids.join('\n')).digest('hex'),
      n: size.n,
      census: size.census,
      allowedWrong: size.allowedWrong,
      bar: ERROR_BAR,
      confidence: CONFIDENCE,
      bound: size.statement,
      rowIds: picked,
    },
    rows: picked.map((id) => byId.get(id)!),
  };
}

export const SHEET_COLUMNS = [
  'row_id',
  'source',
  'code',
  'seller',
  'seller_sku',
  'shop',
  'name',
  'url',
  'seen_on',
  'price_cents',
  'claimed_regular_cents',
  'verdict',
  'correct_price_cents',
  'wrong_kind',
  'checked_by',
  'checked_on',
  'note',
] as const;

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The sheet a person fills in: `verdict` is `right` or `wrong`; `wrong_kind` says what was wrong. */
export function handAuditCsv(s: HandAuditSample): string {
  const lines = [SHEET_COLUMNS.join(',')];
  for (const r of s.rows) {
    const rec: Record<(typeof SHEET_COLUMNS)[number], unknown> = {
      row_id: rowId(r),
      source: r.source,
      code: r.code,
      seller: r.seller,
      seller_sku: r.sellerSku,
      shop: r.shop,
      name: r.name,
      url: r.url,
      seen_on: r.seenOn,
      price_cents: r.cents,
      claimed_regular_cents: r.source === 'sale' ? r.referenceCents : '',
      verdict: '',
      correct_price_cents: '',
      wrong_kind: '',
      checked_by: '',
      checked_on: '',
      note: '',
    };
    lines.push(SHEET_COLUMNS.map((c) => esc(rec[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

/* ----------------------------------------------------------- the scorer */

export interface HandAuditScore {
  readonly status: 'pass' | 'fail' | 'incomplete' | 'invalid';
  readonly pass: boolean;
  readonly checked: number;
  readonly wrong: number;
  readonly upper: number | null;
  readonly byKind: Readonly<Record<string, number>>;
  readonly bySource: Readonly<Record<string, number>>;
  readonly reason: string;
}

/** Reads a filled sheet against the sample it was drawn as, and says pass or fail. */
export function scoreHandAudit(csv: string, meta: HandAuditMeta): HandAuditScore {
  const empty = { checked: 0, wrong: 0, upper: null, byKind: {}, bySource: {}, pass: false };
  const recs = parseCsv(csv);
  const ids = recs.map((r) => r.row_id ?? '');
  const want = [...meta.rowIds].sort();
  const got = [...ids].sort();
  if (got.length !== want.length || got.some((x, i) => x !== want[i])) {
    return { ...empty, status: 'invalid', reason: `the sheet's rows are not the ${meta.n} rows drawn in round ${meta.round} (seed ${meta.seed}): ${got.length} rows found` };
  }
  const bad = recs.filter((r) => !/^(right|wrong)$/i.test((r.verdict ?? '').trim()));
  if (bad.length) {
    const odd = [...new Set(bad.map((r) => (r.verdict ?? '').trim()).filter(Boolean))];
    return {
      ...empty,
      status: 'incomplete',
      reason: `${bad.length} of ${recs.length} rows have no readable verdict${odd.length ? ` (found: ${odd.slice(0, 5).join(', ')})` : ''}; only right or wrong counts`,
    };
  }
  const wrongRows = recs.filter((r) => /^wrong$/i.test(r.verdict!.trim()));
  const byKind: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const r of wrongRows) {
    const k = (r.wrong_kind ?? '').trim() || '(kind not given)';
    byKind[k] = (byKind[k] ?? 0) + 1;
    bySource[r.source ?? '?'] = (bySource[r.source ?? '?'] ?? 0) + 1;
  }
  const ub = upperBound(wrongRows.length, recs.length, meta.population, meta.confidence);
  const pass = ub.rate < meta.bar;
  return {
    status: pass ? 'pass' : 'fail',
    pass,
    checked: recs.length,
    wrong: wrongRows.length,
    upper: ub.rate,
    byKind,
    bySource,
    reason: `${wrongRows.length} wrong of ${recs.length} checked from a ${meta.population}-row key; ${Math.round(meta.confidence * 100)}% upper bound ${(ub.rate * 100).toFixed(2)}% (${ub.method}) ${pass ? 'under' : 'not under'} ${meta.bar * 100}%`,
  };
}

/* ------------------------------------------------------------------ CLI */

/**
 *   node src/handaudit.ts sample --db PATH --out DIR --round N [--seed S] [--allowed-wrong K]
 *   node src/handaudit.ts score  --sheet CSV --meta JSON
 * `sample` reads the price database READ-ONLY and writes two new files into
 * --out (never overwriting): the sheet and its meta (seed, bound, row ids).
 * Earlier rounds' meta files in --out are read so their seeds are refused.
 */
async function cli(): Promise<void> {
  const arg = (n: string) => {
    const i = process.argv.indexOf(n);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const cmd = process.argv[2];
  if (cmd === 'score') {
    const sheet = arg('--sheet');
    const metaPath = arg('--meta');
    if (!sheet || !metaPath) throw new Error('score needs --sheet and --meta');
    const r = scoreHandAudit(readFileSync(sheet, 'utf8'), JSON.parse(readFileSync(metaPath, 'utf8')) as HandAuditMeta);
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.pass ? 0 : 1;
    return;
  }
  if (cmd !== 'sample') throw new Error('usage: handaudit.ts sample|score ...');
  const db = arg('--db');
  const out = arg('--out');
  const round = Number(arg('--round'));
  if (!db || !out || !Number.isInteger(round) || round < 1) throw new Error('sample needs --db, --out and --round N');
  const { loadObservations, openReadOnly } = await import('./data.ts');
  const { buildPredictionKey, buildSaleKey } = await import('./keys.ts');
  const { auditPredictionKey, auditSaleKey } = await import('./audit.ts');
  const prices = openReadOnly(db);
  const obs = loadObservations(prices);
  prices.close();
  const pop = [...auditPredictionKey(buildPredictionKey(obs)), ...auditSaleKey(buildSaleKey(obs))];
  mkdirSync(out, { recursive: true });
  const { readdirSync } = await import('node:fs');
  const previous = readdirSync(out)
    .filter((f) => /^hand-audit-round-\d+.*\.meta\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(out, f), 'utf8')) as HandAuditMeta);
  const seedArg = arg('--seed');
  const allowed = arg('--allowed-wrong');
  const d = new Date();
  const drawnOn = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const s = drawHandAudit(pop, { round, drawnOn, ...(seedArg ? { seed: Number(seedArg) } : {}), ...(allowed ? { allowedWrong: Number(allowed) } : {}) }, previous);
  const base = join(out, `hand-audit-round-${round}-${drawnOn}-seed-${s.meta.seed}`);
  if (existsSync(`${base}.csv`) || existsSync(`${base}.meta.json`)) throw new Error(`${base} already exists`);
  writeFileSync(`${base}.csv`, handAuditCsv(s), { flag: 'wx' });
  writeFileSync(`${base}.meta.json`, JSON.stringify(s.meta, null, 2) + '\n', { flag: 'wx' });
  console.log(`round ${round}, seed ${s.meta.seed}: ${s.meta.n} of ${s.meta.population} key rows. ${s.meta.bound}\nwrote ${base}.csv and .meta.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  });
}
