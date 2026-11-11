/**
 * D-268 D22 (2026-11-11 walk, f3-51/f3-58/f3-62/f3-77): on Saved, Past scans,
 * Recently removed, You, Savings and every other page behind the camera the
 * middle nav button was a blank pink-ringed circle, while the camera shows a
 * barcode glyph. pageBar() emitted an empty <button class="mini-shutter">.
 * With photo scanning off, scanning means the barcode, so it carries that glyph.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pageBar } from '../public/js/lib/pagebar.js';

test('D-268 D22: the scan button in the page bar carries the barcode glyph, not an empty disc', () => {
  for (const active of ['watchlist', 'you']) {
    const html = pageBar(active);
    const btn = html.match(/<button[^>]*class="mini-shutter"[^>]*>([\s\S]*?)<\/button>/);
    assert.ok(btn, 'no mini-shutter button in the bar');
    assert.match(btn[1], /<svg[\s\S]*aria-hidden="true"[\s\S]*<path d="M3 8V5/, `the scan button is empty on ${active}: ${btn[1]}`);
  }
});
