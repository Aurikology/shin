/**
 * D-268 C19 (2026-11-11 walk, f3-23/f3-25): an answer with no shelf price to
 * judge (the bell with no asking price) wore the word "Answered" as its
 * headline on the share card, in the copied text ("Pexi says: Answered."), in
 * the camera bubble ("Last time: ... Answered."), and on Saved and Past scans.
 * "Answered" says nothing to a shopper; the answer they got was a typical price.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answerWord } from '../public/js/lib/history-answer.js';
import { t } from '../public/js/ui-strings.js';

test('D-268 C19: an answer with no verdict is headlined as a typical price, never "Answered"', () => {
  const word = answerWord({ zone: null, centreCents: 500, currency: 'CAD' });
  assert.notEqual(word, t('cam_gem_answered_word'));
  assert.doesNotMatch(word, /Answered/);
  assert.match(word, /Typical price/);
});

test('D-268 C19 (keep): an answer with a verdict still wears its zone word', () => {
  assert.match(answerWord({ zone: 'good', centreCents: 500 }), /Good price/);
});
