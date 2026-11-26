# Legal review A: privacy and data flows (Pexi 1.0)

Prepared 2026-11-26 for a lawyer to check. Not legal advice. Facts are from the code in C:\shin as of
commit time; requirements are quoted from primary sources fetched 2026-11-26 (URL and section given). Anything
not checked is marked UNVERIFIED. "Doc" = `app/public/js/legal/document.js` (effective 2026-11-25, the one
Terms, Privacy and Data document; hosted copies are built from it).

Owner: Jamin Xu, sole individual, Ontario; named in the Doc as person in charge of personal information
(`document.js:49`).

## 1. Facts from the code

### 1a. What is collected, where it goes, how long it is kept

| Item | Fact | Where it goes | Kept | file:line |
|---|---|---|---|---|
| Random device id + 64-hex secret | made once on the phone (`crypto.randomUUID`), localStorage, plus iPhone Keychain; sent on every request | own server; also RevenueCat as app user id | scan/rating/pick/offer/answer rows: id replaced after 24 months; see gap G6 for tables not swept | `device.js:12,31`; `retention.ts:34,46-55` |
| Scans and typed text | barcode digits or typed text, answer, outcome, time, app version, platform, latency, store picked | own server (`scan`, `query_text`) | row stays; only the device id is stripped at 24 months, the typed text stays | `scans.ts:74-91`; `retention.ts:46-55` |
| Camera text lines | recognised on the phone, text lines (not image) sent to find products | own server | stored with the scan | Doc `document.js:99` |
| Typed shelf price, store, corrections, ratings | stored with scan; may be shown to other shoppers; Doc claims a perpetual irrevocable licence | own server (corrections db, scan_rating) | device id off at 24 months; price kept | `retention.ts:46-55,92-100`; Doc "contrib" |
| Network code | salted hash of IPv4 /24 or IPv6 /48 stored on picks and typed prices; salt kept in a file | own server | removed with device id (net_hash set NULL) | `network-hash.ts:3-9`; `retention.ts:49` |
| Usage events | app opens, screens, taps, errors, typed search text, in batches | own server (`event` table, device id + payload) | deleted at 12 months | `track.js:1-45`; `migrations.ts:195-204`; `retention.ts:33,66` |
| Server request log | time, URL, status, IP (from Cloudflare header), country, user agent, referer, invite label | own server file | 90 days (sweep runs daily); stdout log archives 14 days by default | `access-log.ts:90-107`; `retention.ts:32,124`; `server.ts:4877-4890`; `mac/16-rotate-logs.sh:9` |
| Location | phone rounds to 0.01 degree (about 1.1 km by 0.8 km) cell; exact point never leaves the phone; server writes null into exact columns | cell: own server (only if consent row true); centre of cell: OpenStreetMap Overpass (overpass-api.de), sent by the server, so Overpass sees the server's IP, not the phone's | cell kept on the scan row | `geocell.js:68-86`; `api.js:102`; `server.ts:2398-2440`; `stores.ts:302` |
| Acceptance record | version, time, claude/usage/photos/location all true; written as event and as server consent row | own server | consent row has no sweep (G6) | `agree.js:39-60`; `consent.ts:119` |
| Purchases | RevenueCat SDK in the app configured with device id as app user id; server also asks RevenueCat for the device id's entitlement | RevenueCat (US per the Doc and the Quebec note) | RevenueCat's own; deletion at RevenueCat is a manual step | `purchases.js:82`; `scan-quota.ts:387`; `scripts/privacy/device-data.mjs` header |
| Crash data | JS errors: build, message, file, line, stack; no device id | own server `/api/client-error` | UNVERIFIED how long stored | `crash-report.js:4-5,35`; `server.ts:4333` |
| Photos | not uploaded; `FLAGS.photoId` false; no shutter, photo route refuses | none | n/a | `flags.js:82` |
| Ads / analytics SDKs | none found in app code; iOS privacy manifest says no tracking | none | n/a | `PrivacyInfo.xcprivacy` (NSPrivacyTracking false) |

### 1b. Calls to AI services

- Anthropic Claude, text only, model `claude-haiku-5-5`, no tools: system prompt plus a user message of exactly
  `Product, Brand, Size, Category, Country, Currency` plus a fixed question (`range-ask.ts:222,234-262`). Typed
  words are the "Product" when the name was not recognised; capped at 160 chars (`server.ts:1720`). No device id,
  IP or location in the body. Every answer is logged and cached 90 days, with the product text, no device id
  (`range-ask.ts` header, steps 2 and 6).
- Claude pack read of a camera frame (an image) exists but is refused for every shopper: developer-only
  (`server.ts:1826-1853,1860-1870`). Not a shopper flow.
- Gemini (Google): not called by any shopper path; RULINGS.md "Pexi uses Gemini for nothing" (2026-11-07) says
  dead code. A `gemini_call` table still exists with a device id column (`migrations.ts:497`, `retention.ts:54`).
  Your brief said Claude; the code agrees for text, and the older `notes/store-privacy-declarations-draft.md`
  describing photos going to Gemini is out of date.
- Gate: `x-shin-claude: 1` header, set by the phone after Accept; the server makes no Claude call without it
  (`server.ts:999-1002,1678-1680`; `api.js:332`). The header is client-asserted, not a stored consent record.

### 1c. Consent, switches, deletion, age

- One consent: "Accept and continue" at first launch (and again for an install that accepted version 2). It writes
  usage, Claude, photos and location all true in one press (`agree.js:39-60,75`). No switches remain: the You
  screen has only a row that reopens the document (`you.js:380-392`; `track.js:68-70`). Location still needs the
  phone's own permission (`agree.js:20-21` comment). Decided by the owner 2026-11-25 (`agree.js:2-7`).
- Deletion path: You screen "Delete my data" opens an email to usepexiapp@gmail.com with the device id; deletion
  is by hand with `scripts/privacy/device-data.mjs`; backups age out (14 nights on the Mac; off-site copy kept 15
  days) (`you.js:112-141`; `device-data.mjs` header; `mac/14-offsite-backup.sh:21`). No in-app erase button.
  The Doc promises an answer in writing within 30 days (`document.js:172`); internal target 7 days
  (`docs/privacy/data-requests.md`).
- Age: no age gate, no birth date, no account. Doc says all ages, asks under 14 to ask a parent
  (`document.js:75-76`). Apple rating 4+ per `docs/privacy/children-record.md` section 1.
- Server is on the owner's Mac in Ontario (`docs/store/quebec-transfer-note.md`, owner 2026-11-07). Requests pass
  through Cloudflare's tunnel (Doc `document.js:134`). Off-site backup to Cloudflare R2 per commit 90351bf message
  (owner 2026-11-22); R2 region and the actual configured destination are UNVERIFIED (`mac/config.env.example:215-216`
  leaves it blank).
- Where the Doc says data may leave Canada: `document.js:142` ("some are outside Canada, including in the United
  States and the European Union, where privacy law differs"). It does not say the server is in Ontario, and does not
  say foreign authorities may access the data.
- Scale (to place CCPA thresholds): the PC's development copy of scans.db shows 12 real device ids, 208 scans
  (2026-09-08 to 2026-10-07); production data is on the Mac and was not counted. Pre-launch, so nowhere near 100,000.

## 2. Requirements (primary sources)

| # | Requirement | Source |
|---|---|---|
| R1 | Consent is only valid if the person can reasonably be expected to understand what they agree to | PIPEDA s. 6.1, https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html |
| R2 | An organization shall not, as a condition of supplying a product or service, require consent to collection, use or disclosure beyond what is required for the explicitly specified, legitimate purposes | PIPEDA Sch. 1 cl. 4.3.3 (same URL) |
| R3 | An individual may withdraw consent at any time, subject to legal or contractual restrictions and reasonable notice; the organization informs them of the implications | PIPEDA Sch. 1 cl. 4.3.8 |
| R4 | OPC: individuals "cannot be required to consent" to uses that are not integral to the service; clear yes/no options; express consent where sensitive or outside reasonable expectations; right to withdraw; name the parties information is shared with | OPC Guidelines for obtaining meaningful consent, https://www.priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/ (principles 1 and 3; "Determining the appropriate form of consent"; "Withdrawing consent") |
| R5 | Children: OPC position is that anyone under 13 cannot consent; parent or guardian must | same OPC page, section "Consent and children" |
| R6 | Transfer for processing is a use, no extra consent, but organizations must make plain that information may be processed in a foreign country and may be accessible to that country's law enforcement and national security authorities, ideally at collection | OPC Guidelines for processing personal data across borders, https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/ (Summary of Key Findings; "What should individuals expect?"; ties to cl. 4.1.3) |
| R7 | Organization remains responsible for information transferred to a third party for processing and must use contractual or other means to give comparable protection | PIPEDA Sch. 1 cl. 4.1.3 |
| R8 | Retention: guidelines with minimum and maximum periods; destroy, erase or make anonymous when no longer needed | PIPEDA Sch. 1 cl. 4.5.2, 4.5.3 |
| R9 | Access on request, answer within 30 days | PIPEDA Sch. 1 cl. 4.9.1; s. 8(3) |
| R10 | Report breaches with real risk of significant harm to the Commissioner | PIPEDA s. 10.1(1) |
| R11 | PIPEDA offence fines: up to $10,000 summary, up to $100,000 indictable (s. 28). Which acts s. 28 covers was not read; UNVERIFIED. PIPEDA has no general administrative fine | PIPEDA s. 28 |
| R12 | Quebec: person in charge, title and contact published on the website | Act respecting the protection of personal information in the private sector (P-39.1) s. 3.1, as enacted by S.Q. 2021 c. 25 (Bill 64) s. 107; text read from https://www.publicationsduquebec.gouv.qc.ca/fileadmin/Fichiers_client/lois_et_reglements/LoisAnnuelles/en/2021/2021C25A.PDF (legisquebec and canlii returned 403, so the current consolidation was not read; later amendments UNVERIFIED) |
| R13 | Quebec: governance policies including keeping and destruction, published in plain language | P-39.1 s. 3.2 |
| R14 | Quebec: privacy impact assessment for any project to acquire, develop or overhaul an information or electronic service system | s. 3.3 |
| R15 | Quebec: at collection tell purposes, means, access/rectification rights, right to withdraw consent, names or categories of third persons who receive it, possibility of communication outside Quebec | s. 8 |
| R16 | Quebec: technology that can identify, locate or profile: first inform of the use and of the means to activate those functions | s. 8.1 |
| R17 | Quebec: confidentiality policy on website | s. 8.2 |
| R18 | Quebec: a product with privacy settings offered to the public must default to the highest level of confidentiality without any action by the person | s. 9.1 |
| R19 | Quebec: consent clear, free, informed, for specific purposes, requested for each purpose, in plain language; if in writing, presented separately from other information; under 14 consent by parent; consent not given in accordance with the Act is without effect. Use without consent only for consistent purposes, benefit of the person, security/fraud, or what is necessary to provide the service requested | ss. 12, 14 |
| R20 | Quebec: before communicating personal information outside Quebec, a privacy impact assessment weighing sensitivity, purposes, protection measures including contractual, and the destination's legal framework; communicate only if adequate protection; written agreement; same where an outside person is entrusted to keep or use it | s. 17 (Bill 64 s. 111) |
| R21 | Quebec: destroy or anonymize when purposes are achieved | s. 23 |
| R22 | Quebec penalties: administrative penalty up to $10,000,000 or 2% of worldwide turnover, if greater (natural person $50,000); penal fine for contravening the Act $15,000 to $25,000,000 or 4% of worldwide turnover (natural person $5,000 to $100,000); doubled on repeat | ss. 90.12, 91, 92.1; CAI summary https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/sanctions-entreprises-poursuites |
| R23 | Whether P-39.1 binds an Ontario developer's handling of Quebec residents' data is a legal question not answered by these sources. The Doc applies it voluntarily (names the CAI, a 30-day answer, a register) | lawyer to confirm |
| R24 | CAI explanation of valid consent (manifest, free, informed, specific, granular, distinct, temporary, plain) and of outside-Quebec communication (inform, consent, EFVP, written agreement) | https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/consentement-personnes-entreprises ; .../utilisation-communication-renseignements-personnels (summaries, no legal force) |
| R25 | COPPA: "child" is under 13; persistent identifier and geolocation to street and city level are personal information; a general-audience service is covered only with actual knowledge it collects from a child; a device id used solely for internal operations is excepted; civil penalty up to $53,088 per violation | 16 CFR 312.2 (https://www.ecfr.gov/current/title-16/part-312/section-312.2); FTC COPPA FAQ A.2, C.5, B.2 https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions |
| R26 | CCPA business thresholds: gross annual revenue over $25 million (CPI-adjusted upward, current figure UNVERIFIED), or buy/sell/share personal information of 100,000 or more California residents or households, or 50% or more of revenue from selling California residents' information | California AG, https://oag.ca.gov/privacy/ccpa (FAQ A.5). Statute 1798.140(d) itself returned 403. Pexi is under all three on the numbers above (no revenue figure was checked) |
| R27 | Google Play: privacy policy link in Play Console and in the app; in-app disclosure of data access, collection, use and sharing, with consent granted before collection, where not within reasonable expectation; handle data securely over HTTPS; accurate Data safety section, developer responsible; requirements also apply to third-party AI integrations; persistent device identifiers must not be linked to other personal data (the policy's stated exception wording was not read) | https://support.google.com/googleplay/android-developer/answer/10144311 (User Data policy) |
| R28 | Google Data safety: "collect" means transmitting off the device; "sharing" excludes transfers to a service provider processing on the developer's behalf; inaccuracy leads to "blocked updates or removal from Google Play"; optional collection only if all users can opt in or out, otherwise "required"; must say whether a deletion mechanism exists (no mechanism prescribed) | https://support.google.com/googleplay/android-developer/answer/10787469 |
| R29 | Google account deletion requirement applies to apps with account creation; Pexi has none, so not applicable | same policy page (account deletion paragraph) |
| R30 | Apple 5.1.1(i): policy must identify data, how collected, all uses; confirm third parties give equal protection; explain retention/deletion and how a user can revoke consent and request deletion | https://developer.apple.com/app-store/review/guidelines/ 5.1.1(i) |
| R31 | Apple 5.1.1(ii): apps collecting user or usage data "must secure user consent ... even if ... anonymous"; "Paid functionality must not be dependent on or require a user to grant access to this data"; "must also provide ... an easily accessible and understandable way to withdraw consent" | same, 5.1.1(ii) |
| R32 | Apple 5.1.1(iii) data minimisation; 5.1.1(iv) do not "manipulate, trick, or force people to consent to unnecessary data access" | same |
| R33 | Apple 5.1.2(i): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so"; "may not require users to enable system functionalities (such as ... location services)"; violation "may be removed from sale" and may end Developer Program membership | same, 5.1.2(i) |
| R34 | Apple 5.1.1(v): account deletion only where the app supports account creation: not applicable | same |
| R35 | Apple App Privacy: "collect" = transmitted off device and accessible longer than needed to serve the request in real time; data is linked to identity via account, device or other details unless de-identified before collection; device-level IDs are in the Identifiers category | https://developer.apple.com/app-store/app-privacy-details/ |
| R36 | Apple 5.1.4 and 1.3: apps that can share personal information of a minor must have a privacy policy and comply with children's statutes; third-party analytics and ads are barred only in the Kids Category | Apple guidelines 5.1.4, 1.3 |

Not retrieved: the OPC Children's Privacy Code (the OPC kids page lists child-facing Code resources dated
October and November 2026 but states no formal status; https://www.priv.gc.ca/en/privacy-topics/privacy-and-kids/);
`docs/privacy/children-record.md` treats it as the standard. Status UNVERIFIED.

## 3. Gap table

Severity order is by the named cost, highest first. "OK" rows are at the end.

| ID | Requirement | What Pexi does (file:line) | Gap or OK | Named cost if wrong | Smallest fix |
|---|---|---|---|---|---|
| G1 | R19 (Quebec s. 14 separate, per-purpose consent); R2, R4 (PIPEDA 4.3.3, bundled consent); R31 (Apple 5.1.1(ii)) | One "Accept and continue" under a 600-line document covers usage recording, Claude, location, photos, model training and others in one tap (`agree.js:39-60`; Doc `document.js:39,111-122`). Training and tuning on collected scans and usage analytics are not needed to answer a scan | GAP | Quebec: consent "without effect", AMP up to $10M or 2% turnover, penal fine $15k to $25M or 4% (ss. 14, 90.12, 91) if P-39.1 binds Pexi (R23); PIPEDA: OPC finding, no fixed fine; Apple: rejection or removal under 5.1.1(ii), 5.1.2(i) | Keep one Accept for the service itself. Add a second, optional, default-off screen for "help improve Pexi" (usage analytics, using scans to train) with a single switch that can be changed later in Settings. Service data (barcode, answer, quota, security log) stays in the first Accept |
| G2 | R3, R4, R31 (right and easy way to withdraw consent); R30 (policy says how to revoke) | No in-app way to withdraw any part; the only route is email to delete everything (`you.js:380-392,418`; Doc `document.js:156,165`). Doc says nothing about withdrawing consent as such | GAP | Apple 5.1.1(ii) requires an "easily accessible" withdrawal path: rejection; PIPEDA 4.3.8; Quebec s. 8(4) must inform of the right to withdraw | One Settings row "Privacy choices" holding the G1 switch, plus a sentence in the Doc: "You can withdraw at any time in Settings, or by email; here is what stops working" |
| G3 | R33 (Apple 5.1.2(i) explicit permission before sharing personal data with third-party AI); R27 (Play: in-app disclosure, consent before collection, also for AI) | The only data sent to Claude is product name, brand, size, category, country (`range-ask.ts:243-262`) but typed words can be the name (160 chars, `server.ts:1720`) so personal text could reach Anthropic. Permission is the bundled Accept; no separate prompt (`server.ts:999-1002`). Earlier design had a switch; removed 2026-11-25 | GAP (judgment: Apple may treat product names as not personal data) | Apple: rejection or "removed from sale" (5.1.2(i)); Google: Data safety/user data policy enforcement | Cheapest: only send Claude a name that matched or resembled a catalogue/product string; never send raw free text longer than a product name, and say so in the Doc. Or a plain one-time sheet "Pexi will send this product name to Anthropic's Claude for a price estimate. Allow / Not now" when the first estimate is needed |
| G4 | R6 (OPC cross-border notice incl. foreign authority access); R15 (Quebec s. 8 possibility of communication outside Quebec); R20 (s. 17 PIA and written agreement per recipient) | Doc says some services are in the US and EU "where privacy law differs" (`document.js:142`). It does not say foreign authorities may access it. No PIA per recipient; `docs/store/quebec-transfer-note.md` is a draft, assumes recipients' standard terms, still says Claude is "only with the shopper's yes ... changeable on the You screen" (stale), and lists open questions 2 and 3 unanswered | GAP | OPC finding; Quebec s. 17 breach is a contravention: s. 91 fine (above) | Add to Doc: "Information sent to services in the United States may be accessed by that country's courts, law enforcement and national security authorities." Update and sign the transfer note per recipient (Anthropic, RevenueCat, Cloudflare incl. R2), recording the contract used and the US legal framework (s. 17 factors 1 to 4); keep with the written terms |
| G5 | R30 (Apple 5.1.1(i) policy accurate); R28 (Play: form must be accurate, enforcement is removal); R35 (App Privacy must match behaviour) | Store listing drafts still say "Location is off until you turn it on" and "You can turn usage data off" (`docs/store/listing.md:46`; `docs/store/play-listing.md:38,80,83`); Play Data safety draft is derived from the 2026-11-21 policy and marks usage and location "optional"; `docs/privacy/children-record.md` section 3 and the transfer note still describe switches. Code now has no switches (`you.js:380-392`) and the accept press sets location and usage on (`agree.js:58`) | GAP (documents, not code) | Play: "blocked updates or removal"; Apple: rejection if App Privacy or metadata contradicts the app | Edit the five documents to match: location and usage are part of using Pexi, location still needs the phone's permission. Declare usage as collected, not optional (R28: optional only if every user can opt out); redo the Play form from the 2026-11-25 Doc |
| G6 | R8, R21 (retention promise and destruction); Apple 5.1.1(i) retention | Doc promises device id is removed from "scans, ratings and prices" after 24 months and request logs at 90 days, events at 12 months (`document.js:147-157`). Code strips the id only from the 8 tables in `retention.ts:46-55` (and corrections/shopper prices). Tables carrying a device id with no sweep: `consent`, `device_key` (hash of the secret), `device_preference`, `device_user`, `plus_seen` in scans.db (checked on the local copy schema), and `device_person` in people.db (beta testers). Typed text in `query_text` and in events stays after the id is removed; Claude answer log and 90-day cache keep product text | GAP (partly acknowledged in `docs/privacy/data-requests.md`) | PIPEDA 4.5.3 / Quebec s. 23: OPC/CAI finding; false statement in policy risks Apple 5.1.1(i) and Play accuracy enforcement | Add those tables to the daily sweep (delete rows older than 24 months by last activity), or reword the Doc to "the records tied to your device are kept until you ask for deletion, or 24 months for scans" |
| G7 | R9, R30 (access and deletion, 30 days, identity check) | Email only, manual script run, ID check relies on the device id arriving in the mail and a "two-products" question (`docs/privacy/data-requests.md` section 3, marked ASSUMED). Backups drop copy in about 15 days; RevenueCat deletion is a manual step | OK with a weak spot | PIPEDA 4.9; Quebec s. 32: silence after 30 days counts as refusal; a mis-identified delete or export discloses someone's data (s. 10.1 breach duties) | Keep. Log each request with a date (the log exists). Consider the CAI/OPC wording when replying; no code change |
| G8 | R25 (COPPA); R5 (OPC under 13); R19 (Quebec under 14) | No age gate; Doc says all ages, asks under 14 to ask a parent (`document.js:75-76`). Collects persistent device id and, with the phone's permission, a 1 km location cell from anyone (`agree.js:58`). No actual knowledge of child users | OK for COPPA on these facts (general audience; actual knowledge only); Quebec under-14 consent by a parent is not obtained from children who tap Accept themselves | COPPA: up to $53,088 per violation only if Pexi is directed to children or learns a user is under 13 and keeps collecting; Quebec: s. 14 minor consent invalid, then s. 91 fine | Do not market to children (store text already avoids it; mascot is a risk factor under 312.2 "animated characters"). Keep the delete-on-request path for parents. Lawyer to confirm the 4+ rating plus mascot does not tip "directed to children" |
| G9 | R16 (Quebec s. 8.1 identify, locate, profile); R18 (s. 9.1 default settings) | Location is used and the Doc discloses it (`document.js:105`); the app has no privacy settings left, so s. 9.1 may not be engaged, but acceptance sets the server consent row to location true and photos true by default (`agree.js:58`), the reverse of the earlier default-off ruling in `consent.ts` header. Usage events and device preferences could be called profiling | JUDGMENT, flag for lawyer | s. 91 fine if wrong | If G1 fix is done, defaults to off for the optional screen satisfy s. 9.1 and the s. 8.1 "means to activate" point (the phone's location permission) |
| G10 | R12 to R14, R17 (Quebec governance) | Person in charge named with contact (`document.js:49`); incident register and breach plan exist (`docs/privacy/breach-plan.md`). No PIA record for the system itself (s. 3.3); governance policy on keeping and destruction is the Doc's keep section plus G6 | PARTLY OK | s. 91 fine | One-page PIA for the system and for each non-Quebec recipient (merge with G4) |
| G11 | R6, R7 unverified facts | Off-site backup destination (Cloudflare R2 per commit message) not confirmed in repo config; third-party SDK data collection by RevenueCat (IP, device attributes) is described only generically (`document.js:104,139`); MediaPipe's bundled code contains a Google logging endpoint (`odml.pa.googleapis.com/v1/log`, `chunks/vision_bundle-QFUEQ3YV.js:2611`) but the model file it needs is absent from `app/public/js/vendor/`, so it should not load. Not confirmed by a network capture | UNVERIFIED | Undisclosed third-party transfer would break Apple 5.1.1(i) and Play accuracy | Run a network capture of a fresh install on both platforms and list every host contacted; confirm R2 region; check that the MediaPipe bundle is not shipped |
| OK1 | R1, R4 (informed, name recipients) | Doc names Anthropic, Open Food Facts, Overpass, Cloudflare, RevenueCat, Apple, Google and what each receives (`document.js:125-143`); matches code | OK | | |
| OK2 | R27, R30 (policy reachable in app and in store) | Document reachable in Settings read-only (`you.js:380-392`); hosted pages built from the same source with a test | OK | | |
| OK3 | R34, R29 (account deletion) | No accounts | Not applicable | | |
| OK4 | R10 (breach) | `docs/privacy/breach-plan.md`; Doc "Incidents" paragraph (`document.js:174`) | OK (process, not tested) | | |
| OK5 | R26 (CCPA) | Pre-launch, 12 test device ids locally; no ads, no sale | Under every threshold on the numbers above; recheck at growth | n/a | Revisit if California users approach 100,000 |
| OK6 | R28, R35 (collection vs sharing) | Anthropic receives no identifiers, only product text; RevenueCat receives the device id (linked); location cell reaches own server only, Overpass gets the cell centre without any device id | Declarations feasible: device id, usage, search history, other user content, coarse location, purchases, diagnostics, all linked, no tracking (`PrivacyInfo.xcprivacy`) | | Keep iOS manifest and Play form in step with the Doc |

## 4. Facts the lawyer should not assume

- The "Anthropic" flow only sends product text, but "Product" can be whatever a shopper typed (up to 160 characters).
  The policy says so at `document.js:90-92`.
- The Doc says "Pexi's server and most of these services are outside Quebec, and some are outside Canada"; it does
  not say the server is in Ontario or on a personal machine.
- Acceptance is recorded by a header the phone sets and a consent row the phone posts; neither proves who tapped.
- Consent was reversed on 2026-11-25 from default-off with switches to one bundled Accept; any earlier statement in
  the repo (listing drafts, children record, transfer note) reflects the older design.
- Not read: Anthropic, RevenueCat, Cloudflare contract terms; Apple age-rating answers; COPPA 2025 amendments;
  current P-39.1 consolidation; CCPA enforcement fine amounts.
