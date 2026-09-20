# spring-projects/spring-ai

One line: a Java framework wrapping `com.google.genai` (Google's unified GenAI SDK); its
`spring-ai-google-genai` module is the single module covering both Vertex AI and AI Studio (no
separate Vertex-Gemini module exists in this checkout).

Read depth: opened `models/spring-ai-google-genai/src/main/java/.../google/genai/GoogleGenAiChatModel.java`,
`GoogleGenAiChatOptions.java`, `common/GoogleGenAiConstants.java`, and
`src/test/java/.../CreateGeminiRequestTests.java`, `GoogleGenAiChatModelIT.java`,
`GoogleGenAiChatModelMLDevIT.java`. Did not open the embedding/image modules or the
auto-configuration property classes beyond one grep; did not open MCP or observability code.

## Q1 image plus search
- Media (image) parts are built into the same `Content`/`Part` list as the rest of the user
  message: `mediaToParts()` turns `byte[]` into `Part.fromBytes(data, mimeType)` and a URI/String
  into `Part.fromUri(uri, mimeType)`, `GoogleGenAiChatModel.java:326,334,339`, called from
  `messageToGeminiParts` at `GoogleGenAiChatModel.java:259`.
- The Google Search tool is built into the same `GenerateContentConfig` as those contents, when
  `GoogleGenAiChatOptions.googleSearchRetrieval` is true: `Tool.builder().googleSearch(GoogleSearch.builder().build())`
 , `GoogleGenAiChatModel.java:751-755`.
- Both reach one call: `this.genAiClient.models.generateContent(request.modelName, request.contents, request.config)`
 , `GoogleGenAiChatModel.java:966`, where `request.contents` carries the media Part and
  `request.config` carries the Google Search tool. Nothing in the method rejects the pairing.
- No integration test in this module actually exercises image+search together;
  `GoogleGenAiChatModelIT.java:101-115` tests `googleSearchRetrieval(true)` text-only on
  `GEMINI_2_5_PRO` and `GEMINI_2_5_FLASH`, no branch by model.

## Q2 stopping being wrong
Nothing found. No retry-on-weak-answer, confidence gate, or grounding-metadata verification in
this module; searched `GoogleGenAiChatModel.java` and `metadata/` package for "grounding",
"citation", "verify" (no hits beyond field pass-through).

## Q3 same shape every time
- `responseSchema` maps to a real API field, `configBuilder.responseJsonSchema(jsonToSchema(...))`
 , `GoogleGenAiChatModel.java:693-694`, set in the same `configBuilder` that also receives tools
  (`:751-755`) and toolConfig (`:762-780`). No exception guards the combination; nothing checked
  for "mutually exclusive" near schema/tool code.
- The one explicit mutual-exclusion comment in the module is unrelated to grounding: thinking
  budget vs. thinking level, `common/GoogleGenAiThinkingLevel.java:35`, "mutually exclusive. You
  cannot use both in the same request".

## Q4 when and how hard it searches
- Only one option field exists, `googleSearchRetrieval` (a boolean), `GoogleGenAiChatOptions.java:189,356`
 , which always maps to `com.google.genai.types.GoogleSearch` with no parameters set (`GoogleSearch.builder().build()`,
  `GoogleGenAiChatModel.java:753`). No dynamic-retrieval threshold field found: grepped module for
  "dynamicRetrieval", "DynamicRetrievalConfig", "dynamicThreshold", zero hits.
- No second surface name (`googleSearchRetrieval` as an API type, distinct from `googleSearch`)
  exists in code; grepped whole repo for `GoogleSearchRetrieval\b` outside the boolean
  getter/setter, only the Spring `@ConfigurationProperties` setter name, still mapping to the
  same `GoogleSearch` type. No version gate switches between two tool shapes; one shape is sent
  for every model, confirmed by the same IT class using it unmodified on both `GEMINI_2_5_PRO`
  and `GEMINI_2_5_FLASH` (`GoogleGenAiChatModelIT.java:101-115`).
- No search cap, count, or force/forbid (`mode: ANY|AUTO|NONE` on the search tool itself) found;
  `toolConfig`/`FunctionCallingConfig` mode logic (`:762-800`) applies to function-calling tools,
  not to the search tool.

## Nothing here on
Confidence gating, second-query-on-weak-answer, citation verification against retrieved sources,
price-shaped extraction, dynamic retrieval threshold.

## Dead or unwired
None found; every mechanism read (media parts, search tool, response schema, tool config) is
reached from `createGeminiRequest` and consumed by the single `generateContent` call site.
