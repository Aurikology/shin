# ItzCrazyKns/Vane

Vane is a self-hosted "answer engine": a Next.js app that runs its own agentic research loop
(SearxNG meta-search, Playwright scraping, embedding rerank, an LLM "writer" pass) and streams a
cited answer back to a chat UI. The founder's source list named `ItzCrazy-dev/Perplexica`, which
does not exist; the corrected, still-maintained repo is `ItzCrazyKns/Vane`
(https://github.com/ItzCrazyKns/Vane), the renamed continuation of the Perplexica project (the
code, SearxNG submodule, and Docker setup all still carry Perplexica's shape).

Read depth: cloned shallow (`--depth 1`) into a scratch dir. Opened in full: `src/lib/prompts/search/*`
(researcher.ts, classifier.ts, writer.ts), `src/lib/agents/search/index.ts`,
`src/lib/agents/search/classifier.ts`, `src/lib/agents/search/researcher/index.ts`,
`src/lib/agents/search/researcher/actions/{done,plan,uploadsSearch}.ts`,
`src/lib/agents/search/researcher/actions/search/{baseSearch,webSearch,academicSearch,socialSearch}.ts`,
`src/lib/utils/{computeSimilarity,jaccardSim}.ts`, `src/lib/scraper.ts`, `src/lib/searxng.ts`,
`src/lib/session.ts`, `src/app/api/chat/route.ts`, `src/lib/hooks/useChat.tsx` (citation rendering),
`src/components/MessageBox.tsx`, `src/components/MessageRenderer/Citation.tsx`,
`src/lib/db/schema.ts` (message status enum). Deliberately not opened: `src/lib/models/providers/**`
(provider-specific LLM/embedding wrappers for OpenAI/Ollama/LM Studio/etc, not architecture-relevant),
`src/lib/agents/media/*` (image/video agents, out of scope for a pricing assistant), `src/lib/config/**`
(provider config plumbing), `src/lib/uploads/**` beyond the one action that calls it, `drizzle/`
migrations, and all of `src/components/` except the citation-rendering path.

## QA query construction and reformulation

- The user's raw follow-up is turned into a standalone question by one classifier LLM call before
  any search happens: the model is asked to output `standaloneFollowUp`, "a self-contained,
  context-independent reformulation of the user's question," in the same call that decides
  skipSearch/personalSearch/academicSearch/discussionSearch/widget flags. Prompt quoted verbatim:
  `<standalone_followup>\nFor the standalone follow up, you have to generate a self contained,
  context independant reformulation of the user's query.\nYou basically have to rephrase the
  user's query in a way that it can be understood without any prior context from the conversation
  history...\n</standalone_followup>` `src/lib/prompts/search/classifier.ts:40-47`, called from
  `src/lib/agents/search/classifier.ts:38-50`. **FITS** (one extra Gemini call on the same
  conversation history; this is the closest thing in Vane to what Shin could reuse for turning a
  photo+context into a clean grocery-item description before a grounded call).
  This directly maps to Shin's #3 complaint (prompting Gemini consistently): a dedicated
  normalization pass before the main call is a concrete mechanism Shin does not have.
- The actual search string is not built from a template; it is written by the researcher LLM
  itself as structured tool-call arguments (a `queries: string[]` array), inside an agent loop that
  is instructed to write "SEO friendly" keyword phrases, not sentences: "Your queries shouldn't be
  sentences but rather keywords that are SEO friendly and can be used to search the web for
  information." `src/lib/agents/search/researcher/actions/search/webSearch.ts:17-24` (speed mode
  prompt); the same instruction repeats for balanced/quality modes at
  `src/lib/agents/search/researcher/actions/search/webSearch.ts:26-57`. Enforced call site:
  `src/lib/agents/search/researcher/actions/search/webSearch.ts:87-90` (`input.queries =
  (Array.isArray(...) ? ... : [...]).slice(0, 3)`). **FITS** (query writing is an LLM output, not a
  fetch; the "write terse keyword queries, not sentences" instruction is directly portable into a
  Shin prompt even though Shin never issues the query itself, since Gemini's internal grounding
  search likely responds to the same style of query text embedded in the prompt).
- Reformulation after a weak/empty result: searched explicitly for a trigger condition
  (`grep -n "results.length === 0"` and `results.length == 0` across `src/lib/agents`) and found
  none tied to search results (the only length-0 checks are on tool-call output and on stock-widget
  quotes: `src/lib/agents/search/researcher/index.ts:150`,
  `src/lib/agents/search/widgets/stockWidget.ts:80,159`). There is no code that detects "this query
  came back empty/weak" and rewrites it. The closest thing is illustrative, not enforced: the
  balanced-mode system prompt shows a worked example of issuing broad queries then narrower ones on
  the next loop iteration, but this is few-shot guidance the model may or may not follow, not a
  measured/triggered rewrite: `src/lib/agents/search/researcher/actions/search/webSearch.ts:34-43`.
  **Nothing here** on an actual reformulation mechanism. This is exactly the gap the founder said
  to prioritize finding, and Vane does not have it either: it relies on the general-purpose agent
  loop (LLM decides for itself whether to search again) rather than a coded weak-result detector.
  Still, the pattern "let the model see its own prior tool-call output and decide to issue a second,
  narrower query" is **FITS** as a technique, because it needs no extra infrastructure, just a
  second Gemini call/turn with the first grounded response as context (see QD for the loop that
  hosts this).
- Multiple queries are issued at once (up to 3 per tool call) and merged by simple concatenation:
  all query results across `Promise.all(input.queries.map(search))` are pushed into one flat
  `results: Chunk[]` array, then globally sorted and deduplicated together (not merged per-query).
  `src/lib/agents/search/researcher/actions/search/baseSearch.ts:41-130`. **NEEDS OUR OWN SEARCH**
  (this merge logic operates over rows Vane's own SearXNG calls produced; it presumes multiple
  independently-fetched result sets, which Shin's single grounded call never produces).
- Query-level constraints: engine/site restriction exists per search "flavor" via SearxNG's
  `engines` option, academic search pins `engines: ['arxiv', 'google scholar', 'pubmed']`
  (`src/lib/agents/search/researcher/actions/search/academicSearch.ts:50-52`) and social search
  pins `engines: ['reddit']` (`src/lib/agents/search/researcher/actions/search/socialSearch.ts:50-52`).
  Both are **NEEDS OUR OWN SEARCH** (SearXNG engine selection has no equivalent when the model does
  its own grounding). Plain web search passes no engine/site/language/recency constraint at all;
  the `language` field on `SearxngSearchOptions` (`src/lib/searxng.ts:6`) is only ever set by the
  unrelated `/api/discover` route (`src/app/api/discover/route.ts:51,73`, hardcoded `'en'`), never
  by the chat/research path. No recency/time-range parameter is used anywhere (`grep -n
  "time_range|recency"` returned nothing outside the unused `pageno` field). **Nothing here** on
  a language/region or recency constraint in the actual chat query path.

## QB result vetting before belief

- Relevance scoring/threshold (speed and balanced modes): each SearXNG result's content is embedded
  and compared to the query embedding by cosine similarity; only results with
  `similarity > 0.5` survive: `src/lib/agents/search/researcher/actions/search/baseSearch.ts:50-72`
  (`.filter((c) => c.metadata.similarity > 0.5)`). Cosine similarity implementation:
  `src/lib/utils/computeSimilarity.ts:1-20` (plain dot product over norm). **NEEDS OUR OWN SEARCH**
  (the embedding model runs over content Vane itself fetched from SearXNG). Exact number: **0.5**.
- Deduplication: after all queries' results are pooled and sorted by similarity descending
  (`baseSearch.ts:130`), results are deduplicated by pairwise embedding similarity against results
  already kept, with a **0.75** cosine-similarity threshold (`similarity > 0.75` ⇒ treated as
  duplicate, dropped): `src/lib/agents/search/researcher/actions/search/baseSearch.ts:132-158`. This
  is semantic dedup, not URL-keyed, inside a single `executeSearch` call. Separately, at the very
  end of the whole research loop, results ARE deduped by URL as the key, concatenating content for
  repeated URLs: `src/lib/agents/search/researcher/index.ts:189-208`
  (`seenUrls = new Map<string, number>()`, keyed on `result.metadata.url`). Both are **FREE** once
  the underlying embeddings/results already exist (no extra model call to dedup itself), but they
  operate on content Vane's own search produced, so the overall mechanism is **NEEDS OUR OWN
  SEARCH**; the URL-keyed merge step alone is **FREE** and architecture-agnostic pure logic.
- Result cap: after rerank+dedup, only the top **20** unique results are kept per `executeSearch`
  call: `src/lib/agents/search/researcher/actions/search/baseSearch.ts:169`
  (`.slice(0, 20)`). **NEEDS OUR OWN SEARCH**.
- Quality-mode reranking is a second LLM call, not embeddings: a "picker" prompt is given all raw
  search results (title/snippet/URL) and asked to choose at most 3 indices to actually scrape,
  explicitly told to "Favour known and reputable sources" and to maximize diversity:
  `src/lib/agents/search/researcher/actions/search/baseSearch.ts:240-286` (prompt at 240-262, call
  at 272-284, enforced cap `pickedIndices.slice(0, 3)` at 286). **NEEDS OUR OWN SEARCH**, the whole
  mechanism only exists because Vane has a candidate list of fetched result stubs to choose from;
  Shin's single grounded call never produces such a list to pick over.
- Page content is fetched and cleaned in quality mode only: a headless Chromium browser
  (Playwright) loads the URL, and Mozilla's Readability library strips it down to `textContent`
  (drops nav/ads/boilerplate/markup, keeps only what Readability judges to be the article body):
  `src/lib/scraper.ts:56-96` (Readability parse at line 86). Speed/balanced modes never scrape pages
  at all, they only ever see the SearXNG result snippet/title (`const content = r.content ||
  r.title;`, `src/lib/agents/search/researcher/actions/search/baseSearch.ts:56` and `:186`). Both
  the fetch-and-clean step and the snippet-only path are **NEEDS OUR OWN SEARCH** (both require
  Vane's own fetched pages or its own search-engine call).
- Filtering by domain/date/source quality: searched explicitly
  (`grep -rniE "trusted|allowlist|blocklist|blacklist|whitelist|domain.*(filter|score)"` across all
  of `src`) and found zero matches. The only thing resembling "trust a source more" is the
  unenforced natural-language instruction inside the quality-mode picker prompt ("Favour known and
  reputable sources," `baseSearch.ts:247`) — pure LLM judgment, no code-level allowlist, denylist,
  domain scoring, or date filter anywhere in the repo. **Nothing here** on code-level source-quality
  or date filtering.
- Price/number/currency extraction from page content, and validation of it: searched explicitly
  (`grep -rniE "price|currency|\$[0-9]"` across all of `src`). The only hits are the stock-price
  widget, which calls an external finance API (Yahoo-style quote endpoint) and reads
  `quote.regularMarketPrice` / `quote.currency` directly as typed fields off that API's JSON
  response: `src/lib/agents/search/widgets/stockWidget.ts:233,241,249,252,272`. That is a
  structured-API read, not extraction of a price out of scraped/unstructured web text, there is no
  regex, parser, or LLM extraction step anywhere that pulls a dollar figure out of a scraped page or
  search snippet, and therefore nothing that validates such a figure either. **Loudly: nothing here
  on price extraction from unstructured content.** This is Shin's #2 complaint and Vane offers no
  transferable mechanism for it at all; even Vane's own only price-shaped data comes from a
  dedicated priced API, not from search+LLM reading of a page.

## QC citation attachment and conflict handling

- Citations are model self-claims, attached to sentences purely by the model choosing to write
  `[1]`, `[2]`, etc. The writer system prompt instructs: "Cite every single fact, statement, or
  sentence using [number] notation corresponding to the source from the provided `context`... Ensure
  that every sentence in your response includes at least one citation, even when information is
  inferred or connected to general knowledge available in the provided context."
  `src/lib/prompts/search/writer.ts:24-30`. There is no code anywhere that matches answer text back
  to specific source text/spans, searched explicitly for such logic (`grep -rniE
  "regenerate|reject.*answer|conflict|disagree|contradict"` across all of `src`; zero matches) and
  by tracing the only place `[number]` is interpreted. That place is a pure frontend index lookup,
  not a claim-to-source verifier, quoted verbatim:
  ```js
  const citationRegex = /\[([^\]]+)\]/g;
  ...
  processedText = processedText.replace(
    citationRegex,
    (_, capturedContent: string) => {
      const numbers = capturedContent.split(',').map((numStr) => numStr.trim());
      const linksHtml = numbers.map((numStr) => {
        const number = parseInt(numStr);
        if (isNaN(number) || number <= 0) return `[${numStr}]`;
        const source = sources[number - 1];
        const url = source?.metadata?.url;
        if (url) return `<citation href="${url}">${numStr}</citation>`;
        else return ``;
      }).join('');
      return linksHtml;
    },
  );
  ```
  `src/lib/hooks/useChat.tsx:335-381`. This turns the model's own `[N]` marker into a clickable link
  to `sources[N-1]`, by array position only. It does not check that source N actually supports the
  sentence it is attached to; it trusts the model's number outright. Rendering component:
  `src/components/MessageRenderer/Citation.tsx:1-19` (renders an `<a href>`), wired into markdown
  overrides at `src/components/MessageBox.tsx:100-102`. **FREE** (pure string/regex logic, no model
  call, no fetch) but it is index-lookup trust, not span-matching, this is the highest-value
  negative finding in the batch: even the repo architecturally closest to an "answer engine" does
  not verify citations against source text; it only formats a number the model already chose. For
  Shin (grounded Gemini call, no separate source-fetch step of its own), the honest takeaway is that
  citation correctness has to come from Gemini's own grounding metadata (if exposed) or from a
  second judging call, not from any code pattern Vane demonstrates.
- Conflict between two sources: **nothing here**. No code inspects two sources for disagreement; the
  writer prompt does not mention conflicting sources at all (`src/lib/prompts/search/writer.ts` full
  text read, no such instruction). Resolution, if any, happens silently inside the model's own
  synthesis, unobservable and unverified by code.
- No result at all: handled by one hardcoded fallback sentence in the writer prompt, not by code:
  "If no relevant information is found, say: 'Hmm, sorry I could not find any relevant information
  on this topic. Would you like me to search again or ask something else?' Be transparent about
  limitations and suggest alternatives or ways to reframe the query."
  `src/lib/prompts/search/writer.ts:35`. **FITS** (a plain prompt instruction, portable verbatim into
  a Shin system prompt as the explicit "say so" behavior the founder's QD question asks about).
  Nothing enforces that the model actually says this when context is empty; it is instruction only,
  never checked.
- Answer rejection/regeneration by judgment: **nothing here**. Searched explicitly (see grep above,
  and separately `grep -rn "judge\|scorer\|grade"` inside `src/lib/agents` and `src/lib/prompts`,
  zero matches). The writer LLM call happens exactly once per turn
  (`src/lib/agents/search/index.ts:128-140`, single `input.config.llm.streamText(...)` call, its
  output streamed straight to the user with no post-hoc scoring pass).
- Dropping/flagging an unsupported sentence: **nothing here**. No code parses the finished answer to
  check whether a sentence has a citation or whether the citation it has is valid; the "every
  sentence must cite" rule is prompt-only (`writer.ts:27`) and unenforced by any downstream check.

## QD stopping conditions and cost

- Iteration caps are hardcoded per mode: speed = 2, balanced = 6, quality = 25:
  `src/lib/agents/search/researcher/index.ts:15-20` (`maxIteration = input.config.mode === 'speed'
  ? 2 : input.config.mode === 'balanced' ? 6 : 25`). Loop exit conditions inside that cap: the agent
  breaks immediately if a turn produces zero tool calls (`finalToolCalls.length === 0`, line 150-152)
  or if the last tool call in a turn is named `done` (lines 154-156). The `done` tool's own
  description states the cap is a backstop, not something the model must reach: "IT WILL BE
  AUTOMATICALLY TRIGGERED IF MAXIMUM ITERATIONS ARE REACHED" `src/lib/agents/search/researcher/actions/done.ts:7`.
  Per-call query cap is separately enforced at 3 (`.slice(0, 3)`,
  `src/lib/agents/search/researcher/actions/search/webSearch.ts:88-90`, mirrored in
  academicSearch.ts:33-35, socialSearch.ts:33-35, uploadsSearch.ts:28). **FITS** as numbers/pattern
  (an iteration cap and a per-call query cap are exactly the kind of thing a multi-turn Gemini
  grounding conversation could also enforce, even though Vane's loop itself needs its own tool
  dispatch machinery Shin doesn't have).
- What is returned when budget is spent: nothing is marked degraded. The loop simply stops (cap
  hit, or model calls/doesn't call `done`) and whatever `actionOutput`/`searchFindings` were
  accumulated so far are handed to the writer prompt as-is (`src/lib/agents/search/researcher/index.ts:216-219`
  returns `{ findings: actionOutput, searchFindings: filteredSearchResults }`, no flag for "ran out
  of budget"). The DB schema does define an `'error'` status
  (`status: text({ enum: ['answering', 'completed', 'error'] })`, `src/lib/db/schema.ts:16`) but
  nothing in the codebase ever sets it to `'error'` (`grep -rn "status: 'error'"` across all of
  `src`, zero hits); only `'answering'` (insert/update in `src/lib/agents/search/index.ts:29,42`)
  and `'completed'` (`src/lib/agents/search/index.ts:179`) are ever written. **Dead/unwired**, see
  below.
- Retry/backoff on a failed call: searched explicitly (`grep -rn "retry|Retry|backoff|maxRetries"`
  across all of `src`) and found zero matches anywhere in the repo, including inside the LLM
  provider wrappers. There is no retry logic at all, so there is also no "does retry change the
  prompt" question to answer — it simply does not retry. An LLM call failure inside
  `searchAsync`/`Researcher.research` is not caught locally either (no `try/catch` around the
  `streamText` calls in `src/lib/agents/search/index.ts:128-140` or
  `src/lib/agents/search/researcher/index.ts:68-77`), and `agent.searchAsync(...)` is invoked in the
  route without an `await` or `.catch` (`src/app/api/chat/route.ts:213-226`), so an LLM error there
  becomes an unhandled rejection rather than a caught, user-visible degraded response. **Nothing
  here** on retry/backoff.
- Per-question cost accounting: searched explicitly. `getTokenCount` (a `js-tiktoken`-based token
  counter, `src/lib/utils/splitText.ts:1-25`) is imported into
  `src/lib/agents/search/index.ts:11` but never called anywhere in that file
  (`grep -n "getTokenCount" src/lib/agents/search/index.ts` returns only the import line). No
  token/time/dollar budget is tracked or logged per question anywhere in the repo. **Dead
  import**, see below.

## Nothing here on

- A coded (non-prompt-only) query-reformulation trigger after a weak/empty search result (QA).
- Language/region or recency constraint applied to the plain web-search path (only the unrelated
  `/api/discover` route sets `language`, hardcoded `'en'`).
- Domain/date/source-quality filtering implemented in code (only an unenforced prompt instruction
  in quality mode).
- Price/number/currency extraction (and validation) from scraped or search-snippet text anywhere in
  the repo; the only "price" the app ever reads comes from a dedicated finance API's structured
  JSON.
- Any span-matching between answer text and source text; citations are the model's own `[N]`
  markers, formatted client-side, never verified.
- Cross-source conflict detection/handling.
- Answer rejection-and-regeneration by any judge/scorer.
- Post-hoc flagging or dropping of an unsupported sentence.
- Retry/backoff on any failed LLM or search call.
- Per-question token/time/cost accounting actually being recorded anywhere.

## Dead or unwired

- `src/lib/utils/jaccardSim.ts` (`computeJaccardSimilarity`): defined, exported, never imported
  anywhere else in the repo (`grep -rn "jaccardSim\|computeJaccardSimilarity" --include=*.ts .`
  returns only the definition file itself).
- `getTokenCount` imported into `src/lib/agents/search/index.ts:11` but never invoked in that file,
  a token-counting utility exists in the codebase but is not wired into the one place (the search
  agent) that would need it for cost accounting.
- The chat DB schema's `'error'` message status (`src/lib/db/schema.ts:16`) is declared but never
  assigned; only `'answering'`/`'completed'` are ever set
  (`src/lib/agents/search/index.ts:29,42,179`), so a failed/degraded run has no distinguishing
  status in the database despite the schema anticipating one.
- The SSE `'error'` event branch in the chat route (`src/app/api/chat/route.ts:199-210`, which
  formats and forwards `{type: 'error', data: data.data}` to the client) has no corresponding
  `session.emit('error', ...)` call anywhere in the codebase (`grep -rn "emit('error'"` across all
  of `src`, zero hits): the frontend is wired to handle a server-side error event that the backend
  never actually sends.
