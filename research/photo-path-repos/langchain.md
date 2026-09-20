# langchain-ai/langchain

One line: it is a Python framework of composable chains/agents; the "ReAct agent" in this repo is
`langchain_classic.agents.react`, a deprecated (but functional) string-prompt loop superseded by
`langchain` v1's `create_agent` (tool-calling, not covered here since it lives in
`libs/langchain_v1` and uses model-native tool calls, not a text-parsed loop, so there is no
ReAct-style prompt text to quote there).

Read depth: cloned `--depth 1` into
`C:\Users\xujam\AppData\Local\Temp\claude\shin-repo-scan\langchain`. Opened:
`libs/langchain/langchain_classic/agents/{react,mrkl,self_ask_with_search,output_parsers}/*`,
`libs/langchain/langchain_classic/agents/agent.py` (AgentExecutor loop),
`libs/langchain/langchain_classic/agents/format_scratchpad/log.py`,
`libs/langchain/langchain_classic/output_parsers/{fix,retry,prompts}.py`,
`libs/langchain/langchain_classic/chains/constitutional_ai/{base,prompts}.py`,
`libs/langchain/langchain_classic/evaluation/{qa/eval_prompt.py,criteria/eval_chain.py}`,
`libs/langchain/langchain_classic/{tools/google_search,tools/google_serper,utilities/google_search}`.
Did not open: `libs/langchain_v1` (tool-calling `create_agent`, no text prompt to quote),
`libs/langchain/langchain_classic/evaluation/agents/trajectory_eval_chain.py` beyond its class
list (grades tool-call sequences, not answer content), `libs/partners/*` (no Google Gemini/Vertex
partner package exists in this repo, so no grounding-config code exists here to read), and the
real Google Search/Serper implementations, which are shims (see Dead/unwired).

## QA how the question becomes a query, and what happens after a bad one

- **FITS**, Self-ask-with-search few-shot prompt: the model itself decides whether a follow-up
  query is needed and writes it, one at a time, reading its own running scratchpad, until it
  emits `So the final answer is:`.
  `libs/langchain/langchain_classic/agents/self_ask_with_search/prompt.py:3-40`. This is an
  LLM-driven query-decomposition loop, not a template or a separate query-writing call, so it
  transfers directly to a second Gemini call: ask Gemini "are follow-ups needed" and let it draft
  the next question itself.
- **FITS**, ReAct loop structure and prompt: `Thought → Action → Action Input → Observation`,
  repeating until `Final Answer:`. Prompt text quoted verbatim:
  ```
  Answer the following questions as best you can. You have access to the following tools:
  {tools}
  Use the following format:
  Question: the input question you must answer
  Thought: you should always think about what to do
  Action: the action to take, should be one of [{tool_names}]
  Action Input: the input to the action
  Observation: the result of the action
  ... (this Thought/Action/Action Input/Observation can repeat N times)
  Thought: I now know the final answer
  Final Answer: the final answer to the original input question
  ```
  `libs/langchain/langchain_classic/agents/mrkl/prompt.py:1-15` (also duplicated inline in
  `libs/langchain/langchain_classic/agents/react/agent.py:103-121`). The scratchpad is rebuilt
  every turn by concatenating `action.log + "\nObservation: " + observation + "\nThought: "`,
  `libs/langchain/langchain_classic/agents/format_scratchpad/log.py:19-22`. This is the exact
  transferable structure: reason, act, observe, reason again, with the whole trace re-sent as
  growing prompt text on each of the two calls.
- **FREE**, Stop-sequence guard: `create_react_agent` binds `stop=["\nObservation"]` to the LLM
  by default so the model cannot hallucinate its own tool output.
  `libs/langchain/langchain_classic/agents/react/agent.py:137-141` (`"If True, adds a stop token
  of 'Observation:' to avoid hallucinates."`). Directly reusable: a second Gemini call in a
  loop should stop generation before it can fabricate a fake search result.
- **NEEDS OUR OWN SEARCH**, Reformulation on a bad result: not found. No code in the ReAct,
  MRKL, or self-ask agent path inspects an observation's quality and rewrites the query; the loop
  only ends on `Final Answer:` or `max_iterations`. Searched
  `libs/langchain/langchain_classic/agents/{react,mrkl,self_ask_with_search}/*.py` and
  `agent.py` for `reformulat|rewrite|retry.*quer|empty.*result` and found nothing.

## QB what is done to a result before it is believed

- **NEEDS OUR OWN SEARCH** (absent), No relevance scoring, reranking, dedup, or domain/date
  filtering anywhere in the agent path opened. The real Google/Serper wrappers that would fetch
  and clean pages live in the separate `langchain-community` repo, not this one (see Dead/unwired).
- **Absence confirmed loudly**: nothing here extracts a price, currency, or date from page text,
  or validates one. Grepped `libs/langchain/langchain_classic` for
  `price|currency|extract.*number|regex.*\$` outside unrelated test fixtures; nothing matched in
  the agent, chain, or evaluation code opened.

## QC how the answer is tied to sources, and what happens when they disagree

- **FITS**, Grounded grading prompt: a second LLM call grades a `STUDENT ANSWER` against a
  `CONTEXT` block for factual support, not just fluency:
  `libs/langchain/langchain_classic/evaluation/qa/eval_prompt.py:20-35`
  (`CONTEXT_PROMPT`, `"Grade the student answers based ONLY on their factual accuracy... It is
  OK if the student answer contains more information than the true answer, as long as it does not
  contain any conflicting statements."`). This is a direct pattern for a second Gemini call that
  checks "is this priced/named claim actually supported by what the first call said it saw."
- **FREE**, Reasoning-then-verdict parser with fallback regexes: `CriteriaResultOutputParser`
  tries `Y`/`N` at end of text, then start, then end-with-boundary, then falls back to the last
  line, and only then assigns `score = 1|0|None`, keeping the preceding text as `"reasoning"`.
  `libs/langchain/langchain_classic/evaluation/criteria/eval_chain.py:73-107`. Pure local text
  parsing of an already-returned grading call, no extra model call.
- **FITS (deprecated but real, not aspirational)**, Constitutional-AI critique/revise chain:
  a critique call runs per principle, and only if its output does **not** contain the literal
  string `"no critique needed"` does a revision call run and replace the response:
  `libs/langchain/langchain_classic/chains/constitutional_ai/base.py:262-292` (critique via
  `self.critique_chain.run(...)`, check `if "no critique needed" in critique.lower():`, else
  `revision = self.revision_chain.run(...)`). This is the class's real `_call` method, wired and
  functional, though the class carries `@deprecated(since="0.2.13", ... alternative=
  "langchain.agents.create_agent")`. Its own docstring (lines 62-146) shows the modern
  replacement using `model.with_structured_output(Critique)` with a `critique_needed: bool` field
  instead of string-matching "no critique needed", that structured version is documentation, not
  wired code in this repo, but the pattern (bool field named `critique_needed`) is a better model
  for a Gemini structured-output critique step than the deprecated string check.
- Citation-to-source span matching (code that matches answer text back to retrieved source text):
  **not found**. Searched the evaluation and chains directories opened for
  `citation|span|source_span|grounding_metadata` and found nothing matching that description;
  the `CONTEXT_PROMPT` above grades support by asking the model, not by code matching spans.
- What happens on source conflict: not found in any file opened; no two-source cross-check exists
  in the agent or evaluation code read.

## QD when does it stop, and what does it cost

- **FITS**, Iteration/time budget with two distinct exit behaviors, `AgentExecutor`:
  `max_iterations: int | None = 15` and `max_execution_time: float | None = None`
  (`libs/langchain/langchain_classic/agents/agent.py:1023,1028`), checked by `_should_continue`
  (`agent.py:1235-1238`). On budget exhaustion, `early_stopping_method`:
  - `"force"` (default) returns a hardcoded, clearly-degraded string, never sent back to the
    model: `AgentFinish({"output": "Agent stopped due to iteration limit or time limit."}, "")`
   , `agent.py:940-945`.
  - `"generate"` instead does one **forced final Gemini-equivalent call**: appends
    `"\n\nI now need to return a final answer based on the previous steps:"` to the scratchpad
    and predicts once more, parsing the result as a normal `Final Answer` if possible,
    `agent.py:946-968`. Finding of absence: this degraded answer is **not marked as degraded** in
    any way distinguishable from a normal finish; only `"force"` mode's string names the cutoff.
- **FITS**, Parser-repair loop inside the ReAct step itself: when the output parser raises
  `OutputParserException`, `AgentExecutor._iter_next_step` (with `handle_parsing_errors=True`)
  wraps the raw malformed text plus the parser's own error message into a synthetic
  `AgentAction("_Exception", observation, text)`, runs it through `ExceptionTool`, and yields it
  as an `Observation`, i.e. the next loop turn shows the model its own broken output and the
  parser's complaint, then asks it to try again inside the same Thought/Action loop.
  `libs/langchain/langchain_classic/agents/agent.py:1322-1361` and the same block duplicated for
  the async path at `agent.py:1461-1486`. The parser itself flags which failures are worth
  retrying via `send_to_llm=True`/`observation=` on `OutputParserException`
  (`libs/langchain/langchain_classic/agents/output_parsers/react_single_input.py:76-93`,
  distinguishing "missing `Action:` after `Thought:`" from "missing `Action Input:` after
  `Action:`" as two separate, precisely-worded repair messages).
- **FITS, the precise, general-purpose parser-repair mechanism (direct hit for Shin's gap)**:
  two standalone output-parser wrappers, usable around **any** parser, not just the agent loop:
  - `OutputFixingParser.parse()`: on `OutputParserException`, re-sends
    `NAIVE_FIX_PROMPT = "Instructions:\n--\n{instructions}\n--\nCompletion:\n--\n{completion}\n--\n\nAbove, the Completion did not satisfy the constraints given in the Instructions.\nError:\n--\n{error}\n--\n\nPlease try again..."`
    to the LLM, up to `max_retries: int = 1`, then raises `OutputParserException("Failed to
    parse")` if still broken.
    `libs/langchain/langchain_classic/output_parsers/fix.py:70-106` and the prompt text at
    `libs/langchain/langchain_classic/output_parsers/prompts.py:3-21`.
  - `RetryWithErrorOutputParser`: same idea but resends the **original prompt** plus the bad
    completion plus the exception's `repr()`, via
    `NAIVE_COMPLETION_RETRY_WITH_ERROR = "Prompt:\n{prompt}\nCompletion:\n{completion}\n\nAbove, the Completion did not satisfy the constraints given in the Prompt.\nDetails: {error}\nPlease try again:"`,
    also capped at `max_retries: int = 1`.
    `libs/langchain/langchain_classic/output_parsers/retry.py:180-187,392-419`. Both classes are
    publicly exported (`libs/langchain/langchain_classic/output_parsers/__init__.py:24,31-32`),
    not internally wired into any chain in this repo (they are opt-in utilities a caller wraps
    around their own parser); this is the exact shape Shin lacks: parse Gemini's JSON, on
    failure send back `{schema instructions, bad completion, exception text}` and ask again,
    capped at N retries, hard-fail after that.

## Nothing here on

- Confidence gates, enum-banded certainty, or a "not sure" branch anywhere in the agent code
  opened: not found.
- Any cost-per-question accounting (token or dollar): not found in the agent or evaluation code
  opened.
- Google Search grounding on the same call as an image (this repo has no Gemini/Vertex partner
  package at all; nothing to check).

## Dead or unwired

- `libs/langchain/langchain_classic/utilities/google_search.py` and
  `libs/langchain/langchain_classic/tools/google_search/tool.py` are pure re-export shims
  (`_import_attribute` / `create_importer`) pointing at `langchain_community.utilities` /
  `langchain_community.tools`, which is a separate repo not cloned here per the scoping
  instruction. No real Google Search/Serper request-construction code exists in this repo to
  quote. `libs/langchain/langchain_classic/tools/google_search/tool.py:1-27`,
  `libs/langchain/langchain_classic/utilities/google_search.py:1-19`.
- `ConstitutionalChain` (QC) is marked `@deprecated(since="0.2.13", removal="2.0.0")` at the
  class level, `chains/constitutional_ai/base.py:20-29`, though its `_call` is still real,
  functional code (not aspirational) as detailed above.
- The self-ask agent's `SelfAskWithSearchAgent`/`SelfAskWithSearchChain` classes are also
  `@deprecated`, `agents/self_ask_with_search/base.py:31,75`; the few-shot prompt text quoted
  above is real and unchanged by the deprecation.
