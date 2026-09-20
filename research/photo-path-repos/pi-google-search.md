# sshkeda/pi-google-search

One line: a single-tool extension for the "pi" coding agent that sends a text query to Gemini
with `googleSearch: {}` grounding and renders the answer plus a deduped source list; text only,
nothing in it touches images.

Read depth: opened all 4 source-relevant files (`src/index.ts` 479 lines, `index.ts` 1-line
re-export, `package.json`, `README.md`) plus a full-repo grep for image/schema/dynamic-retrieval
keywords. Nothing was skipped; the whole repo is these files.

## Q1 image plus search
- Nothing here. The only request bodies built are `ai.models.generateContent({ model, contents:
  params.query, config: { tools: [{ googleSearch: {} }], abortSignal } })` (`src/index.ts:283-290`,
  API-key path) and a raw fetch body `{ project, model, request: { contents: [{ parts: [{ text:
  query }] }], tools: [{ googleSearch: {} }] } }` (`src/index.ts:103-110`, OAuth/Cloud Code Assist
  path). Both `contents` fields carry only the string query; no `inlineData`, `file_uri`, or `Part`
  array exists anywhere. Grep for `image|base64|inlineData|file_uri|mimeType|media_resolution`
  across all `.ts` files returned zero matches. This repo cannot answer Shin's Q1 because it never
  sends an image at all.
- Model id: `gemini-2.5-flash`, read from `process.env.GEMINI_SEARCH_MODEL || "gemini-2.5-flash"`
  (`src/index.ts:84` and `:284`). SDK: `@google/genai` `^1.40.0` (`package.json:37`), imported
  lazily via `await import("@google/genai")` (`src/index.ts:68`).
- No `media_resolution`, thinking budget, temperature, or system instruction fields appear in
  either request body; grep for those terms returned zero matches.

## Q2 stopping being wrong
- No second search, confidence gate, or cross-check. The tool takes `response.text` as the answer
  verbatim (`src/index.ts:296`) and returns it; there is no branch that re-queries on a weak result.
- The only retry logic is transport-level, on the OAuth/fetch path only: up to 3 retries on HTTP
  429 or >=500, with a linear `1000 * (4 - retries)` ms backoff, and it resends the exact same body
  each time, not a changed prompt (`src/index.ts:93-120`). The API-key path (`@google/genai` SDK
  call) has no retry at all, only a 30-second hard timeout that aborts and surfaces an error
  (`src/index.ts:274-293`).
- Grounding metadata is read only to build the citation list, never to verify the answer text
  against it. See exact fields below.
- No price-shaped handling exists (no currency/unit/date extraction of any kind); this tool is
  generic web search, not a price lookup.

## Q3 same shape every time
- Nothing here. No response schema (API-level or prompt-spelled), no enums, no validator/re-ask
  loop. Grep for `responseSchema|response_schema|responseMimeType` returned zero matches. The
  output is Gemini's free-text `answer` plus a manually formatted string (`formatOutput`,
  `src/index.ts:443-478`).
- Cannot confirm or break the "schema + grounding mutually exclusive on 2.5 vs allowed on 3.x"
  belief; this repo never constructs a schema request at all, on either model family.

## Q4 when and how hard it searches
- Not applicable in the framework sense: `googleSearch: {}` is passed with an empty config object
  on every call, both paths (`src/index.ts:108`, `:287`), no `dynamicRetrieval`, `dynamicThreshold`,
  or `mode` field is set or exposed. Grep for `dynamicRetrieval|dynamicThreshold` returned zero
  matches, so this tool always forces a search unconditionally, same as Shin, and exposes no knob
  to vary it.
- Only one surface name appears: `googleSearch` (not `googleSearchRetrieval`), used identically on
  both the SDK path and the raw REST path against the same model id (`gemini-2.5-flash`), no
  version-based switch exists to quote.

## Nothing here on
- Images/multimodal input (Q1's core question): confirmed absent by grep, see above.
- Dynamic retrieval threshold, tool-choice mode (ANY/AUTO/NONE), or any forced/forbidden-search
  control: grep for `dynamicRetrieval|dynamicThreshold|mode.*ANY|mode.*NONE` returned zero matches.
- Search result reuse across calls beyond the in-session `resultCache` Map keyed on
  `query.toLowerCase().trim()` (`src/index.ts:173-177`, `:253-266`), this caches identical repeat
  queries within one session, it does not cap or count distinct searches.
- Grounding-metadata-based answer verification: fields are read to list sources, never to check
  the answer text is supported by them (see Q2).

## Dead or unwired
- None found. Every function defined (`getClient`, `searchWithOAuth`, `cacheKey`, `formatOutput`)
  is called from the single `execute` handler or its callers; nothing is exported or defined
  without a call site in this small a file.

## Grounding metadata fields read (for the citation list)
Both request paths read the identical shape from `candidate.groundingMetadata`:
- `groundingMetadata.groundingChunks[].web.title`, used as display title, and as the dedup key
  (`seenTitles`) since `uri` values are redirect URLs that differ per call
  (`src/index.ts:307-311`, `:152-157`).
- `groundingMetadata.groundingChunks[].web.uri`, the source link shown to the user, defaulted to
  `""` if absent (`src/index.ts:317`, `:160`).
- `groundingMetadata.groundingChunks[].web.domain`, read but noted as "not available via Gemini
  API" in a comment, falls back to `title` (`src/index.ts:312-314`).
- `groundingMetadata.webSearchQueries`, the list of queries Gemini actually ran, shown in a
  "Searches performed" line, defaulted to `[]` (`src/index.ts:325`, `:167`).
No other grounding field (`groundingSupports`, `searchEntryPoint`, `retrievalMetadata`, confidence
scores) is read anywhere; grep confirms only `groundingChunks` and `webSearchQueries` are touched.
