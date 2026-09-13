/**
 * The engine's sentences, rebuilt in the reader's language.
 *
 * THE PROBLEM THIS EXISTS FOR. A verdict arrives carrying finished English:
 * `lines`, `confidence.because`, `detail`. Counts, currency, pluralisation and
 * word order are all baked in before the JSON leaves the server, so no amount
 * of client work can translate them. voice.js could always speak French
 * because it owns its own sentences; these were never the client's to own.
 *
 * The spine lane's answer (spine/src/contract.ts, "STRUCTURED PROSE") is codes
 * plus raw facts beside every finished sentence: `structuredLines`,
 * `structuredBecause`, `structuredDetail`, each a `{ shape, fragments }` where
 * a fragment is `{ code, facts }` and every fact is raw. This file is the
 * client half: a French renderer for the codes it has been taught, and an
 * honest refusal for the ones it has not.
 *
 * THREE RULES, and the third is the one that matters:
 *
 *   1. ENGLISH NEVER COMES THROUGH HERE. `render` returns the English field
 *      untouched when the locale is English, so the bytes a shopper reads are
 *      the engine's own, exactly as they are today. There is no path on which
 *      this file can make an English verdict read differently.
 *
 *   2. THE STRUCTURED FIELDS MAY NOT BE THERE. The spine lane's work may not
 *      be merged, an older server may be answering, or a payload may predate
 *      the field. Every entry point takes the English fallback as an argument
 *      and returns it whenever the codes are absent, malformed, or empty.
 *
 *   3. ALL OF A SENTENCE OR NONE OF IT. If one fragment in a sentence has no
 *      French renderer, the WHOLE sentence falls back to English. A sentence
 *      that is half translated is worse than one that is not: it reads as a
 *      bug to a French speaker and it can change what the sentence claims. So
 *      the unit of fallback is the sentence, never the fragment.
 *
 * WHAT IS COVERED TODAY is the nine verdict-line codes in
 * `spine/src/categories.ts` -- the sentences under a verdict, which are the
 * ones a shopper actually reads in the aisle. The confidence, refusal,
 * shortfall and disagreement codes are NOT covered yet and fall back to
 * English by rule 3, which is visible and correct rather than silent. Adding
 * one is adding a row to RENDERERS below.
 *
 * MONEY IS FORMATTED BY `cad`, the same function every other number on the
 * screen goes through, and NOT re-punctuated for French. Canadian French
 * writes "4,99 $" and this writes "$4.99" in both languages, deliberately: the
 * price in this sentence sits directly under the same price set in 44px by the
 * verdict sheet, and two spellings of one number on one card is a worse defect
 * than one Anglicised spelling. Changing the app's money format is a real
 * decision about every surface at once, not a side effect of this file.
 */

import { locale } from './lib/locale.js';
import { cad } from './shin.js';

/**
 * The French renderers, keyed by `LineCode`.
 *
 * Each takes the fragment's raw facts and returns a sentence. Cents arrive as
 * integers and go through `cad`; counts arrive as numbers and are pluralised
 * on French's own boundaries, which is why the spine lane's contract forbids a
 * code that encodes an English singular/plural split.
 *
 * A code with no entry here is not a failure, it is an untranslated sentence,
 * and `render` falls the whole sentence back to English for it.
 */
const RENDERERS = {
  /* --- l'epicerie, categories.ts --- */
  regular_price_at_sole_store: (f) =>
    `Le prix régulier est de ${cad(f.regularCents)} au seul magasin qui l'a. Tu regardes ${cad(f.askingCents)}.`,
  regular_price_across_stores: (f) =>
    `Le prix régulier tourne autour de ${cad(f.regularCents)} dans ${f.storeCount} magasins. Tu regardes ${cad(f.askingCents)}.`,
  all_prices_are_capped_promotions: (f) =>
    `Tous les prix que j'ai pour ça sont des promotions limitées, alors il n'y a rien ici que je peux honnêtement appeler un prix courant. Tu regardes ${cad(f.askingCents)}.`,
  no_regular_price_only_promotions: (f) =>
    `Aucun prix régulier en tablette trouvé, tout ce qui suit est une promotion. Tu regardes ${cad(f.askingCents)}.`,
  best_promotion_this_week: (f) =>
    `Cette semaine c'est ${cad(f.promotionalCents)} chez ${f.seller}${f.limit ? ` (${f.limit})` : ''}.`,
  no_promotion_this_week: () => "Rien en promotion nulle part où je peux voir cette semaine.",

  /* --- la techno --- */
  cheapest_of_retailers_carrying_it: (f) =>
    `${f.retailerCount} détaillants l'ont. Le moins cher est ${cad(f.cheapestCents)} chez ${f.cheapestSeller}. Tu regardes ${cad(f.askingCents)}.`,

  /* --- l'usage.
   * `basis` est un fait et non deux codes, exactement pour la raison que le
   * contrat donne: la clause qu'il choisit est une mise en garde sur la preuve,
   * et une langue est libre de la placer ailleurs dans la phrase. */
  comparable_listings_range: (f) =>
    `Les annonces comparables vont de ${cad(f.lowCents)} à ${cad(f.highCents)}, et se regroupent entre ${cad(f.clusterLowCents)} et ${cad(f.clusterHighCents)}. Tu regardes ${cad(f.askingCents)}. Ce sont ${
      f.basis === 'sold' ? "les prix auxquels ces articles se sont vraiment vendus" : "des prix demandés, pas des ventes, et les vendeurs commencent haut"
    }.`,

  /* --- les meubles --- */
  own_price_history_single_seller: (f) =>
    `Un seul marchand, alors c'est comparé à son propre historique: aussi bas que ${cad(f.lowestCents)} le ${f.lowestObservedOn}, d'habitude autour de ${cad(f.typicalCents)}. Tu regardes ${cad(f.askingCents)}.`,
};

/** Is this thing shaped like the contract's `StructuredText`? */
function usable(structured) {
  return !!structured
    && Array.isArray(structured.fragments)
    && structured.fragments.length > 0
    && structured.fragments.every((f) => f && typeof f.code === 'string');
}

/**
 * One sentence, in the reader's language, or the English fallback.
 *
 * @param {object|null|undefined} structured  a `StructuredText` off the payload,
 *   or nothing at all on a server that does not send them yet.
 * @param {string} english  the finished English field beside it. Returned
 *   unchanged whenever this file cannot do better, which is always in English
 *   and often in French.
 */
export function render(structured, english) {
  if (locale() !== 'fr') return english;
  if (!usable(structured)) return english;

  const parts = [];
  for (const f of structured.fragments) {
    const fn = RENDERERS[f.code];
    // Rule 3: one missing renderer drops the whole sentence back to English.
    if (typeof fn !== 'function') return english;
    let out;
    try {
      out = fn(f.facts ?? {});
    } catch {
      /* A fact that was not there. The English sentence was built from the same
         judgement and is complete, so it is strictly the better answer; this is
         the same trade `say()` makes with its BARE table. */
      return english;
    }
    if (typeof out !== 'string' || !out.trim()) return english;
    parts.push(out.trim());
  }

  /*
   * The three shapes the contract names. `shortfall_list` joins with "; " and
   * then sentence-cases, which is English's own rendering of "a list of
   * reasons read as one sentence"; French reads the same way, so the join is
   * kept. `single` and `sentences` are a space-joined run either way.
   */
  if (structured.shape === 'shortfall_list') {
    const joined = parts.join('; ');
    return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
  }
  return parts.join(' ');
}

/**
 * The verdict's own lines, which arrive as an array.
 *
 * Falls back per line rather than all-or-nothing across the whole array: the
 * lines make separate claims (a regular price, then this week's promotion) and
 * one of them being untranslated does not make the other wrong. The
 * all-or-nothing rule is about a SENTENCE, and each of these is one.
 *
 * A `structuredLines` of the wrong length is ignored outright. The contract
 * says `structuredLines[i]` renders back to `lines[i]`; if that is not true,
 * pairing them by index would put one line's codes under another line's
 * fallback, which is a wrong sentence rather than an untranslated one.
 */
export function renderLines(structuredLines, englishLines) {
  const english = Array.isArray(englishLines) ? englishLines : [];
  if (locale() !== 'fr') return english;
  if (!Array.isArray(structuredLines) || structuredLines.length !== english.length) return english;
  return english.map((line, i) => render(structuredLines[i], line));
}

/** Exported for test/prose.test.mjs. Not for a screen to read. */
export const FRENCH_CODES = Object.keys(RENDERERS);
