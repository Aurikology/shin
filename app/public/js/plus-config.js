/**
 * Pexi Plus, in one place (2026-09-21, docs/mvp-plan.md "Subscription").
 *
 * Every name the store side has to match, and every outside URL the
 * subscription screen and the You screen link to. A screen reads these; it
 * never writes one of its own.
 *
 * NO PRICE HERE, AND NONE ANYWHERE IN THIS APP. The price on the subscription
 * screen is the store's own `priceString`, read from the RevenueCat offering at
 * the moment the screen opens (purchases.js `loadPlans`). A hard-coded price is
 * wrong the first time a store changes it, in a currency, or in a country.
 */

/** RevenueCat: the entitlement a purchase unlocks, the offering the screen reads, the store product ids. */
export const PLUS = Object.freeze({
  entitlement: 'plus',
  offering: 'default',
  products: Object.freeze({
    monthly: 'shin_plus_monthly',
    yearly: 'shin_plus_yearly',
  }),
});

/**
 * Terms and Privacy, linked from the subscription screen (Apple rejects a
 * subscription screen without both).
 *
 * Both pages are hosted as plain HTML by the same server as the rest of the
 * app: `app/public/legal/terms.html` and `app/public/legal/privacy.html`
 * (French: `terms-fr.html`, `privacy-fr.html`, linked from each page itself).
 * The server's static route serves `public/` without the invite code
 * (`app/server.ts`, "Static files are not gated"), so these load for anyone,
 * including a store reviewer with no invite.
 *
 * ABSOLUTE ON NATIVE, RELATIVE ON THE WEB. `window.SHIN_API_BASE` is the one
 * global `native/scripts/sync-web.mjs` injects into the native wrapper's copy
 * of this file, from `native/config/shin-api.config.json`'s `apiBase`; it is
 * never set when this file runs in an ordinary browser tab, where the page
 * that imported it is already being served by this same host. A native app
 * has no "same origin" of its own to be relative to, so it needs the real
 * hostname; a browser tab already has one, so a relative path keeps working
 * even if the hostname changes later and nobody has to touch this file.
 */
const API_BASE = typeof window !== 'undefined' && window.SHIN_API_BASE ? window.SHIN_API_BASE : '';
export const LEGAL_URLS = Object.freeze({
  terms: `${API_BASE}/legal/terms.html`,
  privacy: `${API_BASE}/legal/privacy.html`,
});

/** The same two pages in French. Each page also links to its other-language twin. */
export const LEGAL_URLS_FR = Object.freeze({
  terms: `${API_BASE}/legal/terms-fr.html`,
  privacy: `${API_BASE}/legal/privacy-fr.html`,
});

/**
 * The two plans as RULINGS.md "Pexi Plus pricing and free scans" sets them,
 * in cents of Canadian dollars (the monthly plan and the yearly plan). D32
 * (2026-10-06): the welcome flow's plans step printed placeholder prices.
 *
 * THIS IS ONLY A FALLBACK FOR THE WELCOME FLOW, which is off in the shipped
 * app. The subscription screen never reads it: its price is the store's own
 * `priceString` (purchases.js `loadPlans`), and the store product config stays
 * the source of truth. Cents, not a formatted string, so no price is written
 * as text anywhere in the client (test/client-paywall.test.mjs).
 */
export const PLAN_CENTS = Object.freeze({ monthly: 399, yearly: 2999 });

/** Cents as a Canadian-dollar price, with the CA mark in English and a trailing mark in French. */
export function formatPlanPrice(cents, lang = 'en') {
  const n = (Math.round(cents) / 100).toFixed(2);
  return lang === 'fr' ? `${n.replace('.', ',')} $ CA` : `CA$${n}`;
}

/** The facts the welcome flow's plan strings take: monthly, yearly, and the yearly plan per month. */
export function planFacts(lang = 'en') {
  return {
    monthly: formatPlanPrice(PLAN_CENTS.monthly, lang),
    yearly: formatPlanPrice(PLAN_CENTS.yearly, lang),
    perMonth: formatPlanPrice(PLAN_CENTS.yearly / 12, lang),
  };
}

/**
 * "Manage subscription": each store's own page, which is the only place a
 * subscription is changed or cancelled. Apple's opens the Subscriptions list
 * in Settings; Google's opens the Play subscriptions list.
 */
export const MANAGE_URLS = Object.freeze({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
});
