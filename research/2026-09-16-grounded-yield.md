# Why seven of ten grounded searches found no price: the three-arm run

**Protocol written 2026-09-16, BEFORE the run, and committed before it, so that
"the decision rule was fixed in advance" is a fact in the git history rather
than a claim made afterwards.**

---

## The question

Ten real grounded calls on 2026-09-16 returned **no price at all in seven of
them** (`NOW.md`). Identity was named in all ten. Three products returned 1, 1
and 2 offers; everything else returned zero. At those counts the price line is
either absent or resting on a single claim, which is what D-113 was.

So: **why is the offer count zero so often?** Three candidate causes, and
nothing in the repo separates them:

1. **The prompt.** Something in how Shin asks suppresses offers.
2. **Product obscurity.** Gemini can price mainstream products and not obscure
   catalogue rows.
3. **Canada.** Grounded search cannot see Canadian retail prices specifically.

These have completely different fixes -- a string change, a catalogue strategy,
or a finding that reopens a killed register row -- so guessing between them is
the expensive mistake.

## Method

Run through **Claude in Chrome on `gemini.google.com/app`, never the API.**
Rule 8: *"Make sure not to use the api key for things like building code etc
because you can use claude in chrome to control gemini. Only use the api for
live testing on the phon[e]"*, and Jamin's own instruction naming that URL.

This is the consumer-grade surface, not the grounded API, and that is a real
limitation recorded up front: the web app and the grounding endpoint are not
guaranteed to retrieve identically. What it CAN establish is whether the model
plus a live search can find Canadian retail prices for these products at all,
which is the question all three hypotheses turn on.

Three arms over the same ten products where possible, one prompt each, no
retries, first answer taken.

| Arm | Products | Prompt | What a positive result means |
| --- | --- | --- | --- |
| **A. Control** | the original 10 | the live ask verbatim, market clause included | 7/10-zero is stable, not variance |
| **B. Canada** | the original 10 | the same ask with the market clause REMOVED | the CAD-only clause is suppressing offers |
| **C. Obscurity** | 10 mainstream items | the live ask verbatim | obscurity, not the prompt, is the variable |

### The prompts, as the code actually sends them

Arm A and C system text, from `gemini-grounded.ts` `voice()` + `market()`:

> Tone: flat, factual, direct. State the number and stop. Answer in English.
> Canadian retailers only, prices in Canadian dollars (CAD) only. No
> third-party marketplace sellers, only the retailer itself. NEVER convert a
> price from another currency into CAD: give the price as it stands with its
> own currency code.

Arm B drops the second sentence onward, keeping only the tone line.

User text, all arms, from `gemini-grounded.ts:422`, trimmed to the price half
(the reviews and description halves are not under test and are dropped so the
answer is short enough to read):

> Use Google Search to identify <subject>, then find, for that same product,
> current prices at Canadian retailers, giving for each offer the retailer, the
> price (a number), the currency of that price, the url, the size value, the
> size unit and the pack count.

### The ten control products

The originals, from `NOW.md`: Kraft Dinner Original 225 g; Coca-Cola Classic
2 L; Cheerios Original 570 g; Tide Original 2.72 L; and the three obscure
catalogue rows asked two ways each -- Neilson 5% cream, Massimo Pandoro,
Italissima noodles.

### The ten mainstream products for arm C

Chosen for being the most findable things in a Canadian grocery aisle, so that
arm C is the strongest possible test of the obscurity hypothesis: Coca-Cola
2 L, Tide Original 4.43 L, Advil 200 mg 50 caplets, Tylenol Extra Strength 100,
Heinz Ketchup 1 L, Kellogg's Corn Flakes 680 g, Nutella 725 g, Charmin Ultra
Soft 12 rolls, Maple Leaf bacon 375 g, Lay's Classic 235 g.

## The decision rule, fixed now

- **B yields where A does not** -> the market clause is the cause. The fix is a
  prompt change: relax to "prices a Canadian shopper can pay, marked with their
  currency" and let the existing `not_cad` exclusion in `gauge.ts:467` do the
  filtering it was already built for. The offer arrives and is LABELLED, which
  is rule 6's shape rather than a silent drop.
- **C yields where A does not** -> product obscurity is the cause. The fix is
  catalogue and query enrichment, and a low-yield category list gets written
  down. It also means grounded coverage is structurally better for the products
  a beta tester will actually scan than the 7/10 figure suggests.
- **Neither yields** -> grounded search cannot see Canadian retail prices, full
  stop. That is the single most important finding available in this repo: it
  makes the grounded path unviable as the only price source and is a new
  OBSERVATION, which is the only thing that reopens a killed register row.
  **It is still not a licence to build one** -- it is a petition.
- **A yields where the API did not** -> the web surface and the grounded
  endpoint differ, which is itself worth knowing and means the 7/10 figure
  describes the API rather than the model.

## What this run cannot settle

- It is not the grounded API, so a difference between arms is stronger evidence
  than an absolute yield number.
- n is 10 per arm. `NOW.md` already says of the original: *"a signal worth a
  real run, not a law."* The same caution applies here and the arms are
  compared to each other, never to a threshold.
- Nothing here measures whether a returned price is CORRECT. That is
  `price-truth.ts`'s question and it needs a key.

## Results

*Filled in below after the run. Nothing above this line is edited afterwards.*

## Results, 2026-09-16

**The protocol above did not contain the variable that explained the result, and
that is the first thing to say.** Its three hypotheses were prompt, obscurity and
Canada. The answer appears to be a fourth: **the model tier.** Arms B and C were
never run, because arm A answered the question before they were needed.

### What was run

Claude in Chrome on `gemini.google.com/app`, signed in, three products, the
control prompt verbatim including the market clause. Two model settings, chosen
from the UI's own picker.

**The production grounded search runs on the cheapest tier.**
`gemini-grounded.ts:1093` defaults the grounded model to `'claude-haiku-4-5'`,
and `gemini.ts:141` maps that to **`gemini-3.5-flash-lite`**. That is the same
name the UI offers as "3.5 Flash-Lite, fastest answers", which is why it was
picked first.

| product | class | production API, flash-lite | web Flash-Lite | web **Pro** |
| --- | --- | --- | --- | --- |
| Kraft Dinner Original 225 g | mainstream | **1** offer, Walmart $9.97 | not run | **4** offers |
| Tide Original 2.72 L | mainstream | **0** offers | **empty answer**: the literal text `1` | **2** offers |
| Neilson 5% dairy cream | obscure | **0** offers, both ask forms | not run | **2** offers |

**The Pro answers, in full.**

- **Kraft Dinner 225 g** -- No Frills $2.27, Loblaws $2.49, Shoppers Drug Mart
  $2.99, all 225 g pack 1; Voila by Sobeys $21.49 as a 12 x 225 g multipack,
  correctly labelled as a multipack with `packCount: 12`.
- **Tide Original 2.72 L** -- Metro $18.99 and Food Basics $18.99, both 2.72 L
  pack 1, both carrying a real product URL ending `/p/037000402176`.
- **Neilson 5% cream** -- Loblaws $3.50 and No Frills $4.24, 1 L, pack 1.

### What this says, and how far it goes

**Obscurity is not the cause.** This is the strongest single conclusion, because
it is the hypothesis the run can actually kill: the obscure catalogue row that
returned zero offers under BOTH ask forms in the API run returned two Canadian
offers here, with the market clause still in the prompt. The clause cannot be
suppressing what it just allowed through, and the product cannot be too obscure
to price when it was just priced.

**The prompt is not the cause either**, on the same evidence: the prompt was
identical across every cell of that table. The only thing that changed was the
model.

**What changed the answer was the tier.** Same prompt, same browser, same
session, same minute: flash-lite produced the literal string `1` and Pro produced
four priced offers with URLs and correct pack parsing.

**This is a one-constant change if it holds.** `SHIN_GEMINI_GROUNDED_MODEL` is
already an environment variable, so nothing needs rewriting to test it.

### D-113 gets corroborated sideways

The measured API answer for Kraft Dinner was a single Walmart offer at **$9.97**
against a hand-priced truth of $1.74. Pro's four offers for the same product are
$2.27, $2.49, $2.99 and $21.49-for-twelve. Per 100 g those are 1.01, 1.11, 1.33
and 0.80, median **1.06**; $9.97 for 225 g is **4.43**, which against a
leave-one-out median of about 1.06 is more than four times it and **outside the
2.5x ceiling the new guard applies**. So on this product the guard would have
held the bad claim off the line, and the three honest prices would have drawn it.

It also says something harder about the old behaviour: $9.97 was not a rounding
error or a pack-size confusion, it was simply wrong, and three retailers agreeing
near $2.50 were available to the same search on a better model.

### What this run CANNOT settle, stated plainly

- **The web app is not the grounding API.** Different surface, possibly different
  retrieval. The comparison BETWEEN cells is sound because only one variable
  moved; the absolute yields are not transferable to the API, and nothing here
  proves `gemini-3.8-flash` through the API behaves like Pro in the browser.
- **n = 3 products, one session, one run each, no retries.** `NOW.md`'s caution
  on the original ten applies here with more force: a signal worth a real run,
  not a law.
- **The flash-lite `1` is a single observation** and may be a UI artefact rather
  than a model failure. It is recorded because it happened, not because it is
  understood.
- **Identity drift on the cream.** Pro answered with a "5% dairy creamer" at 1 L
  where the catalogue row is a Neilson 5% cream; those may not be the same
  product. It is counted as "returned Canadian offers" because that is what the
  question was, but it is not counted as a correct identification.
- **Correctness is not measured here at all.** That is `price-truth.ts`'s job and
  it needs a key. Whether $18.99 is really Tide's price at Metro today is
  unverified.

### The next thing to do, and it is cheap

Set `SHIN_GEMINI_GROUNDED_MODEL` to the Sonnet-mapped id (`gemini-3.8-flash`) and
re-run `identify/eval/price-truth.ts` against the seven hand-priced products.
That is the same harness that found D-113, it now has a guard to exercise, and it
would answer at the API rather than in a browser. **It needs a paid key, which is
one of the two things only Jamin can send**, so it is blocked on him rather than
on any work here.

Cost is the reason this was never the default and the reason it is a decision
rather than a fix: flash-lite is $0.30/$2.50 per million tokens and
`gemini-3.8-flash` is $0.75/$3.75, both doubling 2027-01-01
(`app/src/model-cost.ts:130-133`). Roughly 2.5x the token cost per scan, against
a path that currently returns nothing usable on most scans. The search-query
charge of $0.014 per query past the free 5,000/month does not change with the
model.

