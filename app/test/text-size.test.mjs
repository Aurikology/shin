/**
 * D-254 (2026-11-11): the app follows the phone's text size (iOS Larger Text, Android font size).
 * Aurik: "do the fix now". Runs lib/text-size.js against fake windows: an iPhone, an Android phone
 * and a browser. The phone pass at the largest sizes is still owed (it needs build 7 or later).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPhoneTextSize, clampTextZoom, TEXT_ZOOM_RANGE } from '../public/js/lib/text-size.js';

function fakeWin(platform, preferred, { plugin = true, fails = false } = {}) {
  const calls = [];
  const body = { style: {} };
  const TextZoom = {
    getPreferred: async () => { if (fails) throw new Error('bridge down'); return { value: preferred }; },
    set: async (o) => { calls.push(['set', o.value]); },
  };
  const win = {
    document: { body, visibilityState: 'visible', addEventListener: () => {} },
    Capacitor: {
      getPlatform: () => platform,
      isPluginAvailable: (n) => plugin && n === 'TextZoom',
      Plugins: plugin ? { TextZoom } : {},
    },
  };
  return { win, body, calls };
}

test('the zoom is held between the range ends, and nonsense is 1', () => {
  assert.equal(clampTextZoom(1.18), 1.18);
  assert.equal(clampTextZoom(3.12), TEXT_ZOOM_RANGE.max, 'the largest accessibility size is not capped');
  assert.equal(clampTextZoom(0.5), TEXT_ZOOM_RANGE.min);
  for (const bad of [NaN, undefined, null, 'x', Infinity]) assert.equal(clampTextZoom(bad), 1, String(bad));
});

test('iPhone: the preferred size goes on the body as -webkit-text-size-adjust', async () => {
  const { win, body, calls } = fakeWin('ios', 1.29);
  assert.equal(await applyPhoneTextSize(win), 1.29);
  assert.equal(body.style.webkitTextSizeAdjust, '129%');
  assert.deepEqual(calls, [], 'iOS has no native set; the plugin does it in JS the same way');
});

test('iPhone at the largest accessibility size: capped, not 312%', async () => {
  const { win, body } = fakeWin('ios', 3.12);
  await applyPhoneTextSize(win);
  assert.equal(body.style.webkitTextSizeAdjust, `${Math.round(TEXT_ZOOM_RANGE.max * 100)}%`);
});

test('Android: the native set is asked with the capped value', async () => {
  const { win, calls } = fakeWin('android', 1.3);
  assert.equal(await applyPhoneTextSize(win), 1.3);
  assert.deepEqual(calls, [['set', 1.3]]);
});

test('a browser, or a build without the plugin, is left alone', async () => {
  const web = fakeWin('web', 2);
  assert.equal(await applyPhoneTextSize(web.win), null);
  assert.equal(web.body.style.webkitTextSizeAdjust, undefined);
  const old = fakeWin('ios', 2, { plugin: false });
  assert.equal(await applyPhoneTextSize(old.win), null, 'build 6 has no TextZoom: nothing to do, nothing thrown');
  assert.equal(await applyPhoneTextSize({}), null, 'no Capacitor at all');
});

test('a failing bridge leaves the text at 100% and does not throw', async () => {
  const { win, body } = fakeWin('ios', 1.5, { fails: true });
  assert.equal(await applyPhoneTextSize(win), null);
  assert.equal(body.style.webkitTextSizeAdjust, undefined);
});

test('main.js starts the sync, and the wrapper ships the plugin', () => {
  const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ startTextSizeSync \} from '\.\/lib\/text-size\.js';/);
  assert.match(main, /^startTextSizeSync\(\);/m);
  const pkg = JSON.parse(readFileSync(new URL('../../native/package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.dependencies['@capacitor/text-zoom'], 'native/package.json has no @capacitor/text-zoom');
  const podfile = readFileSync(new URL('../../native/ios/App/Podfile', import.meta.url), 'utf8');
  assert.match(podfile, /pod 'CapacitorTextZoom', :path => '\.\.\/\.\.\/node_modules\/@capacitor\/text-zoom'/);
});
