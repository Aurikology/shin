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
  StructuredText,
  TextFragment,
  Verdict,
} from './contract.ts';
import { fragment, say } from './contract.ts';
import { isIncoherent, ruleFor, spreadDisagreement } from './categories.ts';
import type { CategoryRule } from './categories.ts';
import { judge as judgeThinEvidence } from '../../price/src/verdict.ts';
import type {
  Observation as ThinObservation,
  Verdict as ThinJudgement,
} from '../../price/src/verdict.ts';
import { CORROBORATION_FLOOR_CENTS, CORROBORATION_TOLERANCE } from '../../price/src/corrections.ts';
import { ageDays, cad, isFutureDated, isUsableAmount, max, median, min, percentile } from './money.ts';
import type { PriceSource } from './sources/source.ts';
import { normalizeSeller, sellerIdentity } from './sources/source.ts';

export interface SpineDeps {
  readonly sources: readonly PriceSource[];
  /** Optional hook so a refusal can quote why a recorded identity was doubted. */
  readonly identityNote?: (identityId: string) => string | undefined;
  /**
   * What the product catalogue says a barcode is, asked only when no price
   * source recognised the query. Optional so the engine stays free of the
   * catalogue database: the server hands it a lookup, tests hand it a fake.
   *
   * WHY IT EXISTS (2026-09-14). A barcode no price source holds a row for used
   * to come back "Could not work out what this is", even after `/api/identify`
   * had named the product from the same code. That is a gap in our prices
   * reported as a failure to know the product. docs/plan-always-a-price.md,
   * step "the catalogue tells the price engine what the barcode is".
   */
  readonly catalogueIdentity?: (query: SpineQuery) => Promise<ProductIdentity | null>;
}

/**
 * A shortfall said twice: today's exact English, and the same thing as a code
 * with raw facts beside it.
 *
 * ONE OBJECT RATHER THAN TWO PARALLEL ARRAYS, on purpose. Parallel arrays drift
 * the first time somebody adds a reason on one line and forgets the other, and
 * the failure mode is a French screen quietly missing a caveat the English
 * screen shows, with nothing red anywhere. Here a shortfall cannot be built
 * without both halves, and `test/structured-prose.test.ts` renders the fragment
 * back and asserts it equals the text.
 */
interface Shortfall {
  readonly text: string;
  readonly fragment: TextFragment;
}

function shortfall(text: string, frag: TextFragment): Shortfall {
  return { text, fragment: frag };
}

/**
 * Reasons joined into the one sentence `Confidence.because` shows.
 *
 * English's join is `"; "`, then sentence-case, then a full stop, and that is
 * what `shortfall_list` names. The shape travels rather than the punctuation so
 * a locale can join and capitalise by its own rules.
 */
function becauseOf(reasons: readonly Shortfall[]): { text: string; structured: StructuredText } {
  const listed = reasons.map((r) => r.text).join('; ');
  return {
    text: `${listed.charAt(0).toUpperCase()}${listed.slice(1)}.`,
    structured: { shape: 'shortfall_list', fragments: reasons.map((r) => r.fragment) },
  };
}

export async function priceIt(query: SpineQuery, deps: SpineDeps): Promise<SpineResult> {
  const asOf = query.asOf ?? new Date().toISOString();
  const usableSources = deps.sources.filter((s) => s.available().ok);

  if (usableSources.length === 0) {
    return refuse(
      'no_source_response',
      'No price source is available right now.',
      say('refusal_no_price_source_available'),
      null,
      [],
      asOf,
    );
  }

  // 1. Identity, before anything else touches a number.
  const identity = await resolveIdentity(query, usableSources, deps.catalogueIdentity);
  if (identity === null) {
    return refuse(
      'no_identity',
      'Could not work out what this is. Scan the barcode, or type the model number.',
      say('refusal_identity_unresolved'),
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
      // `category` is the raw code and is what a French renderer keys on. The
      // label and the recorded `why` travel beside it as English prose owned by
      // `categories.ts`.
      //
      // `why` used to be the whole answer, and it was the last thing in this
      // package that reached a French reader in English: the frame translated
      // and a 350-character English paragraph came through it verbatim. So the
      // same call now also ships as `whyCode` plus the raw `whyFacts` that
      // paragraph interpolates, and a renderer that knows the code rebuilds the
      // reason instead of passing ours on. `why` stays exactly as it was, and is
      // still the fallback for a code a client has not been taught.
      say('refusal_category_not_served', {
        category: identity.category,
        categoryLabel: rule.label,
        why: rule.unsupported.why,
        whyCode: rule.unsupported.whyCode,
        whyFacts: rule.unsupported.whyFacts,
      }),
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
      say('refusal_identity_below_floor', { label: identity.label }),
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
      say('refusal_no_price_for_product', { label: identity.label }),
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
      // Two codes because they are two different repairs, which is the same
      // reason `RefusalReason` splits anywhere else in this file.
      say(
        query.askingCents === undefined
          ? 'refusal_asking_price_missing'
          : 'refusal_asking_price_unreadable',
      ),
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
        say('refusal_all_prices_future_dated'),
        identity,
        raw,
        asOf,
      );
    }

    // The order matches the filter order above. Every sentence points at the
    // prices, the sellers or the dates, never at the person holding the phone.
    let cause: Shortfall;
    if (usableKind.length === 0) {
      // The kinds go out as the contract's own `PriceKind` codes. English joins
      // them with " and "; a locale joins its own translations its own way.
      cause = shortfall(
        `the only prices anyone publishes for this are ${droppedKinds.join(' and ')}, which is not a comparison`,
        fragment('shortfall_no_comparable_price_kinds', { kinds: droppedKinds }),
      );
    } else if (withinWindow.length === 0) {
      const newestAgeDays = min(datedSanely.map((p) => ageDays(p.observedAt, asOf)));
      cause = shortfall(
        `the newest price we have is ${newestAgeDays} days old, past what ${rule.label.toLowerCase()} tolerates`,
        fragment('shortfall_newest_price_past_tolerance', {
          ageDays: newestAgeDays,
          category: identity.category,
          categoryLabel: rule.label,
        }),
      );
    } else {
      cause = shortfall(
        'every price we have is this same store, so this is against its own history rather than against anybody else',
        fragment('shortfall_only_the_asking_seller_has_prices'),
      );
    }

    /*
     * Item 15b applies on this path too, and it has to be applied HERE rather
     * than inside `thinAnswer`, because the answer when nothing counts is not a
     * thinner verdict, it is a different shape: the one report, named. Routing
     * it through the thin judge and letting that return null would land on the
     * `no_source_response` guard below, which says nobody has a price for this
     * while holding the price somebody typed.
     */
    const counted = datedSanely.filter((p) => countsTowardTier(p, datedSanely));
    if (counted.length === 0) return singleReport(identity, datedSanely, asOf);
    const uncounted = datedSanely.filter((p) => !counted.includes(p));

    const thin = thinAnswer(
      identity,
      rule,
      counted,
      askingCents,
      query.askingSeller,
      uncounted.length === 0 ? [cause] : [cause, notCountedShortfall(uncounted)],
      asOf,
    );
    if (thin !== null) return thin;

    // Unreachable with a shelf price and at least one point, kept because the
    // alternative to a guard here is a crash in an aisle.
    return refuse(
      'no_source_response',
      `Nothing has a price for "${identity.label}" right now.`,
      say('refusal_no_price_for_product', { label: identity.label }),
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

  /*
   * 6a. Item 15b, and it sits here because it is the broader form of the hold
   * above: a typed price counts toward a tier only when a second device or a
   * crawled source agrees within the band. Everything the hold catches this
   * catches too (a claim far outside the crawled prices agrees with none of
   * them), so the two are layered rather than duplicated: the hold decides
   * WHICH SENTENCE a dropped price gets, because "too far from everything else"
   * and "nobody has seen that tag yet" are different facts about different
   * prices and a shopper who typed an honest number is owed the true one.
   *
   * When nothing is left, there is no tier to give. That is item 15a and it is
   * the one place in this file where evidence exists and no tier is produced on
   * purpose: the answer is the reading itself, which `singleReport` writes.
   */
  const counted = vetted.filter((p) => countsTowardTier(p, vetted));
  if (counted.length === 0) return singleReport(identity, vetted, asOf);
  const uncounted = vetted.filter((p) => !counted.includes(p));

  const newestAge = min(counted.map((p) => ageDays(p.observedAt, asOf)));

  // Every point that sets the tier should itself be current. Checking only the
  // newest let one fresh row carry a set of month-old prices in a category whose
  // own rule is three days, and the dead cheapest price in it became the bar the
  // shopper was sent to chase. Furniture is exempt because there the history IS
  // the comparison.
  const tiering = rule.historyBased
    ? counted
    : counted.filter((p) => ageDays(p.observedAt, asOf) <= rule.maxAgeDays);

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
  const shortfalls: Shortfall[] = [];

  /* A held price is named, never silently dropped. Somebody typed that number
     in and it is not being used; saying so is the difference between a
     judgement and a disappearance, and it is the only way a person who typed an
     honest price that happens to be an outlier can tell what happened. */
  if (held.length > 0) {
    shortfalls.push(heldBackShortfall(held.length));
  }

  /* Item 15b's own sentence, for a reading nobody has confirmed rather than one
     that disagrees with everything. Same rule as the hold above: a price that is
     not being used is said out loud, because a disappearance is the one thing a
     person who typed an honest number cannot tell from a bug. */
  if (uncounted.length > 0) shortfalls.push(notCountedShortfall(uncounted));

  let basis = tiering;
  if (basis.length === 0) {
    // Everything we have is outside the category's window. Old prices still
    // locate a product far better than silence does, so they answer, labelled.
    basis = counted;
    shortfalls.push(
      shortfall(
        `the newest price we have is ${newestAge} days old, and ${rule.label.toLowerCase()} moves faster than that`,
        fragment('shortfall_newest_price_older_than_category', {
          ageDays: newestAge,
          category: identity.category,
          categoryLabel: rule.label,
        }),
      ),
    );
  } else if (tiering.length < counted.length) {
    const dropped = counted.length - tiering.length;
    shortfalls.push(
      shortfall(
        `${dropped} of ${counted.length} prices are too old to count`,
        fragment('shortfall_some_prices_too_old_to_count', {
          droppedCount: dropped,
          totalCount: counted.length,
        }),
      ),
    );
  }

  if (basis.length < rule.minPoints) {
    shortfalls.push(
      shortfall(
        `${basis.length} price${basis.length === 1 ? '' : 's'} where ${rule.label.toLowerCase()} usually needs ${rule.minPoints}`,
        fragment('shortfall_fewer_points_than_category_needs', {
          pointCount: basis.length,
          needed: rule.minPoints,
          category: identity.category,
          categoryLabel: rule.label,
        }),
      ),
    );
  }

  // Counted on the identity, never on the name (D-081): after normalising so
  // one merchant arriving under three feed spellings cannot look like three
  // sellers, and on `sellerId` where the source has one so two branches of one
  // chain sharing a display name cannot look like one.
  const sellers = new Set(basis.map((p) => sellerIdentity(p)));
  if (sellers.size < rule.minDistinctSellers) {
    shortfalls.push(
      shortfall(
        `${sellers.size} seller${sellers.size === 1 ? '' : 's'} where ${rule.label.toLowerCase()} usually needs ${rule.minDistinctSellers}`,
        fragment('shortfall_fewer_sellers_than_category_needs', {
          sellerCount: sellers.size,
          needed: rule.minDistinctSellers,
          category: identity.category,
          categoryLabel: rule.label,
        }),
      ),
    );
  }

  if (isIncoherent(basis, rule.mixedKindsExpected)) {
    shortfalls.push(incoherentShortfall());
  }

  // 6. Only now does a category get to speak.
  const { tier, lines, structuredLines, disagreement } = rule.judge({
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
    structuredLines,
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
/**
 * ITEM 19. The currency a comparison set is in, read off the price points
 * themselves. This used to be the literal 'CAD' written into every amount
 * fragment of the thin-evidence sentence, so a price in any other currency was
 * labelled Canadian dollars on its way to the screen. Nothing is converted: a set
 * is in the currency of its points, and where a set somehow holds more than one
 * the most common is named (a point's currency is a plain string now, so a mixed
 * set can be built; the comparison rules, not this label, decide what to do
 * about one).
 */
export function currencyOfPoints(points: readonly { readonly currency: string }[]): string {
  const counts = new Map<string, number>();
  for (const p of points) counts.set(p.currency, (counts.get(p.currency) ?? 0) + 1);
  let best = '';
  let n = 0;
  for (const [c, k] of counts) if (k > n) { best = c; n = k; }
  return best;
}

/**
 * The thin-evidence sentence as codes and raw facts.
 * (Takes the currency as a parameter, item 19: `currencyOfPoints` above supplies it.)
 *
 * RE-DERIVED HERE RATHER THAN EMITTED WHERE THE WORDS ARE CHOSEN, and that is a
 * compromise worth naming. `price/src/verdict.ts` composes that string out of
 * four pieces (a head, a comparison, an optional unit price and an optional
 * promotion) and it is another package. So this reads the judgement object back
 * and rebuilds the same four pieces from it.
 *
 * The derivation is TOTAL, not a guess: every number and name the sentence
 * interpolates is on that object -- both bands, their ends, their sellers, the
 * unit price and the shelf price -- and the branches below are the same
 * branches that file takes, in the same order. `test/structured-prose.test.ts`
 * renders these fragments back into English and asserts the result equals
 * `judged.line` byte for byte, so a change over there fails here rather than
 * quietly shipping a French screen that says something else.
 *
 * The right long-term home is `verdict.ts` itself. That is a different package
 * and a different lane.
 *
 * EXPORTED for `test/structured-prose.test.ts` only. The test drives it over
 * judgements `priceIt` cannot currently reach -- a known unit price is one, see
 * `thinAnswer` -- so the derivation is proven total against the shape rather
 * than against today's reachable subset of it.
 */
export function thinStructuredLine(judged: ThinJudgement, askingCents: number, currency: string): StructuredText {
  const basis = judged.regular ?? judged.promotional;
  // Unreachable: a null basis is one of the two cases that return a null tier,
  // and the caller returns before this on a null tier. Guarded, not assumed.
  if (basis === null || judged.tier === null) return { shape: 'sentences', fragments: [] };

  // A band with no width is one price, not a range, and the sentence says
  // something different about it. That is a meaning split, so it is a code
  // split. `sellerCount` is the fact that picks "the only price we have" from
  // "what every seller charges", because that is an English phrasing choice
  // over one number and not a separate claim.
  const soleprice = basis.cheapestCents === basis.dearestCents;
  const head =
    judged.tier === 'good'
      ? soleprice
        ? fragment('asking_below_sole_price', {
            askingCents,
            currency,
            sellerCount: basis.sellerCount,
          })
        : fragment('asking_below_range', { askingCents, currency })
      : judged.tier === 'fair'
        ? soleprice
          ? fragment('asking_equals_sole_price', {
              askingCents,
              currency,
              sellerCount: basis.sellerCount,
            })
          : fragment('asking_within_range', { askingCents, currency })
        : soleprice
          ? fragment('asking_above_sole_price', {
              askingCents,
              currency,
              sellerCount: basis.sellerCount,
            })
          : fragment('asking_above_range', { askingCents, currency });

  const compare = soleprice
    ? fragment('sole_price_matched_at_seller', {
        seller: basis.cheapestSeller,
        amountCents: basis.cheapestCents,
        currency,
      })
    : fragment('cheapest_and_dearest_sellers', {
        cheapestSeller: basis.cheapestSeller,
        cheapestCents: basis.cheapestCents,
        dearestSeller: basis.dearestSeller,
        dearestCents: basis.dearestCents,
        currency,
      });

  const fragments: TextFragment[] = [head, compare];

  // `unitLabel` is "100g" or "100ml" off the pack size, which is a unit symbol
  // rather than prose, so it travels as it is.
  if (basis.unitCents !== null && basis.unitLabel !== null) {
    fragments.push(
      fragment('unit_price', {
        unitCents: basis.unitCents,
        currency,
        unitLabel: basis.unitLabel,
      }),
    );
  }

  if (judged.promotional !== null && judged.promotional.cheapestCents < basis.cheapestCents) {
    fragments.push(
      fragment('cheaper_on_promotion_at_seller', {
        seller: judged.promotional.cheapestSeller,
        amountCents: judged.promotional.cheapestCents,
        currency,
      }),
    );
  }

  return { shape: 'sentences', fragments };
}

/** The four strings `price/src/verdict.ts` can put in `confidenceBasis`, as codes. */
const THIN_BASIS_CODES = new Map<string, TextFragment>([
  ['one seller', fragment('basis_single_seller')],
  ['the newest price is over three weeks old', fragment('basis_newest_price_over_three_weeks')],
  ['only sale prices to compare against', fragment('basis_only_sale_prices')],
  ['one seller matched by name, not barcode', fragment('basis_matched_by_name_not_barcode')],
]);

const THIN_BASIS_SELLERS = /^(\d+) sellers agree on the range$/;

/**
 * One of that file's reasons, as a shortfall carrying both halves.
 *
 * The seller count is READ BACK OFF THE STRING rather than recomputed from our
 * own points, deliberately: that file clamps it (`Math.min(sellerCount, 9)`)
 * and counts sellers on its own band, so any number we derived here could
 * differ from the one the English actually printed and the two halves would
 * stop agreeing. Reading it back cannot drift.
 *
 * EXPORTED for `test/structured-prose.test.ts`, which drives `confidenceOf` in
 * `price/src/verdict.ts` across its whole input domain and asserts none of the
 * strings it can produce falls through to `basis_reason_not_yet_coded`.
 */
export function thinBasisShortfall(text: string): { text: string; fragment: TextFragment } {
  const known = THIN_BASIS_CODES.get(text);
  if (known !== undefined) return shortfall(text, known);
  const sellers = THIN_BASIS_SELLERS.exec(text);
  if (sellers !== null) {
    return shortfall(text, fragment('basis_sellers_agree_on_range', { sellerCount: Number(sellers[1]) }));
  }
  // See `basis_reason_not_yet_coded`: unreachable, test-enforced, and it keeps
  // the English exact rather than dropping a reason a shopper is owed.
  return shortfall(text, fragment('basis_reason_not_yet_coded', { text }));
}

function thinAnswer(
  identity: ProductIdentity,
  rule: CategoryRule,
  points: readonly PricePoint[],
  askingCents: number,
  askingSeller: string | undefined,
  causes: readonly Shortfall[],
  asOf: string,
): Verdict | null {
  // D-022's hold applies here too, and under the same rule: it may name a lone
  // claim, it may never be the thing that empties the set.
  const held = points.filter((p) => isLoneOutlier(p, points));
  const basis = held.length === 0 || held.length === points.length
    ? points
    : points.filter((p) => !held.includes(p));

  const names = canonicalSellers(basis);
  // Displayed under one name per merchant (`names`), counted on the identity
  // (D-081). Two branches of one chain print the chain's name and still count
  // as two, which is what `distinctSellers` below has always claimed to be.
  const distinctSellers = new Set(basis.map((p) => sellerIdentity(p))).size;
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

  const reasons: Shortfall[] = [...causes, ...judged.confidenceBasis.map(thinBasisShortfall)];
  if (held.length > 0 && held.length < points.length) {
    reasons.push(heldBackShortfall(held.length));
  }
  if (isIncoherent(basis, rule.mixedKindsExpected)) {
    reasons.push(incoherentShortfall());
  }
  const said = becauseOf(reasons);

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
    structuredLines: [thinStructuredLine(judged, askingCents, currencyOfPoints(basis))],
    comparisonSet: basis,
    pointCount: basis.length,
    oldestObservedAt: observed[0],
    newestObservedAt: observed[observed.length - 1],
    spread: spreadOf(basis),
    confidence: {
      band: 'low',
      because: said.text,
      structuredBecause: said.structured,
      score: judged.confidence,
      pointCount: basis.length,
      distinctSellers,
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
  catalogueIdentity?: SpineDeps['catalogueIdentity'],
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
  /*
   * The catalogue, by barcode, before the words retry below. A code the
   * catalogue holds is an exact answer to "what is this"; the words retry can
   * only offer a near match by name. The phone's two cases of 2026-09-14
   * (Kirkland water by barcode, the photo route's "Water" row by its code)
   * both land here: no price source had a row for either code.
   *
   * A lookup that throws is a miss, the same rule the sources get above.
   */
  if (query.gtin && catalogueIdentity) {
    const fromCatalogue = await catalogueIdentity(query).catch(() => null);
    if (fromCatalogue) return fromCatalogue;
  }

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

/**
 * THE CORROBORATION RULE. Item 15b of the beta build plan: "a typed price counts
 * toward a tier only when a second device or a crawled source agrees within a
 * band."
 *
 * This is the half of D-022 the lone-claim hold above could not reach. That hold
 * asks whether one typed number is wildly out of line with the crawled prices we
 * hold, so it can only fire where crawled prices exist; with nothing crawled
 * there is no baseline, it correctly declines to accuse, and the result until
 * today was a full good / fair / walk away call computed from one person's typed
 * number. The hold is the narrow rule and stays; this is the general one.
 *
 * WHERE THE BAND COMES FROM, since the brief asks for the number to be argued
 * rather than chosen. It is `CORROBORATION_TOLERANCE` and
 * `CORROBORATION_FLOOR_CENTS` out of `price/src/corrections.ts`, imported rather
 * than retyped, because that file already answers exactly this question for the
 * device-to-device case: 12 percent or 25 cents, whichever is larger, is how
 * close two readings of one shelf have to be before they are treated as the same
 * tag. A crawled price agreeing with a typed one is the same question asked of a
 * different witness, and two different numbers for one question would mean a
 * report could be corroborated by a phone and not by a crawl at the same gap,
 * which nobody could explain to the person who typed it. The tolerance is
 * deliberately generous for the reason that file gives: shelf tags move, someone
 * reads $3.99 the day before a sale ends and someone else reads $4.49 the day
 * after, and calling those two different observations would make corroboration
 * almost unreachable and the mechanism decorative.
 *
 * Symmetric, where `witnessesFor` is not. That function judges one row against
 * the others and scales the tolerance by the row being judged; here neither
 * price is the subject, so the scale is taken off the smaller of the two and
 * "A agrees with B" and "B agrees with A" cannot disagree.
 */
function agreesWithinBand(aCents: number, bCents: number): boolean {
  const allowed = Math.max(CORROBORATION_FLOOR_CENTS, Math.min(aCents, bCents) * CORROBORATION_TOLERANCE);
  return Math.abs(aCents - bCents) <= allowed;
}

/**
 * A price a member of the public cannot write, which is every crawled feed and
 * every catalogue price. `contract.ts` on `witnesses`: undefined means the source
 * vouches for it itself, because a Walmart page is not a witness statement, it is
 * the seller's own number.
 */
function isCrawled(p: PricePoint): boolean {
  return p.witnesses === undefined;
}

/**
 * Whether this price may count toward a tier. Crawled prices always may. A typed
 * one may when a second device saw the same tag (`witnesses > 1`, counted
 * upstream in `witnessesFor`) or when a crawled price agrees within the band.
 *
 * It never removes the last price: `priceIt` checks for an empty result and
 * answers with the one report instead of a tier, which is the whole of item 15a.
 */
function countsTowardTier(point: PricePoint, all: readonly PricePoint[]): boolean {
  if (isCrawled(point)) return true;
  if ((point.witnesses ?? 0) > 1) return true;
  return all.some((o) => o !== point && isCrawled(o) && agreesWithinBand(o.amountCents, point.amountCents));
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "3 September". A shopper reads a day, not an ISO string they have to decode. */
function dayInWords(observedAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(observedAt);
  if (m === null) return observedAt;
  const month = MONTHS[Number(m[2]) - 1];
  return month === undefined ? observedAt : `${Number(m[3])} ${month}`;
}

/** "$3.99 at No Frills on 3 September". One reading, named in full. */
function readingInWords(p: PricePoint): string {
  return `${cad(p.amountCents)} at ${p.seller} on ${dayInWords(p.observedAt)}`;
}

/**
 * The answer when every price we hold is one person's word. Item 15a's sentence.
 *
 * It names every reading rather than summarising them, for the reason decision 32
 * gives about averages: a number that exists nowhere is a number nobody can
 * check. Two people in two shops are two readings, not a range, because nothing
 * has confirmed either of them.
 */
function singleReport(
  identity: ProductIdentity,
  reports: readonly PricePoint[],
  asOf: string,
): Refusal {
  const newestFirst = [...reports].sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1));
  const detail =
    newestFirst.length === 1
      ? `One shopper saw ${readingInWords(newestFirst[0])}. Nobody else has priced this yet, so there is nothing to check it against.`
      : `Shoppers typed in ${newestFirst.map(readingInWords).join(', and ')}. Nobody has seen either of those tags twice, so there is nothing to check them against.`;
  /*
   * Every reading goes out whole and raw: cents as an integer, the seller's
   * name, and the full ISO timestamp. `dayInWords` turning that into
   * "3 September" is an ENGLISH rendering of the same fact, and it is exactly
   * the kind of thing that had to stop happening on this side of the wire.
   *
   * Two codes, because these are two different statements: one reading nobody
   * can check, and several readings none of which was seen twice. That is a
   * meaning split. The count is still a fact on both so a renderer never has to
   * infer it from the array length.
   */
  const readings = newestFirst.map((p) => ({
    amountCents: p.amountCents,
    currency: p.currency,
    seller: p.seller,
    observedAt: p.observedAt,
  }));
  const structuredDetail = say(
    newestFirst.length === 1 ? 'refusal_one_shopper_report' : 'refusal_several_unconfirmed_reports',
    { readings, count: readings.length },
  );
  return refuse('single_report', detail, structuredDetail, identity, reports, asOf);
}

/**
 * The sentence for prices that were left out of a tier the rest of the evidence
 * could still produce. Named, never a silent disappearance, and worded apart
 * from the lone-claim hold's "held back": this one is not an accusation, it is
 * a reading nobody has confirmed yet.
 */
function notCountedShortfall(uncounted: readonly PricePoint[]): Shortfall {
  // ONE code and a count fact, not two codes. English splits on 1 and French
  // does not split in the same place; a `..._singular` code would hard-code an
  // English grammar rule into the contract, which is the thing this whole
  // mechanism exists to undo.
  return shortfall(
    `${uncounted.length} typed price${uncounted.length === 1 ? ' is' : 's are'} not counted toward this, because nobody else has seen ${uncounted.length === 1 ? 'that tag' : 'those tags'} yet`,
    fragment('shortfall_uncorroborated_typed_prices', { count: uncounted.length }),
  );
}

/** D-022's hold, said out loud. Same one-code-plus-count rule as above. */
function heldBackShortfall(count: number): Shortfall {
  return shortfall(
    `${count} typed price${count === 1 ? ' is' : 's are'} being held back for now, too far from everything else to publish on one person's word`,
    fragment('shortfall_lone_claims_held_back', { count }),
  );
}

/** Raised on both the category path and the thin path, so it is written once. */
function incoherentShortfall(): Shortfall {
  return shortfall(
    'the prices found disagree widely enough that this may be more than one product',
    fragment('shortfall_prices_may_be_two_products'),
  );
}

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
  shortfalls: readonly Shortfall[] = [],
): Confidence {
  const ages = points.map((p) => ageDays(p.observedAt, asOf));
  const newestAge = min(ages);
  const oldestAge = max(ages);
  // On the identity, matching how the shortfall above counts them. This used to be
  // a raw string set, so "Best Buy", "BestBuy.ca" and "best buy" reported as
  // three sellers. It was invisible while a normalised gate stood in front of
  // it and rejected that set before confidence was ever computed; with the gate
  // gone this number is the one the shopper reads.
  const sellers = new Set(points.map((p) => sellerIdentity(p))).size;

  let band: ConfidenceBand;
  let because: string;
  let structuredBecause: StructuredText;

  if (shortfalls.length > 0) {
    band = 'low';
    // Named, not summarised. "Low confidence" on its own is a shrug; "1 price
    // where groceries usually needs 2" is something a shopper can weigh.
    const said = becauseOf(shortfalls);
    because = said.text;
    structuredBecause = said.structured;
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
    structuredBecause = say('confidence_minimum_met_only', {
      pointCount: points.length,
      sellerCount: sellers,
    });
  } else if (newestAge > rule.maxAgeDays / 2) {
    band = 'medium';
    because = `Newest price is ${newestAge} days old.`;
    structuredBecause = say('confidence_newest_price_age', { ageDays: newestAge });
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
    structuredBecause = rule.historyBased
      ? say('confidence_history_span_exact_match', {
          pointCount: points.length,
          spanDays: oldestAge,
        })
      : say('confidence_fresh_across_sellers_exact_match', {
          pointCount: points.length,
          sellerCount: sellers,
          oldestAgeDays: oldestAge,
        });
  } else {
    band = 'medium';
    because = `${points.length} prices across ${sellers} sellers.`;
    structuredBecause = say('confidence_price_count_across_sellers', {
      pointCount: points.length,
      sellerCount: sellers,
    });
  }

  return {
    band,
    because,
    structuredBecause,
    pointCount: points.length,
    distinctSellers: sellers,
    oldestPointAgeDays: oldestAge,
    identityConfidence: identity.confidence,
  };
}

function refuse(
  reason: RefusalReason,
  detail: string,
  /**
   * `detail` again, as a code and raw facts. A required parameter rather than
   * an optional one: a refusal that reaches a French screen with no structured
   * form is a blank line where a repair path should be, and the compiler is a
   * cheaper place to find that than the aisle.
   *
   * NOT derivable from `reason`. Several reasons carry more than one sentence
   * (`no_asking_price` has two repairs, `single_report` has two shapes) and one
   * sentence appears under two reasons, so the code is its own axis.
   */
  structuredDetail: StructuredText,
  identity: ProductIdentity | null,
  evidence: readonly PricePoint[],
  producedAt: string,
  /** Research prose, D-013. Carried as its own field so it never joins `detail`. */
  evidenceNote?: string,
): Refusal {
  const base: Refusal = {
    kind: 'refusal',
    reason,
    detail,
    structuredDetail,
    identity,
    evidence,
    producedAt,
  };
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
