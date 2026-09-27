# Scanner build order, 2026-09-19

## What this is

Twenty-two features chosen from a ten-scanner competitor survey
(`docs/competitor-scanners-2026-09-19.md`), each mapped to a mechanism worth copying, a reason
tied to Shin's own objectives, and the place in this repo it touches. The mapping and mechanism
descriptions come from `refs.md` (a scratchpad digest of the survey); the code locations, callers,
knock-on changes, rule checks and build status come from four scratchpad dependency analyses
(`camera.md`, `aicall.md`, `data.md`, `failure.md`), each read in full. Nothing in this document
is invented: every fact carries the file:line citation it came from in one of those five files, or
in the survey itself.

Shin's scanner is judged against six objectives, and only these six: cheap, accurate, instant,
effortless, unsurprising, always answering. Every item below is justified against one or more of
these words, by name, and against nothing else. A feature that does not make a scan cheaper,
more accurate, faster, less effortful, less surprising, or more likely to answer at all is not a
reason to build it.

Items are covered in this order: 1 through 6 first (the first wave), then 7 through 17, then 18
through 22.

---

## 1. Reuse a barcode's answer instead of re-asking Gemini every time

**Copy from**
- Supabase-scan cache short-circuits the whole pipeline (exact barcode) - nutrigo. `lookupByBarcode` checks the scans table for an existing row with that exact barcode and returns it immediately with zero further lookups (no OpenFoodFacts call, no Gemini call, no re-scoring) if found. Source: `backend/src/controllers/scan.controller.ts:53-60`.
- Size-bounded FIFO barcode cache, no time expiry - ha-wine-cellar. Barcode lookups are cached forever inside the same JSON file as the whole cellar; once the cache exceeds 500 entries, entries are evicted oldest-first to keep the file from growing unbounded. Source: `custom_components/wine_cellar/wine_storage.py:455-476`.
- Web nutrition cache with stale while revalidate - sugar-no-scanner-demo. Misses are cached 6 hours, stale memory entries live 5 minutes, a persistent layer is read separately, and concurrent refreshes are deduplicated through an in-flight set. Source: `src/server/web-nutrition.ts:16, 328`.
- Catalog memoization - sugar-no-scanner-demo. `listProducts` caches the scored Supabase catalog in module memory for 60,000ms, with a named fallback to a bundled static catalog on error or empty table. Source: `src/server/catalog-repository.ts:39, 80`.
- CSV/Supabase product-name cache short-circuits the health score - nutrigo. Before computing a health score, the code looks up a `products_cache` table by case-insensitive name; on a hit it reuses the stored score verbatim so all future scans get the same score for that product name. Source: `backend/src/utils/csvCache.ts:73-144, backend/src/controllers/scan.controller.ts:311-350`.

**Why we are building it**
A repeat scan of the same barcode pays for a full Gemini call today with nothing short-circuiting it (data.md C1, point 1: `/api/identify` "always calls `completeGeminiScan` -> Gemini directly... never `recallScan`"). Skipping a call Shin already paid for on an identical barcode is cheap and instant at the same time: zero marginal cost and zero wait for the second scan of the same item. It also improves always answering, since a cached identity survives even if Gemini is later rate-limited or down for that device.

**Where it goes and what depends on it**
An in-memory, per-device cache already exists at `app/server.ts:954-1001` (`ScannedEntry` type, `scanned` Map, `SCANNED_TTL_MS = 30 * 60_000`, `SCANNED_MAX = 500`), written by `rememberScan` (`server.ts:983-992`, called from `completeGeminiScan` at `server.ts:1376-1377`) and read only by `recallScan` (`server.ts:994-1001`, called from `/api/price` at `server.ts:2479-2484`) (data.md C1.1). A persistent `scans` table exists at `app/src/scans.ts:70-99, 354-407`, whose own header names a "shared answer cache" as one of four intended consumers, none of which are wired (data.md C1.1). `lastAnsweredScan(deviceId, code)` (`scans.ts:679-696`) finds a prior answered scan by device and code but nothing calls it from `/api/identify` (data.md C1.1). No test file or eval tool calls the `scanned` Map (data.md C1.2).

**What else has to change**
`catalogue/src/schema.ts:100-148` (the `product` table) has no price column at all, so an identity-forever/price-short-life split needs new columns (e.g. price_cents, price_checked_at, price_expires_at) plus a migration (data.md C1.3). No background price-refresh job exists for Gemini-sourced prices; the nearest analogues are a different subsystem, `price/src/queue.ts:186-207` (crawler recheck scheduling) and `price/src/bestbuy-ratings.ts:51` (data.md C1.3). `scan.outcome` (`scans.ts:73`, values `answered/refused/corrected`) has no cache-hit value, and `gemini_call.model_cost_cents` (`app/src/migrations.ts:497-527`) would read differently once cache hits produce zero-cost rows (data.md C1.3). A client-side "served from cache / stale price" indicator was not located by the dependency search and is flagged there as unverified (data.md C1.3).
Already partly built: a cache exists (`server.ts:954-1001`) but it is in-memory (lost on restart), one 30-minute TTL for the whole answer with no identity/price split, keyed per-device, and used only to bridge `/api/identify` to `/api/price` inside one scan session, not to skip a fresh Gemini call on a later repeat scan (data.md C1.5).

**Rule check**
Rule 1: *"One Gemini call per scan... Never two separate calls."* (jamin-gemini-rules.md:36-38, quoted at data.md C1.4). No line anywhere defines whether a cache hit (zero Gemini calls on that scan) counts as satisfying or violating "one call per scan" (data.md C1.4). Rule 3: *"THE PRICE SHOULD NOT COME FROM US... Shin's own price database, price engine and 'cheaper' lookups are not the answer source."* A cached price served on a repeat scan is, on that scan, a price coming from Shin's own stored data, and no rule text carves out "a price Gemini itself produced on a prior call, replayed by Shin" as different from "Shin's own data" (data.md C1.4). Gemini's own grounding terms (`jamin-gemini-rules.md:196-198`) also restrict caching, framing, or reselling Grounded Results, with storage allowed up to two years only for specific uses; a persistent price cache re-served to users may sit outside those allowed uses (data.md C1.4).
Needs his call: does replaying a Gemini answer from a cached prior scan count as "the price coming from Shin" under rule 3, and does a cache hit violate or satisfy "one Gemini call per scan" under rule 1?

---

## 2. Validate and repair the barcode before it is ever sent

**Copy from**
- GTIN check digit validation server side - sugar-no-scanner-demo. `validWebGtin` requires 8, 12, 13 or 14 digits, rejects all-zero strings, recomputes the mod-10 check digit with alternating 3/1 weights, and returns the value zero-padded to 14, rejecting a misread barcode before any lookup. Source: `src/server/web-product-evidence.ts:42`.
- Barcode value sanitizing - sugar-no-scanner-demo. Each `rawValue` is stripped to digits with `replace(/\D/g,"")` and only accepted if it matches `/^\d{8,14}$/`, filtering the detector's own partial or non-numeric reads. Source: `src/components/scanner-app.tsx:794`.
- Barcode zero-pad retry against Open Food Facts - ha-wine-cellar. The OFF lookup is tried twice per call: once as scanned, once zero-padded to 13 digits, to catch UPC-A codes stored 13-digit in OFF. Source: `custom_components/wine_cellar/vivino.py:716-718`.

**Why we are building it**
A misread or short barcode sent straight to Gemini today wastes the one paid call the scan is allowed, which is neither cheap nor accurate. Validating and sanitizing the digits before the call is a zero-cost, instant local check that removes a class of "no answer for a barcode that decoded wrong" failures, directly serving always answering and accurate.

**Where it goes and what depends on it**
`identify/src/gtin.ts` already has `isValidGtin(digits)` (GS1 mod-10 over lengths 8/12/13/14, lines 32-45) and `gtinFrom(raw)` (strips whitespace/dashes then validates, lines 53-61) (data.md C2.1). A separate zero-pad retry pattern exists in a different subsystem: `catalogue/src/search.ts:1003-1011` (normalized/padStart(13,'0')/zero-stripped/UPC-E-expanded/UPC-A forms) and `catalogue/src/user-catalogue.ts:437` (data.md C2.1). The live barcode read site, `server.ts:2069`, does `pickText('gtin')?.trim()`, trim only, no digit-only sanitize, no check-digit validation, straight into the Gemini call at `server.ts:2088-2102` (data.md C2.1). Grep for `gtinFrom`/`isValidGtin` outside tests returns zero callers, and the zero-pad forms in `search.ts`/`user-catalogue.ts` are called only from `/api/search` and the offline catalogue writer, never the Gemini scan path (data.md C2.2).

**What else has to change**
`gtinFrom`/`isValidGtin` need wiring into `/api/identify` before the Gemini call at `server.ts:2069` (data.md C2.3). The `FailureClass` union (`scans.ts:115-123`) has no "invalid barcode / bad checksum" entry; the closest existing value is `not_in_catalogue`, and a new value or reuse decision is needed (data.md C2.3). A zero-padded retry reusing `search.ts:1003-1011`'s forms on the Gemini path would require the Gemini provider to accept a second candidate string (data.md C2.3).
Already partly built: the check-digit function and a zero-pad normalization pattern both exist correctly, but neither is called from the one path that spends a Gemini call, `/api/identify` (`server.ts:2036-2165`) (data.md C2.5).

**Rule check**
Rule 1 (`jamin-gemini-rules.md:36-38`, one Gemini call per scan): a zero-padded retry "when a lookup misses" implies sending a second string to Gemini if the miss is a Gemini refusal, which is a second Gemini call for the same scan unless the retry runs only against a non-Gemini source before the single Gemini call, or the padding is applied as pre-send sanitization rather than a post-miss retry (data.md C2.4). Rule 2 (`jamin-gemini-rules.md:39-43`, the phone reads the barcode and Gemini gets the digits as text) does not forbid sanitizing or validating those digits before sending, so there is no conflict for the validation half (data.md C2.4).
Needs his call: should the zero-pad retry ever re-hit Gemini with a second candidate string, or must it run only as pre-send sanitization or against non-Gemini sources to stay inside "one Gemini call per scan"?

---

## 3. Never let Gemini's stated price stand on its own word

**Copy from**
- Model numbers are never trusted, only model found URLs - sugar-no-scanner-demo. A grounded search answer is used only to pick a URL, and only if `exactProductMatch` is true with confidence >=0.9; the actual nutrients come from a separate deterministic page fetch, with the code comment "Search discovers a page; its generated nutrient numbers are NEVER facts." Source: `src/server/web-nutrition.ts:231`.
- Deterministic retailer page verifier - sugar-no-scanner-demo. `fetchVerifiedWebProduct` fetches the approved HTTPS URL with a 5-second timeout, `redirect:"manual"` following at most 2 redirects, requires `text/html`, aborts past 1,500,000 bytes, then parses JSON-LD Product blocks, per-100g/100ml tables, and one retailer's escaped-JSON-in-script table. Source: `src/server/web-product-evidence.ts:249, 117`.
- Source host allowlist - sugar-no-scanner-demo. `approvedWebProductUrl` accepts only HTTPS, no credentials, no port, a hostname in a fixed allowlist, a non-root path, explicitly rejects Open Food Facts hosts/localhost/bare IPs, then strips tracking parameters. Source: `src/server/web-product-evidence.ts:17`.

**Why we are building it**
Today the price and review URLs shown to the user come straight from the model's own stated JSON object, never from the real search citations Gemini returned (`shownFrom`, gemini-scan.ts:1050-1085, and `toAnswerBlock`, gemini-scan.ts:1098, neither references `run.citations`, aicall.md B3.1). That is a calibration gap: a number the model states is treated as fact rather than a lead. Fetching and parsing the actual page behind a real citation, through a fixed host allowlist, makes the shown price accurate without adding a second Gemini call, keeping the design cheap and instant.

**Where it goes and what depends on it**
Real grounded-search citations are already extracted in `identify/src/providers/gemini-grounded.ts`, `walkSteps` (line 492), into `Citation { url, title, startIndex, endIndex }` (aicall.md B3.1). `cleanUrl` (unwraps markdown links, rejects non-http(s)) is at `gemini-grounded.ts:878`; a hostname helper (`hostOf`, line 905) exists but only labels a retailer name for display and gates nothing (aicall.md B3.1). The legal guard any new fetch must pass through is `identify/src/grounded.ts`: `seal()` (line 197) is the one door in, `toWire` (233), `resubmitText` (270), and `historyText` (287) are the three doors out; no door exists today for extracting a bare citation URL for an outbound fetch to a third party (aicall.md B3.1). `identify/test/grounded.test.ts:90` asserts `seal()` is called in exactly two files of production source, and `:101` asserts the set of files importing `grounded.ts` equals a written allowlist; a new fetch/parse module touching `grounded.ts` would have to be added to both (aicall.md B3.2).

**What else has to change**
No schema change is needed to validate a URL (`response_schema.json` already requires string|null at offer url line 201/347, review url 397/408, alternative url 537/566); a new field (e.g. `price_confirmed`) would be needed only if confirmation state should be recorded per offer (aicall.md B3.3). `app/src/scans.ts` stores `grounded_at`, `grounded_shown`, `searchQueries`/`billing_basis`/`grounded` (lines 405-406, 835-911) but has no "confirmed vs unconfirmed" column; one would need adding plus a migration entry (aicall.md B3.3). `app/src/model-cost.ts` has no line for a deterministic fetch's own cost/latency (aicall.md B3.3, confirmed no `fetch` hits outside the Gemini call itself in a repo-wide grep, B3.5). `identify/eval/price-truth.ts`'s own header states nothing grounded is written down "because storing them is the thing the terms forbid"; a fetched/parsed confirmation page sits outside `grounded.ts`'s scope as ordinary HTTP content, but the step that reads which URL to fetch out of the citation list does touch that guarded boundary (aicall.md B3.3).
Already partly built: nothing like it today. Price/offer URLs are read straight from the model's own JSON, never cross-checked against `run.citations` anywhere in `gemini-scan.ts` or `gemini-grounded.ts`, confirmed by a full read of both functions and a repo grep for a third-party fetch (aicall.md B3.5).

**Rule check**
Rule 1: *"one gemini call will return the object, the price, the reviews, etc"* names a Gemini call specifically; the walkthrough ruling on checking an answer says *"there can be measures in place but definitely not calling the ai a second time"*, naming calling the AI again, not fetching a page, as the forbidden act (aicall.md B3.4). Whether "one call" should be read more broadly as "one external verification step" is not stated anywhere in the rule text and is not decided here (aicall.md B3.4). Rule 3: *"THE PRICE SHOULD NOT COME FROM US... Shin's own price database, price engine and 'cheaper' lookups are not the answer source."* The fetched page is a third-party retailer page, not Shin's own data, but if Shin's own parser extracts the final shown number, the displayed price is arrived at by Shin's own deterministic logic, which is the exact tension the nearest existing ruling addresses: *"Shin never shows its own price math. A hidden check may recompute Gemini's math; a mismatch marks that scan... for later review. Never shown."* (jamin-gemini-rules.md:162-164, quoted at aicall.md B3.4). Whether a background-only confirmation resolves the tension, or whether swapping in the parsed number when it disagrees would violate rule 3, is not answered by any line found and is not decided here (aicall.md B3.4).
Needs his call: does fetching and parsing a retailer page to confirm a Gemini-stated price count as a second call under rule 1, and would swapping in the parsed number on a mismatch (rather than only flagging it) violate rule 3's "price should not come from us"?

---

## 4. Guard the price against implausible, wrong-currency, or self-contradicting values

**Copy from**
- Minimum-price plausibility floor - ha-wine-cellar. Prices pulled from Vivino's explore API are only accepted if the amount is at least $6.00, a floor against implausible near-zero placeholder values. Source: `custom_components/wine_cellar/vivino.py:527-532`.
- Currency-mismatch invalidation and price provenance bookkeeping - ha-wine-cellar. On a manual refresh, a stored price is treated as not present if its stored currency does not match the currently configured currency, with an explicit comment that an unconverted number in the wrong currency is worse than no number; `ai_price_used`/`ai_updated_at` are tracked separately from `vivino_updated_at`. Source: `custom_components/wine_cellar/websocket.py:1102-1112, 1113-1123`.
- Shelf price trust gate with digit cross check - sugar-no-scanner-demo. A detected shelf price is accepted only when `shelfPriceLabelVisible` is true, cents are above zero, confidence is at least 0.9, and the observed price text itself contains a decimal amount whose parsed cents equal the reported cents, so the model cannot report a number that contradicts its own quoted text. Source: `src/server/recognition.ts:244`.
- Nutrition plausibility self check - sugar-no-scanner-demo. A parsed nutrition table is discarded wholesale when sugars exceed carbohydrates, when protein+carbohydrate+fat exceeds 101g, or when a nutrient appears twice with different values on one page. Source: `src/server/web-product-evidence.ts:184, 172`.
- Deliberate non-extraction of scraped price - ha-wine-cellar. The HTML-scrape parser hardcodes `price=None` for every result with an explicit comment that the page's embedded price is boilerplate/template text identical across every search query, so only the explore API's structured price field is ever trusted. Source: `custom_components/wine_cellar/vivino.py:957-960`.

**Why we are building it**
The only cross-check running on the live path today is a hidden math re-check that fires after the response has already gone out and only writes an audit column (`scheduleMathCheck`, server.ts:1096-1122, scheduled via setImmediate after the return at server.ts:2145-2164, data.md C4.1-2); the currency check and floor run only in eval/tests through a module the live provider does not import (data.md C4.1-2). Shipping a price that is in the wrong currency, implausibly low, or contradicts its own quoted text is a calibration failure users see directly, so catching it before display is accurate and unsurprising, without adding any network cost.

**Where it goes and what depends on it**
`exclusionOf` (`identify/src/gauge.ts:714-739`) already flags `'unusable_price'` and `'not_cad'`; `isUsableAmount` (`spine/src/money.ts:95-97`) checks `cents > 0 && Number.isFinite(cents)`, a floor of "greater than zero," not a minimum-plausibility threshold (data.md C4.1). Price-text and price-cents are read at `gemini-scan.ts:619-621,643-644` but never compared against each other when both are present (data.md C4.1). The hidden math re-check is `checkMath`/`MathCheck` (`gemini-scan.ts:1214-1312`), stored in `gemini_call.math_check`/`math_mismatches`/`math_checked_at` (`app/src/migrations.ts:524-526`) (data.md C4.1). `exclusionOf`/`computeGauge`/`priceGaugeFor` are used only by `GeminiGroundedLookup` (`gemini-grounded.ts:1114`), instantiated only by the eval tool `identify/eval/price-truth.ts:66` and tests; the live provider `gemini-scan.ts` imports only `cleanUrl, parseJson, walkSteps` from `gemini-grounded.ts` and never the gauge functions (data.md C4.2).

**What else has to change**
`gemini_call` (migrations.ts:497-527) has math-check columns but no currency-flag or plausibility-flag column; `scan` has `verdict_tier/confidence/sellers` but nothing for currency/floor (data.md C4.3). Wiring `exclusionOf`/`isUsableAmount` into the live path, and moving the math check's timing from post-response to pre-response, is required if a mismatch is meant to withhold or flag a price actually shown; the current architecture is built not to do that (data.md C4.3). A client price-display "absent/unverified" state would be needed if a guard suppresses a price, and this consumer was not located in the dependency search (data.md C4.3). Telemetry needs a new outcome/flag distinct from `'refused'` for "guard rejected price," since `FailureClass` (`scans.ts:115-123`) has no such value (data.md C4.3).
Already partly built: all three guard mechanisms exist in code, but only the math cross-check runs on the live path, and it only writes an audit column after the response already went out; it never changes what the user sees. The currency check and floor run only in eval/tests. Price-text and price-cents are never cross-checked against each other in `gemini-scan.ts` (data.md C4.5).

**Rule check**
Rule 3 (*"THE PRICE SHOULD NOT COME FROM US"*): whether a guard that computes its own floor/currency check and substitutes "absent" counts as Shin becoming the answer source is not resolved by any quoted text (data.md C4.4). Rule 6 (*"an unchecked answer beats no answer"*): a guard that treats a wrong-currency price, or a below-floor price, as absent turns what rule 6 calls "an answer" into "no answer" for that field, direct tension with the quoted wording (data.md C4.4). Rule 1 (one Gemini call per scan): no conflict, since the proposed cross-check is arithmetic/local comparison, matching how the existing math check already works (data.md C4.4).
Needs his call: does substituting "absent" for a price that fails a floor/currency/self-consistency guard violate rule 6's "an unchecked answer beats no answer," and does the guard logic itself count as "the price coming from Shin" under rule 3?

---

## 5. Reject blurry or moving frames, with a forced-capture escape hatch

**Copy from**
- Luminance edge score as a blur gate - sugar-no-scanner-demo. `luminanceEdgeScore` walks every second pixel in both axes, computes `0.299R+0.587G+0.114B`, sums horizontal/vertical neighbour differences, and returns the mean; frames scoring below 4.1 are rejected as too blurry. Source: `src/lib/frame-quality.ts:1, src/components/scanner-app.tsx:901`.
- Motion gate by strided pixel diff - sugar-no-scanner-demo. Current and previous 96x72 RGBA buffers are compared at a stride of 16 bytes; mean absolute difference >=13 rejects the frame and resets the stability counter. Source: `src/components/scanner-app.tsx:914`.
- Forced capture escape hatch - sugar-no-scanner-demo. If the app has waited 1250ms for a stable frame, `forceCapture` bypasses both the edge-score and motion gates so a shaky or dim scene still produces a scan rather than hanging. Source: `src/components/scanner-app.tsx:899`.
- Minimum capture interval - sugar-no-scanner-demo. Even when every quality gate passes, a capture is discarded unless 1000ms has elapsed since the last one, capping the camera path at one Gemini call per second before any server rate limit applies. Source: `src/components/scanner-app.tsx:927`.
- Tiny sampling canvas with willReadFrequently - sugar-no-scanner-demo. Motion and blur scoring run on a 96x72 canvas created with `{willReadFrequently:true}`, so the repeated `getImageData` every 240ms is browser-optimized and never touches the full-resolution frame. Source: `src/components/scanner-app.tsx:841`.

**Why we are building it**
`StabilityGate.update()` only compares sharpness relatively, "the current frame must be at least as sharp as the median of the hold window," not against an absolute floor, so a whole window of blur still passes (capture.ts:221-225, camera.md A5.5). There is no forced-capture timeout anywhere in `camera.ts` or `capture.ts`; if the gate never settles, `#doCapture()` is simply never called and the scan hangs (camera.md A5.5). An absolute blur floor plus a forced-capture timer removes that hang, which is exactly the always answering failure this item exists to close, and it is instant because it decides which already-captured frame to send rather than changing how many network calls happen.

**Where it goes and what depends on it**
`StabilityGate` (`capture.ts:189-231`, `update()` at 200-226) and `sharpnessOf()` (52-72) are the existing gate, called from `Camera#tick()` at `camera.ts:460` (`this.#gate.update(target.box, sharp, sw)`), guarded by `if (this.#autoCapture && merged.length === 1)` at line 456, with `await this.#doCapture()` at 461 on success (camera.md A5.1). A forced-capture timer would be new state on `Camera` (e.g. a `#gateOpenedAt` timestamp), checked in the same block, calling `#doCapture()` (camera.ts:610-629) directly (camera.md A5.1). `camera.ts:52` is the only importer of `StabilityGate`/`sharpnessOf`; no test imports `capture.ts` directly (camera.md A5.2). `#doCapture()` is also called from the manual shutter path (camera.ts:241-243) and `eye-attach.js`'s `onCapture` wiring (line 340), so a forced capture can reuse the same event with no new wiring required (camera.md A5.2).

**What else has to change**
Nothing is structurally required, since a forced capture can reuse `onCapture` and `#doCapture()` unchanged (camera.md A5.3). If the feature should be visible to the user ("held still and it fired anyway"), that needs a new `onTrouble` message, already auto-telemetered with no server change per the universal fact below, or a new `CoachKey` in `framing.ts:72-81`, which fans out to `voice.js`, `voice-fr.js`, `screens/camera.js`, `screens/you.js`, `main.js`, `screens/share.js`, `lib/theme.js` (camera.md A5.3, universal note). Editing `#tick()` risks the literal-slice tests: `app/test/barcode-button.test.mjs:36,58-65` and `app/test/back-to-camera.test.mjs:174-182`, both string-matching the exact tick body text (camera.md, universal note).
Already partly built: `StabilityGate.update()` already rejects motion via box-drift over a hold window (`driftTolerance` default 0.06, `holdMs` default 500) and compares sharpness relatively, but only against the hold window's own median, not an absolute floor, and there is no forced-capture timeout anywhere in the codebase (camera.md A5.5).

**Rule check**
`framing.ts:1-38` documents a deliberate, audited rule that the coach speaks only four things and "nothing here ever speaks on a timer or on arrival"; reading A5 as wanting a coaching line on a timer directly conflicts with that stated design law, but making the forced capture silent avoids the conflict and is what the feature's own "so a scan can never hang" description supports (camera.md A5.4). No CLAUDE.md/jamin-gemini-rules hard rule is touched, since this only decides which frame gets sent, not how many network calls happen (rule 1, jamin-gemini-rules.md:36, camera.md A5.4). No conflict, provided the forced capture stays silent.

---

## 6. Check Open Food Facts before the paid Gemini call

**Copy from**
- OpenFoodFacts barcode endpoint + field normalization - nutrigo. `GET v2/product/{barcode}.json` with an 8000ms axios timeout, custom User-Agent, and `validateStatus:status<500` so 4xx is read as normal data; nutrient keys are remapped with a unit-conversion fallback. Source: `backend/src/lib/openFoodFacts.ts:16-57`.
- Barcode existence HEAD check (unused on scan path) - nutrigo. `checkBarcodeExists()` issues a HEAD request to the v0 endpoint with a 5000ms timeout, returning a boolean; exported but never called from the scan controller or routes. Source: `backend/src/lib/openFoodFacts.ts:95-103`.
- Open Food Facts client with its own cache - sugar-no-scanner-demo. Product lookups hit `v3/product/<barcode>` and searches hit `search.openfoodfacts.org/search`, both with a 4000ms `AbortSignal.timeout`, a named user agent, and results memoized for 30 minutes. Source: `src/server/open-food-facts.ts:73, 387, 497`.
- Concurrent multi-source barcode lookup with fixed preference order - ha-wine-cellar. UPC Item DB and Open Food Facts are queried with `asyncio.gather` at the same time; UPC Item DB's result wins if both succeed; Vivino's HTML search is excluded from this pair and only tried after both miss. Source: `custom_components/wine_cellar/vivino.py:144-175`.
- Query-result relevance guard (generic-word-filtered Jaccard overlap) - ha-wine-cellar. Vivino's search API has been observed to silently return a fixed "trending" list for unrelated queries; both the search and refresh paths require word-overlap >=0.15 before trusting the match, otherwise falling back to HTML search or skipping the write. Source: `custom_components/wine_cellar/vivino.py:86-113; custom_components/wine_cellar/websocket.py:134-148`.

**Why we are building it**
No live per-scan OFF call exists anywhere; what exists is a one-time offline bulk import into a static table the scan route deliberately does not consult (`server.ts:2038-2043`: "will not check shin's own product list... not consulted for the answer," data.md C6.1, C6.5). A free identity hit against OFF before the paid Gemini call would be cheap (avoiding a paid call entirely on a hit) and instant (OFF's own client already runs with a 4-8 second timeout, data.md C6.1), without changing what happens on a miss.

**Where it goes and what depends on it**
`price/src/openprices.ts:66-137` calls the Open Prices sub-project (crowd-submitted receipt prices), not OFF's product-by-barcode API, as a paginated offline batch job, not a per-scan call (data.md C6.1). `catalogue/src/schema.ts:100-148` is a static `product` table populated once from an OFF bulk dump via `catalogue/src/load.ts:14-20`, with `source='openfoodfacts'` just a label on imported rows (data.md C6.1). No per-scan HTTP call to OFF's product API exists anywhere in the repo, confirmed by grep for the OFF product endpoints (data.md C6.2).

**What else has to change**
A new live HTTP client for OFF's product v3 API, with its own timeout and cache, is needed; none of the existing OFF-adjacent code is structured for a per-scan call (data.md C6.3). `/api/identify` would need a new pre-Gemini branch, directly contradicting the standing comment at `server.ts:2038-2043` about not consulting the product list, which is itself a decision that CLAUDE.md's "raised with Jamin, never made quietly" instruction covers (data.md C6.3). The `product` table would need new columns (e.g. checked_at) if OFF-sourced identity is written back live rather than only at bulk-import time (data.md C6.3). Cost accounting changes the same way as item 1: an OFF hit that avoids a Gemini call changes the `model_cost_cents` distribution (data.md C6.3).
Already partly built: nothing like it today. What exists is a one-time offline bulk import of OFF's product dump into a static table the scan route deliberately does not consult, plus an unrelated batch job against OFF's separate Open Prices project, never invoked inline before a Gemini call (data.md C6.5).

**Rule check**
Rule 2 (`jamin-gemini-rules.md:39-43`) does not forbid a non-Gemini pre-check in its own wording. The closest textual hook, restated at `jamin-gemini-rules.md:149-152`, is *"The only thing the server will do is call gemini"*, which read literally would also forbid an OFF call, but the surrounding text ties that sentence specifically to not consulting Shin's own product list, not a third party; this is ambiguous on the literal text, not resolved by it (data.md C6.4). Rule 3 (*"THE PRICE SHOULD NOT COME FROM US"*): OFF's product table carries no price in Shin's schema, so a product-identity check against OFF, as scoped here, does not on its face trigger rule 3, though no rule text distinguishes a self-hosted copy of a third-party database from Shin's own data if a price field were later added (data.md C6.4). Rule 1 (one Gemini call per scan): no numeric conflict, since this runs before the paid call, not instead of it (data.md C6.4).
Needs his call: does querying OFF's product database before the Gemini call count as "the server will do [something other than] call gemini," given that the existing rule text ties that sentence specifically to Shin's own product list, not a third party?

---

## 7. Only pay for web grounding when the query can actually be searched

**Copy from**
- Searchable identity gate before any web call - sugar-no-scanner-demo. `hasSearchableIdentityEvidence` allows an external/web lookup only when a pack size exists, or the barcode matches `^\d{8,14}$`, or at least two identity tokens remain after removing the brand and generic words. Source: `src/server/recognition.ts:350`.
- Confirmed nutrition short circuit - sugar-no-scanner-demo. `hasConfirmedNutrition` is `typeof matchScore==="number" && ratingSignalCount>=2`; the first candidate satisfying it wins the whole waterfall, so expensive web-search steps only run for products nothing cheaper could confirm. Source: `src/server/recognition.ts:604, 867`.

**Why we are building it**
Grounding is attached unconditionally on every scan today with no condition on query specificity: `gemini-scan.ts:396-397` sets `tools: [{ type: 'google_search' }]` for every `input.kind`, and the file's own header states the request goes out "with `google_search` and NOTHING ELSE" (aicall.md B7.1). `app/server.ts:1373` hardcodes `grounded: true` for every scan with no branch ever producing false (aicall.md B7.1, B7.5). Skipping a search tool that cannot possibly return anything useful for a vague query is cheap, and gating on identity evidence before spending the search is a calibration improvement that costs nothing extra per call.

**Where it goes and what depends on it**
`buildRequestBody` (`gemini-scan.ts:378`, lines 396-397) is only called from `runGeminiScan` in the same file (aicall.md B7.1-2). One pre-call gate already exists but is a spend cap, not an identity gate: `gemini-scan.ts:908-916`, `if (opts.spendGuard) {...}` (aicall.md B7.1). `runGeminiScan` is called from `app/server.ts:1261` (`completeGeminiScan`), `identify/eval/scan-run.ts:287`, and tests across `gemini-scan.test.ts`, `eval-scan.test.ts`, `gemini-alternatives.test.ts` (aicall.md B7.2). `app/server.ts:1373`'s hardcoded `grounded: true` feeds `recordScan`'s INSERT at `app/src/scans.ts:883-911`; any gate that changes whether grounding ran must also change this and the values at `server.ts:1369-1370`, or the stored row misreports a skipped-grounding scan as grounded (aicall.md B7.2).

**What else has to change**
No schema/prompt change is required for the gate mechanism itself, since it runs before the request is built; `GEMINI_SYSTEM.md:65-69` already tells the model to search in a given order and go broader "only if necessary," a model-side instruction, not a code-side gate (aicall.md B7.3). No migration is needed for the `grounded` column, since it already supports `false`; making it conditional is a call-site change at `server.ts:1373` (aicall.md B7.3). `app/src/model-cost.ts`'s `searchCostCents` already returns 0 for 0 queries, so no change is needed there (aicall.md B7.3). `app/test/gemini-one-call.test.ts` and `app/test/paid-call-limits.test.ts` would need review, since their names suggest they may assert the current unconditional-grounding behavior (aicall.md B7.3).
Already partly built: nothing like it today. `gemini-scan.ts:396-397` attaches the search tool unconditionally with no `if` branch of any kind; grep for `shouldGround`/`identityGate`/`specificity` finds no matching code concept anywhere in the repo (aicall.md B7.5).

**Rule check**
The identity-gate half (skip grounding when the query is not specific enough) has no rule conflict found: it changes what is attached inside the one Gemini call, not how many Gemini calls happen (aicall.md B7.4). The short-circuit half (skip grounding when a cheaper source already confirms the answer) directly conflicts with an explicit ruling if "cheaper source" means Shin's own catalogue or stored data: *"The server will not check shins own product list for now. The only thing the server will do is call gemini."* (jamin-gemini-rules.md:149-152), and rule 3, *"THE PRICE SHOULD NOT COME FROM US... Shin's own price database, price engine and 'cheaper' lookups are not the answer source."* `docs/beta-gaps-2026-09-19.md` names this exact shape as Blocker #2 (aicall.md B7.4). If "cheaper source" means something other than Shin's own catalogue or price data, that is not addressed by the rule text found and is not decided here (aicall.md B7.4).
Needs his call: for the short-circuit half, does "cheaper source" mean Shin's own catalogue/stored data (which the rules explicitly forbid consulting), or something else such as a cache of a prior Gemini answer?

---

## 8. Stop a second scan request from landing while one is already in flight

**Copy from**
- In flight guard against overlapping recognitions - sugar-no-scanner-demo. `inFlightRef` is checked and set at the top of every recognize function, and the capture loop pauses recognition immediately before firing a request, so only one recognition exists at a time and the timer never queues work behind it. Source: `src/components/scanner-app.tsx:612, 957`.

**Why we are building it**
Two scan requests landing at once would double-spend the one-Gemini-call-per-scan budget and produce two answers for what the user experienced as one tap, which is neither cheap nor unsurprising. The half of this item that is missing, a minimum interval between captures once the state returns to idle, closes the remaining gap: today the very next tap after `reset()` is accepted immediately (failure.md D8.5).

**Where it goes and what depends on it**
`app/public/js/screens/camera.js:2655-2657` `setState(next)` writes `cam.dataset.state`, which every guard reads (failure.md D8.1). `shoot()` (`camera.js:3461-3462`) and the `scan-barcode` action handler (`camera.js:4094`) both gate on `if (cam.dataset.state !== 'idle') return;`, as do four coaching-line/hint paths (`2566, 2626, 2791, 2823`) (failure.md D8.1). A second flag, `barcodeInFlight` (`camera.js:2347`, used at 2475, 2870, 2974, 3718, 3898, 3881), specifically stops a photo capture landing mid-barcode-read (failure.md D8.1). A generation counter, `gen++` in `reset()` (`camera.js:3881`), checked at `3332, 3514, 3743`, voids a stale continuation after a cancel/reset (failure.md D8.1). No minimum-interval or cooldown timer exists anywhere in the file (failure.md D8.1). Callers: `shoot()`, the `scan-barcode` dispatcher, `onBarcode()` (`2864`), `resolvePhoto()` (`3724`), `resolveBarcode`/`catalogueLookup` (`3046`) (failure.md D8.2). Telemetry already observes state transitions: `track('scan_abandoned', {state, reason, msElapsed})` at `2696` and `track('barcode_scan_pressed', {})` at `4095` (failure.md D8.2).

**What else has to change**
A minimum-interval guard needs a new timestamp variable (e.g. `lastCaptureAt`) checked in `shoot()` (`3462`) and the `scan-barcode` handler (`4094`) alongside the existing idle check (failure.md D8.3). No new user-facing string is obviously required if the guard silently no-ops, matching the current pattern for every other idle guard; a "wait a moment" line, if wanted, belongs in `voice.js` with a new `cam_*` key, not `ui-strings.js` (failure.md D8.3). No telemetry event exists today for "second request suppressed by guard"; a new `track()` call would be needed if the interval-reject needs measuring (failure.md D8.3). No test file was located for this guard (failure.md D8.3).
Already partly built: mostly yes. The in-flight guard is already the dominant pattern in the file: every entry point that starts a scan checks `cam.dataset.state !== 'idle'` first, and `barcodeInFlight` additionally stops a photo capture from landing mid-barcode-read. What is missing is a minimum interval between captures once the state returns to idle (failure.md D8.5).

**Rule check**
None found. Rate limiting itself is explicitly Jamin's decision to keep (`jamin-gemini-rules.md:44-45`); rule 9, "Legal issues mark, never block," is about legal flags, not throughput controls. No rule forbids a client-side interval or in-flight guard (failure.md D8.4).

---

## 9. Give every failure reason its own honest message

**Copy from**
- Named failure messages per provider reason - sugar-no-scanner-demo. A `provider_unavailable` response maps to distinct copy: `quota_exhausted` -> "Today's scanning limit has been reached", `rate_limited` -> "Scanning is busy", anything else -> "Recognition is temporarily unavailable", each keeping the entry point available. Source: `src/components/scanner-app.tsx:528`.
- Retry-After honouring on 429 - sugar-no-scanner-demo. `retryAfterSeconds()` parses the `retry-after` header and defaults to 30 seconds when missing, non-numeric or non-positive; the UI shows "Scanning paused. Try again in Ns" and the loop stays paused. Source: `src/components/scanner-app.tsx:169, 626`.
- AbortError suppression across every fetch - sugar-no-scanner-demo. Each catch block tests `error instanceof DOMException && error.name==="AbortError"` and returns without touching state, so user-driven cancellation never surfaces as an error screen. Source: `src/components/scanner-app.tsx:507, 625, 640, 660, 713`.
- getUserMedia error classification by err.name + secure-context precheck - ha-wine-cellar. Checks `window.isSecureContext` and `navigator.mediaDevices` existence before calling `getUserMedia`, then classifies failures by `err.name` rather than substring-matching `err.message`. Source: `frontend-src/src/utils/camera.ts:1-45`.
- Permission denial path - sugar-no-scanner-demo. `NotAllowedError` and `SecurityError` set a denied state, fire a `permission_denied` event, and show a panel with "Enable camera" plus a "Show demo" escape; any other camera error shows "Try again" instead. Source: `src/components/scanner-app.tsx:1032, 1743`.
- Dual connectivity cross-check before surfacing "offline" - Scanly. An `IOException` is only classified as an offline message if a live connectivity poll independently confirms no connection at that exact moment; otherwise it's treated as a transient provider hiccup and retried. Source: `core/ai/GenerativeAiService.kt:102-105, core/ai/ProviderExecutor.kt:108-110`.

**Why we are building it**
Eight distinct failure codes exist today but only six have distinct user-facing copy; `too_large` and `rate_limited` both fall through into the generic message "that photo did not read clearly enough," an honest-miss message for what is actually a server-side throttle (failure.md D9.5). The barcode route's rate limit is worse: it has no failure field at all, so a 429 is shown as "you have no connection" (failure.md D9.5). Telling the user the true reason a scan failed, with a real countdown when the server already computed one, is unsurprising and calibrated: it stops the app from confidently blaming the wrong thing, which is the worst kind of wrong answer.

**Where it goes and what depends on it**
Client failure enumeration: `app/public/js/api.js:480-497` (JSDoc union) and branches at `499-540`; the 413/429 branch is at `531-533` (failure.md D9.1). Barcode identify (`identify()`, `api.js:317-345`) has no status-code branching at all; any non-2xx throws via `get()` (`230-233`) (failure.md D9.1). Failure-to-copy mapping: `camera.js:860-876`, `MODEL_DOWN_REASONS` (a Set of 4 codes) and `PHOTO_MODEL_FAILURE_LINES` (failure.md D9.1). Copy text: `voice.js:947-1021`, nine keys each with three tones (deadpan/warm/blunt) (failure.md D9.1). Server retry-after: `app/server.ts:1854-1866` `tooManyCalls(retryAfterSeconds)`, backed by `app/src/rate-limit.ts:22-60` (failure.md D9.1). Camera permission: `camera.js:95-107` `startCamera(video)` has a bare `catch { return false; }` with no error-name check, while `onboarding.js:280-291` `askCamera()` already checks `err.name === 'NotAllowedError'` with its own copy `onb_perm_camera_denied` (failure.md D9.1). Offline is inferred purely from a fetch throw or unrecognized status; no `navigator.onLine` or independent connectivity probe exists in `api.js` or `camera.js` (failure.md D9.1). No `AbortController` is attached to any fetch in `api.js`; the `gen` counter voids painting a late result but does not abort the underlying request and shows no error for it (failure.md D9.1).

**What else has to change**
New or changed strings belong in `voice.js` (mascot speech, three tones), not `ui-strings.js` (chrome only, no personality, per `ui-strings.js:1-33`) (failure.md D9.3). `api.js:531-533` needs to read `body.retryAfterSeconds` (the server already sends it) and thread it into the returned object (failure.md D9.3). `api.js:317-345` `identify()` needs its own 429/413 branch, since today it has none (failure.md D9.3). `camera.js:95-107` needs the same `err.name === 'NotAllowedError'` check `onboarding.js:290` already has, plus a decision on what the live camera screen does with "denied" (today both denied and unavailable fall back to the drawn shelf silently) (failure.md D9.3). An independent connectivity check has no existing hook point; every `offline` assignment in `api.js` is a bare catch (failure.md D9.3). Telemetry needs a new failure-reason field or event, since none exists today for server-side refusals (failure.md D9.3). No client test file for `camera.js`'s failure-to-copy mapping was found (failure.md D9.3).
Already partly built: partially. Six of eight failure codes have distinct copy; `too_large` and `rate_limited` have none and fall through to a generic "unreadable" message; the barcode route's rate limit is swallowed as "offline"; camera permission denial has copy in onboarding but not in the live camera screen; a cancelled request already does not show as an error, but only because painting is suppressed, not because the request was aborted; offline is inferred from exception type only, never independently confirmed (failure.md D9.5).

**Rule check**
None that block this. It directly satisfies rule 6, "Always an answer" (`jamin-gemini-rules.md:53-54`), and does not touch rule 5 ("Legal issues mark, never block," `jamin-gemini-rules.md:50-51`). The comment at `camera.js:860-864` already invokes Shin's own hard rule, "The aggression points at the price, the store, or the brand. Never at the user." (`CLAUDE.md:68-69`), which also governs the wording of any new copy (failure.md D9.4).

---

## 10. Downscale a photo until it fits, instead of failing outright

**Copy from**
- Iterative downscale until the payload fits - sugar-no-scanner-demo. Each upload crop is drawn at `min(1,1280/max(w,h))` scale and encoded at JPEG quality 0.78, then the loop multiplies scale by 0.8 and re-encodes while the data URL exceeds 2,650,000 characters, aborting below scale 0.25. Source: `src/lib/client-image.ts:8`.
- Image payload size cap in the schema - sugar-no-scanner-demo. The recognize request schema caps `imageDataUrl` at 2,800,000 characters, which is why the client's own downscale loop targets 2,650,000. Source: `src/app/api/recognize/route.ts:15, src/lib/client-image.ts:32`.

**Why we are building it**
A photo over the server's 3 MiB cap is refused with an HTTP 413 today, and that refusal is treated client-side as a terminal, non-retried outcome (`app/test/photo-route.test.ts:173-181`, `photo-screen.test.mjs:78-82`, aicall.md B10.2-3). A scan that could have succeeded at a smaller size instead becomes a dead end, which fails always answering for a cost (a large photo) the user did not choose. Iteratively shrinking and retrying before refusing is effortless for the user and keeps the scan cheap by avoiding a wasted round trip.

**Where it goes and what depends on it**
Server-side cap: `app/server.ts:738`, `MAX_PHOTO_BODY_BYTES = 3 * 1024 * 1024`, enforced at `2288-2289` (aicall.md B10.1). Client-side resize is single-pass, not iterative: `app/src/eye/capture.ts`, `cropTo` (lines 152-180), called only from `camera.ts:621` inside `#doCapture()`; it takes `maxEdge = 1568` as its only size control, a pixel-dimension target, not a byte-size target, and always encodes lossless PNG (aicall.md B10.1). Client 413 handling is `app/public/js/api.js`, `identifyPhoto` (499-543), branch at 531-534, consumed by `camera.js:3733` and `:3848` (aicall.md B10.1). An unwired native path, `native/native-bridge/camera-bridge.js` `capturePhotoNative()` (88-96), requests quality 85 but performs no resize and its own header states it is not wired into `app/` (aicall.md B10.1).

**What else has to change**
No response-schema, prompt, or stored-row change is needed; `recordScan`/`recordGeminiCall` store an `inputRef` independent of the byte cap or `cropTo`'s `maxEdge` (aicall.md B10.3). No cost-accounting change is needed, since `identify/src/cap.ts`'s `estimatedCostCad()` is a fixed per-call estimate independent of image size (aicall.md B10.3). `app/test/photo-route.test.ts:173-181` and `photo-screen.test.mjs:78-82` currently assert 413 is terminal and non-retried; both would need new assertions for a downscale-then-retry path (aicall.md B10.3). No client-side byte-size target below the server cap exists anywhere; this would need to be added new (aicall.md B10.3).
Already partly built: nothing like it today. No iterative downscale-until-fits-cap exists, and no client-side byte-size target below the server cap exists, confirmed by a repo-wide grep for resize/downscale/shrink/sharp/quality/retry/blob.size/TARGET_BYTES terms (aicall.md B10.5). The 413-to-`too_large` mapping correctly distinguishes a server refusal from a network failure, but never re-encodes and re-sends a smaller image (aicall.md B10.5).

**Rule check**
None found. This feature is client/transport-layer image handling; no rule in `jamin-gemini-rules.md`, `CLAUDE.md`, or `beta-gaps-2026-09-19.md` addresses image size, resizing, or upload payloads, confirmed by reading both files in full and grepping for image/resize/size/payload/cap terms (aicall.md B10.4).

---

## 11. Answer immediately, enrich in the background, never overwrite what the user already saw

**Copy from**
- Fire-and-forget background auto-enrich, decoupled from the response - ha-wine-cellar. Adding a wine returns immediately; a separate background task runs the Vivino search/merge afterward and pushes an event when it finishes, rather than making the add-wine call wait on a network round trip. Source: `custom_components/wine_cellar/websocket.py:193-258, 441`.
- Fill-empty-only price overwrite protection - ha-wine-cellar. Background auto-enrich after adding a wine fills `retail_price` only if the wine has no price at all, with an explicit comment that this field used to overwrite an AI estimate the user had already seen on screen and was fixed to fill-empty-only. Source: `custom_components/wine_cellar/websocket.py:235-241`.
- Two speed resolution modes - sugar-no-scanner-demo. `resolveVisibleDetections` takes `mode:"fast"|"complete"`; in fast mode every network-bound lookup is nulled out so the first response is identity-only, and the client re-requests the same detections in complete mode. Source: `src/server/recognition.ts:593, 788`.
- checked_at / updated_at split - ha-wine-cellar. Both the Vivino refresh and AI batch-analysis paths write a `checked_at` timestamp on every attempt but only move `updated_at` when something in the record actually changed, so a retry that found nothing new is distinguishable from a record that was never looked up. Source: `custom_components/wine_cellar/websocket.py:1149-1159, 1269-1275`.

**Why we are building it**
The deferred-work pattern already exists for bookkeeping (`scheduleMathCheck`, `scheduleCatalogueFeed`, both via `setImmediate` inside `completeGeminiScan`), but it never enriches and re-serves the same field the user was shown (data.md C11.1, C11.5). `updateScan`, the one function that patches a scan row after insert, overwrites unconditionally today even though two other tables in the same codebase already use `COALESCE` for fill-empty-only writes (data.md C11.1, C11.5). Answering instantly and enriching afterward without silently changing a number already on screen is both instant and unsurprising; fill-empty-only specifically prevents the exact regression ha-wine-cellar's own comment names, an AI estimate the user already saw being overwritten later.

**Where it goes and what depends on it**
Background-after-response pattern: `scheduleMathCheck` (`server.ts:1096-1122`) and `scheduleCatalogueFeed` (`server.ts:1028-1060+`) (data.md C11.1). Fill-empty-only precedent already exists elsewhere: `price/src/corrections.ts:414-417` (`COALESCE(?, label)` etc.) and `catalogue/src/user-catalogue.ts:580` (`COALESCE(gtin, ?)`); the opposite, prefer-new pattern also exists at `user-catalogue.ts:696-697` (data.md C11.1). `updateScan` (`app/src/scans.ts:573-594`) is the sole patch path for a scan row, building SQL unconditionally for every key present (579-584), with no `COALESCE`; its callers were not individually enumerated in the dependency search and are flagged there as incomplete rather than assumed empty (data.md C11.1-2).

**What else has to change**
`updateScan` needs per-field `COALESCE`-style guards to become fill-empty-only, matching the pattern already in `corrections.ts:414-417` and `user-catalogue.ts:580` (data.md C11.3). No table has a `checked_at`/`updated_at` pair; the closest existing columns, `gemini_call.math_checked_at` and the `updated_at` columns on `consent` and `device_preference`, don't pair a "looked, nothing changed" stamp with a "value changed" stamp, so a new migration is required (data.md C11.3). `completeGeminiScan` currently builds the full response before returning; splitting "return now" from "enrich later" changes this function's control flow and requires the client to poll or receive a follow-up update keyed by scan id, and no such client mechanism was located (data.md C11.3). Telemetry needs a new `scan.outcome` value or separate event table to distinguish a "first answer" event from a later "enriched" event, since `scan.outcome` today is only `answered/refused/corrected` (data.md C11.3).
Already partly built: the respond-then-enrich mechanism exists (`scheduleMathCheck`, `scheduleCatalogueFeed`) but only writes to bookkeeping tables other than what the user sees; it never enriches and re-serves the same field. `updateScan` overwrites unconditionally today even though the fill-empty-only pattern is already used elsewhere in the same codebase. No `checked_at`/`updated_at` pair exists anywhere in the schema (data.md C11.5).

**Rule check**
Rule 6 (*"always an answer... an unchecked answer beats no answer"*): answer first, enrich after is consistent with this rule; no conflicting text found (data.md C11.4). Rule 4 (*"record everything... every Gemini request and response... saved"*): a strict fill-empty-only rule that never overwrites a value the user already saw could conflict with "record everything" if an enrichment pass produces a different value that then cannot be written to the field the user saw; the rule text does not distinguish "the value shown" from "the value recorded," and writing the enriched value to a separate column preserves both, but that is a design choice the quoted rule does not resolve (data.md C11.4).
Needs his call: when an enrichment pass produces a different value than what the user was first shown, should it be recorded in a separate column (preserving both the shown and the enriched value), and is that split what rule 4's "record everything" actually requires?

---

## 12. A second barcode decode attempt with preprocessing when the first one fails

**Copy from**
- Per-task preprocessing profiles - Scanly. Three distinct bitmap pipelines are tuned separately: OCR retry (scale to 1024px min dimension, contrast x1.4, brightness +15), barcode retry (grayscale, contrast x1.6, no scaling), and GMS-less document fallback (scale to 1400px, contrast x1.25, brightness +10). Source: `core/image/ImagePreprocessor.kt:109-128`.
- Runtime-switchable barcode decoder with max-capability ZXing config - Scanly. A settings key swaps the entire barcode backend between ML Kit and ZXing-cpp at runtime; the ZXing reader is configured for exhaustive decoding with `tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`, `tryDenoise` all true, `textMode=HRI`, and an empty formats set meaning every supported format. Source: `core/barcode/BarcodeAnalyzer.kt:22-56, core/barcode/ZxingBarcodeDecoder.kt:8-22`.
- Integral-image adaptive local-threshold binarization - Scanly. The document "Black & White" filter builds a summed-area table over per-pixel luminance for O(1) local-mean lookups, then thresholds each pixel against its own neighborhood mean instead of one global threshold, so uneven lighting/shadow doesn't turn into black bands. Source: `core/image/DocumentFilters.kt:70-129`.

**Why we are building it**
The existing single decode call already leans on zxing's own robustness options (`tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`), but `tryDenoise` is not one of them and there is no app-side grayscale/contrast preprocessing anywhere (camera.md A12.5). Adding a second attempt with denoise and preprocessing only when the first fails is accurate for the frames that matter most (the ones already failing), and it stays cheap because it runs only on that subset, not on every frame.

**Where it goes and what depends on it**
`app/src/eye/barcode.ts`, `BarcodeScanner.read()` (159-266), calls `readBarcodes()` once (206-216) with `{formats: [...RETAIL_FORMATS], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 4}` (camera.md A12.1). A second attempt would be added after the `out` array is built (257-263) and found empty, doing a grayscale+contrast pass on the `ImageData` and a second `readBarcodes()` call adding `tryDenoise: true` (camera.md A12.1). `barcode.ts`'s only consumer is `camera.ts`, calling `this.#scanner.read(frame)` inside `#tick()` at line 406; `app/test/barcode-button.test.mjs:60` requires that exact text to still appear, which is safe since the change is entirely inside `barcode.ts`'s `read()` body (camera.md A12.2). `zxing-wasm`'s `tryDenoise` option is confirmed to exist at `app/node_modules/zxing-wasm/dist/cjs/bindings/readerOptions.d.ts:45` (camera.md A12.2).

**What else has to change**
No telemetry, stored-row, server-payload, or UI-string change; the return type (`Sighting[] | null`) does not change (camera.md A12.3). The real knock-on is performance: on every frame that fails to decode (the common case while the user is still framing the shot), a second full `readBarcodes()` call plus a canvas pass roughly doubles decode cost, and that cost lands inside the same `#tick()` that also runs detection and the stability-gate check, so a slower `read()` slows the whole per-frame loop, not just barcode scanning; no document states a per-frame time budget to check this against (camera.md A12.3). `barcode.ts`'s existing wedge/timeout machinery (`DECODE_CEILING_MS`, `WEDGE_STRIKES`) would need to wrap a second call too, or the second call could hang the frame the same way the first one used to before that fix shipped (camera.md A12.5).
Already partly built: partly, in spirit only. The existing call already leans on zxing's own robustness options for a single call, but `tryDenoise` is not one of them, there is no second call, and there is no app-side grayscale/contrast preprocessing anywhere in `barcode.ts` or `capture.ts` (camera.md A12.5).

**Rule check**
None. This does not add a Gemini/network call (rule 1, one call per scan, `jamin-gemini-rules.md:36`, only governs the identification call, not local zxing decode), and does not touch what is sent to Gemini, since barcode scans already send digits only (`beta-gaps-2026-09-19.md:230-231`) (camera.md A12.4).

---

## 13. Continuous autofocus, and an explicit wait for camera readiness

**Copy from**
- Continuous autofocus opt in - sugar-no-scanner-demo. After playback starts, it reads `videoTrack.getCapabilities()` and only calls `applyConstraints({advanced:[{focusMode:"continuous"}]})` if `"continuous"` is listed, wrapped in try/catch as best effort. Source: `src/components/scanner-app.tsx:1004`.
- Video element readiness poll - sugar-no-scanner-demo. After the stream resolves, the code waits for the `<video>` ref to mount by looping up to 10 times, each iteration awaiting one `requestAnimationFrame` tick, and throws if the ref is still null. Source: `src/components/scanner-app.tsx:997`.

**Why we are building it**
Today decoding is allowed to start the moment the loop begins running, and each tick individually discovers the frame isn't ready yet by returning null, rather than the loop being held off until an explicit readiness check passes (camera.md A13.5). An explicit wait is unsurprising: it removes a window where the camera is technically running but produces nothing. Continuous autofocus, requested nowhere in the code today, is accurate: a focused frame decodes a barcode correctly more often than an unfocused one, at no extra network cost.

**Where it goes and what depends on it**
`app/src/eye/camera.ts`, `start()` (202-224); the `getUserMedia` video constraints are at 205-212 (`facingMode`, `width`, `height`, `audio: false`); a `focusMode: {ideal: 'continuous'}` constraint, or a post-start `track.applyConstraints()` call, would go alongside the existing torch/zoom pattern at lines 322, 351 (camera.md A13.1). The readiness poll would sit between `await this.#video.play()` (214) and `this.#running = true; this.#loop();` (222-223) (camera.md A13.1). Nothing outside `camera.ts` calls `start()` except `eye-attach.js:348`; no test touches `start()`'s body specifically (camera.md A13.2).

**What else has to change**
No telemetry, stored-row, or server-payload change. A `focusMode` constraint can throw or silently no-op on devices without focus control, the same way `setTorch()` and `#applyZoom()` already handle unsupported constraints with a fail-quiet try/catch; the same pattern would need repeating here, otherwise a device without focus control could throw out of `start()` and never begin the loop at all, unlike torch/zoom, which are applied after the loop is already running (camera.md A13.3). No UI string or coach key is implied (camera.md A13.3).
Already partly built: not built, and the two halves are asymmetric. Continuous autofocus is requested nowhere in the code (only zoom capability is read, camera.ts:333-344). Readiness is implicitly handled, not polled: `#frameToImageData()` returns null when `videoWidth`/`videoHeight` are 0, and `#tick()` returns immediately on a null frame, so a not-yet-ready video silently produces no-op ticks rather than an explicit wait-then-start (camera.md A13.5).

**Rule check**
None found (camera.md A13.4).

---

## 14. Log every miss persistently, so a gap in coverage is visible

**Copy from**
- "Not found" values are logged for later gap analysis - Mivro. Every barcode or keyword that produced a 404 is appended into one of two Firestore documents via `ArrayUnion`, called from both search misses, a running list of demand the catalog can't currently satisfy. Source: `python-app/database.py:80-94, python-app/search.py:35, 136`.
- Error-vs-notfound aggregation rule - Scanly. The orchestrator only surfaces a hard Error if every supporting engine errored; if even one engine cleanly returned NotFound, errors from the others are downgraded into a NotFound response. Source: `core/lookup/LookupOrchestrator.kt:60-68`.

**Why we are building it**
Persistent recording of every Gemini-path miss already happens in the `scan` table with a specific `failure_class`, which already satisfies "every scan that resolved nothing is recorded" (data.md C14.5). What is missing is the gap-analysis rollup: a purpose-built table and report exist but are wired only to catalogue-search misses, never to Gemini-scan misses (data.md C14.1-2, C14.5). Rolling Gemini misses into the same gap analysis is cheap (no new recording, only a new read or a new write of an existing failure) and directly supports always answering, by making a systematic hole in coverage visible instead of buried in per-event rows.

**Where it goes and what depends on it**
`catalogue/src/gaps.ts:40-51` is a dedicated `gap` table (`id, kind, key, gtin, query_text, first_seen, last_seen, count, note`, `UNIQUE(kind,key)`); write via `recordGap` (`gaps.ts:200+`), read via `catalogue/src/gaps-report.ts:1-50` (`npm run gaps:report`) (data.md C14.1). `app/src/scans.ts:73,79-80` already has `scan.outcome` including `'refused'` plus a `FailureClass` union (`unreadable_photo, model_timeout, model_rate_limited, model_outage, model_malformed, model_client_error, spend_cap_reached, not_in_catalogue`) (data.md C14.1). `recordScan` (`scans.ts:491-534`) is called from `completeGeminiScan` for every `/api/identify` and `/api/price` request, including failures (data.md C14.1). `recordGap` is called only from `catalogue/src/search.ts:1289,1294,1482,1544-1554`, only catalogue-search misses; `server.ts` never calls it, confirmed by grep (data.md C14.2). `gaps-report.ts` is the only gap-analysis reader and reads only the `gap` table (data.md C14.2).

**What else has to change**
To bring Gemini-scan misses into gap analysis: either call `recordGap` from the Gemini-path failure branch in `server.ts` in addition to `recordScan`, or extend `gaps-report.ts` to also read `scan` rows where `outcome='refused'`; neither exists today (data.md C14.3). No schema migration is strictly required if `scan.failure_class` is reused as-is; a migration is needed only if the `gap` table's rollup shape (first_seen/last_seen/count by key) is wanted for Gemini misses too, since `scan` rows are per-event, not rolled up (data.md C14.3). Docs describing `gaps.ts`/`gaps-report.ts` as "the gap analysis mechanism" would need updating to note it covers two miss sources rather than one (data.md C14.3).
Already partly built: yes, for the recording half. Persistent recording of every Gemini-path miss already happens in the `scan` table with a `failure_class`. What is missing is wiring that into the purpose-built gap-analysis table and report, which exist but only see catalogue-search misses (data.md C14.5).

**Rule check**
Rule 4 (*"record everything... every Gemini request and response... saved"*) is consistent with, and for the Gemini path already largely satisfied by, this feature; `recordScan` already captures every refusal with a `failure_class`. No conflict found (data.md C14.4).

---

## 15. Smooth the tracked barcode box instead of showing every raw jitter

**Copy from**
- Median + outlier-filtered smoothing (no Kalman filter) - WhiteChristmas. Stable position is the average of buffered positions within 0.5m of the buffer's coordinate-sum-sorted median; a true Kalman filter was considered but never implemented. Source: `Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:68-90`.
- Per-tracking-id position history buffer - WhiteChristmas. A `Queue<Vector3>` capped at 30 entries is kept per MLKit tracking id, oldest dequeued once the cap is hit. Source: `Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:17, 60-66`.
- Track eviction on timeout - WhiteChristmas. A coroutine wakes every 5 seconds and removes any tracked-object history whose last-seen timestamp is older than that same 5-second window. Source: `Assets/DisplayCapture/ObjectDetection/ObjectTracker.cs:21, 132-149`.

**Why we are building it**
The box reported today is always exactly "where it was on the most recent frame that saw it," documented outright in the code's own comment, so a single noisy zxing read jitters the drawn box and the box sent downstream with nothing smoothing it (camera.md A15.5). A smoothed box is unsurprising: the overlay stops visibly snapping between frames, at no added network cost since only what is drawn and what is finally sent to the price/identify path changes, not the decode itself.

**Where it goes and what depends on it**
`app/src/eye/votes.ts`, interface `VoteTrack` (45-59, `box` field at 49) and class `BarcodeVote` (87-188); the box currently reported is set at `tracks()`, line 154: `box: seenLast.s.box`, the most recent sighting's raw box, no history (camera.md A15.1). Smoothing would add a bounded per-value box history to the internal count-tracking loop (118-125) and compute a median/outlier-rejected box in place of `seenLast.s.box` before it is returned (151-160) (camera.md A15.1). `camera.ts` imports `BarcodeVote`/`VoteBox` (line 42) and uses `push` (409), `focus` (432, coaching only), `tracks` (512, for drawing at 509-533), and `confirmed` (276, box included in the emitted `StableRead` at 278-283); a smoothed box changes both what is drawn and what is finally sent downstream of `onBarcode` (camera.md A15.2). `app/test/barcode-vote.test.ts` is the one file that unit-tests `votes.ts` directly and would need new cases for smoothing; any existing case asserting an exact box value off a single frame could break (camera.md A15.2).

**What else has to change**
No telemetry, server-payload, or stored-row change; `StableRead.box` keeps the same shape (`{x,y,width,height} | null`), only its value changes. No UI string change. `barcode-vote.test.ts` is the one file that must be extended or re-verified, since it is the only place `votes.ts` behaviour is pinned by a runtime test (camera.md A15.3).
Already partly built: partly, and only for the "stale eviction" half, not the smoothing half. `BarcodeVote` already evicts by two independent time rules keyed on the barcode value (`#prune()` drops entries older than `windowMs`, default 1500ms; the leader/track computation drops values not seen within `lingerMs`, default 500ms), which is real, working stale-track eviction, just keyed on the value, not on box position. There is no bounded position history, no median, and no outlier rejection anywhere; `detector.ts` (checked in full) has none of this either for the object-detector boxes (camera.md A15.5).

**Rule check**
None found (camera.md A15.4).

---

## 16. Stop overlapping frame processing without losing the wedge-detection it would replace

**Copy from**
- Busy-flag frame dropping (both detectors) - WhiteChristmas. Both the barcode reader and the object detector track a boolean; if a previous inference on that detector hasn't finished, the new frame is dropped entirely rather than queued. Source: `Assets/DisplayCapture/Barcode/BarcodeReader.java:131-135; Assets/DisplayCapture/ObjectDetection/CustomObjectDetector.java:129-134`.

**Why we are building it**
Reading this feature as "camera.ts should not start a new frame while the previous one is still processing" is already true structurally: `#loop()` only schedules the next frame inside `.finally()` after `#tick()` fully resolves, so there is no possibility of two ticks racing (camera.md A16.5). Reading it as "replace `barcode.ts`'s per-decode timeout race with a plain busy flag" is a different, riskier claim: that race is what recovers from a wedged WebAssembly module, a real incident dated 2026-09-07 in the code's own comments, and a plain busy flag does not detect that failure mode, it only prevents overlapping calls (camera.md A16.3, A16.5). Building the part that is genuinely missing, layering a busy flag on top of the existing race rather than instead of it, keeps the design always answering without reopening a fixed incident.

**Where it goes and what depends on it**
Two candidate places, not the same mechanism. (a) `camera.ts`: the frame loop `#loop()`/`#tick()` (385-390, 392-466) and the existing `#capturing` flag (154, set/read at 393, 611-628), which already guards only the full-capture path, not per-frame decode/detection (camera.md A16.1). (b) `barcode.ts`: `BarcodeScanner.read()`'s `Promise.race([decoding, timeout])` (202-218), built around `DECODE_CEILING_MS` (44) and `WEDGE_STRIKES`/`#strikes`/`#wedged` (53, 109, 121, 234-245), the literal per-decode timeout the feature names (camera.md A16.1). `camera.ts:406` is the only caller of the race; `#loop()`/`#tick()` are private to `Camera`, called by nothing outside the file (camera.md A16.2). `app/test/barcode-button.test.mjs:58-65` string-matches the tick body requiring `this.#scanner.read(frame)` and the exact `if (this.#decoding) {...}` regex to stay intact (camera.md, universal note, A16.2).

**What else has to change**
None for telemetry/server/UI if the busy flag is added purely in `camera.ts`. If instead the barcode.ts race is what gets replaced, that removes the dead-module recovery path (D-128) documented at `barcode.ts:182-245`; a plain busy/drop flag does not detect a wedged WebAssembly module, it only prevents overlapping calls, so removing the race without replacing its function would reopen the exact incident the comments describe as already having taken the whole camera down once (camera.md A16.3).
Already partly built: partly, and the two candidate readings diverge sharply. "No new frame starts while the previous one is in flight" is already true structurally with no explicit `#busy` flag needed. "Replace the per-decode timeout race with a plain busy flag" is not built, and per the knock-on above, doing so as a replacement rather than an addition looks like a regression, not an improvement (camera.md A16.5).

**Rule check**
None found against CLAUDE.md or jamin-gemini-rules; this is a pure performance/robustness change to local code (camera.md A16.4).

---

## 17. Harden the structured output Gemini returns

**Copy from**
- Structured output schema for detection - sugar-no-scanner-demo. The call sets `responseMimeType:"application/json"` and a hand-written `responseJsonSchema` whose detections array has `maxItems:10`, a full field list, and `additionalProperties:false` at both levels; a separate Zod schema re-validates the same shape after parsing. Source: `src/server/recognition.ts:982, 156`.
- Balanced-bracket JSON extractor - ha-wine-cellar. When a direct `json.loads` fails, `parse_json_response` scans forward from the first `{` or `[`, tracking string state and bracket depth to find the exact matching close bracket, rather than assuming `{...}`, fixing arrays truncated after their first inner object; a final pass also strips trailing commas. Source: `custom_components/wine_cellar/gemini.py:63-108`.
- Response text repair before JSON parsing - WhiteChristmas. Before `json.loads`, the code strips a leading/trailing triple-backtick fence and also handles a stray `text='...'` wrapper artifact, reapplying the fence-strip afterward. Source: `backend/src/main.py:89-111`.
- Post parse detection filter - sugar-no-scanner-demo. Detections survive only if confidence clears the threshold and both box dimensions are at least 0.02 of the frame, then are sorted by descending confidence and sliced to the max. Source: `src/server/recognition.ts:1061`.
- Vision call combines Google Search grounding with a forced JSON schema - Scan-It. The same `generateContent` call sets both `tools:[{googleSearch:{}}]` and a full `responseSchema`, letting the model ground the identification in a live web search while still being forced into strict JSON in one round trip. Source: `src/App.tsx:105-107`.

**Why we are building it**
`response_schema.json` has zero occurrences of `additionalProperties`, `maxItems`, or `minItems` today, confirmed by grep across its 152 `type`/`required`/`properties` hits (aicall.md B17.5). Only one array, `alternatives`, has a length cap (`MAX_ALTERNATIVES = 5`); `offers` and `reviews` have none (aicall.md B17.5). Rejecting unknown fields and capping every list is accurate and cheap: it stops a malformed or padded answer from being trusted or from inflating tokens on a retry, without touching how many Gemini calls a scan makes.

**Where it goes and what depends on it**
Response text extraction is shared by both model families in `runGeminiScan` (~930-993): `outer = JSON.parse(raw)` (963) parses the outer envelope, and `interpretText(walked.text)` (981) is called unconditionally for both families, the divergence between the schema-mode model and the prompt-text-only model is only in whether the schema is attached to the request, not in how the reply is parsed afterward (aicall.md B17.1). `interpretText` (494-514) tries raw parse, then `parseJson` (gemini-grounded.ts:567-591, a first-to-last-brace slice, not true balanced-bracket matching), then `repairJson` (474-490, real bracket-stack balancing via `closeUp`, ~430-449) (aicall.md B17.1). `readAnswer` (700-780) and `readAlternatives` (623-671) already re-validate every field with defensive coercers regardless of which family answered (aicall.md B17.1). `completeGeminiScan`'s three callers are `server.ts:2090, 2347, 2494`; response-shape consumers include `confidence` (1300), `parseStatus` (1311), `alternatives.status`/`alternativesDropped` (1320-1321), `verdictZone` (1342) (aicall.md B17.2). Tests: `gemini-scan.test.ts` (33, 91, 94-97), `gemini-alternatives.test.ts` (125-165, a length-cap test at 133) (aicall.md B17.2).

**What else has to change**
`response_schema.json` would need `additionalProperties: false` at each object level and `maxItems` on `offers`, `reviews`, `alternatives` (aicall.md B17.3). The 2.5 prompt-text instruction is generated from the schema by `skeleton()` (262-277), which does not currently render `additionalProperties`/`maxItems` into words, so if the schema gains those keywords, `skeleton()` or explicit prose in `GEMINI_SYSTEM.md`/`scan_prompt.md` needs updating so the no-schema path is actually told to avoid extra fields or long lists (aicall.md B17.3). New rejection/cap logic would plausibly add fields (e.g. counts of rejected keys or truncated lists) to `modelJson`/`gemini_call` rows, though not required by existing code (aicall.md B17.3). `scan-metrics.ts`'s `ParseStatus` aggregation (currently only clean/repaired/failed/none) would need a decision on how a new "rejected unknown field" or "capped list" outcome is scored (aicall.md B17.3).
Already partly built: partial. Rejecting unknown fields does not exist at all (`readAnswer`/`readAlternatives` silently ignore any unnamed key; zero `additionalProperties` hits). List-length caps exist only for `alternatives` (`MAX_ALTERNATIVES = 5`); `offers` and `reviews` have none. Independent re-validation partly exists: type coercion always runs regardless of family, but nothing flags "the model violated its own schema" as a distinct outcome. Tolerant JSON recovery exists (balanced-bracket extraction, fence repair, trailing-comma repair) but runs unconditionally for both families, not as a distinct step for the no-schema path (aicall.md B17.5).

**Rule check**
None found. No rule addresses JSON schema strictness, list-length caps, or parse-recovery behavior; the existing constraint to preserve is that 2.5's malformed answer gets repaired or marked, "never failing the scan, rule 6" (`jamin-gemini-rules.md:239`) (aicall.md B17.4).

---

## 18. Harden the scan endpoints: same-origin check and frame-embedding block

**Copy from**
- Same origin enforcement on every scan endpoint - sugar-no-scanner-demo. `hasTrustedBrowserOrigin` builds the trusted set from the request origin and forwarded host, accepts a matching origin or referer, rejects `sec-fetch-site:cross-site`, and deliberately permits a missing Origin header because Chromium omits it on same-origin JSON POSTs. Source: `src/server/request-origin.ts:1`.
- Streaming body size cap - sugar-no-scanner-demo. `readBoundedJson` checks the declared content-length then counts bytes while reading the stream, cancelling the reader and throwing past the limit; the recognize route allows 3,000,000 bytes, resolve 64,000, events 32,000, offers 8,000, barcode 2,000. Source: `src/server/request-body.ts:6, src/app/api/recognize/route.ts:24`.
- Regex-based API-key redaction in debug logs - Scanly. A fixed ordered list of regexes strips bearer tokens, key-bearing query params, and provider key-prefix patterns from any debug log line, active only in debug builds. Source: `core/ai/AiLog.kt:46-65`.
- Camera permission declared at the header level - sugar-no-scanner-demo. `Permissions-Policy: camera=(self), microphone=()` plus `X-Frame-Options: DENY` and HSTS on every route, so the camera works only first-party and never inside an iframe embed. Source: `next.config.ts:47`.

**Why we are building it**
Two of the four sub-mechanisms already exist and match Shin's own design; the two genuinely missing pieces are a same-origin check (no `Origin`/`Sec-Fetch-Site` header is read anywhere in `app/server.ts`) and a frame-embedding block (no `X-Frame-Options`/CSP header is set anywhere) (failure.md D18.1, D18.5). Closing both is unsurprising and accurate in the security sense: it stops the scan endpoints from being callable cross-site or embedded somewhere the user did not expect, at zero added network cost per legitimate request.

**Where it goes and what depends on it**
Route dispatch: `app/server.ts:1966-1990`, the invite-code gate runs first for every `/api/` path except `INVITE_EXEMPT`; no CORS/origin middleware exists in this chain (failure.md D18.1). Streaming payload cap already exists: `readBody()` (`server.ts:1560-1618`) checks content-length then enforces the real cap chunk-by-chunk, and `refuseTooLarge()` (1907-1946) drains and discards a request already known to be too large (failure.md D18.1). Logging/redaction already exists: `access-log.ts:26-49` `recordAccess()` logs `invite: Boolean(...)` never the code value, and redacts the invite from the URL via regex; `errlog.ts:60-79` explicitly excludes photo bytes, coordinates, and request bodies (failure.md D18.1). The Gemini API key is sent only via the `x-goog-api-key` header, never a `?key=` query parameter, by explicit design (`identify/src/providers/gemini.ts:37-39, 283-286`) (failure.md D18.1). `readBody()` is called by every JSON-accepting route (`/api/identify/photo`, `/api/price`, `/api/scan-rating`, `/api/consent`, `/api/event`, `/api/events/batch`), so changing its cap logic affects all of them (failure.md D18.2). `recordAccess()` runs on every request via `res.on('finish', ...)` at `server.ts:1841` (failure.md D18.2).

**What else has to change**
A same-origin check would sit in the same place as the invite gate (`server.ts:1985-1990`), before route dispatch, and would need to decide what a missing `Origin` header means, since native app wrappers may not send one (`api.js:56-58` already accounts for a wrapper-set global) (failure.md D18.3). A frame-ancestors/`X-Frame-Options` header would need to be set once, globally, likely alongside the other headers in `json()` (`server.ts:1845-1852`), since no existing per-response header-setting helper covers this today; it would touch every `res.writeHead(...)` call site or need a shared wrapper (failure.md D18.3). `app/test/server-beta-routes.test.ts` and `paid-call-limits.test.ts` are the existing server-route test files where a same-origin test and a frame-header test would be new additions (failure.md D18.3).
Already partly built: two of four sub-items already exist essentially as specified (streaming payload enforcement, API-key/invite-code redaction from logs). The two missing pieces, a same-origin check and a frame-embedding block, are genuinely absent, not partially built (failure.md D18.5).

**Rule check**
None found for the streaming-cap or log-redaction pieces, both already matching "Record everything" without recording secrets (`jamin-gemini-rules.md:46-48`, `errlog.ts:22-24`). A same-origin check should be checked against rule 5, "Legal issues mark, never block" (`jamin-gemini-rules.md:50-51`), and rule 6, "Always an answer," if it would cause a legitimate client, such as a native wrapper with no Origin header, to be refused; that would need marking rather than blocking, per Jamin's stated rule (failure.md D18.4).
Needs his call: should a same-origin check refuse a request with no Origin header (a legitimate native-wrapper case), and does that refusal need to be raised before shipping per the "mark, never block" rule?

---

## 19. A scripted demo scan with a fixed sample answer, no provider call

**Copy from**
- Deterministic sample scenes bypass the provider entirely - sugar-no-scanner-demo. For two named sample sources, a scripted answer tagged `model:"deterministic-sample-v1"` is returned with no Gemini call and no rate-limit charge, which is how the onboarding "sample results" screen works without camera permission. Source: `src/server/recognition.ts:931, src/app/api/recognize/route.ts:71`.

**Why we are building it**
Nothing in the codebase today lets someone without camera permission, or on a machine without the catalogue file, see a real scan result; the closest things are a progress-bar animation that states nothing about the product and a hand-priced local fallback that still calls `/api/identify` for real (failure.md D19.1). A canned demo scan is effortless for onboarding and always answering for that specific case, camera permission not yet granted, at zero Gemini cost, provided the row is labelled as a demo rather than presented as a real answer.

**Where it goes and what depends on it**
Nothing implements this today; no route, function, or flag named for "return a canned scan answer" was found (failure.md D19.1). `onboarding.js:264-282` `evaluatingBody()` is a progress-bar animation over three stage lines, documented in its own comment as "a demo of the scan wait" that "states nothing about the product: no price, no saving, no percent saved," and never reaches the camera (failure.md D19.1). `camera.js:3020-3025` `catalogueLookup()`'s comment describes a hand-priced demo shelf fallback for when the catalogue is not attached, but it still calls the real `/api/identify` (failure.md D19.1). `onboarding-flow.js:5-13` documents that onboarding deliberately ends at step 31 and hands off to the real camera screen for anything past that, so nothing depends on a demo path today, and adding one would be additive (failure.md D19.2).

**What else has to change**
A new scan-log row shape or flag (e.g. `source: 'demo'` or `demo: true`) is needed so a demo row is distinguishable everywhere scan rows are read, including the profile screen's rates in `api.js:353-365` `scans()`, which explicitly states "a week with no scans in it is unknown, not zero percent," a guarantee a mislabelled demo row would break (failure.md D19.3). New copy (the sample answer's verdict, any mascot line introducing it) belongs in `voice.js`; a "this is a demo" label belongs in `ui-strings.js`, per the split documented at `ui-strings.js:1-33` (failure.md D19.3). A new telemetry event (e.g. `demo_scan_shown`) would need to be added and kept out of any funnel that assumes a track event implies a real scan (failure.md D19.3). `onboarding-flow.js`'s rule 2, "Figures show only when real," gates published figures on a `source` and `measuredAt`; a fixed demo price/verdict is not "real" in that sense and would need an explicit demo exemption or it will fight this feature (failure.md D19.3). `docs/beta-gaps-2026-09-19.md` would need a new entry if this ships as a gap-closer (failure.md D19.3).
Already partly built: nothing like it today. The only existing "demo" concepts are the onboarding evaluating-animation, which never shows a fixed answer and never touches the camera or a provider, and a hand-priced local catalogue fallback that still calls `/api/identify` for real (failure.md D19.5).

**Rule check**
C:\agent CLAUDE.md hard rule 3, "No fabricated evidence": *"Scores, baselines, logs, outcomes record what happened; a row scored 0 is recorded as 0; absence of signal is a finding."* A scan row recording a demo's fixed sample answer the same way it records a real Gemini answer would be a log claiming an event happened, a real identification, that did not happen, which is exactly the fabrication this rule forbids (failure.md D19.4). What makes it compliant: labelling the row as a demo at write time, so the log records what actually happened, a canned response shown without a provider call, rather than presenting it as an unlabelled real answer (failure.md D19.4). `jamin-gemini-rules.md:46-48`, rule 4, "record everything," is satisfied the same way: a demo scan is still an interaction and still needs a row, labelled as what it is (failure.md D19.4). `onboarding-flow.js:19-27`, "Figures show only when real," is an enforced local convention rather than a hard rule; compliance requires the demo be visibly labelled as a demo on screen, not only in the log, if it shows any savings or price-comparison figure (failure.md D19.4). This item fits, provided the row and the on-screen figure are both labelled as a demo; no further decision is flagged in the deps file beyond that labeling requirement.

---

## 20. Return a per-stage latency breakdown, not just a single total

**Copy from**
- Per-call latency instrumentation returned to caller - WhiteChristmas. Upload time, model-analysis time, and total time are measured with wall-clock deltas around each stage and returned in the response metadata block rather than sent to any external telemetry system. Source: `backend/src/main.py:309-318, 360-389`.

**Why we are building it**
Today only one number exists per call, `run.ms` (the whole prompt-build-plus-HTTP-plus-parse duration), aggregated at the daily p50/p95/max level but never broken into stages anywhere in `gemini-scan.ts`, `gemini.ts`, `gemini-grounded.ts`, `provider.ts`, or `server.ts` (aicall.md B20.1, B20.5). A per-stage breakdown is a calibration improvement for diagnosing where a slow scan actually spent its time, in service of instant, but it changes nothing about cost or the one-call rule.

**Where it goes and what depends on it**
Total timing: `runGeminiScan`'s `const started = clock();` with every `finish()` return path setting `ms: clock() - started` (~849-901), one number for the whole call (aicall.md B20.1). Server-side total, measured again independently: `completeGeminiScan`'s `const ms = Date.now() - a.startedAt;` (1288) (aicall.md B20.1). Persisted as one column: `app/src/scans.ts:518`, `input.latencyMs` -> `latency_ms` (aicall.md B20.1). Aggregated only, never per-request: `app/src/latency.ts`'s `dailyLatency` (66), served at `/api/latency` (`server.ts:3033-3036`) (aicall.md B20.1). Response objects with a single total `ms` today: `/api/identify` (2157), `/api/photo` (2422); `/api/price`'s response block has no `ms` key at all (aicall.md B20.1). Callers: `runGeminiScan` from `completeGeminiScan` and `scan-run.ts:278`; `latency_ms` read by `latency.ts:74`; `scan-metrics.ts`'s `ScoredRow.ms` (81) aggregated into `FamilyReport.meanMs` (327), a straight mean with no per-stage data to aggregate (aicall.md B20.2). Tests `server-photo-record.test.ts:166` and `server-beta-routes.test.ts:150` assert `typeof row.latency_ms === 'number'`; no client consumer of the response `ms` was found anywhere in `app/public/js` or `native/` (aicall.md B20.2).

**What else has to change**
The `scan` table has exactly one timing column, `latency_ms INTEGER`; per-stage data needs either new columns or a JSON column, plus new fields on `RecordScanInput`/`ScanRow` and the insert at 499/518. The `gemini_call` table similarly has only one `ms INTEGER` column (aicall.md B20.3). `/api/identify` and `/api/photo`'s response blocks would need a `latency`/`stages` object added; `/api/price` would need an `ms` field added if it should carry a breakdown too (aicall.md B20.3). `response_schema.json` is unaffected, since it governs the answer content, not timing metadata (aicall.md B20.3). `scan-metrics.ts`'s `meanMs`/`ScoredRow.ms` assume one number per row and would need a new field alongside or instead. Tests asserting a scalar `latency_ms` would break unless a scalar total is kept alongside any new breakdown (aicall.md B20.3).
Already partly built: partial. Logged and stored as one aggregate number, not per-stage; in the response body for `/api/identify` and `/api/photo` as a single total, not a breakdown; not present at all in `/api/price`. No per-stage breakdown exists anywhere; terms tried and empty repo-wide include `stageLatency`, `timeline`, `breakdown`, `stages:`, `per-stage`, `per_stage` (aicall.md B20.5).

**Rule check**
None found. No rule addresses latency reporting or response-body timing contents; rule 4 ("record everything") is about recording interactions, not response shape, and returning latency in-band doesn't reduce what's recorded elsewhere (aicall.md B20.4).

---

## 21. Detect a scene change and discard a stale result before it is shown

**Copy from**
- Stale result discard after scene change - sugar-no-scanner-demo. When a recognition response arrives, the frame it was computed from is re-compared with the live frame; if the scene no longer matches, the whole response is thrown away and the next capture is delayed 250ms. Source: `src/components/scanner-app.tsx:641`.
- Two strike scene change debounce - sugar-no-scanner-demo. A single failed scene match is tolerated; the mismatch counter must reach 2 before the app declares a scene change, clears the tray, and restarts recognition, preventing one blurred tick from wiping results. Source: `src/components/scanner-app.tsx:869`.
- Same scene test and box drift correction - sugar-no-scanner-demo. A translation is accepted only when `difference<=25` and `confidence>=0.38`; when accepted, `translateDetection` slides existing overlay boxes by the measured dx/dy so boxes track the shelf between recognitions instead of being re-requested. Source: `src/lib/live-camera-tracking.ts:92, 78`.

**Why we are building it**
No file in `app/src/eye` currently discards a result after the fact; the closest primitives, `shelf.ts`'s signature distance and `StabilityGate`'s box-drift debounce, both do the opposite job, triggering a new send or preventing a capture from firing, not invalidating one that already fired (camera.md A21.5). Showing an answer for a shelf the user has already moved past is unsurprising in the bad sense; discarding it is unsurprising in the good sense. But this item carries a real risk to always answering and to rule 4's "record everything," addressed below, so it needs a decision before it is built as a post-Gemini discard.

**Where it goes and what depends on it**
No existing function does whole-frame translation/scene-change detection for this purpose. Two reusable primitives: `shelf.ts`'s `signatureOf()` (102-122, an 8x6 mean-luminance grid) and `signatureDistance()` (125-131), built for the opposite direction, deciding to send a new photo when the scene has changed enough (`shouldSendShelf()`, `SHELF_MIN_CHANGE = 0.08`); and `capture.ts`'s `StabilityGate` (189-231), which debounces on a held window of samples and rejects on box drift, but per-object, not whole-frame, and gates before a capture fires rather than discarding a result after (camera.md A21.1). A literal implementation would most naturally sit in `camera.ts`, tracking a frame signature from the moment a capture or barcode read is taken, compared against the live frame on each subsequent tick, with a 2-consecutive-tick debounce; there is no existing "two strikes" counter pattern in `camera.ts` today, the closest is `barcode.ts`'s `WEDGE_STRIKES = 3`, a different debounce for a different failure (camera.md A21.1). If built by reusing `shelf.ts`'s exports, its current importers are `app/src/eye/index.ts:39-49` and `app/public/js/eye-shelf.js` (hand-written); `app/test/shelf-capture.test.ts` (25-92) unit-tests those exports directly and would need new cases only if their exported behaviour changes (camera.md A21.2).

**What else has to change**
This depends entirely on what "discard" means for the consumer. If it discards before `onCapture`/`onBarcode` ever fires, there is no server/telemetry/UI change, since the result never leaves `camera.ts`. If a result can already be in flight to the server, or a crop already sent to Gemini, when the scene is judged to have moved, discarding client-side does not un-send that request, so a "record everything" gap opens: rule 4 means a discarded-but-already-sent answer is still a Gemini call and must still be recorded, just marked as not shown, which needs a decision, not a silent client-side drop, if the discard can race a network response back (camera.md A21.3).
Already partly built: not built as specified. `shelf.ts`'s signature distance and `StabilityGate`'s box-drift debounce both exist and are tested, but neither does "detect the scene moved and discard an already-produced result"; `shelf.ts` triggers a new send on change, and `StabilityGate` prevents a capture from firing in the first place (camera.md A21.5).

**Rule check**
`jamin-gemini-rules.md` rule 4 (one Gemini call per scan, line 36) and "record everything" both make one call and full recording central; a feature that silently throws away a result after the one permitted call was already made is spending the one call and then hiding its answer, which the rules' own preamble says to raise with Jamin rather than build quietly: *"A decision that would contradict them is raised with Jamin, never made quietly."* (camera.md A21.4).
Needs his call: does A21's "discard a stale result" mean a pre-send client-side box/read (no conflict), or a post-Gemini-answer discard, which spends the one permitted call and then hides its answer and would need to still be recorded per rule 4?

---

## 22. Tie thinking level to the specific model tier, not one global default

**Copy from**
- Thinking level chosen by model id prefix - sugar-no-scanner-demo. `recognitionThinkingLevel` returns `LOW` when the target model id starts with `"gemini-3.7"` and `MINIMAL` otherwise, so the cheaper primary model runs with the least thinking and only the fallback pays for more. Source: `src/server/recognition.ts:124`.
- Generation params are thinking level and media resolution only - sugar-no-scanner-demo. Already ours: no temperature, topK, topP, or maxOutputTokens is set anywhere in the recognition module; only `thinkingConfig` and `mediaResolution` are configured, matching our own generation-parameter policy exactly. Source: `src/server/recognition.ts:979`.

**Why we are building it**
The live path already gates thinking by model family (2.5 gets none, 3.x gets one global value), but within that gate it is one constant applied to every 3.x call regardless of which specific 3.x model id is actually configured (aicall.md B22.5). Varying thinking by the specific tier, not just the coarse family split, is cheap: it spends more reasoning only where a heavier model tier is already paying more, rather than a flat setting for every 3.x call.

**Where it goes and what depends on it**
`modelForScan` (`gemini-scan.ts:80-89`) picks between `DEFAULT_GEMINI_25 = 'gemini-2.5-flash'` and `DEFAULT_GEMINI_3 = 'gemini-3.8-flash'` by a stable hash of the device id, returning `ModelChoice{model, family, via}` (aicall.md B22.1). `thinkingLevel()` (`gemini.ts:204-207`) reads `SHIN_GEMINI_THINKING`, validated against `{minimal,low,medium,high}`, defaulting to `low`, and takes no model/tier/family argument (aicall.md B22.1). `buildRequestBody` (`gemini-scan.ts:400-401`) sets `thinking_level: thinkingLevel()` only when `choice.family === '3.x'` (aicall.md B22.1). A legacy/eval-only path, `interactionBody` (`gemini.ts:332-358`), sets the same thinking level unconditionally for every model, but is not on the live `/api/identify`/`/api/photo`/`/api/price` path (aicall.md B22.1). `modelForScan` is called at `gemini-scan.ts:851`; `scan-run.ts` forces family directly via env rather than calling it (aicall.md B22.2). `gemini.test.ts:179, 214, 242-248` pin a single global thinking value applying uniformly, with no tier distinction (aicall.md B22.2). Cost accounting needs no change here: `model-cost.ts` already folds thinking tokens into cost from actual reported usage without double counting (aicall.md B22.2).

**What else has to change**
No `response_schema.json` change. `scan.model_json` already stores `model`, `family`, `via`, `parseStatus` per scan but not which thinking level was sent; `gemini_call` has no `thinking_level` column, so making thinking vary by more than the family gate needs a new field/column for auditability (aicall.md B22.3). The paid-key side-by-side test already compares 2.5 and 3.x "side by side," and `scan-metrics.ts`'s `ScoredRow`/`FamilyReport` group only by `family`, not thinking level, so varying thinking further by specific tier adds a dimension that comparison currently cannot distinguish, a measurement-design concern rather than a rule conflict (aicall.md B22.3-4). `gemini.test.ts:179, 214, 242-248` would need rewriting if this is implemented on the `interactionBody`/`GeminiProvider` path; the live `gemini-scan.ts` path has no equivalent named test pinning its family-gated behavior today (aicall.md B22.3).
Already partly built: partial. The live path already gates thinking by model family, but within that gate it is one global constant applied to every 3.x call regardless of which specific 3.x model/tier is configured; the legacy path sends the same global level to every model with no gate at all (aicall.md B22.5).

**Rule check**
None found. No rule addresses thinking level or reasoning configuration; the closest adjacent text establishes only that 2.5 cannot combine a response schema with search grounding, a Google API limitation, and that the paid-key test compares families side by side (aicall.md B22.4).

---

## Build this first, before any item

`app/public/js/eye.js`, `eye.js.map`, plus `chunks/` and `vendor/`, are esbuild output of `app/src/eye/index.ts`, built only by running `node app/scripts/build-eye.mjs` (camera.md, universal fact, lines 10-12). They are gitignored (`.gitignore:34-37`) and the build script is wired into no npm script: `app/package.json:10-21` has no `build-eye`/`build:eye` entry, confirmed again at `docs/archive/now-history-2026-09-27.md:1841`, "Rebuilt with `node app/scripts/build-eye.mjs`, which is wired into no npm script" (history, moved out of NOW.md 2026-09-27) (camera.md, universal fact, lines 12-14). `mac/deploy/deployer.mjs:98` runs it explicitly during deploy (camera.md, universal fact, line 15). `docs/audit-google-doc-2026-09-19.md:44` records the exact failure mode: "a fresh checkout has no camera until it is built" (camera.md, universal fact, lines 15-16). Every camera-side item in this document (5, 12, 13, 15, 16, 21), once written in `app/src/eye/*.ts`, requires this manual or deploy-time rebuild before it reaches the browser; `app/public/js/eye-attach.js:263,413` dynamically imports `/js/eye.js` at runtime, never the TypeScript source (camera.md, universal fact, lines 16-19). Wiring `build-eye.mjs` into an npm script, or otherwise making the rebuild automatic, is the one change that makes every camera item in this document visible in the running app at all.

## Open questions for him

1. Does replaying a Gemini answer from a cached prior scan count as "the price coming from Shin" under rule 3, and does a cache hit violate or satisfy "one Gemini call per scan" under rule 1? (item 1)
2. Should the zero-pad barcode retry ever re-hit Gemini with a second candidate string, or must it run only as pre-send sanitization or against non-Gemini sources to stay inside "one Gemini call per scan"? (item 2)
3. Does fetching and parsing a retailer page to confirm a Gemini-stated price count as a second call under rule 1, and would swapping in the parsed number on a mismatch violate rule 3's "price should not come from us"? (item 3)
4. Does substituting "absent" for a price that fails a floor, currency, or self-consistency guard violate rule 6's "an unchecked answer beats no answer," and does the guard logic itself count as "the price coming from Shin" under rule 3? (item 4)
5. Does querying Open Food Facts before the Gemini call count as the server doing something other than "call gemini," given that the existing rule text ties that restriction specifically to Shin's own product list, not a third party? (item 6)
6. For the grounding short-circuit, does "cheaper source" mean Shin's own catalogue or stored data, which the rules explicitly forbid consulting, or something else such as a cache of a prior Gemini answer? (item 7)
7. When a background enrichment pass produces a different value than what the user was first shown, should it be written to a separate column rather than overwriting the shown value, and is that split what "record everything" actually requires? (item 11)
8. Should a same-origin check refuse a request with no Origin header, a case a legitimate native wrapper may hit, and does that refusal need to be raised before shipping under the "mark, never block" rule? (item 18)
9. Does "discard a stale result" for a scene change mean a pre-send client-side box or read, which is no conflict, or a post-Gemini-answer discard, which spends the one permitted call and then hides its answer and would still need to be recorded under rule 4? (item 21)

## What we are deliberately not building

1. **Second-AI-call patterns.** Every competitor mechanism that adds a second model call for disambiguation, confirmation, or verification is named as breaking the standing rule, one Gemini call per scan: a second vision pass for ambiguous SKUs (`docs/competitor-scanners-2026-09-19.md:762-766`, "breaks 'one AI call per scan' directly... conflicts with our current standing rule"), a confidence-gated secondary AI path (`:820-824`), and a 503-retry SDK config giving up to three calls for one recognition (`:751-754`, "a second grounded call was deliberately removed 2026-09-15 because the product rule is one Gemini call per scan"). The accuracy gain some of these offer is real; it is not worth the rule it breaks.
2. **The consent gate and paywall pattern.** A consent gate before any paid AI price call (`docs/competitor-scanners-2026-09-19.md:1174-1178`, "a consent gate before a paid call is the opposite of our instant/always-answering design") and a free-scan paywall gate before the camera opens (`:1310-1314`, "none against 'effortless' and 'always answering' as our objectives are stated") both work against the objectives this scanner is built to hit.
3. **The browser's built-in barcode reader.** `BarcodeDetector` is explicitly avoided in favor of `zxing-wasm`, because the native API does not exist in WebKit/iOS Safari and fails silently there (`docs/competitor-scanners-2026-09-19.md:200-204`, "we explicitly avoid the native `BarcodeDetector` entirely... the native API does not exist in WebKit/iOS Safari and fails silently there," citing `barcode.ts:1-24`).
4. **OCR-regex barcode extraction.** Full-page OCR followed by a bare `/\b\d{8,13}\b/` regex match has no checksum and no symbology to anchor against, so it can match an unrelated 8-13 digit number printed anywhere on the label (`docs/competitor-scanners-2026-09-19.md:260-264`, "a bare fallback of last resort at best"). The barcode symbol itself is decoded via zxing-wasm instead.
5. **Outright security bugs found in competitor scanners.** Several named defects are called out plainly as bugs, not techniques: an `eval()` call on raw model output, "a direct code-execution vulnerability" since a crafted or hallucinated response can run arbitrary Python (`docs/competitor-scanners-2026-09-19.md:1126-1128`); a hardcoded shared account baked into a browser extension, defeating per-user attribution or rate limiting (`:1386-1390`); and a hardcoded Gemini API-key placeholder shipped in committed source (`:1368-1372`). None of these are copied.
