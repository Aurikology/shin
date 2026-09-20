# Significant-Gravitas/AutoGPT

What it actually is, from the source: no longer the 2023 autonomous GPT-4 loop. That code lives
frozen in `classic/`, whose own README says so: "This project is unsupported, and dependencies
will not be updated... an experiment that has concluded" (`classic/README.md:5-9`). The live
product is `autogpt_platform/`: a low-code visual agent builder (graph of "blocks" wired
together, run by an executor service) plus "AutoPilot", a separate chat/copilot agent
(`autogpt_platform/backend/backend/copilot/`) that plans and edits those graphs by calling tools
in a loop. Search is not a first-class feature; it is a handful of third-party API blocks
(Tavily, Exa, Jina, Wikipedia) that a graph author wires in like any other block. There is no
Gemini integration and no native search-grounding tool call anywhere in the repo (confirmed by
grep, see "Nothing here on").

Read depth: `README.md`, `classic/README.md` (not the rest of `classic/`, it is dead per its own
README). In `autogpt_platform/backend/backend/`: `blocks/search.py`, `blocks/tavily/*.py`,
`blocks/exa/search.py`, `blocks/exa/answers.py`, `blocks/exa/helpers.py`, `blocks/jina/search.py`,
`blocks/jina/fact_checker.py`, `blocks/llm.py` (full retry loop), `blocks/orchestrator.py`
(agent-mode loop config), `util/tool_call_loop.py` (full file, the shared agent-loop primitive),
`copilot/config.py`, `copilot/baseline/service.py` (tool-loop wiring section), `executor/automod/`
(skimmed, it is content moderation, not answer validation, not used further). Not opened: the
~40 other block packages (Stripe, Discord, Slack, etc., not search-shaped), `frontend/`, the
Prisma schema, `copilot/sdk` and `copilot/graphiti` internals, `classic/forge` and
`classic/original_autogpt` (dead code, out of scope per its own README), the four
`graph_templates/*.json` beyond listing their block-ID graph (IDs are opaque UUIDs, not worth
resolving for this scan).

## QA. Query formation and reformulation

- **NEEDS OUR OWN SEARCH**, the query is never built by an LLM or template; it is a plain
  pass-through string field on each provider block: `TavilySearchBlock.Input.query`
  (`autogpt_platform/backend/backend/blocks/tavily/search.py:34`), Exa's and Jina's equivalents.
  The graph author (human or AutoPilot) types or wires the exact string that hits the API.
- **Nothing found on reformulation.** Grepped the whole backend for
  `reformulat|rewrite.?quer|sub-?question|decompos`, the only hits are `copilot/tools/
  decompose_goal.py` and `copilot/tools/agent_generator/core.py`, which decompose an
  agent-*building* goal into graph-construction steps, not a search query into sub-questions.
  There is no code path that detects a weak or empty search result and rewrites the query. This
  is the gap the batch called out as the one most worth finding, and it is not here.
- **FITS** (as a pattern, not existing code), `blocks/orchestrator.py:505-510` lets a graph
  wire a search block as a tool inside `OrchestratorBlock`'s tool-calling loop
  (`agent_mode_max_iterations`, default `0` = off). When turned on, the model itself can decide
  to call the search tool again with a different query on a later turn, but this is generic
  tool-calling judgment, not a coded trigger condition, and it is opt-in and off by default.
- **NEEDS OUR OWN SEARCH**, query-level constraints exist but are static, human-set API params,
  not derived by any logic: `time_range`, `include_domains`, `exclude_domains` on
  `TavilySearchBlock.Input` (`blocks/tavily/search.py:52-64`).
- **FREE**, `blocks/exa/websets_search.py:553` finds an existing saved search by query text
  before creating a new one ("prevents duplicate searches in workflows"). This is workflow-level
  query caching, not merging of multiple queries' results; no query fan-out/merge code found
  anywhere in the search blocks.

## QB. Validating a result before it is believed

- **NEEDS OUR OWN SEARCH**, Tavily returns a per-result `score` field which the block passes
  straight through unread: `score=r.get("score", 0.0)` (`blocks/tavily/search.py:178`). Nothing
  in the block thresholds, filters, or reranks on it; it is Tavily's own relevance number, dead
  weight once it leaves the block.
- **Nothing found on deduplication.** Grepped `blocks/tavily`, `blocks/exa`, `blocks/jina` for
  `dedup|duplicate|seen_urls|unique`, only hits are field names like "unique identifier for the
  request" (`blocks/exa/websets.py` etc.) and the query-level cache above. No result-level dedup
  by URL or content.
- **NEEDS OUR OWN SEARCH**, page content fetch/clean is delegated entirely to the provider:
  Tavily's `include_raw_content` bool just asks Tavily's API to include full text
  (`blocks/tavily/search.py:69-73`); nothing in this repo parses or trims that text.
- **Nothing found on price/currency/date extraction, anywhere in the backend.** Grepped the
  whole backend tree for `price_regex|parse_price|extract_price|scrape.*price`, zero hits. Also
  checked every USD-looking hit in the search blocks (`blocks/tavily/_api.py:6-7`,
  `blocks/exa/helpers.py:468-525`, `blocks/jina/search.py:74-77`): every one of them is the
  block's own API-billing cost accounting (credits, `cost_dollars`, `costMicrodollars`), not a
  number pulled off a retrieved page. **This repo has nothing on the founder's price complaint at
  all.** Report the absence loudly, as instructed: there is no price-shaped extraction or
  validation mechanism in AutoGPT to learn from or avoid.

## QC. Tying the answer to its sources, and conflict

- **NEEDS OUR OWN SEARCH**, `blocks/exa/answers.py` (`ExaAnswerBlock`): citations come straight
  off Exa's hosted `answer()` endpoint (`AnswerCitation.from_sdk`, lines 41-51) and are yielded
  unchanged (lines 100-104). This is the provider claiming its own citations; no code in this
  repo checks that the answer text is actually supported by the citation text.
- **NEEDS OUR OWN SEARCH**, `blocks/jina/fact_checker.py` (`FactCheckerBlock`) is the closest
  thing to span-level citation matching in the repo: it posts a statement to Jina's hosted
  Grounding API (`https://g.jina.ai/{statement}`, line 59) and gets back `factuality` (float),
  `result` (bool), `reason`, and a `references` list of `{url, keyQuote, isSupportive}` per
  source (lines 22-26, 69-79). That matching is done entirely inside Jina's black box, not by any
  code in this repo, it is a third-party service call, not something we could run inside a
  Gemini call.
- **Nothing found on conflict handling.** Grepped `blocks/tavily`, `blocks/exa`, `blocks/jina` for
  `conflict|disagree`, zero hits. No code compares two sources or decides what to do when they
  disagree.
- **Nothing found on answer rejection/regeneration by judgment**, or on dropping/flagging an
  unsupported sentence, in any of the three search-provider block packages (grepped
  `unsupported|drop.*claim|flag.*claim`, zero hits there). The only rejection-and-regenerate loop
  in the repo is schema-shaped, not source-shaped, see QD.

## QD. Stopping, and its cost

- **FITS**, `util/tool_call_loop.py:157-284`, the shared agent-loop primitive used by both
  AutoPilot and `OrchestratorBlock`. Exit conditions: no tool calls in the response (natural
  finish, line 231), or `iteration == max_iterations` (line 203, default `max_iterations=-1` =
  infinite unless the caller caps it). On the last permitted iteration it drops the tool
  definitions and injects a finish-now system message (`iteration_tools = []`, lines 206-220) so
  the model is forced into a final text answer instead of a tool call that gets cut off. If the
  cap is hit anyway, it yields an explicit degraded result:
  `response_text=f"Completed after {max_iterations} iterations (limit reached)"`,
  `finished_naturally=False` (lines 276-284), the cap-out is marked, not returned silently as if
  complete.
- **FITS**, `copilot/config.py:427-439`: `agent_max_turns`, default **100**, hard range 1-10000,
  env override `CHAT_AGENT_MAX_TURNS`. This is the cap AutoPilot's chat loop passes into
  `tool_call_loop` (`copilot/baseline/service.py:2413-2420`). Not search-specific, but it is the
  actual number this repo ships as its "don't run forever" default.
- **FITS**, `copilot/baseline/service.py:211-222`: on budget exhaustion, `_LAST_ITERATION_HINT`
  tells the model to stop calling tools and summarize; if that still produces no visible text,
  `_BUDGET_EXHAUSTED_FALLBACK_TEXT`, *"Reached the tool-call budget for this turn. Send a
  follow-up message to continue from here."* — is shown to the user verbatim. A capped-out answer
  is never silently presented as a finished one.
- **Blunt finding on the "celebrated autonomous loop":** `blocks/orchestrator.py:505-510`,
  `agent_mode_max_iterations` defaults to **0**, documented as *"0 = traditional mode (single LLM
  call, yield tool calls for external execution)"*. The platform's own default is not a loop at
  all, a graph author has to explicitly opt into agent mode, and can then set it to `-1`
  ("infinite agent mode (loop until finished)") with no forced ceiling. AutoGPT-the-product today
  is a graph editor that runs each block once by default; anything resembling the old autonomous
  loop is an optional, off-by-default, and uncapped-if-you-ask-for-it feature buried in one block
  type, not the product's core behavior.
- **FITS**, `blocks/llm.py:436-806`, `AIStructuredResponseGeneratorBlock.run()`: retry loop,
  default `retry=3` (lines 478-482, `AIListGeneratorBlock` defaults to 3 too, line 1519). On a
  JSON parse failure or a missing-expected-key validation failure, it appends the bad assistant
  response plus a specific `invalid_response_feedback` message to the prompt and retries (lines
  657-743), **the retry does change the prompt**, not just repeat the call. On an SDK/API
  timeout it breaks immediately without retrying, on the stated reasoning "a request that hung
  once will most likely hang again... skip retries to avoid the N×timeout wait cascade" (lines
  767-780). On a 4xx-class provider error it also breaks immediately (`USER_ERROR_STATUS_CODES`,
  lines 758-766). On a context-length error it shrinks `max_tokens` by 15% and retries without
  adding retry-prompt text (lines 782-793).
- **FREE**, cost is tracked per attempt, including failed ones: `NodeExecutionStats` with
  `input_token_count`/`output_token_count`/`provider_cost` merged on every loop pass
  (`blocks/llm.py:644-654`), and `llm_call_count`/`llm_retry_count` recorded on final success or
  exhaustion (lines 719-730, 799-805). This is local bookkeeping, not a call itself.

## Nothing here on

- Gemini or any `google_search`/`googleSearch`/`grounding_config`/`google_search_retrieval` tool
  call, anywhere in the backend. Grepped `google_search|googleSearch|grounding` across
  `autogpt_platform/backend/backend`; the only hit is the word "Grounding" in
  `blocks/jina/fact_checker.py:49`'s docstring, describing Jina's own product name, not Gemini.
- Price, currency, or date extraction from any fetched page (see QB).
- Cross-source conflict resolution, answer rejection-and-regeneration judged against sources, or
  dropping an unsupported sentence (see QC).
- Deterministic query reformulation on a weak or empty result (see QA), the single mechanism the
  batch said we most lack is absent here too.

## Dead or unwired

- `classic/` (the famous 2023 loop): explicitly declared unsupported and frozen by its own
  README (`classic/README.md:5`); not imported by, or wired into, `autogpt_platform/` at all,
  they are two separate Poetry/pyproject projects at the repo root (`classic/pyproject.toml` vs
  `autogpt_platform/backend/pyproject.toml`).
- `OrchestratorBlock`'s agent-mode loop (`blocks/orchestrator.py`) is fully implemented and wired
  into `util/tool_call_loop.py`, but ships **off by default** (`agent_mode_max_iterations=0`);
  it only runs when a graph author explicitly raises that field above 0 or to -1. Not dead code,
  but dormant unless configured.
