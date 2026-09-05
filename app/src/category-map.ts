/**
 * From what the catalogue calls a thing to what the price engine calls a thing.
 *
 * These are two vocabularies that had never met. The catalogue labels a product
 * with shelf tags borrowed from its upstream sources: 20,043 distinct ones,
 * shaped like `en:laptops` or `en:fresh-oranges`, arranged in a path from broad
 * to specific. The price engine knows exactly five kinds of thing, because each
 * one carries its own rule about how many sellers and how fresh a price has to
 * be before a verdict is allowed. Nothing joined them, which meant a catalogue
 * hit had no route to a verdict at all. This is that route.
 *
 * THE RULE THIS FILE OBEYS: it returns null rather than guessing. A product
 * mapped to the wrong kind is judged by the wrong rule, and the first priority
 * here is that a wrong verdict is worse than no verdict. `null` reaches the
 * screen as "we know what this is and cannot price it", which is a designed
 * state and, per the plan, the one that fires most often.
 *
 * EVERY MAPPING BELOW IS COUNTED, NOT ASSUMED. The first version of this file
 * sent the whole electronics database to the tech rule, on the strength of the
 * word "electronics". Counted on 2026-09-05, that database's own top-level
 * sections are 3,910,054 rows of computers and peripherals but also 140,442
 * domestic appliances, 111,493 toys, 71,899 entertainment, 57,193 home, 56,024
 * building and construction, 39,187 lighting, 25,811 health and beauty, and 520
 * food. A toy judged by a rule written for laptops (three retailers, three days
 * old) is a wrong verdict waiting to happen, so the section is what decides,
 * never the database it arrived in.
 */

import type { CategoryId } from '../../spine/src/contract.ts';

export interface CatalogueIdentity {
  /** Which upstream database the row came from. */
  readonly source: string;
  /** Broad to specific, as stored. Often empty: 81,793 grocery rows have no leaf. */
  readonly categoryPath: readonly string[];
  readonly leafCategory: string | null;
}

export interface CategoryVerdict {
  readonly category: CategoryId | null;
  /** Plain words, safe to show. The screen has to be able to say why it cannot price. */
  readonly why: string;
}

const UNKNOWN: CategoryVerdict = {
  category: null,
  why: 'We know what this is. It is not a kind of thing we can price yet.',
};

/**
 * Fresh produce, which the price engine deliberately does not serve.
 *
 * Recognised from the tag rather than the database, because produce arrives
 * inside the grocery data: 35 fresh eggs, 16 fresh raspberries, 13 fresh
 * strawberries and a long tail below them. Sending those to the grocery rule
 * would price a loose vegetable with packaged-goods logic, and the engine
 * already holds a considered position that it will not price produce at all.
 * Catching them here turns a wrong verdict into an honest refusal.
 */
const PRODUCE = /(^|:)fresh-|(^|:)(fruits|vegetables|legumes)$/;

/** Furniture words, checked across the whole path rather than the leaf alone. */
const FURNITURE = /(^|:)(furniture|chairs|tables|sofas|couches|beds|mattresses|desks|wardrobes|bookcases)$/;

/**
 * The electronics database's own top sections, mapped by hand, with the row
 * count each one carries so the size of any mistake here is visible.
 *
 * Only the sections whose products are genuinely bought and compared the way
 * the tech rule assumes, which is several retailers carrying the same model
 * number at once. Everything absent from this table falls through to unknown on
 * purpose: toys, building supplies, lighting, office supplies, vehicles,
 * fashion, sports, medical and lab equipment have no rule written for them and
 * inventing one by proxy is the mistake this file exists to prevent.
 */
const ICECAT_SECTIONS: Record<string, CategoryId> = {
  'en:computers-peripherals': 'tech', // 3,910,054
  'en:telecom-navigation': 'tech', //     228,212
  'en:pro-consumer-av-photo': 'tech', //  225,034
  'en:domestic-appliances': 'tech', //    140,442
  'en:entertainment-hobby': 'tech', //     71,899
  'en:health-beauty-personal-care': 'grocery', // 25,811
  'en:food-beverages-tobacco': 'grocery', //         520
  'en:pet-care': 'grocery', //                       147
};

function tagsOf(identity: CatalogueIdentity): string[] {
  return [
    ...(identity.categoryPath ?? []),
    ...(identity.leafCategory ? [identity.leafCategory] : []),
  ].map((t) => t.toLowerCase());
}

export function categoryFor(identity: CatalogueIdentity): CategoryVerdict {
  const tags = tagsOf(identity);
  const anyTag = (re: RegExp) => tags.some((t) => re.test(t));
  const root = (identity.categoryPath?.[0] ?? '').toLowerCase();

  // Produce is checked before anything else, because it arrives inside the
  // grocery data and the database alone would send it to the wrong rule.
  if (anyTag(PRODUCE)) {
    return {
      category: 'produce',
      why: 'Loose produce. Prices are per pound and per week and we do not have a fair way to compare them yet.',
    };
  }

  if (anyTag(FURNITURE)) return { category: 'furniture', why: 'Furniture.' };

  switch (identity.source) {
    /*
     * Brand-approved datasheets, 4,972,252 rows. The section decides, not the
     * database: see the note at the top of this file.
     */
    case 'icecat': {
      const mapped = ICECAT_SECTIONS[root];
      if (mapped === 'tech') return { category: 'tech', why: 'Electronics.' };
      if (mapped === 'grocery') return { category: 'grocery', why: 'Packaged goods.' };
      return UNKNOWN;
    }

    /*
     * Packaged food and drink. The grocery rule was written on exactly this kind
     * of product, down to the box of macaroni in its own stated reasoning.
     */
    case 'openfoodfacts':
      return { category: 'grocery', why: 'Packaged grocery.' };

    /*
     * Pet food and cosmetics are judged as grocery, and that is a decision
     * rather than an oversight. Both are packaged, barcoded, bought in the same
     * stores, and discounted on the same weekly promotional cycle the grocery
     * rule exists to handle. The alternative was refusing to price them for a
     * vocabulary reason rather than an evidence one.
     *
     * Reverses if: a measured price series shows either behaving unlike
     * grocery, most likely a promotion cycle longer than the rule's seven day
     * window, at which point they need their own rule rather than this one.
     */
    case 'openpetfoodfacts':
      return { category: 'grocery', why: 'Pet food, priced like packaged grocery.' };
    case 'openbeautyfacts':
      return { category: 'grocery', why: 'Personal care, priced like packaged grocery.' };

    /*
     * General merchandise, and genuinely mixed: books, cigarettes, t-shirts,
     * shoes, toys, medicine, and a real electronics section underneath
     * `en:electronics`. Only the electronics branch is certain, and it is
     * recognised from the root because the leaves below it are things like
     * `en:mice-trackballs` that no hand-written list would ever cover.
     */
    case 'openproductsfacts':
      if (root === 'en:electronics') return { category: 'tech', why: 'Electronics.' };
      return UNKNOWN;

    default:
      return UNKNOWN;
  }
}
