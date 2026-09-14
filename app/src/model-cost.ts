/**
 * What one identification cost, estimated. Plan item 9e's last field.
 *
 * AN ESTIMATE, AND THE COLUMN IS NAMED ONE. Nothing here is a bill. The only
 * authority on what was spent is the model console, and plan item 13 is the
 * card being put on it. This number exists so that a week of beta scans can be
 * divided into "the photo path cost this much" without waiting for an invoice,
 * and so that a run that suddenly costs four times as much is visible in the
 * scan table on the day it happens.
 *
 * WHERE THE NUMBERS COME FROM, because a cost figure with no source is exactly
 * the kind of fact that gets quoted back as measured (this repo's own rule: no
 * unsourced statement presented as fact).
 *
 *   pro (claude-sonnet-5):  $0.0068 per identification, so 0.68 cents.
 *     Sourced in `identify/src/model.ts`, Decision 21's costing, which priced
 *     the crop this app actually sends (1568 px long edge, 2,459 image tokens)
 *     against Opus's $0.0169 and chose Sonnet on it. That number is in this
 *     repo and was used to make a decision, which is the strongest provenance
 *     any figure here has.
 *
 *   basic (claude-haiku-4-5): 0.23 cents.
 *     DERIVED, not measured, and this is the derivation in full: Haiku 4.5's
 *     published list price is one third of Sonnet's per token, in both
 *     directions (input and output), recorded 2026-09-11. The crop, the prompt
 *     and the schema are identical between the tiers -- the only difference
 *     Decision 21 names is the model id -- so the same token count at one third
 *     the rate is 0.68 / 3 = 0.227, rounded to 0.23.
 *
 * WHAT WOULD MAKE IT WRONG, so that the estimate carries its own doubt rather
 * than a footnote: a price change at the provider, a prompt that grows, or the
 * two-pass path firing more often than it does. The first two are why both
 * numbers can be overridden from the environment without a deploy; the third
 * is why `passes` multiplies rather than being assumed to be one.
 *
 * OVERRIDE FROM THE ENVIRONMENT. `SHIN_COST_BASIC_CENTS` and
 * `SHIN_COST_PRO_CENTS`. The Mac sets them the week the console shows real
 * numbers, and from then on the column is fitted to a bill instead of to a
 * published rate card. A value that will not parse is ignored rather than
 * treated as zero, because zero is a claim that a call was free.
 */

export type CostTier = 'basic' | 'pro';

/** Cents per model call, per tier. See the header for the provenance of each. */
const LIST_CENTS: Readonly<Record<CostTier, number>> = {
  basic: 0.23,
  pro: 0.68,
};

function override(name: string, env: NodeJS.ProcessEnv): number | null {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The estimated cost in cents of an identification at this tier, over this
 * many model passes.
 *
 * `passes` is 1 or 2: the second pass is the hard fallback after a cheaper
 * read came back unsure, and it is a whole second call at the same price. The
 * photo route already knows which it was, so this is multiplication rather
 * than an average that would be wrong in both directions.
 *
 * Returns null for a call that never reached the model. A scan refused before
 * the model (an unreadable crop caught locally, the daily cap, a rate limit)
 * cost nothing to run, and writing 0 there would be a measurement where the
 * truth is that there was nothing to measure.
 */
export function estimatedCostCents(
  tier: CostTier,
  passes: number,
  reachedModel: boolean,
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  if (!reachedModel) return null;
  const per = override(tier === 'pro' ? 'SHIN_COST_PRO_CENTS' : 'SHIN_COST_BASIC_CENTS', env) ?? LIST_CENTS[tier];
  const calls = Number.isFinite(passes) && passes >= 1 ? Math.floor(passes) : 1;
  // Rounded to four decimal places of a cent, which is far finer than the
  // estimate deserves and coarse enough to keep floating point noise out of a
  // column somebody will SUM.
  return Math.round(per * calls * 10_000) / 10_000;
}

/* ===================== WHAT THE CALL ACTUALLY REPORTED ===================== */

/*
 * EVERYTHING ABOVE MULTIPLIES A LIST PRICE BY A COUNT OF CALLS. Nothing in it
 * has ever looked at a token, which was fine while the only consumer was a
 * fixed crop with a fixed prompt: the same picture at the same size every
 * time, so calls were a decent proxy for tokens.
 *
 * That stops being true with Gemini. Thinking is a setting, the prompt grows,
 * the search tool fires or does not, and two calls to the same model on the
 * same day can differ by an order of magnitude. Google hands the real numbers
 * back on every response, so the estimate can stop being an estimate for the
 * part that is measured. What is below prices what the call said it used.
 *
 * THINKING TOKENS BILL AT THE OUTPUT RATE. `thoughtsTokenCount` is reported
 * separately from `candidatesTokenCount` and it is easy to read the separation
 * as a separate, cheaper line. It is not: they are both output. A cost figure
 * that drops thinking is wrong by however much thinking was on, which on a
 * reasoning model is most of the bill and looks entirely plausible.
 *
 * A MISSING COUNT IS NULL AND NEVER ZERO, the same rule `estimatedCostCents`
 * keeps for a call that never reached the model. A response that carried no
 * usage block is a call nobody measured; writing 0 would be a claim it was
 * free.
 */

/** USD per million tokens, in and out. */
export interface ModelRate {
  readonly input: number;
  readonly output: number;
}

/**
 * PUBLISHED LIST PRICES, TYPED IN AND NEVER BILLED, restated here because this
 * package imports nothing from `identify/` (see `scans.ts`'s note on the same
 * trade) and `identify/src/providers/gemini.ts` exports the same two rows for
 * a table in `provider.ts` that does not hold them yet.
 *
 * WORTH A DIARY ENTRY, and it is `gemini.ts`'s warning repeated because this
 * is now a second copy of it: both rates are documented as DOUBLING on
 * 2027-01-01. A figure quoted from this table after that date is wrong by
 * exactly 2x and will look completely plausible.
 */
export const MODEL_RATES_USD_PER_MTOK: Readonly<Record<string, ModelRate>> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
};

/** The usage block, in Google's own field names so nothing is renamed on the way in. */
export interface TokenUsage {
  readonly promptTokenCount?: number | null;
  readonly candidatesTokenCount?: number | null;
  /** Reasoning tokens. Billed at the OUTPUT rate, not a rate of their own. */
  readonly thoughtsTokenCount?: number | null;
}

/** How many grounded searches a month are free before anything is charged. */
export const SEARCH_FREE_PER_MONTH = 5_000;

/** USD per 1,000 grounded search queries once the free allowance is gone. */
export const SEARCH_USD_PER_1000 = 14;

function count(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Cents, to four decimal places, the same resolution the estimate above uses. */
function cents(usd: number): number {
  return Math.round(usd * 100 * 10_000) / 10_000;
}

/**
 * What the tokens on one response cost, in cents, or null when the response
 * carried no usable usage block or the model is not in the table.
 *
 * An unknown model is null rather than zero for the reason `provider.ts`
 * already states about its own price table: every consumer prints a null as
 * unknown, and that is the safe direction.
 */
export function tokenCostCents(
  model: string,
  usage: TokenUsage | null | undefined,
  rates: Readonly<Record<string, ModelRate>> = MODEL_RATES_USD_PER_MTOK,
): number | null {
  const rate = rates[model];
  if (!rate || !usage) return null;
  const input = count(usage.promptTokenCount);
  const candidates = count(usage.candidatesTokenCount);
  const thoughts = count(usage.thoughtsTokenCount);
  if (input === null && candidates === null && thoughts === null) return null;
  const output = (candidates ?? 0) + (thoughts ?? 0);
  return cents(((input ?? 0) * rate.input + output * rate.output) / 1_000_000);
}

/**
 * What `queries` grounded searches cost, in cents, given how many this account
 * has already made this calendar month.
 *
 * THE FREE ALLOWANCE IS A MONTHLY BUCKET, NOT A DISCOUNT PER CALL, so the
 * answer depends on where in the month the call lands: the 5,000th search is
 * free and the 5,001st is not. `alreadyThisMonth` is the caller's count
 * because this file has no meter in it and should not grow one; a caller that
 * does not know passes 0 and gets the optimistic figure, which is why the
 * argument is named for what it is rather than defaulted silently.
 */
export function searchCostCents(queries: number, alreadyThisMonth = 0): number {
  const asked = Number.isFinite(queries) && queries > 0 ? Math.floor(queries) : 0;
  const used = Number.isFinite(alreadyThisMonth) && alreadyThisMonth > 0 ? Math.floor(alreadyThisMonth) : 0;
  const stillFree = Math.max(0, SEARCH_FREE_PER_MONTH - used);
  const billable = Math.max(0, asked - stillFree);
  return cents((billable * SEARCH_USD_PER_1000) / 1_000);
}

/**
 * One call's whole cost: its tokens plus whatever searching it did.
 *
 * Null only when there was nothing measured at all. A call that reported
 * tokens and no searches is its token cost; a call that reported searches and
 * no usable token block is its search cost, because a partial measurement is
 * still a measurement and is closer to the truth than an unknown.
 */
export function realCostCents(
  model: string,
  usage: TokenUsage | null | undefined,
  searchQueries = 0,
  alreadyThisMonth = 0,
  rates: Readonly<Record<string, ModelRate>> = MODEL_RATES_USD_PER_MTOK,
): number | null {
  const tokens = tokenCostCents(model, usage, rates);
  const asked = Number.isFinite(searchQueries) && searchQueries > 0 ? Math.floor(searchQueries) : 0;
  if (tokens === null && asked === 0) return null;
  return Math.round(((tokens ?? 0) + searchCostCents(asked, alreadyThisMonth)) * 10_000) / 10_000;
}
