# Nineteen repos read against the three things the photo path gets wrong

*Batch one, eleven repos, is below. Batch two, eight framework repos, is in `README-batch2.md`
and settles the questions batch one could only frame. Read batch two first if you want the
answers, and note that it corrects two claims made below.*

Read 2026-09-19. Eleven external repos, one reader each, all working from `QUESTIONS.md`, plus
`_ours.md` as the negative control read first so every finding below is a difference and not a
description. Per repo detail is in the sibling files. Every claim here carries the file and line
it came from, in the repo it came from.

The founder set the three lenses in his own words: the app "doesn't correctly identify a lot of
objects", "cannot accurately find its prices", and "cannot accurately prompt gemini everytime".
Nothing else was looked for.

## The headline: the blocker in our own notes is dead, and was dead before this scan

`NOW.md` still carries a BLOCKING QUESTION dated 2026-09-18 saying that making the photo path one
call means putting the image inside a grounded request, that the guard forbids it, and that Google
has not confirmed it works, so "the design is not buildable yet".

**It is built and it is shipping.** `identify/src/providers/gemini-scan.ts:379-397` puts the image
part and `tools: [{ type: 'google_search' }]` in the same request body, and
`gemini-scan.ts:934-939` is the single POST that sends it. One call. Verified by direct read, not
by a reader's report.

**And Google's own production repo does the same thing**, which retires the "not confirmed by
Google" half of the objection:
`gemini/grounding/intro-grounding-gemini.ipynb` cell 26 sends `Part.from_uri(...paris.jpg...)` and
`tools=[google_search_tool]` in one `generate_content`. Verified by fetching and parsing the
notebook here, not by a reader's report.

Two third-party codebases do it as well: `owndev/Open-WebUI-Functions`
(`pipelines/google/google_gemini.py:3474-3479`, image `inline_data` parts and
`types.Tool(google_search=types.GoogleSearch())` on one call) and
`udhaykumarbala/gemini-image-studio-mcp` (`src/gemini/client.ts:63-92`, same shape on
`gemini-3.1-flash-image-preview`).

Counter-evidence is absence only, and absence of a demo is not a prohibition:
`google-gemini/cookbook` never combines them in any grounding notebook, and neither does
`dynamicwebpaige/gemini-and-gemma-examples` (all 8 notebooks checked).

**Consequence:** the retrieval work that question was gating is unblocked, and `NOW.md` is wrong
about the state of the code. `docs/the-photo-path.md` is wronger still: it describes a dead
two-call Claude and catalogue design and predates the Gemini switch entirely.
`docs/jamin-gemini-rules.md` is the file that matches the running code.

## Defect 1: it names the wrong product

### What we do

One call, one answer, shipped. There is no branch anywhere in the live path that can notice the
answer is wrong. Confidence marks annotate the row after the fact. The arithmetic re-check
(`gemini-scan.ts:1252-1313`, `app/server.ts:1092-1125`) runs **after the answer has already been
sent** and only writes a mark, so it is a check that cannot change an outcome.

### What the read set does instead

**An evaluator that can reject the answer and force another search.**
`jina-ai/node-DeepResearch`, `src/tools/evaluator.ts:622-671`: a separate judging call scores the
answer on named dimensions (definitive, freshness, plurality, completeness) and fails fast on the
first bad one. On failure, `src/agent.ts:687-746` sets `allowAnswer = false`, clears the working
context, and the loop runs another search instead of returning. This is the single most
transferable mechanism on the whole list, and we have no version of it.

**A failure budget, so rejection cannot loop forever.** `src/agent.ts:421,541`:
`maxBadAttempts = 2`, decremented per rejection, then it falls through to a forced answer.

**A hard budget cap with a defined degraded output.** `src/agent.ts:499,1036-1075`: at 85% of the
token budget it stops searching and forces one last schema-constrained call with `isFinal = true`.
The stated principle is that any answer beats no answer, which is the same principle as our own
"always a price" rule, implemented.

**Turn naming into choosing.** `OpenAdaptAI/openadapt-ml`,
`openadapt_ml/baselines/prompts.py:644-672`: candidate elements are rendered to the model as
`[id] role: "name" @ (cx, cy)` next to the raw image, and
`openadapt_ml/baselines/parser.py:490-502` maps the model's reply back to an id rather than
re-parsing free text. Verified here by direct read.

**Struck 2026-09-19, same day.** This was written up as "hand the model our top catalogue rows and
let it pick", which contradicts a ruling he has now made more than once and which was sitting in
`NOW.md` when this scan was planned: *"The server will not check shins own product list for now.
The only thing the server will do is call gemini"*, and the catalogue *"will not be in use until
more user data comes in"*. There is no candidate list to number, so the mechanism has nothing to
act on here. Kept in the record only because it becomes live again if the catalogue ever does.

**A determinism cache keyed on the image itself.**
`openadapt_ml/segmentation/frame_describer.py:493-502`: cache key is `md5(PNG bytes)[:12]` plus
`md5(sorted-JSON action)[:8]`, wired at :569 and :601. Same picture, same question, same answer,
and free on a repeat. We have no such key.

## Defect 2: the price is wrong

### What we do

Citations come back and are stored and displayed. Nothing verifies the answer against them. The
price has no independent source and no freshness check.

### What the read set offers

**The grounding fields that tie a claim to its source span are read by nobody, including us.**
`epilande/gemini-grounding` unpacks `groundingChunks[].web.{uri,title}` and the rendered search
entry point (`src/gemini-client.ts:107-144`) but never touches `groundingSupports` or
`webSearchQueries`, proven by grep. `ammaarreshi/Gemini-Search` declares `confidenceScores` on its
grounding interface at `server/routes.ts:94` and never reads it anywhere. So the field that says
*which sentence came from which source* is unused across the whole read set. That is an
opportunity, not a dead end: it is the only mechanism available that can check whether a returned
price is actually supported by a page rather than invented.

**Two of the four evaluator dimensions are literally the price problem.** Freshness is the stale
price. Plurality is the single unconfirmed source. `node-DeepResearch`
`src/tools/evaluator.ts:622-671` shows both being judged by a separate call, and a failure
re-searching.

**Nothing in any of the eleven does retail price extraction.** Grep for price across the set
returns nothing usable. Reported as absence: this list cannot teach us price accuracy directly,
only the verification shape around it.

## Defect 3: it does not ask Gemini the same way twice

### What we do

A real JSON schema goes as an API-level schema only on 3.x models
(`gemini-scan.ts:399-402`); on 2.5 the shape is flattened into prompt prose. A failed parse is
repaired or marked, never re-asked.

### What the read set shows

**Our "schema and search are mutually exclusive on 2.5" belief is not supported by the client
code.** `vercel/ai`'s Google provider builds `responseJsonSchema` / `responseMimeType`
(`packages/google/src/google-language-model.ts:396-406`) and `tools` (`:422`) independently, with
no conditional linking them and no version gate. The only Gemini-3-only gate found
(`src/google-prepare-tools.ts:67-72`) governs mixing function tools with provider tools, not
schema with search.

**Held honestly: that proves the library permits it, not that the API accepts it.** The one piece
of stated authority points the other way, weakly: `google-gemini/cookbook`
`quickstarts/JSON_mode.ipynb` cell 26 says in prose that structured outputs with tools such as
Google Search are "available with Gemini 3 models". A documentation sentence, not a worked
example. **This is settled by one live call and nothing else.** See the test below.

**Nobody re-asks on a bad parse.** `gemini-image-studio-mcp`
`src/tools/decompose-image.ts:14-35` does the same ladder we do, `JSON.parse` then a fence regex
then a brace substring then throw. `farzaa/clicky` enforces its output shape purely by prompt text
and parses with a regex that silently falls back on no match
(`leanring-buddy/CompanionManager.swift:786`). A validator that rejects and re-asks does not exist
anywhere in the eleven. That is a gap in the field, not only in us.

**Grounding config is invisible to the identification step in the one repo that has both.**
`gemini-image-studio-mcp` attaches `googleSearch` only on its generate path
(`src/tools/generate-image.ts:16,73`); its object-naming path calls `generateTextOnly()`, which has
no tools field at all (`src/gemini/client.ts:110-140`). Worth checking we have not done the same
thing on any secondary path.

## The four things worth doing, in the order the evidence supports

1. **Strike the blocking question.** It is answered by our own running code and by Google's own
   notebook. Correct `NOW.md`, and mark `docs/the-photo-path.md` as describing a dead design.
2. **Add a rejection path.** A second judging call on the returned answer, scored on definitive,
   freshness and plurality, that can set the answer aside and force one more grounded search, with
   a failure budget of two and a defined degraded answer when the budget is spent. This is the only
   change on this list that attacks all three complaints at once.
3. **Read `groundingSupports`.** Check that the price and the product name are actually carried by
   a cited span before either is shown confidently. Nobody in the read set does it, which is why it
   is worth doing.
4. **Key a cache on the image bytes** so the same photo cannot produce two different answers.
   (The "number the candidate rows and let it pick" half of this item was struck the same day: it
   assumed a catalogue that his ruling has taken out of the path. See the strike note above.)

## The one test that is not answerable by reading

Send one real request on a 2.5 model with an image part, the search tool, and a response schema,
all three together, and record whether the API accepts it. Everything above about schema and search
coexisting is library evidence and documentation prose until that call is made. A second call on a
3.x model is the control.
