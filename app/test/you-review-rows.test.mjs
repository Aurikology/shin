/**
 * The two user-started rows on the You page: "Rate Pexi" (the store's own review page) and "Tell us what's
 * wrong" (the report flow the app already has). Neither is shown in, or tied to, the platform review prompt
 * (app/public/js/review-prompt.js), and Rate Pexi is a plain link the shopper taps, never a question.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cell = new Map();
globalThis.localStorage = {
  getItem: (k) => (cell.has(k) ? cell.get(k) : null),
  setItem: (k, v) => cell.set(k, String(v)),
  removeItem: (k) => cell.delete(k),
};
globalThis.document = {
  documentElement: { dataset: {}, style: { setProperty() {} } },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  body: { appendChild() {}, removeChild() {} },
};
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const you = (await import('../public/js/screens/you.js')).default;
const { rateUrl } = await import('../public/js/screens/you.js');
const { REVIEW_URLS, ANDROID_PACKAGE_ID } = await import('../public/js/plus-config.js');
const { t, setLocale } = await import('../public/js/ui-strings.js');

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const IOS_URL = 'https://apps.apple.com/app/id6821190920?action=write-review';

function renderOn(platform) {
  const prev = globalThis.Capacitor;
  globalThis.Capacitor = platform === 'web' ? undefined : { getPlatform: () => platform };
  const root = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  try {
    you.render(root, { api: { catalogue: () => new Promise(() => {}), scans: () => new Promise(() => {}), quota: () => new Promise(() => {}) }, go() {}, replace() {}, params: {}, build: 'test' });
  } catch { /* the wiring after the markup needs a real page; the markup is what is read */ }
  globalThis.Capacitor = prev;
  return root.innerHTML;
}

test('the iPhone row opens the App Store review page', () => {
  assert.equal(REVIEW_URLS.ios, IOS_URL);
  assert.equal(rateUrl({ Capacitor: { getPlatform: () => 'ios' } }), IOS_URL);
  const html = renderOn('ios');
  assert.match(html, /data-rate-pexi/);
  assert.ok(html.includes(`href="${IOS_URL}"`), 'the row links the review page');
  assert.match(html, /Rate Pexi/);
});

test('the Android row opens the Play listing for the configured package id, and hides without one', () => {
  assert.equal(ANDROID_PACKAGE_ID, JSON.parse(read('../../native/capacitor.config.json')).appId, 'the package id is the wrapper\'s app id');
  const url = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;
  assert.equal(REVIEW_URLS.android, url);
  assert.equal(rateUrl({ Capacitor: { getPlatform: () => 'android' } }), url);
  assert.ok(renderOn('android').includes(`href="${url}"`));
  assert.equal(rateUrl({ Capacitor: { getPlatform: () => 'android' } }, { ...REVIEW_URLS, android: '' }), '', 'no package id, no row');
});

test('in a browser there is no Rate Pexi row', () => {
  assert.equal(rateUrl({}), '');
  assert.doesNotMatch(renderOn('web'), /data-rate-pexi|Rate Pexi/);
});

test('"Tell us what\'s wrong" is there on every platform and opens the report flow', () => {
  for (const p of ['ios', 'android', 'web']) {
    const html = renderOn(p);
    assert.match(html, /data-act="tell-wrong"/, p);
    assert.match(html, /Tell us what&#39;s wrong|Tell us what's wrong/, p);
  }
  assert.match(read('../public/js/screens/you.js'), /data-act="tell-wrong"\]'\)\) \{ ctx\.go\('correct'/);
});

test('the rows are French in French, and the key set matches', () => {
  assert.equal(t('you_rate'), 'Rate Pexi');
  assert.equal(t('you_tell_wrong'), 'Tell us what\'s wrong');
  setLocale('fr');
  try {
    assert.equal(t('you_rate'), 'Évaluer Pexi');
    assert.equal(t('you_tell_wrong'), 'Dites-nous ce qui ne va pas');
  } finally {
    setLocale('en');
  }
});

test('the rows ask nothing and are not part of the prompt', () => {
  const src = read('../public/js/screens/you.js');
  const block = src.slice(src.indexOf('data-rate-pexi') - 400, src.indexOf('data-act="tell-wrong"') + 400);
  assert.doesNotMatch(block, /requestReview|InAppReview|review-prompt|like Pexi|enjoy/i, 'the rows never touch the platform prompt or ask a question');
  const prompt = read('../public/js/review-prompt.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(prompt, /you\.js|data-rate-pexi|tell-wrong|REVIEW_URLS/, 'the prompt code never points at the rows');
});
