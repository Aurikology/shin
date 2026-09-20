# microsoft/semantic-kernel

One line: a multi-language (C#, Python, Java) agent orchestration SDK; the Google/Gemini
connector is a strongly-typed request/response mapper over the Gemini REST API, built by
Microsoft engineers, not a Google-maintained connector.

Read depth: `dotnet/src/Connectors/Connectors.Google` (all 47 files) and
`Connectors.Google.UnitTests` (all test files, grepped and key ones read in full);
`python/semantic_kernel/connectors/ai/google/**` (google_ai + vertex_ai, 21 files) and its
`python/tests/unit/connectors/ai/google/**` mirror; `python/semantic_kernel/connectors/google_search.py`
(the unrelated Custom Search Engine connector) and its test. Did not open Java (no Gemini
connector there worth the scope) or the Bing/Azure connectors.

## Q1 image plus search

- Cannot be tested: **no grounding/web-search tool surface exists in this connector at all**
  (see "Nothing here on"). Image attachment itself is real: `CreateGeminiPartFromImage` builds
  either an `InlineData` part (base64, from `ImageContent.Data`) or a `FileData` part (a
  `file_uri`), mutually exclusive, at
  `dotnet/src/Connectors/Connectors.Google/Core/Gemini/Models/GeminiRequest.cs:286-313`. The
  union type carrying these fields is
  `dotnet/src/Connectors/Connectors.Google/Core/Gemini/Models/GeminiPart.cs:13-34`
  (`text` / `inlineData` / `fileData` / `functionCall` all siblings on one `GeminiPart`).
- Since the only `tools` payload the connector can build is function-calling
  (`GeminiRequest.cs:44-46,60-69`, comment at line 62: `"NOTE: Currently Gemini only supports
  one tool i.e. function calling."`), an image part and a *function-calling* tool can
  coexist in one request (they are independent fields: `Contents` vs `Tools`, no code path
  checks one against the other), but an image part and a *search grounding* tool cannot, because
  the latter is never modeled.

## Q2 stopping being wrong

- `ValidateAutoInvoke` throws `ArgumentException` if auto-invoke is requested with
  `CandidateCount != 1`,
  `dotnet/src/Connectors/Connectors.Google/Core/Gemini/Clients/GeminiChatCompletionClient.cs:963-971`.
  Not a correctness check, a concurrency guard.
- `dotnet/src/Connectors/Connectors.Google/Core/Gemini/Clients/GeminiChatCompletionClient.cs:809`
  throws `KernelException("Prompt was blocked due to Gemini API safety reasons.")`, a
  safety-block detector, not a fact-check.
- No grounding-metadata field is read or checked anywhere (see Nothing here on): nothing
  verifies an answer against a retrieved source because nothing retrieves.

## Q3 same shape every time

- `ResponseSchema`/`ResponseMimeType` are real API-level fields on `generationConfig`
  (`GeminiRequest.cs:436-437`, `ConfigurationElement` at `GeminiRequest.cs:626-632`), accepting
  a CLR `Type`, `JsonElement`, `JsonNode`, `JsonDocument` or `KernelJsonSchema`, all normalized
  through `GetResponseSchemaConfig` (`GeminiRequest.cs:441-460`) into an OpenAPI-3-shaped schema.
- **Schema and tools are never checked against each other.** `AddConfiguration` (which sets
  `ResponseSchema`) and `AddFunction` (which sets `Tools`, called from
  `dotnet/src/Connectors/Connectors.Google/GeminiToolCallBehavior.cs:136,192`) run on
  independent code paths with no mutual-exclusion check anywhere in
  `GeminiChatCompletionClient.cs` or `GeminiRequest.cs`, and no unit test in
  `Connectors.Google.UnitTests/Core/Gemini/GeminiRequestTests.cs` builds a request with both set
  to observe a rejection, grepped, none exists. So the connector **permits** function-tools +
  schema together, silently; it says nothing about search-tools + schema because no search tool
  exists.
- Python mirrors this: `google_ai_prompt_execution_settings.py:15,32,39` and
  `vertex_ai_prompt_execution_settings.py:27,52-60` list `response_schema`, `tools`, and
  `tool_config` as sibling optional fields with no validator between them.

## Q4 when and how hard it searches

- **Cannot answer: there is no search mechanism in this connector to gate.** No
  `dynamic_retrieval_config`, `dynamicThreshold`, tool-choice `ANY|AUTO|NONE` for a search tool,
  or search-call counter exists (function-calling has its own unrelated `ToolCallBehavior`
  enum, not a search mode).

## Nothing here on

- **`googleSearch` and `googleSearchRetrieval` (the two grounding surface names): both absent.**
  `grep -rniE 'googlesearch|grounding|dynamicretrieval|dynamic_retrieval|dynamicThreshold' dotnet/src/Connectors/Connectors.Google dotnet/src/Connectors/Connectors.Google.UnitTests python/semantic_kernel/connectors/ai/google python/tests/unit/connectors/ai/google` returns zero hits. The only `GoogleSearch*` symbols anywhere in scope
  (`python/semantic_kernel/connectors/google_search.py`) are a wrapper around the unrelated
  Google Programmable Search Engine (Custom Search JSON API), a plain HTTP text-search plugin,
  not the Gemini API's built-in web-grounding tool. `GeminiTool.cs:13-58` has exactly one
  field, `functionDeclarations`.
- No model-version gate for a search tool (none exists to gate). No dynamic retrieval config,
  no forced/forbidden-search mode, no search-call counter or cache.

## Dead or unwired

- None found specific to grounding, because there is no grounding code to be dead; the whole
  surface is simply unimplemented, not implemented-and-unwired.
