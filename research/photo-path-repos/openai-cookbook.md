# openai/openai-cookbook

A Jupyter notebook collection of OpenAI API usage examples (76,076 stars, pushed 2026-09-18). Not
an app; each notebook is a standalone demo, so mechanisms are per-notebook, not a shared codebase.
No clone was made per instructions. Tree listed via `GET
/repos/openai/openai-cookbook/git/trees/main?recursive=1`, then 16 notebooks fetched individually
from `raw.githubusercontent.com/openai/openai-cookbook/main/<path>`. All line numbers are raw-file
JSON line numbers (`.ipynb` is pretty-printed JSON, one source string per line), grep-able against
the raw file or GitHub's blob view.

Read depth: full read of
`examples/Developing_hallucination_guardrails.ipynb`,
`examples/Question_answering_using_a_search_API.ipynb`,
`examples/third_party/Web_search_with_google_api_bring_your_own_browser_tool.ipynb`,
`examples/Structured_Outputs_Intro.ipynb`,
`examples/partners/eval_driven_system_design/receipt_inspection.ipynb`,
`examples/deep_research_api/introduction_to_deep_research_api.ipynb`,
`examples/o1/Using_reasoning_for_data_validation.ipynb`,
`examples/reasoning_function_calls.ipynb`.
Targeted read (structure grep + key cells only) of
`examples/Structured_outputs_multi_agent.ipynb`,
`examples/multimodal/image_evals.ipynb`,
`examples/evaluation/use-cases/web-search-evaluation.ipynb`,
`examples/evaluation/use-cases/structured-outputs-evaluation.ipynb`,
`examples/evaluation/use-cases/tools-evaluation.ipynb`,
`examples/File_Search_Responses.ipynb`.
Not opened: every `examples/vector_databases/*` notebook (~25 files: Pinecone, Qdrant, Milvus,
Weaviate, Redis, etc.), all build and query their own embedding index, ruled out by the batch's
own architecture note before reading; `examples/agents_sdk/evaluate_agents.ipynb` and
`examples/multimodal/Using_GPT4_Vision_With_Function_Calling.ipynb` (the latter is 1.4MB, mostly
embedded image output), grepped for budget/conflict/retry terms with no hits, not read in full.

## QA how the question becomes a query, and what happens after a bad one

- **FITS**, Query generation is a plain LLM call the model writes itself, then parsed as JSON:
  `queries = json_gpt(QUERIES_INPUT)["queries"]`, prompt asks for `{"queries": ["query_1", ...]}`,
  generates ~20 keyword variants plus the original question appended.
  `examples/Question_answering_using_a_search_API.ipynb:159-176`. Directly reusable as a
  query-fanout pass before a grounded Gemini call.
- **NEEDS OUR OWN SEARCH**, No reformulation-on-weak-result was found anywhere in this batch. The
  QA notebook above fires all ~20 queries against NewsAPI once and never checks result quality
  before re-querying (`examples/Question_answering_using_a_search_API.ipynb:244-276`). The BYOB
  Google notebook (`examples/third_party/Web_search_with_google_api_bring_your_own_browser_tool.ipynb:136-176`)
  is a single search pass with a `site_filter` param, no retry. This is the mechanism the batch
  instructions call "the one we most lack" and it is absent from every notebook read.
- **NEEDS OUR OWN SEARCH**, Multi-query fan-out plus result merge by URL dedup
  (`{article["url"]: article for article in articles}.values()`,
  `examples/Question_answering_using_a_search_API.ipynb:275`) requires an owned search API (NewsAPI
  here) to issue the 20 separate queries against.

## QB what is done to a result before it is believed

- **NEEDS OUR OWN SEARCH**, HyDE reranking: generate a hypothetical ideal answer, embed it and the
  candidate articles, score by cosine similarity
  (`examples/Question_answering_using_a_search_API.ipynb:290-448`). Requires fetched article text
  and an embeddings call per candidate; not portable to a single grounded call.
- **Absence, loud**: nothing in this batch extracts a price, currency, or date from a page and
  validates it against a schema field with a numeric/regex check. The one place a monetary field is
  checked is `receipt_inspection.ipynb`'s `string_check` grader, which is exact-string equality
  against ground truth, not a plausibility or format check, see QC.
- **FITS**, `Structured_Outputs_Intro.ipynb:14-24` states the vendor mechanism directly: setting
  `strict: true` on `response_format` (a defined JSON Schema) makes the API "guarantee the model
  will always generate responses that adhere to your supplied JSON Schema" — this is real API-level
  validation, not a prompt convention, so nothing needs re-parsing on the happy path.
- **FREE**, Refusal is a first-class field, not an exception to catch: "Since a refusal does not
  follow the schema you have supplied in response_format, the API has a new field `refusal`... so
  you can render the refusal distinctly... and avoid errors trying to deserialize"
  (`examples/Structured_Outputs_Intro.ipynb:398-404`). No re-ask logic follows it though, it's
  surfaced, not retried.
- **Nothing here**: no re-ask-on-parse-failure loop found. `Using_reasoning_for_data_validation.ipynb`
  parses free-text JSON (no `response_format`) and on `json.JSONDecodeError` just logs and
  re-raises: `except json.JSONDecodeError as e: print(...); raise e`
  (`examples/o1/Using_reasoning_for_data_validation.ipynb:236-240`). No retry, no reformulated
  re-ask.

## QC how the answer is tied to its sources, and what happens on disagreement

- **FITS, highest-value finding of this batch.** `receipt_inspection.ipynb` runs a second call
  over the first call's own structured JSON output to judge a business decision (not source
  grounding, but the identical second-call-judgment shape Shin would use for a hallucination/price
  check): `evaluate_receipt_for_audit(receipt_details: ReceiptDetails, ...)` serializes the first
  call's Pydantic object to JSON and re-sends it with a rubric prompt (`MATH_ERROR`,
  `AMOUNT_OVER_LIMIT`, etc.), parsed back into a second Pydantic model `AuditDecision` via
  `client.responses.parse(..., text_format=AuditDecision)`
  (`examples/partners/eval_driven_system_design/receipt_inspection.ipynb:590-599`). Note: the
  `MATH_ERROR` check (line items should sum to total) is judged by the model, not computed in code
 , no local arithmetic verification exists alongside it.
- **FITS**, `Developing_hallucination_guardrails.ipynb` is a second GPT-4o call that scores each
  assistant sentence against knowledge-base source text on four binary criteria
  (factualAccuracy, relevance, policyCompliance, contextualCoherence), `n=10` samples per case
  (`examples/Developing_hallucination_guardrails.ipynb:837-843`), then: `score_sum = sum(4 fields);
  hallucination_status = 'Pass' if score_sum == 4 else 'Fail'`
  (`examples/Developing_hallucination_guardrails.ipynb:857-865`). This is exactly "verify the
  answer is supported by the retrieved source" as a second-call judgment, copyable as a second
  Gemini call over the first call's grounded answer plus its source snippets. Output is prompt-shaped
  JSON (`"ALWAYS RETURN YOUR RESPONSE AS AN ARRAY OF JSONS"`,
  `examples/Developing_hallucination_guardrails.ipynb:622`), not an API-level schema.
- **FITS**, `examples/multimodal/image_evals.ipynb:589-604` runs an image judge via
  `client.responses.create(model=..., input=[...], text={"format": {"type": "json_schema", "name":
  ..., "schema": self.json_schema, "strict": True}})`, schema requires `pass: bool` and
  `reason: str` with `additionalProperties: false`
  (`examples/multimodal/image_evals.ipynb:562-570`). A real API-schema-level judge over an image
  plus criteria text, directly adaptable to judging whether an identified object/price matches a
  photo.
- **FITS**, Grading a web-search-grounded answer against a ground truth answer via a second model
  call, OpenAI Evals `label_model` grader type: system prompt "You are a helpful assistant that
  grades the quality of a web search... You should either say 'pass' or 'fail', if the query
  contains the answer", fed `{{item.query}}`, `{{sample.output_text}}` (the model's own
  `web_search_preview`-grounded answer), `{{item.answer}}` (ground truth), model `o3`, labels
  `["pass","fail"]` (`examples/evaluation/use-cases/web-search-evaluation.ipynb:153-227`). This is
  the second-call judgment pattern applied specifically to a grounded-search answer.
- **FITS**, citations exposed as indexed spans by the API itself on a single grounded call: the
  Deep Research API (`model="o3-deep-research"`, `tools=[{"type":"web_search_preview"},
  {"type":"code_interpreter",...}]`, `examples/deep_research_api/introduction_to_deep_research_api.ipynb:104-136`)
  returns `response.output[-1].content[0].annotations`, each with `start_index`, `end_index`,
  `title`, `url` (`examples/deep_research_api/introduction_to_deep_research_api.ipynb:199-204`,
  `376-410`). Citations are the *model claiming* a span-to-source link (API-level, not code
  matching text back to source text), the notebook's own code only prints/displays the annotation,
  never checks the cited excerpt actually supports the claim it's attached to. No code anywhere in
  this batch matches an answer span back to source text independently; every citation mechanism
  found is model-asserted.
- **Nothing here**: no conflict-between-sources handling found. Both QA notebooks
  (`Question_answering_using_a_search_API.ipynb`, the BYOB Google notebook) hand the top-k
  snippets to one answer-generation call and let the model synthesize silently; no code detects or
  flags disagreement between two sources.
- **FREE**, Deduplication of search results by URL key before any model sees them:
  `articles = list({article["url"]: article for article in articles}.values())`
  (`examples/Question_answering_using_a_search_API.ipynb:275`).

## QD when it stops, and what it costs

- **NEEDS OUR OWN SEARCH context, mechanism is FREE**, tool-call execution failure is caught
  locally and turned into a message the model sees on its next turn, not a hard stop: `try: ...
  tool_output = target_tool(**arguments) except Exception as e: tool_output = f"Error executing
  function call: {response_item.name}: {e}"` then appended as a `function_call_output`
  (`examples/reasoning_function_calls.ipynb:360-372`). This lets the model itself decide whether to
  retry, no fixed retry count or backoff schedule exists in the code; the "retry" is implicit and
  model-driven, one extra conversation turn, not a counted budget.
- **Nothing here**: no iteration cap, token/time budget, or "return best-effort and mark as
  degraded" path found in any notebook read. `receipt_inspection.ipynb`'s `n=10`-sample hallucination
  check (see QC) and the eval `pass_threshold` values (5.0, 5.5, per QB/QC) are the only fixed
  numbers in this batch; none of them are loop-exit budgets, they're grading thresholds applied
  after the fact.
- **Nothing here**: no per-question cost accounting found (token or dollar cost per answer).
  `receipt_inspection.ipynb` only discusses cost qualitatively ("spending $10+/day/engineer on
  evals is typical", `examples/partners/eval_driven_system_design/receipt_inspection.ipynb:801`),
  never computed per-call.

## Vendor note: structured output combined with tool calling (OpenAI, not Gemini)

Direct textual confirmation this is supported on OpenAI's side, at the API level, on both response
shape and tool-argument shape: "Structured Outputs can be enabled by setting the parameter `strict:
true` in an API call with either a defined response format **or** function definitions"
(`examples/Structured_Outputs_Intro.ipynb:12`). Code confirms tool-argument-level strict schemas
used together across multiple tool calls in one system: every function tool in
`Structured_outputs_multi_agent.ipynb` carries `"strict": True` inside `tools=[...]` passed straight
to `chat.completions.create` (`examples/Structured_outputs_multi_agent.ipynb:173, 195, 218, 247,
270, 294, 322, 352, 379, 406`, called with `tools=preprocess_tools` etc. at lines 579-644).

However, no notebook in this batch combines a **final-response** `response_format`/`text_format`
JSON schema with `web_search_preview` in the *same* call, the closest attempt
(`examples/multimodal/image_evals.ipynb:2460-2470`) gives a judge model `tools=[{"type":
"code_interpreter"}]` for image cropping but drops the API-level schema entirely for that call,
falling back to a prompt instruction ("produce the final STRICT JSON only. No extra text",
`examples/multimodal/image_evals.ipynb:2428` transcript), i.e. even OpenAI's own cookbook, when it
needed both a tool loop and a structured final answer in one call, chose prompt-shaped JSON over an
API schema for that specific call. Separately, reasoning models could not use `web_search_preview`
directly as of this notebook's writing: "OpenAI's web search tool is not available out of the box
with reasoning models (as of May 2025 - this may soon change) but it's not too hard to create a
custom web search function using 4o mini or another web search enabled model"
(`examples/reasoning_function_calls.ipynb:296-297`), the workaround wraps a second
`gpt-4o-mini` call with `tools=[{"type":"web_search_preview"}]` as a callable function
(`examples/reasoning_function_calls.ipynb:305-311`), i.e. two separate model calls, not one. This
is OpenAI-specific plumbing, not evidence about Gemini 2.5 vs 3.x, but it shows the same class of
constraint (a specific tool type gated off a specific model family) existing on another vendor.

## Dead or unwired

None found, every mechanism cited above is called from a cell that executes it in its notebook;
this is a demo repo, not a codebase with unused branches.
