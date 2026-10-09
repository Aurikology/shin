/**
 * The baseline scoreboard on the real price database.
 *
 *   node src/run.ts [--db PATH] [--catalogue PATH] [--test-fraction 0.3]
 *                   [--seed 0] [--open-sealed] [--sealed PATH] [--no-write]
 *
 * Reads prices.db READ-ONLY (SQLite refuses writes on the handle, and the
 * file's size and mtime are compared before and after). Writes only under
 * bench/results/: baseline-<date>.json always (unless --no-write), and
 * audit-<date>.csv, the hand re-read sheet, only if it does not already exist
 * (someone may be filling it in).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { fingerprint, loadObservations, openReadOnly } from './data.ts';
import { buildPredictionKey, buildSaleKey, keyExclusions, loadMatchingKey, summarizeKeys } from './keys.ts';
import { auditPredictionKey, auditSaleKey, auditSummary, keyErrorRate, mergeSheet } from './audit.ts';
import { isFold, splitByProduct, splitByProductAndDate, splitByTime, splitSealedOpen, TEST_FRACTION, type Fold, type Unsplittable } from './split.ts';
import { controlledRuns } from './controls.ts';
import { dataSupport, leakAudit, ontarioMix, type LeakCheck } from './holdout.ts';
import { requiredSampleSize } from './handaudit.ts';
import { applyGuard, guardSealed } from './sealed.ts';
import { assertSameItems, overallVerdict, type ModelRun } from './harness.ts';
import { writeResult } from './results.ts';
import { baselines } from './baselines.ts';
import { DEFAULT_BAR } from './score.ts';

const BENCH = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(BENCH, '..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '  -  ' : `${(x * 100).toFixed(1)}%`.padStart(6));
const num = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? '-' : x.toFixed(d));

export function main(): void {
  const dbPath = arg('--db') ?? process.env.SHIN_PRICES ?? join(REPO, 'price', 'data', 'prices.db');
  const catPath = arg('--catalogue') ?? process.env.SHIN_CATALOGUE ?? join(REPO, 'catalogue', 'data', 'catalogue.db');
  const sealedArg = arg('--sealed');
  const sealedPath = sealedArg ?? join(BENCH, 'sealed', 'sealed.json');
  const matchPath = join(REPO, 'research', 'screenshot-matcher-v1', 'key-truth.jsonl');
  const testFraction = Number(arg('--test-fraction') ?? String(TEST_FRACTION));
  const seed = Number(arg('--seed') ?? '0');
  const cutoffArg = arg('--cutoff');
  const write = !flag('--no-write');
  const openSealed = flag('--open-sealed');
  const date = localDate();
  const resultsDir = join(BENCH, 'results');

  // Sealed batch first, before the database is even opened: a refusal costs nothing.
  const guard = guardSealed(sealedPath, {
    openSealed,
    write,
    explicitPath: sealedArg !== undefined,
    noSealed: flag('--no-sealed'),
    resultsDir,
    note: 'opened by bench/src/run.ts --open-sealed',
  });

  if (guard.mode === 'opened') {
    // Recorded before anything is scored, in its own never-overwritten file: a crash mid-run still counts as the opening.
    const rec = writeResult(resultsDir, 'sealed-opened', { sealed: { path: sealedPath, mode: 'opened', openedOn: guard.openedOn, sha256: guard.sha256, keysSha256: guard.keysSha256 } });
    console.error(`SEALED BATCH OPENED. Commit the opened stamp now: git add "${sealedPath}" "${sealedPath}.log.jsonl" "${rec}" && git commit -m "[bench] open sealed batch"`);
  }

  if (!existsSync(dbPath)) throw new Error(`price database not found at ${dbPath}`);
  const before = fingerprint(dbPath);
  const prices = openReadOnly(dbPath);
  const catalogue: DatabaseSync | null = existsSync(catPath) ? openReadOnly(catPath) : null;

  const allObs = loadObservations(prices);
  const totalRows = (prices.prepare('SELECT count(*) AS n FROM observation').get() as { n: number }).n;
  // The keys and audit never include sealed products unless the batch is being opened.
  const obs = guard.mode === 'excluded' ? applyGuard(allObs, guard) : allObs;

  const predAll = buildPredictionKey(obs);
  const saleAll = buildSaleKey(obs);
  const matching = loadMatchingKey(matchPath);
  const keys = summarizeKeys(predAll, saleAll, matching, keyExclusions(obs));

  // Audit and the ONE persistent hand re-read sheet: rows are appended, marks are kept.
  const auditRows = [...auditPredictionKey(predAll), ...auditSaleKey(saleAll)];
  const audit = auditSummary(auditRows);
  const csvPath = join(resultsDir, 'reread-sheet.csv');
  const existing = existsSync(csvPath) ? readFileSync(csvPath, 'utf8') : null;
  let csvNote: string;
  if (auditRows.length === 0) csvNote = existing ? `kept ${csvPath} unchanged: the keys are empty` : 'not written: the keys are empty';
  else if (!write) csvNote = 'not written (--no-write)';
  else {
    const merged = mergeSheet(existing, auditRows, date);
    mkdirSync(resultsDir, { recursive: true });
    if (merged.added > 0 || existing === null) writeFileSync(csvPath, merged.csv);
    csvNote = `${csvPath}: ${merged.added} rows added, ${merged.total} on the sheet, ${merged.marked} marked by hand`;
  }
  const errorRate = keyErrorRate(existsSync(csvPath) ? readFileSync(csvPath, 'utf8') : null);

  // Splits; each one runs the guard again and refuses one it did not get from guardSealed.
  const folds: (Fold | Unsplittable)[] =
    guard.mode === 'opened'
      ? [splitSealedOpen(obs, predAll, saleAll, guard)]
      : [
          splitByProduct(obs, predAll, saleAll, guard, testFraction, seed),
          splitByTime(obs, saleAll, guard, { testFraction, ...(cutoffArg ? { cutoff: cutoffArg } : {}) }),
          splitByProductAndDate(obs, saleAll, guard, { testFraction, seed, ...(cutoffArg ? { cutoff: cutoffArg } : {}) }),
        ];

  // 7.5: each fold audited for what it promises to hold out; the product-and-date fold for both.
  const promises: Record<Fold['name'], LeakCheck[]> = { by_product: ['product'], by_time: ['date'], by_product_and_date: ['product', 'date'], sealed: ['product'] };
  const leaks = folds.filter(isFold).map((f) => ({ fold: f.name, promised: leakAudit(f, promises[f.name]), both: leakAudit(f) }));
  const support = dataSupport(obs, guard, saleAll, { testFraction, seed });
  const bothFold = folds.find((f): f is Fold => isFold(f) && f.name === 'by_product_and_date');
  const ontario = bothFold ? ontarioMix(bothFold, obs) : null;
  const auditSize = auditRows.length ? requiredSampleSize({ population: new Set(auditRows.map((r) => `${r.source}|${r.seller}|${r.sellerSku}|${r.seenOn}|${r.cents}`)).size }) : null;

  // 7.6: controls on every fold before anything is scored. A misbehaving control stops all scoring.
  const leaked = leaks.filter((l) => !l.promised.ok);
  const controlled = leaked.length
    ? { aborted: true, reason: `LEAK: ${leaked.map((l) => l.promised.note).join('; ')}`, controls: [], runs: [], skipped: [] }
    : controlledRuns(folds.filter(isFold), baselines, { catalogue, seed: seed + 1 });
  const runs: ModelRun[] = [...controlled.runs];
  for (const name of new Set(runs.map((r) => r.fold))) assertSameItems(runs.filter((r) => r.fold === name));

  prices.close();
  catalogue?.close();
  const after = fingerprint(dbPath);
  const untouched = before.bytes === after.bytes && before.mtimeMs === after.mtimeMs;

  /* ------------------------------------------------------------ print */
  const out: string[] = [];
  out.push(`Shin price bench, baselines, ${date}`);
  out.push(`prices.db: ${dbPath}  (${totalRows} rows, ${allObs.length} usable CAD rows; read-only, unchanged: ${untouched ? 'yes' : 'NO'})`);
  out.push(`catalogue: ${catalogue ? catPath : 'not found; category steps cannot run'}`);
  out.push(`sealed batch: ${guard.mode === 'none' ? 'none exists' : guard.mode === 'excluded' ? `${guard.count} keys excluded (sha256 ${guard.sha256.slice(0, 12)})` : `OPENED now (${guard.count} keys, sha256 ${guard.sha256.slice(0, 12)}), scored once`}`);
  out.push('');
  out.push('Answer keys');
  out.push(`  (a) prediction: ${keys.prediction.products} products at ${'3+'} shops, ${keys.prediction.truthPoints} truth points`);
  out.push(`  (b) sale: ${keys.sale.saleRows} sale rows, ${keys.sale.withBarcode} with a barcode, ${keys.sale.paired} paired with a regular price (${JSON.stringify(keys.sale.byPairing)})`);
  out.push(`      high side (convenience stores): ${keys.highSide.status}: ${keys.highSide.note}`);
  out.push(`  excluded from every key: ${keys.excluded.flagged} rows carrying flags, ${keys.excluded.unverified_printout} printout rows without price_verified = 1`);
  out.push(`  (c) matching: ${matching.status}, ${matching.rows} rows, ${matching.withBarcode} with a barcode; not scored (matching paused)`);
  out.push(`  audit: ${audit.flagged} of ${audit.rows} rows flagged (${JSON.stringify(audit.bySource)}); re-read sheet ${csvNote}`);
  out.push(`  key error rate: ${errorRate.status === 'measured' ? `${pct(errorRate.errorRate)} (95% ${pct(errorRate.errorRate95.low)} to ${pct(errorRate.errorRate95.high)}, ${errorRate.randomReread} random rows re-read)` : `NOT MEASURED (${errorRate.reason})`}`);
  out.push('');
  for (const f of folds) if (!isFold(f)) out.push(`split ${f.name}: not possible: ${f.impossible}`);
  out.push(`data (7.5): ${support.rows} usable rows, ${support.products} products, dates ${support.dates.join(', ')}; products by number of dates ${JSON.stringify(support.productsPerDateCount)}; regions ${JSON.stringify(support.regions)}; Ontario rows ${support.ontarioRows}`);
  out.push(`  product-and-date holdout: ${support.productAndDate.possible ? `possible: ${support.productAndDate.testProducts} test products, ${support.productAndDate.testPoints} test prices, ${support.productAndDate.testSales} sales; ${support.productAndDate.trainRows} training rows from ${support.productAndDate.trainProducts} products` : `NOT possible: ${support.productAndDate.reason}`}`);
  if (ontario) out.push(`  Ontario: ${ontario.note}`);
  for (const l of leaks) out.push(`  leak audit ${l.fold}: promised (${l.promised.checked.join('+')}) ${l.promised.ok ? 'clean' : 'LEAK'}; product and date: ${l.both.note}`);
  out.push(`hand audit (7.7): ${auditSize ? auditSize.statement : 'no key rows'}; draw with node src/handaudit.ts sample (the reread sheet's marks were Claude's, not a person's, and do not count)`);
  out.push('');
  out.push(`controls (7.6): ${controlled.aborted ? 'FAILED, NOTHING SCORED' : 'ran'}: ${controlled.reason}`);
  for (const c of controlled.controls) {
    out.push(`  ${c.summary}`);
    for (const r of c.results) out.push(`    ${r.name.padEnd(15)} ${r.status.padEnd(10)} ${r.reason}`);
  }
  out.push('paired comparison (7.4): not run: no candidate estimator is registered and no Claude arm file is given (see src/paired.ts)');
  out.push(`bar (defaults, changeable by Jamin): ${JSON.stringify(DEFAULT_BAR)}`);
  out.push('');
  out.push('The verdict that counts is by_time (and the sealed batch when opened). by_product measures cold start on unseen');
  out.push('products, where only category-level models apply: it is reported and is not a pass requirement.');
  out.push('A candidate passes only by beating category_range and category_median on the same items (paired bootstrap over products).');
  out.push('');
  out.push('split        model             scored/points  hit     claim  width(med/p90)  IS     logerr(med)  within10%  within25%  sale-low  gate');
  for (const r of runs) {
    if (!r.ran || !r.scores) {
      out.push(`${r.fold.padEnd(11)}  ${r.model.padEnd(16)}  ${r.notRunReason}`);
      continue;
    }
    const s = r.scores;
    out.push(
      [
        r.fold.padEnd(11),
        r.model.padEnd(16),
        `${s.scored}/${s.points}`.padStart(13),
        pct(s.hitRate),
        pct(s.claimedCoverage),
        `${num(s.width?.median)}/${num(s.width?.p90)}`.padStart(14),
        num(s.intervalScoreMean).padStart(6),
        num(s.logError?.median, 3).padStart(11),
        pct(s.within?.['10%']).padStart(9),
        pct(s.within?.['25%']).padStart(9),
        `${pct(s.sale.saleLowRate)} n=${s.sale.scored}`,
        (r.gate?.pass ? 'PASS' : `fail (${r.gate?.failures.join(', ')})`) + (r.counts ? '' : '  [reported only]'),
      ].join('  '),
    );
  }
  out.push('');
  out.push('Overall verdict (counting folds only):');
  for (const [m, v] of overallVerdict(runs)) out.push(`  ${m.padEnd(18)} ${v.pass ? 'PASS' : 'fail'}  ${v.reason}`);
  for (const r of runs) {
    if (!r.scores) continue;
    out.push('');
    out.push(`${r.fold} / ${r.model}: ${r.scores.sentences.join('; ')}`);
    if (r.extra) out.push(`  ${JSON.stringify(r.extra)}`);
    for (const b of r.gate?.baselines ?? []) out.push(`  B4: ${b.note}`);
    const cats = Object.entries(r.scores.perCategory).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    if (cats.length) out.push(`  per category (top 8 by n): ${cats.map(([c, v]) => `${c} ${v.hits}/${v.n}`).join(', ')}`);
  }
  console.log(out.join('\n'));

  if (write) {
    const jsonPath = writeResult(
      resultsDir,
      'baseline',
        {
          date,
          pricesDb: { path: dbPath, rows: totalRows, usableCadRows: allObs.length, before, after, untouched },
          catalogue: catalogue ? catPath : null,
          sealed:
            guard.mode === 'opened'
              ? { path: sealedPath, mode: guard.mode, count: guard.count, openedOn: guard.openedOn, sha256: guard.sha256, keysSha256: guard.keysSha256 }
              : guard.mode === 'excluded'
                ? { path: sealedPath, mode: guard.mode, count: guard.count, sha256: guard.sha256, keysSha256: guard.keysSha256 }
                : { path: sealedPath, mode: 'none', sha256: null },
          keys,
          audit: { ...audit, rereadSheet: csvNote, keyErrorRate: errorRate, handAuditSize: auditSize },
          dataSupport: support,
          ontario,
          leaks,
          controls: controlled,
          bar: DEFAULT_BAR,
          splits: folds.map((f) => (isFold(f) ? { name: f.name, description: f.description, cutoff: f.cutoff, trainRows: f.train.length, testPoints: f.testPoints.length, testSales: f.testSales.length, testProducts: f.testKeys.size } : f)),
          runs,
          overall: Object.fromEntries(overallVerdict(runs)),
        },
    );
    console.log(`\nwrote ${jsonPath}`);
  }
  if (controlled.aborted) {
    console.error(`
${controlled.reason}`);
    process.exitCode = 3;
  }
  if (!untouched) {
    console.error('prices.db size or mtime changed during the run; investigate before trusting anything');
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
