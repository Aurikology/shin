# epilande/gemini-grounding

One line: an MCP server exposing four stdio tools that each wrap one Gemini `generateContent`
text-only web-search call; there is no image path anywhere in the source.

Read depth: read every non-git file (`src/index.ts`, `src/gemini-client.ts`, `package.json`,
`README.md`, `CLAUDE.md`, `.env.example`, `tsconfig.json`); did not open `pnpm-lock.yaml` or
`LICENSE` (not evidence-bearing).

## Q1 image plus search

- Nothing puts an image on the request. `contents` is a single concatenated string, not a
  `Part[]` array: `contents: systemInstruction + '\n\n' + prompt` at
  `src/gemini-client.ts:36`. There is no `inlineData`, `fileUri`, `mimeType`, or any image
  literal anywhere in `src/`; confirmed with
  `grep -rniE "image|inlinedata|fileuri|mimetype" src/` returning zero source hits (only
  unrelated `inputSchema` matches in `src/index.ts`). Not applicable to a photo-plus-price
  product; this repo answers Q1 in the negative rather than showing a shape.
- The one call it does make does carry grounding: `tools: [{ googleSearch: {} }]` at
  `src/gemini-client.ts:37-39`, model id `'gemini-2.5-flash'` at `src/gemini-client.ts:35`,
  SDK `@google/genai": "^1.0.0"` (`package.json:32`), via
  `this.genAI.models.generateContent({...})` (`src/gemini-client.ts:34`). This is the minimal
  correct shape of a grounded (text-only) request: model id, `contents` as a plain string, and
  `config.tools` holding exactly one `googleSearch` tool. No other config field is set: no
  `temperature`, no `media_resolution`, no thinking budget, no `responseSchema`,
  no `responseMimeType`. Confirmed by the same repo-wide grep above plus a direct grep for
  `temperature|thinking|media_resolution|schema` in `src/` and `README.md`, both empty outside
  the four `inputSchema:` (MCP tool input, unrelated to the model call).
- Two-call question does not apply: there is only ever one call per tool invocation; nothing is
  passed between calls because a second call never happens.

## Q2 stopping being wrong

- Nothing here on: no second search, no confidence gate, no refusal branch, no cross-checking
  of sources, no retry logic, no budget/cap and return-on-exhaustion, no verification that a
  claim is actually supported by a grounding chunk. `searchWithGrounding`
  (`src/gemini-client.ts:23-47`) makes exactly one `generateContent` call inside a single
  try/catch and returns whatever comes back; the catch path (`src/gemini-client.ts:43-46`) only
  rethrows a formatted `Error`, it does not retry or alter the prompt.
- Grounding metadata is read but only to display, never to check. `groundingChunks` is walked to
  build a numbered source list (`chunk.web.uri`, `chunk.web.title`) at
  `src/gemini-client.ts:125-134`; nothing compares chunk content against the generated text, and
  a chunk lacking `web.uri` is silently skipped (`if (chunk.web?.uri)` at
  `src/gemini-client.ts:129`) with no count of how many were dropped. `groundingSupports`
  (the field that would map specific answer spans to specific sources) is never referenced
  anywhere in `src/`, confirmed by `grep -rn "groundingSupports" src/` returning nothing: dead
  from this repo's point of view, since the SDK field exists but the code never reads it. For a
  product that must catch a wrong price, this is the load-bearing negative finding: grounding
  here is decoration, not a check.
- Nothing price-shaped exists at all: no numeric extraction, no currency/unit/date capture, no
  staleness check. The only date logic is `Current date: ${new Date().toISOString()...}` spliced
  into the prompt text (`src/gemini-client.ts:54`), a hint to the model, not a captured or
  verified field.

## Q3 same shape every time

- No response schema of any kind, API-level or prompt-spelled-out. `formatGroundedResponse`
  (`src/gemini-client.ts:107-144`) returns a hand-built markdown string (answer text + a
  `## Sources` list + an optional `*Search queries used:*` line), not a validated or typed
  object. There is no `responseSchema` / `responseMimeType` field set on the request
  (`src/gemini-client.ts:37-39` is the entire `config` object) and no zod (or other) validator
  applied to the model's output; zod in this repo only types the four MCP tool *inputs*
  (`src/index.ts:43-46,81-84,124-126,166-167`), never the Gemini response.
- Schema-plus-grounding-together question does not arise here: since no schema is ever set,
  the repo cannot show or contradict the belief that schema and search grounding are mutually
  exclusive on Gemini 2.5. Nothing to confirm or break on that point from this source.
- Prompt assembly is inline template-literal string concatenation, not a template file:
  `buildPrompt` (`src/gemini-client.ts:49-105`) and the system instruction
  (`src/gemini-client.ts:25-31`) are both hardcoded strings in the `.ts` file with a `switch`
  on `focus` selecting one of four boilerplate blocks. No few-shot examples anywhere. No
  instruction to transcribe visible text before naming an object (unsurprising, given no image
  input exists).

## Nothing here on

- Any multimodal/image handling (Q1's core question).
- Any second-call, retry, confidence, or cross-check mechanism (Q2).
- Any structured/typed model response, schema field, or validator on output (Q3).
- Vertex AI, `google_search_retrieval` (the older grounding tool name), or `grounding_config`;
  only the 2.x-era `googleSearch: {}` tool name appears, confirmed by
  `grep -rn "google_search_retrieval\|grounding_config\|vertex" src/` returning nothing.

## Dead or unwired

- `groundingSupports` and `webSearchQueries`, both real fields on Gemini's
  `groundingMetadata`, are never read anywhere in `src/` (`grep -rn "groundingSupports\|
  webSearchQueries" src/` returns zero lines): not aspirational code sitting unused, simply
  never referenced at all, which is itself the finding for Q2.
