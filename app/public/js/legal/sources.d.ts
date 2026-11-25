/** Types for sources.js, so src/attribution.ts can import the shared list under tsc without allowJs. */
export interface ShopperSourceEntry {
  readonly key: string;
  readonly name: string;
  readonly what: string;
  readonly licence: string;
  readonly url: string;
}
export declare const SHOPPER_SOURCES: readonly ShopperSourceEntry[];
