DRAFT, rewritten 2026-11-26. Not submitted to Apple or Google. Jamin files these himself in the Play Console (Data safety) and App Store Connect (App Privacy). This replaces the 2026-09-28 draft, which described photos going to Gemini, exact GPS leaving the phone and a "Save my location" toggle; none of that is true of the app now.

## The app these answers describe (as it will be after the 2026-11-26 consent change)

1. **One required acceptance.** On first launch the person accepts one document, "Terms, Privacy and Data". There is no account and no sign-in. Using Pexi means accepting it.
2. **One optional choice, "Help improve Pexi", pre-ticked on the first screen.** The person can untick it before Accept or switch it off any time in Settings; the server records no usage events without the stored yes. ASSUMPTION, to confirm against the code: it controls (a) sending usage events (app opens, screens, taps, searches sent) and (b) letting the person's scans and entered prices be used to improve and train Pexi's own price estimates. If the code gates less than this, the "optional" marks below shrink to match; if it gates more, they grow.
3. **Typed text to Anthropic is part of the required acceptance.** Product name, brand, size, category and country go to Anthropic's Claude to estimate a price when Pexi has none. A plain line right above the Accept button says typed searches are sent to Claude; tapping Accept stores the yes with its time. It can be switched off any time in Settings, and the server sends no typed words to Claude without the stored yes (off, Pexi answers from its own data). There is no separate one-time notice. Never an image, never the device id, never location.
4. **Coarse location only.** The phone's own permission prompt decides. The phone rounds the position to a grid square about 1 km wide and only the square is sent (`geocell.js`; `api.js` sends the cell, and the server stores nulls in the exact columns). Android declares `ACCESS_COARSE_LOCATION` only (fine removed 2026-11-26). The exact reading stays in memory on the phone (`geocell.js` `currentExact()`, no caller).
5. **No photos kept, none sent.** The camera reads barcodes and text on the phone. No image leaves the phone (`FLAGS.photoId` off, photo route refused on the server).
6. **RevenueCat purchase data** for Pexi Plus: plan, renewal, active or not, under the random device id as app user id. Apple and Google keep the payment; Pexi never sees card or account details.
7. **Always on, part of the service (not optional):** the random device id sent on every request, what the person scans or types (needed to answer), shelf prices, stores and ratings they enter, answer time, the server's request log (IP address, country, user agent, path, status), and app error reports.
8. **Retention (from `retention.ts` and the document):** request logs 90 days, usage events 12 months, scans, ratings and entered prices lose the device id at 24 months. Deletion on request by email from Settings.

## Google Play: Data safety

Play's three data-handling questions first.

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS to the server; confirm the tunnel configuration with the Mac lane before ticking, as the 09-28 draft said) |
| Do you provide a way for users to request that their data be deleted? | Yes. Settings has "Delete my data", which prepares an email to usepexiapp@gmail.com with the device identifier. Deletion URL for the form: the privacy policy page (https://xu826jamin.github.io/pexi/privacy.html). |
| Account creation in the app | None |
| Independent security review | No (do not tick) |
| Data safety and Families | Decided with the Target audience answer (OPEN 1 below). |

Per data type. "Required" means the app cannot answer without it or it is always sent; "Optional" means the person can choose not to provide it.

| Play type | Collected | Shared | Required or optional | Purposes to tick | Notes |
|---|---|---|---|---|---|
| Location: Approximate | Yes | No (see sharing note) | Optional (phone permission) | App functionality | Grid square about 1 km. Overpass gets the square's centre point to list shops, with no id. |
| Location: Precise | **No** | n/a | n/a | n/a | Exact position never leaves the phone; Android no longer declares fine location. |
| Financial info: Purchase history | Yes, only for subscribers | No (RevenueCat acts for Pexi) | Optional (buying is a choice) | App functionality | Payment card and account details: not collected. |
| App activity: App interactions | Yes | No | **Optional** ("Help improve Pexi", pre-ticked, can be switched off) | Analytics, App functionality | Opens, screens, taps. Under the assumption in point 2. |
| App activity: In-app search history | Yes | No | Required | App functionality | Barcodes scanned and product names typed. Open Food Facts gets a barcode, Anthropic gets a product name (typed words only while the Settings switch for typed searches to Claude is on, which Accept sets). |
| App activity: Other user-generated content | Yes | No | Optional (a person who enters no price gives none) | App functionality, Fraud prevention | Shelf prices, stores, corrections, ratings; plus a one-way scrambled network code that is not the IP address. Prices may feed other shoppers' answers (the document says so). |
| App info and performance: Crash logs | Yes | No | Required | App functionality, Analytics | Script errors sent to `/api/client-error` with no device id. |
| App info and performance: Diagnostics | Yes | No | Required | App functionality, Analytics | Answer time, app version, platform, language and market; the request log's IP address, country and user agent (Play has no separate IP type). |
| Device or other IDs | Yes | No (RevenueCat and Cloudflare act for Pexi) | Required | App functionality; Analytics only counts when "Help improve Pexi" is on, tick it anyway | Random per-install id, not a hardware id. |
| Photos and videos | **No** | n/a | n/a | n/a | Camera frames are read on the phone and discarded. Play treats data handled only on the device as not collected. |
| Personal info (name, email, address, phone, other), Health and fitness, Messages, Audio, Files and docs, Calendar, Contacts, Web browsing | **No** | n/a | n/a | n/a | No account, no sign-in. |

**Sharing note (JUDGMENT, for Jamin).** Google does not count passing data to a service provider that processes it on the developer's behalf as "sharing". Anthropic (Commercial Terms, no training on API content), RevenueCat, Cloudflare, Open Food Facts and Overpass are treated that way above. Google's current Console wording for this exemption was not re-fetched for this draft, so confirm it in the form's help text. The cost of getting it wrong is a label Play calls inaccurate. The cheap hedge is to tick "Shared" for Device or other IDs and Purchase history (RevenueCat) and for In-app search history (Anthropic); it costs only a more cautious-looking label. Pick one, then keep the privacy document's "Who else receives data" section and this table saying the same thing.

**Data deleted on a schedule:** Yes. Put the retention line in the help text: request logs 90 days, usage events 12 months, device id removed from scans, ratings and prices at 24 months.

## Apple: App Privacy ("Data Types")

Apple asks per type: collected, linked to the person, used for tracking. Apple has no per-choice flag, so an optional collection is still answered as collected (the "optional disclosure" exemption does not fit regular analytics; ASSUMPTION, Apple's page not re-read). Every row is Linked: Apple counts data keyed to a device identifier as linked. Tracking is No everywhere: no advertising, no data broker, no sharing for ads.

| Apple type | Collected | Linked | Tracking | Purposes |
|---|---|---|---|---|
| Identifiers: Device ID | Yes | Yes | No | App Functionality, Analytics |
| Usage Data: Product Interaction | Yes (optional "Help improve Pexi") | Yes | No | Analytics, App Functionality |
| Usage Data: Search History | Yes | Yes | No | App Functionality, Analytics |
| User Content: Other User Content | Yes | Yes | No | App Functionality, Analytics |
| Location: Coarse Location | Yes (phone permission) | Yes | No | App Functionality |
| Location: Precise Location | **No** | n/a | n/a | n/a |
| Diagnostics: Performance Data | Yes | Yes | No | Analytics |
| Diagnostics: Other Diagnostic Data | Yes (includes the request log's IP address; Apple has no IP type) | Yes | No | Analytics, App Functionality |
| Purchases: Purchase History | Yes, subscribers only | Yes | No | App Functionality |
| Photos or Videos, Contact Info, Health and Fitness, Financial Info (card details), Contacts, Browsing History, Sensitive Info | **No** | n/a | n/a | n/a |

These eight "Yes" rows are exactly what `native/ios/App/App/PrivacyInfo.xcprivacy` already declares (`app/test/paywall-review.test.mjs` compares it with `docs/store/listing.md`), so nothing in the manifest changes for the new model. Data collected by third-party SDKs inside the app counts too: RevenueCat's SDK (device id, purchase history, already covered above) and Google ML Kit on the phone (barcode and text recognition). **TO CHECK:** Google publishes what ML Kit collects for the Apple and Play disclosures; that page was not read here. Read it before filing and add any type it names that is not above.

## Open items for Jamin

1. **Target audience and age.** The Terms say all ages with a parent's permission; Play's Target audience must be chosen, and a choice that includes under-13s brings the Families policy. A 13+ or 18+ answer keeps the Data safety form as above. Apple's Kids Category stays unchosen.
2. **Confirm the "Help improve Pexi" assumption** (point 2) against the shipped code, then re-read the Optional marks.
3. **Confirm the Accept line and the Settings switch for typed searches to Claude** are in the build, and that switching it off sends nothing typed to Anthropic.
4. **Android 7 to 11 and location.** Removing fine location is right for Play, but Capacitor's web bridge asks for fine and coarse together and only accepts coarse alone on Android 12 and later. On Android 7 to 11 the web-view location read is refused, so no nearby shops there. Test on a real phone; the manifest comment records it.
5. **Amazon billing receiver** (`com.amazon.device.iap.ResponseReceiver`) appears in the merged Android manifest. It comes from the RevenueCat library, not from Pexi. Left alone; it does nothing unless a build is sold through the Amazon store.
6. Re-run the answers whenever the app adds a collection: a fresh pass, not an amendment from memory of this one.
