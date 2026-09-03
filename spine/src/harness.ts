/**
 * The corpus harness, and the only thing that produces a number.
 *
 * Invariant iii of the pass: the scoreboard has a number for last week, produced
 * whether or not anyone looked at it. This is what produces it for band 1.
 *
 * The measured quantity is COVERAGE, how often the spine will answer at all , 
 * because that is what the hand pilot measured and it is the only figure the
 * kill gate is written against. Coverage is not correctness. Whether the answers
 * are right is checked by a fresh agent against live sources, on twenty of them,
 * and this file cannot and does not claim it.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { CategoryId, RefusalReason, SpineResult } from './contract.ts';
import { priceIt } from './spine.ts';
import type { SpineDeps } from './spine.ts';

export interface CorpusItem {
  id: string;
  query: { text?: string; gtin?: string; category?: CategoryId };
  askingCents: number;
  askingSeller?: string;
  askingProvenance: string;
}

export interface Corpus {
  target: number;
  asOf: string;
  baseline: { name: string; verdicts: number; items: number; note: string };
  note: string;
  items: CorpusItem[];
}

export interface RunRow {
  id: string;
  outcome: 'verdict' | 'refusal';
  reason: RefusalReason | null;
  tier: string | null;
  confidence: string | null;
  pointCount: number;
  askingProvenance: string;
  line: string;
}

export interface RunReport {
  ranAt: string;
  asOf: string;
  corpusSize: number;
  corpusTarget: number;
  /** True only when the corpus is full. The kill gate is not runnable before this. */
  gateRunnable: boolean;
  verdicts: number;
  refusals: number;
  coverage: number;
  baselineCoverage: number;
  beatsBaseline: boolean;
  /** How many judged prices came from a real observation rather than a stated stand-in. */
  observedAskingPrices: number;
  refusalsByReason: Record<string, number>;
  sources: { id: string; available: boolean; verified: boolean; note: string }[];
  rows: RunRow[];
  /** Written into the report so a reader never has to be told separately. */
  caveats: string[];
}

export const CORPUS_PATH = fileURLToPath(new URL('../data/corpus.json', import.meta.url));

export function loadCorpus(path: string = CORPUS_PATH): Corpus {
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

export async function runCorpus(
  corpus: Corpus,
  deps: SpineDeps,
  asOfOverride?: string,
): Promise<RunReport> {
  const asOf = asOfOverride ?? corpus.asOf;
  const rows: RunRow[] = [];
  const refusalsByReason: Record<string, number> = {};
  let verdicts = 0;
  let observedAskingPrices = 0;

  for (const item of corpus.items) {
    if (item.askingProvenance.startsWith('observed')) observedAskingPrices += 1;
    const result: SpineResult = await priceIt(
      {
        ...item.query,
        askingCents: item.askingCents,
        askingSeller: item.askingSeller,
        asOf,
      },
      deps,
    );
    if (result.kind === 'verdict') {
      verdicts += 1;
      rows.push({
        id: item.id,
        outcome: 'verdict',
        reason: null,
        tier: result.tier,
        confidence: result.confidence.band,
        pointCount: result.pointCount,
        askingProvenance: item.askingProvenance,
        line: result.lines[0],
      });
    } else {
      refusalsByReason[result.reason] = (refusalsByReason[result.reason] ?? 0) + 1;
      rows.push({
        id: item.id,
        outcome: 'refusal',
        reason: result.reason,
        tier: null,
        confidence: null,
        pointCount: result.evidence.length,
        askingProvenance: item.askingProvenance,
        line: result.detail,
      });
    }
  }

  const coverage = corpus.items.length === 0 ? 0 : verdicts / corpus.items.length;
  const baselineCoverage = corpus.baseline.verdicts / corpus.baseline.items;
  const gateRunnable = corpus.items.length >= corpus.target;

  const caveats: string[] = [];
  if (!gateRunnable) {
    caveats.push(
      `Corpus is ${corpus.items.length} of ${corpus.target}. Band 1's kill gate is not runnable and this coverage figure settles nothing.`,
    );
  }
  if (observedAskingPrices < corpus.items.length) {
    caveats.push(
      `${corpus.items.length - observedAskingPrices} of ${corpus.items.length} judged prices are stated stand-ins rather than observed shelf prices.`,
    );
  }
  const unverified = deps.sources.filter((s) => !s.verified).map((s) => s.id);
  if (unverified.length > 0) {
    caveats.push(`Unverified adapters present and never run live: ${unverified.join(', ')}.`);
  }
  caveats.push(
    'Coverage is not correctness. Nothing here checks whether a verdict is right; that is twenty verdicts against live sources, by something that did not build this.',
  );

  return {
    ranAt: new Date().toISOString(),
    asOf,
    corpusSize: corpus.items.length,
    corpusTarget: corpus.target,
    gateRunnable,
    verdicts,
    refusals: corpus.items.length - verdicts,
    coverage,
    baselineCoverage,
    beatsBaseline: coverage > baselineCoverage,
    observedAskingPrices,
    refusalsByReason,
    sources: deps.sources.map((s) => {
      const a = s.available();
      return {
        id: s.id,
        available: a.ok,
        verified: s.verified,
        note: a.ok ? 'available' : a.reason,
      };
    }),
    rows,
    caveats,
  };
}

export function formatReport(r: RunReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const out: string[] = [];
  out.push(`Corpus run, as of ${r.asOf}`);
  out.push(`  items      ${r.corpusSize} of ${r.corpusTarget} target${r.gateRunnable ? '' : '  (gate NOT runnable)'}`);
  out.push(`  verdicts   ${r.verdicts}`);
  out.push(`  refusals   ${r.refusals}`);
  out.push(`  coverage   ${pct(r.coverage)}  vs baseline ${pct(r.baselineCoverage)}  ->  ${r.beatsBaseline ? 'above' : 'not above'}`);
  out.push('');
  out.push('  by item');
  for (const row of r.rows) {
    const head = row.outcome === 'verdict' ? `${row.tier} (${row.confidence}, ${row.pointCount}pts)` : `refused: ${row.reason}`;
    out.push(`    ${row.id.padEnd(22)} ${head}`);
  }
  if (Object.keys(r.refusalsByReason).length > 0) {
    out.push('');
    out.push('  refusals by reason');
    for (const [reason, n] of Object.entries(r.refusalsByReason).sort((a, b) => b[1] - a[1])) {
      out.push(`    ${reason.padEnd(22)} ${n}`);
    }
  }
  out.push('');
  out.push('  sources');
  for (const s of r.sources) {
    out.push(`    ${s.id.padEnd(22)} ${s.available ? 'available' : 'unavailable'}${s.verified ? '' : ', UNVERIFIED'}, ${s.note}`);
  }
  out.push('');
  out.push('  read this before quoting the number above');
  for (const c of r.caveats) out.push(`    - ${c}`);
  return out.join('\n');
}

/** Appends one row to SCOREBOARD.md and drops the full JSON beside it. */
export function writeScoreboard(report: RunReport, root: string): { json: string; md: string } {
  const dir = join(root, 'scoreboard');
  mkdirSync(dir, { recursive: true });
  const stamp = report.ranAt.slice(0, 10);
  const jsonPath = join(dir, `${stamp}-corpus.json`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const mdPath = join(root, 'SCOREBOARD.md');
  let existing: string;
  try {
    existing = readFileSync(mdPath, 'utf8');
  } catch {
    existing = [
      '# Scoreboard',
      '',
      'One row per corpus run. Produced by `npm run corpus -- --write` in `spine/`,',
      'whether or not anyone looked at it. Plain `npm run corpus` prints and writes',
      'nothing. Coverage is how often the spine answers at all; it is not correctness,',
      'and no row here has ever been checked against a live source.',
      '',
      '| date | corpus | verdicts | coverage | vs baseline | gate runnable |',
      '| --- | --- | --- | --- | --- | --- |',
      '',
    ].join('\n');
  }
  const row = `| ${stamp} | ${report.corpusSize}/${report.corpusTarget} | ${report.verdicts} | ${(report.coverage * 100).toFixed(1)}% | ${(report.baselineCoverage * 100).toFixed(1)}% baseline, ${report.beatsBaseline ? 'above' : 'not above'} | ${report.gateRunnable ? 'yes' : 'no'} |\n`;
  writeFileSync(mdPath, existing.endsWith('\n') ? existing + row : `${existing}\n${row}`, 'utf8');
  return { json: jsonPath, md: mdPath };
}

export function repoRoot(): string {
  return dirname(dirname(fileURLToPath(new URL('.', import.meta.url))));
}
