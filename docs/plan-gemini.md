# Plan: Gemini for identification, prices and reviews

Written 2026-09-14 from Jamin's session on the worker Mac. Everything decided or proposed about Gemini that day, in one place. Quotes in italics are Jamin's words. Terms quotes are copied from https://ai.google.dev/gemini-api/terms as read on 2026-09-14. This is a reading of a contract, not legal advice.

Status: **decided in principle, build stopped part way** (see "Build state" at the end). Nothing here is live.

---

## 1. What Jamin asked for

> *"lets switch to gemini for barcode and image searches. Shin should be recommneding the user to search barcodes and if it doens't have a barcode, it should search the image. shin should guide the user to frame the image correctly. research geminis terms for what our app is trying todo. Also, we will accept all answers gemini gives, just give a heads up that something doesn't have a link. Gemini also provides reviews which is something that we wanted to add. Consider everything we wanted this repo to do and what gemini is capable of"*

Decisions that follow from it:

- Gemini with Grounding with Google Search replaces Claude for barcode misses and photo identification. Rule 7 ("Claude does not take over," `docs/jamin-gemini-rules.md`) means no Claude fallback: with `SHIN_MODEL_PROVIDER=gemini` set and no `GEMINI_API_KEY`, the server refuses to start rather than falling back to Claude (`geminiKeyProblem`, `app/server.ts:3357`, exits at `:3371`), and a Gemini call that fails after being selected surfaces as its own failure rather than a Claude answer (`identify/src/model.ts:833-836`). A genuinely unset `SHIN_MODEL_PROVIDER` is a different case, not covered by rule 7: Gemini was never asked for, so the unchanged Claude path is the correct provider, not a fallback behind it (`makeProvider`, `identify/src/model.ts:838-845`).
- Barcode first. The camera recommends pointing at the barcode; with no barcode, it moves to a photo and coaches framing.
- Every Gemini answer is accepted. Anything without a source link gets a short heads-up ("no link for this"), and is still used.
- Reviews come from Gemini (rating, count, short summary, links).

Why it was considered at all: on 2026-09-14 every price request from Jamin's phone test was refused (7 of 7), 9 of 30 barcode scans were not in the catalogue, and photo picks chose a European variant or a brandless "Water" product. See the Notion "Needs attention" entry of 05:40 UTC.

## 2. Google's terms and what they mean for Shin

### 2.1 Storing and reusing results (the big one)

> "You will not, and will not allow your end user or any third party to, cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results or Search Suggestions."

> "it is a violation of these terms to use Grounding with Google Search to extract or collect one or more of these components for another purpose (for example, using programmatic or automated means to collect Links, using Links to build an index, or using Links to identify destination pages for crawling or scraping)."

> "You will only use Grounding with Google Search in an application that is owned and operated by you and will only display the Grounded Results with the associated Search Suggestion(s) to the end user who submitted the prompt."

"Grounded Results" means the whole answer Google generates using search, not only the links.

Jamin asked whether we can save the product a barcode refers to (Google does not own that fact), and save price ranges while never showing the links. Answer given:

- It is a contract term, not copyright. Facts are not owned, but using the key means agreeing not to cache, analyze or learn from grounded answers.
- Saving barcode to product from a grounded answer is caching. Computing a price range from grounded prices is analyzing. Hiding the links does not help, because the restriction is on the answer itself.
- No penalty clause was found on that page. The practical risk is losing the key, which would switch off identification. Low while in a family beta, real after launch.

What IS allowed, and what Shin does instead:

- **Per user history.** "You may copy and store, for up to two (2) years, the text of the Grounded Result(s) ... in chat history of an end user of your application only for the purpose of allowing that end user to view their chat history". Grounded answers go on that user's own scan record only.
- **Ungrounded identification is ordinary model output.** Gemini recognising a product from a photo without the search tool is not a Grounded Result and can be stored in the shared catalogue like today's Claude answers. So on a barcode miss, Shin also asks for a photo of the front, and the ungrounded identification is paired with the barcode.
- **Our own price sources** (Walmart and Canadian Tire crawls, Best Buy API, recorded prices) can be stored and turned into ranges.
- **Resubmitting for a refined answer.** Stored "temporarily for the purpose of resubmitting the text of the Grounded Result in a subsequent prompt that you submit to Google via a function call to obtain a refined or improved Grounded Result to display to the end user", as long as interim results are not used for anything else, undisplayed ones are deleted, and Search Suggestions are shown with the final answer. This is what makes the verdict design in section 4 possible.
- **Written permission.** The modification rules start "Unless permitted by Google in writing". Worth asking Google once there is traction.

### 2.2 Display rules

> "Unless permitted by Google in writing, you: (1) will not modify, or intersperse any other content with, the Grounded Results or Search Suggestions; and (2) will not place any interstitial content between any Link or Search Suggestions and the associated destination page, redirect end users away from the destination pages, or minimize, remove, or otherwise inhibit the full and complete display of any destination page."

> "You may monitor end user interactions with your application interface; however, you will not track whether those interactions were specifically with a given Search Suggestion or Grounded Result (in each case, in whole or in part, including any specific Link)."

What this means:

1. **Search Suggestions must be shown** with every grounded answer, as Google provides them (up to 5). Tapping one opens google.com.
2. **No rewriting after the fact.** No trimming, translating, or retelling in Shin's voice once the answer is back. Our own prices and Gemini's prices sit in separate sections, not one merged list.
3. **Links go straight to the store.** No affiliate tags, no redirect through our server, no "leaving Shin" screen, no in-app frame. Affiliate income cannot come from Gemini-found links, only from our own sources.
4. **No tap tracking inside the Gemini section.** Shin logs every tap today; taps on grounded content and its links are excluded. Screen-level events are fine.

### 2.3 Shaping the answer is allowed

Jamin asked: *"can we frame gemini to respond in a certain way"*. Yes. The rules stop changes after the answer returns, not instructions in the request. The request asks for Shin's voice, the user's language (English or French), Canadian stores and CAD only, short lengths, and a fixed JSON layout. Structured output works together with Google Search on Gemini 3 models (https://ai.google.dev/gemini-api/docs/structured-output, marked preview). Shin renders the returned fields as returned. Whether filling our own layout with those fields counts as modifying is not settled by the terms; it is a far safer reading than rewording.

Rejected option: passing our own prices to Gemini so it writes the good/fair/high verdict. Allowed by the terms, but the verdict would be a model's opinion, which Shin's founding rule forbids.

### 2.4 Other terms

- **Paid tier only.** Free tier: "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services" (testers' photos). The pricing page also lists Grounding with Google Search as "Not available" on the free tier for the current 3.x models.
- **Europe.** "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom."
- **Age.** "You must be 18 years of age or older to use the APIs." Unconfirmed whether this reaches the app's end users or only the developer.
- Google stores grounded prompts and output for 30 days for creating results and debugging.

## 3. Cost per scan, compared with Claude

From https://ai.google.dev/gemini-api/docs/pricing (read 2026-09-14) and Shin's own scan records:

| | Per scan |
|---|---|
| Claude today, photo identification (measured, 15 photo scans on 2026-09-14) | about 0.26 cents (0.23 to 0.46). No web search, so prices cost nothing extra and mostly came back empty. |
| Gemini, identification from a photo (estimate) | about 0.3 cents on 3.5 Flash-Lite ($0.30 in / $2.50 out per 1M tokens), about 0.6 cents on 3.8 Flash ($0.75 / $3.75 per 1M until 2026-12-31, then $1.50 / $7.50) |
| Gemini, grounded search for prices and reviews | 5,000 free search requests a month shared across Gemini 3.x, then $14 per 1,000 (1.4 cents each). One lookup likely runs 1 to 3 searches (guess until measured). |
| Gemini verdict step (code execution) | tokens only, about a fifth of a cent; "no additional charge for enabling code execution" |

Total: about 0.5 to 1 cent per scan inside the free allowance; about 2 to 5 cents above it, roughly 10 to 20 times Claude today, in exchange for a product name, prices and reviews instead of "nothing has a price".

## 4. The price verdict

### 4.1 What Gemini returns

Jamin: *"can we make it so that gemini only responds with the prices of stores and the review of the product."*

The grounded answer contains only:

- store offers: retailer, price (CAD), url, size value, size unit, pack count, model number and specs (for tech), condition (new, open-box, refurbished, used)
- the product's reviews: rating, count, short summary, url

No description, no advice.

### 4.2 The user's own range

Jamin: *"ask the user what their range for a bad, resonable and good price is as an average above or below the price and then we tell the user based on their preference"*

- Each user sets once (setup and settings): good = at least X% below the typical price, bad = more than Y% above it, reasonable in between. Defaults 10% and 10%.
- Typical price = the **median** of the store prices found, not the average, because one marketplace outlier would skew an average.
- The shelf price comes from the user (typed, or the shelf tag reader). No shelf price, no verdict: show prices and reviews and ask for the price.
- The wording is "based on N prices found", never "factually": the verdict is only as good as the prices Gemini found, and every answer is accepted.

### 4.3 Who does the math

Our server computing a median from grounded prices would be "analyze". The plan as written here called this out and proposed the allowed resubmission carve-out: a second Gemini request would resubmit the grounded prices, the shelf price and the user's thresholds with the **code execution** tool on. **That second request was never wired.** Rule 1 ("one Gemini call per scan," `docs/jamin-gemini-rules.md`) forbids the design this section used to describe, and it was never built to run in production anyway: `verdictResubmissionRequest` (`identify/src/providers/gemini-grounded.ts:602`) and `GeminiGroundedProvider.verdict` (`:960`) exist in the file but have no production caller — only `identify/test/gemini-grounded.test.ts` and the fixture `identify/test/fixtures/gemini-website/piece5-verdict-resubmission.json` call them.

The math runs LOCALLY instead, in `identify/src/gauge.ts`'s `computeGauge` (`:437`), called from `priceLineFor` (`identify/src/providers/gemini-grounded.ts:1180`), which `lookupPrice` (`:1331`) calls at `:1342` and which `app/server.ts:2536` wires into the live price route. This is an acknowledged crossing of the §2.1 "analyze" term above, left working under rule 5 ("legal issues mark, never block"): nothing here blocks the price line, and the resulting block is marked `checked: false` rather than withheld. `identify/src/providers/gemini-grounded.ts:780-784` documents the crossing directly: "the price line is COMPUTED HERE, with `computeGauge` ... Both used to be ruled out by Google's terms (no modifying, no analysing). That is a terms crossing left working on purpose, and it is listed as one."

`gauge.ts`'s own file header (`:8-13`) still says `computeGauge` "MUST NEVER BE RUN ON A REAL GROUNDED PRICE" and describes production as running `GAUGE_PYTHON_SOURCE` inside Gemini's sandbox — that header is now stale against the wiring above, which runs `computeGauge` on real grounded offers on every priced scan. Not fixed here: this doc only covers `docs/plan-gemini.md` and `docs/gemini-work-list.md`; the header belongs to whichever lane owns `gauge.ts`.

Jamin: *"gemini can simply calculate something like the median and each step away from the median is a percentage determined by an algorithm and all prices are placed on the line"*. **The eight-step algorithm below is accurate to what `computeGauge` actually does** (`identify/src/gauge.ts:437-556`; numbered 0 to 8 in the file's own docstring at `:46-66`), with two corrections against drift:

0. Reduce every offer to its effective price per item (a "2 for $5" prices at $2.50 each, a buy-one-get-one at half), then scale every offer and the shelf item to one base unit per dimension (mass to g, volume to mL, count stays each; pack count multiplies), to a unit price: per 100 g, per 100 mL, or per item.
1. median of those unit prices (after unit scaling, section 5)
2. `pct = (unit price - median) / median * 100` for every offer and for the shelf price
3. `span = ceil(max(max |pct|, 1.5 * under, 1.5 * over) / 5) * 5`
4. `position = 50 + pct / span * 50` (0 to 100, median at 50)
5. zone boundaries at `50 - under / span * 50` and `50 + over / span * 50`
6. ticks every 5% (every 10% when span > 30), labelled "-10%", "middle", "+10%"
7. **corrected**: the zone CODE the shelf price falls in — `under_your_line`, `middle`, or `over_your_line` (`identify/src/gauge.ts:539`), never the words good, reasonable or bad. The old text here said "good if `pct <= -good`, bad if `pct > bad`, else reasonable," which is the wording Aurik's 2026-09-14 ruling reverted (see `docs/jamin-gemini-rules.md`'s "known contradictions"); the client turns a code into words, this function never does.
8. **corrected**: every offer not on the line is returned in `excluded` with a stable code saying why (wrong currency, marketplace, member-only, different brand, different organic, no size, different dimension, unknown weight). The old text here said "for tech variants, the price difference of each other variant" — that is a different step that does not exist in `computeGauge`. Tech-variant price differences live in a separate file, `identify/src/gauge-variant.ts`, which has no caller outside its own test (`identify/test/gauge-variant.test.ts`; verified by grep, nothing in `identify/src` or `app/server.ts` imports it). Section 6's tech-variant design is not built.

Shin's only check on a real resubmission, if one is ever wired: the code Gemini actually executed is our function (`codeMatchesGauge`, `identify/src/gauge.ts:810`). That function exists today but, like the resubmission it checks, has no production caller. The function is unit-tested locally with fake numbers: one store, all prices equal, an outlier, multipack, oz to g, mixed L and mL, missing size, mass vs volume mismatch.

Where our own sources have prices, the existing arithmetic verdict runs on those and is shown in its own section with the same line.

### 4.4 The price line

Jamin: *"i imagine the prices showing up as a colored line with a large dot as the photographed items price and smaller dots as all the sources prices"*

```
 good          reasonable            bad
 ●─────────────●──────●───────●──────────────●
 green   $4.49 │  amber     $5.29      red
         ⬤ this one $4.79
```

- Horizontal line in three zones: green (good, cheap side), amber (reasonable), red (bad), boundaries from the user's percentages. Word labels on each zone, never colour alone.
- Large dot: the scanned item. Small dots: each store. Positions and boundaries come from the Gemini code-execution result; the client only draws.
- Every dot is labelled with its actual quantity and price as sold, for example "4 L · $6.99" or "6 x 355 mL · $4.49", including the large dot. Jamin: *"there also needs to be measures in place that label each dot on the graph with its actrual quantity."*
- At phone width (400 px) labels never overlap: alternate above and below with short leader lines; dots on top of each other merge into "3 prices", which expands on tap.
- Tapping a small dot opens that store's link directly, untracked.
- Under the line: the store list as returned (store, price, link), the no-link heads-up, and Google's Search Suggestions, so links stay fully visible.

## 5. Sizes

Jamin: *"everything should be scaled down or up to a spcific unit. natrually a 4l will be cheaper than a 1l but thats fine, and if that makes the 1l a bad deal, its a bad deal."*

- Every offer is converted to one base unit per dimension, inside the Gemini-run function: mass to g, volume to mL, count to each (kg, lb, oz to g; L, fl oz to mL; pack count multiplies). The line is per 100 g, per 100 mL or per item, labelled under the line.
- All sizes count, for all unit-scaled categories. No size band, no "other sizes" dots, no toggle. (An earlier proposal with a 0.5x to 2x band and a consumable/durable split was overruled.)
- Offers with no size, or a different dimension from the scanned item (weight vs volume), stay off the line and are listed with a note.
- The scanned item's size comes from the catalogue or the ungrounded photo identification; Shin asks the user when missing.

## 6. Tech and other spec-variant products

Approved by Jamin (*"ok"*). Unit scaling does not apply: 256 GB is not worth exactly twice 128 GB.

1. The verdict line uses only offers of the **exact same variant**: same model number and the same price-relevant specs (storage, RAM, screen size, chip, colour when priced differently).
2. **Condition must match**: new, open-box, refurbished and used are separate; others are listed, labelled, not on the line.
3. **Other variants of the same model** are listed under the line, labelled with the differing spec and the price difference, for example "512 GB · +$250" (computed in the Gemini code-execution step). Not used for the verdict.
4. **Similar products from other brands** go in the existing alternatives section as a spec comparison, not on the line.
5. **Identification**: barcode first (a box UPC usually pins the exact variant). Photo coaching for tech asks for the box label or spec sticker with the model number, not the device front. If specs are still unclear, Shin asks one question ("128 GB or 256 GB?") before the grounded search.
6. **Reviews are per model**: one review block shared across variants.

The ungrounded identification decides whether a product is spec-variant or unit-scaled.

## 7. Other kinds of items (proposed, not yet decided)

Jamin asked whether other items need rules. Proposed handling, awaiting his pick of which to adopt:

1. **Sold by weight** (produce, meat, deli, bulk): shelf price per kg or lb, often a store-printed barcode that encodes weight or price. Read the sticker's price and weight, compare per kg, keep organic separate.
2. **Store brands** (Great Value, President's Choice, Kirkland): one chain only. Compare per unit against the nearest name-brand equivalent, labelled "store brand vs name brands".
3. **Real unit is not the package size** (detergent loads, pods, vitamin doses, paper towel and toilet paper sheets, concentrates): scale to loads, doses or sheets when stated, else weight or volume.
4. **Deals and member prices** (2 for $5, buy one get one, PC Optimum, Costco membership, clearance): count the effective price per item, label member-only prices separately.
5. **Extra charges** (bottle deposits, electronics recycling fees, shipping, sales tax): compare before tax without deposits, label "+ shipping".
6. **Marketplace sellers and US listings**: CAD only; marketplace sellers shown, labelled, kept out of the verdict.
7. **Fixed-price items** (LCBO or SAQ alcohol, tobacco): show "same price everywhere in <province>" instead of a line.
8. **Medicines and baby formula**: skip prescriptions for now; over-the-counter medicine per dose.
9. **Used, refurbished, collectible**: compare against recent sold prices by condition (Shin's existing eBay sold-comps source), not new prices.
10. **Local shops, markets, handmade**: often no online price. Say so instead of an empty line.
11. **Editions and bundles** (hardcover vs paperback, game platforms, console bundles): each edition is its own variant, bundles listed separately.
12. **Local price differences**: Gemini finds national online prices; label the line "online prices" until Shin has store-level prices.

## 8. Camera flow

- Recommend the barcode first ("point at the barcode").
- No barcode read after a few seconds, or the user says there is none: photo mode with framing coaching (whole front label filling the frame, steady, good light, one product; for tech, the box label or spec sticker). Reuses the existing framing coach and coaching line mechanism, and keeps the close / back-to-camera behaviour.
- Barcode in the catalogue: unchanged. Barcode miss: grounded Gemini lookup of the barcode for this user, plus a request for a front photo so the ungrounded identification can be stored with the barcode.
- Result screen: our own-source section (if any), the Gemini section (price line, store list, reviews, no-link heads-up, Search Suggestions).

## 9. Implementation shape

- New provider behind `SHIN_MODEL_PROVIDER=gemini` with `GEMINI_API_KEY` and `SHIN_GEMINI_MODEL`. Rule 7 ("Claude does not take over"): with `SHIN_MODEL_PROVIDER=gemini` and no `GEMINI_API_KEY`, the server refuses to start, naming the missing secret (`geminiKeyProblem`, `app/server.ts:3357`, which joins `startupProblems()` and exits at `:3371`) — no key-less Claude fallback and no silent boot into a broken provider. A genuinely unset `SHIN_MODEL_PROVIDER` is not this case: Gemini was never selected, so the unchanged Claude path is the correct provider (`makeProvider`, `identify/src/model.ts:838-845`), not a fallback behind it. And a Gemini call that fails after being selected does not fall back to Claude either (`identify/src/model.ts:833-836`, "NO CLAUDE BEHIND GEMINI, 2026-09-15").
- The live photo route must use the provider chosen by `makeProvider` (today `app/server.ts` passes an Anthropic client directly, so the provider setting is ignored there).
- Respect the existing daily call cap and spend cap; log model cost per call.
- A test proves no grounded result is written to the catalogue, the price database, or anything served to other users.
- Check the current request shape in Google's docs before building: the older generateContent API is marked legacy and a newer Interactions API exists (reported by research, not opened directly). Whether image input, Google Search and structured output work together in one request is unconfirmed.
- Ownership: `docs/the-beta-build-plan.md` names Aurik as owner of the model file and provider interface. He was told on the Notion page (Needs attention, 2026-09-14 06:00 UTC).

## 10. Open items

- **Gemini API key with billing on**: Jamin creates it at Google AI Studio and puts it in the Mac's `mac/config.env` (never in the repo). Nothing calls Gemini until then.
- Which of section 7's item rules to adopt.
- Whether the 18+ rule reaches end users.
- Whether rendering structured fields in Shin's layout counts as modifying (ask Google, or get written permission, before launch).
- Legal review before any plan depends on storing grounded data.
- Measure searches per lookup and real cost per scan once the key exists.

## Build state (2026-09-14)

A build session started on this plan and was stopped by Jamin part way. Its work is **uncommitted** in the Mac's `~/shin` working copy, not pushed and not live: changes to `app/server.ts`, `identify/src/cap.ts`, `identify/src/model.ts`, `identify/src/provider.ts`, and new files `identify/src/providers/gemini.ts`, `gemini-grounded.ts`, `gauge.ts`, `gauge-variant.ts` with tests `identify/test/gemini.test.ts`, `gemini-grounded.test.ts`, `gauge.test.ts`. It had reached the tech variant filter tests. Not verified: whether those files pass tests. Resume by reading them against this document.
