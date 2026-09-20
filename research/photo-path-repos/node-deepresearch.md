# jina-ai/node-DeepResearch

One line: a single TypeScript agent loop (`src/agent.ts`) that alternates search/read/reflect/answer
actions against Zod-schema-constrained LLM calls (Vercel AI SDK, `@ai-sdk/google` /
`@ai-sdk/openai`) until an LLM-judge evaluator passes the answer or a token budget forces a
"beast mode" final answer; images are handled only as a CLIP-embedding dedup/citation pipeline,
never sent to a generative model.

Read depth: `src/agent.ts` (full, 1212 lines), `src/tools/evaluator.ts` (full, 677 lines),
`src/tools/error-analyzer.ts` (full), `src/utils/image-tools.ts` (full, 216 lines),
`src/utils/schemas.ts` (full, 335 lines), `src/utils/safe-generator.ts` (full),
`src/utils/action-tracker.ts`, `src/utils/token-tracker.ts`, `src/config.ts`, `src/app.ts`
(relevant sections), `src/utils/url-tools.ts` (image call site), `src/tools/build-ref.ts`
(image reference building). Not opened: `jina-ai/src/*` (billing/rate-limit server wrapper,
irrelevant to the three questions), `src/tools/jina-*.ts` reranker/dedup internals beyond their
call sites, `src/evals/batch-evals.ts` beyond one grep hit, test files.

## Q1 image plus search

- **Image never reaches a generative model.** `processImage(url, tracker)` in
  `src/utils/image-tools.ts:110-122` downloads an image, resizes it to a 256px box as base64
  (`fitImageToSquareBox`, `image-tools.ts:69`), then sends it to Jina's embeddings endpoint:
  `getEmbeddings([{ image: base64Data }], tracker, { dimensions: 512, model: 'jina-clip-v2' })`
  (`image-tools.ts:116-119`). This is an embedding call, not a chat/generative call. Matters
  because it rules out Shin's assumed architecture (image Part on a generative request) inside
  this repo's own image path entirely.
- **Call chain is embedding-and-cite only.** `processImage` is invoked while crawling page
  results at `src/utils/url-tools.ts:578`, storing `{url, embedding}` pairs. Those embeddings
  are later cosine-matched against answer text and only the **URL** is attached to the final
  answer as a citation (`src/tools/build-ref.ts:393` `filterImages`, `src/agent.ts:1129-1130`
  `dedupImagesWithEmbeddings`). No binary image data or image Part ever leaves this pipeline.
- **No search/grounding config exists anywhere in the repo to attach to anything.**
  `grep -rn "googleSearch\|grounding_config\|google_search_retrieval" src/` returns zero
  matches (verified directly, exit code 1). Web search is done via plain HTTP calls to
  Brave/Jina/Serper (`src/tools/brave-search.ts`, `src/tools/jina-search.ts`,
  `src/tools/serper-search.ts`), completely separate files from `image-tools.ts`, with no
  cross-references either direction.
- **No SDK for a Gemini vision Part is used.** `grep -rln "GoogleGenerativeAI\|generativelanguage" src/`
  finds nothing; the model client is Vercel AI SDK (`src/config.ts:3-4`,
  `@ai-sdk/google`/`@ai-sdk/openai`), and every message built for a model in `agent.ts` is a
  plain string (`agent.ts:63` `messages.push({ role: 'user', content: k.question.trim() })`),
  never an array of Parts.
- **Answer:** image and live web search are never on the same request, because an image is
  never on any generative-model request at all in this codebase. What the image path passes
  downstream is a 512-dim CLIP embedding plus the original URL, used purely for relevance
  matching and citation, decided by cosine-similarity threshold (`build-ref.ts`
  `minRelScore = 0.7`), not by any model call.

## Q2 stopping being wrong

- **LLM-judge evaluator, separate call, not just displayed.** `src/tools/evaluator.ts`: a
  dedicated model role `evaluator` (temperature 0.6, maxTokens 1000, `config.json:39-42`)
  first decides which dimensions apply to the question, `definitive`/`freshness`/`plurality`/
  `completeness` (`evaluateQuestion`, `evaluator.ts:560-583`), then `evaluateAnswer`
  (`evaluator.ts:622`) runs each selected dimension's own prompt **sequentially and fails
  fast**: first failing dimension returns immediately (`evaluator.ts:668-671`). Matters for a
  price/object answer because it means the system already has the shape (a typed pass/fail per
  quality dimension) that a "is this price plausible" or "is this the right object" gate would
  slot into.
- **A `strict` rejection dimension is force-appended for the main question**, budgeted like the
  others: `evaluationMetrics[currentQuestion].push({ type: 'strict', numEvalsRequired: maxBadAttempts })`
  (`agent.ts:541`), `maxBadAttempts = 2` by default (`agent.ts:421`), this is the exact
  "how many times can it be wrong before something changes" number.
- **The trigger that forces another search, not just accepting the first answer.** On a failed
  eval for the main question, `agent.ts:687-703` decrements `numEvalsRequired` for that failure
  type; while budget remains, it resets `allowAnswer = false` for the next step and clears
  `diaryContext = []; step = 0` (`agent.ts:744-746`), forcing another search/reflect cycle
  rather than returning the failed answer. This is the single mechanism most worth stealing:
  a scanner that currently accepts the model's first answer has nothing playing this role at
  all.
- **Failure is fed back as context, not discarded.** Every time the main answer fails eval,
  `analyzeSteps(diaryContext, ...)` (`src/tools/error-analyzer.ts`, called `agent.ts:718`) runs
  a separate `errorAnalyzer`-model call and returns `{recap, blame, improvement}`, pushed into
  `allKnowledge` so the retry sees *why* the previous attempt was judged wrong, not just that it
  was wrong.
- **A confidence-shaped bypass exists and is a real gap.** `agent.ts:616-622`: if the very
  first LLM decision (`totalStep === 1`) is `answer`, it is accepted with **zero evaluation** , 
  "LLM is so confident and answer immediately, skip all evaluations." This is the repo's own
  version of Shin's current failure mode; it is explicitly gated only by being the first step,
  not by any actual confidence score.
- **Budget cap and what happens at exhaustion.** `regularBudget = tokenBudget * 0.85`
  (`agent.ts:499`, comment "reserve the 10% final budget for the beast mode"); default
  `tokenBudget = 1_000_000` (`agent.ts:420`); main loop runs
  `while (context.tokenTracker.getTotalUsage().totalTokens < regularBudget)` (`agent.ts:518`).
  When the loop exits without a passing final answer, `agent.ts:1036-1075` forces one more
  `generateObject` call with `model: 'agentBeastMode'` and an answer-only schema
  (`getAgentSchema(false,false,true,false,false,...)`), then hard-sets `isFinal = true`
  regardless of quality, comment at `agent.ts:1042`: "any answer is better than no answer,
  humanity last resort." So the budget-exhaustion return value is still a forced answer, never
  an "unknown."
- **Cross-source conflict is not explicitly checked.** `grep` for `conflict|contradict` across
  `agent.ts` and `src/tools/*.ts` finds only one hit, a search-angle description string in
  `src/tools/query-rewriter.ts:42` ("contradicting evidence" as a query type to search for), not
  a comparison step. What plays the closest role is chunk-level relevance filtering at answer
  build time: `src/tools/build-ref.ts:216` `if (match.relevanceScore < minRelScore) continue`
  with `minRelScore = 0.7` (`build-ref.ts:16`), this filters low-relevance chunks, it does not
  reconcile two disagreeing sources.
- **Retry that changes the prompt vs. repeats it: no literal answer-retry counter exists.** The
  `retry`/`retries` hits in the repo are in `src/tools/embeddings.ts:8` (`MAX_RETRIES = 3`),
  unrelated to answer quality. Answer-level "retry" is entirely the evaluationMetrics decrement
  scheme above (a new search/reflect step, not a re-ask of the same question with the same
  prompt).

## Q3 same shape every time

- **Real API-level schema, not a prompt-described shape.** `src/utils/schemas.ts` builds Zod
  objects passed directly as the `schema` param to Vercel AI SDK's `generateObject`
  (`src/utils/safe-generator.ts:27,155-158`: `generateObject({model, schema, prompt, system, ...})`).
  Example, the query-rewriter schema (`schemas.ts:191-203`):
  `tbs: z.enum(['qdr:h','qdr:d','qdr:w','qdr:m','qdr:y'])` (required, enum),
  `location: z.string().optional()`, `q: z.string().max(50)` (required, free string, capped).
  `getAgentSchema` (`schemas.ts:268-335`) builds `action: z.enum([...])` from whichever actions
  are enabled. No `.nullable()`/`.nullish()` anywhere in the file (verified); everything is
  `.optional()` or required, never modeled as nullable. Matters because a price/object field
  enforced this way (enum condition/currency, required numeric price) is a real schema, not a
  hope that the model follows prose.
- **Validator/repair cascade, not a simple "reject and re-ask."** `safe-generator.ts:34-242`
  (`ObjectGeneratorSafe.generateObject`). Default `numRetries = 0` (`safe-generator.ts:146`,
  confirmed directly). On schema-validation failure the order is: (1) raw `JSON.parse`, then
  `jsonrepair`, then `Hjson.parse` on the model's raw text (`safe-generator.ts:244-285`); (2)
  only if `numRetries > 0` does it re-call the same model with the same schema
  (`safe-generator.ts:184-193`, "retry with N-1 retries remaining"); (3) final fallback calls a
  separate `fallback` model (`gemini-2.5-flash-lite` per `config.json`) with a **distilled
  schema** (descriptions stripped, `safe-generator.ts:45-137,209-227`). So by default, zero
  model re-asks happen; text-repair libraries absorb most malformed output before any retry
  would fire.
- **Schema and search grounding never combine on one call, confirmed structurally.**
  `grep -rn "googleSearch\|grounding_config\|google_search_retrieval" src/` is empty
  (confirmed directly, exit 1), this repo never uses Gemini's native search-grounding tool at
  all; web search is done via separate HTTP calls to Brave/Jina/Serper APIs, entirely outside
  any `generateObject`/schema call. The repo's one `responseSchema` usage
  (`src/app.ts:493-498,648-655`) is the OpenAI-compatible endpoint's caller-supplied JSON
  schema, applied in a **second, separate `generateObject` call made after the agent loop
  finishes**, extracting structured data from already-generated answer text
  (`model: 'agent', schema: responseSchema, prompt: finalAnswer`), no search tool present on
  that call either. So this repo cannot confirm or break Shin's "schema and grounding are
  mutually exclusive on 2.5, allowed on 3.x" belief either way: it never attempts the
  combination on any model id. Model ids actually present: `gemini-2.5-flash` (default) and
  `gemini-2.5-flash-lite` (finalizer/fallback), per `config.json`; `gemini-3.1-flash-lite-preview`
  appears once, only in the offline eval harness (`src/evals/batch-evals.ts:111`, comment
  "migrated from gemini-2.5-flash on 2026-05-01"), not in the production agent path.
- **Prompts are 100% inline TypeScript template literals, zero external template files.**
  `grep -r readFileSync src/` returns no matches at all (confirmed, exit 1, proves absence).
  Every tool has its own `getPrompt`/`get*Prompt` function returning `{system, user}`:
  `src/agent.ts:110`, `src/tools/evaluator.ts:11,49,156,221,312,360`,
  `src/tools/query-rewriter.ts:7`, `src/tools/finalizer.ts:9`,
  `src/tools/error-analyzer.ts:7`. Few-shot examples appear inline: `src/utils/schemas.ts:23-59`
  (`getLanguagePrompt`, six worked Q/A examples inside an `<examples>` block).
- **Nothing pins the model to transcribe visible text before naming an object.** `grep` for
  `transcribe|OCR|visible text` across `src/` finds nothing, expected, since this repo never
  routes an image to a generative model at all (see Q1).

## Nothing here on

- Price extraction specifics (currency/unit/date capture alongside a number, staleness
  detection): this repo is a general-purpose research agent, not shopping-domain code; no
  price-shaped schema or extraction logic exists anywhere in `src/`.
- Citation/grounding metadata verification against retrieved sources: no Gemini grounding
  metadata exists to check (see Q1/Q3); the closest mechanism is the cosine-relevance filter at
  `build-ref.ts:216` (`minRelScore = 0.7`), which filters chunks by embedding similarity to the
  answer, not by verifying a specific claim is supported by a specific source.

## Dead or unwired

- None found. Every mechanism reported above (image-embedding pipeline, evaluator, error
  analyzer, beast mode, safe-generator repair cascade) is reachable from the main loop in
  `src/agent.ts` or from `src/app.ts`'s request handling; no orphaned exports were found for
  the functions checked.
