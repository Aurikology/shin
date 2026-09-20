# tanaikech/GeminiWithFiles
A Google Apps Script class (`classGeminiWithFiles.js`, v2.1.0) that wraps the raw Gemini
`generateContent` REST endpoint: uploads files, builds the request payload, runs a tool-call
loop, and optionally parses JSON-schema output. It is a thin payload builder, not an SDK.

Read depth: `classGeminiWithFiles.js` (898 lines, read in full via offset/limit and targeted
grep), `main.js` (public function wrappers), `tests/test1.js` (the only file exercising
`googleSearch`), `README.md` §8, `appsscript.json`. Deliberately not read: `old_v1.x.x/*`
except to compare the upload path (superseded, confirmed by folder name and README), `tests/
test2-4.js` beyond a grep (no `googleSearch` or file+search hits in them), `images/`.

## Q1 image plus search
- **Yes, one request.** Uploaded-file parts and the `googleSearch` tool are assembled onto the
  same `payload` object and sent in a single `fetch_` POST. File parts: `contents.push({
  parts: [{text:q}, ...files] })` where `files` is built at classGeminiWithFiles.js:311-329 as
  `{ fileData: { fileUri: f.uri, mimeType: f.mimeType } }` (line 319), **a file reference, not
  inline base64**. Tools: `this.tools` (set from constructor arg `tools`, line 29/160) is pushed
  into `toolsArray` at line 371 (`if (this.tools && this.tools.length > 0)
  toolsArray.push(...this.tools)`) and assigned `payload.tools = toolsArray` (line 372). Both
  `payload.contents` and `payload.tools` go out in the one `JSON.stringify(payload)` fetch at
  lines 405-415. Nothing between file attachment (line 311) and the fetch (line 405) checks for
  or blocks the combination.
- **Verbatim test usage**, tests/test1.js:197-204: `GeminiWithFiles.geminiWithFiles({ apiKey,
  tools: [{ googleSearch: {} }], exportRawData: true })` then `.generateContent({ q: "..." })`.
  This test has no file attached, so the repo's own tests never exercise files+search together;
  the "same payload" finding above comes from reading the construction code, not from a test.
- **Model id:** default is `"models/gemini-3.1-flash-lite"` (classGeminiWithFiles.js:37),
  endpoint `https://generativelanguage.googleapis.com/v1beta/{model}:generateContent`
  (line 40-41). `model` is a free caller-supplied string; no code path validates it against
  `tools` or `response_schema`, and no version gate exists anywhere in the file (grepped
  `googleSearchRetrieval|dynamicRetrieval|MODE_DYNAMIC` across the repo: zero hits).

## Q2 stopping being wrong
- Retry only on transport failure: HTTP 500/502/503/429 triggers a repeat of the identical
  request after `Utilities.sleep(3000)` (classGeminiWithFiles.js:418-423), not content-quality
  driven.
- A malformed-function-call recovery path re-parses a broken tool-call string and re-injects the
  result (lines 436-489), and a retry-limit throw at lines 668-669 ("Maximum retry limit
  exceeded"). Neither reads or checks `groundingMetadata`.
- `groundingMetadata` is never referenced inside `classGeminiWithFiles.js` (grepped, zero hits).
  It only surfaces if the caller sets `exportRawData: true`, in which case `generateContent`
  returns the whole unparsed API response (`if (this.exportRawData) return rawResult;`, line
  666) and the caller must pull `candidates[0].groundingMetadata` themselves, exactly as
  tests/test1.js:207-211 does. Nothing in the library checks a claim against a grounding source
  or drops an unsupported one; it is display-only, and only when opted in.

## Q3 same shape every time
- `response_schema`/`responseSchema` sets `payload.generationConfig.response_schema` and forces
  `response_mime_type = "application/json"` (classGeminiWithFiles.js:377-380). This is a real
  API-level `generationConfig` field, not a prompt-spelled shape.
- **Schema and `googleSearch` are built on the exact same payload with no mutual exclusion
  check**: the schema block (lines 374-380) and the tools block (lines 367-372) both write into
  the same `payload` before the one fetch call (line 405); no `if` anywhere tests
  `this.response_schema` against `this.tools` or throws. This breaks the "mutually exclusive on
  2.5" belief only in the sense that this library imposes no such restriction client-side —
  it does not prove the live API accepts both; that would show up as an HTTP error at runtime,
  which this code cannot demonstrate.
- No local validator re-asks on a bad shape; the only re-ask loop is the function-call recovery
  above.

## Q4 when and how hard it searches
- No dynamic-retrieval knob: grepped `dynamicRetrieval|dynamicThreshold|MODE_DYNAMIC` across the
  whole repo, zero hits. Nothing here exposes that control, breaking the "one repo claims to
  expose it" premise for this repo specifically.
- Only the `googleSearch` surface name appears (classGeminiWithFiles.js referenced via
  README.md:460 and tests/test1.js:199); `googleSearchRetrieval` does not appear anywhere
  (grepped), so there is no version switch between the two surface names to quote.
- `toolConfig.functionCallingConfig.mode` (AUTO/ANY, lines 391-399, 487-489) governs the
  caller-declared `function_declarations`, not the built-in `googleSearch` tool; nothing forces
  or forbids the search tool specifically.
- No search counting, capping, or result-reuse logic found.

## Nothing here on
- Dynamic retrieval threshold/config (Q4), searched whole repo, no match.
- `googleSearchRetrieval` naming or a version-based switch (Q4), no match.
- Grounding-metadata verification against the answer (Q2), `groundingMetadata` never parsed
  inside the class, only round-tripped when `exportRawData` is set.
- `media_resolution` / thinking-budget hints on the image part, not present; `files` parts
  (line 311-329) carry only `fileData` and a filename text label, no resolution field.

## Dead or unwired
- `uploadFiles()` (classGeminiWithFiles.js:232-236) calls `this.uploadApp_(e)` (line 234), but
  `uploadApp_` is not defined anywhere in this repo (`grep -rn "uploadApp_"` returns only the
  one call site) and `appsscript.json` declares no library dependencies (`"dependencies": {}`).
  The actual upload wire mechanics (endpoint, chunking, size/mime enforcement) for the current
  v2.1.0 are not present in this clone; cannot report Q1's "size and mime limits it enforces"
  for the current version because the code that would show it is missing. The superseded
  `old_v1.x.x/classGeminiWithFiles.js:325-364` does the multipart upload directly
  (`uploadType: "multipart"` to `urlUploadFile`) using whatever `blob.getContentType()` /
  `DriveApp` reports, with no explicit byte-size or mime-type check anywhere in that function.
