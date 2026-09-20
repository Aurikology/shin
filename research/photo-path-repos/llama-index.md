# run-llama/llama_index

One line: `llama-index-core` is a Python RAG framework; its four response evaluators
(`llama_index/core/evaluation/`) and its query-transform classes
(`llama_index/core/indices/query/query_transform/`) are plain string-in/string-out LLM calls
against `Settings.llm` or a passed-in `LLM`, independent of any vector store. Everything else
in the 9,795-file tree (300+ integration packages, index/retriever/vector-store plumbing) was
left alone per the task's own scope cut.

Read depth: opened `llama-index-core/llama_index/core/evaluation/{base,faithfulness,relevancy,
answer_relevancy,correctness,guideline,batch_runner}.py`,
`llama-index-core/llama_index/core/indices/query/query_transform/{base,prompts}.py`,
`llama-index-core/llama_index/core/query_engine/multistep_query_engine.py`,
`llama-index-core/llama_index/core/output_parsers/pydantic.py`,
`llama-index-core/llama_index/core/prompts/default_prompts.py` (HyDE template only).
Did not open: `context_relevancy.py`, `multi_modal/*`, `pairwise.py`, `retry_query_engine.py`,
`retrievers/fusion_retriever.py` (query-fusion also rewrites queries via an LLM but lives under
retrieval plumbing, explicitly out of scope), any vector-store or index-storage integration
package, and the wider `llama-index-integrations/` tree (not fetched at all).

## QA. query became query, what happens after a bad one

- **FITS** `HyDEQueryTransform._run`, `llama-index-core/llama_index/core/indices/query/
  query_transform/base.py:139-150`. One unconditional LLM call turns the user query into a
  hypothetical answer passage, used as the new embedding string. Prompt (`HYDE_TMPL`,
  `llama-index-core/llama_index/core/prompts/default_prompts.py:410-419`):
  `"Please write a passage to answer the question\nTry to include as many key details as
  possible.\n\n\n{context_str}\n\n\nPassage:\"\"\"\n"` (here `context_str` is filled with the
  original query string). No condition triggers it, no check on the hypothetical passage.
- **FITS** `DecomposeQueryTransform._run`, same file `:189-210`. One LLM call rewrites the
  query into a sub-question given an `index_summary` string. Prompt at
  `query_transform/prompts.py:34-59`, two few-shot examples then
  `"Question: {query_str}\nKnowledge source context: {context_str}\nNew question: "`.
- **FITS** `StepDecomposeQueryTransform._run`, same file `:297-321`, prompt at
  `query_transform/prompts.py:75-125`. Same shape as decompose but also takes
  `{prev_reasoning}` (a running log of prior sub-question/answer pairs) and is explicitly told
  to answer `"None"` once nothing more can be extracted. The class docstring says "NOTE:
  doesn't work yet" (`base.py:266`) but it is live: `MultiStepQueryEngine` imports and calls it
  every iteration (`query_engine/multistep_query_engine.py:6-7,147`).
- **FREE** the loop stop check, `default_stop_fn`,
  `query_engine/multistep_query_engine.py:17-23`: `return "none" in
  query_bundle.query_str.lower()` on the freshly-rewritten query string, checked before the
  sub-query is even run (`:150-153`). Pure local substring match, no model call.
- **NEEDS OUR OWN SEARCH**: the thing each rewritten sub-question is handed to
  (`self._query_engine.query(...)`, `:155`) is an index query engine, so the loop as a whole
  needs a retrieval layer Shin does not have. Only the rewrite/stop mechanism above is portable.
- Nothing on reformulation triggered specifically by a *weak or empty* result: the loop above
  rewrites on every step regardless of result quality, and nothing greps for "empty result" or
  similar near these files.

## QB. what is done to a result before it is believed

Not investigated: this requires retriever/reranker/vector-store code, which the task scoped
out entirely ("skip the vector store and index plumbing entirely"). No claim made either way
about llama_index's reranking, dedup or price/number extraction.

## QC. how the answer is tied to its sources, disagreement

- **FITS** `FaithfulnessEvaluator.aevaluate`, `llama-index-core/llama_index/core/evaluation/
  faithfulness.py:159-201`. Second LLM call: builds a `SummaryIndex` over the context strings
  and asks a YES/NO question per context chunk (refine pattern), i.e. it walks the **context**
  chunk by chunk, not the **answer** sentence by sentence, the whole response string is the
  one thing being judged each time. Prompt, `:16-44`:
  `"Please tell if a given piece of information is supported by the context.\nYou need to
  answer with either YES or NO.\nAnswer YES if any of the context supports the information,
  even if most of the context is unrelated. ... Information: {query_str}\nContext:
  {context_str}\nAnswer: "` (`query_str` here is bound to the full response text being
  checked, `:183`). Refine template for later chunks, `:46-58`.
- **FITS** `RelevancyEvaluator.aevaluate`, `evaluation/relevancy.py:97-141`, same
  chunk-refine-over-context pattern, prompt `:16-25`: `"Your task is to evaluate if the
  response for the query is in line with the context information provided.\n... Query and
  Response: \n {query_str}\n Context: \n {context_str}\nAnswer: "`, fed the whole
  `f"Question: {query}\nResponse: {response}"` as one string (`:114,123`).
- **FITS** `CorrectnessEvaluator.aevaluate`, `evaluation/correctness.py:120-153`, one chat
  completion, no context/sources at all, reference answer vs generated answer only. System
  prompt `:19-48` sets a 1-5 rubric (`"1 is the worst and 5 is the best"`... `"between 4 and 5"`
  for fully correct), user template `:50-59` is `query` / `reference_answer` /
  `generated_answer`. `score_threshold=4.0` gates `passing` (`:106,150`).
- **FITS** `GuidelineEvaluator.aevaluate`, `evaluation/guideline.py:89-125`, one LLM call,
  prompt `:24-31`: `"Here is the original query:\nQuery: {query}\nCritique the following
  response based on the guidelines below:\nResponse: {response}\nGuidelines:
  {guidelines}\nNow please provide constructive criticism.\n"`, default guidelines `:18-22`
  ("should fully answer the query", "avoid being vague", "use statistics or numbers when
  possible"). Output is Pydantic-parsed into `{passing: bool, feedback: str}` (`:34-38`).
- **None of the four works sentence-by-sentence on the answer.** All four hand the entire
  response string to the judge LLM as one opaque blob (`response` or the composed
  `query_str`); none of them splits it into sentences or claims first. Confirmed by absence:
  `grep -rln "sent_tokenize\|nltk\|spacy\|sentence" llama-index-core/llama_index/core/
  evaluation/*.py` returns nothing.
- **Absence, reported loudly**: no span-matching evaluator exists anywhere in
  `evaluation/`. Nothing matches an answer substring back to a specific source substring;
  `EvaluationResult` (`evaluation/base.py:12-42`) carries only `contexts: Sequence[str]`
  (the whole chunk list) and a free-text `feedback`, never a per-claim mapping or citation
  span. Faithfulness/Relevancy come closest by iterating context chunks, but the judgment
  produced per chunk is still YES/NO on the *whole* response, refined chunk-to-chunk, not a
  claim extracted from the response and checked against one chunk.
- **FREE** `PydanticOutputParser`, `output_parsers/pydantic.py:11-15,44-58`: the "schema" used
  by `GuidelineEvaluator` is a JSON schema string spliced into the prompt text
  (`PYDANTIC_FORMAT_TMPL = "Here's a JSON schema to follow:\n{schema}\n\nOutput a valid JSON
  object but do not repeat the schema.\n"`), not an API-level structured-output/tool-schema
  call, worth knowing before assuming any of these four evaluators use real function calling.

## QD. when it stops, what it costs

- **FREE** `MultiStepQueryEngine._query_multistep`,
  `query_engine/multistep_query_engine.py:126-153`: hard cap `num_steps=3` by default
  (`:52`), `early_stopping=True` by default, exits either on step count or on
  `default_stop_fn` seeing `"none"` in the rewritten query (see QA). No token/time budget,
  no "degraded answer" marker on early exit, the caller just gets however many sub-Q/A
  pairs were accumulated (`:136,166-168`).
- **FREE** `CorrectnessEvaluator` pass/fail cutoff, `evaluation/correctness.py:106,150`:
  `score_threshold=4.0`, a single number, no retry if the score is low.
- **FITS/FREE** batch retry, `evaluation/batch_runner.py:11-15`: every per-item evaluator
  call (`eval_response_worker`, `:16-31`) is wrapped in `tenacity`
  `@retry(reraise=True, stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1,
  min=4, max=10))`. This retries the identical call on exception (rate limit, parse failure)
  with 4-10s exponential backoff, up to 3 attempts; it does not alter the prompt between
  attempts. No per-question cost accounting found anywhere in `evaluation/`.

## Nothing here on

- Reformulation triggered specifically by a weak/empty search result (QA).
- Any relevance scoring, reranking, dedup, or numeric/price/currency extraction with
  validation (QB), not investigated, out of scope for this task's narrowed ask.
- Any evaluator or transform that operates on the answer sentence-by-sentence rather than as
  one string (QC, checked directly, confirmed absent).
- Any code that matches an answer span to a specific source span (QC, checked directly,
  confirmed absent).
- Real API-level structured output/function-calling schema on any of the four evaluators
  (`GuidelineEvaluator`'s is prompt-text JSON, not API schema; the other three return free
  text parsed by regex/substring).

## Dead or unwired

- Nothing found dead. `StepDecomposeQueryTransform` carries a stale "doesn't work yet"
  docstring (`indices/query/query_transform/base.py:266`) but is actively imported and called
  by `MultiStepQueryEngine` every loop iteration
  (`query_engine/multistep_query_engine.py:6-7,147`), the comment is outdated, not the code.
