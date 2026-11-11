/**
 * D-268 F29 (2026-11-11 walk, f3-63): with Torch "Off" the brightness slider
 * stayed live and both its hint ("A lower setting waits until it is darker")
 * and the off hint ("The torch stays off...") showed at once. you.js does set
 * `hidden` on the slider block, but `.setting { display: flex }` outranks the
 * browser's own [hidden] rule, so the block drew anyway (the same trap
 * `.ilist-row[hidden]` in you.css already records).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/screens/you.css', import.meta.url), 'utf8');
const you = readFileSync(new URL('../public/js/screens/you.js', import.meta.url), 'utf8');

test('D-268 F29: a hidden setting block is not drawn, so Torch Off shows no slider', () => {
  assert.match(you, /class="setting setting-stack" data-torch-slider\$\{torchMode === 'auto' \? '' : ' hidden'\}/, 'the slider block no longer hides itself with `hidden`');
  assert.match(css, /\.setting\[hidden\]\s*\{\s*display:\s*none;?\s*\}/, 'no `.setting[hidden] { display: none }`: `.setting { display: flex }` wins and the slider shows with Torch Off');
});
