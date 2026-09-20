# Where accuracy is actually lost, and the six levers that raise it

Written 2026-09-19 after his correction: *"You keep trying to put things in place that find out if
the answer is wrong. To me, thats not important at all and to the user, that provides them no
value. We need to figure out how to GET more accurate answers."*

He is right, and the correction is structural. Everything recommended in `README.md`,
`README-batch2.md` and `README-batch3.md` under the heading of judging, grading, verifying or
re-asking is **detection**, and detection cannot help a product whose standing rule is that it must
always give an answer. A judge that flags a wrong price leaves the user with a wrong price.

This file is the replacement. It is built from the 200-row live run of 2026-09-16, not from any
repository, because the evidence about what makes Shin wrong is in Shin's own results.

## CORRECTION, 2026-09-20: the 148 baseline does not describe what is running now

Checked in git rather than assumed. `identify/src/providers/gemini-scan.ts` and the whole
`Shin_Gemini_Pricing_Engine/` package (`GEMINI_SYSTEM.md`, `PRICING_GUIDE.md`, `scan_prompt.md`,
`response_schema.json`) **both first appear on 2026-09-19**, first commit `fdf9300`. The 200-row
run scored 148 on **2026-09-16**, three days earlier, on a different implementation.

Two consequences, and they change the order of work:

1. **Section 2 below is not a demonstrated cause of those 148 numbers.** The schema whose field
   order it criticises did not exist when that run happened. The criticism stands as a criticism of
   **what runs today**, which is what matters going forward, but it is a hypothesis about the
   current system and not the explanation of a past measurement. Stated plainly rather than quietly
   fixed.
2. **The engine now in the path has never produced a number.** Thirty-five design decisions
   replaced the system that scored 148, and nobody has put the 200 photos through the replacement.
   So the first action is not any lever in this file. **It is one baseline run on the current
   engine**, because until that exists there is no number to improve and no way to tell whether the
   replacement helped or hurt.

Everything in section 1 remains true as a description of the failure *shape*, which is the durable
finding: the model gets the brand family right and the variant wrong. Whether the new engine still
does that is the first thing the baseline run will say.

## 1. Accuracy is not evenly lost. It is concentrated, and the shape names the cause

Counted over all 200 rows of `identify/eval/results/2026-09-16.json`, `dryRun: false`, basic tier:

| kind | n | top1 | rate |
|---|---|---|---|
| store-brand | 18 | 16 | 88% |
| size-pair | 54 | 42 | 77% |
| plain | 90 | 68 | 75% |
| tech | 20 | 15 | 75% |
| **multipack** | **18** | **7** | **38%** |

Multipack is half the accuracy of everything else. Eleven rows, and closing that gap alone is
eleven of the thirty-two points between 148 and the 180 target.

**Now read the failures, not the rate.** Every multipack miss returns a code in the right brand
family and the wrong variant:

- expected *flaked* light tuna, returned the code for *chunk* light tuna (and that code belongs to
  another row of the same eval)
- expected *KitKat Mega (2 bars)*, returned a different KitKat
- expected *Honey Oat Flax*, returned a different bar from the same maker
- expected *Original potato chips 148g party size*, returned a different size of the same chips
- expected *Bear paws*, returned a different Bear Paws

It is not failing to recognise the product. **It is failing to read the small print that separates
one variant from its sibling: the flavour word, the net weight, the pack count.** Every lever below
follows from that one sentence.

## 2. The schema makes it answer before it reads

`Shin_Gemini_Pricing_Engine/response_schema.json`, the `product` object, in order:

```
name, brand, model, variant, size, pack_count, description,
identification_confidence, identification_evidence, sources
```

Structured output is generated **in field order**. The model emits `name` first, before it has
written down one thing it can see on the package, and `identification_evidence` last, after the
answer is already committed. So the order asks it to guess and then justify.

That is the textbook cause of exactly the failure in the data: commit to "Bear Paws" from the gist
of the picture, then fill the variant and the size to be consistent with the name already given,
rather than reading the pack and letting the reading decide the name.

**Lever 1. Put the reading before the naming.** Add a first field holding the visible front-of-pack
text verbatim, and move `size` and `pack_count` above `name`. One file. Costs nothing per call.
This is the single highest-value change available and it is a reordering, not a feature.

Supporting note, from our own history: the 2026-09-09 research pass already recommended
"verbatim text first, make the model transcribe the front-of-pack text before it fills brand and
name, brand hallucination drops" (`docs/the-photo-path.md`). It was never implemented, and the
current prompt contains no instruction to transcribe anything. Grepped
`Shin_Gemini_Pricing_Engine/scan_prompt.md` and `GEMINI_SYSTEM.md` for transcribe, verbatim,
visible text, net weight and pack count: **zero hits**.

**Lever 2. Ask it, in the prompt, to read the pack before it names it**, and name the three things
that decide a variant: flavour or descriptor word, net weight or volume, and the count on a
multipack. The prompt currently asks for none of these.

## 3. The image is being degraded before the model sees it

`identify/src/providers/gemini.ts:191-194`: `mediaResolution()` returns **`medium`** unless an
environment variable overrides it, and nothing sets that variable.

The failures are decided by small print. Medium resolution is exactly what removes small print.

**Lever 3. Set the media resolution to high.** One environment variable, already supported, never
tried. It costs more tokens per call and that is the trade to measure, not to assume.

**Lever 4. Stop throwing away the pixels before the call.** The eye crops to the detected object at
a 1568 px long edge (`app/src/eye/capture.ts`). If the pack fills half the frame, the net weight is
already unreadable before Gemini is involved. Two options, both cheap: send the full frame as a
second image part alongside the crop, or send a second tighter crop of the densest text block. The
API takes multiple image parts on one call, which we have already proven works with the search tool
attached.

## 4. Decoding is running at maximum variance on a task that should be deterministic

Grepped `identify/src/providers/gemini-scan.ts` for temperature, topP, top_p, topK, top_k,
candidateCount and seed: **no hits. None of them is set anywhere.** The only generation setting sent
is `thinking_level`, and only on 3.x models.

So the model is sampling at the API default on a task that is pure extraction. **That is his third
complaint stated exactly**: the same photograph can produce a different answer on two runs, because
nothing asks it not to.

**Lever 5. Set temperature to 0** (and a fixed seed if the endpoint honours one). Free, one line,
and it makes every other measurement below trustworthy, because today two runs of the same 200
photos do not measure the same thing.

## 5. The model is barely thinking on the tier most users get

`identify/src/providers/gemini.ts:216-223`: `thinkingLevel()` returns `high` only when the model id
contains "pro", `minimal` for "lite", and **`low` for everything else**. The 148/200 run was the
basic tier, so it ran at `low`.

**Lever 6. Raise the thinking level on the basic tier** and measure. One environment variable.
Variant discrimination is exactly the kind of careful comparison that a thinking budget buys.

## 6. What the repositories contribute, now that the frame is right

Almost nothing, and that is worth saying plainly. Twenty-nine repositories are full of machinery for
noticing a bad answer and nearly empty of craft for producing a good one. Three things survive the
new frame:

- **Several phrasings of the lookup, merged.** `openai/openai-cookbook`
  `examples/Question_answering_using_a_search_API.ipynb:159-176` and `assafelovic/gpt-researcher`
  `gpt_researcher/actions/query_processing.py:83-156` both fan out one question into several
  differently worded queries. We do not issue queries, but we can instruct the model to search more
  than one phrasing of the product, which raises the odds that one of them matches how the product
  is actually indexed. `FITS`.
- **Image and live search on one call**, already ours, confirmed by three other codebases.
- **Sampling the same question several times and taking the majority.** This is an accuracy
  mechanism rather than a detector, because it produces a better answer and never reports a verdict.
  It multiplies cost by the sample count, so it is a last resort, not a first move.

`ACCURACY-LEVERS.md` also proposes rendering catalogue candidates and having the model pick by
index. **Struck**: that needs the catalogue, which is out of the path by his ruling.

## 7. What is unmeasured, and worth one run each

- **The pro tier has never produced a number.** The 2026-09-17 run was six rows and all six came
  back rate limited. We do not know what the better model scores on these photos, which is the
  largest single unknown in the accuracy picture.
- **Nothing above has been tried.** All six levers are settings or orderings, and the 200 photos
  are already assembled, so each is one run.

## 8. The order to run them

Ordered by evidence strength and cost, cheapest and most certain first. One change per run, on the
same 200 photos.

0. **A baseline on the current engine**, which has never been measured. See the correction at the
   top: the 148 belongs to an implementation replaced on 2026-09-19. Run this with temperature
   already at 0, so the baseline itself is repeatable.
1. **Temperature to 0.** Free, and until it is set no two runs measure the same thing.
2. **Reorder the schema so reading precedes naming**, and add a verbatim text field.
3. **Prompt the model to read flavour, net weight and pack count before naming.**
4. **Media resolution to high.**
5. **Thinking level up on the basic tier.**
6. **Stop degrading the crop**, or send the full frame alongside it.

Then measure the pro tier, with the rate limit handled.

Multipack is the row to watch: 7 of 18 today, and if the reading-before-naming changes are right,
that number moves first and moves most.
