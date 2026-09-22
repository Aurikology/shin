/**
 * The answer sheet additions of 2026-09-21 (docs/mvp-plan.md): the server's
 * price-match line shown as it arrived, and the one-tap "What did you do?" row
 * after an answer that found it cheaper elsewhere, posting to
 * /api/scan/:id/outcome.
 *
 * Run once against a broken client before being trusted (the outcome row shown
 * on every answer; the path built without the scan id).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, json: async () => ({ stored: true }) };
};

const { priceMatchBlock, saysCheaperElsewhere, outcomeRow } = await import('../public/js/screens/camera.js');
const api = await import('../public/js/api.js');

test('the price-match line is the server\'s words, with its seller link and conditions, and nothing without a line', () => {
  const html = priceMatchBlock({
    store: 'No Frills', line: 'Show the cashier: Walmart has it for $3.47.', conditions: ['Identical item', 'In stock'],
    seller: 'Walmart', url: 'https://www.walmart.ca/x',
  });
  assert.match(html, /data-price-match/);
  assert.match(html, /Show the cashier: Walmart has it for \$3\.47\./);
  assert.match(html, /href="https:\/\/www\.walmart\.ca\/x"[^>]*>Walmart</);
  assert.match(html, /<li>Identical item<\/li><li>In stock<\/li>/);
  assert.equal(priceMatchBlock(null), '');
  assert.equal(priceMatchBlock({ store: 'x', line: '  ' }), '');
  assert.ok(!/href="javascript/.test(priceMatchBlock({ line: 'x', seller: 'y', url: 'javascript:alert(1)' })), 'a non-http link was drawn');
});

test('"What did you do?" shows only on a cheaper-elsewhere answer, with the four outcomes', () => {
  assert.equal(saysCheaperElsewhere('over_your_line', null), true);
  assert.equal(saysCheaperElsewhere('middle', { line: 'Show the cashier' }), true);
  assert.equal(saysCheaperElsewhere('under_your_line', null), false);
  assert.equal(saysCheaperElsewhere(null, null), false);
  const row = outcomeRow();
  const acts = [...row.matchAll(/data-outcome="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(acts, ['bought_elsewhere', 'price_matched', 'bought_here', 'not_bought']);
  assert.match(row, /What did you do\?/);
});

test('an outcome posts to /api/scan/:id/outcome with the device, once, and a bad one posts nothing', async () => {
  calls.length = 0;
  await api.postScanOutcome({ scanId: 41, outcome: 'price_matched' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/scan\/41\/outcome$/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.outcome, 'price_matched');
  assert.ok(body.deviceId, 'no device id');
  calls.length = 0;
  assert.deepEqual(await api.postScanOutcome({ scanId: null, outcome: 'price_matched' }), { stored: false });
  assert.deepEqual(await api.postScanOutcome({ scanId: 41, outcome: 'maybe' }), { stored: false });
  assert.equal(calls.length, 0);
});
