/**
 * Pexi 1.0 build 4: the subscription screen as App Review guideline 3.1.2 reads it
 * (2026-11-05, Jamin: submit Pexi 1.0 with working subscriptions).
 *
 * What the guideline wants on the screen, and what these tests pin:
 *   - each plan: a title, the store's localized price, and its billing period,
 *     all from the RevenueCat offering;
 *   - the renewal terms: renews automatically unless cancelled at least 24
 *     hours before the period ends, managed in Apple ID settings;
 *   - Terms of Use and Privacy Policy links to the hosted pages, and Restore;
 *   - a plan list that fails to load says so and offers Try again (never blank);
 *   - Plus says only what RULINGS.md "Pexi Plus pricing and free scans" gives:
 *     unlimited scans beyond the weekly free ones.
 * And the files that have to agree with it: the privacy manifest against the
 * App Privacy answers in docs/store/listing.md, the hosted pages, the build number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(here(rel), 'utf8').replace(/\r\n/g, '\n');

const purchases = await import('../public/js/purchases.js');
const paywall = (await import('../public/js/screens/paywall.js')).default;
const { LEGAL_URLS } = await import('../public/js/plus-config.js');

const HOSTED = { privacy: 'https://xu826jamin.github.io/pexi/privacy.html', terms: 'https://xu826jamin.github.io/pexi/terms.html' };

/* ------------------------------------------------------------ the screen */

function stubRoot() {
  const body = { innerHTML: '' };
  const listeners = [];
  return {
    innerHTML: '',
    body,
    querySelector: (sel) => (sel === '[data-pw-body]' ? body : null),
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: () => {},
    tap(sel, dataset = {}) {
      const target = { closest: (s) => (s === sel ? { dataset } : null) };
      for (const l of listeners) if (l.type === 'click') l.fn({ target });
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** An iPhone build with RevenueCat's plugin; `opts` bends one thing at a time. */
function iphone({ entitled = true, offeringsFail = 0, restoreFails = false, titles = true, platform = 'ios' } = {}) {
  const log = [];
  let failsLeft = offeringsFail;
  const pkg = (id, price, title, period) => ({
    identifier: id,
    product: { identifier: id, priceString: price, ...(titles ? { title } : {}), subscriptionPeriod: period },
  });
  const monthly = pkg('pexi_plus_monthly', 'CA$3.99', 'Pexi Plus Monthly', 'P1M');
  const yearly = pkg('pexi_plus_yearly', 'CA$29.99', 'Pexi Plus Yearly', 'P1Y');
  yearly.product.pricePerMonthString = 'CA$2.50';
  const info = { entitlements: { active: entitled ? { plus: { identifier: 'plus' } } : {} } };
  const Purchases = {
    configure: async () => {},
    getOfferings: async () => {
      log.push('getOfferings');
      if (failsLeft > 0) { failsLeft -= 1; throw new Error('offline'); }
      return { current: null, all: { default: { availablePackages: [monthly, yearly] } } };
    },
    purchasePackage: async (o) => { log.push(`purchase:${o.aPackage.identifier}`); return { customerInfo: info }; },
    restorePurchases: async () => {
      log.push('restore');
      if (restoreFails) throw new Error('store down');
      return { customerInfo: info };
    },
    getCustomerInfo: async () => ({ customerInfo: info }),
  };
  return {
    log,
    win: {
      SHIN_RC_KEYS: { ios: 'appl_test_public', android: 'goog_test_public' },
      Capacitor: { getPlatform: () => platform, isPluginAvailable: (n) => n === 'Purchases', Plugins: { Purchases } },
    },
  };
}

async function open(opts = {}, params = {}) {
  purchases.resetPurchasesForTests();
  storage.setItem('shin.plus', '0');
  const n = iphone(opts);
  const root = stubRoot();
  const stop = paywall.render(root, { params, go() {}, win: n.win });
  await settle(); await settle();
  return { root, stop, log: n.log, body: root.body.innerHTML, page: root.innerHTML };
}

test('3.1.2: each plan shows a title, the store price and its billing period, from the offering', async () => {
  const { body, stop } = await open();
  const plans = text(body);
  assert.match(plans, /Pexi Plus Monthly/, 'the monthly plan has no title');
  assert.match(plans, /Pexi Plus Yearly/, 'the yearly plan has no title');
  assert.match(plans, /CA\$3\.99 a month/);
  assert.match(plans, /CA\$29\.99 a year/);
  stop();
});

test('3.1.2: a store that sends no title still gets a title on each plan, and the period follows the store', async () => {
  const { body, stop } = await open({ titles: false });
  const plans = text(body);
  assert.match(plans, /Pexi Plus Monthly/);
  assert.match(plans, /Pexi Plus Yearly/);
  stop();
  // The period comes from the product's own subscriptionPeriod, not only from the plan id.
  const win = iphone().win;
  const offerings = await win.Capacitor.Plugins.Purchases.getOfferings();
  offerings.all.default.availablePackages[0].product.subscriptionPeriod = 'P1Y';
  win.Capacitor.Plugins.Purchases.getOfferings = async () => offerings;
  purchases.resetPurchasesForTests();
  const out = await purchases.loadPlans(win);
  assert.equal(out.plans.find((p) => p.id === 'monthly').period, 'year');
  assert.equal(out.plans.find((p) => p.id === 'yearly').period, 'year');
  assert.equal(out.plans.find((p) => p.id === 'yearly').title, 'Pexi Plus Yearly');
});

test('3.1.2: the screen states auto-renewal, the 24-hour cancel window and Apple ID settings', async () => {
  const { body, stop } = await open();
  const words = text(body);
  assert.match(words, /renews automatically/i);
  assert.match(words, /at least 24 hours before the (end of the )?(current )?period/i);
  assert.match(words, /Apple ID (account )?settings/i);
  assert.doesNotMatch(words, /Google Play/, 'the iPhone screen names the other store');
  stop();
});

test('3.1.2: Terms of Use and Privacy Policy open the hosted pages, and Restore Purchases is there', async () => {
  const { page, body, stop } = await open();
  assert.ok(page.includes(`href="${HOSTED.terms}"`), 'Terms of Use does not open the hosted page');
  assert.ok(page.includes(`href="${HOSTED.privacy}"`), 'Privacy Policy does not open the hosted page');
  assert.match(body, /data-act="restore"/);
  stop();
});

test('3.1.2: the benefit lines say only what Plus gives, unlimited scans, and make no other claim', async () => {
  const { page, stop } = await open({}, { limit: '5', used: '5', resetsAt: '2026-11-09T12:00:00.000Z' });
  const words = text(page);
  assert.match(words, /Pexi Plus: unlimited scans/);
  for (const claim of [/ad[- ]free/i, /\bAI\b/, /\bsaves? (you|money)|\bsavings\b/i,/\bdeals?\b/i, /unlimited (searches|alerts|lists|watch)/i, /premium/i, /exclusive/i, /\bpro\b/i]) {
    assert.doesNotMatch(words, claim, `the paywall claims something Plus does not give: ${claim}`);
  }
  stop();
});

test('plans loaded: Subscribe buys the chosen plan and the plus entitlement is unlocked', async () => {
  const { root, log, stop } = await open();
  root.tap('[data-act="subscribe"]');
  await settle(); await settle();
  assert.ok(log.includes('purchase:pexi_plus_yearly'), 'the yearly plan was not bought');
  assert.match(root.body.innerHTML, /data-pw-state="done"/);
  assert.equal(purchases.plusActive(), true, 'the plus entitlement did not unlock');
  stop();
});

test('plans failed: a clear "plans unavailable, try again" state with Try again, never an empty sheet', async () => {
  const { root, body, log, stop } = await open({ offeringsFail: 1 });
  assert.match(body, /data-pw-state="failed"/);
  assert.match(text(body), /Plans are unavailable/i);
  assert.match(text(body), /try again/i);
  assert.match(body, /data-act="retry"/);
  assert.match(body, /data-act="restore"/, 'somebody who already paid is stuck behind the failure');
  assert.doesNotMatch(body, /data-act="subscribe"/, 'a Subscribe button with no plan behind it');
  assert.notEqual(body.trim(), '');
  root.tap('[data-act="retry"]');
  await settle(); await settle();
  assert.match(root.body.innerHTML, /data-pw-state="plans"/, 'Try again did not load the plans');
  assert.equal(log.filter((l) => l === 'getOfferings').length, 2);
  stop();
});

test('plans failed: an offering that answers with nothing to sell says so and offers Try again too', async () => {
  purchases.resetPurchasesForTests();
  const n = iphone();
  n.win.Capacitor.Plugins.Purchases.getOfferings = async () => ({ current: null, all: { default: { availablePackages: [] } } });
  const root = stubRoot();
  const stop = paywall.render(root, { params: {}, go() {}, win: n.win });
  await settle(); await settle();
  assert.match(text(root.body.innerHTML), /Plans are unavailable/i);
  assert.match(root.body.innerHTML, /data-act="retry"/);
  stop();
});

test('restore: a found subscription unlocks plus', async () => {
  const { root, log, stop } = await open({ offeringsFail: 1 });
  root.tap('[data-act="restore"]');
  await settle(); await settle();
  assert.ok(log.includes('restore'));
  assert.match(root.body.innerHTML, /data-pw-state="done"/);
  assert.equal(purchases.plusActive(), true);
  stop();
});

test('restore: nothing found and a store failure each say so, and plus stays off', async () => {
  const none = await open({ entitled: false });
  none.root.tap('[data-act="restore"]');
  await settle(); await settle();
  assert.match(text(none.root.body.innerHTML), /No Pexi Plus subscription was found/);
  assert.equal(purchases.plusActive(), false);
  none.stop();

  const down = await open({ restoreFails: true });
  down.root.tap('[data-act="restore"]');
  await settle(); await settle();
  assert.match(text(down.root.body.innerHTML), /Restoring purchases did not work/);
  assert.equal(purchases.plusActive(), false);
  down.stop();
});

/* --------------------------------------------------------- the legal links */

test('every in-app link to the privacy policy or terms is the hosted page', () => {
  assert.equal(LEGAL_URLS.terms, HOSTED.terms);
  assert.equal(LEGAL_URLS.privacy, HOSTED.privacy);
  const you = read('../public/js/screens/you.js');
  assert.match(you, /LEGAL_URLS\.privacy/);
  assert.match(you, /LEGAL_URLS\.terms/);
  assert.doesNotMatch(you, /LEGAL_URLS_FR/, 'the You screen still links the old French pages');
  const js = readdirSync(here('../public/js'), { recursive: true }).filter((f) => /\.(js|html)$/.test(f) && !/vendor|chunks|\.map$/.test(f));
  for (const f of js) {
    const src = read(`../public/js/${f}`.replace(/\\/g, '/'));
    assert.doesNotMatch(src, /\/legal\/(privacy|terms)(-fr)?\.html/, `${f} still links a page under /legal/`);
  }
});

test('the stale legal pages (exact GPS, photos to Gemini) are gone from the app', () => {
  assert.equal(existsSync(here('../public/legal')), false, 'app/public/legal is still served');
});

/* ------------------------------------------------- manifest and listing */

const KEY = {
  'Identifiers: Device ID': 'DeviceID',
  'Usage Data: Product Interaction': 'ProductInteraction',
  'Usage Data: Search History': 'SearchHistory',
  'User Content: Other User Content': 'OtherUserContent',
  'Location: Coarse Location': 'CoarseLocation',
  'Diagnostics: Performance Data': 'PerformanceData',
  'Diagnostics: Other Diagnostic Data': 'OtherDiagnosticData',
  'Purchases: Purchase History': 'PurchaseHistory',
};
const PURPOSE = { 'App Functionality': 'AppFunctionality', Analytics: 'Analytics' };

function listingRows() {
  const section = read('../../docs/store/listing.md').split('## App Privacy answers')[1].split('## Age rating')[0];
  const rows = section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Apple data type') && !l.startsWith('|---'));
  return rows.map((l) => l.split('|').map((c) => c.trim())).map((c) => ({ type: c[1], collected: c[2], linked: c[3], tracking: c[4], purposes: c[5] }))
    .filter((r) => /^Yes/.test(r.collected));
}

function manifestEntries() {
  const xml = read('../../native/ios/App/App/PrivacyInfo.xcprivacy').replace(/<!--[\s\S]*?-->/g, '');
  const arr = xml.split('<key>NSPrivacyCollectedDataTypes</key>')[1].split('<key>NSPrivacyAccessedAPITypes</key>')[0];
  return arr.split('<dict>').slice(1).map((d) => ({
    type: /NSPrivacyCollectedDataType(\w+)<\/string>/.exec(d.replace(/<key>[^<]*<\/key>/g, ''))?.[1],
    linked: /<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>/.exec(d)?.[1],
    tracking: /<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<(true|false)\/>/.exec(d)?.[1],
    purposes: [...d.matchAll(/NSPrivacyCollectedDataTypePurpose(\w+)<\/string>/g)].map((m) => m[1]).sort(),
  }));
}

test('the privacy manifest declares exactly the data types of the App Privacy answers, with purchase history', () => {
  const rows = listingRows();
  const want = rows.map((r) => {
    assert.ok(KEY[r.type], `listing row "${r.type}" has no manifest key in this test`);
    assert.match(r.linked, /^Yes/);
    assert.equal(r.tracking, 'No');
    return { type: KEY[r.type], linked: 'true', tracking: 'false', purposes: r.purposes.split(',').map((p) => PURPOSE[p.trim()]).sort() };
  }).sort((a, b) => a.type.localeCompare(b.type));
  const have = manifestEntries().sort((a, b) => a.type.localeCompare(b.type));
  assert.deepEqual(have, want);
  assert.ok(have.some((e) => e.type === 'PurchaseHistory'), 'no Purchase History for the subscription');
  assert.ok(!have.some((e) => e.type === 'PhotosorVideos'), 'the manifest still declares photos');
});

test('listing.md says purchases go through RevenueCat and Apple, and no longer says "no purchase"', () => {
  const listing = read('../../docs/store/listing.md');
  assert.match(listing, /Purchases: Purchase History/);
  assert.match(listing, /RevenueCat/);
  assert.doesNotMatch(listing, /No purchase is configured in this build/);
  assert.doesNotMatch(listing, /The app is free in this version, with no purchases/);
});

/* ------------------------------------------------------- the hosted pages */

test('the hosted privacy page and terms add subscriptions: RevenueCat and Apple, prices, renewal, cancelling, restore', () => {
  const privacy = text(read('../../docs/store/privacy.html'));
  assert.match(privacy, /RevenueCat/);
  assert.match(privacy, /purchase history/i);
  assert.doesNotMatch(privacy, /this version sells nothing/);
  const terms = text(read('../../docs/store/terms.html'));
  assert.match(terms, /CA\$3\.99 a month/);
  assert.match(terms, /CA\$29\.99 a year/);
  assert.match(terms, /renews automatically/i);
  assert.match(terms, /at least 24 hours before/i);
  assert.match(terms, /Apple ID/);
  assert.match(terms, /Restore Purchases/);
  assert.doesNotMatch(terms, /free to use in version 1\.0/i, 'the terms still say nothing is sold');
});

/* ------------------------------------------------------------ build number */

test('the iOS project is version 1.0.0 build 4 in every configuration', () => {
  const pbx = read('../../native/ios/App/App.xcodeproj/project.pbxproj');
  const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]);
  const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map((m) => m[1]);
  assert.ok(builds.length >= 2);
  assert.deepEqual([...new Set(builds)], ['4']);
  assert.deepEqual([...new Set(marketing)], ['1.0.0']);
});
