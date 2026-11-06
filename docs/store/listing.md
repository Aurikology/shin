# Pexi: App Store listing, version 1.0

Drafted 2026-11-05. Every factual line below is sourced from the code or the rulings; file and line references are relative to the repo root. Anything not settled is under OPEN QUESTIONS at the bottom.

## Store text

**Name:** Pexi

**Subtitle** (26 of 30):

```
Is this price a good deal?
```

**Promotional text** (145 of 170):

```
Scan a barcode or type a product name and see whether the shelf price is great, good, reasonable or bad, judged against typical prices in Canada.
```

**Description** (1,985 of 4,000):

```
Pexi is a price checker for shoppers. Point your camera at a barcode, or type what the product is, and Pexi tells you whether the price is a great price, a good price, a reasonable price or a bad price.

HOW IT WORKS
- Scan the barcode on a product with your camera, or use Manual Search to type its name.
- Enter the price on the shelf tag.
- Pexi compares it with the prices it holds for that product and for similar products, and gives you a verdict you can read at a glance.
- When Pexi has no price of its own for a product, it may show a typical price range that an AI model estimated. Estimates can be wrong.

THINGS YOU CAN DO
- Tell Pexi whether a verdict was right, and correct it when it was not.
- Keep a watch list of products.
- See your past scans and ratings.
- Choose a light or dark theme and how blunt Pexi's attitude is.

PRICES COME FROM OPEN DATA AND OTHER SHOPPERS
Product names, sizes and prices come from open data published by other organisations, and from prices that shoppers using Pexi have entered. The data and licences screen in the app credits each source. Pexi is not affiliated with any store or brand. Coverage is limited, so Pexi cannot answer for every product or every store, and prices change.

PRIVACY
There is no account and no sign-in. Pexi does not upload photos or camera images. Location is off until you turn it on, and then only a rough area about one kilometre wide is sent. Pexi records what you scan and type and how you use the app, and you can ask for it to be deleted from the You screen. The full details are in the privacy policy.

GOOD TO KNOW
- Pexi needs an internet connection to answer.
- Prices and estimates are information only. Check the price at the till.
- Pexi is for people aged 18 and over.
- Pexi is free to use. Pexi Plus, an optional subscription for 100 barcode scans a week instead of the free 10, costs CA$3.99 a month or CA$29.99 a year and renews automatically until you cancel it in your Apple ID settings.
```

**Keywords** (91 of 100; no spaces after commas; none of the words in the name or subtitle: pexi, is, this, price, a, good, deal):

```
grocery,barcode,scanner,compare,cost,Canada,checker,shopper,store,groceries,lookup,estimate
```

**Primary category:** Shopping
**Secondary category:** Utilities (optional; the store accounts packet, `docs/the-store-accounts-packet.md` section 3d, lists Shopping and Utilities)

**Copyright:** 2026 Jamin Xu

**Support URL / Privacy Policy URL / Marketing URL:** see OPEN QUESTIONS 1. The three pages in this folder are `index.html` (support), `privacy.html` and `terms.html`. Marketing URL can be left blank.

**Contact address used in the pages:** `useshinapp@gmail.com`. It is the only project address in the repo. `app/public/js/screens/you.js:104` (`DELETE_MY_DATA_EMAIL`) uses the same one, and the existing in-app legal pages use it. No Pexi-named address exists in the repo.

## App Privacy answers (App Store Connect, "Data Types")

Basis: this build, with `FLAGS.photoId` false (`app/public/js/flags.js:82`), onboarding off, market pinned to Canada, catalogue-first on (`app/src/catalogue-first.ts`, `catalogueFirstOn`: on unless its environment setting is `0`, `off` or `false`). Nothing is used for tracking in any row. No advertising, no analytics company, no data broker (no such SDK in `native/package.json`, `native/ios/App/Podfile`, or `app/public`). Apple's rule that data tied to a device identifier counts as linked to the user is why every row is "linked". The privacy manifest (`native/ios/App/App/PrivacyInfo.xcprivacy`) was rewritten 2026-11-05 to match this table row for row, and `app/test/paywall-review.test.mjs` compares the two.

| Apple data type | Collected | Linked to user | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| Identifiers: Device ID | Yes | Yes | No | App Functionality, Analytics | Random UUID made on the phone, `app/public/js/device.js:27` (`getDeviceId`) plus a second random secret, `device.js:64`. Sent on every request as headers, `app/public/js/api.js:204-219`, and in bodies. Every scan and event row is keyed by it: `app/src/scans.ts:73-79` (`device_id`), `app/src/migrations.ts:195-201` (`event.device_id`). |
| Usage Data: Product Interaction | Yes | Yes | No | Analytics, App Functionality | Screens, taps, app opens, visibility, and typed text including text typed and deleted, sent in batches: `app/public/js/track.js:1-45`, `api.js:892` (`postEventsBatch`), stored by `app/src/events.ts:163` (`recordEvent`) in the `event` table. Not gated by any consent: `track.js` has no consent check. |
| Usage Data: Search History | Yes | Yes | No | App Functionality, Analytics | Typed product names and scanned barcodes become `scan.query_text` and `scan.resolved_code`: `app/server.ts:3470` (`/api/identify`), `scans.ts:73-90`. Lines of camera text from `/api/match-text`, `app/server.ts:3817`, `api.js:452`. |
| User Content: Other User Content | Yes | Yes | No | App Functionality, Analytics | Shelf price typed by the person, store picked, verdict corrections and good/bad ratings: `app/server.ts:5016` (`/api/scan-price`), `:4508` (`/api/correction`), `:4748` (`/api/scan-rating`). Text recognised from the camera view is sent as lines, `app/public/js/native-text-reader.js` header and `api.js:452`; the image is not sent. |
| Location: Coarse Location | Yes, only when the person turns location on (off by default) | Yes | No | App Functionality | Location consent default off: `app/public/js/store.js:160`. Grid cell of about 1 km computed on the phone, `app/public/js/geocell.js`; the cell, not the point, is sent: `api.js:85-87`. Server writes nulls into exact-location columns, `app/server.ts` `locationFor`; events and the access log scrub exact pairs, `app/src/events.ts:71`, `app/src/access-log.ts` `scrubUrlPosition`. Cell centre goes to OpenStreetMap Overpass: `app/src/stores.ts:302-318`. |
| Diagnostics: Performance Data | Yes | Yes | No | Analytics | Answer time stored on the scan row (`latency_ms`, packet section 3e lists the columns of migration 2) and `/api/latency`, `app/server.ts:5133`. |
| Diagnostics: Other Diagnostic Data | Yes | Yes | No | Analytics, App Functionality | Script errors and unhandled rejections are sent as events: `app/public/js/track.js:270-285`. Server error log: `app/src/errlog.ts`. IP address, country, user agent, request path and status are written for every request: `app/src/access-log.ts:93-96`. Apple has no separate IP address type; this is the nearest fit (see OPEN QUESTIONS 7). |
| Photos or Videos | No | n/a | n/a | n/a | No image leaves a normal install. The shutter and photo route are off: `app/public/js/screens/camera.js:5245`, `server.ts:4150-4163` (photo route returns "photographs are not sent to a model" while catalogue-first is on). The one exception is a developer-only switch (OPEN QUESTIONS 5). |
| Purchases: Purchase History | Yes (added 2026-11-05 for Pexi Plus) | Yes | No | App Functionality | Subscriptions are sold through Apple's in-app purchase system and RevenueCat's SDK (`app/public/js/purchases.js`, plugin `@revenuecat/purchases-capacitor`). RevenueCat's app user id is the device id (`purchases.js` `ensureConfigured`, `appUserID: getDeviceId().id`), so the purchase history RevenueCat keeps is tied to the device id. The phone also sends Pexi's server an "x-shin-plus" flag once Plus is active (`app/public/js/api.js`). Apple keeps the payment itself; Pexi receives no card or Apple ID details. |
| Contact info, Health and Fitness, Financial Info, Contacts, Browsing History, Sensitive Info | No | n/a | n/a | n/a | No account or sign-in (`native/capacitor.config.json`, no auth code). Payment details stay with Apple (Financial Info: not collected by Pexi). |

RevenueCat (the subscription service) and Apple receive purchase data straight from the phone, not through Pexi's server; RevenueCat receives the device id as the app user id. Third parties that receive data from Pexi's server (none gets the device id): Open Food Facts gets a barcode (`app/src/open-food-facts.ts:116`); Anthropic gets product name, brand, size, category and market only (`identify/src/range-ask.ts:237-240`, "Never an image" at line 12); OpenStreetMap Overpass gets a cell centre (`stores.ts:302-318`). Cloudflare carries the traffic (`mac/01-cloudflare-tunnel.md`; the access log reads `cf-connecting-ip`, `access-log.ts:93`).

## Age rating questionnaire

Apple's questions change; these are the answers and the reasons. The 18+ requirement is in the Terms of Use, which is a term of use and not a content rating; see OPEN QUESTIONS 3.

| Question | Answer | Reason |
|---|---|---|
| Unrestricted Web Access | No | There is no address bar or in-app browser. Links open outside the app: the licences screen (`app/public/js/screens/licences.js:62`), the legal pages (`you.js:429-434`), the store subscription page (`you.js:368`), and a seller link in the price-match line (`camera.js:1318`) that only appears when the server sends one. All links are fixed or come from the server's own data, not from a web search. This is a judgment call (OPEN QUESTIONS 8). |
| User-Generated Content | Yes, minimal | A price one shopper types can feed an answer another shopper sees (packet section 3d, "one shopper saw"; `app/server.ts:5016`). It is a number and a store name, not free text or media, and there is no chat or posting. |
| Messaging and Chat | No | No such feature in `app/public/js/screens`. |
| Advertising | No | No ad SDK or ad code. |
| Profanity or Crude Humor | None | A grep of `voice.js` and `ui-strings.js` for common profane words found none. |
| Alcohol, Tobacco, or Drug Use or References | Infrequent or Mild | The catalogue holds BC liquor store barcodes, names and prices (7,555 products, `app/src/attribution.ts:109-114`), so an alcoholic product can be named in an answer. Nothing promotes or depicts use. "None" is defensible if you think a price list is not a reference (OPEN QUESTIONS 8). |
| Medical or Treatment Information | None | No health content. |
| Mature or Suggestive Themes, Horror, Sexual Content or Nudity, Violence, Realistic or Cartoon, Guns or Weapons | None | No such content in the app. Pexi is a mascot-led price checker. |
| Simulated Gambling, Contests, Loot Boxes | None | Draws, sweepstakes and cash bounties were ruled out (`RULINGS.md`, "Reward mechanics: five in, four killed"). |
| Parental controls, age assurance | No | None built. |

Expected result: 4+ (or the lowest tier Apple's form gives after the alcohol answer). The packet expected 4+ (`the-store-accounts-packet.md` section 3d); it did not answer the questionnaire.

## App Review notes

```
Pexi is a price-checking app for shoppers in Canada. There is no account, no sign-in, no invite code to type and no demo login. Nothing needs to be entered to start.

The app needs an internet connection and talks to our server to answer. If it ever shows no answer, please retry in a few minutes.

First launch: the app asks about camera and (optionally) location on its first screen. Location is optional and off by default; you can tap Continue with it off. Then a short data screen, then the camera.

Without a barcode or a product in front of you:
1. On the first screen, tap "See a demo scan" for a sample verdict.
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
5. **Developer-only camera-frame read.** A hidden Developer row can send a camera frame to Anthropic for a barcode nothing else names (`app/public/js/dev-mode.js:48-59`; server refuses unless the device is on the server's developer list, `server.ts:2487-2492`). Shoppers do not get it. If a reviewer opens the app with `?dev=1` it could show; unlikely in a native build. If you want zero risk, remove the row for the store build.
6. **The privacy manifest and these answers. RESOLVED 2026-11-05.** `native/ios/App/App/PrivacyInfo.xcprivacy` was rewritten to the table above, row for row (all linked, no Photos or Videos, Purchase History added), and `app/test/paywall-review.test.mjs` fails if the two drift apart.
7. **IP address.** The server logs it for every request (`access-log.ts:93`). Apple has no IP-address type; I placed it under Other Diagnostic Data. The privacy policy states it in words.
8. **Judgment calls.** Unrestricted Web Access (No) and Alcohol (Infrequent or Mild) above. I could not check how Apple's current form scores them.
9. **Which model providers the live server actually uses.** The code still has Gemini paths, off while catalogue-first is on (the default; `NOW.md:112-116` says Gemini serves no shopper answer since 2026-09-28). If the live Mac turns catalogue-first off, photos and Gemini come back and the policy, the age answers and the data answers change. Confirm the Mac's environment. The privacy policy names only Anthropic, Open Food Facts, OpenStreetMap Overpass, Cloudflare and Apple.
10. **Claims I could not source.** That Cloudflare is in front of the production server (only the Mac setup documents say so). That other shoppers are not shown a device identifier (the code uses the invite name as the witness, `invite.ts` `reportWitness`, but I did not trace the display). Where the server physically runs, so the policy says nothing about transfers outside Canada.
11. **Retention.** I found no code that deletes scan, event, rating or log rows on a schedule (only a photo sweep, off by default, `app/src/photos.ts:77`, and per-rating deletion, `ratings.ts:159`). The policy says there is no automatic deletion. If you want a stated period, it has to be built first.
12. **Contact address.** Only `useshinapp@gmail.com` exists. The address carries the project's old name. A Pexi-named address would need a domain; none is held (`RULINGS.md` "Name" notes pexi.com and pexi.app are held by others, `getpexi.app` was free 2026-10-01).
13. **Attachment for review.** The notes above assume you attach a barcode image of UPC-A 055773000795. The repo documents this barcode scanning to a catalogue answer (`docs/walkthrough-e2e-2026-10-06.md` line 12) but I did not re-run it, and the catalogue on the live server may differ. Test the typed example and the barcode against the live server before submitting. The typed name "McCain Tasti Taters" was logged as giving a wrong verdict on 2026-10-06 (D04 in that file); I do not know whether it was fixed.
14. **Description claims to check.** The description no longer says estimates are labelled; I could not trace where the app marks one, so it says only that they can be wrong. "Keep a watch list" and "past scans and ratings" come from the You screen actions (`you.js`, `watchlist`) and strings (`you_ratings`); confirm both are reachable in this build.
15. **Hard rule on savings.** The description makes no savings claim, per `CLAUDE.md` hard rule 2 and `RULINGS.md` "No savings claim ships until it is measured". The You screen has a "Savings overview" row; I did not read what it shows.
