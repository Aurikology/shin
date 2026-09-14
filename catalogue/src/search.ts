/**
 * Hybrid retrieval, three bands, and named neighbour rings.
 *
 * Decisions served here: 24 (text and vectors fused), 26 (three bands, not two),
 * 27 (rings, widened outward and named), 28 (Canada preferred, the rest still
 * reachable), 30 (a miss is recorded as a gap), and the raw material for 18
 * (confidence derived from several signals rather than a model's self-report).
 *
 * The fusion is Reciprocal Rank Fusion. It was chosen over adding weighted
 * scores because BM25 and cosine are not on the same scale and never will be:
 * BM25 is unbounded and corpus-dependent, cosine is bounded, and any fixed
 * weighting between them is a constant that silently rots as the catalogue
 * grows. RRF only reads positions, so it cannot rot that way.
 *
 * This module deliberately does NOT decide identity. It returns candidates and
 * the evidence behind each one. Deciding is stage 4's job, because identity also
 * depends on things the catalogue cannot see, like whether a barcode was present.
 */

import type { DatabaseSync } from 'node:sqlite';
import { toVecBlob } from './schema.ts';
import { recordGap, activeGapLog } from './gaps.ts';
import type { Embedder } from './embed.ts';
/*
 * The one word-family table, read by both sides of D-099 so that the rank here
 * and the guard in the identify stage cannot drift apart. It lives in
 * `identify/` because that package deliberately imports nothing from this one;
 * the file itself is a leaf with no imports of its own, so nothing but the table
 * crosses. `app/server.ts` already reaches across packages the same way.
 */
import { variantCarriedBy, variantTokens } from './variant-words.ts';

/** RRF's damping constant. 60 is the value from the original paper. */
const RRF_K = 60;
/**
 * How much a row the catalogue positively labels as the kind of thing this
 * search is about outranks one it does not. See `search`, and D-018.
 *
 * Worth about twenty rank positions at RRF_K = 60: a ring member fused at rank
 * 24 finishes above a non-member fused at rank 1, and a non-member at rank 1
 * still finishes above a ring member at rank 40. That is the size the live
 * catalogue asks for. "wireless headphones" put a lavalier microphone, a
 * "Florence Wireless Comvo" and an Xbox controller in slots three to five while
 * two real headphone rows sat at word ranks 24 and 34.
 */
const RING_BOOST = 1.5;

/**
 * How much a row sold here outranks an otherwise equal row that is not.
 *
 * A BOOST ON THE PREFERRED ROWS, NOT A DISCOUNT ON THE REST, since 2026-09-09.
 * The difference is invisible on a mixed pool and total on a uniform one, which
 * is D-019: scaling every row of an all-non-Canadian pool by the same 0.85
 * leaves the order it started in, and on the electronics path every pool is
 * that pool -- all 4,972,252 icecat rows carry the same `sold_in_canada`. The
 * preference now has something to bite on because the ring boost above puts the
 * right KIND of row in contention first, and it separates them from there.
 */
const CANADA_BOOST = 1.25;

/**
 * How far down the fused list the ring may be drawn from.
 *
 * Only a quarter of the catalogue arrived with a category, so the first row
 * that carries one is often well below the leader; capping the search at the
 * caller's `limit` is why a query whose whole first page is uncategorised drew
 * no ring at all. Twenty, because a row that neither retriever put in its own
 * top twenty is not evidence about what was asked for.
 */
const RING_SOURCE_WINDOW = 20;

/** How deep each retriever goes before fusion. Deep enough that a result ranked
 *  poorly by one and well by the other still survives to be fused. */
const RETRIEVE_N = 60;

/**
 * Band thresholds, and the measurement that replaced the first set of them.
 *
 * THE FIRST VERSION WAS WRONG AND THE CATALOGUE SAID SO. CONFIDENT_SIM and a
 * LEAD_MARGIN on cosine were chosen before there were 122,158 rows to look at.
 * Against the real catalogue, twenty probes (ten naming one specific product by
 * brand and size, ten naming a kind of thing where several rows are equally
 * right) came back like this:
 *
 *   top cosine       pinned 0.895 to 0.925   open 0.900 to 0.932
 *   cosine lead      pinned -0.023 to 0.014  open -0.010 to 0.034
 *   rank fusion lead pinned  1.000 to 1.115  open  1.015 to 1.189
 *   brand agreement  pinned  8 of 10          open  0 of 10
 *
 * The two distributions are the same on cosine and on rank fusion. Neither
 * number knows anything about whether the query pinned a product down, and a
 * margin on either is a coin toss dressed as a threshold. The one signal that
 * separated them cleanly is whether the leader agrees with a brand or a size
 * the caller actually supplied. `src/calibrate-band.ts` reruns this.
 *
 * So the band is not a similarity threshold any more. It is: did the caller pin
 * something down, does the leader match it, and is the leader alone in matching
 * it. That last clause is the R6-versus-R6-Mark-II rule and it survives intact;
 * it just tests agreement rather than a cosine gap, because agreement is the
 * thing that turned out to carry the information.
 *
 * A caller who pinned nothing (a typed search with no brand and no size) can
 * never be confident, and that is right rather than a limitation: a person who
 * types "peanut butter" is asking to see the peanut butters.
 *
 *  FLOOR_SIM   below this the catalogue is not claiming to have the thing at
 *              all, and the answer is neighbours rather than candidates. This
 *              one is a floor, not a discriminator, and the measurement above
 *              does not bear on it.
 *
 *              2026-09-05: the catalogue is now 5,182,591 rows and the vector
 *              index covers 437,574 of them -- 4.6% of the 4,972,252 electronics
 *              rows. A row with no vector has `similarity: null`, which is an
 *              ABSENT signal, not a measured low one. #band below used to read
 *              it with `?? 0`, which pushed every electronics row without a
 *              vector under this floor regardless of how well it actually
 *              matched, for a reason that had nothing to do with fit. Fixed the
 *              same day: the floor only fires on a similarity we actually have.
 */
const FLOOR_SIM = 0.72;

/*
 * The largest a category may be and still be a ring.
 *
 * Measured on the loaded catalogue: 6,591 tags, median size 1, and the ones that
 * name something a shopper would recognise run 5 (fresh oranges) to 325 (peanut
 * butters). The next tier up is not a kind of thing at all: beverages 4,114,
 * snacks 7,252, plant based foods 15,226. A thousand sat in the gap.
 *
 * RAISED FROM 1,000 TO 1,500 ON 2026-09-13, because a thousand was cutting
 * through the middle of the real distribution rather than through the gap in it.
 * Re-measured against catalogue.db over the 33,633 Canadian rows that carry a
 * category path: 3,113 of them (9.3%) end in a tag above the old thousand, and
 * they do not all deserve to be there.
 *
 *   1,001-1,500   1,807 rows (5.4%)   en:candies 1,104, en:breads 1,373,
 *                                     en:cheeses 1,251
 *   1,501-3,000     626 rows          en:confectioneries 2,030,
 *                                     en:cereals-and-their-products 2,737
 *   3,001+          680 rows          en:beverages 3,850, en:snacks 6,582,
 *                                     en:plant-based-foods 11,599
 *
 * The first band is the argument. Candies, breads and cheeses are kinds of
 * thing a shopper would say out loud, and at a thousand every candy, bread and
 * cheese in the catalogue got no swap at all -- D-068's cap protecting them from
 * their own category. The second and third bands are shelves by any reading.
 * 1,500 is the line between "en:cheeses" and "en:confectioneries", named here by
 * tag so the next person can re-run the count and argue with the data rather
 * than with the number.
 */
export const MAX_RING_TAG = 1500;

/**
 * Trailing tags that are not a kind of thing, stripped before the leaf is read.
 *
 * MEASURED 2026-09-13 over the same 33,633 Canadian rows with a category path:
 * 951 of them (2.83%) END in one of these, which means the tag a shopper would
 * recognise is sitting one position further in than `leaf_category` says.
 *
 *   en:groceries              832   (plus en:Groceries 41, same tag, stray caps)
 *   en:open-beauty-facts       62   source markers, not categories
 *   en:non-food-products        8
 *   en:open-products-facts      7   (both casings)
 *
 * A stored path really reads: en:sauces > en:mayonnaises > en:Groceries.
 *
 * WHY THIS IS NOT LEFT TO THE CAP. Without the strip, en:groceries is refused
 * for being shelf-sized, the walk steps to en:mayonnaises -- the TRUE leaf, a
 * perfect match -- and labels it `parent`, which the client then announces as a
 * looser swap. That is D-036 inverted: not a bad swap sold as good, but a good
 * swap sold as bad, and it is the same failure of the label not describing the
 * row. The cap cannot fix it because the cap's answer is always "not this one",
 * never "this was never a leaf".
 *
 * Kept as a short named list, not a heuristic, because every entry is a fact
 * about Open Food Facts' own export rather than a guess about language. The
 * `en:open-` prefix covers the source markers as a family (open-beauty-facts,
 * open-products-facts, open-pet-food-facts) since they arrive whenever a
 * sibling project is loaded and enumerating them one by one rots.
 */
export const NON_KIND_TRAILING_TAGS: readonly string[] = ['en:groceries', 'en:non-food-products'];

/** Source markers rather than categories. See NON_KIND_TRAILING_TAGS. */
const NON_KIND_TRAILING_PREFIX = 'en:open-';

/** Whether a tag is a trailing marker rather than a kind of thing. Lower-cased first. */
function isNonKindTag(tag: string): boolean {
  const t = tag.toLowerCase();
  return NON_KIND_TRAILING_TAGS.includes(t) || t.startsWith(NON_KIND_TRAILING_PREFIX);
}

/**
 * Which of the two permitted rings an answer came from.
 *
 * `leaf` is the product's own kind: other Gala apples, other creamy peanut
 * butters. `parent` is one step wider and is a WEAKER claim -- a Honeycrisp
 * offered because we have no other Gala -- so anything showing a parent-ring
 * row has to say so. There is no third value on purpose; see chooseRingTag.
 */
export type RingLevel = 'leaf' | 'parent';

/** The tag a ring was drawn at, and which of the two levels it is. */
export interface RingChoice {
  /** Lower-cased, as `product_category.tag` stores it. */
  readonly tag: string;
  readonly level: RingLevel;
  /** 0 for the leaf, 1 for the parent. Kept for the screen's "steps out" wording. */
  readonly distanceOut: number;
}

/** The two questions the walk asks about a tag. Supplied by whoever owns the db. */
export interface RingProbes {
  /**
   * How many products carry this tag. Only ever compared against MAX_RING_TAG,
   * so an implementation may stop counting at MAX_RING_TAG + 1.
   */
  readonly size: (tag: string) => number;
  /** Whether any product other than the one being answered about carries this tag. */
  readonly hasNeighbour: (tag: string) => boolean;
}

/**
 * WHICH RING, AND THE REASON THERE ARE ONLY TWO. (D-036, D-068.)
 *
 * Aurik, 2026-09-13, deciding what counts as a substitute: "if there are gala
 * apples Shin needs to compare prices with other gala apples in other stores.
 * however if there are no gala apples it can offer similar item of honey crisp
 * apples at nearby locations." Asked where that stops, he chose: the leaf
 * first; ONE step up to the parent only if the leaf yields nothing; and a
 * parent-level swap labelled as looser so the shopper knows.
 *
 * So this walks exactly two positions in `category_path`, never a third:
 *
 *   - path[len-1], the leaf -- the same tag as `leaf_category`. `en:apples`
 *     pairs a Gala with a Honeycrisp, which is the whole ask.
 *   - path[len-2], the parent, and only when the leaf came back empty.
 *
 * TRAILING NON-KINDS ARE STRIPPED FIRST (2026-09-13, measured: 2.83% of rows).
 * `en:sauces > en:mayonnaises > en:Groceries` has `en:Groceries` recorded as its
 * leaf, which is not a kind of thing and not what the shopper is holding. After
 * the strip the leaf is `en:mayonnaises` and the parent is `en:sauces`, which is
 * what both of them always were. See NON_KIND_TRAILING_TAGS for why this is not
 * left to the cap: the cap would refuse the junk tag and then mislabel the real
 * leaf as a parent, reporting a perfect match as a looser one.
 *
 * WHAT THIS REPLACES is a loop from the leaf outward to index 0 that `continue`d
 * past any tag over the cap and kept going. That loop could land on ANY tag in
 * the path, including one sitting in the middle of it, and that is the shape of
 * D-036: tortilla chips and Stem Ginger Oat Cookies share `en:whole-grains`,
 * which is nobody's leaf -- it is a mid-path tag the old walk was free to climb
 * to once the narrow tags came back empty. "Cheaper" then means "instead of
 * this", and it was lying. A mid-path tag can no longer be a ring at all.
 *
 * MAX_RING_TAG applies at BOTH levels, not just the leaf. A parent that turns
 * out to be a shelf of the whole shop returns nothing rather than a bad swap:
 * an empty answer is the honest one, and D-068 already settled that trade.
 *
 * A one-element path gets nothing. With a single tag there is no parent to step
 * to and no hierarchy to say the tag is a leaf rather than a shelf, and the
 * decision above is a decision about a path. Nothing is inferred from a bare
 * tag; an empty `category_path` is the same case for the same reason.
 */
export function chooseRingTag(
  categoryPath: readonly string[],
  probes: RingProbes,
): RingChoice | null {
  /*
   * Strip the trailing markers BEFORE anything reads a leaf. Only from the end:
   * a non-kind tag sitting in the middle of a path is not the leaf and not the
   * parent, so the position rule already ignores it, and removing it there would
   * shift the parent inward by one and quietly invent a wider ring than the
   * source data describes.
   */
  let end = categoryPath.length;
  while (end > 0 && isNonKindTag(categoryPath[end - 1])) end -= 1;

  // Fewer than two real tags is not a path, and rule 4 gives it no ring. A path
  // that was ENTIRELY markers lands here too, at end === 0, which is right: it
  // never said what the thing was.
  if (end < 2) return null;

  // product.category_path keeps whatever casing the source data carried, but
  // product_category is written lower-cased (schema.ts, rebuildCategories) so
  // that 522 case-variant spellings collapse into one row each instead of
  // splitting membership across the index. Lowered ONCE here so that both
  // probes and the caller's later SELECT all read the identical string: a
  // size check on one casing and a membership check on another is exactly how
  // a 1,600-member tag passes itself off as an 800-member ring.
  const levels: readonly { tag: string; level: RingLevel; distanceOut: number }[] = [
    { tag: categoryPath[end - 1].toLowerCase(), level: 'leaf', distanceOut: 0 },
    { tag: categoryPath[end - 2].toLowerCase(), level: 'parent', distanceOut: 1 },
  ];

  for (const level of levels) {
    if (probes.size(level.tag) > MAX_RING_TAG) continue;
    if (!probes.hasNeighbour(level.tag)) continue;
    return level;
  }
  return null;
}

export type Band = 'confident' | 'ambiguous' | 'miss';

export interface Candidate {
  readonly code: string;
  readonly name: string;
  readonly nameEn: string | null;
  readonly nameFr: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly leafCategory: string | null;
  readonly categoryPath: readonly string[];
  readonly allergens: readonly string[];
  readonly soldInCanada: boolean;
  /**
   * Which upstream database this row came from.
   *
   * Returned because the caller has to decide what KIND of thing this is before
   * the price engine will look at it, and the source is the strongest signal
   * available: every one of the 4,972,252 electronics rows carries the same
   * source, while only 27% of the grocery rows carry a category at all. Without
   * it the app was left inferring the source from the category path, which is a
   * guess, and a guess about which pricing rule to apply is how a product gets
   * judged by the wrong one.
   */
  readonly source: string;
  /** Item 25. The label's own short description. Null on most rows; not every source carries one. */
  readonly genericName: string | null;
  /** Item 25. Open Food Facts' 'a' to 'e' letter. Null when ungraded or not a food row. */
  readonly nutriscoreGrade: string | null;
  /** Item 25. Open Food Facts' 1 to 4 processing group. Null when ungraded. */
  readonly novaGroup: number | null;
  /** Item 25. Count of additive tags on the label. Null, never 0, when nobody recorded any. */
  readonly additivesN: number | null;
  /** Item 25. Free text off the ingredients list. */
  readonly ingredientsText: string | null;
  /** Everything a confidence calculation upstream might want. Nothing is hidden. */
  readonly signals: {
    readonly textRank: number | null;
    readonly vectorRank: number | null;
    readonly bm25: number | null;
    /** Cosine similarity in 0..1, derived from the stored L2 distance. */
    readonly similarity: number | null;
    readonly rrf: number;
    readonly brandAgrees: boolean | null;
    readonly sizeAgrees: boolean | null;
    /**
     * D-099. Does any of this row's three names carry the pinned variant?
     *
     * `null` when the caller pinned no variant, like the two flags above.
     * Optional rather than required because `alternatives.ts` builds a candidate
     * of its own for a row it never searched for, and a field it has no answer
     * to is not worth reaching into that file to write `null` into. Every
     * candidate this file returns carries it.
     */
    readonly variantAgrees?: boolean | null;
  };
}

export interface NeighbourRing {
  /** The category tag the ring was drawn at, e.g. "en:oranges". */
  readonly tag: string;
  /** Human-facing, already stripped of the language prefix and hyphens. */
  readonly label: string;
  /**
   * 0 is the item's own leaf category; 1 is its parent. Nothing else is
   * reachable now that chooseRingTag walks two positions and no more.
   */
  readonly distanceOut: number;
  /**
   * WHICH RING PRODUCED THIS, ADDED 2026-09-13 WITH THE TWO-LEVEL WALK.
   *
   * 'leaf' is other things of the same kind. 'parent' is one step wider and is
   * a looser claim -- the Honeycrisp offered because there is no other Gala --
   * and a screen showing it MUST say so. The field exists so that it can: a
   * parent-ring row presented as though it were a leaf-ring row is D-036 with
   * a smaller radius.
   */
  readonly ring: RingLevel;
  /**
   * The tag the ring came from. The same value as `tag`, under the name the
   * Alternative rows also use, so one screen reading both reads one name.
   */
  readonly ringTag: string;
  readonly members: readonly Candidate[];
}

export interface SearchQuery {
  readonly text?: string;
  readonly gtin?: string;
  readonly brand?: string;
  /**
   * The flavour or edition word off the pack, e.g. "Cherry" (D-099, 2026-09-14).
   *
   * Its own field rather than more words in `text` for the reason the defect
   * records: in `text` the variant is one token among five and loses to whatever
   * row repeats more of the other four, which is how a Cherry Coke Zero came
   * back as a plain Coke Zero. Asked separately it is the one question that
   * separates two cans of the same drink.
   */
  readonly variant?: string;
  /** In the catalogue's base units, grams or millilitres. */
  readonly sizeValue?: number;
  readonly sizeUnit?: string;
  readonly limit?: number;
  /**
   * Whether to run the vector arm at all. Default true.
   *
   * THIS EXISTS BECAUSE THE VECTOR ARM DOES NOT SCALE AND A TIMEOUT CANNOT SAVE
   * IT. Measured 2026-09-05 with 316,486 of 5,182,591 rows embedded: one k=60
   * KNN takes 735 ms and reads all 471 MB of the vector table, which is a
   * straight scan at 640 MB/s. Finished, that table is 5,182,591 x 384 x 4
   * bytes = 7.96 GB and the same scan is roughly twelve seconds.
   *
   * The part that makes it a correctness problem rather than a slowness one:
   * `node:sqlite` is synchronous. The KNN blocks the thread it runs on for its
   * whole duration, so racing it against a timer does nothing at all, and one
   * photo search would freeze every barcode lookup in the same process. The two
   * fixes are to make the scan cheap or to run it somewhere that blocking is
   * survivable. `service.ts` does the second by running search in a worker
   * thread; this flag does the first by not running it, which is the right
   * answer whenever the caller has a barcode or is only completing typed text.
   */
  readonly vectors?: boolean;
  /**
   * Which upstream databases the answer may come from, e.g. ['openfoodfacts'].
   * Omitted or empty means the whole catalogue, which is the old behaviour and
   * stays the default. The word arm honours it; the vector arm does not, and
   * #runFts says why.
   *
   * THIS IS FOR RELEVANCE, NOT SPEED. It cannot be faster: EXPLAIN QUERY PLAN
   * says `SCAN f VIRTUAL TABLE` then `SEARCH p USING INTEGER PRIMARY KEY`, so
   * the MATCH always drives and product is a rowid lookup. An index on `source`
   * could never be chosen, and the clause only rejects rows the FTS index has
   * already handed over.
   *
   * What it buys: on 1 of 12 words a supermarket and an appliance catalogue
   * share ("mixer"), the unrestricted top five put an electronics row, Cucina
   * Mixer, beside four bottles of drink mixer. That is the wrong KIND of thing
   * and the price engine would judge it by the wrong rule; Candidate.source
   * below is there for the same reason.
   *
   * WHAT IT COSTS, AND THIS IS THE PART TO READ BEFORE USING IT ON A NARROW
   * SOURCE. Restricting does not cost a flat millisecond. #textSearch keeps the
   * strict AND pass only if it returned ENOUGH_STRICT_HITS rows, and a filter
   * makes that pass return fewer rows for the same words, so it tips queries
   * into the expensive OR fallback that never used to tip. Measured 2026-09-05
   * over 11 multi-word queries, warmed, counting how many fell through:
   *
   *     all sources                   1 of 11 fell to OR,     99.9 ms total
   *     grocery (3 sources, 3.8%)     2 of 11,               668.5 ms
   *     openfoodfacts alone (2.4%)    2 of 11,               643.5 ms
   *     openpetfoodfacts (0.2%)      10 of 11,             1,095.7 ms
   *
   * The worst single case: "toner cartridge hp" costs 55 ms unrestricted, where
   * the strict pass fills up and answers, and 622 ms restricted to grocery,
   * where the strict pass finds nothing and the OR pass scores an 850,420-row
   * posting list one rowid lookup at a time. So the penalty scales with how
   * small a share of the matches the named sources hold, not with the filter.
   *
   * This is the OR fallback's own pathology and it predates this field, but
   * narrowing is what makes it common, and node:sqlite is synchronous, so those
   * 622 ms block every other lookup on the thread. The fallback is NOT skipped
   * when a restricted strict pass returns zero, because it sometimes earns its
   * keep there: "greek yogurt" against openpetfoodfacts has no strict hit and
   * the fallback finds a real yogurt in 6 ms. Telling the two apart wants the
   * size of the OR match set, which is a change with its own measurement, not a
   * rule to guess at.
   */
  readonly sources?: readonly string[];
}

export interface SearchResult {
  // Verified 2026-09-05 against his correction (docs/the-combined-pipeline.md,
  // decision 17): `band` is advisory metadata for confidence, never a gate on
  // `candidates`. `candidates` below is populated from the ranked list before
  // the band is even computed, and stays populated on 'ambiguous' and 'miss'
  // alike -- a caller has a top candidate to show whenever anything was found.
  // The one caller that was still treating 'miss' as "nothing to show" was
  // identify/src/identify.ts, fixed the same day; this file never did.
  readonly band: Band;
  readonly candidates: readonly Candidate[];
  /** Populated on a miss, and on an ambiguous result whose leader is weak. */
  readonly ring: NeighbourRing | null;
  readonly matchedBy: 'gtin' | 'hybrid' | 'none';
  /**
   * Whether every word the shopper typed appears in the word arm's results, or
   * only some of them.
   *
   * 'all' means every word appears together in at least one row of whatever was
   * searched. 'some' means no row holds them all, so everything returned matches
   * a SUBSET of the query. 'n/a' is a one-word query, where the strict and loose
   * passes are the same search and the distinction does not exist, and a barcode.
   *
   * Note it is NOT "the strict pass answered". That was the first version and it
   * was wrong: a strict pass returning fewer than ENOUGH_STRICT_HITS rows still
   * proves the words co-occur, and calling that a partial match mislabels the
   * ordinary case of a specific product in a small source.
   *
   * This was already computed inside #textSearch and thrown away, and throwing
   * it away had a cost. Restricted to grocery, "macbook pro" returned PROTEIN2O
   * and "wireless mouse" returned Mini Mouse, both reported as legitimate
   * restricted hits carrying only a 0.85 confidence penalty, because the one
   * word that survived was a real grocery word. `band` cannot see it: it reads
   * 'ambiguous' for those two exactly as it does for "peanut butter". Measured
   * over 10 grocery-route queries, this field separates them completely -- all
   * five genuine hits answered strictly, all five nonsense ones answered
   * loosely -- which is why routing.ts uses it to decide whether a narrowed
   * answer is trustworthy enough to suppress the whole-catalogue fallback.
   */
  readonly wordsMatched: 'all' | 'some' | 'n/a';
}

interface Row {
  code: string;
  name: string;
  name_en: string | null;
  name_fr: string | null;
  brands: string | null;
  quantity: string | null;
  size_value: number | null;
  size_unit: string | null;
  category_path: string;
  leaf_category: string | null;
  allergens: string;
  sold_in_canada: number;
  source: string;
  generic_name: string | null;
  nutriscore_grade: string | null;
  nova_group: number | null;
  additives_n: number | null;
  ingredients_text: string | null;
}

const SELECT_COLS = `code, name, name_en, name_fr, brands, quantity, size_value,
  size_unit, category_path, leaf_category, allergens, sold_in_canada, source,
  generic_name, nutriscore_grade, nova_group, additives_n, ingredients_text`;

/**
 * Strips "en:" and hyphens so a tag can be shown to a person (decision 27).
 *
 * Tags are stored lower-case by design (schema.ts, rebuildCategories): 522 of
 * them existed under more than one spelling, and folding case is what makes
 * them one row again. That leaves every label lower-case unless something
 * restores a capital, and whatever casing survived in the source data is a
 * typo signal, not a presentation choice -- an incoming tag is lower-cased
 * here again before anything is capitalised, so a stray "Snacks-And-Treats"
 * cannot leak internal capitals into the label. Only the FIRST letter is
 * capitalised, never every word: "Peanut butters" reads as a category name,
 * "Peanut Butters" reads as a proper noun this catalogue never asserted.
 */
export function labelForTag(tag: string): string {
  // Lower-cased FIRST: the language prefix itself can carry the same kind of
  // stray capital as the rest of the tag ("En:" as well as "en:Snacks"), and
  // the prefix regex only recognises the lower-cased form.
  const label = tag.toLowerCase().replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * FTS5 is a query language, and a shopper's words are not one.
 *
 * An apostrophe or a stray quote in a product name is a syntax error rather than
 * a bad match, which turns "Nature's Path" into a thrown exception in front of a
 * user. Every token is quoted and OR-ed, and a trailing prefix wildcard is added
 * so a half-typed word still matches.
 */
function ftsTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/["*()]/g, ' ')
    .split(/[^\p{L}\p{N}.]+/u)
    .filter((t) => t.length > 1);
}

/**
 * Every token quoted, the last one given a prefix wildcard so a half-typed word
 * still matches, joined by whichever operator the caller is trying.
 */
function joinFts(tokens: readonly string[], op: 'AND' | 'OR'): string {
  return tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(` ${op} `);
}

/**
 * How many strict hits are enough to skip the loose pass.
 *
 * Five, because the caller asks for five candidates by default and the ring
 * walk needs a candidate that carries a category path, which not every row has.
 * Below five it is worth paying for the wider net.
 */
const ENOUGH_STRICT_HITS = 5;

/** sqlite-vec stores L2 distance; with unit vectors this recovers cosine. */
function similarityFromDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - (distance * distance) / 2));
}

function normalizeBrand(b: string): string {
  return b.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** One row after fusion, with each retriever's own evidence still attached. */
interface Fused {
  row: Row;
  textRank: number | null;
  vectorRank: number | null;
  bm25: number | null;
  similarity: number | null;
  rrf: number;
}

/** Product names as something two strings can be compared on. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pathOf(row: Row): string[] {
  return JSON.parse(row.category_path) as string[];
}

/**
 * Is this row one of the things the ring names?
 *
 * A path question, not a leaf question, for the reason `ring` gives: nothing
 * has "citrus" as its deepest tag. The leaf is checked as well because a
 * handful of rows carry one that their own path does not repeat. Answered from
 * the row already in hand rather than from `product_category`, so ranking a
 * pool of sixty costs no queries at all.
 */
function inRing(row: Row, tag: string): boolean {
  const lower = tag.toLowerCase();
  if (row.leaf_category && row.leaf_category.toLowerCase() === lower) return true;
  return pathOf(row).some((t) => t.toLowerCase() === lower);
}

/**
 * THE SAME PRODUCT, LISTED TWICE, IS ONE ANSWER.
 *
 * D-019 asked for a dedupe by product code, and a dedupe by product code alone
 * is a no-op here: `product.code` is the PRIMARY KEY and the fusion map above
 * is already keyed on it, so two rows sharing a code cannot reach this point.
 * The duplicates the defect rows actually recorded are of two other kinds, and
 * both are handled here.
 *
 * ONE: the same barcode published in two forms, EAN-13 and the UPC-A a scanner
 * reports, which are different strings and the same product. `byGtin` has
 * always treated those as one; the ranked list did not.
 *
 * TWO: the same listing entered more than once with different barcodes, which
 * is what "kraft dinner" spending three of six slots on rows all named "Kraft
 * Dinner", no brand and no size, was. Nothing about the code can tell those
 * apart. Brand, name and size can, and SIZE IS IN THE KEY ON PURPOSE: the same
 * jar in 1 kg and 2 kg is two products and two prices, which is the whole
 * subject of this app, and collapsing them would be a worse defect than the one
 * being fixed.
 *
 * The list arrives sorted, so the row kept is always the best-ranked of its
 * group.
 */
function dedupeListings(ranked: readonly Fused[]): Fused[] {
  const seen = new Set<string>();
  const out: Fused[] = [];
  for (const m of ranked) {
    const barcode = m.row.code.replace(/\D/g, '').replace(/^0+/, '') || m.row.code;
    const name = normalizeName(m.row.name_en ?? m.row.name);
    const brand = m.row.brands ? normalizeBrand(m.row.brands) : '';
    const size =
      m.row.size_value !== null && m.row.size_unit
        ? `${m.row.size_value}${m.row.size_unit.toLowerCase()}`
        : (m.row.quantity ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const listing = `${brand}|${name}|${size}`;
    if (seen.has(barcode) || seen.has(listing)) continue;
    seen.add(barcode);
    seen.add(listing);
    out.push(m);
  }
  return out;
}

/** Does this row carry the brand the caller pinned? Null when none was pinned. */
function brandAgreesWith(row: Row, query: SearchQuery): boolean | null {
  return query.brand && row.brands
    ? normalizeBrand(row.brands).includes(normalizeBrand(query.brand)) ||
        normalizeBrand(query.brand).includes(normalizeBrand(row.brands.split(',')[0] ?? ''))
    : null;
}

/**
 * Does this row carry the variant the caller pinned? Null when none was pinned.
 *
 * D-099. All three names are read, not just `name`, because which of them
 * carries the flavour is a property of whoever typed the row in: the cherry can
 * is "Cherry-flavoured calorie-free cola" in English and "Coca-cola cerise" in
 * French, and the plain can beside it is "Coke Zero" in one name and nothing in
 * the others. Reading only `name` asks the question of the one field that
 * happens not to answer it.
 *
 * Every token has to be there, because a multi-word variant names one product:
 * a row carrying "zero sugar" out of "Zero Sugar Cherry" is the row this exists
 * to hold back. Substring rather than whole word, exactly as `brandAgreesWith`
 * does it, because variants come hyphenated and compounded and
 * "Cherry-flavoured" must answer to "cherry". Accent folded so that a query
 * reading "Cerise" reaches a row spelling it "cerise".
 *
 * A token is answered by its whole family and not only by itself, added
 * 2026-09-14: the rule and the word list are `catalogue/src/variant-words.ts`,
 * which the guard on the other side reads too. The row this signal was built
 * for writes its zero as "calorie-free" and carries `en:diet-cola-soft-drink`,
 * so a model reading the can's own "Zero Sugar" agreed with nothing. The
 * category path is read for that family only, and for the same reason the names
 * are read in all three languages: which field records the fact is an accident
 * of whoever typed the row in.
 */
function variantAgreesWith(row: Row, query: SearchQuery): boolean | null {
  if (variantTokens(query.variant).length === 0) return null;

  // The same three fields the pick pass is now shown, so that the rank and the
  // second opinion are answering the question off identical evidence.
  const text = [row.name, row.name_fr ?? '', row.generic_name ?? ''].join(' ');
  return variantCarriedBy(query.variant, text, pathOf(row));
}

/**
 * Does this row carry the size the caller pinned? Null when none was pinned.
 *
 * Within 5%: pack sizes are printed rounded and "500 ml" and "0.5 L" should not
 * read as different products (decision 19).
 */
function sizeAgreesWith(row: Row, query: SearchQuery): boolean | null {
  return query.sizeValue && row.size_value && query.sizeUnit === row.size_unit
    ? Math.abs(row.size_value - query.sizeValue) / query.sizeValue <= 0.05
    : null;
}

/**
 * HOW FAR A ROW ANSWERS WHAT THE CALLER PINNED, AS A RANK NO SCORE MAY CROSS.
 *
 * D-082, and it is a ranking bug rather than a labelling one. `brandAgrees` and
 * `sizeAgrees` were computed inside `rowToCandidate`, which runs on the rows
 * that have ALREADY survived the slice, so the two signals the band leans on
 * hardest could describe the answer and never shape it. Fine while the words
 * separate the rows. Useless in the one case a size pin exists for: a product
 * published in two sizes under word-for-word the same name, where BM25 has
 * nothing to tell them apart with and picks by accident.
 *
 * Measured on the live catalogue: "Cadbury Mini Eggs" pinned at 151 g put the
 * 151 g row at word rank 27, outside the cascade's ten-row window, with the
 * 90 g sibling leading on a name that is the same string. The pin was the only
 * evidence in the query that could separate them and it was spent on a label.
 *
 * A rank and not another multiplier, because the rule this has to hold is
 * absolute: a row agreeing on brand AND size never sorts below a row agreeing
 * on brand alone. A boost, however large, is a number some other boost can beat,
 * and RING_BOOST and CANADA_BOOST are already stacked here.
 *
 * A caller who pinned no size leaves every row UNKNOWN, so the order of a typed
 * search is untouched -- this can only fire where the caller supplied a size and
 * some row agrees with it.
 *
 * IT PROMOTES AND IT NEVER DEMOTES, AND THAT IS THE MEASURED SHAPE, NOT A
 * SOFTENING. The first version put a size-contradicting row in a tier BELOW a
 * row carrying no size at all, which is defensible right up until the pinned
 * size is wrong -- and on a multipack it routinely is. The eval's Danone
 * Danette is published as "4 x 100 g" and stored as 400 g; a reader that takes
 * 100 g off the front of the pack pins the unit size against a net size and
 * contradicts the correct row. Demoting on that lost two multipack rows that
 * had been landing top-1. A size that agrees is evidence FOR a row; a size that
 * disagrees is not evidence against one, because packs print per-unit sizes,
 * rounded sizes, and drained weights. So agreement lifts, disagreement costs
 * nothing, and the cascade's q2 still asks the same question unpinned so the
 * siblings come back as a set for decision 19.
 */
const PIN_AGREES = 1;
const PIN_UNKNOWN = 0;

/*
 * D-099 added the variant to this tier, on the pattern the comment above sets
 * out and for the same reason. A flavour that AGREES is evidence for a row, so
 * it lifts. A flavour that disagrees costs nothing, because the row may simply
 * never have had its French name or its description filled in, and three
 * quarters of this catalogue is missing one field or another. Demoting on a
 * silence would punish the sparse rows, which is the failure the size tier
 * already learned once.
 *
 * Summed rather than ranked ahead of the size, because the two pins answer
 * different questions and a row that agrees on both is better than a row that
 * agrees on either. Still absolute: no score below can cross a tier.
 */
function pinTier(row: Row, query: SearchQuery): number {
  const sizeTier =
    sizeAgreesWith(row, query) === true && brandAgreesWith(row, query) !== false
      ? PIN_AGREES
      : PIN_UNKNOWN;
  const variantTier = variantAgreesWith(row, query) === true ? PIN_AGREES : PIN_UNKNOWN;
  return sizeTier + variantTier;
}

function rowToCandidate(
  row: Row,
  signals: Candidate['signals'],
  query: SearchQuery,
): Candidate {
  const brandAgrees = brandAgreesWith(row, query);
  const sizeAgrees = sizeAgreesWith(row, query);
  const variantAgrees = variantAgreesWith(row, query);

  return {
    code: row.code,
    name: row.name,
    nameEn: row.name_en,
    nameFr: row.name_fr,
    brands: row.brands,
    quantity: row.quantity,
    sizeValue: row.size_value,
    sizeUnit: row.size_unit,
    leafCategory: row.leaf_category,
    categoryPath: JSON.parse(row.category_path) as string[],
    allergens: JSON.parse(row.allergens) as string[],
    soldInCanada: row.sold_in_canada === 1,
    source: row.source,
    genericName: row.generic_name,
    nutriscoreGrade: row.nutriscore_grade,
    novaGroup: row.nova_group,
    additivesN: row.additives_n,
    ingredientsText: row.ingredients_text,
    signals: { ...signals, brandAgrees, sizeAgrees, variantAgrees },
  };
}

/**
 * The eight-digit UPC-E form of a twelve-digit UPC-A, or null when the code
 * has none. Number system 0 or 1 only; the four standard zero-suppression
 * patterns. Exported for the test that pins the Coke Zero can.
 */
export function upcEOf(upca: string): string | null {
  if (!/^[01]\d{11}$/.test(upca)) return null;
  const ns = upca[0];
  const m = upca.slice(1, 6);
  const p = upca.slice(6, 11);
  const check = upca[11];
  let body: string | null = null;
  if (/^\d\d[012]00$/.test(m) && /^00\d{3}$/.test(p)) body = m.slice(0, 2) + p.slice(2) + m[2];
  else if (/^\d{3}00$/.test(m) && /^000\d\d$/.test(p)) body = m.slice(0, 3) + p.slice(3) + '3';
  else if (/^\d{4}0$/.test(m) && /^0000\d$/.test(p)) body = m.slice(0, 4) + p[4] + '4';
  else if (/^0000[5-9]$/.test(p)) body = m + p[4];
  return body ? ns + body + check : null;
}

/** The twelve-digit UPC-A a printed eight-digit UPC-E stands for, or null. */
export function upcAOf(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const [ns, d, check] = [upce[0], upce.slice(1, 7), upce[7]];
  const last = Number(d[5]);
  let body: string;
  if (last <= 2) body = d.slice(0, 2) + d[5] + '0000' + d.slice(2, 5);
  else if (last === 3) body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === 4) body = d.slice(0, 4) + '00000' + d[4];
  else body = d.slice(0, 5) + '0000' + d[5];
  return ns + body + check;
}

export class Catalogue {
  readonly #db: DatabaseSync;
  readonly #tagSizes = new Map<string, number>();
  readonly #embedder: Embedder;

  constructor(db: DatabaseSync, embedder: Embedder) {
    this.#db = db;
    this.#embedder = embedder;
  }

  /** Exact barcode lookup. Decision 15: a barcode is truth, so it short-circuits. */
  byGtin(gtin: string): Candidate | null {
    const normalized = gtin.replace(/\D/g, '');
    // A UPC-A read is the same product as its EAN-13 form with a leading zero,
    // and retailers publish both. Trying the padded and stripped forms costs
    // two indexed lookups and avoids a false "we have never seen this".
    const forms = new Set([normalized, normalized.padStart(13, '0'), normalized.replace(/^0+/, '')]);
    // And the eight-digit UPC-E a small can prints, which the catalogue keeps
    // as printed while the reader hands over the expanded UPC-A. Found
    // 2026-09-14 on a Coke Zero can: 0067000008191 missed, 06781901 is the row.
    const upce = upcEOf(normalized.replace(/^0+(?=\d{12}$)/, '').padStart(12, '0'));
    if (upce) forms.add(upce);
    if (/^[01]\d{7}$/.test(normalized)) {
      const upca = upcAOf(normalized);
      if (upca) { forms.add(upca); forms.add(upca.padStart(13, '0')); }
    }
    for (const form of forms) {
      if (!form) continue;
      const row = this.#db
        .prepare(`SELECT ${SELECT_COLS} FROM product WHERE code = ?`)
        .get(form) as Row | undefined;
      if (row) {
        return rowToCandidate(
          row,
          {
            textRank: null,
            vectorRank: null,
            bm25: null,
            similarity: 1,
            rrf: 1,
            brandAgrees: null,
            sizeAgrees: null,
            variantAgrees: null,
          },
          {},
        );
      }
    }
    return null;
  }

  /**
   * Text retrieval: all the words first, any of the words only if that failed.
   *
   * THE OR-ONLY VERSION WAS THE SLOWEST THING IN THE PRODUCT AND THE CATALOGUE
   * SAID SO. Joining every token with OR means a query containing one common
   * word matches an enormous row set, and `ORDER BY bm25` has to score all of
   * it before it can return five. Measured 2026-09-05 against 5,182,591 rows:
   *
   *   query                     OR      AND    same top hit
   *   toner cartridge hp     1485 ms  206 ms   yes
   *   samsung monitor         585 ms   64 ms   yes
   *   logitech wireless mouse 182 ms   10 ms   yes
   *   lait au chocolat         56 ms    8 ms   yes
   *   kraft peanut butter      25 ms  2.5 ms   yes
   *
   * AND was faster on all nine probes, between seven and thirty times, and
   * returned the same leader on every one of them that returned anything at
   * all. Two of the nine returned nothing under AND, "dyson vacuum cleaner" and
   * "coca cola 2l", because the catalogue's own name for those rows does not
   * contain every word the shopper used. Those are exactly the queries that
   * need the loose pass, and they are cheap ones, so the fallback costs little
   * and the recall is not traded away.
   */
  #textSearch(
    text: string,
    sources?: readonly string[],
  ): { hits: { row: Row; bm25: number }[]; wordsMatched: 'all' | 'some' | 'n/a' } {
    const tokens = ftsTokens(text);
    if (tokens.length === 0) return { hits: [], wordsMatched: 'n/a' };

    // One word: the strict and loose passes are the same search, so "only some
    // of the words matched" is not a thing that can happen and must not be
    // reported. Saying 'some' here would make every one-word grocery query --
    // "milk", "bread" -- look like weak evidence and send it to the fallback.
    if (tokens.length === 1) return { hits: this.#runFts(joinFts(tokens, 'OR'), sources), wordsMatched: 'n/a' };

    const strict = this.#runFts(joinFts(tokens, 'AND'), sources);
    if (strict.length >= ENOUGH_STRICT_HITS) return { hits: strict, wordsMatched: 'all' };

    // `wordsMatched` keys on whether the strict pass found ANYTHING, not on
    // whether it found enough to answer with. Those are different questions and
    // the first draft of this conflated them: "pro whey" has both words in one
    // row, so all the words plainly do match, but a single hit is under
    // ENOUGH_STRICT_HITS, so the loose pass answers and the result was being
    // labelled a partial match. That is a real query shape -- a specific product
    // in a small source -- and mislabelling it sends a good narrowed answer to
    // the whole-catalogue fallback.
    //
    // So: 'all' means every word the shopper typed appears together in at least
    // one row of whatever was searched, which is the question a caller deciding
    // whether to trust a narrowed answer actually has. Whether the ranked list
    // handed back came from the strict or the loose pass is a separate matter,
    // and the loose list is still the better one to return here.
    const loose = this.#runFts(joinFts(tokens, 'OR'), sources);
    return { hits: loose, wordsMatched: strict.length > 0 ? 'all' : 'some' };
  }

  /**
   * `sources` narrows the word arm to the upstream databases a route says the
   * answer can be in. It belongs in the SQL rather than in a filter over the
   * returned list, because the LIMIT is applied here: filtering afterwards
   * leaves you with fewer than RETRIEVE_N rows to fuse and rank, so the list
   * gets shorter instead of getting the next best rows. It does not make the
   * query faster and was never going to; SearchQuery.sources has the numbers.
   *
   * The vector arm deliberately does NOT take it. `product_vec` is a vec0 KNN
   * that cannot join to `product.source` inside the match, so restricting it
   * means overfetching and filtering, which silently returns a short list the
   * moment survivors fall below RETRIEVE_N and reads as a weak arm rather than
   * a truncated one. Left alone until someone measures it properly.
   */
  #runFts(match: string, sources?: readonly string[]): { row: Row; bm25: number }[] {
    const narrowed = sources && sources.length > 0;
    const clause = narrowed ? ` AND p.source IN (${sources.map(() => '?').join(',')})` : '';
    const rows = this.#db
      .prepare(
        `SELECT ${SELECT_COLS.split(', ').map((c) => `p.${c.trim()}`).join(', ')},
                bm25(product_fts, 4.0, 4.0, 2.0, 1.0) AS score
         FROM product_fts f
         JOIN product p ON p.rowid = f.rowid
         WHERE product_fts MATCH ?${clause}
         ORDER BY score
         LIMIT ?`,
      ).all(match, ...(narrowed ? sources : []), RETRIEVE_N) as unknown as (Row & { score: number })[];
    return rows.map((r) => ({ row: r, bm25: r.score }));
  }

  async #vectorSearch(text: string): Promise<{ row: Row; similarity: number }[]> {
    const vec = await this.#embedder.embedQuery(text);
    const hits = this.#db
      .prepare(
        `SELECT rowid, distance FROM product_vec
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      ).all(toVecBlob(vec), RETRIEVE_N) as unknown as { rowid: bigint | number; distance: number }[];
    if (hits.length === 0) return [];

    const ids = hits.map((h) => Number(h.rowid));
    const rows = this.#db
      .prepare(`SELECT rowid, ${SELECT_COLS} FROM product WHERE rowid IN (${ids.map(() => '?').join(',')})`).all(...ids) as unknown as (Row & { rowid: number })[];
    const byId = new Map(rows.map((r) => [Number(r.rowid), r]));

    const out: { row: Row; similarity: number }[] = [];
    for (const h of hits) {
      const row = byId.get(Number(h.rowid));
      if (row) out.push({ row, similarity: similarityFromDistance(h.distance) });
    }
    return out;
  }

  /**
   * The neighbour ring (decision 27).
   *
   * Drawn at the leaf, or at the parent if the leaf has nobody in it, and
   * nowhere else -- see chooseRingTag for why there is no third step. The tag
   * it stopped at comes back WITH which of the two levels it was, because the
   * screen has to say which ring this is: "we do not have that one, here are
   * other oranges" is a different sentence from "here are other fruits", and
   * showing the second while saying the first is the kind of small lie that
   * costs the whole product's credibility. `ring` is that distinction as a
   * field, so no screen has to infer it from `distanceOut`.
   */
  ring(categoryPath: readonly string[], want: number, exclude?: string): NeighbourRing | null {
    const found = this.#ringTag(categoryPath, exclude);
    if (!found) return null;
    const rows = this.#db
      .prepare(
        `SELECT ${SELECT_COLS.split(', ').map((c) => `p.${c.trim()}`).join(', ')}
           FROM product_category pc
           JOIN product p ON p.rowid = pc.rowid_ref
           WHERE pc.tag = ? AND p.code != ?
           ORDER BY p.sold_in_canada DESC, (p.size_value IS NOT NULL) DESC, p.name
           LIMIT ?`,
      ).all(found.tag, exclude ?? '', want) as unknown as Row[];
    if (rows.length === 0) return null;
    return {
      tag: found.tag,
      label: labelForTag(found.tag),
      distanceOut: found.distanceOut,
      ring: found.level,
      ringTag: found.tag,
      members: rows.map((r) =>
        rowToCandidate(
          r,
          {
            textRank: null,
            vectorRank: null,
            bm25: null,
            similarity: null,
            rrf: 0,
            brandAgrees: null,
            sizeAgrees: null,
            variantAgrees: null,
          },
          {},
        ),
      ),
    };
  }

  /**
   * The tag the ring would be drawn at, and which level it is, without paying
   * for its members.
   *
   * Split out of `ring` on 2026-09-09 so that RANKING can ask the same question
   * the heading asks and get the same answer (D-018). One walk, one cap, one
   * membership rule: if these two ever disagreed, a result could be reordered
   * by a ring the screen then refused to name.
   */
  #ringTag(categoryPath: readonly string[], exclude?: string): RingChoice | null {
    /*
     * THE WALK ITSELF NOW LIVES IN chooseRingTag, AND IT IS TWO LEVELS DEEP.
     *
     * What used to be here was a loop from the leaf outward to index 0 that
     * skipped any tag over the cap and kept climbing. That is how a mid-path
     * tag like `en:whole-grains` -- nobody's leaf -- became a ring and paired
     * ginger oat cookies with tortilla chips (D-036). It is now unreachable:
     * only path[len-1] and path[len-2] are ever asked about.
     *
     * This method supplies the two probes and nothing else, so the RANKING
     * caller and the heading caller still ask one question and get one answer
     * (D-018). #tagSize stays memoized per worker, which is why the lowering
     * happens once inside chooseRingTag rather than at each call site.
     */
    return chooseRingTag(categoryPath, {
      size: (tag) => this.#tagSize(tag),
      /*
       * Membership is a path question, not a leaf question: a row is IN
       * `en:citrus` if `en:citrus` appears anywhere in its path, which is what
       * product_category stores. Matching the parent against other rows' LEAF
       * would always come back empty, because nothing has "citrus" as its
       * deepest tag, and the parent step would be dead code that looked alive.
       */
      hasNeighbour: (tag) =>
        this.#db
          .prepare(
            `SELECT 1 AS found
             FROM product_category pc
             JOIN product p ON p.rowid = pc.rowid_ref
             WHERE pc.tag = ? AND p.code != ?
             LIMIT 1`,
          ).get(tag, exclude ?? '') !== undefined,
    });
  }

  /**
   * How big a category is, counted only as far as the answer needs.
   *
   * Cached, because the ring walk asks about the same handful of tags
   * constantly. Capped, because the only question ever asked of this number is
   * whether it exceeds MAX_RING_TAG, and counting a category out to its true
   * size to learn that it is "more than a thousand" is wasted work at this
   * scale: the widest tag in the catalogue holds 3,910,054 rows, and counting
   * those index entries was most of the 823 ms a search for "toner cartridge
   * hp" cost after the text half had already been fixed.
   *
   * Stopping at the cap plus one gives the comparison everything it needs and
   * nothing it does not. The stored value is therefore a floor, not a
   * population, which is safe here and would not be if anything ever displayed
   * it. Nothing does.
   */
  #tagSize(tag: string): number {
    const hit = this.#tagSizes.get(tag);
    if (hit !== undefined) return hit;
    const row = this.#db
      .prepare(
        `SELECT count(*) AS n FROM (
           SELECT 1 FROM product_category WHERE tag = ? LIMIT ${MAX_RING_TAG + 1}
         )`,
      )
      .get(tag) as { n: number };
    this.#tagSizes.set(tag, row.n);
    return row.n;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    if (query.gtin) {
      const hit = this.byGtin(query.gtin);
      if (hit) return { band: 'confident', candidates: [hit], ring: null, matchedBy: 'gtin', wordsMatched: 'n/a' };
      /*
       * A BARCODE WE HAVE NEVER SEEN IS A GAP WHATEVER THE WORDS DO NEXT.
       *
       * Until 2026-09-09 the gap was recorded only when the whole search
       * missed. When a barcode arrived with text -- the camera read a code and
       * the label gave words -- and the words resolved to something plausible,
       * the search banded `ambiguous`, nothing was written, and the single
       * most actionable miss the log can hold went unlogged: a real product,
       * a real code, not in the catalogue. `what-to-price` reads this log.
       * Keyed on the gtin alone, so the text arm's own miss, if it comes, is
       * recorded separately rather than merged with it.
       */
      this.#recordGap({ gtin: query.gtin });
    }

    const text = query.text?.trim();
    if (!text) {
      this.#recordGap(query);
      return { band: 'miss', candidates: [], ring: null, matchedBy: 'none', wordsMatched: 'n/a' };
    }

    const [textResult, vecHits] = await Promise.all([
      Promise.resolve(this.#textSearch(text, query.sources)),
      query.vectors === false ? Promise.resolve([]) : this.#vectorSearch(text),
    ]);

    // Fuse on rank, keeping each retriever's own evidence attached so the caller
    // can see WHY something ranked where it did.
    const merged = new Map<string, Fused>();

    const textHits = textResult.hits;
    textHits.forEach((h, i) => {
      merged.set(h.row.code, {
        row: h.row,
        textRank: i + 1,
        vectorRank: null,
        bm25: h.bm25,
        similarity: null,
        rrf: 1 / (RRF_K + i + 1),
      });
    });
    vecHits.forEach((h, i) => {
      const existing = merged.get(h.row.code);
      if (existing) {
        existing.vectorRank = i + 1;
        existing.similarity = h.similarity;
        existing.rrf += 1 / (RRF_K + i + 1);
      } else {
        merged.set(h.row.code, {
          row: h.row,
          textRank: null,
          vectorRank: i + 1,
          bm25: null,
          similarity: h.similarity,
          rrf: 1 / (RRF_K + i + 1),
        });
      }
    });

    /*
     * Decision 28: Canada preferred, never a hard filter.
     *
     * FIXED 2026-09-05. This used to be a tiebreak on equal RRF, and two
     * fused rank lists essentially never produce equal RRF, so the preference
     * fired approximately never. With the vector arm switched off it is
     * provably dead: a single rank list gives every row a distinct 1/(k+rank),
     * so the comparison above always returns first. The visible result was that
     * "peanut butter" answered with an Indian beauty-database row carrying no
     * brand, no size and sold_in_canada = 0, ahead of every Canadian jar.
     *
     * FIXED AGAIN 2026-09-09, D-019. The replacement was a 0.85 DISCOUNT on
     * every row not sold here, and a discount applied to every row in the pool
     * is an identity: multiply the whole list by the same number and it comes
     * back in the order it went in. On the electronics path that is every pool,
     * because all 4,972,252 icecat rows carry the same `sold_in_canada`, so the
     * second version of this preference fired no more often than the first.
     * "wireless headphones" answered with six non-Canadian rows while a Jabra
     * and an AfterShokz sat at word ranks 34 and 24.
     *
     * It is a boost on the preferred rows now, and it works because it is no
     * longer alone: RING_BOOST puts the right KIND of row in contention, and
     * this separates them from there. Preferred, not required -- a non-Canadian
     * row of the right kind still beats a Canadian one of the wrong kind, and
     * the explicit tiebreak below only decides rows that are otherwise equal,
     * which is the case the 2026-09-05 version wrongly assumed was the only one.
     */
    const baseScore = (m: { rrf: number; row: { sold_in_canada: number } }) =>
      m.row.sold_in_canada === 1 ? m.rrf * CANADA_BOOST : m.rrf;
    // The pin tier leads, and nothing the scores do can cross it. See pinTier.
    const byScore =
      (score: (m: Fused) => number) =>
      (a: Fused, b: Fused) =>
        pinTier(b.row, query) - pinTier(a.row, query) ||
        score(b) - score(a) ||
        b.row.sold_in_canada - a.row.sold_in_canada;

    const pool = dedupeListings([...merged.values()].sort(byScore(baseScore)));

    /*
     * D-018: THE RING WAS COMPUTED ON EVERY SEARCH AND THROWN AWAY.
     *
     * It is the only signal in this function that knows what a row IS rather
     * than which words it happens to contain, and it was used for nothing but a
     * heading. "peanut butter" ranked peanut butter cups, an RXBAR and a KIND
     * bar above the jar; "wireless headphones" ranked a microphone, a "Florence
     * Wireless Comvo" and an Xbox controller above both headphone rows. In
     * every one of those the ring was drawn, correctly, at the category the
     * shopper meant, and then discarded.
     *
     * Drawn here from the pool rather than from the answer, and BEFORE the
     * slice, because the ranking is what it is meant to change. The tag comes
     * from #ringTag, so it obeys MAX_RING_TAG exactly as the heading does
     * (D-068): a tag holding a shelf of the whole shop is not a kind of thing
     * and does not get to reorder anything.
     *
     * A row with no category is not demoted. Three quarters of the catalogue
     * has no category, and "we were never told" is not evidence that this is
     * the wrong kind of thing. Only rows the data positively places inside the
     * ring are lifted.
     */
    const ringSource = pool.slice(0, RING_SOURCE_WINDOW).find((m) => pathOf(m.row).length > 0);
    const rankingTag = ringSource ? this.#ringTag(pathOf(ringSource.row), ringSource.row.code)?.tag : undefined;
    /*
     * A ROW THE SHOPPER NAMED EXACTLY IS ALSO OF THE KIND, WHATEVER ITS TAGS SAY.
     *
     * Three quarters of the catalogue has no category, so a category boost with
     * no guard demotes every unlabelled row, and the unlabelled row is often the
     * best answer in the list. Asking for "cara cara oranges" when the catalogue
     * holds a row called exactly that, uncategorised, and two labelled navel
     * oranges, must not answer with the navel oranges: the ring is evidence
     * about a KIND, and the shopper's own words are evidence about a THING.
     *
     * This is also what carries D-018's own example. "peanut butter" has three
     * rows named exactly that, one of them the Kraft jar that was landing at
     * five behind a peanut butter cup and an RXBAR, and none of the three
     * carries a category at all.
     *
     * ITEM 32. This only ever compared against name_en (falling back to the
     * display name, which itself prefers name_en). A shopper typing the
     * row's own French name exactly, on a row with no category, could never
     * reach this escape hatch, because name_fr was never read here at all.
     * Measured against 40 real bilingual Canadian rows queried by their own
     * name_fr: 28 of 40 top-1 before this line read name_fr too, 34 of 40
     * after. Both names are checked because decision 20 asks for a French
     * query to reach an English row and the other way round, and a shopper
     * naming the thing exactly is evidence regardless of which of the row's
     * two names they happened to type.
     */
    const asked = normalizeName(text);
    // Membership is settled once, not inside the comparator, so a pool of sixty
    // costs sixty path reads rather than one per comparison.
    const ofTheKind = new Set(
      pool
        .filter((m) =>
          (rankingTag ? inRing(m.row, rankingTag) : false) ||
          normalizeName(m.row.name_en ?? m.row.name) === asked ||
          (m.row.name_fr !== null && normalizeName(m.row.name_fr) === asked))
        .map((m) => m.row.code),
    );
    const ranked =
      ofTheKind.size > 0
        ? [...pool].sort(byScore((m) => baseScore(m) * (ofTheKind.has(m.row.code) ? RING_BOOST : 1)))
        : pool;

    const limit = query.limit ?? 5;
    const candidates = ranked
      .slice(0, limit)
      .map((m) =>
        rowToCandidate(
          m.row,
          {
            textRank: m.textRank,
            vectorRank: m.vectorRank,
            bm25: m.bm25,
            similarity: m.similarity,
            rrf: m.rrf,
            brandAgrees: null,
            sizeAgrees: null,
            variantAgrees: null,
          },
          query,
        ),
      );

    const band = this.#band(candidates, textResult.wordsMatched);

    // A ring is attached whenever the leader is not good enough to stand alone,
    // so the screen never has to make a second round trip to have something to
    // show (decisions 26, 27, 48).
    // Drawn from the best ranked candidate that actually has a category, not
    // from the leader alone. Only a quarter of the catalogue arrived with a
    // category and duplicate listings of the same product are common, so the
    // leader is very often an uncategorised twin of a row two places below it
    // that knows exactly what it is. Reading only the leader is why asking for
    // a kind of orange the catalogue does not stock returned no other oranges,
    // when it had 367 of them.
    // Read over RING_SOURCE_WINDOW rather than over the answer alone, so the
    // heading and the ranking above are drawn from the same row. A query whose
    // whole first page is uncategorised used to get no ring at all.
    const withPath = ranked.slice(0, RING_SOURCE_WINDOW).find((m) => pathOf(m.row).length > 0);
    const ring =
      band === 'confident'
        ? null
        : this.ring(withPath ? pathOf(withPath.row) : [], 3, candidates[0]?.code);

    if (band === 'miss') this.#recordGap(query);

    return { band, candidates, ring, matchedBy: candidates.length > 0 ? 'hybrid' : 'none', wordsMatched: textResult.wordsMatched };
  }

  #band(candidates: readonly Candidate[], wordsMatched: 'all' | 'some' | 'n/a' = 'n/a'): Band {
    const top = candidates[0];
    if (!top) return 'miss';
    const topSim = top.signals.similarity;

    // 2026-09-05: `?? 0` used to sit here. Null means no vector exists for this
    // row (95% of electronics, per the coverage measured the same day), not
    // that the row scored a measured 0 against the query. Coalescing the two
    // meant an unvectored row could never clear the floor on any rank but
    // first, no matter how well its brand and size actually agreed. The floor
    // is a claim about a similarity we hold, so it only applies when we hold one.
    if (topSim !== null && topSim < FLOOR_SIM && top.signals.textRank !== 1) return 'miss';

    /*
     * A ROW THAT MATCHED SOME OF THE WORDS IS NOT A CONFIDENT ANSWER, however
     * well it agrees with the brand and size the caller pinned.
     *
     * The loose OR pass exists so that a query with one wrong word still finds
     * the row, and it is documented above as producing rows that match a
     * subset. This function never read that signal: with brand and size
     * pinned, a 225 g Kraft ANYTHING alone in agreeing on both read
     * `confident` on a row that matched one word of "kraft dinner original
     * macaroni". `restrictedSearch` already trusts `wordsMatched` for exactly
     * this class of result; the band now does too, and `ambiguous` is what
     * lets "not this?" offer the list.
     *
     * BELOW THE FLOOR CHECK, NOT ABOVE IT. The first placement of this line
     * sat before the similarity floor, and a nonsense query -- which still
     * collects vector neighbours as candidates -- stopped banding `miss` and
     * stopped being recorded as a gap. A subset match demotes `confident`;
     * it must never promote `miss`. The gap test caught it.
     */
    if (wordsMatched === 'some') return 'ambiguous';

    // How much of what the caller pinned down this row matches. Null means the
    // caller did not supply it, which is different from supplying it and being
    // contradicted, and is scored differently: an absent brand cannot earn
    // confidence and does not destroy it either.
    const agreement = (c: Candidate) =>
      (c.signals.brandAgrees === true ? 1 : 0) + (c.signals.sizeAgrees === true ? 1 : 0);
    const contradicted = (c: Candidate) =>
      c.signals.brandAgrees === false || c.signals.sizeAgrees === false;

    const lead = agreement(top);
    if (lead === 0) return 'ambiguous';
    if (contradicted(top)) return 'ambiguous';

    // Alone in matching, or not confident. Two rows that both carry the brand
    // and the size the label showed are two rows the user has to choose
    // between, however far apart their cosines happen to fall.
    const rivals = candidates.slice(1).filter((c) => agreement(c) >= lead).length;
    if (rivals > 0) return 'ambiguous';

    return 'confident';
  }

  /** Decision 30: a miss is recorded, and nothing typed is promoted automatically. */
  #recordGap(query: SearchQuery): void {
    try {
      /*
       * Writes to its own small file, never to the catalogue. The seam the
       * comment below left open is now closed: the serving connection stays
       * read-only, and the miss still gets written down. `recordGap` opens its
       * own log lazily, rolls repeats up by barcode and by normalised text, and
       * is documented never to throw, so the catch here guards a promise rather
       * than an expectation, and the counters below stay as the proof.
       */
      recordGap({ gtin: query.gtin, queryText: query.text });
    } catch (err) {
      /*
       * A gap that cannot be written must never become a search that cannot
       * answer. This threw in front of a user on 2026-09-05: the serving
       * connection is opened read-only so a request can never damage the
       * catalogue, recording a miss is a write, and so the one path that most
       * needed to say "we have not seen this one" said "attempt to write a
       * readonly database" instead. The finding is worth keeping; it is not
       * worth the screen.
       *
       * Counted rather than swallowed, so "gaps are not being logged" is a
       * visible fact instead of a silence. The proper home is a separate small
       * writable file for findings, which is a seam left open here rather than
       * a reason to give a serving process write access to 3.47 GB.
       */
      this.#localGapsDropped += 1;
      this.#localGapsDroppedWhy = err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * Misses that could not be written down, and why.
   *
   * These read through to the miss log's own counters rather than counting
   * this class's failed writes, because this class no longer performs the
   * write. Left as plain fields they would have been frozen at zero forever:
   * `recordGap` never throws, so the catch above can no longer fire, and a
   * field named "gaps dropped" that cannot leave zero does not read as an
   * absence of evidence, it reads as an assurance that nothing is being lost,
   * given by code that is no longer able to notice. Same shape as a guard that
   * returns success after crashing before it checked anything.
   *
   * `#localGapsDropped` still counts the one failure that is genuinely this
   * class's own, `recordGap` being unreachable at all, so no failure has
   * nowhere to land. The two are summed.
   */
  get gapsDropped(): number {
    return this.#localGapsDropped + (activeGapLog()?.dropped ?? 0);
  }

  get gapsDroppedWhy(): string {
    return this.#localGapsDroppedWhy || (activeGapLog()?.droppedWhy ?? '');
  }

  #localGapsDropped = 0;
  #localGapsDroppedWhy = '';
}
