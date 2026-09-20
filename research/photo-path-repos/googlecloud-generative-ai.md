# GoogleCloudPlatform/generative-ai

Google's own sample-notebook cookbook for Vertex AI / the `google-genai` Python SDK; it is
documentation-as-code, not a shipped application (no server, no retry/backoff layer, no
production error handling beyond the odd `try/except` inside a notebook cell).

Read depth: not cloned (too large, per instructions). Fetched the tree via
`https://api.github.com/repos/GoogleCloudPlatform/generative-ai/git/trees/main?recursive=1`
(3,594 blobs, not truncated), grepped paths for `grounding`, `controlled`, `multimodal`,
`data.store`, `search`, then pulled 8 notebooks raw from `raw.githubusercontent.com` and read
them cell-by-cell:

- `gemini/grounding/intro-grounding-gemini.ipynb` (the priority notebook)
- `gemini/grounding/grounding_with_vais.ipynb` (private data-store grounding)
- `gemini/use-cases/kyc/kyc-with-grounding.ipynb`
- `gemini/controlled-generation/intro_controlled_generation.ipynb`
- `gemini/use-cases/retail/multimodal_retail_recommendations.ipynb`
- `gemini/use-cases/retail/product_attributes_extraction.ipynb`
- `gemini/use-cases/vision-assistant/enhanced_vision_assistant.ipynb`
- `gemini/function-calling/multimodal_function_calling.ipynb`

Deliberately not opened: the `multimodal-live-api/*`, `agent-engine/*`, `rag-engine/*`,
`use-cases/retrieval-augmented-generation/*`, `search/vais-building-blocks/*` and
`search/gemini-enterprise/*` notebooks (34+ more hits from the sweep). These are RAG/agent/live-audio
notebooks whose names did not pair "image" with "search grounding" or "data store grounding" in
the same file; a full read of all ~70 grounding/multimodal/search hits was out of scope for one
pass. Their absence from this file is a gap, not a checked "nothing here."

## Q1 image plus search

- **Yes, on the same request.** `gemini/grounding/intro-grounding-gemini.ipynb:504-520` (cell-26):

  ```python
  PROMPT = "What is the current temperature at this location?"

  response = client.models.generate_content(
      model=MODEL_ID,
      contents=[
          Part.from_uri(
              file_uri="gs://github-repo/generative-ai/gemini/grounding/paris.jpg",
              mime_type="image/jpeg",
          ),
          PROMPT,
      ],
      config=GenerateContentConfig(
          tools=[google_search_tool],
      ),
  )
  ```
  `google_search_tool = Tool(google_search=GoogleSearch())` is defined earlier at line 463.
  `MODEL_ID = "gemini-3.8-flash"` (line 478 in the same notebook). SDK: `google-genai`
  (`%pip install --upgrade --quiet google-genai`, cell-7), client built with
  `genai.Client(enterprise=True, project=PROJECT_ID, location=LOCATION)` (cell-11). This is the
  single clearest answer to the priority question: Google's own sample puts an inline `Part` (a
  GCS `file_uri`, not base64, not a local upload) and `tools=[Tool(google_search=GoogleSearch())]`
  in one `generate_content` call, on Gemini 3.8 Flash. For a product-photo app this is a direct
  proof that "photograph it, then search the web for it in the same call" is a real, supported
  shape, at least for `GoogleSearch`.

- **What is sent alongside:** nothing beyond `tools=[...]`. No `media_resolution`, no
  `thinking_config`, no `temperature`, no `system_instruction` on this specific call (line
  504-520). Checked by grepping all 8 fetched notebooks for `media_resolution`: zero hits
  anywhere. Absence, not a positive example: Google's own samples never demonstrate a resolution
  or token-hint parameter on an image part, grounded or not.

- **Private data store (Vertex AI Search / "Agent Search") is a *separate* tool, never shown
  combined with an image.** `gemini/grounding/intro-grounding-gemini.ipynb:721-727` (cell-39):

  ```python
  search_tool = Tool(
      retrieval=Retrieval(vertex_ai_search=VertexAISearch(engine=SEARCH_ENGINE_NAME))
  )

  response = client.models.generate_content(
      model=MODEL_ID,
      contents="What is the company culture like?",
      config=GenerateContentConfig(tools=[search_tool]),
  )
  ```
  `contents` here is a bare string, no `Part`. The dedicated data-store notebook,
  `gemini/grounding/grounding_with_vais.ipynb:484-509` (cell-24/25), constructs the same
  `Tool(retrieval=Retrieval(vertex_ai_search=VertexAISearch(engine=...)))` and again calls it with
  `contents=PROMPT` (a string) on `MODEL_ID = "gemini-3.8-flash"` (line 478). Neither notebook, nor
  any of the other 6 read, ever puts a `Part.from_uri`/`Part.from_data` image next to a
  `VertexAISearch`/`Retrieval` tool. This is an absence finding, not a documented incompatibility:
  I found no line of code anywhere in the 8 notebooks read that either combines or forbids
  image + data-store grounding. It is simply never exercised in Google's own examples.

- **How the data store is attached, concretely:** `engine=f"projects/{PROJECT_ID}/locations/global/collections/default_collection/engines/{engine_id}"`
  (`grounding_with_vais.ipynb:506-509`), a fully-qualified Discovery Engine resource path, built
  after creating a `DataStore` (`vais.DataStore(..., solution_types=["SOLUTION_TYPE_SEARCH"],
  content_config="CONTENT_REQUIRED")`, `grounding_with_vais.ipynb:303-308`) and an `Engine` with
  `search_tier=vais.SearchTier.SEARCH_TIER_ENTERPRISE` and
  `search_add_ons=[vais.SearchAddOn.SEARCH_ADD_ON_LLM]` (`grounding_with_vais.ipynb:475-491`).
  This is the paid managed catalogue-lookup path the founder is asking about: a data store is a
  Discovery Engine resource, not a request-time payload, so "attaching your product catalogue" is
  an out-of-band ingest+index step (`import_documents` from a GCS source,
  `grounding_with_vais.ipynb:352-360`), then only the resource name goes on the request.

- **What comes back from data-store grounding:** the same `grounding_metadata` shape as web
  search, but chunks carry `retrieved_context` instead of `web`:
  `grounding_with_vais.ipynb:554-556`:
  ```python
  for i, chunk in enumerate(response.candidates[0].grounding_metadata.grounding_chunks):
      display(Markdown(chunk.retrieved_context.text))
      print(chunk.retrieved_context.uri)
  ```
  The shared helper `print_grounding_data` in `intro-grounding-gemini.ipynb:314-367` handles both
  cases generically via `chunk.web or chunk.retrieved_context or chunk.maps` (line 342-346), i.e.
  the SDK models web results, data-store results and Google Maps results as three variants of one
  `grounding_chunks` list, so a consumer can be written once. It also distinguishes
  `metadata.web_search_queries` from `metadata.retrieval_queries` (line 362-366), the field name
  itself tells you which grounding source fired.

- **A worked note on reliability:** `grounding_with_vais.ipynb:cell-30` (markdown, ~line 552 area):
  *"The model may not always output grounding support, even with successful retrieval. This
  occurs when the model doesn't find a strong enough corroboration in the retrieved information."*
  That is Google's own documentation-level acknowledgment that a data-store retrieval can succeed
  while contributing zero citations to the answer, relevant to Shin's "cannot accurately find its
  prices" complaint if a private catalogue is ever wired in: retrieval success is not answer
  support.

- **Image + a custom (non-search) tool works fine, which is a different question than Q1 but
  worth separating cleanly:** `gemini/function-calling/multimodal_function_calling.ipynb` combines
  `Part.from_uri(...)` with `tools=[image_tool]`/`invoice_tool`/`chat_tool` (function-declaration
  tools, e.g. lines 356, 397-399, 1075, 1122-1140) on `MODEL_ID = "gemini-3.8-flash"` (line 301).
  This proves the SDK lets an image ride alongside *any* tool object generically; it does not by
  itself say anything about `GoogleSearch`/`VertexAISearch` specifically, that combination is
  only demonstrated at `intro-grounding-gemini.ipynb:504-520`, cited above.

## Q2 stopping being wrong

- **No second search, no confidence gate, no retry-on-weak-grounding anywhere in the 8 notebooks
  read.** Grepped all 8 for `retry|confidence|dynamic_retrieval|DynamicRetrievalConfig|threshold`.
  Every `threshold` hit across `kyc-with-grounding.ipynb:480-489`,
  `intro_controlled_generation.ipynb:613-628`, and `enhanced_vision_assistant.ipynb:804-809` is
  either a Gemini **safety** threshold (`SafetySetting(category=..., threshold="BLOCK_NONE")`) or
  a hand-tuned camera-distance threshold unrelated to grounding. **Absence, not a documented
  choice**: I found no `dynamic_retrieval_config`, no retrieval-threshold float, and no code that
  reads `grounding_metadata` and decides to search again. Shin's belief that there might be a
  dynamic-retrieval threshold deciding whether to search at all is not confirmed or denied by
  anything in these notebooks; it is simply never exercised.

- **Citation/grounding metadata is displayed, never verified.** Every helper that reads
  `grounding_metadata` (`intro-grounding-gemini.ipynb:314-367`, `grounding_with_vais.ipynb:532-556`,
  `kyc-with-grounding.ipynb:cell-21` "`get_sources`") formats it for markdown output. None of them
  compare the claim text against the retrieved source text, drop an unsupported segment, or refuse
  to answer when `grounding_supports` is empty, the `intro-grounding-gemini.ipynb:317-320` helper
  just prints `"Response does not contain grounding metadata."` and still displays the raw
  (ungrounded) `response.text`. Nothing here checks that an answer is actually supported.

- **The one self-correction technique found is a single extra instruction inside one prompt, not
  a second model call or a budget/cap loop.**
  `gemini/use-cases/retail/product_attributes_extraction.ipynb:507-517`
  (`get_attributes_self_correcting_prompt`):
  ```python
  prompt += """
  Next, treat the returned json as the result generated by a different
  model, rate each key-value pair as "correct" or "wrong" based on the
  same image. ... please update all the attributes that
  are corrected in the final json output.
  """
  model_response = self.gemini_model.generate_content([image_part, prompt])
  ```
  One `generate_content` call total. The self-check happens inside the model's own single
  response, asked to "rate" its own draft attributes against the same image before finalizing , 
  there is no loop, no cap, no second API round trip, and nothing enforces that the model actually
  performed the check. The docstring literally calls it "self-correcting prompt (all in one single
  prompt)" (line 101). This directly answers Shin's "cannot accurately prompt gemini everytime"
  worry: Google's own closest analog to a self-check is prompt-only, unverified by code, and
  capped at exactly one pass.

- **The only retry-shaped code found is exception fallback, not answer-quality fallback.**
  `gemini/use-cases/vision-assistant/enhanced_vision_assistant.ipynb:769-780` (`generate_smart_guidance`):
  ```python
  try:
      ...
      response = self.genai_client.generate_content(model="gemini-2.5-pro", contents=prompt)
      self.previous_guidance = response.text
      return self.previous_guidance
  except Exception as e:
      print(f"Guidance generation error: {e}")
      return self.generate_fallback_guidance(objects)
  ```
  `generate_fallback_guidance` (line 872-881) is a template string built from bounding-box
  positions, no model call. This only fires on a Python exception (network error, API error), not
  on a low-confidence or weakly-grounded answer, the model's own text is trusted unconditionally
  whenever the call itself succeeds.

- **Price-shaped extraction: nothing found.** None of the 8 notebooks pull a price/currency/unit
  off a page or a grounded source. `kyc-with-grounding.ipynb` and the two grounding notebooks
  extract text summaries and citations, not numeric fields with currency/unit/date capture.
  Searched (grep) for `price|currency|USD|\\$` across all 8: no hits outside unrelated boilerplate.
  This is an absence in the sample searched, not a claim that no such notebook exists anywhere in
  the 3,594-blob tree, the retail/pricing-shaped directories (`use-cases/retail/*`) were read in
  full and neither touches price extraction; a wider sweep of `applying-llms-to-data/*` and
  `bigquery_ai_operators.ipynb` (unread) is the next place to look, not concluded here.

## Q3 same shape every time

- **Confirms schema is a real API parameter, not prompt text, on Gemini 2.5 Flash.**
  `gemini/controlled-generation/intro_controlled_generation.ipynb:262`: `MODEL_ID =
  "gemini-2.5-flash"`. Three documented mechanisms, all on that same model id:
  - Pydantic model passed straight to `response_schema` (`:319-320`, class `CountryInfo` at
    `:317`).
  - OpenAPI-subset dict passed to `response_schema` (`:378-405`), supported fields explicitly
    listed in the markdown at `:277-286`: `enum, items, maxItems, nullable, properties, required`
   , "all other fields are ignored" (the notebook's own words).
  - Full JSON Schema (including `allOf`/`if`/`then` conditional requirements) passed to the
    separate `response_json_schema` parameter (`:cell-23`, e.g. `:cell-38` order-status example
    with `"if": {"properties": {"status": {"const": "SHIPPED"}}}, "then": {"required":
    ["tracking_number"]}`), this is the strongest "same shape every time" mechanism found:
    conditionally-required fields enforced by the API itself, not by a validator after the fact.
  - Enum-only output via `response_mime_type="text/x.enum"` + `response_schema=InstrumentEnum`
    (`:532-536`) or a bare `{"type": "STRING", "enum": [...]}` dict (`:cell-36`).

- **Schema plus image, confirmed on the same call, still Gemini 2.5 Flash, still no grounding
  tool present.** `intro_controlled_generation.ipynb:cell-34`:
  ```python
  response = client.models.generate_content(
      model=MODEL_ID,
      contents=[
          Part.from_uri(file_uri="gs://.../office-desk.jpeg", mime_type="image/jpeg"),
          Part.from_uri(file_uri="gs://.../gardening-tools.jpeg", mime_type="image/jpeg"),
          prompt,
      ],
      config=GenerateContentConfig(
          response_mime_type="application/json",
          response_schema=response_schema,
      ),
  )
  ```
  This is the clean confirmation that image + `response_schema` works together on 2.5 Flash. It is
  the closest thing in this repo to Shin's own "photograph it, get structured attributes back"
  shape.

- **Schema and search grounding together: not confirmed, not broken, absent.** Grepped
  `intro_controlled_generation.ipynb` for `tools=` and `Tool(`: **zero hits in the entire file.**
  No cell in this notebook ever imports `Tool`, `GoogleSearch`, or `VertexAISearch`. Conversely,
  grepped `intro-grounding-gemini.ipynb` (the grounding notebook) for `response_schema` and
  `response_mime_type`: zero hits. Google's own repo keeps these two notebooks, and these two
  capabilities, completely separate, I found no single request in any of the 8 notebooks read
  that sets both `tools=[...]` and `response_schema=...`/`response_json_schema=...` in the same
  `GenerateContentConfig`. **This neither confirms nor breaks Shin's belief** that schema and
  search grounding are mutually exclusive on 2.5 and allowed on 3.x, the belief is untested by
  anything in this repo's sample set. It is a genuine gap: the official docs page linked from
  `intro_controlled_generation.ipynb:275` (`docs.cloud.google.com/.../control-generated-output`)
  is the next place to check, not opened here (out of scope: task said read call sites, not docs
  pages).

- **Prompt assembly is inline f-strings throughout, no template files.** Every prompt in all 8
  notebooks is a Python string or f-string built inline in the cell or in a class method (e.g.
  `product_attributes_extraction.ipynb:432-460`, `enhanced_vision_assistant.ipynb` `prompt = f"""
  You are an intelligent navigation assistant..."""` around line 700+). No repo-level prompt
  template files were found among the 8 read; `kyc-with-grounding.ipynb:399-421` uses a
  module-level `prompt_template` string with `.format(input_entity=entity)` substitution, the
  closest thing to a template in this set.

- **Nothing pins the model to transcribe visible text before naming a thing** in any of the 8
  notebooks, the closest is the system instruction in
  `kyc-with-grounding.ipynb:492-494` ("You are a professional news analyst...") and the retail
  `product_attributes_extraction.ipynb:cell-16` system instruction ("your answer should be
  strictly consistent with what's in the image... return null for that attribute"), which
  constrains hallucination but never instructs an OCR-first step.

## Nothing here on

- Dynamic retrieval threshold / `DynamicRetrievalConfig`: zero hits across all 8 notebooks (see
  Q2). Absence, not a ruled-out feature, this repo's samples never exercise it either way.
- Media resolution / token hints on an image part (`media_resolution`): zero hits across all 8
  notebooks.
- Price, currency, unit, or "stale number" extraction: zero hits in the two retail notebooks or
  anywhere else read; only 8 of ~70+ grounding/multimodal/search-tagged notebooks in the tree were
  opened, so this is a narrow-sample absence, not a repo-wide one.
- Schema + search-grounding combined in one request: zero hits (see Q3). Genuinely untested by
  this repo's own samples, in either direction.
- Image + private-data-store grounding combined in one request: zero hits (see Q1). Also
  genuinely untested.
- A validator that rejects and re-asks the model a bounded number of times: not found; the one
  parsing fallback in `product_attributes_extraction.ipynb:307-329` (`parse_json_from_markdown`)
  tries the last fenced code block, then falls back once to the first fenced block, and does not
  retry the model call at all, a `JSONDecodeError` on the fallback path is not caught a second
  time and would propagate uncaught.

## Dead or unwired

- `enhanced_vision_assistant.ipynb:estimate_distance` (around line 809) references
  `self.config.DISTANCE_THRESHOLD_VERY_CLOSE` / `_CLOSE` / `_MODERATE`, but no `self.config`
  attribute is ever assigned anywhere in `EnhancedVisionAssistant.__init__`
  (`enhanced_vision_assistant.ipynb:cell-29`, constructor around line 610-650) or elsewhere in the
  notebook. Calling `estimate_distance` as written would raise `AttributeError: 'EnhancedVisionAssistant'
  object has no attribute 'config'`. Grepped the whole file for `self.config` and `self\.config
  =`: only the read sites exist, no assignment. This is dead/broken code in an otherwise complete
  sample, not a wired feature.
