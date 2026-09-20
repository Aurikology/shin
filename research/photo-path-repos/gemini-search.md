# ammaarreshi/Gemini-Search

One line: a text-only Perplexity clone; a single Express route takes a query string, opens a
Gemini chat session with the `google_search` tool, and returns the reply plus whatever grounding
chunks came back. There is no code path anywhere in the repo that accepts, uploads, encodes, or
sends an image.

Read depth: opened `server/routes.ts`, `server/env.ts`, `client/src/lib/gemini.ts`,
`client/src/components/SearchInput.tsx`, `client/src/components/FollowUpInput.tsx`,
`client/src/components/SourceList.tsx`, `client/src/pages/Search.tsx`, `client/src/lib/queryClient.ts`,
`package.json`. Grepped the whole tree (excluding `node_modules`/`.git`) for
`image|base64|inlineData|file_uri|multer|upload|vision|camera|photo` and for
`type="file"|accept=`. Did not open the `client/src/components/ui/*` shadcn primitives beyond
grep (they are generic Radix wrappers, one false-positive hit on `AvatarImage`), did not open
`db/schema.ts` or `drizzle.config.ts` (persistence only, no model calls), did not open the splash
PNGs/manifest (assets).

## Q1 image plus search

- **No image ever enters this app.** `client/src/components/SearchInput.tsx:1-45` is a plain
  text `<Input>` wired to `onSearch(query: string)`; there is no `<input type="file">` or
  `accept=` attribute anywhere in `client/src` (grep returned zero hits). This directly breaks
  the premise that a product could send a photo here.
- The only model call in the repo is `server/routes.ts:117-127`:
  ```
  const chat = model.startChat({
    tools: [
      {
        // @ts-ignore - google_search is a valid tool but not typed in the SDK yet
        google_search: {},
      },
    ],
  });
  const result = await chat.sendMessage(query);
  ```
  `query` is `req.query.q as string` from `server/routes.ts:108`, a URL query param off
  `GET /api/search`. There is no `Part`, no `inlineData`, no `fileData`/`file_uri`, no multipart
  body parsing (no multer/formidable/busboy dependency, no upload middleware registered in
  `server/index.ts`). So the question "does image plus search happen in one call" is moot here:
  there is no call that ever carries an image, grounded or not.
- Model id and SDK: `gemini-2.0-flash-exp` (`server/routes.ts:14`),
  `@google/generative-ai` `^0.21.0` (`package.json:14`).
- Alongside the query: `generationConfig` sets `temperature: 0.9, topP: 1, topK: 1,
  maxOutputTokens: 2048` (`server/routes.ts:16-20`). No `media_resolution`, no thinking budget,
  no system instruction, no resize/crop step, because there is no media to resize.
- `client/src/lib/gemini.ts:1-5` is a dead stub: `export async function searchWithGemini(query)
  { throw new Error('This function has been moved to the server'); }`. Nothing imports it
  (the only Gemini call path is the server route above); it is leftover scaffolding, not a
  second call site.
- The repo's own README makes no multimodal/image/vision/photo claim at all (grepped
  case-insensitively, zero hits); whatever "accepts multimodal input" claim reached Shin did not
  come from this repo's documentation either.

## Q2 stopping being wrong

- Nothing checks or gates the model's first answer. `chat.sendMessage(query)` result is taken
  directly: `const text = response.text();` then reformatted to markdown/HTML and returned
  (`server/routes.ts:127,141,144`). No second query, no confidence threshold, no retry-with-
  different-prompt.
- `confidenceScores: number[]` is declared on the `GroundingSupport` interface
  (`server/routes.ts:94`) but that field is never read anywhere else in the file or repo (grepped
  `confidenceScores`, one hit total, the declaration itself). It is typed and thrown away, not
  used to drop or flag weak claims.
- `client/src/lib/queryClient.ts:24,27` sets `retry: false` on the React Query client. This is
  a network-failure retry knob for the HTTP fetch, not a quality/confidence retry on the model's
  answer; it actually forbids retrying, including on a transient failure.
- Grounding chunks are deduplicated by URL into a `Map` and every chunk with a `web.uri` and
  `web.title` is kept unconditionally (`server/routes.ts:158-177`); there is no check that a
  chunk's text actually supports the sentence it is attached to, no drop of unsupported claims,
  no cross-check between two sources. `groundingSupports[].segment` text is concatenated as a
  "snippet" for display only (`server/routes.ts:163-168`), never compared back against the
  generated answer.
- No price-shaped extraction exists at all: no currency/unit/date parsing, nothing that pulls a
  number off a page or flags staleness. Searched `routes.ts`, `SearchResults.tsx`, `SourceList.tsx`.

## Q3 same shape every time

- No response schema of any kind. `generationConfig` (`server/routes.ts:15-20`) has no
  `responseSchema` or `responseMimeType`; the model's free-text output is run through a regex-based
  `formatResponseToMarkdown()` (`server/routes.ts:27-74`) that turns `Word:` lines into `##`
  headers and bullet glyphs into `*` list items. That is prompt-shape-by-regex-postprocessing, not
  an API-level schema.
- No enums, no required-field validation, no validator that rejects and re-asks. Searched for
  `schema|responseSchema|responseMimeType|enum|validator` across `client` and `server`; the only
  hit was the `confidenceScores` field name noted above.
- Schema-plus-grounding-together question is unanswerable from this repo: it never constructs a
  `responseSchema`, so there is no line of code here confirming or breaking Shin's belief about
  2.5 vs 3.x mutual exclusivity. Nothing here on that.
- Prompt assembly is a bare user string passed straight to `sendMessage(query)`
  (`server/routes.ts:127`); no template file, no few-shot examples, no instruction to transcribe
  visible text before naming an object (there is no image, so no such instruction is possible).

## Nothing here on

- Q1's "if separate calls, what's passed between them": does not apply, there is only ever one
  kind of call (text plus `google_search` tool) and no second call handing off structured data.
- Q3's schema-and-grounding-together-on-which-model-id question: no schema exists to test this
  against; searched `generationConfig`, `responseSchema`, `responseMimeType` repo-wide, zero
  non-declaration hits.
- Price/currency/unit/date extraction (Q2 last bullet): zero mechanism, searched
  `server/routes.ts` and every `client/src/components/*.tsx` file that renders results.

## Dead or unwired

- `client/src/lib/gemini.ts:1-5`: a stub function `searchWithGemini` that immediately throws;
  confirmed unimported anywhere (`grep -rn "searchWithGemini" client server` outside its own
  declaration returns nothing).
- `GroundingSupport.confidenceScores` (`server/routes.ts:94`): typed, populated by the raw API
  response, never read or branched on.
