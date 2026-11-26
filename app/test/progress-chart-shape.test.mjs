/**
 * The Progress chart never collapses to a vertical stroke (2026-11-26, found rendering Progress for
 * the depth pass). chartSvg placed every point at the centre whenever the first and last times were
 * equal, and that is the case for a shopper's FIRST Bought mark (one point; the padding point it
 * adds was placed on the same centre) and for several buys marked in the same instant. The chart
 * drew a vertical line in the middle and an area of zero width.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });
const { chartSvg } = await import('../public/js/screens/progress.js');

const xsOf = (svg) => {
  const pts = /<polyline class="prog-line" points="([^"]+)"/.exec(svg)?.[1];
  assert.ok(pts, `no line drawn: ${svg.slice(0, 200)}`);
  return pts.trim().split(/\s+/).map((p) => Number(p.split(',')[0]));
};

test('one buy draws a line across the chart, not a stroke at the centre', () => {
  const xs = xsOf(chartSvg([{ t: 1_700_000_000_000, cents: 120 }], 'CAD'));
  assert.ok(Math.max(...xs) - Math.min(...xs) > 200, `x span ${Math.max(...xs) - Math.min(...xs)} of 320: ${xs}`);
});

test('buys marked in the same instant spread across the chart in order', () => {
  const t = 1_700_000_000_000;
  const xs = xsOf(chartSvg([{ t, cents: 100 }, { t, cents: 250 }, { t, cents: 520 }], 'CAD'));
  assert.equal(new Set(xs).size, 3, `points share an x: ${xs}`);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs, `out of order: ${xs}`);
});

test('control: buys at different times still sit by time, first at the left edge, last at the right', () => {
  const xs = xsOf(chartSvg([{ t: 0, cents: 100 }, { t: 1000, cents: 200 }, { t: 4000, cents: 300 }], 'CAD'));
  assert.equal(xs[0], 8);
  assert.equal(xs[2], 312);
  assert.equal(xs[1], 8 + (1000 / 4000) * 304);
});
