# Manual walkthrough, 2026-09-05

Everything below was run, not read. Nothing in the tree was changed. Uncommitted on purpose.
Nothing here has been folded into `DEFECTS.md` or `SCOREBOARD.md`; that is his call.

## Ran clean

- 254 tests pass: app 21, catalogue 74, identify 10, price 42, spine 107. All five packages
  typecheck clean.
- All ten screens render on a phone-sized viewport with zero console errors.
- Barcode lookups answer in 1 to 8 ms and normalise the leading zero. The EU Nutella EAN
  (`3017620422003`) correctly misses; the Canadian UPC (`0062020000743`) hits confidently.
- Verdict path end to end through the browser: Kraft Dinner at $2.49 returns "I would wait",
  the range, a confidence line, and Metro is visibly dropped from its own comparison set
  (4 sellers over the API without a seller, 3 on screen with one). Build standard 1 holds
  where a person can see it.
- The refusal screen offers "Tell me the price". A failure becomes a harvest.
- The offline pack serves 1,504,130 bytes in 96 ms and its version matches `/api/pack-version`.
- `no-blind-git-add` fires correctly 7 of 7: blanket adds and `commit -a` blocked, named paths
  and `add -p` allowed, and a blanket add chained after another command still blocked.
- The corpus tool prints a footer that refuses to let its own number be quoted alone.

## The camera guidance system, driven outside its own tests

Ticked at 5 frames a second against a hand-built `Coach`:

| input | result |
| --- | --- |
| glare for 400 ms (a hand wobble) | never speaks |
| glare for 3 s (a real reflection) | speaks at 1000 ms, holds to 3800 ms |
| glare strobing on/off every 400 ms | stays silent throughout |
| box 594 px of a 1080 short side | zoom unchanged (deadband) |
| box 30 px | zoom 4.00, capped at `min * 4` |
| barcode agreeing + glare + 3 choices + tiny crop | `hold` wins, everything else silent |

It does what its comments claim. The one input that returned a surprising number, a one-pixel
checkerboard reading glare 0, is excluded by the function's own stated assumption that a blown
region is contiguous. Not a defect.

## Defects, all found by looking at a rendered screen

1. **The viewfinder face is left animating in the thinking state, invisible, for the whole
   interaction.** `.cam-shin` correctly fades to `opacity: 0` once a sheet is up, so nothing is
   on screen twice; checked by screenshot at `data-state="choosing"`, and the earlier reading of
   this as "two faces at once" was the 120ms fade caught mid-flight and is withdrawn. What is
   real: the element stays mounted carrying `thinking`, and its three `think-dots` animations
   run with infinite iterations from the moment the shutter fires, through the item picker and
   the price pad, to the verdict or the refusal. Counted live at the pad step: 3. An invisible
   element driving a permanent 900ms repaint loop on a phone.
2. **Small text on the verdict card fails contrast, in two different ways.** The card has four
   fills by confidence (same hue, solid when certain or fairly sure, hollow when thin, grey when
   refusing). Ratios below are from computed style in the browser; the first was also computed
   by hand from the tokens and agrees to two decimals.

   | fill | colours | ratio | verdict |
   | --- | --- | --- | --- |
   | solid (certain / fairly sure), any theme | `#FFFFFF` on `--walk #F0431F` | **3.80:1** | fails 4.5 for text under 24 px |
   | hollow (thin), light theme | `--walk-bright #D63A18` on the 14% mix | **3.70:1** | fails 4.5 for text under 24 px |
   | hollow (thin), dark theme | `--walk-bright #FF6A45` on the same mix | 7.40:1 | passes |
   | state word under the face, solid card | `--ink-faint #6E7783` on `#F0431F` | **1.19:1** | effectively invisible |

   The failing text, with exact sizes read off computed style: confidence line 10 px, item name
   10 px, price rail low and high 9.5 px, stand-in note 12.5 px, range line 13 px. The verdict
   word (22 to 31 px depending on viewport height) and the price (42 to 64 px) pass as large
   text at 3:1. The hollow card's failure is light theme only: the card stays dark in both
   themes while the text token darkens for a light page it never sits on.
3. **The raw refusal code reaches the shopper.** The Tide refusal prints TOO FEW POINTS under
   the item name, directly contradicting the sentence above it, "Nothing recent enough to
   compare against." Same mismatch over the API: `too_few_points` is returned with 13 price
   points in the evidence array. The code name describes a count; the condition that fired is
   age.
4. **The browser tab reads "Shin · Shin".** The camera screen's own title is "Shin" and the
   router appends " · Shin" to it.
5. **The unsure-identity refusal shows research notes to the shopper.** The Canon message runs
   450 characters about free search results, eBay sold listings in US dollars, and new Canadian
   retail. It also reads "Not sure enough this is the right used goods", a category slug
   dropped into a sentence.
6. **Labels double the brand.** "Häagen-Dazs HAAGEN-DAZS Extraz Strawberry Cheesecake Ice
   Cream, 450 ml". The catalogue holds a clean name and size for that barcode; the verdict
   prefers the scraped retailer page title.
7. **"at walmart.ca"** where every other seller renders as a store name.

## The number that decides everything

| | |
| --- | --- |
| price observations | 896 |
| with no product code at all | 100 |
| dated 2024 or earlier | 297 |
| inside the grocery freshness window **and** carrying a code | **23** |
| distinct products that leaves | **22**, 21 of them Walmart-only |

The catalogue can name 5,182,591 products. Counted, by pricing every one of those 22 through the
running app and reading the corpus for the other 7:

| situation | answers | of |
| --- | --- | --- |
| the 22 crawled products, no store named | **22** | 22 |
| the 22 crawled products, shopper says they are in Walmart | **1** | 22 |
| the 7 hand-priced, each with its real store named (corpus run) | **2** | 7 |

So the app answers for **25 products in the lab and 3 in the situation the product exists for**:
standing in a shop, saying which shop. The 21 that vanish do so correctly. Walmart is the only
source of those prices, and a store cannot be compared against itself.

`NOW.md` says supply is the cap and that removing every threshold moved coverage by zero. Both
are right, and the sharper version is this: the freshness window is the one threshold left, it
is correct, and it is what puts 97% of the collected price data out of reach. A 2024 grocery
price is not an answer. Widening the window buys coverage by lying. The lever is fresh supply.

One consequence worth naming: for a product only one store carries, the shopper standing in
that store gets nothing, because the store's own price is correctly excluded from its own
comparison. That is why Tide refuses in the corpus and answers over the API.

## Search quality

- **"peanut butter"** ranks Quest peanut butter cups, an RXBAR and a KIND bar above the actual
  Kraft jar, which lands at 5. The category ring is computed and returned but never used to
  reorder the candidates.
- **"kraft dinner"** spends three of six slots on rows all named "Kraft Dinner", distinct
  barcodes, no brand, no size.
- **"wireless headphones"** returns six non-Canadian electronics rows including two exact
  duplicates. The Canada preference is a score discount, and for tech nothing Canadian survives it.
- Meaning search is off in the server (718,662 embedded rows past a 90,000 ceiling) and **on**
  in the catalogue CLI, where it took 6.2 s and placed "Moutarde 375g" at rank 5 of a Nutella
  search with the highest similarity score in the list. Good reason for the server's choice.

## Two drifts between what the code says and what it does

- `spine explain grocery` still prints "needs 2 points from 2 seller(s), newest within 7d".
  None of those three is a requirement any more. Tide answered on 1 point from 1 seller.
- The `identify` package is complete, tested, and has zero importers, so nothing in the product
  reads a photo. Already recorded in `docs/the-backend-walkthrough.md`. It is why the camera
  still shows a stand-in list.

## The instruments were not run

`DEFECTS.md` holds 9 rows, all dated 2026-09-03. `SCOREBOARD.md` holds 1 row, same date.
Twelve commits landed on 2026-09-05. Neither file gained a row.

Two bugs were found and fixed in that day's work and neither was logged: a seller count that
broke the moment the gate in front of it was removed, and a "Canada preferred" rule written as
a tiebreak on a score that never ties, so it had never once fired. The second is the shape this
file already made a build standard for, reached from a third direction: a fix locked by a test
at one layer, on a path nothing could reach.

`PASS.md` names the check for whether this loop is decoration: three passes in, no scoreboard
series and an all-human caught-by column means every mechanism failed at once. Both halves are
true right now.

## What the test suite cannot see

254 tests and not one renders a screen or a sentence. The app package's 21 cover the framing
maths, the pack bytes and the scan store. There are 58 copy keys across 3 personalities, 174
shopper-facing strings, and no test renders any of them. `say()` has no missing-fact guard: a
caller that omits a field ships "Saved at undefined, Metro, undefined" to the screen and returns
it silently, which is the caller-side shape of the two defects already logged.

`DEFECTS.md` already says six of nine defects were found by looking at a rendered screen.
Every defect above came from the browser too.

## Loose ends

- `app/data/` is untracked and not ignored, so it sits in every `git status` as a candidate for
  exactly the accidental commit the git hook exists to prevent.
- The settings note calls the four files in `pages/` diff baselines rather than drafts, but only
  the session notes file has a deny rule. Three quarters of the stated floor is a comment.
- `main.js` says it registers six screens. It registers ten.

---

# Second pass

Everything the first pass had not exercised: the harvest flow, the keypad helpers, the share
export, watchlist remove and restore, hostile input, and contrast across all ten screens in
both themes.

## The harvest loop does not close

`Tell me the price` is the only action on the refusal screen. It writes to `corrections` in the
browser's own `localStorage` and **nothing reads it**: grepped across `app/`, `spine/`,
`price/` and `catalogue/`, the only occurrences are the writer, the schema default, and two
comments. `store.js` says it out loud: *"corrections the user made. Collected, applied to
nothing yet."*

The copy is one honesty step ahead of the build and one step behind it. `voice.js` carries a
comment saying the line "must never claim it changed a verdict", and it does not. But all three
personalities then say some form of *"counts once a second tag agrees"*, and there is no
counting, no second tag, and no path from that store to the price database.

This is the same reasoning the `feed` flag uses to default false: a line that promises a
mechanism this build cannot honour. That flag is off. This one is on, and it sits on the screen
that 21 of the 22 priceable products land on.

## The refusal names the wrong cause

`spine/src/spine.ts` filters the comparison set on four conditions at once (usable kind, not
future dated, inside the history window, not the seller being judged) and then has **two**
messages for the empty result: dropped kinds, or "Nothing recent enough to compare against."
Self-exclusion, which is the condition that actually fires, has no message.

Driven live: Tide at Walmart refuses with "Nothing recent enough to compare against" while
displaying `WALMART $11.97 · 09-03 · regular` on the same screen. A two-day-old price, under a
sentence saying nothing is recent enough. The mascot then says "Ask me later", which is advice
that can never come true, because waiting does not add a second seller.

## Contrast is one token, not one card

Measured every leaf text node on all ten screens in both themes, against its real painted
background:

| theme | failing elements | cause |
| --- | --- | --- |
| dark | 136 | **136 of 136** are `--ink-faint #6E7783` |
| light | 141 | **138 of 141** are `--ink-faint #8B929C` |

Per screen, identical in both themes except where noted: past scans 69, you 27 (30 in light),
licences 8, saved 7, correct 5 (7 in light), setup 5, share 5, removed 5, market 5, **camera 0**.

Current worst ratios, against the three grounds the text actually sits on:

| | `--ground` | `--surface` | `--raised` |
| --- | --- | --- | --- |
| dark `#6E7783` | 4.31 | 3.96 | 3.60 |
| light `#8B929C` | 2.78 | 3.14 | 2.50 |

`--ink-muted` already passes everywhere (light 4.68 to 5.88, dark 6.71 to 8.64). Only the faint
tier fails. Stepping the grey until it clears 4.5 on the worst ground of each theme:

- dark `#6E7783` -> **`#848D99`**, worst ratio 4.52
- light `#8B929C` -> **`#606771`**, worst ratio 4.55

The light fix lands 2/7/1 per channel from `--ink-muted #5E6570`, so in light theme an
accessible faint tier is the muted tier. There is no room for three readable levels on that
ground, and which two survive is a design call, not a token tweak.

**Applied 2026-09-05, on his instruction.** `--ink-faint` is now `#848D99` in the dark block and
`#606771` in both light blocks of `app/public/css/tokens.css`, and `.cam-shin .face-label` is
pinned to the dark value in `app/public/css/screens/camera.css` because the camera ground is
literal black in both themes and the token is not. Re-swept afterwards against the running app:
**dark 136 failing to 0, light 141 to 3.** The 3 left are a different token, `--good-bright
#0E9E5B` at 3.47 on white, three copies of "can answer" at 10px on the you screen; `#008946`
would clear it at 4.50. Not changed, because it was not what was asked for.

## Cheaper alternatives cannot return anything

Ran `/api/alternatives` against all 22 priceable products: **0 results, 22 times**. The cause is
data, not code, and it is measurable:

| | count |
| --- | --- |
| priceable products with no catalogue row at all | 1 |
| with a catalogue row but no category tag | 13 |
| with a category tag | 8 |
| categories shared by two of them | **0** |

The feature needs two priced products in one category. No such pair exists, and 13 of 22 could
not even be considered.

Related: `/api/price` answers for `0000006783333` (Unico artichoke hearts, joined by name) while
`/api/alternatives` returns "We have not seen this one." One route reads the observation table,
the other reads the catalogue, and they disagree about whether the product exists.

## The thinking leak, corrected and narrowed

Two things were checked here and only one of them held.

**Withdrawn:** "two faces on screen in contradictory states". `.cam-shin` does fade out. The rule
`.cam[data-state="choosing"] .cam-shin { opacity: 0 }` fires correctly, verified by reading the
computed opacity from a freshly queried node (0) and by screenshot. The earlier reading came
from a stale detached reference, which reports `1`, and from screenshots taken inside the 120ms
fade while the state was still `framing`. `innerText` also reports `opacity: 0` text, which is
why the sweep kept showing "THINKING | Hang on" next to the answer.

**Holds, and is wider than first recorded:** the element stays mounted in the `thinking` state
with three infinite `think-dots` animations running from the shutter through the picker and the
pad to the verdict, not just after the answer. Counted live at the pad step: 3. Invisible, and
still repainting every 900ms.

## Checked by hand and correct

- **Barcode normaliser.** 11, 12 and 13 digit forms of the same code all resolve to one product.
  A 14-digit GTIN-14 (`00068100084245`, `10068100084245`), a wrong check digit, and appended
  trailing zeros all correctly **miss**, so a case barcode never resolves to the unit. Non-digit
  characters are stripped, which is right for a scanner that emits noise.
- **Full-text query handling.** `'`, `"`, `%`, `*`, `____`, `NEAR(`, `a OR 1=1` and a 3,000
  character query all return a clean band with no error and no injection.
- **Keypad helpers.** `N for $`: 4 for $5.00 reads "$1.25 each". `% off`: $10.00 at 20% reads
  "$8.00 after 20% off", at 25% "$7.50". Both correct.
- **The pad's confirm key is reachable.** With the deal row added the sheet scrolls (454 vs 435)
  and nothing sits below the fold.
- **Share card.** Rasterises at 1080x1350, fully painted, 169 distinct colours, and the face has
  its eyebrows. The earlier face-export defect is genuinely fixed, checked by eye and not by the
  code that fixed it. `Save the image` was not clicked; it starts a download.
- **Watchlist remove and restore** round-trip. Two removed rows sharing one product id collapse
  to a single restored row, which is correct, not a lost item.
- **Icon buttons carry real labels**: "Torch", "Back to camera", "Price it", "Scan what you are
  pointing at".

## Third pass: the barcode reader, and the two breaks it exposed

The decoder had only ever been exercised at the lookup layer, never at the decode layer. Driven
here with EAN-13 bitmaps generated to spec and, for the end-to-end runs, with a canvas
`captureStream` handed to the app in place of a real camera, so the whole path ran as shipped.

### The decoder itself is sound

Everything below was run against `BarcodeScanner` out of the served bundle, wasm and all.

- **Decodes.** Kraft `0068100084245` reads as `EAN13` with the correct box (x 48, y 20, 379x199
  against a drawing that put it at 48, 20, 380x200). Warm 56ms, first scan 49ms.
- **The three-frame hold is exactly as documented.** Frames 1 and 2 return null, frame 3 fires
  with `frames: 3`, and `peek()` reports 1, 2, then clears the moment it fires.
- **Re-fire suppression works.** After firing, four more frames of the same code in view all
  return null.
- **The 900ms window is a real window, not a counter.** Three frames 500ms apart never fire,
  because the first has expired by the time the third arrives. Correct, and only safe because the
  loop is fast: measured on a realistic 960x540 cluttered frame, 24ms median with no code in it
  and 30ms with one, so the hold completes in 117ms. It is `requestAnimationFrame` with the scan
  awaited, so the scan time *is* the cadence; if a phone runs 10x slower than this machine the
  hold still fits, at 15x it stops firing at all. Worth re-measuring on real hardware once.
- **Wrong check digit is rejected.** `0068100084244` never decodes.
- **Largest-box-wins works.** A big and a small code in one frame, the big one fires.
- **Rotated 90 degrees reads.** Down to a 115px-wide code in a 960px frame, which is 12% of the
  width.
- **Inverted does not read**, white bars on black, six frames, with a black-on-white control
  decoding in the same run. `tryInvert: true` is set and the comment above it says these options
  are the difference between a real shelf and a flat test image. Retail codes are printed dark on
  light, so the practical cost is close to nothing; the option simply does not do what the
  comment implies. Not fixed.

### `read.text` was undefined, so no scan ever reached the catalogue

`onBarcode` called `catalogueLookup(read.text)`. A `StableRead` is `{ value, format, box, frames }`
and has never had a `text`. So `undefined` went to `identify`, which builds an empty query string,
which answers **400**, which throws, which the surrounding `catch` swallows into `found = null`.
Every successful barcode scan landed on "read fine, we have never seen it" and the candidate
sheet, with the 5.18 million row catalogue sitting right there holding the product.

Nothing threw where anyone could see it and nothing logged. It went in with `cba8dfc`, the commit
titled *the scan is served by the real catalogue, not the demo list*.

Reproduced live before the fix: a barcode painted onto a fake camera, `/api/identify? -> 400`,
state `choosing`. Fixed to `read.value` and reproduced again: `/api/identify?gtin=0068100084245
-> 200`, Kraft Smooth Peanut Butter 1kg, state `result`.

### The barcode was then thrown away before the price judge saw it

Fixing the first break exposed the second immediately. `proceed()` sent the price judge `text`,
`category` and `askingCents`, and no `gtin` -- although `/api/price` has accepted one all along.
The judge re-derives identity from the words, and its own confidence differs by where the identity
came from:

| asked with | identity confidence | outcome |
|---|---|---|
| the barcode | 0.8075 | verdict |
| the words alone | 0.6375 | `identity_unsure` |

The grocery floor sits between the two. Measured on Lay's Classic Potato Chips
(`0060410015292`, $3.47 at walmart.ca, seen 2026-09-05): with the code, `walk_away` against
$3.99. Without it, *"Not sure enough this is the right groceries and household. The closest
match was Lay's Classic Potato Chips. Pick the right one."* -- said to someone who had just
scanned the barcode.

Fixed by carrying `scannedGtin` out of `onBarcode` and passing it to `/api/price`. Deliberately
**not** `item.gtin`: the typed route sets that from a catalogue match on words alone, and passing
it would hand the judge barcode-grade certainty for a guess, which is the same error pointing the
other way and the worse of the two.

Verified end to end after the fix, clicking through the running app: barcode -> identify ->
going-rate card ("$3.47 at walmart.ca, in Canada, 1 seller") -> price pad -> **Walk away, $3.99,
thin, 1 seller**. That is the first time the primary input path has run all the way to a verdict.

### Left alone, on the same screen

- **`productLabel` duplicates the brand when an apostrophe is in the way.** The catalogue holds
  name "Lays original chips", brand "Lay's"; `name.includes(brand)` is false because of the
  apostrophe, so the pad reads **LAY'S LAYS ORIGINAL CHIPS**, and that string is what goes out as
  the price query text. Cosmetic, one line, not touched.
- `askingCents: null` is sent rather than omitted. The server checks `typeof === 'number'`, so it
  lands as undefined and the going-rate card is correct. Harmless today.

