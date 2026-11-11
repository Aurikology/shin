/**
 * D-268 F30 and H35 (2026-11-11 walk): a row and the page it opens disagreed.
 * You's "Report a wrong price" row opened a page titled "Tell Pexi the price";
 * You's "Savings overview" row opened "Savings Overview" over "Recently
 * Scanned" (Title Case, unlike every other heading). And the blunt voice's
 * fine print said "Sent, it goes against ..." before anything was sent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { t } from '../public/js/ui-strings.js';
import { say } from '../public/js/voice.js';

test('D-268 H35: the report page is titled what the row that opens it says', () => {
  assert.equal(t('correct_title'), t('you_report'));
});

test('D-268 F30: the savings page is titled what its row says, in sentence case', () => {
  assert.equal(t('savings_title'), t('you_savings'));
  assert.equal(t('savings_recent'), 'Recently scanned');
});

test('D-268 H35: no voice says "Sent" on the report page before it is sent', () => {
  for (const v of ['deadpan', 'warm', 'blunt']) {
    assert.doesNotMatch(say('correct_fineprint', { label: 'Oreo', seller: 'Costco' }, v), /^Sent\b/, v);
  }
});
