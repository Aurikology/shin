/**
 * THE EVAL FOR THE PATH A SHOPPER ACTUALLY TAKES.
 *
 * Since fdf9300 / 938a809 / 8c0d725 a scan is ONE Gemini call
 * (`identify/src/providers/gemini-scan.ts`); `app/server.ts:1033` records what
 * it replaced: "IdentifyStage and the Claude identifier on the photo". The
 * 200-photo eval next door (`identify/eval/run.ts`) still measures
 * `IdentifyStage.fromCrop` -- a component no shopper touches any more. This
 * harness measures the one that does. IT DOES NOT REPLACE THAT ONE and
 * nothing here modifies it; whether it is retired is a separate decision.
 *
 * Its results are written to `identify/eval/results/gemini-scan-eval-*.json`,
 * a prefix the old harness never uses (`results/YYYY-MM-DD*.json`), so the two
 * sets of numbers can never be confused for each other.
 *
 * ----------------------------------------------------------------- RUNNING
 *
 *   node identify/eval/scan-run.ts --cost-only
 *       prints the bill for a 200-row run on each family. Spends nothing.
 *
 *   node identify/eval/scan-run.ts --dry-run [--limit N] [--family 2.5|3.x|both]
 *       the default. NO NETWORK, NO KEY, NO MONEY. A stub transport answers
 *       every call, so the real prompt build, the real HTTP walk, the real
 *       `interpretText`, `readAnswer`, `toAnswerBlock` and `checkMath` all run.
 *
 *   node identify/eval/scan-run.ts --live --yes-spend
 *       the real thing. Refuses to start without --yes-spend, and prints the
 *       bill first either way. GEMINI_API_KEY must be set.
 *
 * ------------------------------------------- WHAT THE DRY RUN DOES NOT SAY
 *
 * THE DRY RUN PRODUCES NO ACCURACY NUMBER. Its answers are synthesised from
 * the manifest row itself, perturbed on a fixed schedule so that every bucket
 * the scorer can report is exercised at least once. A dry-run identification
 * rate measures this file's own perturbation schedule and nothing about
 * Gemini. Every dry result file carries `"measures": "nothing about Gemini"`
 * in its header for exactly that reason.
 *
 * --------------------------------------------- WHAT THE MANIFEST CANNOT DO
 *
 * `identify/eval/manifest.json` was selected for a catalogue-CODE eval. Two
 * things about it are wrong for a NAME eval, and both are counted and printed
 * rather than worked around:
 *   - all 20 `expect:'refuse'` rows are produce rows and NONE of their photos
 *     exist on disk (`photos/produce-01.jpg` .. `-20.jpg`; 200 of 220 files
 *     are present). The negative set cannot be run at all.
 *   - 16 identify rows have fewer than two substantive name tokens ("Almond",
 *     "Chips", "Cheezies"), which a name matcher cannot score reliably. They
 *     are counted here and abstained on by `name-match.ts` unless the brand
 *     also agrees.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_GEMINI_25,
  DEFAULT_GEMINI_3,
  runGeminiScan,
  type GeminiRun,
  type ModelFamily,
  type ScanInput,
} from '../src/providers/gemini-scan.ts';
import type { GroundedTransport } from '../src/providers/gemini-grounded.ts';
import { substantiveTokens } from './name-match.ts';
import { buildReport, printableReport, scoreRow, type ManifestRow, type ScoredRow } from './scan-metrics.ts';
import { costReport, defaultEstimates, estimateCost } from './scan-cost.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = join(HERE, 'results');
/** Nothing the old harness writes begins with this. */
export const RESULT_PREFIX = 'gemini-scan-eval';

/* ------------------------------------------------------------------ args */

export interface Args {
  readonly live: boolean;
  readonly yesSpend: boolean;
  readonly costOnly: boolean;
  readonly limit: number | null;
  readonly families: readonly ModelFamily[];
  readonly out: string | null;
  readonly kind: string | null;
}

export function parseArgs(argv: readonly string[]): Args {
  let live = false;
  let yesSpend = false;
  let costOnly = false;
  let limit: number | null = null;
  let families: ModelFamily[] = ['2.5', '3.x'];
  let out: string | null = null;
  let kind: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') live = true;
    else if (a === '--dry-run') live = false;
    else if (a === '--yes-spend') yesSpend = true;
    else if (a === '--cost-only') costOnly = true;
    else if (a === '--limit') limit = Number(argv[++i]);
    else if (a === '--out') out = argv[++i];
    else if (a === '--kind') kind = argv[++i];
    else if (a === '--family') {
      const v = argv[++i];
      families = v === 'both' ? ['2.5', '3.x'] : v === '2.5' || v === '3.x' ? [v] : (() => { throw new Error(`--family takes 2.5, 3.x or both, not ${v}`); })();
    } else throw new Error(`unknown flag ${a}`);
  }
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) throw new Error('--limit takes a positive whole number');
  return { live, yesSpend, costOnly, limit, families, out, kind };
}

/* -------------------------------------------------------------- manifest */

export interface LoadedManifest {
  readonly rows: readonly ManifestRow[];
  readonly runnable: readonly ManifestRow[];
  readonly missingPhotos: readonly ManifestRow[];
  readonly thinNames: readonly ManifestRow[];
  readonly refusalNote: string;
}

/**
 * Reads the manifest and says out loud which rows a name eval cannot use.
 * `photoDir` is injectable so a test can point at a fixture directory.
 */
export function loadManifest(manifestPath = join(HERE, 'manifest.json'), photoDir = HERE): LoadedManifest {
  const rows = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestRow[];
  const missingPhotos = rows.filter((r) => !existsSync(join(photoDir, r.file)));
  const runnable = rows.filter((r) => existsSync(join(photoDir, r.file)));
  const thinNames = rows.filter((r) => r.expect === 'identify' && substantiveTokens(r.name).length < 2);
  const refuse = rows.filter((r) => r.expect === 'refuse');
  const refuseRunnable = refuse.filter((r) => existsSync(join(photoDir, r.file)));
  const refusalNote =
    refuse.length === 0
      ? 'The manifest carries no refuse rows.'
      : refuseRunnable.length === 0
        ? `UNUSABLE: all ${refuse.length} refuse rows are produce rows and none of their photos exist on disk. Refusal behaviour on the negative set is NOT MEASURED by this run, in dry mode or live. Shoot those ${refuse.length} photos, or drop the negative set from the name eval and say so.`
        : `${refuseRunnable.length} of ${refuse.length} refuse rows have photos and were run.`;
  return { rows, runnable, missingPhotos, thinNames, refusalNote };
}

/* ------------------------------------------------------- the dry transport */

/**
 * A self-consistent answer in the engine's schema, built around the manifest
 * row's own identity. The three unit prices 2 / 3 / 4 give a median of 3, and
 * with the default 10/10 lines that is a span of 35 and boundaries of 35.714
 * and 64.286 -- exactly what the prompt's PRICE MATH asks for, so `checkMath`
 * finds nothing wrong with it unless this function deliberately breaks it.
 */
export function syntheticAnswer(row: ManifestRow, opts: { offers?: number; brand?: string | null; name?: string | null; breakMath?: boolean } = {}): Record<string, unknown> {
  const all = [
    { retailer: 'Alpha Market', unit_price: 2, pct_vs_median: -33.3333, position: 2.381 },
    { retailer: 'Beta Foods', unit_price: 3, pct_vs_median: 0, position: 50 },
    { retailer: 'Gamma Grocer', unit_price: 4, pct_vs_median: 33.3333, position: 97.619 },
  ];
  const want = opts.offers ?? 3;
  const offers = all.slice(0, want);
  const enough = offers.length >= 2;
  return {
    scan: { scan_type: 'photo', market: 'CA', currency: 'CAD' },
    product: {
      name: opts.name === undefined ? row.name : opts.name,
      brand: opts.brand === undefined ? row.brand : opts.brand,
      size: row.size,
      pack_count: 1,
      description: null,
      identification_confidence: 0.9,
      identification_evidence: ['packaging'],
      sources: { name: null, brand: null, size: null },
    },
    condition: { classification: 'new', confidence: 0.9, evidence: [] },
    offers: offers.map((o) => ({
      retailer: o.retailer,
      price: o.unit_price,
      currency: 'CAD',
      url: `https://example.invalid/${o.retailer.split(' ')[0].toLowerCase()}`,
      advertised_price_text: `$${o.unit_price}`,
      size: row.size,
      pack_count: 1,
      condition: 'new',
      price_unit: 'item',
      unit_price: o.unit_price,
      in_median: true,
      exclusion_reason: null,
      pct_vs_median: o.pct_vs_median,
      position: o.position,
    })),
    reviews: [{ rating: 4.2, review_count: 88, summary: 'Fine.', url: 'https://example.invalid/r' }],
    pricing_summary: { shelf_price: null, shelf_currency: null, relevant_offer_count: offers.length, notes: [] },
    uncertainty: { overall_confidence: 0.9, missing_information: [], conflicts: [] },
    price_verdict: enough
      ? {
          verdict_available: true,
          no_verdict_reason: null,
          comparison_unit: 'item',
          median_unit_price: opts.breakMath ? 9 : offers.length === 3 ? 3 : 2.5,
          offers_in_median: offers.length,
          span_pct: offers.length === 3 ? 35 : 20,
          zone_under_boundary: offers.length === 3 ? 35.714 : 25,
          zone_over_boundary: offers.length === 3 ? 64.286 : 75,
          shelf: null,
          confidence: 'ok',
          size_assumed: false,
        }
      : { verdict_available: false, no_verdict_reason: 'too_few_offers', comparison_unit: null, median_unit_price: null, offers_in_median: offers.length, span_pct: null, zone_under_boundary: null, zone_over_boundary: null, shelf: null, confidence: 'thin', size_assumed: false },
    alternatives: [],
  };
}

/** Wraps an answer text in the Interactions-API envelope `walkSteps` reads. */
export function syntheticEnvelope(text: string, queries: readonly string[]): string {
  return JSON.stringify({
    steps: [
      { type: 'google_search_call', arguments: { queries } },
      { type: 'google_search_result', result: [{ search_suggestions: '<div class="container">dry run</div>' }] },
      { type: 'model_output', content: [{ type: 'text', text }] },
    ],
    usage: { total_input_tokens: 4500, total_output_tokens: 800 },
  });
}

/**
 * THE PERTURBATION SCHEDULE. Fixed and index-driven, so a dry run is
 * reproducible and every bucket the scorer can report is hit. It is a test of
 * the scorer, NOT a model of Gemini's behaviour, and the shares it produces
 * mean nothing about Gemini.
 */
export function dryVariant(index: number, row: ManifestRow): { kind: string; text: string; queries: string[] } {
  const q = ['dry run price search', 'dry run retailer two', 'dry run retailer three', 'dry run reviews'];
  if (row.expect === 'refuse') return { kind: 'no-name', text: JSON.stringify(syntheticAnswer(row, { name: null, brand: null })), queries: q };
  if (index % 10 === 3) return { kind: 'unparsable', text: 'I could not find this product. Here is what I know instead, in prose.', queries: q };
  if (index % 10 === 7) {
    const whole = JSON.stringify(syntheticAnswer(row));
    return { kind: 'truncated', text: whole.slice(0, Math.max(40, whole.indexOf('"reviews"') + 14)), queries: q };
  }
  if (index % 5 === 1) return { kind: 'zero-offers', text: JSON.stringify(syntheticAnswer(row, { offers: 0 })), queries: q.slice(0, 1) };
  if (index % 5 === 4) return { kind: 'one-offer', text: JSON.stringify(syntheticAnswer(row, { offers: 1 })), queries: q.slice(0, 2) };
  if (index % 11 === 6) return { kind: 'bad-math', text: JSON.stringify(syntheticAnswer(row, { breakMath: true })), queries: q };
  if (index % 13 === 5) return { kind: 'wrong-brand', text: JSON.stringify(syntheticAnswer(row, { brand: '某 Other Brand' })), queries: q };
  if (index % 13 === 9) return { kind: 'brand-only', text: JSON.stringify(syntheticAnswer(row, { name: 'Assorted Item' })), queries: q };
  if (index % 17 === 8) {
    // Half the name and no brand: coverage lands between the floor and the no-brand bar,
    // which is the shape the matcher must ABSTAIN on. It exercises the hand-review list.
    const parts = row.name.split(/\s+/).filter((t) => t !== '');
    const half = parts.slice(0, Math.max(1, Math.ceil(parts.length / 2))).join(' ');
    return { kind: 'partial-name', text: JSON.stringify(syntheticAnswer(row, { brand: null, name: half })), queries: q };
  }
  return { kind: 'clean', text: JSON.stringify(syntheticAnswer(row)), queries: q };
}

/** Never opens a socket. Answers from `dryVariant` and records nothing outward. */
export function dryTransport(rowFor: () => { index: number; row: ManifestRow }): GroundedTransport {
  return async () => {
    const { index, row } = rowFor();
    const v = dryVariant(index, row);
    return { ok: true, status: 200, text: async () => syntheticEnvelope(v.text, v.queries) };
  };
}

/* ------------------------------------------------------------- the runner */

export interface RunOneOptions {
  readonly live: boolean;
  readonly apiKey?: string;
  readonly transport?: GroundedTransport;
  readonly photoDir?: string;
}

const modelFor = (family: ModelFamily, env: NodeJS.ProcessEnv): string =>
  family === '2.5' ? env.SHIN_GEMINI_MODEL_25?.trim() || DEFAULT_GEMINI_25 : env.SHIN_GEMINI_MODEL_3?.trim() || DEFAULT_GEMINI_3;

/**
 * One manifest row through the real `runGeminiScan`. The family is forced with
 * `SHIN_GEMINI_MODEL`, which `modelForScan` honours, so 2.5 and 3.x see the
 * identical row -- that is the side-by-side Jamin asked for.
 */
export async function runRow(row: ManifestRow, family: ModelFamily, opts: RunOneOptions, env: NodeJS.ProcessEnv = process.env): Promise<GeminiRun> {
  const photoDir = opts.photoDir ?? HERE;
  const path = join(photoDir, row.file);
  const input: ScanInput = {
    kind: 'photo',
    image: { bytes: new Uint8Array(readFileSync(path)), mediaType: 'image/jpeg' },
    market: 'CA',
    currency: 'CAD',
  };
  return runGeminiScan(input, {
    deviceId: `eval-${family}`,
    env: { ...env, SHIN_GEMINI_MODEL: modelFor(family, env) },
    // In dry mode this key never leaves the process: `transport` replaces fetch.
    apiKey: opts.live ? (opts.apiKey ?? env.GEMINI_API_KEY ?? '') : 'dry-run-no-network',
    transport: opts.transport,
    timeoutMs: opts.live ? 60_000 : 1_000,
  });
}

export interface RunOutcome {
  readonly scored: readonly ScoredRow[];
  readonly report: ReturnType<typeof buildReport>;
  readonly manifest: LoadedManifest;
}

export async function runAll(args: Args, manifest: LoadedManifest, opts: RunOneOptions, env: NodeJS.ProcessEnv = process.env): Promise<RunOutcome> {
  let pool = manifest.runnable;
  if (args.kind) pool = pool.filter((r) => r.kind === args.kind);
  if (args.limit !== null) pool = pool.slice(0, args.limit);

  const scored: ScoredRow[] = [];
  let cursor = { index: 0, row: pool[0] };
  const transport = opts.transport ?? (args.live ? undefined : dryTransport(() => cursor));

  for (const family of args.families) {
    for (let i = 0; i < pool.length; i++) {
      cursor = { index: i, row: pool[i] };
      const run = await runRow(pool[i], family, { ...opts, transport });
      scored.push(scoreRow(i, pool[i], run));
    }
  }
  return { scored, report: buildReport(scored, manifest.refusalNote), manifest };
}

/* ------------------------------------------------------------------- main */

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function resultPath(live: boolean, out: string | null): string {
  if (out) return resolve(out);
  // 'dry-run', not 'dry': .gitignore already carries
  // `identify/eval/results/*dry-run.json` for the old harness, and a dry
  // result of THIS harness is the same kind of thing -- half a megabyte that
  // measures the perturbation schedule and nothing about Gemini. Matching the
  // convention that exists beats adding a second rule beside it.
  return join(RESULTS_DIR, `${RESULT_PREFIX}-${stamp()}-${live ? 'live' : 'dry-run'}.json`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest();

  if (args.costOnly) {
    // The run the manifest describes: 200 rows on each family.
    console.log(costReport(defaultEstimates(200)));
    return;
  }

  const rowsToPrice = args.limit ?? manifest.runnable.length;
  const estimates = args.families.map((f) => estimateCost({ family: f, model: modelFor(f, process.env), rows: rowsToPrice }));
  console.log(costReport(estimates));
  console.log('');

  console.log('MANIFEST FITNESS FOR A NAME EVAL');
  console.log(`  ${manifest.rows.length} rows, ${manifest.runnable.length} with a photo on disk, ${manifest.missingPhotos.length} without.`);
  console.log(`  ${manifest.thinNames.length} identify rows have fewer than two substantive name tokens and cannot be scored reliably by name.`);
  console.log(`  refusal set: ${manifest.refusalNote}`);
  console.log('');

  if (args.live) {
    if (!args.yesSpend) {
      console.error('REFUSING TO SPEND. Re-run with --yes-spend once the figures above are acceptable.');
      process.exitCode = 2;
      return;
    }
    if (!(process.env.GEMINI_API_KEY ?? '').trim()) {
      console.error('No GEMINI_API_KEY. A live run needs one; --dry-run needs nothing.');
      process.exitCode = 2;
      return;
    }
  } else {
    console.log('DRY RUN: no network, no key, no money. The answers are synthesised from the manifest');
    console.log('rows themselves on a fixed perturbation schedule, so the identification, parse, offer');
    console.log('and math figures below MEASURE THIS FILE, NOT GEMINI. They prove the scorer runs.');
    console.log('');
  }

  const outcome = await runAll(args, manifest, { live: args.live });
  console.log(printableReport(outcome.report));

  const path = resultPath(args.live, args.out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        harness: 'gemini-scan-eval',
        note: 'Scores runGeminiScan, the one call a scan makes. NOT the IdentifyStage eval in identify/eval/run.ts.',
        measures: args.live ? 'Gemini, on the rows listed' : 'nothing about Gemini: a dry run measures this harness only',
        at: new Date().toISOString(),
        live: args.live,
        families: args.families,
        cost: estimates,
        manifestFitness: {
          rows: manifest.rows.length,
          withPhoto: manifest.runnable.length,
          missingPhotos: manifest.missingPhotos.map((r) => r.file),
          thinNameRows: manifest.thinNames.map((r) => ({ code: r.code, brand: r.brand, name: r.name })),
          refusalNote: manifest.refusalNote,
        },
        report: outcome.report,
        rows: outcome.scored,
      },
      null,
      2,
    )}\n`,
  );
  console.log('');
  console.log(`written: ${path}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
