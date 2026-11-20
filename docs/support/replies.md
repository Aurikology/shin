# Pexi support replies

Canned replies for useshinapp@gmail.com. Facts come from docs/store/terms.html, docs/store/index.html, docs/store/privacy.html and the app's own strings. Pexi has no accounts, so ask for nothing the shopper cannot give (never an Apple ID password or card number).

## Annuler mon abonnement

Bonjour [prénom],

Merci de nous avoir écrit. Pour annuler Pexi Plus, il faut passer par votre compte Apple, car c'est Apple qui gère l'abonnement.

Sur votre iPhone, ouvrez Réglages, touchez votre nom, puis Abonnements, choisissez Pexi et touchez Annuler l'abonnement. Vous pouvez aussi ouvrir l'écran Toi dans Pexi et toucher « Gérer ou annuler l'abonnement ».

Pour éviter un nouveau renouvellement, l'annulation doit se faire au moins 24 heures avant la fin de la période en cours. Supprimer l'application n'annule pas l'abonnement.

Pour toute autre question, nous restons à votre disposition.

L'équipe Pexi

## Remboursement

Bonjour [prénom],

Merci de votre message. Pexi Plus est vendu par l'App Store d'Apple, et Pexi ne reçoit ni votre carte ni les détails de votre compte Apple. Pexi ne peut donc pas rembourser un achat fait dans l'App Store.

Les remboursements se demandent directement à Apple : rendez-vous sur reportaproblem.apple.com, ouvrez une session, choisissez « Demander un remboursement » et sélectionnez le prélèvement Pexi Plus. C'est Apple qui décide de la demande.

Si Pexi Plus ne fonctionne pas comme prévu, écrivez-nous en nous donnant le numéro de commande qui figure sur votre reçu Apple, et nous vérifierons de notre côté.

L'équipe Pexi

## Supprimer mes données

Bonjour [prénom],

Merci de votre message. Pexi ne demande ni nom, ni courriel, ni compte : vos données sont liées à un identifiant aléatoire de votre appareil.

Pour demander leur suppression, ouvrez l'écran Toi dans Pexi et touchez « Supprimer mes données ». Un courriel est préparé pour nous, avec l'identifiant de votre appareil, afin que nous retrouvions les bons renseignements. Envoyez-le tel quel. Vous pouvez aussi nous écrire vous-même, mais l'identifiant nous aide beaucoup.

La suppression se fait à la main. Supprimer l'application ne supprime pas ce que le serveur détient, et cela n'annule pas votre abonnement : pour l'annuler, passez par les Réglages d'Apple.

L'équipe Pexi

## Mauvais prix

Bonjour [prénom],

Merci beaucoup de nous avoir signalé ce prix, c'est très utile pour nous.

Pour que nous puissions vérifier, pourriez-vous nous indiquer :
- le magasin (nom et succursale ou ville);
- le produit (nom, format et marque);
- le prix que vous avez vu, et celui que Pexi affichait;
- si possible, une photo de l'étiquette sur la tablette.

Dans l'application, vous pouvez aussi indiquer qu'un verdict était erroné en répondant à la question sur le verdict. Les prix changent souvent et nos données ne couvrent pas tout.

L'équipe Pexi

## Mon magasin n'est pas offert

Bonjour [prénom],

Merci de nous avoir écrit. Pexi ne couvre pas encore tous les produits ni tous les magasins, et nous ne pouvons pas vous promettre une date pour le vôtre.

Les prix que les utilisateurs saisissent peuvent servir aux autres. Si vous scannez des produits de ce magasin et saisissez le prix vu sur la tablette, vous nous aidez à l'améliorer.

Dites-nous le nom du magasin et sa ville, nous en tenons compte. Merci de votre patience, et n'hésitez pas à nous écrire pour toute question.

L'équipe Pexi

## Restore: my Plus is gone / I bought on another phone

### (a) Reply to the shopper

Subject: Getting Pexi Plus back on your phone

Hi [first name],

Thanks for writing, and sorry for the trouble. Pexi Plus is tied to the Apple ID that bought it, so it can come back on a new phone, a reinstall or another device.

1. On the phone where you want Plus, make sure it is signed in to the same Apple ID that bought the subscription (Settings, your name).
2. Open Pexi, go to the You screen, tap Pexi Plus, then tap "Restore purchases". This is the action Apple calls Restore Purchases.
3. If it works, the Pexi Plus screen shows you as subscribed. If you see "No Pexi Plus subscription was found for this store account", that Apple ID did not buy Plus, so check which Apple ID you used.

One thing to know: Plus is expected to be active on one phone at a time. If you restore on a new phone, the older phone may stop showing Plus, and you can restore there again if you go back to it.

If it still does not work, reply with the order ID (also called the order number) from your Apple receipt email, or from reportaproblem.apple.com under your purchases. We will look it up. Please do not send your Apple ID password or card details.

The Pexi team

### (b) Internal lookup steps

1. Ask for the Apple order ID / order number from Apple's receipt email, or from reportaproblem.apple.com. Pexi has no account, name or email on file, so the order ID is the only way to find a shopper. Also ask which Apple ID bought it and which phone is affected.
2. Open the RevenueCat dashboard, project Pexi, Customers, and search by the transaction / order ID. If the shopper can give it, also search by the device identifier, which Pexi uses as RevenueCat's app user ID (the Delete my data email shows it). Expect more than one customer ID if the shopper moved phones.
3. On the customer, check the entitlement `plus` (offering `default`, products `pexi_plus_monthly`, `pexi_plus_yearly`): is it active, which app user ID holds it, and when does it expire.
4. Check the project's restore behaviour: RevenueCat project settings, "Restore behavior" (transfer behaviour), which decides whether a restore under a new app user ID moves the entitlement from the old one. I could not read this dashboard setting from the repo; someone with dashboard access must read it. docs/readiness/register.jsonl R21 says the second-device behaviour has never been tested.
5. If the entitlement is active on another app user ID, ask the shopper to tap Restore Purchases on the phone they want to use (same Apple ID). If the setting does not transfer, the entitlement stays on the old ID: report that to Aurik and Jamin as a bug, do not patch it by hand. If the entitlement is expired or missing, the purchase was cancelled, refunded or made on a different Apple ID.
6. If no purchase exists for that order ID, point the shopper to Apple (reportaproblem.apple.com). Pexi cannot issue refunds or see Apple payments.

<!--
Notes for Aurik (facts checked 2026-11-19):

Facts each reply rests on
- Restore button: app/public/js/ui-strings.js:80 "Restore purchases" (EN), :877 "Restaurer les achats" (FR). Paywall wiring app/public/js/screens/paywall.js:210, 427-440. "No Pexi Plus subscription was found for this store account": ui-strings.js:95.
- Restore steps: docs/store/terms.html:65 (Restore Purchases, same Apple ID); docs/store/index.html:41 (You screen, Pexi Plus, Restore Purchases).
- Manage row: ui-strings.js:116 and :912 (FR); screens/you.js:383-388; URL plus-config.js:90-93.
- Cancel, 24 hours, deleting app does not cancel: terms.html:63-64, terms-fr.html:63-64.
- Refunds via Apple: docs/store/index.html:42.
- Delete data: privacy.html:97 (You screen, Delete my data, prepares an email with the device identifier, deletion by hand), privacy.html:91 (app deletion does not delete server data); ui-strings.js:787-791 and :1453-1457; support email useshinapp@gmail.com.
- Wrong price: privacy.html:49 and :98 (in-app answer to the verdict question).
- Store not covered: docs/store/listing.md:39 ("Coverage is limited"). No doc names the chains or regions Pexi knows well, so the reply names none.
- RevenueCat app user ID = device id: docs/store/listing.md:84.

Doc and app disagreements
1. terms.html:65 says open the Pexi Plus screen and tap Restore Purchases; index.html:41 says You screen, Pexi Plus, Restore Purchases; the app button reads "Restore purchases" (FR "Restaurer les achats"). The reply uses the app label plus Apple's generic term.
2. The Manage row is hidden unless the platform is ios or android (you.js:63-65, 383), so a browser or PWA has no row. The cancel reply gives the full-screen route through Apple Settings as well.
3. plus-config.js:38-42 says there is one English copy of Terms and Privacy and the French twins were removed 2026-11-05, but docs/store/terms-fr.html and privacy-fr.html exist and legalUrl() builds the -fr URL. The comment is stale or the French pages are not deployed.
4. The refund route (index.html:42) is not in terms.html; the Terms do not mention refunds.
5. The "one phone at a time" paragraph in the restore reply is my reading of RevenueCat transfer behaviour with the device id as app user id. No doc or test confirms it (R21: second-device test never run). Remove it if the test shows otherwise.

Could not verify
- The RevenueCat dashboard "Restore behavior" setting (no access).
- That the Delete my data email opens on a phone. privacy.html promises no deletion deadline, so none is stated.
- Whether Quebec consumer law needs more in the French refund or cancel wording (success-11 lists F3 as open).
- The French is my own Quebec French and needs a native read.
-->
