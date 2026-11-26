# Pexi: App Store listing, version 1.0

Drafted 2026-11-05. Every factual line below is sourced from the code or the rulings; file and line references are relative to the repo root. Anything not settled is under OPEN QUESTIONS at the bottom.

## Store text

Rewritten 2026-11-21 from the readiness review (business ranks 2 and 11, premortem 2, legal round 2 finding 4): the name carries search words, the subtitle and description lead with what the shopper gets, nothing promises unlimited scans (Plus is 100 a week), and nothing says prices are typical for all of Canada (most store prices come from one Toronto neighbourhood, live `/api/attribution`). Jamin owns the App Store Connect fields; this is the text to paste.

**Name** (27 of 30):

```
Pexi: Grocery Price Checker
```

**Subtitle** (29 of 30):

```
Scan it. Know if it's a deal.
```

**Promotional text** (153 of 170):

```
Scan a barcode, enter the shelf price, and know in seconds if it's a great, good, reasonable or bad price. Check every price in your cart before you pay.
```

**Description** (about 2,200 of 4,000):

```
Is this a good price? Pexi tells you in seconds, right at the shelf.

Point your camera at a barcode, enter the price on the shelf tag, and Pexi gives you a verdict you can read at a glance: Great price, Good price, Reasonable price or Bad price.

WHAT YOU GET
- A verdict on the price in your hand, not a flyer to scroll through.
- The range of prices Pexi has seen for that product, and where those prices come from.
- Manual Search: no barcode? Type the product name instead.
- Your own lines: decide how much cheaper counts as a great price for you.
- Saved items for the products you buy often, and your past scans and ratings.
- English and French, and a light or dark theme.

HOW PEXI KNOWS
Pexi compares your price with the prices it holds for that product and for similar products, with new prices every week. Prices come from open data published by other organisations and from prices that shoppers using Pexi have entered. When Pexi has no shop price for a product, it shows an estimated range and labels it as an estimate. Tell Pexi when a verdict was wrong and correct the price; the next shopper gets the better answer. The Terms, Privacy and Data screen in the app credits each source, and a licences page lists the open-source parts. Pexi is not affiliated with any store or brand.

PRIVACY
No account and no sign-in. Pexi does not upload photos or camera images. If your phone allows location, only a rough area about one kilometre wide is sent, never your exact position. You review the Terms, Privacy and Data once when you open the app and can read it again any time in Settings. "Help improve Pexi" is your choice and starts off. Before words you typed are sent to Pexi's AI to estimate a price, Pexi asks you once. You can ask for your data to be deleted from Settings. The full details are in the privacy policy.

PEXI PLUS
Pexi is free to use, with 10 barcode scans a week. Pexi Plus gives you 100 barcode scans a week, enough to check your whole cart, for CA$3.99 a month or CA$29.99 a year. The subscription renews automatically unless you cancel it in your Apple ID settings at least 24 hours before the end of the current period.

GOOD TO KNOW
- Pexi needs an internet connection to answer.
- Prices and estimates are information only. Check the price at the till.

Terms of Use: https://xu826jamin.github.io/pexi/terms.html
Privacy Policy: https://xu826jamin.github.io/pexi/privacy.html
```

The two links above are there because Apple asks an app with auto-renewing subscriptions to link its Terms of Use (EULA) in the App Store metadata, either in the description or in the custom EULA field (App Review Guideline 3.1.2). The Privacy Policy URL field takes the second link as well.

Sources for the new lines: "new prices every week" is the weekly price refresh (`mac/hammer-refresh.sh`, the camera banner's own string `ea_body`); "labels it as an estimate" is the answer's basis line (`ui-strings.js` `vd_prov_claude_typical`, `range_word_ai`, `vd_note_claude_estimate`); "Help improve Pexi is your choice and starts off" and "Pexi asks you once" are the planned 2026-11-26 consent model (one required acceptance, one optional default-off choice, one allow before typed text goes to Anthropic); confirm both are in the build before pasting. The old "turn usage data off" switch (`usage-setting.js`) was removed 2026-11-25 and must not be claimed. "English and French" holds because French is switched on in the same release. "your own lines" is the You screen's price ranges (`lib/range-picker.js`).

**Keywords** (98 of 100; no spaces after commas; none of the words already in the name or subtitle: pexi, grocery, price, checker, scan, it, know, if, deal):

```
barcode,scanner,compare,groceries,deals,flyer,sale,cheap,food,shopping,list,cost,lookup,unit,store
```

**Screenshot captions** (business rank 1, gap 43; the images are recaptured later on build 10 or newer, in this order; the subscription screen is not in the store set, only in the in-app purchase review screenshot):

| # | What the frame shows | Caption (English) | Caption (French, for the French listing, gap 61) |
|---|---|---|---|
| 1 | A big Great price verdict on a familiar item (butter or cereal) at a real shelf price | Scan it. Know if it's a good price. | Scanne-le. Sache si c'est un bon prix. |
| 2 | The range chart under a verdict, with the shopper's price placed on it | See the range of prices Pexi has seen. | Vois la fourchette de prix que Pexi a vue. |
| 3 | Manual Search with a typed product name and its matches | No barcode? Type the name. | Pas de code-barres ? Tape le nom. |
| 4 | The You screen's price ranges (great, good, bad) | Decide what a great price means to you. | Décide ce qu'est un excellent prix pour toi. |
| 5 | The Saved list with a few products on it | Keep the products you buy often. | Garde les produits que tu achètes souvent. |

No caption carries a savings figure (hard rule 2) or a promise about every product or every province.

**Primary category:** Shopping
**Secondary category:** Utilities (optional; the store accounts packet, `docs/the-store-accounts-packet.md` section 3d, lists Shopping and Utilities)

**Copyright:** 2026 Jamin Xu

**Support URL / Privacy Policy URL / Marketing URL:** see OPEN QUESTIONS 1. The three pages in this folder are `index.html` (support), `privacy.html` and `terms.html`. Marketing URL can be left blank.

**Contact address used in the pages:** `usepexiapp@gmail.com`. It is the only project address in the repo. `app/public/js/screens/you.js:104` (`DELETE_MY_DATA_EMAIL`) uses the same one, and the existing in-app legal pages use it. It replaced the old-name `useshinapp@gmail.com` on 2026-11-22 (Jamin); the old mailbox stays open for older builds.

## App Privacy answers (App Store Connect, "Data Types")

Basis: this build, with `FLAGS.photoId` false (`app/public/js/flags.js:82`), onboarding off, market pinned to Canada, catalogue-first on (`app/src/catalogue-first.ts`, `catalogueFirstOn`: on unless its environment setting is `0`, `off` or `false`). Nothing is used for tracking in any row. No advertising, no analytics company, no data broker (no such SDK in `native/package.json`, `native/ios/App/Podfile`, or `app/public`). Apple's rule that data tied to a device identifier counts as linked to the user is why every row is "linked". The privacy manifest (`native/ios/App/App/PrivacyInfo.xcprivacy`) was rewritten 2026-11-05 to match this table row for row, and `app/test/paywall-review.test.mjs` compares the two.

| Apple data type | Collected | Linked to user | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| Identifiers: Device ID | Yes | Yes | No | App Functionality, Analytics | Random UUID made on the phone, `app/public/js/device.js:27` (`getDeviceId`) plus a second random secret, `device.js:64`. Sent on every request as headers, `app/public/js/api.js:204-219`, and in bodies. Every scan and event row is keyed by it: `app/src/scans.ts:73-79` (`device_id`), `app/src/migrations.ts:195-201` (`event.device_id`). |
| Usage Data: Product Interaction | Yes | Yes | No | Analytics, App Functionality | Screens, taps, app opens, visibility, and text the shopper sent (never text deleted or left unsent), sent in batches: `app/public/js/track.js:1-45`, `api.js:892` (`postEventsBatch`), stored by `app/src/events.ts:163` (`recordEvent`) in the `event` table. Under the 2026-11-26 consent model these are tied to the optional, default-off "Help improve Pexi" choice (the "Share usage data" switch of 2026-11-21 was removed 2026-11-25). Apple has no per-choice flag, so the row stays declared as collected. Full answer set and the assumption about what the choice controls: `notes/store-privacy-declarations-draft.md`. |
| Usage Data: Search History | Yes | Yes | No | App Functionality, Analytics | Typed product names and scanned barcodes become `scan.query_text` and `scan.resolved_code`: `app/server.ts:3470` (`/api/identify`), `scans.ts:73-90`. Lines of camera text from `/api/match-text`, `app/server.ts:3817`, `api.js:452`. |
| User Content: Other User Content | Yes | Yes | No | App Functionality, Analytics | Shelf price typed by the person, store picked, verdict corrections and good/bad ratings: `app/server.ts:5016` (`/api/scan-price`), `:4508` (`/api/correction`), `:4748` (`/api/scan-rating`). Text recognised from the camera view is sent as lines, `app/public/js/native-text-reader.js` header and `api.js:452`; the image is not sent. |
| Location: Coarse Location | Yes, only if the phone's own location permission is allowed (there is no in-app location switch) | Yes | No | App Functionality | Asked through the phone's own prompt; Android declares coarse location only (fine location removed 2026-11-26). Grid cell of about 1 km computed on the phone, `app/public/js/geocell.js`; the cell, not the point, is sent: `api.js:85-87`. Server writes nulls into exact-location columns, `app/server.ts` `locationFor`; events and the access log scrub exact pairs, `app/src/events.ts:71`, `app/src/access-log.ts` `scrubUrlPosition`. Cell centre goes to OpenStreetMap Overpass: `app/src/stores.ts:302-318`. |
| Diagnostics: Performance Data | Yes | Yes | No | Analytics | Answer time stored on the scan row (`latency_ms`, packet section 3e lists the columns of migration 2) and `/api/latency`, `app/server.ts:5133`. |
| Diagnostics: Other Diagnostic Data | Yes | Yes | No | Analytics, App Functionality | Script errors and unhandled rejections are sent as events: `app/public/js/track.js:270-285`. Server error log: `app/src/errlog.ts`. IP address, country, user agent, request path and status are written for every request: `app/src/access-log.ts:93-96`. Apple has no separate IP address type; this is the nearest fit (see OPEN QUESTIONS 7). |
| Photos or Videos | No | n/a | n/a | n/a | No image leaves a normal install. The shutter and photo route are off: `app/public/js/screens/camera.js:5245`, `server.ts:4150-4163` (photo route returns "photographs are not sent to a model" while catalogue-first is on). The one exception is a developer-only switch (OPEN QUESTIONS 5). |
| Purchases: Purchase History | Yes (added 2026-11-05 for Pexi Plus) | Yes | No | App Functionality | Subscriptions are sold through Apple's in-app purchase system and RevenueCat's SDK (`app/public/js/purchases.js`, plugin `@revenuecat/purchases-capacitor`). RevenueCat's app user id is the device id (`purchases.js` `ensureConfigured`, `appUserID: getDeviceId().id`), so the purchase history RevenueCat keeps is tied to the device id. The app checks the subscription with RevenueCat at every launch (`app/public/js/main.js` `refreshPlus`), and Pexi's server asks RevenueCat directly whether Plus is active for the device id (`app/src/scan-quota.ts`, `isPlus`). Apple keeps the payment itself; Pexi receives no card or Apple ID details. |
| Contact info, Health and Fitness, Financial Info, Contacts, Browsing History, Sensitive Info | No | n/a | n/a | n/a | No account or sign-in (`native/capacitor.config.json`, no auth code). Payment details stay with Apple (Financial Info: not collected by Pexi). |

RevenueCat (the subscription service) and Apple receive purchase data straight from the phone at every launch and from the Pexi Plus screen; RevenueCat receives the device id as the app user id, and Pexi's server also sends RevenueCat the device id to check whether Plus is active (`app/src/scan-quota.ts`). Other third parties that receive data from Pexi's server (none of these gets the device id): Open Food Facts gets a barcode (`app/src/open-food-facts.ts:116`); Anthropic gets product name, brand, size, category and market only (`identify/src/range-ask.ts:237-240`, "Never an image" at line 12), and when the name is words the person typed, only after a one-time allow in the app (2026-11-26 model); OpenStreetMap Overpass gets a cell centre (`stores.ts:302-318`). Cloudflare carries the traffic, and with it the device id in each request's headers (`mac/01-cloudflare-tunnel.md`; the access log reads `cf-connecting-ip`, `access-log.ts`).

## Age rating questionnaire

Apple's questions change; these are the answers and the reasons. The 18+ requirement is in the Terms of Use, which is a term of use and not a content rating; see OPEN QUESTIONS 3.

| Question | Answer | Reason |
|---|---|---|
| Unrestricted Web Access | No | There is no address bar or in-app browser. Links open outside the app: the licences screen (`app/public/js/screens/licences.js:62`), the legal pages (`you.js:429-434`), the store subscription page (`you.js:368`), and a seller link in the price-match line (`camera.js:1318`) that only appears when the server sends one. All links are fixed or come from the server's own data, not from a web search. This is a judgment call (OPEN QUESTIONS 8). |
| User-Generated Content | Yes, minimal | A price one shopper types can feed an answer another shopper sees (packet section 3d, "one shopper saw"; `app/server.ts:5016`). It is a number and a store name, not free text or media, and there is no chat or posting. |
| Messaging and Chat | No | No such feature in `app/public/js/screens`. |
| Advertising | No | No ad SDK or ad code. |
| Profanity or Crude Humor | None | A grep of `voice.js` and `ui-strings.js` for common profane words found none. |
| Alcohol, Tobacco, or Drug Use or References | None (Jamin 2026-11-07: "it should be good for all ages") | The catalogue holds BC liquor store barcodes, names and prices (7,555 products, `app/src/attribution.ts:109-114`), so an alcoholic product can be named in an answer. Nothing promotes or depicts use. "None" is defensible if you think a price list is not a reference (OPEN QUESTIONS 8). |
| Medical or Treatment Information | None | No health content. |
| Mature or Suggestive Themes, Horror, Sexual Content or Nudity, Violence, Realistic or Cartoon, Guns or Weapons | None | No such content in the app. Pexi is a mascot-led price checker. |
| Simulated Gambling, Contests, Loot Boxes | None | Draws, sweepstakes and cash bounties were ruled out (`RULINGS.md`, "Reward mechanics: five in, four killed"). |
| Parental controls, age assurance | No | None built. |

Expected result: 4+ (or the lowest tier Apple's form gives after the alcohol answer). The packet expected 4+ (`the-store-accounts-packet.md` section 3d); it did not answer the questionnaire.

### Age-rating answers for the 2027 questionnaire (prepared 2026-11-18, register R48)

Apple asked developers to re-answer the age-rating questions by **2027-01-12** (the date is from the register and the legal review: confirm it in App Store Connect, App Information, Age Rating). Owner: Aurik, with Jamin as account holder. Do it in December, not on the deadline. Apple's new form shows each content question with None, Infrequent or Frequent, and new tiers above 9+ (13+, 16+, 18+); both are ASSUMED from Apple's announcement and were not read in the account. Answer from this table and change a row only if the app changed.

| Apple question | Answer | Why (one line, for Apple if it asks) |
|---|---|---|
| Parental controls | No | No such feature built. |
| Age assurance | No | No age check. Pexi asks no name, birth date or account, and its Terms say it is for all ages. |
| Unrestricted web access | No | No address bar or in-app browser; links open outside the app. |
| User-generated content | Yes, minimal | A number and a store name a shopper types can feed another shopper's answer. No free text, photos or posting. |
| Messaging and chat | No | None. |
| Advertising | No | No ads and no ad code. |
| Profanity or crude humor | None | None in the app's text. |
| Horror, violence, sexual content or nudity, mature or suggestive themes, guns or weapons | None | None. |
| Medical or wellness content | None | None. |
| Simulated gambling, contests, loot boxes | None | None; draws and bounties were ruled out. |
| Alcohol, tobacco or drug references | None | A price list for a bottle is a reference to a product, not to drinking it, and nothing promotes it (legal review, question 9: "None" is defensible; the worst outcome is a rejection asking for 13+, which costs a resubmission, not a fine). |
| Made for Kids / Kids Category | Do not choose | Pexi is for all ages and is not aimed at children. Choosing the Kids Category brings stricter rules (no third-party analytics, no outside links without a parental gate) that RevenueCat and the legal links would break (from Apple guideline 1.3, ASSUMED, not re-read). |

**Tobacco, same decision (added 2026-11-21, review finding apple-rules 12):** the question reads "Alcohol, Tobacco, or Drug Use or References", and tobacco products can also get a verdict: `app/src/category-map.ts:85` and `:175` map `en:cigarettes` to answers. Whatever is answered for alcohol is answered for tobacco in the same breath. Keep "None" (a price judged, nothing sold or promoted; guideline 1.4.3 bars facilitating the sale of tobacco and Pexi sells nothing, ASSUMED fine) or answer "Infrequent" (13+) if Apple objects. Settle both products together in the R48 re-answer, due before 2027-01-12.

**If Apple objects to "None" for alcohol:** the fallback is the answer "Infrequent", which gives 13+ (legal review, question 9). A 13+ rating does not conflict with the all-ages Terms, because Apple forces an override only when the Terms' minimum age is higher than the rating. The other choice is to hide liquor products from answers. That choice is Jamin's and is listed in `docs/readiness/needs-jamin.md`; until he writes it down, the answer is: accept 13+, do not change the catalogue.

**Correction to the sentence above the first table:** it says the Terms carry an 18+ requirement. The Terms (section 2) say Pexi is for all ages and that a minor uses it with a parent's permission. The rating answers rest on the all-ages Terms.

## App Review notes

```
Pexi is a price-checking app for shoppers in Canada. There is no account, no sign-in, no invite code to type and no demo login. Nothing needs to be entered to start.

The app needs an internet connection and talks to our server to answer. If it ever shows no answer, please retry in a few minutes.

First launch: the first screen, "Terms, Privacy and Data", shows our Terms of Use and Privacy Policy as one document, including that product details are sent to Anthropic's Claude AI model to estimate a price when we have none. Tap "Accept and continue". The same screen has one optional choice, "Help improve Pexi", which starts off and can stay off. Next is a Permissions screen for camera and (optionally) location, each asked through the phone's own prompt; you can tap Continue with both off. Then the camera. The first time words you type would be sent to the AI to estimate a price, Pexi asks you to allow it once; if you decline, the text is not sent. The same document opens again from Settings, "Terms, Privacy and Data", and the Pexi Plus screen links the Terms and Privacy pages beside the price.

Without a barcode or a product in front of you:
1. On the Permissions screen (the second screen), tap "See a demo scan" for a sample verdict.
2. On the camera screen, tap "Manual Search" and type the product name, for example "McCain Tasti Taters". Pexi shows the products it matches. Pick one, then enter a shelf price (for example 5.49) to see the verdict (Great, Good, Reasonable or Bad price).
3. A barcode image is attached to this submission: UPC-A 055773000795 (McCain Tasti Taters, 800 g). Pointing the camera at that image on another screen gives the same product.

Pexi does not upload photos or camera images. Text recognition of the camera view runs on the device and only the text lines are sent.

Subscriptions: Pexi Plus (100 barcode scans a week; the free allowance is 10 a week; typed searches are free and uncounted) is an auto-renewing subscription, CA$3.99 a month or CA$29.99 a year. To see it, open the You screen and tap "Pexi Plus". The screen shows both plans with their prices, the renewal terms, Restore Purchases, and links to the Terms of Use and Privacy Policy. Purchases can be made with a sandbox Apple ID.
```

Server and gate facts behind these notes:

- Needs its server up: every answer route is `/api/...` on the server; the app's only built-in fallback is a barcode pack fetched once and kept for offline use (`app/public/js/main.js` `primeOfflineAisle`, `/api/pack`, `app/server.ts:5157`). The demo link calls `/api/identify/demo` (`app/server.ts:3386`) and shows "unavailable" if the server is down.
- Login: none. There is no auth code in the client.
- Invite gate: `app/src/invite.ts` makes the gate pass everything when neither of its two invite-code environment settings is set; otherwise every `/api/` route except `/api/health` answers 401 unless the request carries the invite header (`app/server.ts:3280-3284`). The app sends the code automatically from the value built into the app (`app/public/js/api.js` reads the invite code the build injects; `native/scripts/sync-web.mjs:99-100`), so a reviewer never types it. The repo's last statement is that it is SET on the Mac (`notes/catch-up.md:283`, D-164 answered 2026-09-23; `NOW.md:109`). I found no record in the repo of it being switched off on 2026-10-28. That has to be checked on the server (OPEN QUESTIONS 2).
- Free scans and subscriptions: Free users get 10 barcode scans a week and Pexi Plus subscribers 100 a week (Jamin, 2026-11-05). Each cap is a server setting (`SHIN_FREE_SCANS_PER_WEEK`, `SHIN_PLUS_SCANS_PER_WEEK`, `settings/src/index.ts`); a cap left unset means no cap, so a reviewer hits no wall until they are switched on. A subscriber who reaches 100 sees a screen saying so and when scans come back, not the subscribe screen. The Pexi Plus screen is reached from the You screen regardless. Plans come from RevenueCat's "default" offering (products `pexi_plus_monthly`, `pexi_plus_yearly`; entitlement `plus`); if the offering cannot load, the screen says plans are unavailable and offers Try again and Restore Purchases.

## OPEN QUESTIONS

1. **Where the three pages are hosted. RESOLVED 2026-11-05.** The pages are live on GitHub Pages at https://xu826jamin.github.io/pexi/ (support), privacy.html and terms.html, independent of the Mac, and every in-app link to the privacy policy or terms (the You screen and the Pexi Plus screen, `plus-config.js` `LEGAL_URLS`) opens them. The old pages in `app/public/legal/` that said exact GPS was sent and photos went to Gemini were deleted.
2. **Is the invite gate on, and does the submitted build carry the code?** See the notes above. If the gate is on and the build was made without the code, every request is refused. If the gate is off, any client can reach the server. Test with `curl` against the live host with no header: 401 means on, 200 means off.
3. **No 18+ checkbox exists in the app.** `RULINGS.md` ("Age gate is a Terms-of-Service checkbox", 2026-09-14) calls for one. I searched `app/public/js` and the screens for a checkbox, "18", "terms accepted" and found none: the first screens are permissions and a data screen with no agreement control. The Terms text I wrote says using Pexi confirms the 18+ requirement, which is the only mechanism there is. Decide whether to add a checkbox before submission, and whether to raise the Apple age rating override to 18+.
4. **Subscriptions. RESOLVED 2026-11-05 in code, one thing left to check.** Jamin decided to submit Pexi 1.0 with working subscriptions (entitlement `plus`, offering `default`, `pexi_plus_monthly` CA$3.99 a month, `pexi_plus_yearly` CA$29.99 a year). The Pexi Plus screen shows each plan with title, price and billing period from the offering, the renewal terms, Restore Purchases and the Terms and Privacy links, and says plans are unavailable with Try again when the offering fails. The privacy answers, manifest, policy and terms now cover Purchase History through RevenueCat. Still to confirm on the submitted build: that the RevenueCat public iOS key is in `native/config/revenuecat.config.json` when the build is made (an empty key shows no plans, `purchases.js` `ensureConfigured`), and that both products are in the offering and approved for review in App Store Connect.
5. **Developer-only camera-frame read. RESOLVED 2026-11-21:** inside the iPhone and Android app the developer tools do not exist at all (`dev-mode.js` `storeBuild`: `devOn` and `packReadOn` are false whatever is stored or typed), so the store build has no hidden Developer row (Apple 2.5.19). Before that: a hidden Developer row can send a camera frame to Anthropic for a barcode nothing else names (`app/public/js/dev-mode.js:48-59`; server refuses unless the device is on the server's developer list, `server.ts:2487-2492`). Shoppers do not get it. If a reviewer opens the app with `?dev=1` it could show; unlikely in a native build. If you want zero risk, remove the row for the store build.
6. **The privacy manifest and these answers. RESOLVED 2026-11-05.** `native/ios/App/App/PrivacyInfo.xcprivacy` was rewritten to the table above, row for row (all linked, no Photos or Videos, Purchase History added), and `app/test/paywall-review.test.mjs` fails if the two drift apart.
7. **IP address.** The server logs it for every request (`access-log.ts:93`). Apple has no IP-address type; I placed it under Other Diagnostic Data. The privacy policy states it in words.
8. **Judgment calls.** Unrestricted Web Access (No) and Alcohol (Infrequent or Mild) above. I could not check how Apple's current form scores them.
9. **Which model providers the live server actually uses.** The code still has Gemini paths, off while catalogue-first is on (the default; `NOW.md:112-116` says Gemini serves no shopper answer since 2026-09-28). If the live Mac turns catalogue-first off, photos and Gemini come back and the policy, the age answers and the data answers change. Confirm the Mac's environment. The privacy policy names only Anthropic, Open Food Facts, OpenStreetMap Overpass, Cloudflare and Apple.
10. **Claims I could not source.** That Cloudflare is in front of the production server (only the Mac setup documents say so). That other shoppers are not shown a device identifier (the code uses the invite name as the witness, `invite.ts` `reportWitness`, but I did not trace the display). Where the server physically runs, so the policy says nothing about transfers outside Canada.
11. **Retention. RESOLVED 2026-11-06.** `app/src/retention.ts` deletes request-log lines at 90 days and usage events at 12 months, and takes the device id off scans, ratings and shopper prices at 24 months; the policy states the same numbers and a test holds the two together. The Mac's backups and stdout log are outside it.
12. **Contact address.** `usepexiapp@gmail.com` since 2026-11-22 (replaced the old-name `useshinapp@gmail.com`, which stays open). An address on a Pexi domain would need a domain; none is held (`RULINGS.md` "Name" notes pexi.com and pexi.app are held by others, `getpexi.app` was free 2026-10-01).
13. **Attachment for review.** The notes above assume you attach a barcode image of UPC-A 055773000795. The repo documents this barcode scanning to a catalogue answer (`docs/walkthrough-e2e-2026-10-06.md` line 12) but I did not re-run it, and the catalogue on the live server may differ. Test the typed example and the barcode against the live server before submitting. The typed name "McCain Tasti Taters" was logged as giving a wrong verdict on 2026-10-06 (D04 in that file); I do not know whether it was fixed.
14. **Description claims to check.** The description no longer says estimates are labelled; I could not trace where the app marks one, so it says only that they can be wrong. "Saved items" and "past scans and ratings" (the old "watch list" wording is gone) come from the You screen actions (`you.js`, `watchlist`) and strings (`you_ratings`); confirm both are reachable in this build.
15. **Hard rule on savings.** The description makes no savings claim, per `CLAUDE.md` hard rule 2 and `RULINGS.md` "No savings claim ships until it is measured". The You screen has a "Savings overview" row; I did not read what it shows.
