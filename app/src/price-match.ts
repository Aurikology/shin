/**
 * Which Canadian banner will match a cheaper price, and what the shopper has
 * to show to get it. Policy only. No price, no verdict, no wiring.
 *
 * WHY THIS EXISTS. `docs/shipped-scanners-2026-09-20.md` section 1 reads the
 * apps a Canadian shopper actually has on their phone and finds that price
 * matching is the behaviour Flipp and Reebee are built on, and that Shin says
 * nothing about it. The verdict tiers end at walk away, which is a judgment
 * rather than a thing to do. "Show this at the till here, you can match up to
 * four" is a thing to do, and the only missing piece is a table of who matches
 * whom under what limit.
 *
 * WHAT THIS FILE DELIBERATELY IS NOT.
 *
 *   It is not wired. Nothing imports it, no route serves it, no screen reads
 *   it. Adding a line to the verdict is Jamin's call and it has not been made,
 *   so this ships inert and is switched on by somebody else, later, on his
 *   word. Deleting this file changes no behaviour, which is the test of the
 *   claim.
 *
 *   It is not a price. Jamin's rule 3, verbatim: "THE PRICE SHOULD NOT COME
 *   FROM US." Nothing here produces, estimates, adjusts or infers an amount.
 *   The two amounts it touches arrive from the caller, are compared once to
 *   answer "is there anything to match", and are never combined, differenced
 *   or rendered. FreshCo and Giant Tiger beat a competitor by one cent and
 *   this file does NOT compute that cent: it reports `beatsByOneCent: true`
 *   and the till does the arithmetic. If a future edit here computes a number
 *   a user would read as a price, the edit is the bug.
 *
 *   It is not a savings claim. Hard rule 2: no savings claim until it is
 *   measured. No field says how much anybody saves, and a test asserts no
 *   difference appears in the answer.
 *
 *   It is not copy. This app localises: `public/js/voice.js` and
 *   `voice-fr.js` hold everything Shin says, `public/js/ui-strings.js` holds
 *   the chrome, both keyed by locale. A server module that returned an English
 *   sentence would be a French interface with an English instruction in it. So
 *   every answer carries a `messageKey` and a `messageVars` bag of numbers and
 *   codes, and the copy for those keys is written in the two string tables
 *   when somebody wires this up. The only English in the exported data is a
 *   retailer's own registered name (`displayName`, a proper noun that is not
 *   translated) and `source` / `sourceNote`, which are provenance for whoever
 *   reads this file and are never shown.
 *
 * HARD RULE 3, the aggression points at the price, the store or the brand and
 * never at the user. A price match is the purest form of that available: it
 * hands the shopper the store's own policy and points it back at the store. No
 * reason code here blames the person. `offer_not_cheaper` is a fact about two
 * numbers, and `unknown_banner` is this file admitting what it does not have.
 *
 * SOURCES, all from that research doc, none from code:
 *   moneyGenius, "Canadian price match policies"
 *     https://moneygenius.ca/blog/canadian-price-match-policies
 *   Wealth Awesome, "No Frills price match policy"
 *     https://wealthawesome.com/no-frills-price-match-policy
 *   money.ca, "Stores where you can price match in Canada"
 *     https://money.ca/managing-money/budgeting/stores-where-you-can-price-match-in-canada
 *
 * THE ONE DISAGREEMENT, left unresolved on purpose. moneyGenius describes No
 * Frills as matching "within 7 days of purchase"; Wealth Awesome describes the
 * four-item at-the-till rule and mentions no refund window at all. Both agree
 * on four items and on digital-or-print proof. So the at-the-till rule is
 * encoded as policy and the 7-day claim sits in `unconfirmed`, where the
 * answer function cannot reach it. Resolving that needs No Frills' own
 * published policy, which nobody in this repo has read.
 */

/** The markets a policy applies in. Quebec is separate because Maxi is. */
export type Market = 'CA' | 'CA-QC';

/**
 * Who counts as a competitor at this banner.
 *
 * `null` means the sources did not say, which is not the same as `none`.
 */
export type CompetitorScope =
  | 'same_trade_area'   // No Frills: the competitor must be in the same trade area.
  | 'approved_list'     // Superstore: an approved competitor list.
  | 'local'             // Giant Tiger: a local competitor.
  | 'own_online'        // Walmart: walmart.ca and nobody else.
  | 'none'              // No competitor match policy at all.
  | null;

/** What the shopper has to show. `null` where no source stated a requirement. */
export type ProofRequired = 'competitor_ad_at_till' | null;

/** What a time window is counted from. `null` where the source did not say. */
export type WindowKind = 'after_purchase' | null;

/**
 * A claim one source makes and another does not support.
 *
 * These are carried so the disagreement is visible to the next reader, and
 * they are never read by `priceMatchAdvice`. An unconfirmed number must not be
 * able to become an instruction to a shopper standing at a till.
 */
export interface UnconfirmedClaim {
  /** The field this claim would set if it were confirmed. */
  readonly field: string;
  readonly value: number | string | boolean;
  /** Who claims it. */
  readonly source: string;
  /** Who describes the same policy without it. */
  readonly disagreesWith: string;
}

export interface PriceMatchPolicy {
  /** The stable id. Lower snake case, used as a key everywhere. */
  readonly banner: string;
  /** The retailer's own name. A proper noun, not translated, not a sentence. */
  readonly displayName: string;
  readonly matchesCompetitors: boolean;
  /** Walmart Canada ended competitor matching and still matches walmart.ca. */
  readonly matchesOwnOnline: boolean;
  /** Price-matched items per transaction. `null` where no limit was stated. */
  readonly itemLimit: number | null;
  readonly proof: ProofRequired;
  /** Forms the proof may take. Empty where no proof requirement was sourced. */
  readonly proofFormats: readonly ('print' | 'digital')[];
  readonly windowDays: number | null;
  readonly windowKind: WindowKind;
  /** The till beats the competitor by a cent rather than equalling it. */
  readonly beatsByOneCent: boolean;
  readonly competitorScope: CompetitorScope;
  /** Same brand, size and weight, or "identical items". `null` if unsourced. */
  readonly identicalItemRequired: boolean | null;
  readonly market: Market;
  /** Provenance for a reader of this file. Never shown to anybody. */
  readonly source: string;
  /** A note a reader of this file needs. Never shown to anybody. */
  readonly sourceNote: string | null;
  readonly unconfirmed: readonly UnconfirmedClaim[];
}

const MONEYGENIUS = 'moneyGenius, Canadian price match policies (moneygenius.ca), read 2026-09-20';
const WEALTH_AWESOME = 'Wealth Awesome, No Frills price match policy (wealthawesome.com), read 2026-09-20';
const MONEY_CA = 'money.ca, Stores where you can price match in Canada, read 2026-09-20';

function freeze(policy: PriceMatchPolicy): PriceMatchPolicy {
  Object.freeze(policy.proofFormats);
  Object.freeze(policy.unconfirmed);
  for (const claim of policy.unconfirmed) Object.freeze(claim);
  return Object.freeze(policy);
}

/**
 * The eleven retailers section 1 of the research doc names, and only those.
 *
 * Amazon appears in that doc's own table grouped with the non-matchers. It is
 * absent here because a shopper does not stand inside Amazon, and the banner
 * argument is the shop the person is physically in. Adding it costs one row if
 * a later reader disagrees.
 *
 * EVERY UNKNOWN IS `null`. Superstore almost certainly wants the ad shown too,
 * and FreshCo's fourteen days is almost certainly counted from a purchase, but
 * "almost certainly" written into a table becomes a fact by the third time
 * somebody reads it, and a shopper turned away at a till because Shin invented
 * a rule is worse than a shopper told Shin does not know that part.
 */
export const PRICE_MATCH_POLICIES: readonly PriceMatchPolicy[] = Object.freeze([
  freeze({
    banner: 'no_frills',
    displayName: 'No Frills',
    matchesCompetitors: true,
    matchesOwnOnline: false,
    itemLimit: 4,
    proof: 'competitor_ad_at_till',
    proofFormats: ['print', 'digital'],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: 'same_trade_area',
    identicalItemRequired: true,
    market: 'CA',
    source: `${WEALTH_AWESOME}; ${MONEYGENIUS}`,
    sourceNote: 'Both sources agree on four items and on print-or-digital proof shown at the till.',
    unconfirmed: [
      {
        field: 'windowDays',
        value: 7,
        source: MONEYGENIUS,
        disagreesWith: `${WEALTH_AWESOME}, which describes the at-the-till rule and names no refund window`,
      },
    ],
  }),
  freeze({
    banner: 'real_canadian_superstore',
    displayName: 'Real Canadian Superstore',
    matchesCompetitors: true,
    matchesOwnOnline: false,
    itemLimit: 4,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: 'approved_list',
    identicalItemRequired: null,
    market: 'CA',
    source: MONEYGENIUS,
    sourceNote: 'The approved competitor list itself has not been read; only that one exists.',
    unconfirmed: [],
  }),
  freeze({
    banner: 'maxi',
    displayName: 'Maxi',
    matchesCompetitors: true,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: null,
    identicalItemRequired: true,
    market: 'CA-QC',
    source: MONEYGENIUS,
    sourceNote: 'Quebec banner. The sources say identical items and say nothing about a limit.',
    unconfirmed: [],
  }),
  freeze({
    banner: 'freshco',
    displayName: 'FreshCo',
    matchesCompetitors: true,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: 14,
    // The source says "within 14 days" and does not say fourteen days of what.
    windowKind: null,
    beatsByOneCent: true,
    competitorScope: null,
    identicalItemRequired: null,
    market: 'CA',
    source: MONEYGENIUS,
    sourceNote: 'Beats the competitor by one cent. What the fourteen days is counted from is unstated.',
    unconfirmed: [],
  }),
  freeze({
    banner: 'giant_tiger',
    displayName: 'Giant Tiger',
    matchesCompetitors: true,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: true,
    competitorScope: 'local',
    identicalItemRequired: null,
    market: 'CA',
    source: MONEY_CA,
    sourceNote: null,
    unconfirmed: [],
  }),
  freeze({
    banner: 'best_buy',
    displayName: 'Best Buy',
    matchesCompetitors: true,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: 30,
    windowKind: 'after_purchase',
    beatsByOneCent: false,
    competitorScope: null,
    identicalItemRequired: null,
    market: 'CA',
    source: MONEY_CA,
    sourceNote: 'Electronics rather than grocery, and the window is stated as days of purchase.',
    unconfirmed: [],
  }),
  freeze({
    banner: 'walmart',
    displayName: 'Walmart',
    matchesCompetitors: false,
    matchesOwnOnline: true,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: 'own_online',
    identicalItemRequired: null,
    market: 'CA',
    source: `${MONEYGENIUS}; ${MONEY_CA}`,
    sourceNote:
      'Ended competitor matching; still matches walmart.ca. One source dates the exit to 2020, the other gives no date, so no date is recorded.',
    unconfirmed: [],
  }),
  freeze({
    banner: 'metro',
    displayName: 'Metro',
    matchesCompetitors: false,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: 'none',
    identicalItemRequired: null,
    market: 'CA',
    source: MONEYGENIUS,
    sourceNote: null,
    unconfirmed: [],
  }),
  freeze({
    banner: 'food_basics',
    displayName: 'Food Basics',
    matchesCompetitors: false,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: 'none',
    identicalItemRequired: null,
    market: 'CA',
    source: MONEYGENIUS,
    sourceNote: null,
    unconfirmed: [],
  }),
  freeze({
    banner: 'sobeys',
    displayName: 'Sobeys',
    matchesCompetitors: false,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: 'none',
    identicalItemRequired: null,
    market: 'CA',
    source: MONEYGENIUS,
    sourceNote:
      'Carries a 100% satisfaction guarantee, which is a refund promise and not a price match. Recorded so a later reader does not mistake one for the other.',
    unconfirmed: [],
  }),
  freeze({
    banner: 'costco',
    displayName: 'Costco',
    matchesCompetitors: false,
    matchesOwnOnline: false,
    itemLimit: null,
    proof: null,
    proofFormats: [],
    windowDays: null,
    windowKind: null,
    beatsByOneCent: false,
    competitorScope: 'none',
    identicalItemRequired: null,
    market: 'CA',
    source: MONEYGENIUS,
    sourceNote: null,
    unconfirmed: [],
  }),
]);

/**
 * How a written store name maps onto a banner id.
 *
 * The names arriving here come from a store list built on OpenStreetMap
 * (`src/stores.ts`) and from whatever Gemini calls a seller, so neither side
 * is under this repo's control and neither is going to spell things the same
 * way twice. The map is deliberately small and literal: an alias is added when
 * a real name is seen, never because a variant seems plausible. A name that is
 * not here returns `null`, and `null` is answered honestly rather than guessed
 * at, because guessing the banner is guessing the policy.
 */
const ALIASES: Readonly<Record<string, string>> = Object.freeze({
  nofrills: 'no_frills',
  no_frills: 'no_frills',
  realcanadiansuperstore: 'real_canadian_superstore',
  real_canadian_superstore: 'real_canadian_superstore',
  superstore: 'real_canadian_superstore',
  rcss: 'real_canadian_superstore',
  maxi: 'maxi',
  maxietcie: 'maxi',
  freshco: 'freshco',
  gianttiger: 'giant_tiger',
  giant_tiger: 'giant_tiger',
  bestbuy: 'best_buy',
  best_buy: 'best_buy',
  walmart: 'walmart',
  walmartca: 'walmart',
  walmartsupercentre: 'walmart',
  walmartsupercenter: 'walmart',
  metro: 'metro',
  metroplus: 'metro',
  foodbasics: 'food_basics',
  food_basics: 'food_basics',
  sobeys: 'sobeys',
  costco: 'costco',
  costcowholesale: 'costco',
});

const BY_BANNER: ReadonlyMap<string, PriceMatchPolicy> = new Map(
  PRICE_MATCH_POLICIES.map((p) => [p.banner, p]),
);

/** Lower case, strip anything that is not a letter or a digit. */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The banner id for a written store name, or `null` if this file has no row.
 *
 * `null` for an empty string, whitespace, `null` and `undefined` too. A store
 * name the phone never captured and a store nobody has a policy for are the
 * same answer to the shopper: we do not know.
 */
export function normaliseBanner(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const k = key(name);
  if (!k) return null;
  return ALIASES[k] ?? (BY_BANNER.has(k) ? k : null);
}

/** The policy row for a banner id or a written name, or `null`. */
export function policyFor(name: string | null | undefined): PriceMatchPolicy | null {
  const banner = normaliseBanner(name);
  return banner ? (BY_BANNER.get(banner) ?? null) : null;
}

/**
 * Why a match is not possible. Never a reason that blames the shopper.
 *
 * The two that must not be collapsed are `unknown_banner` (this file has no
 * row) and `banner_does_not_match_competitors` (it has a row and the row says
 * no). Collapsing them turns a gap in Shin's table into a claim about a
 * retailer, which is the kind of wrong that gets somebody turned away at a
 * till while holding a phone that told them otherwise.
 */
export type NoMatchReason =
  | 'price_unusable'
  | 'unknown_banner'
  | 'unknown_seller'
  | 'same_banner'
  | 'offer_not_cheaper'
  | 'banner_does_not_match_competitors'
  | 'banner_matches_own_online_only';

/** What the shopper has to satisfy. Present only when a match is possible. */
export interface MatchRequirements {
  readonly itemLimit: number | null;
  readonly proof: ProofRequired;
  readonly proofFormats: readonly ('print' | 'digital')[];
  readonly windowDays: number | null;
  readonly windowKind: WindowKind;
  readonly beatsByOneCent: boolean;
  readonly competitorScope: CompetitorScope;
  readonly identicalItemRequired: boolean | null;
}

export interface PriceMatchAnswer {
  readonly possible: boolean;
  /** The resolved banner id, or `null` when it was not recognised. */
  readonly banner: string | null;
  /** The resolved seller, lower cased, or `null` when none was given. */
  readonly offerSeller: string | null;
  readonly reason: NoMatchReason | null;
  readonly policy: PriceMatchPolicy | null;
  readonly requirements: MatchRequirements | null;
  /**
   * A key for the copy tables, never a sentence. Whoever wires this writes the
   * English in `public/js/ui-strings.js` (or `voice.js`, if the line is Shin
   * talking rather than a label) and the French beside it.
   */
  readonly messageKey: string;
  /** Numbers and codes for that copy to interpolate. No prose. */
  readonly messageVars: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PriceMatchQuestion {
  /** The shop the person is standing in, however it was written. */
  readonly banner: string | null | undefined;
  /** The price in front of them, in cents. Handed in, never computed here. */
  readonly bannerPriceCents: number | null | undefined;
  readonly offer: {
    readonly seller: string | null | undefined;
    readonly priceCents: number | null | undefined;
  };
}

/** Cents are integers. Anything else is unusable rather than rounded. */
function usableCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function no(
  reason: NoMatchReason,
  messageKey: string,
  banner: string | null,
  offerSeller: string | null,
  policy: PriceMatchPolicy | null,
  messageVars: Record<string, string | number | boolean | null> = {},
): PriceMatchAnswer {
  return Object.freeze({
    possible: false,
    banner,
    offerSeller,
    reason,
    policy,
    requirements: null,
    messageKey,
    messageVars: Object.freeze({ banner, seller: offerSeller, ...messageVars }),
  });
}

/**
 * Can this shopper ask this till to match this cheaper offer, and what do they
 * need in their hand.
 *
 * THE ORDER OF THE CHECKS IS A DECISION, not an accident of writing:
 *
 *   1. The prices, because an unusable number breaks every later answer and
 *      reporting anything else would be reporting it confidently.
 *   2. The banner, because "we do not know this shop" is the honest answer
 *      before any claim about a retailer is made.
 *   3. The seller.
 *   4. Cheaper, because a policy the shopper cannot use is noise.
 *   5. The policy itself.
 *
 * Step 4 sits after step 2 on purpose: a shopper in an unknown shop gets told
 * the table is short rather than told their offer was fine, which is the
 * difference between a gap somebody can fill and a gap nobody can see.
 */
export function priceMatchAdvice(question: PriceMatchQuestion): PriceMatchAnswer {
  const rawSeller = typeof question.offer?.seller === 'string' ? question.offer.seller.trim() : '';
  const seller = rawSeller ? rawSeller.toLowerCase() : null;
  const bannerId = normaliseBanner(question.banner);

  if (!usableCents(question.bannerPriceCents) || !usableCents(question.offer?.priceCents)) {
    return no('price_unusable', 'price_match.price_unusable', bannerId, seller, null);
  }

  const policy = bannerId ? (BY_BANNER.get(bannerId) ?? null) : null;
  if (!policy) {
    return no('unknown_banner', 'price_match.unknown_banner', null, seller, null);
  }

  if (!seller) {
    return no('unknown_seller', 'price_match.unknown_seller', bannerId, null, policy);
  }

  const sellerBanner = normaliseBanner(seller);
  const sameBanner = sellerBanner !== null && sellerBanner === policy.banner;

  /*
   * A comparison, not a calculation. The two amounts came from outside and
   * neither one is changed, combined or reported as a difference. This is the
   * only place the module looks at a number at all.
   */
  if (question.offer.priceCents >= question.bannerPriceCents) {
    return no('offer_not_cheaper', 'price_match.not_cheaper', bannerId, seller, policy);
  }

  if (sameBanner) {
    // Walmart is the exception: its own online price is the one thing it does
    // match, so the same-banner case is the yes rather than the no.
    if (policy.matchesOwnOnline) {
      return Object.freeze({
        possible: true,
        banner: policy.banner,
        offerSeller: seller,
        reason: null,
        policy,
        requirements: requirementsOf(policy),
        messageKey: 'price_match.own_online',
        messageVars: Object.freeze({
          banner: policy.banner,
          seller,
          itemLimit: policy.itemLimit,
          windowDays: policy.windowDays,
        }),
      });
    }
    return no('same_banner', 'price_match.same_banner', bannerId, seller, policy);
  }

  if (!policy.matchesCompetitors) {
    // Walmart said no to competitors but yes to itself, and the shopper is
    // better served by being pointed at walmart.ca than by a flat no.
    if (policy.matchesOwnOnline) {
      return no('banner_matches_own_online_only', 'price_match.own_online_only', bannerId, seller, policy);
    }
    return no('banner_does_not_match_competitors', 'price_match.no_policy', bannerId, seller, policy);
  }

  return Object.freeze({
    possible: true,
    banner: policy.banner,
    offerSeller: seller,
    reason: null,
    policy,
    requirements: requirementsOf(policy),
    messageKey: 'price_match.possible',
    messageVars: Object.freeze({
      banner: policy.banner,
      seller,
      itemLimit: policy.itemLimit,
      proof: policy.proof,
      windowDays: policy.windowDays,
      beatsByOneCent: policy.beatsByOneCent,
      competitorScope: policy.competitorScope,
    }),
  });
}

function requirementsOf(policy: PriceMatchPolicy): MatchRequirements {
  return Object.freeze({
    itemLimit: policy.itemLimit,
    proof: policy.proof,
    proofFormats: policy.proofFormats,
    windowDays: policy.windowDays,
    windowKind: policy.windowKind,
    beatsByOneCent: policy.beatsByOneCent,
    competitorScope: policy.competitorScope,
    identicalItemRequired: policy.identicalItemRequired,
  });
}
