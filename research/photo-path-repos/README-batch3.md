# Batch three: nine agent frameworks, and what twenty-nine repos together do not have

Read 2026-09-19. Nine repos, one reader each, on `QUESTIONS.md` plus the four questions and three
labels in `QUESTIONS-batch3.md`. `danny-avila/LibreChat` was already read in batch two and was not
paid for twice.

Address corrections, verified: `ItzCrazy-dev/Perplexica` does not exist. The project was renamed
and is `ItzCrazyKns/Vane`. `Jana2207/AI_Google_Search_Agent` is a thirteen-cell tutorial notebook
with no mechanism of its own, using DuckDuckGo rather than Google, and a plaintext API key
committed in its first cell. `Significant-Gravitas/AutoGPT` is no longer the autonomous loop it is
famous for: that code is frozen under `classic/` and declared unsupported, and the live product is
a visual block builder. `microsoft/autogen`'s agents do **not** fact check each other; no critic or
reviewer agent ships in any installable package, grepped across all of them, and the pattern exists
only as a notebook sample the user wires up by hand.

Every repo in this batch runs its own search API and scraper, which Shin does not and will not. So
each finding was labelled for whether it fits one grounded Gemini call, needs a search stack we do
not have, or costs no model call at all. Only the first and third kinds appear below.

## The finding that runs through all three batches

**Across twenty-nine repositories, exactly one piece of code checks an answer against its sources
sentence by sentence.** Everything else, including the dedicated research agent, the self-hosted
answer engine, and every evaluator in the largest retrieval framework, asks the model to cite
itself and then renders whatever it claims.

The exception is `openai/openai-cookbook`
`examples/Developing_hallucination_guardrails.ipynb:837-865`: a second model call scores **each
sentence** of the answer against the source text on four binary criteria and passes only when all
four come back true, sampled ten times. That is the shape of the check that can tell a price read
off a page from a price invented, and it is the single most valuable thing found in the entire
scan.

Corroborating that the field does not do this:
`run-llama/llama_index`'s four evaluators all hand the whole response to the judge as one blob and
never walk answer sentences, confirmed absent in `evaluation/` rather than merely unfound.
`assafelovic/gpt-researcher` attaches citations purely by prompt instruction
(`prompts.py:309-310`). `ItzCrazyKns/Vane` reformats model-claimed citations by array index.
`openai/openai-cookbook`'s own Deep Research example receives real citation spans with start and
end indexes and only displays them.

We are in the same position: grounding metadata stored and shown, never used to verify.

## Defect 3, it does not ask Gemini the same way twice: this is now solved by three independent
implementations

Shin repairs malformed output with a text ladder and never re-asks. Three frameworks converged on
the same better answer, which makes it a settled pattern rather than one repo's opinion:

- `langchain-ai/langchain` `output_parsers/fix.py:70-106` and `output_parsers/retry.py:180-187`:
  catch the parse exception, then re-send a prompt containing the format instructions, the bad
  completion **and the exception text**, capped at one retry. `FITS`.
- `crewAIInc/crewAI` `task.py:279-281`: `guardrail_max_retries` defaults to **3**, and each retry
  rewrites the prompt with the previous output plus the judge's feedback rather than repeating it
  (`translations/en.json:55`). `FITS`.
- `Significant-Gravitas/AutoGPT` `blocks/llm.py:436-806`: three retries on a schema failure,
  appending the bad response and the specific error to the prompt each time, and deliberately
  **not** retrying on timeouts or 4xx, which is the right distinction. `FITS`.

The common shape: the error text goes back into the prompt. All three, one retry to three, and one
of them explicitly separates a malformed answer from a failed call.

## Defect 1, it names the wrong product: the judging pass has ready-made prompts

Batch one found the mechanism in `jina-ai/node-DeepResearch`. This batch found the prompts.

- `run-llama/llama_index`: four separate second-call judges, faithfulness, relevancy, correctness
  and guideline, each a single call over the first answer, with their prompts quoted in
  `llama-index.md`. Retries use three attempts with exponential backoff and an unchanged prompt.
  `FITS`.
- `crewAIInc/crewAI` `tasks/llm_guardrail.py:49-96`: a second call that judges the first against a
  stated rule and returns a structured `{valid, feedback}`. That return shape is what makes the
  retry above able to improve rather than repeat. `FITS`.
- `langchain-ai/langchain` `evaluation/qa/eval_prompt.py:20-35`: a grading prompt that checks an
  answer against its context rather than its fluency. `FITS`.
- `openai/openai-cookbook` `examples/receipt_inspection.ipynb:590-599`: a second call re-sends the
  first call's structured output for a business-rule judgment. This is the closest analogue in the
  whole scan to judging an extracted product and price, because the subject is a photographed
  receipt. `FITS`.

## Defect 2, the price is wrong: the field has nothing, which is itself the answer

**Not one of the twenty-nine repositories extracts a price, a currency or a date from unstructured
text and validates it.** Searched for explicitly in all nine of this batch and reported absent in
every one. The only structured number handling found anywhere was a stock quote API in `Vane`.

So there is nothing to copy, and the price problem has to be solved with the two general
mechanisms above: the sentence-level support check, and a second call that judges the number
against what the sources actually say.

## What nobody does, which changes what batch one recommended

**Query reformulation after a weak result does not exist in this batch.** Searched in all nine.
`gpt-researcher` retries with the identical prompt (`llm.py:116-141`). `AutoGPT` has none.
`langchain` has none outside the self-ask prompt, where the model writes its own follow-up
(`self_ask_with_search/prompt.py:3-40`). `Vane` has no coded trigger.

That makes `jina-ai/node-DeepResearch` from batch one the only real implementation found in
twenty-nine repos, and it raises the confidence that its evaluator-driven re-search is the right
thing to copy, not the average thing.

## A mechanism found repeatedly that we must NOT copy

Two repos abstain when they have nothing: `gpt-researcher` returns "could not gather source
material" on empty context (`writer.py:82-88`), and `Vane` has a hardcoded line telling the user
nothing relevant was found and offering to rephrase (`writer.ts:35`).

**This contradicts a standing rule of his**, that the worst thing the app can do is tell someone it
does not know, and that a labelled estimate is always better than no answer. Flagged here rather
than recommended. The transferable half is the *labelling*, not the abstention: say the number is
an estimate, never refuse to give one.

## Free mechanisms, no model call

- `Significant-Gravitas/AutoGPT` `util/tool_call_loop.py:157-284`: when the loop hits its cap it
  forces a final answer **and marks the result `finished_naturally=False`**. A degraded answer that
  says it is degraded. We currently do the opposite: a rate-limited call is written down as
  "unreadable", which blames the photograph.
- `run-llama/llama_index` `multistep_query_engine.py:17-23`: the loop's stop condition is a plain
  local substring test plus a hard cap of three steps. No judge call needed to stop.
- `crewAIInc/crewAI` `agents/agent_builder/base_agent.py:286-288`: `max_iter=25`, and on exhaustion
  it forces one final answer rather than failing, though without a degraded flag.
- `ItzCrazyKns/Vane` `src/lib/prompts/search/classifier.ts:40-47`: one call normalises the question
  into a standalone, context-free form before anything else happens.

## Cross-vendor corroboration on the schema question

`openai/openai-cookbook` shows the same tension we found on Gemini: strict structured output works
on both response format and function tools, but **no notebook combines a final strict schema with
the hosted web search tool in one call**, and the closest attempt drops the schema and falls back
to prompt-shaped JSON once a tool loop is involved. Two vendors, same pattern. **Keep the
version gate.** That is now three independent lines of evidence.

## The revised list, all three batches, nothing needing a catalogue or a search stack

1. **Separate a failed call from a bad photograph, retry the call, and mark a degraded answer as
   degraded.** Three implementations to copy from, and it is currently corrupting the eval.
2. **Re-ask on a malformed reply with the error text in the prompt**, instead of repairing the
   string. Three independent implementations agree on the shape.
3. **Add the second call that judges the first answer** and can force one more grounded attempt.
   Prompts exist, ready, in two frameworks and a cookbook.
4. **Check the answer sentence by sentence against the grounding spans** before showing a price
   confidently. One implementation exists in the world and it is a notebook, so this is the one
   thing here that is genuinely novel work rather than copying.
5. **Make it transcribe the front-of-pack text before naming anything.**
6. **Key a cache on the image bytes.**
7. **Keep the 3.x-only schema gate.** Three lines of evidence now.

And one live test: photo, search and a strict output shape together on 2.5, with 3.x as control.
