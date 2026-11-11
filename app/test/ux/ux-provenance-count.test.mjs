/**
 * D-259 (2026-11-11 live walk): the count line disagreed with the list right
 * under it. Peanut butter read "7 prices from 7 shops" above "Prices Pexi has
 * seen" listing 12 rows from fewer shops. Cause: provenanceLine() counted only
 * regular dots and took the shop count from the server's `n` (fresh shops keyed
 * seller|place), while the list shows every dot, sale ones included. The line
 * now describes the list it sits above: every row counted, shops counted once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { render, verdictWith, dot, parts, plain, withNow } from './ux-b6-support.mjs';

const NOW = '2026-11-11T12:00:00Z';

test('D-259: the count line counts the same rows the list shows, and each shop once', () => {
  const v = verdictWith({
    n: 3, // the server's count: it ignores the sale row and counts the No Frills shop twice
    basis: 'own_prices',
    confidence: 'medium',
    shopperCents: 799,
    dots: [
      dot(597, 'No Frills', '1 kg', '2026-11-08', 'sale'),
      dot(597, 'No Frills', '1 kg', '2026-11-07', 'sale'),
      dot(699, 'No Frills', '1 kg', '2026-11-07'),
      dot(749, 'Walmart', '1 kg', '2026-11-06'),
    ],
  });
  withNow(NOW, () => {
    const half = plain(parts(render(v)).half);
    assert.match(half, /Prices Pexi has seen/, "the list heading is missing");
    assert.match(half, /4 prices from 2 shops/, `count line must match the 4 listed rows from 2 shops. Half reads: ${half}`);
  });
});

test('D-259 (keep): with no dots on the wire, the line still falls back to the server count', () => {
  const v = verdictWith({ n: 3, basis: 'own_prices', confidence: 'high', shopperCents: 499, dots: [] });
  withNow(NOW, () => {
    const half = plain(parts(render(v)).half);
    assert.match(half, /3 prices from 3 shops/, half);
  });
});
