# farzaa/clicky

One line: a macOS menu-bar "AI teacher" buddy that screenshots the user's screen and sends it to
Claude (Anthropic, not Gemini) with a voice prompt; it is not a photo-identify-and-price app and
never fetches prices for anything.

Read depth: opened `README.md`, `worker/src/index.ts` (full, 141 lines), `leanring-buddy/ClaudeAPI.swift`
(full, 291 lines), `leanring-buddy/OpenAIAPI.swift` (init/header only), `leanring-buddy/CompanionManager.swift`
(grepped + read lines 560-660 and 784-815), and repo-wide greps for `gemini|grounding|googlesearch|
google_search|web_search|price` and for `OpenAIAPI(`/`ClaudeAPI(` call sites. Did not open
`ElementLocationDetector.swift`, `CompanionScreenCaptureUtility.swift` internals, the transcription/TTS
providers, or the Xcode project file, since none of those touch a model call or a search.

## Q1 image plus search
- The only model call in the repo is Anthropic's Messages API, not Gemini. Image is attached inline
  as base64 in a content block: `leanring-buddy/ClaudeAPI.swift:122-135` builds
  `["type": "image", "source": ["type": "base64", "media_type": ..., "data": image.data.base64EncodedString()]]`
  for each screenshot, followed by a text block per image and the user prompt.
- The full request body sent to the proxy is `["model": model, "max_tokens": 1024, "stream": true,
  "system": systemPrompt, "messages": messages]` (`leanring-buddy/ClaudeAPI.swift:142-148`, streaming
  path; the non-streaming path at `leanring-buddy/ClaudeAPI.swift:253-258` is the same shape minus
  `stream` with `max_tokens: 256`). There is no `tools` key, no grounding config, no search
  parameter anywhere in this object.
- The Cloudflare Worker (`worker/src/index.ts:52-78`, `handleChat`) is a pure pass-through: it reads
  the request body as raw text and forwards it unmodified to `https://api.anthropic.com/v1/messages`
  with only auth headers added. It does not inject a tool or search config server-side either.
- Model id in use: `"claude-sonnet-4-6"` (default in `ClaudeAPI.swift:17` and the
  `selectedModel` default in `CompanionManager.swift:111`). No `media_resolution`, no thinking
  budget, no `temperature` field is set anywhere in the request body.
- Matters for Shin: this answers nothing about Gemini's image+search co-request behavior, since the
  repo never calls Gemini and never puts a search tool on any request at all.

## Q2 stopping being wrong
- Nothing found. No second call, no confidence gate, no retry, no cross-checking of sources, no
  citation/grounding-metadata check. `analyzeImageStreaming` and `analyzeImage`
  (`leanring-buddy/ClaudeAPI.swift:101-212`, `215-290`) each make exactly one request and return
  whatever text comes back; callers in `CompanionManager.swift:613` and `:985` take that text as
  final. Matters for Shin: confirms the "accept the first thing the model says" failure mode is not
  something this repo solved either, so there is no pattern here to borrow.

## Q3 same shape every time
- No API-level response schema (no `response_format`, no `output_schema`, no tool-forced JSON). The
  only shape constraint is a string tag spelled out entirely in the system prompt text: `format:
  [POINT:x,y:label]` or `[POINT:none]`, given as instructions with worked examples
  (`leanring-buddy/CompanionManager.swift:561-577`).
- That tag is pulled out client-side with a regex, not a JSON decoder:
  `leanring-buddy/CompanionManager.swift:786`:
  `let pattern = #"\[POINT:(?:none|(\d+)\s*,\s*(\d+)(?::([^\]:\s][^\]:]*?))?(?::screen(\d+))?)\]\s*$"#`.
- No validator/re-ask on a parse failure: if the regex does not match, `parsePointingCoordinates`
  (`CompanionManager.swift:784-815`) just returns the whole response as spoken text with
  `coordinate: nil` and moves on (`CompanionManager.swift:788-791`); there is no rejection or retry
  loop. Matters for Shin: this is the "shape spelled out in the prompt" case the question anticipates,
  with silent fallback instead of a re-ask, and it says nothing about whether schema and grounding can
  coexist on a Gemini call since Gemini is never used here.

## Nothing here on
- Price extraction of any kind: repo-wide grep for `price` (case-insensitive, `.swift`/`.ts`) returned
  zero hits.
- Gemini/grounding: repo-wide grep for `gemini|grounding|googlesearch|google_search|web_search`
  returned zero hits anywhere in the source.
- Object identification for a physical/grocery item: the vision use is screen-content Q&A and
  UI-element pointing, not identifying a photographed object.

## Dead or unwired
- `leanring-buddy/OpenAIAPI.swift` defines a full `OpenAIAPI` class (vision-capable, model
  `"gpt-5.2-2025-12-11"`) that is never instantiated: `grep -rn "OpenAIAPI(" --include="*.swift" .`
  returns no results. Every other hit for the string `OpenAIAPI` is either inside that file itself or
  an unrelated class name (`OpenAIAudioTranscriptionProvider`, a separate transcription provider that
  reads an `OpenAIAPIKey` Info.plist value but does not call `OpenAIAPI`). Only `ClaudeAPI` is ever
  constructed, at `leanring-buddy/CompanionManager.swift:76`.
