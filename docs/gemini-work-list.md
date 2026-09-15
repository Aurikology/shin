# Gemini: everything that needs to get done

Written 2026-09-14. A list of the work only. The decisions behind each item are in `docs/plan-gemini.md` (section numbers in brackets). File locations were read from the code on 2026-09-14; Google API details from ai.google.dev the same day.

Nothing on this list is started on purpose. Leftover code from a build that was started by mistake and stopped sits uncommitted in the Mac's `~/shin` working copy; see "Leftover code" at the end.

---

## A. Decisions and permissions (people, not code)

1. Jamin creates a Gemini API key with billing on (paid tier) at Google AI Studio and puts it in the Mac's `mac/config.env` as `GEMINI_API_KEY`. Not in any repo. [2.4] Until this exists, decided 2026-09-14: test every branch of this work through Claude in Chrome operating gemini.google.com/app, the same way as the nine website tests already behind this branch. **Key is in, 2026-09-15, and that website rule still stands for everything but the phone.** Jamin's words: *"Make sure not to use the api key for things like building code etc because you can use claude in chrome to control gemini. Only use the api for live testing on the phone."* So building, fixture recording, the eval run, and any branch test still go through gemini.google.com/app; the key is spent only by the server answering a real phone. As of 2026-09-15 the key sits in the worker Mac's `~/agent/.env`, not in `mac/config.env`, so the phone server does not see it yet.
2. Decide which of the 12 other item rules to adopt: sold by weight, store brands, loads/doses/sheets, deals and member prices, deposits/fees/shipping/tax, marketplace and US listings, fixed-price items, medicines and formula, used and collectible, local shops, editions and bundles, local price differences. [7]
3. Aurik agrees, since the build plan names him owner of `identify/src/model.ts` and the provider interface (`docs/the-beta-build-plan.md:250`, item I9; lane rule "never model.ts" near line 263). Jamin's own go-ahead to build toward this is given, 2026-09-14; Aurik's own agreement is still a separate, unasked question.
4. Resolve the conflict with beta build plan item 30 (`docs/the-beta-build-plan.md:163`): reviews "only when a licensed source has a row; nothing generated". Gemini reviews are generated from search. Decided 2026-09-14: reviews show even with no source present, flagged the same way an unsourced price fact is flagged; update item 30's text to match (`docs/decisions.md`, "Twelve rulings on the Gemini branch").
5. Confirm whether Google's "18 years of age or older" rule reaches app users or only the developer. [2.4] Decided 2026-09-14: build a Terms of Service checkbox now regardless of the answer ("if the user checks that, then we don't have any liability"); Google's answer still separately decides whether the API call itself also needs gating.
6. Ask Google whether rendering structured grounded fields in Shin's own layout counts as "modify"; ask for written permission if needed. [2.3]
7. Legal review before anything relies on storing grounded data. [2.1]
8. Look up the real paid-tier rate limits for the chosen models in Google AI Studio (Google no longer publishes them on the rate-limits page).
9. Pick the models: identification (3.5 Flash-Lite or 3.8 Flash), grounded search, code execution. Note 3.8 Flash doubles in price on 2027-01-01. Stable ids today: gemini-3.8-flash, 3.7-flash, 3.6-flash, 3.5-flash, 3.5-flash-lite, 3.1-flash-lite. [3]
10. Seek a zero-data-retention approval from Google (approval-gated per project; not automatic on the Gemini API); decided 2026-09-14, build assuming it is refused (`docs/decisions.md`, "Twelve rulings on the Gemini branch").

## B. Talking to Gemini

11. Build on the Interactions API (Google: "we recommend the Interactions API for all new development"; generateContent is "legacy"), with the `@google/genai` SDK or plain REST. Key in the `x-goog-api-key` header, never in the URL.
12. A Gemini provider that fits the existing `Provider` interface (`identify/src/provider.ts:111`) and is chosen by `makeProvider` (`identify/src/model.ts:807`) when `SHIN_MODEL_PROVIDER=gemini` and the key is set.
13. Fallback to the Claude path when a Gemini call fails, and unchanged Claude behaviour when there is no key.
14. Make the live photo route use the provider `makeProvider` chooses; today `modelOnce` (`app/server.ts:906`) builds an Anthropic client by hand, so the provider setting is ignored there.
15. Ungrounded photo identification (no search tool): product name, brand, size value, size unit, pack count, category, whether it is a spec-variant product, model number and specs when visible. Structured output. Storable.
16. Grounded barcode lookup for a barcode not in the catalogue: product name, brand, size, with source links per fact. [8]
17. Grounded prices and reviews request: per offer retailer, price CAD, url, size value, size unit, pack count, model number, specs, condition; reviews rating, count, short summary, url. Nothing else. [4.1]
18. Instructions on every request: Shin's voice, user's language (English or French), Canadian stores and CAD only, short lengths, fixed JSON layout. [2.3]
19. Verdict request: resubmit the grounded prices plus the shelf price and the user's thresholds with the code execution tool on, asking Gemini to run Shin's fixed function unchanged. [4.3]
20. Check that the code Gemini executed (`executableCode.code`) matches Shin's function; if not, no verdict. [4.3]
21. Set image resolution for photos (Gemini 3: low 280, medium 560, high 1120 tokens per image) and keep requests under the 20 MB inline limit; send jpeg, png, webp or heic. Decided 2026-09-14: not picked by guess; test all three levels against real return quality and cost, and keep the option of offering a lower resolution on a lower-priced Shin tier.
21b. Trust rule for an ungrounded read (barcode-to-photo pairing or a bare photo identification): decided 2026-09-14, never trusted on one frame and never re-checked by a second model call; the check is agreement across multiple camera frames of the same item.
22. Set the thinking level per request (`thinkingLevel`; thinking tokens bill at the output rate).
23. Confirm with a real call whether image input and Google Search work together in one request (not stated in Google's docs). If not, identification and search stay two calls.
24. Handle Gemini errors: 429 rate or quota, 401, 403, 503, and safety blocks (`safety`, `recitation`, `prohibited_content`, `spii`), each falling back or showing a plain message.
25. Read citations and link each fact to its source; flag every fact, price and review with no link. [1]
26. Read Search Suggestions (Google's rendered HTML) from every grounded answer and pass them to the client unmodified, up to 5. [2.2]

## C. The fixed verdict function

27. Write the function Gemini runs: median, percent from median, span, positions 0 to 100, zone boundaries, ticks, shelf label. [4.3]
28. Unit conversion inside it: kg, lb, oz to g; L, fl oz to mL; pack count multiplies; per 100 g, per 100 mL, per item. All sizes count. [5]
29. Offers with no size or a different dimension are excluded from the line and returned as a separate list. [5]
30. Tech variant handling inside it: same model and price-relevant specs and same condition only; other variants returned with their spec difference and price difference; other conditions returned separately. [6]
31. It must run in Google's sandbox (standard Python libraries only, 30 s limit).
32. Tests of the function with fake numbers: one store, all prices equal, an outlier, multipack, oz to g, mixed L and mL, missing size, mass vs volume mismatch, variant filter, condition filter, variant difference labels.

## D. Rules from Google's terms, as code

33. Never write a grounded result into the catalogue, the price database, or anything served to other users; a test that proves it. [2.1]
34. Store grounded answer text only on that user's own scan record (for example the scan's model JSON), kept at most 2 years, then deleted. [2.1]
35. On a barcode miss, ask for a front photo and store the ungrounded identification paired with the barcode in the catalogue. [2.1]
36. Delete interim grounded answers that were not shown, once the verdict answer exists. [2.1]
37. Exclude taps inside the Gemini section and on its links from tap tracking; today `track.js` tracks every click (`app/public/js/track.js:216-220`) and has no exclusion mechanism. [2.2]
38. Links open directly: no redirect route, no affiliate tag, no interstitial, no in-app frame. [2.2]
39. Our own prices and Gemini's prices in separate sections, never one list. [2.2]
40. Review the consent screen wording (`app/src/consent.ts`) for Gemini and Google's 30-day storage of grounded prompts.

## E. Users' price range

41. Somewhere to store each user's good and bad percentages; no preference store exists today (`people.db` holds attribution only, `app/src/admin.ts:53-87`). Database migration in `app/src/migrations.ts`. [4.2]
42. Fields on the setup screen (`app/public/js/screens/setup.js`) and in settings; defaults 10% and 10%. [4.2]
43. Send the user's percentages with the verdict request. [4.2]

## F. Server routes

44. `/api/identify` (`app/server.ts:1729`): catalogue hit unchanged; on a miss, the grounded barcode lookup for this user. [8]
45. `/api/identify/photo` (`app/server.ts:2002`): Gemini ungrounded identification through the provider. [8]
46. A route (or `/api/price`, `app/server.ts:2171`) that runs the grounded prices and reviews request when our own sources have nothing, then the verdict request once a shelf price exists. [4]
47. Keep the existing arithmetic verdict (`price/src/verdict.ts`, `priceIt` in `spine/src/spine.ts:94`) for our own sources, shown in its own section. [4.3]
48. Shelf price input: the typed price and the shelf tag reader (`TAG_INSTRUCTION`, `identify/src/model.ts:735`); no shelf price means prices and reviews without a verdict. [4.2]
49. Ask the user one spec question when a tech product's variant is unclear, before the grounded search. [6]
50. Ask the user for the item's size when neither the catalogue nor the photo has it. [5]
51. Daily call cap and spend cap cover Gemini calls (`identify/src/cap.ts`), counting search queries at $14 per 1,000 after the free 5,000 a month.
52. Log real cost per call from Gemini's token counts (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`) plus the number of search queries run; today cost is estimated (`app/src/model-cost.ts:72`).
53. Offline behaviour: what the offline path (`app/public/js/offline-aisle.js:48`) shows when Gemini is unreachable.

## G. Camera screen

54. Recommend the barcode first ("point at the barcode"). [8]
55. Move to photo mode after a few seconds without a barcode, or when the user says there is none. [8]
56. Framing coaching for photos: whole front label, steady, good light, one product; for tech, the box label or spec sticker. Reuses `chooseCoach` (`app/src/eye/framing.ts:130`) and the coaching lines (`camera.js` around 2088-2107). [8]
57. Keep close and back-to-camera working (`reset()` in `camera.js` around 3236).
58. Front photo request after a barcode miss. [2.1]
59. Spec question and size question prompts. [5, 6]

## H. Result screen

60. The price line: three coloured zones with word labels, large dot for the scanned item, small dots for stores, positions from Gemini's result only. [4.4]
61. Every dot labelled with its quantity and price as sold, including the large dot. [4.4, 5]
62. No overlapping labels at 400 px: alternate above and below with leader lines; stacked dots merge into "N prices", expanding on tap. [4.4]
63. "Per 100 mL, N prices found" label under the line; never "factually". [4.2, 5]
64. Store list as returned (store, price, link) under the line, with the no-link heads-up. [4.4]
65. Google Search Suggestions shown unmodified with every grounded answer. [2.2]
66. Reviews block: rating, count, summary, link; one block per model for tech. [4.1, 6]
67. List of prices left off the line (no size, different dimension). [5]
68. Tech: other variants listed with spec and price difference; other conditions listed. [6]
69. Similar products from other brands in the alternatives section (`alternativesFor`, `catalogue/src/alternatives.ts:338`) as a spec comparison. [6]
70. Our own-source section with the same line, from our own arithmetic. [4.3]
71. Tapping a store dot opens its link directly, untracked. [4.4]
72. French strings for every new line, sheet and label (`voice-fr.js`), and the French coverage test.
73. Works in light and dark themes and at phone width.

## I. Tests and checks

74. Update or rewrite tests to the Interactions API response shape.
75. Recorded fake Gemini responses for every request type, no network in tests.
76. Every new check shown failing once by breaking the code, run by a session that did not write it.
77. All suites and typecheck green (app, identify, spine, catalogue), since the Mac stage deploy blocks on them (`mac/DEPLOY.md:22-24`).
78. A real end-to-end run with the key: barcode miss, photo, prices, reviews, verdict, line, measured cost per scan and searches per lookup.
79. Phone test on iPhone Chrome with Jamin.

## J. Docs and records

80. `mac/config.env` example and setup notes: `GEMINI_API_KEY`, `SHIN_MODEL_PROVIDER`, `SHIN_GEMINI_MODEL`, paid tier only.
81. Add the decision to `docs/decisions.md`, including the fallback entry the leftover `provider.ts` cites but that is not there.
82. Update `DEFECTS.md`: D-099 (photo drops the flavour or variant) and D-024 (missing key on the photo path) once fixed; D-096 and D-098 bear on tech identification.
83. Update `notes/catch-up.md` and the Notion page for Aurik.

## Leftover code (not asked for)

Uncommitted in the Mac's `~/shin`, never pushed, not live. Decided 2026-09-14: reuse what can be used, rather than a clean rewrite or a straight commit as is (`docs/decisions.md`, "Twelve rulings on the Gemini branch") — the provider seam and fallback wrapper match this plan's shape and carry forward; `gemini.ts` (legacy API, key in the URL) does not and should not; `gemini-grounded.ts` needs rebuilding to the Interactions API shape and to call Shin's fixed verdict function instead of asking Gemini to write its own.

- Changed: `app/server.ts` (photo route uses `makeProvider`; imports grounded functions but never calls them), `identify/src/cap.ts` (spend cap for providers), `identify/src/model.ts` (Gemini branch in `makeProvider`), `identify/src/provider.ts` (fallback wrapper).
- New: `identify/src/providers/gemini.ts` (never run; legacy API, key in the URL, 2.5 models), `gemini-grounded.ts` (Interactions API; verdict does not use the fixed function or its check; size fields never requested), `gauge.ts` (the verdict function and code check), `gauge-variant.ts` (tech variants; used nowhere, no tests), tests `gemini.test.ts`, `gemini-grounded.test.ts`, `gauge.test.ts`.
- State: identify tests 182 of 188 pass (6 fail in `gemini-grounded.test.ts`, still on the old response shape); typecheck has 4 errors. Pushing it as is would turn the Mac stage deploy red.
