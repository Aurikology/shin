# udhaykumarbala/gemini-image-studio-mcp

One line: an MCP server with five tools (generate_image, decompose_image, edit_image,
get_presets, list_generated) wrapping `@google/genai` ^1.46.0 against
`gemini-3.1-flash-image-preview` / `gemini-3-pro-image-preview`; "structured JSON editing" is a
prompt convention (describe the image as JSON, diff the JSON, re-prompt), not an API-level schema.

Read depth: opened every file in `src/` (client.ts, models.ts, prompts.ts, server.ts,
tools/*.ts, utils/*.ts, storage/file-manager.ts) and `src/schema/nano-banana.schema.json`,
`src/presets/presets.json`. Did not open README.md claims without checking the call site first,
did not open tests/ (unit tests for file-manager/image-utils/merge only, no API mocking to
check), did not open docs/*.png.

## Q1 image plus search

- Yes, on one code path: `generate_image` with `reference_images` set AND
  `enable_search_grounding: true`. `src/gemini/client.ts:63-92` builds `parts` from
  `req.images` (inlineData base64) then appends `{ text: req.prompt }`, and separately, if
  `req.enableSearchGrounding`, sets `config.tools = [{ googleSearch: {} }]`
  (`src/gemini/client.ts:84-85`). Both `parts` and `config` go into the same
  `ai.models.generateContent({ model: modelId, contents: [{ role: "user", parts }], config })`
  call at `src/gemini/client.ts:88-92`. Model id comes from `MODELS[req.model]`:
  `gemini-3.1-flash-image-preview` or `gemini-3-pro-image-preview`
  (`src/gemini/models.ts:1-4`). SDK: `@google/genai` `^1.46.0` (package.json:56). This answers
  Shin's open question: the Gemini 3.x image-preview models do accept an inline image part and
  `googleSearch` tool in the same `generateContent` call, at least in this SDK's request shape
  (whether the API actually honors both together server-side is not verifiable from this repo).
- `enable_search_grounding` is exposed ONLY on `generate_image`
  (`src/tools/generate-image.ts:16,73`). `edit_image` builds its `GenerateRequest` at
  `src/tools/edit-image.ts:71-75` with no `enableSearchGrounding` field at all, so edits never
  get grounding. `decompose_image` calls `generateTextOnly()` (`src/tools/decompose-image.ts:52-56`),
  a separate function in client.ts (`src/gemini/client.ts:110-140`) whose `config` is hardcoded
  to `{ responseModalities: ["TEXT"] }` with no `tools` key anywhere in the function body, so
  grounding cannot reach the object-identification step at all. For a product that must first
  identify a grocery item, that is the failure this repo does not fix: the naming step
  (decompose) is grounding-blind by construction.
- No resolution/token hints, thinking budget, or temperature anywhere: `config` objects in
  client.ts only ever contain `responseModalities`, optionally `imageConfig`
  (`aspectRatio`/`imageSize`, `src/gemini/client.ts:77-82`), and optionally `tools`. No image
  resize/crop before sending: `src/utils/image.ts` (not fully quoted here) is called via
  `imageToBase64`, only a >20MB size check exists (`src/tools/generate-image.ts:61-64`,
  `src/tools/edit-image.ts:42-45`), no cropping.

## Q2 stopping being wrong

- `withRetry` (`src/gemini/client.ts:19-44`) retries only on rate limiting: checks
  `err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED")`, up to
  `maxAttempts = 3`, exponential backoff `Math.pow(2, attempt-1)*1000` ms. It repeats the exact
  same request object on retry, it does not change the prompt or add a second search. A safety
  block (`"SAFETY"` or `"blocked"` in the message) is rethrown immediately as a fixed user
  message (`client.ts:26-33`), not retried.
- Nothing else. No second query when the first answer is weak, no confidence gate, no enum
  confidence band, no cross-checking two sources, no budget-then-degrade path beyond the 3
  rate-limit retries.
- `groundingMetadata` / citations: the response parser only reads `part.text` and
  `part.inlineData` off `response.candidates[0].content.parts`
  (`src/gemini/client.ts:95-105` and `:134-137`). No field named `groundingMetadata`,
  `citations`, `groundingChunks`, or `groundingSupports` is referenced anywhere in `src/`
  (checked with `grep -rniE "grounding|citation" src/`, only hit is the `tools.googleSearch`
  config line already covered in Q1). Whatever grounding sources the model used, if any, are
  silently dropped: the tool response to the caller is just `result.text` truncated into a
  `description` field (`src/tools/generate-image.ts:102`), never a source list.
- Nothing price-shaped: no currency/unit/date extraction code exists anywhere in `src/`
  (grepped `price|currency|\$|CAD|USD` across `src/`, no hits outside README prose). This repo
  has no price-reading path at all.

## Q3 same shape every time

- No API-level response schema. Grepped `responseSchema|response_schema|responseMimeType|generationConfig`
  across `src/` and got zero hits (command run, zero output). The only `config` fields ever set
  are `responseModalities`, `imageConfig`, and `tools` (Q1). `src/schema/nano-banana.schema.json`
  exists but is never passed into a `generateContent` call; it is loaded once in
  `src/server.ts:35-36` and served verbatim as a read-only MCP resource at URI
  `nanobanana://schema/prompt` (`src/server.ts:98-104`) for a human/LLM caller to read, not
  something the server enforces. Grep confirms: `grep -rn "nano-banana" --include="*.ts" .` only
  matches that one server.ts load/serve path, nothing in tools/ or gemini/ imports it.
- The actual "schema" is three hand-written prompt strings (basic/detailed/exhaustive) in
  `src/gemini/prompts.ts:1-44` (`DECOMPOSE_PROMPTS`), each spelling out field names and types as
  prose inside the prompt text, e.g. `"clothing": [{"item": string, "color": string (use hex
  like #2C3E50)...}]` (prompts.ts:13). This is prompt-level shape, not enforced shape: nothing
  stops the model from omitting or renaming a field.
- Output parsing has no validator at all, only best-effort recovery. `extractJson()`
  (`src/tools/decompose-image.ts:14-35`) tries `JSON.parse` on the raw text, then a fenced
  ```json block regex, then first-brace-to-last-brace substring, and on all three failing throws
  once, there is no re-ask, no retry-with-correction loop, `maxAttempts` does not apply here
  (that's only in client.ts's rate-limit retry, unrelated). Zero calls to `.safeParse(` or zod
  validation against the decomposed blueprint anywhere (grepped `safeParse|\.parse\(` in `src/`,
  the only zod usage is validating the MCP tool *input* schemas, e.g.
  `src/tools/generate-image.ts:7-17`, never the model's JSON *output*).
- Editing a blueprint (`src/utils/merge.ts:41-50`, `applyChanges`) is a plain dot-path
  `structuredClone` + `setByPath` merge with no type/shape checking of `changes` against
  anything, any path and any value is accepted and written in.
- Schema-and-grounding-together: cannot be observed in this repo either way. The only place
  `tools: [{ googleSearch: {} }]` is set (`client.ts:85`) is in `generateContent`, which never
  sets a response schema field (there is none in this codebase, see above), so this repo
  contains no code path that attempts schema + grounding on the same call, it neither confirms
  nor breaks Shin's belief about Gemini 2.5 vs 3.x, because the schema half of the pairing was
  never built here at the API level.

## Nothing here on

- Nothing on media_resolution/token hints, thinking budget, temperature (checked, absent from
  every `config` object in client.ts).
- Nothing price-shaped: no currency/unit/date capture code exists in this repo at all.

## Dead or unwired

- `src/schema/nano-banana.schema.json` is loaded and exposed as a read-only MCP resource
  (`src/server.ts:35-36, 98-104`) but is never passed to the Gemini API as `responseSchema` and
  never used to validate a model response. Proof: `grep -rn "nano-banana" --include="*.ts" .`
  returns only the server.ts load/serve lines; `grep -rn "responseSchema" --include="*.ts" .`
  returns nothing.
- `prompts/nano-banana-expert.md` is registered as an MCP prompt (`src/server.ts:87-96`) that a
  caller can choose to fetch, but nothing in the five tool handlers reads or injects it
  automatically into any `generateContent` call, it only reaches the model if the MCP client
  explicitly requests the `nano_banana_expert` prompt and pastes it in itself.
