# Audit: does Shin, as coded, do what the founder asked in "Shin Full Walkthrough" (2026-09-19)

Read-only audit of trunk 4b05330. Judged from code, not from plan docs, comments or test names.
Live Gemini, a phone and a store build were not available, so those are marked UNVERIFIABLE with
what would verify them. Nothing was run; every verdict is from reading the code path.

## Sources and how they compare

1. **The Google Doc** (id 1f_p8XkoHygvAqOuG3tujYgencsh2OwEGFgvo2HTPjzg) was read through the Drive
   connector with comments. Created 2026-09-16, **last modified 2026-09-19 03:46 UTC**. The 11
   comment threads are dated 2026-09-16 19:47 to 2026-09-17 05:31 UTC, all still OPEN.
2. **Repo notes** `docs/walkthrough/jamin-notes-2026-09-17.md` (read 2026-09-18) and the "Walkthrough
   rulings" section of `docs/jamin-gemini-rules.md`.
3. `docs/beta-gaps-2026-09-19.md` was treated as claims and re-checked, not trusted.

**Doc against repo notes: no difference in the founder's words.** I matched the doc text against the
notes file: all 19 typed tab notes, all 11 comments and all 33 Welcome-screen lines are present in the
doc and in the notes, word for word (typos kept). Nothing he typed was dropped or changed by the
notes. The doc's last-modified time (09-19 03:46) is after the notes were written (09-18), but I found
no new or changed founder text after them. I cannot tell a re-view or a formatting save from an edit
from metadata alone; if he edited after 09-18, it changed no words I could find. Separately, the
machine-written tab text in the doc differs from `docs/walkthrough/*.md` in about ten places (extra
"open decision" paragraphs, "Answer in English" market sentences, Gauge Math and grounded-wrapper
paragraphs). That text is not his and no requirement rides on it.

The notes file numbers the Welcome screens 1 to 33 exactly as the doc does. The repo's rulings file
does say a few things the doc does not (the four defaults he approved on 09-18, the Gemini 2.5
default, "both models should be tested"). Those are his later words and are treated as binding here.

## Totals

Counted by the verdict column below (the count is in the last section, after the table).

## Requirements table

Verdicts: MET, PARTIAL, NOT MET, UNVERIFIABLE (needs a phone, live Gemini, a store, or a person).
File:line are in `C:\shin` unless shorter. "Client" is `app/public/js`.

### A. Barcode To Verdict tab (his typed notes)

| # | His requirement (his words) | Verdict | Evidence | Gap |
|---|---|---|---|---|
| 1 | "The barcode should be automatically read out of every single frame." | MET | `app/src/eye/camera.ts:405-410` decodes every animation frame in barcode mode; `barcode.ts:138-220` reads all codes per frame | A single decode over 1.5 s sets `#wedged` for good (`barcode.ts:182-202`); the scanner then silently stops until reload. See contradictions section |
| 2 | "it does not automatically pop up the results. When the user presses scan, it sends the barcode data to gemini." | MET | `camera.ts:275-291` (`scanBarcode` is the only emitter of `onBarcode`); `screens/camera.js:2478-2481`, `4120-4123` | Bundle `app/public/js/eye.js` is gitignored and must be built by `scripts/build-eye.mjs`; a fresh checkout has no camera until it is built |
| 3 | "It only sends the barcode data and not the image of the barcode for reduced api credits" | MET | `server.ts:2364-2376` (kind barcode, no image); `gemini-scan.ts:325-336` attaches an image only when `kind === 'photo'` | The whole frame is still stored on the server for records (`camera.js:2942` `beginShutter`), which is his "record everything", not a Gemini input |
| 4 | "prompts on screen that tell the user how to center the camera better" | MET | `framing.ts:183` `centreKey(codeOffset)`; `camera.ts:441-448`; strings `voice.js:1273` (`cam_centre_left`), `voice-fr.js:732`; shown `camera.js:2494-2508` | Wording quality and timing need a phone |
| 5 | "Once multiple frames agree (1-2 seconds), the scan barcode button should pop up ... a bar where the majority of frames agree" | MET | `votes.ts:74-80` (1500 ms window, span at least 1000 ms, over 50 percent, at least 5 frames), `votes.ts:158`; `camera.js:2684-2698` shows the button only when `barcodeReady`; `camera.css:712,717` hides it otherwise | Needs at least 5 decodes in 1.5 s; whether a real phone decodes that fast is item 51 |
| 6 | "keep watching until the user presses scan barcode ... like a shift register ... pointing at another" | MET | `votes.ts:105-110,182-187` sliding window; leader logic `votes.ts:134-143`; reset only on press (`camera.ts:286`) | None found |
| 7 | "barcodes ... on screen should all be highlighted ... the one the app is focusing on ... displayed differently" | MET | `camera.ts:509-534` emits every track with `focused`; `eye-attach.js:196-220` toggles `is-focus`; `barcode.ts:195` reads up to 4 codes | Drawing quality needs a phone |
| 8 | "The barcode will not be sent to shins servers as of now." | NOT MET | Digits go to Shin's server: `api.js:306-331` calls `/api/identify?gtin=`; `server.ts:2346` | Contradicts his own next lines ("The only thing the server will do is call gemini"; "save ... the users' picture or barcode"). Resolved by his 09-18 "go with the defaults" (`docs/jamin-gemini-rules.md:205-209`), but the doc line was never edited. A phone cannot hold the key, so the server must see the digits |
| 9 | "location data and other data may be useful for both our user info catalogue and for sending to gemini" | PARTIAL | Client sends only a coarse cell, and only when location consent is on (`api.js:60-76`); `server.ts:2354-2359` `locationFor`; catalogue feed takes store and market (`server.ts:1158-1170`) | The exact reading never leaves the phone and the server writes null into the exact columns (comment `api.js:52-58`, Aurik ruling). Gemini gets market country and currency (`gemini-scan.ts:295-296`), never the location, city or store name (store TYPE only) |
| 10 | "The server will not check shins own product list for now." | MET | `/api/identify` `server.ts:2313-2439`, `/api/identify/photo` `2560-2705`, `/api/price` `2708-2795` call `completeGeminiScan` only; catalogue is fed after the answer (`server.ts:1139-1187`) | `/api/search` (`2453`) and `/api/alternatives` (`3330`) still read the catalogue, reachable only from typed search and legacy paths |
| 11 | "The only thing the server will do is call gemini" | MET | Same three routes; one `fetch` per scan (`gemini-scan.ts:849`, no retry loop found) | Beside the call the server records, math-checks and feeds the catalogue after the answer, which he asked for elsewhere |
| 12 | "one call: product information, prices, reviews, and also does the price math" | MET | `gemini-scan.ts:323-349` one request; `Shin_Gemini_Pricing_Engine/scan_prompt.md:88-144` (identity, offers, reviews, PRICE MATH) | Does it work against the real API is item 13 |
| 13 | (implied) the one call actually returns a usable answer on the real Gemini API | UNVERIFIABLE | Request uses `tools:[{type:'google_search'}]`, `store:false`, `response_format` only for 3.x (`gemini-scan.ts:337-347`); 2.5 asks for JSON in prompt text (`271-277`) with repair (`437-456`) | Needs a paid key and live scans: share of 2.5 answers that parse, grounded prices found, photo plus search in one call accepted |
| 14 | "Shin will work for all locations accross the world in all languages." | PARTIAL | Prompt is global with no default market (`scan_prompt.md:11-63`; `server.ts:1265-1270`); language tag sent (`api.js:36`) | The market picker offers three countries only: Canada, US, UK (`screens/market.js:30-34`). App text is English and French only (`ui-strings.js`). No region is ever sent (`lib/scan-body.js:47-59`) |
| 15 | "Same country products can be compared ... exceptions (provinces, EU) ... Shin should identify all of these constraints and prompt gemini accordingly" | PARTIAL | Rules and hints in prompt (`scan_prompt.md:16-63`); hints built from market (`server.ts:1265-1270`, `catalogue/src/market.ts`) | Region is never sent, so "region matters" cannot use the user's region. EU is not in the picker, so the "possibly alike" hint cannot fire for a real user. He called this "will need further design" |
| 16 | "Breaking the rule should never crash the system. No rule is ever more important than the correct functionality" | PARTIAL | Seal failure falls back to the plain answer (`server.ts:1475-1478`); scan failures return a marked 200 (`2377-2391`) | A daily spend cap (default CAD 10, `identify/src/cap.ts:59`, `server.ts:1059-1063`, `gemini-scan.ts:840-841`) refuses scans outright for every user once hit. The grounded wrapper still throws `GroundedLeak` (`identify/src/grounded.ts:182-353`), only caught at one call site |
| 17 | "asking the user for the price as soon as they scan ... the price can get sent to gemini along with the rest of the prompt" | MET | `camera.js:2924-2986` (`onBarcode` opens the pad, request waits on `submitScanPrice`); `api.js:313-314`; `server.ts:2369`; `scan_prompt.md:66` | Skipping still gets an answer, as he wanted |
| 18 | "These thresholds are crucial and non negotiable" (his lines reach Gemini) | MET | `api.js:284-316,518-519`; `lib/scan-body.js:31-38`; `server.ts:1213-1223`; `gemini-scan.ts:302-304`; `scan_prompt.md:69-75` | A user who set none gets a default 10 and 10 (`store.js:47`) from the server, never a scan without lines |
| 19 | "Shin will not run its own pricing system" | PARTIAL | Scan and price routes run no Shin math (`server.ts:2711-2724`); no `computeGauge` call in server or `app/src` | The old engine is still reachable: `lookupPrices` (`server.ts:61`, used by `/api/alternatives` `3330-3360`) and `recordCorrection` (`server.ts:62`); client `fillCheaper` still runs for demo-shelf items (`camera.js:3667,3695,4320`) |
| 20 | "Shin should try to save as much data as possible: picture or barcode, price, location, store, whether it was a good deal" | PARTIAL | Scan row and full Gemini request and response (`migrations.ts:478-530`, `server.ts:1397-1428`); every rating kept (`ratings.ts:90-114`); photo consent defaults on (`consent.ts:72`); frame per shutter | Location default off and exact position deliberately nulled (item 9). His "good deal" verdict is only derivable (thresholds plus Gemini's zone in `answer_text`), not a stored field |
| 21 | "afterwards we can compute what the median price ... based on their scale of a good deal and the price they inputted" | NOT MET | No code back-computes a median from a user's verdict (searched `app/src`, `catalogue/src/user-catalogue.ts`) | He said it "needs further design"; nothing is built |
| 22 | "Shin should never run the price math itself and output it to the user" | MET | Server serves Gemini's numbers as they stand (`server.ts:2711-2724`); client only draws Gemini positions (`price-line.js:137,430-454`); `gauge.ts` not called by `server.ts` | Tick labels are laid out from Gemini's span in the client (`price-line.js:266-273`), presentation only |
| 23 | "a confirmation check that does not get shown ... the scenario ... along with the prompt ... gets marked" | MET | `server.ts:1194-1210,1427`; `gemini-scan.ts:1152-1180`; `scans.ts:923-960`; columns `migrations.ts:478-530` (`input_ref`, `prompt_text`, `math_check`) | Never shown is asserted by `test/gemini-one-call.test.ts:223`, which I did not run |
| 24 | "constraints ... buying in massive bulk ... supermarket will not accept farm ... new item should not use used ebay" | MET | `scan_prompt.md:170-200` (bulk, farm, new vs used, travel, membership, attributes, upgrades, same job) | Enforced by Gemini following the prompt; live behaviour is item 52 |
| 25 | "There are two scenarios: validation ... alternatives" | PARTIAL | `gemini-scan.ts:159-162`: mode is `validation` when a shelf price was typed, else `switching`; client never sends a mode (`lib/scan-body.js:41-44`) | The user cannot say which they want. Skipping the price silently flips to the strict mode. Condition, travel, membership, attributes are never sent (`server.ts:1265-1275` fills store type only) |
| 26 | "someone buying from a farm might consider buying from a supermarket" | MET | `scan_prompt.md:182-183` | Prompt only |
| 27 | "Claude should currently not be used anywhere inside shin." | MET | Photo route is Gemini only (`server.ts:2608-2631`); `identifyPhoto` with the Claude `Identifier` is unreferenced (`server.ts:1703`, `modelOnce` `928-965`); `describe.ts` and `gemini-grounded.ts:1098` are not imported by the server path | Claude code is still in the repo: `identify/src/model.ts`, `providers/anthropic.ts`, `describe.ts` (default `claude-haiku-4-5`), `gemini-grounded.ts:1098` default, `model.ts:854-864` provider default. Dead at runtime, not deleted |

### B. Other tabs, typed notes

| # | His requirement | Verdict | Evidence | Gap |
|---|---|---|---|---|
| 28 | Torch "should be a setting ... auto turn on at a certain brightness level (slider starts at our default) ... or not automatically ... prompts on screen for when its too dark" | MET | `screens/you.js:128-131,257-270,601`; `store.js:50-57`; passed at mount `camera.js:2464`; decision `camera.ts:584-607`, `torch.ts`; dark coach `framing.ts:178`, string `voice.js:1298` | Change applies on the next visit to the camera, not live. Brightness values need a phone |
| 29 | Gauge Math: "Median is one of the most basic ... Is there a more effective operation for our usecase?" | NOT MET | Median is fixed in the prompt (`scan_prompt.md:122`) and the checker (`gemini-scan.ts:1157`); no analysis of alternatives anywhere in code or docs | A question to answer, not answered; a decision for him, but the repo did not put it to him |
| 30 | Grounded wrapper: Gemini's rules "should not aggresively be built around" | PARTIAL | Failure to seal now falls back (`server.ts:1475-1478`) | The machinery stands: `identify/src/grounded.ts` (412 lines), `providers/gemini-grounded.ts` (1297), `app/src/grounded-record.ts`, client `grounded.js` (527), per-device sealed storage (`server.ts:1473`) and its tests. His rulings file calls this "cost to remove" |
| 31 | "display an answer where it can simply put a *we are not fully confident in this answer* beside its answer" | MET | `camera.js:1284-1285`, string `ui-strings.js:118` `cam_gem_not_confident`; server marks `answerMarks` (`server.ts:1484`); repaired and low-confidence answers still shown (`gemini-scan.ts:756-763`) | A reply Gemini gives nothing usable for still refuses (parse `failed`) |

### C. Comments on the doc

| # | His requirement | Verdict | Evidence | Gap |
|---|---|---|---|---|
| 32 | "nothing should hold higher precedency than the words of the founder" / repo over-prioritises Gemini's rules | PARTIAL | Precedence written down in `docs/jamin-gemini-rules.md:136-141`; scan path now marks instead of blocks | Guard machinery, the spend cap and the wrapper (items 16, 30) still put a Gemini or cost rule above "always an answer". `CLAUDE.md` should be checked for the stale "never asked of a model" line his newer rule reverses; my grep found the line absent, so it may already be reworded |
| 33 | "The catalogue will not be in use until more user data comes in" | MET | Catalogue not consulted for answers (items 10, 11) | None |
| 34 | "all the systems ... scalable and applicable to the world and not customized for canada" | PARTIAL | Prompt and market model are global (`catalogue/src/market.ts`) | Canada defaults remain: `camera.js:312,1807` (`|| 'Canada'`), `market.js:30-34` (three countries), `cad()` formatting in legacy going-rate strings, `soldInCanada` fields (`server.ts:509,748,1804`) |
| 35 | "having shin identify something and not giving a price is wasting a users time" | UNVERIFIABLE | One call is built to return offers and verdict (`scan_prompt.md:102-144`); when fewer than two offers it returns no verdict (`:124-126`) and the identity still shows | Needs live scans of real shelf items to see how often no price is found |
| 36 | User data attaches to a matching catalogue product, taken "with a grain of salt" | MET | `catalogue/src/user-catalogue.ts:378-540`; fed after every answer `server.ts:1139-1187,1428` | Storage only; nothing reads it back yet, which is what he said |
| 37 | "convert to the units of comparison ... original units should also be stored" | MET | `user-catalogue.ts:465` stores base and original value and unit; per-unit `:519` | None |
| 38 | Two quantities in catalogue: attach to "whichever quantity the users' item is closer to" | MET | `user-catalogue.ts:499` closest size, no size means not chosen by size | None |
| 39 | Unknown product "will add a new item ... with all of its information ... taken with a grain of salt ... median may be more valuable" | PARTIAL | New untrusted entry created (`user-catalogue.ts:378`, `server.ts:1158-1175`) | Stores name, brand, size, model, price, store type, market, not offers or reviews, and no median (item 21) |
| 40 | "Our catalogue needs a way to sort similar incoming products" | MET | `user-catalogue.ts:173` `nameTokens`, `:214` `specsAgree` | Match quality on real scans is untested by me |
| 41 | "the same product should also be stored with branches" (store type) | MET | `user-catalogue.ts:542` `branchesOf` (store type, country, count, last price) | Stored, not used for answers |
| 42 | "get shin to continuously collect data ... on all the items around it. Cropped photos ... constantly sent to the server" | PARTIAL | `src/eye/shelf.ts:31-141` (one crop every 5 s, max 40 a visit, only when the view changed, consent gated); `eye-shelf.js:50-98`; `server.ts:2286-2299`, `app/src/shelf.ts:67-97` (daily cap) | A throttled whole-view sampler, not per-item crops; not linked to a scan or a location; stops during a scan. He asked "is it possible", so a sampler answers part of it |
| 43 | "screens that collect user data: where and what they typically shop for" | MET | `onboarding-flow.js:99-103` steps 3 to 5 plus shop picker `shops.js`; `screens/main.js:88` `firstScreen`; answers saved `onboarding-flow.js:205` | Answers are stored and sent as events; nothing yet changes a scan because of them |
| 44 | "ask them to determine their good, bad, and great price ranges" | PARTIAL | Two lines only, under and over, choices 5 to 20 (`store.js:47,341`; `screens/setup.js`; `ui-strings.js:341-346`) | No third "great" range; cannot express 30 percent (see item W14); Gemini takes two numbers |
| 45 | "ask them for their location info while using the app" | PARTIAL | Consent toggle (`consent.ts:72`, `screens/consent.js`), permissions step (`onboarding.js:261-263`), nearby shops (`shops.js`), coarse cell (`api.js:71-74`) | Default off; exact position never kept |
| 46 | "find competitive alternatives": non-organic spinach, used tech cheaper, newer model dearer | MET | `scan_prompt.md:146-231`; parsed `gemini-scan.ts:506-613`; drawn `camera.js:1266-1318` | Live quality is item 52 |
| 47 | "some grocery items are scaled to weight ... tech ... cannot be compared based on that" | MET | `scan_prompt.md:106-109,227-228`; user catalogue `kind: 'tech'` `server.ts:1164` | Prompt only |
| 48 | "Shin will not run inside a browser, it only runs inside a browser for testing purposes" | UNVERIFIABLE | Capacitor wrapper present: `native/capacitor.config.json`, `native/ios`, `native/android` | Needs a real iOS and Android build on a phone. The app still runs in any browser and registers a service worker (`main.js:138`) |
| 49 | "For now, the app will not be usable offline" | MET | `offline-aisle.js:1-59` (`identifyOffline` returns "needs a connection", `primeOfflineAisle` is empty); `camera.js:3026-3031`; `sw.js` caches the shell only | Shell still opens offline, which he did not object to |
| 50 | "when i state a problem and give examples, don't assume those examples are the only aspects" | UNVERIFIABLE | An instruction to the builder, not a behaviour; evidence is docs only (`docs/jamin-gemini-rules.md:133-134`) | A person would have to judge whether fixes generalised. Not counted as code |

### D. Items I added that the doc implies and the gaps list did not test

| # | Requirement | Verdict | Evidence | Gap |
|---|---|---|---|---|
| 51 | The button appears within "1-2 seconds" on a real phone | UNVERIFIABLE | Needs 5 decodes in 1.5 s (`votes.ts:74-80`) with `tryHarder` on 960 px frames (`barcode.ts:186-196`) | Measure decode rate on a mid-range phone |
| 52 | Alternatives and constraints behave as written (farm, used, bulk) | UNVERIFIABLE | Prompt text only (`scan_prompt.md:146-231`); server validation drops bad rows (`gemini-scan.ts:613`) | Live scans with mixed items |
| 53 | Answers arrive in the user's language | UNVERIFIABLE | Prompt rule 7 (`scan_prompt.md:56-58`), language tag sent | Live, in a non-English, non-French language |

### E. Welcome screen UI tab (33 lines, his numbering)

Text is in `app/public/js/onboarding-strings.js`; steps in `onboarding-flow.js:96-133`; drawn by
`screens/onboarding.js`. A step whose chart needs an unmeasured figure is hidden by `isVisible`
(`onboarding-flow.js:136-141`, `PUBLISHED_FIGURES` empty at `:61`), his 09-18 decision for invented
proof only.

| # | His screen | Verdict | Evidence | Gap |
|---|---|---|---|---|
| W1 | Shin logo, mascot, brand name "SHIN" | MET | `onboarding.js:231-232` (mascot face plus SHIN) | Visual quality needs eyes |
| W2 | "scan any product and instantly know if its worth it" | MET | `onboarding-strings.js:30` | Apostrophe added to "it's" |
| W3 | "Where do you shop most often?" with four options | MET | `onboarding-strings.js:33-38` | None |
| W4 | "How often do you go shopping per week?" three options | MET | `:41-47` | None |
| W5 | "What is your main shopping priority?" four options | MET | `:50-54` | None |
| W6 | "Where did you hear about us?" TV, Google, TikTok, Instagram, Friend or family, Facebook, X | MET | `:57-` | None |
| W7 | "Have you tried other deal finding or price tracking apps?" Yes, No | MET | `:66`; step 7 `onboarding-flow.js:107` | None |
| W8 | Savings trend chart "Designed to maximize your savings", 6 months | NOT MET | Hidden: needs `savings_trend` figure (`onboarding-flow.js:108`); text exists `onboarding-strings.js:71` | Shown to no one until a measured figure exists |
| W9 | Threshold question with toggle Percentage (%) and Dollar Amount ($) | PARTIAL | `onboarding-flow.js:109,174-179` | Dollar mode "has no home", records only (`:270-278`) |
| W10 | "Set your target deal threshold" slider "20% OFF (Recommended)" | MET | `THRESHOLD.percent` recommended 20 (`onboarding-flow.js:175`); applied only if touched (`:277`) | The app's own default is 10, so an untouched slider does not set 20 |
| W11 | Store loyalty or coupon apps, Yes, No | MET | `onboarding-strings.js:87` | None |
| W12 | "What is your primary goal with SHIN?" three options | MET | `:90-` | None |
| W13 | Monthly goal "$100.00 / month", "Goal is realistic and achievable" | MET | `onboarding-strings.js:96-101`; `MONTHLY` `onboarding-flow.js:182` | None |
| W14 | Alert aggressiveness: Conservative 30%+, Recommended 20%+, Aggressive 10%+ | PARTIAL | Options exist (`onboarding-strings.js:104-110`) | Recorded only. There is no alert system, and the app's lines cannot be 30 percent (`store.js:341` max 20) |
| W15 | "A smarter way to shop" Without SHIN vs With SHIN | MET | `:113-117` | None |
| W16 | "What's your biggest frustration when shopping?" five options | MET | `:120-125` | None |
| W17 | "great potential" timeline 3 days $15, 7 days $45, 30 days $180 | NOT MET | Hidden: needs `savings_timeline` (`onboarding-flow.js:120`) | His 09-18 ruling hides invented savings figures |
| W18 | "Thank you for trusting us!" and "Now let's personalize SHIN for you..." | MET | `:133-134`; `onboarding.js:235` | None |
| W19 | "Join over 10,000 smart shoppers", 4.8 stars, reviews | NOT MET | Hidden until measured (`onboarding-flow.js:122`) | His own 09-18 default; intended |
| W20 | "Setting up your personalized deal engine..." with five checklist items | MET | `:141-146`; step 20 `onboarding-flow.js:123` | The checklist is display only |
| W21 | "Goal: Save $100 by November 12" progress chart | NOT MET | Hidden: needs `goal_progress` (`onboarding-flow.js:124`) | Also hidden by the same ruling |
| W22 | "Save your savings progress": Apple, Google, email | NOT MET | Hidden: `requires: 'accounts'`, `CAPABILITIES.accounts` false (`onboarding-flow.js:41-44,125`) | No account system exists. Not covered by his 09-18 decisions |
| W23 | "try SHIN Pro for free", "No Payment Due Now", "Try Now" | MET | `:159-161`; step 23 | No billing exists; text only |
| W24 | Camera and location permission prompt | MET | `:164-169`; `onboarding.js:261-263` requests the camera | Location handling as item 45 |
| W25 | "3-day FREE trial", $39.99 annual ($3.33/mo) or $12.99/mo | MET | `:172-175`; step 25 records interest | No purchase or gate |
| W26 | "Get the best scan" three tips | MET | `:178-181` | None |
| W27 | "SHIN evaluates your item" three checkmarks | MET | `:182-185` | None |
| W28 | "Adjust shelf price or store" with 'Fix Results' | MET | `:186-189`; button labelled `ui-strings.js:77` | None |
| W29 | "For highest accuracy" scan barcode, photo of tag, search database | MET | `:190-193` | None |
| W30 | Viewfinder with mode switcher [Scan Barcode] [Price Tag] [Manual Search] | PARTIAL | Two modes, Photo and Barcode (`camera.js:2249-2251`, `ui-strings.js:204-205`); typed search elsewhere (`camera.js:4433`) | No three-way switcher; no separate price-tag mode; wording differs |
| W31 | "Evaluating Deal..." progress bar 23%, "Comparing prices across local retailers..." | NOT MET | No progress bar or percentage found; the wait is three named lines and a ring (`camera.js:2992`) | Not built as he wrote it |
| W32 | Savings Overview: Total Saved $150, Monthly Goal Progress, Recently Scanned | NOT MET | No such screen among `main.js:50`; `share.js:16` says no savings figure is shown | Blocked by the no-invented-savings rule, but that rule covers onboarding figures only, and the screen is his |
| W33 | Product Verdict Screen: shelf price, verdict, Store A/B/C price comparison, price history chart | PARTIAL | Verdict and offers list from Gemini (`camera.js:1284-1318`, `price-line.js`) | No price history chart (no history data exists) and "% below average" wording differs |
| W34 | "Shin should use these pages but built with shin's design language" | UNVERIFIABLE | Uses `faceSvg` and Shin tokens (`onboarding.js:24,80`) | Needs his eyes on a phone |

## Contradictions

1. **Barcode to Shin's server.** Item 8 ("will not be sent to shins servers") against "The only thing
   the server will do is call gemini" and "save ... the users' picture or barcode". The code follows
   the second two, per his 09-18 default. The doc line is stale and should be edited.
2. **"Always an answer" against the daily spend cap.** Items 16 and 32. `cap.ts:59` refuses every
   scan for every user once CAD 10 a day is spent (about 180 scans at his 5.6 cents). His word was
   "The per-scan cost is accepted" and "an answer beats no answer".
3. **"Don't build around Gemini's rules" against the wrapper that still exists** (item 30).
4. **"Ask the price at scan" against "results never pop up on their own".** Both hold; the price pad
   opens on the button press. No conflict, noted because it looked like one.
5. **"Default is Gemini 2.5" against a 50/50 device split.** `gemini-scan.ts:80-89` sends half of
   devices to 3.x by device hash. His later "both models should be tested" supports the split, but
   his rulings ask for 2.5 and 3.x "on the same scans", and here they run on different devices, not
   the same scan.
6. **"Ask the price and the mode"** (item 25): the mode he described as two scenarios is chosen by
   whether a price was typed, which no requirement of his says.
7. **Onboarding "20% OFF Recommended" against the app default of 10.** Untouched, the slider changes
   nothing (`onboarding-flow.js:277`).
8. **Onboarding wants 30 percent, the app allows 20** (W14, item 44).

## Only a comment or a docs sentence (asked for, not in behaviour)

- Median-versus-something-better (item 29): asked as a question; answered nowhere.
- Median back-computation from the user's verdict (item 21): a docs sentence only.
- "Shin will identify all of these constraints" for regions and countries (item 15): the code holds
  hints and a three-country picker; region is not sent.
- `docs/jamin-gemini-rules.md` "Precedence, stated outright" (item 32): written, only partly built.
- "Dollar amount" threshold and "alert style" (W9, W14): recorded, no behaviour.
- The doc's own "Open decision" paragraphs are machine text, not his.

## The previous list (`docs/beta-gaps-2026-09-19.md`) against the code

The 21 items are built in the code I read: Claude off the scan path (1), catalogue off the answer
path (2), Gemini does the math (3), two models (4, with the split above), JSON in the prompt for 2.5
(5), thresholds sent (6), decode every frame with a vote (7), all barcodes drawn (8), centre coaching
(9), price at scan (10), torch setting (11), full request and response stored (12), every rating kept
(13), hidden math check (14), catalogue fed by scans (15), shelf sampler (16), onboarding (17, but 6
of 33 screens are hidden or missing, see W8, W17, W19, W21, W22, W31, W32), alternatives modes (18,
inferred not chosen), no Canada pre-fill (19, with the leftovers in item 34), kg and l (20, not
re-checked), offline (21).

**Requirements it did not list at all:** the spend-cap conflict (16); the median question (29); the
median back-computation (21); the market picker limited to three countries and no region sent (14,
15); the wrapper machinery still standing (30); the mode being inferred (25); the doc's Welcome
screens 30 to 33 (W30 to W33) and the "Price Tag / Manual Search" switcher; the barcode reader that
wedges permanently after one slow decode (see below); the gitignored `eye.js` bundle needing a build.

## Falsifying my own MET verdicts

- **Item 5 (button after a majority).** What would make it wrong: the button showing at once, or CSS
  overriding `hidden`. Checked `camera.css:712,717`: `.scan-code-btn[hidden]` is display none, and in
  barcode mode `visibility:hidden; pointer-events:none`. Holds. Still unverified on a phone (item 51).
- **Item 17 (price asked first).** Wrong if any path identifies before the pad. Checked: the only
  callers of `resolveBarcode` and `resolvePhoto` are `submitScanPrice` (`camera.js:2979-2986`); typed
  text goes through `openPad` too. Holds.
- **Item 23 (hidden check).** Wrong if `scheduleMathCheck` was never called. It is, at
  `server.ts:1427`, inside `completeGeminiScan`, after the answer. Holds; mismatches are stored with
  `input_ref` and `prompt_text`.
- **Item 36 (user data feeds catalogue).** Wrong if `scheduleCatalogueFeed` were unreached. Called at
  `server.ts:1428`. Holds, but it returns early when Gemini named nothing (`:1145`), so a failed scan
  adds nothing.
- **Item 27 (no Claude).** Wrong if any served route reaches the Claude `Identifier`. `modelOnce`
  is called only from `identifyPhoto` (`server.ts:1703,1740`), which nothing calls. Holds at runtime;
  the code is still in the repo.
- **Item 49 (offline).** Wrong if the old pack still answered. `primeOfflineAisle` is empty
  (`offline-aisle.js:59`) and `identifyOffline` returns the marker. Holds.
- **Item 1 (every frame).** The claim holds, but the check found a weakness: one decode slower than
  1.5 s sets `#wedged`, and no code ever clears it (`barcode.ts:100,142,200-202`). A backgrounded tab
  or a slow phone could kill scanning silently until reload. Not a verdict change, a concern.

## Counts

87 rows: **51 MET, 18 PARTIAL, 10 NOT MET, 8 UNVERIFIABLE**.

- Requirements 1 to 53 (typed notes, comments, added implied items): 29 MET, 14 PARTIAL, 3 NOT MET,
  7 UNVERIFIABLE (53 rows).
- Welcome screens W1 to W33 plus the design-language line W34: 22 MET, 4 PARTIAL, 7 NOT MET,
  1 UNVERIFIABLE (34 rows). Of the 7 NOT MET, 4 (W8, W17, W19, W21) are hidden on purpose by his
  09-18 ruling on invented figures, W22 (sign-in) is hidden because no accounts exist, and W31 and W32
  are simply not built.

A row is MET only where I traced the press or tap to the effect in code; a live Gemini answer, a
phone's decode speed or a store build always sits in an UNVERIFIABLE row, not in MET.
