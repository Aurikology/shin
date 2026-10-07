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
 * idle, which is the state the eye's barcode handler listens in.
 *
 * THIS HALF WAS INVERTED ON 2026-09-15 (rule 2). It used to assert the
 * OPPOSITE of what it asserts now, and the inversion is the point rather than
 * a loosening.
 *
 * It used to pin `leftBarcode` and a 10-second `REREAD_QUIET_MS` quiet window
 * into the eye's `onBarcode` handler and into `reset()`. Both existed only
 * because the camera decoded every frame whether or not anybody had asked: go
 * back to the viewfinder with the same package still in frame and it re-read
 * the code within a few frames and dropped the shopper on the answer they had
 * just left, so a barcoded product could never reach the shutter. The quiet
 * window was a workaround for an unsolicited read.
 *
 * The owner's ruling removes the cause: "the barcode should not be auto read,
 * there should be a scan the barcode button". A read now requires a press, so
 * a quiet window would be the app ignoring a button the shopper deliberately
 * pressed while looking at the code -- the opposite defect. So this file now
 * asserts the workaround is GONE and that the gate it was standing in for is
 * really there.
 *
 * Source-asserted, the convention for code inside camera.js's render closure
 * (shutter-race.test.mjs). CRLF is normalised before any slice: D-110, closed
 * 2026-09-15 -- an index hunt for a '
' pattern returns -1 on a CRLF
 * checkout and `slice(-1)` silently sweeps the whole file, so every
 * assertion below would pass against text it was never meant to see.
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
  lines: ['Pexi used three shelf prices.'],
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

const src = readFileSync(fileURLToPath(new URL('../public/js/screens/camera.js', import.meta.url)), 'utf8')
  .replace(/\r\n/g, '\n');

/** A slice between two literal markers, which FAILS rather than returning the
 *  rest of the file when either marker has moved. D-110's loud guard. */
function between(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.notEqual(a, -1, `${what}: the opening marker ${JSON.stringify(from)} is gone`);
  assert.notEqual(b, -1, `${what}: the closing marker ${JSON.stringify(to)} is gone`);
  const slice = text.slice(a, b);
  assert.ok(
    slice.length < text.length / 2,
    `${what}: the slice ran away and covers half the file, so nothing below is really being checked`,
  );
  return slice;
}

test('going back to the camera still lands on idle, with no re-read workaround left', () => {
  const resetBody = between(src, '    function reset() {', "    root.addEventListener('click'", 'reset()');
  assert.match(resetBody, /setState\('idle'\)/, 'reset no longer returns to the idle state scanning listens in');
  assert.doesNotMatch(
    resetBody,
    /leftBarcode/,
    'reset still remembers a code to suppress -- rule 2 removed the unsolicited read that made that necessary',
  );
});

test('the eye handler no longer filters unsolicited reads, because there are none', () => {
  const handler = between(src, 'onBarcode: (read) => {', 'onTorch:', "the eye's onBarcode handler");
  assert.match(handler, /cam\.dataset\.state !== 'idle'/, 'the eye handler no longer gates on idle');
  assert.doesNotMatch(handler, /leftBarcode/, 'the leftBarcode workaround survived the button');
  assert.doesNotMatch(handler, /REREAD_QUIET_MS/, 'the 10-second quiet window survived the button');
});

test('neither the quiet window nor the code it suppressed exists anywhere in the screen', () => {
  assert.equal(src.includes('REREAD_QUIET_MS = '), false, 'REREAD_QUIET_MS is still declared');
  assert.equal(
    /leftBarcode\s*=/.test(src),
    false,
    'leftBarcode is still assigned somewhere, so the workaround only moved',
  );
});

test('a read cannot arrive without the shopper having pressed the button', () => {
  // The client half: the only caller of the eye's arming door is the button.
  assert.match(
    src,
    /data-act="scan-barcode"/,
    'the screen has no scan-barcode control, so nothing can ask for a read',
  );
  assert.match(
    src,
    /eye\?\.scanBarcode\?\.\(\)/,
    'the screen never calls the eye\'s scanBarcode(), so the button cannot arm a read',
  );

  // The eye half (2026-09-17, replacing the press-to-decode gate): frames are
  // decoded and voted on every tick, but a READ is emitted from exactly one
  // place, the button's `scanBarcode()`, and never from the frame loop.
  const eyeSrc = readFileSync(
    fileURLToPath(new URL('../src/eye/camera.ts', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const tick = between(eyeSrc, 'async #tick()', '/** The pick, if the detectors', '#tick()');
  assert.equal(tick.includes('onBarcode('), false, 'the frame loop emits a read on its own again');
  const press = between(eyeSrc, '  scanBarcode(): boolean {', '  /** Photo mode passes false', 'scanBarcode()');
  assert.ok(press.includes('this.#events.onBarcode(read)'), 'the press no longer emits the read');
  assert.equal((eyeSrc.match(/this\.#events\.onBarcode\(/g) ?? []).length, 1, 'a second place emits reads');
});
