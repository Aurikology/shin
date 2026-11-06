/**
 * The strings build 2 of the UX pass added to the subscription screen
 * (2026-10-09, docs/design/ux-evidence-2026-10-09.md R-80 and R-84). They live
 * in their own file, spread into ui-strings.js's EN and FR the way
 * onboarding-strings.js is, so this build never edits the main table's lines
 * while the copy pass is editing them. `t('paywall_...')` is still the one way
 * to read any of it.
 *
 * NO PRICE IS WRITTEN HERE. `paywall_equiv` takes the store's own per-month
 * string as a fact. The scan limit and the used count arrive from the server.
 * No savings claim (hard rule 2) and nothing aimed at the person (hard rule 3).
 */

export const PW_EN = {
  paywall_equiv: (f) => `about ${f.price} a month, billed once a year`,
  paywall_spent_heading: 'That is all of this week\'s scans.',
  paywall_count: (f) => `${f.used} of ${f.limit} used`,
  paywall_still_works: 'Typing a name still works and everything you saved is still here.',
  paywall_more_scans: (f) => `More scans on ${f.when}.`,
  paywall_type_name: 'Type a name instead',
  paywall_restore_failed: 'Restoring purchases did not work. Try again.',
  /* A Plus subscriber at the Plus cap (100 a week): a fact about the week, with no subscribe offer. */
  plus_spent_heading: (f) => `You have used this week's ${f.limit} Pexi Plus scans.`,
  plus_spent_heading_bare: 'You have used this week\'s Pexi Plus scans.',
  plus_spent_resets: (f) => `Scans start coming back on ${f.when}.`,
  plus_spent_resets_bare: 'Scans start coming back as the week rolls on.',
};

export const PW_FR = {
  paywall_equiv: (f) => `environ ${f.price} par mois, facturé une fois par année`,
  paywall_spent_heading: 'Les scans de cette semaine sont tous utilisés.',
  paywall_count: (f) => `${f.used} sur ${f.limit} utilisés`,
  paywall_still_works: 'Tu peux toujours taper un nom, et tout ce que tu as gardé est toujours là.',
  paywall_more_scans: (f) => `Plus de scans le ${f.when}.`,
  paywall_type_name: 'Taper un nom plutôt',
  paywall_restore_failed: 'La restauration des achats n’a pas fonctionné. Réessaie.',
  plus_spent_heading: (f) => `Tu as utilisé les ${f.limit} scans Pexi Plus de cette semaine.`,
  plus_spent_heading_bare: 'Tu as utilisé les scans Pexi Plus de cette semaine.',
  plus_spent_resets: (f) => `Les scans recommencent à revenir le ${f.when}.`,
  plus_spent_resets_bare: 'Les scans recommencent à revenir au fil de la semaine.',
};
