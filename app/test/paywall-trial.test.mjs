/**
 * The Cal AI-style paywall (Aurik, 2026-11-11: "create the paywall and the images
 * pasted are the types of inspiration that we are going for"): the steps column,
 * two plan cards side by side, and a free trial shown ONLY when the store reports
 * one this account can still take. A trial lives in App Store Connect / Play
 * Console, never in this app; promising one the store then charges for is what
 * review rejects. These tests hold the screen to that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const cell = new Map();
globalThis.localStorage = { getItem: (k) => cell.get(k) ?? null, setItem: (k, v) => cell.set(k, String(v)), removeItem: (k) => cell.delete(k) };

const { paywallBody, stepsHtml, chargeDay } = await import('../public/js/screens/paywall.js');
const purchases = await import('../public/js/purchases.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const NOW = new Date('2026-11-11T15:00:00Z');
const plans = (trialDays = 0) => [
  { id: 'monthly', priceString: 'CA$3.99', title: 'Pexi Plus Monthly', period: 'month' },
  { id: 'yearly', priceString: 'CA$29.99', title: 'Pexi Plus Yearly', period: 'year', perMonthString: 'CA$2.50', ...(trialDays ? { trialDays } : {}) },
];

test('no store trial: no trial words anywhere, the steps say what free and Plus give', () => {
  const html = paywallBody('plans', { plans: plans(), now: NOW });
  const words = text(html);
  assert.doesNotMatch(words, /trial|days free|No payment due|free trial/i, `a trial is promised that the store does not offer: ${words}`);
  assert.match(words, /10 barcode scans every week/);
  assert.match(words, /100 barcode scans every week/);
  assert.match(words, /Cancel anytime/);
  assert.match(html, /data-act="subscribe"[^>]*>Subscribe</);
});

test('a store trial on the chosen plan: the timeline, the charge day and price, the tab, "No payment due now", the trial button', () => {
  const html = paywallBody('plans', { plans: plans(3), now: NOW, chosen: 'yearly' });
  const words = text(html);
  const day = chargeDay(3, NOW);
  assert.match(words, /Today Pexi Plus starts: 100 barcode scans every week\./);
  assert.ok(words.includes(`Until ${day}`), words);
  assert.ok(words.includes(`${day}: billing starts You are charged CA$29.99 a year unless you cancel`), words);
  assert.match(html, /data-pw-tab[^>]*>3 days free</);
  assert.match(words, /No payment due now/);
  assert.match(html, /data-act="subscribe"[^>]*>Start my 3[-‑]day free trial</);
  assert.doesNotMatch(words, /remind/i, 'Pexi sends no reminder, so the screen must not promise one');
});

test('the trial follows the chosen plan: choosing monthly (no trial) drops every trial word', () => {
  const words = text(paywallBody('plans', { plans: plans(3), now: NOW, chosen: 'monthly' }));
  assert.doesNotMatch(words, /No payment due|Start my|billing starts/i, words);
  // The tab stays on the yearly card: it says what that card offers.
  assert.match(words, /3 days free/);
});

test('monthly sits on the left, yearly on the right, yearly preselected', () => {
  const html = paywallBody('plans', { plans: plans(), now: NOW });
  assert.ok(html.indexOf('data-plan="monthly"') < html.indexOf('data-plan="yearly"'));
  assert.match(html, /data-plan="yearly"/);
  assert.match(html.slice(html.indexOf('data-plan="yearly"') - 120), /aria-checked="true"/);
});

test('the Android screen names Google Play in the cancel step, the iPhone one Apple ID', () => {
  assert.match(text(stepsHtml(plans()[1], { platform: 'android', now: NOW })), /Google Play subscriptions/);
  assert.match(text(stepsHtml(plans()[1], { platform: 'ios', now: NOW })), /Apple ID settings/);
});

test('trialDaysOf: only a free intro price in days or weeks is a trial', () => {
  assert.equal(purchases.trialDaysOf({ introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 3 } }), 3);
  assert.equal(purchases.trialDaysOf({ introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 } }), 7);
  assert.equal(purchases.trialDaysOf({ introPrice: { price: 0.99, periodUnit: 'DAY', periodNumberOfUnits: 3 } }), 0, 'a paid intro is not free');
  assert.equal(purchases.trialDaysOf({ introPrice: { price: 0, periodUnit: 'MONTH', periodNumberOfUnits: 1 } }), 0);
  assert.equal(purchases.trialDaysOf({}), 0);
  assert.equal(purchases.trialDaysOf(null), 0);
});

function fakeWin({ intro = true, status = 2, check = true } = {}) {
  const product = (id, price, period, extra = {}) => ({ identifier: id, priceString: price, subscriptionPeriod: period, title: id, ...extra });
  const yearly = product('pexi_plus_yearly', 'CA$29.99', 'P1Y', intro ? { introPrice: { price: 0, priceString: 'CA$0.00', periodUnit: 'DAY', periodNumberOfUnits: 3 } } : {});
  const plugin = {
    configure: async () => {},
    getOfferings: async () => ({ all: { default: { availablePackages: [{ product: product('pexi_plus_monthly', 'CA$3.99', 'P1M') }, { product: yearly }] } } }),
  };
  if (check) plugin.checkTrialOrIntroductoryPriceEligibility = async ({ productIdentifiers }) => Object.fromEntries(productIdentifiers.map((id) => [id, { status }]));
  return {
    Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => true, Plugins: { Purchases: plugin } },
    SHIN_RC_KEYS: { ios: 'appl_test' },
  };
}

test('loadPlans marks a trial only for an eligible account; ineligible, unknown or an unanswerable check shows none', async () => {
  const days = async (opts) => {
    purchases.resetPurchasesForTests();
    const out = await purchases.loadPlans(fakeWin(opts));
    return out.plans.find((p) => p.id === 'yearly').trialDays ?? 0;
  };
  assert.equal(await days({ status: 2 }), 3, 'eligible: the trial shows');
  assert.equal(await days({ status: 1 }), 0, 'already used: no trial');
  assert.equal(await days({ status: 0 }), 0, 'unknown: no trial promised');
  assert.equal(await days({ check: false }), 0, 'no eligibility check available: no trial promised');
  assert.equal(await days({ intro: false }), 0, 'no intro offer on the product: no trial');
  purchases.resetPurchasesForTests();
});
