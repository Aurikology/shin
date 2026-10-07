/**
 * Shin, en français. L'autre moitié de la table de voice.js.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT A SECOND BRANCH INSIDE voice.js.
 * The English strings in voice.js are read by three test files and quoted in
 * several design documents. Moving them to make room for a second locale would
 * have rewritten every one of those references for no gain, so English stays
 * exactly where it was, byte for byte, and French arrives beside it. voice.js
 * holds the locale switch, and both tables are keyed identically.
 *
 * THE TWO PROMISES THIS FILE INHERITS, both from voice.js's own header:
 *
 *   1. "NO STRING SHIN SAYS IS WRITTEN INSIDE A SCREEN." A key that exists in
 *      English and not here is a screen that goes silent in French, which is
 *      the same failure as a missing personality. test/voice.test.mjs counts
 *      locale times personality now, so this table cannot be short.
 *
 *   2. "The attitude changes the words and never the number." Neither does the
 *      language. Nothing here may take a price, a count, a seller or a date and
 *      alter it. Every fact arrives already formatted, from the same call site
 *      that formats it for English, and is only ever interpolated. French word
 *      order moves the placeholders around inside the sentence; it never
 *      touches what is inside them.
 *
 * CANADIAN FRENCH, not France French. This is a grocery app, its market is
 * Canada, and the vocabulary follows the aisle rather than the dictionary:
 * "rabais" and "en solde" for a discount, "épicerie" for the shop, "magasiner"
 * for the act of shopping. Tutoiement throughout, which is what a Quebec
 * consumer app trying to sound like a person beside you actually does; "vous"
 * would make the warm personality sound like a bank.
 *
 * THE THREE REGISTERS HAD TO SURVIVE THE CROSSING, and that was the hard part.
 * Deadpan states the number and stops. Warm is on your side about it. Blunt is
 * short and a bit rude, at the price or the shop and never at the reader (hard
 * rule 3). Where a key's three English variants differ only by a word, the
 * French does too; where they differ in shape, so does the French. The keys
 * where the three came out closer in French than they are in English are named
 * in this lane's report rather than quietly shipped as if they were fine.
 *
 * Strings are double-quoted here rather than single-quoted as in voice.js, for
 * the obvious reason: French is full of apostrophes, and a file of backslash
 * escapes is a file nobody proofreads.
 */

/** Les trois cartes du sélecteur d'attitude, en français. Voir PERSONALITIES dans voice.js. */
export const PERSONALITIES_FR = {
  deadpan: {
    name: 'Neutre',
    blurb: 'Donne le chiffre et arrête là.',
    sample: '« Deux dollars. C’est 1,47 $. »',
  },
  warm: {
    name: 'Chaleureux',
    blurb: 'De ton bord là-dedans.',
    sample: '« Ouf, c’est salé. J’attendrais. »',
  },
  blunt: {
    name: 'Cassant',
    blurb: 'Court, et un peu bête.',
    sample: '« Ils te volent. »',
  },
};

export const LINES_FR = {
  /* --- les trois verdicts --- */
  good: {
    deadpan: (f) => `${f.usual} d'habitude. Là, c'est ${f.asking}.`,
    warm: (f) => `Belle trouvaille. C'est sous le prix habituel de ${f.usual}.`,
    blunt: () => "Prends-le. Tout de suite.",
  },
  fair: {
    deadpan: (f) => `C'est le prix courant, ${f.usual}.`,
    warm: () => "C'est pas mal ce que ça vaut. T'es correct.",
    blunt: () => "Correct. Bof.",
  },
  walk_away: {
    deadpan: (f) => `${f.asking}. Ça vaut ${f.usual}.`,
    warm: (f) => `Ouf, c'est salé. Ça se vend d'habitude ${f.usual}.`,
    blunt: () => "Ils te volent.",
  },

  /* --- les formes intenses. Même porte qu'en anglais, et la même règle
   * dessus: la colère vise le magasin ou le prix, jamais la personne qui lit
   * l'écran. --- */
  verdict_steal: {
    deadpan: () => "Personne d'autre n'approche ce prix-là.",
    warm: () => "Oh, ça c'est une vraie aubaine. Personne d'autre n'est proche.",
    blunt: () => "Quelqu'un dans ce magasin s'est trompé. Profites-en.",
  },
  verdict_ripoff: {
    deadpan: () => "Personne d'autre ne charge ça.",
    warm: () => "Non. Ça, ce n'est pas un prix, c'est un souhait.",
    blunt: () => "C'est un vol avec un code-barres dessus.",
  },

  /* --- le mot du verdict, le plus gros texte de l'écran --- */
  word_good: { deadpan: () => "Prends-le", warm: () => "Bon prix", blunt: () => "Prends-le" },
  word_fair: { deadpan: () => "C'est correct", warm: () => "C'est correct", blunt: () => "Correct" },
  word_walk_away: { deadpan: () => "Laisse faire", warm: () => "J'attendrais", blunt: () => "Laisse faire" },

  /* --- l'action principale du peek. Les trois paliers disent garder, jamais
   * surveiller: en v1 l'application enregistre un instantané du prix et ne le
   * suit pas dans le temps, alors le bouton ne peut dire que ce que la tape
   * fait vraiment. --- */
  peek_good: {
    deadpan: () => "Garde-le",
    warm: () => "Garde-le, sans hésiter",
    blunt: () => "Garde-le. Là.",
  },
  peek_fair: {
    deadpan: () => "Garde-le",
    warm: () => "Garde-le, au cas où",
    blunt: () => "Garde-le.",
  },
  peek_walk_away: {
    deadpan: () => "Garde-le",
    warm: () => "Garde-le, au cas où",
    blunt: () => "Garde-le.",
  },
  peek_watching: {
    deadpan: () => "Gardé",
    warm: () => "Gardé",
    blunt: () => "Gardé",
  },

  /* --- les refus, le résultat le plus fréquent, traités avec le même soin --- */
  refuse_unknown: {
    deadpan: () => "Je ne connais pas celui-là",
    warm: () => "Je n'ai pas encore appris celui-là",
    blunt: () => "Aucune idée",
  },
  refuse_unknown_why: {
    deadpan: () => "Je n'ai aucun prix pour ça, alors je ne vais pas deviner.",
    warm: () => "Je n'ai rien à quoi le comparer, et deviner ne t'aiderait pas.",
    blunt: () => "Rien à comparer. Montre-moi.",
  },
  refuse_unsure: {
    deadpan: () => "Je ne suis pas certain duquel il s'agit",
    warm: () => "Je pense le connaître, mais pas d'assez proche",
    blunt: () => "C'est lequel?",
  },
  refuse_unsure_why: {
    deadpan: () => "Le mauvais appariement donnerait le prix d'un autre produit, alors choisis et je le ferai.",
    warm: () => "Donner le prix de la mauvaise version serait pire que de ne pas répondre. Pointe-moi le bon.",
    blunt: () => "Mauvais produit, mauvais prix. Choisis.",
  },
  refuse_category: {
    deadpan: (f) => `Pas ${f.category}`,
    warm: (f) => `Je saute ${f.category}`,
    blunt: (f) => `${f.category}? Non.`,
  },
  refuse_unavailable: {
    deadpan: () => "Le lecteur ne répond pas",
    warm: () => "Le lecteur ne répond pas en ce moment",
    blunt: () => "Le lecteur est à terre",
  },
  refuse_unavailable_why: {
    deadpan: () => "C'est le lecteur, pas ta photo. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "C'est de mon côté, pas ta photo. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Ma faute, pas ta photo. Essaie le code-barres ou écris-le.",
  },
  refuse_declined: {
    deadpan: () => "Ce scan n'est pas passé",
    warm: () => "Celui-là n'est pas passé",
    blunt: () => "Pas passé",
  },
  refuse_thin: {
    deadpan: () => "Pas assez pour trancher",
    warm: () => "Je préfère ne pas me prononcer encore",
    blunt: () => "Pas assez. Redemande plus tard.",
  },
  /* Le refus mince quand il y a un substitut avec un prix à mettre dessous.
     Même règle qu'en anglais, et c'est la règle dure 2: sans comparaison,
     aucun mot de palier. Pas de prix jugé, pas d'adjectif. Le substitut porte
     la valeur, pas la phrase. */
  refuse_thin_swaps: {
    deadpan: () => "Aucune comparaison pour celui-là, donc je ne peux pas me prononcer. Voici quelque chose de semblable qui a un prix.",
    warm: () => "Il n'y a pas encore de comparaison pour celui-là, donc je ne me prononcerai pas. Voici quelque chose de semblable qui a un prix, au cas où ça aiderait.",
    blunt: () => "Pas de comparaison. Je ne me prononce pas. Voici quelque chose de semblable qui a un prix.",
  },
  refuse_evidence_some: {
    deadpan: () => "Ce que j'ai trouvé, et ce n'était pas assez pour trancher.",
    warm: () => "Voici ce que j'ai trouvé. C'était juste pas assez pour trancher.",
    blunt: () => "Ce que j'ai trouvé. Pas assez.",
  },
  /**
   * Comme en anglais, les trois voix disent exactement la même chose ici:
   * USAGE.md section 4 ligne 4 dit que cette ligne-là ne change jamais.
   */
  refuse_evidence_none: {
    deadpan: () => "Je n'ai absolument rien trouvé pour ça. C'est un trou dans ce qu'on m'a appris, pas un fait sur le marché.",
    warm: () => "Je n'ai absolument rien trouvé pour ça. C'est un trou dans ce qu'on m'a appris, pas un fait sur le marché.",
    blunt: () => "Je n'ai absolument rien trouvé pour ça. C'est un trou dans ce qu'on m'a appris, pas un fait sur le marché.",
  },

  /* --- entre l'obturateur et la réponse --- */
  reading: {
    deadpan: () => "Je lis l'étiquette",
    warm: () => "Laisse-moi regarder ça",
    blunt: () => "Attends",
  },
  reading_barcode: {
    deadpan: () => "Je cherche le produit",
    warm: () => "Laisse-moi regarder ça",
    blunt: () => "Attends",
  },

  watching: {
    deadpan: (f) => `Gardé à ${f.asking}${f.seller ? `, ${f.seller}` : ''}, ${f.day}.`,
    warm: () => "Gardé. J'ai le montant et la date.",
    blunt: (f) => `Gardé. ${f.asking}${f.seller ? `, ${f.seller}` : ''}.`,
  },
  /** Ne sort qu'avec une source requêtable. FLAGS.feed la tient fermée. */
  watching_feed: {
    deadpan: (f) => `Je surveille. Je dirai quelque chose sous ${f.usual}.`,
    warm: () => "Je surveille. Je te le dis si ça descend sous le prix habituel.",
    blunt: () => "Je surveille. Je crie si ça baisse.",
  },
  dropped: {
    deadpan: (f) => `${f.asking} chez ${f.seller}. Tu l'avais vu à ${f.usual}.`,
    warm: (f) => `Ça a baissé. ${f.asking} chez ${f.seller}, moins que ce que tu avais vu.`,
    blunt: (f) => `Ça a baissé. ${f.asking}. Ils poussaient fort avant.`,
  },

  watchlist_empty: {
    deadpan: () => "Rien ici pour l'instant.",
    warm: () => "Rien ici pour l'instant. Garde quelque chose et je retiens le prix, le marchand et la date.",
    blunt: () => "Vide. Rien de gardé encore.",
  },
  watchlist_callback: {
    deadpan: (f) => `${f.item}. ${f.price}${f.seller ? `, ${f.seller}` : ''}, gardé ${f.day}.`,
    warm: (f) => `J'ai encore ${f.item} de gardé, ${f.price}${f.seller ? ` chez ${f.seller}` : ''}, ${f.day}.`,
    blunt: (f) => `${f.item}. ${f.price}${f.seller ? `, ${f.seller}` : ''}. ${f.day}.`,
  },
  watchlist_saved_only: {
    deadpan: (f) => `${f.price}${f.seller ? `, ${f.seller}` : ''}, gardé ${f.day}.`,
    warm: (f) => `Tu as gardé ça à ${f.price}${f.seller ? ` chez ${f.seller}` : ''}, ${f.day}.`,
    blunt: (f) => `${f.price}${f.seller ? `, ${f.seller}` : ''}. Gardé ${f.day}.`,
  },
  watchlist_no_history_note: {
    deadpan: () => "Plus aucun verdict au dossier pour celui-là. Il ne reste que ce que tu as gardé.",
    warm: () => "Je n'ai plus le verdict d'origine, seulement ce que tu as gardé.",
    blunt: () => "Pas de verdict au dossier. Juste le prix.",
  },

  /* --- les corrections --- */
  storage_not_kept: {
    deadpan: () => "Ce navigateur ne me laisse rien conserver. Ça fonctionne jusqu'à ce que tu fermes l'onglet, puis c'est perdu.",
    warm: () => "Petit avertissement, ce navigateur ne me laisse rien enregistrer. Tout fonctionne quand même, ce ne sera juste plus là la prochaine fois.",
    blunt: () => "Ce navigateur bloque l'enregistrement. Rien ici ne survit à la fermeture de l'onglet.",
  },
  correct_gate_both: {
    deadpan: () => "J'ai besoin du prix et du magasin avant de pouvoir classer ça.",
    warm: () => "Juste le prix et le magasin, et je peux le classer.",
    blunt: () => "Prix et magasin. Ensuite je classe.",
  },
  correct_gate_price: {
    deadpan: () => "Écris le prix qui est sur l'étiquette.",
    warm: () => "Entre le prix qui est sur l'étiquette.",
    blunt: () => "Le prix. Sur l'étiquette.",
  },
  correct_gate_seller: {
    deadpan: () => "Nomme le magasin. Un prix sans magasin ne pourra être comparé à rien plus tard.",
    warm: () => "C'était quel magasin? Un prix tout seul ne pourra être comparé à rien plus tard.",
    blunt: () => "Quel magasin. Un prix sans magasin ne sert à rien plus tard.",
  },
  correct_ask: {
    deadpan: () => "Qu'est-ce qui est écrit au juste?",
    warm: () => "Qu'est-ce qui est sur l'étiquette?",
    blunt: () => "Ça dit quoi?",
  },
  correct_thanks: {
    deadpan: () => "Noté. Ça compte à partir de maintenant. Une deuxième étiquette le rend solide.",
    warm: () => "Merci, c'est noté. Ça compte dès ton prochain scan, et ça se solidifie quand quelqu'un d'autre voit le même prix.",
    blunt: () => "Reçu. Ça compte là. Plus solide quand un deuxième confirme.",
  },
  correct_fineprint: {
    deadpan: (f) => `Noté pour ${f.label}${f.seller ? `, chez ${f.seller}` : ''}. Ça compte à partir de maintenant, plus solide quand une deuxième étiquette confirme.`,
    warm: (f) => `C'est noté pour ${f.label}${f.seller ? `, chez ${f.seller}` : ''}. Ça compte dès ton prochain scan, et ça se solidifie quand quelqu'un d'autre voit le même prix.`,
    blunt: (f) => `Noté, ${f.label}${f.seller ? `, chez ${f.seller}` : ''}. Ça compte là, plus solide quand un deuxième confirme.`,
  },

  price_pad_prompt: {
    deadpan: () => "Quel est le prix sur la tablette?",
    warm: () => "Quel est le prix sur la tablette?",
    blunt: () => "Le prix sur la tablette. Écris-le.",
  },

  going_rate: {
    deadpan: () => "Je sais ce que ça vaut. Je ne sais pas ce qu'ils demandent.",
    warm: () => "Je sais ce que ça vaut. Dis-moi l'étiquette et je vais trancher.",
    blunt: () => "Je connais le prix courant. Pas le leur.",
  },

  price_only_recorded: {
    deadpan: (f) => `Noté. ${f.price}${f.seller ? ` chez ${f.seller}` : ''}. Je ne sais pas ce que c'est, alors je n'ai rien pour le comparer.`,
    warm: (f) => `C'est noté. ${f.price}${f.seller ? ` chez ${f.seller}` : ''}. Je ne sais toujours pas ce que c'est, donc je n'ai rien pour comparer pour l'instant, mais le prix n'est pas perdu.`,
    blunt: (f) => `Noté. ${f.price}${f.seller ? ` chez ${f.seller}` : ''}. Aucune idée de ce que c'est, alors je ne tranche pas.`,
  },

  shop_pick_prompt: {
    deadpan: () => "Les magasins autour d'ici. Touche celui où tu es et je vais m'en souvenir.",
    warm: () => "Voici les magasins autour de toi. Touche celui où tu te trouves et je vais m'en souvenir, comme ça je ne te le redemanderai pas la prochaine fois que tu viens ici.",
    blunt: () => "Les magasins proches. Touche le tien. Je vais m'en souvenir.",
  },
  shop_none_nearby: {
    deadpan: () => "Aucun magasin sur la carte par ici. Le prix vaut quand même la peine d'être noté sans magasin.",
    warm: () => "Je ne trouve aucun magasin sur la carte par ici, ce qui veut souvent dire que personne ne les a encore ajoutés. Le prix vaut quand même la peine d'être noté sans magasin.",
    blunt: () => "Rien sur la carte ici. Note le prix pareil.",
  },

  working_step1: {
    deadpan: () => "Je l'identifie",
    warm: () => "Je cherche ce que c'est",
    blunt: () => "Je trouve ce que c'est",
  },
  working_step2: {
    deadpan: () => "Je cherche des prix",
    warm: () => "Je pars chercher des prix",
    blunt: () => "Je chasse les prix",
  },
  working_step3: {
    deadpan: () => "Je vérifie les marchands",
    warm: () => "Je vérifie qui l'a",
    blunt: () => "Je vérifie qui le vend",
  },
  working_slow: {
    deadpan: () => "Toujours dessus.",
    warm: () => "Toujours dessus, désolé.",
    blunt: () => "Longue, celle-là.",
  },

  hint_escalated_barcode: {
    deadpan: () => "Pas de code-barres à lire? Écris le nom du produit.",
    warm: () => "Pas de code-barres à lire? Dis-moi plutôt ce que c'est.",
    blunt: () => "Pas de code-barres. Écris le nom.",
  },
  hint_escalated: {
    deadpan: () => "Pas d'étiquette dessus? Pointe l'objet lui-même, ou écris ce que c'est.",
    warm: () => "Pas d'étiquette dessus? Pointe l'objet lui-même, ou dis-moi plutôt ce que c'est.",
    blunt: () => "Pas de code-barres là. Essaie l'objet lui-même, ou écris-le.",
  },

  text_route_prompt: {
    deadpan: () => "Nomme-le. La marque et le modèle, c'est ce qui approche le plus.",
    warm: () => "Nomme-le-moi. La marque et le modèle, c'est ce qui approche le plus.",
    blunt: () => "Marque et modèle. Écris.",
  },

  feedback_ack: {
    deadpan: () => "Noté.",
    warm: () => "Merci de me le dire.",
    blunt: () => "Bon. Noté.",
  },

  removed_retention: {
    deadpan: () => "Gardé 30 jours.",
    warm: () => "Je les garde 30 jours au cas où tu changerais d'idée.",
    blunt: () => "30 jours, puis disparu.",
  },
  removed_empty: {
    deadpan: () => "Rien de retiré.",
    warm: () => "Rien de retiré. Rien de perdu non plus.",
    blunt: () => "Rien de retiré.",
  },

  pastscans_empty: {
    deadpan: () => "Rien de scanné pour l'instant.",
    warm: () => "Rien encore. Ça se remplit tout seul.",
    blunt: () => "Rien encore.",
  },
  pastscans_callback: {
    deadpan: (f) => `Le dernier: ${f.item}, ${f.verdict}.`,
    warm: (f) => `La dernière fois, ${f.item}: ${f.verdict}.`,
    blunt: (f) => `${f.item}. ${f.verdict}.`,
  },

  market_ask: {
    deadpan: () => "Où fais-tu tes courses? Je le note. Ça ne change pas encore ce que je compare.",
    warm: () => "Où fais-tu tes courses? Je vais le garder au dossier, même si ça ne change pas encore ce que je compare.",
    blunt: () => "Tu magasines où? Noté. Ça ne fait rien encore.",
  },

  /**
   * L'échantillon du sélecteur d'attitude. Le montant est le même nombre qu'en
   * anglais, écrit selon la convention canadienne-française (1,47 $): rien dans
   * ce fichier ne change une valeur, seulement la façon de l'écrire.
   */
  attitude_sample: {
    deadpan: () => 'Deux dollars. C’est 1,47 $.',
    warm: () => 'Ouf, c’est salé. J’attendrais.',
    blunt: () => 'Ils te volent.',
  },
  attitude_pick: {
    deadpan: () => "Noté. C'est comme ça que je sonne maintenant.",
    warm: () => "Parfait, c'est moi à partir d'ici.",
    blunt: () => "C'est réglé. C'est ma voix maintenant.",
  },

  /* toi, voie C */
  you_weekly: {
    deadpan: (f) => (f.scanned === 0
      ? "Rien de scanné cette semaine."
      : `${f.scanned} scannés cette semaine. ${f.callable} que je pouvais trancher.`),
    warm: (f) => (f.scanned === 0
      ? "Rien de scanné encore cette semaine."
      : `${f.scanned} scannés cette semaine. J'ai pu en trancher ${f.callable}.`),
    blunt: (f) => (f.scanned === 0
      ? "Rien cette semaine."
      : `${f.scanned} cette semaine. ${f.callable} que je pouvais trancher.`),
  },
  you_weekly_proud: {
    deadpan: (f) => `${f.scanned} scannés cette semaine. ${f.callable} que je pouvais trancher, et l'un d'eux était un bon prix.`,
    warm: (f) => `${f.scanned} scannés cette semaine, et j'ai pu en trancher ${f.callable}. Un vrai bon prix là-dedans.`,
    blunt: (f) => `${f.scanned} cette semaine. ${f.callable} tranchés, et un était un bon prix.`,
  },
  you_coverage_loading: {
    deadpan: () => 'Je demande au moteur…',
    warm: () => 'Laisse-moi aller demander au moteur…',
    blunt: () => 'Je demande. Un instant…',
  },
  you_coverage_refused: {
    deadpan: (f) => `Sur les choses que je connais, il y en a ${f.refused} sur lesquelles je vais refuser, parce que les preuves derrière ne suffisent pas pour trancher. C'est mesuré en donnant un prix à chacune, pas compté sur une liste.`,
    warm: (f) => `Il y en a ${f.refused} que je connais et sur lesquelles je vais quand même refuser, parce que ce qu'il y a derrière ne suffit pas pour trancher. Je le mesure en donnant un prix à chacune plutôt qu'en comptant une liste.`,
    blunt: (f) => `${f.refused} sur lesquelles je refuse. Pas assez derrière. Mesuré en donnant un prix à chacune, pas compté sur une liste.`,
  },
  you_coverage_failed: {
    deadpan: () => "Je n'ai pas pu joindre mon propre moteur pour vérifier.",
    warm: () => "Je n'ai pas pu joindre mon propre moteur pour vérifier, et je préfère le dire que d'afficher un chiffre que je n'ai pas mesuré.",
    blunt: () => "Mon propre moteur n'a pas répondu. Pas de compte tant qu'il ne répond pas.",
  },

  you_scans_none: {
    deadpan: (f) =>
      `Rien de scanné pour l'instant${f.problem}. Chaque scan à partir d'ici est écrit, alors ces chiffres commencent la première fois que tu me pointes vers quelque chose.`,
    warm: (f) =>
      `Rien de scanné pour l'instant${f.problem}. Tout à partir d'ici est écrit, alors ça se remplit la première fois que tu me pointes vers quelque chose.`,
    blunt: (f) => `Rien encore${f.problem}. Scanne quelque chose et ça commence à compter.`,
  },
  you_scans_named: {
    deadpan: (f) =>
      `Sur ${f.scans} que tout le monde a faits, voilà à quelle fréquence j'ai pu dire ce que la chose était. Pouvoir la nommer n'est pas la même chose que pouvoir lui donner un prix, et ce chiffre-ci est le premier des deux, le plus élevé.`,
    warm: (f) =>
      `Sur ${f.scans} que tout le monde a faits, voilà à quelle fréquence j'ai pu te dire ce que la chose était. Nommer n'est pas donner un prix, et c'est le chiffre du nommage, toujours le plus généreux des deux.`,
    blunt: (f) => `${f.scans}. Voilà à quelle fréquence je savais ce que c'était. Savoir n'est pas chiffrer.`,
  },
  you_scans_dropped: {
    deadpan: (f) => `${f.scans} n'ont pas pu être écrits: ${f.why}. Les chiffres ci-dessus ne les comptent pas.`,
    warm: (f) => `${f.scans} ne se sont pas rendus au journal: ${f.why}. Les chiffres ci-dessus ne les comptent pas, alors traite-les comme un plancher.`,
    blunt: (f) => `${f.scans} perdus: ${f.why}. Les chiffres ci-dessus sont courts d'autant.`,
  },
  you_scanlog_failed: {
    deadpan: () => "Je n'ai pas pu lire mon propre journal de scans.",
    warm: () => "Je n'ai pas pu lire mon propre journal de scans, et je préfère le dire que de te montrer un chiffre que je n'ai pas lu.",
    blunt: () => "Mon propre journal de scans n'a pas répondu.",
  },

  cam_cheaper_failed: {
    deadpan: () => "Je n'ai pas pu vérifier s'il y en avait un moins cher.",
    warm: () => "Je n'ai pas pu vérifier s'il y en avait un moins cher là. Ça vaut un autre essai.",
    blunt: () => "Pas pu chercher un moins cher.",
  },
  /* La même panne, sur une feuille qui n'a rien jugé. Voir la version
     anglaise: "moins cher" est une soustraction contre un nombre que le
     verdict vient de trancher, et sur un refus ce nombre n'existe pas. Celle-ci
     dit la panne sans rien affirmer sur le prix. */
  cam_cheaper_none: {
    deadpan: () => "Rien de moins cher qui a un prix.",
    warm: () => "J'ai cherché quelque chose de moins cher qui a un prix et il n'y a rien pour l'instant.",
    blunt: () => "Rien de moins cher avec un prix.",
  },
  cam_similar_none: {
    deadpan: () => "Rien de semblable n'a de prix pour l'instant.",
    warm: () => "J'ai cherché quelque chose de semblable avec un prix dessus et il n'y a rien pour l'instant.",
    blunt: () => "Rien de semblable avec un prix.",
  },
  cam_similar_failed: {
    deadpan: () => "Je n'ai pas pu vérifier s'il y a quelque chose de semblable qui a un prix.",
    warm: () => "Je n'ai pas pu vérifier s'il y a quelque chose de semblable qui a un prix là. Ça vaut un autre essai.",
    blunt: () => "Pas pu chercher quelque chose de semblable qui a un prix.",
  },

  cam_notthis_offer: {
    deadpan: () => "Pas celui-là?",
    warm: () => "Pas celui-là? Il y en avait d'autres tout proches.",
    blunt: () => "Le mauvais? Il y en avait d'autres.",
  },
  cam_notthis_prompt: {
    deadpan: (f) => `Tout ce que j'ai trouvé pour « ${f.query} ».`,
    warm: (f) => `Voici tout ce que j'ai trouvé pour « ${f.query} ». Choisis le bon et je vais donner le prix de celui-là à la place.`,
    blunt: (f) => `Tout, pour « ${f.query} ». Choisis-en un.`,
  },
  cam_notthis_empty: {
    deadpan: (f) => `C'est la seule chose que j'ai pour « ${f.query} ».`,
    warm: (f) => `C'est vraiment la seule chose que j'ai pour « ${f.query} », alors la première réponse n'était pas un choix parmi plusieurs.`,
    blunt: (f) => `Un seul. « ${f.query} » te donne ça et rien d'autre.`,
  },
  cam_notthis_keep: {
    deadpan: () => "La première réponse tient",
    warm: () => "Je reste avec la première",
    blunt: () => "Correct. La première.",
  },
  cam_text_no_match: {
    deadpan: (f) => `Rien dans ce qu'on a appris à Shin ne correspond à « ${f.query} ».`,
    warm: (f) => `Je n'ai rien trouvé que je connais qui corresponde à « ${f.query} ». Essaie le code-barres, ou un ou deux mots différents.`,
    blunt: (f) => `« ${f.query} » ne correspond à rien que je connais.`,
  },
  cam_reader_model_down: {
    deadpan: () => "Le lecteur de Shin ne répond pas en ce moment. Réessaie dans un instant.",
    warm: () => "Le lecteur de Shin ne répond pas en ce moment, ça n'a rien à voir avec ton scan. Réessaie dans un instant.",
    blunt: () => "Le lecteur est à terre. Réessaie.",
  },
  cam_text_no_own_price: {
    deadpan: () => "Shin n'a pas encore de prix pour ça. Scanne plutôt le code-barres.",
    warm: () => "Je n'ai pas encore de prix pour celui-ci. Scanne son code-barres et je vais le chercher.",
    blunt: () => 'Pas encore de prix. Scanne le code-barres.',
  },
  cam_notthis_failed: {
    deadpan: () => "Je n'ai pas pu retourner regarder.",
    warm: () => "Je n'ai pas pu retourner regarder là. La première réponse tient toujours.",
    blunt: () => "Pas pu regarder de nouveau.",
  },

  keep_it_ack: {
    deadpan: (f) => `Écrit. ${f.asking} chez ${f.seller}, ${f.day}. Je ne peux toujours pas trancher.`,
    warm: (f) => `Écrit, ${f.asking} chez ${f.seller}, ${f.day}. Je ne peux toujours pas trancher, mais ce n'est pas perdu.`,
    blunt: () => "Écrit. Toujours pas capable de trancher.",
  },
  cam_sources_failed: {
    deadpan: () => "Je n'ai pas pu joindre mes propres sources là.",
    warm: () => "Je n'ai pas pu joindre mes propres sources là. Ce n'est pas de ta faute, et ça vaut un autre essai.",
    blunt: () => "Mes propres sources n'ont pas répondu. Réessaie.",
  },
  gem_answer: {
    deadpan: () => "Voici ce que j'ai trouvé.",
    warm: () => "Voici ce que j'ai trouvé pour toi.",
    blunt: () => "Trouvé ça.",
  },
  gem_unsure: {
    deadpan: () => "Ma meilleure lecture, mais elle n'est pas tout à fait sûre.",
    warm: () => "C'est ma meilleure lecture, mais elle n'est pas tout à fait sûre.",
    blunt: () => "Meilleure lecture. Pas tout à fait sûre.",
  },
  gem_failed: {
    deadpan: () => "Je n'ai pas pu obtenir de réponse là. Réessaie.",
    warm: () => "Je n'ai pas pu obtenir de réponse là. Ce n'est pas de ta faute, et un autre essai marche souvent.",
    blunt: () => "Pas de réponse cette fois. Réessaie.",
  },
  gem_nothing: {
    deadpan: () => "Je n'avais rien à chercher. Refais le scan.",
    warm: () => "Je n'avais pas assez pour chercher. Refais un essai du scan.",
    blunt: () => "Rien à chercher. Scanne encore.",
  },
  /* RÉÉCRIT 2026-09-19 (écart bêta 21): l'appli ne s'utilise pas hors ligne. */
  cam_needs_connection: {
    deadpan: () => "Il me faut une connexion pour ça",
    warm: () => "Il me faut une connexion pour chercher ça",
    blunt: () => "Pas de connexion",
  },
  cam_scan_rate_limited: {
    deadpan: (f) => `Le scan est occupé en ce moment. Réessaie dans ${f.seconds}.`,
    warm: (f) => `Le scan est un peu engorgé en ce moment, pas de ta faute. Réessaie dans ${f.seconds}.`,
    blunt: (f) => `Occupé. Réessaie dans ${f.seconds}.`,
  },
  cam_camera_denied: {
    deadpan: () => "L'accès à la caméra n'a pas été autorisé, alors voici l'étalage dessiné à la place.",
    warm: () => "Je n'ai pas accès à la caméra, alors je montre l'étalage dessiné à la place. Tu peux le réactiver dans les réglages de ton téléphone.",
    blunt: () => "Pas d'accès à la caméra. J'utilise l'étalage dessiné.",
  },
  cam_offline_no_price: {
    deadpan: () => "Shin a besoin d'une connexion internet pour chercher quoi que ce soit, alors je ne peux pas répondre à ce scan. Scanne-le de nouveau une fois connecté.",
    warm: () => "Shin a besoin d'une connexion internet pour chercher ça, alors je n'ai rien à te dire pour l'instant. Scanne-le de nouveau une fois connecté.",
    blunt: () => "Shin a besoin d'une connexion pour répondre. Connecte-toi, puis rescanne.",
  },
  cam_server_fault: {
    deadpan: () => "Shin a un problème de son côté",
    warm: () => "Quelque chose a mal tourné de mon côté",
    blunt: () => "Shin a un problème",
  },
  cam_server_fault_detail: {
    deadpan: () => "Ta connexion est bonne. La panne est du côté de Shin et je n'ai pas pu répondre à ce scan. Réessaie dans un instant.",
    warm: () => "Ta connexion est bonne, c'est de mon côté. Je n'ai pas pu répondre à ce scan, alors réessaie dans un instant.",
    blunt: () => "Pas ta connexion. La panne est du côté de Shin. Réessaie.",
  },
  cam_photo_offline: {
    deadpan: () => "Tu es hors ligne, alors j'ai gardé la photo. Je finirai ça dès que tu seras de retour.",
    warm: () => "Pas de signal, alors j'ai gardé ta photo en sûreté. Je reprends ça dès que tu es de retour en ligne.",
    blunt: () => "Hors ligne. Photo gardée. Je finis ça quand tu reviens.",
  },
  cam_photo_unreadable: {
    deadpan: () => "Cette photo n'était pas assez claire pour dire ce que c'est. Réessaie, ou écris ce que c'est.",
    warm: () => "Je n'ai pas pu lire cette photo assez clairement pour dire ce que c'est. Réessaie, ou dis-moi ce que c'est.",
    blunt: () => "Pas pu lire cette photo. Réessaie, ou écris-le.",
  },
  cam_photo_produce: {
    deadpan: () => "On dirait des fruits ou des légumes frais. Je ne donne pas de prix à ça à partir d'une photo; écris plutôt le prix affiché.",
    warm: () => "On dirait des fruits ou des légumes frais, alors une photo ne te donnera pas de verdict là-dessus. Écris le prix affiché et je vais le noter.",
    blunt: () => "Des fruits et légumes. Pas de verdict par photo pour ça. Écris le prix.",
  },
  cam_photo_too_large: {
    deadpan: () => "Cette photo était encore trop grosse à envoyer, même après l'avoir réduite. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "Cette photo était trop grosse à envoyer, même réduite, pas ta photo. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Trop grosse, même réduite. Essaie le code-barres ou écris-le.",
  },
  cam_photo_model_timeout: {
    deadpan: () => "Le lecteur de photos a pris trop de temps sur celle-là. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "Le lecteur de photos a pris trop de temps sur celle-là, pas ta photo. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Le lecteur a dépassé le temps. Essaie le code-barres ou écris-le.",
  },
  cam_photo_model_outage: {
    deadpan: () => "Le lecteur de photos est à terre en ce moment. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "Le lecteur de photos est à terre en ce moment, pas ta photo. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Le lecteur est à terre. Essaie le code-barres ou écris-le.",
  },
  cam_photo_model_rate_limited: {
    deadpan: () => "Trop de photos passent en ce moment. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "Les photos sont engorgées en ce moment, pas ta photo. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Trop occupé en ce moment. Essaie le code-barres ou écris-le.",
  },
  cam_photo_spend_cap_reached: {
    deadpan: () => "Les lectures de photos d'aujourd'hui sont épuisées. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "Les lectures de photos d'aujourd'hui sont déjà épuisées, pas ta photo. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Plus de lectures de photos aujourd'hui. Essaie le code-barres ou écris-le.",
  },
  cam_photo_model_client_error: {
    deadpan: () => "Le lecteur de photos ne répond pas en ce moment. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "Le lecteur de photos ne répond pas en ce moment, pas ta photo. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Le lecteur ne répond pas. Essaie le code-barres ou écris-le.",
  },
  cam_photo_tier_unsafe: {
    deadpan: () => "Les photos sont désactivées sur ce serveur, donc la tienne n'a été envoyée nulle part. Le code-barres et la saisie au clavier fonctionnent encore.",
    warm: () => "Les photos sont désactivées sur ce serveur, donc la tienne n'a jamais quitté ton téléphone. Le code-barres ou la saisie au clavier vont quand même te donner une réponse.",
    blunt: () => "Les photos sont désactivées ici. La tienne n'a pas été envoyée. Utilise le code-barres ou écris-le.",
  },
  cam_candidate_none: {
    deadpan: () => "Je vais presque certainement refuser",
    warm: () => "Je vais probablement devoir refuser celui-là",
    blunt: () => "Je vais refuser. Je te préviens.",
  },

  watchlist_loading: {
    deadpan: () => 'Je lis ce que tu as gardé…',
    warm: () => 'Je vais chercher ce que tu as gardé…',
    blunt: () => 'Je lis tes gardés…',
  },
  watchlist_failed: {
    deadpan: () => "Je n'ai pas pu lire ce que tu as gardé.",
    warm: () => "Je n'ai pas pu relire ce que tu as gardé. Donne-moi un autre essai.",
    blunt: () => "Pas capable de lire tes gardés. Réessaie.",
  },
  pastscans_loading: {
    deadpan: () => 'Je lis tes scans passés…',
    warm: () => 'Je rassemble tes scans passés…',
    blunt: () => 'Je lis tes scans…',
  },
  pastscans_failed: {
    deadpan: () => "Je n'ai pas pu lire tes scans passés.",
    warm: () => "Je n'ai pas pu relire tes scans passés. Donne-moi un autre essai.",
    blunt: () => "Pas capable de lire tes scans passés. Réessaie.",
  },
  removed_loading: {
    deadpan: () => 'Je lis ce qui a été retiré…',
    warm: () => 'Je regarde ce qui a été retiré…',
    blunt: () => 'Je lis la liste des retirés…',
  },
  removed_failed: {
    deadpan: () => "Je n'ai pas pu lire ce qui a été retiré.",
    warm: () => "Je n'ai pas pu relire ce qui a été retiré. Donne-moi un autre essai.",
    blunt: () => "Pas capable de lire la liste des retirés. Réessaie.",
  },

  read_only_note: {
    deadpan: () => "C'est ce que j'ai dit sur le coup. Rien ici ne peut être changé.",
    warm: () => "C'est ce que j'ai dit sur le coup, gardé tel quel. Rien sur cette carte ne change.",
    blunt: () => "Ce que j'ai dit alors. Rien à changer ici.",
  },

  /* --- les raisons de refus, en titre sur un refus rouvert --- */
  refusal_label_no_identity: {
    deadpan: () => "Refusé. Je n'ai pas pu l'identifier.",
    warm: () => "Refusé, parce que je n'ai pas pu déterminer ce que c'était.",
    blunt: () => "Refusé. Aucune idée de ce que c'était.",
  },
  refusal_label_identity_unsure: {
    deadpan: () => "Refusé. Je n'étais pas certain duquel il s'agissait.",
    warm: () => "Refusé, parce que je n'ai pas pu dire lequel c'était.",
    blunt: () => "Refusé. Pas capable de choisir lequel.",
  },
  refusal_label_category_unsupported: {
    deadpan: () => "Refusé. Je ne donne pas de prix à ce genre de chose.",
    warm: () => "Refusé, parce que c'est un genre de chose que je saute.",
    blunt: () => "Refusé. Pas mon rayon.",
  },
  refusal_label_no_source_response: {
    deadpan: () => "Refusé. Aucune source ne m'a répondu.",
    warm: () => "Refusé, parce qu'aucun endroit que j'ai interrogé n'est revenu avec un prix.",
    blunt: () => "Refusé. Personne n'a répondu.",
  },
  refusal_label_too_few_points: {
    deadpan: () => "Refusé. Pas assez de preuves pour trancher.",
    warm: () => "Refusé, parce qu'il n'y avait pas assez derrière pour trancher.",
    blunt: () => "Refusé. Trop peu pour se prononcer.",
  },
  refusal_label_points_too_stale: {
    deadpan: () => "Refusé. Les prix que j'avais étaient trop vieux.",
    warm: () => "Refusé, parce que tout ce que j'avais dessus était trop vieux pour être fiable.",
    blunt: () => "Refusé. Rien que des vieux prix.",
  },
  refusal_label_comparison_incoherent: {
    deadpan: () => "Refusé. Les prix ne s'accordaient pas entre eux.",
    warm: () => "Refusé, parce que les prix que j'ai trouvés ne s'accordaient pas entre eux.",
    blunt: () => "Refusé. Les prix se contredisaient.",
  },
  refusal_label_no_asking_price: {
    deadpan: () => "Refusé. Aucun prix demandé à juger.",
    warm: () => "Refusé, parce qu'il n'y avait aucun prix sur l'étiquette à juger.",
    blunt: () => "Refusé. Aucun prix à juger.",
  },
  refusal_label_unusable_price_kinds: {
    deadpan: () => "Refusé. Les prix que j'ai trouvés étaient tous du mauvais type pour comparer.",
    warm: () => "Refusé, parce que les seuls prix que j'ai pu trouver étaient des prix de liste, sans magasin derrière.",
    blunt: () => "Refusé. Rien que des prix de liste. Personne ne le vend vraiment à ce prix-là.",
  },
  refusal_label_points_future_dated: {
    deadpan: () => "Refusé. Tous les prix que j'ai trouvés sont datés plus tard que celui-ci.",
    warm: () => "Refusé, parce que tous les prix que j'ai pour ça sont datés dans le futur, et ça ne peut pas être exact.",
    blunt: () => "Refusé. Tous les prix sont datés dans le futur.",
  },
  refusal_label_all_points_from_asking_seller: {
    deadpan: () => "Refusé. Tous les prix que j'ai trouvés viennent de ce même magasin, alors il n'y a rien à quoi le comparer.",
    warm: () => "Refusé, parce que tous les prix que j'ai trouvés viennent de ce même magasin. Comparer un magasin à lui-même ne t'apprendrait rien.",
    blunt: () => "Refusé. Ce magasin est le seul d'où j'ai des prix. Rien à comparer.",
  },
  refusal_label_model_timeout: {
    deadpan: () => "Refusé. Le lecteur de photos a pris trop de temps.",
    warm: () => "Refusé, parce que le lecteur de photos a pris trop de temps à répondre.",
    blunt: () => "Refusé. Le lecteur a dépassé le temps.",
  },
  refusal_label_model_outage: {
    deadpan: () => "Refusé. Le lecteur de photos est à terre.",
    warm: () => "Refusé, parce que le lecteur de photos est à terre en ce moment.",
    blunt: () => "Refusé. Le lecteur est à terre.",
  },
  refusal_label_model_rate_limited: {
    deadpan: () => "Refusé. Trop de photos en ce moment.",
    warm: () => "Refusé, parce que trop de photos passent en ce moment.",
    blunt: () => "Refusé. Trop occupé en ce moment.",
  },
  refusal_label_spend_cap_reached: {
    deadpan: () => "Refusé. Les lectures de photos d'aujourd'hui sont épuisées.",
    warm: () => "Refusé, parce que les lectures de photos d'aujourd'hui sont déjà épuisées.",
    blunt: () => "Refusé. Plus de lectures de photos aujourd'hui.",
  },
  refusal_label_model_client_error: {
    deadpan: () => "Refusé. Le lecteur ne répond pas.",
    warm: () => "Refusé, parce que le lecteur ne répond pas en ce moment.",
    blunt: () => "Refusé. Le lecteur ne répond pas.",
  },
  refusal_label_too_large: {
    deadpan: () => "Refusé. Cette photo était trop grosse à envoyer.",
    warm: () => "Refusé, parce que cette photo était trop grosse à envoyer.",
    blunt: () => "Refusé. Trop grosse à envoyer.",
  },
  refusal_label_rate_limited: {
    deadpan: () => "Refusé. Trop de scans en ce moment.",
    warm: () => "Refusé, parce que trop de scans passent en ce moment.",
    blunt: () => "Refusé. Trop occupé en ce moment.",
  },

  licences_loading: {
    deadpan: () => 'Je demande la liste des sources…',
    warm: () => 'Laisse-moi aller chercher la liste des sources…',
    blunt: () => 'Je vais chercher la liste des sources…',
  },
  licences_failed: {
    deadpan: () => "Je n'ai pas pu joindre la liste des sources pour les créditer. Elle n'est pas affichée du tout, plutôt qu'affichée incomplète.",
    warm: () => "Je n'ai pas pu joindre la liste des sources pour les créditer. Je préfère ne rien te montrer plutôt qu'une version courte qui crédite les mauvaises personnes.",
    blunt: () => "Pas pu joindre la liste des sources. Rien ne monte, plutôt que la moitié.",
  },

  /* caméra, voie B */
  cam_aim_hint: {
    deadpan: () => "Pointe une étiquette de prix.",
    warm: () => "Pointe-moi vers une étiquette de prix.",
    blunt: () => "L'étiquette. Pointe-la.",
  },
  cam_aim_barcode: {
    deadpan: () => "Pointe un code-barres.",
    warm: () => "Pointe-moi vers un code-barres.",
    blunt: () => "Code-barres. Pointe-le.",
  },
  cam_hold_still: {
    deadpan: () => "Code-barres. Tiens-le là.",
    warm: () => "Je vois le code-barres. Tiens-le là.",
    blunt: () => "J'ai un code-barres. Tiens.",
  },
  cam_glare: {
    deadpan: () => "Reflet sur l'étiquette. Incline-la un peu.",
    warm: () => "La lumière rebondit sur l'étiquette. Incline-la un peu.",
    blunt: () => "Trop de reflet. Incline.",
  },
  cam_closer: {
    deadpan: () => "Un pas de plus et je peux la lire.",
    warm: () => "Un pas de plus et je peux lire l'étiquette.",
    blunt: () => "Plus proche. Je n'arrive pas à lire ça.",
  },
  cam_pick_one: {
    deadpan: () => "Plus d'une chose ici. Touche celle que tu veux dire.",
    warm: () => "Je vois quelques articles. Touche celui que tu veux dire.",
    blunt: () => "Plusieurs ici. Touche le tien.",
  },
  cam_centre_left: {
    deadpan: () => "Le code-barres est à gauche du centre. Vise un peu à gauche.",
    warm: () => "Je vois le code-barres, il est à gauche du centre. Vise un peu à gauche.",
    blunt: () => "Code-barres à gauche. Vise à gauche.",
  },
  cam_centre_right: {
    deadpan: () => "Le code-barres est à droite du centre. Vise un peu à droite.",
    warm: () => "Je vois le code-barres, il est à droite du centre. Vise un peu à droite.",
    blunt: () => "Code-barres à droite. Vise à droite.",
  },
  cam_centre_up: {
    deadpan: () => "Le code-barres est au-dessus du centre. Vise un peu plus haut.",
    warm: () => "Je vois le code-barres, il est au-dessus du centre. Vise un peu plus haut.",
    blunt: () => "Code-barres en haut. Vise plus haut.",
  },
  cam_centre_down: {
    deadpan: () => "Le code-barres est sous le centre. Vise un peu plus bas.",
    warm: () => "Je vois le code-barres, il est sous le centre. Vise un peu plus bas.",
    blunt: () => "Code-barres en bas. Vise plus bas.",
  },
  cam_too_dark: {
    deadpan: () => "Trop sombre pour lire ici. Il faut plus de lumière.",
    warm: () => "Il fait assez sombre ici. Il me faut plus de lumière pour lire ça.",
    blunt: () => "Trop sombre. Plus de lumière.",
  },
  cam_no_barcode: {
    deadpan: () => "Aucun code-barres lu pour l'instant. Pointe-en un et tiens-le là.",
    warm: () => "Je n'ai pas encore lu de code-barres. Pointe-m'en un et tiens-le là.",
    blunt: () => "Pas de code-barres. Pointe-en un. Tiens.",
  },
  cam_torch_on: {
    deadpan: () => "Lampe allumée.",
    warm: () => "Lampe allumée, ça devrait aider.",
    blunt: () => "Lumière allumée.",
  },
  cam_second_visit: {
    deadpan: (f) => `La dernière fois: ${f.item}${f.seller ? ` chez ${f.seller}` : ''}${f.asking ? `, ${f.asking}` : ''}. ${f.word}.`,
    warm: (f) => `La dernière fois tu as scanné ${f.item}${f.seller ? ` chez ${f.seller}` : ''}${f.asking ? `, ${f.asking}` : ''}. ${f.word}.`,
    blunt: (f) => `Le dernier: ${f.item}${f.asking ? `, ${f.asking}` : ''}. ${f.word}.`,
  },
  cam_candidate_prompt: {
    deadpan: () => "C'est lequel?",
    warm: () => "Lequel de ceux-là est-ce?",
    blunt: () => "Choisis-en un.",
  },
  refuse_category_repair: {
    deadpan: () => "Voici ce à quoi je donne un prix.",
    warm: () => "Voici ce avec quoi je peux t'aider à la place.",
    blunt: () => "Je donne un prix à ça, à la place.",
  },
  /* RÉÉCRIT 2026-09-14, même raison que la version anglaise (voice.js): un
   * scan de code-barres envoie maintenant sa propre image de caméra aussi
   * (tâche 5), donc "un code-barres n'envoie jamais d'image" n'est plus vrai. */
  cam_privacy_line: {
    deadpan: () => "Chaque scan envoie une image: le cadre que la caméra voyait à ce moment, toujours. Un scan par photo garde cette image ensuite seulement si Photos est ouvert; un code-barres consigne son image dans tous les cas.",
    warm: () => "Chaque scan envoie maintenant une image, le cadre que la caméra regardait à ce moment, toujours. Un scan par photo garde cette image ensuite seulement si tu as ouvert Photos; un code-barres consigne son image dans tous les cas.",
    blunt: () => "Chaque scan envoie une image, toujours. Photo: gardée si Photos est ouvert. Code-barres: image consignée dans tous les cas.",
  },
  /* RÉÉCRIT 2026-09-19 (écart bêta 13; le fondateur a délégué ce texte, "you
   * decide"): les photos sont gardées par défaut, la position est fermée par
   * défaut, comme consent.ts et store.js. Le texte dit le défaut en premier,
   * simplement, avec la sortie juste à côté: l'interrupteur. Tout changement
   * de défaut change ce texte, voice.js et consent.ts le même jour. */
  consent_intro: {
    deadpan: () => "Chaque scan est écrit: le produit et le prix que tu as vu, toujours, pour que la prochaine personne qui le scanne obtienne une réponse. Les photos sont gardées seulement si tu ouvres ça ci-dessous. La position n'est gardée que si tu l'ouvres.",
    warm: () => "Chaque scan est écrit: ce que tu as scanné et le prix que tu as vu, toujours, pour que la prochaine personne qui scanne la même chose obtienne une réponse elle aussi. Les photos sont gardées seulement si tu ouvres ça ci-dessous, et la position n'est gardée que si tu l'ouvres.",
    blunt: () => "Chaque scan est consigné: produit et prix, toujours. Les photos sont gardées seulement si tu ouvres ça. La position n'est gardée que si tu l'ouvres.",
  },
  consent_photos_desc: {
    deadpan: () => "Fermé jusqu'à ce que tu l'ouvres. Fermé, aucune image du rayon n'est gardée pendant que la caméra est ouverte, et l'image d'un scan par photo est lue une fois pour répondre et n'est pas gardée. Ouvert, les deux sont gardées: l'image du rayon, et l'image d'un scan par photo, liée à ce scan, pour qu'une mauvaise réponse puisse être vérifiée plus tard et que Shin puisse apprendre. Le risque: une photo gardée peut montrer ce qui se trouve autour de toi.",
    warm: () => "Fermé jusqu'à ce que tu l'ouvres. Fermé, aucune image du rayon n'est gardée pendant que la caméra est ouverte, et l'image d'un scan par photo n'est lue qu'une fois, pour répondre à ce scan, puis elle est partie. Ouvert, les deux sont gardées: l'image du rayon, et l'image d'un scan par photo, liée à ce scan, pour qu'une mauvaise réponse puisse être vérifiée plus tard et que Shin puisse apprendre. Le risque, c'est qu'une photo gardée peut montrer tout ce qu'il y avait d'autre autour de toi.",
    blunt: () => "Fermé jusqu'à ce que tu l'ouvres. Fermé: pas d'image du rayon, et l'image du scan par photo est lue une fois, pas gardée. Ouvert: les deux gardées, liées au scan, pour qu'une mauvaise réponse puisse être vérifiée. Risque: une photo gardée peut montrer ce qui est près de toi.",
  },
  consent_location_desc: {
    deadpan: () => "Garde une zone approximative, d'environ un kilomètre de large, jamais ton point exact, pour qu'un prix puisse être associé à un magasin proche. Ton téléphone retient aussi quel magasin tu as choisi dans chaque zone, pour arrêter de te le demander. Cette liste ne quitte jamais le téléphone et elle disparaît quand tu fermes ça. Fermé, aucune position n'est gardée. Le risque: même une zone approximative réduit l'endroit où tu magasines.",
    warm: () => "Garde une zone approximative, d'environ un kilomètre de large, jamais ton point exact, pour qu'un prix puisse être associé au magasin près duquel tu étais. Ton téléphone retient aussi quel magasin tu as choisi dans chaque zone, comme ça il ne te le redemande pas. Cette liste reste sur le téléphone, n'est jamais envoyée nulle part, et elle est effacée dès que tu fermes ça. Fermé, rien sur l'endroit où tu es n'est gardé. Le risque, c'est que même une zone approximative dit quelque chose sur l'endroit où tu magasines.",
    blunt: () => "Garde une zone approximative, d'environ un kilomètre de large, jamais ton point exact. Ton téléphone retient quel magasin tu as choisi où, pour arrêter de demander. Ça reste sur le téléphone. Effacé quand tu fermes ça. Fermé: rien de gardé. Risque: même une zone approximative réduit l'endroit où tu magasines.",
  },
  you_ratings_none: {
    deadpan: () => "Aucune pour l'instant. Un pouce sur n'importe quel verdict compte ici.",
    warm: () => "Aucune pour l'instant, mais un pouce sur n'importe quel verdict lance le compte.",
    blunt: () => "Aucune. Évalues-en un.",
  },
  /* RÉÉCRIT 2026-09-14, même raison que cam_privacy_line: un code-barres
   * envoie maintenant aussi son image de caméra. */
  you_data_intro: {
    deadpan: () => "Chaque scan est écrit: le produit et le prix que tu as vu, toujours, avec l'image de la caméra à ce moment, utilisé pour entraîner Shin et répondre à d'autres personnes.",
    warm: () => "Chaque scan est écrit, le produit et le prix que tu as vu, toujours, avec l'image de la caméra à ce moment, et ça aide à entraîner Shin et à répondre à d'autres personnes.",
    blunt: () => "Chaque scan est consigné: produit, prix et image de la caméra, toujours. Utilisé pour entraîner Shin et répondre à d'autres personnes.",
  },
  /* RÉÉCRIT 2026-09-14: "seuls cette application et la personne qui la fait
   * tourner peuvent voir ça" n'était plus toute la vérité une fois que tout
   * collecter est devenu le but; ce qui est collecté sert aussi à répondre à
   * d'autres personnes et à entraîner Shin. */
  consent_footer: {
    deadpan: () => "Cette application garde ce qu'elle collecte, l'utilise pour répondre à d'autres personnes et entraîner Shin, et la personne qui la fait tourner peut le voir aussi. Change l'un ou l'autre des choix n'importe quand sur la page Toi.",
    warm: () => "Cette application garde ce qu'elle collecte, l'utilise pour répondre à d'autres personnes et entraîner Shin, et la personne qui la fait tourner peut le voir aussi. Tu peux changer l'un ou l'autre des choix n'importe quand depuis la page Toi.",
    blunt: () => "Cette application garde ça, l'utilise pour répondre à d'autres personnes et entraîner Shin. Change-le n'importe quand sur la page Toi.",
  },
  /* D24: une seule décision quand l'identification par photo est fermée. */
  consent_footer_one: {
    deadpan: () => "Cette application garde ce qu'elle collecte, l'utilise pour répondre à d'autres personnes et entraîner Shin, et la personne qui la fait tourner peut le voir aussi. Change ce choix n'importe quand sur la page Toi.",
    warm: () => "Cette application garde ce qu'elle collecte, l'utilise pour répondre à d'autres personnes et entraîner Shin, et la personne qui la fait tourner peut le voir aussi. Tu peux changer ce choix n'importe quand depuis la page Toi.",
    blunt: () => "Cette application garde ça, l'utilise pour répondre à d'autres personnes et entraîner Shin. Change-le n'importe quand sur la page Toi.",
  },
  consent_intro_lean: {
    deadpan: (f) => `Chaque scan est écrit: le produit et le prix que tu as vu, toujours, pour que la prochaine personne qui le scanne obtienne une réponse.${f.photos ? ' Les photos sont gardées seulement si tu ouvres ça ci-dessous.' : ''}${f.locationSwitch ? " La position n'est gardée que si tu l'ouvres ci-dessous." : " La position n'est gardée que si tu l'as permise à l'écran précédent."}`,
    warm: (f) => `Chaque scan est écrit: ce que tu as scanné et le prix que tu as vu, toujours, pour que la prochaine personne qui scanne la même chose obtienne une réponse elle aussi.${f.photos ? ' Les photos sont gardées seulement si tu ouvres ça ci-dessous.' : ''}${f.locationSwitch ? " La position n'est gardée que si tu l'ouvres ci-dessous." : " La position n'est gardée que si tu l'as permise à l'écran précédent."}`,
    blunt: (f) => `Chaque scan est consigné: produit et prix, toujours.${f.photos ? ' Les photos sont gardées seulement si tu ouvres ça.' : ''}${f.locationSwitch ? " La position n'est gardée que si tu l'ouvres." : " La position n'est gardée que si tu l'as permise à l'écran précédent."}`,
  },
  /* D24: identification par photo fermée, aucune image de caméra ne part avec un code-barres. */
  you_data_intro_nophoto: {
    deadpan: () => "Chaque scan est écrit: le produit et le prix que tu as vu, toujours, utilisé pour entraîner Shin et répondre à d'autres personnes.",
    warm: () => "Chaque scan est écrit, le produit et le prix que tu as vu, toujours, et ça aide à entraîner Shin et à répondre à d'autres personnes.",
    blunt: () => "Chaque scan est consigné: produit et prix, toujours. Utilisé pour entraîner Shin et répondre à d'autres personnes.",
  },
  cam_point_barcode: {
    deadpan: () => "Pointe-moi vers le code-barres.",
    warm: () => "Pointe-moi vers le code-barres et tiens-le là.",
    blunt: () => "Code-barres. Pointe-moi dessus.",
  },
  paywall_say: {
    deadpan: () => "Voilà les scans gratuits de la semaine. Plus enlève la limite.",
    warm: () => "Ce sont tous les scans gratuits de cette semaine. Avec Plus, il n'y a pas de limite.",
    blunt: () => "Scans gratuits finis pour la semaine. Plus: pas de limite.",
  },
};

/**
 * Ce qu'une ligne dit quand un fait qu'elle attendait n'est pas arrivé.
 *
 * Même contrat que BARE en anglais: délibérément plus faibles que les vraies
 * lignes, parce que c'est ce qui reste quand les faits sont partis, pas une
 * deuxième voix.
 */
export const BARE_FR = {
  cam_text_no_match: {
    deadpan: () => "Rien dans ce qu'on a appris à Shin ne correspond à ça.",
    warm: () => "Je n'ai rien trouvé que je connais qui corresponde à ça. Essaie le code-barres, ou un ou deux mots différents.",
    blunt: () => "Ça ne correspond à rien que je connais.",
  },
  cam_notthis_prompt: {
    deadpan: () => "Tout ce que j'ai trouvé.",
    warm: () => "Voici tout ce que j'ai trouvé. Choisis le bon et je vais donner le prix de celui-là à la place.",
    blunt: () => "Tout. Choisis-en un.",
  },
  cam_notthis_empty: {
    deadpan: () => "C'est la seule chose que j'ai.",
    warm: () => "C'est vraiment la seule chose que j'ai, alors la première réponse n'était pas un choix parmi plusieurs.",
    blunt: () => "Un seul. C'est ça.",
  },
  price_only_recorded: {
    deadpan: () => "Noté. Je ne sais pas ce que c'est, alors je n'ai rien pour le comparer.",
    warm: () => "C'est noté. Je ne sais toujours pas ce que c'est, donc je n'ai rien pour comparer pour l'instant.",
    blunt: () => "Noté. Aucune idée de ce que c'est, alors je ne tranche pas.",
  },
  you_scans_named: {
    deadpan: () => "Voilà à quelle fréquence j'ai pu dire ce que la chose était. Nommer n'est pas chiffrer.",
    warm: () => "Voilà à quelle fréquence j'ai pu dire ce que la chose était. Nommer n'est pas la même chose que donner un prix.",
    blunt: () => "À quelle fréquence je savais ce que c'était. Savoir n'est pas chiffrer.",
  },
  you_scans_dropped: {
    deadpan: () => "Des scans n'ont pas pu être écrits, alors les chiffres ci-dessus ne les comptent pas.",
    warm: () => "Des scans ne se sont pas rendus au journal, alors les chiffres ci-dessus ne les comptent pas.",
    blunt: () => "Des scans ont été perdus. Les chiffres ci-dessus sont courts.",
  },
  good: {
    deadpan: () => "C'est sous le prix habituel.",
    warm: () => "Belle trouvaille. C'est sous le prix habituel.",
    blunt: () => "Prends-le. Tout de suite.",
  },
  fair: {
    deadpan: () => "C'est le prix courant.",
    warm: () => "C'est pas mal ce que ça vaut. T'es correct.",
    blunt: () => "Correct. Bof.",
  },
  walk_away: {
    deadpan: () => "C'est au-dessus du prix habituel.",
    warm: () => "Ouf, c'est salé pour celui-là.",
    blunt: () => "Ils te volent.",
  },
  refuse_category: {
    deadpan: () => "Pas quelque chose que je chiffre",
    warm: () => "Je saute ce genre de chose",
    blunt: () => "Pas ça. Non.",
  },
  correct_fineprint: {
    deadpan: () => "Noté. Ça compte à partir de maintenant, plus solide quand une deuxième étiquette confirme.",
    warm: () => "C'est noté. Ça compte dès ton prochain scan, et ça se solidifie quand quelqu'un d'autre voit le même prix.",
    blunt: () => "Noté. Ça compte là, plus solide quand un deuxième confirme.",
  },
  you_weekly: {
    deadpan: () => "Ta semaine est au dossier.",
    warm: () => "J'ai ta semaine, je n'arrive juste pas à la relire là.",
    blunt: () => "La semaine est là. Pas capable de la lire.",
  },
  you_weekly_proud: {
    deadpan: () => "Tu as trouvé un bon prix cette semaine.",
    warm: () => "Tu as trouvé un bon prix cette semaine. J'ai le reste, je n'arrive juste pas à le relire.",
    blunt: () => "Bonne semaine. Pas capable de relire les chiffres.",
  },
  you_coverage_refused: {
    deadpan: () => "Sur ce que je connais, il y en a sur lesquelles je vais quand même refuser, parce que les preuves ne suffisent pas pour trancher.",
    warm: () => "Il y en a que je connais et sur lesquelles je vais quand même refuser, parce que ce qu'il y a derrière ne suffit pas pour trancher.",
    blunt: () => "Sur certaines, je refuse. Pas assez derrière.",
  },
  keep_it_ack: {
    deadpan: () => "Écrit. Je ne peux toujours pas trancher.",
    warm: () => "Écrit. Je ne peux toujours pas trancher, mais ce n'est pas perdu.",
    blunt: () => "Écrit. Toujours pas capable de trancher.",
  },
  watching: {
    deadpan: () => "Gardé.",
    warm: () => "Gardé. Je l'ai.",
    blunt: () => "Gardé.",
  },
  watching_feed: {
    deadpan: () => "Je surveille celui-là.",
    warm: () => "Je surveille. Je te le dis si ça baisse.",
    blunt: () => "Je le surveille.",
  },
  dropped: {
    deadpan: () => "Le prix a bougé.",
    warm: () => "Celui-là a bougé depuis que tu l'as gardé.",
    blunt: () => "Ça a bougé.",
  },
  watchlist_callback: {
    deadpan: () => "Quelque chose est gardé ici.",
    warm: () => "Tu as quelque chose de gardé ici.",
    blunt: () => "Gardé. Les détails sont partis.",
  },
  watchlist_saved_only: {
    deadpan: () => "Gardé, et les détails n'ont pas survécu.",
    warm: () => "Celui-là est gardé, mais j'ai perdu ce qui venait avec.",
    blunt: () => "Gardé. Rien d'autre ne reste.",
  },
  pastscans_callback: {
    deadpan: () => "Il y a un scan derrière ça.",
    warm: () => "Tu as déjà scanné. Je n'arrive pas à relire le dernier.",
    blunt: () => "Déjà scanné. Pas capable de le relire.",
  },
  cam_second_visit: {
    deadpan: () => "Tu es déjà venu ici.",
    warm: () => "Content de te revoir.",
    blunt: () => "De retour.",
  },
  cam_scan_rate_limited: {
    deadpan: () => "Le scan est occupé en ce moment.",
    warm: () => "Le scan est un peu engorgé en ce moment, pas de ta faute.",
    blunt: () => "Occupé en ce moment.",
  },
};
