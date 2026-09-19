/**
 * WHAT THE ONE GEMINI CALL ACTUALLY DID, counted.
 *
 * This scores `GeminiRun`s -- the output of the path a shopper's scan really
 * takes since fdf9300 -- against `identify/eval/manifest.json`. It is a
 * SEPARATE measurement from `identify/eval/metrics.ts`, which scores
 * `IdentifyStage.fromCrop` and the catalogue cascade. Neither replaces the
 * other and neither is being retired here.
 *
 * THE FIVE NUMBERS, in the order they matter:
 *
 *  1. PARSE STATUS BY FAMILY. Gemini 2.5 cannot be given a response schema
 *     while searching -- structured output with Google Search is "available
 *     only to Gemini 3 series models" -- so on 2.5 the JSON shape is asked for
 *     in the prompt text and parsed here, while 3.x is schema-bound
 *     (`gemini-scan.ts` header). Jamin: "the paid-key test counts the share of
 *     2.5 answers that do not parse; a high share is the 'testing says
 *     otherwise' that moves the default to 3.x." `unparsedShare` below IS that
 *     counter. It decides which model ships.
 *
 *  2. IDENTIFICATION, right / wrong / UNCERTAIN, by `name-match.ts`. Read that
 *     file's header before quoting any of it; the matcher has error modes and
 *     names them.
 *
 *  3. OFFER YIELD. `checkMath` and the verdict both need at least TWO offers
 *     on the line; below that no price line may be drawn at all. A run heavy
 *     in 0 and 1 means the verdict -- the entire product -- is mostly
 *     unavailable however well the product was named.
 *
 *  4. MATH DISAGREEMENT. How often Gemini's own arithmetic fails the hidden
 *     re-check (`checkMath`, item 14). Shin shows Gemini's verdict as it
 *     stands, so this rate is the only thing standing between a shopper and a
 *     wrong verdict.
 *
 *  5. REFUSAL on the negative rows, when the negative rows are usable.
 */

import {
  checkMath,
  labelOf,
  toAnswerBlock,
  type GeminiRun,
  type MathCheck,
  type ModelFamily,
  type ParseStatus,
} from '../src/providers/gemini-scan.ts';
import { matchName, type MatchVerdict, type NameMatch } from './name-match.ts';

/* ------------------------------------------------------------- manifest */

export interface ManifestRow {
  readonly code: string | null;
  readonly file: string;
  readonly brand: string | null;
  readonly name: string;
  readonly size: string | null;
  readonly kind: string;
  readonly expect: 'identify' | 'refuse';
  readonly category: string | null;
}

/* ----------------------------------------------------------- per-row row */

export type OfferBucket = '0' | '1' | '2+';

export interface ScoredRow {
  readonly index: number;
  readonly code: string | null;
  readonly file: string;
  readonly kind: string;
  readonly expect: 'identify' | 'refuse';
  readonly expected: { readonly brand: string | null; readonly name: string; readonly size: string | null };

  readonly model: string;
  readonly family: ModelFamily;
  readonly parseStatus: ParseStatus;
  readonly httpStatus: number | null;
  readonly failure: string | null;
  readonly lowConfidence: boolean;
  readonly confidenceReasons: readonly string[];
  readonly ms: number;

  readonly got: { readonly label: string | null; readonly brand: string | null; readonly name: string | null; readonly size: string | null };
  readonly match: NameMatch;

  readonly offersShown: number;
  readonly offersInMedian: number;
  readonly offerBucket: OfferBucket;
  readonly verdictAvailable: boolean;
  readonly noVerdictReason: string | null;

  readonly math: { readonly checked: boolean; readonly mismatches: number; readonly skipped: number; readonly fields: readonly string[] };

  readonly searchQueries: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;

  /** True when this row was a `refuse` row and Gemini named a product anyway. */
  readonly namedOnRefuseRow: boolean;
}

function bucketOf(n: number): OfferBucket {
  return n === 0 ? '0' : n === 1 ? '1' : '2+';
}

export function scoreRow(index: number, row: ManifestRow, run: GeminiRun): ScoredRow {
  const label = labelOf(run);
  const block = toAnswerBlock(run);
  const math: MathCheck = checkMath(run.answer, run.thresholds, {
    shelfPriceCents: run.shelfPriceCents,
    currency: run.answer?.shelfCurrency ?? null,
  });
  const inMedian = (run.answer?.offers ?? []).filter((o) => o.inMedian).length;
  const got = { brand: label?.brand ?? null, name: label?.name ?? null, size: label?.size ?? null };

  return {
    index,
    code: row.code,
    file: row.file,
    kind: row.kind,
    expect: row.expect,
    expected: { brand: row.brand, name: row.name, size: row.size },

    model: run.model,
    family: run.family,
    parseStatus: run.parseStatus,
    httpStatus: run.httpStatus,
    failure: run.failure,
    lowConfidence: run.lowConfidence,
    confidenceReasons: run.confidenceReasons,
    ms: run.ms,

    got: { label: label?.label ?? null, ...got },
    match: matchName({ brand: row.brand, name: row.name, size: row.size }, label ? got : null),

    offersShown: block.offers.length,
    offersInMedian: inMedian,
    offerBucket: bucketOf(block.offers.length),
    verdictAvailable: run.answer?.verdict?.available === true,
    noVerdictReason: run.answer?.verdict?.noVerdictReason ?? null,

    math: {
      checked: math.checked,
      mismatches: math.mismatches.length,
      skipped: math.skipped.length,
      fields: math.mismatches.map((m) => m.field),
    },

    searchQueries: run.searchQueries.length,
    inputTokens: run.usage.inputTokens,
    outputTokens: run.usage.outputTokens,

    namedOnRefuseRow: row.expect === 'refuse' && label !== null,
  };
}

/* ----------------------------------------------------------- aggregates */

export interface ParseCounts {
  readonly total: number;
  readonly clean: number;
  readonly repaired: number;
  readonly failed: number;
  readonly none: number;
  /** (failed + none) / total. THE counter Jamin asked for. */
  readonly unparsedShare: number;
  /** (repaired + failed + none) / total: everything that was not clean first time. */
  readonly notCleanShare: number;
}

export function parseCounts(rows: readonly ScoredRow[]): ParseCounts {
  const c = { clean: 0, repaired: 0, failed: 0, none: 0 };
  for (const r of rows) c[r.parseStatus] += 1;
  const total = rows.length;
  return {
    total,
    ...c,
    unparsedShare: total === 0 ? 0 : (c.failed + c.none) / total,
    notCleanShare: total === 0 ? 0 : (c.repaired + c.failed + c.none) / total,
  };
}

export interface IdentCounts {
  readonly total: number;
  readonly right: number;
  readonly wrong: number;
  readonly uncertain: number;
  /** right / (right + wrong). The uncertain rows are OUTSIDE the denominator on purpose. */
  readonly accuracyOfCalled: number | null;
  /** uncertain / total: how much of the set the matcher refused to call. */
  readonly uncertainShare: number;
}

export function identCounts(rows: readonly ScoredRow[]): IdentCounts {
  const c: Record<MatchVerdict, number> = { right: 0, wrong: 0, uncertain: 0 };
  for (const r of rows) c[r.match.verdict] += 1;
  const called = c.right + c.wrong;
  return {
    total: rows.length,
    ...c,
    accuracyOfCalled: called === 0 ? null : c.right / called,
    uncertainShare: rows.length === 0 ? 0 : c.uncertain / rows.length,
  };
}

export interface OfferYield {
  readonly total: number;
  readonly zero: number;
  readonly one: number;
  readonly twoPlus: number;
  /** (zero + one) / total: the share of scans that CANNOT carry a price line. */
  readonly belowFloorShare: number;
  readonly verdictAvailable: number;
  readonly medianOffersShown: number;
}

export function offerYield(rows: readonly ScoredRow[]): OfferYield {
  const c = { '0': 0, '1': 0, '2+': 0 };
  for (const r of rows) c[r.offerBucket] += 1;
  const counts = rows.map((r) => r.offersShown).sort((a, b) => a - b);
  const mid = counts.length >> 1;
  const median = counts.length === 0 ? 0 : counts.length % 2 === 1 ? counts[mid] : (counts[mid - 1] + counts[mid]) / 2;
  return {
    total: rows.length,
    zero: c['0'],
    one: c['1'],
    twoPlus: c['2+'],
    belowFloorShare: rows.length === 0 ? 0 : (c['0'] + c['1']) / rows.length,
    verdictAvailable: rows.filter((r) => r.verdictAvailable).length,
    medianOffersShown: median,
  };
}

export interface MathCounts {
  readonly total: number;
  /** Rows where there was arithmetic to check at all. */
  readonly checked: number;
  readonly disagreed: number;
  /** disagreed / checked. Null when nothing could be checked. */
  readonly disagreementRate: number | null;
  readonly skippedParts: number;
  /** Which fields disagreed, commonest first. */
  readonly byField: Readonly<Record<string, number>>;
}

export function mathCounts(rows: readonly ScoredRow[]): MathCounts {
  const checked = rows.filter((r) => r.math.checked);
  const disagreed = checked.filter((r) => r.math.mismatches > 0);
  const byField: Record<string, number> = {};
  for (const r of rows) for (const f of r.math.fields) byField[f] = (byField[f] ?? 0) + 1;
  return {
    total: rows.length,
    checked: checked.length,
    disagreed: disagreed.length,
    disagreementRate: checked.length === 0 ? null : disagreed.length / checked.length,
    skippedParts: rows.reduce((s, r) => s + r.math.skipped, 0),
    byField: Object.fromEntries(Object.entries(byField).sort((a, b) => b[1] - a[1])),
  };
}

export interface RefusalCounts {
  readonly total: number;
  /** Rows where Gemini named a product on a row the set says it should not have. */
  readonly named: number;
  /** Named, but carried the "not fully confident" mark, which is the honest middle. */
  readonly namedButMarkedLowConfidence: number;
  readonly gaveNoName: number;
  readonly usable: boolean;
  readonly note: string;
}

export function refusalCounts(rows: readonly ScoredRow[], note: string): RefusalCounts {
  const named = rows.filter((r) => r.namedOnRefuseRow);
  return {
    total: rows.length,
    named: named.length,
    namedButMarkedLowConfidence: named.filter((r) => r.lowConfidence).length,
    gaveNoName: rows.length - named.length,
    usable: rows.length > 0,
    note,
  };
}

export interface FamilyReport {
  readonly family: ModelFamily;
  readonly model: string;
  readonly rows: number;
  readonly parse: ParseCounts;
  readonly identification: IdentCounts;
  readonly identificationByKind: Readonly<Record<string, IdentCounts>>;
  readonly offers: OfferYield;
  readonly math: MathCounts;
  readonly failures: Readonly<Record<string, number>>;
  readonly lowConfidence: number;
  readonly meanMs: number;
  readonly totalSearchQueries: number;
  readonly totalInputTokens: number | null;
  readonly totalOutputTokens: number | null;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) (out[key(item)] ??= []).push(item);
  return out;
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

export function familyReport(family: ModelFamily, rows: readonly ScoredRow[]): FamilyReport {
  const identify = rows.filter((r) => r.expect === 'identify');
  const failures: Record<string, number> = {};
  for (const r of rows) if (r.failure) failures[r.failure] = (failures[r.failure] ?? 0) + 1;
  return {
    family,
    model: rows[0]?.model ?? '(none)',
    rows: rows.length,
    parse: parseCounts(rows),
    identification: identCounts(identify),
    identificationByKind: Object.fromEntries(Object.entries(groupBy(identify, (r) => r.kind)).map(([k, v]) => [k, identCounts(v)])),
    offers: offerYield(rows),
    math: mathCounts(rows),
    failures,
    lowConfidence: rows.filter((r) => r.lowConfidence).length,
    meanMs: rows.length === 0 ? 0 : rows.reduce((s, r) => s + r.ms, 0) / rows.length,
    totalSearchQueries: rows.reduce((s, r) => s + r.searchQueries, 0),
    totalInputTokens: sumOrNull(rows.map((r) => r.inputTokens)),
    totalOutputTokens: sumOrNull(rows.map((r) => r.outputTokens)),
  };
}

export interface EvalReport {
  readonly rows: number;
  readonly byFamily: readonly FamilyReport[];
  readonly overallParse: ParseCounts;
  readonly overallIdentification: IdentCounts;
  readonly refusal: RefusalCounts;
  /** Every row the matcher would not call, for hand review. This list IS a deliverable. */
  readonly uncertainRows: readonly { readonly index: number; readonly code: string | null; readonly expectedLabel: string; readonly got: string | null; readonly coverage: number; readonly brand: string; readonly size: string; readonly reasons: readonly string[] }[];
}

export function buildReport(rows: readonly ScoredRow[], refusalNote: string): EvalReport {
  const identify = rows.filter((r) => r.expect === 'identify');
  const refuse = rows.filter((r) => r.expect === 'refuse');
  const families = groupBy(rows, (r) => r.family);
  return {
    rows: rows.length,
    byFamily: (Object.keys(families).sort() as ModelFamily[]).map((f) => familyReport(f, families[f])),
    overallParse: parseCounts(rows),
    overallIdentification: identCounts(identify),
    refusal: refusalCounts(refuse, refusalNote),
    uncertainRows: identify
      .filter((r) => r.match.verdict === 'uncertain')
      .map((r) => ({
        index: r.index,
        code: r.code,
        expectedLabel: [r.expected.brand, r.expected.name, r.expected.size].filter(Boolean).join(' '),
        got: r.got.label,
        coverage: Number(r.match.coverage.toFixed(3)),
        brand: r.match.brand,
        size: r.match.size,
        reasons: r.match.reasons,
      })),
  };
}

/* -------------------------------------------------------------- printing */

const pct = (n: number | null): string => (n === null ? '  n/a' : `${(n * 100).toFixed(1)}%`);

export function printableReport(report: EvalReport): string {
  const out: string[] = [];
  out.push(`ROWS SCORED: ${report.rows}`);
  out.push('');

  out.push('1. PARSE STATUS BY FAMILY  <- the number that decides 2.5 against 3.x');
  out.push('   family  n     clean  repaired  failed  none   did-not-parse');
  for (const f of report.byFamily) {
    const p = f.parse;
    out.push(
      `   ${f.family.padEnd(6)}  ${String(p.total).padStart(4)}  ${String(p.clean).padStart(6)}  ${String(p.repaired).padStart(8)}  ${String(p.failed).padStart(6)}  ${String(p.none).padStart(4)}   ${pct(p.unparsedShare).padStart(6)}`,
    );
  }
  out.push('');

  out.push('2. IDENTIFICATION  (right / wrong / uncertain -- see name-match.ts for what the matcher gets wrong)');
  for (const f of report.byFamily) {
    const i = f.identification;
    out.push(`   ${f.family}: right ${i.right}, wrong ${i.wrong}, uncertain ${i.uncertain}  |  accuracy of the rows it would call: ${pct(i.accuracyOfCalled)}, abstained on ${pct(i.uncertainShare)}`);
    for (const [kind, k] of Object.entries(f.identificationByKind).sort()) {
      out.push(`       ${kind.padEnd(12)} right ${String(k.right).padStart(3)}  wrong ${String(k.wrong).padStart(3)}  uncertain ${String(k.uncertain).padStart(3)}`);
    }
  }
  out.push('');

  out.push('3. OFFER YIELD  (two offers is the floor below which no price line may be drawn)');
  for (const f of report.byFamily) {
    const o = f.offers;
    out.push(`   ${f.family}: 0 offers ${o.zero}, 1 offer ${o.one}, 2+ offers ${o.twoPlus}  |  below the floor: ${pct(o.belowFloorShare)}  |  verdict available on ${o.verdictAvailable} of ${o.total}`);
  }
  out.push('');

  out.push('4. GEMINI ARITHMETIC vs THE HIDDEN RE-CHECK');
  for (const f of report.byFamily) {
    const m = f.math;
    out.push(`   ${f.family}: checked ${m.checked} of ${m.total}, disagreed on ${m.disagreed}  (${pct(m.disagreementRate)})`);
    const fields = Object.entries(m.byField);
    if (fields.length > 0) out.push(`       fields: ${fields.map(([k, v]) => `${k} x${v}`).join(', ')}`);
  }
  out.push('');

  out.push('5. REFUSAL on the negative set');
  out.push(`   ${report.refusal.note}`);
  if (report.refusal.usable) {
    out.push(`   ${report.refusal.total} rows: named a product on ${report.refusal.named}, of which ${report.refusal.namedButMarkedLowConfidence} carried the low-confidence mark; gave no name on ${report.refusal.gaveNoName}`);
  }
  out.push('');

  out.push('6. OPERATIONAL');
  for (const f of report.byFamily) {
    out.push(`   ${f.family} (${f.model}): ${f.totalSearchQueries} search queries, ${f.totalInputTokens ?? 'n/a'} in / ${f.totalOutputTokens ?? 'n/a'} out tokens, ${f.meanMs.toFixed(0)} ms mean, ${f.lowConfidence} low-confidence, failures ${JSON.stringify(f.failures)}`);
  }
  out.push('');

  out.push(`7. HAND-REVIEW LIST: ${report.uncertainRows.length} rows the matcher would not call. They are in the result file under "uncertainRows".`);
  return out.join('\n');
}
