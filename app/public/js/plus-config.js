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
    monthly: 'pexi_plus_monthly',
    yearly: 'pexi_plus_yearly',
  }),
});

/**
 * Terms and Privacy, linked from the subscription screen (Apple rejects a
 * subscription screen without both).
 *
 * Both pages are static files hosted on GitHub Pages, away from the app's own
 * server (source: `docs/store/`, the same pages the App Store listing's
 * Privacy Policy and Support URLs name). They load for anyone, including a
 * store reviewer, with the server asleep or the invite gate on. There is one
 * copy, in English; the old pages under `app/public/legal/`, French twins
 * included, were removed 2026-11-05 because they described exact GPS and
 * photos sent to Gemini, which this build does not do.
 */
export const LEGAL_URLS = Object.freeze({
  terms: 'https://xu826jamin.github.io/pexi/terms.html',
  privacy: 'https://xu826jamin.github.io/pexi/privacy.html',
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
