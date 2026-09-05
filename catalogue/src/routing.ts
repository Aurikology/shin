/**
 * Which slice of the catalogue a search should run against, and how sure that
 * choice is.
 *
 * THE LEVER, AND IT IS NOT THE ONE THIS FILE WAS BUILT EXPECTING. The
 * catalogue holds 5,182,591 rows. 4,972,252 of them are electronics (source
 * `icecat`), all one source. 122,101 are grocery (the export pack's own
 * definition, `export-pack.ts`: `sold_in_canada = 1 AND source =
 * 'openfoodfacts'`). Knowing a shopper is buying groceries was written up here
 * as the biggest speed lever the app had. Measured on 2026-09-05, it is not a
 * speed lever at all, in either of the two forms it can take:
 *
 *   - Narrowing the RESULT, which is what this file did first: no change, by
 *     construction. The scan has already happened.
 *   - Narrowing the QUERY, via `SearchQuery.sources`: also no gain, and on
 *     some shapes a large loss. EXPLAIN QUERY PLAN shows the FTS MATCH always
 *     drives and `product` is a rowid lookup, so the other 4.97M rows were
 *     never scanned to begin with and no index on `source` could ever be
 *     chosen. Worse, narrowing tips queries into search.ts's OR fallback:
 *     "toner cartridge hp" costs 55 ms unrestricted and 622 ms restricted to
 *     grocery. Over 11 multi-word queries, 1 fell through unrestricted against
 *     10 restricted to the smallest source.
 *
 * What narrowing the query IS for is relevance, and that reason is good enough
 * on its own: 96% of the catalogue is the wrong kind of thing, and it can fill
 * the entire retrieval window on a word two catalogues share. See
 * `SearchQuery.sources` in search.ts for the full numbers.
 *
 * THE RULE THIS FILE OBEYS, same shape as category-map.ts's: a route may
 * REORDER or NARROW what gets searched. It must never decide what the
 * product IS. `decideRoute` returns a guess about the PERSON, not a verdict
 * about the PRODUCT -- category-map.ts alone decides that, from the product's
 * own tags, and does not consult this file. A prior that decided the product
 * would tell a shopper holding a laptop that it is groceries because that is
 * what they usually buy, which is exactly the wrong verdict the priority-1
 * calibration rule exists to prevent. Routing can make the search faster or
 * slower; it cannot make a wrong answer look right.
 *
 * THE SAFETY RULES, all enforced in code below, not left as comments:
 *   - a barcode is never restricted (`restrictedSearch` checks `query.gtin`
 *     before it looks at the route at all);
 *   - a restricted search that finds nothing falls back to the whole
 *     catalogue rather than reporting a miss it did not actually check for;
 *   - a restricted answer is handed back with a confidence adjustment BELOW
 *     1, never above, because narrowing can hide the true best match and
 *     finding a match despite narrowing is not evidence the narrowing was
 *     right.
 *
 * THE HONEST LIMIT, which moved but did not go away. `SearchQuery.sources`
 * now exists and the word arm honours it, so `restrictedSearch` narrows the
 * query as well as the result. The VECTOR arm still does not take it: a vec0
 * KNN cannot join to `product.source` inside the match, so restricting it
 * means overfetching and filtering, which returns a silently short list the
 * moment survivors fall below RETRIEVE_N. Both arms still retrieve a fixed
 * `RETRIEVE_N = 60`, and that constant is still not exported, so the pool cap
 * here is a copy that has to be kept in step by hand.
 */

import type { Candidate, Catalogue, SearchQuery, SearchResult } from './search.ts';

/** The five kinds of thing the price engine knows, per the app's own category-map.ts. */
export type CategoryGuess = 'grocery' | 'tech' | 'used' | 'furniture' | 'produce';

const ALL_CATEGORIES: readonly CategoryGuess[] = ['grocery', 'tech', 'used', 'furniture', 'produce'];

/**
 * One thing the person has actually scanned, identified by which category the
 * catalogue thinks it landed in (i.e. category-map.ts's own verdict, or the
 * app's equivalent, run once at scan time -- this module does not compute it).
 */
export interface ScanEvent {
  readonly category: CategoryGuess;
}

export interface RouteInput {
  /** What the person said once, at setup. Self-reported, never re-asked. */
  readonly setupAnswer?: CategoryGuess;
  /** What the person has actually scanned, oldest first. */
  readonly history?: readonly ScanEvent[];
}

export interface Route {
  /**
   * The categories to search. All five means "no narrowing": either there is
   * no signal yet, or the signal is not strong enough to act on. One category
   * means the route is confident enough to restrict to it alone. This module
   * never returns a partial ladder (e.g. top two of five) -- restrict fully or
   * not at all is a judgement call, not a measured optimum.
   */
  readonly categories: readonly CategoryGuess[];
  /** 0..1, how much of the weighted evidence (setup + decayed history) agrees. */
  readonly confidence: number;
  /** Plain words, safe to show, saying why this route was picked. */
  readonly why: string;
}

/**
 * THE FADING FUNCTION. Its shape is a judgement call, not measured -- there is
 * no dataset yet of setup answers versus real shopping behaviour to fit it to.
 * What it has to do, per the brief, is make history outweigh a stale setup
 * answer as history accumulates, without letting one or two stray scans flip
 * the route.
 *
 * The setup answer counts as SETUP_WEIGHT votes, once. Each scan counts as one
 * vote that decays toward zero, by half every HISTORY_HALF_LIFE more-recent
 * scans, so a long history of a different category eventually outweighs a
 * setup answer that no longer describes the person, while a single contrary
 * scan (weight 1, versus the setup's 3) does not.
 */
const SETUP_WEIGHT = 3;
const HISTORY_HALF_LIFE = 6;

/**
 * Below this share of the weighted evidence, the lead category is not a
 * strong enough signal to narrow on -- searching everything and losing no
 * recall beats a fast wrong guess (priority 1: calibration over speed).
 * The number is a judgement call, not measured.
 */
const ROUTE_CONFIDENCE_FLOOR = 0.6;

function decayedWeight(rankFromMostRecent: number): number {
  return Math.pow(0.5, rankFromMostRecent / HISTORY_HALF_LIFE);
}

/**
 * Decides which category (or categories, when the answer is "everything") to
 * search, and how confident that decision is. Never throws; an empty input
 * simply comes back as "search everything, confidence 0."
 */
export function decideRoute(input: RouteInput): Route {
  const weights = new Map<CategoryGuess, number>();
  const add = (category: CategoryGuess, weight: number): void => {
    weights.set(category, (weights.get(category) ?? 0) + weight);
  };

  if (input.setupAnswer) add(input.setupAnswer, SETUP_WEIGHT);

  const history = input.history ?? [];
  history.forEach((event, i) => {
    const rankFromMostRecent = history.length - 1 - i;
    add(event.category, decayedWeight(rankFromMostRecent));
  });

  const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
  if (total === 0) {
    return {
      categories: ALL_CATEGORIES,
      confidence: 0,
      why: 'No setup answer and no scan history. Nothing to route on, so search everything.',
    };
  }

  const ranked = [...weights.entries()].sort((a, b) => b[1] - a[1]);
  const [topCategory, topWeight] = ranked[0] as [CategoryGuess, number];
  const confidence = topWeight / total;

  if (confidence < ROUTE_CONFIDENCE_FLOOR) {
    return {
      categories: ALL_CATEGORIES,
      confidence,
      why: `Best guess is ${topCategory}, but only ${(confidence * 100).toFixed(0)}% of the weighted evidence agrees. Searching everything rather than narrowing on a weak lead.`,
    };
  }

  return {
    categories: [topCategory],
    confidence,
    why: `${topCategory} carries ${(confidence * 100).toFixed(0)}% of the weighted evidence (setup answer plus recency-weighted scan history).`,
  };
}

/*
 * Mirrors the tag patterns in app/src/category-map.ts (read, not imported:
 * catalogue is the lower layer and app depends on it, not the other way
 * round, so importing app/src from here would invert that). If
 * category-map.ts's patterns change, these should be re-checked against it --
 * that duplication is a disclosed cost of staying on the correct side of the
 * layer boundary, not an oversight.
 */
const PRODUCE_TAG = /(^|:)fresh-|(^|:)(fruits|vegetables|legumes)$/;
const FURNITURE_TAG = /(^|:)(furniture|chairs|tables|sofas|couches|beds|mattresses|desks|wardrobes|bookcases)$/;

/**
 * Sources measured 2026-09-05 (docs/the-combined-pipeline.md): icecat
 * 4,972,252, openfoodfacts 122,154, openbeautyfacts 48,943, openproductsfacts
 * 26,948, openpetfoodfacts 12,294. `icecat`'s own mixed sections
 * (health-beauty, food-beverages, pet-care) and `openproductsfacts`'s mixed
 * general-merchandise rows are NOT folded into these sets: doing that
 * correctly needs the section-path lookup category-map.ts already owns, and
 * duplicating that table here risks it drifting out of sync with the one the
 * price engine actually prices by. The cost is disclosed, not hidden: a
 * grocery item that happens to live inside icecat's or openproductsfacts's
 * mixed sections will not be favoured by a grocery route, though it is still
 * reachable through the fallback below.
 */
const GROCERY_SOURCES = new Set(['openfoodfacts', 'openpetfoodfacts', 'openbeautyfacts']);
const TECH_SOURCES = new Set(['icecat']);

/**
 * Whether a candidate belongs to a route category, checked by source first
 * (the strongest signal search.ts itself says it has -- see the doc comment
 * on Candidate.source) and by tag for the two categories that arrive mixed
 * into other sources' data.
 *
 * `used` has no signal anywhere in this catalogue: it is a listing condition,
 * not a product source or a shelf tag, so a route to `used` alone can never
 * match a candidate here. That is correct, not a bug -- it means a route to
 * `used` always falls through to the whole-catalogue fallback in
 * `restrictedSearch`, which is the safe behaviour for a category this module
 * has no way to recognise.
 */
function candidateInCategory(candidate: Candidate, category: CategoryGuess): boolean {
  const tags = [...candidate.categoryPath, ...(candidate.leafCategory ? [candidate.leafCategory] : [])].map((t) =>
    t.toLowerCase(),
  );
  const anyTag = (re: RegExp) => tags.some((t) => re.test(t));

  // Checked before source, same order category-map.ts uses: produce and
  // furniture arrive embedded inside other sources' data, so the tag has to
  // win before the source gets a vote.
  if (anyTag(PRODUCE_TAG)) return category === 'produce';
  if (anyTag(FURNITURE_TAG)) return category === 'furniture';

  switch (category) {
    case 'grocery':
      return GROCERY_SOURCES.has(candidate.source);
    case 'tech':
      return TECH_SOURCES.has(candidate.source);
    case 'used':
    case 'furniture':
    case 'produce':
      return false;
    default:
      return false;
  }
}

/**
 * search.ts's own `RETRIEVE_N` (the fixed retrieval size per arm inside
 * `#textSearch` / `#vectorSearch`) is not exported. It is 60 as of this
 * writing (search.ts line ~32). Asking `Catalogue.search` for a `limit`
 * larger than this buys nothing: candidates beyond it were never fetched from
 * the database in the first place, restriction or not. This is the ceiling
 * on how big a pool `restrictedSearch` can filter from.
 */
const SEARCH_POOL_CAP = 60;

/**
 * The upstream databases a route can be narrowed to inside the query, or
 * undefined when it cannot be narrowed at all.
 *
 * Only categories recognised BY SOURCE can go in. `produce` and `furniture`
 * are recognised by tag and arrive embedded inside other sources' data, and
 * `used` has no signal anywhere in this catalogue, so a route containing any
 * of the three has to retrieve from everything and be filtered afterwards --
 * narrowing the query there would drop the very rows the tag check is looking
 * for. One unmappable category disqualifies the whole route, because the
 * sources are a union and a missing member silently loses its rows.
 */
function sourcesForRoute(route: Route): readonly string[] | undefined {
  const sources = new Set<string>();
  for (const category of route.categories) {
    if (category === 'grocery') {
      for (const s of GROCERY_SOURCES) sources.add(s);
    } else if (category === 'tech') {
      for (const s of TECH_SOURCES) sources.add(s);
    } else {
      return undefined;
    }
  }
  return sources.size > 0 ? [...sources] : undefined;
}

/**
 * A restriction can only ever hide candidates that were already retrieved; it
 * cannot prove the hidden one was wrong. Applied only when a restriction was
 * actually used (see `restricted` below) -- never when the route searched
 * everything or fell back to everything, because in both of those cases the
 * answer is exactly what an unrestricted search would have given anyway. The
 * number is a judgement call, not measured: a restricted hit keeps 85% of the
 * confidence the same candidate would earn from a full search.
 */
const RESTRICTED_CONFIDENCE_PENALTY = 0.85;

export interface RoutedSearchResult {
  readonly result: SearchResult;
  /** True only when the returned candidates were actually filtered down to the route. */
  readonly restricted: boolean;
  /** True when restriction found nothing and this is the unrestricted fallback instead. */
  readonly fellBack: boolean;
  /**
   * Multiply onto whatever confidence the caller was already going to report
   * for this answer. 1 means "no change from routing." Below 1 only when
   * `restricted` is true.
   */
  readonly confidenceAdjustment: number;
}

/**
 * Runs a search narrowed to `route`, falling back to the whole catalogue when
 * the narrowed set is empty. Never narrows a barcode lookup.
 *
 * HOW THE NARROWING WORKS, in two stages, because one of them cannot do the
 * whole job:
 *
 * 1. When every category on the route is one this catalogue recognises by
 *    source, `SearchQuery.sources` narrows the word arm INSIDE the query. This
 *    matters for correctness, not speed: 96% of the catalogue is electronics,
 *    so a grocery query whose matches are dominated by icecat rows can fill the
 *    whole 60-row retrieval window with them, and stage 2 would then filter
 *    everything away and fall back to exactly the wrong-kind answers it was
 *    trying to avoid. Filtering a pool cannot reach a row the pool never held.
 * 2. The pool is still fetched at `SEARCH_POOL_CAP` and filtered by category
 *    afterwards, because `produce` and `furniture` are recognised by tag and
 *    live inside other sources' data, which no source filter can express.
 *
 * Stage 1 is skipped entirely for a route containing produce, furniture or
 * used; `sourcesForRoute` says why. It is not free either: narrowing makes the
 * strict FTS pass return fewer rows, which tips some queries into search.ts's
 * expensive OR fallback. `SearchQuery.sources` carries the measured numbers.
 */
export async function restrictedSearch(
  catalogue: Catalogue,
  query: SearchQuery,
  route: Route,
): Promise<RoutedSearchResult> {
  // RULE: a barcode is never restricted. It is exact; a restriction can only
  // turn a correct answer into a miss.
  if (query.gtin) {
    const result = await catalogue.search(query);
    return { result, restricted: false, fellBack: false, confidenceAdjustment: 1 };
  }

  // "Search everything" is the route itself, not a restriction to undo.
  if (route.categories.length >= ALL_CATEGORIES.length) {
    const result = await catalogue.search(query);
    return { result, restricted: false, fellBack: false, confidenceAdjustment: 1 };
  }

  const requestedLimit = query.limit ?? 5;
  const sources = sourcesForRoute(route);
  const pooled = await catalogue.search({
    ...query,
    limit: SEARCH_POOL_CAP,
    // The caller's own `sources` wins if it set one; routing only fills a gap.
    sources: query.sources ?? sources,
  });

  const inRoute = (candidate: Candidate) => route.categories.some((category) => candidateInCategory(candidate, category));
  const filtered = pooled.candidates.filter(inRoute).slice(0, requestedLimit);

  /*
   * A NARROWED ANSWER THAT ONLY MATCHED SOME OF THE WORDS IS NOT AN ANSWER.
   *
   * The fallback used to fire only on an EMPTY list, and that let the worst
   * results through, because a bad narrowed answer is not an empty one. Under a
   * grocery route, "macbook pro" came back with PROTEIN2O and "wireless mouse"
   * with Mini Mouse, both reported as legitimate restricted hits carrying a
   * mere 0.85 penalty, and neither fell back. The plan's own test for this lane
   * is that a shopper flagged as buying groceries can still find a laptop:
   * "laptop" passed it, because it matched nothing at all and fell back, and
   * "macbook pro" failed it, because it matched something.
   *
   * `band` cannot tell these apart -- it reads 'ambiguous' for PROTEIN2O and for
   * a real jar of peanut butter alike. `wordsMatched` can, and it costs nothing
   * because search.ts already computed it. Measured over 10 grocery-route
   * queries: all five genuine hits answered with every word present, all five
   * nonsense ones matched only a subset.
   *
   * Note this is NOT the rule that was considered and rejected earlier, which
   * was to skip the expensive OR pass entirely when a restricted strict pass
   * finds nothing. That one loses real answers. This one still runs the pass,
   * still uses its result when nothing better exists, and only declines to let
   * a subset match SUPPRESS the whole-catalogue fallback.
   */
  // Scoped to routes that were actually narrowed by source, which is where the
  // 10 queries were measured. A produce or furniture route retrieves from the
  // whole catalogue and is only category-filtered afterwards, so a subset match
  // there is the same subset match an unrestricted search would have returned,
  // and dropping the category filter for it would be a behaviour change nobody
  // has measured.
  const narrowedBySource = Boolean(query.sources ?? sources);
  const onlySomeWordsMatched = narrowedBySource && pooled.wordsMatched === 'some';

  if (filtered.length === 0 || onlySomeWordsMatched) {
    // RULE: a restricted search that finds nothing USEFUL falls back to the
    // whole catalogue rather than returning nothing, or returning junk.
    //
    // The second search is not redundant. Before stage 1 existed, `pooled` was
    // an unrestricted retrieval and slicing it WAS the whole-catalogue answer.
    // Once the query itself is narrowed that stops being true, and reusing the
    // pool would return a restricted list while reporting restricted:false and
    // no confidence penalty -- a narrowed answer wearing an unnarrowed label,
    // which is worse than either behaviour on its own.
    const wide =
      narrowedBySource
        ? await catalogue.search({ ...query, limit: requestedLimit, sources: undefined })
        : { ...pooled, candidates: pooled.candidates.slice(0, requestedLimit) };
    return {
      result: wide,
      restricted: false,
      fellBack: wide.candidates.length > 0,
      confidenceAdjustment: 1,
    };
  }

  // `band` and `ring` are inherited from the unrestricted pool: `#band` and
  // the ring walk are private to `Catalogue` and cannot be recomputed here
  // against just the filtered set. Disclosed, not hidden: on a restricted
  // result, `band`/`ring` describe the full retrieval's top candidate, which
  // may not be the same row as `candidates[0]` when the true leader fell
  // outside the route and got filtered out.
  const restricted: SearchResult = { ...pooled, candidates: filtered };
  return { result: restricted, restricted: true, fellBack: false, confidenceAdjustment: RESTRICTED_CONFIDENCE_PENALTY };
}
