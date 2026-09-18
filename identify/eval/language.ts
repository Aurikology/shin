/**
 * Was a `cascade_miss` findable in the language the model read it in?
 *
 * WHY THIS FILE EXISTS. Shin's catalogue is effectively single-language per
 * row: a large share of Canadian rows hold only a French name, a similar
 * share only an English one. Of the 32 `cascade_miss` rows in the 200-photo
 * eval, two separate investigations tried to say how many of those are the
 * catalogue holding the product in the OTHER language from the one the model
 * read, and neither could settle it, because neither run recorded what the
 * model actually read off the photograph -- both had to guess the query from
 * index properties after the fact.
 *
 * `metrics.ts`'s `RecordedReading` now carries that reading. This file is the
 * pure comparison: given a reading and the catalogue row's own name columns,
 * was the row findable in the read language (a RANKING problem -- the row was
 * there and retrieval still missed it), or does the catalogue simply not hold
 * that language for this row (a CROSS-LANGUAGE problem)?
 *
 * No I/O here either, same discipline as `metrics.ts`: this takes plain data
 * in and returns a plain verdict, so it is testable with hand-built fixtures
 * and the caller owns opening `catalogue.db`.
 */

import type { CaptureStatus, RecordedReading } from './metrics.ts';

export type DetectedLanguage = 'en' | 'fr' | 'unknown';

/**
 * A short French/English function-word-and-diacritic guess.
 *
 * HOW IT DECIDES. Lower-cases and tokenises on non-letters, then counts hits
 * against two small closed lists of function words -- articles, prepositions,
 * conjunctions, and a handful of grocery-label words ("saveur", "sans",
 * "biologique" vs. "flavour", "without", "organic") -- plus a diacritic check
 * ([àâäéèêëîïôöùûüÿçœæ]) that counts double toward French, since a genuine
 * accented character is a much stronger signal than any single word match. It
 * is a difference of counts, not a lexicon lookup: whichever side scores
 * higher wins, and a tie or a double-zero is `'unknown'`.
 *
 * ITS KNOWN FAILURE MODES, STATED RATHER THAN HIDDEN:
 *
 *   - Short, brand-only text has no function words and no diacritics at all.
 *     "Doritos Nacho Cheese" scores 0-0 and comes back `'unknown'`, and this
 *     is common: a lot of what a model reads off a pack is proper nouns.
 *   - A loanword can score a false positive. "Café" and "Deluxe" both read as
 *     French-leaning to a diacritic/word count with no notion of borrowing.
 *   - A genuinely bilingual string (a Canadian pack's own front text mixes
 *     both languages) can score real hits on both sides; whichever list wins
 *     by one word is reported with no confidence gap, because this function
 *     returns a single answer, not a distribution.
 *   - It is word-list-sized and not maintained against a corpus, so it is
 *     tuned for grocery-label vocabulary and nothing else.
 *
 * These are exactly why `classifyCascadeMiss` treats `'unknown'` as its own
 * outcome rather than a coin flip, and why an `undetermined` count in the
 * report is not a bug in the classifier -- it is the classifier being honest
 * about text too short or too mixed to call.
 */
const FRENCH_DIACRITICS = /[àâäéèêëîïôöùûüÿçœæ]/i;

const FRENCH_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'au', 'aux',
  'avec', 'sans', 'pour', 'sur', 'sous', 'dans', 'ce', 'cette', 'ces',
  'saveur', 'gout', 'goût', 'biologique', 'bio', 'naturel', 'naturelle',
  'sucre', 'sel', 'lait', 'oeufs', 'œufs', 'farine', 'produit', 'produits',
  'boisson', 'aromatisee', 'aromatisée', 'reduit', 'réduit', 'leger', 'léger',
]);

const ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'with', 'without', 'for', 'of', 'on', 'in',
  'this', 'that', 'these',
  'flavour', 'flavor', 'taste', 'organic', 'natural', 'sugar', 'salt', 'milk',
  'eggs', 'flour', 'product', 'products', 'drink', 'flavoured', 'flavored',
  'reduced', 'light', 'original', 'classic',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zàâäéèêëîïôöùûüÿçœæ]+/i)
    .filter(Boolean);
}

export function detectLanguage(text: string | null | undefined): DetectedLanguage {
  if (!text || !text.trim()) return 'unknown';
  const tokens = tokenize(text);
  let frenchScore = (text.match(FRENCH_DIACRITICS)?.length ?? 0) * 2;
  let englishScore = 0;
  for (const t of tokens) {
    if (FRENCH_WORDS.has(t)) frenchScore += 1;
    if (ENGLISH_WORDS.has(t)) englishScore += 1;
  }
  if (frenchScore === 0 && englishScore === 0) return 'unknown';
  if (frenchScore === englishScore) return 'unknown';
  return frenchScore > englishScore ? 'fr' : 'en';
}

/** The catalogue's own name columns for one row, exactly as `catalogue.db` stores them. */
export interface CatalogueRowNames {
  readonly code: string;
  /** NOT NULL in the schema, but read defensively -- see `schema.ts`. */
  readonly name: string | null;
  readonly name_en: string | null;
  readonly name_fr: string | null;
  /** Machine-derived cross-language text (`crosslang.ts`), never a genuine printed name. */
  readonly name_derived: string | null;
}

export type MissClass = 'ranking' | 'cross_language' | 'undetermined';

export interface MissClassification {
  readonly classification: MissClass;
  /** The language the reading was judged to be in, `'unknown'` when undetermined. */
  readonly readLanguage: DetectedLanguage;
  /** Where `readLanguage` came from, for anyone auditing a single row by hand. */
  readonly readLanguageSource: 'heuristic' | 'model-reported' | 'none';
  /** One sentence, always present, saying why -- especially for `undetermined`. */
  readonly reason: string;
}

function present(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * Which of en/fr the row genuinely HOLDS as a name.
 *
 * `name_en`/`name_fr` are authoritative when present. When BOTH are empty --
 * the 28,038-row case `schema.ts` documents, where the row's only name lives
 * in the bare `name` column -- that column's language is not recorded
 * anywhere and has to be guessed the same way a reading does. That guess is
 * reported back to the caller (`bareNameGuessed`) so the report can say a
 * classification rests on an inference rather than a stored fact.
 */
function rowLanguages(row: CatalogueRowNames): {
  en: boolean;
  fr: boolean;
  bareNameGuessed: DetectedLanguage | null;
} {
  const en = present(row.name_en);
  const fr = present(row.name_fr);
  if (en || fr) return { en, fr, bareNameGuessed: null };
  const guess = detectLanguage(row.name);
  return { en: guess === 'en', fr: guess === 'fr', bareNameGuessed: guess };
}

/**
 * The read language, preferring the actual query text over the model's own
 * language claim.
 *
 * `readAs` is literally what the cascade searched with, so its detected
 * language is the more direct signal. The model's own `language_seen` is
 * used only as a fallback, for the common case the heuristic cannot call at
 * all -- a brand-only `readAs` with no function words. `language_seen ===
 * 'both'` is never used to break the tie: the model saying it saw both
 * languages on the pack says nothing about which language ended up in the
 * three words `readAs` actually holds, so treating it as either answer would
 * be manufacturing a signal that is not there.
 */
function readLanguageOf(reading: {
  readonly readAs: string;
  readonly languageSeen: 'en' | 'fr' | 'both' | null;
}): { lang: DetectedLanguage; source: MissClassification['readLanguageSource'] } {
  const heuristic = detectLanguage(reading.readAs);
  if (heuristic !== 'unknown') return { lang: heuristic, source: 'heuristic' };
  if (reading.languageSeen === 'en' || reading.languageSeen === 'fr') {
    return { lang: reading.languageSeen, source: 'model-reported' };
  }
  return { lang: 'unknown', source: 'none' };
}

/**
 * Classify one `cascade_miss` row.
 *
 * `captureStatus`/`reading` come straight off the `StageObservation`; pass
 * them exactly as read, including `undefined` for a pre-2026-09-18 result
 * file -- this function is where that is turned into an honest sentence
 * rather than a silent zero.
 *
 * `row` is the expected code's own catalogue row, or `null` when the code
 * could not be found in `catalogue.db` at all (a different problem from
 * anything this file measures, and reported as its own reason).
 */
export function classifyCascadeMiss(
  captureStatus: CaptureStatus | undefined,
  reading: RecordedReading | null | undefined,
  row: CatalogueRowNames | null,
): MissClassification {
  if (captureStatus === undefined) {
    return {
      classification: 'undetermined',
      readLanguage: 'unknown',
      readLanguageSource: 'none',
      reason: 'not recorded in this run: the result file predates the reading-capture field',
    };
  }
  if (captureStatus === 'not_attempted') {
    return {
      classification: 'undetermined',
      readLanguage: 'unknown',
      readLanguageSource: 'none',
      reason: 'no vision call was made for this row (barcode short-circuit)',
    };
  }
  if (captureStatus === 'call_failed') {
    return {
      classification: 'undetermined',
      readLanguage: 'unknown',
      readLanguageSource: 'none',
      reason: 'the vision call failed before producing a reading',
    };
  }
  if (!reading || !present(reading.readAs)) {
    return {
      classification: 'undetermined',
      readLanguage: 'unknown',
      readLanguageSource: 'none',
      reason: 'the model answered but the reading was empty (nothing legible on the label)',
    };
  }
  if (!row) {
    return {
      classification: 'undetermined',
      readLanguage: 'unknown',
      readLanguageSource: 'none',
      reason: 'the expected code was not found in catalogue.db',
    };
  }
  const { lang, source } = readLanguageOf(reading);
  if (lang === 'unknown') {
    return {
      classification: 'undetermined',
      readLanguage: 'unknown',
      readLanguageSource: source,
      reason: `could not determine a read language from "${reading.readAs}" (heuristic ambiguous, model reported ${reading.languageSeen ?? 'nothing'})`,
    };
  }
  const { en, fr, bareNameGuessed } = rowLanguages(row);
  const holds = lang === 'en' ? en : fr;
  const guessNote = bareNameGuessed
    ? ` (row has neither name_en nor name_fr; language of its bare "name" column was guessed as ${bareNameGuessed})`
    : '';
  /*
   * `name_derived` is `crosslang.ts`'s own machine-generated bridge text, not
   * a printed name -- so its presence never flips ranking vs. cross_language.
   * It IS worth a note on a cross_language verdict specifically: it means the
   * catalogue already carries a cross-language mitigation for this exact row
   * and the cascade still missed, which points at the mitigation or the query
   * rather than at "nobody ever addressed this row."
   */
  const derivedNote =
    !holds && present(row.name_derived)
      ? ' -- name_derived already holds cross-language text for this row; the FTS mitigation exists and still missed'
      : '';
  return {
    classification: holds ? 'ranking' : 'cross_language',
    readLanguage: lang,
    readLanguageSource: source,
    reason: holds
      ? `read as ${lang}; the row holds a ${lang} name${guessNote} -- retrieval, not language, missed it`
      : `read as ${lang}; the row holds no ${lang} name (name_en=${en ? 'present' : 'absent'}, name_fr=${fr ? 'present' : 'absent'})${guessNote}${derivedNote}`,
  };
}
