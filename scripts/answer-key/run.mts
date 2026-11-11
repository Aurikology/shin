/**
 * The Pexi answer key: catches "confidently wrong product" answers.
 *
 *   node scripts/answer-key/run.mts --catalogue <catalogue.db> --prices <prices.db> [--sample 2000] [--seed 1] [--out <dir>]
 *
 * For products that have a barcode, a name and a size the right answer is known, so each product is typed in
 * several forms into the REAL server (app/server.ts, started in this process) and the answer is checked against
 * the rules in core.ts. Writes findings.jsonl and report.md to --out. Exit 1 on any R2 finding, zero products
 * checked, a server that did not start, a model call, or a real data folder that changed.
 *
 * SAFE TO POINT AT THE REAL FILES: the catalogue is only ever opened read-only (see server.ts in this folder), the
 * prices file is COPIED to a temp folder first, every writable store lives in a fresh temp folder, and no model can
 * be called. The temp folder is deleted at the end.
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { httpAsker, runKey, type Finding, type KeyProduct, type RunSummary } from './core.ts';
import { startAnswerKeyServer, type Meter } from './server.ts';


/* ------------------------------------------------------------------ sampling */

/** A small seeded generator (mulberry32), so the same --seed picks the same products. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CatRow {
  code: string;
  name: string | null;
  name_en: string | null;
  brands: string | null;
  quantity: string | null;
  size_value: number | null;
  size_unit: string | null;
}

const COLS = 'code, name, name_en, brands, quantity, size_value, size_unit';
const ELIGIBLE = `code GLOB '[0-9]*' AND length(code) BETWEEN 8 AND 14 AND sold_in_canada = 1
  AND coalesce(nullif(trim(name_en), ''), nullif(trim(name), '')) IS NOT NULL
  AND (nullif(trim(quantity), '') IS NOT NULL OR size_value IS NOT NULL)`;

function toKey(r: CatRow, medianCents: number | null): KeyProduct {
  const size = r.quantity?.trim() || (r.size_value !== null && r.size_unit ? `${r.size_value} ${r.size_unit}` : null);
  const brand = (r.brands ?? '').split(',')[0].trim();
  return { code: r.code, name: (r.name_en?.trim() || r.name?.trim() || ''), brand: brand || null, size, medianCents };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface SampleInfo {
  products: KeyProduct[];
  priced: number;
  unpriced: number;
}

/** About half of the sample priced (a product with rows in the prices file), the rest not. Seeded. Read-only. */
export function sampleProducts(cataloguePath: string, pricesPath: string | null, sample: number, seed: number): SampleInfo {
  const rand = rng(seed);
  const cat = new DatabaseSync(cataloguePath, { readOnly: true });
  const prices = pricesPath && existsSync(pricesPath) ? new DatabaseSync(pricesPath, { readOnly: true }) : null;
  try {
    const byCode = cat.prepare(`SELECT ${COLS} FROM product WHERE code = ? AND ${ELIGIBLE}`);
    const medianOf = (code: string): number | null => {
      if (!prices) return null;
      const rows = prices.prepare('SELECT price_cents AS c FROM observation WHERE code = ?').all(code) as { c: number }[];
      return median(rows.map((r) => r.c).filter((c) => Number.isFinite(c) && c > 0));
    };
    const picked = new Set<string>();
    const out: KeyProduct[] = [];
    const wantPriced = Math.ceil(sample / 2);

    // Priced half: shuffle the codes the prices file knows, keep the ones the catalogue also has, eligible.
    if (prices) {
      const codes = (prices.prepare("SELECT DISTINCT code FROM observation WHERE code IS NOT NULL AND code != ''").all() as { code: string }[]).map((r) => r.code);
      for (let i = codes.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [codes[i], codes[j]] = [codes[j], codes[i]];
      }
      for (const code of codes) {
        if (out.length >= wantPriced) break;
        const row = byCode.get(code) as CatRow | undefined;
        if (!row) continue;
        const m = medianOf(code);
        if (m === null) continue;
        picked.add(code);
        out.push(toKey(row, m));
      }
    }
    const priced = out.length;

    // The rest: any eligible product the prices file does not have.
    const maxRow = (cat.prepare('SELECT max(rowid) AS m FROM product').get() as { m: number | null }).m ?? 0;
    const need = sample - out.length;
    if (maxRow > 0 && need > 0) {
      if (maxRow <= 200_000) {
        const all = cat.prepare(`SELECT ${COLS} FROM product WHERE ${ELIGIBLE}`).all() as unknown as CatRow[];
        for (let i = all.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rand() * (i + 1));
          [all[i], all[j]] = [all[j], all[i]];
        }
        for (const row of all) {
          if (out.length >= sample) break;
          if (picked.has(row.code)) continue;
          const m = medianOf(row.code);
          picked.add(row.code);
          out.push(toKey(row, m));
        }
      } else {
        const byRow = cat.prepare(`SELECT ${COLS} FROM product WHERE rowid = ? AND ${ELIGIBLE}`);
        for (let tries = 0; out.length < sample && tries < sample * 400; tries += 1) {
          const row = byRow.get(1 + Math.floor(rand() * maxRow)) as CatRow | undefined;
          if (!row || picked.has(row.code)) continue;
          const m = medianOf(row.code);
          picked.add(row.code);
          out.push(toKey(row, m));
        }
      }
    }
    return { products: out, priced, unpriced: out.length - priced };
  } finally {
    cat.close();
    prices?.close();
  }
}

/* ------------------------------------------------------------------ the run */

export interface AnswerKeyOptions {
  cataloguePath: string | null;
  pricesPath: string | null;
  sample?: number;
  seed?: number;
  outDir?: string | null;
  /** Products to check; when absent they are sampled from cataloguePath. */
  products?: KeyProduct[];
  /** A synthetic catalogue to serve instead of a file (the in-process test). */
  buildInjected?: ((tempDir: string) => Promise<{ catalogue: unknown; db: unknown }>) | null;
  region?: string;
  concurrency?: number;
  quiet?: boolean;
}

export interface AnswerKeyResult {
  exitCode: 0 | 1;
  failures: string[];
  summary: RunSummary | null;
  meter: Meter | null;
  modelCalls: number;
  report: string;
  priced: number;
  unpriced: number;
  realDataChanges: string[];
}

/** Starts the server, asks everything, writes the files, and says whether the run passed. */
export async function runAnswerKey(opts: AnswerKeyOptions): Promise<AnswerKeyResult> {
  const t0 = Date.now();
  const stamp = (p: string): string => {
    try {
      const s = statSync(p);
      return `${s.size}:${s.mtimeMs}`;
    } catch {
      return 'absent';
    }
  };
  const before = new Map<string, string>();
  for (const p of [opts.cataloguePath, opts.pricesPath]) if (p) before.set(p, stamp(p));
  const failures: string[] = [];
  let summary: RunSummary | null = null;
  let meter: Meter | null = null;
  let realDataChanges: string[] = [];
  let priced = 0;
  let unpriced = 0;
  let products: KeyProduct[] = opts.products ?? [];
  let running: Awaited<ReturnType<typeof startAnswerKeyServer>> | null = null;
  const log = (s: string) => {
    if (!opts.quiet) process.stderr.write(s + '\n');
  };

  try {
    if (!opts.products) {
      if (!opts.cataloguePath) throw new Error('no catalogue given');
      const s = sampleProducts(opts.cataloguePath, opts.pricesPath, opts.sample ?? 2000, opts.seed ?? 1);
      products = s.products;
      priced = s.priced;
      unpriced = s.unpriced;
      log(`sampled ${products.length} products (${priced} priced, ${unpriced} not)`);
    } else {
      priced = products.filter((p) => p.medianCents !== null).length;
      unpriced = products.length - priced;
    }
    if (products.length === 0) {
      failures.push('zero products were checked (nothing eligible to ask about, so no server was started)');
      throw new Error('skip');
    }
    running = await startAnswerKeyServer({ cataloguePath: opts.cataloguePath, pricesPath: opts.pricesPath, buildInjected: opts.buildInjected ?? null });
    meter = running.meter;
    summary = await runKey(products, httpAsker(running.base, opts.region), {
      region: opts.region,
      concurrency: opts.concurrency ?? 1,
      onProgress: (done, total) => {
        if (done % 100 === 0 || done === total) log(`checked ${done}/${total} products`);
      },
    });
    realDataChanges = running.realDataChanges();
    // The two given files themselves (not their -wal and -shm sidecars, which a read-only open of a WAL file may create).
    for (const [path, was] of before) if (stamp(path) !== was) realDataChanges.push(`changed: ${path}`);
  } catch (err) {
    if ((err as Error)?.message !== 'skip') failures.push(`the run did not complete: ${(err as Error)?.stack ?? String(err)}`);
  } finally {
    if (running) await running.stop().catch(() => undefined);
  }

  const modelCalls = meter ? meter.providerCalls + meter.modelFetches : 0;
  if (summary && summary.productsChecked === 0) failures.push('zero products were checked');
  if (!summary && failures.length === 0) failures.push('the server did not start');
  if (summary && summary.perRule.R2 > 0) failures.push(`${summary.perRule.R2} R2 violation(s): a different product answered with confidence`);
  if (modelCalls > 0) failures.push(`${modelCalls} model call(s) were attempted`);
  if (realDataChanges.length > 0) failures.push(`a real data folder changed: ${realDataChanges.slice(0, 5).join('; ')}`);

  const elapsedMs = Date.now() - t0;
  const report = renderReport({ summary, meter, modelCalls, priced, unpriced, failures, elapsedMs, realDataChanges, opts });
  if (opts.outDir) {
    mkdirSync(opts.outDir, { recursive: true });
    writeFileSync(join(opts.outDir, 'findings.jsonl'), (summary?.findings ?? []).map((f) => JSON.stringify(findingLine(f))).join('\n') + (summary?.findings.length ? '\n' : ''));
    writeFileSync(join(opts.outDir, 'report.md'), report);
  }
  return { exitCode: failures.length > 0 ? 1 : 0, failures, summary, meter, modelCalls, report, priced, unpriced, realDataChanges };
}

function findingLine(f: Finding) {
  return { rule: f.rule, severity: f.severity, code: f.code, variant: f.variant, text: f.text, priceCents: f.priceCents, why: f.why, got: f.got, repro: f.repro };
}

function renderReport(x: {
  summary: RunSummary | null;
  meter: Meter | null;
  modelCalls: number;
  priced: number;
  unpriced: number;
  failures: string[];
  elapsedMs: number;
  realDataChanges: string[];
  opts: AnswerKeyOptions;
}): string {
  const s = x.summary;
  const L: string[] = [];
  L.push('# Pexi answer key report', '');
  L.push(`Result: ${x.failures.length === 0 ? 'PASS' : 'FAIL'}`);
  for (const f of x.failures) L.push(`- ${f}`);
  L.push('');
  L.push(`- Products checked: ${s?.productsChecked ?? 0} (${x.priced} priced, ${x.unpriced} not), seed ${x.opts.seed ?? 1}`);
  L.push(`- Asks made: ${s?.asks ?? 0}${s && s.asks > 0 ? ` (${(s.askMs / s.asks).toFixed(1)} ms per ask)` : ''}`);
  L.push(`- Run time: ${(x.elapsedMs / 1000).toFixed(1)} s`);
  L.push(`- Model calls made: ${x.modelCalls} (provider stub ${x.meter?.providerCalls ?? 0}, refused model fetches ${x.meter?.modelFetches ?? 0})`);
  if (x.meter && x.meter.otherOutbound.length > 0) L.push(`- Other outbound requests refused: ${x.meter.otherOutbound.length} (${[...new Set(x.meter.otherOutbound)].join(', ')})`);
  L.push(`- Real data folders changed during the run: ${x.realDataChanges.length}`);
  L.push('', '## Findings per rule', '');
  const names: Record<string, string> = {
    R1: 'barcode control',
    R2: 'never confidently wrong (a different product answered with confidence)',
    R3: 'the full name should find the product (low severity)',
    R4: 'the same ask twice gives the same answer',
    R5: 'a typo is never more confident than the full name',
    ERR: 'HTTP error, 5 s timeout or non-JSON answer',
  };
  for (const r of ['R1', 'R2', 'R3', 'R4', 'R5', 'ERR'] as const) L.push(`- ${r} ${names[r]}: ${s?.perRule[r] ?? 0}`);
  const worst = (s?.findings ?? []).filter((f) => f.rule === 'R2').sort((a, b) => b.score - a.score).slice(0, 20);
  L.push('', '## The 20 worst R2 cases', '');
  if (worst.length === 0) L.push('None.');
  for (const f of worst) {
    L.push(`- ${f.code} [${f.variant}] typed "${f.text}" at ${f.priceCents} cents: ${f.why}`);
    L.push(`  repro: ${f.repro}`);
  }
  L.push('');
  return L.join('\n');
}

/* ------------------------------------------------------------------ command line */

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      catalogue: { type: 'string' },
      prices: { type: 'string' },
      sample: { type: 'string', default: '2000' },
      seed: { type: 'string', default: '1' },
      out: { type: 'string' },
      region: { type: 'string', default: 'British Columbia' },
      concurrency: { type: 'string', default: '1' },
    },
  });
  const usage = 'usage: node scripts/answer-key/run.mts --catalogue <path> --prices <path> [--sample 2000] [--seed 1] [--out <dir>]';
  if (!values.catalogue || !values.prices) {
    console.error(usage);
    process.exit(2);
  }
  for (const [what, p] of [['catalogue', values.catalogue], ['prices', values.prices]] as const) {
    if (!existsSync(p) || !statSync(p).isFile()) {
      console.error(`--${what} ${p} is not a file`);
      process.exit(2);
    }
  }
  const outDir = resolve(values.out ?? join('answer-key-out', new Date().toISOString().replace(/[:.]/g, '-')));
  const result = await runAnswerKey({
    cataloguePath: resolve(values.catalogue),
    pricesPath: resolve(values.prices),
    sample: Number(values.sample),
    seed: Number(values.seed),
    outDir,
    region: values.region,
    concurrency: Number(values.concurrency),
  });
  process.stderr.write(`${result.exitCode === 0 ? 'PASS' : 'FAIL'}: ${result.summary?.productsChecked ?? 0} products, ${result.summary?.asks ?? 0} asks, R2 ${result.summary?.perRule.R2 ?? 0}, model calls ${result.modelCalls}; report in ${outDir}\n`);
  for (const f of result.failures) process.stderr.write(`  ${f}\n`);
  // The search worker thread keeps the process alive; the run is over, so end it.
  process.exit(result.exitCode);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
