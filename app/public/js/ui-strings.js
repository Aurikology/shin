/**
 * Every user-facing string in this app that is NOT Shin talking.
 *
 * voice.js opens with the rule that no string Shin says is written inside a
 * screen. This file is the other half of that sentence, which was never
 * written down because until there was a second language it cost nothing to
 * leave the chrome where it fell: "Undo", "Correct it", "Share", "Going rate",
 * "Saved", "You", the ten screens' headings and every button label were
 * hardcoded across `public/js/screens/*.js` and `lib/pagebar.js`. In one
 * language that is a style question. In two it is the difference between a
 * French interface and an English interface with French speech bubbles in it.
 *
 * WHERE THE LINE IS, unchanged from the one voice.js and
 * test/screens-voice.test.mjs already draw:
 *
 *   In voice.js: anything in the first person, anything that judges, advises,
 *   apologises, or narrates what Shin is doing. Three personalities each.
 *
 *   Here: structural labels, headings, button text, kickers, accessible names
 *   and factual captions that do not speak as Shin. NO PERSONALITY VARIANTS,
 *   deliberately. Chrome does not have an attitude. A "Share" button that got
 *   ruder when you picked Blunt would be the picker leaking out of the thing
 *   it controls, and voice.js's own promise is that the attitude changes what
 *   Shin says, not what the app is.
 *
 * SAME SHAPE AS voice.js OTHERWISE: locale is the outer key, a value is a
 * plain string or a function of already-formatted facts, and a key missing
 * from French falls back to English rather than to an empty label. An empty
 * button is unusable; an English one is merely untranslated, and the test
 * catches it either way.
 *
 * The French here is the same Canadian French voice-fr.js is written in, and
 * it agrees with it on the words that appear in both: "gardé" for a saved
 * price, "étiquette" for the price tag, "magasin" for the shop.
 */

import { locale, DEFAULT_LOCALE } from './lib/locale.js';

export { locale, setLocale, LOCALES, localeTag, applyLang } from './lib/locale.js';

const EN = {
  /* ---------------------------------------------------------- shell and nav */
  app_name: 'Shin',
  nav_saved: 'Saved',
  nav_you: 'You',
  nav_scan: 'Scan something',
  nav_back: 'Back',
  nav_more: 'More',
  back_to_camera: 'Back to the camera',
  back_to_camera_short: 'Back to camera',
  close: 'Close',
  try_again: 'Try again',
  open: 'Open',
  remove: 'Remove',
  restore: 'Restore',
  delete: 'Delete',
  clear: 'Clear',
  skip: 'Skip',
  done: 'Done',
  on: 'On',
  off: 'Off',
  unknown: 'unknown',
  not_yet: 'not yet',
  of: 'of',

  /* ------------------------------------------------------------- the router */
  screen_error_title: 'That screen did not open.',
  screen_error_body: 'Something on it broke before it could draw. Going back to the camera will clear it.',

  /* ------------------------------------------------------------ the camera */
  cam_label: 'Shin camera',
  cam_undo: 'Undo',
  cam_why: 'Why',
  cam_correct_it: 'Correct it',
  cam_share: 'Share',
  cam_keep_it: 'Keep it',
  cam_type_what_it_is: 'Type what it is',
  cam_tell_me_the_price: 'Tell me the price',
  /* The price route out of a refusal, added 2026-09-13. Chrome, not voice:
     four words on a button, no first person, and the same label whatever
     attitude is picked. What SHIN says about it is price_only_recorded. */
  cam_just_the_price: 'Just write the price down',
  cam_price_written_down: 'Price written down',
  cam_no_name_for_it: 'No name for it',
  cam_name_it: 'Name it',
  cam_price_it: 'Price it',
  cam_no_confident_match: 'No confident match',
  cam_something_else: 'Something else',
  cam_keep_the_first_one: 'Keep the first one',
  cam_going_rate: 'Going rate',
  cam_percent_off: 'Percent off',
  cam_percent_off_suffix: '% off',
  cam_n_for: 'N for $',
  cam_items_in_the_deal: 'Items in the deal',
  cam_one_seller: '1 seller',
  cam_comma_one_seller: ', one seller',
  cam_that_item: 'that item',
  cam_the_photo: 'the photo',
  cam_what_you_photographed: 'What you photographed',
  cam_unlabelled_item: 'Unlabelled item',
  cam_back_to_summary: 'Back to the summary',
  cam_show_more: 'Show more',
  cam_refused_word: 'Refused',
  cam_refused_sentence: 'Refused.',
  cam_standin_note: 'This asking price is a stated stand-in, not a tag anyone read.',
  cam_standins_caption: 'Stand-ins until the camera can read the item',
  cam_list_failed: 'Could not load the list just now.',
  cam_verdict_right_q: 'Was this verdict right?',
  cam_looks_right: 'This looks right',
  cam_looks_wrong: 'This looks wrong',
  conf_no_price: 'No price to compare',
  conf_sellers: (f) => `${f.n} seller${f.n === '1' ? '' : 's'}`,
  conf_certain: (f) => `Certain · ${f.sellers}`,
  conf_sure: (f) => `Fairly sure · ${f.sellers}`,
  conf_thin: (f) => `Thin · ${f.sellers}`,
  cam_rate_single: (f) => `${f.price} ${f.market}, one seller`,
  cam_rate_range: (f) => `${f.low} to ${f.high} ${f.market}`,
  cam_rate_to: (f) => `${f.low} to ${f.high}`,
  cam_seller_count: (f) => `${f.n} seller${f.n === '1' ? '' : 's'}`,
  cam_rail_alt: (f) => `Prices found run ${f.low} to ${f.high}. You are looking at ${f.asking}.`,
  cam_delete_last_digit: 'Delete last digit',
  cam_price_modifiers: 'Price modifiers',
  cam_cancel_scan: 'Cancel and go back to the viewfinder',
  cam_brand_model_placeholder: 'Brand and model…',
  cam_search: 'Search',
  cam_torch: 'Torch',
  cam_this: 'this',
  cam_shutter: 'Scan what you are pointing at',

  /* ------------------------------------------------------------- the consent */
  consent_kicker: 'Before your first scan',
  consent_title: 'Your data',
  consent_heading: 'What Shin does with your data',
  consent_photos: 'Photos',
  consent_location: 'Location',
  consent_continue: 'Continue',

  /* ---------------------------------------------------------- the correction */
  correct_kicker: 'Teach Shin',
  correct_title: 'Tell Shin the price',
  correct_which_shop: 'Which shop?',
  correct_on_sale: 'On sale',
  correct_save_it: 'Save it',
  correct_not_now: 'Not now',
  correct_price_typed: 'Price typed so far',
  correct_shop_placeholder: 'Metro, No Frills, a listing…',

  /* ------------------------------------------------------------ the licences */
  lic_kicker: 'Where this comes from',
  lic_title: 'Data and licences',
  lic_sources: 'Sources',
  lic_fallback_credit: 'This app is built on open data from Open Food Facts, Open Prices, OpenStreetMap and Open Icecat. The full list, with each licence, is what failed to load.',
  lic_intro: 'Product details, prices and store names in this app are open data, collected and published by other people. Each source below sets its own terms for reuse, and this is the credit those terms ask for.',
  lic_footer: 'Shin is not affiliated with any of them. Prices are what somebody recorded on the day shown beside them, not an offer, and not checked with the shop.',

  /* -------------------------------------------------------------- the market */
  market_title: 'Where do you shop?',
  market_kicker: 'Recorded, not yet part of the comparison',
  market_caption: 'Does not change a verdict yet. Recorded for when it does.',
  market_sources_button: 'Prices and product details come from open data. See the sources and licences.',
  country_ca: 'Canada',
  country_us: 'United States',
  country_gb: 'United Kingdom',
  country_ca_in: 'in Canada',
  country_us_in: 'in the United States',
  country_gb_in: 'in the United Kingdom',

  /* ----------------------------------------------------------- the past scans */
  past_scans: 'Past scans',
  past_scans_unknown_item: 'Unknown item',
  past_scans_no_price: 'no price given',
  past_scans_remove_of: 'Remove the scan of',
  past_scans_that_one: 'that one',

  /* ------------------------------------------------------------- the removed */
  removed_title: 'Recently removed',
  removed_unknown_item: 'Unknown item',
  removed_label: 'Removed',
  removed_from_list: 'from recently removed',
  removed_tap_again: 'Tap again, gone for good',
  removed_press_again: 'Press again to delete',
  removed_for_good: 'for good',
  removed_days_left: (f) => `${f.n} day${f.n === '1' ? '' : 's'} left`,

  /* --------------------------------------------------------------- the setup */
  setup_title: 'Pick your Shin',
  setup_kicker: 'One question, then the camera',
  setup_heading: 'Which Shin do you want?',
  setup_promise: 'Changeable any time. The attitude changes the words and never the number.',
  setup_start: 'Start scanning',

  /* --------------------------------------------------------------- the share */
  share_on_the_tag_caps: 'ON THE TAG',
  share_elsewhere_caps: 'ELSEWHERE',
  share_shin_says: 'Shin says:',
  share_on_the_tag: 'On the tag:',
  share_elsewhere: 'Elsewhere:',
  share_title: 'Share',
  share_one_price_one_seller: 'one price, one seller',
  share_kicker: 'No link in the frame, on purpose',
  share_post_it: 'Post it',
  share_no_link_why: 'A link would make a preview that reads as spam.',
  share_save_image: 'Save the image',
  share_copy_text: 'Copy as text',
  share_card_failed: 'The card did not draw:',
  share_copied: 'Copied as text.',
  share_clipboard_blocked: 'The clipboard is blocked here, so the text is above.',
  share_rendering: 'Rendering…',
  share_saved_to_downloads: 'Saved to your downloads.',
  share_export_failed_text: 'The image would not export, and the text version is above:',
  share_export_failed: 'The image would not export here. The text version is above.',
  share_at_seller: (f) => `at ${f.seller}`,
  share_range: (f) => `${f.low} to ${f.high}`,
  share_card_alt: (f) => `Shin card. ${f.word}. ${f.label}. On the tag ${f.asking}. Elsewhere ${f.elsewhere}.`,

  /* ----------------------------------------------------------- the watchlist */
  saved_title: 'Saved',
  saved_no_usual: 'no usual price',
  saved_at_the_usual: 'at the usual',
  saved_under_usual: 'under usual',
  saved_over_usual: 'over usual',
  saved_under_the_usual: 'under the usual',
  saved_comma_under_the_usual: ', under the usual',
  saved_remove_from: 'from saved',
  saved_the_seller: 'the seller you saved it at',
  saved_kicker_things: (f) => `${f.n} thing${f.n === '1' ? '' : 's'}`,

  /* ----------------------------------------------------------------- the you */
  you_title: 'You',
  you_kicker: 'Settings and honesty',
  you_your_shin: 'Your Shin',
  you_attitude_group: 'Shin’s attitude',
  you_can_answer_h: 'What Shin can actually answer',
  you_has_answered_h: 'What Shin has actually answered',
  you_reading_scan_log: 'Reading the scan log…',
  you_settings: 'Settings',
  you_theme: 'Theme',
  you_theme_system: 'System',
  you_theme_light: 'Light',
  you_theme_dark: 'Dark',
  you_language: 'Language',
  you_language_caption: 'The interface and everything Shin says. Prices and product names come from the catalogue and are shown as it holds them.',
  you_buzz: 'Buzz on verdicts',
  you_buzz_caption: 'A short buzz when a verdict or a refusal lands, on by default.',
  you_market: 'Market',
  you_market_caption: 'Price verdicts are judged against typical prices in this market.',
  you_ratings: 'Your ratings',
  you_ratings_rated: 'Verdicts you rated',
  you_ratings_none: 'None yet',
  you_thumbs_up: 'thumbs up',
  you_thumbs_down: 'thumbs down',
  you_data_h: 'What Shin does with your data',
  you_photos: 'Photos',
  you_location: 'Location',
  you_no_meter: 'No daily limit right now. Nothing is metered in this build; if that changes, the allowance will be one number, written once, shown wherever it applies.',
  you_no_legal: 'There is no privacy policy page and no terms page. When there is something legal worth reading, it will be here; until then the two paragraphs above are the whole of it.',
  you_delete_my_data: 'Delete my data',
  you_email: 'Email',
  you_delete_subject: 'Delete my Shin data',
  you_delete_body_head: 'Delete everything Shin has for this device',
  you_delete_body_device: 'Device id',
  you_report: 'Report a wrong price',
  you_report_fastest: 'Fastest fix',
  you_build: 'Build',
  you_build_note: '· hand-set in main.js, not read from a running server.',
  you_can_price: 'Products Shin can price',
  you_row_can_answer: 'can answer',
  you_row_refuses: 'refuses',
  you_scans_named_row: 'Scans Shin could name',
  you_kind_barcode: 'Barcode',
  you_kind_typed: 'Typed',
  you_kind_photo: 'Photo',
  you_corrections_row: 'Corrections per hundred named',
  you_week_two_row: 'Back in week two',
  you_week_two_none: 'nobody is two weeks old',
  you_yours_this_week: 'Yours this week',
  you_some_not_written: ', and some could not be written down',
  you_log_not_written: 'the log could not be written to on this phone',
  /** "12 scans" / "1 scan", already pluralised before it reaches voice.js. */
  you_scan_count: (f) => `${f.n} scan${f.n === '1' ? '' : 's'}`,
  you_named_suffix: (f) => `${f.n} named`,

  /* ----------------------------------------- Shin's face, for a screen reader
   * The thirteen face states are drawn, so a sighted reader gets them for free
   * and a screen reader gets only this label. They live here rather than in
   * voice.js because a state name is a LABEL and not Shin speaking: it does not
   * change with the attitude, and it must not, or a blind user would hear a
   * different product than a sighted one sees. Keys match `FACE_STATES` in
   * face-art.js exactly; `app/test/locale.test.mjs` asserts all thirteen are
   * present in both languages, so a fourteenth state fails a test here rather
   * than reaching a screen reader as a raw English id. */
  face_label: (f) => `Shin: ${f.state}`,
  face_state_idle: 'waiting',
  face_state_thinking: 'thinking',
  face_state_asking: 'asking',
  face_state_good: 'good price',
  face_state_delighted: 'delighted',
  face_state_fair: 'fair price',
  face_state_walk: 'walk away',
  face_state_angry: 'angry',
  face_state_unknown: 'unsure',
  face_state_pleased: 'pleased',
  face_state_nudging: 'nudging',
  face_state_asleep: 'asleep',
  face_state_proud: 'proud',
};

const FR = {
  /* ------------------------------------------------------- coquille et menu */
  app_name: 'Shin',
  nav_saved: 'Gardés',
  nav_you: 'Toi',
  nav_scan: 'Scanner quelque chose',
  nav_back: 'Retour',
  nav_more: 'Plus',
  back_to_camera: 'Retour à la caméra',
  back_to_camera_short: 'Retour à la caméra',
  close: 'Fermer',
  try_again: 'Réessayer',
  open: 'Ouvrir',
  remove: 'Retirer',
  restore: 'Restaurer',
  delete: 'Supprimer',
  clear: 'Effacer',
  skip: 'Passer',
  done: 'Terminé',
  on: 'Activé',
  off: 'Désactivé',
  unknown: 'inconnu',
  not_yet: 'pas encore',
  of: 'sur',

  /* ----------------------------------------------------------- le routeur */
  screen_error_title: 'Cet écran ne s’est pas ouvert.',
  screen_error_body: 'Quelque chose dessus a cassé avant de pouvoir s’afficher. Revenir à la caméra va l’effacer.',

  /* ----------------------------------------------------------- la caméra */
  cam_label: 'Caméra Shin',
  cam_undo: 'Annuler',
  cam_why: 'Pourquoi',
  cam_correct_it: 'Corrige-le',
  cam_share: 'Partager',
  cam_keep_it: 'Garde le prix',
  cam_type_what_it_is: 'Écris ce que c’est',
  cam_tell_me_the_price: 'Donne-moi le prix',
  cam_just_the_price: 'Note juste le prix',
  cam_price_written_down: 'Prix noté',
  cam_no_name_for_it: 'Aucun nom pour ça',
  cam_name_it: 'Nomme-le',
  cam_price_it: 'Donne-lui un prix',
  cam_no_confident_match: 'Aucune correspondance sûre',
  cam_something_else: 'Autre chose',
  cam_keep_the_first_one: 'Garder la première',
  cam_going_rate: 'Prix courant',
  cam_percent_off: 'Pourcentage de rabais',
  cam_percent_off_suffix: '% de rabais',
  cam_n_for: 'N pour $',
  cam_items_in_the_deal: 'Articles dans le rabais',
  cam_one_seller: '1 marchand',
  cam_comma_one_seller: ', un marchand',
  cam_that_item: 'cet article',
  cam_the_photo: 'la photo',
  cam_what_you_photographed: 'Ce que tu as photographié',
  cam_unlabelled_item: 'Article sans nom',
  cam_back_to_summary: 'Retour au sommaire',
  cam_show_more: 'Voir plus',
  cam_refused_word: 'Refusé',
  cam_refused_sentence: 'Refusé.',
  cam_standin_note: 'Ce prix demandé est un substitut déclaré, pas une étiquette que quelqu’un a lue.',
  cam_standins_caption: 'Des substituts, le temps que la caméra puisse lire l’article',
  cam_list_failed: 'La liste n’a pas pu être chargée pour l’instant.',
  cam_verdict_right_q: 'Ce verdict était-il juste?',
  cam_looks_right: 'Ça a l’air juste',
  cam_looks_wrong: 'Ça a l’air faux',
  conf_no_price: 'Aucun prix à comparer',
  conf_sellers: (f) => `${f.n} marchand${f.n === '1' ? '' : 's'}`,
  conf_certain: (f) => `Certain · ${f.sellers}`,
  conf_sure: (f) => `Assez sûr · ${f.sellers}`,
  conf_thin: (f) => `Mince · ${f.sellers}`,
  cam_rate_single: (f) => `${f.price} ${f.market}, un marchand`,
  cam_rate_range: (f) => `${f.low} à ${f.high} ${f.market}`,
  cam_rate_to: (f) => `${f.low} à ${f.high}`,
  cam_seller_count: (f) => `${f.n} marchand${f.n === '1' ? '' : 's'}`,
  cam_rail_alt: (f) => `Les prix trouvés vont de ${f.low} à ${f.high}. Tu regardes ${f.asking}.`,
  cam_delete_last_digit: 'Effacer le dernier chiffre',
  cam_price_modifiers: 'Modificateurs de prix',
  cam_cancel_scan: 'Annuler et revenir au viseur',
  cam_brand_model_placeholder: 'Marque et modèle…',
  cam_search: 'Chercher',
  cam_torch: 'Lampe',
  cam_this: 'ça',
  cam_shutter: 'Scanner ce que tu pointes',

  /* ----------------------------------------------------------- le consentement */
  consent_kicker: 'Avant ton premier scan',
  consent_title: 'Tes données',
  consent_heading: 'Ce que Shin fait avec tes données',
  consent_photos: 'Photos',
  consent_location: 'Localisation',
  consent_continue: 'Continuer',

  /* ----------------------------------------------------------- la correction */
  correct_kicker: 'Apprends à Shin',
  correct_title: 'Dis le prix à Shin',
  correct_which_shop: 'Quel magasin?',
  correct_on_sale: 'En solde',
  correct_save_it: 'Enregistrer',
  correct_not_now: 'Pas maintenant',
  correct_price_typed: 'Prix tapé jusqu’ici',
  correct_shop_placeholder: 'Metro, Maxi, une annonce…',

  /* ----------------------------------------------------------- les licences */
  lic_kicker: 'D’où ça vient',
  lic_title: 'Données et licences',
  lic_sources: 'Sources',
  lic_fallback_credit: 'Cette application est bâtie sur les données ouvertes d’Open Food Facts, Open Prices, OpenStreetMap et Open Icecat. La liste complète, avec chaque licence, est ce qui n’a pas pu être chargé.',
  lic_intro: 'Les détails de produits, les prix et les noms de magasins dans cette application sont des données ouvertes, recueillies et publiées par d’autres personnes. Chaque source ci-dessous fixe ses propres conditions de réutilisation, et voici le crédit que ces conditions demandent.',
  lic_footer: 'Shin n’est affilié à aucune d’entre elles. Les prix sont ce que quelqu’un a noté le jour indiqué à côté, pas une offre, et ils n’ont pas été vérifiés auprès du magasin.',

  /* ----------------------------------------------------------- le marché */
  market_title: 'Où magasines-tu?',
  market_kicker: 'Noté, pas encore dans la comparaison',
  market_caption: 'Ne change pas encore un verdict. Noté pour quand ça le fera.',
  market_sources_button: 'Les prix et les détails de produits viennent de données ouvertes. Voir les sources et les licences.',
  country_ca: 'Canada',
  country_us: 'États-Unis',
  country_gb: 'Royaume-Uni',
  country_ca_in: 'au Canada',
  country_us_in: 'aux États-Unis',
  country_gb_in: 'au Royaume-Uni',

  /* ----------------------------------------------------------- les scans passés */
  past_scans: 'Scans passés',
  past_scans_unknown_item: 'Article inconnu',
  past_scans_no_price: 'aucun prix donné',
  past_scans_remove_of: 'Retirer le scan de',
  past_scans_that_one: 'celui-là',

  /* ----------------------------------------------------------- les retirés */
  removed_title: 'Retirés récemment',
  removed_unknown_item: 'Article inconnu',
  removed_label: 'Retiré',
  removed_from_list: 'des retirés récemment',
  removed_tap_again: 'Touche encore, parti pour de bon',
  removed_press_again: 'Appuie encore pour supprimer',
  removed_for_good: 'pour de bon',
  removed_days_left: (f) => `${f.n} jour${f.n === '1' ? '' : 's'} restant${f.n === '1' ? '' : 's'}`,

  /* ----------------------------------------------------------- la mise en route */
  setup_title: 'Choisis ton Shin',
  setup_kicker: 'Une question, puis la caméra',
  setup_heading: 'Quel Shin veux-tu?',
  setup_promise: 'Modifiable n’importe quand. L’attitude change les mots et jamais le chiffre.',
  setup_start: 'Commencer à scanner',

  /* ----------------------------------------------------------- le partage */
  share_on_the_tag_caps: 'SUR L’ÉTIQUETTE',
  share_elsewhere_caps: 'AILLEURS',
  share_shin_says: 'Shin dit :',
  share_on_the_tag: 'Sur l’étiquette :',
  share_elsewhere: 'Ailleurs :',
  share_title: 'Partager',
  share_one_price_one_seller: 'un prix, un marchand',
  share_kicker: 'Aucun lien dans l’image, exprès',
  share_post_it: 'Publie-le',
  share_no_link_why: 'Un lien produirait un aperçu qui a l’air d’un pourriel.',
  share_save_image: 'Enregistrer l’image',
  share_copy_text: 'Copier en texte',
  share_card_failed: 'La carte ne s’est pas dessinée :',
  share_copied: 'Copié en texte.',
  share_clipboard_blocked: 'Le presse-papiers est bloqué ici, alors le texte est au-dessus.',
  share_rendering: 'Dessin en cours…',
  share_saved_to_downloads: 'Enregistré dans tes téléchargements.',
  share_export_failed_text: 'L’image n’a pas pu être exportée, et la version texte est au-dessus :',
  share_export_failed: 'L’image n’a pas pu être exportée ici. La version texte est au-dessus.',
  share_at_seller: (f) => `chez ${f.seller}`,
  share_range: (f) => `${f.low} à ${f.high}`,
  share_card_alt: (f) => `Carte Shin. ${f.word}. ${f.label}. Sur l’étiquette ${f.asking}. Ailleurs ${f.elsewhere}.`,

  /* ----------------------------------------------------------- les gardés */
  saved_title: 'Gardés',
  saved_no_usual: 'aucun prix habituel',
  saved_at_the_usual: 'au prix habituel',
  saved_under_usual: 'sous l’habituel',
  saved_over_usual: 'au-dessus de l’habituel',
  saved_under_the_usual: 'sous le prix habituel',
  saved_comma_under_the_usual: ', sous le prix habituel',
  saved_remove_from: 'des gardés',
  saved_the_seller: 'le marchand chez qui tu l’as gardé',
  saved_kicker_things: (f) => `${f.n} article${f.n === '1' ? '' : 's'}`,

  /* ----------------------------------------------------------- toi */
  you_title: 'Toi',
  you_kicker: 'Réglages et honnêteté',
  you_your_shin: 'Ton Shin',
  you_attitude_group: 'L’attitude de Shin',
  you_can_answer_h: 'Ce à quoi Shin peut vraiment répondre',
  you_has_answered_h: 'Ce à quoi Shin a vraiment répondu',
  you_reading_scan_log: 'Lecture du journal de scans…',
  you_settings: 'Réglages',
  you_theme: 'Thème',
  you_theme_system: 'Système',
  you_theme_light: 'Clair',
  you_theme_dark: 'Sombre',
  you_language: 'Langue',
  you_language_caption: 'L’interface et tout ce que Shin dit. Les prix et les noms de produits viennent du catalogue et sont affichés tels qu’il les garde.',
  you_buzz: 'Vibration sur les verdicts',
  you_buzz_caption: 'Une courte vibration quand un verdict ou un refus arrive, activée par défaut.',
  you_market: 'Marché',
  you_market_caption: 'Les verdicts de prix sont jugés par rapport aux prix typiques de ce marché.',
  you_ratings: 'Tes évaluations',
  you_ratings_rated: 'Verdicts que tu as évalués',
  you_ratings_none: 'Aucune pour l’instant',
  you_thumbs_up: 'pouces en haut',
  you_thumbs_down: 'pouces en bas',
  you_data_h: 'Ce que Shin fait avec tes données',
  you_photos: 'Photos',
  you_location: 'Localisation',
  you_no_meter: 'Aucune limite quotidienne pour le moment. Rien n’est compté dans cette version; si ça change, l’allocation sera un seul chiffre, écrit une fois, montré partout où il s’applique.',
  you_no_legal: 'Il n’y a pas de page de politique de confidentialité ni de page de conditions. Quand il y aura quelque chose de légal qui vaut la peine d’être lu, ce sera ici; d’ici là, les deux paragraphes ci-dessus sont tout ce qu’il y a.',
  you_delete_my_data: 'Supprimer mes données',
  you_email: 'Courriel',
  you_delete_subject: 'Supprimer mes données Shin',
  you_delete_body_head: 'Supprimer tout ce que Shin a pour cet appareil',
  you_delete_body_device: 'Identifiant de l’appareil',
  you_report: 'Signaler un prix erroné',
  you_report_fastest: 'La correction la plus rapide',
  you_build: 'Version',
  you_build_note: '· inscrite à la main dans main.js, pas lue d’un serveur en marche.',
  you_can_price: 'Produits auxquels Shin peut donner un prix',
  you_row_can_answer: 'peut répondre',
  you_row_refuses: 'refuse',
  you_scans_named_row: 'Scans que Shin a pu nommer',
  you_kind_barcode: 'Code-barres',
  you_kind_typed: 'Écrit',
  you_kind_photo: 'Photo',
  you_corrections_row: 'Corrections par cent nommés',
  you_week_two_row: 'De retour en semaine deux',
  you_week_two_none: 'personne n’a deux semaines',
  you_yours_this_week: 'Les tiens cette semaine',
  you_some_not_written: ', et certains n’ont pas pu être écrits',
  you_log_not_written: 'le journal n’a pas pu être écrit sur ce téléphone',
  /* "scan" ne prend pas de forme irreguliere au pluriel en francais, mais le
     compte passe quand meme par cette fonction pour que les deux langues aient
     un seul chemin: le jour ou un mot irregulier arrive, il n'y a qu'un endroit
     a changer. */
  you_scan_count: (f) => `${f.n} scan${f.n === '1' ? '' : 's'}`,
  you_named_suffix: (f) => `${f.n} nommés`,

  /* ------------------------------------- le visage de Shin, pour un lecteur
   * d'ecran. Le francais met une espace insecable AVANT le deux-points, ce que
   * l'anglais ne fait pas: "Shin : content" et non "Shin: content". C'est la
   * meme raison que 4,99 $ dans shin.js -- la ponctuation est ce qui trahit une
   * traduction faite a la machine. */
  face_label: (f) => `Shin\u00A0: ${f.state}`,
  face_state_idle: 'en attente',
  face_state_thinking: 'réfléchit',
  face_state_asking: 'pose une question',
  face_state_good: 'bon prix',
  face_state_delighted: 'ravi',
  face_state_fair: 'prix correct',
  face_state_walk: 'passe ton tour',
  face_state_angry: 'fâché',
  face_state_unknown: 'incertain',
  face_state_pleased: 'content',
  face_state_nudging: 'te fait signe',
  face_state_asleep: 'endormi',
  face_state_proud: 'fier',
};

const UI = { en: EN, fr: FR };

/**
 * One chrome string, in the language in force.
 *
 * @param {string} key  a key in the tables above
 * @param {object} [facts]  already-formatted values, for the handful of keys
 *   that take one. Same rule as voice.js: a fact arrives formatted and is only
 *   interpolated, never built here.
 *
 * An unknown key returns the key itself rather than an empty string. That is
 * the opposite of `say()`'s choice and it is deliberate: Shin going quiet is a
 * bubble that does not appear, which is survivable, while a button with no
 * label is a control nobody can use. The key on screen is ugly and reports
 * itself, which is what a missing label should do.
 */
export function t(key, facts = {}) {
  const table = UI[locale()] ?? UI[DEFAULT_LOCALE];
  const value = table[key] ?? UI[DEFAULT_LOCALE][key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(facts ?? {}) : value;
}

/** The key sets, for test/ui-strings.test.mjs. Not for a screen to read. */
export const TABLES = UI;
