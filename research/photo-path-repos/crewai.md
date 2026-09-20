# crewAIInc/crewAI

One line: a Python multi-agent orchestration framework (agents, tasks, crews, flows) where each
agent runs its own ReAct-style tool-calling loop against an LLM; "search" is not built in, it is
one of many optional API-wrapper tools in the separate `crewai-tools` package (vendored here at
`lib/crewai-tools`).

Read depth: `lib/crewai/src/crewai/task.py`, `agent/core.py`, `agents/crew_agent_executor.py`,
`utilities/agent_utils.py`, `utilities/guardrail.py`, `tasks/llm_guardrail.py`,
`tasks/hallucination_guardrail.py`, `lite_agent.py`, `crew.py`, `llm.py`, `translations/en.json`,
`tools/agent_tools/*.py`, and a sample of `lib/crewai-tools/src/crewai_tools/tools/*search*`.
Not opened: memory/knowledge subsystems, the CLI, telemetry, A2A protocol code, flow visualizer,
and the ~30 other tool wrappers beyond `brave_search_tool.py`.

## QA how the query is built, reformulation

- NEEDS OUR OWN SEARCH: every search tool (`brave_search_tool.py:29`, `serpapi_google_search_tool.py`,
  `tavily_search_tool.py`, `exa_search_tool.py`) is a thin API wrapper that takes the query string
  the agent's LLM decided to pass as a tool argument. There is no template or decomposition layer;
  the LLM writes the query directly as JSON tool-call arguments inside its own reasoning loop.
- NEEDS OUR OWN SEARCH / nothing on reformulation: grepped the tool files and `crew_agent_executor.py`
  for a rewrite-on-weak-result mechanism; none exists. If a search returns nothing useful, nothing
  in the framework rewrites the query and retries automatically; the agent may simply choose to call
  the tool again in its next ReAct step, decided by the same undifferentiated LLM prompt, not a
  coded trigger.

## QB what is done to a result before it is believed

- FREE: `HallucinationGuardrail` (`tasks/hallucination_guardrail.py:19-100`) is explicitly a
  **no-op placeholder** in open source. Its docstring: `"""Hallucination Guardrail Placeholder for
  CrewAI. This is a no-op version... for the open-source repository."""` Its `__call__` (line 84)
  returns `True, task_output.raw` unconditionally unless a private `_validate_output_hook` is
  monkeypatched in (enterprise-only), logging `"Premium hallucination detection skipped (use for
  free at https://app.crewai.com)"` (line 96). The `threshold`/faithfulness-score API surface exists
  but does nothing.
- Nothing on price/number/currency extraction: grepped `crewai-tools` search tools and the guardrail
  files for any numeric/currency/date parser or validator; none exists anywhere in this repo. This
  is the founder's second complaint and there is no mechanism here that touches it at all, not even
  a stub.
- Nothing on reranking, relevance scoring, embeddings-with-thresholds, or dedup by key applied to
  search results specifically; the RAG-flavored tools (`website_search_tool.py`, `pdf_search_tool.py`)
  use embeddings for local document retrieval, not for live web search results, so out of scope.

## QC answer tied to sources, disagreement between two agents

- **No, nothing reconciles two agents that disagree.** `AskQuestionTool`
  (`tools/agent_tools/ask_question_tool.py:14-27`) and `DelegateWorkTool`
  (`tools/agent_tools/delegate_work_tool.py:16-29`) are one-directional: one agent asks or hands
  work to a named coworker and gets a single string back. Neither collects two independent answers
  to the same question, compares them, or arbitrates a conflict. The hierarchical process
  (`crew.py:1531` `_create_manager_agent`) gives a manager agent delegation authority
  (`self.manager_agent.allow_delegation = True`, `crew.py:1533`) to assign and re-assign tasks, not
  to judge between two agents' conflicting outputs. Grepped the whole `crewai` source for
  "consensus" and "disagree": zero hits.
- FITS: `LLMGuardrail` (`tasks/llm_guardrail.py:49-96`) is the closest thing to answer-checked-
  against-a-rule: it spins up a fresh `Agent` whose only job is to judge one task's output against
  a natural-language description and return a structured `LLMGuardrailResult{valid: bool, feedback:
  str|None}` via `agent.kickoff(query, response_format=LLMGuardrailResult)` (line 92). This is a
  second Gemini-style call judging the first call's output on the same input; it is a real,
  portable "check one agent's answer" mechanism, just not a two-agent cross-check.
- Nothing on citation/source-span matching: no code anywhere matches answer text back to a specific
  retrieved source span; grounding metadata from any provider is never inspected.

## QD loop exit, cost, retry/backoff

- FREE: **guardrail retry cap defaults to 3**, i.e. 4 total attempts
  (`task.py:279-281`: `guardrail_max_retries: int = Field(default=3, description="Maximum number of
  retries when guardrail fails")`; same default in `lite_agent.py:277-279`). Loop:
  `max_attempts = self.guardrail_max_retries + 1` (`task.py:1343`), iterated with
  `for attempt in range(max_attempts)` (`task.py:1346`). On exhaustion it raises:
  `f"Task failed {guardrail_name} validation after {self.guardrail_max_retries} retries. Last
  error: {guardrail_result.error}"` (`task.py:1388-1390`) — a hard failure, not a silently-degraded
  answer.
- FITS: **each retry changes the prompt**, it does not just repeat the call. On failure the code
  builds `I18N_DEFAULT.errors("validation_error")` (`task.py:1391-1394`), which is
  (`translations/en.json:55`): `"### Previous attempt failed validation: {guardrail_result_error}\n\n\n###
  Previous result:\n{task_output}\n\n\nTry again, making sure to address the validation error."` and
  re-invokes `agent.execute_task(task=self, context=context, tools=tools)` (`task.py:1409-1414`),
  feeding the prior output and the judge's feedback back in. This is the concrete "reformulate and
  retry" shape, applicable as a second grounded call.
- FITS: **agent tool-call loop cap `max_iter` defaults to 25** (`agents/agent_builder/base_agent.py:
  286-288`: `max_iter: int = Field(default=25, description="Maximum iterations for an agent to
  execute a task")`), enforced by `has_reached_max_iterations(iterations, max_iterations)` →
  `iterations >= max_iterations` (`utilities/agent_utils.py:363-372`), checked every loop turn, e.g.
  `agents/crew_agent_executor.py:365` inside `while not isinstance(formatted_answer, AgentFinish)`.
- FITS: on hitting the cap, `handle_max_iterations_exceeded` (`utilities/agent_utils.py:376-421`)
  does **one more forced LLM call** instead of just stopping: it appends the
  `force_final_answer` message (`translations/en.json:47`: `"Now it's time you MUST give your
  absolute best final answer. You'll ignore all previous instructions, stop using any tools, and
  just return your absolute BEST Final answer."`) and calls `llm.call(messages, callbacks=callbacks)`
  (line 405), returning that as the final `AgentFinish`. The returned answer carries **no
  degraded/truncated flag**; a caller cannot tell from the output alone that it was forced.
- FREE: `max_execution_time` (a wall-clock budget, not an iteration count) defaults to `None`
  (`agent/core.py:258-261`, also `lite_agent.py:240`), unset by default, only enforced if a caller
  sets it; on timeout it raises with message `f"Task '{task.description}' execution timed out after
  {timeout} seconds. Consider increasing max_execution_time or optimizing the task."`
  (`agent/core.py:1057`).
- Nothing on LLM-call-level retry/backoff: grepped `llm.py` and `llms/base_llm.py` for
  retry/backoff on a failed model call; none exists there. Exponential backoff exists only for MCP
  tool-connection retries (`mcp/client.py:711`, `mcp/tool_resolver.py:575`,
  `tools/mcp_tool_wrapper.py:87-94`), an unrelated code path, not the model call itself.
- Nothing on cost accounting per question: no per-call or per-task token/dollar-cost ledger found
  outside generic telemetry/usage-metrics plumbing not tied to the guardrail or iteration loops.

## Nothing here on

- Image-plus-search on one request, resolution/media hints, thinking budget, response-schema-plus-
  grounding-together: out of scope for this batch (batch one's Q1/Q3), not investigated.
- Site/recency/language search constraints: not found in any wrapper tool signature checked
  (`brave_search_tool.py` exposes `freshness`, `safesearch`, but this is per-tool API surface, not a
  framework-level constraint mechanism, and multiple queries per question / merge-of-results logic:
  none found, each tool call returns one result set consumed directly by the calling agent's
  reasoning).

## Dead or unwired

- `HallucinationGuardrail` (`tasks/hallucination_guardrail.py`): present in the class hierarchy,
  importable, constructible with `context`/`threshold`/`tool_response` parameters that are stored
  but never read inside the open-source `__call__` (lines 84-100). It is a paywall stub, confirmed
  by its own module docstring and the runtime warning it logs on every use.
- `max_retries` on `Task` (`task.py:275-278`) is a deprecated alias that reassigns into
  `guardrail_max_retries` via a validator (`task.py:574-582`); still functional but explicitly
  slated for removal in v1.0.0.
