# dynamicwebpaige/gemini-and-gemma-examples

One line: a personal grab-bag of 8 Colab notebooks (market research automation, a batch-API
HumanEval run, a satellite-tile timelapse builder, a Veo image-to-video extend, a blog-to-podcast
generator, a YouTube-to-Gmail agent, a pandas data exploration, and a Deep Research MCP wrapper);
none of them is about looking at a photo. Clone at commit `518a7caf` (2026-01-25).

Read depth: opened every `.ipynb` in the repo (8 total, checked with `find . -name "*.ipynb"`):
`City_of_Melbourne_pedestrian_traffic_data_explorations.ipynb`, `Deep_Research_Example.ipynb`,
`Gemini_Batch_API_with_Hugging_Face_Datasets.ipynb`, `Satellite_imagery_video_timelapse.ipynb`,
`Veo_3_1_Fast_Extend.ipynb`, `notebooks/Automating_market_research_with_Gemini.ipynb`,
`notebooks/Blog_post_to_podcast_generator_(just_via_the_Gemini_APIs).ipynb`,
`notebooks/YouTube_reports_in_GMail.ipynb`. For each, extracted cell source with a small Python
script (`json.load` + join `source`) rather than trusting rendered markdown, and grepped every
`generate_content(` call site. Did not open READMEs (rule 2) and did not read any notebook's
prose past confirming it matched or did not match a mechanism.

## Q1 image plus search

- **Nothing combines an image and a search/grounding tool in one call anywhere in this repo.**
  Every `generate_content(` call site in the repo is text only:
  `notebooks/Automating_market_research_with_Gemini.ipynb:153` (a plain string prompt about the
  startup Vercel), `notebooks/Automating_market_research_with_Gemini.ipynb:284` (re-feeding the
  first call's `response.text` back into a second model), and
  `notebooks/Blog_post_to_podcast_generator_(just_via_the_Gemini_APIs).ipynb:221` (a blog-summary
  prompt string). None of these three passes a `Part`, `inline_data`, `file_uri`, or a `PIL.Image`
  object as content. Matters for the product because there is no reference implementation here of
  the one-call image+search request Shin wants to build.
- **The one notebook that does use a search tool is text only, and even there search and schema
  are two separate model instances, not one call.**
  `notebooks/Automating_market_research_with_Gemini.ipynb:26-33` builds
  `model = genai.GenerativeModel(model_name="gemini-1.5-flash", generation_config=generation_config, tools=[genai.protos.Tool(google_search_retrieval=genai.protos.GoogleSearchRetrieval())])`
  and calls `generate_content()` with a free-text prompt (`response_mime_type: "text/plain"`, no
  `response_schema`) at line 153. A second, separate `GenerativeModel` (`model_name="gemini-1.5-flash-8b"`,
  no `tools=` at all) is built at line ~257 with a `response_schema` config
  (`response_mime_type: "application/json"`), and it is called at line 284 on
  `response.text`, i.e. the plain-text output of the first call, not a fresh user prompt. This
  is the two-calls pattern the question sheet anticipates: what crosses the boundary is raw
  generated text, and the code (not the model) decides the second call happens, unconditionally,
  right after the first returns. Model id: `gemini-1.5-flash` (search) then `gemini-1.5-flash-8b`
  (schema), SDK `google-generativeai` (the legacy `genai.protos` API, not `google-genai`/`types`).
- **Veo_3_1_Fast_Extend.ipynb passes an image to the model, but not for identification.**
  `Veo_3_1_Fast_Extend.ipynb` cell 0 and cell 3 read a JPEG off disk and call
  `client.models.generate_videos(model="veo-3.1-fast-generate-preview", prompt="...", image=types.Image(image_bytes=image_bytes, mime_type="image/jpeg"), config=video_config)`.
  This is image-to-video generation (the photo is a starting frame for Veo), not the model being
  asked what the image contains, and there is no search or grounding tool on this call. Not
  evidence for Q1, listed because it is the only place in the repo an image reaches a Gemini-family
  model call at all.

## Q2 stopping being wrong

- **Nothing here rechecks, retries, or gates an answer against a source.** The only
  multi-step pattern in the repo is the two-call market-research flow above (search call then
  schema call), and it re-runs unconditionally, not on any weakness signal: no confidence check,
  no retry-on-failure, no budget/cap, no inspection of grounding or citation metadata before
  trusting the text. Grepped for `retry`, `confidence`, `grounding_metadata`, `citations` across
  all 8 notebooks: no hits outside the word "confidence" not appearing at all. Not applicable to
  price extraction either; nothing here scrapes or parses a price off a page.

## Q3 same shape every time

- **One real `response_schema`, prompt-level only in structure, API-level in mechanism, and never
  combined with search.** `notebooks/Automating_market_research_with_Gemini.ipynb` builds a
  nested `content.Schema`/`genai.protos.Schema` object (`type=OBJECT`, `required=["company_name"]`,
  nested `required=["CEO_name","current_valuation","last_funding_month_and_year","series_level","product_names"]`,
  `product_names` typed as `ARRAY` of `STRING`) starting at line ~176, passed as
  `generation_config["response_schema"]` with `response_mime_type: "application/json"` on the
  second, `tools`-free model (see Q1). This is a genuine API-level schema (the legacy
  `google-generativeai` `content.Schema`/`genai.protos.Schema` types), not a shape typed into the
  prompt string. But this same call has no `tools=` argument at all, so it cannot answer whether
  schema and grounding are simultaneously accepted; **this repo does not confirm or break the
  Gemini 2.5-vs-3.x mutual-exclusivity belief**, it only shows one project keeping them on two
  separate model objects. Matters because Shin needs the schema-plus-search combination on one
  call, and the one example of schema construction here is deliberately kept apart from the one
  example of search.
- **No validator, no re-ask.** `json.loads(response.text)` is called directly on the schema
  model's output (`notebooks/Automating_market_research_with_Gemini.ipynb:287`) with no
  try/except, no retry, and no check that required fields are present before the flattened JSON
  is written to a Google Sheet a few cells later. A malformed or empty JSON string would raise
  and stop the notebook, not trigger a re-ask.

## Nothing here on

- Visual identification of a real-world object from a photo: no notebook sends an image to a
  Gemini text/vision endpoint at all (checked every `generate_content(` call site, listed under
  Q1); the only image-into-a-model call is Veo image-to-video generation, not description or
  identification.
- Function calling triggered by what is seen in a picture: no `FunctionDeclaration`,
  `function_declarations`, `tool_config`, or `automatic_function_calling` string appears in any
  notebook (checked with a repo-wide grep). `notebooks/YouTube_reports_in_GMail.ipynb` does use
  function-calling, but through Composio/LlamaIndex tools for YouTube search and Gmail drafting,
  triggered by a text query, never by an image.
- Price extraction, currency/unit/date capture, staleness checks: no notebook scrapes or parses a
  price from any source.
- Media resolution hints, thinking budget, image cropping or resizing before sending to a model:
  not present; the only image resizing in the repo (`Veo_3_1_Fast_Extend.ipynb` cell 2,
  `image.resize((3840, 2160))`) is upscaling a video frame for the next Veo call, unrelated to a
  Gemini understanding request.

## Dead or unwired

- None found. Every mechanism identified above (the search-tool model, the schema model, the
  Veo image call, the Composio function-calling agent) is called from a notebook cell that runs
  in sequence with the cells before it; nothing is defined and left unimported.
