/**
 * "Terms, Privacy and Data": the one document that holds everything about using Pexi that is not the app
 * itself. Jamin, 2026-11-25: "Let's have every single thing in one place. Everything that is not part of
 * the functionality of the app will come in one long document at the beginning of the app, only appearing
 * once, where the user clicks accept term and agreements to continue into the app. The user will then not
 * have the option to turn off send data to Claude or other things like that."
 *
 * It merges what were the Terms of Use, the Privacy Policy, the "Your data" consent screen, the agree
 * screen's lines and the "Data and licences" screen. ONE SOURCE, THREE READERS:
 *   - screens/agree.js shows it on first launch with "Accept and continue", and read-only from Settings;
 *   - scripts/build-legal-pages.mjs writes docs/store/terms*.html and privacy*.html from `legalPageHtml`
 *     (the App Store terms and privacy URLs keep resolving; both carry this whole document);
 *   - test/legal-document.test.mjs fails when a hosted page differs from what this file renders.
 * Edit the words here, run `node scripts/build-legal-pages.mjs` from app/, commit both.
 *
 * Pure strings, no DOM: the renderer escapes every piece of text itself, so the hosted-page script can
 * import this under Node. The data credits come from legal/sources.js, the list /api/attribution sends.
 *
 * If FLAGS.photoId is ever shipped on, the Photos lines below stop being true and must change first.
 */
import { SHOPPER_SOURCES } from './sources.js';

/** The date printed at the top. Change it whenever the words change. */
export const LEGAL_EFFECTIVE = '2026-11-26';

export const CONTACT_EMAIL = 'usepexiapp@gmail.com';

/*
 * Block shapes: a string is a paragraph; { lead, text } is a paragraph opening with a bold label;
 * { ul: [...] } is a list whose items are strings or { lead, text }; { sources: true } is the data credits.
 */

const EN = {
  lang: 'en',
  title: 'Terms, Privacy and Data',
  effective: `Effective ${LEGAL_EFFECTIVE}. This covers version 1.0 of the Pexi app for iPhone and Android and the server it talks to.`,
  intro: [
    'Everything about using Pexi, in one place: the Terms of Use, the Privacy Policy, what Pexi records, where its prices come from and how Pexi Plus works.',
    'Tapping Accept and continue, or using Pexi, means you agree to all of it. If you do not agree, do not use Pexi.',
    'Accepting also covers sending the words you type to Claude, to estimate prices. One more choice is yours: Help improve Pexi, which is on unless you untick it on the first screen. You can switch either one off at any time in Settings.',
  ],
  accept: 'Accept and continue',
  sourcesOpen: 'Open',
  sections: [
    {
      id: 'about',
      h: 'Who we are and what Pexi is',
      blocks: [
        'Pexi is published by Jamin Xu, an individual developer. Pexi lets you scan a barcode or type a product name and shows whether the price of the item is great, good, reasonable or bad compared with prices Pexi holds or estimates.',
        `Jamin Xu is the person in charge of the protection of personal information for Pexi, including for the purposes of Quebec's privacy law. Questions, access requests and deletion requests go to him at ${CONTACT_EMAIL}.`,
      ],
    },
    {
      id: 'short',
      h: 'The short version',
      blocks: [
        {
          ul: [
            'Pexi has no account, no sign-in, and does not ask for your name, email address, phone number or payment details.',
            "Your phone makes a random identifier for itself the first time you open Pexi. Pexi's server uses it to recognise the same phone on later requests. It is not your name, but everything Pexi records is tied to it.",
            'Pexi records what you scan or type and what it answered, so it can answer you. Unless you untick Help improve Pexi, it also records how you use the app and uses that to make Pexi better. You can switch it off at any time in Settings.',
            'When your phone lets Pexi use location, Pexi sends only a rough area about one kilometre wide, never your exact position.',
            'This version of Pexi does not upload photos or camera images.',
            "When Pexi has no price for a product, the product's name, brand, size, category and country go to Anthropic's Claude AI to estimate a typical price. This is part of how Pexi answers. Words you type yourself go to Claude too, as part of accepting, and you can switch that off at any time in Settings. With it off, Pexi still answers from its own data.",
            'Pexi deletes what it records on a stated schedule. See "How long Pexi keeps it" below.',
            'If you subscribe to Pexi Plus, Apple (on iPhone) or Google Play (on Android) processes the payment and RevenueCat, a subscription service, records the purchase against the same random identifier. Pexi never sees your card, Apple ID or Google account details.',
            "Pexi does not show ads, does not use advertising or analytics companies (RevenueCat is used only to manage subscriptions), and does not track you across other companies' apps or websites.",
          ],
        },
      ],
    },
    {
      id: 'who',
      h: 'Who can use Pexi',
      blocks: [
        "Pexi is for people of all ages, and one rule applies to everyone. If you are under the age of majority where you live, use Pexi with the permission of a parent or guardian, who accepts this document on your behalf. A purchase of Pexi Plus is made through the Apple ID or Google account on the device, under Apple's or Google's own rules for family members and purchases.",
        `Pexi asks no one for a name, email address, birth date or account, and it collects the same information described here from every user, whatever their age. If you are under 14, a parent or guardian makes the choices in this document for you: accepting it, which includes your typed words going to Claude, allowing location, leaving Help improve Pexi ticked or unticking it, and sharing a price you typed. They can switch off typed words to Claude and Help improve Pexi at any time in Settings. A parent or guardian who wants a child's information deleted can email ${CONTACT_EMAIL}, and the records tied to that device will be deleted.`,
      ],
    },
    {
      id: 'prices',
      h: 'Prices and estimates are information only',
      blocks: [
        "Everything Pexi shows about a price is informational. A verdict, a price range or a comparison is Pexi's estimate, and is labelled that way. Pexi does not guarantee that any price, range, verdict, product name or store detail is accurate, complete or current. Prices change, stores differ by location and date, and Pexi does not check every store. Always rely on the price displayed by the store, and on your receipt, when you decide whether to buy. Pexi is a decision aid, not advice, and nothing it shows is an offer, a quote or a promise that a store will honour a price.",
      ],
    },
    {
      id: 'ai',
      h: 'AI price estimates',
      blocks: [
        "When Pexi has no price of its own for a product, it shows a typical price range generated by Anthropic's Claude AI model, labelled as estimated by AI. AI-generated content can be wrong, out of date, or based on a guess about what a product is. Treat all AI-generated content as unverified.",
        "To make the estimate, Pexi's server sends Anthropic the product's name, brand, size, category and country. Anthropic does not receive images, your device identifier or your location. Pexi saves the estimate with the product details it was asked about. Sending these product details to Claude is part of using Pexi.",
        "Words you type are different, because they can be anything you write. If you typed a name and Pexi did not recognise it, those typed words would be the name Claude receives. Accepting this document includes that, and the line above the Accept button says so. You can switch it off at any time in Settings: Pexi then still replies to your search from its own data, just without the AI estimate. Pexi's server keeps your answer with the time you gave it and follows it.",
      ],
    },
    {
      id: 'records',
      h: 'What Pexi records',
      blocks: [
        { lead: 'A random device identifier.', text: "Your phone generates it and keeps it on the phone, in the phone's secure storage (the Keychain on iPhone, Android's encrypted storage on Android) and in the app's own storage, together with a second random secret that proves later requests come from the same phone. Both are sent to Pexi's server with the requests the app makes. On iPhone the Keychain can outlast the app, so reinstalling Pexi on the same phone keeps the same identifier and your scan count. On Android, deleting the app normally removes the identifier, so a reinstall usually starts with a new one." },
        { lead: 'What you scan or type.', text: "When you scan a barcode, Pexi sends the barcode digits. When you type a product name, Pexi sends the text you typed to its own server (and on to Claude unless you switched that off in Settings, as described under \"AI price estimates\"). While the camera is open, Pexi's app reads text that is visible in the camera view using text recognition that runs on your phone, and sends the recognised lines of text (not the image) to Pexi's server to find matching products. These are stored with the answer Pexi gave, whether Pexi answered or could not, any correction you made, and the time." },
        { lead: 'Prices, stores and ratings you enter.', text: 'If you type the price you saw on a shelf, choose a store, tell Pexi a verdict was wrong, or rate a verdict, that is stored with the scan. When you type a price or pick a product, Pexi also stores a scrambled one-way code of your network (never your IP address) to keep fake prices out, and removes it together with your device identifier.' },
        { lead: 'How you use the app, while Help improve Pexi is on.', text: 'Help improve Pexi is on unless you untick it on the first screen, and you can switch it off at any time in Settings. While it is on, Pexi records when the app is opened, which screens you visit, buttons you tap, errors the app hits, and text you send, such as a search. While it is off, Pexi\'s server stores none of that and keeps only what it needs to answer you. If the app itself crashes, it may still send the error report, which carries no device identifier. Text you delete or leave unsent is not recorded; Pexi records only that a search was left unfinished.' },
        { lead: 'Your acceptance and your choices.', text: 'Pexi records that you accepted this document, which version, and when. It also records your choice on Help improve Pexi and on typed words to Claude when you accept and each time you change either one, with the time. Both are stored on Pexi\'s server, which follows them.' },
        { lead: 'Technical details of each request.', text: "The app version, the platform, how long an answer took, and your language and market setting. Pexi's server also logs, for every request, the time, the web address requested, the response status, your IP address, the country the request came from, and your phone's user agent text." },
        { lead: 'Purchase history, only if you subscribe.', text: "Pexi Plus is sold through Apple's in-app purchase system on iPhone and Google Play Billing on Android. The purchase is made with Apple or Google, and RevenueCat records which plan you bought, when it renews and whether it is active, under your random device identifier as the app user identifier. The app checks your subscription with RevenueCat each time it opens, and Pexi's server asks RevenueCat whether Pexi Plus is active for your device identifier, so the weekly scan limit can be lifted. Tapping Restore Purchases contacts RevenueCat and Apple or Google." },
        { lead: 'Rough location, when your phone allows it.', text: "Pexi uses location only as far as your phone's own location permission for Pexi allows, which you set in the phone's prompt or its settings. Your phone works out your position and rounds it on the phone to a grid square about one kilometre wide. Only the grid square is sent. Pexi's server stores the grid square, not your exact position, and discards any exact coordinates a request might carry. Pexi uses the grid square to suggest nearby shops, and the shop you pick is stored with the scan." },
        { lead: 'Photos.', text: 'The camera is used on your phone to read barcodes and text. This version of Pexi does not upload photos or camera images.' },
        'Pexi does not collect your name, email address, phone number, contacts, payment information, exact location or advertising identifiers.',
      ],
    },
    {
      id: 'why',
      h: 'Why Pexi uses it',
      blocks: [
        {
          ul: [
            'To answer your scan and to look up nearby shops.',
            'To work out whether a price is good, using prices Pexi holds, including prices that people have entered. Prices you enter can be used in answers shown to other shoppers.',
            "To improve Pexi's own price data and answers, using the prices, scans and corrections collected while answering shoppers, including to tune Pexi's own price estimates. How you use the app goes into this only while Help improve Pexi is on.",
            'To find and fix problems, using the errors and server logs described above, and the usage events while Help improve Pexi is on.',
          ],
        },
      ],
    },
    {
      id: 'sharing',
      h: 'Who else receives data',
      blocks: [
        "Pexi's server sends limited information to these outside services to answer a scan. Open Food Facts, Anthropic and OpenStreetMap's Overpass service do not receive your device identifier. Cloudflare, which carries your requests, and RevenueCat, described below, do. The only one that receives anything about where you are is the shop-finding service, and only when your phone allows location.",
        {
          ul: [
            { lead: 'Open Food Facts', text: "(world.openfoodfacts.org) receives a barcode number when Pexi's own catalogue does not know the product, to look up the product's name, brand and size." },
            { lead: 'Anthropic', text: '(the maker of the Claude AI model) receives a product\'s name, brand, size, category and country when Pexi has no price for it, and the words you typed unless you switched that off in Settings, as described under "AI price estimates". It does not receive your device identifier, your location or any image.' },
            { lead: "OpenStreetMap's Overpass service", text: 'receives the centre point of your rough grid square, only when your phone allows location, to find shops nearby.' },
            { lead: 'Cloudflare', text: "carries traffic between the app and Pexi's server, so it handles your requests in transit, including the device identifier they carry. Cloudflare also stores an encrypted backup copy of the server, which it cannot read." },
            { lead: 'Apple', text: 'provides the App Store, handles downloads, and processes Pexi Plus payments on iPhone, so it receives your purchase and the account details it already holds, under Apple\'s own privacy policy. Pexi sends Apple nothing from your scans, and receives no card or Apple ID details from Apple.' },
            { lead: 'Google', text: 'provides Google Play, handles downloads, and processes Pexi Plus payments on Android, so it receives your purchase and the account details it already holds, under Google\'s own privacy policy. Pexi sends Google nothing from your scans, and receives no card or Google account details from Google.' },
          ],
        },
        "RevenueCat (revenuecat.com) is different from the list above: the app contacts it each time it opens, and Pexi's server contacts it to check whether Pexi Plus is active. It receives your random device identifier as the app user identifier, together with the purchase information from Apple or Google described under purchase history (your plan, when it renews and whether it is active), and, as with any request over the internet, your IP address.",
        'Pexi does not sell your data and does not share it with advertisers or data brokers.',
        { lead: 'Same protection from every service.', text: "Pexi shares user data only with the services named here, and each of them provides the same or equal protection of that data as this document states and as Apple's App Store Review Guidelines and Google Play's policies require." },
        { lead: 'Outside your province and outside Canada.', text: "Pexi's server and most of these services are outside Quebec, and some, including Anthropic, RevenueCat, Cloudflare, Apple and Google, may store or process data outside Canada, including in the United States and the European Union, where privacy law differs from Canada's. Courts, law enforcement and government authorities in those places may be able to get access to data held there under their own laws. Pexi limits what each one receives to what is listed above." },
      ],
    },
    {
      id: 'keep',
      h: 'How long Pexi keeps it',
      blocks: [
        {
          ul: [
            { lead: 'Server request logs:', text: '90 days, then deleted.' },
            { lead: 'Usage events (only while Help improve Pexi is on):', text: '12 months, then deleted.' },
            { lead: 'Scans, ratings and prices you entered:', text: 'after 24 months your device identifier is removed from them. What remains is a product, a price or an answer, and any words you typed as a search, that is no longer tied to your phone, and Pexi keeps it to answer other shoppers.' },
            { lead: 'Your saved choices, your device secret and your subscription record:', text: 'deleted once your phone has been unused for 24 months, and sooner if you ask.' },
            { lead: 'Safety copies made when Pexi deletes something by hand:', text: 'at most 30 days.' },
          ],
        },
        'Backups of the server can hold a copy for longer until they are replaced. You can ask for deletion sooner, as described below. Deleting the app does not delete what the server already holds, and on an iPhone the identifier stays in the Keychain, so a reinstall brings it back. On Android, a reinstall usually starts with a new identifier, and the records tied to the old one stay on the server until they are deleted on the schedule above. To have the records tied to your device deleted, use Delete my data in Settings.',
      ],
    },
    {
      id: 'rights',
      h: 'Your rights, and how Pexi handles requests',
      blocks: [
        {
          ul: [
            `You can ask to see, or delete, the records tied to your device. Open Settings and tap Delete my data, which prepares an email to ${CONTACT_EMAIL} that includes your device identifier so the right records can be found, or write to that address yourself. Deletion is done by hand.`,
            'If you think a price or verdict is wrong, you can say so in the app by answering the question about whether the verdict was right.',
            'You can withdraw Help improve Pexi, or your yes to sending typed words to Claude, at any time in Settings. The app tells Pexi\'s server each time you change them, and the server follows your latest answer.',
          ],
        },
        'These are the steps Pexi follows, in plain words. Jamin Xu, named above, is responsible for them.',
        {
          ul: [
            { lead: 'Requests to see or delete your data.', text: 'Use Delete my data in Settings, or email the address above. Because Pexi holds no name or account, it finds your records by your device identifier, and it checks that the request comes from the person holding that phone before it shows or deletes anything. Pexi answers in writing within 30 days. A deletion removes the records tied to your device from Pexi\'s server, and the purchase record at RevenueCat if you subscribed. Server backups drop the copy within about 15 days. If you keep using the app on that phone, new records start again under the same identifier.' },
            { lead: 'Complaints.', text: "Write to the address above. Pexi reads each complaint and answers in writing. You can also complain to the Commission d'accès à l'information du Québec (cai.gouv.qc.ca) or to the Office of the Privacy Commissioner of Canada (priv.gc.ca)." },
            { lead: 'Incidents.', text: "If personal information is ever lost, or seen or used by someone who should not have it, Pexi acts at once to stop it and writes the incident in a register, whether or not anyone was harmed. If an incident creates a risk of serious harm, Pexi tells the Commission d'accès à l'information du Québec and the Privacy Commissioner of Canada promptly, and tells the people affected through a notice at the top of this document and in the app, because Pexi holds no email address or phone number for its users." },
          ],
        },
      ],
    },
    {
      id: 'contrib',
      h: 'Prices and information you provide',
      blocks: [
        "If you type a price, choose a store, correct a verdict or rate an answer, you confirm that what you provide is true to the best of your knowledge. You allow Pexi to store it and to use it, together with other shoppers' contributions, to improve Pexi's price data and to answer other shoppers, as described in this document. To make that possible, you grant Pexi a non-exclusive, worldwide, royalty-free, perpetual and irrevocable licence to store, copy, adapt, combine with other data, publish and share what you provide, including under the open data licences described under \"Data sources and licences\". This licence covers the prices, store choices, corrections and ratings you submit, never your device identifier or location. Do not submit anything unlawful, misleading or that you have no right to share. What is not allowed is listed under \"Acceptable use\".",
      ],
    },
    {
      id: 'sources',
      h: 'Data sources and licences',
      blocks: [
        'Product details, prices and store names in Pexi include open data collected and published by other people. Each source below sets its own terms for reuse, and this is the credit those terms ask for.',
        `Data from Open Food Facts, Open Beauty Facts, Open Pet Food Facts, Open Products Facts, Open Prices and OpenStreetMap is made available under the Open Database License (ODbL). Where Pexi combines that data with other data, the resulting database, or a file of the changes, is available under the ODbL on request to ${CONTACT_EMAIL}.`,
        'Some product information is from Open Icecat: Database Right data-sheet 2026 Icecat. All rights reserved. It is provided as is, without warranty of any kind.',
        'Contains information from Open Food Facts contributors, made available under the Open Database License (ODbL), with the individual contents under the Database Contents License. You can get the complete, current Open Food Facts database, and the other Open Food Facts projects\' databases, at world.openfoodfacts.org/data, and OpenStreetMap data at openstreetmap.org/copyright.',
        'Adapted from Statistics Canada, Table 18-10-0245-01 Monthly average retail prices for selected products, data to September 2026, retrieved November 8, 2026. This does not constitute an endorsement by Statistics Canada of this product.',
        'Ingredients, allergens and nutrition details shown in Pexi come from these open databases, which anyone can edit, and may be missing, out of date or wrong. Always read the label on the package, especially if you have an allergy or a dietary need. Pexi does not give medical or dietary advice.',
        { sources: true },
        { lead: 'Software licences.', text: 'The open-source software Pexi is built with, and the licence for each part, are listed on the licences page that comes with Pexi (licences.html).' },
        'Pexi is not affiliated with, endorsed by, or sponsored by any store, brand or data provider named in the app. Prices are what somebody recorded on the day shown beside them, not an offer, and not checked with the shop.',
      ],
    },
    {
      id: 'use',
      h: 'Acceptable use',
      blocks: [
        {
          ul: [
            'Do not use Pexi for anything unlawful.',
            "Do not try to break, overload, probe or reverse engineer Pexi or its server, or to reach another person's data.",
            "Do not use scripts or automated tools to send requests to Pexi's server.",
            'Do not submit false prices, store names or corrections on purpose.',
            'Do not enter anything abusive, hateful, threatening, sexual, or that names or targets a person, in a price, a store name, a search or a correction. Entries must be about a product price at a shop and nothing else.',
          ],
        },
        { lead: 'Reporting a bad entry.', text: `If you see a price, store or other entry from another shopper that is wrong, abusive or should not be there, email ${CONTACT_EMAIL} with what you saw and where. Pexi reads each report and removes entries that break these rules. If a verdict looks wrong, you can also say so from the verdict itself.` },
      ],
    },
    {
      id: 'plus',
      h: 'Pexi Plus subscription',
      blocks: [
        "Pexi is free to download. Pexi Plus is an optional auto-renewing subscription that gives 100 barcode scans a week, where the free allowance is 10 barcode scans a week. Typed searches are free and are not counted. When the weekly allowance is used, scans start coming back as the earliest ones pass seven days. It is sold through Apple's in-app purchase system on iPhone and Google Play Billing on Android, with purchases processed by Apple or Google and by RevenueCat.",
        {
          ul: [
            { lead: 'Plans and prices.', text: 'Pexi Plus Monthly is CA$3.99 a month. Pexi Plus Yearly is CA$29.99 a year. The price, in your currency, and the billing period are shown on the Pexi Plus screen in the app before you buy.' },
            { lead: 'Payment.', text: 'Payment is charged to your Apple ID account (iPhone) or Google Play account (Android) at confirmation of purchase.' },
            { lead: 'Auto-renewal.', text: 'The subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the end of the current period, at the price of the plan you chose.' },
            { lead: 'Managing and cancelling.', text: 'You can manage and cancel your subscription in your Apple ID account settings on your iPhone (Settings, your name, Subscriptions), or on Android in the Google Play app (your profile picture, Payments and subscriptions, Subscriptions). Deleting the app does not cancel it.' },
            { lead: 'Refunds.', text: 'Refunds are handled by the store you bought from: Apple on iPhone, Google Play on Android.' },
            { lead: 'Restoring.', text: 'If you reinstall Pexi or use a new phone with the same Apple ID or Google account, open the Pexi Plus screen and tap Restore Purchases.' },
          ],
        },
      ],
    },
    {
      id: 'security',
      h: 'Security',
      blocks: [
        "The app talks to Pexi's server over an encrypted HTTPS connection. No system is perfectly secure, and Pexi cannot promise that data will never be accessed without permission.",
      ],
    },
    {
      id: 'warranty',
      h: 'No warranty',
      blocks: [
        'Pexi is provided "as is" and "as available", without warranties of any kind, express or implied, to the extent the law allows. Pexi does not promise that the app or its server will be available at all times, uninterrupted or free of errors. The app depends on Pexi\'s server and may stop answering when the server is unavailable.',
      ],
    },
    {
      id: 'liability',
      h: 'Limitation of liability',
      blocks: [
        'To the fullest extent the law where you live allows, Jamin Xu is not liable for any loss arising from your use of Pexi or your reliance on any price, verdict, estimate or other content shown by it, including a purchase made or not made because of it. Nothing in this document limits a liability that the law where you live does not allow to be limited. If you are a consumer in Quebec, this section does not apply to the extent it would free Pexi from the consequences of its own act or that of its representatives.',
      ],
    },
    {
      id: 'changes',
      h: 'Changes and ending access',
      blocks: [
        'Pexi may change, suspend or stop at any time. We may update this document. If a change affects your Pexi Plus subscription, such as its price or what it includes, we will tell you in the app at least 30 days before it takes effect, and you can cancel before then at no cost. If you live in Quebec, a change applies to you only if it concerns your subscription\'s price, its allowance of scans or its features. You will get written notice at least 30 days before the change, showing the new clause and the old one, and you may cancel without cost or penalty up to 30 days after it takes effect. You can stop using Pexi at any time by deleting the app.',
        'If Pexi changes what it collects or who receives it, this document will be updated and the effective date above will change. The version in the app and on Pexi\'s website is the current one.',
      ],
    },
    {
      id: 'law',
      h: 'Governing law',
      blocks: [
        'This document is governed by the laws of the Province of Ontario and the federal laws of Canada that apply there, without regard to conflict of laws rules. This choice of law does not take away the protection that the law of the place where you live gives you as a consumer.',
      ],
    },
    {
      id: 'contact',
      h: 'Contact',
      blocks: [CONTACT_EMAIL],
    },
  ],
};

const FR = {
  lang: 'fr',
  title: 'Conditions, confidentialité et données',
  effective: `En vigueur le ${LEGAL_EFFECTIVE}. Ce document vise la version 1.0 de l’application Pexi pour iPhone et Android et le serveur avec lequel elle communique.`,
  intro: [
    'Tout ce qui touche l’utilisation de Pexi, en un seul endroit : les conditions d’utilisation, la politique de confidentialité, ce que Pexi enregistre, d’où viennent ses prix et le fonctionnement de Pexi Plus.',
    'Toucher Accepter et continuer, ou utiliser Pexi, veut dire que tu acceptes l’ensemble de ce document. Si tu ne l’acceptes pas, n’utilise pas Pexi.',
    'L’acceptation couvre aussi l’envoi à Claude des mots que tu saisis, pour estimer les prix. Un autre choix t’appartient : Aider à améliorer Pexi, activée tant que tu ne la décoches pas sur le premier écran. Tu peux désactiver l’une ou l’autre à tout moment dans Réglages.',
  ],
  accept: 'Accepter et continuer',
  sourcesOpen: 'Ouvrir',
  sections: [
    {
      id: 'about',
      h: 'Qui nous sommes et ce qu’est Pexi',
      blocks: [
        'Pexi est publiée par Jamin Xu, développeur indépendant. Pexi te permet de scanner un code-barres ou de saisir le nom d’un produit et indique si son prix est excellent, bon, raisonnable ou mauvais par rapport aux prix que Pexi détient ou estime.',
        `Jamin Xu est la personne responsable de la protection des renseignements personnels pour Pexi, y compris aux fins de la loi québécoise sur la protection des renseignements personnels. Tu peux lui adresser tes questions et tes demandes d’accès ou de suppression à ${CONTACT_EMAIL}.`,
      ],
    },
    {
      id: 'short',
      h: 'En bref',
      blocks: [
        {
          ul: [
            'Pexi n’a ni compte ni connexion, et ne te demande ni ton nom, ni ton adresse courriel, ni ton numéro de téléphone, ni tes renseignements de paiement.',
            'Ton téléphone crée un identifiant aléatoire la première fois que tu ouvres Pexi. Le serveur de Pexi s’en sert pour reconnaître le même téléphone lors des demandes suivantes. Ce n’est pas ton nom, mais tout ce que Pexi enregistre y est rattaché.',
            'Pexi enregistre ce que tu scannes ou saisis et ce qu’elle a répondu, pour pouvoir te répondre. Tant que tu ne décoches pas Aider à améliorer Pexi, elle enregistre aussi la façon dont tu utilises l’application et s’en sert pour améliorer Pexi. Tu peux la désactiver à tout moment dans Réglages.',
            'Quand ton téléphone permet à Pexi d’utiliser la localisation, Pexi envoie seulement une zone approximative d’environ un kilomètre de large, jamais ta position exacte.',
            'Cette version de Pexi ne téléverse ni photos ni images de la caméra.',
            'Quand Pexi n’a aucun prix pour un produit, le nom, la marque, le format, la catégorie et le pays du produit sont envoyés à Claude, l’IA d’Anthropic, pour estimer un prix typique. Cela fait partie de la façon dont Pexi répond. Les mots que tu saisis toi-même vont aussi à Claude, dans le cadre de l’acceptation, et tu peux le désactiver à tout moment dans Réglages. Désactivé, Pexi répond quand même à partir de ses propres données.',
            'Pexi supprime ce qu’elle enregistre selon un calendrier précis. Consulte « Combien de temps Pexi conserve les données » plus bas.',
            'Si tu t’abonnes à Pexi Plus, Apple (sur iPhone) ou Google Play (sur Android) traite le paiement et RevenueCat, un service d’abonnement, enregistre l’achat sous le même identifiant aléatoire. Pexi ne voit jamais ta carte, ton identifiant Apple ni les détails de ton compte Google.',
            'Pexi n’affiche pas de publicité, ne fait appel à aucune entreprise de publicité ou d’analyse (RevenueCat sert uniquement à gérer les abonnements) et ne te suit pas dans les applications ou sites Web d’autres entreprises.',
          ],
        },
      ],
    },
    {
      id: 'who',
      h: 'Qui peut utiliser Pexi',
      blocks: [
        'Pexi s’adresse aux personnes de tous âges, et une seule règle vaut pour tout le monde. Si tu n’as pas atteint l’âge de la majorité là où tu habites, utilise Pexi avec la permission d’un parent ou d’un tuteur, qui accepte ce document en ton nom. Un achat de Pexi Plus se fait au moyen de l’identifiant Apple ou du compte Google de l’appareil, selon les règles d’Apple ou de Google sur les membres de la famille et les achats.',
        `Pexi ne demande à personne un nom, une adresse courriel, une date de naissance ni un compte, et recueille les mêmes renseignements, décrits ici, auprès de chaque utilisateur, quel que soit son âge. Si tu as moins de 14 ans, un parent ou un tuteur fait à ta place les choix de ce document : accepter ce document, ce qui comprend l’envoi de tes mots saisis à Claude, autoriser la localisation, laisser Aider à améliorer Pexi cochée ou la décocher, et partager un prix que tu as saisi. Il ou elle peut désactiver l’envoi à Claude et Aider à améliorer Pexi à tout moment dans Réglages. Un parent ou un tuteur qui veut faire supprimer les renseignements d’un enfant peut écrire à ${CONTACT_EMAIL}, et les données rattachées à cet appareil seront supprimées.`,
      ],
    },
    {
      id: 'prices',
      h: 'Les prix et les estimations sont fournis à titre d’information seulement',
      blocks: [
        'Tout ce que Pexi indique au sujet d’un prix est fourni à titre d’information. Un verdict, une fourchette de prix ou une comparaison est une estimation de Pexi, et est présenté comme tel. Pexi ne garantit pas que les prix, fourchettes, verdicts, noms de produits ou détails sur les magasins sont exacts, complets ou à jour. Les prix changent, les magasins varient selon le lieu et la date, et Pexi ne vérifie pas tous les magasins. Fie-toi toujours au prix affiché par le magasin et à ton reçu pour décider d’acheter. Pexi est une aide à la décision, et non un conseil; rien de ce qu’elle affiche n’est une offre, une soumission ni une promesse qu’un magasin honorera un prix.',
      ],
    },
    {
      id: 'ai',
      h: 'Estimations de prix par l’IA',
      blocks: [
        'Quand Pexi n’a aucun prix à elle pour un produit, elle affiche une fourchette de prix typique générée par Claude, le modèle d’intelligence artificielle d’Anthropic, indiquée comme estimée par l’IA. Le contenu généré par l’IA peut être erroné, désuet ou fondé sur une supposition quant à la nature du produit. Considère-le toujours comme non vérifié.',
        'Pour faire l’estimation, le serveur de Pexi envoie à Anthropic le nom, la marque, le format, la catégorie et le pays du produit. Anthropic ne reçoit ni images, ni ton identifiant d’appareil, ni ta localisation. Pexi conserve l’estimation avec les détails du produit demandés. L’envoi de ces détails de produit à Claude fait partie de l’utilisation de Pexi.',
        'Les mots que tu saisis sont différents, car ils peuvent être n’importe quoi. Si tu as saisi un nom que Pexi n’a pas reconnu, ces mots seraient le nom que Claude reçoit. L’acceptation de ce document l’inclut, et la ligne au-dessus du bouton Accepter le dit. Tu peux le désactiver à tout moment dans Réglages : Pexi répond alors quand même à ta recherche à partir de ses propres données, simplement sans l’estimation de l’IA. Le serveur de Pexi conserve ta réponse avec l’heure où tu l’as donnée et la respecte.',
      ],
    },
    {
      id: 'records',
      h: 'Ce que Pexi enregistre',
      blocks: [
        { lead: 'Un identifiant d’appareil aléatoire.', text: 'Ton téléphone le génère et le garde sur le téléphone, dans son stockage sécurisé (le trousseau sur iPhone, le stockage chiffré d’Android sur Android) et dans le stockage de l’application, avec un second secret aléatoire qui prouve que les demandes suivantes viennent du même téléphone. Les deux sont envoyés au serveur de Pexi avec les demandes de l’application. Sur iPhone, le trousseau peut survivre à l’application : réinstaller Pexi sur le même téléphone garde le même identifiant et ton nombre de scans. Sur Android, supprimer l’application efface normalement l’identifiant, et une réinstallation repart habituellement avec un nouveau.' },
        { lead: 'Ce que tu scannes ou saisis.', text: 'Quand tu scannes un code-barres, Pexi envoie les chiffres du code-barres. Quand tu saisis le nom d’un produit, Pexi envoie le texte saisi à son propre serveur (et à Claude, sauf si tu l’as désactivé dans Réglages, comme le décrit « Estimations de prix par l’IA »). Pendant que la caméra est ouverte, l’application lit le texte visible dans l’image grâce à une reconnaissance de texte qui fonctionne sur ton téléphone, et envoie les lignes de texte reconnues (pas l’image) au serveur de Pexi pour trouver les produits correspondants. Ces éléments sont conservés avec la réponse donnée par Pexi, le fait qu’elle ait pu répondre ou non, toute correction que tu as faite et l’heure.' },
        { lead: 'Les prix, magasins et évaluations que tu saisis.', text: 'Si tu saisis le prix vu en rayon, choisis un magasin, indiques qu’un verdict était faux ou évalues un verdict, c’est conservé avec le scan. Quand tu saisis un prix ou choisis un produit, Pexi conserve aussi un code brouillé à sens unique de ton réseau (jamais ton adresse IP) pour écarter les faux prix, et le supprime en même temps que ton identifiant d’appareil.' },
        { lead: 'Ta façon d’utiliser l’application, tant que Aider à améliorer Pexi est activé.', text: 'Aider à améliorer Pexi est activé tant que tu ne le décoches pas sur le premier écran, et tu peux le désactiver à tout moment dans Réglages. Tant que c’est activé, Pexi enregistre quand l’application est ouverte, les écrans que tu visites, les boutons que tu touches, les erreurs de l’application et le texte que tu envoies, comme une recherche. Tant que c’est désactivé, le serveur de Pexi n’en conserve rien et ne garde que ce qu’il lui faut pour te répondre. Si l’application elle-même plante, elle peut quand même envoyer le rapport d’erreur, qui ne contient aucun identifiant d’appareil. Le texte que tu effaces ou n’envoies pas n’est pas enregistré; Pexi note seulement qu’une recherche est restée inachevée.' },
        { lead: 'Ton acceptation et tes choix.', text: 'Pexi enregistre que tu as accepté ce document, quelle version et quand. Elle enregistre aussi ton choix pour Aider à améliorer Pexi et pour l’envoi des mots saisis à Claude, quand tu acceptes et chaque fois que tu en changes un, avec l’heure. Les deux sont conservés sur le serveur de Pexi, qui les respecte.' },
        { lead: 'Les détails techniques de chaque demande.', text: 'La version de l’application, la plateforme, le temps de réponse, ainsi que ta langue et ton marché. Le serveur de Pexi journalise aussi, pour chaque demande, l’heure, l’adresse Web demandée, le code de réponse, ton adresse IP, le pays d’où vient la demande et le texte d’agent utilisateur de ton téléphone.' },
        { lead: 'L’historique d’achat, seulement si tu t’abonnes.', text: 'Pexi Plus est vendu par le système d’achat intégré d’Apple sur iPhone et par la facturation Google Play sur Android. L’achat se fait auprès d’Apple ou de Google, et RevenueCat enregistre le forfait acheté, sa date de renouvellement et s’il est actif, sous ton identifiant d’appareil aléatoire comme identifiant d’utilisateur de l’application. L’application vérifie ton abonnement auprès de RevenueCat chaque fois qu’elle s’ouvre, et le serveur de Pexi demande à RevenueCat si Pexi Plus est actif pour ton identifiant d’appareil, afin de lever la limite hebdomadaire de scans. Toucher Restaurer les achats contacte RevenueCat et Apple ou Google.' },
        { lead: 'Une localisation approximative, quand ton téléphone le permet.', text: 'Pexi utilise la localisation seulement dans la mesure où l’autorisation de localisation de ton téléphone pour Pexi le permet, autorisation que tu règles dans l’invite du téléphone ou dans ses réglages. Ton téléphone calcule ta position et l’arrondit, sur le téléphone, à un carré de grille d’environ un kilomètre de large. Seul ce carré est envoyé. Le serveur de Pexi conserve le carré, pas ta position exacte, et jette toute coordonnée exacte qu’une demande pourrait contenir. Pexi se sert du carré pour suggérer des magasins à proximité, et le magasin que tu choisis est conservé avec le scan.' },
        { lead: 'Les photos.', text: 'La caméra sert, sur ton téléphone, à lire les codes-barres et le texte. Cette version de Pexi ne téléverse ni photos ni images de la caméra.' },
        'Pexi ne recueille ni ton nom, ni ton adresse courriel, ni ton numéro de téléphone, ni tes contacts, ni tes renseignements de paiement, ni ta position exacte, ni d’identifiant publicitaire.',
      ],
    },
    {
      id: 'why',
      h: 'Pourquoi Pexi s’en sert',
      blocks: [
        {
          ul: [
            'Pour répondre à ton scan et trouver les magasins à proximité.',
            'Pour déterminer si un prix est bon, à partir des prix que Pexi détient, y compris ceux saisis par des gens. Les prix que tu saisis peuvent servir aux réponses montrées à d’autres consommateurs.',
            'Pour améliorer les données de prix et les réponses de Pexi, à l’aide des prix, des scans et des corrections recueillis en répondant aux consommateurs, notamment pour ajuster ses propres estimations de prix. Ta façon d’utiliser l’application n’y entre que tant que Aider à améliorer Pexi est activé.',
            'Pour trouver et corriger les problèmes, à l’aide des erreurs et des journaux du serveur décrits plus haut, et des événements d’utilisation tant que Aider à améliorer Pexi est activé.',
          ],
        },
      ],
    },
    {
      id: 'sharing',
      h: 'Qui d’autre reçoit des données',
      blocks: [
        'Le serveur de Pexi envoie des renseignements limités aux services externes suivants pour répondre à un scan. Open Food Facts, Anthropic et le service Overpass d’OpenStreetMap ne reçoivent pas ton identifiant d’appareil. Cloudflare, qui achemine tes demandes, et RevenueCat, décrit plus bas, le reçoivent. Le seul qui reçoit quoi que ce soit sur l’endroit où tu te trouves est le service de recherche de magasins, et seulement quand ton téléphone permet la localisation.',
        {
          ul: [
            { lead: 'Open Food Facts', text: '(world.openfoodfacts.org) reçoit un numéro de code-barres quand le catalogue de Pexi ne connaît pas le produit, pour trouver son nom, sa marque et son format.' },
            { lead: 'Anthropic', text: '(le créateur du modèle d’IA Claude) reçoit le nom, la marque, le format, la catégorie et le pays d’un produit quand Pexi n’a aucun prix pour celui-ci, et les mots que tu as saisis sauf si tu l’as désactivé dans Réglages, comme le décrit « Estimations de prix par l’IA ». Il ne reçoit ni ton identifiant d’appareil, ni ta localisation, ni aucune image.' },
            { lead: 'Le service Overpass d’OpenStreetMap', text: 'reçoit le centre de ton carré de grille approximatif, seulement quand ton téléphone permet la localisation, pour trouver des magasins à proximité.' },
            { lead: 'Cloudflare', text: 'achemine le trafic entre l’application et le serveur de Pexi; il traite donc tes demandes en transit, y compris l’identifiant d’appareil qu’elles portent. Cloudflare conserve aussi une copie de sauvegarde chiffrée du serveur, qu’il ne peut pas lire.' },
            { lead: 'Apple', text: 'fournit l’App Store, gère les téléchargements et traite les paiements de Pexi Plus sur iPhone; il reçoit donc ton achat et les renseignements de compte qu’il détient déjà, selon sa propre politique de confidentialité. Pexi n’envoie à Apple rien de tes scans et ne reçoit d’Apple aucun détail de carte ni d’identifiant Apple.' },
            { lead: 'Google', text: 'fournit Google Play, gère les téléchargements et traite les paiements de Pexi Plus sur Android; il reçoit donc ton achat et les renseignements de compte qu’il détient déjà, selon sa propre politique de confidentialité. Pexi n’envoie à Google rien de tes scans et ne reçoit de Google aucun détail de carte ni de compte Google.' },
          ],
        },
        'RevenueCat (revenuecat.com) se distingue de la liste ci-dessus : l’application le contacte chaque fois qu’elle s’ouvre, et le serveur de Pexi le contacte pour vérifier si Pexi Plus est actif. Il reçoit ton identifiant d’appareil aléatoire comme identifiant d’utilisateur de l’application, avec les renseignements d’achat d’Apple ou de Google décrits sous l’historique d’achat (ton forfait, sa date de renouvellement et s’il est actif) et, comme pour toute demande sur Internet, ton adresse IP.',
        'Pexi ne vend pas tes données et ne les partage ni avec des annonceurs ni avec des courtiers en données.',
        { lead: 'La même protection pour chaque service.', text: 'Pexi partage des données d’utilisateurs seulement avec les services nommés ici, et chacun d’eux offre une protection identique ou équivalente de ces données, comme la décrit ce document et comme l’exigent les lignes directrices d’examen de l’App Store d’Apple et les politiques de Google Play.' },
        { lead: 'À l’extérieur de ta province et du Canada.', text: 'Le serveur de Pexi et la plupart de ces services se trouvent à l’extérieur du Québec, et certains, dont Anthropic, RevenueCat, Cloudflare, Apple et Google, peuvent conserver ou traiter des données à l’extérieur du Canada, notamment aux États-Unis et dans l’Union européenne, où les lois sur la vie privée diffèrent de celles du Canada. Les tribunaux, les forces de l’ordre et les autorités gouvernementales de ces endroits peuvent avoir accès aux données qui s’y trouvent en vertu de leurs propres lois. Pexi limite ce que chacun reçoit à ce qui est indiqué plus haut.' },
      ],
    },
    {
      id: 'keep',
      h: 'Combien de temps Pexi conserve les données',
      blocks: [
        {
          ul: [
            { lead: 'Journaux des demandes au serveur :', text: '90 jours, puis supprimés.' },
            { lead: 'Événements d’utilisation (seulement tant que Aider à améliorer Pexi est activé) :', text: '12 mois, puis supprimés.' },
            { lead: 'Scans, évaluations et prix saisis :', text: 'après 24 mois, ton identifiant d’appareil en est retiré. Ce qui reste est un produit, un prix ou une réponse, et les mots que tu as saisis comme recherche, qui n’est plus rattaché à ton téléphone, et Pexi le garde pour répondre à d’autres consommateurs.' },
            { lead: 'Tes choix enregistrés, le secret de ton appareil et ton dossier d’abonnement :', text: 'supprimés après 24 mois sans utilisation de ton téléphone, et plus tôt si tu le demandes.' },
            { lead: 'Copies de sécurité faites quand Pexi supprime quelque chose à la main :', text: '30 jours au plus.' },
          ],
        },
        'Les sauvegardes du serveur peuvent garder une copie plus longtemps, jusqu’à leur remplacement. Tu peux demander une suppression plus tôt, comme décrit plus bas. Supprimer l’application ne supprime pas ce que le serveur détient déjà, et sur iPhone l’identifiant reste dans le trousseau, donc une réinstallation le ramène. Sur Android, une réinstallation repart habituellement avec un nouvel identifiant, et les données rattachées à l’ancien restent sur le serveur jusqu’à leur suppression selon le calendrier ci-dessus. Pour faire supprimer les données rattachées à ton appareil, utilise Supprimer mes données dans Réglages.',
      ],
    },
    {
      id: 'rights',
      h: 'Tes droits, et comment Pexi traite les demandes',
      blocks: [
        {
          ul: [
            `Tu peux demander à voir ou à supprimer les données rattachées à ton appareil. Ouvre Réglages et touche Supprimer mes données, ce qui prépare un courriel à ${CONTACT_EMAIL} contenant ton identifiant d’appareil pour retrouver les bonnes données, ou écris toi-même à cette adresse. La suppression se fait à la main.`,
            'Si tu crois qu’un prix ou un verdict est faux, tu peux le dire dans l’application en répondant à la question qui demande si le verdict était juste.',
            'Tu peux retirer Aider à améliorer Pexi, ou ton oui à l’envoi des mots saisis à Claude, à tout moment dans Réglages. L’application informe le serveur de Pexi chaque fois que tu les changes, et le serveur respecte ta dernière réponse.',
          ],
        },
        'Voici, en mots simples, les étapes que suit Pexi. Jamin Xu, nommé plus haut, en est responsable.',
        {
          ul: [
            { lead: 'Demandes pour voir ou supprimer tes données.', text: 'Utilise Supprimer mes données dans Réglages, ou écris à l’adresse ci-dessus. Comme Pexi ne détient ni nom ni compte, elle retrouve tes données par ton identifiant d’appareil et vérifie que la demande vient de la personne qui a ce téléphone avant de montrer ou de supprimer quoi que ce soit. Pexi répond par écrit dans un délai de 30 jours. Une suppression retire du serveur de Pexi les données rattachées à ton appareil, ainsi que le dossier d’achat chez RevenueCat si tu t’es abonné. Les sauvegardes du serveur effacent la copie en environ 15 jours. Si tu continues d’utiliser l’application sur ce téléphone, de nouvelles données recommencent sous le même identifiant.' },
            { lead: 'Plaintes.', text: 'Écris à l’adresse ci-dessus. Pexi lit chaque plainte et y répond par écrit. Tu peux aussi porter plainte auprès de la Commission d’accès à l’information du Québec (cai.gouv.qc.ca) ou du Commissariat à la protection de la vie privée du Canada (priv.gc.ca).' },
            { lead: 'Incidents.', text: 'Si des renseignements personnels sont un jour perdus, ou vus ou utilisés par quelqu’un qui ne devrait pas les avoir, Pexi agit immédiatement pour y mettre fin et inscrit l’incident dans un registre, qu’il ait causé un préjudice ou non. Si un incident présente un risque de préjudice sérieux, Pexi avise promptement la Commission d’accès à l’information du Québec et le Commissaire à la protection de la vie privée du Canada, et avise les personnes touchées par un avis en haut de ce document et dans l’application, parce que Pexi ne détient aucune adresse courriel ni aucun numéro de téléphone de ses utilisateurs.' },
          ],
        },
      ],
    },
    {
      id: 'contrib',
      h: 'Les prix et renseignements que tu fournis',
      blocks: [
        'Si tu saisis un prix, choisis un magasin, corriges un verdict ou évalues une réponse, tu confirmes que ce que tu fournis est véridique à ta connaissance. Tu permets à Pexi de le conserver et de l’utiliser, avec les contributions d’autres consommateurs, pour améliorer ses données de prix et répondre à d’autres consommateurs, comme le décrit ce document. À cette fin, tu accordes à Pexi une licence non exclusive, mondiale, libre de redevances, perpétuelle et irrévocable pour conserver, copier, adapter, combiner à d’autres données, publier et partager ce que tu fournis, y compris sous les licences de données ouvertes décrites sous « Sources de données et licences ». Cette licence vise les prix, les choix de magasins, les corrections et les évaluations que tu soumets, mais jamais ton identifiant d’appareil ni ta localisation. Ne soumets rien d’illégal ou de trompeur, ni rien que tu n’as pas le droit de partager. Ce qui n’est pas permis figure sous « Utilisation acceptable ».',
      ],
    },
    {
      id: 'sources',
      h: 'Sources de données et licences',
      blocks: [
        'Les détails de produits, les prix et les noms de magasins dans Pexi comprennent des données ouvertes, recueillies et publiées par d’autres personnes. Chaque source ci-dessous fixe ses propres conditions de réutilisation, et voici le crédit que ces conditions demandent.',
        `Les données d’Open Food Facts, d’Open Beauty Facts, d’Open Pet Food Facts, d’Open Products Facts, d’Open Prices et d’OpenStreetMap sont offertes sous la licence Open Database License (ODbL). Lorsque Pexi combine ces données à d’autres, la base de données qui en résulte, ou un fichier des modifications, est offert sous la licence ODbL sur demande à ${CONTACT_EMAIL}.`,
        'Certains renseignements sur les produits proviennent d’Open Icecat : Database Right data-sheet 2026 Icecat. Tous droits réservés. Ils sont fournis tels quels, sans garantie d’aucune sorte.',
        'Contient des renseignements des contributeurs d’Open Food Facts, offerts sous la licence Open Database License (ODbL), le contenu de chaque fiche relevant de la Database Contents License. Tu peux obtenir la base de données complète et à jour d’Open Food Facts, ainsi que celles des autres projets Open Food Facts, à world.openfoodfacts.org/data, et les données d’OpenStreetMap à openstreetmap.org/copyright.',
        'Adapté de Statistique Canada, tableau 18-10-0245-01 (Monthly average retail prices for selected products), données jusqu’en septembre 2026, consulté le 8 novembre 2026. Cela ne constitue pas une approbation de ce produit par Statistique Canada.',
        'Les ingrédients, allergènes et renseignements nutritionnels affichés dans Pexi proviennent de ces bases de données ouvertes, que tout le monde peut modifier, et peuvent être absents, périmés ou inexacts. Lis toujours l’étiquette de l’emballage, surtout si tu as une allergie ou des besoins alimentaires particuliers. Pexi ne donne aucun conseil médical ou alimentaire.',
        { sources: true },
        { lead: 'Licences des logiciels.', text: 'Les logiciels libres avec lesquels Pexi est conçue, et la licence de chacun, sont énumérés sur la page des licences qui accompagne Pexi (licences.html).' },
        'Pexi n’est ni affiliée à un magasin, une marque ou un fournisseur de données nommé dans l’application, ni approuvée ou commanditée par eux. Les prix sont ce que quelqu’un a noté le jour indiqué à côté, pas une offre, et ils n’ont pas été vérifiés auprès du magasin.',
      ],
    },
    {
      id: 'use',
      h: 'Utilisation acceptable',
      blocks: [
        {
          ul: [
            'N’utilise pas Pexi à des fins illégales.',
            'N’essaie pas de briser, de surcharger, de sonder ou de rétroconcevoir Pexi ou son serveur, ni d’accéder aux données d’une autre personne.',
            'N’utilise pas de scripts ni d’outils automatisés pour envoyer des demandes au serveur de Pexi.',
            'Ne soumets pas sciemment de faux prix, de faux noms de magasins ni de fausses corrections.',
            'Ne saisis rien d’injurieux, de haineux, de menaçant, de sexuel, ni rien qui nomme ou vise une personne, dans un prix, un nom de magasin, une recherche ou une correction. Les entrées doivent porter sur le prix d’un produit dans un magasin, et rien d’autre.',
          ],
        },
        { lead: 'Signaler une mauvaise entrée.', text: `Si tu vois un prix, un magasin ou une autre entrée d’un autre consommateur qui est faux, injurieux ou qui n’a pas sa place, écris à ${CONTACT_EMAIL} en indiquant ce que tu as vu et où. Pexi lit chaque signalement et retire les entrées qui enfreignent ces règles. Si un verdict te semble faux, tu peux aussi le dire depuis le verdict lui-même.` },
      ],
    },
    {
      id: 'plus',
      h: 'Abonnement Pexi Plus',
      blocks: [
        'Pexi se télécharge gratuitement. Pexi Plus est un abonnement facultatif à renouvellement automatique qui donne droit à 100 scans de codes-barres par semaine, alors que l’offre gratuite en permet 10. Les recherches saisies sont gratuites et ne sont pas comptées. Une fois l’allocation hebdomadaire utilisée, des scans redeviennent disponibles à mesure que les plus anciens dépassent sept jours. Il est vendu par le système d’achat intégré d’Apple sur iPhone et par la facturation Google Play sur Android, et les achats sont traités par Apple ou Google et par RevenueCat.',
        {
          ul: [
            { lead: 'Forfaits et prix.', text: 'Pexi Plus mensuel coûte 3,99 $ CA par mois. Pexi Plus annuel coûte 29,99 $ CA par année. Le prix, dans ta devise, et la période de facturation sont affichés à l’écran Pexi Plus de l’application avant l’achat.' },
            { lead: 'Paiement.', text: 'Le paiement est porté à ton compte Apple (iPhone) ou à ton compte Google Play (Android) à la confirmation de l’achat.' },
            { lead: 'Renouvellement automatique.', text: 'L’abonnement se renouvelle automatiquement, sauf s’il est annulé au moins 24 heures avant la fin de la période en cours. Ton compte est débité pour le renouvellement dans les 24 heures précédant la fin de la période en cours, au prix du forfait choisi.' },
            { lead: 'Gestion et annulation.', text: 'Tu peux gérer et annuler ton abonnement dans les réglages de ton compte Apple sur ton iPhone (Réglages, ton nom, Abonnements), ou sur Android dans l’application Google Play (ta photo de profil, Paiements et abonnements, Abonnements). Supprimer l’application ne l’annule pas.' },
            { lead: 'Remboursements.', text: 'Les remboursements sont traités par la boutique où tu as acheté : Apple sur iPhone, Google Play sur Android.' },
            { lead: 'Restauration.', text: 'Si tu réinstalles Pexi ou utilises un nouveau téléphone avec le même identifiant Apple ou compte Google, ouvre l’écran Pexi Plus et touche Restaurer les achats.' },
          ],
        },
      ],
    },
    {
      id: 'security',
      h: 'Sécurité',
      blocks: [
        'L’application communique avec le serveur de Pexi par une connexion HTTPS chiffrée. Aucun système n’est parfaitement sûr, et Pexi ne peut pas promettre que personne n’accédera jamais aux données sans permission.',
      ],
    },
    {
      id: 'warranty',
      h: 'Aucune garantie',
      blocks: [
        'Pexi est fournie « telle quelle » et « selon sa disponibilité », sans garantie d’aucune sorte, expresse ou implicite, dans la mesure permise par la loi. Pexi ne promet pas que l’application ou son serveur seront disponibles en tout temps, sans interruption ni erreur. L’application dépend du serveur de Pexi et peut cesser de répondre lorsque celui-ci n’est pas disponible.',
      ],
    },
    {
      id: 'liability',
      h: 'Limitation de responsabilité',
      blocks: [
        'Dans la pleine mesure permise par la loi de ton lieu de résidence, Jamin Xu n’est pas responsable des pertes découlant de ton utilisation de Pexi ou de la confiance accordée à un prix, un verdict, une estimation ou un autre contenu affiché, y compris un achat fait ou non en raison de ce contenu. Rien dans ce document ne limite une responsabilité que la loi de ton lieu de résidence ne permet pas de limiter. Si tu es un consommateur au Québec, la présente section ne s’applique pas dans la mesure où elle libérerait Pexi des conséquences de son propre fait ou de celui de ses représentants.',
      ],
    },
    {
      id: 'changes',
      h: 'Modifications et fin de l’accès',
      blocks: [
        'Pexi peut changer, être suspendue ou cesser à tout moment. Nous pouvons mettre à jour ce document. Si une modification touche ton abonnement Pexi Plus, par exemple son prix ou ce qu’il comprend, nous t’en informerons dans l’application au moins 30 jours avant son entrée en vigueur, et tu pourras résilier avant cette date sans frais. Si tu résides au Québec, une modification ne s’applique à toi que si elle concerne le prix de ton abonnement, son allocation de scans ou ses fonctionnalités. Tu recevras un avis écrit au moins 30 jours avant la modification, présentant la nouvelle clause et l’ancienne, et tu pourras résilier sans frais ni pénalité jusqu’à 30 jours après son entrée en vigueur. Tu peux cesser d’utiliser Pexi à tout moment en supprimant l’application.',
        'Si Pexi change ce qu’elle recueille ou qui le reçoit, ce document sera mis à jour et la date d’entrée en vigueur ci-dessus changera. La version dans l’application et sur le site de Pexi est la version en vigueur.',
      ],
    },
    {
      id: 'law',
      h: 'Droit applicable',
      blocks: [
        'Ce document est régi par les lois de la province de l’Ontario et les lois fédérales du Canada qui s’y appliquent, sans égard aux règles de conflit de lois. Ce choix de loi ne te retire pas la protection que la loi de ton lieu de résidence t’accorde à titre de consommateur.',
      ],
    },
    {
      id: 'contact',
      h: 'Nous joindre',
      blocks: [CONTACT_EMAIL],
    },
  ],
};

/** The document in one language. Anything but 'fr' reads English. */
export function legalDocument(lang = 'en') {
  return lang === 'fr' ? FR : EN;
}

/* ------------------------------------------------------------------ rendering, shared by app and pages --- */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escapes, then turns the contact address into a mail link. */
function text(s) {
  return esc(s).split(CONTACT_EMAIL).join(`<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`);
}

function inline(item) {
  if (typeof item === 'string') return text(item);
  return `<strong>${text(item.lead)}</strong> ${text(item.text)}`;
}

function sourcesHtml(doc) {
  const rows = SHOPPER_SOURCES.map(
    (s) => `<li class="legal-source"><p class="legal-source-name"><strong>${esc(s.name)}</strong></p>`
      + `<p class="legal-source-what">${esc(s.what)}</p>`
      + `<p class="legal-source-licence">${esc(s.licence)}. <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(doc.sourcesOpen)}</a></p></li>`,
  );
  return `<ul class="legal-sources">${rows.join('')}</ul>`;
}

function blockHtml(block, doc) {
  if (typeof block === 'string') return `<p>${text(block)}</p>`;
  if (block.sources) return sourcesHtml(doc);
  if (block.ul) return `<ul>${block.ul.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
  return `<p>${inline(block)}</p>`;
}

/**
 * The document body as HTML: the effective line, the intro and every section. Everything is escaped here;
 * the only markup is this renderer's own. `headingTag` lets the hosted page and the app pick the level.
 */
export function legalBodyHtml(lang = 'en', { headingTag = 'h2' } = {}) {
  const doc = legalDocument(lang);
  const parts = [`<p class="legal-meta">${esc(doc.effective)}</p>`];
  for (const p of doc.intro) parts.push(`<p class="legal-intro">${text(p)}</p>`);
  for (const s of doc.sections) {
    parts.push(`<section class="legal-section" id="${esc(s.id)}"><${headingTag}>${esc(s.h)}</${headingTag}>${s.blocks.map((b) => blockHtml(b, doc)).join('')}</section>`);
  }
  return parts.join('\n');
}

/**
 * A whole hosted page (docs/store/terms.html and privacy.html, and their -fr twins). Both URLs carry the
 * same document: the App Store's terms link and privacy link each land on all of it.
 */
export function legalPageHtml(lang = 'en', file = lang === 'fr' ? 'terms-fr.html' : 'terms.html') {
  const doc = legalDocument(lang);
  const twin = file.includes('-fr.') ? file.replace('-fr.', '.') : file.replace('.html', '-fr.html');
  const other = lang === 'fr'
    ? `<a href="${twin}" lang="en">English version</a>`
    : `<a href="${twin}" lang="fr">Version française</a>`;
  const support = lang === 'fr' ? 'Soutien Pexi' : 'Pexi Support';
  return `<!doctype html>
<!-- Generated by app/scripts/build-legal-pages.mjs from app/public/js/legal/document.js. Edit that file, not this one. -->
<html lang="${lang === 'fr' ? 'fr-CA' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pexi: ${esc(doc.title)}</title>
<meta name="description" content="${esc(doc.intro[0])}">
<style>
:root { color-scheme: light dark; --ink: #1a1a1a; --paper: #ffffff; --muted: #555555; --line: #dddddd; --link: #0b5fff; }
@media (prefers-color-scheme: dark) { :root { --ink: #eeeeee; --paper: #121212; --muted: #aaaaaa; --line: #333333; --link: #7db2ff; } }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink); }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.55; font-size: 17px; padding: 24px 16px 64px; max-width: 720px; margin: 0 auto; }
h1 { font-size: 1.7rem; line-height: 1.2; margin: 0.4em 0 0.3em; }
h2 { font-size: 1.15rem; margin: 1.8em 0 0.4em; padding-top: 0.6em; border-top: 1px solid var(--line); }
p, li { margin: 0.5em 0; }
ul { padding-left: 1.3em; }
a { color: var(--link); }
.legal-meta, footer { color: var(--muted); font-size: 0.9rem; }
.legal-sources { list-style: none; padding-left: 0; }
.legal-source { padding: 0.4em 0; border-bottom: 1px solid var(--line); }
.legal-source p { margin: 0.2em 0; }
.top-links { font-size: 0.95rem; }
footer { margin-top: 2.5em; padding-top: 1em; border-top: 1px solid var(--line); }
</style>
</head>
<body>
<p class="top-links"><a href="index.html">${support}</a> | ${other}</p>
<h1>Pexi: ${esc(doc.title)}</h1>
${legalBodyHtml(lang)}
<footer>Pexi: ${esc(doc.title)}. ${esc(doc.effective.split('.')[0])}.</footer>
</body>
</html>
`;
}
