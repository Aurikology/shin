# owndev/Open-WebUI-Functions
One line: a set of Open WebUI pipeline/filter functions; the relevant one is
`pipelines/google/google_gemini.py`, a single-file async wrapper around the `google-genai`
SDK that builds `contents` and `GenerateContentConfig` and calls `generate_content`/
`generate_content_stream` directly (not a separate grounding service).
Read depth: opened `pipelines/google/google_gemini.py` in full (3709 lines: content prep,
generation config, the pipe() call path, streaming/non-streaming response handling, retry
logic, safety-block handling). Also opened `filters/google_search_tool.py` (33 lines) and
`filters/vertex_ai_search_tool.py` (43 lines), both of which are just Open WebUI Filter
classes that toggle a `features["google_search_tool"]` / `features["vertex_ai_search"]` flag
on the request metadata, no request-building logic of their own. Did not open the video
generation path, the image-generation-model branch (`_build_image_generation_contents`), or
`_configure_generation`'s thinking-budget block in depth; not relevant to Q1's yes/no.

## Q1 image plus search
- **Yes, same request.** Image parts and the search tool are both assembled onto one call:
  `contents` (built by `_prepare_content`, which embeds `inline_data` image parts) and
  `config` (built by `_configure_generation`, which appends `types.Tool(google_search=...)`
  when the feature flag is set) are passed together into one
  `client.aio.models.generate_content(...)` / `generate_content_stream(...)` call.
  `pipelines/google/google_gemini.py:3474-3479` (non-streaming):
  ```
  async def get_response():
      return await client.aio.models.generate_content(
          model=model_id,
          contents=contents,
          config=generation_config,
      )
  ```
  and streaming equivalent at `pipelines/google/google_gemini.py:3449-3454`. This is the
  single highest-value finding: the same shape Shin wants (photo in, grounded search on) is
  one Gemini call here, not two.
- Image attachment: base64 data URL from the client is decoded, mime-validated, optimized,
  then appended as an `inline_data` part: `pipelines/google/google_gemini.py:1729-1736`
  (`parts.append({"inline_data": {"mime_type": mime_type, "data": encoded}})`), reached from
  `_process_multimodal_content` (`google_gemini.py:1672`), reached from `_prepare_content`
  (`google_gemini.py:1608`, `parts.extend(self._process_multimodal_content(content))` at
  line 1649), reached from `pipe()` at `google_gemini.py:3417-3418`
  (`contents, system_instruction = self._prepare_content(messages)`). A remote image URL
  (not a data URL) is rejected, not fetched: `google_gemini.py:1736-1738` turns it into a
  text placeholder `"[Image URL not processed: {image_url}]"`, so there is no `file_uri`
  path into Gemini from this pipe for a plain image link, only base64.
- Search/grounding tool attachment onto that same `config` object:
  `pipelines/google/google_gemini.py:2602-2612`:
  ```
  if features.get("google_search_tool", False):
      if self.valves.USE_ENTERPRISE_WEB_SEARCH:
          tools.append(types.Tool(enterprise_web_search=types.EnterpriseWebSearch()))
      else:
          tools.append(types.Tool(google_search=types.GoogleSearch()))
      tools.append(types.Tool(url_context=types.UrlContext()))
  ```
  `tools` is later folded into `gen_config_params["tools"]` at `google_gemini.py:2657-2658`,
  and that dict becomes the same `types.GenerateContentConfig(**filtered_params)` returned
  from `_configure_generation` (`google_gemini.py:2660`) that is passed as `config` at the
  call sites above. The `features.get("google_search_tool", False)` flag is set by the
  companion Open WebUI Filter, `filters/google_search_tool.py:1-33`, which only flips a
  boolean on request metadata; it builds no request of its own.
- Model id: whatever the user selected in Open WebUI, stripped of the pipeline prefix
  (`google_gemini_pipeline.gemini-2.5-flash` -> `gemini-2.5-flash`,
  `google_gemini.py:815`, `_prepare_model_id` around `google_gemini.py:1540-1552`); the
  file's own valve descriptions and image-model allowlist show it targets both 2.5 and 3.x
  families, e.g. `gemini-2.5-flash-image`, `gemini-3-flash-image`, `gemini-3.1-flash-image-preview`
  (`google_gemini.py:939-945`). No single model id is hardcoded for the grounded-image call;
  it rides whatever text/vision model the user picked.
- SDK: `google-genai`, imported as `from google import genai` /
  `from google.genai import types` / `from google.genai.errors import ClientError, ServerError, APIError`
  (`google_gemini.py:61-63`). No pinned version string found in this file; searched for a
  `requirements:` frontmatter line (Open WebUI functions normally declare one) and found
  none in this file, so the version is whatever's installed in the Open WebUI environment.
  Not in `package.json` reasoning (rule 3): this is Python, no `package.json` in this repo.
- Alongside the image and search tool on the same config: `temperature`, `top_p`, `top_k`,
  `max_output_tokens`, `stop_sequences`, `system_instruction` (`google_gemini.py:2404-2410`),
  and a `ThinkingConfig` with a validated `thinking_budget` or dynamic (`-1`) thinking when
  the model supports it (search hit around `google_gemini.py:2560-2576`, exact trigger
  condition not read in full). No `media_resolution` hint on the inline image part itself;
  the only resolution-shaped valve found is `ImageConfig` aspect ratio/resolution, gated to
  the image-generation branch only (`google_gemini.py:2413-2416`), not the general vision
  input path. The image is resized/compressed before sending: `_optimize_image_for_api`
  (`google_gemini.py:1826` on, called at `1698`) recompresses to JPEG/PNG under a size
  threshold and reports before/after MB in a debug log (`1858-1870`), so what reaches the
  API is a possibly re-encoded, not the original, byte stream.
- Call failure / empty response handling: `_retry_with_backoff` (`google_gemini.py:3292-3330`)
  retries only on `ServerError`, exponential backoff `min(2**n + 0.1n, 10)` seconds capped at
  `self.valves.RETRY_COUNT` attempts, then re-raises; any other exception type is not
  retried. On the non-streaming path, after a successful call: a safety block is checked
  first (`_get_safety_block_message`, called at `3515`, defined at `3022`) and short-circuits
  with that message; then `parts = candidate.content.parts` and if empty, the function
  returns the literal string `"[No content generated or unexpected response structure]"`
  (`google_gemini.py:3522-3524`) rather than raising. A caught exception during the
  non-streaming call itself returns `f"Error generating content: {e}"`
  (`google_gemini.py:3684-3688`); one level up, `ClientError`/`ServerError`/`APIError` are
  caught and returned as `f"{error_type}: {api_error}"` (`google_gemini.py:3690-3694`), a
  `ValueError` as `f"Configuration error: {ve}"` (`3696-3698`), and any other exception falls
  to a final generic handler with a full traceback logged (`3701` on, tail not fully read).
  All of these are returned as chat text to the user, not raised to a caller that could
  programmatically branch on failure type; for a product that must decide "retry, ask again,
  or tell the user we don't know," this repo's failure signal is a string, not a status code
  or enum.

## Q2 stopping being wrong
Not read in depth; out of scope for the priority Q1 in this task's brief. One relevant
observation surfaced incidentally: grounding metadata (citations) is captured and emitted as
sources (`_process_grounding_metadata`, `google_gemini.py:2701` on, called at `2919-2921` and
`3609-3612`), but nothing found that cross-checks the model's text claim against the
retrieved chunk before answering, or drops an unsupported claim; it formats and displays
`grounding_chunks`/`grounding_supports`, it does not appear to gate on them. Not verified
further; would need a dedicated pass to confirm absence.

## Q3 same shape every time
Not read. `_configure_generation` builds `types.GenerateContentConfig` (`google_gemini.py:2391`
signature, returned at `2660`) but no `response_schema` / `response_mime_type` assignment was
seen in the grep passes run for Q1; not confirmed either way with a targeted read.

## Nothing here on
Q2 and Q3 mechanisms are unconfirmed, not "found absent": this pass grepped for
`google_search|grounding|gemini` broadly and read the Q1 call path in full, but did not do a
targeted grep for `response_schema`, `response_mime_type`, `retry.*prompt`, `confidence`, or
price-extraction logic, so no claim is made about their presence or absence.

## Dead or unwired
None found; `filters/google_search_tool.py` and `filters/vertex_ai_search_tool.py` are both
imported/consumed indirectly through the `features` dict on request metadata that
`_configure_generation` reads (`google_gemini.py:2601-2602`, `2621-2622`), not dead code, but
this was not traced end to end through Open WebUI's own filter-dispatch machinery (that
machinery lives outside this repo).
