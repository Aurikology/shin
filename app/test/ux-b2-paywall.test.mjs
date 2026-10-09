/**
 * UX build 2: paywall compliance and entry. Blocks R-80, R-81, R-83, R-35,
 * R-84, R-85 of docs/design/ux-evidence-2026-10-09.md (section 13, build 2).
 *
 * THE CONTRACT THESE TESTS PIN (the build meets it, or edits this file in the
 * same commit and says why):
 *   R-80  screens/paywall.js, yearly plan row: the billed price stays in the
 *         element marked data-pw-price ("CA$29.99 a year"); under it, inside
 *         the same row, an element marked data-pw-equiv (or class pw-equiv)
 *         reads "about CA$2.50 a month, billed once a year", with the figure
 *         taken from the store (product.pricePerMonthString). CSS: the billed
 *         price is at least as large as the row label, and the equivalent is
 *         at most 70% of the billed price. A plan with no priceString makes
 *         paywallBody THROW (today it prints "undefined a year").
 *   R-81  the yearly plan is the preselected one, the monthly row is on the
 *         same screen, no "see all plans" link. paywallBody THROWS when
 *         `chosen` names a plan that is not in `plans`.
 *   R-83  the close X: 44 by 44, drawn in the first synchronous frame, first
 *         control in the header (top corner), returns to where it came from.
 *   R-35  You has a visible row data-act="plus" that calls ctx.go('paywall').
 *         router.go() THROWS for a screen id nobody registered (today it
 *         console.warns and does nothing, so a mistyped entry is a dead tap).
 *   R-84  when the week's scans are spent: h1 "That is all of this week's
 *         scans."; an element data-pw-count in a mono face reading "3 of 3
 *         used"; the line "Typing a name still works and everything you
 *         saved is still here. More scans on Monday, October 12."; a plain
 *         link data-act="type-name" (not a button class) that calls
 *         ctx.go('camera', {...}); no red, no shake, no timer. A reset time
 *         that is present but unreadable THROWS.
 *   R-85  the screen names what Plus buys ("unlimited scans") in every state,
 *         plans then Subscribe then Restore, Terms and Privacy on the same
 *         screen, one tap on Subscribe reaches the store sheet.
 *
 * EXPECTED RESULT BEFORE THE BUILD LANDS (checked with a run, see the report)
 *   GREEN (keep, 11): the tests whose name contains "(KEEP)": R-80 store
 *   strings, R-81 monthly stays choosable, R-83 x4, R-84 the untrue draft line
 *   is not shipped, R-85 x3, R-35 paywall opened by hand still has Restore and
 *   does not claim the scans are used.
 *   RED (unbuilt, 13): every other test.
 *   All 24 were also run against a throwaway reference build (patched copies
 *   of paywall.js, purchases.js, you.js, router.js, paywall.css in a scratch
 *   folder) and all 24 passed there, so each red test can go green.
 *
 * NOT AUTOMATABLE, not tested: R-81's split test (yearly share of purchases at
 * least 50%), R-83's "5 testers find the way out under 2 seconds", R-84's 30%
 * typed-route share, R-85's "visible without scrolling" on a real phone. They
 * need people and a device.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });
const history = { length: 1, calls: [], back() { this.calls.push('back'); } };
globalThis.window.history = history;

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(here(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const purchases = await import('../public/js/purchases.js');
const paywallMod = await import('../public/js/screens/paywall.js');
const paywall = paywallMod.default;
const { paywallBody } = paywallMod;
const youScreen = (await import('../public/js/screens/you.js')).default;
const router = await import('../public/js/router.js');
const store = await import('../public/js/store.js');

/* ------------------------------------------------------------ css helpers */

function cssFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}
const CSS_TEXT = cssFiles(here('../public/css')).map((p) => readFileSync(p, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const RULES = [];
for (const m of CSS_TEXT.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  RULES.push({ selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: m[2] });
}
const TOKENS = Object.fromEntries([...CSS_TEXT.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

function declared(selectors, prop) {
  for (const sel of selectors) {
    const hits = RULES.filter((r) => r.selectors.includes(sel));
    for (const r of hits.reverse()) {
      const d = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(r.body);
      if (d) return d[1].trim();
    }
  }
  return null;
}
function px(value) {
  let v = value;
  const variable = /^var\((--[\w-]+)\)$/.exec(v);
  if (variable) v = TOKENS[variable[1]];
  const m = /^([\d.]+)(px|rem|em|%)$/.exec(v ?? '');
  if (!m) throw new Error(`cannot read "${value}" as a size`);
  const n = Number(m[1]);
  return m[2] === 'px' ? n : m[2] === '%' ? (n / 100) * 16 : n * 16;
}
const sizeOf = (selectors, fallbackSelectors = []) => {
  const v = declared(selectors, 'font-size') ?? declared(fallbackSelectors, 'font-size');
  return v === null ? 16 : px(v);
};

/* ------------------------------------------------------------ render helpers */

function stubRoot() {
  const body = { innerHTML: '' };
  const listeners = [];
  const norm = (s) => String(s).replace(/["'\s]/g, '');
  return {
    innerHTML: '',
    body,
    listeners,
    querySelector: (sel) => (sel === '[data-pw-body]' ? body : null),
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: () => {},
    tap(sel, dataset = {}) {
      const target = { closest: (s) => (norm(s) === norm(sel) ? { dataset } : null) };
      for (const l of listeners) if (l.type === 'click') l.fn({ target });
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A wrapped iOS app whose store sells monthly CA$3.99 and yearly CA$29.99 (the ruled prices). */
function nativeWin({ equiv = 'CA$2.50', yearly = true, monthlyFirst = true } = {}) {
  const log = [];
  const pkg = (id, price, extra = {}) => ({ identifier: id, product: { identifier: id, priceString: price, ...extra } });
  const monthly = pkg('shin_plus_monthly', 'CA$3.99');
  const year = pkg('shin_plus_yearly:annual', 'CA$29.99', equiv ? { pricePerMonthString: equiv } : {});
  const list = [monthly, ...(yearly ? [year] : [])];
  if (!monthlyFirst) list.reverse();
  const info = { entitlements: { active: { plus: { identifier: 'plus' } } } };
  const Purchases = {
    configure: async () => {},
    getOfferings: async () => ({ current: null, all: { default: { availablePackages: list } } }),
    purchasePackage: async (o) => { log.push(['purchasePackage', o.aPackage.identifier]); return { customerInfo: info }; },
    restorePurchases: async () => ({ customerInfo: info }),
    getCustomerInfo: async () => ({ customerInfo: info }),
  };
  return {
    log,
    win: {
      SHIN_RC_KEYS: { ios: 'appl_test_public', android: '' },
      Capacitor: { getPlatform: () => 'ios', isPluginAvailable: (n) => n === 'Purchases', Plugins: { Purchases } },
    },
  };
}

async function open(params = {}, opts = {}) {
  purchases.resetPurchasesForTests();
  storage.setItem('shin.plus', '0');
  const n = nativeWin(opts);
  const root = stubRoot();
  const gos = [];
  const stop = paywall.render(root, { params, go: (...a) => gos.push(a), win: n.win });
  const first = root.innerHTML; // the first synchronous frame
  await settle(); await settle();
  return { root, stop, log: n.log, gos, first, html: root.body.innerHTML, page: root.innerHTML };
}

const row = (html, plan) => {
  const a = html.indexOf(`data-plan="${plan}"`);
  assert.notEqual(a, -1, `no ${plan} row on the screen`);
  const start = html.lastIndexOf('<button', a);
  return html.slice(start, html.indexOf('</button>', a) + 9);
};
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const SPENT = { limit: '3', used: '3', resetsAt: '2026-10-12T12:00:00.000Z' };

/* ------------------------------------------------------------------ R-80 */

test('R-80 (KEEP): both rows print the store\'s own price strings and nothing is hard-coded', async () => {
  const { html, stop } = await open();
  assert.match(row(html, 'monthly'), /CA\$3\.99 a month/);
  assert.match(row(html, 'yearly'), /CA\$29\.99 a year/);
  stop();
});

test('R-80: the yearly row says "about CA$2.50 a month, billed once a year" under the billed price, from the store', async () => {
  const { html, stop } = await open();
  const yearly = row(html, 'yearly');
  assert.match(yearly, /data-pw-equiv|class="[^"]*pw-equiv/, 'the yearly row has no monthly-equivalent element');
  assert.match(text(yearly), /about CA\$2\.50 a month, billed once a year/);
  assert.ok(yearly.indexOf('CA$29.99') < yearly.indexOf('CA$2.50'), 'the monthly equivalent comes before the billed price');
  assert.ok(!/equiv|about|billed once/.test(row(html, 'monthly')), 'the monthly row grew an equivalent line');
  stop();
  // A store that sends no per-month figure gets no invented one.
  const bare = await open({}, { equiv: '' });
  assert.ok(!/CA\$2\.\d\d|about CA/.test(row(bare.html, 'yearly')), 'a monthly figure was made up when the store gave none');
  bare.stop();
});

test('R-80: the billed price is the largest text in its row and the monthly equivalent is at most 70% of it', () => {
  const label = sizeOf(['.pw-plan .ilist-l'], ['.ilist-l', '.ilist-row']);
  const billed = sizeOf(['.pw-plan [data-pw-price]', '.pw-plan .pw-price', '.pw-plan .ilist-v', '.ilist-v']);
  assert.ok(billed >= label, `the billed price is ${billed}px, smaller than the row label at ${label}px (Apple and Google: billed amount most prominent)`);
  const equivDecl = declared(['.pw-plan [data-pw-equiv]', '.pw-plan .pw-equiv', '[data-pw-equiv]', '.pw-equiv'], 'font-size');
  assert.notEqual(equivDecl, null, 'no CSS rule sizes the monthly-equivalent line');
  assert.ok(px(equivDecl) <= 0.7 * billed, `the equivalent is ${px(equivDecl)}px against a billed price of ${billed}px: over 70%`);
});

test('R-80 (fails loudly): a plan with no price string makes the screen throw, never "undefined a year"', () => {
  for (const priceString of [undefined, null, '', '   ', 7]) {
    assert.throws(
      () => paywallBody('plans', { plans: [{ id: 'monthly', priceString: 'CA$3.99' }, { id: 'yearly', priceString }], chosen: 'yearly' }),
      undefined,
      `priceString ${JSON.stringify(priceString)} was drawn instead of refused`,
    );
  }
});

/* ------------------------------------------------------------------ R-81 */

test('R-81: the yearly plan is preselected and the monthly plan sits beside it with no "see all plans" link', async () => {
  const { html, stop } = await open(); // the store lists monthly first, as today
  assert.match(row(html, 'yearly'), /aria-checked="true"/, 'yearly is not the preselected plan');
  assert.match(row(html, 'monthly'), /aria-checked="false"/, 'monthly is missing or also selected');
  assert.ok(!/see all plans|more plans|other plans|all plans/i.test(text(html)), 'the monthly plan is hidden behind a link');
  stop();
  // Whatever order the store lists them in.
  const reversed = await open({}, { monthlyFirst: false });
  assert.match(row(reversed.html, 'yearly'), /aria-checked="true"/);
  reversed.stop();
});

test('R-81: Subscribe with no other tap buys the yearly plan', async () => {
  const { root, log, stop } = await open();
  root.tap('[data-act="subscribe"]');
  await settle(); await settle();
  assert.deepEqual(log, [['purchasePackage', 'shin_plus_yearly:annual']]);
  stop();
});

test('R-81 (KEEP): the shopper can still choose monthly, and Subscribe then buys monthly', async () => {
  const { root, log, stop } = await open();
  root.tap('[data-plan]', { plan: 'monthly' });
  assert.match(row(root.body.innerHTML, 'monthly'), /aria-checked="true"/);
  root.tap('[data-act="subscribe"]');
  await settle(); await settle();
  assert.deepEqual(log, [['purchasePackage', 'shin_plus_monthly']]);
  stop();
});

test('R-81 (fails loudly): a chosen plan that is not on the screen throws instead of selecting nothing', () => {
  const plans = [{ id: 'monthly', priceString: 'CA$3.99' }, { id: 'yearly', priceString: 'CA$29.99' }];
  for (const chosen of ['weekly', 'Yearly', 7]) {
    assert.throws(() => paywallBody('plans', { plans, chosen }), undefined, `chosen ${JSON.stringify(chosen)} drew a screen with no plan selected`);
  }
});

/* ------------------------------------------------------------------ R-83 */

test('R-83 (KEEP): the close X is 44 by 44 px', () => {
  assert.equal(px(declared(['.pbk'], 'width')), 44);
  assert.equal(px(declared(['.pbk'], 'height')), 44);
  assert.match(paywall.render.toString(), /class="pbk pw-close"/, 'the paywall close is no longer the 44 px .pbk control');
});

test('R-83 (KEEP): the close X is drawn in the first synchronous frame, with no delay, hidden state or fade', async () => {
  const { first, stop } = await open();
  assert.match(first, /<button[^>]*class="pbk pw-close"[^>]*data-act="close"/, 'no close button before the first await');
  const closeTag = /<button[^>]*pw-close[^>]*>/.exec(first)[0];
  assert.ok(!/hidden|style=|disabled/.test(closeTag), `the close button is not usable at once: ${closeTag}`);
  const css = declared(['.pw-close', '.paywall-page .pw-close'], 'animation-delay') ?? declared(['.pw-close'], 'opacity') ?? declared(['.pw-close'], 'visibility');
  assert.equal(css, null, 'CSS delays, fades or hides the close button');
  stop();
});

test('R-83 (KEEP): the close X is the first control in the header, in the top corner', async () => {
  const { first, stop } = await open();
  const head = first.slice(first.indexOf('<header'), first.indexOf('</header>'));
  assert.ok(head.indexOf('pw-close') > -1 && head.indexOf('pw-close') < head.indexOf('<h1'), 'the close is not above the heading');
  assert.ok(head.indexOf('pw-close') < head.indexOf('class="kicker"'), 'the close is not above the kicker');
  stop();
});

test('R-83 (KEEP): closing returns to where the paywall was opened from, or to the camera', async () => {
  history.length = 3; history.calls.length = 0;
  let o = await open(SPENT);
  o.root.tap('[data-act="close"]');
  assert.deepEqual(history.calls, ['back'], 'close did not step back to the opener');
  o.stop();
  history.length = 1; history.calls.length = 0;
  o = await open(SPENT);
  o.root.tap('[data-act="close"]');
  assert.deepEqual(o.gos, [['camera']], 'with no history, close did not go to the camera');
  o.stop();
});

/* ------------------------------------------------------------------ R-35 */

/** A You root that survives the paint and captures the click handler. */
function youRoot() {
  const noop = () => {};
  const el = () => new Proxy({}, {
    get: (t, p) => {
      if (p in t) return t[p];
      if (p === 'dataset' || p === 'style') return {};
      if (p === 'classList') return { toggle: noop, add: noop, remove: noop };
      if (p === 'querySelectorAll') return () => [];
      if (p === 'querySelector' || p === 'closest') return () => el();
      return noop;
    },
    set: (t, p, v) => { t[p] = v; return true; },
  });
  const listeners = [];
  const root = el();
  root.addEventListener = (type, fn) => listeners.push({ type, fn });
  root.contains = () => false;
  root.tap = (sel) => {
    const target = { closest: (s) => (s === sel ? { dataset: {} } : null) };
    for (const l of listeners) if (l.type === 'click') l.fn({ target });
  };
  return root;
}
function renderYou() {
  const root = youRoot();
  const gos = [];
  try {
    youScreen.render(root, { api: { quota: () => new Promise(() => {}), scans: () => new Promise(() => {}), postConsent() {}, postEvent() {} }, go: (...a) => gos.push(a), replace() {}, params: {}, build: 't' });
  } catch (err) {
    assert.fail(`You failed to render: ${err.message}`);
  }
  return { root, gos };
}

test('R-35: You has a visible "Pexi Plus" row, and tapping it opens the paywall', () => {
  store.reset();
  const { root, gos } = renderYou();
  const html = root.innerHTML;
  const at = html.indexOf('data-act="plus"');
  assert.notEqual(at, -1, 'You has no Pexi Plus row (data-act="plus")');
  const sectionTag = html.slice(html.lastIndexOf('<section', at), html.indexOf('>', html.lastIndexOf('<section', at)) + 1);
  assert.ok(!/hidden/.test(sectionTag), `the row sits in a hidden block: ${sectionTag}`);
  const rowTag = html.slice(html.lastIndexOf('<', at), html.indexOf('</button>', at));
  assert.match(text(rowTag), /Pexi Plus/);
  root.tap('[data-act="plus"]');
  assert.deepEqual(gos, [['paywall']], 'the row does not call ctx.go("paywall")');
});

test('R-35: the camera reaches You in 1 tap and You reaches the paywall in 1 more, a registered screen', () => {
  const camera = stripComments(read('../public/js/screens/camera.js'));
  assert.match(camera, /act === 'you'\) \{ ctx\.go\('you'\)/, 'the camera no longer has a one-tap route to You');
  const main = read('../public/js/main.js');
  assert.match(main, /for \(const s of \[[^\]]*\bpaywall\b[^\]]*\]\)/, 'the paywall is not registered');
  assert.match(stripComments(read('../public/js/screens/you.js')), /data-act="plus"[\s\S]*?ctx\.go\('paywall'/, 'You has no route to the paywall');
});

test('R-35 (KEEP): opened from You with no counts, the paywall has Restore purchases and does not claim the scans are used', async () => {
  const { page, html, stop } = await open({});
  assert.match(html, /data-act="restore"/, 'no Restore purchases when opened by hand');
  assert.ok(!/are used/.test(text(page)), 'a visit from You reads as a wall');
  assert.ok(!/That is all of this week/.test(text(page)));
  stop();
});

test('R-35 (fails loudly): router.go to a screen nobody registered throws', () => {
  assert.throws(() => router.go('no-such-screen'), undefined, 'a tap on an unregistered route is a silent dead end (console.warn only)');
});

/* ------------------------------------------------------------------ R-84 */

test('R-84: the zero-scan screen says "That is all of this week\'s scans.", counts in mono, and says what still works', async () => {
  const { page, stop } = await open(SPENT);
  const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(page)?.[1] ?? '';
  assert.equal(text(h1), "That is all of this week's scans.");
  const count = /<[a-z0-9]+[^>]*data-pw-count[^>]*>([\s\S]*?)<\/[a-z0-9]+>/.exec(page);
  assert.ok(count, 'no data-pw-count element');
  assert.equal(text(count[1]), '3 of 3 used');
  const cls = (/class="([^"]*)"/.exec(count[0]) ?? [])[1] ?? '';
  const mono = cls.split(/\s+/).some((c) => RULES.some((r) => r.selectors.includes(`.${c}`) && /--f-mono|monospace/.test(r.body)));
  assert.ok(mono, `the count (class "${cls}") is not set in the mono face`);
  assert.ok(text(page).includes('Typing a name still works and everything you saved is still here. More scans on Monday, October 12.'), `the way-forward line is wrong: ${text(page)}`);
  stop();
  // Opened from You (nothing spent) the same words must not appear.
  const calm = await open({});
  assert.ok(!/all of this week|3 of 3 used|More scans on/.test(text(calm.page)), 'the zero-scan words leak into a visit with scans left');
  calm.stop();
});

test('R-84: one price action (Subscribe), a plain "Type a name instead" link, no red, no shake, no timer', async () => {
  const { page, html, root, gos, stop } = await open(SPENT);
  assert.equal((html.match(/data-act="subscribe"/g) ?? []).length, 1, 'Subscribe is not the one primary action');
  const link = /<(a|button)[^>]*data-act="type-name"[^>]*>([\s\S]*?)<\/(a|button)>/.exec(page + html);
  assert.ok(link, 'no "Type a name instead" link (data-act="type-name")');
  assert.equal(text(link[2]), 'Type a name instead');
  assert.ok(!/\b(cta|btn|btn--primary|pill)\b/.test(/class="([^"]*)"/.exec(link[0])?.[1] ?? ''), 'the way out is dressed as a button, not a plain link');
  root.tap('[data-act="type-name"]');
  assert.equal(gos.length, 1);
  assert.equal(gos[0][0], 'camera', 'the link does not go to the camera');
  assert.ok(gos[0][1] && Object.keys(gos[0][1]).length > 0, 'the camera is told nothing, so the name field cannot open');
  const src = stripComments(read('../public/js/screens/paywall.js'));
  assert.ok(!/setInterval|countdown|shake|data-tier="walk"/i.test(src), 'a timer, shake or red tier is on the paywall');
  const pwCss = readFileSync(here('../public/css/screens/paywall.css'), 'utf8');
  assert.ok(!/--walk|--danger|red|shake|@keyframes|animation/i.test(pwCss.replace(/\/\*[\s\S]*?\*\//g, '')), 'paywall CSS is red or animated');
  stop();
});

test('R-84 (KEEP): the draft line "The camera still works" is not shipped; it is untrue for scans', () => {
  const src = read('../public/js/ui-strings.js') + read('../public/js/voice.js') + read('../public/js/screens/paywall.js');
  assert.ok(!/camera still works/i.test(stripComments(src)));
});

test('R-84 (fails loudly): a spent screen with a reset time that is present but unreadable throws from render()', () => {
  purchases.resetPurchasesForTests();
  const root = stubRoot();
  assert.throws(
    () => paywall.render(root, { params: { limit: '3', used: '3', resetsAt: 'next-week-ish' }, go() {}, win: nativeWin().win }),
    undefined,
    'a spent screen was painted with the "More scans on" sentence silently missing',
  );
});

/* ------------------------------------------------------------------ R-85 */

test('R-85 (KEEP): the heading names what Plus buys, "unlimited scans", when opened from You', async () => {
  const { page, stop } = await open({});
  assert.match(page, /<h1>Pexi Plus: unlimited scans<\/h1>/);
  stop();
});

test('R-85: the zero-scan screen still names what Plus buys', async () => {
  const { page, stop } = await open(SPENT);
  assert.match(text(page), /unlimited scans/, 'the zero-scan headline replaced the statement of what Plus is');
  assert.equal(text(/<h1>([\s\S]*?)<\/h1>/.exec(page)[1]), "That is all of this week's scans.", 'the zero-scan screen lost its R-84 headline');
  stop();
});

test('R-85 (KEEP): plans, then the renewal price, then Subscribe, then Restore; Terms and Privacy on the same screen', async () => {
  const { page, html, stop } = await open({});
  const order = ['pw-plan', 'pw-renews', 'data-act="subscribe"', 'data-act="restore"'].map((m) => html.indexOf(m));
  assert.ok(order.every((n) => n > -1), `a part of the purchase screen is missing: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the purchase screen is out of order');
  assert.match(page, /data-pw-terms/);
  assert.match(page, /data-pw-privacy/);
  assert.match(html, /renews automatically|Renews automatically/i);
  stop();
});

test('R-85 (KEEP): one tap on Subscribe goes straight to the store, with no screen in between', async () => {
  const { root, log, stop } = await open({});
  assert.equal(log.length, 0);
  root.tap('[data-act="subscribe"]');
  await settle(); await settle();
  assert.equal(log.filter(([n]) => n === 'purchasePackage').length, 1, 'Subscribe did not reach the store sheet in one tap');
  stop();
});
