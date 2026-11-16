# L1 and L3: what the privacy policy, terms and store pages say, against the code

Worker lane: legal-policy. Checked 2026-11-16, repo only (the worktree at origin/main). Nothing was run against production or real data, and nothing was committed.

This is a factual comparison, not legal advice. Where a legal requirement comes up it is written "to confirm", because no source is quoted here.

## What was and was not checked

- Checked: every sentence in `docs/store/privacy.html` and `terms.html` about collecting, sending, sharing, keeping, deleting or a shopper's choices, read against `app/server.ts`, `app/src`, `app/public/js`, `identify/src`, `catalogue/src` and `mac/`. Then `privacy-fr.html` and `terms-fr.html` against the English ones. Then `docs/store/listing.md`, `index.html`, `docs/launch-gaps-2026-11-06.md` items 16 to 23 and `the-store-accounts-packet.md` section 3e.
- Not checked: the live server's settings (caps, invite gate, Cloudflare), the live database contents, the Mac's backup folder, and the live App Store Connect pages (not re-read in this pass). Anything that depends on those says "Cannot tell from code".
- Verdict words: True = the code does what the sentence says. False = the code does something different. Partly = true in one reading or one place, not in another. Cannot tell = the code does not decide it.

## Part 1. Claim table (privacy policy, then terms)

P numbers follow the policy top to bottom. T numbers follow the terms. "Retention" means `app/src/retention.ts`.

| # | Claim (quoted) | Code that decides it | Verdict | Note |
|---|---|---|---|---|
| P1 | "no account, no sign-in, and does not ask for your name, email address, phone number or payment details" | `app/public/js/onboarding-flow.js` (`CAPABILITIES.accounts` false); no auth code in the client; `listing.md` line 85 | True | `device_user` link table exists but is empty by design (migrations). |
| P2 | "Your phone makes a random identifier ... a second random secret" | `app/public/js/device.js:27` and `:64`; server keeps only a sha256 of the secret, `app/src/device-key.ts:61` | True | |
| P3 | "everything Pexi records is tied to it" | `scans.ts` (`device_id`), `migrations.ts:195` (`event.device_id`), `access-log.ts` | True | The user catalogue uses a derived key, `sha256(id)` cut to 16 characters (`catalogue/src/user-catalogue.ts:124`, `:403-407`). Still tied to the device. |
| P4 | "Pexi records what you scan or type, what it answered, and how you use the app" | `scans.ts`, `events.ts:163` | True | |
| P5 | "Location is off until you turn it on" | `app/public/js/store.js:161` (`consent.location: false`); server `consent` table default none (`app/src/consent.ts`) | True | One edge: `store.js:862` falls back to `true` if the consent object is missing. Only reachable with damaged local state. |
| P6 | "only a rough area about one kilometre wide" is sent | Phone snaps to a 0.01 degree cell, `geocell.js`, `api.js:100-110` (cell only with consent). Server re-snaps and nulls the exact columns, `server.ts:2059` (`locationFor`). SQLite triggers refuse new exact values, `migrations.ts:842-858` | True | For new rows. Old rows from before the exact columns were nulled: Cannot tell from code (see finding 7). |
| P7 | "does not upload photos or camera images" | `flags.js:82` (`photoId: false`); photo route returns `no_model_call`, `server.ts:3404-3405` | True | The shutter and shelf-frame routes still exist (`server.ts:2648-2701`, `api.js:209`, `:1027`) and a developer-only row can send a frame to Anthropic (`dev-mode.js:48`, server refuses unless the device is on the developer list). A shopper never reaches them. |
| P8 | "Product names go to Anthropic's Claude AI only if you said yes" | `api.js:244` (header `x-shin-claude: 1` only when `agreement.claude === true`); `server.ts:944` (`claudeAllowed`), `:1533` (`claudeRangeAsk`) | True | Older app, unanswered screen and a "no" all fail toward not sharing. The yes/no is not stored server side; the record of it is the `agreement` event (see finding 10). |
| P9 | "If you said no, Pexi answers with a broad-guess range instead" | `agree.js` header comment; `server.ts:1533-1583` | True | |
| P10 | "Pexi deletes what it records on a stated schedule" | Retention; `server.ts:4326-4363` | Partly | Overstated. Only some tables are swept. Never swept: `consent`, `device_key`, `device_preference`, `device_user`, `device_person` (`admin.ts:69-90`), `user_observation.device_key`, the gap table (`catalogue/src/gaps.ts:41-52`), the Claude answers file (`identify/src/range-ask-store.ts:181-195`, append-only, typed names), and the Mac's stdout and stderr logs (`errlog.ts` writes `deviceId` to stderr, no rotation anywhere in `mac/`). See finding 2. |
| P11 | "RevenueCat ... records the purchase against the same random identifier" | `purchases.js:82` (`appUserID: getDeviceId().id`) | True | |
| P12 | "Pexi never sees your card or Apple ID details" | No such code | True | |
| P13 | "does not use advertising or analytics companies" | No ad SDK in `native/package.json` or `Podfile`. `Podfile.lock`: MLKitCommon 13.0.0 depends on GoogleDataTransport | Cannot tell from code | Google ML Kit (the on-phone text reader) may send its own usage data. What it sends is a vendor fact, to confirm. See finding 6. |
| P14 | "does not track you across other companies' apps" | `PrivacyInfo.xcprivacy`: 8 collected types, all linked, no tracking | True | |
| P15 | "Both are sent to Pexi's server with the requests" | `api.js:204-219`; the id is also put in the URL of identify and search (`api.js:430`, `:632`) | True | The URL carries the id, so the access log holds id, IP and typed text together (finding 5). |
| P16 | "If you delete the app, the identifier is lost and a reinstall gets a new one" | `device.js`; `scan-quota.ts` header comment says the same | True | |
| P17 | "sends the barcode digits ... the text you typed ... the recognised lines of text (not the image)" | `api.js:419` (typed text in the identify URL), `:452` (`/api/match-text`), `server.ts:3817` | True | |
| P18 | "stored with the answer ... whether Pexi answered or could not, any correction, and the time" | `scans.ts:73-90` | True | |
| P19 | "Prices, stores and ratings you enter ... stored with the scan" | `server.ts:5016` (scan-price), `:4508` (correction), `:4748` (rating) | True | |
| P20 | "Text you delete or leave unsent is not recorded" | `events.ts:63-68` | True | |
| P21 | "recorded whether or not you have turned location on" | `track.js` has no consent check | True | |
| P22 | "records that you agreed ... your choice about Claude, and when" | `agree.js` (`track('agreement', record)`) | True | Held only in the `event` table, which is deleted at 12 months (finding 10). |
| P23 | "app version, platform, how long an answer took, language and market" | `scans.ts` (`app_version`, `platform`, `latency_ms`) | True | |
| P24 | Server logs "the time, the web address requested, the response status, your IP address, the country ... and your phone's user agent text" | `access-log.ts:85-107` | Partly | The log also holds `ms`, `method`, `invite` (yes/no), `who` (name tied to the invite code), `shutter`, `referer` and `origin`. `device_person` (`admin.ts:69-90`, fed from `access-log.ts:111-112`) links a device id to that name and is never swept. Not named in the policy. |
| P25 | "RevenueCat records which plan you bought, when it renews and whether it is active" | `purchases.js:228-238` | True | |
| P26 | "Your phone also tells Pexi's server whether Pexi Plus is active" | The phone sends `x-shin-plus` (`api.js:248`). The server ignores it unless `SHIN_PLUS_TRUST_CLIENT=1`; with `REVENUECAT_SECRET_KEY` set it asks RevenueCat itself, `scan-quota.ts:143-185` | Partly | The header is sent but not believed. The truth is the server contacting RevenueCat. The key was set 2026-11-07 (`launch-gaps` item 1). |
| P27 | "Opening the Pexi Plus screen or tapping Restore Purchases contacts RevenueCat and Apple" | `main.js:142` (`void refreshPlus()` at every launch) then `purchases.js:76-91`, `:228-238` | False | RevenueCat is contacted at every app start with the device id, not only from the Plus screen. |
| P28 | "your phone ... rounds it ... Only the grid square is sent. Pexi's server stores the grid square ... and discards any exact coordinates" | As P6; events and log scrub pairs, `events.ts` `scrubPosition`, `access-log.ts:39-73` | True | New rows. |
| P29 | "the shop you pick is stored with the scan" | `scans.ts` | True | |
| P30 | Does not collect "Photos and camera images" | As P7 | True | |
| P31 | Does not collect name, email, phone, contacts, payment | No such code | True | |
| P32 | Does not collect "Your exact location" | As P6 | True | New rows only. |
| P33 | Does not collect "Advertising identifiers" | No IDFA code or SDK found | True | |
| P34 | "Prices you enter can be used in answers shown to other shoppers" | `shopper_price` table, `server.ts:5016` | True | |
| P35 | "using collected scans to train and tune Pexi's own price estimates" | No training code read | Cannot tell from code | The data is kept, so it can be done. |
| P36 | "None of them receives your device identifier" (the list: Open Food Facts, Anthropic, Overpass, Cloudflare, Apple, RevenueCat) | RevenueCat: `purchases.js:82`, and the server calls `https://api.revenuecat.com/v1/subscribers/<deviceId>`, `scan-quota.ts:185`. Cloudflare carries the headers and the URL with the id | False | True for Open Food Facts, Anthropic and Overpass. |
| P37 | "The only one that receives anything about where you are is the shop-finding service" | Anthropic gets "country" (`range-ask.ts:234-240`); Cloudflare sees the IP and country | Partly | Not exact position, but the sentence is wider than the facts. |
| P38 | Open Food Facts "receives a barcode number" | `app/src/open-food-facts.ts:116` | True | |
| P39 | Anthropic receives "name, brand, size, category and country" and typed words if unrecognised; no images, device id or location | `identify/src/range-ask.ts:234-240`, "Never an image" at `:12`; `claudeRangeAsk` builds no device field | True | Anthropic's own retention is a vendor fact, to confirm. |
| P40 | "You can change your answer at any time on the You screen; saying no stops new requests" | `you.js` (`claude-consent`), `api.js:244` | True | |
| P41 | Overpass "receives the centre point of your rough grid square, only when location is on" | `app/src/stores.ts:302-318`, `server.ts:3991` | True | |
| P42 | "Cloudflare carries traffic between the app and Pexi's server" | `mac/01-cloudflare-tunnel.md`; `access-log.ts:93` reads `cf-connecting-ip` | Cannot tell from code | Only the Mac setup documents say it is in front of production. `listing.md` OPEN 10 says the same. |
| P43 | RevenueCat "is contacted by the app itself, not by Pexi's server, and only for Pexi Plus" | `scan-quota.ts:185` (server call with the device id); `main.js:142` (every launch) | False | Both halves. See finding 1. |
| P44 | "does not sell your data and does not share it with advertisers or data brokers" | No such code | True | |
| P45 | "server and most of these services are outside Quebec, and some are outside Canada" | `docs/store/quebec-transfer-note.md`: Mac in Ontario; Anthropic, Cloudflare, RevenueCat outside | Cannot tell from code | Reads as true. The note itself says contracts and log periods are unchecked. |
| P46 | "Server request logs: 90 days, then deleted" | Retention `:32` (90), `:129` sweep, `server.ts:4359` | Partly | True for the access log file only. One unreadable first line stops the whole sweep silently (`retention.ts:144`). The stdout and stderr logs are not covered, and backups copy the access log (`mac/07-backup.sh`). |
| P47 | "Usage events: 12 months, then deleted" | Retention `:33`, `:70` | True | |
| P48 | "after 24 months your device identifier is removed ... no longer tied to your phone" | Retention `:34`, `:46-54` (scan, scan_rating, scan_rating_history, scan_pick, scan_later_answer, scan_act_outcome, gemini_call), `:99`; shopper prices `:99-110` | Partly | True for the listed tables. The kept rows still carry the cell, store, typed query and time, so "no longer tied" means "no id", not "cannot be linked". `consent`, `device_key`, `device_preference`, `device_user`, `device_person` and `user_observation.device_key` keep the id (finding 2). |
| P49 | "Backups of the server can hold a copy for longer until they are replaced" | `mac/07-backup.sh:261-272` (newest 14 kept); `launch-gaps` item 3 (catalogue keeps 3) | True | The folder may be a Dropbox folder (`mac/config.env.example:197`). Not named in the policy (finding 4). |
| P50 | "Deleting the app ... does not delete what the server already holds" | No deletion path | True | |
| P51 | "Turning [location] off ... does not remove ones already stored" | `consent.ts`, retention | True | |
| P52 | "You can ask to see, or delete, the records tied to your device. ... Delete my data ... prepares an email ... Deletion is done by hand." | `you.js:119` and `:129` (a `mailto:` with the device id) | Partly | The email exists. No script, runbook or query in the repo finds one device across scans, people, corrections, user catalogue, gaps, logs and backups. "See" has no export either (finding 3). |
| P53 | "you can say so in the app by answering the question about whether the verdict was right" | `server.ts:4508`, `:4748` | True | |
| P54 | "encrypted HTTPS connection" | `api.js:119` (`BASE` set at build time) | Cannot tell from code | TLS ends at Cloudflare per the setup notes. |
| P55 | Jamin Xu is the person in charge of protecting personal information, at `useshinapp@gmail.com` | Policy text; `you.js:119` | True | A person is named. No procedure behind the title (finding 8). |
| P56 | Children: "asks no one for a name, email address, birth date or account"; "the records tied to that device will be deleted" | `agree.js` (no age question) | Partly | First half True. The deletion promise rests on the manual process in P52. |
| T1 | "Pexi is for people of all ages" | `agree.js` header comment; RULINGS "Pexi is for all ages" | True | No age field anywhere. |
| T2 | An estimate "is labelled that way" | `ui-strings.js:286`, `:342-343` ("An AI estimate; no shop prices found") | True | |
| T3 | AI range "if you agreed to product names being sent to that model" | As P8 | True | |
| T4 | Pexi Plus "gives 100 barcode scans a week, where the free allowance is 10" | `scan-quota.ts` (caps `SHIN_FREE_SCANS_PER_WEEK`, `SHIN_PLUS_SCANS_PER_WEEK`; unset means no cap) | Cannot tell from code | `launch-gaps` item 2 said both were unset on 2026-11-07. If still unset, free users have no limit and Plus buys nothing (finding 9). |
| T5 | "Typed searches are free and are not counted" | `scan-quota.ts` counts `kind = 'barcode'` only | True | |
| T6 | "scans start coming back as the earliest ones pass seven days" | `scan-quota.ts` rolling 7 days (`usageFor`) | True | |
| T7 | "purchases processed by Apple and by RevenueCat" | `purchases.js` | True | |
| T8 | CA$3.99 a month, CA$29.99 a year | Plans come from the RevenueCat offering at run time | Cannot tell from code | Prices live in App Store Connect and RevenueCat. |
| T9 | Licence over what you provide: "perpetual and irrevocable ... publish and share" | `shopper_price`, `user-catalogue.ts` | Cannot tell from code | Consistent with how the code reuses entered prices. Whether it can stand next to the 24-month and deletion promises is a legal question, to confirm. |
| T10 | Open-data ODbL file "available ... on request" | No export tool in the repo | Cannot tell from code | A promise with no procedure behind it. |
| T11 | "The Privacy Policy explains what Pexi collects and how to ask for it to be deleted" | As P52 | True | |

56 privacy claims (P1 to P56) and 11 terms claims (T1 to T11): 67 checked.

Count of verdicts: True 47, Partly 8, False 3, Cannot tell 9. So 11 of 67 are False or Partly.

## Part 2. French pages against English

`privacy-fr.html` has the same 62 paragraphs in the same order as `privacy.html`, and every row above (P1 to P56) says the same in French. Differences in meaning, all of them small:

1. Purchase history paragraph: English says the phone tells the server whether Plus is active "so the weekly scan limit can be lifted". French says "afin d'appliquer la bonne limite hebdomadaire" (to apply the right weekly limit). The French is closer to the truth, but the two do not match. Pick one wording.
2. Because French repeats P26, P27, P36 and P43 unchanged, every fix in findings 1 and 2 must be made in both files.

`terms-fr.html` matches `terms.html` on T1, T4, T8 (100 and 10 scans, CA$3.99, CA$29.99), the all-ages clause and Ontario law. Nothing differs in meaning.

## Part 3. Findings (L3, the policy against the code)

Severity key: High = a stated fact is wrong and a customer or reviewer can see it; Med = a promise or disclosure is thinner than the code; Low = small or unlikely.

**1. The policy says RevenueCat is contacted only by the app, only for Plus, and that no outside service gets the device id. All three are wrong.** Severity High.
- Named cost: App Store rejection or a later correction demand (Apple's rule that the policy matches the label: to confirm); shopper trust; Quebec transparency duty (to confirm).
- Evidence: `app/public/js/main.js:142` (`void refreshPlus()` on every launch) into `purchases.js:76-91` and `:228-238` (configure with the device id, then `getCustomerInfo`). `app/src/scan-quota.ts:185` (the server calls RevenueCat with the device id). The key was set on 2026-11-07 (`launch-gaps` item 1). Policy rows P26, P27, P36, P43. `listing.md` line 87 repeats the error and contradicts its own line 84.
- Smallest fix: change the policy (both languages) and listing.md line 87. Say RevenueCat gets the device id whenever the app opens and when the server checks Plus, and drop "None of them receives your device identifier" for RevenueCat and Cloudflare. No code change needed.

**2. "Pexi deletes what it records on a stated schedule" is wider than what is swept.** Severity Med.
- Named cost: shopper trust; a customer who reads "on a schedule" and asks about a table that has none (Law 25 retention duty: to confirm).
- Evidence: `retention.ts:46-54` lists seven tables. Not in it: `consent`, `device_key` (`device-key.ts`), `device_preference`, `device_user`, `device_person` (`admin.ts:69-90`), `user_observation.device_key`, the gap table, the Claude answers file with typed names (`range-ask-store.ts:181-195`), and the Mac stdout and stderr logs with `deviceId` (`errlog.ts`; `mac/launchd/com.shin.server.plist:46` and `:49`; no rotation in `mac/`). The log sweep also stops silently if the first line is unreadable (`retention.ts:144`).
- Smallest fix: policy first. Reword "on a stated schedule" to "the main records on the schedule below". Code second: add the missing tables and a log rotation to the daily sweep (`server.ts:4326-4363`) and make an unreadable first line a logged failure, not a silent stop.

**3. Access and deletion requests have no working procedure.** Severity Med.
- Named cost: failing to honour a request the policy invites (response time under Quebec and federal law: to confirm); shopper trust. The policy also promises parents that "the records tied to that device will be deleted".
- Evidence: `you.js:119` and `:129` build an email only. No deletion or export script anywhere in the repo. A device's rows sit in at least the scan, people, corrections, user-catalogue and gaps databases, plus logs and backups, and the user catalogue uses a different key (`user-catalogue.ts:124`).
- Smallest fix: code or runbook, not policy. Write one read-only query list and one delete list keyed by the device id and its derived key, and say in the policy how long a request takes. Also decide how to know the writer owns the device (the id in the email is a bearer token).

**4. Backups outlive deletion and may sit in a cloud folder.** Severity Med.
- Named cost: shopper trust; an undisclosed recipient (Dropbox) of device ids, typed text and the access log.
- Evidence: `mac/07-backup.sh:261-272` keeps 14 nights; it copies the access log and all databases. `mac/config.env.example:197` sets `SHIN_BACKUP_DIR=/Users/worker/Dropbox/shin-backup`. The policy says only "backups ... until they are replaced". Live value: Cannot tell from code. `launch-gaps` item 1a says six of nine backup tests failed on 2026-11-07 and were not looked at.
- Smallest fix: read the live folder setting on the Mac. If it is Dropbox or another cloud, either name it in the policy or point the backup at the laptop share. Policy wording on timing is already honest.

**5. The log is richer than the policy lists, and the typed text sits in it.** Severity Low to Med.
- Named cost: shopper trust.
- Evidence: `access-log.ts:85-107` fields `who`, `referer`, `origin`, `method`, `ms`, `invite`, `shutter`; the identify and search URLs carry `deviceId` and the typed words (`api.js:419`, `:430`, `:632`), so each log line ties id, IP and typed text for 90 days. `device_person` (`admin.ts:69-90`) names a person per device and is never swept.
- Smallest fix: policy. Add "the address includes your device identifier and the words you typed". Code option: keep the typed words and id out of the logged URL. Check first whether `who` is only ever a tester name or a shared store-build name.

**6. Google ML Kit may send its own usage data, and the policy says there are no analytics companies.** Severity Med, unproven.
- Named cost: App Store privacy label mismatch (to confirm); shopper trust.
- Evidence: `native/ios/App/Podfile.lock` (MLKitCommon 13.0.0 depends on GoogleDataTransport). `PrivacyInfo.xcprivacy` has no entry for it. The code cannot say what the pod sends.
- Smallest fix: read Google's published data disclosure for the ML Kit text and barcode pods and compare. If it sends data, change the label, the manifest and the policy; if not, no change.

**7. "Rough location ... server stores the grid square, not your exact position" is unproven for old rows.** Severity Low until counted.
- Named cost: a False sentence for any row written before the triggers (`migrations.ts:842-858`) and the migration that nulls the columns (`:877-917`).
- Evidence: `migrations.ts:307-310` (exact columns exist); migration 21 stops new exact values but is not shown here to rewrite old ones.
- Smallest fix: one read-only count of non-null `exact_lat` on the Mac. If any, null them (a data change, then the policy sentence is true).

**8. No breach plan exists in the repo.** Severity Med.
- Named cost: unknown. Breach reporting and record-keeping duties under federal and Quebec law: to confirm. A named privacy officer with no process behind the title.
- Evidence: a search of docs, app, mac, notes and RULINGS for "breach", "incident" and "privacy officer" found only unrelated hits (scraping terms in `decisions.md`, `grounded-record.ts`). The policy names Jamin Xu and `useshinapp@gmail.com`.
- Smallest fix: a one-page runbook (who is told, what is checked first, where the log is, how affected devices are found). Not a policy change. This also depends on finding 3.

**9. The weekly limits may not be on, so the store text may promise something that is not enforced.** Severity Med.
- Named cost: refunds and a Plus subscription that buys nothing (subscription terms accuracy under Apple's rules: to confirm); trust.
- Evidence: `scan-quota.ts` (unset cap means no cap). `launch-gaps` item 2: both caps unset on 2026-11-07, to be set after the sandbox purchase works. Policy, terms, description and support page all say 10 and 100. Live state: Cannot tell from code.
- Smallest fix: code or setting, not text. Check the live Mac settings. Turn the caps on before submission, or the text is wrong.

**10. The first-run record of consent is kept in a table that is deleted at 12 months, and Claude consent is not stored on the server.** Severity Low.
- Named cost: proof of consent (Law 25: to confirm).
- Evidence: Claude consent is a header per request (`api.js:244`, `server.ts:944`); the agreement is an `event` row (`agree.js`), swept at 12 months (`retention.ts:70`).
- Smallest fix: if proof is wanted, copy the agreement row into a table not swept. Policy needs no change.

**11. The camera-frame route exists behind a developer list.** Severity Low.
- Named cost: policy "does not upload photos" would be False for a developer device.
- Evidence: `server.ts:2648-2701`, `dev-mode.js:48`, `listing.md` OPEN 5.
- Smallest fix: leave it, or strip it from the store build. Policy is true for shoppers.

**12. One loose default in the app.** Severity Low.
- Evidence: `store.js:862` (`s.consent?.location ?? true`). Smallest fix: change `true` to `false`. Code.

## Part 4. Apple privacy label (listing.md) against the policy and code

- The label rows (`listing.md` lines 74 to 85) match what is stored: device id, interaction, search history, other content, coarse location, performance, other diagnostics, purchases. All linked, no tracking, no photos. They match `PrivacyInfo.xcprivacy` (the repo test `app/test/paywall-review.test.mjs` compares them).
- `listing.md` line 87 says no third party that gets data from the server receives the device id, and that RevenueCat gets it from the phone. Line 84 and the code say RevenueCat gets it from both. The wording is the same fault as finding 1.
- Missing from the label and policy: the third-party SDK data (finding 6) and the backup recipient (finding 4).
- `the-store-accounts-packet.md` section 3e is stale (photo consent, "shared with third parties: No"). It is the Google Play table and Pexi ships on iPhone only; do not reuse it.
- Whether the answers are what Apple would accept for Anthropic receiving product names (Search History to a third party, not linked): to confirm in the App Store Connect form.

## Part 5. L1, the store pages against the truth (repo only)

Live App Store Connect was not re-read. `launch-gaps` items 16 to 19 and 23 were handed to a browser worker on 2026-11-07 and the result was never recorded, so the live values below come from the 2026-11-07 notes and may have changed.

| Line | Says | Matches the app and RULINGS? |
|---|---|---|
| Subtitle and promo text | "judged against typical prices in Canada" | Yes (Canada only). |
| Description: AI estimate | "may show a typical price range that an AI model estimated. Estimates can be wrong." | Yes. It does not say the range needs the shopper's yes; it is true and not misleading. |
| Description: what you can do | corrections, watch list, past scans, theme and attitude | Screens exist (`screens/watchlist.js`, `pastscans.js`, `you.js`); `listing.md` OPEN 14 says reachability was not confirmed. Not checked in a running build. |
| Description: privacy paragraph | no account; no photo upload; location off, 1 km; "you can ask for it to be deleted from the You screen" | True except the last clause is a prepared email, not a deletion (finding 3). |
| Description: "10" free, "100" Plus, CA$3.99, CA$29.99, renews until cancelled | "Pexi Plus ... 100 instead of the free 10" | Matches RULINGS. Caps enforced on the live server: Cannot tell (finding 9). |
| Description: no savings claim, no photo scanning, no Gemini | no such claims | Matches. Gemini code remains but is off while catalogue-first is on (`catalogueFirstOn`); `listing.md` OPEN 9 asks to confirm on the Mac. |
| App Review notes: "On the first screen, tap 'See a demo scan'" | Stale. The first screen is now "Before you start" (`screens/agree.js`, forced by the router guard `main.js:109`): the reviewer must tick the Terms box and answer the Claude question before anything else. The demo button is on the permissions screen (`permissions.js:81`). Finding 13. |
| App Review notes: "no account, no invite code to type" | True if the invite gate is on and the build carries the code (OPEN 2). Cannot tell from code. |
| App Review notes: "Pexi does not upload photos ... text lines only" | True. |
| Subscription text (notes, terms, support page) | 100 and 10, prices, 24-hour renewal, cancel in Apple ID settings, Restore. Matches. Live caps: finding 9. |
| Age rating table | All answers "None" or "No", UGC "Yes, minimal", expected 4+. Alcohol is "None" at line 100 but "Infrequent or Mild" in OPEN 8. The catalogue holds 7,555 BC liquor products. Line 91 and OPEN 3 still talk about 18+ and a missing checkbox, which the all-ages ruling replaced. `launch-gaps` item 13 still says the terms say 18+ (they do not). The live rating was 12+ on 2026-11-07 (item 18). |
| Availability | `launch-gaps` item 17: 148 countries on 2026-11-07; ruling is Canada only. Not re-read. |
| "unlimited scans" | `launch-gaps` item 16 says the live description and notes said this on 2026-11-07. The repo text does not. Not re-read. |

**13. The App Review notes describe a first screen that no longer exists.** Severity Med. Named cost: App Store rejection or delay (a reviewer who cannot find the demo button, or does not know the Claude question is mandatory). Evidence: `screens/agree.js`, `main.js:109`, `listing.md` lines 111 to 125. Smallest fix: policy-side text. Rewrite the first-launch paragraph as "On first launch tick the Terms box, choose yes or no for the Claude question, then the permissions screen has See a demo scan."

**14. listing.md contradicts itself and the rulings in four places.** Severity Low. Named cost: a wrong answer typed into App Store Connect from this file. Evidence: line 87 against line 84 (finding 1); line 91 and OPEN 3 (18+); line 100 against OPEN 8 (alcohol); several line numbers have drifted (for example the photo route is now `server.ts:3383-3411`, not `:4150-4163`). Smallest fix: edit the file; decide the alcohol answer (how Apple scores a price list with liquor products: to confirm).

**15. The live App Store Connect state is unrecorded.** Severity Med. Named cost: rejection (age rating, countries, "unlimited", no build, Content Rights). Evidence: `launch-gaps` items 16 to 23. Smallest fix: one browser read of the live pages, then record it in `launch-gaps`. Not a code or policy change.

## Findings in one list (order to fix)

1. Finding 1 (High): wrong RevenueCat and device id statements. Policy edit, both languages, plus listing.md line 87.
2. Finding 13 (Med): App Review notes are stale.
3. Finding 9 (Med): confirm the weekly caps are live.
4. Finding 2, 3, 4, 8 (Med): deletion schedule wording, a deletion and access procedure, backup destination, breach runbook.
5. Finding 6 (Med, unproven): Google ML Kit disclosure.
6. Findings 5, 7, 10, 11, 12, 14, 15 (Low or unconfirmed).
