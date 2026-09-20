# Batch two: eight frameworks, and the three things they settle

Read 2026-09-19, the same day as batch one. Eight repos, one reader each, all on `QUESTIONS.md`
plus the extra question in `QUESTIONS-batch2.md`. Two repos on the founder's second list,
`GoogleCloudPlatform/generative-ai` and `vercel/ai`, were already read in batch one and were not
paid for twice.

Batch one was applications, which can only show you what someone chose to build. Batch two is
frameworks, which have to support every version of the API and therefore encode what the API
actually accepts. Three questions that batch one could only frame are answered here.

Corrections to the founder's list, from the source: `firebase/genkit` 301-redirects to
`genkit-ai/genkit`. `microsoft/semantic-kernel` has **no Gemini grounding support at all**, so the
claim that contributors integrated `googleSearchRetrieval` into its Gemini connectors is false
(`GeminiTool.cs:13-58` models only `functionDeclarations`; grep for grounding terms across both
the dotnet and python trees returns zero). `danny-avila/LibreChat` does **not** expose a tunable
grounding threshold; its search is a boolean.

## Settled 1: the image and the live search on one call is proven, by our own production traffic

Batch one leaned on Google's official notebook cell for this. **That cell carries no stored
output**, checked directly here, so it proves construction and not execution. It is weaker
evidence than batch one implied, and this file corrects that.

The real proof was in our own results the whole time. `identify/eval/results/2026-09-16.json` is a
live run, `dryRun: false`, **200 photos, 199 identified, one unreadable**, p50 3,568 ms. Every one
of those requests was built by `buildRequestBody` in
`identify/src/providers/gemini-scan.ts:379-397`, which puts the image part and
`tools: [{ type: 'google_search' }]` in the same body. **199 accepted live responses.** If the API
rejected an image alongside a search tool, that run would have been 200 failures.

That is an outcome, not a reading, and it closes the question for good. `NOW.md` should lose the
blocking question, and `docs/the-photo-path.md` should be marked as a dead design.

## Settled 2: the search tool CAN share a request with your own function tools, which we have no
use for

**Recommendation struck 2026-09-19, the same day it was written.** This section originally proposed
handing Gemini a "look up my catalogue" function to call inside the grounded request. That
contradicts a ruling he has made more than once, and which was in `NOW.md` when this scan was
planned: *"The server will not check shins own product list for now. The only thing the server will
do is call gemini"*, and the catalogue *"will not be in use until more user data comes in"*. With
the catalogue out of the path there is no internal function worth exposing, so the finding below is
a fact about the API with no action attached. It is kept because the day the catalogue returns,
this is how it would be wired, and because the ADK restriction it turned up is worth knowing for
any other tool we might ever add.

- `strands-agents/harness-sdk` merges developer function tools and
  `genai.types.Tool(google_search=...)` into one `tools` list
  (`strands-py/src/strands/models/gemini.py:264-291`), with a test that exercises the mix
  (`strands-py/tests/strands/models/test_gemini.py:1257-1302`). **Held honestly: that test uses a
  placeholder model id, so it proves the SDK builds the request, not that Gemini accepts it.**
- Against it, and this is the sharpest counter-evidence in either batch:
  `google/adk-docs` `docs/tools/limitations.md:15-18` states that Google Search "can only be used
  by themselves, without any other tools, in a single agent object", scoped at `:9-13` to ADK
  Python v1.15.0 and lower, with a `bypass_multi_tools_limit=True` escape in v1.16.0 and above.
  Documentation, and about a framework rather than the API, but a restriction that exists and then
  gets a bypass flag is usually a restriction that was real.
- `vercel/ai` corroborates the shape of it: its only Gemini-3-only gate
  (`packages/google/src/google-prepare-tools.ts:67-72`) governs **mixing function tools with
  provider tools**, which is exactly this combination.

**Reading: mixing our own function tool with the search tool is a newer-model feature.** Not worth
testing while nothing internal is being called.

## Settled 3: our 3.x-only schema gate is right, and batch one's doubt was wrong

Batch one noted that `vercel/ai` builds a response schema and a search tool with nothing linking
them, and suggested our "mutually exclusive on 2.5" belief might be unfounded. `genkit-ai/genkit`
(`js/plugins/google-genai/src/vertexai/gemini.ts:695-698,756-765`) and `spring-projects/spring-ai`
(`GoogleGenAiChatModel.java:693-694,751-755`) do the same. **Three frameworks with no gate.**

But none of that is evidence about the server, and the documentation is explicit the other way:

> `google/adk-docs` `docs/agents/llm-agents.md:473-480`: "Using `output_schema` with `tools` in the
> same LLM request is only supported by specific models, including Gemini 3.0. For other models,
> ADK falls back to a `set_model_response` function tool... which may not work reliably."

That is Google describing the API, not a framework, and it matches
`google-gemini/cookbook` `quickstarts/JSON_mode.ipynb` cell 26 from batch one. **Keep the gate.
Do not "fix" it.** Frameworks not gating a field is the weakest class of evidence in this scan and
three instances of it do not outweigh one statement from the vendor.

## Settled 4: there is no knob for how hard it searches

We search on every scan, unconditionally. The obvious saving would be a threshold that decides
whether to search at all. **It is not available.**

- `danny-avila/LibreChat`: no threshold anywhere, search is a boolean pushing an empty
  `{ googleSearch: {} }` (`packages/api/src/endpoints/google/llm.ts:722-724`); the user-facing
  config schema has no such key (`packages/data-provider/src/schemas.ts:1449-1470`).
- `genkit-ai/genkit`: `DynamicRetrievalConfig` is **declared and never consumed**
  (`common/types.ts:116-137,1050`), proven dead by grep.
- `spring-projects/spring-ai`: no dynamic retrieval field at all, grep returns zero.
- `GoogleCloudPlatform/generative-ai` (batch one): no threshold in any of 8 grounding notebooks.
- `google/adk-docs`: appears only in an auto-generated schema dump, never in written docs.

Five independent sources, one declared-dead field. Treat the threshold as a legacy 1.5-era feature
that no longer exists in practice. **Search is on or off, and the only lever we have is deciding
ourselves when to call.**

Related: the two surface names are not a version switch you must handle.
`genkit-ai/genkit` folds `googleSearchRetrieval` config unconditionally into a `googleSearch` tool
key on every path (`vertexai/gemini.ts:695-698`, `googleai/gemini.ts:769-780`,
`py/.../gemini.py:1862-1865`), with a comment at `gemini.py:333-341` pushing the compatibility
judgment onto the caller. `spring-ai` models only one type
(`GoogleGenAiChatOptions.java:189,356` mapping to a single `GoogleSearch`). The older name is
legacy.

## The defect this batch surfaced in our own code, unasked

`identify/eval/results/2026-09-17.json` is a live run at the pro tier: **6 rows, 6 unreadable,
zero identified**, p95 11,946 ms. Every one carries `failure: "model_rate_limited"`.

We are recording a rate limit as **"unreadable"**, which is a statement about the photograph. A
transport failure and a bad picture are being written into the same outcome field, so the eval
cannot distinguish "we never got an answer" from "the model could not read it", and neither can
anyone reading the scan log. That directly feeds the founder's third complaint: sometimes it does
not prompt Gemini successfully at all, and it reports that as the picture's fault.

There is no retry on the live path. `jina-ai/node-DeepResearch` (batch one) retries with backoff
and, more usefully, distinguishes a failed call from a rejected answer.

## What to do, revised across both batches

1. **Strike the blocking question in `NOW.md`.** Settled by 199 live accepted responses in our own
   results file, not by any repo.
2. **Separate a failed call from a bad photo**, and retry the failed call. One field, immediate,
   and it is currently corrupting the eval that everything else is measured by.
3. **Add the reject-and-search-again pass** (batch one, `node-DeepResearch`
   `src/tools/evaluator.ts:622-671`). Still the single change that attacks all three complaints.
4. **Read `groundingSupports`** before showing a price confidently. Across all nineteen repos read,
   nobody does this, including us.
5. **Make the model transcribe the front-of-pack text before it names anything**, which the
   2026-09-09 research pass already recommended and which costs nothing but prompt order. Pure
   Gemini, no retrieval, and it attacks brand hallucination directly.
6. **Key a cache on the image bytes**, so one photograph cannot yield two answers.
7. **Keep the 3.x-only schema gate.** Do not act on three frameworks' silence.

Everything above is a single-call Gemini change. Nothing here needs the catalogue, which is out of
the path by his ruling.

## The live test, now one

Photo, search tool, and a response schema together, on a 2.5 model, with the same request on 3.x
as the control. That settles the last open belief about the request shape. The function-tool test
was struck with the catalogue.
