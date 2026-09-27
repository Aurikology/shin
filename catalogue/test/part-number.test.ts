/**
 * Unit 8: the predicate itself, and the five names the plan asked to be
 * checked by name. See docs/part-number-exclusion-2026-09-26.md for the
 * 200-row sample this predicate was measured against (not repeated here;
 * a test file is not where a hand-read sample belongs), for the first
 * version's falsifier, and for the second version's own acceptance test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBarePartNumber,
  isBarePartNumberRow,
  rawQueryTokens,
  bareMatchCandidates,
  bareRowAllowed,
} from '../src/part-number.ts';

test('the five names named in the unit', () => {
  assert.equal(isBarePartNumber('LV-7545'), true, 'unfindable by any typed word');
  assert.equal(isBarePartNumber('AP9520T'), true, 'unfindable by any typed word');
  assert.equal(isBarePartNumber('Z-Slip Label'), false, 'two words, findable');
  assert.equal(
    isBarePartNumber('3 Year Extended Warranty (Renewal/High Volume)'),
    false,
    'many words, findable',
  );
  assert.equal(
    isBarePartNumber('1GB 266MHz DDR ECC Registered CL2.5 DIMM, x4'),
    false,
    'many words, findable',
  );
});

test('deliberate traps: grocery rows that look like they might be codes are not', () => {
  assert.equal(isBarePartNumber('Milk 2%'), false);
  assert.equal(isBarePartNumber('Tylenol 500'), false);
});

test('a single word with no digit is a real word, not a code', () => {
  assert.equal(isBarePartNumber('Chromebook'), false);
  assert.equal(isBarePartNumber('Router'), false);
});

test('empty and null names are never bare part numbers', () => {
  assert.equal(isBarePartNumber(''), false);
  assert.equal(isBarePartNumber('   '), false);
  assert.equal(isBarePartNumber(null), false);
  assert.equal(isBarePartNumber(undefined), false);
});

test('the known falsifier case: a marketed model number is syntactically indistinguishable from a SKU', () => {
  // This is why EXCLUDE_BARE_PART_NUMBERS_FROM_TEXT_SEARCH ships false. The
  // predicate is honestly wrong here -- TL-WN821N is a real, typed, marketed
  // model number -- and this test records that rather than hiding it.
  assert.equal(isBarePartNumber('TL-WN821N'), true);
  assert.equal(isBarePartNumber('MFC-J4610DW'), true);
});

test('the row-level check adds the icecat scope the bare SQL clause also uses', () => {
  assert.equal(
    isBarePartNumberRow({ source: 'icecat', name: 'LV-7545', name_en: null }),
    true,
  );
  // Same text, different source: unmeasured population, must not be caught.
  assert.equal(
    isBarePartNumberRow({ source: 'openfoodfacts', name: 'LV-7545', name_en: null }),
    false,
  );
  assert.equal(
    isBarePartNumberRow({ source: 'icecat', name: 'fallback', name_en: 'AP9520T' }),
    true,
    'name_en wins over name when both exist',
  );
});

test('second version: the query spelling the name unlocks a bare row, in every punctuation the coordinator named', () => {
  const row = (name: string) => ({ source: 'icecat', name, name_en: null as string | null });
  for (const q of ['tp-link tl-wn821n', 'brother mfc-j4610dw is here', 'rt-n66u', 'tl wn821n', 'TLWN821N']) {
    const candidates = bareMatchCandidates(rawQueryTokens(q));
    if (q.includes('wn821n')) assert.equal(bareRowAllowed(row('TL-WN821N'), candidates), true, q);
  }
  // The two exact falsifier queries, checked directly against their own row.
  assert.equal(
    bareRowAllowed(row('TL-WN821N'), bareMatchCandidates(rawQueryTokens('tp-link tl-wn821n'))),
    true,
  );
  assert.equal(
    bareRowAllowed(row('MFC-J4610DW'), bareMatchCandidates(rawQueryTokens('brother mfc-j4610dw'))),
    true,
  );
  // A plain shopper query spells no bare row's name.
  assert.equal(
    bareRowAllowed(row('TL-WN821N'), bareMatchCandidates(rawQueryTokens('wireless router'))),
    false,
  );
});

test('second version: a lone trailing digit split off by a hyphen still reconstructs', () => {
  // ftsTokens (search.ts) drops length-1 tokens to keep FTS from scoring on
  // noise; rawQueryTokens must not, or "zyxel gs2200-8" can never spell
  // "GS2200-8" back (found running the acceptance test).
  const tokens = rawQueryTokens('zyxel gs2200-8');
  assert.deepEqual(tokens, ['zyxel', 'gs2200', '8']);
  const candidates = bareMatchCandidates(tokens);
  assert.equal(
    bareRowAllowed({ source: 'icecat', name: 'GS2200-8', name_en: null }, candidates),
    true,
  );
});

test('second version: a non-bare row is always allowed, regardless of the query', () => {
  const candidates = bareMatchCandidates(rawQueryTokens('completely unrelated query'));
  assert.equal(
    bareRowAllowed({ source: 'icecat', name: 'Wireless Keyboard', name_en: null }, candidates),
    true,
  );
});
