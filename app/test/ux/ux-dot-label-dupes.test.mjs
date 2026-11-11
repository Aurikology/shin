/**
 * D-260 (2026-11-11 live walk): identical store labels printed twice under the
 * bell (Oreo: "Galleria 303G" twice) and the dot labels sat on the $ labels
 * ("Sale No Frills 1kg" over "$4.80"). Cause: bellSvg labelled each chosen dot
 * without merging identical text, and the Hammer import stores one row per
 * shop per day, so the same shop and size repeat; and the first label row's
 * baseline was only 16 units under the 13px $ row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bellSvg } from '../../public/js/lib/verdict-chart.js';
import { verdictWith, dot } from './ux-b6-support.mjs';

const labelsOf = (html) => [...html.matchAll(/class="vb-dotlbl" x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)</g)].map((m) => ({ x: +m[1], y: +m[2], text: m[3] }));
const axisY = (html) => +html.match(/class="vb-lbl[^"]*" x="[\d.]+" y="([\d.]+)"/)[1];
const label = (d) => [d.kind === 'sale' ? 'Sale' : null, d.store, d.quantity].filter(Boolean).join(' ');

test('D-260: two dots with the same label text get one label on the bell, not two', () => {
  const v = verdictWith({
    centreCents: 501,
    dots: [dot(499, 'Galleria', '303G', '2026-11-08'), dot(499, 'Galleria', '303G', '2026-11-07')],
  });
  const texts = labelsOf(bellSvg(v, { dotLabel: label })).map((l) => l.text);
  assert.equal(texts.filter((t) => t === 'Galleria 303G').length, 1, `labels: ${JSON.stringify(texts)}`);
});

test('D-260: the first row of dot labels clears the $ row by at least one 13px line plus air', () => {
  const v = verdictWith({ centreCents: 599, dots: [dot(480, 'No Frills', '1kg', '2026-11-08', 'sale'), dot(699, 'Walmart', '1kg')] });
  const html = bellSvg(v, { dotLabel: label });
  const firstRow = Math.min(...labelsOf(html).map((l) => l.y));
  assert.ok(firstRow - axisY(html) >= 19, `dot labels sit ${firstRow - axisY(html)} units under the $ labels; 13px text needs at least 19`);
});
