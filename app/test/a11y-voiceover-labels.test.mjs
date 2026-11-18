/**
 * R80: VoiceOver on the scan, verdict, paywall and You screens.
 *
 * What a screen reader needs from a button is a name. A button whose content is only a drawing (an svg,
 * or a bare symbol) has none unless it carries aria-label, and VoiceOver then reads "button" and
 * nothing else. This reads every <button> written in the four screens' source and fails for any whose
 * visible content is drawing or symbol only and that has no aria-label. It cannot replace a real
 * VoiceOver pass on a phone (reading order, focus after a sheet opens), which needs the TestFlight build.
 *
 * Touch sizes are pinned separately in ux/ux-b7-touch.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const SCREENS = ['camera', 'paywall', 'you', 'pastscans', 'watchlist'];

/** The <button ...> ... </button> chunks of a source file, with ${...} template holes kept as text. */
function buttons(src) {
  const out = [];
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push({ attrs: m[1], inner: m[2], at: src.slice(0, m.index).split('\n').length });
  return out;
}

/** True when nothing a reader could say is inside: only svg markup, whitespace and short symbols. */
function drawingOnly(inner) {
  const noSvg = inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<span class="[^"]*icon[^"]*"[^>]*>\s*<\/span>/g, '');
  const text = noSvg.replace(/\$\{[\s\S]*?\}/g, 'X').replace(/<[^>]+>/g, '').trim();
  return text.length === 0 || /^[⌦⌫×x+\-✕]$/i.test(text);
}

for (const name of SCREENS) {
  test(`${name}: no button is only a drawing without a spoken name`, () => {
    const src = read(`../public/js/screens/${name}.js`);
    const bad = buttons(src)
      .filter((b) => b.inner.includes('<svg') && drawingOnly(b.inner) && !/aria-label|aria-labelledby/.test(b.attrs))
      .map((b) => `line ${b.at}: <button${b.attrs.slice(0, 80)}`);
    assert.deepEqual(bad, [], `${name}.js has icon-only buttons with no aria-label`);
  });
}

test('the keypad point key says what it is, not "dot" or "comma"', () => {
  const src = read('../public/js/screens/camera.js');
  assert.match(src, /key\('\.', ` aria-label="\$\{escapeHtml\(t\('cam_decimal_point'\)\)\}"`, padSeparator\(\)\)/);
  const ui = read('../public/js/ui-strings.js');
  assert.match(ui, /cam_decimal_point:\s*'Decimal point'/);
});
