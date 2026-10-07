/**
 * The chrome text of the onboarding flow, English and French.
 *
 * Lives beside the flow rather than inside ui-strings.js only so that one file
 * of a few hundred lines is not buried in a table of eight hundred; ui-strings.js
 * spreads both objects into its own EN and FR, so `t('onb_...')` is the one way
 * to read any of it and test/locale.test.mjs holds the two languages to the same
 * keys. Nothing here is Shin speaking in the first person: these are the
 * questions, options and captions of Jamin's Welcome screen tab (docs/
 * walkthrough/jamin-notes-2026-09-17.md, the numbered list), so they are chrome
 * and carry no attitude, per the line ui-strings.js draws.
 *
 * His text as he wrote it, with two exceptions: the apostrophe in "it's" on the
 * first tagline, and the French, which is a translation and so is ours. No em
 * dashes; the en dash in his "0–2 times" is his and stays.
 */

export const ONB_EN = {
  onb_title: 'Welcome',
  onb_progress: (f) => `${f.n} of ${f.total}`,
  onb_continue: 'Continue',
  onb_skip_all: 'Skip the rest',
  onb_not_now: 'Not now',
  onb_multi_hint: 'Pick all that apply',
  onb_finish: 'Get started',
  onb_replay_row: 'Watch the welcome again',

  /* 1 and 2 */
  onb_welcome_name: 'SHIN',
  onb_promise: 'Scan any product and instantly know if it’s worth it',

  /* 3 */
  onb_shops_q: 'Where do you shop most often?',
  onb_shops_supermarkets: 'Supermarkets & Groceries',
  onb_shops_bigbox: 'Big Box Stores',
  onb_shops_pharmacies: 'Pharmacies & Drugstores',
  onb_shops_other: 'Other Retailers',

  /* 4 */
  onb_frequency_q: 'How often do you go shopping per week?',
  onb_frequency_occasional: '0–2 times',
  onb_frequency_occasional_sub: 'Occasional shopper',
  onb_frequency_regular: '3–5 times',
  onb_frequency_regular_sub: 'Regular shopper',
  onb_frequency_frequent: '6+ times',
  onb_frequency_frequent_sub: 'Frequent bargain hunter',

  /* 5 */
  onb_priority_q: 'What is your main shopping priority?',
  onb_priority_lowest: 'Finding Lowest Price',
  onb_priority_clearance: 'Spotting Clearance Deals',
  onb_priority_balance: 'Value & Quality Balance',
  onb_priority_quick: 'Quick In-and-Out',

  /* 6 */
  onb_heard_q: 'Where did you hear about us?',
  onb_heard_tv: 'TV',
  onb_heard_google: 'Google',
  onb_heard_tiktok: 'TikTok',
  onb_heard_instagram: 'Instagram',
  onb_heard_friend: 'Friend or family',
  onb_heard_facebook: 'Facebook',
  onb_heard_x: 'X',

  /* 7 */
  onb_tried_q: 'Have you tried other deal finding or price tracking apps?',
  onb_tried_yes: 'Yes',
  onb_tried_no: 'No',

  /* 8, a figure step: shown only with a measured savings trend */
  onb_trend_title: 'Designed to maximize your savings',
  onb_trend_without: 'Overpaying without SHIN',
  onb_trend_with: 'Consistently saving with SHIN',
  onb_trend_months: 'Over 6 months',

  /* 9 and 10 */
  onb_mode_q: 'What minimum discount threshold makes an item a ‘Good Deal’ for you?',
  onb_mode_percent: 'Percentage (%)',
  onb_mode_amount: 'Dollar Amount ($)',
  onb_threshold_q: 'Set your target deal threshold',
  onb_threshold_label: 'Deal threshold',
  onb_threshold_pct: (f) => `${f.n}% OFF`,
  onb_threshold_amt: (f) => `$${f.n} OFF`,
  onb_recommended: '(Recommended)',

  /* 11 and 12 */
  onb_loyalty_q: 'Do you currently use store loyalty programs or coupon apps?',
  onb_loyalty_yes: 'Yes',
  onb_loyalty_no: 'No',
  onb_goal_q: 'What is your primary goal with SHIN?',
  onb_goal_groceries: 'Save money on groceries',
  onb_goal_checkout: 'Avoid overpaying at checkout',
  onb_goal_history: 'Track price history over time',

  /* 13 */
  onb_monthly_q: 'What is your target monthly savings goal?',
  onb_monthly_amt: (f) => `$${f.n}.00 / month`,
  onb_monthly_less: 'Less',
  onb_monthly_more: 'More',
  /* Hidden unless a measured figure says so (see onboarding-flow.js). */
  onb_monthly_realistic: 'Goal is realistic and achievable',

  /* 14 */
  onb_alerts_q: 'How aggressive do you want your deal alerts to be?',
  onb_alerts_conservative: 'Conservative',
  onb_alerts_conservative_sub: '30%+ discount',
  onb_alerts_recommended: 'Recommended',
  onb_alerts_recommended_sub: '20%+ discount',
  onb_alerts_aggressive: 'Aggressive',
  onb_alerts_aggressive_sub: '10%+ discount',

  /* 15 */
  onb_compare_title: 'A smarter way to shop',
  onb_compare_without: 'Without SHIN',
  onb_compare_without_sub: 'Guessing shelf prices',
  onb_compare_with: 'With SHIN',
  onb_compare_with_sub: 'Instant barcode scan and a verdict on the price',

  /* 16 */
  onb_frustration_q: 'What’s your biggest frustration when shopping?',
  onb_frustration_fake: 'Fake or misleading sales',
  onb_frustration_history: 'Lack of price history',
  onb_frustration_units: 'Confusing unit prices',
  onb_frustration_clearance: 'Missing out on clearance deals',
  onb_frustration_impulse: 'Overspending on impulse buys',

  /* 17, a figure step */
  onb_potential_title: 'You have great potential to cut your shopping bills',
  onb_potential_days: (f) => `${f.n} Days`,
  onb_potential_saved: (f) => `$${f.n} saved`,

  /* 18 */
  onb_thanks_title: 'Thank you for trusting us!',
  onb_thanks_sub: 'Now let’s personalize SHIN for you...',

  /* 19, a figure step: each line is its own slot */
  onb_social_title: (f) => `Join over ${f.n} smart shoppers like you`,
  onb_social_rating: (f) => `${f.v} star rating`,

  /* 20 */
  onb_preparing_title: 'Setting up your personalized deal engine...',
  onb_preparing_discount: 'Target Discount %',
  onb_preparing_stores: 'Preferred Stores',
  onb_preparing_radius: 'Deal Alert Radius',
  onb_preparing_history: 'Prices seen before',
  onb_preparing_tracker: 'Savings Tracker',

  /* 21, a figure step */
  onb_progress_title: (f) => `Goal: Save $${f.n}`,
  onb_progress_saved: (f) => `$${f.n} saved so far`,

  /* 22, skipped until accounts exist */
  onb_signin_title: 'Save your savings progress',
  onb_signin_apple: 'Sign in with Apple',
  onb_signin_google: 'Sign in with Google',
  onb_signin_email: 'Continue with email',

  /* 23 */
  /* D32, 2026-10-06: this step promised a free trial of "SHIN Pro". There is no
     trial and no product called Pro: the plan is Shin Plus, with the two prices
     from plus-config.js (RULINGS.md "Shin Plus pricing and free scans"). */
  onb_trial_title: 'Shin Plus is for unlimited scans',
  onb_trial_note: (f) => `${f.monthly} a month or ${f.yearly} a year, and you choose on the next screen.`,
  onb_trial_try: 'See the plans',

  /* 24 */
  onb_perm_title: 'Enable camera & location permissions to scan and compare local deals',
  onb_perm_camera: 'Camera access',
  onb_perm_camera_sub: 'for scanning',
  onb_perm_location: 'Location access',
  onb_perm_location_sub: 'for store prices',
  onb_perm_camera_denied: 'Camera access was not allowed on this device.',
  /* Item 19: a scripted demo scan, so a sample answer can be seen before
     camera permission is granted. Chrome, not Shin: this screen carries none
     of Shin's voice (see the file header on screens/onboarding.js), so the
     badge and the fallback line are both plain labels, never a sentence in
     the first person. */
  onb_see_demo: 'See a demo scan',
  onb_demo_badge: 'DEMO',
  onb_demo_unavailable: 'The demo scan is not available yet.',
  onb_demo_loading: 'Fetching the demo scan...',

  /* 25 */
  onb_plans_title: 'Choose a plan to unlock unlimited scans',
  onb_plans_annual: (f) => `${f.yearly} billed annually`,
  onb_plans_annual_sub: (f) => `(${f.perMonth}/mo)`,
  onb_plans_monthly: (f) => `${f.monthly}/mo`,
  /* The plan step sells nothing: no billing exists, `store.js` never sets
     `proUntil`, and the flow finishes whatever was tapped. Kept rather than
     deleted (Aurik, 2026-09-21) so the shape of the product stays visible, and
     marked so a tester cannot read the prices as real. Same two-part shape as
     the demo scan above: a plain badge, and one plain line. */
  onb_plans_badge: 'NOT LIVE',
  onb_plans_stub: 'These are the real plan prices, but this step charges nothing and unlocks nothing. Subscribe from the Shin Plus screen.',

  /* 26 to 29 */
  onb_tip_scan_title: 'Get the best scan',
  onb_tip_scan_1: 'Hold still',
  onb_tip_scan_2: 'Use lots of light',
  onb_tip_scan_3: 'Ensure barcode or price tag is visible',
  onb_tip_eval_title: 'SHIN evaluates your item',
  onb_tip_eval_1: 'Barcode/Tag identified',
  onb_tip_eval_2: 'Matches local store price',
  onb_tip_eval_3: 'Instant deal verdict calculated',
  onb_tip_fix_title: 'Adjust shelf price or store, if necessary',
  onb_tip_fix_1: 'Check that the product match is accurate',
  onb_tip_fix_2: 'Edit shelf price if needed',
  onb_tip_fix_3: 'Tap ‘Fix Results’ if something’s off',
  onb_tip_accuracy_title: 'For highest accuracy',
  onb_tip_accuracy_1: 'Scan the barcode',
  onb_tip_accuracy_2: 'Or take a photo of the shelf price tag',
  onb_tip_accuracy_2_nophoto: 'Or type the price you see on the tag',
  onb_tip_accuracy_3: 'Alternatively, search the product database',

  /* 31: his "Evaluating Deal..." with a progress bar. The status line is his; the
     stage lines under it are the scan wait's own (voice.js working_step1 to 3). */
  onb_eval_title: 'Evaluating Deal...',
  onb_eval_status: 'Comparing prices across local retailers...',
};

export const ONB_FR = {
  onb_title: 'Bienvenue',
  onb_progress: (f) => `${f.n} sur ${f.total}`,
  onb_continue: 'Continuer',
  onb_skip_all: 'Passer le reste',
  onb_not_now: 'Plus tard',
  onb_multi_hint: 'Choisis tout ce qui s’applique',
  onb_finish: 'C’est parti',
  onb_replay_row: 'Revoir l’accueil',

  onb_welcome_name: 'SHIN',
  onb_promise: 'Scanne n’importe quel produit et sache tout de suite si ça vaut le coup',

  onb_shops_q: 'Où magasines-tu le plus souvent?',
  onb_shops_supermarkets: 'Supermarchés et épiceries',
  onb_shops_bigbox: 'Magasins à grande surface',
  onb_shops_pharmacies: 'Pharmacies et drogueries',
  onb_shops_other: 'Autres détaillants',

  onb_frequency_q: 'Combien de fois par semaine fais-tu des courses?',
  onb_frequency_occasional: '0 à 2 fois',
  onb_frequency_occasional_sub: 'Acheteur occasionnel',
  onb_frequency_regular: '3 à 5 fois',
  onb_frequency_regular_sub: 'Acheteur régulier',
  onb_frequency_frequent: '6 fois ou plus',
  onb_frequency_frequent_sub: 'Chasseur d’aubaines assidu',

  onb_priority_q: 'Quelle est ta priorité principale quand tu magasines?',
  onb_priority_lowest: 'Trouver le prix le plus bas',
  onb_priority_clearance: 'Repérer les liquidations',
  onb_priority_balance: 'Équilibre valeur et qualité',
  onb_priority_quick: 'Entrer et sortir vite',

  onb_heard_q: 'Où as-tu entendu parler de nous?',
  onb_heard_tv: 'Télé',
  onb_heard_google: 'Google',
  onb_heard_tiktok: 'TikTok',
  onb_heard_instagram: 'Instagram',
  onb_heard_friend: 'Ami ou famille',
  onb_heard_facebook: 'Facebook',
  onb_heard_x: 'X',

  onb_tried_q: 'As-tu déjà essayé d’autres applis de rabais ou de suivi des prix?',
  onb_tried_yes: 'Oui',
  onb_tried_no: 'Non',

  onb_trend_title: 'Conçu pour maximiser tes économies',
  onb_trend_without: 'Tu paies trop sans SHIN',
  onb_trend_with: 'Tu économises régulièrement avec SHIN',
  onb_trend_months: 'Sur 6 mois',

  onb_mode_q: 'Quel rabais minimum fait d’un article une « bonne affaire » pour toi?',
  onb_mode_percent: 'Pourcentage (%)',
  onb_mode_amount: 'Montant en dollars ($)',
  onb_threshold_q: 'Fixe ton seuil de rabais',
  onb_threshold_label: 'Seuil de rabais',
  onb_threshold_pct: (f) => `${f.n} % DE RABAIS`,
  onb_threshold_amt: (f) => `${f.n} $ DE RABAIS`,
  onb_recommended: '(Recommandé)',

  onb_loyalty_q: 'Utilises-tu des programmes de fidélité ou des applis de coupons?',
  onb_loyalty_yes: 'Oui',
  onb_loyalty_no: 'Non',
  onb_goal_q: 'Quel est ton objectif principal avec SHIN?',
  onb_goal_groceries: 'Économiser sur l’épicerie',
  onb_goal_checkout: 'Éviter de trop payer à la caisse',
  onb_goal_history: 'Suivre l’historique des prix',

  onb_monthly_q: 'Quel est ton objectif d’économies par mois?',
  onb_monthly_amt: (f) => `${f.n},00 $ / mois`,
  onb_monthly_less: 'Moins',
  onb_monthly_more: 'Plus',
  onb_monthly_realistic: 'Objectif réaliste et atteignable',

  onb_alerts_q: 'À quel point veux-tu que tes alertes de rabais soient agressives?',
  onb_alerts_conservative: 'Prudentes',
  onb_alerts_conservative_sub: 'Rabais de 30 % et plus',
  onb_alerts_recommended: 'Recommandées',
  onb_alerts_recommended_sub: 'Rabais de 20 % et plus',
  onb_alerts_aggressive: 'Agressives',
  onb_alerts_aggressive_sub: 'Rabais de 10 % et plus',

  onb_compare_title: 'Une façon plus futée de magasiner',
  onb_compare_without: 'Sans SHIN',
  onb_compare_without_sub: 'Deviner les prix en tablette',
  onb_compare_with: 'Avec SHIN',
  onb_compare_with_sub: 'Scan instantané du code-barres et un verdict sur le prix',

  onb_frustration_q: 'Quelle est ta plus grande frustration en magasinant?',
  onb_frustration_fake: 'Les faux rabais ou les rabais trompeurs',
  onb_frustration_history: 'L’absence d’historique des prix',
  onb_frustration_units: 'Les prix unitaires qui embrouillent',
  onb_frustration_clearance: 'Rater les liquidations',
  onb_frustration_impulse: 'Trop dépenser sur un coup de tête',

  onb_potential_title: 'Tu as un grand potentiel pour réduire tes factures',
  onb_potential_days: (f) => `${f.n} jours`,
  onb_potential_saved: (f) => `${f.n} $ économisés`,

  onb_thanks_title: 'Merci de nous faire confiance!',
  onb_thanks_sub: 'Personnalisons maintenant SHIN pour toi...',

  onb_social_title: (f) => `Joins plus de ${f.n} acheteurs futés comme toi`,
  onb_social_rating: (f) => `Note de ${f.v} étoiles`,

  onb_preparing_title: 'Préparation de ton moteur de rabais personnalisé...',
  onb_preparing_discount: 'Rabais visé en %',
  onb_preparing_stores: 'Magasins préférés',
  onb_preparing_radius: 'Rayon des alertes',
  onb_preparing_history: 'Prix déjà vus',
  onb_preparing_tracker: 'Suivi des économies',

  onb_progress_title: (f) => `Objectif : économiser ${f.n} $`,
  onb_progress_saved: (f) => `${f.n} $ économisés jusqu’ici`,

  onb_signin_title: 'Garde ta progression d’économies',
  onb_signin_apple: 'Se connecter avec Apple',
  onb_signin_google: 'Se connecter avec Google',
  onb_signin_email: 'Continuer avec un courriel',

  onb_trial_title: 'Shin Plus sert à scanner sans limite',
  onb_trial_note: (f) => `${f.monthly} par mois ou ${f.yearly} par année, et tu choisis à l’écran suivant.`,
  onb_trial_try: 'Voir les forfaits',

  onb_perm_title: 'Active la caméra et la localisation pour scanner et comparer les rabais près de toi',
  onb_perm_camera: 'Accès à la caméra',
  onb_perm_camera_sub: 'pour scanner',
  onb_perm_location: 'Accès à la localisation',
  onb_perm_location_sub: 'pour les prix en magasin',
  onb_perm_camera_denied: 'L’accès à la caméra n’a pas été autorisé sur cet appareil.',
  onb_see_demo: 'Voir un exemple de scan',
  onb_demo_badge: 'DÉMO',
  onb_demo_unavailable: 'L’exemple de scan n’est pas encore disponible.',
  onb_demo_loading: 'Chargement de l’exemple de scan...',

  onb_plans_title: 'Choisis un forfait pour scanner sans limite',
  onb_plans_annual: (f) => `${f.yearly} facturés par année`,
  onb_plans_annual_sub: (f) => `(${f.perMonth}/mois)`,
  onb_plans_monthly: (f) => `${f.monthly}/mois`,
  onb_plans_badge: 'PAS ACTIF',
  onb_plans_stub: 'Ce sont les vrais prix des forfaits, mais cette étape ne facture rien et ne débloque rien. Abonne-toi depuis l’écran Shin Plus.',

  onb_tip_scan_title: 'Pour le meilleur scan',
  onb_tip_scan_1: 'Ne bouge pas',
  onb_tip_scan_2: 'Utilise beaucoup de lumière',
  onb_tip_scan_3: 'Assure-toi que le code-barres ou l’étiquette est visible',
  onb_tip_eval_title: 'SHIN évalue ton article',
  onb_tip_eval_1: 'Code-barres ou étiquette repéré',
  onb_tip_eval_2: 'Correspond au prix du magasin local',
  onb_tip_eval_3: 'Verdict instantané calculé',
  onb_tip_fix_title: 'Ajuste le prix en tablette ou le magasin au besoin',
  onb_tip_fix_1: 'Vérifie que le produit correspond bien',
  onb_tip_fix_2: 'Modifie le prix en tablette au besoin',
  onb_tip_fix_3: 'Touche « Corriger les résultats » si quelque chose cloche',
  onb_tip_accuracy_title: 'Pour la meilleure précision',
  onb_tip_accuracy_1: 'Scanne le code-barres',
  onb_tip_accuracy_2: 'Ou prends une photo de l’étiquette de prix',
  onb_tip_accuracy_2_nophoto: 'Ou tape le prix que tu vois sur l’étiquette',
  onb_tip_accuracy_3: 'Ou cherche dans la base de produits',

  onb_eval_title: 'Évaluation de l’aubaine...',
  onb_eval_status: 'Comparaison des prix chez les détaillants locaux...',
};
