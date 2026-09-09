/**
 * D-050: the price pad's own controls, pinned to the 44px HIG floor.
 *
 * Measured live with Playwright at 390 x 844 (deviceScaleFactor 3, mobile,
 * touch), reached the way the app reaches it -- shutter, "Something else",
 * the camera's own openPad -- because that is the only route that shows what
 * a grid row actually renders at, not what its CSS claims to. Before: digit
 * keys 113 x 35-40, Clear 42 x 23, Skip 37 x 23, the two modifiers 54 x 29
 * and 63 x 29. After: every control on both padsheet grids and both
 * pad-textbtn keys is 44 or wider on both axes, and the modifiers are 44
 * tall. The same script found a live regression this file's short-viewport
 * block introduces one guard against: at 375 x 575 the taller rows and
 * taller Clear/Skip/modifiers overflowed the sheet's own max-height and
 * forced a drag to reach the confirm key, so a second block keeps that
 * viewport's rows at the 44px floor rather than the tall-viewport 48.
 *
 * This is a source-assertion test, same convention as tokens.test.mjs: it
 * reads camera.css as text rather than a computed style, because the file
 * has no browser and no build step to get one from. It pins the numbers the
 * live measurement already proved fit, so a future palette or spacing pass
 * that quietly shrinks a clamp floor or drops a min-height fails here
 * instead of shipping. It does not re-derive the 844 and 575 layout budgets
 * -- that arithmetic lives in the CSS file's own comments, next to the rules
 * it explains.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CAMERA_CSS = readFileSync(
  new URL('../public/css/screens/camera.css', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

const CORRECT_CSS = readFileSync(
  new URL('../public/css/screens/correct.css', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

const TAP_FLOOR = 44;

/** The brace-balanced body of the first block whose selector line matches
 * `selector` (a literal string, matched from `fromIndex` on). Same shape as
 * tokens.test.mjs's `blockAt`, generalised with a start offset so a second
 * same-named selector -- the short-viewport override -- can be found after
 * the first. */
function blockAfter(css, selector, fromIndex = 0) {
  const start = css.indexOf(selector, fromIndex);
  assert.notEqual(start, -1, `camera.css: no ${JSON.stringify(selector)} after index ${fromIndex}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return { body: css.slice(open + 1, i), start, end: i };
}

/** The smallest length, in px, that a CSS value expression could ever
 * resolve to: every bare `Npx` and every `clamp(MIN, ..., MAX)`'s MIN.
 * clamp's own floor is what a grid row can never render under, because the
 * preferred value is only used when it falls between the two. */
function minPx(value) {
  const clamp = value.match(/clamp\(\s*([\d.]+)px/);
  if (clamp) return Number.parseFloat(clamp[1]);
  // `Npx` bare, or `repeat(k, Npx)` -- both a fixed row height, not a range.
  const px = value.match(/([\d.]+)px/);
  if (px) return Number.parseFloat(px[1]);
  throw new Error(`keypad-tap-size.test.mjs does not know how to read ${JSON.stringify(value)}`);
}

function prop(body, name) {
  const m = body.match(new RegExp(`(?:^|[\\s;{])${name}\\s*:\\s*([^;]+);`));
  assert.ok(m, `no ${name} in block: ${body.slice(0, 120)}`);
  return m[1].trim();
}

/* -------------------------------------------------------- tall viewports (≥641px) */

test('the padsheet digit grid floors at 44px a row outside the short-viewport query', () => {
  // The first `.padsheet .keypad` in the file is the base rule, not the
  // `@media (max-height: 640px)` one -- see the comment above the base rule
  // for why source order (not media-query nesting) decides which wins.
  const { body } = blockAfter(CAMERA_CSS, '.padsheet .keypad {');
  const rows = prop(body, 'grid-template-rows');
  assert.ok(minPx(rows) >= TAP_FLOOR, `.padsheet .keypad rows floor at ${minPx(rows)}px, needs ${TAP_FLOOR}`);
});

test('the padsheet bottom row (., 0, backspace, confirm) floors at 44px outside the short-viewport query', () => {
  const { body } = blockAfter(CAMERA_CSS, '.padsheet .keypad-bottom {');
  const rows = prop(body, 'grid-template-rows');
  assert.ok(minPx(rows) >= TAP_FLOOR, `.padsheet .keypad-bottom rows floor at ${minPx(rows)}px, needs ${TAP_FLOOR}`);
});

test('the price-pad modifier buttons (% off, N for $) hold a 44px min-height', () => {
  const { body } = blockAfter(CAMERA_CSS, '.modbtn {');
  const mh = prop(body, 'min-height');
  assert.ok(minPx(mh) >= TAP_FLOOR, `.modbtn min-height is ${mh}, needs ${TAP_FLOOR}px`);
});

test('Clear and Skip hold a 44px min-height and min-width', () => {
  const { body } = blockAfter(CAMERA_CSS, '.pad-textbtn {');
  const mh = prop(body, 'min-height');
  const mw = prop(body, 'min-width');
  assert.ok(minPx(mh) >= TAP_FLOOR, `.pad-textbtn min-height is ${mh}, needs ${TAP_FLOOR}px`);
  assert.ok(minPx(mw) >= TAP_FLOOR, `.pad-textbtn min-width is ${mw}, needs ${TAP_FLOOR}px`);
});

/* ------------------------------------------------------- short viewports (≤640px) */

test('the short-viewport override keeps the digit grid at the 44px floor, never below it', () => {
  const mediaStart = CAMERA_CSS.indexOf('@media (max-height: 640px)', CAMERA_CSS.indexOf('.padsheet .key-confirm:disabled'));
  assert.notEqual(mediaStart, -1, 'the moved-down short-viewport block is gone from camera.css');
  const { body } = blockAfter(CAMERA_CSS, '.padsheet .keypad {', mediaStart);
  const rows = prop(body, 'grid-template-rows');
  assert.ok(minPx(rows) >= TAP_FLOOR, `short-viewport .padsheet .keypad rows are ${rows}, needs ${TAP_FLOOR}px`);
});

test('the short-viewport override keeps the bottom row at the 44px floor, never below it', () => {
  const mediaStart = CAMERA_CSS.indexOf('@media (max-height: 640px)', CAMERA_CSS.indexOf('.padsheet .key-confirm:disabled'));
  const { body } = blockAfter(CAMERA_CSS, '.padsheet .keypad-bottom {', mediaStart);
  const rows = prop(body, 'grid-template-rows');
  assert.ok(minPx(rows) >= TAP_FLOOR, `short-viewport .padsheet .keypad-bottom rows are ${rows}, needs ${TAP_FLOOR}px`);
});

/* ---------------------------------------------------------- the second host */

test('the correction screen keypad, the keypad component\'s other host, already clears the floor', () => {
  // keypadHtml is shared (camera.js), but each host styles its own grid --
  // see correct.css's own header comment on why the classes are scoped
  // rather than shared. This does not re-derive the fix; it records that
  // fixing the sheet host did not have to touch this one, because
  // clamp(46px, 7.4svh, 58px) was already above the floor D-050 measured
  // the sheet host under.
  const { body: keypadBody } = blockAfter(CORRECT_CSS, '.page-correct .keypad {');
  const rows = prop(keypadBody, 'grid-template-rows');
  assert.ok(minPx(rows) >= TAP_FLOOR, `.page-correct .keypad rows are ${rows}, needs ${TAP_FLOOR}px`);

  const { body: bottomBody } = blockAfter(CORRECT_CSS, '.page-correct .keypad-bottom {');
  const bottomRows = prop(bottomBody, 'grid-template-rows');
  assert.ok(
    minPx(bottomRows) >= TAP_FLOOR,
    `.page-correct .keypad-bottom rows are ${bottomRows}, needs ${TAP_FLOOR}px`,
  );
});
