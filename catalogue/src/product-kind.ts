/**
 * Two small vocabularies the user-data catalogue (item 15) and the alternatives
 * model (item 18) both need: what KIND of product a thing is, and what TYPE of
 * store it was seen in.
 *
 * KIND decides how two products are compared. Jamin, 2026-09-17: "some grocery
 * items are scaled to weight for comparison. But things like tech products have
 * weight specs but cannot be compared based on that". Groceries compare on a
 * price per 100 g / 100 ml / each; tech compares on model and spec, and its
 * weight is never a comparison basis.
 *
 * STORE TYPE is his "branches": "A person shopping in a supermarket will
 * natrually not accept a farm product alternative. So the same product should
 * also be store with branches". The four onboarding answers he wrote (Supermarkets
 * & Groceries, Big Box Stores, Pharmacies & Drugstores, Other Retailers) are the
 * floor; farm and the online kinds are the ones alternatives constraints need
 * (item 18), and his examples are not the full list, so 'other' and 'unknown' are
 * real values and never an error.
 */

export type ProductKind = 'grocery' | 'tech' | 'other';

/** The catalogue source that carries electronics. Same fact routing.ts holds as TECH_SOURCES. */
const TECH_SOURCES: ReadonlySet<string> = new Set(['icecat']);
const GROCERY_SOURCES: ReadonlySet<string> = new Set(['openfoodfacts', 'openpetfoodfacts', 'openbeautyfacts']);

export function kindOfSource(source: string | null | undefined): ProductKind {
  const s = source?.trim().toLowerCase() ?? '';
  if (TECH_SOURCES.has(s)) return 'tech';
  if (GROCERY_SOURCES.has(s)) return 'grocery';
  return 'other';
}

/** Weight and volume are a comparison basis for groceries only. */
export function comparesOnUnitPrice(kind: ProductKind): boolean {
  return kind === 'grocery';
}

export type StoreType =
  | 'supermarket'
  | 'big_box'
  | 'pharmacy'
  | 'warehouse_club'
  | 'convenience'
  | 'farm'
  | 'farmers_market'
  | 'specialty'
  | 'online_retailer'
  | 'online_marketplace'
  | 'other'
  | 'unknown';

const STORE_WORDS: readonly (readonly [StoreType, RegExp])[] = [
  ['farmers_market', /farmers?\W*market|market stall|green\s?market/],
  // Not a bare /farm/: "Farm Boy" is a supermarket chain, and calling it a farm would
  // make switching mode refuse it for a supermarket shopper.
  ['farm', /^farm$|farm (stand|shop|gate|direct|store)|orchard|\bu-?pick|roadside stand|direct from (the )?(grower|producer)/],
  ['warehouse_club', /warehouse|\bclub\b|costco|sam'?s club|bulk store/],
  ['big_box', /big[\s-]?box|hypermarket|superstore|department store|walmart|target\b|carrefour/],
  ['pharmacy', /pharmac|drug\s?store|chemist|apothec/],
  ['supermarket', /supermarket|grocer|food store|market\b|aisle/],
  ['convenience', /convenience|corner store|kiosk|gas station|petrol/],
  ['online_marketplace', /ebay|marketplace|classified|kijiji|craigslist|second[\s-]?hand site/],
  ['online_retailer', /online|e-?commerce|website|amazon|web store/],
  ['specialty', /specialt|boutique|electronics store|butcher|bakery|deli\b/],
];

/**
 * Free text (a store's name or the user's own words) to a store type. Anything
 * not recognised is 'other' when there was text and 'unknown' when there was
 * none; neither blocks anything.
 */
export function normalizeStoreType(text: string | null | undefined): StoreType {
  const t = text?.trim().toLowerCase() ?? '';
  if (t === '') return 'unknown';
  const exact = (Object.keys(STORE_LABELS) as StoreType[]).find((k) => k === t.replace(/[\s-]+/g, '_'));
  if (exact) return exact;
  for (const [type, re] of STORE_WORDS) if (re.test(t)) return type;
  return 'other';
}

const STORE_LABELS: Readonly<Record<StoreType, true>> = {
  supermarket: true, big_box: true, pharmacy: true, warehouse_club: true, convenience: true,
  farm: true, farmers_market: true, specialty: true, online_retailer: true,
  online_marketplace: true, other: true, unknown: true,
};

/** A store type where the seller is the producer: the farm-vs-store constraint reads this. */
export function isDirectFromProducer(type: StoreType): boolean {
  return type === 'farm' || type === 'farmers_market';
}
