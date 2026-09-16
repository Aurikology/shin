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
