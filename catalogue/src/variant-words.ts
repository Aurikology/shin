/**
 * THE WORDS A VARIANT CAN BE SPELLED WITH, IN ONE TABLE BOTH SIDES READ.
 *
 * D-099 fixed the case where a Cherry Coke Zero came back as a plain Coke Zero
 * by asking every row whether it carries the variant the model read. It asked
 * the question literally: every token of the variant had to appear in the row's
 * three names. That works for "Cherry" and stops working the moment the model
 * transcribes what the can actually says.
 *
 * The can says "Zero Sugar". The catalogue row for that exact can is
 * "Cherry-flavoured calorie-free cola", French name "Coca-cola cerise", and its
 * category path carries `en:diet-cola-soft-drink`. Nothing in it says "zero".
 * So a variant of "Cherry Zero Sugar" makes the literal check FALSE on the one
 * row it exists to find, and the guard silently stops helping on the more
 * likely transcription of the two. The same family is spelled "diet",
 * "sugar-free", "no sugar", "sans sucre", "zéro" and "calorie-free" across this
 * catalogue, all meaning one thing to a shopper.
 *
 * So a variant token agrees with a row when the row carries the token itself OR
 * any other member of its family, and for the zero family also when the row's
 * category path says diet. This is a STARTING table, not a lexicon: the
 * families here are the ones a soft drink aisle actually needs, and a word with
 * no family behind it is still matched literally, exactly as before.
 *
 * It lives in `catalogue/` because the spellings are the catalogue's own: a
 * row says "calorie-free" where the can says "Zero Sugar", and the shelf tag
 * says "diet". `identify` imports this one leaf file (a table and a pure
 * function, no imports of its own), which is not the same as importing the
 * catalogue service; `identify.ts`'s header rule that the catalogue arrives
 * as a function still holds for everything that touches a database.
 */

/**
 * One family per idea, every spelling the catalogue or a can uses for it, in
 * English and French, folded below before anything is compared.
 *
 * `words` are matched as phrases against the row's names; `categoryHints` are
 * whole words looked for inside the row's shelf tags, and only the zero family
 * has them, because "diet" is a shelf the catalogue files things under and a
 * can may print the idea as nothing more than "calorie-free". Light is its own
 * family and never zero: a light cola still has sugar in it. A flavour with no
 * family behind it is matched literally, so an unlisted one still works, it
 * just does not cross the language line.
 */
const FAMILIES: readonly { readonly words: readonly string[]; readonly categoryHints?: readonly string[] }[] = [
  {
    words: [
      'zero', 'zero sugar', 'zero calorie', 'sugar free', 'no sugar', 'calorie free', 'diet',
      'zéro', 'zéro sucre', 'sans sucre', 'sans calories', 'diète',
    ],
    categoryHints: ['diet', 'zero', 'sugar free', 'no sugar', 'sans sucre', 'artificially sweetened'],
  },
  { words: ['light', 'lite', 'léger', 'légère'] },
  { words: ['caffeine free', 'no caffeine', 'decaf', 'decaffeinated', 'sans caféine', 'décaféiné', 'décaféinée'] },
  { words: ['cherry', 'cerise'] },
  { words: ['vanilla', 'vanille'] },
  { words: ['lime', 'citron vert', 'limette'] },
  { words: ['lemon', 'citron'] },
  { words: ['orange'] },
  { words: ['raspberry', 'framboise'] },
  { words: ['strawberry', 'fraise'] },
  { words: ['peach', 'pêche'] },
  { words: ['mango', 'mangue'] },
];

/**
 * "Cherry flavoured" and "Cherry" name the same can, and "Zero Sugar" is
 * already one phrase in the family above, so a leftover "sugar" or "flavoured"
 * that the row does not happen to repeat must not be what defeats a match. Only
 * filler goes in here; a word that separates two products never does.
 */
const IGNORED = new Set(['flavoured', 'flavored', 'flavour', 'flavor', 'saveur', 'sugar', 'sucre']);

/** Lower-cased and stripped of accents, so "Cerise" and "cerise" are one word. */
export function foldVariantText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Folded, with every run of punctuation flattened to one space.
 *
 * Flattening is what lets a phrase be matched at all: "calorie-free" and
 * "calorie free" are one string after this, and a row reading
 * "Cherry-flavoured" still answers to "cherry" because the check below stays a
 * substring one.
 */
function normalizeForMatch(s: string): string {
  return foldVariantText(s).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The variant as tokens. Empty means nobody pinned one, which is not a miss. */
export function variantTokens(variant: string | null | undefined): string[] {
  if (!variant) return [];
  return normalizeForMatch(variant).split(' ').filter(Boolean);
}

/** Every family, folded once, with its longest phrase measured. */
const FOLDED: readonly { words: readonly string[]; categoryHints: readonly string[] }[] = FAMILIES.map(
  (f) => ({
    words: f.words.map(normalizeForMatch),
    categoryHints: (f.categoryHints ?? []).map(normalizeForMatch),
  }),
);

const LONGEST_PHRASE = Math.max(
  ...FOLDED.flatMap((f) => f.words.map((w) => w.split(' ').length)),
);

/**
 * The family matching the variant tokens at this position, longest phrase first.
 *
 * Longest first is not a tidiness preference. "Zero sugar" has to be read as
 * one phrase, because reading "zero" on its own leaves "sugar" behind as a word
 * the row must also carry, and the row spells the whole idea "calorie-free".
 */
function familyAt(
  tokens: readonly string[],
  at: number,
): { family: (typeof FOLDED)[number]; length: number } | null {
  for (let length = Math.min(LONGEST_PHRASE, tokens.length - at); length >= 1; length -= 1) {
    const phrase = tokens.slice(at, at + length).join(' ');
    const family = FOLDED.find((f) => f.words.includes(phrase));
    if (family) return { family, length };
  }
  return null;
}

/** Does the row say this family in any of its spellings, or on its shelf? */
function familyIsPresent(
  family: (typeof FOLDED)[number],
  haystack: string,
  tags: readonly string[],
): boolean {
  if (family.words.some((w) => haystack.includes(w))) return true;
  // Whole words inside the tag, so "en:diet-sodas" counts and
  // "en:dietary-supplements" does not.
  return family.categoryHints.some((hint) => tags.some((tag) => tagCarries(tag, hint)));
}

function tagCarries(tag: string, hint: string): boolean {
  const words = tag.split(' ');
  const wanted = hint.split(' ');
  for (let i = 0; i + wanted.length <= words.length; i += 1) {
    if (wanted.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

/**
 * DOES THIS ROW CARRY THE VARIANT? The one rule, asked identically by both sides.
 *
 * Still ALL the tokens, because a multi-word variant names one product and a
 * row answering to half of it is the row the guard exists to hold back. What
 * changed is what counts as answering: a token is satisfied by its family, by
 * the row's category path for the zero family, or by itself for every word with
 * no family behind it.
 *
 * `text` is the row's names joined, `categoryPath` its tags. False when nothing
 * was pinned is the caller's business to distinguish, and both callers do: they
 * ask `variantTokens` first, because "no variant read" and "the variant is
 * absent" are different answers and only the second one is evidence.
 */
export function variantCarriedBy(
  variant: string | null | undefined,
  text: string,
  categoryPath: readonly string[] = [],
): boolean {
  const tokens = variantTokens(variant);
  if (tokens.length === 0) return false;

  const haystack = normalizeForMatch(text);
  const tags = categoryPath.map(normalizeForMatch);

  let i = 0;
  while (i < tokens.length) {
    const match = familyAt(tokens, i);
    if (match) {
      if (!familyIsPresent(match.family, haystack, tags)) return false;
      i += match.length;
      continue;
    }
    const token = tokens[i];
    i += 1;
    // Filler the family beside it already accounted for. Never a word that
    // could separate two products.
    if (IGNORED.has(token)) continue;
    if (!haystack.includes(token)) return false;
  }
  return true;
}
