/**
 * The price spine. Band 1, and the only thing in the queue that runs alone.
 *
 * Given a product identity, return a verdict object carrying the comparison set,
 * the number of points in it, the date of each, and the sentence type for that
 * category. Or refuse. No camera, no mascot, no screens.
 *
 * The order of the checks below is the design. Identity is settled before any
 * price is looked at, because a confident price attached to the wrong product is
 * the worst output this function can produce and it is the one the hand pilot
 * actually produced.
 */

import type {
  Confidence,
  ConfidenceBand,
  PricePoint,
  ProductIdentity,
  Refusal,
  RefusalReason,
  Spread,
  SpineQuery,
  SpineResult,
  Verdict,
} from './contract.ts';
import { isIncoherent, ruleFor } from './categories.ts';
import type { CategoryRule } from './categories.ts';
import { ageDays, cad, max, median, min, percentile } from './money.ts';
import type { PriceSource } from './sources/source.ts';

export interface SpineDeps {
  readonly sources: readonly PriceSource[];
  /** Optional hook so a refusal can quote why a recorded identity was doubted. */
  readonly identityNote?: (identityId: string) => string | undefined;
}

export async function priceIt(query: SpineQuery, deps: SpineDeps): Promise<SpineResult> {
  const asOf = query.asOf ?? new Date().toISOString();
  const usableSources = deps.sources.filter((s) => s.available().ok);

  if (usableSources.length === 0) {
    return refuse('no_source_response', 'No price source is available right now.', null, [], asOf);
  }

  // 1. Identity, before anything else touches a number.
  const identity = await resolveIdentity(query, usableSources);
  if (identity === null) {
    return refuse(
      'no_identity',
      'Could not work out what this is. Scan the barcode, or type the model number.',
      null,
      [],
      asOf,
    );
  }

  const rule = ruleFor(identity.category);

  // 2. Whole categories we decline, before spending a request on them.
  if (rule.unsupported) {
    return refuse(
      'category_unsupported',
      `${rule.label} is not something Shin can price yet. ${rule.unsupported.why}`,
      identity,
      [],
      asOf,
    );
  }

  // 3. A shaky identity is a repair path in front of the user, not a verdict.
  if (identity.confidence < rule.identityFloor) {
    const note = deps.identityNote?.(identity.id);
    return refuse(
      'identity_unsure',
      `Not sure enough this is the right ${rule.label.toLowerCase()} — closest match was "${identity.label}". Pick the right one and Shin will price it.${note ? ` (${note})` : ''}`,
      identity,
      [],
      asOf,
    );
  }

  // 4. Prices. Every available source is asked; ones that do not know it say so
  //    by returning nothing, which is why an unverified adapter is a reported state.
  const raw = await gatherPoints(identity, usableSources, asOf);
  if (raw.length === 0) {
    return refuse(
      'no_source_response',
      `Nothing has a price for "${identity.label}" right now.`,
      identity,
      [],
      asOf,
    );
  }

  if (query.askingCents === undefined) {
    return refuse(
      'no_asking_price',
      'Found comparisons but no price for the thing in front of you. Point at the tag.',
      identity,
      raw,
      asOf,
    );
  }

  // 5. Filter to what this category is allowed to compare.
  const comparison = raw.filter(
    (p) =>
      rule.usableKinds.includes(p.kind) &&
      ageDays(p.observedAt, asOf) <= rule.historyWindowDays &&
      (query.askingSeller === undefined || p.seller !== query.askingSeller),
  );

  const droppedKinds = [...new Set(raw.filter((p) => !rule.usableKinds.includes(p.kind)).map((p) => p.kind))];

  if (comparison.length === 0) {
    return refuse(
      'too_few_points',
      droppedKinds.length > 0
        ? `Only ${droppedKinds.join(' and ')} price${droppedKinds.length === 1 ? '' : 's'} found, which is not a comparison.`
        : 'Nothing recent enough to compare against.',
      identity,
      raw,
      asOf,
    );
  }

  const newestAge = min(comparison.map((p) => ageDays(p.observedAt, asOf)));
  if (newestAge > rule.maxAgeDays) {
    return refuse(
      'points_too_stale',
      `The newest price we have is ${newestAge} days old and ${rule.label.toLowerCase()} moves faster than that.`,
      identity,
      comparison,
      asOf,
    );
  }

  if (comparison.length < rule.minPoints) {
    return refuse(
      'too_few_points',
      `Only ${comparison.length} usable price${comparison.length === 1 ? '' : 's'}; ${rule.label.toLowerCase()} needs ${rule.minPoints} before Shin will call it.`,
      identity,
      comparison,
      asOf,
    );
  }

  const sellers = new Set(comparison.map((p) => p.seller));
  if (sellers.size < rule.minDistinctSellers) {
    return refuse(
      'too_few_points',
      `All ${comparison.length} prices come from ${sellers.size} seller${sellers.size === 1 ? '' : 's'}; ${rule.label.toLowerCase()} needs ${rule.minDistinctSellers}.`,
      identity,
      comparison,
      asOf,
    );
  }

  if (isIncoherent(comparison)) {
    return refuse(
      'comparison_incoherent',
      'The prices found disagree so widely that any single answer would be made up. Probably more than one product in the set.',
      identity,
      comparison,
      asOf,
    );
  }

  // 6. Only now does a category get to speak.
  const { tier, lines, disagreement } = rule.judge({
    askingCents: query.askingCents,
    points: comparison,
    asOf,
  });

  const observed = comparison.map((p) => p.observedAt).sort();
  const verdict: Verdict = {
    kind: 'verdict',
    identity,
    category: identity.category,
    askingCents: query.askingCents,
    askingSource: query.askingSeller ?? 'given',
    tier,
    lines,
    comparisonSet: comparison,
    pointCount: comparison.length,
    oldestObservedAt: observed[0],
    newestObservedAt: observed[observed.length - 1],
    spread: spreadOf(comparison),
    confidence: confidenceOf(comparison, identity, rule, asOf),
    disagreement,
    producedAt: asOf,
  };
  return verdict;
}

async function resolveIdentity(
  query: SpineQuery,
  sources: readonly PriceSource[],
): Promise<ProductIdentity | null> {
  const eligible = query.category
    ? sources.filter((s) => s.categories.includes(query.category!))
    : sources;
  const found = await Promise.all(eligible.map((s) => s.identify(query).catch(() => null)));
  const hits = found.filter((i): i is ProductIdentity => i !== null);
  if (hits.length === 0) return null;
  // Highest confidence wins. Ties keep source order, which is registry order,
  // which is the order a human decided sources should be trusted in.
  return hits.reduce((a, b) => (b.confidence > a.confidence ? b : a));
}

async function gatherPoints(
  identity: ProductIdentity,
  sources: readonly PriceSource[],
  asOf: string,
): Promise<PricePoint[]> {
  const eligible = sources.filter((s) => s.categories.includes(identity.category));
  const results = await Promise.all(
    eligible.map((s) => s.prices(identity, asOf).catch(() => [] as readonly PricePoint[])),
  );
  return results.flat();
}

function spreadOf(points: readonly PricePoint[]): Spread {
  const vals = points.map((p) => p.amountCents);
  return {
    lowCents: min(vals),
    highCents: max(vals),
    medianCents: median(vals),
    p25Cents: percentile(vals, 25),
  };
}

/**
 * Confidence, stated as a formula rather than a model. This is judgment with the
 * reasoning shown; it is not calibrated and must not be described as if it were.
 * Calibrating it is a band 4 item and it is gated on having verdicts to calibrate
 * against, which is what the scoreboard is for.
 */
function confidenceOf(
  points: readonly PricePoint[],
  identity: ProductIdentity,
  rule: CategoryRule,
  asOf: string,
): Confidence {
  const ages = points.map((p) => ageDays(p.observedAt, asOf));
  const newestAge = min(ages);
  const oldestAge = max(ages);
  const sellers = new Set(points.map((p) => p.seller)).size;

  let band: ConfidenceBand;
  let because: string;

  if (points.length === rule.minPoints || sellers === rule.minDistinctSellers) {
    band = 'low';
    because = `Only just enough to answer: ${points.length} price${points.length === 1 ? '' : 's'} from ${sellers} seller${sellers === 1 ? '' : 's'}.`;
  } else if (newestAge > rule.maxAgeDays / 2) {
    band = 'medium';
    because = `Newest price is ${newestAge} days old.`;
  } else if (points.length >= rule.minPoints * 2 && identity.confidence >= 0.95) {
    band = 'high';
    because = `${points.length} fresh prices across ${sellers} sellers, and the product is a certain match.`;
  } else {
    band = 'medium';
    because = `${points.length} prices across ${sellers} sellers.`;
  }

  return {
    band,
    because,
    pointCount: points.length,
    distinctSellers: sellers,
    oldestPointAgeDays: oldestAge,
    identityConfidence: identity.confidence,
  };
}

function refuse(
  reason: RefusalReason,
  detail: string,
  identity: ProductIdentity | null,
  evidence: readonly PricePoint[],
  producedAt: string,
): Refusal {
  return { kind: 'refusal', reason, detail, identity, evidence, producedAt };
}

/** One-line rendering, used by the CLI and by the harness report. */
export function renderResult(result: SpineResult): string {
  if (result.kind === 'refusal') {
    return `REFUSED (${result.reason}) — ${result.detail}`;
  }
  const face = { good: 'GOOD', fair: 'FAIR', walk_away: 'WALK AWAY' }[result.tier];
  const head = `${face} — ${result.identity.label} at ${cad(result.askingCents)}`;
  const body = result.lines.map((l) => `  ${l}`).join('\n');
  const conf = `  confidence: ${result.confidence.band} — ${result.confidence.because}`;
  const dis = result.disagreement ? `\n  disagreement: ${result.disagreement.detail}` : '';
  return `${head}\n${body}\n${conf}${dis}`;
}
