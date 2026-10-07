/**
 * Attribution for every outside dataset this app is built on.
 *
 * Before the first version of this file, a grep of every screen, every client
 * script, the HTML and the server for "openstreetmap", "odbl", "open food
 * facts" and "contributors" found nothing. That is a licence problem, not a
 * politeness one: the grocery, beauty, pet food and general product
 * catalogues, the prices themselves, and the store names and cities that come
 * with them, are published under the Open Database Licence, which conditions
 * reuse on giving credit.
 *
 * THIS IS A FROZEN LITERAL LIST, NOT A QUERY (RULINGS.md, "Attribution,
 * provenance and correction data"). It would be easy to build this by asking
 * the databases what is loaded and how many rows came from where, and that is
 * exactly the wrong shape for a legal statement: a list generated from
 * whatever happens to be loaded right now changes silently the day a source
 * is dropped or a table is rebuilt. This list changes only when a person
 * decides it should, in a diff someone reviews.
 *
 * THE COUNTS BELOW WERE MEASURED ON 2026-10-06, read-only, from the two
 * databases the app serves from, and they are a dated snapshot, not a live
 * figure:
 *   catalogue  SELECT source, sold_in_canada, count(*) FROM product GROUP BY 1, 2
 *              in catalogue/data/catalogue.db (4,289,929 rows in all)
 *   prices     SELECT seller, count(*), count(DISTINCT code) FROM observation
 *              GROUP BY 1 in price/data/prices.db (15,193 rows in all), and
 *              count(DISTINCT store_osm) and count(DISTINCT store_name) over
 *              the openprices rows
 * The app searches every catalogue row, not only the ones flagged as sold in
 * Canada, so the counts here are whole-source counts with the Canada-listed
 * slice named beside them where it differs. When a source is reloaded, change
 * the number and the date in the same commit.
 *
 * `keys` is what the loaders write into `product.source` and
 * `observation.seller` (and `openstreetmap`, which has no column of its own:
 * it rides in through `observation.store_osm` and the live shop lookup). The
 * test in test/attribution.test.ts reads the loader files and fails when one
 * of them can emit a key that no entry here claims, so a new source cannot
 * ship uncredited.
 *
 * Three sources, Return-It, Consignaction and ANBL, and the Walmart Canada
 * crawl publish no reuse licence that anybody here has found, and their terms
 * of use have not been read (docs/catalogue-build-plan-2026-09-26.md, risk 8:
 * "what they permit is unmeasured"). Their entries say exactly that rather
 * than naming a licence they do not carry. An unchecked licence is shown as
 * unchecked, never as a guess.
 *
 * Open Icecat and USDA FoodData Central each get their own entry: their terms
 * are their own, not ODbL, and an entry that implied otherwise would misstate
 * a licence rather than honour one.
 */

export interface AttributionEntry {
  readonly name: string;
  readonly what: string;
  readonly licence: string;
  readonly url: string;
  /** The `product.source` / `observation.seller` values this entry credits. */
  readonly keys: readonly string[];
}

export const ATTRIBUTION: readonly AttributionEntry[] = [
  {
    name: 'Open Food Facts',
    what: 'Product names, sizes and allergens for 121,949 grocery products, all listed as sold in Canada (counted 2026-10-06). Contains information from Open Food Facts contributors.',
    licence: 'Open Database License (ODbL)',
    url: 'https://world.openfoodfacts.org',
    keys: ['openfoodfacts'],
  },
  {
    name: 'Open Beauty Facts, Open Pet Food Facts and Open Products Facts',
    what: 'The non-grocery slice of the catalogue: cosmetics, pet food and general products, 88,182 products combined, 1,700 of them listed as sold in Canada (counted 2026-10-06). Contains information from the contributors to these databases.',
    licence: 'Open Database License (ODbL)',
    url: 'https://world.openproductsfacts.org',
    keys: ['openbeautyfacts', 'openpetfoodfacts', 'openproductsfacts'],
  },
  {
    name: 'Open Prices',
    what: 'Shelf prices photographed and submitted by contributors: 874 of the 15,193 price observations in this app, 417 distinct barcodes, seen between 2020-02-01 and 2026-08-26 (counted 2026-10-06). The rest come from the sources below.',
    licence: 'Open Database License (ODbL)',
    url: 'https://prices.openfoodfacts.org',
    keys: ['openprices'],
  },
  {
    name: 'OpenStreetMap',
    what: 'Shop names and cities for the 88 OpenStreetMap places, under 46 distinct store names, that the Open Prices observations were made at, and the nearby-shop list the app builds from OpenStreetMap when you allow location (counted 2026-10-06). Map data from OpenStreetMap contributors.',
    licence: 'Open Database License (ODbL), credit: OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    keys: ['openstreetmap'],
  },
  {
    name: 'Open Icecat',
    what: 'The electronics and general product catalogue, 3,596,403 products, 296,300 of them listed for the Canadian market (counted 2026-10-06). Provided AS IS, without warranty.',
    // Deliberately not ODbL. Icecat publishes its own terms (the Open Content
    // License Agreement and its fair use policy) and this entry must never be
    // read as claiming the same licence as the OpenStreetMap and Open Facts rows.
    licence: 'Icecat Open Content License Agreement and fair use policy (not ODbL)',
    url: 'https://iceclog.com/open-icecat-fair-use-policy/',
    keys: ['icecat'],
  },
  {
    name: 'USDA FoodData Central',
    what: 'Branded food names, sizes and ingredients for 429,593 products from the 2025-12-18 release, 22 of them listed as sold in Canada (counted 2026-10-06). Source: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central, fdc.nal.usda.gov.',
    licence: 'CC0 1.0 Universal (public domain); USDA asks to be cited',
    url: 'https://fdc.nal.usda.gov/',
    keys: ['usda'],
  },
  {
    name: 'BC Liquor Distribution Branch',
    what: 'Barcodes, product names and pre-tax prices from the June 2026 BC liquor store price list: 7,556 price observations, 7,555 distinct barcodes (counted 2026-10-06). Contains information licensed under the Open Government Licence - British Columbia.',
    licence: 'Open Government Licence - British Columbia',
    url: 'https://catalogue.data.gov.bc.ca/dataset/bc-liquor-store-product-price-list-historical-prices',
    keys: ['bcldb'],
  },
  {
    name: 'Alcool NB Liquor (ANBL)',
    what: "Barcodes, product names and shelf prices from ANBL's public price list PDF: 6,741 price observations (counted 2026-10-06). ANBL states no reuse licence that we have found and its terms of use have not been checked.",
    licence: 'No reuse licence found; terms not yet checked',
    url: 'https://www.anbl.com/medias/PriceList-Public.pdf',
    keys: ['anbl'],
  },
  {
    name: 'Walmart Canada',
    what: 'Shelf prices read from public walmart.ca product pages: 22 price observations (counted 2026-10-06). Walmart states no reuse licence that we have found and its terms of use have not been checked.',
    licence: 'No reuse licence found; terms not yet checked',
    url: 'https://www.walmart.ca',
    keys: ['walmart.ca'],
  },
  {
    name: 'Return-It (British Columbia)',
    what: "Non-alcohol drink containers from BC's beverage container deposit registry: 8,940 products, all listed as sold in Canada (counted 2026-10-06). Return-It states no reuse licence that we have found and its terms of use have not been checked.",
    licence: 'No reuse licence found; terms not yet checked',
    url: 'https://www.return-it.ca',
    keys: ['returnit'],
  },
  {
    name: 'Consignaction (Quebec)',
    what: "Drink containers from Quebec's beverage container deposit registry spreadsheet: 44,862 products, all listed as sold in Canada (counted 2026-10-06). Consignaction states no reuse licence that we have found and its terms of use have not been checked.",
    licence: 'No reuse licence found; terms not yet checked',
    url: 'https://www.consignaction.ca',
    keys: ['consignaction'],
  },
];
