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

import { Identifier, type ModelReading, type Tier } from './model.ts';
import { deriveConfidence, type Confidence } from './confidence.ts';

/** The shape the catalogue returns. Structural, so no dependency is needed. */
export interface CatalogueCandidate {
  readonly code: string;
  readonly name: string;
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
    sizeValue?: number;
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
      return {
        kind: 'unreadable',
        because: 'That photo could not be read. Try again a little closer.',
        reading: null,
        tier,
      };
    }

    const p = reading.product;
    const readAs = [p.brand, p.name, p.variant].filter(Boolean).join(' ').trim();
    if (!readAs) {
      return {
        kind: 'unreadable',
        because: p.uncertainty ?? 'Nothing readable on the label from this angle.',
        reading,
        tier,
      };
    }

    // Everything the model read goes into the query, including the raw visible
    // text: a half-legible flavour word is often the token that separates two
    // otherwise identical rows, and the text index can use it even when the
    // model could not turn it into a clean field.
    const result = await this.#lookup({
      text: [readAs, p.visible_text].filter(Boolean).join(' ').slice(0, 300),
      brand: p.brand ?? undefined,
      sizeValue: p.size_value ?? undefined,
      sizeUnit: p.size_unit ?? undefined,
      limit: 5,
    });

    if (result.band === 'miss' || result.candidates.length === 0) {
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
      selfConfidence: p.self_confidence,
      sharpnessOk: sharpness >= SHARPNESS_FLOOR,
    });

    return {
      kind: 'identified',
      chosen: best,
      alternates: rest,
      confidence,
      sizeQuestion: sizeQuestionFor(result.candidates, p.size_value),
      reading,
      tier,
    };
  }
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
