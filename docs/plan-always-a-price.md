# Always a price, and the shelf tag read into it: build plan

*Written 2026-09-13 (Mac, late evening; server clock already 2026-09-14 UTC). A plan only: no code,
no data and no configuration was changed to write it. Every number names the file or query that
produced it. Anything not checked on this Mac says "unverified".*

---

## What this plan has to satisfy

His words, and what each one means for the build:

| His words | What it forces |
|---|---|
| 2026-09-05: *"The worst thing this app can do is tell people it doesn't know because that literally wastes the users time."* | Every scan of a product we can name ends with a number on screen. A blank "could not work out what this is" is allowed only when nothing at all names the thing. |
| 2026-09-05: accuracy-first was an invented rule that *"impeeds so much of our design."* | Doubt is carried by the label and the confidence, not by withholding the answer. |
| 2026-09-11: *"product and price catalogue come hand in hand, knowing the product without the price is meaningless"* | The price engine must use the product catalogue. Today it does not (shown below). |
| 2026-09-13: gala apples against gala apples at other stores; if none, a similar item (honeycrisp) nearby, labelled | Same product first, then a similar product, always named as similar. |
| `docs/the-vision.md`, "Always answer": the evidence order (a) to (f); every answer says what it rests on | The ladder below is exactly that order. |

---

## What happens today, measured

The example from the brief, sent to the running server on 2026-09-14 03:10 UTC:

`POST /api/price {"gtin":"0064100144521","category":"grocery","askingCents":599}` answered
`{"kind":"refusal","reason":"no_identity","detail":"Could not work out what this is. Scan the barcode, or type the model number."}`.

The same barcode through `GET /api/identify` answered Kellogg's Corn Flakes, 340 g, category
grocery, band confident. So the app knows the product, and the price engine does not.

**Why.** The price engine decides what a thing is only by asking its price sources
(`spine/src/spine.ts`, `resolveIdentity`). It never asks the catalogue. The sources on this Mac,
listed by `node spine/src/cli.ts sources` with the Mac's price path:

| Source | State on this Mac |
|---|---|
| Hand-recorded pilot prices (`spine/data/observations.json`) | available, 7 products |
| Shopper-typed prices (corrections store) | available, 0 rows |
| Crawled prices (`prices.db`) | **unavailable: "unable to open database file"** |
| Best Buy, eBay, SoldComps | unavailable, no keys set |

So the only thing that can name a product for pricing is the 7-product pilot file, and a
barcode scan of anything else lands on "could not work out what this is".

The pilot run (`node spine/src/cli.ts corpus`, not written to the scoreboard) gives 4 verdicts
and 3 refusals out of 7: Kraft Dinner, used POÄNG, Tide and the Sony XM5 answer; navel oranges
refuse as a category not served, the used Canon R6 as an unsure identity, the new POÄNG as no
price.

---

# Part 1: Always a price

## 1. Every way the price path says it cannot answer today

Read from `spine/src/spine.ts` (every `refuse(` call and `singleReport`), `spine/src/contract.ts`
(the list of allowed reasons), `app/server.ts` (the price route and the photo route) and
`app/public/js/screens/camera.js` (answers the phone builds itself).

**Found: 7 distinct refusal reasons the price engine can return, from 10 places in the code; 5
more reasons are declared and never produced; the photo route has 9 miss answers; the phone
builds 3 more refusals of its own.**

### 1a. The price engine (`priceIt`)

| # | Reason code | What triggers it (file:line in `spine/src/spine.ts`) | What replaces it | Or why it stays |
|---|---|---|---|---|
| 1 | `no_source_response` ("No price source is available right now") | Every price source reports unavailable (line 87) | Rungs (b) to (f): catalogue identity plus the estimate need no price source at all | Replaced |
| 2 | `no_identity` ("Could not work out what this is") | No price source recognises the barcode or text (line 100). Source errors are swallowed to "not found" (`resolveIdentity`) | Catalogue lookup by barcode, then catalogue search by text, before giving up | **Stays only when the catalogue also has nothing**: a barcode not in 5,182,591 rows and text that matches nothing. Even then, if a photo was read, the reading's similar-item group prices it (step 7) |
| 3 | `category_unsupported` (produce) | The category rule is marked unserved (line 117); only produce is (`/api/categories`) | The ladder runs for produce too, with **no good/fair/high word ever** until produce's own reversal condition is met. Matches his 2026-09-13 call that produce is the beta's test case | Replaced, tier withheld |
| 4 | `identity_unsure` | Identity confidence under the category floor (line 150; floors 0.8 to 0.95 in `spine/src/categories.ts`) | Stays as a pick list, but each candidate row carries its own reference price from the ladder | **Stays as a question**, because pricing the wrong one of two lookalikes is the confidently wrong answer. It is not "doesn't know": it names the candidates |
| 5 | `no_source_response` ("Nothing has a price for X right now") | Identity found, zero price points (line 165) | (b) other size, (c) outside lookup, (d) public average, (e) our category average, (f) estimate | Replaced. **This is the one Corn Flakes will hit once identity is fixed** |
| 6 | `no_asking_price` (missing) | Prices found, no shelf price given (line 185) | Already drawn as the going-rate card on the phone (decision of 2026-09-03). With the ladder, the card shows whichever rung was reached | Stays as a code; not a non-answer on screen |
| 7 | `no_asking_price` (unreadable) | Shelf price given but not a number (line 185) | Nothing: it is a typing repair | **Stays**, it is about the input, not the product |
| 8 | `points_future_dated` | Every price is dated after today (line 281) | Drop the broken rows and continue down the ladder | Replaced |
| 9 | `single_report` (one shopper saw / several unconfirmed) | Only shopper-typed prices, none confirmed (lines 318 and 400, `singleReport`) | Becomes a labelled reference answer on rung (a): the number, the shop and the day, no tier | Replaced in shape; the rule "one person's word is not a comparison" stays |
| 10 | `no_source_response` (guard) | The thin-evidence judge returns no tier (line 343); commented as unreachable | Falls through to the estimate | Replaced |

Declared in `spine/src/contract.ts` and returned by nothing (checked by grep of `spine/src/spine.ts`
and `spine/src/categories.ts`): `too_few_points`, `unusable_price_kinds`, `points_too_stale`,
`all_points_from_asking_seller`, `comparison_incoherent`. They need no replacement; they should be
marked retired so nobody wires them back.

`spine/src/run.ts` has its own refusal list (blurry, no text, model down, not in catalogue, no
prices, no alternatives, offline). **Nothing on the live path imports it**: only two tests do
(`spine/test/run.test.ts`, `spine/test/structured-prose.test.ts`). Out of scope.

### 1b. The price route (`app/server.ts`, `/api/price`)

| Answer | Trigger | Stays? |
|---|---|---|
| 401 | Invite header missing or wrong | Stays (access control) |
| 405 / 400 / 413 | Not POST, body not JSON, body over 8 KiB | Stays (malformed request) |
| 500 "this endpoint could not answer just now" | Anything thrown | Stays, but the ladder must not throw on a missing store. **Seen live**: `/api/alternatives` gives exactly this today because `price/src/lookup.ts` opens the missing `prices.db` |
| 200 with any refusal in 1a | passed through unchanged | As 1a |

### 1c. The photo route's miss answers (`app/server.ts`, `identifyPhoto` and `/api/identify/photo`)

| Reason | Trigger | What replaces it | Or why it stays |
|---|---|---|---|
| `not_in_catalogue` | The model read a name, no catalogue row matched. The answer carries what was read and, when found, a similar-item group (`ring`) | Price the similar-item group: rung (e) "similar item", labelled with what was read. **Today the phone throws both away** and shows "that photo could not be read" (`camera.js`, `handlePhotoCapture`, the `id?.failure` branch) | Replaced |
| `unreadable_photo` | Nothing legible on the label | None | **Stays**: nothing names the thing. The typed-price capture already keeps the price (2026-09-13) |
| `model_timeout`, `model_rate_limited`, `model_outage`, `model_malformed`, `model_client_error` | The model call failed | None | **Stays**: we never saw the product. Retry or type |
| `spend_cap_reached` | The daily cap is spent | None | **Stays**: says "type the price in instead" |
| `identity_unsure` (candidates) | Low band with alternates | Same as 1a row 4 | Stays as a question |
| 400 x4, 405, 413 `too_large`, 429 `rate_limited` | Bad image, too big, too many photos | None | Stay (input and abuse limits) |

### 1d. Refusals the phone builds itself (`app/public/js/screens/camera.js`)

| Where | What | Replace? |
|---|---|---|
| `proceed`, the `catch` | Price call threw: "sources failed" or "offline, no price" | Offline stays. With the product pack on the phone, an offline estimate is possible later; not in this plan |
| `handlePhotoCapture` | `not_in_catalogue` and every non-model failure shown as "photo unreadable" | Split: `not_in_catalogue` goes to step 7 |
| Typed-name route, no match (around line 3403) | "no match" for typed text | Stays when catalogue search also finds nothing |

---

## 2. What data exists on this Mac for each rung

All counts from read-only queries on `/Users/worker/shin-data/catalogue.db` (opened with
`node:sqlite`, `readOnly: true`) and the other stores, 2026-09-14 UTC. Scripts were run from the
session scratchpad, not the repo.

### The stores

| Store | Where (from `mac/config.env`) | What is in it |
|---|---|---|
| Crawled prices | `SHIN_PRICES` = `/Users/worker/shin-data/prices.db` | **File does not exist** (`ls /Users/worker/shin-data`). The only `prices.db` files on the disk are two 5-row test fixtures under the system temp folder made by `price/test/lookup.test.ts` |
| Crawled prices, on the PC | not on this Mac | 896 rows, 438 priced products, measured on the PC 2026-09-05 (`spine/sources/observed.ts` header; `docs/the-vision.md` "438 priced products"). **Unverified today**; the PC's file may have grown since |
| Shopper-typed prices | `SHIN_CORRECTIONS` = `/Users/worker/shin-data/corrections.db` | 0 rows (`select count(*) from correction`). The repo copy `price/data/corrections.db` also 0 |
| Typed prices on scans | `SHIN_SCANS` = `/Users/worker/shin-data/scans.db` | 12 scans at time of checking, 0 with a typed price, 0 with a store (`scan.typed_price_cents`, `scan.store_id`) |
| Hand-recorded pilot | `spine/data/observations.json` | 7 products, 12 price points, all dated 2026-09-03, **none carries a barcode**, so none can be reached by a barcode scan |
| Outside lookups | none wired | no key, no adapter |
| Public statistics | none in code | confirmed: "statcan" / "Statistics Canada" appears only in `research/`, `docs/`, `notes/`, `pages/`, never in a `.ts` or `.js` file |

### The catalogue columns that can scale and group

| Count | Query | Result |
|---|---|---|
| All products | `count(*)` | 5,182,591 (Icecat 4,972,249; Open Food Facts 122,158; Open Beauty 48,943; Open Products 26,947; Open Pet Food 12,294) |
| Sold in Canada | `sold_in_canada=1` | 618,365 (Icecat 494,511; Open Food Facts 122,158) |
| With a size (value and unit) | `size_value` and `size_unit` not null | 69,911 overall; **27,505 sold in Canada**. Units are only `g` (38,746) and `ml` (31,165) |
| With a leaf category | `leaf_category` not empty | 5,047,726 overall; **528,005 sold in Canada** |
| Size, leaf and Canada together | all three | **19,975** |
| Distinct leaf categories in Canada | `count(distinct leaf_category)` | 6,327 |
| Same brand and name, two or more sizes, Canada | grouped on lower-cased brand and name | 473 families, 1,062 rows (a lower bound: "Kellogg's Corn Flakes" and "Corn Flakes" do not group) |
| Kellogg's Corn Flakes sizes | full-text search, brand kellogg, name corn flakes | 340 g (the scanned one), 440 g, 760 g, 1.22 kg, plus 2 rows with no size |
| Corn Flakes' leaf peers in Canada | `leaf_category='en:corn-flakes'` | 24 |
| Gala apples leaf in Canada | `leaf_category='en:gala-apples'` | 10 rows, 6 with a size |
| Honeycrisp leaf in Canada | `leaf_category like '%honeycrisp%'` | 0 rows (honeycrisp appears only in juice and cider names) |

### Rung by rung

| Rung | Data on this Mac now | Zero today? | What fills it |
|---|---|---|---|
| (a) Fresh price on this exact thing at a named store | 12 pilot points on 7 products, none reachable by barcode; 0 typed prices; crawled store missing | **Zero for every catalogue product** | Copy the PC's price rows (step 1); typed prices; the shelf-tag reader (Part 2) |
| (b) Same thing, another size | 19,975 sized, categorised Canadian rows to scale with; 473+ size families; but 0 priced rows to scale from | **Zero** (sizes exist, prices do not) | Step 1's price rows; every priced size then prices its siblings |
| (c) Outside barcode lookup | nothing wired | **Zero** | Candidate: Barcode Lookup, whose API takes a Canada filter and returns a store list with prices (`docs/catalogues.md`; whether those Canadian prices are real is **unknown**, the doc says to check with its free test account). Second candidate: Open Prices queried live per barcode (the project already pulls it whole in `price/src/openprices.ts`; 664 Canadian rows as of 2026-09-05). Both need the network. UPCitemdb: identity lookups; whether it returns Canadian prices is **unknown** |
| (d) Public price statistics, category and province, scaled | not in code | **Zero** | See "Statistics Canada" below |
| (e) Our own average for the category | depends on (a); leaf and parent categories exist for 528,005 Canadian rows | **Zero** | Step 1's price rows, grouped by leaf then parent |
| (f) Estimate labelled as an estimate | only the 12 pilot points, by app category: groceries 5 points on 2 products (Kraft Dinner 225 g, Tide 2.72 L), produce 2 points (navel oranges 3 lb), used 4 asking prices (POÄNG), tech 1 manufacturer list price (Sony XM5 $429.99), furniture 0 | **Not zero, but thin to the point of danger** | Step 1 first; then every rung above feeds it |

**Statistics Canada (rung d).** Not in the code (checked). What it would take:
1. A monthly import of table 18-10-0245-01 "average retail prices" (named in
   `research/price-sources/34-price-source-enumeration.md`; that file describes it as provincial
   averages for a short fixed basket "oranges, eggs, apples, etc." with no barcode). Needs the
   network once a month.
2. A hand-made map from each basket line to catalogue leaf categories (for example the apples
   line to `en:apples` and its children), with the basket line's own size for scaling.
3. The province: only from the coarse location cell, which exists only with location consent
   (`app/src/stores.ts`, `app/public/js/geocell.js`); without consent, the Canada-wide figure.
4. A label that says "public average for Ontario, August", never "at a store".

**Recommendation: build it after (e) and (f), for produce only at first.** The basket is small
(exact line count unverified) and mostly fresh food, which is exactly the category with no other
source and the one he made the beta's test case. For packaged goods it would rarely match a leaf.
The produce rule in `spine/src/categories.ts` itself warns the public series "measures underlying
inflation rather than what is on the shelf this week", which is why it can only ever be a labelled
reference and never a tier.

---

## 3. How an answer is labelled

### The rule

**Only rung (a) can say good, fair or walk away.** Every other rung returns a different kind of
answer, a *reference*, that has no tier field at all, so no screen can draw a tier colour for it
by mistake.

| Rung | Answer kind | Headline wording (English, a code plus facts beside it for French) | Tier word? |
|---|---|---|---|
| (a) countable prices on this exact product | verdict (as today) | "Fair. $5.99 against $4.97 to $6.49 at 3 stores" | Yes, arithmetic as today |
| (a) only unconfirmed shopper prices | reference, rung `this_product_reported` | "One shopper saw $5.49 at Metro on 12 September" | No |
| (b) | reference, rung `other_size` | "About $4.10 for 340 g, worked out from the 760 g box at $8.99 (Walmart, 10 September)" | No |
| (c) | reference, rung `outside_lookup` | "An outside listing shows $5.29 at <store>; we have not checked it" | No |
| (d) | reference, rung `public_average` | "Public average for apples in Ontario, August: $x per kg; this bag works out near $y" | No |
| (e) | reference, rung `category_average` | "Similar corn flakes cost about $x for this size (y products, z stores)" or, for a parent category, "Not the same kind: other cereal flakes cost about $x" | No |
| (f) | reference, rung `estimate` | "Estimate: about $x. Based on <basis>. Could be well off" | No |

Every reference answer carries:
- `restsOn`: one sentence naming the basis (which products, how many, which stores, how old);
- the number and, when there are two or more basis products, a low-to-high range;
- the shelf price compared as plain arithmetic ("$1.89 more than the estimate"), **never** the
  words good, fair, high, walk away, deal or cheaper;
- a confidence band of `low` or `guess`, never `medium` or `high`;
- the identity, as today.

On the phone it is drawn like the existing going-rate and observation cards: no tier colour, no
share, no watch (`camera.js` `goingRateCard` and `observationCard` already do this with
`data-tier="unknown"`). The existing decision "with no asking price, Shin shows the going rate"
reverses if users read the range as a verdict; the same reversal test applies here and is
measured the same way (saves and shares of a card that never carried a judgement).

### How the category rules interact

`/api/categories` today: groceries need 2 prices from 2 sellers within 7 days; tech 3 from 3
within 3 days; used 4 from 2 within 30; furniture 5 from 1 within 21; produce is unserved.

- These rules **apply only to rung (a)**. Since 2026-09-05 they no longer block a verdict; they
  add a named shortfall and push confidence to low (`spine/src/spine.ts`, the shortfall block).
  That stays.
- A rung (a) answer that fails a rule keeps its tier with low confidence, as today. **One thing to
  call out:** the thin-evidence judge in `price/src/verdict.ts` gives a tier from a single seller
  (confidence 0.5). That is the current, founder-approved behaviour, but it is the closest thing in
  the system to a confident answer on thin ground, and the correctness check (beta plan item 37)
  is the only thing that will show whether it is right.
- Rungs (b) to (f) ignore seller and age minimums because they never produce a tier. Age still
  shows in `restsOn`.
- Produce: no tier on any rung, until its recorded reversal condition (two independent reports
  more often than not in one city) is met.
- `/api/categories` gains one field per category saying which rungs may carry a tier (only `a`),
  so the phone does not hard-code it.

---

## 4. How the estimate is worked out (rung f)

**Goal from the brief:** a number for every catalogue product with a category, from data that
exists, saying plainly when the data is thin.

**Method: walk outward from the product until there is something priced, and name where you
stopped.**

1. Collect every price we hold that is joined to a catalogue code: crawled prices, shopper-typed
   prices, typed prices on scans, and pilot points (the pilot has no codes today, so it is used
   only at step 5 below, by app category).
2. Turn each into a price per 100 g, per 100 ml, or per item (no size), using the catalogue's
   `size_value` and `size_unit`. Regular prices only when any exist; sale prices otherwise, said so.
3. Walk the product's category path from the leaf upward: leaf, parent, grandparent and so on,
   using the category path the catalogue already stores (Corn Flakes: corn flakes, extruded
   flakes, extruded cereals, cereal flakes, flakes, breakfast cereals, ...). Stop at the first level
   holding priced products **with the same unit kind** (grams with grams).
4. The estimate is the median unit price at that level times this product's size. The range is
   the 25th to 75th percentile when there are 4 or more products, low to high when 2 or 3.
5. If the whole path has nothing, use the app category (groceries, tech, used, furniture,
   produce), then every priced product we hold.
6. **Thin data, said plainly, in three grades:**
   - 5 or more priced products at the level used: "Estimate: about $x (range), from N similar
     products."
   - 1 to 4: "Rough estimate from only N products: <names>."
   - The level used is the app category or wider, or has 1 product: **the answer stops pretending
     it is an estimate for this product and names its basis instead**: "We have almost no prices
     for tech yet. The only one we hold: Sony WH-1000XM5 headphones, $429.99 list." A number is on
     screen; nobody is told a USB cable costs $429.99.
7. Size missing on this product (508,030 of 528,005 categorised Canadian rows have no size, by
   subtraction of the counts in section 2): per-item median at the level used, and `restsOn` says
   the size was unknown.

**Estimate vs. substitute.** His 2026-09-13 rule for a substitute ("same leaf, then one step up,
never the grandparent", `NOW.md`) governs what is *offered instead*. The estimate may walk further
up because it is never offered as something to buy; it only names its basis.

**What it outputs on this Mac today (worked example, arithmetic only):**
- Kellogg's Corn Flakes 340 g. The path holds no priced product; the app category groceries holds
  2 pilot products; the only one in grams is Kraft Dinner 225 g at regular prices 147 and 200 cents
  (`spine/data/observations.json`). Median 173.5 cents per 225 g, times 340 g = 262 cents. Under
  rule 6 that is grade three, so the answer reads: "We have almost no grocery prices on this phone's
  server yet. The closest we hold: Kraft Dinner 225 g, $1.47 to $2.00 (Walmart, Metro, 3 September);
  by weight that would be about $2.62 for this box." Whether $2.62 is anywhere near a real Corn
  Flakes price is **unknown**, and that is exactly why grade three names the basis.
- Furniture: 0 priced points anywhere, so the fallback is "every priced product", which is
  meaningless for a chair. **Grade three shows the ask ("tell Shin the tag price") as the headline
  and the nearest priced thing below it.** This is the plan's weakest answer and it is weak because
  the data is absent, not because of the method.

---

## 5. Build order, Part 1

Each step: what changes, where, the test that must fail first and then pass, and the check at the
consumer (a real request through the running server). Write checks that store anything run on a
second server on another port with scratch stores, the way the 2026-09-13 price-capture proof
pointed `SHIN_SCANS` at a temp file; never against the live stores.

### Step: price rows onto the Mac

- **What:** no code. Copy the PC's crawled price database to the Mac's price path. This is the
  only step that gives rungs (a), (b) and (e) anything to work with.
- **Where:** `/Users/worker/shin-data/prices.db` (the `SHIN_PRICES` path in `mac/config.env`).
  Hand-over through the mailbox, not a live message. The nightly backup already covers this path
  (`mac/07-backup.sh`, the `SHIN_PRICES` line).
- **Fails first:** `node spine/src/cli.ts sources` with the Mac's environment prints `observed
  unavailable ... unable to open database file` (seen today).
- **Passes:** the same command prints `observed available`; `select count(*), count(distinct
  code) from observation` on the copied file is recorded in `NOW.md` as the new baseline.
- **Consumer check:** pick one barcode-joined code (`select code from observation where
  join_method='gtin' limit 1`) and `POST /api/price {"gtin":"<that code>","askingCents":<its
  price>}`. Expected: `kind` is `verdict` or `refusal` with reason `single_report`, and `identity`
  is not null. Needs a server restart to pick the file up, which is his or the run lock holder's
  call, not this plan's.

### Step: the catalogue tells the price engine what the barcode is

- **What:** when no price source recognises a barcode, ask the catalogue (by barcode, then by
  text through catalogue search). The identity gets the catalogue's name, brand, size, category
  path and app category (`app/src/category-map.ts`), confidence 1.0 for a barcode match and the
  search's own confidence for text. The engine stays free of the catalogue database: the server
  hands it a lookup function, tests hand it a fake.
- **Where:** `spine/src/spine.ts` (`resolveIdentity`), `spine/src/spine.ts` `SpineDeps`, `app/server.ts`
  (`/api/price`, built from the existing `fastLookup.byGtin` and `categoryFor`), `spine/test/`.
- **Fails first:** a new spine test "a barcode only the catalogue knows resolves to that product":
  today the result is `no_identity`.
- **Passes:** the result carries `identity.gtin = 0064100144521`, label Corn Flakes, brand Kellogg's.
- **Consumer check:** `POST /api/price {"gtin":"0064100144521","category":"grocery","askingCents":599}`.
  Expected at this step: `identity.label` "Corn Flakes" and reason **no longer** `no_identity`
  (it will be `no_source_response` "Nothing has a price for Corn Flakes" until the rungs below land).
  Also `POST /api/price {"gtin":"0033383007410","askingCents":499}` (Royal Gala apples, 3 lb): today
  `no_identity`; expected `category_unsupported` for produce, identity named.

### Step: an answer shape for a price that is not a verdict

- **What:** a second answer kind, reference, with the rung, the number, the range, `restsOn`, the
  arithmetic comparison and a band of low or guess, and no tier field. Every sentence gets a line
  code plus raw facts, the pattern the verdict sentences got on 2026-09-13. The phone gets one
  card for it, drawn like the going-rate card. The one-shopper refusal becomes a rung (a)
  reference.
- **Where:** `spine/src/contract.ts`, `spine/src/spine.ts` (`singleReport`), `app/public/js/prose.js`,
  `app/public/js/voice.js` (both locales), `app/public/js/screens/camera.js` (`proceed`, a new card),
  `spine/test/structured-prose.test.ts`, an app render test.
- **Fails first:** (1) a spine test that walks every rung with fake data and asserts no reference
  answer has a tier and no reference line uses a verdict line code (`asking_below_range`,
  `asking_within_range`, `asking_above_range` and the three sole-price codes); fails because the
  kind does not exist. (2) the byte-for-byte round-trip test over the new codes. (3) a render test
  that the card has no tier word and `data-tier="unknown"`, rendered inside the production wrapper
  (the lesson recorded in `NOW.md` 2026-09-13 about fixtures missing the wrapper).
- **Consumer check:** none visible on its own; this step is not done until the next step's check
  passes through the server.

### Step: the same product in another size, scaled by unit price

- **What:** rung (b). The server supplies the product's size siblings from the catalogue (same
  normalised brand and name, a different size, same unit kind). Their prices are converted to unit
  prices and scaled to this size. `restsOn` names the sibling, its size, the store and the date.
  When the sibling is larger, the answer adds that the scaled figure may run low, because bigger
  packs are often cheaper per gram. **That is a design assumption, not a measured fact**; the check
  list below says how to test it.
- **Where:** `app/server.ts` (a sibling lookup over the catalogue), `spine/src/spine.ts` (the
  ladder after an empty price set), unit arithmetic shared with `price/src/verdict.ts` (`unitOf`).
- **Fails first:** spine test with a fake sibling lookup returning a priced 760 g box: expects
  reference rung `other_size` whose number equals the 760 g unit price times 340 g. Today:
  `no_source_response`.
- **Consumer check:** after the price rows are on the Mac, find a size family with one priced
  member (join `observation.code` to catalogue rows sharing brand and name with a different size).
  `POST /api/price` on the unpriced sibling. Expected: `{"kind":"reference","rung":"other_size",
  "referenceCents":<n>,"restsOn":"...from the <size> ..."}`. On this Mac right now Corn Flakes has
  3 sized siblings and none priced, so Corn Flakes itself will pass through this rung empty.

### Step: our own average for the kind of product

- **What:** rung (e). Priced products in the same leaf category, then the parent, chosen by the
  same rule the substitutes use (`chooseRingTag`), unit median scaled to size, with count and
  range. The parent level is labelled "not the same kind".
- **Where:** `app/server.ts` (peer lookup reusing `catalogue/src/search.ts` `chooseRingTag`),
  `spine/src/spine.ts`.
- **Fails first:** spine test with fake peers: leaf with 3 priced peers gives rung
  `category_average` naming the leaf; empty leaf and priced parent gives the "not the same kind"
  label; empty both falls through.
- **Consumer check:** `POST /api/price {"gtin":"0064100144521","category":"grocery","askingCents":599}`.
  Expected: rung `category_average` if any of the 24 Canadian corn-flakes rows is priced in the
  copied rows (unknown), otherwise it falls to the estimate.

### Step: an estimate that always gives a number

- **What:** rung (f), exactly as section 4, including the three grades of thinness.
- **Where:** a new file `spine/src/estimate.ts`, called last in the ladder; the server supplies the
  category path.
- **Fails first:** (1) for every app category, with only the pilot file as data, the estimate
  returns a finite number: fails today because there is no estimate. (2) furniture with zero priced
  points returns grade three with the ask as headline. (3) the Corn Flakes worked example returns
  262 cents with Kraft Dinner named as the basis.
- **Consumer check:** on this Mac before the price rows arrive,
  `POST /api/price {"gtin":"0064100144521","category":"grocery","askingCents":599}`. Expected:
  `{"kind":"reference","rung":"estimate","referenceCents":262,"band":"guess","restsOn":"... Kraft
  Dinner 225 g ..."}`. After the rows arrive, the same request should move up the ladder; if it
  still lands on grade three, the copied rows do not cover cereals and that is a finding.
  Also `POST /api/price {"gtin":"0033383007410","askingCents":499}` (gala apples): expected a
  reference, never a tier, resting on the navel oranges pilot points and saying they are not apples.

### Step: stop throwing away what the photo read

- **What:** when the photo route answers "we read that as X and we do not have it" with a similar
  group, the phone prices the group (rung e, labelled "similar to what we read: X") instead of
  showing "that photo could not be read". Unreadable and model failures keep their own screens.
- **Where:** `app/public/js/screens/camera.js` (`handlePhotoCapture`), `app/server.ts`
  (`identifyPhoto` already returns `readAs` and `ring`).
- **Fails first:** app test feeding a `not_in_catalogue` answer with a ring: today it renders the
  unreadable-photo sentence.
- **Consumer check:** `POST /api/identify/photo` with a photo of a product whose barcode is not in
  the catalogue. **There is no such photo**: the 40 eval photos are all in the catalogue by
  construction (`NOW.md` 2026-09-13, "no negative set"). One must be taken. Expected:
  `reason:"not_in_catalogue"`, `readAs`, `ring`; then the phone shows a reference card. Costs 1 to 2
  model calls per attempt against the cap.

### Step: seams for the outside lookup and public averages

- **What:** rungs (c) and (d) as empty lookups the ladder already calls and that return nothing,
  so adding a source later is one file. No network code in this step.
- **Where:** `spine/src/sources/` (two new unavailable sources, reported by `sources` like Best Buy).
- **Fails first:** `node spine/src/cli.ts sources` does not list them.
- **Consumer check:** none until a source exists. Next actions, each needing the network and his
  yes on any sign-up: Barcode Lookup free test account against 20 known Canadian shelf prices;
  Statistics Canada import for produce.

---

# Part 2: Connect the shelf-tag reader

## 6. The path today, end to end

1. **Camera screen** (`app/public/js/screens/camera.js`, `shoot`): the shutter asks the eye for a
   capture. The eye (`app/src/eye/camera.ts`, `#doCapture`) takes a 7-frame burst, keeps the
   sharpest, and crops it to the detected product box plus 8% padding, at most 1568 px on the long
   edge (`app/src/eye/capture.ts`, `cropTo`). **Only the crop leaves the eye; the full frame is
   closed.** A tag on the shelf edge below the product is almost always outside that crop
   (inference from the padding; no photo checks it).
2. **Client call** (`app/public/js/api.js`, `identifyPhoto`): sends `image` (the crop, base64),
   `sharpness`, `deviceId`, telemetry and, only when location consent is on, the cell. No tier is
   sent from the camera, so the server uses basic.
3. **Photo route** (`app/server.ts`, `/api/identify/photo`): body cap 3 MiB, 429 rate limit per
   device, then `identifyPhoto`, which calls `stage.fromCrop(image, null, tier, sharpness)`
   (line 1081). **The tag argument is hard-coded null.** It writes a scan row (the model's reading,
   cost estimate, store if consented) and keeps the photo only if the device said yes to photos.
4. **Identify stage** (`identify/src/identify.ts`, `fromCrop`): calls `Identifier.read(product,
   tag, tier)`. With a tag image, `read` makes a second model call with `TAG_INSTRUCTION` and
   `TAG_SCHEMA` (`identify/src/model.ts` around lines 569 and 717 and 859) returning everyday, sale
   and member prices in cents, the unit-price text, the limit and the currency. **Nothing reads
   `reading.tag` anywhere outside `model.ts` and its tests** (grep over `identify/src`, `app`,
   `spine/src`, `price/src`, `catalogue/src`). The tag schema has **no field for which product the
   tag names**.
5. **Back on the phone**: identified with a band that is not low opens the price pad; the shopper
   types the price; `proceed` sends `/api/price`.
6. **Typed-price capture (Aurik, 2026-09-13)**: from the pad, `recordObservation` sends
   `/api/correction` through the local-first queue (`app/public/js/corrections.js`). On the server:
   - **Product known** (code sent or the scan resolved one): `recordCorrection`
     (`price/src/corrections.ts`) into the corrections table at `SHIN_CORRECTIONS`. **It requires a
     shop** ("a correction needs the shop it was seen in") and caps a device at 200 typed prices a
     day. The scan row gets the typed price and, with consent, the store.
   - **Product unknown**: the price goes on `scan.typed_price_cents` as an observation, never into
     the corrections table, so it never becomes evidence.
   - Read back by the engine's corrections source (`spine/src/sources/corrections.ts`) by barcode or
     product id only. A typed price counts toward a tier only when a second device or a crawled
     price agrees within 12% or 25 cents (`price/src/corrections.ts`, the corroboration constants).
7. **Consent gate** (`app/src/consent.ts`, `app/server.ts` `locationFor`): photo consent decides
   whether the image is kept; location consent decides whether the cell and store are written.
   The price itself is kept either way (`NOW.md` 2026-09-13, proved both sides through the server).

**Fixtures:** 0 tag photos. `identify/eval/photos` holds 40 images, all product fronts
(`identify/eval/manifest.json`, no tag field); `Test/` held 0 images outside `node_modules` before
that folder was removed 2026-09-27; the only other image in the repo is `app/public/icon-180.png`. Tag reading is tested only with empty byte
arrays and scripted answers (`identify/test/model.test.ts` around line 190,
`identify/test/provider.test.ts` around line 194).

## 7. Design

### Same photo or a second shot

**Default: one shutter, two images from the same frame.** The eye already holds the sharpest
frame; before closing it, it also cuts a tag crop: the band directly below the product box, full
frame width, capped at the same 1568 px edge. The shopper does nothing extra.

**Fallback: the price pad.** If the tag read comes back empty, the pad opens blank exactly as today.
A dedicated "now photograph the tag" second shot is **not** built until the tag eval (below) shows
the band-below crop misses the tag most of the time, because a second shot is an extra step in an
aisle and the queue's own kill condition for tag tapping is "users abandon the tap step"
(`QUEUE.md` row 2.11).

Which crop reads better (band below the box, or the whole frame downscaled) is **unknown until the
tag photos exist**.

### How a tag price becomes a stored price report

1. The photo answer gains a `tag` object (the tag schema's fields plus the guard result below).
2. **The tag price fills the price pad; the shopper's tap on confirm is what files it.** The model's
   number never becomes evidence on its own: a person looked at it and agreed, which keeps the
   existing rule that a typed price is one person's word. Sale price fills with the sale kind;
   a member price is shown but not filed as the everyday price.
3. Confirm sends the same `/api/correction` it sends today, plus `readFrom: "tag"`, so a later
   audit can tell a tag-read price from a hand-typed one. Stored as a new nullable column on the
   corrections table (added in place, the same way `price/src/store.ts` adds columns).
4. **Product known, no shop chosen** (location consent off): today `recordCorrection` refuses. The
   price should instead land on the scan row as an observation, as the unknown-product branch
   already does, and the card says it was written down. Otherwise every tag read by a shopper who
   declined location is thrown away.
5. The store is the chosen shop (`shops.chosenName()` and `shops.chosenId()`), never asked for,
   never guessed from the market.

### The guard when the tag names a different product

Add three fields to the tag schema: the item description printed on the tag, the size printed on
it, and any code digits printed on it. Then, on the server, before the pad is pre-filled:

| Check | Pass | Fail |
|---|---|---|
| Printed code equals the product's barcode (check digit valid) | strongest pass | if it names a different catalogue product: no pre-fill; the pad says "the tag looks like it is for <that product>" and offers both |
| Word overlap between the tag's item text and the product's brand plus name (the existing `overlap` in `spine/src/sources/source.ts`) | at or above the threshold the observed source uses (0.5) | no pre-fill |
| Size on the tag against the product's size | equal after unit conversion | no pre-fill, show "tag says 760 g, this box is 340 g" |
| Arithmetic: everyday price divided by size against the printed unit price | within rounding | flag, still pre-fill (unit text is often per 100 g and rounded) |

When the guard fails, the price can still be kept, **but only as a scan observation**, never as a
correction on the wrong product. Why this matters on this Mac: scan 6 was a Kellogg's Corn Flakes
barcode and scan 7, seconds later, a photo read as "Corn Flakes" that resolved to **Great Value**
Corn flakes, code 0628915831092 (`scans.db` rows 6 and 7; which box was photographed is unverified).
A tag filed against the photo's identity there would have put a price on the wrong brand.

### Consent

- The tag image is a photo: kept only with photo consent, through the same `keepPhoto` check, named
  after the scan id with a tag suffix, deleted by the same 90-day sweep.
- The store on the report: location consent, as today.
- The price: kept either way, as today.
- **Open for him:** the consent screen says the app will "tell you when someone already checked a
  price nearby" whatever you choose (`notes/consent-screen-wording-2026-09-11.md`). Whether that
  sentence already covers a price read off your tag photo and shared as evidence is his call;
  approved consent copy is not changed without him (`NOW.md` 2026-09-13).

### Extra model cost per scan against the $2 a day cap

| Figure | Value | Source |
|---|---|---|
| What the cap charges per model call | USD 0.0068 x 1.35 = **CAD 0.00918**, same for every tier | `identify/src/cap.ts` (`ESTIMATED_COST_USD_PER_CALL`, `APPROXIMATE_USD_TO_CAD`) |
| Daily cap | CAD 2 | `mac/config.env` `SHIN_PHOTO_DAILY_CAP_CAD` |
| Calls the cap allows per day | 2 / 0.00918 = **217** | arithmetic |
| Spent today when checked | CAD 0.06426 = 7 calls | `/Users/worker/shin-data/spend-cap.json` |
| Estimated cost per call, basic / pro | 0.23 / 0.68 US cents | `app/src/model-cost.ts` (basic is derived, not measured) |
| The tag read | one extra call, output capped at 512 tokens | `identify/src/model.ts` (`MAX_TOKENS_TAG`) |

| Scan shape | Calls | Scans the cap allows per day | Estimated cost per scan, basic |
|---|---|---|---|
| Today, product read only | 1 | 217 | 0.23 US cents |
| Today, with the pick pass | 2 | 108 | 0.46 |
| With tag, no pick | 2 | **108** | **0.46** |
| With tag and pick | 3 | **72** | **0.69** |

So the tag read **halves the scans a day** under the cap when the pick pass does not run. Three
things to fix or decide with it:
- The scan row's cost column counts only product passes (`estimatedCostCents(tier, passes, ...)`),
  so a tag call would be missing from the recorded cost. It must count the tag call.
- The cap charges the pro price for basic calls, so it stops at 217 calls when the estimated basic
  spend is about CAD 0.67 (217 x 0.23 US cents x 1.35). Changing that is a separate call; noted,
  not planned here.
- Folding the tag into the product call (two images, one request) would cost the cap nothing
  extra but roughly adds one image's input tokens per call (2,459 image tokens for a 1568 px crop,
  `identify/src/model.ts` costing note); not recommended first, because a tag is a separate, harder
  read (`docs/the-photo-path.md`: "The shelf tag is a separate crop and a separate read").
- **Default for the build: the tag read runs in parallel with the product read**, so the pad is
  pre-filled with no added wait, and a price is still captured when identification fails. Behind a
  switch that starts off, so the cap is not halved until he sees the tag eval numbers.

## 8. Build order, Part 2

### Step: shelf-tag photos to test against

- **What:** 20 photos taken in a store, each showing a product and its shelf tag, with the true
  everyday price, sale price and item text typed into a manifest. Include 5 where the tag belongs
  to the neighbouring product, to test the guard.
- **Where:** `identify/eval/tags/` and a tag mode in `identify/eval/run.ts`.
- **Fails first:** the tag mode reports "0 fixtures" and exits non-zero.
- **Passes:** it reports, per field, how many of 20 were read exactly, and how many wrong-tag cases
  the guard caught. One run costs 20 calls, CAD 0.18 by the cap's figure.
- **Consumer check:** this is the consumer for the reader itself; nothing reaches a shopper yet.

### Step: the tag reader says which product the tag is for

- **What:** item text, printed size and printed code digits added to the tag schema and the
  instruction. The Anthropic adapter's schema rewrite (the Mac's commit 20600df: nullable types
  sent as `anyOf`, length bounds dropped) must accept them.
- **Where:** `identify/src/model.ts`, `identify/src/providers/anthropic.ts`, `identify/test/`.
- **Fails first:** a scripted model test expecting `reading.tag.item_text`; an adapter test that the
  rewritten tag schema has no type arrays.
- **Consumer check:** comes with the next step.

### Step: one shutter, two pictures, tag sent to the reader

- **What:** the eye also cuts the tag band from the same best frame; the phone sends it as
  `tagImage`; the server validates it like `image` and passes it to `fromCrop` instead of `null`;
  the answer includes `tag`. Check both images fit the 3 MiB body cap after base64; a crop is
  encoded losslessly (`cropTo`), so two may not fit (unmeasured). If they do not, the tag band is
  sent as JPEG.
- **Where:** `app/src/eye/capture.ts`, `app/src/eye/camera.ts`, `app/public/js/eye-attach.js`,
  `app/public/js/api.js`, `app/public/js/screens/camera.js`, `app/server.ts` (photo route and
  `identifyPhoto`), `app/test/` photo-route test with a fake model.
- **Fails first:** the photo-route test asserts the fake model's `read` received a non-null tag
  image: today it receives `null` (line 1081).
- **Consumer check:** on a second server with scratch scan and correction stores,
  `POST /api/identify/photo` with a fixture from the tag set (for a product in the catalogue, such as
  Kellogg's Corn Flakes if photographed). Expected: `{"product":{"code":"..."},"tag":{"regular_cents":
  <n>,"item_text":"...","guard":"match"},"passes":1,"scanId":<id>}` and the scan row's cost column
  equal to two basic calls (0.46).

### Step: the tag price fills the pad and the confirm files it

- **What:** pre-fill as designed; `readFrom: "tag"` on the correction; the new column; the
  no-shop case lands on the scan row instead of being refused.
- **Where:** `app/public/js/screens/camera.js` (`openPad`, `pricePadSheet`, `recordObservation`),
  `app/public/js/corrections.js`, `app/server.ts` (`/api/correction`), `price/src/corrections.ts`.
- **Fails first:** (1) app test: a photo answer with a matching tag opens the pad showing that price;
  today the pad is blank. (2) server test: a correction with a product code and no seller is stored
  as a scan observation; today it answers `stored:false`.
- **Consumer check (scratch stores):** `POST /api/correction {"clientId":"...","deviceId":"...",
  "code":"0064100144521","seller":"Metro","storeId":"node/...","priceCents":<tag price>,
  "readFrom":"tag","scanId":<id>}` answers `{"stored":true}`; then
  `POST /api/price {"gtin":"0064100144521","askingCents":<tag price>,"askingSeller":"Metro"}` answers
  the rung (a) reference "One shopper saw ... at Metro" (after Part 1's shape step), and the Metro
  price is not compared against itself.

### Step: the guard

- **What:** the four checks in section 7, with no pre-fill on a mismatch and observation-only
  storage.
- **Where:** `app/server.ts` (`identifyPhoto`), reusing `spine/src/sources/source.ts` `overlap`,
  `identify/src/gtin.ts` for the check digit.
- **Fails first:** a test where the product is Kellogg's Corn Flakes 340 g and the scripted tag reads
  "Great Value Corn Flakes 750 g": today there is no guard, so the price would pre-fill.
- **Consumer check:** a wrong-tag fixture from the tag set through `/api/identify/photo` answers
  `tag.guard:"different_product"` and the pad shows both names.

### Step: the cost is counted and the switch is visible

- **What:** the cost column counts the tag call; `/api/health` or the scan summary shows tag reads
  per day beside calls per day; the switch that turns tag reading on.
- **Where:** `app/src/model-cost.ts`, `app/server.ts`, `mac/config.env.example`.
- **Fails first:** a model-cost test expecting 0.46 for a basic scan with a tag: today 0.23.
- **Consumer check:** with the switch on, one fixture photo raises `spend-cap.json` by two calls'
  worth (CAD 0.01836).

---

## Overlaps with Aurik's current work

From `NOW.md` sections dated 2026-09-13 and `git log` since 2026-09-12 (27 of 28 commits are his).
Tell him before building:

1. **Typed-price capture.** Part 2 changes the same correction route branch, the same
   `recordObservation` function and the same observation card he built and proved on 2026-09-13.
2. **Gala offers Honeycrisp.** Part 1's category average and the "similar item" label use his
   substitute rule (`chooseRingTag`, leaf then parent, the 1,500 cap). The alternatives endpoint
   reads the crawled store and fails on this Mac without it (seen live). His open defect D-097
   (alternatives lines are English server prose) is the same contract change Part 1 needs for
   reference answers: code plus facts, rendered on the phone. Do them as one contract.
3. **The shop picker.** Part 2's report needs the chosen shop id and name; rung (d) needs a province
   from the same coarse cell. His location-consent wording update is waiting on the founder.
4. **Produce as the beta's test case.** Part 1 replaces the produce refusal with untiered references.
   That changes what his decision means on screen.
5. **The eval's stage split.** Part 2 adds a tag mode to the same runner (`identify/eval/run.ts`,
   `metrics.ts`) he restructured.
6. **The model seam and providers.** Tag schema changes go through the provider seam he built and the
   Mac's adapter fix (commit 20600df, not his).
7. **Bilingual sentences.** Every new line needs a code, facts and a French rendering, the pattern
   and round-trip test he landed on 2026-09-13.
8. **Beta plan item 37**, "each beta scan photographs the shelf tag as the price seen": Part 2 is the
   machinery for it.
9. **`QUEUE.md` row 2.11**, "show every number on the tag, let the user tap the price": the pre-fill
   and confirm design is that row. Its kill condition applies.

---

## What would make this plan wrong

Each is a check someone can run, not an argument:

1. **The running server is not using the paths in `mac/config.env`.** `run-server.sh` sources that
   file, but the live process's environment was not read (it would print secrets). Check: the
   engine's `sources` listing from inside the server, or `/api/health` gaining a sources line.
2. **The PC's price rows are not what the 2026-09-05 count says.** Check after copying:
   `select count(*), count(distinct code), sum(join_method='gtin') from observation`.
3. **Catalogue identity gives the wrong app category.** Icecat rows outside five sections map to no
   category (`app/src/category-map.ts`). Check: `categoryFor` over a 1,000-row sample of scanned
   codes from the scan log once testers scan; count nulls.
4. **Scaling by unit price across sizes is biased.** Check: among size families with two priced
   sizes at the same store, the ratio of unit prices, large over small. If the median is far from 1,
   rung (b) needs a correction factor and its label changes.
5. **The estimate is far from real shelf prices.** Check: for the 20 correctness-check verdicts
   (beta plan item 37), also compute the estimate, and record the median absolute error. If grade one
   estimates miss by more than half, the wording "about" is wrong.
6. **Users read a reference as a verdict.** Check: saves and shares of reference cards, the same
   reversal test as the going-rate card decision.
7. **The tag is outside the captured frame.** Check: the tag eval's count of empty reads.
8. **Two images exceed the 3 MiB body cap.** Check: byte size of both crops from the tag fixtures,
   base64.
9. **The API refuses the new tag schema.** Check: one live tag read through the adapter.
10. **The daily cap resets on UTC, not Toronto time** (`spend-cap.json` said day 2026-09-14 at 23:00
    Toronto on the 13th). Check: whether the evening reset is what he wants for "per day".
11. **A tag-read price is not covered by the consent copy.** Check: his answer.

## Unknowns

- **Unknown:** whether Corn Flakes, or any cereal, is priced in the PC's crawled rows.
- **Unknown:** the real shelf price of Kellogg's Corn Flakes 340 g; the $2.62 in section 4 is the
  formula's output on pilot data, not a price.
- **Unknown:** whether Barcode Lookup's Canadian store prices are real and current.
- **Unknown:** whether UPCitemdb returns any Canadian price.
- **Unverified:** the number of lines in Statistics Canada table 18-10-0245-01 and whether apples
  and cereals are among them (the research file lists "oranges, eggs, apples, etc.").
- **Unmeasured:** tag read accuracy, latency and image token count; there are 0 tag photos.
- **Unmeasured:** how often the pick pass runs on real photos, which decides whether a tag scan is 2
  or 3 calls.
- **Unverified:** which box was photographed in scan 7 (Kellogg's or Great Value).
- **Unknown:** whether the band below the product box or the whole frame reads a tag better.
- **Unverified:** whether Aurik has work in progress not yet in `NOW.md` or committed; the repo
  working tree was clean when this plan was started.
