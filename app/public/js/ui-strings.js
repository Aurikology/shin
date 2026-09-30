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
import { ONB_EN, ONB_FR } from './onboarding-strings.js';

export { locale, setLocale, LOCALES, localeTag, applyLang } from './lib/locale.js';

const EN = {
  /* The onboarding flow's text, in its own file (onboarding-strings.js). */
  ...ONB_EN,
  /* ---------------------------------------------------------- shell and nav */
  app_name: 'Shin',
  nav_saved: 'Saved',
  nav_you: 'You',
  nav_scan: 'Scan something',
  nav_back: 'Back',
  nav_more: 'More',
  back_to_camera: 'Back to camera',
  close: 'Close',
  try_again: 'Try again',
  open: 'Open',

  /* Shin Plus, 2026-09-21 (screens/paywall.js, docs/mvp-plan.md). No price is
     written here: every price is the store's own string, passed in as `price`.
     No savings claim (hard rule 2) and nothing aimed at the person (rule 3). */
  paywall_title: 'Shin Plus',
  paywall_heading: 'Shin Plus: unlimited scans',
  paywall_limit: (f) => `The ${f.limit} free scans for this week are used.`,
  paywall_limit_bare: 'The free scans for this week are used.',
  paywall_resets: (f) => `They come back ${f.when}.`,
  paywall_plans: 'Plans',
  paywall_monthly: 'Monthly',
  paywall_yearly: 'Yearly',
  paywall_per_month: (f) => `${f.price} a month`,
  paywall_per_year: (f) => `${f.price} a year`,
  paywall_subscribe: 'Subscribe',
  paywall_restore: 'Restore purchases',
  paywall_renews: 'Renews automatically until cancelled in your App Store or Google Play account.',
  paywall_terms: 'Terms of use',
  paywall_privacy: 'Privacy policy',
  paywall_close: 'Close',
  paywall_loading: 'Loading plans',
  paywall_failed: 'The plans did not load.',
  paywall_none: 'No plans are on sale right now.',
  paywall_in_app: 'Subscribe in the app',
  paywall_in_app_detail: 'Shin Plus is sold through the App Store and Google Play. Open Shin on your phone to subscribe.',
  paywall_working: 'Waiting for the store',
  paywall_done: 'Shin Plus is on. Scans are unlimited.',
  paywall_restore_none: 'No Shin Plus subscription was found for this store account.',
  paywall_buy_failed: 'The purchase did not go through.',
  you_manage_sub: 'Manage subscription',
  you_scans_left: (f) => `${f.remaining} of ${f.limit} free scans left this week`,
  you_plus_on: 'Shin Plus: unlimited scans',

  /* The answer sheet, 2026-09-21: the price-match line and the one-tap
     "What did you do?" after an answer that found it cheaper elsewhere. */
  pm_heading: 'Price match',
  outcome_q: 'What did you do?',
  outcome_bought_elsewhere: 'Bought it elsewhere',
  outcome_price_matched: 'Got a price match',
  outcome_bought_here: 'Bought it here',
  outcome_not_bought: 'Did not buy it',
  outcome_noted: 'Noted',
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
  cam_correct_it: 'Fix Results',
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
  /* The shop shortlist. Chrome, not Shin: a row label, a heading, and the
     two rows that are not a shop. The one sentence that speaks as Shin
     (`shop_pick_prompt`) is in voice.js, with all three attitudes. */
  cam_shop: 'Shop',
  cam_shop_choose: 'Choose',
  cam_shop_none: 'No shop',
  cam_shop_usual: 'Usual',
  cam_shop_looking: 'Finding shops',
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
  /* The Gemini answer sheet. The middle price and the shelf label are the
     model's own values handed in as text; nothing here works out a price. */
  cam_gem_not_confident: 'Not fully confident',
  cam_gem_median: (f) => `Middle price: ${f.median} per ${f.unit}`,
  cam_gem_median_bare: (f) => `Middle price: ${f.median}`,
  cam_gem_shelf: (f) => `Shelf price: ${f.label}`,
  cam_gem_answered_word: 'Answered',
  cam_gem_failed_word: 'No answer',
  /* WHEN THE ANSWER WAS CHECKED (ruling 1, docs/decisions.md: a cached answer
     may be served "for six hours and ALWAYS SHOWN WITH WHEN IT WAS CHECKED").
     Shin's own fact about when Shin asked, never Gemini's bytes, so it is
     chrome and lives here. `when` arrives already built by `ago()` in
     lib/dom.js, which is where the units and the French word order are
     decided; this key only carries the verb in front of it. Under a minute,
     and a clock that says the answer is from the future, both take the bare
     sentence rather than a number. */
  cam_gem_checked: (f) => `Checked ${f.when}`,
  cam_gem_checked_now: 'Checked just now',
  /* The alternatives list under the Gemini answer. Each row's name, reason and
     price are the model's own words, shown as returned; these are only the
     heading and the fallback reason for a row the model gave none for. */
  gem_alt_heading: 'Other options',
  gem_alt_at: (f) => `at ${f.store}`,
  gem_alt_kind_same_product: 'The same product, sold elsewhere',
  gem_alt_kind_substitute: 'A similar product',
  gem_alt_kind_used_copy: 'A used copy',
  gem_alt_kind_newer_model: 'A newer model',
  gem_alt_kind_other: 'Another option',
  cam_standin_note: 'This asking price is a stated stand-in, not a tag anyone read.',

  /* CATALOGUE FIRST (RULINGS.md, 2026-09-27; app/src/catalogue-first.ts). The
     answer sheet for a barcode Shin's own catalogue named, and the pick-one-of-3
     list for text read off a pack. The range figures arrive already formatted
     by lib/money.js; the provenance line says where the range came from and
     never what the price is. No grading word anywhere: a shelf price is placed
     with the price line's own zone words (`priceline_zone_*`). */
  cat_range: (f) => `${f.low} to ${f.high}`,
  cat_range_unit: (f) => `${f.low} to ${f.high}, for ${f.unit}`,
  cat_range_label: 'Price range',
  cat_basis_shin: (f) => `From Shin's own prices at ${f.n} stores`,
  cat_basis_shin_one: "From Shin's own prices at 1 store",
  cat_basis_shin_bare: "From Shin's own prices",
  cat_basis_category: (f) => `From similar products in ${f.category}`,
  cat_basis_category_bare: 'From similar products',
  cat_basis_ai: 'A typical range estimated by AI',
  cat_basis_ai_asked: (f) => `A typical range estimated by AI, asked ${f.date}`,
  cat_no_range: 'Shin has no price range for this yet.',
  cat_no_range_later: 'Shin has no price range for this yet. Scan it again later.',
  cat_not_found: "This barcode is not in Shin's catalogue yet.",
  cat_type_name: 'Type the product name',
  tm_heading: 'Is it one of these?',
  tm_label: 'Products that match the text on the pack',
  tm_none: "Nothing in Shin's catalogue matches this text yet.",
  tm_dev_label: 'Text read off the pack (development)',

  /* ------------------------------------------------- the cheaper-swap rings
   *
   * D-036, in its own words: "it is the word 'cheaper' doing the lying, since
   * it implies 'instead of this'." These five keys are what makes it stop
   * lying. The catalogue looks on the leaf category first and steps ONE level
   * up to the parent when the leaf is empty; a leaf swap really is "instead of
   * this", and a parent swap is a wider shelf and has to say so on the row.
   *
   * CHROME AND NOT VOICE, deliberately, and it is a close call. These read as
   * Shin qualifying his own answer, which is the voice.js side of the line.
   * But the qualifier is the row's label -- the thing that decides whether a
   * price means "instead of this" -- and a label that got shorter when you
   * picked Blunt would be the personality picker editing how honest the app
   * is. The bubble above the sheet has an attitude; the badge on the row that
   * says how wide the claim is does not get one. */
  cam_swap_same: 'Same kind of thing',
  cam_swap_same_in: (f) => `Same kind of thing: ${f.tag}`,
  /* "Looser" first and the reason second, because a row is skimmed left to
     right and the qualifier has to survive being read alone. */
  cam_swap_looser: 'Looser swap: one category up',
  cam_swap_looser_in: (f) => `Looser swap: one category up, in ${f.tag}`,
  /* Printed above the rows when every row is a parent swap, because the
     server's heading still names the original's own shelf. */
  cam_swap_all_looser: 'Nothing cheaper on this exact shelf. These are one category up, so they are not quite the same kind of thing.',
  /*
   * THE SAME TWO LINES AGAIN, FOR A SHEET WITH NO COMPARISON ON IT.
   *
   * docs/plan-always-a-price.md section 3: only a real verdict may use the
   * words good, fair, high, walk away, deal or cheaper. Everything else is a
   * reference, and a reference states what it rests on without grading it.
   * The two keys above are arithmetic under a verdict -- "cheaper" there means
   * cheaper than the number the sheet just judged -- and there is no such
   * number on a refusal. The server's own heading ("Cheaper tortilla chips")
   * is skipped for the same reason and replaced by the first of these.
   *
   * Chrome, not voice: a heading and a caption, no first person, and the same
   * words whichever attitude is picked.
   */
  cam_similar_priced: 'Similar things that are priced',
  cam_swap_all_looser_ref: 'Nothing on this exact shelf. These are one category up, so they are not quite the same kind of thing.',
  cam_what_is_it: 'What is it? (optional)',
  cam_what_is_it_hint: 'Kraft Dinner, 225 g',
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
  cam_rate_single: (f) => `${f.price}${f.market ? ` ${f.market}` : ''}, one seller`,
  cam_rate_range: (f) => `${f.low} to ${f.high}${f.market ? ` ${f.market}` : ''}`,
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
  /* 2026-09-19: the camera screen has no mode tabs. These three are the
     accessible names of its three icon buttons: the shutter (a photo, sent as a
     shelf tag, W30's Price Tag hint), the barcode button below, and the
     keyboard button (W30's Manual Search, a typed name). `cam_mode_manual`
     keeps its name because tests and history know it by it. */
  cam_shutter: 'Take a photo',
  cam_mode_manual: 'Manual Search',
  /* Row 25: validation or switching, chosen by the user on the price pad. */
  cam_alt_group: 'What do you want from this scan?',
  cam_alt_validation: 'Is this a good price?',
  cam_alt_switching: 'Find a better buy',
  /* W33: the user's own earlier prices for the same item. */
  cam_hist_heading: 'Your earlier prices',
  cam_hist_alt: (f) => `Your last ${f.n} prices for this item, oldest first.`,
  cam_scan_barcode: 'Scan the barcode',
  // The torch setting on the You screen (item 11).
  you_torch_group: 'Torch',
  you_torch_auto: 'Auto',
  you_torch_off: 'Off',
  you_torch_level: 'Switch on below this brightness',
  you_torch_hint: 'A lower setting waits until it is darker. It starts at the level Shin uses.',
  you_torch_off_hint: 'The torch stays off, and the camera says when it is too dark to read.',

  /* ------------------------------------------------------------- the consent */
  consent_kicker: 'Before your first scan',
  consent_title: 'Your data',
  consent_heading: 'What Shin does with your data',
  consent_photos: 'Photos',
  consent_location: 'Location',
  consent_continue: 'Continue',

  /* --------------------------------------------------------- the permissions */
  /* The screen's own chrome. Everything else on it is the welcome flow's own
     `onb_perm_*` and `onb_demo_*` keys, shared rather than copied, so the
     wording cannot differ between the two places the panel is drawn. */
  perm_title: 'Permissions',
  perm_kicker: 'Before your first scan',

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
  market_kicker: 'Where prices are compared',
  market_caption: 'Sent with every scan, so prices are compared in the right place. Nothing is converted between currencies.',
  market_search: 'Search countries',
  market_none: 'No country matches that.',
  market_region_kicker: 'Region, if it matters',
  market_region_none: 'Not chosen',
  market_region_caption: 'Optional. Prices can differ between provinces and states. Left unchosen, the region stays unknown.',
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

  /* ------------------------------------------ the Gemini grounded section
   * EVERY STRING HERE IS RENDERED OUTSIDE THE GROUNDED BLOCK, never inside
   * it. The Gemini API terms (eff. 2026-03-23) say we will not "intersperse
   * any other content with" a Grounded Result, and `grounded.js` answers that
   * as DOM structure: these are siblings of `[data-grounded]`, never its
   * children. A test asserts no string from this file appears as text inside
   * that root, so moving one of these in fails loudly.
   *
   * The block's own words are NOT translated. The server asks Gemini for the
   * reader's language, so a French reader's block arrives in French from
   * Google; translating it once it is back here would be "modify". The
   * exception is written down in grounded.js's header too, because a silent
   * absence is what the coverage test cannot see. */
  grounded_heading: 'Found by Google',
  /* The founder, 2026-09-14: "we will accept all answers gemini gives, just
     give a heads up that something doesn't have a link". The row still
     shows, in its own position, with its price intact; this is the heads-up,
     and it names which row so it is a heads-up and not a puzzle. */
  grounded_no_link: (f) => `No link for this one: ${f.name}`,
  /* 2026-09-15, Jamin: "Having a response that is not checked is infinitely
     better than... told the app doesn't know". The label, not a refusal. */
  grounded_unchecked: 'From a web search. Not checked by Shin.',
  /* A typed search answered from Shin's own data (Jamin, 2026-09-23): not
     Google's, so it never wears Google's heading. Each row carries its date. */
  grounded_heading_own: 'From Shin’s own prices',
  grounded_own_note: 'Prices Shin has recorded, each with the day it was seen. Not checked.',
  grounded_size_assumed: 'Size not known, so this compares at the size most stores listed.',
  /* Why there is no price line. Each one states what the evidence was, never
   * that Shin does not know: the offers, the reviews and the description are
   * all still on screen above these sentences. D-113. (The single-price one
   * went on 2026-09-19: one price now draws a line, and says so below.) */
  grounded_no_line_none: 'No price that could be compared came back for this one.',
  grounded_no_line_size: 'No size given for this one, so the prices cannot be lined up.',
  grounded_line_one: 'Only one price found, so the middle is that price.',
  grounded_line_thin: (f) => `From ${f.n} prices, so the middle is rough.`,
  grounded_line_held: 'One price was too far from the others to place.',
  /* The two marks an offer can carry and still count in the middle (owner,
   * 2026-09-19: "it should just be marked as members only"). Both say a fact
   * about the offer, never a reading of its price. */
  grounded_mark_members: (f) => `Members only: ${f.name}`,
  grounded_mark_marketplace: (f) => `Marketplace seller: ${f.name}`,
  /* One store from two sources: Shin's own recorded price for a store the web
   * search also quoted (server's `sameStoreAsGemini`). Both rows stay; this
   * says which one is Shin's own and when it was seen, never which is right. */
  grounded_same_store_own: (f) => (f.date
    ? `${f.name}: Shin’s own record for this store, seen ${f.date}. Not checked.`
    : `${f.name}: Shin’s own record for this store. Not checked.`),
  cam_unchecked_answer: (f) => `Best match, not checked: ${f.label}`,

  /* ------------------------------------------------------- the price line
   * The zone words name the range the USER set. They are never Shin's
   * reading of the price: "good", "fair", "high", "a deal", "over the usual"
   * and "under the usual" are all banned outside a real verdict. */
  priceline_label: 'Price line',
  priceline_zone_under: 'under your line',
  priceline_zone_middle: 'in the middle',
  priceline_zone_over: 'over your line',
  priceline_tick_middle: 'middle',
  priceline_caption: (f) => `Per ${f.unit}, ${f.n} prices found`,
  priceline_you_under: (f) => `your price, ${f.pct}% under the middle of ${f.n} prices`,
  priceline_you_middle: (f) => `your price, in the middle of ${f.n} prices`,
  priceline_you_over: (f) => `your price, ${f.pct}% over the middle of ${f.n} prices`,
  /* One price is a line too (2026-09-19), so these read "the one price found"
     where the plural forms above would say "1 prices". */
  priceline_caption_one: (f) => `Per ${f.unit}, one price found`,
  priceline_you_under_one: (f) => `your price, ${f.pct}% under the one price found`,
  priceline_you_middle_one: 'your price, in the middle of the one price found',
  priceline_you_over_one: (f) => `your price, ${f.pct}% over the one price found`,
  priceline_mark_members: 'members only',
  priceline_mark_marketplace: 'marketplace seller',
  priceline_merged: (f) => `${f.n} prices`,
  priceline_excluded: (f) => `${f.n} left out`,

  /* --------------------------------------------------------------- the setup */
  setup_title: 'Pick your Shin',
  /* Was "One question, then the camera" until the two lines below were added
     on 2026-09-14. A kicker that promises one question over three is a small
     lie the user catches within four seconds of reading it. */
  setup_kicker: 'Two quick things, then the camera',
  setup_heading: 'Which Shin do you want?',
  setup_promise: 'Changeable any time. The attitude changes the words and never the number.',
  setup_start: 'Start scanning',

  /* ------------------------------------------------- the user's two lines
   * The founder's ask, 2026-09-14: how far under is worth it, and how far
   * over is too much. Those are his words for the INTENT and they are not
   * the words on the screen, because "under the usual" and "over the usual"
   * are both on the grading-word ban list that test/refusal-swaps.test.mjs
   * keeps (hard rule 2, Competition Act s.74.01(1)(b)). So the question is
   * asked about the middle of what was found and about the user's own line,
   * which is what it actually is: a boundary the user sets, not Shin's
   * reading of a price. Same reason the French says "sous le milieu" and
   * "au-dessus du milieu" rather than anything with "prix" next to it:
   * "au-dessus du prix" is on the list and "au-dessus" alone is not. */
  setup_lines_heading: 'Where are your two lines?',
  setup_lines_under_q: 'How far below the middle counts as under your line?',
  setup_lines_over_q: 'How far above the middle counts as over your line?',
  setup_lines_under_group: 'Your line below the middle',
  setup_lines_over_group: 'Your line above the middle',
  setup_lines_note: 'Ten and ten to start. Both changeable any time on the You page.',
  setup_lines_percent: (f) => `${f.n}%`,

  /* The three ranges (2026-09-19). His words for the ranges are good, bad and
     great, and they name boundaries the USER sets, so they are the user's own
     labels, not Shin grading a price. Shin's own answer words are unchanged. */
  ranges_heading: 'Set your price ranges',
  ranges_unit_q: 'Measure them in',
  ranges_unit_percent: 'Percentage (%)',
  ranges_unit_amount: 'Dollar Amount ($)',
  ranges_great_q: 'How far below the middle is a great price for you?',
  ranges_good_q: 'How far below the middle is a good price for you?',
  ranges_bad_q: 'How far above the middle is a bad price for you?',
  ranges_pct: (f) => `${f.n}%`,
  ranges_amt: (f) => `$${f.n}`,
  ranges_note: 'A starting range, until you change it. Changeable any time on the You page.',
  ranges_note_amount: 'Each amount is per item, against the middle price for the same size. Changeable any time on the You page.',

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
  // The verdict sheet's own small words. Seen in English on a French sheet
  // 2026-09-14: "at Metro", "you" on the rail, "promotional", "$4.44 less".
  cam_at_seller: (f) => `at ${f.seller}`,
  cam_rail_you: 'you',
  cam_in_market: (f) => `${f.market}, ${f.sellers}`,
  cam_no_tag_typed: 'no tag typed',
  cam_less: (f) => `${f.amount} less`,
  kind_regular: 'regular',
  kind_promotional: 'promotional',
  kind_asking: 'asking',
  kind_sold: 'sold',
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
  you_market_unset: 'Not set',
  you_market_caption: 'Price verdicts are judged against typical prices in this market.',
  you_savings: 'Savings overview',
  /* The Savings Overview screen (his welcome screen 32). Total Saved and Monthly
     Goal Progress draw only from a measured figure; savings_pending is what shows
     until one exists, and it states no amount. */
  savings_title: 'Savings Overview',
  savings_total: 'Total Saved',
  savings_goal: 'Monthly Goal Progress',
  savings_recent: 'Recently Scanned',
  savings_amt: (f) => `$${f.n}`,
  savings_goal_of: (f) => `$${f.saved} of $${f.target}`,
  savings_pending: 'Total Saved and Monthly Goal Progress show up here once a saving has been measured.',
  savings_recent_empty: 'Nothing scanned yet.',
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
  /* The Developer row at the bottom of You: the switch for the screen tag badge
     (js/screen-tag-badge.js). Chrome for the owner, so no attitude variants. */
  dev_heading: 'Developer',
  dev_tags: 'Show screen tags',
  dev_tags_caption: 'A small tag such as a12 in the top corner of every screen, so a screen can be named in a message. Off for everyone else.',
  you_build: 'Build',
  you_build_note: '· set by hand at each release.',
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
  /* Le texte de l'accueil, dans son propre fichier (onboarding-strings.js). */
  ...ONB_FR,
  /* ------------------------------------------------------- coquille et menu */
  app_name: 'Shin',
  nav_saved: 'Gardés',
  nav_you: 'Toi',
  nav_scan: 'Scanner quelque chose',
  nav_back: 'Retour',
  nav_more: 'Plus',
  back_to_camera: 'Retour à la caméra',
  close: 'Fermer',
  try_again: 'Réessayer',
  open: 'Ouvrir',

  paywall_title: 'Shin Plus',
  paywall_heading: 'Shin Plus : scans illimités',
  paywall_limit: (f) => `Les ${f.limit} scans gratuits de cette semaine sont utilisés.`,
  paywall_limit_bare: 'Les scans gratuits de cette semaine sont utilisés.',
  paywall_resets: (f) => `Ils reviennent ${f.when}.`,
  paywall_plans: 'Forfaits',
  paywall_monthly: 'Mensuel',
  paywall_yearly: 'Annuel',
  paywall_per_month: (f) => `${f.price} par mois`,
  paywall_per_year: (f) => `${f.price} par année`,
  paywall_subscribe: 'S’abonner',
  paywall_restore: 'Restaurer les achats',
  paywall_renews: 'Se renouvelle automatiquement jusqu’à l’annulation dans ton compte App Store ou Google Play.',
  paywall_terms: 'Conditions d’utilisation',
  paywall_privacy: 'Politique de confidentialité',
  paywall_close: 'Fermer',
  paywall_loading: 'Chargement des forfaits',
  paywall_failed: 'Les forfaits ne se sont pas chargés.',
  paywall_none: 'Aucun forfait n’est en vente en ce moment.',
  paywall_in_app: 'Abonne-toi dans l’application',
  paywall_in_app_detail: 'Shin Plus est vendu par l’App Store et Google Play. Ouvre Shin sur ton téléphone pour t’abonner.',
  paywall_working: 'En attente de la boutique',
  paywall_done: 'Shin Plus est actif. Les scans sont illimités.',
  paywall_restore_none: 'Aucun abonnement Shin Plus trouvé pour ce compte de boutique.',
  paywall_buy_failed: 'L’achat n’a pas abouti.',
  you_manage_sub: 'Gérer l’abonnement',
  you_scans_left: (f) => `${f.remaining} scans gratuits sur ${f.limit} restants cette semaine`,
  you_plus_on: 'Shin Plus : scans illimités',

  pm_heading: 'Correspondance de prix',
  outcome_q: 'Qu’as-tu fait ?',
  outcome_bought_elsewhere: 'Acheté ailleurs',
  outcome_price_matched: 'Obtenu une correspondance de prix',
  outcome_bought_here: 'Acheté ici',
  outcome_not_bought: 'Pas acheté',
  outcome_noted: 'Noté',
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
  cam_correct_it: 'Corriger les résultats',
  cam_share: 'Partager',
  cam_keep_it: 'Garde le prix',
  cam_type_what_it_is: 'Écris ce que c’est',
  cam_tell_me_the_price: 'Donne-moi le prix',
  cam_just_the_price: 'Note juste le prix',
  cam_price_written_down: 'Prix noté',
  cam_no_name_for_it: 'Aucun nom pour ça',
  cam_shop: 'Magasin',
  cam_shop_choose: 'Choisir',
  cam_shop_none: 'Aucun magasin',
  cam_shop_usual: 'Habituel',
  cam_shop_looking: 'Recherche des magasins',
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
  cam_gem_not_confident: 'Pas tout à fait sûr',
  cam_gem_median: (f) => `Prix du milieu : ${f.median} par ${f.unit}`,
  cam_gem_median_bare: (f) => `Prix du milieu : ${f.median}`,
  cam_gem_shelf: (f) => `Prix en rayon : ${f.label}`,
  cam_gem_answered_word: 'Répondu',
  cam_gem_failed_word: 'Pas de réponse',
  /* `when` arrive deja construit par `ago()` ("il y a 3 h"), qui met la
     preposition devant la ou l'anglais la met derriere. La phrase ci-dessous
     n'ajoute que le verbe. */
  cam_gem_checked: (f) => `Vérifié ${f.when}`,
  cam_gem_checked_now: 'Vérifié à l’instant',
  gem_alt_heading: 'Autres choix',
  gem_alt_at: (f) => `chez ${f.store}`,
  gem_alt_kind_same_product: 'Le même produit, vendu ailleurs',
  gem_alt_kind_substitute: 'Un produit semblable',
  gem_alt_kind_used_copy: 'Un exemplaire d’occasion',
  gem_alt_kind_newer_model: 'Un modèle plus récent',
  gem_alt_kind_other: 'Une autre option',
  cam_standin_note: 'Ce prix demandé est un substitut déclaré, pas une étiquette que quelqu’un a lue.',

  /* LE CATALOGUE D'ABORD. Les montants arrivent deja formates (4,99 $) par
     lib/money.js. La ligne de provenance dit d'ou vient la fourchette, jamais
     ce que vaut le prix. */
  cat_range: (f) => `${f.low} à ${f.high}`,
  cat_range_unit: (f) => `${f.low} à ${f.high}, pour ${f.unit}`,
  cat_range_label: 'Fourchette de prix',
  cat_basis_shin: (f) => `D’après les prix de Shin dans ${f.n} magasins`,
  cat_basis_shin_one: 'D’après les prix de Shin dans 1 magasin',
  cat_basis_shin_bare: 'D’après les prix de Shin',
  cat_basis_category: (f) => `D’après des produits semblables de la catégorie ${f.category}`,
  cat_basis_category_bare: 'D’après des produits semblables',
  cat_basis_ai: 'Une fourchette habituelle estimée par l’IA',
  cat_basis_ai_asked: (f) => `Une fourchette habituelle estimée par l’IA, demandée le ${f.date}`,
  cat_no_range: 'Shin n’a pas encore de fourchette de prix pour ce produit.',
  cat_no_range_later: 'Shin n’a pas encore de fourchette de prix pour ce produit. Scanne-le de nouveau plus tard.',
  cat_not_found: 'Ce code-barres n’est pas encore dans le catalogue de Shin.',
  cat_type_name: 'Tape le nom du produit',
  tm_heading: 'Est-ce l’un de ceux-ci?',
  tm_label: 'Produits qui correspondent au texte de l’emballage',
  tm_none: 'Rien dans le catalogue de Shin ne correspond encore à ce texte.',
  tm_dev_label: 'Texte lu sur l’emballage (développement)',

  /* --------------------------------------------- les anneaux de substitution
   *
   * Meme partage qu'en anglais: une substitution de la meme sorte, et une
   * substitution d'une categorie au-dessus, qui doit se declarer comme plus
   * large. L'espace insecable avant le deux-points suit face_label. */
  cam_swap_same: 'Même sorte de chose',
  cam_swap_same_in: (f) => `Même sorte de chose : ${f.tag}`,
  cam_swap_looser: 'Substitution plus large : une catégorie au-dessus',
  cam_swap_looser_in: (f) => `Substitution plus large : une catégorie au-dessus, dans ${f.tag}`,
  cam_swap_all_looser: 'Rien de moins cher sur cette tablette-là. Ceux-ci viennent d’une catégorie au-dessus, donc ce n’est pas tout à fait la même sorte de chose.',
  /* Les deux mêmes lignes, pour une feuille sans comparaison dessus. Voir la
     version anglaise: une référence dit sur quoi elle s’appuie sans donner de
     note. */
  cam_similar_priced: 'Des choses semblables qui ont un prix',
  cam_swap_all_looser_ref: 'Rien sur cette tablette-là. Ceux-ci viennent d’une catégorie au-dessus, donc ce n’est pas tout à fait la même sorte de chose.',
  cam_what_is_it: 'C’est quoi? (facultatif)',
  cam_what_is_it_hint: 'Kraft Dinner, 225 g',
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
  cam_rate_single: (f) => `${f.price}${f.market ? ` ${f.market}` : ''}, un marchand`,
  cam_rate_range: (f) => `${f.low} à ${f.high}${f.market ? ` ${f.market}` : ''}`,
  cam_rate_to: (f) => `${f.low} à ${f.high}`,
  cam_seller_count: (f) => `${f.n} marchand${f.n === '1' ? '' : 's'}`,
  cam_rail_alt: (f) => `Les prix trouvés vont de ${f.low} à ${f.high}. Devant toi, c'est ${f.asking}.`,
  cam_delete_last_digit: 'Effacer le dernier chiffre',
  cam_price_modifiers: 'Modificateurs de prix',
  cam_cancel_scan: 'Annuler et revenir au viseur',
  cam_brand_model_placeholder: 'Marque et modèle…',
  cam_search: 'Chercher',
  cam_torch: 'Lampe',
  cam_this: 'ça',
  cam_shutter: 'Prendre une photo',
  cam_mode_manual: 'Recherche manuelle',
  cam_alt_group: 'Que veux-tu de ce scan?',
  cam_alt_validation: 'Est-ce un bon prix?',
  cam_alt_switching: 'Trouve-moi mieux',
  cam_hist_heading: 'Tes prix précédents',
  cam_hist_alt: (f) => `Tes ${f.n} derniers prix pour cet article, du plus ancien au plus récent.`,
  cam_scan_barcode: 'Scanner le code-barres',
  you_torch_group: 'Lampe',
  you_torch_auto: 'Auto',
  you_torch_off: 'Éteinte',
  you_torch_level: 'Allumer sous cette luminosité',
  you_torch_hint: "Un réglage plus bas attend qu'il fasse plus sombre. Il part du niveau que Shin utilise.",
  you_torch_off_hint: "La lampe reste éteinte, et la caméra dit quand il fait trop sombre pour lire.",

  /* ----------------------------------------------------------- le consentement */
  consent_kicker: 'Avant ton premier scan',
  consent_title: 'Tes données',
  consent_heading: 'Ce que Shin fait avec tes données',
  consent_photos: 'Photos',
  consent_location: 'Localisation',
  consent_continue: 'Continuer',

  /* ---------------------------------------------------------- les permissions */
  perm_title: 'Autorisations',
  perm_kicker: 'Avant ton premier scan',

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
  market_kicker: 'Là où les prix sont comparés',
  market_caption: 'Envoyé avec chaque scan, pour comparer les prix au bon endroit. Rien n’est converti d’une devise à l’autre.',
  market_search: 'Chercher un pays',
  market_none: 'Aucun pays ne correspond.',
  market_region_kicker: 'Région, si ça compte',
  market_region_none: 'Non choisie',
  market_region_caption: 'Facultatif. Les prix peuvent différer entre provinces et États. Sans choix, la région reste inconnue.',
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

  /* --------------------------------------- la section trouvée par Google
   * Tout ce qui suit s'affiche A COTE du bloc de Google, jamais dedans. Voir
   * l'en-tete de grounded.js: les conditions de l'API Gemini interdisent
   * d'intercaler notre contenu dans un resultat ancre, et la structure du DOM
   * est la reponse a cette phrase.
   *
   * Le bloc lui-meme n'est PAS traduit ici: le serveur demande a Gemini la
   * langue du lecteur, donc il arrive deja en francais. Le retraduire apres
   * coup serait le "modifier". */
  grounded_heading: 'Trouvé par Google',
  grounded_no_link: (f) => `Pas de lien pour celui-ci : ${f.name}`,
  grounded_unchecked: 'Trouvé par une recherche web. Pas vérifié par Shin.',
  grounded_heading_own: 'Selon les prix de Shin',
  grounded_own_note: 'Prix que Shin a notés, chacun avec le jour où il a été vu. Pas vérifiés.',
  grounded_size_assumed: 'Format inconnu, donc la comparaison se fait au format que la plupart des magasins affichent.',
  grounded_no_line_none: 'Aucun prix comparable trouvé pour celui-ci.',
  grounded_no_line_size: 'Aucun format donné pour celui-ci, donc les prix ne peuvent pas être alignés.',
  grounded_line_one: 'Un seul prix trouvé, donc le milieu est ce prix.',
  grounded_line_thin: (f) => `À partir de ${f.n} prix, donc le milieu est approximatif.`,
  grounded_line_held: 'Un prix était trop éloigné des autres pour être placé.',
  grounded_mark_members: (f) => `Réservé aux membres : ${f.name}`,
  grounded_mark_marketplace: (f) => `Vendeur de la place de marché : ${f.name}`,
  grounded_same_store_own: (f) => (f.date
    ? `${f.name} : relevé de Shin pour ce magasin, vu le ${f.date}. Pas vérifié.`
    : `${f.name} : relevé de Shin pour ce magasin. Pas vérifié.`),
  cam_unchecked_answer: (f) => `Meilleure correspondance, pas vérifiée : ${f.label}`,

  /* ------------------------------------------------------- la ligne des prix
   * Les mots des zones nomment la limite que l'UTILISATEUR a fixee. Jamais
   * l'avis de Shin sur le prix: "cher", "bon prix", "aubaine", "rabais",
   * "salé", "élevé", "vol", "au-dessus du prix" et "en dessous du prix" sont
   * tous interdits hors d'un vrai verdict. D'ou "sous le milieu" et
   * "au-dessus du milieu": "au-dessus" seul n'est pas sur la liste, c'est
   * "au-dessus du prix" qui l'est. */
  priceline_label: 'Ligne des prix',
  priceline_zone_under: 'sous ta limite',
  priceline_zone_middle: 'au milieu',
  priceline_zone_over: 'au-dessus de ta limite',
  priceline_tick_middle: 'milieu',
  priceline_caption: (f) => `Par ${f.unit}, ${f.n} prix trouvés`,
  priceline_you_under: (f) => `ton prix, ${f.pct} % sous le milieu de ${f.n} prix`,
  priceline_you_middle: (f) => `ton prix, au milieu de ${f.n} prix`,
  priceline_you_over: (f) => `ton prix, ${f.pct} % au-dessus du milieu de ${f.n} prix`,
  priceline_caption_one: (f) => `Par ${f.unit}, un seul prix trouvé`,
  priceline_you_under_one: (f) => `ton prix, ${f.pct} % de moins que le seul prix trouvé`,
  priceline_you_middle_one: 'ton prix, au milieu du seul prix trouvé',
  priceline_you_over_one: (f) => `ton prix, ${f.pct} % de plus que le seul prix trouvé`,
  priceline_mark_members: 'réservé aux membres',
  priceline_mark_marketplace: 'vendeur de la place de marché',
  priceline_merged: (f) => `${f.n} prix`,
  priceline_excluded: (f) => `${f.n} écartés`,

  /* ----------------------------------------------------------- la mise en route */
  setup_title: 'Choisis ton Shin',
  setup_kicker: 'Deux petites choses, puis la caméra',
  setup_heading: 'Quel Shin veux-tu?',
  setup_promise: 'Modifiable n’importe quand. L’attitude change les mots et jamais le chiffre.',
  setup_start: 'Commencer à scanner',

  /* ------------------------------------------------- les deux limites de l'utilisateur */
  setup_lines_heading: 'Où sont tes deux limites?',
  setup_lines_under_q: 'Combien sous le milieu compte comme sous ta limite?',
  setup_lines_over_q: 'Combien au-dessus du milieu compte comme au-dessus de ta limite?',
  setup_lines_under_group: 'Ta limite sous le milieu',
  setup_lines_over_group: 'Ta limite au-dessus du milieu',
  setup_lines_note: 'Dix et dix pour commencer. Les deux se changent n’importe quand sur la page Toi.',
  ranges_heading: 'Fixe tes fourchettes de prix',
  ranges_unit_q: 'Les mesurer en',
  ranges_unit_percent: 'Pourcentage (%)',
  ranges_unit_amount: 'Montant en dollars ($)',
  ranges_great_q: 'Combien sous le milieu est un excellent prix pour toi?',
  ranges_good_q: 'Combien sous le milieu est un prix intéressant pour toi?',
  ranges_bad_q: 'Combien au-dessus du milieu est un mauvais prix pour toi?',
  ranges_pct: (f) => `${f.n} %`,
  ranges_amt: (f) => `${f.n} $`,
  ranges_note: 'Une fourchette de départ, jusqu’à ce que tu la changes. Modifiable n’importe quand sur la page Toi.',
  ranges_note_amount: 'Chaque montant est par article, comparé au prix du milieu pour le même format. Modifiable n’importe quand sur la page Toi.',
  setup_lines_percent: (f) => `${f.n} %`,

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
  cam_at_seller: (f) => `chez ${f.seller}`,
  cam_rail_you: 'toi',
  cam_in_market: (f) => `${f.market}, ${f.sellers}`,
  // "Aucun prix entré" et non "aucune étiquette écrite": personne n'écrit une
  // étiquette, elle est déjà sur la tablette. Ce qui manque, c'est le prix que
  // la personne n'a pas entré. L'anglais dit "no tag typed" et parle du même
  // geste, mais le raccourci ne passe pas en français.
  cam_no_tag_typed: 'aucun prix entré',
  cam_less: (f) => `${f.amount} de moins`,
  kind_regular: 'régulier',
  kind_promotional: 'en promotion',
  kind_asking: 'demandé',
  kind_sold: 'vendu',
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
  you_market_unset: 'Non défini',
  you_market_caption: 'Les verdicts de prix sont jugés par rapport aux prix typiques de ce marché.',
  you_savings: 'Aperçu des économies',
  savings_title: 'Aperçu des économies',
  savings_total: 'Total économisé',
  savings_goal: 'Progression de l’objectif mensuel',
  savings_recent: 'Numérisés récemment',
  savings_amt: (f) => `${f.n} $`,
  savings_goal_of: (f) => `${f.saved} $ sur ${f.target} $`,
  savings_pending: 'Le total économisé et la progression de l’objectif mensuel s’affichent ici une fois qu’une économie a été mesurée.',
  savings_recent_empty: 'Rien de numérisé pour l’instant.',
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
  dev_heading: 'Développeur',
  dev_tags: 'Afficher les étiquettes d’écran',
  dev_tags_caption: 'Une petite étiquette comme a12 dans le coin de chaque écran, pour pouvoir nommer un écran dans un message. Désactivé pour tout le monde.',
  you_build: 'Version',
  you_build_note: '· inscrite à la main à chaque version.',
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
