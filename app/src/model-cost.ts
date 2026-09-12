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
