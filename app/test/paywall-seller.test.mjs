/**
 * Legal review 2026-11-17 (docs/security-check/legal-review-2026-11-17.md):
 * question 13, Pexi is the merchant under the Quebec CPA, so the paywall names
 * the seller, a contact and who refunds; question 14, the You screen's store
 * row is labelled "Manage or cancel subscription". Both languages, since
 * Quebec reads the French. Seen red before the strings existed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cell = new Map();
globalThis.localStorage = { getItem: (k) => cell.get(k) ?? null, setItem: (k, v) => cell.set(k, String(v)), removeItem: (k) => cell.delete(k) };

const { paywallBody } = await import('../public/js/screens/paywall.js');
const { TABLES } = await import('../public/js/ui-strings.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const plans = [
  { id: 'monthly', priceString: 'CA$3.99', title: 'Pexi Plus Monthly', period: 'month' },
  { id: 'yearly', priceString: 'CA$29.99', title: 'Pexi Plus Yearly', period: 'year' },
];

test('the plans paywall names the seller, a contact and who refunds, and the refunder matches the store', () => {
  const words = text(paywallBody('plans', { plans }));
  assert.match(words, /Sold by Jamin Xu \(Pexi\)/);
  assert.match(words, /useshinapp@gmail\.com/);
  assert.match(words, /Refunds are handled by Apple/);
  const android = text(paywallBody('plans', { plans, platform: 'android' }));
  assert.match(android, /Sold by Jamin Xu \(Pexi\)\. Contact: useshinapp@gmail\.com\. Refunds are handled by Google Play\./);
  assert.doesNotMatch(android, /Apple/);
  const web = text(paywallBody('plans', { plans, platform: 'web' }));
  assert.match(web, /useshinapp@gmail\.com/);
  assert.doesNotMatch(web, /Refunds are handled by (Apple|Google)/);
  assert.match(web, /Refunds are handled by the store you bought from/);
});

test('the seller line has a French twin naming the same seller and contact', () => {
  const fr = TABLES.fr.paywall_seller;
  assert.equal(typeof fr, 'string');
  assert.match(fr, /Jamin Xu \(Pexi\)/);
  assert.match(fr, /useshinapp@gmail\.com/);
  assert.match(fr, /Apple/);
  assert.match(TABLES.fr.paywall_seller_android, /Google Play/);
  assert.doesNotMatch(TABLES.fr.paywall_seller_android, /Apple/);
  assert.match(TABLES.fr.paywall_seller_android, /useshinapp@gmail\.com/);
  assert.match(TABLES.fr.paywall_seller_web, /useshinapp@gmail\.com/);
});

test('the You row is labelled "Manage or cancel subscription", French too', () => {
  assert.equal(TABLES.en.you_manage_sub, 'Manage or cancel subscription');
  assert.match(TABLES.fr.you_manage_sub, /annuler/i);
});

test('the iPhone app has the Manage or cancel row (Apple subscriptions page); a browser tab still has none', async () => {
  const { manageSubscriptionUrl } = await import('../public/js/screens/you.js');
  assert.equal(manageSubscriptionUrl({ Capacitor: { getPlatform: () => 'ios' } }), 'https://apps.apple.com/account/subscriptions');
  assert.equal(manageSubscriptionUrl({ Capacitor: { getPlatform: () => 'android' } }), 'https://play.google.com/store/account/subscriptions');
  assert.equal(manageSubscriptionUrl({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' } }), '');
});
