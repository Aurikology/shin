# What to build, in order

Written 2026-09-20. The reasoning is in `ACCURACY.md`; this is the work. Six items, all small, all
inside the existing one-call architecture. Nothing here needs a catalogue, our own search, a second
judging call, or any mechanism for deciding an answer was wrong.

Constraints this respects, all of them his: the server only calls Gemini, one call, grounding on,
the app always gives an answer and never refuses.

## 0. Make a run repeatable, then take a baseline. Precondition for everything else

Nothing in `identify/src/providers/gemini-scan.ts` sets temperature, topP, topK or a seed. Grepped,
zero hits. The only generation field sent is `thinking_level`, and only on 3.x.

- Add temperature, and a seed if the endpoint honours one, to the request body, defaulting to 0 for
  a pure extraction task.
- Run the 200 photos on the engine that is actually live.

**Why first:** the 148 of 2026-09-16 belongs to an implementation that was replaced on 09-19, and
the replacement has never produced a number. And until the temperature is pinned, two runs of the
same photos are not measuring the same thing, so no change below can be judged.

## 1. Make it read the pack before it names the product

`Shin_Gemini_Pricing_Engine/response_schema.json`, `product` object, current order:

```
name, brand, model, variant, size, pack_count, description, identification_confidence,
identification_evidence, sources
```

Structured output is generated in field order, so this asks for the answer first and the evidence
last. Replace with:

```
visible_text        array of strings, the front-of-pack lines transcribed verbatim, no inference
barcode_digits      string or null, any barcode printed on the pack, digits only
net_size, unit      what the pack states, as stated
pack_count          integer or null
then: name, brand, model, variant, description, identification_confidence,
      identification_evidence, sources
```

And in `scan_prompt.md`, an instruction that does not exist today: **transcribe before naming, and
name the three things that separate a product from its sibling, the flavour or descriptor word, the
net weight or volume, and the count on a multipack.** Grepped the prompt and the system file for
transcribe, verbatim, visible text, net weight and pack count: zero hits.

**Why:** measured on the 09-16 run, multipacks scored 7 of 18 against 75 to 88 percent for every
other kind, and every miss returned the right brand family with the wrong variant: flaked tuna for
chunk tuna, one KitKat for another, the wrong size of the same chips. The model is not failing to
recognise products. It is failing to read the small print, and it is being asked to name them
before it has written a word of what it can see.

## 2. Make a barcode read off the pack the primary search key

Today the search key is the barcode Shin supplies, or a text description. The system file lists
barcodes among things to extract from the image, but nothing makes an image-read barcode the thing
searched, and there is no field to put it in.

- The `barcode_digits` field from item 1 is where it goes.
- In the prompt: when no barcode is supplied and one is legible on the pack, search those digits
  first, exactly, before any text query. Do not infer digits that are not legible, leave it null.

**Why:** a photographed grocery item almost always shows its own barcode. Exact digits collapse the
variant problem completely, because they are the difference between searching for a brand and a
flavour and searching for one specific package. This is the largest identification gain available
and it needs no new architecture, only a field and a sentence.

## 3. Stop degrading the image before the model sees it

- `identify/src/providers/gemini.ts:191-194`: `mediaResolution()` returns `medium` unless an
  environment variable overrides it, and nothing sets it. Set it to high and measure the token cost.
- The eye crops to the detected object at a 1568 px long edge. If the pack fills half the frame, the
  net weight is unreadable before Gemini is involved. Send the full frame as a second image part
  beside the crop, in `buildRequestBody`, which already builds a parts array.

**Why:** every measured failure turns on small print, and medium resolution is what removes small
print.

## 4. Raise the thinking budget on the tier most people get

`identify/src/providers/gemini.ts:216-223`: `thinkingLevel()` returns `high` only when the model id
contains "pro", `minimal` for "lite", `low` for everything else. The run that scored 148 was the
basic tier, so it ran at `low`.

One environment variable, then measure.

## 5. Retry a failed call, and never write a failed call down as an unreadable photo

`identify/eval/results/2026-09-17.json`: six rows, six `model_rate_limited`, all recorded as
outcome `unreadable`, which is a statement about the photograph.

- Separate the transport failure from the photo outcome.
- Retry with backoff on rate limits and 5xx. Do not retry a 4xx.

**This is not answer-checking.** It is the difference between the user getting an answer and getting
nothing, and it also stops a rate limit quietly counting as a wrong identification in every
measurement.

## How each run is read, decided before any of them are run

His instruction, 2026-09-20: a test is designed and read as a statistician would, not as an
ordinary reader. Everyday reading treats 148 becoming 153 as a result. On 200 rows it is noise,
and acting on it ships a change that did nothing.

The rules for every run in this file, fixed here so no threshold gets chosen after seeing an
output:

- **Paired, always.** Same 200 photos, same order, one variable changed, and **per-row outcomes
  recorded, not just the total**. Compared unpaired, two rates on 200 rows at about 74 percent need
  roughly a **17 row** swing before the difference means anything. Compared paired, only the rows
  that flipped are counted, and about 30 flips needs a gap of **11** between the two directions.
  Pairing buys more than any other choice here, and it is free if the runner writes per-row
  outcomes.
- **One change per run.** Two changes give one number and no attribution.
- **The noise floor comes first.** Run item 0's configuration twice, unchanged, and record how far
  the total moves on its own. Nothing smaller than that spread counts as an effect, whatever it
  looks like. Pinning the temperature is what makes this floor small enough to be useful, which is
  why it is item 0 and not item 5.
- **Multipack is 18 rows and will lie loudest.** A subgroup that size carries about **plus or minus
  4 rows** of pure chance, so 7 becoming 10 is nothing. Report it as a count, never as a percentage
  alone, because "39 percent" hides that it is 7 of 18. This matters because multipack is the row
  this plan predicts will move, and a prediction is exactly where a small sample fools you.
- **Count the looks.** Five kinds times six changes is thirty comparisons, so about one will look
  like a winner by luck. Decide in advance that the headline is the total, and treat the per-kind
  numbers as description rather than evidence.
- **The 200 are not a random sample of real scans.** A gain on them is a gain on them until
  something outside the set agrees.

## 6. One knob per run in the eval runner

`identify/eval/scan-run.ts` already takes knobs. Make each item above settable from the command line
so a change is one run and one number, against the same 200 photos.

## Not to be built

Judges, graders, verifiers, hallucination checks, a consumer for the confidence band, sentence level
support checking, an abstain path, the catalogue, our own search index. His words: finding out the
answer is wrong provides the user no value, and the app must always answer.

## Order

0, then 1 and 2 together since they are the same edit, then measure. Then 3, then 4, then 5. Item 6
whenever it saves more time than it costs.

Watch the multipack number. If reading before naming is the right theory, that is the row that moves
first and moves most.
