# Shin end-to-end walkthrough, 2026-10-06

Scope: open the app, click every screen, scan a real barcode from the camera feed, take it through the verdict and the price pad, and note every defect. Judged against the newest design (RULINGS.md, docs/verdict-distribution-design-2026-09-30.md, docs/screen-tags.md) and compared with the 09-30 audit (docs/screen-walkthrough-2026-09-30.md). The phone app is the same web code with native camera off, so this is the app as the phone runs it, minus native camera.

## Run header

- Server: `npm start` in C:\shin\app, port 4173, the real data folder (not a scratch copy). Catalogue first ON (shipped default) for everything except four legacy screens (a42, a43, a49, a51), which were reached with `SHIN_CATALOGUE_FIRST=0`.
- Data folders touched: C:\shin\app\data\scans.db, C:\shin\price\data\corrections.db (read and written); prices.db and catalogue.db read only.
- Keys in .env, by name only: ICECAT_USER, ICECAT_PASSWORD, EBAY_APP_ID, EBAY_DEV_ID, EBAY_CERT_ID. No Gemini key anywhere (file or environment), so no paid model call was possible.
- Viewport 390x844, touch, mobile emulation, installed Chrome (Playwright 1.60, headless). Dark theme for every screen; light theme for camera, pad, verdict, Saved, Past scans, Removed, You, consent and legal pages only.
- Camera: Chrome fake camera fed a y4m video of a printed UPC-A barcode (generated with python-barcode, so the code is real and valid but the pixels are synthetic).
- Barcode scanned: UPC-A 055773000795, read by the app as GTIN 0055773000795, McCain Tasti Tater's 800g. It DECODED FROM THE CAMERA FEED (not typed). Result: scans.db scan 29, kind barcode, source catalogue, answer_path catalogue_hit, 1207 ms, estimate_basis parent_category, estimate centre 554 cents, zone reasonable, range_miss_reason no_shin_prices (Shin has no own price for it, so the range is a category prior).
- Price filed: $5.49 at Save-On-Foods Airdrie East. NO in-app path stored it (defects D01, D02, D05). It landed only through a direct POST to /api/correction with code and scanId, run as a labelled diagnostic.
- DB rows created, for removal later:
  - price/data/corrections.db, table `correction`, id 2 (client_id `e2e-walkthrough-2026-10-06-saveon-0055773000795`, code 0055773000795, price_cents 549, seller Save-On-Foods Airdrie East, kind regular, recorded_at 2026-10-06T22:51:25Z). Remove with `delete from correction where id=2`.
  - app/data/scans.db, table `scan`, id 29 (the real camera scan; typed_price_cents 549 and outcome corrected were set by the same diagnostic POST). The device (`b28a7a51-5e57-4f10-85d7-79a91fd3f97b`) also wrote scan ids 30 to 39 (manual, demo, unknown-barcode, JPW and legacy test scans), 404 rows in `event`, 1 in `consent`, 2 in `gemini_call`. Remove everything for that device_id; correction id 1 (client walk-1) is not mine.
- Screenshots: 151 files in the scratchpad folder `C:\Users\xujam\AppData\Local\Temp\claude\C--agent\760cad12-7851-4ef9-9cc2-99fe0fa9459f\scratchpad\shin-e2e\shots\`. Names below are file names in that folder; where a defect spans a series, the series prefix is given.
- Console and network were watched on every step (events.jsonl in the parent folder). Only recurring errors: the efficientdet 404 (D19) and a startup model.onnx load failure in the server log (D40).
- Observation that is NOT a defect: Photos consent turned on once during a31 because my driver double-tapped. Discarded.

## Result in one paragraph

The barcode scan itself works end to end: camera, decode, catalogue answer, a verdict sheet that always answers. Everything after the verdict is where it breaks. A shopper cannot get a real price into the system from the app: every in-app price path either sends nothing, is refused by the server, or lacks a shop to attach it to, and three of them tell the shopper it worked. Typed names give a confident verdict that contradicts the barcode path. 43 defects: 4 blocker, 13 major, 26 minor.

## Defects

Severity: blocker = the shopper is told something false about an act that cannot be taken back, or the core path (price into the system) fails; major = a ruling is broken or a screen misleads; minor = polish or stale text. "In 09-30 audit" says whether docs/screen-walkthrough-2026-09-30.md already had it (yes, partly, no, changed).

| ID | Screen | Sev | What happened | Design or ruling says | Screenshot | In 09-30 audit |
|---|---|---|---|---|---|---|
| D01 | a71, a72 (Fix results, Report a wrong price) | blocker | Sending a price sends code and scanId as null. The server replies `stored:false`, and the screen says "Recorded. It counts from now." Nothing was written. | RULINGS.md "Attribution, provenance and correction data": a correction is recorded with its barcode. Hard rule 3 (CLAUDE.md in the agent repo): record what happened. Code: app/public/js/screens/camera.js line 4982 passes only text and category to `ctx.go('correct', ...)`, never code or scanId. | 020-fix-results, 021-correction-filled, 022-correction-thanks, 034-report-wrong-price, 035-report-thanks | no (a71 path is new or changed) |
| D02 | a50, a51 (price-only card) | blocker | The price-only card says "Written down" while the server says `stored:false` (a shop is required). a50 offers "No shop" but the server refuses a price with no shop. | RULINGS.md "Scan-time asks and feedback": the shopper is told what happened. Server: /api/correction rejects a price with no product or no shop. | 143-price-only-pad, 144-price-only-filled, 145-price-only-card, 010b-state | no |
| D03 | a50 (store picker) | blocker | The store list is empty or shows only 3 nearby places with no Save-On and no search. The first lookup took 10 s and then timed out. With no shop the price cannot be filed (D02), so the picker blocks the whole price path. | RULINGS.md "A scanned barcode answers with Shin's own prices too": the shopper's price goes into Shin's own prices. | 010-store-picker, 010b-state | partly (picker listed, not as a blocker) |
| D04 | a99, typed name | blocker | Typing "McCain Tasti Taters" gave "Bad price" at $5.49 with no top-3 candidate list (a47, a48 never appeared), while the same product by barcode is "Reasonable". /api/search finds the product, so the data is there. | RULINGS.md "Always answer, never refuse for wasting time" and audit top-five item 5: typed names use the same answer as barcodes. Hard rule: a confidently wrong recommendation is the worst outcome. | 049-manual-working, 050-manual-result, 083-unk-name-result | partly (audit row 14, 15 had typed names weak; the contradiction is new) |
| D05 | a98 pad, a31 consent | major | The typed shelf price is never persisted or sent: "Place it" is local, scan 29 had typed_price_cents null until my diagnostic. The consent screen promises the price is written down. | RULINGS.md "Privacy, recording and consent" and "The price answer must tell the shopper whether the price is good". | 012-pad-typed-549, 013-pad-typed-5.49, 047-place-it, 006-after-permissions-continue | no |
| D06 | a101, a102 | major | After a price was recorded, the next scan of the same barcode gave the same verdict (still `no_shin_prices`, category prior). The recorded correction changes nothing the shopper sees. | RULINGS.md "A scanned barcode answers with Shin's own prices too". | 023-after-correction, 024-after-done | no |
| D07 | a59 (Past scans), a57 (Saved detail) | major | Past scans stays at 0 after real scans. Saved detail says "No verdict on file... anymore". Catalogue answers are not stored. | RULINGS.md "V1 verdict screen mechanics": history and Save. | 026-past-scans-empty, 028-saved-item-detail | yes (audit line 129, still present) |
| D08 | a101, a102, a73 | major | The verdict sheet has no Share control, so the Share screen (a73, a74, a85) cannot be reached from a verdict; /share redirects. | RULINGS.md "V1 verdict screen mechanics": Correct and Share at half detent. | 016-a101-half, 017-a102-full, 057-verdict-light-great, 058-verdict-light-full, 130-share-route | yes (audit top-five item 4, still present) |
| D09 | a101, a102 | major | Thumbs up and down on a catalogue answer send nothing (rating is only set when the answer kind is `gemini`) and show "Noted." Thumbs down gives no reason prompt. scan_rating has 0 rows for the device. | RULINGS.md "Scan-time asks and feedback". Code: camera.js lines ~5086 to 5122, `ratedScan` set only for `kind === 'gemini'`. | 018-thumbs-up-toast, 059-thumbs-down | no |
| D10 | a101 verdict zone words | major | Client default shopper thresholds are 20/10/10; the ruling says 30/20/20. Zone words (great, good, reasonable, bad) shift accordingly. | RULINGS.md "The verdict speaks his words against the shopper's own thresholds". | 016-a101-half, 090-jpw-verdict | no |
| D11 | a99 (unknown barcode) | major | An unknown barcode with a typed price ends at a dead-end screen instead of an answer. | RULINGS.md "Always answer, never refuse for wasting time". | 080-unk-pad, 081-unk-result | yes (audit rows 11, 12, top-five item 1) |
| D12 | a101 (own-price case, JPW) | major | Shin's own prices exist for the item, but the bell centre ($13.92) sits below both own prices, the range runs $3.23 to $59.99, and the sheet says "Bad price" while the marker sits near the bell centre. Word and picture disagree. | docs/verdict-distribution-design-2026-09-30.md: word is read from the marker against the bell. RULINGS.md "The price answer must tell the shopper whether the price is good". | 090-jpw-verdict, 091-jpw-half | no |
| D13 | a101 (Kleenex) | major | "Great price" shown on a category prior that is about 15 times wide, which is a confident claim from almost no information. | Hard priority 1, calibration: unknown, and how to find out, is success. docs/verdict-distribution-design-2026-09-30.md. | 083-unk-name-result | no |
| D14 | a66 (You) | major | Shows fleet-wide internal metrics to a shopper and contradicts itself: "Nothing scanned this week" next to "1 scan". | RULINGS.md "Privacy, recording and consent". | 032-you-top, 033-you-scroll-1 to 033-you-scroll-7 | yes (audit line 130, still present) |
| D15 | a66 (You), legal | major | Stale text says there is no privacy policy page (one exists). Delete my data goes to privacy@shin.app while the policy says useshinapp@gmail.com. | RULINGS.md "Legal and name" and "Collective user data reduces computation, and the privacy policy names both uses". | 033-you-scroll-5, 033-you-scroll-6, 042-legal-privacy | no |
| D16 | a68 (Licences) | major | Source counts and credits are stale and incomplete. | RULINGS.md "Attribution, provenance and correction data". | 037-licences-loading, 038-licences | partly (audit row 39 rated it fine on loading and failure only) |
| D17 | a44 | major | A server 500 shows "I need a connection". The user is told to fix their network for a server fault. | RULINGS.md "Scan-time asks and feedback". | 063-server-500 | yes (audit rows 20, 45, the wrong sheet) |
| D18 | a98 camera | minor | Camera hint reads "Point at a price tag." and status says "Reading the tag" in a barcode-only app. | docs/screen-tags.md: photo ID is off (flags.js `photoId:false`). | 007-camera-rest, 044-camera | yes |
| D19 | a98 camera | minor | /js/vendor/efficientdet_lite0.tflite returns 404 on every camera load (console error). | Nothing needs it with photo ID off. | events.jsonl (no screenshot) | yes |
| D20 | a53 (Saved list) | minor | A Reasonable verdict shows a green "good" face; long names truncate. | docs/verdict-distribution-design-2026-09-30.md: the face tracks the zone word. | 025-saved-list, 052-saved-light | no |
| D21 | a54 (Saved, empty) | minor | The empty state has no call to action. | docs/screen-tags.md a54. | 029-saved-empty | yes |
| D22 | a97, demo scan | minor | The demo scan card shows nothing after the tap. | Onboarding demo (docs/screen-tags.md). | 002-demo-scan, 003-demo-tap | no |
| D23 | a97 (permissions) | minor | Tapping a row label does not toggle its switch; only the small switch does. | Touch target 44 px (Front-end craft ruling, RULINGS.md "Front-end craft: measured contrast, shared components, no build step"). | 004-permissions-camera-tap, 004-permissions-on | no |
| D24 | a31 (consent) | minor | Text mentions a location switch that does not exist and uses photo wording while photo ID is off. | flags.js: photoId off. | 006-after-permissions-continue | no |
| D25 | a98 pad | minor | The Back to camera X is 30x30 px. Every other control measured 44 px or more. | RULINGS.md "Front-end craft", 44 px targets. | 012-pad-typed-549 | partly (audit measured targets; this one not listed) |
| D26 | a98 pad | minor | Pad prompt reads "What does the tag say?" for barcodes and typed names, where there is no tag. | docs/screen-tags.md. | 012-pad-typed-549, 080-unk-pad | no |
| D27 | a66 (You) | minor | The "Buzz ... refusal" caption is displaced from the thing it explains. | docs/screen-tags.md a66. | 033-you-scroll-1 to 033-you-scroll-7 | no |
| D28 | a66 (You) | minor | The Build string is stale and the Developer row is visible to every user. | docs/screen-tags.md a66. | 033-you-scroll-1 to 033-you-scroll-7 | yes |
| D29 | a95 or You (Manage subscription) | minor | Manage subscription is Play-only and opens a new tab, a dead end outside Android. | docs/screen-tags.md a95. | 041-paywall | no |
| D30 | a95 (paywall) | minor | Says the free scans are used when none were used. | RULINGS.md "Scan-time asks and feedback". | 040-paywall, 041-paywall | partly (audit row 42, 43 covered the paywall) |
| D31 | Legal pages | minor | The four legal pages carry no screen tag, and terms.html requested one missing resource (404) on one load. All four render at 390 px without horizontal scroll. | docs/screen-tags.md: every screen is tagged. | 042-legal-privacy, 150-legal-terms-light, 150-legal-terms-dark, 150-legal-terms-fr-light, 150-legal-terms-fr-dark, 150-legal-privacy-fr-light, 150-legal-privacy-fr-dark | yes (untagged only) |
| D32 | a25 (onboarding plans) | minor | Shows placeholder prices and the name "SHIN Pro" and a 3-day trial, against the shipped plan. | RULINGS.md "Legal and name". Flag onboarding is off in the shipped app. | ob2-03-a25 | yes |
| D33 | a29 (onboarding) | minor | Mentions photos though photo ID is off. | flags.js photoId off. | ob2-07-a29 | no |
| D34 | a15 (onboarding) | minor | Claims a price history that the app does not show. | Hard rule 1: no unsourced statement as fact. | ob-14-a15 | no |
| D35 | a84 (onboarding) | minor | The progress figure is a static 33 percent. | docs/screen-tags.md a84. | ob2-08-a84 | yes |
| D36 | a67 (Market) | minor | Market is reachable by URL only and changing it does nothing. | flags.js: market off. | 072-market, 073-market-nomatch, 074-market-region, 075-market-us | yes |
| D37 | a44 (offline) | minor | The offline sheet has no Retry. | RULINGS.md "Scan-time asks and feedback". | 061-camera-offline, 062-offline-scan | yes |
| D38 | a101, a102 (range basis line) | minor | The category is shown in French ("Boisson alcoolisee") to an English shopper. | docs/screen-tags.md: English UI. | 091-jpw-half, 017-a102-full | yes |
| D39 | a102 (chart) | minor | The dot labels overlap on the bell chart. | docs/verdict-distribution-design-2026-09-30.md. | 017-a102-full | no |
| D40 | Server startup | minor | The catalogue model.onnx fails to load (Protobuf error) at startup; the server carries on. | None; log hygiene. | server.log (no screenshot) | no |
| D41 | a55, a60, a65 | minor | When storage is unreadable, the three lists show "0" counts as if empty. A fault is reported as a fact about the world. | CLAUDE.md standing instruction 08-25: never report emptiness as a fact. | 105-fault-watchlist, 105-fault-pastscans, 105-fault-removed, 110-throwAll-watchlist, 110-corruptJson-watchlist | no |
| D42 | a98 (Type the product name) | minor | The "Type the product name" button looks disabled. | Front-end craft ruling. | 047-place-it, 082-unk-type-name | no |
| D43 | a77 to a80 (static pages) | minor | The four static pages have no viewport meta and render 980 px wide on a 390 px phone. The app does not serve them. | docs/screen-tags.md a77 to a80. | 150-a77-dark, 150-a78-dark, 150-a79-dark, 150-a80-dark | partly (audit row 53, not checked at phone width) |

Counts: blocker 4 (D01 to D04), major 13 (D05 to D17), minor 26 (D18 to D43), total 43. Against the 09-30 audit: 15 already there (yes), 6 partly there, 22 new.

## What was fine

- JS-off now shows a message instead of a blank page (was a defect on 09-30): 103-js-off-a76.
- Camera denied falls to a usable manual path with an honest note: 100-denied-a97, 101-nocam-a35, 102-nocam-name.
- Render failure and storage faults do not white-screen: 104-render-fail-try, 110-* series.
- Offline scan and the licences loading and failure states render (a44, a69, a70).
- The scan itself: camera, barcode decode, answer in 1.2 s, on screen without extra taps.
- Light and dark both rendered for the screens shot in both; no contrast failure was visible.
- Legal pages (terms, privacy, both languages) render at phone width with no horizontal scroll.

## Screens not reached, and why (28, plus a81 retired)

- a75: could not trigger.
- a8, a17, a19, a21, a22: hidden by design (onboarding steps with no route).
- a37, a38, a39, a40, a45, a46, a47, a48, a87, a88, a89, a90: need Gemini-grounded or legacy answers; no Gemini key was set, so no such answer could be produced. (a42, a43, a49, a51 were reached only under the legacy configuration.)
- a82: needs a Gemini or legacy answer.
- a56, a61, a62, a91, a73, a74, a85: need Past scans or a verdict Share, and Past scans stays empty (D07, D08); the Share route redirects.
- a96: needs the store plugin (native build).
- Invite gate: not configured on this server (no SHIN_INVITE_CODE).
- a81: retired.
