/**
 * Attribution for every open dataset this app is built on.
 *
 * Before this file, a grep of every screen, every client script, the HTML and
 * the server for "openstreetmap", "odbl", "open food facts" and "contributors"
 * found nothing. That is a licence problem, not a politeness one: the grocery,
 * beauty, pet food and general product catalogues, the prices themselves, and
 * the store names and cities that come with them, are all published under the
 * Open Database Licence, which conditions reuse on giving credit. Shipping this
 * app with no attribution anywhere was shipping it out of compliance with the
 * licence of nearly everything in it.
 *
 * THIS IS A FROZEN LITERAL LIST, NOT A QUERY. It would be easy to build this by
 * asking the databases what is loaded and how many rows came from where, and
 * that is exactly the wrong shape for a legal statement: a list generated from
 * whatever happens to be loaded right now changes silently the day a source is
 * dropped or a table is rebuilt, and a compliance statement that drifts with the
 * data is not one anybody can rely on. This list changes only when a person
 * decides it should, in a diff someone reviews.
 *
 * Open Icecat gets its own entry rather than being folded in as "another
 * source": its terms are its own, not ODbL, and an entry that implied otherwise
 * would misstate a licence rather than honour one.
 */

export interface AttributionEntry {
  readonly name: string;
  readonly what: string;
  readonly licence: string;
  readonly url: string;
}

export const ATTRIBUTION: readonly AttributionEntry[] = [
  {
    name: 'Open Food Facts',
    what: 'Product names, sizes and allergens for 122,154 products sold in Canada.',
    licence: 'Open Database License (ODbL)',
    url: 'https://world.openfoodfacts.org',
  },
  {
    name: 'Open Beauty Facts, Open Pet Food Facts and Open Products Facts',
    what: 'The non-grocery slice of the catalogue: cosmetics, pet food and general products, 1,697 products combined.',
    licence: 'Open Database License (ODbL)',
    url: 'https://world.openproductsfacts.org',
  },
  {
    name: 'Open Prices',
    what: 'The prices themselves, 874 of the 896 observations in this app, photographed and submitted by contributors.',
    licence: 'Open Database License (ODbL)',
    url: 'https://prices.openfoodfacts.org',
  },
  {
    name: 'OpenStreetMap',
    what: "Store names and cities for the 82 named chains those prices were observed at, carried in through Open Prices.",
    licence: 'Open Database License (ODbL)',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    name: 'Open Icecat',
    what: 'The electronics catalogue, 494,513 products.',
    // Deliberately not ODbL. Icecat publishes its own terms and this entry must
    // never be read as claiming the same licence as the four rows above it.
    licence: "Icecat's own open catalog terms (not ODbL)",
    url: 'https://icecat.biz/en/menu/about_icecat/Open_Icecat.html',
  },
];
