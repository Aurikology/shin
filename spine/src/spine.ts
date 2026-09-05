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
import { ageDays, cad, isFutureDated, isUsableAmount, max, median, min, percentile } from './money.ts';
import type { PriceSource } from './sources/source.ts';
import { normalizeSeller } from './sources/source.ts';

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
      `Not sure enough this is the right ${rule.label.toLowerCase()}. The closest match was "${identity.label}". Pick the right one and Shin will price it.${note ? ` (${note})` : ''}`,
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

  // An unparsed price is not a missing one, but it must never reach a tier
  // ladder: NaN fails every comparison, so it falls through to whatever the last
  // `else` happens to be and comes out looking like a considered answer.
  if (!isUsableAmount(query.askingCents)) {
    return refuse(
      'no_asking_price',
      query.askingCents === undefined
        ? 'Found comparisons but no price for the thing in front of you. Point at the tag.'
        : 'That price did not read as a number. Type it again with a dot for the decimal.',
      identity,
      raw,
      asOf,
    );
  }
  const askingCents = query.askingCents;

  // 5. Filter to what this category is allowed to compare.
  const askingSellerKey =
    query.askingSeller === undefined ? undefined : normalizeSeller(query.askingSeller);
  const comparison = raw.filter(
    (p) =>
      rule.usableKinds.includes(p.kind) &&
      !isFutureDated(p.observedAt, asOf) &&
      ageDays(p.observedAt, asOf) <= rule.historyWindowDays &&
      (askingSellerKey === undefined || normalizeSeller(p.seller) !== askingSellerKey),
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

  // Every point that sets the tier should itself be current. Checking only the
  // newest let one fresh row carry a set of month-old prices in a category whose
  // own rule is three days, and the dead cheapest price in it became the bar the
  // shopper was sent to chase. Furniture is exempt because there the history IS
  // the comparison.
  const tiering = rule.historyBased
    ? comparison
    : comparison.filter((p) => ageDays(p.observedAt, asOf) <= rule.maxAgeDays);

  /*
   * CHANGED 2026-09-05, on his instruction, and this is the largest change in
   * this file.
   *
   * Four checks used to sit here and each of them returned a refusal while
   * holding real prices in its hand: the newest price being older than the
   * category window, too few current prices, too few prices at all, too few
   * distinct sellers, and a comparison set that disagreed with itself. A
   * shopper standing in an aisle got "Shin needs 3 before it will call it"
   * instead of the two prices we had.
   *
   * Every one of them is now a named shortfall on the answer rather than a
   * reason to withhold it. The confidence band already existed and already
   * carried a plain sentence saying what limits it, so the doubt has somewhere
   * honest to live. The category minimums are kept and still mean something:
   * they are what separates a low band from a high one.
   *
   * What still refuses, and why: no prices at all, and no price on the thing in
   * front of the shopper. Neither of those is a threshold. There is nothing to
   * compare, so there is no answer to give at any confidence.
   */
  const shortfalls: string[] = [];

  let basis = tiering;
  if (basis.length === 0) {
    // Everything we have is outside the category's window. Old prices still
    // locate a product far better than silence does, so they answer, labelled.
    basis = comparison;
    shortfalls.push(
      `the newest price we have is ${newestAge} days old, and ${rule.label.toLowerCase()} moves faster than that`,
    );
  } else if (tiering.length < comparison.length) {
    const dropped = comparison.length - tiering.length;
    shortfalls.push(`${dropped} of ${comparison.length} prices are too old to count`);
  }

  if (basis.length < rule.minPoints) {
    shortfalls.push(
      `${basis.length} price${basis.length === 1 ? '' : 's'} where ${rule.label.toLowerCase()} usually needs ${rule.minPoints}`,
    );
  }

  // Counted after normalising, so one merchant arriving under three feed
  // spellings cannot look like three sellers.
  const sellers = new Set(basis.map((p) => normalizeSeller(p.seller)));
  if (sellers.size < rule.minDistinctSellers) {
    shortfalls.push(
      `${sellers.size} seller${sellers.size === 1 ? '' : 's'} where ${rule.label.toLowerCase()} usually needs ${rule.minDistinctSellers}`,
    );
  }

  if (isIncoherent(basis, rule.mixedKindsExpected)) {
    shortfalls.push('the prices found disagree widely enough that this may be more than one product');
  }

  // 6. Only now does a category get to speak.
  const { tier, lines, disagreement } = rule.judge({
    askingCents,
    points: basis,
    asOf,
    minPoints: rule.minPoints,
  });

  const observed = basis.map((p) => p.observedAt).sort();
  const verdict: Verdict = {
    kind: 'verdict',
    identity,
    category: identity.category,
    askingCents,
    askingSource: query.askingSeller ?? 'given',
    tier,
    lines,
    comparisonSet: basis,
    pointCount: basis.length,
    oldestObservedAt: observed[0],
    newestObservedAt: observed[observed.length - 1],
    spread: spreadOf(basis),
    confidence: confidenceOf(basis, identity, rule, asOf, shortfalls),
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
  /**
   * The category minimums this answer did not reach, in plain words. Empty for
   * an answer that cleared every one of them. These used to be refusals; they
   * are the reason a band is low, and the sentence the user is shown.
   */
  shortfalls: readonly string[] = [],
): Confidence {
  const ages = points.map((p) => ageDays(p.observedAt, asOf));
  const newestAge = min(ages);
  const oldestAge = max(ages);
  // Normalised, matching how the shortfall above counts them. This used to be
  // a raw string set, so "Best Buy", "BestBuy.ca" and "best buy" reported as
  // three sellers. It was invisible while a normalised gate stood in front of
  // it and rejected that set before confidence was ever computed; with the gate
  // gone this number is the one the shopper reads.
  const sellers = new Set(points.map((p) => normalizeSeller(p.seller))).size;

  let band: ConfidenceBand;
  let because: string;

  if (shortfalls.length > 0) {
    band = 'low';
    // Named, not summarised. "Low confidence" on its own is a shrug; "1 price
    // where groceries usually needs 2" is something a shopper can weigh.
    const listed = shortfalls.join('; ');
    because = `${listed.charAt(0).toUpperCase()}${listed.slice(1)}.`;
  } else if (points.length === rule.minPoints || sellers === rule.minDistinctSellers) {
    band = 'low';
    because = `Only just enough to answer: ${points.length} price${points.length === 1 ? '' : 's'} from ${sellers} seller${sellers === 1 ? '' : 's'}.`;
  } else if (newestAge > rule.maxAgeDays / 2) {
    band = 'medium';
    because = `Newest price is ${newestAge} days old.`;
  } else if (
    points.length >= rule.minPoints * 2 &&
    identity.confidence >= 0.95 &&
    (rule.historyBased || oldestAge <= rule.maxAgeDays)
  ) {
    band = 'high';
    // "fresh" is only said where every point was checked against the category's
    // own window. It used to be said unconditionally, over month-old prices, in
    // the same sentence that called the product a certain match.
    because = rule.historyBased
      ? `${points.length} prices spanning ${oldestAge} days of this seller's own history, and the product is a certain match.`
      : `${points.length} prices across ${sellers} sellers, none older than ${oldestAge} day${oldestAge === 1 ? '' : 's'}, and the product is a certain match.`;
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
    return `REFUSED (${result.reason}): ${result.detail}`;
  }
  const face = { good: 'GOOD', fair: 'FAIR', walk_away: 'WALK AWAY' }[result.tier];
  const head = `${face}: ${result.identity.label} at ${cad(result.askingCents)}`;
  const body = result.lines.map((l) => `  ${l}`).join('\n');
  const conf = `  confidence: ${result.confidence.band} (${result.confidence.because})`;
  const dis = result.disagreement ? `\n  disagreement: ${result.disagreement.detail}` : '';
  return `${head}\n${body}\n${conf}${dis}`;
}
