# Shin screen walkthrough, 2026-09-30

Run: local server on a scratch data folder (never the real one), catalogue first ON (the shipped default), no API keys set so no paid call was possible, headless Chrome at 390x844, light and dark. Nothing in the repo was edited or committed.

Screenshot folder (SP): `C:\Users\xujam\AppData\Local\Temp\claude\C--agent\410aec6e-926c-4f2d-92e6-6c4f8bf21f5a\scratchpad\shin-screens\`. Every path below is a file name in that folder. Light-theme repeats exist only where a file name ends in `-light` or the JS-off set; everything else was shot in dark.

## Screen count and what was not reached

The front end has 99 tags (a1 to a99). a81 is retired, so 98 live tags. a77 to a80 are four static pages in C:\shin\pages that the app does not serve. Four legal pages (privacy, terms, privacy-fr, terms-fr) carry no tag at all. Surfaces audited: 98 live tags + 4 untagged legal pages = 102. Of those, 92 were reached in the running app or as a page, and I scored them below (some tags are grouped where the screen is identical and only the words differ).

Not reached, with why:
- a8, a17, a19, a21, a22 (onboarding steps): hidden until measured or until accounts exist. By design, no route shows them.
- a75 (render-failure page): two attempts with corrupt localStorage did not trigger it (95-render-failure-try.png shows the You screen instead). Not reached.
- a76 (JS off): reached as a finding, see row 40. The message exists but a shopper cannot see it.
- Real (not fixture) versions of the legacy sheets a38-a41, a45-a51, a87-a90: the catalogue-first flow never opens them. I rendered them from the repo's own test fixtures by importing camera.js in the page. Scores for those rows say "fixture".
- Real a73 share card image: headless drew the text fallback (a74), not the card image.
- a96 needs the store plugin. I mocked the plugin (mock prices CA$3.99 and CA$29.99, taken from plus-config.js). It is labelled mock.
- The invite gate has no screen. Rows say so.
- a1 to a29, a84 onboarding: reached with the onboarding flag overridden in the browser only (flags.js is all off in the shipped MVP, so the shipped app never shows these).

## What a 1, a 3 and a 5 mean, per metric

Scale is 1 to 5. Higher is always better for the shopper, so on the "wrong" metric a 5 means nothing wrong.

1. Content value. 1: the screen tells the shopper nothing they can act on. 3: one useful fact, thinly. 5: it answers the question the screen exists for (is this price low, middle or high for me, and on what evidence).
2. Data held but not shown. 1: the app holds a field or row that would change the answer and hides it. 3: minor held detail is hidden. 5: everything held that matters is shown. Each line cites a response field or DB row, or says "not checked" and why.
3. Wrong, empty or stale. 1: contains a false, Gemini-era, banned-word ("good", "reasonable", "bad" as a verdict), "saved", or unmeasured claim. 3: one stale phrase or a dead end. 5: every word is current and sourced.
4. Glance test (2 seconds). 1: cannot say what the screen wants. 3: gets it after reading. 5: one look gives the answer.
5. Better visualization. 1: a picture or bar is plainly needed and missing. 3: text is fine, a visual would help. 5: already the right visual.
6. Effort (taps). 1: five or more taps or a dead end. 3: two or three taps. 5: zero or one.
7. Vision fit. Three yes/no judgements: useful, easy, visually appealing (U/E/A), each with a reason in the row. Shown as e.g. Y/Y/N.
8. Tag shown. Y with the tag if the badge appeared under `?tags=1`, N if not, "n/a" for pages that cannot show it.

Column order in tables: Content, Not-shown, Wrong, Glance, Viz, Effort, Fit(U/E/A), Tag.

## Headline numbers

All 8,501 barcodes Shin holds prices for (prices.db observation table, one request each to /api/identify with a shelf price, catalogue-first on, no keys):
- 7,216 (84.9 percent) answer `not_in_catalogue` although Shin holds a price for them. 7,208 of these are bcldb rows, 8 are openprices.
- 649 (7.6 percent) are catalogue hits with no range (`range:null`, `noRangeReason:no_api_key`). 407 are openprices grocery rows.
- 629 (7.4 percent) get a range: 608 leaf_category, 21 parent_category, none this_product.
- For 315 of the 629, the product's own observed price sits outside the range shown (306 leaf_category, 9 parent_category). Example: 0048415411325 Polar Ice 1750ml, own prices 5299 and 5529 cents, range shown 449 to 2170 cents.
- 7 requests failed.

So a shopper scanning a barcode Shin holds a price for gets a price range 7 times in 100.

## Per screen and state

### Camera and the five scan states

| # | Screen / state | Tag | Screenshot | C | D | W | G | V | E | Fit U/E/A | Tag shown |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Camera at rest | a32 | 03-camera-rest.png | 3 | 4 | 2 | 4 | 3 | 5 | Y/Y/Y | Y a32 |
| 2 | Barcode found, ready | a33 | 10-cap-middle-1-barcode-ready.png | 3 | 4 | 2 | 4 | 3 | 5 | Y/Y/Y | Y a33 |
| 3 | Price pad | a34 | 10-cap-middle-2-pad.png, 10-cap-middle-3-pad-typed.png | 3 | 4 | 2 | 3 | 3 | 3 | Y/N/N | Y |
| 4 | Working ("Reading the tag") | a37 | 79-working.png | 2 | 4 | 2 | 4 | 3 | 5 | N/Y/N | Y |
| 5 | Barcode with Shin prices, price in the middle | a98 | 10-cap-middle-4-result.png | 3 | 1 | 3 | 3 | 2 | 5 | Y/Y/Y | Y a98 |
| 6 | Same, shelf price under the line | a98 | 11-cap-under-4-result.png | 3 | 1 | 3 | 3 | 2 | 5 | Y/Y/Y | Y a98 |
| 7 | Same, shelf price over the line | a98 | 12-cap-over-4-result.png | 2 | 1 | 2 | 3 | 2 | 5 | Y/Y/Y | Y a98 |
| 8 | Same, no shelf price typed | a98 | 13-cap-noshelf-4-result.png | 3 | 1 | 3 | 3 | 2 | 5 | Y/Y/Y | Y a98 |
| 9 | Barcode known, unpriced (grocery) | a98 | 20-known-unpriced-grocery-4-result.png | 1 | 1 | 3 | 4 | 3 | 5 | N/Y/N | Y a98 |
| 10 | Barcode known, unpriced (liquor) | a98 | 21-known-unpriced-liquor-4-result.png | 2 | 1 | 3 | 4 | 3 | 5 | N/Y/N | Y a98 |
| 11 | Unknown barcode | a99 | 22-unknown-barcode-4-result.png | 2 | 3 | 3 | 4 | 3 | 4 | Y/Y/N | Y a99 |
| 12 | Priced by Shin, not in catalogue | a99 | 23-priced-not-in-catalogue-4-result.png | 1 | 1 | 2 | 4 | 3 | 4 | N/Y/N | Y a99 |
| 13 | Weighed label (prefix 2 code) | a98 | 20-known-unpriced-grocery-4-result.png family; walk-log line "weighed-label" | 2 | 3 | 3 | 3 | 3 | 5 | N/Y/N | Y |
| 14 | Typed name, hit | a99 path, sheet is legacy | 39-typed-hit-half.png, 39-typed-hit-peek.png, 39-typed-hit-full.png | 2 | 1 | 2 | 3 | 2 | 3 | N/N/N | Y |
| 15 | Typed name, miss | a42 | 38-typed-pad.png, 37-type-name-a52.png, 30-c-after-scan.png | 1 | 3 | 3 | 4 | 3 | 3 | N/Y/N | Y a42 |
| 16 | Camera after Done | a32 | 31-camera-after-done.png | 3 | 4 | 3 | 4 | 3 | 5 | Y/Y/Y | Y |

Evidence, by row:
- 1, 2: hint reads "Point at a price tag." Photo ID is off (flags.js `photoId:false`), so it is stale in a barcode-only app. Console: 404 on /js/vendor/efficientdet_lite0.tflite on every camera load. Held: nothing relevant.
- 3: title "What does the tag say?" with the raw barcode digits above the price, and chips "Is this a good price?" and "Find a better buy". "good price" is a banned verdict phrasing and "tag" is stale. Two taps minimum (barcode button, then digits and confirm) or Skip.
- 4: "Reading the tag" is Gemini-era wording. Nothing is being read; the lookup is own data.
- 5 to 8: the sheet is peek only, no grabber. It shows the zone word from the shopper's own lines ("under your line", "in the middle", "over your line") and a text range "$12.00 to $17.25" for 0087000003446 Captain Morgan Spiced 375ml. Data held but not shown: prices.db observation rows for that code, anbl 1699 and bcldb 1899 cents (region New Brunswick and British Columbia, 2026-09-26), which /api/identify does not return; also `range.medianCents` (1429) and `range.n` (19) are in the response and not shown. The range is `basis:parent_category`, `category:"Eaux de vie"`, while `identity.category` is Rums, and the sheet says "FROM SIMILAR PRODUCTS IN EAUX DE VIE". The range bar with a "YOU" marker exists in the legacy verdict sheet (70-verdict-walk-half.png) and is not used here. Shelf 15.99 lies inside 12.00 to 17.25 yet reads "over your line" (row 7); 14.50 reads "in the middle" against median 14.29. Row 7 scores lower on Content and Wrong because the zone word disagrees with the printed range. No Save, Share, Correct or thumbs on the sheet; a real catalogue scan left Saved 0 and Past scans 0.
- 9, 10: text "Shin has no price range for this yet." For 0051500750360 Adams Creamy Peanut Butter 1 kg, prices.db has openprices rows 999, 999, 899 and 900 cents (Superstore Coquitlam 2024-11-18 and 2025-05-29 among them). API returns `range:null`, `noRangeReason:no_api_key`. Wisky 0048415345224 shows the same. The held rows exist and are not shown.
- 11: unknown barcode, "Name it. Brand and model gets closest." (stale phrasing from the photo era). `outcome:not_in_catalogue`. Nothing to hide, so D is 3 not 1.
- 12: for these, Shin has rows (7,216 of 8,501 priced barcodes) and says it does not know. Example 0063209185824 Tim Hortons Dark Roast Ground Coffee 300g, Walmart, 1247 cents, 2026-09-05, is in prices.db.
- 13: barcode is shown as 234925000009 with shelf price from the label; correct handling, but the answer is the same empty text.
- 14: "captain morgan spiced rum" hit own data (`ownData:true`, `source:shin_own_data`). Shows only "anbl 31.79 CAD 2026-09-26", header "CHECKED 4 D AGO", body "Not checked." The typed 29.99 is sent (`shelfPriceCents`) and `verdict:null` comes back, so no zone word and no range. This sheet is the legacy `geminiSheet`. RULINGS says a known item with no price answers with a predicted range; the typed path never does.
- 15: "tim hortons" and "kraft dinner" miss although Walmart rows exist (row 12 example). "zzqx blorp" gives "Shin does not have a price for that yet. Scan the barcode instead." and the UI shows the a42 sheet titled "I do not know this one".

### Legacy scan sheets (fixture only, not reachable in the shipped flow)

| # | Screen / state | Tag | Screenshot | C | D | W | G | V | E | Fit U/E/A | Tag shown |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | Verdict, walk away (fixture) | a38 | 70-verdict-walk-peek.png, -half.png, -full.png | 3 | 3 | 1 | 4 | 4 | 4 | Y/Y/Y | Y |
| 18 | Verdict, fair and good, thin (fixture) | a39, a40 | 71-verdict-fair.png, 71-verdict-good-thin.png | 3 | 3 | 1 | 4 | 4 | 4 | Y/Y/Y | Y |
| 19 | Refusal variants (fixture) | a42, a43 | 72-refusal-no-identity.png, 72-refusal-no-identity-half.png, 72-refusal-identity-unsure.png, 72-refusal-too-few-points.png | 2 | 3 | 3 | 4 | 3 | 3 | N/Y/N | Y |
| 20 | I need a connection | a44 | 130-offline-a44.png | 2 | 4 | 3 | 4 | 3 | 4 | N/Y/N | Y a44 |
| 21 | Going rate (fixture) | a45, a46 | 73-going-rate.png, 73-going-rate-half.png | 3 | 3 | 3 | 3 | 3 | 4 | Y/Y/N | Y |
| 22 | Candidates and not-this (fixture) | a47, a48 | 78-not-this.png, 78-not-this-empty.png | 2 | 3 | 3 | 3 | 3 | 2 | N/N/N | Y |
| 23 | Store picker (fixture) | a50 | 77-store-picker.png | 3 | 4 | 4 | 4 | 3 | 3 | Y/Y/N | Y |
| 24 | Observed card (fixture) | a51 | 76-observed-card.png | 3 | 3 | 4 | 4 | 3 | 4 | Y/Y/N | Y |
| 25 | Answer sheet variants (fixture) | a87 to a90 | 74-answer-over.png, 74-answer-over-half.png, 74-answer-over-full.png, 74-answer-under-low.png, 75-answer-failed.png | 3 | 3 | 3 | 3 | 3 | 4 | Y/Y/N | Y |
| 26 | Photo flag on: shutter, pad, result | a83, a42 | 120-camera-photo-flag.png, 121-after-shutter.png, 122-photo-result.png | 1 | 5 | 3 | 4 | 3 | 3 | N/Y/N | Y |

Evidence:
- 17, 18: the verdict words are "Walk away", "Take it", "About right". Raw code `kind_shelf` leaks into comparison rows; the button reads "Fix Results". These are Gemini-era and verdict-word conflicts with the price-answer ruling. The range bar with "YOU" is the best visual in the app. Not reachable when catalogue first is on.
- 19: "I do not know this one" is honest. The reason text differs by variant. Fixture only.
- 20: the invite gate has no screen of its own. A missing or wrong invite code turns every /api call into 401 (/api/consent, /scenarios, /catalogue, /categories, /event) and the app shows this "I need a connection" sheet. It is the wrong diagnosis, and offline is the same sheet (there is no offline aisle; offline-aisle.js says a scan needs a connection, the 473k-barcode pack is not used).
- 21: fixture rendering only, same asks as row 17.
- 22: "What did you do? Bought it elsewhere..." asks are unmeasured, and the not-this list has zero rows to tap.
- 26: the API answered `failure:no_model_call`, "Catalogue first is on: photographs are not sent to a model." The shopper sees "That photo did not read clearly enough..." which blames the photo, not the switch. `/api/shutter/frame` still returned 204, so frames are still being received. The photo route is behind a flag that is off, so this is unreachable in the shipped app.

### Shell screens

| # | Screen / state | Tag | Screenshot | C | D | W | G | V | E | Fit U/E/A | Tag shown |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 27 | Permissions | a97 | 01-permissions-a97.png, 52-permissions-a97.png, 63-demo-scan.png | 3 | 4 | 3 | 4 | 3 | 4 | Y/Y/Y | Y |
| 28 | Consent | a31 | 02-consent.png, 51-consent-a31.png | 2 | 4 | 2 | 4 | 3 | 4 | Y/Y/N | Y |
| 29 | Setup | a30 | 50-setup-a30.png | 3 | 4 | 4 | 4 | 3 | 4 | Y/Y/Y | Y |
| 30 | Saved, empty / with items / detail | a54, a53, a56, a57 | 41-saved-empty-a54.png, 80-saved-with-items-a53.png, 81-saved-detail.png, 32-saved.png | 3 | 3 | 2 | 4 | 3 | 4 | Y/Y/Y | Y |
| 31 | Saved, storage fault | a55 | 92-saved-fault-a55.png | 3 | 5 | 5 | 4 | 5 | 4 | Y/Y/Y | Y |
| 32 | Past scans, empty / with rows / detail | a59, a58, a61, a62 | 42-pastscans-empty-a59.png, 82-pastscans-with-rows-a58.png, 83-pastscan-detail-0.png, 83-pastscan-detail-1.png, 83-pastscan-detail-2.png, 33-pastscans.png | 3 | 2 | 3 | 4 | 3 | 4 | Y/Y/Y | Y |
| 33 | Past scans, storage fault | a60 | 93-pastscans-fault-a60.png | 3 | 5 | 5 | 4 | 5 | 4 | Y/Y/Y | Y |
| 34 | Removed, empty / with item / fault | a64, a63, a65 | 43-removed-empty-a64.png, 84-removed-with-item-a63.png, 94-removed-fault-a65.png | 3 | 4 | 5 | 4 | 4 | 4 | Y/Y/Y | Y |
| 35 | You | a66 | 40-you-a66.png, 40b-you-bottom.png, 35-you-after-scan.png, 86-you-with-history.png | 2 | 2 | 1 | 3 | 3 | 5 | Y/Y/N | Y a66 |
| 36 | Savings, empty / with scans | a86, a85 | 44-savings-empty-a86.png, 85-savings-with-scans-a85.png, 36-savings-after-scan.png | 2 | 3 | 2 | 3 | 3 | 4 | N/Y/N | Y |
| 37 | Correct, base / with item / after save | a71, a72 | 47-correct-a71.png, 88-correct-with-item.png, 88b-correct-typed.png, 89-correct-save-a72.png | 3 | 4 | 4 | 4 | 3 | 2 | Y/N/Y | Y |
| 38 | Share, nothing / card | a73, a74 | 48-share-nothing.png, 87-share-a73.png, 91-share-a73.png | 3 | 4 | 4 | 3 | 3 | 4 | Y/Y/N | Y |
| 39 | Licences, list / loading / failed | a68, a69, a70 | 45-licences-a68.png, 96-licences-loading-a69.png, 97-licences-failed-a70.png | 2 | 5 | 5 | 4 | 3 | 4 | N/Y/N | Y |
| 40 | JS off | a76 | 160-js-off-a76.png, 160-js-off-a76-light.png, 160-js-off-a76-dark.png, 160-js-off-a76-fullpage.png | 1 | 5 | 1 | 1 | 1 | 5 | N/N/N | N |
| 41 | Bad route | none | 53-bad-route.png | 2 | 5 | 5 | 4 | 3 | 5 | N/Y/N | Y (camera tag) |

Evidence:
- 27: the demo scan card shows only "DEMO Kraft Dinner Original, 225 g" and no price or answer, so it demonstrates nothing.
- 28: the text mentions Location but only a Photos switch is shown. Stale after Location was dropped.
- 30: Saved is filled only by legacy verdict sheets (see row 17). In the catalogue-first flow it stays at 0, so the screen is permanently empty for a real shopper. The a53 rows use fixtures; the "saved" word is the banned kind when it implies savings.
- 32: rows show a tier word from the legacy sheet. Catalogue answers are not stored, so the list is empty after a real catalogue scan (Past scans 0 after my real scan).
- 35: line "4 scanned this week. 3 I could call, and one of them was a good price." uses "good price" as a claim. Next to it "Yours this week 0 scans, 0 named" contradicts it (part of this is seeding). The block "Out of N scans anyone has made ... 64%" is fleet data from my scratch DB (about 1,000 scans), so the number was a test artifact, but the block is shopper-facing and unmeasured for the real fleet. Not checked: the developer row, I did not open it.
- 36: shows a saved-money style figure; RULINGS says no savings claim ships until measured, and none has been measured.
- 37: a full form (price pad, shop, category) for a fix that the shopper cannot reach from a98, since a98 has no Correct button.
- 38: share card image not drawn in headless, text fallback a74 shown. Not checked: the drawn card, so the visual is unscored beyond the fallback.
- 40: `.noscript` element sits at y=844, static position, under the full-height `.device`. Computed visible, text "Shin cannot open.", colour rgb(20,22,26) on rgb(243,241,236), rect [13.8, 844, 362, 433], elementFromPoint null. A shopper with JS off sees a blank page. Full-page shot 160-js-off-a76-fullpage.png shows the message only when scrolled to.
- 41: unknown `?s=` falls back to the camera rather than an error.

### Paywall, invite and limits

| # | Screen / state | Tag | Screenshot | C | D | W | G | V | E | Fit U/E/A | Tag shown |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 42 | Paywall in a browser | a95 | 46-paywall-a95.png | 1 | 3 | 3 | 4 | 2 | 3 | N/Y/N | Y |
| 43 | Paywall after free scans used (real 402) | a94, a95 | 62-scan2-limit-paywall.png, 61-invite-scan1-ok.png | 3 | 3 | 2 | 4 | 3 | 4 | Y/Y/N | Y |
| 44 | Paywall with store prices (mock) | a96 | 140-paywall-plans-a96.png | 3 | 3 | 4 | 4 | 3 | 4 | Y/Y/Y | Y |
| 45 | Invite gate, no code | no screen | 60-invite-gate-no-code.png | 1 | 5 | 1 | 3 | 1 | 3 | N/N/N | Y (a44) |

Evidence:
- 42: the paywall in a plain browser shows only "Subscribe in the app", with no price and no benefits list. It is reachable, and dead.
- 43: text "The 1 free scans for this week are used. They come back Wednesday, October 7." (plural against one). Not checked: whether the reset date is right against the server clock.
- 44: monthly CA$3.99 and yearly CA$29.99 from `plus-config.js`, values injected by my mock, not a real store. Onboarding a25 shows other placeholder prices ($39.99 a year, $12.99 a month, marked "NOT LIVE"), which conflict with the store products.
- 45: server started with SHIN_INVITE_CODE and a wrong or missing code; 60-invite-gate-no-code.png is the a44 "I need a connection" sheet (see row 20).

### Market and onboarding (flags off in the shipped app)

| # | Screen / state | Tag | Screenshot | C | D | W | G | V | E | Fit U/E/A | Tag shown |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 46 | Market base, region step, no match | a67, a92, a93 | 49-market-a67.png, 110-market-base.png, 111-market-nomatch-a93.png, 112-market-regions-a92.png, 90-market-canada.png | 2 | 4 | 3 | 4 | 3 | 3 | N/Y/N | Y |
| 47 | Onboarding steps 1 to 7 (welcome, promise, shops, frequency, priority, heard, tried) | a1 to a7 | 100-onb-01-welcome.png through 100-onb-07-tried.png | 2 | 5 | 1 | 4 | 3 | 3 | N/Y/N | Y |
| 48 | Onboarding steps 8 to 16 (mode, threshold, loyalty, goal, monthly, alerts, compare, frustration, thanks) | a9 to a16 | 100-onb-08-mode.png through 100-onb-16-thanks.png | 2 | 5 | 1 | 4 | 3 | 3 | N/Y/N | Y |
| 49 | Onboarding 17 to 20 (preparing, trial, permissions, plans) | a18, a20, a23 to a25 | 100-onb-17-preparing.png through 100-onb-20-plans.png | 2 | 5 | 1 | 4 | 3 | 3 | N/Y/N | Y |
| 50 | Onboarding 21 to 26 (tips, evaluating, setup) | a26 to a29, a84, a30 | 100-onb-21-tip_scan.png through 100-onb-26-setup.png | 2 | 5 | 1 | 4 | 3 | 3 | N/Y/N | Y |

Evidence:
- 46: "It does not change what I compare yet." Correct and honest; a dead end if reached. English shoppers see French categories in the range basis line ("Boisson alcoolisée", "Bière, boisson à base de malt").
- 47 to 50: 25 of 30 steps reached (five hidden steps are unreachable by design). Text includes "Good Deal", "Instant barcode scan & price history", "Price History Database", "Instant deal verdict calculated", and tip screens that mention photo and tag. These are Gemini-era claims in an app that shows no verdict and no price history. Onboarding ends at setup a30. None of this ships (flag off).

### Legal and static pages

| # | Screen | Tag | Screenshot | C | D | W | G | V | E | Fit U/E/A | Tag shown |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 51 | Privacy, terms (English) | none | 150-legal-privacy.png, 150-legal-terms.png | 3 | 5 | 3 | 3 | 3 | 4 | Y/Y/N | N |
| 52 | Privacy, terms (French) | none | 150-legal-privacy-fr.png, 150-legal-terms-fr.png | 3 | 5 | 3 | 3 | 3 | 4 | Y/Y/N | N |
| 53 | Static docs pages a77 to a80 | a77 to a80 | 151-page-shin-terminating-loop.png, 151-page-shin-walkthrough.png, 151-page-shin-hard-dozen.png, 151-page-shin-build-plan.png | n/a | n/a | n/a | n/a | n/a | n/a | n/a | not checked |

Evidence: the four legal pages have no tag and showed no `.screen-tag` element when opened directly, which breaks the "Screen and page tagging" ruling. The static pages are docs opened from file, not shopper screens; I did not score them and did not check whether they carry a badge.

## Things checked that were fine

Storage-fault screens a55, a60, a65 and licences a69, a70 render correctly (rows 31, 33, 34, 39). The dark theme on the result sheet is polished. Light repeats exist for the seeded shell screens. Not repeated in light: a98 (not checked; the walk covered dark only for scans), so contrast of the "Done" and "Type the product name" buttons, which look pale on cream, is suspected and not measured.

## The five changes that would most raise the value of the whole app

1. **Answer from Shin's own prices for the scanned barcode, and lower the three-shop floor.** Screens a98 and a99 (rows 5 to 12). Evidence: 7,216 of 8,501 priced barcodes (84.9 percent) answer `not_in_catalogue`, and no barcode has more than two sellers so `MIN_OWN_SHOPS=3` in price/src/range.ts never fires (0 this_product ranges out of 629). Example: 0087000003446 has anbl 1699 and bcldb 1899 cents on 2026-09-26 in prices.db and the sheet shows neither. Show store, price and date from the observation rows, even when the count is one or two, and say how many.
2. **Stop judging a product against a category range it does not belong to.** Screens a98 rows 5 to 8. Evidence: for 315 of 629 ranges shown, the product's own price is outside the range; Polar Ice 1750ml at 5299 to 5529 cents is shown against 449 to 2170 (leaf_category, n 183, `unit:null`, no size scaling), and Captain Morgan is called "EAUX DE VIE" while `identity.category` is Rums. Scale by size or drop the range and say why.
3. **Give grocery an honest answer instead of "Shin has no price range for this yet".** Screens a98 rows 9 and 10. Evidence: 649 catalogue hits have `range:null` (407 openprices), and 0051500750360 has four openprices rows (999, 999, 899, 900 cents) that are held and hidden. Show the rows with store and date, or say "Shin has 4 prices for this, from 2024 to 2025".
4. **Put the range bar with the shopper's price marked, plus Save, Share, Correct and history, on the catalogue sheet.** Screens a98, a99, and the empty Saved (a54), Past scans (a59), You (a66). Evidence: the legacy verdict sheet already has the bar with "YOU" (70-verdict-walk-half.png), while a98 shows only the text "$12.00 to $17.25"; a real catalogue scan left Saved 0 and Past scans 0, so three screens are permanently empty and Correct (a71) is unreachable from a result.
5. **Make typed names use the same answer as barcodes and fix name matching.** Screens a99 typed path (rows 14, 15). Evidence: "captain morgan spiced rum" shows only "anbl 31.79 CAD 2026-09-26" and "Not checked." with `verdict:null` although the typed 29.99 was sent; "tim hortons" misses while prices.db has Walmart 0063209185824, "Tim Hortons Dark Roast Ground Coffee ... 300g", 1247 cents, 2026-09-05, which the catalogue names "Tim Horton Bold Espresse".

Smaller, real, not in the five: the invite gate shows the wrong sheet ("I need a connection", row 20 and 45); "Point at a price tag." and "Reading the tag" are stale (rows 1 to 4); the You screen uses "good price" as a claim (row 35); the JS-off page is blank (row 40); the four legal pages have no tag (rows 51, 52); the 404 for efficientdet_lite0.tflite on every camera load.

Method notes: scripts and the raw walk log are in the scratchpad folder above (`pw\`, `walk-log.jsonl`, `enum-result.json`). The enumeration used my own scratch copy of the databases; no real data folder had a file changed (checked by modification time after the run).
