/**
 * The chrome text of the onboarding flow, English and French.
 *
 * Lives beside the flow rather than inside ui-strings.js only so that one file
 * of a few hundred lines is not buried in a table of eight hundred; ui-strings.js
 * spreads both objects into its own EN and FR, so `t('onb_...')` is the one way
 * to read any of it and test/locale.test.mjs holds the two languages to the same
 * keys. Nothing here is Pexi speaking in the first person: these are the
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
  onb_welcome_name: 'PEXI',
  onb_welcome_line: 'Know a good price before you pay.',
  onb_get_started: 'Get started',
  onb_promise: 'Scan a product and see if the price is a good one',

  /* 2026-11-22, the concise flow (onboarding-flow.js FLOW): gender, and why each question is asked. */
  onb_gender_q: 'Choose your gender',
  onb_gender_why: 'This helps us understand who shops with Pexi.',
  onb_gender_female: 'Female',
  onb_gender_male: 'Male',
  onb_gender_other: 'Other',
  onb_gender_prefer_not: 'Prefer not to say',
  onb_frequency_why: 'Pexi learns how often you shop, to check the prices you see most.',
  onb_shops_why: 'We use it to bring in prices for what you buy.',
  onb_priority_why: 'This helps Pexi show you what matters to you first.',
  onb_heard_why: 'This helps us reach more shoppers like you.',
  onb_tried_why: 'This helps us make Pexi better than what you have used.',

  /* 3 */
  onb_shops_q: 'What do you usually shop for?',
  onb_shops_groceries: 'Groceries & Everyday Essentials',
  onb_shops_apparel: 'Apparel & Footwear',
  onb_shops_electronics: 'Electronics',
  onb_shops_health: 'Health',
  onb_shops_beauty: 'Beauty',

  /* 4 */
  onb_frequency_q: 'How often do you go grocery shopping?',
  onb_frequency_occasional: 'Once a week or less',
  onb_frequency_occasional_sub: 'Occasional shopper',
  onb_frequency_regular: '2 to 3 times a week',
  onb_frequency_regular_sub: 'Regular shopper',
  onb_frequency_frequent: '4 or more times a week',
  onb_frequency_frequent_sub: 'Frequent shopper',

  /* 5 */
  onb_priority_q: 'What matters most when you shop?',
  onb_priority_lowest: 'Finding Lowest Price',
  onb_priority_clearance: 'Spotting Clearance Deals',
  onb_priority_balance: 'Value & Quality Balance',
  onb_priority_quick: 'Quick In-and-Out',

  /* 6 */
  onb_heard_q: 'Where did you hear about us?',
  onb_heard_appstore: 'App Store',
  onb_heard_tv: 'TV',
  onb_heard_google: 'Google',
  onb_heard_tiktok: 'TikTok',
  onb_heard_instagram: 'Instagram',
  onb_heard_friend: 'Friend or family',
  onb_heard_facebook: 'Facebook',
  onb_heard_x: 'X',

  /* 7 */
  onb_tried_q: 'Have you tried other price-checking apps?',
  onb_tried_yes: 'Yes',
  onb_tried_no: 'No',

  /* 8, a figure step: shown only with a measured savings trend */
  onb_trend_title: 'Designed to maximize your savings',
  onb_trend_without: 'Overpaying without PEXI',
  onb_trend_with: 'Consistently saving with PEXI',
  onb_trend_months: 'Over 6 months',

  /* 9 and 10 */
  onb_mode_q: 'What minimum discount threshold makes an item a ‘Good Deal’ for you?',
  onb_mode_percent: 'Percentage (%)',
  onb_mode_amount: 'Dollar Amount ($)',
  onb_threshold_q: 'What counts as a deal for you?',
  onb_threshold_label: 'Deal threshold',
  onb_threshold_pct: (f) => `${f.n}% OFF`,
  onb_threshold_amt: (f) => `$${f.n} OFF`,
  onb_recommended: '(Recommended)',

  /* 11 and 12 */
  onb_loyalty_q: 'Do you currently use store loyalty programs or coupon apps?',
  onb_loyalty_yes: 'Yes',
  onb_loyalty_no: 'No',
  onb_goal_q: 'What is your primary goal with PEXI?',
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
  onb_compare_without: 'Without PEXI',
  onb_compare_without_sub: 'Guessing shelf prices',
  onb_compare_with: 'With PEXI',
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
  onb_thanks_title: 'Thank you for trusting us',
  onb_thanks_sub: 'Now let’s set Pexi up for you.',

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
  /* D32, 2026-10-06: this step promised a free trial of "PEXI Pro". There is no
     trial and no product called Pro: the plan is Pexi Plus, with the two prices
     from plus-config.js (RULINGS.md "Pexi Plus pricing and free scans"). */
  onb_trial_title: 'Pexi Plus gives you 100 barcode scans a week',
  onb_trial_note: (f) => `${f.monthly} a month or ${f.yearly} a year, and you choose on the next screen.`,
  onb_trial_try: 'See the plans',

  /* 24 */
  onb_perm_title: 'Enable camera & location permissions to scan and compare local deals',
  onb_perm_camera: 'Camera access',
  onb_perm_camera_sub: 'for scanning',
  onb_perm_location: 'Location access',
  onb_perm_location_sub: 'for store prices',
  onb_perm_camera_denied: 'Camera access was not allowed on this device.',
  onb_perm_location_denied: 'Location access was not allowed on this device. Turn it on in Settings to see store prices near you.',
  /* Item 19: a scripted demo scan, so a sample answer can be seen before
     camera permission is granted. Chrome, not Pexi: this screen carries none
     of Pexi's voice (see the file header on screens/onboarding.js), so the
     badge and the fallback line are both plain labels, never a sentence in
     the first person. */
  onb_see_demo: 'See a demo scan',
  onb_demo_badge: 'DEMO',
  onb_demo_unavailable: 'The demo scan is not available yet.',
  onb_demo_loading: 'Fetching the demo scan...',

  /* 25 */
  onb_plans_title: 'Choose a plan for 100 barcode scans a week',
  onb_plans_annual: (f) => `${f.yearly} billed annually`,
  onb_plans_annual_sub: (f) => `(${f.perMonth}/mo)`,
  onb_plans_monthly: (f) => `${f.monthly}/mo`,
  /* The plan step sells nothing: no billing exists, `store.js` never sets
     `proUntil`, and the flow finishes whatever was tapped. Kept rather than
     deleted (Aurik, 2026-09-21) so the shape of the product stays visible, and
     marked so a tester cannot read the prices as real. Same two-part shape as
     the demo scan above: a plain badge, and one plain line. */
  onb_plans_badge: 'NOT LIVE',
  onb_plans_stub: 'These are the real plan prices, but this step charges nothing and unlocks nothing. Subscribe from the Pexi Plus screen.',

  /* 26 to 29 */
  onb_tip_scan_title: 'Get the best scan',
  onb_tip_scan_1: 'Hold still',
  onb_tip_scan_2: 'Use lots of light',
  onb_tip_scan_3: 'Make sure the barcode is visible',
  onb_tip_eval_title: 'PEXI evaluates your item',
  onb_tip_eval_1: 'Barcode identified',
  onb_tip_eval_2: 'Matches local store price',
  onb_tip_eval_3: 'Instant deal verdict calculated',
  onb_tip_fix_title: 'Adjust shelf price or store, if necessary',
  onb_tip_fix_1: 'Check that the product match is accurate',
  onb_tip_fix_2: 'Edit shelf price if needed',
  onb_tip_fix_3: 'Tap ‘Fix Results’ if something’s off',
  onb_tip_accuracy_title: 'For highest accuracy',
  onb_tip_accuracy_1: 'Scan the barcode',
  onb_tip_accuracy_2: 'Or take a photo of the shelf price tag',
  onb_tip_accuracy_2_nophoto: 'Or type the shelf price you see',
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

  onb_welcome_name: 'PEXI',
  onb_welcome_line: 'Sache si c’est un bon prix avant de payer.',
  onb_get_started: 'Commencer',
  onb_gender_q: 'Choisis ton genre',
  onb_gender_why: 'Ça nous aide à comprendre qui magasine avec Pexi.',
  onb_gender_female: 'Femme',
  onb_gender_male: 'Homme',
  onb_gender_other: 'Autre',
  onb_gender_prefer_not: 'Je préfère ne pas le dire',
  onb_frequency_why: 'Pexi apprend à quelle fréquence tu magasines, pour vérifier les prix que tu vois le plus.',
  onb_shops_why: 'On s’en sert pour ajouter les prix de ce que tu achètes.',
  onb_priority_why: 'Ça aide Pexi à te montrer d’abord ce qui compte pour toi.',
  onb_heard_why: 'Ça nous aide à rejoindre d’autres gens comme toi.',
  onb_tried_why: 'Ça nous aide à rendre Pexi meilleure que ce que tu as déjà utilisé.',
  onb_promise: 'Scanne un produit et vois si le prix est bon',

  onb_shops_q: 'Qu’achètes-tu d’habitude ?',
  onb_shops_groceries: 'Épicerie et essentiels du quotidien',
  onb_shops_apparel: 'Vêtements et chaussures',
  onb_shops_electronics: 'Électronique',
  onb_shops_health: 'Santé',
  onb_shops_beauty: 'Beauté',

  onb_frequency_q: 'À quelle fréquence fais-tu l’épicerie ?',
  onb_frequency_occasional: 'Une fois par semaine ou moins',
  onb_frequency_occasional_sub: 'Acheteur occasionnel',
  onb_frequency_regular: '2 à 3 fois par semaine',
  onb_frequency_regular_sub: 'Acheteur régulier',
  onb_frequency_frequent: '4 fois ou plus par semaine',
  onb_frequency_frequent_sub: 'Acheteur fréquent',

  onb_priority_q: 'Qu’est-ce qui compte le plus quand tu magasines ?',
  onb_priority_lowest: 'Trouver le prix le plus bas',
  onb_priority_clearance: 'Repérer les liquidations',
  onb_priority_balance: 'Équilibre valeur et qualité',
  onb_priority_quick: 'Entrer et sortir vite',

  onb_heard_q: 'Où as-tu entendu parler de nous ?',
  onb_heard_appstore: 'App Store',
  onb_heard_tv: 'Télé',
  onb_heard_google: 'Google',
  onb_heard_tiktok: 'TikTok',
  onb_heard_instagram: 'Instagram',
  onb_heard_friend: 'Ami ou famille',
  onb_heard_facebook: 'Facebook',
  onb_heard_x: 'X',

  onb_tried_q: 'As-tu déjà essayé d’autres applis pour vérifier les prix ?',
  onb_tried_yes: 'Oui',
  onb_tried_no: 'Non',

  onb_trend_title: 'Conçu pour maximiser tes économies',
  onb_trend_without: 'Tu paies trop sans PEXI',
  onb_trend_with: 'Tu économises régulièrement avec PEXI',
  onb_trend_months: 'Sur 6 mois',

  onb_mode_q: 'Quel rabais minimum fait d’un article une « bonne affaire » pour toi ?',
  onb_mode_percent: 'Pourcentage (%)',
  onb_mode_amount: 'Montant en dollars ($)',
  onb_threshold_q: 'C’est quoi, une aubaine, pour toi ?',
  onb_threshold_label: 'Seuil de rabais',
  onb_threshold_pct: (f) => `${f.n} % DE RABAIS`,
  onb_threshold_amt: (f) => `${f.n} $ DE RABAIS`,
  onb_recommended: '(Recommandé)',

  onb_loyalty_q: 'Utilises-tu des programmes de fidélité ou des applis de coupons ?',
  onb_loyalty_yes: 'Oui',
  onb_loyalty_no: 'Non',
  onb_goal_q: 'Quel est ton objectif principal avec PEXI ?',
  onb_goal_groceries: 'Économiser sur l’épicerie',
  onb_goal_checkout: 'Éviter de trop payer à la caisse',
  onb_goal_history: 'Suivre l’historique des prix',

  onb_monthly_q: 'Quel est ton objectif d’économies par mois ?',
  onb_monthly_amt: (f) => `${f.n},00 $ / mois`,
  onb_monthly_less: 'Moins',
  onb_monthly_more: 'Plus',
  onb_monthly_realistic: 'Objectif réaliste et atteignable',

  onb_alerts_q: 'À quel point veux-tu que tes alertes de rabais soient agressives ?',
  onb_alerts_conservative: 'Prudentes',
  onb_alerts_conservative_sub: 'Rabais de 30 % et plus',
  onb_alerts_recommended: 'Recommandées',
  onb_alerts_recommended_sub: 'Rabais de 20 % et plus',
  onb_alerts_aggressive: 'Agressives',
  onb_alerts_aggressive_sub: 'Rabais de 10 % et plus',

  onb_compare_title: 'Une façon plus futée de magasiner',
  onb_compare_without: 'Sans PEXI',
  onb_compare_without_sub: 'Deviner les prix en tablette',
  onb_compare_with: 'Avec PEXI',
  onb_compare_with_sub: 'Scan instantané du code-barres et un verdict sur le prix',

  onb_frustration_q: 'Quelle est ta plus grande frustration en magasinant ?',
  onb_frustration_fake: 'Les faux rabais ou les rabais trompeurs',
  onb_frustration_history: 'L’absence d’historique des prix',
  onb_frustration_units: 'Les prix unitaires qui embrouillent',
  onb_frustration_clearance: 'Rater les liquidations',
  onb_frustration_impulse: 'Trop dépenser sur un coup de tête',

  onb_potential_title: 'Tu as un grand potentiel pour réduire tes factures',
  onb_potential_days: (f) => `${f.n} jours`,
  onb_potential_saved: (f) => `${f.n} $ économisés`,

  onb_thanks_title: 'Merci de nous faire confiance',
  onb_thanks_sub: 'Maintenant, préparons Pexi pour toi.',

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

  onb_trial_title: 'Pexi Plus donne 100 scans de codes-barres par semaine',
  onb_trial_note: (f) => `${f.monthly} par mois ou ${f.yearly} par année, et tu choisis à l’écran suivant.`,
  onb_trial_try: 'Voir les forfaits',

  onb_perm_title: 'Active la caméra et la localisation pour scanner et comparer les rabais près de toi',
  onb_perm_camera: 'Accès à la caméra',
  onb_perm_camera_sub: 'pour scanner',
  onb_perm_location: 'Accès à la localisation',
  onb_perm_location_sub: 'pour les prix en magasin',
  onb_perm_camera_denied: 'L’accès à la caméra n’a pas été autorisé sur cet appareil.',
  onb_perm_location_denied: 'L’accès à la localisation n’a pas été autorisé sur cet appareil. Active-la dans les Réglages pour voir les prix des magasins près de toi.',
  onb_see_demo: 'Voir un exemple de scan',
  onb_demo_badge: 'DÉMO',
  onb_demo_unavailable: 'L’exemple de scan n’est pas encore disponible.',
  onb_demo_loading: 'Chargement de l’exemple de scan...',

  onb_plans_title: 'Choisis un forfait pour 100 scans de codes-barres par semaine',
  onb_plans_annual: (f) => `${f.yearly} facturés par année`,
  onb_plans_annual_sub: (f) => `(${f.perMonth}/mois)`,
  onb_plans_monthly: (f) => `${f.monthly}/mois`,
  onb_plans_badge: 'PAS ACTIF',
  onb_plans_stub: 'Ce sont les vrais prix des forfaits, mais cette étape ne facture rien et ne débloque rien. Abonne-toi depuis l’écran Pexi Plus.',

  onb_tip_scan_title: 'Pour le meilleur scan',
  onb_tip_scan_1: 'Ne bouge pas',
  onb_tip_scan_2: 'Utilise beaucoup de lumière',
  onb_tip_scan_3: 'Assure-toi que le code-barres est visible',
  onb_tip_eval_title: 'PEXI évalue ton article',
  onb_tip_eval_1: 'Code-barres repéré',
  onb_tip_eval_2: 'Correspond au prix du magasin local',
  onb_tip_eval_3: 'Verdict instantané calculé',
  onb_tip_fix_title: 'Ajuste le prix en tablette ou le magasin au besoin',
  onb_tip_fix_1: 'Vérifie que le produit correspond bien',
  onb_tip_fix_2: 'Modifie le prix en tablette au besoin',
  onb_tip_fix_3: 'Touche « Corriger les résultats » si quelque chose cloche',
  onb_tip_accuracy_title: 'Pour la meilleure précision',
  onb_tip_accuracy_1: 'Scanne le code-barres',
  onb_tip_accuracy_2: 'Ou prends une photo de l’étiquette de prix',
  onb_tip_accuracy_2_nophoto: 'Ou tape le prix en tablette que tu vois',
  onb_tip_accuracy_3: 'Ou cherche dans la base de produits',

  onb_eval_title: 'Évaluation de l’aubaine...',
  onb_eval_status: 'Comparaison des prix chez les détaillants locaux...',
};
