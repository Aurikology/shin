/**
 * The data credits a shopper sees, in plain words: one list, read by three places.
 *
 *   - the "Terms, Privacy and Data" document (legal/document.js), in the app and on the hosted pages;
 *   - `/api/attribution` on the server (src/attribution.ts `shopperSources()` maps this list);
 *   - the attribution tests, through src/attribution.ts `SHOPPER_WORDS`.
 *
 * Until 2026-11-25 these words lived in src/attribution.ts only and the app fetched them, so the credits
 * could not show offline. They moved here so the in-app document and the hosted pages print the same list
 * from one copy. The full record (ISO dates, each publisher's clause, the sources no answer uses) stays in
 * src/attribution.ts `ATTRIBUTION`; a test holds that every key here has an entry there with the same
 * name and url, and that every entry there is either here or in `WITHHELD`.
 *
 * Plain text only: the renderers escape it. Dates read as a month and a year (a test holds it).
 */

export const SHOPPER_SOURCES = Object.freeze([
  {
    key: 'openfoodfacts',
    name: 'Open Food Facts',
    what: 'Product names, sizes and allergens for 121,949 grocery products, all listed as sold in Canada (counted October 2026). Contains information from Open Food Facts contributors.',
    licence: 'Open Database License (ODbL)',
    url: 'https://world.openfoodfacts.org',
  },
  {
    key: 'openbeautyfacts',
    name: 'Open Beauty Facts, Open Pet Food Facts and Open Products Facts',
    what: 'The non-grocery slice of the catalogue: cosmetics, pet food and general products, 88,182 products combined, 1,700 of them listed as sold in Canada (counted October 2026). Contains information from the contributors to these databases.',
    licence: 'Open Database License (ODbL)',
    url: 'https://world.openproductsfacts.org',
  },
  {
    key: 'openprices',
    name: 'Open Prices',
    what: 'Shelf prices photographed and submitted by contributors: 874 price observations, 417 distinct barcodes, seen from February 2020 to August 2026 (counted October 2026).',
    licence: 'Open Database License (ODbL)',
    url: 'https://prices.openfoodfacts.org',
  },
  {
    key: 'openstreetmap',
    name: 'OpenStreetMap',
    what: 'Shop names and cities for the 88 OpenStreetMap places, under 46 distinct store names, that the Open Prices observations were made at, and the nearby-shop list the app builds from OpenStreetMap when you allow location (counted October 2026). Map data from OpenStreetMap contributors.',
    licence: 'Open Database License (ODbL), credit: OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    key: 'icecat',
    name: 'Open Icecat',
    what: 'The electronics and general product catalogue, 3,596,403 products, 296,300 of them listed for the Canadian market (counted October 2026). Database Right data-sheet 2026 Icecat. All rights reserved. Provided AS IS, without warranty.',
    licence: 'Icecat Open Content License Agreement and fair use policy',
    url: 'https://iceclog.com/open-icecat-fair-use-policy/',
  },
  {
    key: 'usda',
    name: 'USDA FoodData Central',
    what: 'Branded food names, sizes and ingredients for 429,593 products from the December 2025 release, 22 of them listed as sold in Canada (counted October 2026). Source: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central, fdc.nal.usda.gov.',
    licence: 'CC0 1.0 Universal (public domain); USDA asks to be cited',
    url: 'https://fdc.nal.usda.gov/',
  },
  {
    key: 'bcldb',
    name: 'BC Liquor Distribution Branch',
    what: 'Barcodes, product names and pre-tax prices from the June 2026 BC liquor store price list: 7,556 price observations, 7,555 distinct barcodes (counted October 2026). Contains information licensed under the Open Government Licence - British Columbia.',
    licence: 'Open Government Licence - British Columbia',
    url: 'https://catalogue.data.gov.bc.ca/dataset/bc-liquor-store-product-price-list-historical-prices',
  },
  {
    key: 'statcan',
    name: 'Statistics Canada',
    what: 'Monthly average retail prices for 110 everyday products, by province, from table 18-10-0245-01 (newest month September 2026, counted November 2026). Used, adjusted to regular shelf prices, as a guide for an everyday staple when we have no store price for it. Source: Statistics Canada. Table 18-10-0245-01 Monthly average retail prices for selected products. Contains information licensed under the Open Government Licence - Canada.',
    licence: 'Open Government Licence - Canada',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501',
  },
  {
    key: 'hammer',
    name: 'Project Hammer',
    what: 'Shelf prices from nine Canadian grocers (Loblaws, No Frills, Metro, Walmart, Save-On-Foods, Sobeys, Voila, T&T, and Galleria), collected by Project Hammer for one Toronto neighbourhood: 98,918 price observations, 47,404 distinct barcodes, most seen in 2026 (counted November 2026). Data from Project Hammer by Jacob Filipp.',
    licence: 'Published by Project Hammer',
    url: 'https://jacobfilipp.com/hammer/',
  },
  {
    key: 'kroger-names',
    name: 'Kroger product names (2022 listing)',
    what: 'Product names for 84,863 US grocery barcodes, from a 2022 copy of Kroger product listings published on GitHub by atehe (counted November 2026). Names only.',
    licence: 'Published by atehe on GitHub',
    url: 'https://github.com/atehe',
  },
  {
    key: 'kroger',
    name: 'Kroger',
    what: 'US shelf prices by barcode at Kroger family stores, read through the Kroger Developer API for the products US shoppers scan (from November 2026).',
    licence: 'Kroger Developer API terms',
    url: 'https://developer.kroger.com',
  },
].map((s) => Object.freeze(s)));
