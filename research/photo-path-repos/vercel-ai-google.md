# vercel/ai (packages/google, packages/google-vertex)

One line: it is a thin request/response translator (build a JSON body, POST it, parse the JSON
back) with zero domain validation between fields; nothing in this package checks whether one
option is compatible with another before sending it to Google, and google-vertex reuses the
exact same `GoogleLanguageModel` class from `@ai-sdk/google` (google-vertex/src/google-vertex-provider-base.ts:297),
so every finding below applies to both the Gemini Developer API and Vertex AI paths.

Read depth: opened in full: src/google-language-model.ts, src/google-prepare-tools.ts (+.test.ts),
src/convert-to-google-messages.ts, src/google-model-capabilities.ts (+.test.ts),
src/sanitize-response-json-schema.ts, src/google-error.ts, src/google-supported-file-url.ts,
src/google-files.ts (partial), src/interactions/google-interactions-language-model.ts (partial,
getArgs + response_format block), src/interactions/prepare-google-interactions-tools.ts,
src/interactions/extract-google-interactions-sources.ts, src/interactions/stream-google-interactions.ts,
CHANGELOG.md (packages/google, full grep pass, 3956 lines). Also grepped (not fully read):
google-language-model.test.ts (1815-3500, 6560-7400 windows), google-prepare-tools.test.ts,
google-interactions-language-model.test.ts (structured-output and google_search describe blocks).
Deliberately not read: realtime/, speech-translation/, transcription/, gemini-transcription/,
google-embedding-model.ts, google-image-model.ts, google-video-model.ts, google-batch.ts, the
anthropic/ and xai/ subtrees of google-vertex (unrelated to Gemini text/vision+tools path),
google-json-accumulator.ts (streaming accumulation only, not schema/search related once confirmed
sanitize-response-json-schema.ts has no model gating). google-vertex/src/google-vertex-language-model.test.ts
exists but there is no google-vertex-language-model.ts source file (Vertex has no override of
GoogleLanguageModel), confirming reuse rather than a parallel implementation.

## Q1 image plus search

- Answer: YES, an image part and the googleSearch tool can be sent on the same request. Nothing
  rejects, warns, strips, or throws on that combination anywhere in this package.
- The two paths are structurally independent and both funnel into one return object:
  - Image/file part -> `inlineData`: `convert-to-google-messages.ts:325-332` (the `case 'data':`
    branch of a user message `file` part) `parts.push({ inlineData: { mimeType: resolveFullMediaType({ part }), data: convertToBase64(part.data.data) } })`.
    This function takes only `prompt`; it has no parameter for `tools` and never inspects them.
  - googleSearch tool -> `tools` array: `google-prepare-tools.ts:80-89`, `case 'google.google_search': if (supportsGemini2Tools) { googleTools.push({ googleSearch: { ...tool.args } }); }`.
    This function takes only `tools`/`toolChoice`/`modelId`; it has no parameter for `contents` and
    never inspects message parts.
  - Both results are combined unconditionally in `google-language-model.ts:306-327` (`contents`
    from `convertToGoogleMessages`, `googleTools` from `prepareTools`) and written into the same
    request body at `google-language-model.ts:419-422`: `contents,` / `tools: googleTools,`. No
    conditional anywhere in that 60-line return block checks content-part types against tool types.
- Grep proving absence of a rejection: `grep -n "throw\|Error(" src/google-language-model.ts src/google-prepare-tools.ts src/convert-to-google-messages.ts` returns only tool-choice exhaustiveness, system-message-ordering, and Vertex-provider-reference throws (`google-prepare-tools.ts:305`, `convert-to-google-messages.ts:261,296,383,405,412`) -- none reference image/file parts or search/grounding tools.
- No test sends both together and no test asserts an error for the combination. Grep of
  `google-language-model.test.ts` for `responseFormat`/`google_search`/`googleSearch` co-occurring
  within 40 lines returns nothing; grep of `google-prepare-tools.test.ts` shows only single-tool
  cases plus one warning test for pre-Gemini-2 models (`google-prepare-tools.test.ts:889-907`,
  unrelated to images). "image search" text in tests (`google-language-model.test.ts:2452,6766`)
  refers to `groundingChunks[].image` (search results that happen to be images), not an image
  content part being sent as input -- confirmed by reading `google-language-model.test.ts:2450-2500`.
- What rides alongside the same request, each independently built, matters for a grocery-photo
  call because they all land in one `generationConfig`/`contents`/`tools` body with no interaction
  checks between them:
  - `mediaResolution`: `google-language-model.ts:414-416`, only sent if `googleOptions?.mediaResolution` is set; enum values `MEDIA_RESOLUTION_UNSPECIFIED|LOW|MEDIUM|HIGH` (`google-language-model-options.ts:148-153`). Not set by default -- the provider sends no resolution hint unless the caller supplies one.
  - `thinkingConfig`/`thinkingBudget`: `google-language-model.ts:340-343` (merged from `resolveThinkingConfig` and provider options), schema at `google-language-model-options.ts:66-69` (`thinkingBudget: number`, `thinkingLevel`).
  - `temperature`: passed straight through, `google-language-model.ts:131` (destructured from call options) into `generationConfig.temperature` at `google-language-model.ts:383`. No clamping or validation in this package.
  - `systemInstruction`: built in `convertToGoogleMessages` (`google-language-model.ts:306`) and attached at `google-language-model.ts:420`, except dropped for Gemma models (`isGemmaModel ? undefined : systemInstruction`).
  - Image resize/crop: absent. `grep -rn "resize\|crop\|sharp(" src --include=*.ts` (excluding tests) returns zero matches. The provider sends whatever bytes/base64 the caller passed in `part.data.data` unmodified (`convert-to-google-messages.ts:326-331`); it performs no downscaling, compression, or format normalization before upload. `google-supported-file-url.ts` (20 lines total) only pattern-matches `https://generativelanguage.googleapis.com/v1beta/files/...` and YouTube URLs (`google-supported-file-url.ts:1-19`) -- it does not check mime type or size at all, contrary to what its name suggests; there is no size/mime gate in this package for inline image bytes.

## Q2 stopping being wrong

- Retry logic for a failed/wrong `doGenerate`/`doStream` call is NOT in this package. Grep:
  `grep -n "retry\|Retry" src/google-language-model.ts src/google-error.ts src/google-provider.ts` returns zero matches. `google-error.ts` (27 lines, full file read) is purely a response-shape parser -- `googleErrorDataSchema` (code/message/status/details) feeding `createJsonErrorResponseHandler` (`google-error.ts:9-27`) -- it formats whatever error Google's API returned, it never decides to retry or re-ask. Retry/backoff for failed calls lives in `ai` core, not this provider.
- The one retry loop that does exist in this package is connection-level, not correctness-level:
  `interactions/stream-google-interactions.ts:16-17,41-42,65,126-131` -- `DEFAULT_MAX_RETRIES = 3`,
  `DEFAULT_RETRY_DELAY_MS = 500`, reconnects an SSE stream with `?last_event_id=` after an
  unexpected disconnect (documented at `stream-google-interactions.ts:24-30`: undici's body timeout
  on long-idle agent runs). It resumes the same in-flight interaction; it does not re-ask the model,
  re-search, or check the answer -- it matters only for whether a long agentic run finishes at all,
  not whether its answer is right.
- Grounding/citation handling only extracts sources for display; it does not verify claims are
  supported. `extractSources()` (`google-language-model.ts:1422-1530`) maps `groundingChunks` (web,
  image, retrievedContext, maps) straight into `LanguageModelV4Source` objects -- URL/title copy,
  no cross-check against the generated text.
  `interactions/extract-google-interactions-sources.ts:42-106` (`annotationToSource`) and its
  `builtinToolResultToSources` (`extract-google-interactions-sources.ts:121-160+`) do the same:
  citation -> source object, format conversion only.
- `groundingSupports[].confidenceScores`/`confidenceScore` is parsed by the Zod schema
  (`google-language-model.ts:1584-1585`, inside `getGroundingMetadataSchema()`,
  `google-language-model.ts:1532-1597`) but never read anywhere else. Grep:
  `grep -n "groundingSupports\|confidenceScore" src/*.ts src/interactions/*.ts` (excluding tests)
  only returns the three schema-definition lines above. The field that would let a caller gate on
  "how confident is the model this claim is grounded" is captured off the wire and then discarded
  -- there is no code path that reads a confidence score to decide anything. This is the field a
  product would need to build any "don't trust a low-confidence identification" gate, and it is
  currently dead on arrival in this provider.
- No budget/cap on search-and-check loops was found because there is no such loop: `google_search`
  is a single server-side tool call per turn like any other tool
  (`google-prepare-tools.ts:80-89`); whether the model searches again is entirely up to Gemini's
  own tool-use policy on Google's server, invisible to this package.

## Q3 same shape every time

- Answer: nothing in this package's client-side code makes responseSchema (structured output) and
  googleSearch mutually exclusive, on any model id, on the standard `generateContent` path used by
  `GoogleLanguageModel` (the class both `@ai-sdk/google` and `@ai-sdk/google-vertex` use).
  `responseMimeType`/`responseJsonSchema` (`google-language-model.ts:396-406`) and `tools: googleTools`
  (`google-language-model.ts:422`, built by `prepareTools` including `googleSearch` at
  `google-prepare-tools.ts:82`) are both assembled independently and placed in the same return
  object (`google-language-model.ts:378-427`) with no conditional between them. `prepareTools`
  (`google-prepare-tools.ts:20-320`, full file read) never inspects `responseFormat` and has no
  parameter for it.
- Positive evidence this combination is an exercised, supported path (not just "untested"):
  `CHANGELOG.md:1683` (packages/google), version 3.0.6: `2043612: fix(google): parse structured
  output when using google provider tools` -- a bug was found and fixed in parsing structured
  output *while* Google provider tools (which includes `googleSearch`) were in use, meaning the
  combination is shipped and actively maintained, not rejected.
- Model-id gating that does exist is about which models can use googleSearch/provider tools at
  all, and separately about combining function-tools with provider-tools -- neither is about
  schema+search:
  - `google-model-capabilities.ts:7-10` defines `gemini1ModelPattern`, `gemini2ModelPattern`
    (matches any `gemini-2*`, which includes 2.5), `gemini25ModelPattern`, `geminiModelPattern`.
  - `google-model-capabilities.ts:30-34`: `usesGemini3Features = isGeminiModel && !isKnownOlderModel`,
    where `isKnownOlderModel` is true for anything matching `gemini-1*`, `gemini-pro(-vision)?`,
    `gemini-robotics-er-1.5*`, or `gemini-2*` -- so **Gemini 2.5 models are classified as NOT
    Gemini-3, and Gemini 3.x models are classified as Gemini-3** by exclusion, not an explicit
    "3." string match (there is no literal `"3."` or `"gemini-3"` pattern in this file; the
    classification is "not older" rather than "named 3.x").
  - `google-prepare-tools.ts:67-72`: `if (hasFunctionTools && hasProviderTools && !usesGemini3Features)` emits a warning "combination of function and provider-defined tools" -- this is the real "2.5 vs 3.x" gate in this package, and it governs **function-calling + provider tool** combinations (e.g. a custom function tool alongside googleSearch), confirmed by `CHANGELOG.md:683,1288`: `01fa606: feat(provider/google): support combining built-in tools with function calling on Gemini 3`. It says nothing about responseSchema.
  - `google-model-capabilities.ts:40-41`: `supportsFileSearch = gemini25ModelPattern.test(modelId) || usesGemini3Features` -- file_search tool needs Gemini 2.5 or 3.x; again unrelated to schema+search.
  - Verified: `grep -n "2\.5\|gemini-3\|3\." src/google-model-capabilities.ts` finds no schema/search-specific gate; the only literal version strings in that file are `gemini-1`, `gemini-2`, `gemini-2\.5`.
- `sanitize-response-json-schema.ts` (65 lines, full file read) does no model gating at all -- it
  only rewrites `const` to a single-value `enum` (`sanitize-response-json-schema.ts:8-21`,
  comment: "Google does not support `const`... in `responseJsonSchema`") because Google's schema
  dialect lacks `const`, unrelated to tools.
- No test proves the schema+search combination is rejected, on any model id. Grep across
  `google-language-model.test.ts` for `responseFormat` and `google_search`/`googleSearch`
  co-occurring within a 40-line window (`awk` scan) returns zero matches -- the two features are
  always tested in isolation in this file.
- On the newer Interactions API surface (`interactions/google-interactions-language-model.ts`),
  there IS a real, coded rejection -- but it is scoped to a different construct, not to the
  googleSearch tool: `isAgent = this.agent != null` (`google-interactions-language-model.ts:154`,
  true only when the model was built via `provider.interactions({ agent: '<name>' })`, a
  Google-hosted Agent resource, distinct from calling `google.interactions.model(...)` with an
  explicit `tools: [googleSearch]`). When `isAgent` is true and `responseFormat.type === 'json'`,
  the provider drops the field and emits a warning instead of sending it
  (`google-interactions-language-model.ts:203-210`: `"google.interactions: structured output
  (responseFormat) is not supported when an agent is set; responseFormat will be ignored."`),
  confirmed by test `google-interactions-language-model.test.ts:482-493` ("warns and drops
  responseFormat when an agent is set"), which asserts `body.response_format` is `undefined` only
  for `provider.interactions({ agent: 'deep-research-pro-preview-12-2025' })`. Tool preparation
  (`hasTools`, `google-interactions-language-model.ts:171-184`) and response-format assembly
  (`google-interactions-language-model.ts:201-227`) are otherwise independent blocks that both
  feed the same `args` object (`google-interactions-language-model.ts:446-460`) unconditionally --
  a non-agent `google.interactions.model(...)` call with `tools: [googleSearch]` and
  `responseFormat: { type: 'json', schema }` together is not blocked anywhere in this file.
  `prepare-google-interactions-tools.ts` has no model-id string checks at all (grep for
  `2\.5|gemini-3|gemini-2` in that file returns nothing).
- Real API-level schema vs shape-in-prompt: this package always sends the real
  `responseJsonSchema`/`response_format.schema` field in `generationConfig` (or in the Interactions
  body) when a schema is supplied; there is no code path here that stringifies a schema into prompt
  text instead. `google-prompt.ts` (86 lines) defines the `GooglePrompt`/`GoogleContent` wire types
  only, not prompt templating with few-shot examples; `interactions/google-interactions-prompt.ts`
  (checked via grep) likewise defines citation/annotation types, not a prompt template. No
  `google-prompt.ts` "template files" exist in this package -- prompt construction is entirely the
  caller's `LanguageModelV4Prompt` array converted 1:1 by `convertToGoogleMessages`.
- No validator that rejects a malformed structured-output response and re-asks: `google-json-accumulator.ts`
  (skimmed) accumulates streamed JSON tool-call arguments for parsing, it does not validate the
  final object against the schema or trigger a re-ask; `sanitize-response-json-schema.ts` only
  transforms the outgoing schema, never the incoming response. No caller-side re-ask loop exists
  in this package (consistent with the Q2 finding that retry lives in `ai` core, not here).

## Nothing here on

- No client-side rejection of image + googleSearch on the generateContent path (Q1); the only
  cross-feature rejection found anywhere in the two packages is Interactions-Agent-mode dropping
  `responseFormat` (Q3), which is unrelated to images or to googleSearch specifically.
- No model-id gate ties responseSchema to googleSearch, on Gemini 2.5 or 3.x or any other id;
  searched `google-model-capabilities.ts`, `google-prepare-tools.ts`, `sanitize-response-json-schema.ts`,
  and both test files for `responseSchema`/`responseFormat` alongside `2.5`/`gemini-3`/`search` --
  found none.
- No retry-on-wrong-answer, confidence gate, or second-search loop in this package (Q2); it lives
  in `ai` core (grep against `retry` in `google-language-model.ts`/`google-error.ts` returns
  nothing).
- No image resize/crop/compression before upload (Q1); grep for `resize|crop|sharp(` in non-test
  `src` returns nothing.
- No size or mime-type validation for inline image bytes; `google-supported-file-url.ts` only
  covers the Files-API-URL and YouTube-URL cases, not inline base64 image data.
- No use of `groundingSupports[].confidenceScores` anywhere outside its own schema definition (Q2);
  it is parsed and immediately discarded.

## Dead or unwired

- `groundingSupports[].confidenceScores`/`confidenceScore` (`google-language-model.ts:1571-1586`):
  parsed by the response schema, never read by `extractSources()` or anywhere else in `src`. Grep
  proving no importer: `grep -n "groundingSupports\|confidenceScore" src/*.ts src/interactions/*.ts`
  (excluding `.test.ts`) returns only the three schema-definition lines.
