/**
 * The market a scan is made in. Beta-gaps item 19.
 *
 * Jamin, 2026-09-17: "Shin will work for all locations accross the world in all
 * languages." and "Same country products can be compared but the same product
 * outisde the country cannot be. This is also subject to exceptions. Some
 * provinces in the same country might have very different prices whereas some
 * countries like the eu might have similar prices accross countries. Shin should
 * be able to identify all of these constraints and prompt gemini accordingly
 * (This is a complex and difficult system to build that will need further
 * deisgn)".
 *
 * Until this file the catalogue side assumed Canada in three places: the
 * alternatives query filtered `sold_in_canada = 1`, the spine printed 'CAD' on
 * every amount, and the gauge read an absent currency as CAD. A market is now an
 * explicit value, derived from where the user is, and passed in.
 *
 * WHAT THIS FILE WILL NOT DO
 *  - Convert a currency. There is no exchange rate anywhere in Shin. A price in
 *    one currency is never compared with a price in another (`samePriceBasis`).
 *  - Guess. An unknown country gives an unknown currency and `comparability`
 *    answers 'unknown'. A market is never defaulted to Canada or anywhere else.
 *  - Decide the exceptions. Which regions of a country price differently, and
 *    which countries price alike, "will need further design". This file carries
 *    two small, labelled starting sets (below) that turn into prompt text; they
 *    are hints for Gemini, not verdicts, and the prompt fragment says so.
 */

export interface Market {
  /** ISO 3166-1 alpha-2, upper case. Null when the location is unknown. */
  readonly country: string | null;
  /** Province, state or similar, as the location gave it. Null when unknown. */
  readonly region: string | null;
  /** ISO 4217, upper case. Null when neither the location nor the country table gave one. */
  readonly currency: string | null;
  /** Where this market came from. Always the user's location; 'unknown' when there was none. */
  readonly derivedFrom: 'user_location' | 'unknown';
}

export const UNKNOWN_MARKET: Market = {
  country: null,
  region: null,
  currency: null,
  derivedFrom: 'unknown',
};

/**
 * Country to its currency, for the countries where one currency is the answer.
 * A missing country is not a bug: the market's currency is then null, and
 * anything that needs one asks the location for it (`location.currency`).
 */
const CURRENCY_OF_COUNTRY: Readonly<Record<string, string>> = {
  CA: 'CAD', US: 'USD', MX: 'MXN', GB: 'GBP', IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR',
  IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
  SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON',
  BG: 'BGN', AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD',
  SG: 'SGD', IN: 'INR', ID: 'IDR', TH: 'THB', VN: 'VND', PH: 'PHP', MY: 'MYR', AE: 'AED',
  SA: 'SAR', IL: 'ILS', TR: 'TRY', ZA: 'ZAR', NG: 'NGN', EG: 'EGP', KE: 'KES', BR: 'BRL',
  AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
};

/** Countries whose own regions are known to price differently. A hint for the prompt, not a rule. */
const REGIONS_PRICE_DIFFERENTLY: ReadonlySet<string> = new Set([
  'CA', 'US', 'AU', 'IN', 'CN', 'BR', 'MX', 'DE', 'RU', 'ID',
]);

/** EU member states, the standing example of countries that can price alike. A hint, not a rule. */
const EU: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/** What a phone or a settings screen can tell us about where the user is. */
export interface UserLocation {
  readonly country?: string | null;
  readonly region?: string | null;
  /** An explicit currency from the location or the device, which outranks the country table. */
  readonly currency?: string | null;
}

function clean(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/**
 * The market of one scan, from the user's location. Never from Shin's own data,
 * never defaulted. No location, or a country that is not two letters, is the
 * unknown market.
 */
export function marketFromLocation(loc: UserLocation | null | undefined): Market {
  const raw = clean(loc?.country)?.toUpperCase() ?? null;
  const country = raw && /^[A-Z]{2}$/.test(raw) ? raw : null;
  const explicit = clean(loc?.currency)?.toUpperCase() ?? null;
  const currency = explicit && /^[A-Z]{3}$/.test(explicit) ? explicit : country ? (CURRENCY_OF_COUNTRY[country] ?? null) : null;
  if (country === null && currency === null) return UNKNOWN_MARKET;
  return { country, region: clean(loc?.region), currency, derivedFrom: 'user_location' };
}

/**
 * English country names to ISO 3166-1 alpha-2, for a client that stores the name
 * the user picked ("Canada", "United States") and not the code. Only names this
 * table knows resolve; anything else is null, which is the unknown market and is
 * never guessed. The client keeps sending the name in English whatever its
 * language (`app/public/js/screens/market.js`).
 */
const COUNTRY_CODE_OF_NAME: Readonly<Record<string, string>> = {
  canada: 'CA', 'united states': 'US', 'united states of america': 'US', usa: 'US', mexico: 'MX',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', ireland: 'IE', france: 'FR', germany: 'DE',
  spain: 'ES', italy: 'IT', netherlands: 'NL', belgium: 'BE', portugal: 'PT', austria: 'AT',
  finland: 'FI', greece: 'GR', luxembourg: 'LU', switzerland: 'CH', sweden: 'SE', norway: 'NO',
  denmark: 'DK', poland: 'PL', 'czech republic': 'CZ', czechia: 'CZ', hungary: 'HU', romania: 'RO',
  australia: 'AU', 'new zealand': 'NZ', japan: 'JP', 'south korea': 'KR', china: 'CN',
  'hong kong': 'HK', taiwan: 'TW', singapore: 'SG', india: 'IN', indonesia: 'ID', thailand: 'TH',
  vietnam: 'VN', philippines: 'PH', malaysia: 'MY', 'united arab emirates': 'AE', 'saudi arabia': 'SA',
  israel: 'IL', turkey: 'TR', 'south africa': 'ZA', nigeria: 'NG', egypt: 'EG', kenya: 'KE',
  brazil: 'BR', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE',
};

/** A two-letter code as given, or an English country name resolved through the table. Null when neither. */
export function countryCodeOf(text: string | null | undefined): string | null {
  const t = clean(text);
  if (t === null) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRY_CODE_OF_NAME[t.toLowerCase()] ?? null;
}

export type Comparability =
  /** Same country: prices compare, subject to the region hint below. */
  | 'same_country'
  /** Different countries: prices do not compare, whatever the product. */
  | 'different_country'
  /** Different countries that may price alike (both in the EU). Gemini decides, and marks it. */
  | 'possibly_alike'
  /** One side's country is unknown. Nothing is claimed either way. */
  | 'unknown';

export interface ComparabilityJudgement {
  readonly comparability: Comparability;
  /** Same country, but regions of it are known to price differently. Ask for the same region. */
  readonly regionMatters: boolean;
  /** Same currency is a floor for any comparison, not a sufficient condition. */
  readonly sameCurrency: boolean;
}

/**
 * Whether prices from two markets may be set against each other. This is the
 * starting hint that goes to Gemini (see `Shin_Gemini_Pricing_Engine/
 * market_rules_fragment.md`); it is not a price and it converts nothing.
 */
export function comparability(a: Market, b: Market): ComparabilityJudgement {
  const sameCurrency = a.currency !== null && a.currency === b.currency;
  if (a.country === null || b.country === null) {
    return { comparability: 'unknown', regionMatters: false, sameCurrency };
  }
  if (a.country === b.country) {
    const regionMatters =
      REGIONS_PRICE_DIFFERENTLY.has(a.country) &&
      (a.region === null || b.region === null || a.region.toLowerCase() !== b.region.toLowerCase());
    return { comparability: 'same_country', regionMatters, sameCurrency };
  }
  if (EU.has(a.country) && EU.has(b.country) && sameCurrency) {
    return { comparability: 'possibly_alike', regionMatters: false, sameCurrency };
  }
  return { comparability: 'different_country', regionMatters: false, sameCurrency };
}

/**
 * The values for the `{{MARKET_*}}`, `{{REGION_MATTERS_HINT}}` and
 * `{{CROSS_BORDER_HINT}}` placeholders of `Shin_Gemini_Pricing_Engine/
 * market_rules_fragment.md`. Unknown parts are the word "unknown", never a guess.
 * The hints are Shin's starting point for a rule "that will need further design";
 * Gemini is told to reason from them, not to obey them blindly.
 */
export function marketPromptFields(market: Market): Record<string, string> {
  return {
    MARKET_COUNTRY_OR_UNKNOWN: market.country ?? 'unknown',
    MARKET_REGION_OR_UNKNOWN: market.region ?? 'unknown',
    MARKET_CURRENCY_OR_UNKNOWN: market.currency ?? 'unknown',
    REGION_MATTERS_HINT:
      market.country === null ? 'unknown' : REGIONS_PRICE_DIFFERENTLY.has(market.country) ? 'yes' : 'no',
    CROSS_BORDER_HINT:
      market.country !== null && EU.has(market.country) && market.currency === 'EUR'
        ? 'possibly_alike'
        : market.country === null
          ? 'unknown'
          : 'different_country_not_comparable',
  };
}

/**
 * True only when two prices are in the same known currency, which is the one
 * thing that must hold before their numbers may be subtracted. Unknown on either
 * side is false: an unverified pair is not compared.
 */
export function samePriceBasis(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = clean(a)?.toUpperCase();
  const y = clean(b)?.toUpperCase();
  return x !== undefined && y !== undefined && x === y;
}

const SYMBOL_OF_CURRENCY: Readonly<Record<string, string>> = {
  CAD: '$', USD: '$', AUD: '$', NZD: '$', EUR: '€', GBP: '£', JPY: '¥',
};

/**
 * An amount for the user who is in that currency's market. A currency with a
 * well-known symbol prints the symbol; any other prints the code after the
 * number, so nobody reads 1,500 rupees as dollars. Null currency is the legacy
 * "no claim" case and prints a bare dollar sign, exactly as before markets
 * existed. The number is never converted.
 */
export function formatMoney(cents: number, currency: string | null | undefined): string {
  const n = (cents / 100).toFixed(2);
  const c = clean(currency)?.toUpperCase() ?? null;
  if (c === null) return `$${n}`;
  const symbol = SYMBOL_OF_CURRENCY[c];
  return symbol ? `${symbol}${n}` : `${n} ${c}`;
}
