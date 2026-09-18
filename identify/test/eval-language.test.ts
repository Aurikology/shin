/**
 * Tests for the cascade-miss language classifier.
 *
 * NOTE ON LOCATION: this file lives in `identify/eval/`, not `identify/test/`,
 * where every other `*.test.ts` in this package lives and where
 * `identify/package.json`'s `test` script (`node --test "test/*.test.ts"`)
 * looks. That script's glob will NOT pick this file up. It is placed here
 * because the lane that wrote it is scoped to write only inside
 * `identify/eval/` and `identify/test/` is outside that boundary -- flagged
 * in the lane's report rather than worked around by editing `package.json`,
 * which is also outside the boundary. `identify/tsconfig.json` already
 * includes `eval/**\/*.ts`, so `npm run typecheck` DOES see this file; only
 * `npm test`'s glob misses it. Run directly with:
 *   node --test eval/language.test.ts
 * from the `identify/` directory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCascadeMiss,
  detectLanguage,
  type CatalogueRowNames,
} from '../eval/language.ts';
import type { CaptureStatus, RecordedReading } from '../eval/metrics.ts';

// ---------------------------------------------------------------- detectLanguage

test('detectLanguage: plain English function words win', () => {
  assert.equal(detectLanguage('Tomato Ketchup with Sugar and Salt'), 'en');
});

test('detectLanguage: plain French function words and diacritics win', () => {
  assert.equal(detectLanguage('Ketchup aux tomates avec sucre et sel'), 'fr');
});

test('detectLanguage: a lone accented character is enough to lean French', () => {
  assert.equal(detectLanguage('Café Léger'), 'fr');
});

test('detectLanguage: brand-only text with no function words is unknown, not a guess', () => {
  // Documented limit: proper nouns carry no function words and no diacritics.
  assert.equal(detectLanguage('Doritos Nacho Cheese'), 'unknown');
});

test('detectLanguage: empty or missing text is unknown', () => {
  assert.equal(detectLanguage(''), 'unknown');
  assert.equal(detectLanguage('   '), 'unknown');
  assert.equal(detectLanguage(null), 'unknown');
  assert.equal(detectLanguage(undefined), 'unknown');
});

test('detectLanguage: a tie between the two word lists is unknown, not a coin flip', () => {
  // One French word, one English word, no diacritics: 1-1.
  assert.equal(detectLanguage('the sucre'), 'unknown');
});

// ---------------------------------------------------------------- classifyCascadeMiss fixtures

function reading(over: Partial<RecordedReading> = {}): RecordedReading {
  return {
    readAs: 'Coca-Cola Coke Zero Cherry',
    brand: 'Coca-Cola',
    name: 'Coke Zero',
    variant: 'Cherry',
    languageSeen: 'en',
    model: 'test-model',
    ms: 1200,
    barcodeFromPhoto: null,
    ...over,
  };
}

function row(over: Partial<CatalogueRowNames> = {}): CatalogueRowNames {
  return {
    code: '0001',
    name: 'Cherry-flavoured calorie-free cola',
    name_en: 'Cherry-flavoured calorie-free cola',
    name_fr: 'Coca-cola cerise',
    name_derived: null,
    ...over,
  };
}

test('captureStatus undefined: an old result file, not a zero', () => {
  const v = classifyCascadeMiss(undefined, undefined, row());
  assert.equal(v.classification, 'undetermined');
  assert.match(v.reason, /not recorded in this run/);
});

test('captureStatus not_attempted: the barcode short-circuit, no call was ever made', () => {
  const v = classifyCascadeMiss('not_attempted', null, row());
  assert.equal(v.classification, 'undetermined');
  assert.match(v.reason, /no vision call was made/);
});

test('captureStatus call_failed: a real attempt that produced nothing usable', () => {
  const v = classifyCascadeMiss('call_failed', null, row());
  assert.equal(v.classification, 'undetermined');
  assert.match(v.reason, /vision call failed/);
});

/*
 * THE PIN: 'not_attempted' and 'call_failed' must both be undetermined, but
 * they must not collapse into the SAME reason as each other or as `undefined`
 * -- that would be exactly the "a field reporting nothing looks identical to
 * a feature with nothing to report" defect (D-117/118/119) this was built to
 * avoid. Three distinct facts, three distinct sentences.
 */
test('not-captured, call-failed and not-recorded are three different reasons, not one', () => {
  const notRecorded = classifyCascadeMiss(undefined, undefined, row()).reason;
  const notAttempted = classifyCascadeMiss('not_attempted', null, row()).reason;
  const callFailed = classifyCascadeMiss('call_failed', null, row()).reason;
  const set = new Set([notRecorded, notAttempted, callFailed]);
  assert.equal(set.size, 3);
});

test('captured but empty reading (unreadable_photo): undetermined, and said plainly', () => {
  const v = classifyCascadeMiss('captured', reading({ readAs: '', brand: null, name: null, variant: null }), row());
  assert.equal(v.classification, 'undetermined');
  assert.match(v.reason, /empty/);
});

test('captured, but the catalogue no longer has the expected code: undetermined', () => {
  const v = classifyCascadeMiss('captured', reading(), null);
  assert.equal(v.classification, 'undetermined');
  assert.match(v.reason, /not found in catalogue\.db/);
});

test('RANKING: read in English, row holds an English name -- retrieval is the problem', () => {
  const v = classifyCascadeMiss('captured', reading({ readAs: 'Coke Zero Cherry', languageSeen: 'en' }), row());
  assert.equal(v.classification, 'ranking');
  assert.equal(v.readLanguage, 'en');
});

test('CROSS-LANGUAGE: read in French, the catalogue row holds only an English name', () => {
  const enOnlyRow = row({
    name_fr: null,
    name: 'Cherry-flavoured calorie-free cola',
    name_en: 'Cherry-flavoured calorie-free cola',
  });
  const v = classifyCascadeMiss(
    'captured',
    reading({ readAs: 'Coca-Cola cerise sans sucre avec caféine', languageSeen: 'fr' }),
    enOnlyRow,
  );
  assert.equal(v.classification, 'cross_language');
  assert.equal(v.readLanguage, 'fr');
});

test('CROSS-LANGUAGE the other direction: read in English, row holds only French', () => {
  const frOnlyRow = row({ name_en: null, name_fr: 'Boisson gazeuse au cola sans sucre' });
  const v = classifyCascadeMiss(
    'captured',
    reading({ readAs: 'Diet Cola No Sugar', languageSeen: 'en' }),
    frOnlyRow,
  );
  assert.equal(v.classification, 'cross_language');
});

test('a row holding BOTH languages is never cross-language, whichever one was read', () => {
  const both = row({ name_en: 'Cherry Cola', name_fr: 'Cola cerise' });
  const asEn = classifyCascadeMiss('captured', reading({ readAs: 'Cherry Cola', languageSeen: 'en' }), both);
  const asFr = classifyCascadeMiss('captured', reading({ readAs: 'Cola cerise avec sucre', languageSeen: 'fr' }), both);
  assert.equal(asEn.classification, 'ranking');
  assert.equal(asFr.classification, 'ranking');
});

test('bare-name-only row (no name_en, no name_fr): language is guessed from `name` and flagged as a guess', () => {
  const bare = row({ name_en: null, name_fr: null, name: 'Sirop d’érable biologique' });
  const v = classifyCascadeMiss(
    'captured',
    reading({ readAs: 'Organic Maple Syrup', languageSeen: 'en' }),
    bare,
  );
  assert.equal(v.classification, 'cross_language');
  assert.match(v.reason, /bare "name" column was guessed/);
});

test('read language cannot be determined (brand-only text, model reported nothing): undetermined', () => {
  const v = classifyCascadeMiss(
    'captured',
    reading({ readAs: 'Doritos', brand: 'Doritos', name: null, variant: null, languageSeen: null }),
    row(),
  );
  assert.equal(v.classification, 'undetermined');
  assert.match(v.reason, /could not determine a read language/);
});

test('language_seen falls back in only when the heuristic on readAs cannot decide', () => {
  // "Doritos" alone has no function words (heuristic: unknown), so the
  // model's own claim is used instead.
  const v = classifyCascadeMiss(
    'captured',
    reading({ readAs: 'Doritos', brand: 'Doritos', name: null, variant: null, languageSeen: 'fr' }),
    row({ name_en: null, name_fr: 'Doritos Nacho' }),
  );
  assert.equal(v.readLanguageSource, 'model-reported');
  assert.equal(v.readLanguage, 'fr');
  assert.equal(v.classification, 'ranking');
});

test("language_seen: 'both' is never used to force a language call the text itself does not support", () => {
  const v = classifyCascadeMiss(
    'captured',
    reading({ readAs: 'Doritos', brand: 'Doritos', name: null, variant: null, languageSeen: 'both' }),
    row(),
  );
  assert.equal(v.classification, 'undetermined');
  assert.equal(v.readLanguage, 'unknown');
});

test('the heuristic on the actual query text outranks a disagreeing language_seen', () => {
  // readAs is unambiguously English by function words; language_seen claims
  // French. The literal search text wins, because that is what the cascade
  // actually searched with.
  const v = classifyCascadeMiss(
    'captured',
    reading({ readAs: 'Diet Cola with Sugar and Caffeine', languageSeen: 'fr' }),
    row({ name_en: 'Diet Cola', name_fr: null }),
  );
  assert.equal(v.readLanguageSource, 'heuristic');
  assert.equal(v.readLanguage, 'en');
  assert.equal(v.classification, 'ranking');
});
