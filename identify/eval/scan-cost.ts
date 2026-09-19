/**
 * THE BILL, PRINTED BEFORE ANYTHING IS SPENT.
 *
 * A keyed eval run is the only thing in this repo that spends real money
 * without a person watching each call. `scan-run.ts` prints this estimate and
 * refuses to start a live run unless the operator passed `--yes-spend` after
 * seeing it. Nobody should learn what a run cost from the invoice.
 *
 * WHERE THE NUMBERS COME FROM (`docs/jamin-gemini-rules.md`, the model note
 * of 2026-09-18, reading ai.google.dev/gemini-api/docs/pricing). The two
 * families are billed on DIFFERENT UNITS and conflating them is the mistake
 * this file exists to prevent:
 *
 *   Gemini 2.5  grounding billed per grounded PROMPT.
 *               1,500 requests per DAY free, then $35 per 1,000 prompts.
 *               One scan = one prompt = $0.035, however many searches it ran.
 *
 *   Gemini 3.x  grounding billed per search QUERY.
 *               5,000 search requests per MONTH free, then $14 per 1,000.
 *               One observed scan ran FOUR queries = $0.056.
 *
 * That is the whole reason 2.5 is the default: 2.5's free allowance is about
 * 45,000 scans a month against about 1,250 on 3.x.
 *
 * TOKENS. `docs/plan-gemini.md:78` records 3.8 Flash at $0.75 in / $3.75 out
 * per 1M tokens (until 2026-12-31, then double) and 3.5 Flash-Lite at $0.30 /
 * $2.50. THE REPO RECORDS NO TOKEN RATE FOR `gemini-2.5-flash`. It is left
 * null here and printed as UNKNOWN rather than guessed, because a made-up
 * number in a cost estimate is worse than an admitted gap: the operator can
 * look up a gap.
 */

import type { ModelFamily } from '../src/providers/gemini-scan.ts';
import { DEFAULT_GEMINI_25, DEFAULT_GEMINI_3 } from '../src/providers/gemini-scan.ts';

export interface TokenRate {
  /** USD per 1M input tokens, null when the repo records none. */
  readonly inPerM: number | null;
  readonly outPerM: number | null;
  readonly source: string;
}

/** USD per 1,000 billable grounding units, and what a unit is. */
export interface GroundingRate {
  readonly unit: 'prompt' | 'query';
  readonly usdPerThousand: number;
  /** Free allowance, and the window it resets on. */
  readonly freeAllowance: number;
  readonly freeWindow: 'day' | 'month';
  readonly source: string;
}

export const GROUNDING: Readonly<Record<ModelFamily, GroundingRate>> = {
  '2.5': {
    unit: 'prompt',
    usdPerThousand: 35,
    freeAllowance: 1500,
    freeWindow: 'day',
    source: 'docs/jamin-gemini-rules.md, pricing read 2026-09-18: "1,500 RPD (free...), then $35 / 1,000 grounded prompts"',
  },
  '3.x': {
    unit: 'query',
    usdPerThousand: 14,
    freeAllowance: 5000,
    freeWindow: 'month',
    source: 'docs/jamin-gemini-rules.md, pricing read 2026-09-18: "5,000 free search requests per month... then $14 per 1,000 requests"',
  },
};

export const TOKEN_RATES: Readonly<Record<string, TokenRate>> = {
  'gemini-3.8-flash': { inPerM: 0.75, outPerM: 3.75, source: 'docs/plan-gemini.md:78 (doubles 2027-01-01)' },
  'gemini-3.5-flash-lite': { inPerM: 0.3, outPerM: 2.5, source: 'docs/plan-gemini.md:78' },
  'gemini-2.5-flash': { inPerM: null, outPerM: null, source: 'NOT RECORDED in this repo. Look it up before quoting a total.' },
};

export function tokenRate(model: string): TokenRate {
  return TOKEN_RATES[model] ?? { inPerM: null, outPerM: null, source: `NOT RECORDED for ${model}.` };
}

/**
 * What a scan is assumed to consume when no run has measured it yet.
 * Sources: `docs/plan-always-a-price.md:565` (2,459 image tokens for a 1568 px
 * crop) plus the engine prompt; the output is one JSON answer.
 */
export const ASSUMED = {
  searchQueriesPerScan: 4,
  inputTokensPerScan: 4500,
  outputTokensPerScan: 800,
  source: 'one observed scan ran 4 queries (jamin-gemini-rules.md); 2,459 image tokens (plan-always-a-price.md:565) plus the engine prompt',
} as const;

export interface CostInput {
  readonly family: ModelFamily;
  readonly model: string;
  readonly rows: number;
  /** Measured, when a previous run measured it; otherwise the assumption above. */
  readonly searchQueriesPerScan?: number;
  readonly inputTokensPerScan?: number;
  readonly outputTokensPerScan?: number;
  /** How much of the free allowance is still unspent. Default: all of it. */
  readonly freeRemaining?: number;
}

export interface CostEstimate {
  readonly family: ModelFamily;
  readonly model: string;
  readonly rows: number;
  /** Billable grounding units this run creates (prompts on 2.5, queries on 3.x). */
  readonly groundingUnits: number;
  readonly groundingUnitName: 'prompt' | 'query';
  /** Units that fall inside the free allowance, and so cost nothing. */
  readonly freeUnits: number;
  readonly groundingUsd: number;
  /** Grounding at list price with no allowance at all: the worst case, always shown. */
  readonly groundingUsdAtListPrice: number;
  /** Null when the model's token rate is not recorded. */
  readonly tokensUsd: number | null;
  /** Null whenever any component is null. Never a partial total dressed as a whole one. */
  readonly totalUsd: number | null;
  readonly totalUsdAtListPrice: number | null;
  readonly tokenRateSource: string;
  readonly groundingSource: string;
  readonly assumed: boolean;
}

export function estimateCost(input: CostInput): CostEstimate {
  const g = GROUNDING[input.family];
  const queries = input.searchQueriesPerScan ?? ASSUMED.searchQueriesPerScan;
  const inTok = input.inputTokensPerScan ?? ASSUMED.inputTokensPerScan;
  const outTok = input.outputTokensPerScan ?? ASSUMED.outputTokensPerScan;
  const units = g.unit === 'prompt' ? input.rows : input.rows * queries;
  const freeRemaining = input.freeRemaining ?? g.freeAllowance;
  const freeUnits = Math.max(0, Math.min(units, freeRemaining));
  const billable = units - freeUnits;

  const rate = tokenRate(input.model);
  const tokensUsd =
    rate.inPerM === null || rate.outPerM === null
      ? null
      : (input.rows * inTok * rate.inPerM) / 1_000_000 + (input.rows * outTok * rate.outPerM) / 1_000_000;

  const groundingUsd = (billable * g.usdPerThousand) / 1000;
  const groundingList = (units * g.usdPerThousand) / 1000;

  return {
    family: input.family,
    model: input.model,
    rows: input.rows,
    groundingUnits: units,
    groundingUnitName: g.unit,
    freeUnits,
    groundingUsd,
    groundingUsdAtListPrice: groundingList,
    tokensUsd,
    totalUsd: tokensUsd === null ? null : groundingUsd + tokensUsd,
    totalUsdAtListPrice: tokensUsd === null ? null : groundingList + tokensUsd,
    tokenRateSource: rate.source,
    groundingSource: g.source,
    assumed: input.searchQueriesPerScan === undefined,
  };
}

const usd = (n: number | null): string => (n === null ? 'UNKNOWN' : `$${n.toFixed(4)}`);

/** The block `scan-run.ts` prints before a live run, and writes into every result file. */
export function costReport(estimates: readonly CostEstimate[]): string {
  const lines: string[] = [];
  lines.push('WHAT A KEYED RUN WOULD COST');
  lines.push('');
  for (const e of estimates) {
    lines.push(`  ${e.family}  (${e.model}), ${e.rows} rows`);
    lines.push(`    grounding      : ${e.groundingUnits} ${e.groundingUnitName === 'query' ? (e.groundingUnits === 1 ? 'query' : 'queries') : e.groundingUnits === 1 ? 'prompt' : 'prompts'} billed at $${GROUNDING[e.family].usdPerThousand}/1,000`);
    lines.push(`    free allowance : ${e.freeUnits} of them free (${GROUNDING[e.family].freeAllowance} per ${GROUNDING[e.family].freeWindow}, assumed unspent)`);
    lines.push(`    grounding cost : ${usd(e.groundingUsd)}   (at list price with no allowance: ${usd(e.groundingUsdAtListPrice)})`);
    lines.push(`    tokens         : ${usd(e.tokensUsd)}${e.tokensUsd === null ? `  <- ${e.tokenRateSource}` : ''}`);
    lines.push(`    TOTAL          : ${usd(e.totalUsd)}   (at list price: ${usd(e.totalUsdAtListPrice)})`);
    if (e.assumed) lines.push(`    assumes ${ASSUMED.searchQueriesPerScan} searches, ${ASSUMED.inputTokensPerScan} in / ${ASSUMED.outputTokensPerScan} out tokens per scan`);
    lines.push('');
  }
  const known = estimates.filter((e) => e.totalUsd !== null);
  if (known.length === estimates.length && known.length > 0) {
    lines.push(`  BOTH FAMILIES TOGETHER: ${usd(known.reduce((s, e) => s + (e.totalUsd ?? 0), 0))}`);
  } else {
    lines.push('  A COMBINED TOTAL CANNOT BE GIVEN: at least one token rate is not recorded (see above).');
  }
  lines.push('');
  lines.push('  The free allowances above are assumed FULLY UNSPENT. If the beta has been running,');
  lines.push('  they are not, and the list-price column is the number to budget against.');
  return lines.join('\n');
}

/** The default pair: 200 rows on each family, which is the run the manifest describes. */
export function defaultEstimates(rows = 200, env: NodeJS.ProcessEnv = process.env): CostEstimate[] {
  return [
    estimateCost({ family: '2.5', model: env.SHIN_GEMINI_MODEL_25?.trim() || DEFAULT_GEMINI_25, rows }),
    estimateCost({ family: '3.x', model: env.SHIN_GEMINI_MODEL_3?.trim() || DEFAULT_GEMINI_3, rows }),
  ];
}
