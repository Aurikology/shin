/**
 * Shin Plus, in one place (2026-09-21, docs/mvp-plan.md "Subscription").
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
 * TODO(before any store submission): both are placeholders. The privacy policy
 * exists only as a draft (notes/privacy-policy-draft.md) that the founder
 * reviews and hosts; no terms of use has been written at all. Replace each
 * value with the real hosted https URL. `.invalid` is reserved (RFC 2606), so a
 * placeholder can never resolve to somebody else's page.
 */
export const LEGAL_URLS = Object.freeze({
  terms: 'https://TODO-terms-of-use-not-written.invalid/',
  privacy: 'https://TODO-host-notes-privacy-policy-draft.invalid/',
});

/**
 * "Manage subscription": each store's own page, which is the only place a
 * subscription is changed or cancelled. Apple's opens the Subscriptions list
 * in Settings; Google's opens the Play subscriptions list.
 */
export const MANAGE_URLS = Object.freeze({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
});
