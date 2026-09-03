# Defects

One row per defect. **The only interesting column is whether a test caught it or a human did.**
Everything else here is bookkeeping; that column is the measurement.

## The two rules that govern this file

1. **A defect logged twice becomes a build standard. Once is a bug fix.** One occurrence gets
   fixed and gets a row. A second occurrence of the same shape earns a rule, and the rule goes in
   the standards section at the bottom of this file. Nothing else in this repo generates new
   rules. The alternative was measured in another repo: twenty-eight standing instructions in
   twenty-two days, most of them backed by nothing.
2. **This file is read at the start of every pass, right after the scoreboard,** and it is
   allowed to reorder the queue. See step 1 of `PASS.md`.

## The check that says whether any of this is working

Three passes in, if `SCOREBOARD.md` has no series and the "caught by" column below is all
humans, the loop is decoration and every mechanism failed at once. Two columns, one minute.

---

## The log

| ID | Date | What it is | Caught by | State |
| --- | --- | --- | --- | --- |
| D-001 | 2026-09-03 | The pilot's own headline number disagrees with itself. The master plan says the hand pilot got a usable range for **2 of 7** items. The session notes summarise the same run as **1 of 7**, while their own table in the same file shows two RANGE rows, Kraft Dinner 225g and the used POÄNG. Both documents describe one run. | **Human**, while building the corpus. No test could have caught it: it is two prose documents disagreeing about a measurement, and nothing in the repo reads either one. | **Open.** The corpus baseline in `spine/data/corpus.json` uses 2 of 7 and says so out loud rather than resolving it quietly. It needs the founder to say which is right. Until then **band 1's kill gate, "cannot comfortably beat the pilot's 2 of 7", is uncertain by one item**, which matters because the current measured coverage of 28.6% sits exactly on that baseline. |
| D-002 | 2026-09-03 | A wrong test expectation, not wrong code. The furniture rule was expected to call a POÄNG at its own usual price `walk_away`. It returns `fair`, and `fair` is correct: paying the usual price is what fair means. The expectation was the defect. | **Test.** The failure surfaced when the expectation was run against the rule. | **Fixed.** The expectation changed, the rule did not. The lesson kept: the value of the furniture category is not the tier at all, it is the sentence, which names the $99 low the item has actually been sold at and which IKEA's own product page never shows. A category whose tier is boring can still be the one worth shipping. |
| D-003 | 2026-09-03 | A verdict that includes the seller being judged inside its own comparison set reads `fair` every single time. It is the quietest way for this product to be wrong: nothing looks broken, no error appears, and the answer is always reassuring. | **Human**, reading the comparison-set logic before it shipped. | **Fixed before it shipped.** `askingSeller` is excluded from the comparison set in `spine/src/spine.ts`, the field is documented in `spine/src/contract.ts` as existing for this reason, and a test in `spine/test/spine.test.ts` asserts the judged seller is absent from `comparisonSet` and that the point count drops accordingly. The test is the lock; the defect was still found by a person. |
| D-004 | 2026-09-03 | The grocery line read "Regular price is about $1.47 across 1 store." One observation is a fact, not an approximation, and "about" over a single number invents a spread that was never measured. | **Human**, reading the rendered verdict in a browser. Every test asserted the tier and the point counts; none asserted the sentence, which is the part the user actually reads. | **Fixed.** One store now reads "$1.47 at the one store carrying it". A test in `spine/test/spine.test.ts` asserts the wording and asserts "about" is absent. |
| D-005 | 2026-09-03 | `faceSvg` emitted no `xmlns`. Inline HTML tolerates that; a standalone SVG document does not, so any screen rasterising Shin's face to a canvas got a silently broken image. The share card exported a face with no eyebrows and threw nothing. | **Human**, by opening the exported PNG. Nothing in the app errored, and no test rasterises. | **Fixed at the source** in `app/public/js/shin.js` rather than in the one screen that hit it, so the next screen to rasterise does not rediscover it. |
| D-006 | 2026-09-03 | The watch threshold used `spread.medianCents` and described it to the user as "the middle of what these actually go for". On a grocery set that median lands on a capped promotion, so a loss leader was being presented as the going rate. | **Human**, checking a number on screen against the comparison set behind it. | **Fixed.** When the set mixes price kinds the target is the cheapest regular price, named as such; with no regular price the promotion is named as a promotion. This is stage 06's rule against a single blended grocery number, arrived at from the other direction. |
| D-007 | 2026-09-03 | `verdict` and `actions` read `history[0]` unconditionally while `home` routed to them with the id of the row that was tapped. Tapping the POÄNG chair in the watchlist showed the Kraft Dinner verdict. Nothing looked broken. | **Human**, reading two screens written by different lanes against each other. Neither was wrong alone; the seam between them was never owned. | **Fixed.** Both resolve the routed id against history and fall back to the newest scan. |
| D-008 | 2026-09-03 | The app told the user "Shin can answer for 7 things today". It can answer for **2**: two items have no recorded points, two have one point against a two-seller minimum, one is a declined category, and one identity is too weak to call. The app was overstating its own coverage by 3.5x. | **Human**, by pricing all seven through the real API and counting. The catalogue endpoint reported `pointCount`, which looks like coverage and is not. | **Fixed.** `/api/catalogue` now reports `answerableCount` and a per-item `answerable`, measured by actually pricing each item rather than inferred, so it corrects itself when data is added. Home states the shelf and the answer rate as two different numbers, and the scan shelf marks every row. |
| D-009 | 2026-09-03 | The price-drop screen re-priced a watched item without passing `askingSeller`, so the store the user was standing in had its own shelf price counted as a competing quote. It pushed the stated regular price from $1.47 to $1.74 and made the drop look better than it was. **This is D-003's shape for the second time**, reached through the caller instead of the engine. | **Human**, reading a number on the drop screen that disagreed with the same item's verdict screen. | **Fixed** in three places, because one was not enough: the re-price call passes the seller, the watch entry stores it, and the watch normaliser stops discarding it (with a fallback to the recorded scan, so saves made before the fix still price correctly). |

Counts so far: **9 defects, 8 found by humans and 1 by a test.** That ratio is the thing to
watch, not the total, and it is getting worse rather than better. Six of the nine were found by
looking at a rendered screen, which is the one activity none of the 43 tests perform.

---

## Build standards earned by a repeat

**1. A price is never compared against the seller quoting it, and every caller carries the seller
to make that possible.** Earned by D-003 and D-009. D-003 was the engine including the judged
store in its own comparison set; D-009 was a caller omitting `askingSeller` so the engine could
not exclude anything. Same wrongness, opposite ends of the same call, and the second one survived
the test written for the first because that test called the engine directly.

Forbidden: calling `priceIt` for a price observed somewhere without passing where it was observed.
Required: any stored record of an observed price stores its seller alongside it, and any code that
normalises or copies such a record carries the seller through. The literal string `given`, which
the spine uses when no store was named, is not a seller and must never be stored as one.

The wider lesson, and the reason this is a standard rather than a third bug fix: **a test that
locks a fix at one layer does not lock the fix.** D-003's test asserts the engine excludes the
judged seller. It passes. The app was still comparing Kraft Dinner to Kraft Dinner, because the
question was never asked with the seller in it.

When one is earned, write it as one sentence naming the shape, the two occurrences that earned
it, and what it forbids.
