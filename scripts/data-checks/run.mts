/**
 * The Pexi data checks: rules run straight on the price data, no screens and no server.
 *
 *   node scripts/data-checks/run.mts --prices <prices.db> [--catalogue <catalogue.db>] [--out <dir>] [--as-of YYYY-MM-DD]
 *
 * Counts every class of row that would make a price verdict wrong (rules.mts D1 to D8) and writes report.md and
 * findings.jsonl to --out (default: a new folder under the system temp directory).
 *
 * READ-ONLY: both databases are opened with readOnly, and --out may not be inside a folder named `data`.
 *
 * Exit 1 when: the prices file does not open, has no observation table or zero rows, the catalogue is given and
 * does not open, any rule throws, or D5 (impossible values) finds a row. Exit 2: bad arguments.
 * Every other count is a result, not a failure.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { runChecks, type CheckRun } from './rules.mts';
import { renderFindings, renderReport } from './report.mts';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function openReadOnly(path: string, what: string): DatabaseSync {
  if (!existsSync(path)) throw new Error(`${what} file does not exist: ${path}`);
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch (err) {
    throw new Error(`${what} file will not open read-only: ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The exit code for a finished run. Pure, so the test can show each reason fail. */
export function exitCodeFor(run: CheckRun): { code: 0 | 1; why: string[] } {
  const why: string[] = [];
  if (run.totalRows === 0) why.push('the prices file has zero rows');
  for (const e of run.errors) why.push(`rule ${e.rule} threw: ${e.error}`);
  const d5 = run.rules.find((r) => r.id === 'D5');
  if (d5 && d5.count > 0) why.push(`D5 impossible values: ${d5.count} row(s)`);
  return { code: why.length > 0 ? 1 : 0, why };
}

function main(): number {
  let values: { prices?: string; catalogue?: string; out?: string; 'as-of'?: string };
  try {
    values = parseArgs({
      options: { prices: { type: 'string' }, catalogue: { type: 'string' }, out: { type: 'string' }, 'as-of': { type: 'string' } },
      strict: true,
    }).values;
  } catch (err) {
    console.error(`usage: node scripts/data-checks/run.mts --prices <path> [--catalogue <path>] [--out <dir>] [--as-of YYYY-MM-DD]\n${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  if (!values.prices) {
    console.error('usage: --prices <path> is required');
    return 2;
  }
  const asOf = values['as-of'] ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
    console.error(`--as-of must be YYYY-MM-DD, got ${asOf}`);
    return 2;
  }
  const out = resolve(values.out ?? join(tmpdir(), `pexi-data-checks-${new Date().toISOString().replace(/[:.]/g, '-')}`));
  if (out.split(sep).includes('data')) {
    console.error(`refusing to write into a data folder: ${out}`);
    return 2;
  }

  let prices: DatabaseSync | null = null;
  let catalogue: DatabaseSync | null = null;
  let run: CheckRun;
  try {
    prices = openReadOnly(values.prices, 'prices');
    if (values.catalogue) catalogue = openReadOnly(values.catalogue, 'catalogue');
    run = runChecks(prices, { asOf, catalogue });
  } catch (err) {
    console.error(`DATA CHECKS FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    try {
      prices?.close();
      catalogue?.close();
    } catch {
      /* already closed */
    }
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.md'), renderReport(run, { prices: resolve(values.prices), catalogue: values.catalogue ? resolve(values.catalogue) : null }));
  writeFileSync(join(out, 'findings.jsonl'), renderFindings(run));

  console.log(`data checks on ${n(run.totalRows)} rows, as of ${asOf}${run.hasCatalogue ? ', with catalogue' : ', no catalogue'}`);
  for (const r of run.rules) console.log(`  ${r.id}  ${String(r.count).padStart(9)}  ${((r.share ?? 0) * 100).toFixed(2).padStart(6)}%  used by verdicts: ${r.usedByVerdicts}  ${r.title}`);
  console.log(`report: ${join(out, 'report.md')}`);
  const verdict = exitCodeFor(run);
  for (const w of verdict.why) console.error(`FAIL: ${w}`);
  return verdict.code;
}

function n(v: number): string {
  return v.toLocaleString('en-US');
}

if (import.meta.main) process.exitCode = main();
