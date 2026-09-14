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
 * WHAT IS COVERED TODAY is EVERY member of `LineCode`: the nine verdict-line
 * codes in `spine/src/categories.ts`, the ten fragments of the thin-evidence
 * line, the five confidence sentences, the ten shortfall fragments, the six
 * basis fragments, the ten refusals and the two disagreements. It started at
 * nine, and the gap was not theoretical: a French shopper was shown "Could not
 * work out what this is. Scan the barcode, or type the model number." in
 * English on a live refusal sheet, because refusals were the half nobody had
 * written. `test/prose-coverage.test.mjs` now reads the union out of
 * `spine/src/contract.ts` and fails the day the spine grows a code this file
 * has not learned, so the gap cannot silently reopen.
 *
 * MONEY IS FORMATTED BY `cad`, the same function every other number on the
 * screen goes through, and `cad` is itself locale-aware: it writes "$4.99" in
 * English and "4,99 $" (with a non-breaking space) in French. Nothing here
 * re-punctuates a number on its own, and nothing here may: one spelling of one
 * amount per screen is the whole point, and the place that decides it is
 * `shin.js`.
 *
 * TIER WORDS ARE NOT AVAILABLE TO EVERY CODE. A refusal, a shortfall, a basis
 * clause and a confidence sentence are all statements about the EVIDENCE, and
 * none of them has graded a price. So none of them may reach for "bon prix",
 * "aubaine", "cher" or any other word that sounds like a verdict, because a
 * French reader would hear a call the English never made. The coverage test
 * asserts their absence code by code.
 */

import { locale } from './lib/locale.js';
import { cad } from './shin.js';

/* ──────────────────────────────────────────────────────────────────────────
 * The small amount of French grammar these sentences need.
 *
 * Every one of these exists because the fact it reads is RAW, which is the
 * contract's own rule: a count arrives as a number and the language decides
 * where its plural falls, a date arrives as ISO and the language decides how a
 * day is written, a category arrives as a code and the language owns its name.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The French plural 's'.
 *
 * French pluralises at TWO, not at one: "0 jour", "1 jour", "2 jours". English
 * pluralises everything that is not exactly one, which is why the contract
 * forbids a `..._singular` code and passes the count instead.
 */
function s(n) {
  return Number(n) >= 2 ? 's' : '';
}

/**
 * The five categories, named in French, with the gender and number the verbs
 * after them have to agree with.
 *
 * The spine sends `category` (the raw `CategoryId`) beside `categoryLabel`
 * (its English prose name) on every fragment that needs one, precisely so this
 * table can exist. `categoryLabel` is the fallback for a category code added
 * after this build, and it is English on purpose: a wrong French name for a
 * category is worse than a right English one.
 */
const CATEGORIES = {
  grocery: { inline: "l'épicerie", title: "L'épicerie", plural: false },
  tech: { inline: 'la techno', title: 'La techno', plural: false },
  used: { inline: "l'usagé", title: "L'usagé", plural: false },
  furniture: { inline: 'les meubles', title: 'Les meubles', plural: true },
  produce: { inline: 'les fruits et légumes', title: 'Les fruits et légumes', plural: true },
};

/** The category's name inside a sentence: "le prix ... et l'épicerie bouge ...". */
function categoryInline(f) {
  return CATEGORIES[f.category]?.inline ?? f.categoryLabel;
}

/** The category's name starting a sentence. */
function categoryTitle(f) {
  return CATEGORIES[f.category]?.title ?? f.categoryLabel;
}

/** A verb agreeing with the category: "l'épicerie bouge", "les meubles bougent". */
function categoryVerb(f, singular, plural) {
  return CATEGORIES[f.category]?.plural ? plural : singular;
}

/**
 * The kinds of price, which arrive as the contract's own `PriceKind` codes so
 * that each language can name them. English joins them with " and "; French
 * joins with " et ".
 */
const KINDS = {
  regular: 'des prix courants',
  promotional: 'des prix en promotion',
  asking: 'des prix demandés',
  sold: 'des prix de vente',
  list: 'des prix de liste',
};

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/**
 * An ISO day, written the way a Quebec reader writes one: "3 septembre", and
 * "1er septembre" on the first of the month, which is the one ordinal French
 * still spells out. An unparseable date comes back untouched rather than
 * guessed at.
 */
function day(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (m === null) return String(iso ?? '');
  const month = MONTHS[Number(m[2]) - 1];
  if (month === undefined) return String(iso ?? '');
  const d = Number(m[3]);
  return `${d === 1 ? '1er' : d} ${month}`;
}

/** One shopper's reading: the amount, the shop and the day it was seen. */
function readingsOf(f) {
  const rows = Array.isArray(f.readings) ? f.readings : [];
  return rows.map((r) => `${cad(r?.amountCents)} chez ${r?.seller} le ${day(r?.observedAt)}`);
}

/**
 * "the only price we have" / "what every seller charges", chosen by a count.
 *
 * One clause, two English wordings over the SAME number, which is why the
 * spine sends `sellerCount` rather than splitting the code. French makes the
 * same choice on the same count.
 */
function solePrice(f) {
  return Number(f.sellerCount) === 1 ? "le seul prix que j'ai" : 'ce que tous les vendeurs demandent';
}

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

  /* --- la ligne des preuves minces, `price/src/verdict.ts`.
   * Quatre fragments au plus, collés par une espace. Ce sont des lignes de
   * verdict: l'anglais y dit "cheapest" et "on sale", alors le français peut
   * dire "le moins cher" et "en solde". Rien d'autre ici n'a le droit. --- */
  asking_below_sole_price: (f) => `${cad(f.askingCents)}, c'est moins que ${solePrice(f)}.`,
  asking_below_range: (f) => `${cad(f.askingCents)}, c'est dans le bas de la fourchette.`,
  asking_equals_sole_price: (f) => `${cad(f.askingCents)}, c'est exactement ${solePrice(f)}.`,
  asking_within_range: (f) => `${cad(f.askingCents)}, c'est à peu près ce que les autres demandent.`,
  asking_above_sole_price: (f) => `${cad(f.askingCents)}, c'est plus que ${solePrice(f)}.`,
  asking_above_range: (f) => `${cad(f.askingCents)}, c'est dans le haut de la fourchette.`,
  sole_price_matched_at_seller: (f) => `${f.seller} l'a aussi à ${cad(f.amountCents)}.`,
  cheapest_and_dearest_sellers: (f) =>
    `${f.cheapestSeller} l'a à ${cad(f.cheapestCents)}, ${f.dearestSeller} à ${cad(f.dearestCents)}.`,
  /* `unitLabel` est "100g" ou "100ml", un symbole d'unité et non de la prose,
   * alors il traverse tel quel, comme en anglais. */
  unit_price: (f) => `Ça fait ${cad(f.unitCents)} par ${f.unitLabel}.`,
  cheaper_on_promotion_at_seller: (f) => `${f.seller} l'a en solde à ${cad(f.amountCents)}.`,

  /* --- la confiance. Ces phrases parlent de la PREUVE et n'ont jugé aucun
   * prix, alors aucun mot de palier n'y entre. "À peine assez" et non "juste
   * assez": "juste" en français d'ici veut dire correct autant que de justesse,
   * et c'est exactement l'ambiguïté qu'un mot de palier introduirait. --- */
  confidence_minimum_met_only: (f) =>
    `À peine assez pour répondre: ${f.pointCount} prix chez ${f.sellerCount} vendeur${s(f.sellerCount)}.`,
  confidence_newest_price_age: (f) =>
    `Le prix le plus récent a ${f.ageDays} jour${s(f.ageDays)}.`,
  confidence_history_span_exact_match: (f) =>
    `${f.pointCount} prix étalés sur ${f.spanDays} jour${s(f.spanDays)} de l'historique de ce marchand, et le produit correspond à coup sûr.`,
  confidence_fresh_across_sellers_exact_match: (f) =>
    `${f.pointCount} prix chez ${f.sellerCount} vendeur${s(f.sellerCount)}, aucun plus vieux que ${f.oldestAgeDays} jour${s(f.oldestAgeDays)}, et le produit correspond à coup sûr.`,
  confidence_price_count_across_sellers: (f) =>
    `${f.pointCount} prix chez ${f.sellerCount} vendeur${s(f.sellerCount)}.`,

  /* --- les manques, en minuscules: la forme `shortfall_list` les colle avec
   * "; " et met la majuscule elle-même, exactement comme en anglais. --- */
  shortfall_lone_claims_held_back: (f) =>
    `${f.count} prix saisi${s(f.count)} ${Number(f.count) >= 2 ? 'sont retenus' : 'est retenu'} pour l'instant, trop loin du reste pour le publier sur la parole d'une seule personne`,
  shortfall_uncorroborated_typed_prices: (f) =>
    `${f.count} prix saisi${s(f.count)} ${Number(f.count) >= 2 ? 'ne sont pas comptés' : "n'est pas compté"} ici, parce que personne d'autre n'a encore vu ${Number(f.count) >= 2 ? 'ces étiquettes' : 'cette étiquette'}`,
  shortfall_newest_price_older_than_category: (f) =>
    `le prix le plus récent que j'ai a ${f.ageDays} jour${s(f.ageDays)}, et ${categoryInline(f)} ${categoryVerb(f, 'bouge', 'bougent')} plus vite que ça`,
  shortfall_some_prices_too_old_to_count: (f) =>
    `${f.droppedCount} prix sur ${f.totalCount} ${Number(f.droppedCount) >= 2 ? 'sont trop vieux' : 'est trop vieux'} pour compter`,
  shortfall_fewer_points_than_category_needs: (f) =>
    `${f.pointCount} prix, alors que ${categoryInline(f)} en ${categoryVerb(f, 'demande', 'demandent')} d'habitude ${f.needed}`,
  shortfall_fewer_sellers_than_category_needs: (f) =>
    `${f.sellerCount} vendeur${s(f.sellerCount)}, alors que ${categoryInline(f)} en ${categoryVerb(f, 'demande', 'demandent')} d'habitude ${f.needed}`,
  shortfall_prices_may_be_two_products: () =>
    "les prix trouvés s'écartent assez pour que ce soit plus qu'un seul produit",
  shortfall_no_comparable_price_kinds: (f) => {
    const kinds = (Array.isArray(f.kinds) ? f.kinds : []).map((k) => KINDS[k] ?? k);
    // No kinds is a malformed fragment, not a sentence with nothing in it.
    // The empty string takes the whole thing back to English, by rule 3.
    if (kinds.length === 0) return '';
    return `les seuls prix que quelqu'un publie pour ça, ce sont ${kinds.join(' et ')}, et ça ne fait pas une comparaison`;
  },
  shortfall_newest_price_past_tolerance: (f) =>
    `le prix le plus récent que j'ai a ${f.ageDays} jour${s(f.ageDays)}, au-delà de ce que ${categoryInline(f)} ${categoryVerb(f, 'tolère', 'tolèrent')}`,
  shortfall_only_the_asking_seller_has_prices: () =>
    "tous les prix que j'ai viennent de ce même magasin, alors c'est comparé à son propre historique plutôt qu'à qui que ce soit d'autre",

  /* --- la base de la confiance, venue de `price/src/verdict.ts`. Des bouts de
   * phrase, pas des phrases. --- */
  basis_single_seller: () => 'un seul vendeur',
  basis_sellers_agree_on_range: (f) =>
    `${f.sellerCount} vendeur${s(f.sellerCount)} ${Number(f.sellerCount) >= 2 ? "s'entendent" : "s'entend"} sur la fourchette`,
  basis_newest_price_over_three_weeks: () => 'le prix le plus récent a plus de trois semaines',
  basis_only_sale_prices: () => 'seulement des prix en solde pour comparer',
  basis_matched_by_name_not_barcode: () => 'un vendeur apparié par le nom, pas par le code-barres',
  /**
   * L'ALARME, et la seule entrée de cette table qui ne traduit rien.
   *
   * `contract.ts` le dit: ce code ne doit jamais sortir dans une charge utile,
   * et `spine/test/structured-prose.test.ts` échoue s'il sort. Il porte
   * l'anglais mot pour mot sur `facts.text` pour que l'aller-retour tienne
   * quand même. Le rendre en français voudrait dire inventer la phrase, alors
   * il rend l'anglais tel quel: une phrase anglaise visible est un signal, une
   * phrase française inventée n'en est pas un. La réparation est un vrai code
   * dans le contrat, jamais une traduction ici.
   *
   * Sans ce texte il ne reste rien du tout à dire, alors la chaîne vide part
   * et `render` rend la phrase anglaise complète. Inventer une formule vague
   * à la place effacerait l'alarme, ce qui est le contraire du but.
   */
  basis_reason_not_yet_coded: (f) => (typeof f.text === 'string' ? f.text : ''),

  /* --- les refus. Le résultat le plus fréquent, et celui qui a été pris en
   * flagrant délit d'anglais sur un écran français. Aucun mot de palier: un
   * refus n'a jugé aucun prix. --- */
  refusal_no_price_source_available: () => "Aucune source de prix ne répond en ce moment.",
  refusal_identity_unresolved: () =>
    "Je n'ai pas pu déterminer ce que c'est. Scanne le code-barres, ou écris le numéro de modèle.",
  /* `why` est une décision consignée, écrite en anglais dans `categories.ts`.
   * Elle traverse telle quelle, comme le nom d'un marchand ou le "limit 8"
   * d'une circulaire: c'est de la donnée de source, et la traduire est le
   * problème du fichier qui l'écrit, pas de cette phrase-ci. */
  refusal_category_not_served: (f) =>
    `${categoryTitle(f)}, ce n'est pas quelque chose que Shin peut chiffrer pour l'instant. ${f.why}`,
  refusal_identity_below_floor: (f) =>
    `Je ne suis pas assez certain que ce soit le bon. Ce qui s'en approchait le plus, c'est « ${f.label} ». Choisis le bon et Shin va le chiffrer.`,
  refusal_no_price_for_product: (f) => `Rien n'a de prix pour « ${f.label} » en ce moment.`,
  refusal_asking_price_missing: () =>
    "J'ai trouvé des comparaisons, mais aucun prix pour la chose devant toi. Pointe l'étiquette.",
  refusal_asking_price_unreadable: () =>
    "Ce prix-là ne se lit pas comme un nombre. Réécris-le avec un point pour la décimale.",
  refusal_all_prices_future_dated: () =>
    "Tous les prix trouvés sont datés plus tard qu'aujourd'hui, alors il n'y a encore rien à quoi comparer.",
  /* Les deux seules phrases de refus qui portent des faits, et tout ce
   * qu'elles disent EST le relevé: le montant, le magasin, le jour. Sans
   * relevé il n'y a pas de phrase, alors la chaîne vide renvoie à l'anglais
   * plutôt que d'annoncer qu'une personne a vu quelque chose d'innommé. */
  refusal_one_shopper_report: (f) => {
    const r = readingsOf(f)[0];
    if (r === undefined) return '';
    return `Une personne a vu ${r}. Personne d'autre n'a encore donné de prix à ça, alors il n'y a rien pour le vérifier.`;
  },
  refusal_several_unconfirmed_reports: (f) => {
    const rows = readingsOf(f);
    if (rows.length === 0) return '';
    return `Des gens ont écrit ${rows.join(', et ')}. Personne n'a vu ces étiquettes-là deux fois, alors il n'y a rien pour les vérifier.`;
  },

  /* --- les désaccords. Deux nombres plutôt qu'une moyenne qui mentirait. --- */
  disagreement_wide_spread: (f) =>
    `Les prix pour la même chose vont de ${cad(f.lowCents)} à ${cad(f.highCents)} en ce moment. C'est un écart de ${String(f.ratio).replace('.', ',')}x, alors il n'y a pas un seul prix exact à donner.`,
  disagreement_promotion_not_store: (f) =>
    `L'écart ici, c'est la promotion et non le magasin: ${cad(f.promotionalCents)} en solde contre ${cad(f.regularCents)} régulier, ça fait une différence de ${String(f.ratio).replace('.', ',')}x sur la même boîte.`,
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
