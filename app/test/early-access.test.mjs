/**
 * 2026-11-15, Aurik: "we will need to communicate the user that we dont have very specific items ...
 * Place a persistent or first-time banner or modal right on the home screen or menu bar to state that
 * the app is in 'Preview,' 'Beta,' or 'Early Access'. that this is currently general items and more
 * products will be posted."
 *
 * The camera is the home screen. Persistent: an "Early access" badge beside the wordmark. First time:
 * a banner under the top band until "Got it"; the badge opens it again. Pure parts run for real; the
 * camera's wiring is source-asserted (this folder's convention).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { earlyAccessPending, dismissEarlyAccess, EARLY_ACCESS_KEY } from '../public/js/early-access.js';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });
const { TABLES } = await import('../public/js/ui-strings.js');

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('the banner shows until the shopper says Got it, then stays closed on this phone', () => {
  const s = memoryStorage();
  assert.equal(earlyAccessPending(s), true);
  dismissEarlyAccess(s);
  assert.equal(s.getItem(EARLY_ACCESS_KEY), '1');
  assert.equal(earlyAccessPending(s), false);
});

test('storage that throws shows the banner (harmless) and never throws itself', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(earlyAccessPending(broken), true);
  assert.doesNotThrow(() => dismissEarlyAccess(broken));
});

test('the words exist in English and French and say early access, everyday groceries, more coming', () => {
  for (const lang of ['en', 'fr']) {
    for (const key of ['ea_badge', 'ea_title', 'ea_body', 'ea_ok']) {
      assert.equal(typeof TABLES[lang][key], 'string', `${lang}.${key}`);
      assert.ok(TABLES[lang][key].length > 0);
    }
  }
  assert.match(TABLES.en.ea_badge, /early access/i);
  assert.match(TABLES.en.ea_body, /groceries/i);
  assert.match(TABLES.en.ea_body, /more products/i);
});

test('wiring: the badge sits in the top band, the banner opens on a first visit and from the badge, Got it closes it', () => {
  const cam = read('../public/js/screens/camera.js');
  const top = cam.slice(cam.indexOf('<div class="cam-top">'), cam.indexOf('<div class="reticle"'));
  assert.match(top, /data-act="early-access"/, 'the badge is in the top band, beside the wordmark');
  assert.match(cam, /if \(earlyAccessPending\(\)\) showEarlyAccess\(\)/);
  assert.match(cam, /act === 'early-access'\) \{ showEarlyAccess\(\); return; \}/);
  assert.match(cam, /act === 'early-access-ok'\) \{ dismissEarlyAccess\(\); hideEarlyAccess\(\); return; \}/);
  // The first-run tip waits while the banner is open: both live under the top band.
  assert.match(cam, /!firstTipShown && firstRunTipPending\(\) && !earlyAccessOpen\(\)/);
});
