/**
 * Nothing textual reaches a sheet's innerHTML unescaped.
 *
 * The camera's refusal on the type-it route puts the name the shopper typed into
 * `detail`, and `refusalSheet` wrote `detail` into `innerHTML` raw. Typing an
 * `<img src=x onerror=...>` into the name field and submitting it executed.
 * Confirmed in a browser before the fix and after it, not reasoned about.
 *
 * The four list screens were converted to `dom.js`'s escaping tag when the same
 * hole was found in `pastscans.js`. This file was not, and it is the one holding
 * the primary flow.
 *
 * ASSERTED BY STRING, not through a DOM, for the reason sheet.test.mjs gives:
 * the app has no runtime dependencies and these are template literals. A string
 * check is enough because the property is "no raw angle bracket or quote from a
 * value ever reaches the output" -- and the browser run that proves the string
 * check corresponds to real inertness is in the commit that added this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refusalSheet, verdictSheet, pricePadSheet, goingRateCard, workingSheet, searchCandidateSheet } from '../public/js/screens/camera.js';

/* Every shape of break-out, including the two that only matter inside an
   attribute and the one that only matters inside a comment. */
const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '</p><script>alert(1)</script>',
  '" onmouseover="alert(1)',
  "' onfocus='alert(1)' autofocus='",
  '<!--><svg onload=alert(1)>',
];

/**
 * The payload reached the output only in escaped form.
 *
 * Scoped to what the PAYLOAD contributed rather than scanning the whole
 * document, because these sheets legitimately contain SVG mascot markup and a
 * document-wide "no svg tag" rule fails on correct output. That was the first
 * draft of this helper and it went red against the fixed code, which is the
 * useful direction for a bad detector to fail in.
 */
const escaped = (v) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const inert = (html, payload) => {
  assert.ok(!html.includes(payload), `the payload survived verbatim: ${payload}`);
  assert.ok(
    html.includes(escaped(payload)),
    `the payload did not reach the output at all, so this case proves nothing: ${payload}`,
  );
};

/* The engine's own shape, borrowed from sheet.test.mjs so the sheet renders
   fully rather than short-circuiting before it reaches the fields under test.
   Every field a person could see is set to the payload. */
const verdict = (label) => ({
  kind: 'verdict',
  tier: 'walk_away',
  askingCents: 499,
  category: 'grocery',
  identity: { id: 'demo-1', label },
  spread: { lowCents: 299, highCents: 429, medianCents: 349 },
  pointCount: 3,
  comparisonSet: [
    { seller: label, amountCents: 299, observedAt: '2026-08-01', kind: 'shelf' },
    { seller: 'Loblaws', amountCents: 389, observedAt: '2026-08-02', kind: 'shelf' },
    { seller: 'Metro', amountCents: 429, observedAt: '2026-08-03', kind: 'shelf' },
  ],
  confidence: { band: 'high', distinctSellers: 3, because: label },
  disagreement: { detail: label },
  lines: [label],
});

for (const payload of PAYLOADS) {
  test(`the refusal detail is inert: ${payload.slice(0, 24)}`, () => {
    inert(refusalSheet(
      { kind: 'refusal', reason: 'no_identity', detail: `matches "${payload}".`, identity: null, evidence: [] },
      null, [],
    ), payload);
  });

  test(`a product label is inert on the pad: ${payload.slice(0, 24)}`, () => {
    inert(pricePadSheet({ id: 'x', text: payload, category: 'grocery' }), payload);
  });

  test(`a refusal identity label is inert: ${payload.slice(0, 24)}`, () => {
    inert(refusalSheet(
      { kind: 'refusal', reason: 'no_identity', detail: 'nope', identity: { label: payload }, evidence: [] },
      { text: payload }, [],
    ), payload);
  });

  test(`a verdict's label, seller and lines are inert: ${payload.slice(0, 24)}`, () => {
    inert(verdictSheet(verdict(payload), { text: payload }, null), payload);
  });

  test(`the "not this?" list is inert: ${payload.slice(0, 24)}`, () => {
    inert(searchCandidateSheet([{ code: '1', label: payload, meta: payload }], payload), payload);
  });

  test(`the working sheet's item name is inert: ${payload.slice(0, 24)}`, () => {
    inert(workingSheet(payload, 0), payload);
  });
}
