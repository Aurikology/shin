# Accuracy levers: what makes the first answer right

> **Correction, 2026-09-19, same day.** Mechanism 2 below, rendering catalogue candidates
> and having the model pick one by index, is STRUCK. It needs the product catalogue, which his
> ruling has taken out of the path: the server only calls Gemini. The ranked replacement for this
> whole file is , which is built from the 200-row live run rather than from repos.


Re-mined 2026-09-19. The earlier notes in this directory were read for verification: mechanisms
that catch a wrong answer after the model has already produced one. The founder rejected that
frame outright: "You keep trying to put things in place that find out if the answer is wrong. To
me, thats not important at all and to the user, that provides them no value. We need to figure out
how to GET more accurate answers." This file re-reads all 35 files in this directory for the
opposite thing: mechanisms that shape the request, the prompt, the decoding, or the search query so
the model's FIRST answer is more likely to be right. Nothing here judges, scores, grades, verifies,
retries because a check failed, or detects hallucination. Where a note file was dominated by that
rejected machinery, this file says so and moves on.

Every citation below is "repo note file, upstream file:line" exactly as the underlying note
recorded it. 28 files are single-repo notes; 7 are meta files (three READMEs, three QUESTIONS
briefs, and `_ours.md`, which is Shin's own shipping code, not one of the 29 external repos).

Twenty of the 28 repo notes have at least one qualifying mechanism. Nine have none at all, and are
listed in their own section below with what they contain instead.

## Repos with first-answer accuracy mechanisms

### autogen.md
**Forced fact-classification pass before any search or answer.** Before doing any work, the
orchestrator sorts every claim relevant to the task into four labeled buckets: facts given in the
request, facts that may need to be looked up (and where), facts that may need to be derived, and
facts that are only recalled or guessed. This happens before any answer is generated, not as a
check on one already produced.
Citation: `ORCHESTRATOR_TASK_LEDGER_FACTS_PROMPT`,
`autogen_agentchat/src/autogen_agentchat/teams/_group_chat/_magentic_one/_prompts.py:6-19`.
Quote: "facts or figures that are GIVEN in the request", "facts that may need to be looked up, and
WHERE SPECIFICALLY they might be found", "facts that may need to be derived", "facts that are
recalled from memory, hunches, well-reasoned guesses."
Why: separating what is directly visible on the package from what has to be looked up (current
price) from what would otherwise be a guess, before committing to an answer, should stop a guess
from being stated with the same confidence as an observed fact.

### autogpt.md (weak, caveated)
**Static domain and time-range constraints on a search query.** A search block can be configured
with a time range and lists of domains to include or exclude, set by a human, not derived by any
in-repo logic.
Citation: `TavilySearchBlock.Input`, `blocks/tavily/search.py:52-64` (`time_range`,
`include_domains`, `exclude_domains`).
Why: restricting a price search to recent results and recognized retailer domains makes a returned
price more likely to be current and legitimate. Caveat: this is a parameter on a separate, self-run
search API (Tavily), not a control on Gemini's built-in `google_search` grounding tool that Shin
actually uses; only directly applicable if the pipeline ever runs its own search step.

### gemini-gemma-examples.md
**Split free-text research from structured-field extraction into two passes**, so fields are
extracted from prose that already exists rather than being produced in the same pass as open-ended
search and reasoning.
Citation: `notebooks/Automating_market_research_with_Gemini.ipynb:26-33` (model built with a
`google_search_retrieval` tool), `:153` (first call, free-text prompt, no schema), `:257` area
(second model built with `response_schema`, no tools), `:284` (second call runs on the first call's
output text).
Why: letting the model research and reason in free text first, then extracting name/price fields
from that fuller text in a second pass, avoids forcing search, reasoning, and rigid JSON into one
constrained pass.

### gemini-grounding.md
**Splice the current date into the prompt** so grounded search is anchored to today.
Citation: `src/gemini-client.ts:54`.
Quote: `Current date: ${new Date().toISOString()...}`
Why: a price is time-sensitive; telling the model what "today" is before it searches steers it
toward current listings instead of an outdated page it may have seen before.

### gemini-image-studio-mcp.md
1. **Image and the `googleSearch` tool in the same `generateContent` call**, on the code path that
has both.
Citation: `src/gemini/client.ts:63-92` (parts built from `req.images` as inline base64, `{ text:
req.prompt }` appended), `:84-85` (`config.tools = [{ googleSearch: {} }]` when
`req.enableSearchGrounding`), `:88-92` (both sent in one call).
Why: the naming/pricing answer can be grounded in current web results about the actual product,
instead of an ungrounded visual guess alone. Caveat: this combination is only wired on
`generate_image`; the actual object-identification tool (`decompose_image`) calls
`generateTextOnly()` (`:110-140`) with no `tools` key, so identification itself never gets this
benefit in this repo, only image-generation calls do.

2. **Exact field names, types, and value format spelled out in the prompt text.**
Citation: `src/gemini/prompts.ts:1-44` (`DECOMPOSE_PROMPTS`, three variants), quote at `:13`.
Quote: `"clothing": [{"item": string, "color": string (use hex like #2C3E50)...}]`
Why: telling the model the exact field name and value format before it writes anything reduces
free-form drift; applied to a price field ("price as a number in CAD, no currency symbol") this
would push toward a consistently extractable answer on the first pass.

### gemini-search.md
**Decoding parameters set on the only model call**: `temperature: 0.9, topP: 1, topK: 1,
maxOutputTokens: 2048`.
Citation: `server/routes.ts:16-20`.
Why: `topK: 1` restricts token selection to the single highest-probability token at every step,
i.e. greedy decoding, which favors the model's single most-likely answer for a factual
naming/pricing task. Caveat: no stated design rationale in the note, and `temperature: 0.9` is
inert once `topK: 1` has already collapsed the candidate set, so this reads as an unexamined
default rather than deliberate tuning.

### gemini-with-files.md
1. **Uploaded file part and the `googleSearch` tool pushed onto the same payload**, sent in one
fetch call, with no code path blocking the combination.
Citation: `classGeminiWithFiles.js:311-329` (file parts as `fileData`), `:371-372`
(`payload.tools = toolsArray`), `:405-415` (single fetch carrying both).
Why: the photographed product and a live search tool in the same request let the answer draw on
current web information about the product, rather than the image alone or two disconnected calls.

2. **`response_schema` and the `googleSearch` tool written into the same payload**, no
mutual-exclusion check.
Citation: `classGeminiWithFiles.js:377-380` (schema block), `:367-372` (tools block).
Why: a schema-enforced JSON answer (distinct name/price fields) inside the same grounded call means
the structured output is itself the search-grounded answer, not a second, separate formatting pass.
Caveat: this shows the client library imposes no restriction, not that the live API honors both
together.

### google-cookbook.md
1. **Explicit key ordering required in a structured-output schema (Gemini 2.0)**, `property_ordering`
forces fields to be emitted in a fixed sequence.
Citation: `examples/Pdf_structured_outputs_on_invoices_and_forms.ipynb`, cells 23-24.
Quote: "Gemini 2.0 models require explicit ordering of keys in structured output schemas... not
Gemini 2.5 or newer", `property_ordering=["invoice_number", "date", "vendor", "total_amount"]`.
Why: fixing the emission order (name before price) makes the model commit to each field in a
predictable slot instead of skipping or burying one.

2. **API-level schema object preferred over a prompt-described schema.**
Citation: `quickstarts/JSON_mode.ipynb`, cell 10 (prompt-described) vs cell 21/25 (schema object).
Quote: "The Pydantic approach... is the recommended method."
Why: constraining the decoder with a real schema is less likely to drop or reword a field than
hoping the model remembers a shape only described in prose.

### googlecloud-generative-ai.md
1. **API-level required/conditional fields on structured output**, enforced by the API itself, not
a validator run afterward.
Citation: `gemini/controlled-generation/intro_controlled_generation.ipynb:319-320` (Pydantic
schema), `:378-405` (OpenAPI-subset schema), `:cell-23`/`:cell-38` (conditional-required example).
Quote: `"if": {"properties": {"status": {"const": "SHIPPED"}}}, "then": {"required":
["tracking_number"]}`.
Why: forcing a field to be present under a stated condition, instead of letting the model silently
skip it, is the same mechanism that would force a price field to actually appear.

2. **Image plus `response_schema` confirmed on one call**, Gemini 2.5 Flash, no grounding tool
present.
Citation: `intro_controlled_generation.ipynb:cell-34`.
Why: this is the concrete plumbing for photograph in, structured name/price fields out, in one
request.

3. **Negative instruction: return null instead of guessing.**
Citation: `gemini/use-cases/retail/product_attributes_extraction.ipynb:cell-16`.
Quote: "your answer should be strictly consistent with what's in the image... return null for that
attribute."
Why: removing the incentive to fabricate a plausible name or price when the photo does not clearly
show it is a first-pass mechanism, not a post-hoc check.

### gpt-researcher.md
**LLM-generated multi-query reformulation, merged without judgment.** One call writes several
independent plain-language search phrasings of the task, dispatched concurrently, results simply
joined, with no LLM judging or ranking between them.
Citation: `gpt_researcher/actions/query_processing.py:83-156`, prompt at
`gpt_researcher/prompts.py:248-259`.
Quote: "Write {max_iterations} search queries to research the following task: \"{task}\". Each
query must be a plain natural language phrase. Do not use search operator syntax such as site:,
filetype:, inurl:, intitle:, OR, AND, or NOT: these operators are not universally supported and
will return empty results on many search backends. Assume the current date is
{datetime.now(...)} if required. {context_prompt}. You must respond with a list of strings in the
following format: [{dynamic_example}]. The response should contain ONLY the list."
Why: several independently-worded queries raise the odds that at least one phrasing matches how a
product or price is actually indexed on the web. This is plain ensembling of queries, not a judged
retry.

### langchain.md
1. **ReAct Thought before Action before Final Answer ordering.**
Citation: `libs/langchain/langchain_classic/agents/mrkl/prompt.py:1-15` (duplicated at
`agents/react/agent.py:103-121`).
Quote: "Thought: you should always think about what to do / Action: the action to take... /
Observation: the result of the action... / Thought: I now know the final answer / Final Answer:
the final answer to the original input question."
Why: making the model articulate reasoning about what it is looking at before it names or prices
the product is chain-of-thought placement that makes it look before it decides.

2. **Self-ask decomposition before finalizing.** A few-shot prompt has the model decide whether a
follow-up query is needed and draft it, one step at a time, before a final answer.
Citation: `libs/langchain/langchain_classic/agents/self_ask_with_search/prompt.py:3-40` (no
verbatim quote given in the note).
Why: forcing the model to decide it needs one more specific fact, such as today's price, and go get
it, instead of asserting a number outright, is a look-before-you-decide mechanism on the first
pass.

3. **Stop-sequence guard against fabricated observations.** Generation is bound with a stop
sequence so the model cannot continue past "Observation" and write its own fake tool output.
Citation: `libs/langchain/langchain_classic/agents/react/agent.py:137-141`.
Quote: "If True, adds a stop token of 'Observation:' to avoid hallucinates."
Why: a decoding-time setting that stops the model from inventing a plausible-looking search result,
such as a fabricated price, inside its own first generation.

### llama-index.md
1. **Rewrite the raw query into a hypothetical answer passage (HyDE)**, and search with that
passage instead of the raw query.
Citation: `HyDEQueryTransform._run`,
`llama-index-core/llama_index/core/indices/query/query_transform/base.py:139-150`, prompt
`HYDE_TMPL` at `llama-index-core/llama_index/core/prompts/default_prompts.py:410-419`.
Quote: "Please write a passage to answer the question. Try to include as many key details as
possible. {context_str}. Passage:"
Why: a detail-rich hypothetical passage matches closer to an actual product record than a short raw
query (such as a blurry brand name), so the record retrieved to ground the answer is more likely
correct before any answer is generated.

2. **Decompose a complex question into one sub-question at a time**, each handed a running log of
prior sub-question/answer pairs.
Citation: `DecomposeQueryTransform._run` and `StepDecomposeQueryTransform._run`,
`query_transform/base.py:189-210` and `:297-321`, prompts at `query_transform/prompts.py:34-59` and
`:75-125`.
Quote (Decompose): "Question: {query_str}. Knowledge source context: {context_str}. New question:"
Why: resolving one narrow fact at a time (brand, then variant or size, then price) before combining
them reduces the chance of jumping straight to a guessed final answer.

### node-deepresearch.md
1. **Real API-level Zod schema with required, closed-set enum fields** for anything with a fixed
set of valid values.
Citation: `src/utils/schemas.ts:191-203` (`tbs: z.enum([...])`, `q: z.string().max(50)`),
`getAgentSchema` at `:268-335`, wired via `generateObject` at `src/utils/safe-generator.ts:27,155-158`.
Why: constraining a field like unit of measure or currency to an enum forecloses the model
inventing an out-of-set value on its first pass.

2. **Few-shot worked examples embedded inline inside an `<examples>` block** in the prompt.
Citation: `getLanguagePrompt`, `src/utils/schemas.ts:23-59` (six worked Q/A examples), referenced
from `src/agent.ts:110`.
Why: worked input/output pairs give the model a concrete pattern to match (photo of X label yields
name Y, price Z) rather than relying on instructions alone, which typically tightens first-pass
extraction.

### open-webui-functions.md
1. **Image part and the live web-search grounding tool on the same generation call.**
Citation: `pipelines/google/google_gemini.py:3474-3479` (one `generate_content` call), image parts
built in `_prepare_content`/`_process_multimodal_content` (`:1608-1738`), search tool appended in
`_configure_generation` (`:2602-2612`).
Why: the model can look at the product photo and pull current web results, current price, correct
product name or variant, within the single reasoning pass that produces the answer, instead of
naming or pricing from memory alone.

2. **Image resized and recompressed before it is sent**, rather than sent as the original raw
upload.
Citation: `_optimize_image_for_api`, `google_gemini.py:1826` (called at `:1698`), recompresses to
JPEG/PNG under a size threshold.
Why: normalizing to a supported, size-bounded format avoids the request being rejected or the image
being mishandled, which matters for a legible read of a small price or label sticker.

3. **`ThinkingConfig` with a validated or dynamic (model-chosen) thinking budget** on the same
generation config as the image and search tool.
Citation: `google_gemini.py:2560-2576` (exact trigger condition not fully confirmed by the note).
Why: more reasoning budget on a call that has to read a label, cross-reference a search result, and
settle on a name and price gives the model more room to work through those steps before committing.

### openadapt-ml.md
1. **State the image's exact pixel dimensions in the prompt text**, and instruct the model to use
that stated resolution when reasoning about anything spatial.
Citation: `openadapt_ml/grounding/detector.py:216` and `:224`.
Quote: "The image is {image.width} pixels wide and {image.height} pixels tall." and "IMPORTANT: Use
exact pixel coordinates based on the image dimensions provided above."
Why: naming or pricing a grocery item often depends on reading small print (a price sticker, a
size/weight label); telling the model the image's actual resolution helps it calibrate how much
detail it should be able to resolve.

2. **Present a numbered, labeled candidate list alongside the image and answer with an index/id**,
rather than generating a free-text answer from scratch.
Citation: `openadapt_ml/baselines/prompts.py:648-670` (per-candidate render template) and
`:182-241` (system prompt requiring an integer `element_id`), resolved in
`openadapt_ml/baselines/parser.py:82-93,496-499`.
Quote: `[{node_id}] {role}: "{name}" @ ({cx:.2f}, {cy:.2f})`
Why: picking an index out of a finite, known-valid candidate list, for example a shortlist of
plausible SKUs or prices for the shelf tag in view, is a much easier and more constrained task than
open-ended naming, which cuts down on invented product names.

3. **Temperature pinned low (0.1) on every inference-time provider call**, contrasted against a
higher temperature (0.7) reserved only for RL-training rollout diversity.
Citation: `openadapt_ml/models/providers/{anthropic.py:128, openai.py:128, google.py:135}`,
`openadapt_ml/grounding/detector.py:240,365`; contrast `openadapt_ml/training/grpo/config.py:67`.
Why: a low, near-deterministic temperature favors the model's highest-probability read of a label
or price rather than a more exploratory guess, which is what one correct first answer needs.

4. **One worked demonstration example spliced into the prompt when available.**
Citation: `openadapt_ml/baselines/prompts.py:465-477`.
Quote: "Here is an example of successfully completing a similar task:"
Why: a single concrete worked example anchors the expected answer shape and reasoning pattern for a
similar case before the model produces its own first answer.

### openai-cookbook.md
1. **Generate roughly 20 keyword/phrasing variants of the question before searching**, plus the
original, and fire all of them.
Citation: `examples/Question_answering_using_a_search_API.ipynb:159-176`.
Why: a photographed product's visible name rarely matches a retailer listing's exact wording, so
searching with many phrasings raises the odds at least one surfaces the correct listing and price.

2. **Deduplicate search results by URL before any are handed to the model.**
Citation: `articles = list({article["url"]: article for article in articles}.values())`,
`examples/Question_answering_using_a_search_API.ipynb:275`.
Why: removing redundant duplicate sources concentrates the model's limited context on distinct
evidence rather than repeated copies of the same, possibly wrong, listing.

3. **Generate a hypothetical ideal answer, embed it, and rank candidate source articles by
similarity to it before any article text reaches the answer-generating call.**
Citation: `examples/Question_answering_using_a_search_API.ipynb:290-448`.
Why: filtering to the best-matching evidence before generation means the model's single answer pass
is built on the most relevant sources rather than diluted by tangential hits. Needs fetched article
text and an embeddings call per candidate, so it is not a single-call technique.

4. **Native structured-output enforcement (`strict: true` against a JSON Schema)**, rather than
asking for JSON in prose.
Citation: `examples/Structured_Outputs_Intro.ipynb:14-24`.
Quote (vendor documentation quoted in the notebook): "guarantee the model will always generate
responses that adhere to your supplied JSON Schema."
Why: guaranteeing a price field is actually numeric and a currency field is one of the allowed
codes on the first generation prevents a whole class of malformed first answers.

### pi-google-search.md (thin)
**The Google Search grounding tool attached unconditionally on every call**, no dynamic-retrieval
gating, the model is never left to decide on its own whether to search.
Citation: `src/index.ts:108` (OAuth/REST path) and `:287` (API-key/SDK path).
Why: for a task where the correct answer, a current price, genuinely requires up-to-date external
information, forcing grounding on every call removes the failure mode where the model answers
confidently from stale memory instead of checking. This is the only thing in an otherwise
verification-heavy file that shapes what feeds the first answer.

### vane.md
1. **A dedicated normalization call rewrites the user's raw follow-up into a self-contained,
context-independent question before any search happens.**
Citation: `src/lib/prompts/search/classifier.ts:40-47`, called from
`src/lib/agents/search/classifier.ts:38-50`.
Quote: "For the standalone follow up, you have to generate a self contained, context independant
reformulation of the user's query. You basically have to rephrase the user's query in a way that it
can be understood without any prior context from the conversation history."
Why: a clean, context-free restatement of "what is this" before a grounded call reduces ambiguity
in what gets searched, raising the odds the search and the final naming are about the actual
product.

2. **Query-writing instruction requires terse SEO-style keyword phrases, not full sentences.**
Citation: `src/lib/agents/search/researcher/actions/search/webSearch.ts:17-24` (speed mode), repeated
for balanced/quality modes at `:26-57`, enforced at `:87-90`.
Quote: "Your queries shouldn't be sentences but rather keywords that are SEO friendly and can be
used to search the web for information."
Why: keyword-style queries match how search indexes actually retrieve results, more likely to
surface the exact product page or price listing than a full sentence.

3. **A few-shot worked example in the balanced-mode system prompt shows a broad query first, then
a narrower one on the next turn.**
Citation: `src/lib/agents/search/researcher/actions/search/webSearch.ts:34-43` (no verbatim text
given in the note).
Why: demonstrating a broad-then-narrow search pattern biases the model toward casting a wide net
first, useful when a brand or product name is unclear from the photo, and narrowing once a
candidate name appears.

4. **Explicit negative instruction for the no-information case**, forcing the model to say it found
nothing rather than invent an answer when context is empty.
Citation: `src/lib/prompts/search/writer.ts:35`.
Quote: "If no relevant information is found, say: 'Hmm, sorry I could not find any relevant
information on this topic. Would you like me to search again or ask something else?' Be transparent
about limitations and suggest alternatives or ways to reframe the query."
Why: pre-empting fabrication when grounding is empty makes the first answer less likely to be an
invented brand or price. This is a generation-shaping instruction baked into the prompt, not a
post-hoc check.

### vercel-ai-google.md
1. **A `mediaResolution` request field** (`MEDIA_RESOLUTION_UNSPECIFIED|LOW|MEDIUM|HIGH`) controlling
the resolution at which Gemini processes an attached image, sent only if the caller sets it.
Citation: `google-language-model.ts:414-416`; enum at `google-language-model-options.ts:148-153`.
Why: explicitly requesting HIGH media resolution for a product photo, instead of sending no hint,
gives the model more visual detail to read small front-of-pack text and price tags off.

2. **A `thinkingConfig`/`thinkingBudget` (and `thinkingLevel`) field** setting how much reasoning
budget Gemini spends before answering.
Citation: `google-language-model.ts:340-343`; schema at `google-language-model-options.ts:66-69`.
Why: raising the reasoning budget on a call that has to read visible text, identify a brand or
product, and price it gives the model more room to work through those steps. The note does not
state a recommended value or a stated reason for any particular setting.

## Repos with nothing

Nine repo notes contain no first-answer accuracy mechanism at all. Each is full of
verification/scoring/judging/retry-after-check machinery, or plain capability/compatibility
documentation with no prompt, decoding, or search-shaping content:

- **adk-docs.md**: version-compatibility documentation (which models support combining
`output_schema` with `tools`) and a "one tool per agent" restriction. No image-plus-search example,
no resolution guidance, no decoding settings, no few-shot pattern, no ensembling.
- **ai-google-search-agent.md**: an unmodified LangChain Hub ReAct tutorial notebook with
`DuckDuckGoSearchRun` and no parameters set. No image or vision handling anywhere.
- **clicky.md**: a single Claude image call with no search or grounding, plus documentation of what
retry/confidence machinery is absent. Its one prompt-shape instruction governs UI pointing
coordinates, not naming or pricing.
- **crewai.md**: entirely a `HallucinationGuardrail`, an `LLMGuardrail` that grades one agent's
output with a second agent, a retry loop that re-injects "Previous attempt failed validation," and
an iteration cap. Search-query construction has no template or shaping layer at all.
- **genkit.md**: combination-capability findings only (can an image part, a schema, and the search
tool coexist on one request) plus verification-absence findings. No prompt text, decoding setting,
few-shot example, or query-shaping technique.
- **harness-sdk.md**: request-plumbing capability and verification-absence (grounding metadata
never read, retries fire only on throttling, the one re-ask loop checks output shape, never
correctness). No prompt wording, decoding parameter, few-shot pattern, or query shaping.
- **librechat.md**: toggle/config-existence and version-gate findings plus verification-absence. An
image `detail` hint is documented as existing but the note cannot confirm it actually reaches
Gemini's resolution handling, so it is not reported as a confirmed mechanism.
- **semantic-kernel.md**: connector plumbing and compatibility-checking only. Confirmed by grep: no
search or grounding tool exists in this connector at all.
- **spring-ai.md**: combination-checking (can image, schema, and search tool share a request) and
confirmation that no confidence gate, retry-on-weak-answer, or dynamic-retrieval threshold exists.
Nothing that changes what goes into the request or how the model is prompted.

## Shin's own implementation and synthesis files (not among the 29 read repos)

**_ours.md** describes Shin's own shipping code, `identify/src/providers/gemini-scan.ts` and
`gemini.ts`, not a third-party repo. Four things there qualify under this frame:
1. Image and `tools: [{ type: 'google_search' }]` in the same `buildRequestBody`, POSTed once
(`gemini-scan.ts:378-404`, `:934-939`). Same mechanism as the repos above, this is the code that
implements it.
2. A real API-level JSON schema with `required` arrays and enum-constrained fields for 3.x models
(`gemini-scan.ts:399-402`, `Shin_Gemini_Pricing_Engine/response_schema.json`); on 2.5 the schema is
instead walked into a compact type description pasted into the prompt (`skeleton()`,
`gemini-scan.ts:262-277`, `OUTPUT_FORMAT` at `:327-333`).
3. A media-resolution hint (`mediaResolution()`, defaults `'medium'`, `identify/src/providers/gemini.ts:191-194`)
and a thinking-budget hint (`thinkingLevel()`, defaults `'low'`, `gemini.ts:204-207`) sent alongside
the request. Higher resolution gives more image tokens for reading small printed text; higher
thinking budget gives more room to reason before committing. Neither is reported as tuned upward or
tested, only that the knobs exist and default low/medium.
4. A domain-specific system instruction (`GEMINI_SYSTEM.md` plus `PRICING_GUIDE.md`,
`gemini-scan.ts:249-259`) and a templated user prompt filled with the scan's market, threshold, and
shelf-price context (`scan_prompt.md`, `fill()` at `gemini-scan.ts:281-283,337-362`), rather than
one generic prompt for every call.

**README.md** independently corroborates the image-plus-search-in-one-call mechanism from Shin's
own code, plus a candidate-list-by-index naming idea from openadapt-ml.md, already captured above.

**README-batch2.md and README-batch3.md** both list "make the model transcribe the front-of-pack
text before naming anything" as a recommendation. Neither cites a file:line or an external repo for
it; both attribute it to the team's own research pass, not to one of the 29 read repos. It fits the
shape of a first-answer accuracy mechanism (look before you decide) but does not meet the citation
bar used everywhere else in this document, so it is flagged here as an unsourced recommendation,
not a sourced finding. README-batch3.md separately restates the self-ask pattern already covered
under langchain.md above, with no additional citation.

**QUESTIONS.md, QUESTIONS-batch2.md, QUESTIONS-batch3.md** are the task briefs handed to each
reader, not repo findings. Their content is explicitly framed around detecting a wrong answer after
the fact: confidence gates, retries, citation checking, relevance scoring, judgment and
regeneration loops. They contain no mechanism of their own.
