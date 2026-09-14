/**
 * Every answer a scan lands on has a visible way back to the live camera.
 *
 * 2026-09-14, the founder's phone: a barcode read on its own, landed on the
 * no-identity refusal, and that sheet had no control that returned to the
 * preview. Only the category refusal carried the labelled close; every other
 * refusal and the verdict left the shopper with a downward drag nothing on
 * screen teaches. The close is `cancel-scan`, which `reset()` handles by going
 * straight back to the idle viewfinder.
 *
 * Checked in the peek, the part of the sheet that is on screen when it lands:
 * a close that only exists at the full detent is the same trap.
 *
 * The second half is the scan restarting. `reset()` puts the screen back to
 * idle, which is the state the eye's barcode handler listens in, so reading
 * resumes on its own. What it must not do is read the very code the shopper
 * just backed out of and throw them straight back onto the same answer, which
 * is how a barcode stops them ever reaching the shutter. Source-asserted, the
 * convention for code inside camera.js's render closure (shutter-race.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { verdictSheet, refusalSheet } from '../public/js/screens/camera.js';

const REASONS = [
  'category_unsupported',
  'identity_unsure',
  'no_identity',
  'too_few_points',
  'points_too_stale',
  'no_source_response',
  'comparison_incoherent',
  'model_timeout',
];

const refusal = (reason) => ({
  kind: 'refusal',
  reason,
  detail: 'Nothing has a price for "Kirkland Signature Natural spring water 500mL" right now.',
  identity: { id: 'catalogue:0096619321841', label: 'Kirkland Signature Natural spring water 500mL' },
  evidence: [],
});

const verdict = {
  kind: 'verdict',
  tier: 'fair',
  askingCents: 499,
  category: 'grocery',
  identity: { id: 'demo-1', label: 'Test item 500 g' },
  spread: { lowCents: 299, highCents: 529, medianCents: 449 },
  pointCount: 3,
  comparisonSet: [
    { seller: 'Walmart', amountCents: 299, observedAt: '2026-08-01', kind: 'regular' },
    { seller: 'Loblaws', amountCents: 449, observedAt: '2026-08-02', kind: 'regular' },
    { seller: 'Metro', amountCents: 529, observedAt: '2026-08-03', kind: 'regular' },
  ],
  confidence: { band: 'high', distinctSellers: 3, because: 'Three sellers.' },
  lines: ['Shin used three shelf prices.'],
};

const scenario = { text: 'Kirkland Signature Natural spring water 500mL', category: 'grocery', scannedGtin: '0096619321841' };

/** The markup up to where the half detent starts: what is on screen at landing. */
function peekOf(html) {
  const half = html.indexOf('class="sheet-half"');
  return half === -1 ? html : html.slice(0, half);
}

test('every refusal a scan can land on has a visible close back to the camera', () => {
  for (const reason of REASONS) {
    for (const opts of [{}, { priceRoute: true }]) {
      const html = refusalSheet(refusal(reason), scenario, ['Groceries'], null, opts);
      assert.ok(
        peekOf(html).includes('class="sheet-close" data-act="cancel-scan"'),
        `${reason}: no visible way back to the camera on the landed sheet`,
      );
    }
  }
});

test('the verdict has a visible close back to the camera at landing, not only Done at the full detent', () => {
  const html = verdictSheet(verdict, scenario, null);
  assert.ok(
    peekOf(html).includes('class="sheet-close" data-act="cancel-scan"'),
    'verdict: the only way back is below the fold',
  );
});

const src = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8');

test('going back to the camera does not immediately re-read the code the shopper just left', () => {
  const resetBody = src.slice(src.indexOf('    function reset() {'), src.indexOf("    root.addEventListener('click'"));
  assert.match(resetBody, /setState\('idle'\)/, 'reset no longer returns to the idle state scanning listens in');
  assert.match(resetBody, /leftBarcode\s*=/, 'reset does not remember the code the shopper backed out of');

  const handler = src.slice(src.indexOf('onBarcode: (read) => {'), src.indexOf('onTorch:'));
  assert.match(handler, /cam\.dataset\.state !== 'idle'/, 'the eye handler no longer gates on idle');
  assert.match(handler, /leftBarcode/, 'the eye handler re-reads the code just left and re-traps the shopper');
  assert.match(handler, /REREAD_QUIET_MS/, 'the quiet is not time-bounded, so the same product could never be scanned again');
});
