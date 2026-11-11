/**
 * D-268 B4 (2026-11-11 walk, f3-71): after a correction the next scan said
 * "Your report: $4.99 at Costco, counts once a second source agrees", internal
 * process words, and the shopper read it as "my report was ignored" because
 * the verdict did not move. The line now says in plain words what happens: Pexi
 * uses it once someone else sees the same price.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pt } from '../public/js/price-strings.js';

test('D-268 B4: the waiting report line says what will happen, without "source"', () => {
  const line = pt('your_report_waiting', { price: '$4.99', store: 'Costco' });
  assert.doesNotMatch(line, /source/i, line);
  assert.match(line, /^Your report: \$4\.99 at Costco\. Pexi uses it once someone else sees the same price\.$/, line);
  assert.doesNotMatch(pt('your_report_agreed', { price: '$4.99', store: 'Costco' }), /source/i);
});
