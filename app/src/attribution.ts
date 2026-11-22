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
 * ONE EXCEPTION since 2026-11-05: the Return-It and Consignaction rows are
 * still in the database and still counted below, but no answer, search, typed
 * lookup, barcode lookup, alternative or offline pack reads them
 * (catalogue/src/source-rights.ts UNLICENSED_SOURCES). Their counts are rows
 * held on 2026-10-06, not rows used. Nothing was recounted on 2026-11-05.
 *
 * `keys` is what the loaders write into `product.source` and
 * `observation.seller` (and `openstreetmap`, which has no column of its own:
 * it rides in through `observation.store_osm` and the live shop lookup). The
 * test in test/attribution.test.ts reads the loader files and fails when one
 * of them can emit a key that no entry here claims, so a new source cannot
 * ship uncredited.
 *
 * Return-It, Consignaction, ANBL and Walmart Canada publish no reuse licence.
 * Their terms were read on 2026-10-06 (requirement 4.8 of
 * docs/price-category-requirements-2026-10-01.md) and each entry records the
 * clause found, the date read and the verdict, rather than naming a licence
 * they do not carry. None of the four grants reuse. ANBL's robots.txt,
 * Walmart's terms and Return-It's robots.txt forbid the automated reading that
 * collected the data; Consignaction's terms allow personal non-commercial
 * copying only. Decision 2026-11-05: Pexi must hold the rights to everything
 * it shows, so these two sources are no longer used in answers; their entries
 * stay because the rows are still held and the loaders can still write them.
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
    what: 'Shelf prices photographed and submitted by contributors: 874 price observations, 417 distinct barcodes, seen between 2020-02-01 and 2026-08-26 (counted 2026-10-06).',
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
    what: 'The electronics and general product catalogue, 3,596,403 products, 296,300 of them listed for the Canadian market (counted 2026-10-06). Database Right data-sheet 2026 Icecat. All rights reserved. Provided AS IS, without warranty.',
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
    name: 'Statistics Canada',
    what: "Monthly average retail prices for 110 everyday products, by province, from table 18-10-0245-01 (newest month 2026-09, counted 2026-11-08). Used, adjusted to regular shelf prices, for a staple Pexi holds no store price for. Source: Statistics Canada. Table 18-10-0245-01 Monthly average retail prices for selected products. Contains information licensed under the Open Government Licence - Canada.",
    licence: 'Open Government Licence - Canada',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501',
    keys: ['statcan'],
  },
  {
    name: 'Project Hammer',
    what: 'Shelf prices from nine Canadian grocers (Loblaws, No Frills, Metro, Walmart, Save-On-Foods, Sobeys, Voila, T and T, and Galleria), collected by Project Hammer for one Toronto neighbourhood: 98,918 price observations, 47,404 distinct barcodes, most seen in 2026 (counted 2026-11-07). Data from Project Hammer by Jacob Filipp.',
    licence: 'No licence stated by the publisher',
    url: 'https://jacobfilipp.com/hammer/',
    keys: ['hammer'],
  },
  {
    name: 'Kroger product names (2022 listing)',
    what: 'Product names for 84,863 US grocery barcodes, taken from a 2022 copy of Kroger product listings published on GitHub by atehe (counted 2026-11-22). Only the names and any size in them are used; its prices are not.',
    licence: 'No licence stated by the publisher',
    url: 'https://github.com/atehe',
    keys: ['kroger-names'],
  },
  {
    name: 'Alcool NB Liquor (ANBL)',
    what: "Not used in any answer since 2026-10-10. Barcodes, product names and shelf prices from ANBL's public price list PDF: 6,741 price observations (counted 2026-10-06). Fetched by an automated script, not by hand. ANBL states no reuse licence. Its Terms and Conditions (anbl.com/terms, read 2026-10-06) say 'Material from this Site may not be copied, reproduced, republished, uploaded, posted, transmitted or distributed in any way' and that viewing or downloading is 'solely for your own personal use for non-commercial purposes'. Its robots.txt (read 2026-10-06) says 'User-agent: * Disallow: /' and allows only Googlebot, Bingbot, Applebot and DuckDuckBot. Verdict: automated reading and reuse are both unlicensed; written permission from ANBL is needed.",
    licence: 'No reuse licence; terms read 2026-10-06 forbid copying and redistribution (personal non-commercial use only) and robots.txt disallows automated readers; permission needed',
    url: 'https://www.anbl.com/terms',
    keys: ['anbl'],
  },
  {
    name: 'Walmart Canada',
    what: "Not used in any answer since 2026-10-10. Shelf prices read from public walmart.ca product pages by an automated reader: 22 price observations (counted 2026-10-06). Walmart states no reuse licence. Its Walmart Canada Terms of Use (walmart.ca/en/help/legal/TermsOfUse, clause text as returned by a search extract on 2026-10-06, because the page itself served a bot challenge to this reader) bar using 'any engine, software, tool, agent or other device or mechanism (including browsers, spiders, robots, avatars or intelligent agents) to scrape, navigate or search the Site', except Walmart's own search and generally available web browsers. Verdict: automated reading is forbidden; only prices a person reads and saves by hand are inside the terms, and reuse still needs Walmart's permission.",
    licence: 'No reuse licence; terms read 2026-10-06 forbid scrapers and robots, so only pages saved by hand are allowed and the 22 automated rows are outside the terms',
    url: 'https://www.walmart.ca/en/help/legal/TermsOfUse',
    keys: ['walmart.ca'],
  },
  {
    name: 'Return-It (British Columbia)',
    what: "Not used in any answer since 2026-11-05. Non-alcohol drink containers from BC's beverage container deposit registry: 8,940 products, all listed as sold in Canada (counted 2026-10-06). Collected by an automated crawler of the paged registry search, using a browser user agent. Return-It (Encorp Pacific (Canada)) states no reuse licence, and no website terms of use were found on return-it.ca (only a privacy policy and a copyright line, checked 2026-10-06). Its robots.txt (read 2026-10-06) says 'User-agent: * Disallow: /registeredbrands/', which is the path crawled. Verdict: automated reading of that registry is disallowed by the site; reuse terms are unclear and need Encorp's written answer.",
    licence: 'No reuse licence and no website terms found 2026-10-06; robots.txt disallows the registry path to automated readers; reuse unclear, ask Encorp Pacific',
    url: 'https://www.return-it.ca/registeredbrands/',
    keys: ['returnit'],
  },
  {
    name: 'Consignaction (Quebec)',
    what: "Not used in any answer since 2026-11-05. Drink containers from Quebec's beverage container deposit registry spreadsheet: 44,862 products, all listed as sold in Canada (counted 2026-10-06). One spreadsheet downloaded by a script from the site's public file link. Consignaction states no reuse licence. Its Termes et conditions (consignaction.ca/termes-et-conditions, read 2026-10-06) say copying or storing any element for purposes other than personal use is 'absolument defendue' without prior written permission, and allow download or copying 'pour utilisation personnelle a des fins non commerciales seulement'. They have no clause on robots or automated access, and robots.txt (read 2026-10-06) disallows only /wp/wp-admin/. Verdict: automated download of the one file is not barred, but reuse in a product is not licensed; written permission is needed.",
    licence: 'No reuse licence; terms read 2026-10-06 allow personal non-commercial copying only, no automation clause; reuse unclear, permission needed',
    url: 'https://consignaction.ca/termes-et-conditions/',
    keys: ['consignaction'],
  },
];

/*
 * WHAT THE PHONE SHOWS, AND WHAT IT DOES NOT.
 *
 * The list above is the record: dates as measured (ISO), the clause each
 * publisher's terms carried, the verdict on whether reuse is licensed. It is
 * written for the people who maintain it and is never sent to a phone.
 * `/api/attribution` sends `shopperSources()`, which is these words instead:
 * plain, dates as a month and a year, no licensing opinion. Same four fields the
 * "Where this comes from" screen reads (name, what, licence, url).
 *
 * The four sources with no reuse licence (ANBL, Walmart Canada, Return-It,
 * Consignaction) are held back from the phone. The record above says no answer
 * uses them (ANBL and Walmart Canada since 2026-10-10, Return-It and
 * Consignaction since 2026-11-05), so listing them as a source would be a
 * false credit, and the notes that are true of them are a legal reading, not a
 * shopper's business. If you disagree, the one-line change is to move a key
 * from WITHHELD into SHOPPER_WORDS with plain words of its own. WITHHELD says so
 * by key; a source that is in neither SHOPPER_WORDS nor WITHHELD fails the test,
 * so a new source cannot silently vanish from the screen. To show one again,
 * move it into SHOPPER_WORDS with its own plain words.
 */
export const SHOPPER_WORDS: Readonly<Record<string, { readonly what: string; readonly licence: string }>> = {
  openfoodfacts: {
    what: 'Product names, sizes and allergens for 121,949 grocery products, all listed as sold in Canada (counted October 2026). Contains information from Open Food Facts contributors.',
    licence: 'Open Database License (ODbL)',
  },
  openbeautyfacts: {
    what: 'The non-grocery slice of the catalogue: cosmetics, pet food and general products, 88,182 products combined, 1,700 of them listed as sold in Canada (counted October 2026). Contains information from the contributors to these databases.',
    licence: 'Open Database License (ODbL)',
  },
  openprices: {
    what: 'Shelf prices photographed and submitted by contributors: 874 price observations, 417 distinct barcodes, seen from February 2020 to August 2026 (counted October 2026).',
    licence: 'Open Database License (ODbL)',
  },
  openstreetmap: {
    what: 'Shop names and cities for the 88 OpenStreetMap places, under 46 distinct store names, that the Open Prices observations were made at, and the nearby-shop list the app builds from OpenStreetMap when you allow location (counted October 2026). Map data from OpenStreetMap contributors.',
    licence: 'Open Database License (ODbL), credit: OpenStreetMap contributors',
  },
  icecat: {
    what: 'The electronics and general product catalogue, 3,596,403 products, 296,300 of them listed for the Canadian market (counted October 2026). Database Right data-sheet 2026 Icecat. All rights reserved. Provided AS IS, without warranty.',
    licence: 'Icecat Open Content License Agreement and fair use policy',
  },
  usda: {
    what: 'Branded food names, sizes and ingredients for 429,593 products from the December 2025 release, 22 of them listed as sold in Canada (counted October 2026). Source: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central, fdc.nal.usda.gov.',
    licence: 'CC0 1.0 Universal (public domain); USDA asks to be cited',
  },
  bcldb: {
    what: 'Barcodes, product names and pre-tax prices from the June 2026 BC liquor store price list: 7,556 price observations, 7,555 distinct barcodes (counted October 2026). Contains information licensed under the Open Government Licence - British Columbia.',
    licence: 'Open Government Licence - British Columbia',
  },
  statcan: {
    what: 'Monthly average retail prices for 110 everyday products, by province, from table 18-10-0245-01 (newest month September 2026, counted November 2026). Used, adjusted to regular shelf prices, as a guide for an everyday staple when we have no store price for it. Source: Statistics Canada. Table 18-10-0245-01 Monthly average retail prices for selected products. Contains information licensed under the Open Government Licence - Canada.',
    licence: 'Open Government Licence - Canada',
  },
  hammer: {
    what: 'Shelf prices from nine Canadian grocers (Loblaws, No Frills, Metro, Walmart, Save-On-Foods, Sobeys, Voila, T&T, and Galleria), collected by Project Hammer for one Toronto neighbourhood: 98,918 price observations, 47,404 distinct barcodes, most seen in 2026 (counted November 2026). Data from Project Hammer by Jacob Filipp.',
    licence: 'Published by Project Hammer',
  },
  'kroger-names': {
    what: 'Product names for 84,863 US grocery barcodes, from a 2022 copy of Kroger product listings published on GitHub by atehe (counted November 2026). Names only.',
    licence: 'Published by atehe on GitHub',
  },
};

/** Source keys deliberately not on the phone: no answer uses them. See the note above SHOPPER_WORDS. */
export const WITHHELD: readonly string[] = ['anbl', 'walmart.ca', 'returnit', 'consignaction'];

/** One source as the "Where this comes from" screen reads it. */
export interface ShopperSource {
  readonly name: string;
  readonly what: string;
  readonly licence: string;
  readonly url: string;
}

/** What `/api/attribution` sends: the sources in use, in plain words. Nothing from the record leaves except name and url. */
export function shopperSources(): ShopperSource[] {
  const out: ShopperSource[] = [];
  for (const e of ATTRIBUTION) {
    const words = e.keys.map((k) => SHOPPER_WORDS[k]).find((w) => w !== undefined);
    if (words) out.push({ name: e.name, what: words.what, licence: words.licence, url: e.url });
  }
  return out;
}
