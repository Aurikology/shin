/**
 * Fixes from the 2026-10-06 end-to-end walkthrough for the screens outside the
 * camera and the answer sheet (docs/walkthrough-e2e-2026-10-06.md, D14 to D43).
 * One test per defect, each written to go red when its fix is removed.
 *
 * Markup is checked as a string, the way client-flags.test.mjs does: this DOM
 * stores innerHTML without parsing it. NOT A BROWSER.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const storage = makeStorage();
installBrowser({ doc: makeDocument(), storage });

const readUrl = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(readUrl(rel), 'utf8').replace(/\r\n/g, '\n');

const { FLAGS } = await import('../public/js/flags.js');
const store = await import('../public/js/store.js');
const youModule = await import('../public/js/screens/you.js');
const consentScreen = (await import('../public/js/screens/consent.js')).default;
const watchlistScreen = (await import('../public/js/screens/watchlist.js')).default;
const panel = await import('../public/js/permissions-panel.js');
const router = await import('../public/js/router.js');
const dev = await import('../public/js/dev-mode.js');
const { t } = await import('../public/js/ui-strings.js');
const { SCREEN_TAGS } = await import('../public/js/screen-tags.js');

function stubRoot() {
  return {
    innerHTML: '', dataset: {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, removeEventListener: () => {}, setAttribute: () => {}, closest: () => null, contains: () => false,
  };
}

function markup(screen, { win, ctx = {} } = {}) {
  const root = stubRoot();
  const prior = globalThis.window;
  if (win) globalThis.window = { ...prior, ...win };
  try {
    screen.render(root, {
      api: { quota: () => new Promise(() => {}), scans: () => new Promise(() => {}), postConsent() {}, postEvent() {} },
      go() {}, replace() {}, params: {}, build: 'test', ...ctx,
    });
  } catch { /* wiring after the paint needs a DOM this stub lacks, not markup */ }
  globalThis.window = prior;
  return root.innerHTML;
}

const youMarkup = (opts) => markup(youModule.default, opts);

function withFlags(patch, fn) {
  const before = { ...FLAGS };
  Object.assign(FLAGS, patch);
  try { return fn(); } finally { Object.assign(FLAGS, before); }
}

/* ------------------------------------------------------------------ D14 */

test('D14: You shows only this phone\'s numbers, from one source, and never asks for the fleet-wide log', () => {
  storage.clear();
  store.reset();
  store.recordVerdict({ kind: 'verdict', tier: 'fair' }, {});
  const html = youMarkup();
  // The header line and the "Yours this week" row both read the one weekly object.
  assert.match(html, /1 scanned this week/);
  assert.match(html, /1 scan, 1 named/);
  assert.doesNotMatch(html, /Nothing scanned this week/);
  for (const fleet of [t('you_scans_named_row'), t('you_week_two_row'), t('you_corrections_row'), t('you_reading_scan_log')]) {
    assert.ok(!html.includes(fleet), `a fleet-wide row is back: ${fleet}`);
  }
  assert.doesNotMatch(read('../public/js/screens/you.js'), /api\.scans\(/);
});

test('D14: an empty week says nothing scanned and counts zero from the same object', () => {
  storage.clear();
  store.reset();
  const html = youMarkup();
  assert.match(html, /Nothing scanned this week/);
  assert.match(html, /0 scans, 0 named/);
});

/* ------------------------------------------------------------------ D15 */

test('D15: no line says there is no privacy policy; the real pages are linked; one deletion email', () => {
  const html = youMarkup();
  assert.doesNotMatch(html, /no privacy policy|no terms page/i);
  assert.match(html, /href="\/legal\/privacy\.html"/);
  assert.match(html, /href="\/legal\/terms\.html"/);
  assert.match(html, /mailto:useshinapp@gmail\.com/);
  assert.ok(!html.includes('privacy@shin.app'));
  const policy = read('../public/legal/privacy.html');
  assert.ok(policy.includes(youModule.DELETE_MY_DATA_EMAIL), 'the policy and the You page disagree on the deletion address');
  for (const f of ['../public/js/screens/you.js', '../public/js/ui-strings.js', '../public/js/voice.js']) {
    assert.ok(!read(f).includes('privacy@shin.app'), `${f} still names the placeholder address`);
  }
});

/* ------------------------------------------------------------------ D21 */

test('D21: the empty Saved state has a Scan button that opens the camera', () => {
  storage.clear();
  store.reset();
  const html = markup(watchlistScreen);
  assert.match(html, /<button type="button" class="btn btn--primary" data-act="camera">Scan something<\/button>/);
});

/* ------------------------------------------------------------------ D22 */

test('D22: the demo card shows a zone word under the DEMO badge, and something shows the instant the link is tapped', async () => {
  const card = panel.demoResultHtml({ product: { label: 'Kraft Dinner Original, 225 g' }, band: 'middle' });
  assert.match(card, /Kraft Dinner Original, 225 g/);
  assert.match(card, /onb-demo-verdict">.*DEMO.*in the middle/s);
  const writes = [];
  const slot = { set innerHTML(v) { writes.push(v); }, get innerHTML() { return writes.at(-1) ?? ''; }, scrollIntoView() {} };
  const root = { querySelector: (s) => (s === '[data-demo-slot]' ? slot : null) };
  const done = panel.fillDemoSlot(root, { api: { identifyDemo: async () => ({ product: { label: 'X' }, band: 'middle' }) } }, {});
  assert.match(writes[0], /Fetching the demo scan/, 'nothing was shown while the demo loaded');
  await done;
  assert.match(writes.at(-1), /data-demo-result/);
});

/* ------------------------------------------------------------------ D23 */

test('D23: each permission row is the target, and the row is at least 44px', () => {
  const html = panel.panelHtml();
  assert.match(html, /<div class="onb-perm" data-perm-row="camera">/);
  assert.match(html, /<div class="onb-perm" data-perm-row="location">/);
  assert.match(read('../public/css/screens/onboarding.css'), /\.onb-perm \{[^}]*min-height: 44px/);
  for (const f of ['../public/js/screens/permissions.js', '../public/js/screens/onboarding.js']) {
    assert.match(read(f), /closest\('\[data-perm-row\]'\)/, `${f} still listens on the switch only`);
  }
});

/* ------------------------------------------------------------------ D24 */

test('D24: with photo identification off the consent screen has no photo wording and no phantom location switch', () => {
  const html = withFlags({ photoId: false, onboarding: false }, () => markup(consentScreen));
  assert.doesNotMatch(html, /data-consent="photos"/);
  assert.doesNotMatch(html, /data-consent="location"/);
  assert.doesNotMatch(html, /photo/i);
  assert.doesNotMatch(html, /switch it on/i);
  assert.match(html, /allowed it on the last screen/);
  assert.doesNotMatch(html, /either choice|either one/i);
});

test('D24: with the flags on, the photo switch, the location switch and their wording are back', () => {
  const html = withFlags({ photoId: true, onboarding: true }, () => markup(consentScreen));
  assert.match(html, /data-consent="photos"/);
  assert.match(html, /data-consent="location"/);
  assert.match(html, /Photos are kept only if you switch that on below/);
});

test('D24: You has no Photos switch and no camera-frame sentence while photo identification is off', () => {
  const off = withFlags({ photoId: false }, () => youMarkup());
  assert.doesNotMatch(off, /data-consent="photos"/);
  assert.doesNotMatch(off, /camera frame/i);
  assert.match(off, /data-consent="location"/);
  const on = withFlags({ photoId: true }, () => youMarkup());
  assert.match(on, /data-consent="photos"/);
});

/* ------------------------------------------------------------------ D27 */

test('D27: the Buzz caption sits directly under the Buzz row, before any other row', () => {
  const html = youMarkup();
  const buzz = html.indexOf('data-act="buzz"');
  const caption = html.indexOf(t('you_buzz_caption').slice(0, 20));
  const savings = html.indexOf('data-act="savings"');
  assert.ok(buzz > 0 && caption > buzz && savings > caption, 'the caption is displaced from the row it explains');
  const between = html.slice(buzz, caption);
  assert.ok(!/data-act="(savings|market|welcome|licences|report)"/.test(between), 'another row sits between Buzz and its caption');
});

/* ------------------------------------------------------------------ D28 */

test('D28: the Developer row shows only with the developer switch or ?dev=1', () => {
  storage.clear();
  assert.ok(!youMarkup().includes('data-tags-switch'), 'the Developer row is drawn for every shopper');
  assert.equal(dev.devOn({ tagsOn: false, search: '' }), false);
  assert.equal(dev.devOn({ tagsOn: true, search: '' }), true);
  assert.equal(dev.devOn({ tagsOn: false, search: '?dev=1' }), true);
  dev.captureDevParam('?dev=1');
  assert.ok(youMarkup().includes('data-tags-switch'), '?dev=1 was not remembered across navigation');
  assert.equal(dev.captureDevParam('?dev=0'), false);
  assert.ok(!youMarkup().includes('data-tags-switch'));
  assert.match(read('../public/js/router.js'), /captureDevParam\(location\.search\)/);
});

test('D28: the build line is read from the running server, not a hand-set number', async () => {
  const html = youMarkup();
  assert.match(html, /data-build/);
  assert.ok(!html.includes('2026-09-19.1'), 'the hand-set version string is on screen');
  const stamp = await youModule.buildStamp(
    async (url) => {
      assert.match(url, /\/api\/health$/);
      return { ok: true, json: async () => ({ startedAt: '2026-10-06T14:02:00.000Z' }) };
    },
    {},
  );
  assert.match(stamp, /^2026-10-0[5-7] \d\d:\d\d$/);
  assert.equal(await youModule.buildStamp(async () => ({ ok: false }), {}), null);
  assert.equal(await youModule.buildStamp(async () => ({ ok: true, json: async () => ({}) }), {}), null);
});

/* ------------------------------------------------------------------ D29 */

test('D29: Manage subscription is drawn in the Android store build and nowhere else', () => {
  assert.ok(!youMarkup().includes('data-manage-sub'));
  assert.ok(!youMarkup({ win: { Capacitor: { getPlatform: () => 'ios' } } }).includes('data-manage-sub'));
  const android = youMarkup({ win: { Capacitor: { getPlatform: () => 'android' } } });
  assert.match(android, /data-manage-sub/);
  assert.doesNotMatch(android, /data-plus-block hidden/);
  assert.match(youMarkup(), /data-plus-block hidden/, 'an empty Pexi Plus heading is left on screen');
});

/* ------------------------------------------------------------------ D36 */

test('D36: the market screen is not routable while its flag is off', () => {
  assert.equal(router.screenAllowed('market', { market: false }), false);
  assert.equal(router.screenAllowed('market', { market: true }), true);
  assert.equal(router.screenAllowed('camera', { market: false }), true);
  assert.equal(router.screenAllowed('market'), FLAGS.market, 'the default is the real flag');
  const src = read('../public/js/router.js');
  assert.match(src, /routes\.has\(id\) && screenAllowed\(id\) \? id : fallbackId/);
});

/* ------------------------------------------------------------ D31 and D43 */

const LEGAL = { 'terms.html': 'a103', 'privacy.html': 'a104', 'terms-fr.html': 'a105', 'privacy-fr.html': 'a106' };

test('D31: each legal page names its screen tag, and every tag is registered', () => {
  for (const [file, tag] of Object.entries(LEGAL)) {
    const html = read(`../public/legal/${file}`);
    assert.match(html, new RegExp(`<meta name="screen-tag" content="${tag}">`), `${file} carries no tag`);
    assert.equal(SCREEN_TAGS[tag]?.file, `app/public/legal/${file}`);
    assert.equal(SCREEN_TAGS[tag]?.kind, 'static');
  }
});

test('D31: the legal pages declare an icon, so the browser stops asking for /favicon.ico (the 404)', () => {
  for (const file of Object.keys(LEGAL)) {
    const html = read(`../public/legal/${file}`);
    const m = /<link rel="icon" href="([^"]+)"/.exec(html);
    assert.ok(m, `${file} has no icon link`);
    assert.ok(existsSync(readUrl(`../public/legal/${m[1]}`)), `${file} points at an icon that is not there`);
  }
});

test('D43: the four static plan pages carry a phone viewport meta', () => {
  for (const f of ['shin-build-plan', 'shin-hard-dozen', 'shin-terminating-loop', 'shin-walkthrough']) {
    const html = readFileSync(fileURLToPath(new URL(`../../pages/${f}.html`, import.meta.url)), 'utf8');
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, `${f}.html has no viewport meta`);
  }
});
