# strands-agents/harness-sdk

One line: this is not a Gemini wrapper, it is a generic multi-provider agent framework
(strands-py) with an event loop, a tool registry, and one adapter per model provider;
`strands/models/gemini.py` is the Gemini adapter and it is thin (743 lines), the loop
termination and structured-output-forcing logic that governs it live in
`strands/event_loop/` and `strands/tools/structured_output/`, outside the Gemini file.

Read depth: read in full - `strands-py/src/strands/models/gemini.py` (743 lines, all of it).
Read targeted sections of - `strands-py/src/strands/event_loop/event_loop.py`,
`strands-py/src/strands/event_loop/_retry.py`, `strands-py/src/strands/types/agent.py`
(`Limits`), `strands-py/src/strands/tools/structured_output/_structured_output_context.py`
and `structured_output_utils.py`, `strands-py/src/strands/agent/agent.py` (structured-output
call sites only), `strands-py/src/strands/experimental/bidi/models/google.py` and
`configs.py` (the separate Live/bidi Gemini path), `strands-py/tests/strands/models/test_gemini.py`
and `tests_integ/models/test_model_gemini.py` (to confirm request shapes against actual
assertions, not just my own reading of the adapter). Grepped the whole `strands-py/src` tree
for `google_search`, `grounding`, `dynamic_retrieval`, `citation`, `finish_reason`,
`response_schema`, and version-conditional patterns. Did not open: `strands-py/src/strands/models/bedrock.py`
in full (grepped only, for citations contrast), `site/` (docs site, not source), any
TypeScript SDK if one exists in this repo, `.agents/` skill files (not source), the rest of
`strands-py/src/strands/tools/` beyond structured output.

## Q1 image plus search

- Image goes in as an inline base64 `Blob` on a `Content` part, nothing else: `if "image" in
  content: return genai.types.Part(inline_data=genai.types.Blob(data=content["image"]["source"]["bytes"],
  mime_type=...))` - `strands-py/src/strands/models/gemini.py:168-174`. No resize, no crop, no
  `media_resolution` hint anywhere in this function or the file (grepped `media_resolution`,
  `resize`, `crop` in gemini.py, zero hits) - matters because a full-resolution grocery photo
  goes up uncompressed every time, which is a token-cost and latency variable Shin isn't
  controlling for.
- Tools and image are independent axes of the same request: `_format_request` builds
  `contents` (image lives here) and `config.tools` (search/functions live here) into one dict,
  then `stream()` calls `client.models.generate_content_stream(**request)` once -
  `strands-py/src/strands/models/gemini.py:362-388`, call site at `:613`. Nothing in between
  strips tools when an image is present, or vice versa.
- Custom function tools and a built-in Gemini tool (e.g. `googleSearch`) are assembled into
  the SAME `tools` list, unconditionally: `tools = [genai.types.Tool(function_declarations=[...
  for tool_spec in tool_specs or []])]; if self.config.get("gemini_tools"): tools.extend(self.config["gemini_tools"])`
  - `strands-py/src/strands/models/gemini.py:264-291`. This is the single highest-value finding:
  one call, both mechanisms, by construction.
- Test-verified, not just read: `test_gemini_tools_validation_allows_non_function_tools`
  builds `genai.types.Tool(google_search=genai.types.GoogleSearch())` and the model accepts it
  as `gemini_tools` - `strands-py/tests/strands/models/test_gemini.py:1236-1240`.
  `test_stream_request_with_gemini_tools` proves the exact request body for a `google_search`
  tool alone: `"tools": [{"function_declarations": []}, {"google_search": {}}]` -
  `strands-py/tests/strands/models/test_gemini.py:1257-1274`.
  `test_stream_request_with_gemini_tools_and_function_tools` proves a `gemini_tools` entry
  (code_execution in the test, same code path as google_search) combined with a real custom
  `tool_spec` in one request: `"tools": [{"function_declarations": [{...custom tool...}]},
  {"code_execution": {}}]` - `strands-py/tests/strands/models/test_gemini.py:1277-1302`. No
  test in this suite combines `google_search` specifically with a custom function tool, but it
  runs through the identical `_format_request_tools` code path the code_execution test exercises,
  so the mechanism is proven even though that exact pair isn't.
- No version gate anywhere in the SDK: grepped `strands-py/src/strands/models/gemini.py` for
  `2.5`, `gemini-3`, and any `"3.`/`'3.` conditional - zero hits. The unit test fixture that
  drives most of the file uses a placeholder model id `"m1"` (`strands-py/tests/strands/models/test_gemini.py:22-23`),
  and every request-shape assertion runs against that placeholder, meaning the SDK code itself
  never branches on model id at all - the tool list is built the same way regardless of what
  string is passed as `model_id`. Only `strands-py/tests_integ/models/test_model_gemini.py:20,29,282`
  use real ids (`gemini-2.5-flash`, `gemini-3.1-flash-lite`), and none of them feed into any
  conditional logic - they're just parameters. This means: if the real Gemini API rejects the
  image+search+function combo on some model id, this framework will not catch it or warn -
  it will send the request and let the API's own error come back.
- The only client-side rejection related to `gemini_tools` is the opposite of a search/function
  gate: it blocks a `gemini_tools` entry from itself containing `FunctionDeclaration`s (to stop
  double-registering a function both ways), not from being combined with the ordinary `tools`
  interface - `strands-py/src/strands/models/gemini.py:720-742`, raises `ValueError` with message
  "gemini_tools should not contain FunctionDeclarations."
- SDK version pin (dependency declaration, not a mechanism - labeled as such): `pyproject.toml:50`
  `gemini = ["google-genai>=1.67.0,<3.0.0"]`; the separate bidi/Live extra pins
  `google-genai>=2.0.0,<3.0.0` (`pyproject.toml:90`). Repo head at scan time: commit `54ca0befa69a1e8e8d7f3083da62a8e9d341f050`, 2026-09-18.
- Separate, weaker path: the experimental Live/bidi Gemini model (`strands-py/src/strands/experimental/bidi/models/google.py`)
  has no `gemini_tools`-equivalent config at all. It only ever builds
  `genai_types.Tool(function_declarations=[...])` from `tool_specs` -
  `strands-py/src/strands/experimental/bidi/models/google.py:722-737`. Its config merge
  (`_merge_config`, `strands-py/src/strands/experimental/bidi/models/configs.py:146-155`)
  overwrites list-valued keys wholesale rather than appending, so a caller trying to inject a
  `google_search` tool via `params={"tools": [...]}` would silently replace, not add to, the
  function-declaration tools list - unlike the main model, nothing here does the additive
  combination automatically. Labelled experimental; this is the audio/realtime code path, not
  the one a photo-then-answer product would use.

## Q2 stopping being wrong

- Retries exist only for throttling, never for a wrong-but-confident answer, and never change
  the prompt: `is_retryable` matches only `ModelThrottledException`
  (`strands-py/src/strands/event_loop/_retry.py:61-70`), which Gemini's adapter raises only on
  `RESOURCE_EXHAUSTED`/`UNAVAILABLE` client errors (`strands-py/src/strands/models/gemini.py:682-691`).
  Backoff is exponential, same request repeated verbatim: 4s, 8s, 16s, 32s, 64s, giving up on
  the 6th attempt (`strands-py/src/strands/event_loop/_retry.py:28-29,40-46`). Matters because a
  misidentified grocery item or a wrong price never triggers a retry here - only a rate limit
  does.
- No confidence gate, no "not sure" branch, no enum-banded certainty anywhere in
  `strands-py/src/strands/models/gemini.py` - grepped the whole file for a confidence/uncertain
  concept, nothing. The model's first answer is what the loop keeps.
- Grounding metadata from a `googleSearch` call is never read, let alone checked against the
  answer: `groundingMetadata`/`grounding_metadata`/`GroundingMetadata` returns zero hits
  anywhere in `strands-py/src` (grepped). The Gemini stream loop only pulls `candidate.content`
  and `candidate.finish_reason` off each streamed chunk -
  `strands-py/src/strands/models/gemini.py:622-624,676` - `grounding_metadata`, which the
  underlying `google-genai` `GenerateContentResponse.candidates[i]` object does carry when
  `googleSearch` is used, is simply never touched. A grounded search's supporting sources are
  dropped before they reach the caller.
- Citations are a real, working mechanism in this framework, but it is Bedrock-only, not wired
  to Gemini at all: `strands-py/src/strands/models/bedrock.py:1146-1176` parses
  `citationsContent`/`citations`/`sourceContent`/`title` off a Bedrock Knowledge Base response,
  and `strands-py/src/strands/event_loop/streaming.py:244-343` turns a `"citation"` delta into a
  `CitationsContentBlock` generically. But Gemini's own `_format_chunk`
  (`strands-py/src/strands/models/gemini.py:390-517`) never emits a `"citation"` key in any
  chunk it produces, so that generic pipeline never fires for a Gemini response - the mechanism
  exists in the codebase but is unreachable from the Gemini adapter.
- The agent loop terminates on the model's own `stop_reason`, with no default limit: the Gemini
  adapter maps a Gemini `finish_reason` to `stopReason` - `TOOL_USE` -> `"tool_use"`, `MAX_TOKENS`
  -> `"max_tokens"`, `SAFETY` -> `"guardrail_intervened"`, anything else -> `"end_turn"`
  (`strands-py/src/strands/models/gemini.py:470-479`). In the generic loop: `stop_reason=="tool_use"`
  runs the tools and recurses into another cycle (`strands-py/src/strands/event_loop/event_loop.py:324-363,382-390`);
  `stop_reason=="max_tokens"` raises `MaxTokensReachedException`
  (`strands-py/src/strands/event_loop/event_loop.py:313-322`); anything else (typically
  `"end_turn"`) ends the cycle and returns whatever the model said
  (`strands-py/src/strands/event_loop/event_loop.py:392-393`). A hard cap only exists if the
  caller explicitly passes `limits=` (`turns`/`output_tokens`/`total_tokens`), checked at the
  top of every cycle by `_check_limits` (`strands-py/src/strands/event_loop/event_loop.py:69-102`,
  `Limits` defined `strands-py/src/strands/types/agent.py:90-122`); with no `limits` argument the
  loop is unbounded except by the model choosing to stop calling tools. Matters directly: a
  wrong "first guess" item name or price ends the turn exactly the same way a correct one would
  - there is no framework-level check that distinguishes them.
- One real re-ask exists, but it is about output shape, not correctness: if
  `structured_output_context.is_enabled` and `stop_reason=="end_turn"` without the structured
  output tool having been used, the loop appends a fixed user message and forces exactly one
  more turn with `tool_choice` pinned to the structured-output tool
  (`strands-py/src/strands/event_loop/event_loop.py:369-378`); the forced prompt is the hardcoded
  string `"You must format the previous response as structured output."`
  (`strands-py/src/strands/tools/structured_output/_structured_output_context.py:16`). If that
  forced attempt also fails to produce the tool call, it raises `StructuredOutputException`
  (`strands-py/src/strands/event_loop/event_loop.py:370-373`) - one retry, capped, and it checks
  shape only, never whether the price or name is actually right.

## Q3 same shape every time

- A real API-level schema is used, not a prompt-spelled shape: `GeminiModel.structured_output()`
  sets `response_mime_type="application/json"` and
  `response_schema=output_model.model_json_schema()` -
  `strands-py/src/strands/models/gemini.py:710-714`. Test-verified exact request body:
  `strands-py/tests/strands/models/test_gemini.py:1204-1219`.
- Schema and `googleSearch` can coexist on one call, by code path, with no model-id gate -
  breaking the "mutually exclusive on 2.5, allowed on 3.x" belief at the code level (the SDK
  enforces no such distinction either way): `structured_output()` calls `_format_request(prompt,
  None, system_prompt, params)` with `tool_specs` hardcoded to `None`
  (`strands-py/src/strands/models/gemini.py:715`), but `_format_request_tools` still appends
  `self.config["gemini_tools"]` regardless of `tool_specs`, because the early-return only fires
  when *both* are empty: `if not tool_specs and not self.config.get("gemini_tools"): return None`
  (`strands-py/src/strands/models/gemini.py:275`). So a `GeminiModel(model_id=..., gemini_tools=[genai.types.Tool(google_search=genai.types.GoogleSearch())])`
  - the exact construction `test_gemini.py:1237` proves the SDK accepts - would, on
  `.structured_output()`, produce a single `GenerateContentConfig` carrying both
  `response_schema` and the `google_search` tool. No test in this suite exercises that specific
  pair (`test_structured_output`, `strands-py/tests/strands/models/test_gemini.py:1204-1219`,
  uses a model with no `gemini_tools` configured, so its expected request has no `"tools"` key
  at all), so this is a code-path finding from reading `_format_request_tools` and
  `structured_output()` together, not a test-verified one - flagged as such per the evidence
  rules.
- This native-schema path is reached only through the deprecated call surface: `Agent.structured_output()`
  and `Agent.structured_output_async()` both raise `DeprecationWarning`
  (`strands-py/src/strands/agent/agent.py:961-967,992-997`) and are the only call sites that
  invoke `self.model.structured_output(...)` directly (`strands-py/src/strands/agent/agent.py:1027`).
  The currently-recommended path, passing `structured_output_model=` into a normal agent
  invocation, instead runs the tool-forcing mechanism in Q2
  (`strands-py/src/strands/event_loop/event_loop.py:369-378`) - an ordinary tool-use turn, where
  schema and search coexist trivially because it isn't using Gemini's `response_schema` field at
  all, just a synthetic tool. Matters for Shin: whichever path a real integration takes changes
  whether "schema + search together" is even the right question - on the recommended path it's
  moot, on the deprecated path it's the exact mechanism above.
- No version gate confirmed the same way as Q1: no `"2.5"`/`"gemini-3"` conditional anywhere in
  `gemini.py`, and the request-shape tests run against the placeholder id `"m1"` regardless of
  schema or tool configuration (`strands-py/tests/strands/models/test_gemini.py:22-23`).
- Prompt assembly for the structured-output re-ask is one hardcoded inline string, not a
  template file, no few-shot examples: `DEFAULT_STRUCTURED_OUTPUT_PROMPT = "You must format the
  previous response as structured output."` -
  `strands-py/src/strands/tools/structured_output/_structured_output_context.py:16`.

## Q4 when and how hard it searches

- Dynamic retrieval: nothing. Grepped `strands-py/src` and both test trees for
  `dynamic_retrieval_config`, `dynamicThreshold`, `DynamicRetrievalConfig`, and `MODE_DYNAMIC` -
  zero hits anywhere in this repo. There is no threshold, default, or range exposed to a caller
  through this framework; if this repo was the one credited with exposing dynamic retrieval to
  users, that claim does not hold at the code level here.
- `googleSearchRetrieval` vs `googleSearch`: also nothing, and for a specific reason. Grepped
  `google_search_retrieval`/`googleSearchRetrieval` - zero hits repo-wide. The framework never
  hardcodes either surface name in code at all: `gemini_tools` is a raw passthrough list of
  `genai.types.Tool` objects the caller constructs themselves
  (`strands-py/src/strands/models/gemini.py:59` type annotation, extended into the request at
  `:289-290`). Whatever name the installed `google-genai` package's `Tool` type accepts is what
  goes out - strands performs no switching by model version because it never names the tool at
  all. This is itself informative: the version-name distinction, if it matters, lives entirely
  in the `google-genai` client library version pinned at `pyproject.toml:50` (`>=1.67.0,<3.0.0`),
  not in this framework.
- Forcing or forbidding search specifically: not possible through this framework's tool-choice
  mechanism. `_format_tool_choice` builds a `FunctionCallingConfig` with `AUTO`/`ANY`/(`ANY`
  narrowed to one name) - `strands-py/src/strands/models/gemini.py:293-325` - but this only
  applies to `tool_specs` (custom function declarations); Gemini's `ToolConfig.function_calling_config`
  does not address built-in tools like `google_search`, and nothing in `gemini.py` sets any
  mode on `gemini_tools` entries. There is no code path here to force the model to search or to
  forbid it from searching, only to steer among developer-defined functions.
- Cost or call control on search specifically: nothing. The only budget mechanism is the
  generic, provider-agnostic `Limits` (`turns`/`output_tokens`/`total_tokens`,
  `strands-py/src/strands/types/agent.py:90-122`, checked
  `strands-py/src/strands/event_loop/event_loop.py:69-102`), which caps the whole agent loop
  (all model calls, all tool calls) and is `None` (off) unless the caller sets it - it does not
  count or cap `googleSearch` invocations specifically, and there is no search-result caching or
  reuse anywhere in `gemini.py` (each turn re-sends the full tool config; nothing recognizes a
  repeated query).

## Nothing here on

- `googleSearchRetrieval`/dynamic retrieval threshold/`DynamicRetrievalConfig` - grepped
  `strands-py/src` and both test trees, zero hits (Q4).
- `groundingMetadata`/`grounding_metadata` - grepped `strands-py/src`, zero hits; Gemini's
  stream loop never reads it off the response even though the underlying SDK response object
  carries it (Q2, `strands-py/src/strands/models/gemini.py:622-624`).
- A confidence gate, "not sure" branch, or enum-banded certainty for any model output - grepped
  `strands-py/src/strands/models/gemini.py`, nothing (Q2).
- Cross-checking two sources against each other, or dropping a claim unsupported by a retrieved
  source - no such logic anywhere in `gemini.py` or the event loop (Q2).
- Price-specific extraction: currency, unit, or date capture, staleness detection - none of this
  exists in this repo; it is a generic agent framework with no domain logic for prices at all
  (Q2). Grepped `price`, `currency`, `stale` across `strands-py/src`, no matches tied to any
  extraction or validation mechanism.
- `media_resolution`, thinking-budget config, or image resize/crop before sending -
  `_format_request_content_part` sends the image bytes exactly as given
  (`strands-py/src/strands/models/gemini.py:168-174`); grepped for all four terms in `gemini.py`,
  zero hits (Q1).
- A version conditional of any kind (`if "2.5" in model_id`, `if "gemini-3"`, etc.) anywhere in
  `strands-py/src/strands/models/gemini.py` - grepped, zero hits (Q1, Q3, Q4).
- Search-specific cost tracking, caps, or result caching/reuse - none in `gemini.py`; only the
  generic, off-by-default `Limits` on the whole loop exists (Q4).

## Dead or unwired

- Gemini's `grounding_metadata` field is unwired, not dead code exactly - there is no code that
  reads it at all (no dead branch to point to), it is simply absent from the adapter. Proven by
  absence: `groundingMetadata`/`grounding_metadata` grep across `strands-py/src` returns nothing,
  and `strands-py/src/strands/models/gemini.py:622-680` (the whole streamed-event handling block)
  only ever touches `candidate.content`, `candidate.finish_reason`, and `event.usage_metadata`.
- The Bedrock citations pipeline (`strands-py/src/strands/event_loop/streaming.py:244-343`,
  `strands-py/src/strands/models/bedrock.py:1146-1176`) is live code, reachable and tested for
  Bedrock, but structurally unreachable from Gemini: nothing in
  `strands-py/src/strands/models/gemini.py` ever constructs a `"citation"` delta key, which is
  the only thing that pipeline listens for (`strands-py/src/strands/event_loop/streaming.py:244`).
  Proven by grep: `citation` appears in `gemini.py` zero times.
- the deprecated `Agent.structured_output()`/`structured_output_async()` call surface
  (`strands-py/src/strands/agent/agent.py:940-969,971-1027`) is live and tested but explicitly
  marked deprecated in favor of `structured_output_model=` on ordinary invocation - a caller
  reading only the current docs may never exercise the schema+search code path described in Q3
  at all, even though it exists and works.
