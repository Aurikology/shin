# google/adk-docs

One line: this is Google's documentation site for the Agent Development Kit (ADK), a Python/TypeScript/Java/Kotlin/Go framework that wraps the Gemini API; the repo is markdown docs plus small runnable example scripts, not the ADK library itself. Everything below is a documentation claim unless marked "runnable sample."

Read depth: cloned `google/adk-docs` shallow (--depth 1). Opened `docs/tools/limitations.md`, `docs/grounding/google_search_grounding.md`, `docs/grounding/index.md`, `docs/integrations/google-search.md`, `docs/agents/llm-agents.md` (structured-output section), `docs/tools-custom/function-tools.md`, and the runnable samples `examples/python/snippets/tools/built-in-tools/google_search.py` and `examples/python/snippets/get-started/google_search_agent/agent.py`. Grepped the whole tree for `dynamic_retrieval`, `dynamicThreshold`, `DynamicRetrievalConfig`, `googleSearchRetrieval`, `google_search_retrieval` and for `schema`/`output_schema` near tool usage. Did not open `docs/api-reference/agentconfig/index.html` in full (it's a >80k-line auto-generated JSON-schema dump of `google.genai` types, not ADK prose) beyond spot-checking the fields it lists.

## Q1 image plus search
- Nothing here. No doc page or sample shows an image `Part`/file upload on the same request as `google_search`. The two runnable google_search samples (`examples/python/snippets/get-started/google_search_agent/agent.py:17-27`, `examples/python/snippets/tools/built-in-tools/google_search.py:26-33`) are text-only, `tools=[google_search]` with no image content. Documentation.

## Q2 stopping being wrong
- **Documentation.** `docs/grounding/google_search_grounding.md:7`: *"The agent automatically decides when to search and seamlessly incorporates the results into its responses with proper citations."* No condition, threshold, or retry logic named on this page for when a second search fires.
- **Documentation.** `docs/grounding/google_search_grounding.md:60`: *"When a user's prompt requires information that the model was not trained on, or that is time-sensitive, the agent's underlying Large Language Model intelligently decides to invoke the `google_search` tool"*, decision is left entirely to the model, no ADK-side gate described.

## Q3 same shape every time
- **Documentation, and this is the headline finding for Q3.** `docs/agents/llm-agents.md:473-480`, under "Warning: Using `output_schema` with `tools`": *"Using `output_schema` with `tools` in the same LLM request is only supported by specific models, including Gemini 3.0. For other models, ADK falls back to a `set_model_response` function tool to collect the structured output, which may not work reliably. In such cases, consider using sub-agents that handle output formatting separately."* This confirms Shin's belief in the direction claimed (2.x unreliable, 3.0 supported) but as an ADK-level fallback behavior, not a documented hard API rejection, and it is about `tools` generally (function tools included), not `google_search` specifically.

## Q4 when and how hard it searches
- **Documentation, the priority finding.** `docs/tools/limitations.md:15-25` (section "One tool per agent limitation"): *"the following ADK Tools can only be used by themselves, without any other tools, in a single agent object: ... Google Search ... Agent Search"*, quoted, this is ADK's own stated restriction on combining `google_search` with a custom function tool in one agent. The same page states this "ONLY for Search in ADK Python v1.15.0 and lower" (`docs/tools/limitations.md:9-13`) and that v1.16.0+ ships a workaround.
- **Documentation.** `docs/integrations/google-search.md:20-24`: *"Warning: Single tool per agent limitation — This tool can only be used ***by itself*** within an agent instance."* Same restriction restated on the tool's own page.
- **Documentation.** `docs/tools/limitations.md:211-220` names two workarounds: wrapping `google_search` in a sub-agent via `AgentTool.create()`, or passing `bypass_multi_tools_limit=True` to `GoogleSearchTool`/`VertexAiSearchTool` in ADK Python (v1.16.0+).
- **Documentation.** `docs/integrations/google-search.md:15`: *"The `google_search` tool is only compatible with Gemini 2 models."* A version gate, quoted, no code enforcement seen in this repo (docs-only repo).
- Dynamic retrieval: nothing in any hand-written `.md` page (grepped whole tree, zero `.md` hits for `dynamic_retrieval`/`dynamicThreshold`/`DynamicRetrievalConfig`). The only hits are in `docs/api-reference/agentconfig/index.html` (auto-generated `google.genai` JSON-schema reference, not ADK-authored prose), where `dynamicRetrievalConfig` nests only under `googleSearchRetrieval` (the legacy surface name), never under `googleSearch`, consistent with dynamic retrieval being tied to the old surface, but this is a generated schema dump, not documentation prose, and I did not find a default value or numeric range stated in prose anywhere.

## Nothing here on
- Forcing/forbidding search via tool_config mode ANY|AUTO|NONE: not mentioned in any grep hit.
- Cost/call counting or caching of search results: not mentioned.
- Citation/grounding metadata being checked against the answer (vs. just rendered): not found; grounding pages describe rendering citations, not verifying them.
- `media_resolution`, image cropping/resizing before send: not found in the files opened.

## Dead or unwired
- Not applicable in the same sense as a code repo; this is a docs site. The `bypass_multi_tools_limit` workaround and `set_model_response` fallback are described as library behavior in `google/adk-python`, not verifiable from this repo alone (this repo has no `.py` implementation of them, only docs referencing GitHub links into `adk-python`).
