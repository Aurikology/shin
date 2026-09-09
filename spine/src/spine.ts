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
import { isIncoherent, ruleFor, spreadDisagreement } from './categories.ts';
import type { CategoryRule } from './categories.ts';
import { judge as judgeThinEvidence } from '../../price/src/verdict.ts';
import type { Observation as ThinObservation } from '../../price/src/verdict.ts';
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
  //
  // D-013, 2026-09-05. Two things used to be concatenated into this one
  // sentence and neither belonged there.
  //
  // The first was `identityNote`, which is research prose out of
  // `data/observations.json` and ran to about 450 characters about eBay sold
  // listings in US dollars and new Canadian retail. That is evidence. It now
  // travels on the refusal as `evidenceNote`, a field of its own, so a caller
  // can put it behind the disclosure it already has and the headline stays one
  // sentence.
  //
  // The second was the category label, which produced "Not sure enough this is
  // the right used goods": an internal category slug dropped into a sentence a
  // shopper reads. Put to the founder, and the answer was to drop the category
  // from the sentence rather than to find a nicer word for it. The category is
  // still on the refusal, on `identity.category`, for anything that needs it.
  if (identity.confidence < rule.identityFloor) {
    return refuse(
      'identity_unsure',
      `Not sure enough this is the right one. The closest match was "${identity.label}". Pick the right one and Shin will price it.`,
      identity,
      [],
      asOf,
      deps.identityNote?.(identity.id),
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

  /*
   * 5. Filter to what this category is allowed to compare.
   *
   * D-012, 2026-09-05. This filter tests four conditions and the empty result
   * used to carry only two messages, dropped kinds or "nothing recent enough".
   * Self-exclusion had no message of its own and fell through to the age one,
   * so the engine named a cause that had not fired. That is the root under
   * D-011, where `too_few_points` came back holding thirteen prices.
   *
   * The four conditions are applied one at a time now, in the order they are
   * written, and the cause is the stage that emptied the set. Written as a
   * cascade rather than as four independent counts because more than one
   * condition can be true of the same price and only one sentence gets shown:
   * the first stage that leaves nothing is the one a shopper can act on, and
   * asking "what was left after the kinds we can compare" is the same question
   * in each row down.
   *
   * This adds no refusal. The set that refused before refuses now, with the
   * cause named. Priority 1 stands: nothing here makes a refusal more likely.
   */
  const askingSellerKey =
    query.askingSeller === undefined ? undefined : normalizeSeller(query.askingSeller);

  const usableKind = raw.filter((p) => rule.usableKinds.includes(p.kind));
  const notFutureDated = usableKind.filter((p) => !isFutureDated(p.observedAt, asOf));
  const withinWindow = notFutureDated.filter(
    (p) => ageDays(p.observedAt, asOf) <= rule.historyWindowDays,
  );
  const comparison = withinWindow.filter(
    (p) => askingSellerKey === undefined || normalizeSeller(p.seller) !== askingSellerKey,
  );

  const droppedKinds = [...new Set(raw.filter((p) => !rule.usableKinds.includes(p.kind)).map((p) => p.kind))];

  /*
   * WIRED 2026-09-08. The cascade above used to end in four refusals and this
   * is where three of them were.
   *
   * His instruction of 2026-09-05: nothing refuses while there is a seller's
   * number to work with, and the doubt is carried by the confidence. That was
   * done in two places at once and only one of them ever shipped. The count
   * thresholds further down this file became named shortfalls, and
   * `price/src/verdict.ts` was rewritten to answer off a single seller and was
   * then imported by nothing but its own test. Nobody checked the filter stage
   * that sits IN FRONT of the thresholds, which refuses while holding prices:
   * Tide with thirteen Walmart prices, refused because Walmart is also the shop
   * being stood in, and the XM5 with a manufacturer list price and no retailer
   * behind it. Both are a seller's number and both got a blank screen. Two of
   * the pilot corpus's five refusals are these.
   *
   * So the stage that empties the set now names itself as a shortfall on the
   * answer instead of as a reason to withhold it, exactly as the count
   * thresholds already do, and `judge()` produces the answer.
   *
   * WHY `judge()` IS NOT PUT IN FRONT OF `CategoryRule.judge`. The four served
   * categories ask four different questions, and grocery's two lines, used
   * goods' 25th percentile and furniture's own-history sentence are the part of
   * this that is worth anything. Routing every set through one comparator would
   * remove the refusal and flatten the product in the same move. So the
   * category still judges every set it can compare, and `judge()` answers only
   * where the category's own filters left it nothing, which is precisely where
   * the alternative is a blank screen.
   *
   * WHAT STILL REFUSES HERE, and neither is a threshold. A date later than the
   * moment being priced is a broken record rather than thin evidence: the age
   * line under a verdict would have to describe a day that has not happened, so
   * it is dropped and the drop is what shows. And a set that judges to no tier
   * at all falls back to the refusal it would have had, which cannot happen
   * with a shelf price and a price point in hand and is guarded rather than
   * assumed.
   */
  if (comparison.length === 0) {
    /*
     * Dated sanely, taken off `raw` and NOT off `notFutureDated`. The cascade
     * above narrows kind first and date second, so `notFutureDated` is empty
     * whenever the kind filter emptied the set, and reading it here called a
     * manufacturer list price future-dated. Caught 2026-09-08 by running the
     * pilot corpus, where it turned the XM5's refusal into a differently wrong
     * refusal; no test covered it because until today nothing downstream of the
     * cascade cared which stage had emptied which set.
     */
    const datedSanely = raw.filter((p) => !isFutureDated(p.observedAt, asOf));
    if (datedSanely.length === 0) {
      return refuse(
        'points_future_dated',
        'Every price found is dated later than today, so there is nothing to compare against yet.',
        identity,
        raw,
        asOf,
      );
    }

    // The order matches the filter order above. Every sentence points at the
    // prices, the sellers or the dates, never at the person holding the phone.
    const shortfall =
      usableKind.length === 0
        ? `the only prices anyone publishes for this are ${droppedKinds.join(' and ')}, which is not a comparison`
        : withinWindow.length === 0
          ? `the newest price we have is ${min(datedSanely.map((p) => ageDays(p.observedAt, asOf)))} days old, past what ${rule.label.toLowerCase()} tolerates`
          : 'every price we have is this same store, so this is against its own history rather than against anybody else';

    const thin = thinAnswer(
      identity,
      rule,
      datedSanely,
      askingCents,
      query.askingSeller,
      shortfall,
      asOf,
    );
    if (thin !== null) return thin;

    // Unreachable with a shelf price and at least one point, kept because the
    // alternative to a guard here is a crash in an aisle.
    return refuse(
      'no_source_response',
      `Nothing has a price for "${identity.label}" right now.`,
      identity,
      raw,
      asOf,
    );
  }

  /*
   * 6. Hold a lone claim that disagrees with everything else.
   *
   * D-022, and it is the defect the log calls the one that gates opening this
   * app to anybody else. The correction path works: one typed price reaches the
   * next verdict for that product. None of the rules that stop that being
   * abused existed. The first person to submit a fake price to move a verdict
   * will do it deliberately.
   *
   * What this does NOT do, so nobody reads more into it than is there. It does
   * not detect lies. A plausible fake, one that sits inside the range everybody
   * else reports, passes through untouched and always will, because it is
   * indistinguishable from a real reading by anything this file can see. What
   * it stops is the cheap version: one unwitnessed number far outside the
   * distribution, which is the shape an attack takes when the attacker wants to
   * move the answer rather than nudge it.
   *
   * Three properties this had to have:
   *
   * - **It can never empty the comparison set.** Priority 1 is always answer,
   *   and a hold that turns a verdict into a refusal would trade a real defect
   *   for a worse one. It runs after the refusal cascade above, requires
   *   survivors, and holds nothing when holding would leave nothing.
   * - **The baseline is evidence a member of the public cannot write.** Judging
   *   a lone claim against a set that includes other lone claims is how two
   *   colluding devices would establish their own normal. Points with no
   *   `witnesses` field are the sources that vouch for themselves, which is
   *   every crawled feed.
   * - **It is asymmetric, and low is the tighter side.** D-022 names the
   *   direction: a fake low price is the dangerous one, because it is the one
   *   that sends somebody somewhere on a promise nobody can keep.
   *
   * The two numbers are design defaults, not measurements, and they are the
   * first thing to revisit when there is enough volume to compare a reading
   * against the distribution of every other reading of the same shelf.
   */
  const held = comparison.filter((p) => isLoneOutlier(p, comparison));
  const vetted = held.length === 0 ? comparison : comparison.filter((p) => !held.includes(p));

  const newestAge = min(vetted.map((p) => ageDays(p.observedAt, asOf)));

  // Every point that sets the tier should itself be current. Checking only the
  // newest let one fresh row carry a set of month-old prices in a category whose
  // own rule is three days, and the dead cheapest price in it became the bar the
  // shopper was sent to chase. Furniture is exempt because there the history IS
  // the comparison.
  const tiering = rule.historyBased
    ? vetted
    : vetted.filter((p) => ageDays(p.observedAt, asOf) <= rule.maxAgeDays);

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

  /* A held price is named, never silently dropped. Somebody typed that number
     in and it is not being used; saying so is the difference between a
     judgement and a disappearance, and it is the only way a person who typed an
     honest price that happens to be an outlier can tell what happened. */
  if (held.length > 0) {
    shortfalls.push(
      `${held.length} typed price${held.length === 1 ? ' is' : 's are'} being held back for now, too far from everything else to publish on one person's word`,
    );
  }

  let basis = tiering;
  if (basis.length === 0) {
    // Everything we have is outside the category's window. Old prices still
    // locate a product far better than silence does, so they answer, labelled.
    basis = vetted;
    shortfalls.push(
      `the newest price we have is ${newestAge} days old, and ${rule.label.toLowerCase()} moves faster than that`,
    );
  } else if (tiering.length < vetted.length) {
    const dropped = vetted.length - tiering.length;
    shortfalls.push(`${dropped} of ${vetted.length} prices are too old to count`);
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

/**
 * One display name per merchant before `judge()` counts them.
 *
 * `judge()` counts sellers by the exact string, which is correct for its own
 * caller and wrong here: our feeds hand the same shop over as "Walmart" and as
 * "walmart.ca", and one merchant under two spellings would buy a confidence of
 * 0.7 off a single store's word. On this path the confidence IS the mechanism
 * carrying the doubt, so it must not be inflated by a spelling. This is the
 * same failure `confidenceOf` below records having had for real.
 */
function canonicalSellers(points: readonly PricePoint[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const p of points) {
    const key = normalizeSeller(p.seller);
    const seen = names.get(key);
    // Shortest spelling wins, which is the plain name over the domain form.
    if (seen === undefined || p.seller.length < seen.length) names.set(key, p.seller);
  }
  return names;
}

/**
 * The answer where the category cannot give one. `price/src/verdict.ts`, in
 * production, from 2026-09-08.
 *
 * The translation is the whole of this function and it is deliberately dull.
 * The two files disagree on three things and each disagreement is resolved in
 * the direction that keeps the answer honest rather than the one that keeps it
 * short:
 *
 * - `judge()` knows two kinds, regular and promotional. The spine knows five. A
 *   promotion stays a promotion, because decision 33 says a sale price and a
 *   shelf price never merge; everything else, including an asking price and a
 *   manufacturer list, becomes the regular band, because on this path they are
 *   not a supplement to a real comparison, they are the only numbers there are
 *   and the shortfall sentence says exactly that.
 * - `judge()` calls the dear end `high`; the contract's third face is
 *   `walk_away`. Same tier, two vocabularies, and the contract's wins.
 * - `judge()` asks whether a row was matched by barcode or by name. The spine
 *   carries that on the identity rather than on the point, so a query that
 *   resolved without a barcode takes the `likely` penalty across the set. That
 *   is the more pessimistic reading of what we know and it is the right one
 *   here, where the evidence is already thin.
 *
 * The band is pinned to `low` and not derived from the score. Reaching this
 * function means the category's own filters threw away every price, which is a
 * shortfall by definition; a set that clears a category's bar never gets here.
 */
function thinAnswer(
  identity: ProductIdentity,
  rule: CategoryRule,
  points: readonly PricePoint[],
  askingCents: number,
  askingSeller: string | undefined,
  shortfall: string,
  asOf: string,
): Verdict | null {
  // D-022's hold applies here too, and under the same rule: it may name a lone
  // claim, it may never be the thing that empties the set.
  const held = points.filter((p) => isLoneOutlier(p, points));
  const basis = held.length === 0 || held.length === points.length
    ? points
    : points.filter((p) => !held.includes(p));

  const names = canonicalSellers(basis);
  const observations: ThinObservation[] = basis.map((p) => ({
    seller: names.get(normalizeSeller(p.seller)) ?? p.seller,
    amountCents: p.amountCents,
    kind: p.kind === 'promotional' ? 'promotional' : 'regular',
    observedAt: p.observedAt.slice(0, 10),
    // Every price in this contract is a shelf or listing price, never a total
    // at a till, so nothing is dropped by decision 36's pre-tax filter.
    preTax: true,
    joinQuality: identity.gtin ? 'exact' : 'likely',
  }));

  const judged = judgeThinEvidence({
    shelfCents: askingCents,
    observations,
    now: new Date(asOf),
  });
  if (judged.tier === null) return null;

  const reasons = [shortfall, ...judged.confidenceBasis];
  if (held.length > 0 && held.length < points.length) {
    reasons.push(
      `${held.length} typed price${held.length === 1 ? ' is' : 's are'} being held back for now, too far from everything else to publish on one person's word`,
    );
  }
  if (isIncoherent(basis, rule.mixedKindsExpected)) {
    reasons.push('the prices found disagree widely enough that this may be more than one product');
  }
  const listed = reasons.join('; ');

  const ages = basis.map((p) => ageDays(p.observedAt, asOf));
  const observed = basis.map((p) => p.observedAt).sort();

  return {
    kind: 'verdict',
    identity,
    category: identity.category,
    askingCents,
    askingSource: askingSeller ?? 'given',
    tier: judged.tier === 'high' ? 'walk_away' : judged.tier,
    lines: [judged.line],
    comparisonSet: basis,
    pointCount: basis.length,
    oldestObservedAt: observed[0],
    newestObservedAt: observed[observed.length - 1],
    spread: spreadOf(basis),
    confidence: {
      band: 'low',
      because: `${listed.charAt(0).toUpperCase()}${listed.slice(1)}.`,
      score: judged.confidence,
      pointCount: basis.length,
      distinctSellers: names.size,
      oldestPointAgeDays: max(ages),
      identityConfidence: identity.confidence,
    },
    disagreement: spreadDisagreement(basis),
    producedAt: asOf,
  };
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
  if (hits.length > 0) {
    // Highest confidence wins. Ties keep source order, which is registry order,
    // which is the order a human decided sources should be trusted in.
    return hits.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  }

  /*
   * A code we have never seen is a gap in our prices, not a failure to know
   * what the person is holding. So the words get their own attempt.
   *
   * WHY THIS EXISTS. A source that resolves by code returns nothing for a code
   * it has no rows for, and a query carrying one used to stop right there: no
   * identity, "could not work out what this is", nothing to tap. The same query
   * with the code removed resolves by name and comes back with a candidate and
   * a repair. So handing the judge MORE information made the answer worse,
   * which is the exact shape priority 1 forbids.
   *
   * Found 2026-09-07 by walking the app: the screen had been dropping the code
   * on both catalogue-resolved routes, and fixing that turned "pick the right
   * one" into "no clue" for every product whose barcode we hold no price for,
   * which is most of them.
   *
   * The retry cannot loop: it only runs when a gtin was given, and it removes
   * it. Nothing here invents an identity; if the words resolve nothing either,
   * the answer is still null and the refusal above still stands.
   */
  if (query.gtin && query.text) {
    const byWords = await Promise.all(
      eligible.map((s) => s.identify({ ...query, gtin: undefined }).catch(() => null)),
    );
    const wordHits = byWords.filter((i): i is ProductIdentity => i !== null);
    if (wordHits.length > 0) return wordHits.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  }

  return null;
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

/**
 * How far outside the going rate a single unwitnessed claim may sit before it
 * is held back rather than published. Design defaults, not measurements.
 *
 * Low is tighter than high on purpose: D-022 names a fake low price as the
 * dangerous direction, because that is the one that sends somebody to a shop on
 * a promise nobody there will keep.
 */
export const LONE_CLAIM_FLOOR = 0.5;
export const LONE_CLAIM_CEILING = 2.5;

/** Points a member of the public cannot write. The only honest baseline. */
function vouchedBaseline(points: readonly PricePoint[]): number[] {
  return points.filter((p) => p.witnesses === undefined || p.witnesses > 1).map((p) => p.amountCents);
}

/**
 * Whether this point is one person's unwitnessed claim sitting far outside what
 * the vouched evidence says. Returns false whenever there is not enough vouched
 * evidence to judge against, which is most of the time today and is the correct
 * answer then: an accusation needs a basis.
 */
function isLoneOutlier(point: PricePoint, all: readonly PricePoint[]): boolean {
  if (point.witnesses === undefined || point.witnesses > 1) return false;
  const baseline = vouchedBaseline(all.filter((p) => p !== point));
  /*
   * ONE VOUCHED PRICE IS ENOUGH TO HOLD A CLAIM AGAINST. This read `< 2`
   * until 2026-09-08, which made the whole D-022 hold inert on almost every
   * product the app can answer for.
   *
   * The corpus holds roughly one crawled price per product. So the baseline
   * was almost always exactly one, the hold returned false before looking at
   * anything, and the mechanism written to stop a single typed price moving a
   * verdict did not run in the one data shape that exists. Measured before the
   * change: a crawled $3.47 at walmart.ca, one typed $0.99 claim, and a $3.49
   * tag at Metro went from GOOD to WALK AWAY, with the sentence reporting
   * "about $0.99 across 2 stores" as though two shops agreed.
   *
   * Two was the safer-looking number and it was safe about the wrong thing. A
   * median of one point is that point, which is a weaker baseline than a median
   * of several -- but the comparison it enables is against a price somebody
   * crawled, and the alternative is no comparison at all. Holding a claim that
   * sits at 28% of the only price we hold costs a shopper nothing; publishing
   * it costs them the trip.
   *
   * Zero is still not enough, and that is not symmetry: with no vouched point
   * there is nothing to be an outlier FROM, and the only comparison left would
   * be against other unvouched claims, which is the collusion the baseline
   * excludes by construction.
   */
  if (baseline.length < 1) return false;
  const going = median(baseline);
  if (going <= 0) return false;
  return point.amountCents < going * LONE_CLAIM_FLOOR || point.amountCents > going * LONE_CLAIM_CEILING;
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
  } else if (
    points.length === rule.minPoints ||
    /*
     * The seller half of this clause is only a limit where a SECOND seller is
     * something the category could have. Furniture's rule is built around one
     * seller by design, so `sellers === 1` was true on every furniture verdict
     * and the band could never leave `low`: eight fresh IKEA points read
     * "Only just enough to answer: 8 prices from 1 seller." The one category
     * built around a single seller was barred from the `high` band the
     * history-based clause below was written to give it.
     */
    (rule.minDistinctSellers > 1 && sellers === rule.minDistinctSellers)
  ) {
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
  /** Research prose, D-013. Carried as its own field so it never joins `detail`. */
  evidenceNote?: string,
): Refusal {
  const base: Refusal = { kind: 'refusal', reason, detail, identity, evidence, producedAt };
  return evidenceNote === undefined || evidenceNote === '' ? base : { ...base, evidenceNote };
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
