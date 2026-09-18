/**
 * From a crop to a named product with candidates and a confidence.
 *
 * Decisions 15, 16, 17, 18, 19, 21, 22. This is the stage that decides what the
 * user is looking at; it does not decide whether the price is good, which is the
 * price engine's job and stays there.
 *
 * The catalogue arrives as a function rather than an import. That is not
 * decoration: it keeps this stage testable without a 122,000 row database, and
 * it is what lets the pro tier swap in a catalogue-then-online lookup without
 * this file knowing that happened.
 */

import {
  Identifier,
  failureOf,
  selfConfidenceNumber,
  type FailureClass,
  type IdentifiedFields,
  type ModelReading,
  type PickCandidateRow,
  type Tier,
} from './model.ts';
import { spendCapRefusalMessage } from './cap.ts';
import { capByPick, capByUnrunPick, deriveConfidence, LEAD_CLEAR, type Confidence } from './confidence.ts';
import { gtinFrom } from './gtin.ts';
import { foldVariantText, variantCarriedBy, variantTokens } from '../../catalogue/src/variant-words.ts';

export type { FailureClass } from './model.ts';

/** The shape the catalogue returns. Structural, so no dependency is needed. */
export interface CatalogueCandidate {
  readonly code: string;
  readonly name: string;
  /**
   * The row's other names, added 2026-09-14 for D-099.
   *
   * Optional because this interface is structural and every caller that built a
   * candidate before today built one without them; the catalogue has always
   * returned both. They are here because the English name is not reliably where
   * a variant is written down: the cherry can's English name is
   * "Cherry-flavoured calorie-free cola" and its French one is "Coca-cola
   * cerise", and a reader that only ever looks at `name` cannot see the second.
   */
  readonly nameFr?: string | null;
  readonly genericName?: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly categoryPath: readonly string[];
  readonly allergens: readonly string[];
  readonly signals: {
    readonly similarity: number | null;
    readonly brandAgrees: boolean | null;
    readonly sizeAgrees: boolean | null;
    /** D-099. Optional for the same reason the two names above are. */
    readonly variantAgrees?: boolean | null;
  };
}

export interface CatalogueResult {
  readonly band: 'confident' | 'ambiguous' | 'miss';
  readonly candidates: readonly CatalogueCandidate[];
  readonly ring: { label: string; members: readonly CatalogueCandidate[] } | null;
  readonly matchedBy: 'gtin' | 'hybrid' | 'none';
}

export interface CatalogueLookup {
  (query: {
    text?: string;
    gtin?: string;
    brand?: string;
    /**
     * The flavour or edition word off the pack, passed as its own field rather
     * than left buried in `text` (D-099, 2026-09-14).
     *
     * In `text` it is one more token among five and it loses to whichever row
     * happens to repeat more of the others. As a field the catalogue can ask the
     * one question that actually separates two cans of the same drink: does this
     * row say cherry anywhere, in either language.
     */
    variant?: string;
    sizeValue?: number;
    /** A second admissible reading of the same pack; see `pinnedSize`. D-126. */
    sizeValueAlt?: number;
    sizeUnit?: string;
    limit?: number;
  }): Promise<CatalogueResult>;
}

/** What identification hands to the next stage. */
export type IdentifyOutcome =
  | {
      readonly kind: 'identified';
      readonly chosen: CatalogueCandidate;
      /** Decision 17: the runners-up always exist, whether or not they are shown. */
      readonly alternates: readonly CatalogueCandidate[];
      readonly confidence: Confidence;
      /** Decision 19: set when size could not be settled and the user must pick. */
      readonly sizeQuestion: { options: CatalogueCandidate[] } | null;
      readonly reading: ModelReading | null;
      readonly tier: Tier;
      /**
       * How many vision calls this answer cost. 1 when pass one settled it or a
       * barcode short-circuited it, 2 when the pick pass ran. Added 2026-09-09
       * so the eval runner can report a pass-2 rate without instrumenting the
       * model client, and so the scan log can price a scan after the fact.
       */
      readonly passes?: 1 | 2;
      /** The pick pass's one sentence, when it ran. */
      readonly pick?: { readonly why: string };
    }
  | {
      /**
       * Decision 22. We know what it is and the catalogue does not have it. A
       * different sentence and a different repair from not knowing at all.
       */
      readonly kind: 'not_in_catalogue';
      readonly readAs: string;
      readonly ring: { label: string; members: readonly CatalogueCandidate[] } | null;
      readonly reading: ModelReading;
      readonly tier: Tier;
    }
  | {
      readonly kind: 'unreadable';
      readonly because: string;
      /**
       * Added 2026-09-08, added and not repurposed: `because` is the sentence
       * the person reads and it stays the same across most of these, which is
       * the whole reason a second field had to exist. This one is for the log.
       */
      readonly failure: FailureClass;
      readonly reading: ModelReading | null;
      readonly tier: Tier;
    };

/** Below this the crop is soft enough to be a likely cause of a wrong answer. */
const SHARPNESS_FLOOR = 40;

export class IdentifyStage {
  readonly #model: Identifier;
  readonly #lookup: CatalogueLookup;

  constructor(lookup: CatalogueLookup, model = new Identifier()) {
    this.#lookup = lookup;
    this.#model = model;
  }

  /**
   * Decision 15: a barcode never reaches the model at all.
   *
   * Not an optimisation. A barcode is a fact and a model reading is an opinion,
   * and asking for an opinion once you have the fact can only introduce a way to
   * disagree with it.
   */
  async fromBarcode(gtin: string, tier: Tier): Promise<IdentifyOutcome> {
    const result = await this.#lookup({ gtin });
    const chosen = result.candidates[0];
    if (!chosen) {
      return {
        kind: 'not_in_catalogue',
        readAs: gtin,
        ring: result.ring,
        reading: null as unknown as ModelReading,
        tier,
      };
    }
    return {
      kind: 'identified',
      chosen,
      alternates: [],
      confidence: deriveConfidence({
        barcodeResolved: true,
        catalogueSimilarity: 1,
        lead: 1,
        brandAgrees: null,
        sizeAgrees: null,
        selfConfidence: 1,
        sharpnessOk: true,
      }),
      sizeQuestion: null,
      reading: null,
      tier,
    };
  }

  async fromCrop(
    productPng: Uint8Array,
    tagPng: Uint8Array | null,
    tier: Tier,
    sharpness: number,
  ): Promise<IdentifyOutcome> {
    let reading: ModelReading;
    try {
      reading = await this.#model.read(productPng, tagPng, tier);
    } catch (err) {
      /*
       * 2026-09-08, the beta readiness audit: every failure here left as one
       * sentence about the photograph, so an outage and a dark photo were the
       * same row in the log and a beta run during an outage would have read
       * back as a beta full of bad photographers.
       *
       * The sentence stays identical anyway. A rate limit, an outage and a
       * malformed answer all leave the person with the same one thing to do,
       * and naming our billing at somebody in a supermarket aisle is hard rule
       * 3's exact failure. What changes is that the class rides alongside it.
       *
       * ONE EXCEPTION, added 2026-09-11 when the daily dollar cap landed in
       * cap.ts. The reasoning above holds because every class it names leaves
       * the person with the SAME next move: take the photo again. A spend cap
       * refusal does not. Taking it again cannot work, today or on the tenth
       * try, so "try again a little closer" sends somebody standing in an
       * aisle into a loop that is guaranteed to fail and blames their
       * photograph for our budget. The one thing left to do is genuinely
       * different, so the sentence is genuinely different. It still does not
       * name our billing at them: cap.ts's wording says the budget is spent
       * and points at the typed-price pad, which is a path that works right
       * now.
       */
      const failure = failureOf(err);
      return {
        kind: 'unreadable',
        because:
          failure === 'spend_cap_reached'
            ? spendCapRefusalMessage()
            : 'That photo could not be read. Try again a little closer.',
        failure,
        reading: null,
        tier,
      };
    }

    const p = reading.product;

    /*
     * THE BARCODE OFF THE PACK (2026-09-09, the photo path section 2).
     *
     * Decision 15 says a barcode never reaches the model because a fact beats
     * an opinion. This is the same rule arriving one step later: the model has
     * already looked, and if what it read under the bars survives its own check
     * digit then we are holding a fact again, and the text cascade below is an
     * opinion we no longer need. `gtinFrom` is the whole guard, and it is not a
     * formality: a single misread digit fails the check about nine times in
     * ten, which is what makes reading a barcode off a photograph safe enough
     * to short-circuit on.
     *
     * A miss falls through. The code was legible, the catalogue simply does not
     * carry it, and the text path may still find the same product by name.
     *
     * This runs before the unreadable check on purpose: a pack whose front is
     * glare or French or upside down can still have a perfectly legible barcode,
     * and that scan is exactly the one worth saving.
     */
    const gtin = gtinFrom(p.barcode_digits);
    if (gtin) {
      const byCode = await this.#lookup({ gtin });
      const chosen = byCode.candidates[0];
      if (chosen) {
        return {
          kind: 'identified',
          chosen,
          alternates: [],
          confidence: deriveConfidence({
            barcodeResolved: true,
            catalogueSimilarity: 1,
            lead: 1,
            brandAgrees: null,
            sizeAgrees: null,
            selfConfidence: 1,
            sharpnessOk: true,
          }),
          sizeQuestion: null,
          // The note the contract asks for: this code came off the photograph,
          // not off a scanner, so a later audit of a wrong answer can tell the
          // two apart.
          reading: { ...reading, barcodeFromPhoto: gtin },
          tier,
          passes: 1,
        };
      }
    }

    const readAs = [p.brand, p.name, p.variant].filter(Boolean).join(' ').trim();
    if (!readAs) {
      return {
        kind: 'unreadable',
        because: p.uncertainty ?? 'Nothing readable on the label from this angle.',
        // The model answered and there was nothing on the label to answer with.
        // The only member of the vocabulary that is genuinely about the photo.
        failure: 'unreadable_photo',
        reading,
        tier,
      };
    }

    /*
     * THE CASCADE (2026-09-09). Three queries instead of one, in parallel.
     *
     * One query has to be right about everything at once. These three are each
     * allowed to be wrong about a different thing:
     *
     *   q1  brand + name + variant, brand AND size pinned. The precise one. It
     *       is right when the model read the pack correctly, and it is the only
     *       one that can separate two sizes of the same product.
     *   q2  brand + name, brand pinned, size NOT pinned. Written for the
     *       failure mode the research pass named first: size variants that look
     *       identical. Unpinning the size brings the siblings back as a set
     *       rather than dropping them, which is what decision 19 needs to be
     *       able to ask a question about.
     *   q3  name plus the transcribed front text, nothing pinned. The one that
     *       survives the brand being read wrong, which is the store-brand and
     *       the bilingual-face case: a pinned brand that is wrong does not
     *       narrow the search, it excludes the answer.
     *
     * In parallel because they are independent and the photo budget is 7,000 ms
     * for two vision calls plus this; run in series they would be the third.
     */
    const front = p.front_text.join(' ').trim();
    const q1Text = [p.brand, p.name, p.variant].filter(Boolean).join(' ').trim();
    const q2Text = [p.brand, p.name].filter(Boolean).join(' ').trim();
    const q3Text = [p.name, front].filter(Boolean).join(' ').trim();

    const pinned = pinnedSize(p);

    const queries: Parameters<CatalogueLookup>[0][] = [];
    if (q1Text) {
      queries.push({
        text: q1Text.slice(0, 300),
        brand: p.brand ?? undefined,
        variant: p.variant ?? undefined,
        sizeValue: pinned.value ?? undefined,
        sizeValueAlt: pinned.alt ?? undefined,
        sizeUnit: pinned.unit ?? undefined,
        limit: 10,
      });
    }
    if (q2Text) {
      /*
       * q2 drops the variant from the TEXT on purpose and still pins it as a
       * signal. The text is deliberately loose here so the size siblings come
       * back as a set; the variant is not a size, and a row that contradicts the
       * flavour was never one of those siblings.
       */
      queries.push({
        text: q2Text.slice(0, 300),
        brand: p.brand ?? undefined,
        variant: p.variant ?? undefined,
        limit: 10,
      });
    }
    if (q3Text) {
      queries.push({ text: q3Text.slice(0, 300), limit: 10 });
    }

    const result = union(await Promise.all(queries.map((q) => this.#lookup(q))));

    // 2026-09-05, his correction (docs/the-combined-pipeline.md): the app was
    // refusing to answer instead of committing to a top candidate. A band of
    // 'miss' used to be treated the same as no candidates at all, which threw
    // away decision 17's whole point -- ranked candidates always exist, and the
    // top one is shown large with a "not this?" affordance, band or no band.
    // The only real refusal left is arithmetic: nothing came back at all, which
    // is the one case a confidence number cannot paper over because there is no
    // candidate for it to be a confidence about.
    if (result.candidates.length === 0) {
      return { kind: 'not_in_catalogue', readAs, ring: result.ring, reading, tier };
    }

    const [best, ...rest] = result.candidates;
    const second = rest[0];
    const lead =
      best.signals.similarity !== null && second?.signals.similarity != null
        ? best.signals.similarity - second.signals.similarity
        : best.signals.similarity !== null
          ? 1
          : null;

    const confidence = deriveConfidence({
      barcodeResolved: false,
      catalogueSimilarity: best.signals.similarity,
      lead,
      brandAgrees: best.signals.brandAgrees,
      sizeAgrees: best.signals.sizeAgrees,
      // The model now answers in words. The translation lives at this boundary
      // so confidence.ts never learns that it changed.
      selfConfidence: selfConfidenceNumber(p.self_confidence),
      sharpnessOk: sharpness >= SHARPNESS_FLOOR,
    });

    const pass1: IdentifyOutcome = {
      kind: 'identified',
      chosen: best,
      alternates: rest,
      confidence,
      sizeQuestion: sizeQuestionFor(result.candidates, pinned.value),
      reading,
      tier,
      passes: 1,
    };

    /*
     * DID PASS ONE SETTLE IT?
     *
     * Two conditions, both already in the codebase and neither invented here:
     * the catalogue's own 'confident' band, and a lead clear of `LEAD_CLEAR`,
     * which is the same 0.03 that already makes confidence.ts say two products
     * match almost equally well. A confident band with a hairline lead is
     * precisely the "confidently the wrong one of two near identical products"
     * failure the lead signal exists to catch, and it is the case the pick pass
     * was added for.
     *
     * Fewer than two candidates and there is nothing to pick between, so the
     * second call would be spending money to re-read a decision already made.
     *
     * The third condition arrived with D-099 and it only ever REMOVES a settle,
     * never adds one: see `variantForcesPick`. The band and the lead are
     * untouched, because both were right about what they measure and neither of
     * them measures flavour.
     */
    const settled =
      result.band === 'confident' &&
      lead !== null &&
      lead > LEAD_CLEAR &&
      !variantForcesPick(p.variant, result.candidates);
    if (settled || result.candidates.length < 2) return pass1;

    let picked;
    try {
      picked = await this.#model.pick(productPng, pickRows(result.candidates), tier);
    } catch {
      /*
       * PRIORITY 1: always answer. A pick that times out, hits the daily cap,
       * or comes back malformed is a lost improvement, not a lost scan; we
       * still hold a ranked candidate from pass one and refusing here would be
       * the exact behaviour his 2026-09-05 correction removed. The failure is
       * not swallowed silently in any way that matters, because the answer that
       * ships is pass one's, with pass one's confidence and `passes: 1`.
       *
       * BUT THE CONFIDENCE IS CAPPED, D-125. Only the ANSWER is unchanged.
       * Every row that reaches the pick is one pass one did not settle, so a
       * thrown pick leaves precisely the ambiguous rows with nothing holding
       * their number down. Measured on the 2026-09-16 eval, 12 of the 23
       * wrong answers that shipped in the high band had an errored pick,
       * against 12% of the ones that shipped high and were right.
       */
      return { ...pass1, confidence: capByUnrunPick(pass1.confidence) };
    }

    const chosenIndex = picked.pick.chosen_index;
    const sizeIndexes = (picked.pick.size_question ?? []).filter(
      (i) => Number.isInteger(i) && i >= 0 && i < result.candidates.length,
    );
    const why = picked.pick.why;

    // Decision 19 first: an unanswerable size question is not a weak pick, it
    // is a question, and asking it costs one tap where guessing costs the whole
    // verdict. It is honoured even if the model also named an index.
    if (sizeIndexes.length >= 2) {
      const options = sizeIndexes.map((i) => result.candidates[i]);
      const head = options[0];
      return {
        kind: 'identified',
        chosen: head,
        alternates: result.candidates.filter((c) => c.code !== head.code),
        confidence: capByPick(confidence, picked.pick.confidence),
        sizeQuestion: { options: options.slice(0, 3) },
        reading,
        tier,
        passes: 2,
        pick: { why },
      };
    }

    if (chosenIndex !== null && chosenIndex >= 0 && chosenIndex < result.candidates.length) {
      const chosen = result.candidates[chosenIndex];
      return {
        kind: 'identified',
        chosen,
        alternates: result.candidates.filter((_, i) => i !== chosenIndex),
        // The pick caps the six-signal score and never raises it. Decision 18:
        // an opinion, however well informed, does not get to set the number.
        confidence: capByPick(confidence, picked.pick.confidence),
        sizeQuestion: null,
        reading,
        tier,
        passes: 2,
        pick: { why },
      };
    }

    /*
     * The pick refused. That is a real answer and it is not a refusal to the
     * user: the contract's section 3 says unsure is expressed as 'identified'
     * with a low band and non-empty alternates, and the route turns that into
     * the identity_unsure screen with the candidates. Still an answer, still
     * ranked, with the doubt carried by the confidence exactly as priority 1
     * requires.
     */
    return {
      kind: 'identified',
      chosen: best,
      alternates: rest,
      confidence: capByPick(confidence, 'low'),
      sizeQuestion: null,
      reading,
      tier,
      passes: 2,
      pick: { why },
    };
  }
}

/**
 * SHOULD THE VARIANT WORD OVERRULE A SETTLED PASS ONE? (D-099, 2026-09-14)
 *
 * A Cherry Coke Zero photographed on a phone came back as plain Coke Zero. The
 * two rows are one word apart and that word was in the query: pass 1 built
 * "Coca-Cola Coke Zero Cherry", and the plain row repeats three of those words
 * while the cherry row's English name, "Cherry-flavoured calorie-free cola",
 * says neither "coke" nor "zero". More matched tokens won, the band came back
 * confident, the lead was clear, and pass 1 settled on the wrong can without
 * ever paying for a second look.
 *
 * The variant is the ONE signal that separates two cans of the same drink. So
 * when the model read a variant, and the leader does not carry it while some
 * other candidate does, this is not a settled answer: it is exactly the
 * "confidently the wrong one of two near identical products" case the pick pass
 * was added for. Forcing the pick is the whole of what this does. It never
 * reorders anything, because ranking belongs to the catalogue and the choice
 * between two rows that both look right belongs to the pass that can see the
 * photograph.
 *
 * Nobody carrying the variant leaves the behaviour exactly as it was. There is
 * nothing to prefer, and a second vision call to confirm a conclusion already
 * reached is money spent on nothing.
 *
 * ALL the tokens, not any of them: "Zero Sugar Cherry" is three words naming one
 * can, and a row carrying only "zero sugar" is precisely the row this exists to
 * stop settling on. Accent folded because the row that names the variant is
 * often the French one, and "Coca-cola cerise" is the reason the pick pass is
 * now shown `name_fr` at all. A token is answered by its family as well as by
 * itself (`catalogue/src/variant-words.ts`), because the catalogue spells one shelf six ways
 * and "zero" is written "calorie-free" on the exact row this was built to find.
 *
 * Exported for its own tests: this is a decision about two lists of words and it
 * is worth being able to ask it without a stage, a model and a catalogue.
 */
export function variantForcesPick(
  variant: string | null,
  candidates: readonly CatalogueCandidate[],
): boolean {
  if (variantTokens(variant).length === 0) return false;

  const [best, ...rest] = candidates;
  if (!best) return false;
  if (carriesVariant(best, variant)) return false;
  return rest.some((c) => carriesVariant(c, variant));
}

/**
 * Everything the row knows that could name a flavour, read as one string, plus
 * the shelf it sits on.
 *
 * Substring rather than whole-word, matching what `brandAgreesWith` already does
 * on the catalogue side, because a variant is printed hyphenated and compounded
 * as often as not: "Cherry-flavoured" has to answer to "cherry".
 *
 * The category path joined the evidence on 2026-09-14, with the word families in
 * `catalogue/src/variant-words.ts`. The row this whole guard is about spells its zero
 * "calorie-free" in the name and `en:diet-cola-soft-drink` on the shelf, so a
 * model transcribing the can's own "Zero Sugar" found the variant in neither
 * name and the guard quietly stopped firing on the likelier reading of the two.
 * The catalogue side asks the identical question off the identical evidence, so
 * the rank and the guard cannot disagree about what a row says.
 */
function carriesVariant(c: CatalogueCandidate, variant: string | null): boolean {
  const text = [c.name, c.nameFr ?? '', c.genericName ?? ''].join(' ');
  return variantCarriedBy(variant, text, c.categoryPath ?? []);
}

/**
 * The size to pin against the catalogue, which is not always the size the
 * label reads (found and left unfixed by D-082, closed here 2026-09-09).
 *
 * The catalogue stores a multipack's NET quantity -- Danone Danette "4 x
 * 100 g" is listed as 400 g, SunRype "5 x 200 mL" as 1000 ml -- while
 * `size_value`/`size_unit` off the extract schema describe one unit and
 * `count` is how many. Pinning the unit reading against a net-quantity
 * catalogue pins the wrong number for every multipack, silently, because the
 * pin still looks like a size and still sorts a row to the top: just the
 * wrong row's sibling. Multiplying by `count` closes that gap; `count`
 * below 2 (single item, or unread) leaves the reading exactly as read.
 *
 * `ea` is the other shape: a countable item's size IS the count (a 12-pack
 * is 12 ea), so when the label gave no per-item size at all, `count` stands
 * in for it rather than leaving the pin empty.
 *
 * This only changes what gets PINNED against the catalogue. `reading` stays
 * the model's own words, untouched, because it is the audit trail for what
 * was actually read off the photograph.
 */
function pinnedSize(
  p: IdentifiedFields,
): { value: number | null; alt: number | null; unit: IdentifiedFields['size_unit'] } {
  if (p.size_unit === 'ea') {
    return { value: p.size_value ?? p.count, alt: null, unit: 'ea' };
  }
  if (
    p.count !== null &&
    p.count >= 2 &&
    p.size_value !== null &&
    (p.size_unit === 'g' || p.size_unit === 'kg' || p.size_unit === 'ml' || p.size_unit === 'l')
  ) {
    /*
     * D-126. The net reading leads, because the catalogue really does store
     * net for a multipack -- measured, 3,488 of 3,533 rows that state an
     * explicit "N x M" pack, 98.7%. That convention was never the problem.
     *
     * The problem is one layer up: the LABEL prints both numbers, and
     * `size_value` may already BE the net. Multiplying it then double-counts
     * -- a 200 g box of bars read as 200 g with ten bars pins 2,000 g -- and
     * a wrong pin is worse than none, because `pinTier` rewards whatever
     * matches and sorts the wrong sibling up. Measured on the 2026-09-16 run,
     * multipacks were the worst kind in the eval by a distance: 38.9% right
     * against 75 to 89% for every other kind, and the recorded pins are wrong
     * in BOTH directions -- 40 g pinned against a 200 g pack, 2,000 g pinned
     * against another 200 g pack.
     *
     * So both readings travel and the catalogue agrees with either. Nothing
     * here learns which the label meant; it stops pretending it knows.
     */
    return { value: p.size_value * p.count, alt: p.size_value, unit: p.size_unit };
  }
  return { value: p.size_value, alt: null, unit: p.size_unit };
}

/**
 * The three query results become one ranked list.
 *
 * Dedupe is by catalogue code, and a row seen twice keeps the BEST of each
 * signal rather than whichever copy happened to arrive first. That matters
 * because the queries disagree by design: q2 unpins the size, so the same row
 * comes back with `sizeAgrees` null there and true from q1, and taking the
 * later copy would throw away a signal that was actually established.
 *
 * Ten is the cap, because ten is what the pick pass is asked to read and a
 * longer list is tokens spent on rows nobody will choose.
 *
 * Exported 2026-09-13 for the eval's stage split, and exported rather than
 * copied on purpose: cascade recall is "was the right row in THIS list", so a
 * second implementation of the merge in the runner would drift from the real one
 * and quietly report recall for a candidate set production never built. The
 * eval calls it on the same three results it watched go past the lookup.
 */
export function union(results: readonly CatalogueResult[]): CatalogueResult {
  const BAND_RANK = { confident: 2, ambiguous: 1, miss: 0 } as const;

  const byCode = new Map<string, CatalogueCandidate>();
  for (const result of results) {
    for (const c of result.candidates) {
      const seen = byCode.get(c.code);
      if (!seen) {
        byCode.set(c.code, c);
        continue;
      }
      byCode.set(c.code, {
        ...(bestSimilarity(seen, c) === c ? c : seen),
        signals: {
          similarity: maxOrNull(seen.signals.similarity, c.signals.similarity),
          brandAgrees: bestFlag(seen.signals.brandAgrees, c.signals.brandAgrees),
          sizeAgrees: bestFlag(seen.signals.sizeAgrees, c.signals.sizeAgrees),
          // Merged like the other two, and merged at all so that q3, which pins
          // no variant, cannot erase what q1 established about the same row.
          variantAgrees: bestFlag(
            seen.signals.variantAgrees ?? null,
            c.signals.variantAgrees ?? null,
          ),
        },
      });
    }
  }

  const candidates = [...byCode.values()]
    .sort(
      (a, b) =>
        pinRank(b) - pinRank(a) || (b.signals.similarity ?? -1) - (a.signals.similarity ?? -1),
    )
    .slice(0, 10);

  let band: CatalogueResult['band'] = 'miss';
  let ring: CatalogueResult['ring'] = null;
  let matchedBy: CatalogueResult['matchedBy'] = candidates.length > 0 ? 'hybrid' : 'none';
  for (const result of results) {
    if (BAND_RANK[result.band] > BAND_RANK[band]) band = result.band;
    if (!ring && result.ring) ring = result.ring;
    if (result.matchedBy === 'gtin') matchedBy = 'gtin';
  }

  return { band, candidates, ring, matchedBy };
}

/**
 * The same rank the catalogue ranks by, applied again after the merge (D-082).
 *
 * The union orders three lists that were asked three different questions, and
 * similarity is the only thing they all carry, so it used to be the whole sort.
 * That reintroduces the bug the catalogue side just fixed: q1 pins the size and
 * q2 deliberately does not, the dedupe above keeps whichever answer was actually
 * established, and then a sort on cosine alone puts the sibling with the wrong
 * size back on top, because two listings of the same product under the same name
 * differ on cosine by noise and on size by the only fact in the query.
 *
 * Same absolute rule and the same reason it is a rank rather than a weight:
 * agreeing on brand AND size never sorts below agreeing on brand alone. It
 * promotes and never demotes, for the reason `pinTier` records: a multipack
 * prints its unit size and the catalogue stores its net size, so a size that
 * DISAGREES is not evidence against a row. A query that pinned no size leaves
 * every row level, so the order is the similarity order it has always been.
 */
function pinRank(c: CatalogueCandidate): number {
  return c.signals.sizeAgrees === true && c.signals.brandAgrees !== false ? 1 : 0;
}

function bestSimilarity(a: CatalogueCandidate, b: CatalogueCandidate): CatalogueCandidate {
  return (b.signals.similarity ?? -1) > (a.signals.similarity ?? -1) ? b : a;
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** true beats false beats "was never asked". */
function bestFlag(a: boolean | null, b: boolean | null): boolean | null {
  if (a === true || b === true) return true;
  if (a === false || b === false) return false;
  return null;
}

/**
 * The rows as the pick pass sees them: what is printed on a pack, nothing else.
 *
 * D-099 added the other two names. The pick pass was shown `name` alone, so on
 * the cherry can it was handed a row reading "Cherry-flavoured calorie-free
 * cola" beside one reading "Coke Zero" and could not see that the first row's
 * French name is "Coca-cola cerise". It was being asked to tell two cans apart
 * with the one field that does not distinguish them.
 *
 * Only when they are there and only when they say something `name` does not: a
 * row whose French name is its English name is two more strings of tokens per
 * row, ten rows per call, buying nothing.
 */
function pickRows(candidates: readonly CatalogueCandidate[]): PickCandidateRow[] {
  return candidates.map((c, index) => ({
    index,
    code: c.code,
    brand: c.brands,
    name: c.name,
    ...(addsToName(c.nameFr, c.name) ? { nameFr: c.nameFr } : {}),
    ...(addsToName(c.genericName, c.name) ? { genericName: c.genericName } : {}),
    size:
      c.quantity ??
      (c.sizeValue !== null ? `${c.sizeValue}${c.sizeUnit ?? ''}` : null),
    category: c.categoryPath.at(-1) ?? null,
  }));
}

/** Is this second name worth the tokens, or is it the first one again? */
function addsToName(other: string | null | undefined, name: string): other is string {
  return (
    typeof other === 'string' &&
    other.trim() !== '' &&
    foldVariantText(other).trim() !== foldVariantText(name).trim()
  );
}

/**
 * Decision 19: when two candidates are the same product in different sizes and
 * nothing settled which, ask rather than pick.
 *
 * Picking is the tempting option and it is wrong in a specific way: a 1 kg jar
 * judged against 500 g prices reads "walk away" every time, confidently, and the
 * user has no way to see why. Two buttons costs one tap and removes it.
 */
function sizeQuestionFor(
  candidates: readonly CatalogueCandidate[],
  readSize: number | null,
): { options: CatalogueCandidate[] } | null {
  if (readSize !== null) return null;
  if (candidates.length < 2) return null;

  const sized = candidates.filter((c) => c.sizeValue !== null);
  if (sized.length < 2) return null;

  const nameOf = (c: CatalogueCandidate) => `${c.brands ?? ''}|${c.name}`.toLowerCase();
  const sameProduct = sized.filter((c) => nameOf(c) === nameOf(sized[0]));
  if (sameProduct.length < 2) return null;

  const distinct = new Set(sameProduct.map((c) => `${c.sizeValue}${c.sizeUnit}`));
  if (distinct.size < 2) return null;

  return { options: sameProduct.slice(0, 3) };
}
