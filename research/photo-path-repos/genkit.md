# genkit-ai/genkit (moved from firebase/genkit; GitHub 301s firebase/genkit -> genkit-ai/genkit,
TypeScript, 6453 stars, pushed 2026-09-19)

One line: a multi-language (JS/Python/Go) agent framework whose JS `@genkit-ai/google-genai`
package is a single unified plugin serving both Google AI (`googleai/`) and Vertex AI
(`vertexai/`) backends from shared converters; equivalent logic is duplicated in
`py/packages/genkit-google-genai`.

Read depth: cloned genkit-ai/genkit --depth 1. Read `js/plugins/google-genai/src/{googleai,
vertexai,common}/*.ts` in full (gemini.ts, converters.ts, types.ts) and
`py/packages/genkit-google-genai/src/genkit_google_genai/models/{gemini.py,utils.py,
deep_research.py}`. Did not read `js/plugins/google-genai/src/googleai/deep-research.ts` in
full (skimmed only), did not read the Go plugin (`go/plugins/googlegenai`), did not read any
test files.

## Q1 image plus search
- Media parts and the search tool are assembled into the *same* `generateContentRequest` with no
  code path that checks one against the other. `contents` is built from
  `messages.map((message) => toGeminiMessage(message, ref))`
  (`js/plugins/google-genai/src/vertexai/gemini.ts:741`, identically at
  `js/plugins/google-genai/src/googleai/gemini.ts:871`), and `toGeminiMedia` builds
  `inlineData`/`fileData` parts (`js/plugins/google-genai/src/common/converters.ts:113-131`).
  `tools` (including the search tool, built at `vertexai/gemini.ts:695-698` and
  `googleai/gemini.ts:769-780`) is a sibling field on the same request object
  (`vertexai/gemini.ts:731-739`, `googleai/gemini.ts:863-873`). Both `vertexai` and `googleai`
  are shared code paths, so Vertex and Google AI behave the same way here.
- The framework permits the combination; this is not evidence the Gemini API accepts it, only
  that genkit builds and sends the request without complaint.

## Q2 stopping being wrong
- Nothing found that reads grounding metadata back to verify a claim. `fromGeminiCandidate`
  passes response content and `custom: response` straight through
  (`js/plugins/google-genai/src/vertexai/gemini.ts:808-810`); no code greps for
  `groundingMetadata`/`groundingChunks`/`citationMetadata` doing verification (searched
  `src/**/*.ts` for those terms, zero hits outside type declarations in `common/types.ts`).
- No retry-on-weak-answer, no confidence gate, no second-search trigger found in the gemini.ts
  request builders.

## Q3 same shape every time
- Response schema and the search tool are independent branches writing to the same request, not
  mutually exclusive: `googleSearchRetrieval` -> `tools.push({googleSearch: ...})`
  (`vertexai/gemini.ts:695-698`) runs regardless of `jsonMode`/`request.output?.constrained`
  writing `generationConfig.responseSchema`/`responseJsonSchema`
  (`vertexai/gemini.ts:756-765`). No `if`/`throw` anywhere between these two blocks checking the
  other's presence. Same structure in `googleai/gemini.ts:769-780` (tools) vs
  `googleai/gemini.ts:855-861` (schema) with no interaction. **This breaks the founder's belief**
  that schema and search grounding are mutually exclusive on 2.5 and allowed on 3.x: the
  framework enforces no such distinction at all, on either backend, for any model id.
- Python mirrors this: schema is set at
  `py/packages/genkit-google-genai/src/genkit_google_genai/models/gemini.py:1812` via
  `cfg.response_schema = ...`; the search tool is appended unconditionally at
  `gemini.py:1862-1865`; no `raise`/`ValueError` connects the two (checked every `raise` in the
  file, none mention search+schema).

## Q4 when and how hard it searches
- **The two surface names are a config-alias normalization, not a model-version switch.** There
  is no `if (modelVersion...)` branch anywhere selecting `googleSearchRetrieval` vs
  `googleSearch`; both are accepted as separate config keys and both are unconditionally folded
  into the wire-level `googleSearch` tool key for every model:
  - `js/plugins/google-genai/src/googleai/gemini.ts:769-773`:
    ```
    if (googleSearchRetrieval) {
      tools.push({
        googleSearch:
          googleSearchRetrieval === true ? {} : googleSearchRetrieval,
      } as GoogleSearchRetrievalTool);
    }
    ```
    and `googleai/gemini.ts:776-780` handles `googleSearch`/`google_search` separately, pushed
    as `google_search`. The schema comment at `googleai/gemini.ts:205` says "some models use
    this, some use just googleSearch" but no model-id check exists to act on that comment.
  - `js/plugins/google-genai/src/vertexai/gemini.ts:695-698`:
    ```
    if (googleSearchRetrieval) {
      tools.push({
        googleSearch: googleSearchRetrieval as GoogleSearchRetrieval,
      });
    }
    ```
    Vertex only exposes `googleSearchRetrieval` as a config key at all (schema at
    `vertexai/gemini.ts:247-249`) and always emits it on the wire as `googleSearch`.
  - Python, same pattern, same lack of a version check:
    `py/packages/genkit-google-genai/src/genkit_google_genai/models/gemini.py:1862-1865`
    (`config.pop('google_search_retrieval', ...)` -> `Tool(google_search=...)`), with the field
    doc at `gemini.py:333-341` reading: `'Note: This feature is not supported on all models. If
    you get an error, use the google_search tool instead.'`, the framework pushes that
    version-compatibility judgment onto the caller, in a comment, rather than checking it in code.
  - `py/.../models/utils.py:43-46` documents the same duality as a discovered edge case: `"the
    google.genai SDK's Tool.google_search field expects a GoogleSearch object, not the legacy
    GoogleSearchRetrieval. Using the wrong type produces a silent type mismatch warning."`
- **Dynamic retrieval threshold: declared, never wired.** `DynamicRetrievalConfig` (`mode`,
  `dynamicThreshold`) is declared at `js/plugins/google-genai/src/common/types.ts:116-137` and
  referenced only as an optional field of the `GoogleSearchRetrieval` interface at
  `common/types.ts:1050`. Grepped the whole plugin package for `dynamicRetrievalConfig` and
  `dynamicThreshold`: the only two hits are those two declaration lines
  (`common/types.ts:136`, `common/types.ts:1050`). No request builder reads or sets it, no test
  references it, no documentation string mentions it. Both the `googleai` zod schema
  (`googleai/gemini.ts:205-210`, a passthrough object) and the `vertexai` zod schema
  (`vertexai/gemini.ts:121-131`, `GoogleSearchRetrievalSchema`, only declares
  `disableAttribution`) would let a caller smuggle `dynamicRetrievalConfig` through via
  `.passthrough()`, but nothing in the framework ever reads it back out. This is dead/unwired: a
  type that exists but nothing consumes.
- **Forcing/forbidding search:** `functionCallingConfig.mode` (`AUTO|ANY|NONE`) exists
  (`googleai/gemini.ts:186-198`, `vertexai/gemini.ts` toolConfig at `vertexai/gemini.ts:664-679`)
  but it is the generic function-calling tool-choice mechanism, not search-specific; nothing
  scopes `mode: NONE`/`ANY` to only the search tool.
- **Cost/call control:** nothing found that counts, caps, or caches/reuses search calls across
  requests in `gemini.ts` in either backend.

## Nothing here on
- No cross-source conflict checking, no price/number extraction logic (out of framework scope;
  this is a model-calling layer, not a parsing layer).
- No explicit rejection, warning, or thrown error anywhere in `googleai/gemini.ts` or
  `vertexai/gemini.ts` that gates media, schema, or search on model version, searched for
  `throw`, `GenkitError`, and `not supported` across both files; the only throws are
  `'No messages provided.'`, `'No valid candidates returned.'`, and a schema-property-type throw
  in `common/converters.ts:101-104` unrelated to search/media/version.

## Dead or unwired
- `DynamicRetrievalConfig`/`dynamicThreshold` (`common/types.ts:116-137,1050`): type declared,
  zero consumers. Confirmed by grep across `js/plugins/google-genai/src/**/*.ts` and `*.md`:
  only the two declaration-site hits.
