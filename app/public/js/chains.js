/**
 * The shops Pexi's own data already names, bundled so the shop picker has a
 * list the instant it opens (walkthrough D03: the old picker waited ten
 * seconds on OpenStreetMap and then showed nothing).
 *
 * DERIVED, NOT INVENTED. Generated on 2026-10-06 from `chainsFromData` in
 * app/src/stores.ts: the `store_name` column of price/data/prices.db (Open
 * Prices rows) merged with the banners app/src/price-match.ts names, most-priced
 * first. A chain the data has never seen is not here; the picker's free-text
 * box is for that. `/api/store-chains` serves the same list fresh, and
 * `shops.js` swaps it in when it arrives, so this file is the floor and never
 * the ceiling.
 *
 * Plain names and no ids: a chain is not a branch, and the picker keys a chosen
 * chain as `chain:<folded name>` (shops.js `chainId`).
 */
export const BUNDLED_CHAINS = Object.freeze([
  'Walmart',
  'London Drugs',
  'Real Canadian Superstore',
  'Save-On-Foods',
  'Choices Market',
  'Costco',
  'Dollarama',
  'Marché Adonis',
  'Best Buy',
  'Food Basics',
  'FreshCo',
  'Giant Tiger',
  'Maxi',
  'Metro',
  'No Frills',
  'Sobeys',
  '大統華 T&T Supermarket',
  'Costco Business Center',
  'Healthy Planet',
  'Simons',
  'Thrifty Foods James Bay',
  'Dollar Tree',
  'IKEA',
  'La Cordée Plein Air',
  'Shoppers Drug Mart',
  'Walmart Supercentre',
  'Gosselin Photo',
  "Hudson's Bay",
  'Jean Coutu',
  'La Vieille Europe',
  'Mayrand Entrepot d Alimentation',
  'Sephora',
  'Winners',
  'Zehrs',
  'Arhoma',
  'Calgary Co-op Dalhousie Centre',
  'Dominion',
  'Farm Boy',
  'Fortinos',
  "Goodway's Specialty Foods",
  'IGA',
  'Les jeux Ludold',
  'Librairie Fleury',
  'Lost Lake',
  'Marché Balkan',
  'Mediterranean Market',
  'Pharmaprix',
  'Provigo',
  'Super C',
  'Tour de Jeux',
]);
