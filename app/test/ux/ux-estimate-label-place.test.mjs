/**
 * D-268 B8 (2026-11-11 walk, f3-28): the label "Pexi's estimate" sat between
 * the verdict word and the shopper's own price, directly above "$6.99 On the
 * tag", so it read as a label on the shopper's own price. The label belongs to
 * the verdict word (Jamin's App Store list item 10: "great price" is a claim,
 * so it is marked as Pexi's estimate), so it now sits right above that word.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { render, FX, parts } from './ux-b6-support.mjs';

test('D-268 B8: "Pexi\'s estimate" labels the verdict word, never the shopper\'s own tag price', () => {
  const peek = parts(render(FX.HIGH)).peek;
  const label = peek.indexOf('data-vd-estimate');
  const word = peek.indexOf('data-dist-headline');
  const tag = peek.indexOf('class="vd-ask"');
  assert.ok(label > -1 && word > -1 && tag > -1, 'the label, the word or the tag price is missing');
  assert.ok(label < word, 'the estimate label comes after the verdict word, right above the shopper\'s own price');
  assert.ok(word < tag, 'the verdict word must still come before the tag price');
});
