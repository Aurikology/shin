/**
 * 2026-11-25, Aurik: "make sure there is a feature where the users can see how many scans remaining they
 * have". The camera carries a pill with the scans left this week whenever the server sets a limit
 * (scans-left.js meterText / paintMeter / refreshMeter), it follows every counted scan, and its tap opens
 * the Plus screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

const doc = makeDocument();
installBrowser({ doc, storage: makeStorage() });

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const { meterText, paintMeter, refreshMeter, startScansLeft } = await import('../public/js/scans-left.js');

test('the pill says the free scans left at every count, not only near the end', () => {
  assert.equal(meterText({ limit: 10, remaining: 10, plus: false }), '10 of 10 free scans left');
  assert.equal(meterText({ limit: 10, remaining: 7, plus: false }), '7 of 10 free scans left');
  assert.equal(meterText({ limit: 10, remaining: 0, plus: false }), 'No free scans left this week');
  assert.equal(meterText({ limit: 10, remaining: -2, plus: false }), 'No free scans left this week');
  assert.equal(meterText({ limit: 100, remaining: 87, plus: true }), '87 of 100 Plus scans left');
});

test('no limit from the server, or no answer, draws no pill', () => {
  assert.equal(meterText({ limit: null, remaining: null, plus: false }), '');
  assert.equal(meterText({ limit: null, remaining: null, plus: true }), '');
  assert.equal(meterText(null), '');
  assert.equal(meterText({ limit: 0, remaining: 0 }), '');
});

test('paintMeter shows, levels and hides the pill', () => {
  const el = doc.createElement('button');
  el.hidden = true;
  paintMeter(el, { limit: 10, remaining: 6, plus: false });
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, '6 of 10 free scans left');
  assert.equal(el.getAttribute('data-level'), 'ok');
  paintMeter(el, { limit: 10, remaining: 2, plus: false });
  assert.equal(el.getAttribute('data-level'), 'low');
  paintMeter(el, { limit: 10, remaining: 0, plus: false });
  assert.equal(el.getAttribute('data-level'), 'none');
  paintMeter(el, { limit: null, remaining: null, plus: false });
  assert.equal(el.hidden, true);
});

test('refreshMeter paints the pill on screen from /api/quota, and a failed call leaves it hidden', async () => {
  const el = doc.createElement('button');
  el.setAttribute('data-scan-meter', '');
  el.hidden = true;
  doc.body.appendChild(el);
  await refreshMeter({ api: { quota: async () => ({ limit: 10, remaining: 9, plus: false }) }, doc });
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, '9 of 10 free scans left');
  el.hidden = true;
  await refreshMeter({ api: { quota: async () => { throw new Error('offline'); } }, doc });
  assert.equal(el.hidden, true);
});

test('a counted scan repaints the pill, for Plus too', async () => {
  const doc = makeDocument(); // its own page: the mini DOM has no remove()
  const el = doc.createElement('button');
  el.setAttribute('data-scan-meter', '');
  doc.body.appendChild(el);
  const handlers = {};
  const win = { addEventListener: (n, f) => { handlers[n] = f; } };
  let left = 5;
  startScansLeft({ api: { quota: async () => ({ limit: 100, remaining: left, plus: true }) }, go: () => {}, plusActive: () => true, win, doc });
  left = 4;
  handlers['pexi:scan-counted']();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(el.textContent, '4 of 100 Plus scans left');
});

test('the camera draws the pill hidden, fills it on render, and its tap opens Plus', () => {
  const src = read('../public/js/screens/camera.js');
  assert.match(src, /class="cam-meter" data-scan-meter data-act="scan-meter"[^>]*hidden><\/button>/);
  assert.match(src, /refreshMeter\(\{ api: ctx\.api/);
  assert.match(src, /act === 'scan-meter'\) \{ ctx\.go\('paywall'\)/);
});

test('every pill string has a French twin', () => {
  const s = read('../public/js/ui-strings.js');
  for (const k of ['meter_free_left', 'meter_none_left', 'meter_plus_left', 'meter_label']) {
    assert.equal(s.split(`  ${k}:`).length - 1, 2, `${k} in English and French`);
  }
});
