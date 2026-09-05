# The pipeline: 54 decisions, and the plan that builds them

> **SUPERSEDED 2026-09-05 by `docs/the-combined-pipeline.md`,** which wins wherever the two
> disagree. This file is kept as the record of what was decided and why, including the parts now
> reversed, because a retired decision with its reasoning is worth more than a deleted one.
>
> What changed: **twenty-one of the fifty-four decisions below refuse to show the user something,
> and none of them carry his words.** He judged the posture wrong. The default is now to answer
> every time and let a confidence number carry the doubt. The refusals affected are 17, 19, 26,
> 31, 34, 35, 38, 41, 42, 44, 45, 52, 53 and 54. Decision 32 stays reversed but note that it was
> a reversal of a line he gave. His tier design, decisions 43 and 47, is untouched.

**Written 2026-09-04, on his instruction.** His words, which govern every line below:

> *"when build, claude always defaults to the easier option. I want you to list out every single
> step in the process that needs a decision from claude and make it right now. Every decision
> should not worry about build cost but instead should focus on what will produce the best result
> for creating the best user experience."*

Build cost is not a reason for anything here. Runtime cost and his own tier design still are: the
two tiers, the weekly image limit and the pro upgrade are his and are not re-decided.

`NOW.md` holds the pipeline itself. This file holds the decisions and the build order.

---

## Two measurements taken before deciding

Both changed a call that had already been made the easy way.

1. **Open Food Facts holds 125,751 Canadian products, 122,580 of them with completed names.**
   Measured 2026-09-04 against the live search API with `countries_tags_en=canada`. Grocery-first
   survives its own kill check; the free identity layer is real.
2. **The browser's built-in `BarcodeDetector` does not exist on iOS, in any browser, and fails
   silently.** WebKit does not implement it, so every browser on iPhone and iPad inherits the gap.
   The first plan would have shipped a scanner that worked on Android and quietly did nothing on
   every iPhone. This is the exact failure mode his instruction names.

## Two properties this costs, stated before any code

The app today has **no dependencies and no build step**, and that was a real design choice worth
respecting. This plan ends both. A WebAssembly barcode reader, an on-device detector, model
assets and a vector index cannot be served from a folder of hand-written files. The app gets a
package manifest and a bundler. Preserving the old property would mean choosing a worse pipeline,
which is the trade his instruction forbids.

---

## The 54 decisions

Eight are marked **[reversal]**: the same question was answered the cheap way earlier the same
day, in chat, and is answered differently here.

### Camera and capture

1. **The camera scans every frame from the moment the screen opens.** No press-then-process. The
   best verdict is one the user never pressed anything to get.
2. **Barcode reading via WebAssembly on every platform**, never the browser's native API.
   **[reversal]** One code path, identical on iPhone and Android, no silent dead zone.
3. **Every retail symbology enabled, including GS1 DataBar.** DataBar is what is on loose produce
   and deli labels in Canadian stores; EAN-13 only means the produce aisle silently never scans.
4. **A detected barcode auto-advances** after a short hold with haptic feedback, no confirm tap,
   but the product name appears instantly so a wrong lock is visible and one tap undoes it.
5. **A real on-device object detector runs continuously and draws the box.** **[reversal, from a
   static reticle]** An instruction is work the user does; a box is work the app does.
6. **Auto-capture when the box holds steady and sharp**, shutter kept as override. Framing and
   pressing are two jobs; remove one.
7. **Burst capture, sharpest frame wins.** **[new]** Motion blur in an aisle is the most common
   cause of a bad identification and the user never learns that is why it failed.
8. **Crop automatically to the box with padding, always shown with drag handles before sending.**
   An invisible crop that cut off the flavour word is unexplainable to the user.
9. **Two or more salient objects: do not guess.** Draw both boxes; one tap chooses. A tap beats a
   wrong answer.
10. **Read the shelf tag automatically and fill in the price.** **[reversal]** Typing a price while
    standing up holding a basket is the biggest friction in the loop. Pre-filled, one tap to
    correct, manual entry always available.
11. **Torch turns itself on in low light**, with a visible toggle.
12. **Send the crop at full quality at the model's native size.** Never compress to save bytes.
    The fine print is the identity.
13. **Offline captures queue and resolve later, never lost.** A dead zone in a store basement
    should not cost someone their session.
14. **Only the crop leaves the device, never the full frame**, stated once on screen.

### Identification

15. **Barcode always beats the model.** A barcode is truth; a model is an opinion.
16. **The model returns fields, not prose:** brand, product line, variant, size, unit, category,
    and the alternates it considered.
17. **Ranked candidates always exist, never a single guess.** Top one shown large, "not this?"
    reveals the rest, permanently rather than only on failure. The pilot's worst failure was a
    confident single wrong answer.
18. **Confidence is derived in our own code, never the model's self-report.** **[reversal]**
    Combine barcode presence, catalogue match score, brand agreement, size agreement, and the gap
    between first and second candidate. Self-reported confidence is uncalibrated and the whole
    product's credibility rests on this number.
19. **Size and variant are identity.** 1L and 500ml never share a verdict. Unresolved size asks,
    as two buttons.
20. **French and English match to the same row, both directions.** Canadian packaging is bilingual.
21. **Basic gets the same pipeline, only a smaller model.** Same schema, same candidates, same
    confidence maths. A tier that feels broken does not sell the upgrade, it teaches people the
    product does not work.
22. **"We know what this is, we do not have it" is a different screen from "we do not know what
    this is."** The engine already tells them apart with `no_source_response` against `no_identity`;
    the screen is what is missing.

### Catalogue

23. **Open Food Facts for grocery identity**, retailer catalogues added per category as feeds land.
24. **Hybrid retrieval: full text and vector embeddings, fused.** **[reversal, and the largest]**
    Text alone misses paraphrase and partial brand names; vectors alone miss exact model numbers
    and sizes. The cost is a native dependency; the benefit is the difference between "found it"
    and "no results", which is the product.
25. **A multilingual embedding model**, for the same reason as 20.
26. **Three match bands, not two:** confident proceeds, ambiguous shows ranked candidates, miss
    shows neighbours. Two bands force everything into a wrong bucket.
27. **Neighbours widen in rings and the ring is named.** Other oranges before other citrus, citrus
    before fruit, and the screen says which ring it fell back to.
28. **Filter to Canada, keep the rest reachable.** An import or a traveller's item should resolve.
29. **When our copy misses, hit the live source before declaring a miss.** Staleness is our problem.
30. **A miss records the barcode and crop as a catalogue gap and tells the user they are the first
    to scan it.** A failure becomes a contribution. Nothing typed enters the catalogue automatically.

### Price

31. **Two independent sellers minimum before any verdict.**
32. **Never an average.** Cheapest, the range, and where their price sits inside it. **[reversal of
    his own line, argued rather than assumed]** An average destroys the only actionable fact.
33. **Regular and promotional never mix.** Two lines when both exist.
34. **The age of the oldest contributing number is always on screen, in plain words.** Past the
    category's tolerance it refuses rather than dressing it up.
35. **Below minimum evidence, show the going rate and no tier.** A confident face on one data point
    is the fastest way to lose trust.
36. **Shelf prices, pre-tax, stated once.** Comparing pre-tax to post-tax is a silent error.
37. **Unit price computed and shown whenever both sizes are known.** It is what makes the
    alternatives believable.

### Alternatives

38. **Same category, comparable size, lower unit price, at a seller with a real price.** Never a
    similarity model's opinion of "like this".
39. **Never a taste or quality claim.** "Cheaper per 100g", with the number.
40. **Allergen and dietary differences printed on the alternative row**, from Open Food Facts'
    own tags. The one place where being helpful can hurt someone.
41. **Three alternatives, not a list.** More than three is research; they are standing in an aisle.
42. **Never claim it is in this store** without store-level stock. Name the seller and the date.

### Tiers and the meter

43. **Catalogue search unlimited, image searches metered at three a week.** His design.
44. **A search counts only when it produced an identification the user accepted.** Failures,
    refusals and corrections are free. Charging for our own mistake is the fastest route to a
    one-star review.
45. **Past the limit, identity and alternatives stay free and the verdict is what is gated.** They
    see we found it; they pay for the answer.
46. **The upgrade appears on the result, at the moment of value**, never as an interstitial before
    the work.
47. **Rolling seven days, shown only when below full**, never as a standing nag.

### Speed and feedback

48. **Barcode to verdict under one second, photo to verdict under four.** If price will be slower,
    identity ships immediately and price lands after.
49. **Three arrivals, not one wait:** the name, then the price, then the alternatives.
50. **Working steps are named, never a spinner.** A named step that stalls tells the user
    something; a spinner tells them nothing.
51. **Eight second cap on any external call**, then show what landed and name what did not.

### Failure

52. **Every refusal names the step that came up empty and offers exactly one repair.**
53. **Our failures never look like the user's.** "The label was too blurry" is ours. "Nobody sells
    this in Canada" is the world's. Different faces, different words.
54. **No red, ever, and no best-guess-with-a-shrug.** Every decision above exists to protect the
    second one.

---

## A consequence of his own tier design, flagged and not decided

Barcodes are free, instant, and do not touch the meter (decisions 2, 4, 15, 44), and nearly every
packaged grocery item carries one. So if grocery leads, almost nobody reaches three image searches
a week, and the meter only ever charges for produce, used goods and furniture, which are exactly
the categories where identification is hardest and the answer is least likely to be good. **The
tier that costs money is the one most likely to disappoint.** Three ways out, all his: count
catalogue lookups too, lead with a category where photos are the normal path, or sell pro on
something other than image count.

---

## The build plan

Named libraries, not capabilities. Every stage lists the decisions it discharges.

### Stage 1. The catalogue

Everything downstream reads it. Nothing else starts until it answers.

Open Food Facts, Canada-filtered, into SQLite. Two indexes over the same rows: **FTS5** (present in
this machine's Node build, verified 2026-09-04) for exact and token matching, and **sqlite-vec**
holding **voyage-4** embeddings of name, brand and category in both official languages. Queries
fuse both rankings into three bands. On a miss, walk the category tree outward in rings and return
the ring by name.

Embedding cost: the catalogue is roughly four million tokens, voyage-4 is $0.06/M with 200M free
tokens on signup, so the initial load and many rebuilds cost nothing.

**Done when:** half a garbled French product name returns the right English row, and a product that
does not exist returns named neighbours rather than nothing.

*Discharges 20, 23, 24, 25, 26, 27, 28, 29, 30.*

### Stage 2. Barcode

**zxing-wasm**, chosen over zbar-wasm because it explicitly carries DataBar, DataBar Expanded and
DataBar Limited, and runs the same module in browser and Node. All retail symbologies on, decoding
on a worker thread so the preview never stutters. Auto-advance on stable read with haptic and
instant name display, one tap to undo. Offline reads queue.

**Done when:** an iPhone and an Android both read a DataBar produce label, and airplane mode does
not lose the scan.

*Discharges 2, 3, 4, 13, 15.*

### Stage 3. Framing, capture and crop

The hardest front-end piece, and three techniques working together rather than one library:
**MediaPipe Tasks Vision** object detection for the classes it knows (which covers more grocery
than expected), **OpenCV.js** contour detection for box-shaped packaging no class model will name,
unioned, with a centre-weighted fallback so a box always exists. Burst capture around the trigger,
frames scored by Laplacian variance, sharpest kept. Crop to box with padding, drag handles shown
before anything is sent. Auto-capture on a stable sharp box. Torch on automatic luminance. Two
salient objects means two boxes and a tap.

**Done when:** walking an aisle boxes what you point at with no instruction to line anything up,
and a deliberately shaky shot still yields a sharp crop.

*Discharges 1, 5, 6, 7, 8, 9, 11, 12, 14.*

### Stage 4. Model identification

One call, structured output, no prose. Haiku 4.5 on basic, Opus 5 on pro, identical schema and
identical downstream handling. Confidence computed from five signals in our code. Ranked candidates
always present; one shown, the rest one tap away. Unresolved size asks with two buttons.

**Done when:** it names things in a kitchen correctly, and when it is wrong the right answer is the
second row, one tap away.

*Discharges 16, 17, 18, 19, 21, 22.*

### Stage 5. The shelf tag

Second crop in the same model call. Returns regular, promotional, member, unit price and limit as
separate fields, because Canadian shelf tags carry all five and collapsing them is the error the
price engine already refuses to make.

**Done when:** photographing a real shelf tag never requires the keyboard.

*Discharges 10.*

### Stage 6. Price

Before buying any feed, the twenty minute check: open the retailer's own site with the network
panel and read what its storefront calls. A 403 on a page fetch is not evidence about an API, and
that method cracked three hiring platforms in the other project this week. Then the grocery feed.

**The check, run 2026-09-04 in a browser against both storefronts.**

Walmart Canada serves its own page data as JSON inside the page. A product page carries the name,
the brand, the price, the unit price already computed, and the UPC. The Kraft 1 kg jar reads
$5.97, 30 cents per 100 g, UPC 068100084245, which zero padded is the same code Open Food Facts
uses. **This seller joins by barcode, exactly.**

Loblaws calls its own backend at api.pcexpress.ca and renders the price and the unit price. The
product identifier is an internal article number of the form 20064825001_EA. **There is no GTIN
anywhere on the page**: not in the markup, not in the structured data, not in the payload the page
was built from. Searched for the exact code and it is absent.

So the two sellers that decision 31 requires do not join the same way, and the second one can only
be tied to a product by brand, name and size. That is not a detail of a feed, it is a rule the
price stage has to hold: a source that joins by name may contribute an observation only when the
catalogue's own search puts the match in its confident band, and every listing it refuses is kept
as a recorded gap rather than dropped. Built that way in `price/src/sources.ts`.

**Done when:** the verdict fires for one category on real numbers, with the age of the oldest
number on screen.

*Discharges 31, 32, 33, 34, 35, 36, 37.*

### Stage 7. Alternatives

*Discharges 38, 39, 40, 41, 42.*

### Stage 8. The result surface

Three arrivals down one stream. Named working steps. Eight second cap. Identity never waits for
price.

*Discharges 48, 49, 50, 51.*

### Stage 9. Failure surfaces

*Discharges 52, 53, 54.*

### Stage 10. Tiers and the meter

*Discharges 43, 44, 45, 46, 47.*

### Parallelism

Three independent tracks: the catalogue, the camera front end (stages 2, 3, 5), and price feed
procurement. Stage 4 needs the catalogue to match against. Stages 6 through 10 need both.

**Coverage: 54 of 54.** Every decision has a stage.

### The one risk not papered over

Stage 3 is the only place where no single library solves the problem. Generic detectors know eighty
classes and most retail packaging is not one of them, which is why three techniques are unioned
rather than one named. It is the piece most likely to need a second attempt, and also the piece
that separates an app that boxes what you point at from one that tells you to line things up.
