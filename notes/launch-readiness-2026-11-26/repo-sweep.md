# Pexi launch readiness: repo sweep (2026-11-26)

Built from C:\shin at main (last commit 0041631, 2026-11-25 23:18 -0500) by reading the sources below, not from memory. Paths are relative to C:\shin. Nothing was edited except this file. Scope: what is left before a public launch on iPhone and Android, Canada first then US.

Left out on purpose (closed by the owner): domain auto-renew, GitHub two-step login, the plaintext password file, his own employment and school agreements, Aurik's signature on the assignment, GST/HST registration, trademark filing, incorporation and business name.

Labels: "unverified" means the repo has no record after the date given, so it may already be done in a console the repo cannot see. Blocker is for a public launch of the first store, one line why. Owner guess: code, store console, Mac, Jamin decision. Size: S under an hour, M a day or less, L more than a day or calendar-bound.

## Sources and the command that produced each (rerun from C:\shin)

| # | Source | Command or file |
|---|---|---|
| 1 | Defects | `grep -nE '^\| D-[0-9]+ ' DEFECTS.md` (284 rows). Open candidates: `grep -nE '^\| D-[0-9]+ ' DEFECTS.md \| grep -viE '\| \*{0,2}(fixed\|closed\|did not reproduce\|not a defect)[^\|]*\|\s*$'` (about 90, most carry "Closed 2026-10-10" triage text later in the cell and were read by hand). Phone passes owed: `grep -nE '^\| D-' DEFECTS.md \| grep -iE 'not yet seen on a phone'` (17 rows). Fixed-state rows were not re-opened. |
| 2 | Readiness | `docs/launch-gaps-2026-11-06.md` (sections A to G, 102 items), `docs/readiness/needs-jamin.md` (`grep -n '^### R'`), `docs/readiness/register.jsonl` (93 items, all `gap` or `partial` as of 2026-11-21, no later status column, so checked against commits: `git log --since='2026-11-21 20:00' --format='%h %ci %s'`, 131 commits), `docs/readiness/review-2026-11-21/REPORT.md` and `phone-checklist.md`, `comms/messages/2026-11-20-...readiness-register-what-is-left.md`, `2026-11-23-...android-emulator-walk.md`, `NOW.md` |
| 3 | Legal review | `grep -n 'GAP' notes/legal-review-2026-11-26/{A,B,D,E,F}-*.md` (A 6, B 5, D 7, E 7, F 17; C has no GAP rows; G's 49 "GAP" hits are coverage notes for the review itself, not product gaps, and were not rows here). E's "Top gaps 1 to 7" read at E-platform-policies.md:19-25. Each checked against HEAD by grep (`app/public/js/legal/document.js`, `app/public/licences.html`, `docs/store/*`, `price/src/*`) and `git log`. Pages repo: `gh api repos/xu826Jamin/pexi/commits?per_page=3`. |
| 4 | Code markers | `rg -n -i '\bTODO\b\|\bFIXME\b\|\bXXX\b\|not yet\|before launch\|launch blocker'` over app, price, catalogue, identify, native, mac, skipping node_modules, data, vendor, chunks, tests, android, ios: 39 hits, none a launch item (see COD) |
| 5 | Store | `docs/store/listing.md`, `docs/store/play-listing.md`, `notes/play-listing-draft-2026-11-26.md`, `notes/store-privacy-declarations-draft.md`, `docs/store/screenshots`, `docs/store/play-screenshots` (`git log -1 --format=%ci -- <dir>`) |
| 6 | Tests | `node scripts/checks.mjs`: 7 run, 0 failed (scripts tests, hook selftest, guard files, three typechecks, catalogue A7), nothing skipped. This runner does not run the app suite. Skips found by `rg -n -i "skip.{0,80}(mac\|device\|phone\|real)\|runs on the mac\|needs a phone" app/test price/test catalogue/test identify/test scripts/test mac/deploy/test` |

Counts by area (rows below): Apple store 14, Google Play and Android 9, Legal and public pages 16, Money 4, Server and ops 13, Answers and data 9, Phone and device tests 8, Code markers 3, Test runs 3. Total 79.

## Apple store (iPhone)

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| APL-1 | App Store Connect not seen since 2026-11-07: description and review notes said "unlimited scans" (now 10 and 100 a week), availability 148 countries (ruling: Canada only), age rating 12+ (ruling: all ages), Content Rights unanswered, "Part XX Canada compliance: Missing Info", no build attached to 1.0. Items 16 to 23 were handed to a browser worker 11-07; no result is recorded. Unverified | docs/launch-gaps-2026-11-06.md:193-213, 357 | yes: cannot submit with a wrong description and no build | store console | M |
| APL-2 | Upload the 11-24 screenshots 01 to 05 (replace the 5 uploaded 11-09) with the captions from listing.md; set the name "Pexi: Grocery Price Checker" and paste the listing text. | docs/launch-gaps-2026-11-06.md:145-152, 372; docs/store/listing.md; git 6ef8155 | yes: store page sells nothing without them | store console | S |
| APL-3 | Build 13 from ac55830 (Progress tab, camera redesign, five-screen welcome, v5 consent is later at 7f6f255 so is NOT in it) is asked of the Mac; no upload is recorded. Latest recorded on TestFlight is build 12. A new build from 7f6f255 or later is needed for the v5 consent and the 11-25 claims wording, then attach it to 1.0 | comms/messages/2026-11-25-aurik-to-mac-build-13-from-ac55830.md; NOW.md:43; git log 7f6f255 | yes: what is submitted must be the consent and claims the store forms describe | Mac | M |
| APL-4 | App Privacy answers in App Store Connect must match the v5 model (one Accept that covers typed words to Claude, Help improve Pexi pre-ticked, rough location) and the privacy manifest. Unverified in the console | docs/store/listing.md:97, 160; notes/store-privacy-declarations-draft.md:6, 34; E-platform-policies.md:82 | yes: Apple rejects a label that misstates collection | store console | S |
| APL-5 | App Review notes: attach the test barcode (UPC-A 055773000795) and confirm it answers on the live server; invite-gate setting must match the submitted build; re-read the notes text against v5 and "all ages" (OPEN QUESTIONS 3 still says no 18+ box and an 18+ Terms line) | docs/store/listing.md:153-193; launch-gaps:211-213 | yes: reviewer outside Canada with a scanner app and no test steps is a common rejection | store console | S |
| APL-6 | Name collision: one unopenable "Pexi" listing in App Store search. Open it from the owner's account and reserve the name in App Store Connect and Play Console | notes/legal-review-2026-11-26/F-ip-name-security-ownership.md:64 | yes: forced rename after approval is the named cost | store console | S |
| APL-7 | No purchase has completed end to end; sandbox buy, restore after reinstall, and two-phone restore (phone-checklist steps 6 to 9) | launch-gaps:115, 366; docs/readiness/review-2026-11-21/phone-checklist.md:15-21 | yes: first paying customer is the first test otherwise | Jamin (on a phone, Aurik's build) | M |
| APL-8 | RevenueCat setting "Transfer to new App User ID", then the two-phone test; otherwise "I paid and it is gone" on a new phone | docs/readiness/needs-jamin.md:5-25 (R21) | yes: Restore must work for Apple 3.1.1 and refunds | Jamin decision | S |
| APL-9 | Apple server notifications URL pasted in App Store Connect so cancels and refunds reach RevenueCat (production and sandbox) | docs/readiness/needs-jamin.md:26 (R84); launch-gaps:364 | no: a cancelled subscriber keeps Plus a few days | store console | S |
| APL-10 | Paywall Stage 3: yearly trial and store text; conflict between a free-trial suggestion and legal q14 (Quebec free-period rules) | docs/paywall-go-live-2026-11-17.md; launch-gaps:381 | no: can launch without a trial | Jamin decision | S |
| APL-11 | The free limit (10 a week) is live before a test purchase worked: keep on or unset | comms 2026-11-20 message line 31; NOW.md:125-126 | no: a decision, either answer ships | Jamin decision | S |
| APL-12 | Small Business Program enrolment unrecorded (15 percent versus 30 percent) | launch-gaps:368 | no: affects revenue share, not approval | store console | S |
| APL-13 | CocoaPods trunk goes read-only 2026-12-02: confirm no build needs a pod fetch that day | docs/readiness/needs-jamin.md:325 (R70) | no: research says nothing migrated, check before 12-02 | Mac | S |
| APL-14 | Apple age-rating questions re-answered before 2027-01-12; Xcode with iOS 27 SDK from April 2027 (planned server restart) | docs/store/listing.md:130; launch-gaps:454 | no: dated, after launch | store console | S |

## Google Play and Android

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| AND-1 | Play Console app not created on the evidence in the repo. A personal developer account needs 12 testers for 14 days before production access; an organisation account needs a D-U-N-S number. Neither is started | docs/store/play-listing.md:92 | yes: 14 calendar days minimum before public release on Android | Jamin decision | L |
| AND-2 | Pexi Plus cannot be bought on Android: Android RevenueCat key empty, no Play subscription products. Either build them (products pexi_plus_monthly and pexi_plus_yearly, link in RevenueCat) or delete the Plus paragraph from the listing | docs/store/play-listing.md:90; E-platform-policies.md:25 (gap 6); native/config/revenuecat.config.json | yes if Plus is advertised (misleading metadata); no if the paragraph is dropped | store console | M |
| AND-3 | Data safety form to file as drafted for v5: usage "required" or optional per the Help improve choice, Anthropic typed words, approximate location, backups on | notes/store-privacy-declarations-draft.md:34; docs/store/play-listing.md:91; E gap 3 | yes: Play removes apps whose label misstates collection | store console | S |
| AND-4 | Target audience and content rating (IARC): pick 13+ or 18+ for the Play Target audience (Families policy bites below 13), re-read Anthropic's minors article, answer the IARC form from the App Store answers | docs/store/play-listing.md:73-75; E-platform-policies.md:23 (gap 4) | yes: Play cannot publish without both | Jamin decision | S |
| AND-5 | Play screenshots are from 2026-11-21 (camera, shelf price, verdict, You), before the camera redesign (11-22), the Progress tab and Settings changes; retake | docs/store/play-screenshots (git 2026-11-21 21:56); notes/play-listing-draft-2026-11-26.md:69 | yes: store page shows a different app | code | S |
| AND-6 | Play listing draft is older than v5: line 38 says "Pexi asks you once" and "Help improve Pexi ... starts off"; v5 (7f6f255) removed the one-time notice and pre-ticks the choice. Also confirm prices in Play Console and that French is in the build | notes/play-listing-draft-2026-11-26.md:38, 58-60, 69; git 7f6f255 | no: text fix before pasting | code | S |
| AND-7 | First Android bundle (versionCode 1, versionName 1.0.0) upload to a Play track is not recorded; signing uses an upload key held outside the repo. Unverified | git b1ea9ac; bda686e | yes: no Android release exists until it is uploaded | Mac | M |
| AND-8 | Android-only UI: status bar over the camera unreadable (light strip, white icons), "Error injecting safe area CSS" logged at launch, a blank white frame between splash and agree screen | comms/messages/2026-11-23-aurik-to-jamin-android-emulator-walk.md:8-10 | no: cosmetic, one may be the cause of the status bar | code | S |
| AND-9 | The Play sentence about on-device text reading may describe the iPhone only (Android ships with the native camera fallback off): check wording before the form is filed | docs/store/play-listing.md:89 | no: wording check | code | S |

## Legal and public pages

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| LEG-1 | Publish the current Terms and Privacy to the pages repo. Pages last updated 2026-11-25T03:18Z (7a6e80c); docs/store changed after that in 1247dc0 (cross-border, recipients, age position, report a bad entry, retention) and 7f6f255 (v5 consent). The public policy is older than the code | `gh api repos/xu826Jamin/pexi/commits?per_page=3`; git 1247dc0, 7f6f255 | yes: store forms link to these pages and Apple 5.1.1 wants the policy accurate | Jamin decision (his yes publishes) | S |
| LEG-2 | Lawyer read of privacy, terms, French pages and the Quebec note; written transfer assessment per outside service (Anthropic, Cloudflare, RevenueCat, Open Food Facts, Overpass); the Quebec note's three open questions | launch-gaps:219-225, 398; docs/store/quebec-transfer-note.md:26; A-privacy.md:124 (G4) | no: Law 25 penalties are the named cost, his call whether to launch before | Jamin decision | M |
| LEG-3 | "Help improve Pexi" is pre-ticked on the first screen and the Accept button covers typed searches to Claude. Withdrawal from Settings exists. Whether a pre-tick meets Law 25 default settings and Apple 5.1.1(ii) is a lawyer question | git 7f6f255; A-privacy.md:121-123 (G1 to G3); launch-gaps:349 (item 82) | no: Jamin ruled it; named cost is Quebec penalties and an App Review comment | Jamin decision | S |
| LEG-4 | Supplier identity under Ontario CPA s.38: postal address and phone are not shown, only name and email | D-subscriptions-business.md:100 | no: lawyer decides what is required | Jamin decision | S |
| LEG-5 | Yearly plan renewal reminder under Quebec rules (fixed-term over 60 days), or withhold the yearly plan from the Quebec storefront | D-subscriptions-business.md:104 | no: applicability unverified | Jamin decision | S |
| LEG-6 | Kroger API terms 5(e) bar permanent copies; every returned price is stored daily; the repo records its terms as unread and a kill switch now exists (SHIN_EXCLUDED_SOURCES, purge-source). Decide: ask Kroger, hold prices for the cache-header period, or purge | B-data-sources.md:104; price/src/kroger-api.ts:53, 541; git 061b019 | no for Canada, yes before US launch (API cut-off, indemnity) | Jamin decision | M |
| LEG-7 | Open Prices user-agent still has no contact address (Open Food Facts asks for one); R35 offers to add the support address | price/src/openprices.ts:158; B-data-sources.md:108; needs-jamin.md:311 | no: rate-limit or block risk only | code | S |
| LEG-8 | ankane/plu (MIT) notice for the PLU names is not on the licences page | B-data-sources.md:117; app/public/licences.html (no entry) | no: low copyright-notice gap | code | S |
| LEG-9 | Verdict-method note with the measured hit rate (legal q10) and a written test for the headline verdict claim | launch-gaps:399, 440 | no: claims wording was reworded in f23fd5e; note still absent | Jamin decision | M |
| LEG-10 | Crash-report sentence for the privacy policy (R09): the app sends script errors to Pexi's own server; no matching sentence found by grep in the document | docs/readiness/needs-jamin.md:300; app/public/js/legal/document.js (grep crash: none) | no: add one sentence | code | S |
| LEG-11 | Insurance (cyber and tech E&O): decide after the business form is settled | F-ip-name-security-ownership.md:204 | no: no named loss before launch | Jamin decision | S |
| LEG-12 | Near-mark PEXIP read by an attorney or accepted; re-run the name searches the day before launch | F-ip-name-security-ownership.md:62, 65 | no: low | Jamin decision | S |
| LEG-13 | Repository has no licence file: add "all rights reserved" or choose a licence before the repo is shared | F-ip-name-security-ownership.md:173 | no: only matters when shared | code | S |
| LEG-14 | Self-employment tax records: income tax and both halves of CPP, six-year records, Apple pays within 45 days to one bank account | launch-gaps:435 | no: after first sale | Jamin decision | S |
| LEG-15 | Anthropic spend limit and low-balance email on the account that holds the Pexi key; card on file | docs/readiness/needs-jamin.md:154 (R33, R34); launch-gaps:469 | no: the cap alarm exists, this is the second line | Jamin decision | S |
| LEG-16 | French: store listing in French; app French strings (tu and vous mixed, three words for "scan"); French on is shipped (a3250e7) | launch-gaps:398, 459-462; git a3250e7 | no: Quebec contract language is covered by the French Terms | store console | M |

## Money

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| MON-1 | Paid Apps agreement, banking and tax forms were Active on 2026-11-07; unseen since (GST/HST excluded) | launch-gaps:208-210, 367 | no: recheck when in the console for APL-1 | store console | S |
| MON-2 | Set a two-week paywall-to-subscribe target and a continue or stop call | launch-gaps:455 | no: a decision, not a gate | Jamin decision | S |
| MON-3 | 0 of 17 real phones came back on a second day (30 days) and Plus sells only a count (3.1.2); no answer-rate target | launch-gaps:506-507 | no: product risk, not a store block | Jamin decision | M |
| MON-4 | Funnel report exists (scripts/funnel-report.mjs); weekly numbers email (R24) is not built | comms 2026-11-20 message line 8; launch-gaps:338 | no | code | M |

## Server and ops

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| OPS-1 | Hosting: the server is one 8 GB home Mac; broke at 16 users with other jobs running and flat battery on 11-18; 0476263 says launch hosting is a paid server. Pick the host (OVH VPS-2 recommended, Vultr Toronto alternative), port the launchd jobs (1 to 2 days), reload-test with free memory recorded, then switch the tunnel hostname | launch-gaps:465-485, 385-389; git 0476263 | yes: public launch on a laptop that has gone flat once | Jamin decision | L |
| OPS-2 | Outside uptime watcher independent of GitHub (two free sign-ups) and SHIN_DEADMAN_URL for the dead-man job; the GitHub alarm ran every 6 to 9 hours | docs/readiness/needs-jamin.md:128-153; launch-gaps:393, 504 | yes: paying users and a silent outage | Jamin decision | S |
| OPS-3 | Off-site backup repository setting (SHIN_RESTIC_REPOSITORY) was blank on 11-21 and the Privacy page now says Cloudflare holds an encrypted backup copy (90351bf); confirm the repository is set and a restore is proven. Unverified | launch-gaps:509; git 90351bf | yes: the policy states a copy that may not exist | Mac | S |
| OPS-4 | Mac hardening that needs Jamin at the keyboard: sudo boot-survival and disk daemons, FileVault choice, plug in, auto-login and firewall, SSH and Screen Sharing on | launch-gaps:493-498; comms 2026-11-20 message line 21 (R04, R08, R55) | no: moot if OPS-1 moves the server | Mac | M |
| OPS-5 | Deploy main to the live Mac (D-284 identify speed) and reload the 30 s launchd drain plist (code defaults to 12 s until then) | comms/messages/2026-11-25-aurik-to-jamin-deploy-for-identify-speed.md; git d8e9531 | no: speed and clean restarts | Mac | S |
| OPS-6 | Load: typed search is synchronous SQLite on one thread; breaks at 256 continuous users with barcodes in the mix | launch-gaps:389, 418 | no: beta-scale launch is fine, thousands are not | code | L |
| OPS-7 | Cloudflare: cache rule for the 44 MB product pack (or move to R2), challenge page on API routes (R17), large-file clause | launch-gaps:390, 422, 512; needs-jamin.md:287 | no: cost and occasional "busy" | store console | M |
| OPS-8 | Server code not built: R23 hide a barcode or source script, R24 weekly email, R39 live limits in health, R41 refusal counts, R45 cleanup mark, R60 alarm checks legal URLs, R71 and R82 stale-source alarms, R85, R86, R92, R93 | comms/messages/2026-11-20-aurik-to-jamin-readiness-register-what-is-left.md:6-14 | no | code | L |
| OPS-9 | Mac settings that read as red until set: SHIN_BACKUP_DIR (R52), SHIN_WATCH_OPENPRICES_DAYS (R82), update gate APP_VERSION and switch-off list (R13, R14), offline ruling conflict (R67), release checklist lines (R31) | docs/readiness/needs-jamin.md:32, 162-181, 274, 317 | no | Mac | S |
| OPS-10 | Who reads the support inbox; review notifications to both founders; fill the HANDOVER blanks; import pexi-dates.ics | comms 2026-11-20 message lines 22, 27; docs/readiness/HANDOVER.md | no | Jamin decision | S |
| OPS-11 | 0 of 12 recovery drills ever run | launch-gaps:514 (G 101); docs/readiness/DRILLS.md | no | Mac | M |
| OPS-12 | Crash reports are a log line with no alert; Claude cap 10,000 with the Haiku 5.5 live call pending on the Mac; Open Food Facts call rate near its published limit | launch-gaps:341, 417-419, 450 | no | code | M |
| OPS-13 | D-163: the Mac still has to run migrate-photos-to-data-dir.mjs (photos are no longer kept since b283a0a, so likely moot); D-222: 5,605 user_review rows left on the PC | DEFECTS.md:190, 249 | no | Mac | S |

## Answers and data

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| DAT-1 | Coverage: 98 of 191 popular Canadian barcodes priced (51 percent, optimistic); real tester scans 14 days: 17.4 percent shop price and verdict. Launch rule is "build 7 phone check and the accuracy gate" (2026-11-14); no gate result recorded | launch-gaps:376-377, 245, 506 | no: ruled to launch on early coverage; needs a stated target | Jamin decision | L |
| DAT-2 | D-270 A6 to A11: category priors compare across sizes (A6), AI range unit and confidence dropped in the verdict path (A7), "Nx typical" on beyond (A8), absurd prices on consumer barcodes, same-day sale beats its regular, store label and tax basis, raw per-unit price. D-264 server half is A7 | DEFECTS.md:299, 293; docs/bug-sweep-2026-11-11.md:156-186, 779-789; launch-gaps:428 | yes for A6 and A7 (a hard verdict on a sizeless estimate is a claim the data cannot support); no for the rest | code | L |
| DAT-3 | Prices shown as current that are not: about 20,500 over 90 days old, 6,976 out of stock still priced, import date used as date seen (A3, A4, A9) | docs/bug-sweep-2026-11-11.md:350; DEFECTS.md:296 | no | code | M |
| DAT-4 | Typed search: abbreviations, sizes in the query ignored, ranking (bare word tops a flavoured snack) | DEFECTS.md:298; launch-gaps:429 | no | code | M |
| DAT-5 | Wrong crowd data itself (Oreo brand "Cristie"); the screen no longer invents brand or size | DEFECTS.md:290 | no | code | S |
| DAT-6 | D-268 rest of the screen walk (family 3 in the bug sweep: Fix Results, paywall free-limit disagreement, silent 502s, Data and licences raw dates) beyond the items listed fixed | DEFECTS.md:297; docs/bug-sweep-2026-11-11.md:353-436 | no | code | M |
| DAT-7 | Prices are one Toronto neighbourhood (Hammer, 1 to 4 weeks old), BC liquor about 2 months, Open Prices a one-time import with no refresh job, shopper-entered prices 0 rows; one confidence step outside Ontario, no provincial scaling | launch-gaps:425-427, 347 | no: listing now says open data and estimates | code | L |
| DAT-8 | Price-match cashier line from the MVP "done means" never built (priceMatchAdvice has no caller) | launch-gaps:430 | no: feature | code | M |
| DAT-9 | D-022: no per-person reliability score; a photographed tag cannot outweigh a typed number; a plausible fake passes. D-256: "Find a better buy" hidden (SWITCHING_ON = false) until placement is reliable | DEFECTS.md:48, 285 | no: stated limits | code | L |

## Phone and device tests owed

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| DEV-1 | Phone checklist, 15 steps on the newest TestFlight build: fresh install time, 10 scans, typed names, limit and paywall, buy and restore, airplane mode, French phone, VoiceOver, largest text, background 10 minutes | docs/readiness/review-2026-11-21/phone-checklist.md:1-31 | yes: nothing since build 9 has been seen on an iPhone (NOW.md:54) | Jamin (on a phone) | M |
| DEV-2 | Fixed in code but "not yet seen on a phone": D-251 torch auto, D-252 barcode button press, D-254 text size, D-259, D-260, D-265, D-268 outbox, D-271 reader bundle, D-272 Android id, D-274 typed range, D-277 to D-285 (Location switch, welcome shop options, Settings units, sheet scroll, Save closes, Settings gear, identify speed, Progress card) | DEFECTS.md:280, 281, 283, 288, 289, 294, 297, 300, 301, 303, 568-574 | yes: core scan and save paths were last seen on build 8 or 9 | Jamin (on a phone) | M |
| DEV-3 | D-237 torch: confirm the button turns it on and off on a later build (it lit on build 6) | DEFECTS.md:266; launch-gaps:121-124 | no | Jamin (on a phone) | S |
| DEV-4 | VoiceOver pass on a phone (desk half: axe and contrast sweep, 0 problems at 5176dec); accessibility answers in App Store Connect | NOW.md:57-60; launch-gaps:461 | no: the declaration depends on it | Jamin (on a phone) | M |
| DEV-5 | Android on a real phone: only an emulator walk (API 36) exists; camera, location denial, back button, status bar, backup restore on a phone switch | comms/messages/2026-11-23-aurik-to-jamin-android-emulator-walk.md:1; DEFECTS.md:567 | yes: Android launch needs one real device walk | Jamin (on a phone) | M |
| DEV-6 | Older iOS version, iPad (app is iPhone only since build 6), and the French first launch on a real French phone | docs/readiness/review-2026-11-21/REPORT.md:41-42; launch-gaps:169 | no | Jamin (on a phone) | S |
| DEV-7 | D-144: the four legal pages "not yet opened on a phone"; Terms, Privacy and Data document read once on a phone | DEFECTS.md:171 | no | Jamin (on a phone) | S |
| DEV-8 | D-232: unreadable barcode offering typing proven on the Mac with a synthetic feed only, not a real phone | DEFECTS.md:260 | no | Jamin (on a phone) | S |

## Code markers

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| COD-1 | 39 marker hits in app, price, catalogue, identify, native, mac; none is a launch item. Two real findings below, the rest are comments using "not yet" as ordinary wording or `todo` as a variable. identify/ has no hits. | command in source 4 | no | code | S |
| COD-2 | Stale comment: "British Columbia ... unit 3, not yet built" (BC is loaded) | price/src/nb.ts:22 | no | code | S |
| COD-3 | Stale native README: says Java and Android SDK are missing on the PC and that camera-bridge.js is not in the call path | native/README.md:28-34, 112-116 | no | code | S |

## Test runs

| id | what is left | source | blocker | owner | size |
|---|---|---|---|---|---|
| CHK-1 | `node scripts/checks.mjs` run 2026-11-26: PASS on all 7, 0 failed, 0 skipped. It covers scripts tests, hook selftest, guard files, typecheck of app, price, catalogue, and catalogue A7. It does not run the app, price, catalogue or identify suites; those were last recorded 2,439 of 2,444 passing (11-21) and were not rerun here | scripts/checks.mjs:1-30; docs/readiness/review-2026-11-21/REPORT.md:40 | no | code | S |
| CHK-2 | Test that runs only on the Mac: graceful-shutdown skips on Windows ("SIGTERM becomes an unconditional kill; runs on the Mac"); run it there and record it | app/test/graceful-shutdown.test.mjs:8, 161 | no | Mac | S |
| CHK-3 | Five app tests skip on the PC for a pack file not built here (as of 11-07; count not rerun); a skip for no network address on one machine | launch-gaps:37; app/test/security-address.test.mjs:47 | no | Mac | S |

## Checked and closed, so not listed above

Consent v5 (7f6f255), French on (a3250e7), retention across every device-id table (b283a0a), daily caps (b283a0a, d69227d), licences page and font licences (135ef11), Android coarse location and backups (ec7f7b0, 54fc5d9), store privacy answers rewritten (135ef11), terms rewrite including cross-border, recipients, report a bad entry and one age position (1247dc0), source kill switch (061b019), claims wording "Very sure" (f23fd5e), Plex and MediaPipe and zxing notices (licences.html), early-access banner removed (ui-strings.js:316), Help and contact row (you.js:137), no-choice data screen replaced by one Accept (7a6e80c), free-limit bypass and Plus flood (launch-gaps:338), photo scanning dropped and Gemini removed (launch-gaps:53-64).
