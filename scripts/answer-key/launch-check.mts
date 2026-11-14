/**
 * The launch accuracy check: is Pexi still giving confidently wrong answers, and is it few enough to launch?
 *
 *   node scripts/answer-key/launch-check.mts --catalogue <catalogue.db> --prices <prices.db> [--fresh 500] [--seed 7] [--out <dir>]
 *   add --codes <file> --fresh 10 for a smoke run (a few flagged codes, 10 fresh products: minutes, not hours)
 *   node scripts/answer-key/launch-check.mts --score <findings.jsonl> --products <n>      (score an old run, no server)
 *
 * Two runs of the answer key (run.mts, same safety: the catalogue opened read-only, prices copied, no model call):
 *   1. REGRESSION: the 142 products the 2026-11-11 run flagged (baseline-2026-11-12-codes.txt), looked up by code,
 *      so a changed prices file cannot shift which products are asked. Shows whether the fixes held.
 *   2. FRESH: products neither earlier run asked about (seed 1's 2000 are excluded), half priced, half not.
 *      Fixes were made while looking at the flagged products, so only this run says what a shopper will see.
 *
 * The launch gate is read on the FRESH run alone (Jamin's session, 2026-11-14, docs/decisions.md "Four launch
 * calls"): a barcode never names a different product; a confidently wrong answer to a full name typed out
 * (full, brand + name, name + size, lower case) on at most 1% of products; on any typed form at most 3%;
 * errors and timeouts at most 2% of asks; zero model calls. A barcode that names nothing (store-internal codes)
 * and lists with two rows that read the same are reported, not gated.
 *
 * Writes summary.md and summary.json to --out, plus each run's own report.md and findings.jsonl in a subfolder.
 * Exit 0 the gate passes, 1 it fails, 2 the run itself broke (bad arguments, zero products, server did not start).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { codeKey, type KeyProduct } from './core.ts';
import { COLS, ELIGIBLE, median, runAnswerKey, sampleProducts, toKey, type AnswerKeyResult, type CatRow } from './run.mts';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_CODES = join(HERE, 'baseline-2026-11-12-codes.txt');

/** Typed forms where the shopper wrote the product out in full; a wrong confident answer here has no excuse. */
const FULL_FORMS = new Set(['full', 'brandName', 'nameSize', 'lower']);

export const GATE = {
  barcodeDifferentProduct: 0,
  fullFormWrongPct: 1,
  anyFormWrongPct: 3,
  errorPctOfAsks: 2,
  modelCalls: 0,
} as const;

/** The 2026-11-11 first run (2000 products, seed 1), scored by this file's scoreFindings from its findings.jsonl. */
export const BASELINE_FIRST_RUN = {
  products: 2000,
  asks: 18811,
  wrongAnyForm: 126,
  wrongFullForm: 73,
  wrongPartialForm: 62,
  barcodeDifferent: 3,
  barcodeNothing: 16,
  errors: 6912,
  note: '6,860 of its asks timed out, so its wrong-answer counts are a floor',
};

interface FindingLine {
  rule: string;
  severity?: string;
  code: string;
  variant: string;
  why: string;
}

export interface Score {
  products: number;
  asks: number | null;
  wrongAnyForm: number;
  wrongFullForm: number;
  wrongPartialForm: number;
  barcodeDifferent: number;
  barcodeNothing: number;
  duplicateRowLists: number;
  fullNameFindsNothing: number;
  errors: number;
}

/** Counts products, not findings: one product typed seven ways and wrong seven times is one wrong product. */
export function scoreFindings(findings: readonly FindingLine[], products: number, asks: number | null): Score {
  const codes = (keep: (f: FindingLine) => boolean) => new Set(findings.filter(keep).map((f) => codeKey(f.code))).size;
  return {
    products,
    asks,
    wrongAnyForm: codes((f) => f.rule === 'R2'),
    wrongFullForm: codes((f) => f.rule === 'R2' && FULL_FORMS.has(f.variant)),
    wrongPartialForm: codes((f) => f.rule === 'R2' && !FULL_FORMS.has(f.variant)),
    barcodeDifferent: codes((f) => f.rule === 'R1' && /different product/.test(f.why)),
    barcodeNothing: codes((f) => f.rule === 'R1' && !/different product/.test(f.why)),
    duplicateRowLists: codes((f) => f.rule === 'R7'),
    fullNameFindsNothing: codes((f) => f.rule === 'R3'),
    errors: findings.filter((f) => f.rule === 'ERR').length,
  };
}

const pct = (n: number, of: number) => (of > 0 ? (100 * n) / of : 0);
const fmt = (n: number, of: number) => `${n} of ${of} (${pct(n, of).toFixed(1)}%)`;

export function gate(s: Score, modelCalls: number): { pass: boolean; lines: string[] } {
  const lines: string[] = [];
  const check = (ok: boolean, text: string) => {
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
    return ok;
  };
  let pass = true;
  pass = check(s.barcodeDifferent <= GATE.barcodeDifferentProduct, `barcode names a different product: ${s.barcodeDifferent} (allowed ${GATE.barcodeDifferentProduct})`) && pass;
  pass = check(pct(s.wrongFullForm, s.products) <= GATE.fullFormWrongPct, `confidently wrong on a full name: ${fmt(s.wrongFullForm, s.products)} (allowed ${GATE.fullFormWrongPct}%)`) && pass;
  pass = check(pct(s.wrongAnyForm, s.products) <= GATE.anyFormWrongPct, `confidently wrong on any typed form: ${fmt(s.wrongAnyForm, s.products)} (allowed ${GATE.anyFormWrongPct}%)`) && pass;
  const errPct = s.asks ? pct(s.errors, s.asks) : 100;
  pass = check(errPct <= GATE.errorPctOfAsks, `errors and timeouts: ${s.errors} of ${s.asks ?? '?'} asks (${errPct.toFixed(1)}%, allowed ${GATE.errorPctOfAsks}%)`) && pass;
  pass = check(modelCalls <= GATE.modelCalls, `model calls: ${modelCalls} (allowed ${GATE.modelCalls})`) && pass;
  return { pass, lines };
}

function scoreTable(rows: [string, Score][]): string {
  const head = `| | ${rows.map(([n]) => n).join(' | ')} |\n|---|${rows.map(() => '---').join('|')}|\n`;
  const line = (label: string, get: (s: Score) => string) => `| ${label} | ${rows.map(([, s]) => get(s)).join(' | ')} |\n`;
  return (
    head +
    line('Products checked', (s) => String(s.products)) +
    line('Confidently wrong, any typed form', (s) => fmt(s.wrongAnyForm, s.products)) +
    line('  of which on a full name', (s) => fmt(s.wrongFullForm, s.products)) +
    line('  of which on a partial name, typo or name alone', (s) => fmt(s.wrongPartialForm, s.products)) +
    line('Barcode names a different product', (s) => String(s.barcodeDifferent)) +
    line('Barcode names nothing', (s) => String(s.barcodeNothing)) +
    line('Full name finds nothing (low)', (s) => String(s.fullNameFindsNothing)) +
    line('Search list with two rows that read the same', (s) => String(s.duplicateRowLists)) +
    line('Errors and timeouts (asks)', (s) => `${s.errors} of ${s.asks ?? '?'}`)
  );
}

function readJsonl(path: string): FindingLine[] {
  const text = readFileSync(path, 'utf8').trim();
  return text ? text.split('\n').map((l) => JSON.parse(l) as FindingLine) : [];
}

/** The flagged products, looked up by code in the catalogue; codes no longer eligible are listed, not dropped silently. */
function productsByCode(cataloguePath: string, pricesPath: string, codes: readonly string[]): { products: KeyProduct[]; missing: string[] } {
  const cat = new DatabaseSync(cataloguePath, { readOnly: true });
  const prices = new DatabaseSync(pricesPath, { readOnly: true });
  try {
    const byCode = cat.prepare(`SELECT ${COLS} FROM product WHERE code = ? AND ${ELIGIBLE}`);
    const priceRows = prices.prepare('SELECT price_cents AS c FROM observation WHERE code = ?');
    const products: KeyProduct[] = [];
    const missing: string[] = [];
    for (const code of codes) {
      const row = byCode.get(code) as CatRow | undefined;
      if (!row) {
        missing.push(code);
        continue;
      }
      const cents = (priceRows.all(code) as { c: number }[]).map((r) => r.c).filter((c) => Number.isFinite(c) && c > 0);
      products.push(toKey(row, median(cents)));
    }
    return { products, missing };
  } finally {
    cat.close();
    prices.close();
  }
}

/** Products neither earlier run asked about: seed 1's 2000 and the flagged codes excluded, half priced where possible. */
function freshProducts(cataloguePath: string, pricesPath: string, want: number, seed: number, exclude: Set<string>): KeyProduct[] {
  const pool = sampleProducts(cataloguePath, pricesPath, Math.ceil(want * 1.5), seed).products.filter((p) => !exclude.has(codeKey(p.code)));
  const priced = pool.filter((p) => p.medianCents !== null);
  const unpriced = pool.filter((p) => p.medianCents === null);
  const half = Math.ceil(want / 2);
  const out = [...priced.slice(0, half), ...unpriced.slice(0, want - Math.min(half, priced.length))];
  return out.slice(0, want);
}

function gitHead(): string {
  try {
    return execFileSync('git', ['-C', HERE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (err) {
    return `unknown (${(err as Error).message.split('\n')[0]})`;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      catalogue: { type: 'string' },
      prices: { type: 'string' },
      fresh: { type: 'string', default: '500' },
      seed: { type: 'string', default: '7' },
      codes: { type: 'string' },
      out: { type: 'string' },
      region: { type: 'string', default: 'British Columbia' },
      score: { type: 'string' },
      products: { type: 'string' },
      asks: { type: 'string' },
    },
  });

  if (values.score) {
    const products = Number(values.products);
    if (!existsSync(values.score) || !(products > 0)) {
      console.error('usage: --score <findings.jsonl> --products <n> [--asks <n>]');
      process.exit(2);
    }
    const s = scoreFindings(readJsonl(values.score), products, values.asks ? Number(values.asks) : null);
    console.log(JSON.stringify(s, null, 2));
    console.log(gate(s, 0).lines.join('\n'));
    return;
  }

  if (!values.catalogue || !values.prices || !existsSync(values.catalogue) || !existsSync(values.prices)) {
    console.error('usage: node scripts/answer-key/launch-check.mts --catalogue <catalogue.db> --prices <prices.db> [--fresh 500] [--seed 7] [--out <dir>]');
    process.exit(2);
  }
  const cataloguePath = resolve(values.catalogue);
  const pricesPath = resolve(values.prices);
  const outDir = resolve(values.out ?? join('answer-key-out', `launch-${new Date().toISOString().replace(/[:.]/g, '-')}`));
  mkdirSync(outDir, { recursive: true });
  const commit = gitHead();
  const log = (s: string) => process.stderr.write(`[launch-check] ${s}\n`);
  log(`commit ${commit}; output ${outDir}`);

  const baselineCodes = readFileSync(values.codes ? resolve(values.codes) : BASELINE_CODES, 'utf8').split(/\s+/).filter(Boolean);
  const reg = productsByCode(cataloguePath, pricesPath, baselineCodes);
  log(`regression: ${reg.products.length} of ${baselineCodes.length} flagged products still eligible${reg.missing.length ? `; not eligible: ${reg.missing.join(' ')}` : ''}`);

  const exclude = new Set(baselineCodes.map(codeKey));
  for (const p of sampleProducts(cataloguePath, pricesPath, 2000, 1).products) exclude.add(codeKey(p.code));
  const fresh = freshProducts(cataloguePath, pricesPath, Number(values.fresh), Number(values.seed), exclude);
  log(`fresh: ${fresh.length} products (${fresh.filter((p) => p.medianCents !== null).length} priced), none asked before`);

  const runs: Record<string, AnswerKeyResult> = {};
  for (const [name, products] of [['regression', reg.products], ['fresh', fresh]] as const) {
    if (products.length === 0) {
      console.error(`${name}: zero products to check`);
      process.exit(2);
    }
    log(`${name}: starting ${products.length} products`);
    runs[name] = await runAnswerKey({ cataloguePath, pricesPath, products, outDir: join(outDir, name), region: values.region, concurrency: 1 });
    if (!runs[name].summary) {
      console.error(`${name}: the run did not complete: ${runs[name].failures.join('; ')}`);
      process.exit(2);
    }
    log(`${name}: done, ${runs[name].summary!.productsChecked} products, ${runs[name].summary!.asks} asks`);
  }

  const score = (r: AnswerKeyResult) => scoreFindings(r.summary!.findings, r.summary!.productsChecked, r.summary!.asks);
  const regScore = score(runs.regression);
  const freshScore = score(runs.fresh);
  const verdict = gate(freshScore, runs.fresh.modelCalls);
  const realData = [...new Set([...runs.regression.realDataChanges, ...runs.fresh.realDataChanges])];

  const md =
    `# Pexi launch accuracy check\n\n` +
    `**Gate: ${verdict.pass ? 'PASS' : 'FAIL'}** (read on the fresh run only)\n\n` +
    verdict.lines.map((l) => `- ${l}`).join('\n') +
    `\n\n- Commit: ${commit}\n- Run: ${new Date().toISOString()}\n- Model calls: regression ${runs.regression.modelCalls}, fresh ${runs.fresh.modelCalls}\n` +
    (reg.missing.length ? `- Flagged products no longer eligible (not asked): ${reg.missing.length}\n` : '') +
    `- Real data files whose stamp changed during the run (the live server writes these too, so not gated): ${realData.length ? realData.join('; ') : 'none'}\n\n` +
    `## Products with each kind of fault\n\n` +
    `Each product is typed seven ways and scanned once; a product counts once per row however many forms went wrong.\n\n` +
    scoreTable([
      ['Nov 11, 2000 products (floor: 6,860 timeouts)', { ...BASELINE_FIRST_RUN, duplicateRowLists: NaN, fullNameFindsNothing: NaN }],
      ['Flagged 142, now', regScore],
      ['Fresh, now', freshScore],
    ]).replace(/NaN/g, 'not scored') +
    `\n## Where to look\n\n- regression/report.md and fresh/report.md list the worst cases with a repro URL each.\n`;

  writeFileSync(join(outDir, 'summary.md'), md);
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ commit, pass: verdict.pass, gate: GATE, verdict: verdict.lines, regression: regScore, fresh: freshScore, baselineFirstRun: BASELINE_FIRST_RUN, notEligible: reg.missing, realDataChanges: realData }, null, 2));
  process.stdout.write(md);
  process.exit(verdict.pass ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
