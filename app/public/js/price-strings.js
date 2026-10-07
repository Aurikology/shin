/**
 * The words for the shopper-price path: the shop picker, the honest "did it go
 * through" lines on the correction and price-only cards, the thumbs follow-up,
 * and the "Your report" line under the chart.
 *
 * ITS OWN TABLE, in the two languages `ui-strings.js` carries, read through the
 * same `locale()`. Kept apart because the shared table belongs to another part
 * of the build while this path was being fixed (walkthrough D01 to D09); a key
 * missing from a table shows its own name on screen, so a missing key here
 * reports itself the same way `t()` does.
 *
 * No sentence here claims a write the server did not confirm. "Recorded" and
 * "Written down" are said only by the caller that holds `stored: true`; the
 * lines below are the ones for every other outcome.
 */
import { locale } from './lib/locale.js';

const EN = {
  shop_search_label: 'Search or type a shop',
  shop_search_placeholder: 'Search shops',
  shop_not_listed: 'Not on the list: use this name',
  shop_nearby: 'Nearby',
  shop_needed: 'Pick the shop first. A price is filed under the shop it was seen in.',
  shop_required_hint: 'Choose a shop to file this price.',
  report_sending: 'Sending...',
  report_failed: 'That did not go through. Nothing was recorded.',
  report_failed_offline: 'That did not go through. Pexi kept it and will send it when you are back online.',
  report_refused: ({ why }) => `That did not go through: ${why}`,
  report_retry: 'Retry',
  rating_failed: 'That did not go through.',
  rating_reason_q: 'What was off?',
  rating_reason_wrong_product: 'Wrong product',
  rating_reason_wrong_price: 'Wrong price',
  rating_reason_no_price: 'No price',
  rating_reason_too_slow: 'Too slow',
  your_report_waiting: ({ price, store }) => `Your report: ${price} at ${store}, counts once a second source agrees`,
  your_report_agreed: ({ price, store }) => `Your report: ${price} at ${store}, a second source agrees`,
};

const FR = {
  shop_search_label: 'Chercher ou saisir un magasin',
  shop_search_placeholder: 'Chercher un magasin',
  shop_not_listed: 'Pas dans la liste : utiliser ce nom',
  shop_nearby: 'À proximité',
  shop_needed: 'Choisissez d’abord le magasin. Un prix est classé sous le magasin où il a été vu.',
  shop_required_hint: 'Choisissez un magasin pour enregistrer ce prix.',
  report_sending: 'Envoi...',
  report_failed: 'Ça n’a pas passé. Rien n’a été enregistré.',
  report_failed_offline: 'Ça n’a pas passé. Pexi l’a gardé et l’enverra à votre retour en ligne.',
  report_refused: ({ why }) => `Ça n’a pas passé : ${why}`,
  report_retry: 'Réessayer',
  rating_failed: 'Ça n’a pas passé.',
  rating_reason_q: 'Qu’est-ce qui n’allait pas ?',
  rating_reason_wrong_product: 'Mauvais produit',
  rating_reason_wrong_price: 'Mauvais prix',
  rating_reason_no_price: 'Pas de prix',
  rating_reason_too_slow: 'Trop lent',
  your_report_waiting: ({ price, store }) => `Votre signalement : ${price} chez ${store}, compte dès qu’une seconde source concorde`,
  your_report_agreed: ({ price, store }) => `Votre signalement : ${price} chez ${store}, une seconde source concorde`,
};

const TABLES = { en: EN, fr: FR };

/** One string for the shopper-price path, in the language in force. */
export function pt(key, facts = {}) {
  const table = TABLES[locale()] ?? EN;
  const value = table[key] ?? EN[key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(facts ?? {}) : value;
}

/** The key sets, for the test that holds the two languages to the same keys. */
export const PRICE_TABLES = TABLES;
