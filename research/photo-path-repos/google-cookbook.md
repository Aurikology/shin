# google-gemini/cookbook

One line: Google's own worked-example notebooks for the Gemini API/SDK (`google-genai` Python
SDK, plus REST/curl variants); not application code, so every finding here is "what Google shows
as the correct way to call the API," which is exactly the authority this scan needs.

Read depth: fetched the repo tree via the GitHub API (`git/trees/main?recursive=1`, 151 notebooks
total, no clone) and pulled these via `raw.githubusercontent.com`, stripped to cell text:
`quickstarts/Grounding.ipynb`, `quickstarts/Search_Grounding.ipynb`,
`quickstarts/rest/Search_Grounding.ipynb`, `quickstarts/JSON_mode.ipynb`,
`quickstarts/rest/JSON_mode_REST.ipynb`, `quickstarts/File_Search.ipynb`,
`quickstarts/Spatial_understanding.ipynb`, `quickstarts/Get_started_Generate_Content.ipynb`,
`examples/Search_grounding_for_research_report.ipynb`,
`examples/hybrid_file_search_and_google_search.ipynb`,
`examples/Pdf_structured_outputs_on_invoices_and_forms.ipynb`,
`examples/Tag_and_caption_images.ipynb`, `examples/Opossum_search.ipynb`.
Deliberately not opened: the `examples/json_capabilities/*.ipynb` text-only JSON notebooks
(Entity/Sentiment/Text_Classification/Text_Summarization -- filenames and their one-line repo
descriptions rule out image or search content), the langchain/llamaindex/qdrant/weaviate/chromadb
integration notebooks (third-party wrappers, not the raw API shape), and all video/audio/Live API
notebooks except the Live API search section inside `quickstarts/Search_Grounding.ipynb` (already
open for the text case).

## Q1 image plus search

- **No cell in this repo puts an image Part and the `google_search` tool on the same
  `generateContent`/`interactions.create` call.** This is an absence finding, not a positive
  example -- see below for what was actually searched.
- Where image input is demonstrated, it is always alone in the request, no tools at all:
  `examples/Tag_and_caption_images.ipynb` cell 16 --
  `contents=[PILImage.open(image_path)], config=types.GenerateContentConfig(system_instruction=prompt)`
  -- no `tools=` key present.
  `quickstarts/Grounding.ipynb` cell 46 (`Add images by URL`, Method 1) --
  `input=[{"type": "image", "uri": image_url}, {"type": "text", "text": "..."}]` with no `tools=`.
- Where `google_search` is demonstrated, the input is always plain text, never an image Part:
  `quickstarts/Search_Grounding.ipynb` cell 14 --
  `interaction = client.interactions.create(model=MODEL_ID, input='What was the latest Indian
  Premier League match and who won?', tools=[{"type": "google_search"}])`.
  `quickstarts/rest/Search_Grounding.ipynb` cell 9 -- same shape over curl, `"contents":
  [{"parts": [{"text": "..."}]}], "tools": [{"google_search": {}}]`.
- The one cell that combines *any* tool with a non-text input is
  `quickstarts/Grounding.ipynb` cell 49 ("Mix Search grounding and URL context"): `tools=[{"type":
  "url_context"}, {"type": "google_search"}]`, but the "non-text" content is a PDF URL typed
  **into the prompt string**, not an `image`/`document` Part on the request -- `url_context`
  fetches it server-side. So even the one multi-tool-plus-media cell in the repo keeps the media
  out of the `contents`/`input` array.
- The closest thing to "image + retrieval tool, one call" is
  `quickstarts/File_Search.ipynb` cells 37-42 ("Multimodal File Search"): an image is uploaded
  ahead of time to a File Search store (`client.file_search_stores.upload_to_file_search_store`,
  `embedding_model='models/gemini-embedding-2'`), then queried with `tools=[{"type":
  "file_search", "file_search_store_names": [...]}]` and a **text-only** `input`. The model
  retrieves the stored image server-side; the caller's request still carries no image Part, and
  the tool is File Search (private embedding index), not live Google Search grounding. This is
  evidence for "Gemini can be handed an image via a tool call," not for "image Part + live web
  search in one call" -- it does not answer Q1's precise question either way, it just shows a
  different combination exists.
- **What was searched to call the negative a real absence, not a missed file:** every notebook
  whose path or repo-shown description mentions grounding/search (`Grounding.ipynb`,
  `Search_Grounding.ipynb` x2, `Search_grounding_for_research_report.ipynb`,
  `hybrid_file_search_and_google_search.ipynb`, `File_Search.ipynb`), every notebook whose path
  or description mentions vision/image (`Tag_and_caption_images.ipynb`,
  `Pdf_structured_outputs_on_invoices_and_forms.ipynb`, `Spatial_understanding.ipynb`,
  `Get_started_Generate_Content.ipynb`), and a grep across all of them for
  `google_search|GoogleSearch|PILImage|Image.open|inline_data` to catch any cell that uses both
  tokens. None did. Not opened: video/audio-only notebooks and the plain prompting-technique
  notebooks under `examples/prompting/`, neither of which is about grounding or vision by name or
  description.
- No prose cell in any of these notebooks states outright "you cannot combine an image with
  Google Search" -- the absence here is structural (no cell does it) plus one adjacent
  documentation gap, not an explicit prohibition. Flag this as **unknown, narrower**: the repo
  never demonstrates the combination and never explains why not, so "the API forbids it" is not
  confirmed, only "Google's own examples never show it."

## Q2 stopping being wrong

- `examples/hybrid_file_search_and_google_search.ipynb` cells 19, 24-27 is the one real
  "check and escalate" mechanism in scope: `ask_with_fallback()` calls File Search first, then
  `is_sufficient()` (cell 19) rejects the answer on two conditions -- `grounding_chunks` empty, or
  the response text contains one of `NO_ANSWER_PHRASES` (`"does not contain"`, `"no information"`,
  `"not mentioned"`, `"unable to answer"`, `"cannot answer"`, `"i don't know"`, etc.) -- and only
  then re-issues a **second, separate** `generate_content` call with `tools=[types.Tool
  (google_search=types.GoogleSearch())]`. The retry does not change the prompt, it swaps the tool.
  This is the one place in the repo where a weak first answer triggers a second search call, and
  the trigger condition is a literal phrase-list, not a confidence score.
  Matters for Shin: this is the shape of a fallback price/identity check (try the primary source,
  detect "documents don't say," then broaden), but the "is it wrong" detector here is a hand-built
  string match, not something that would catch a confidently-wrong price.
- Same notebook, cell 25-31 (`ask_hybrid`, `describe_grounding`): the "native" alternative hands
  both tools to the model in one call and inspects `grounding_metadata.web_search_queries`,
  `retrieval_queries`, `grounding_chunks`, `grounding_supports` afterward -- this is metadata
  being *displayed*, not verified: nothing in the cell drops a claim whose text span has no
  matching `grounding_supports` entry.
- `quickstarts/Search_Grounding.ipynb` cell 27-33: a chat-style retry loop for regenerating
  matplotlib code, but the trigger is "the user asked for a change" (a new turn), not a
  correctness check on the first answer.
- **Nothing here on:** a numeric confidence gate, an enum confidence band, a refusal path, a
  citation-vs-answer verifier, a retry budget/cap with a defined fallback return value, or
  anything price-specific (currency/unit/date extraction, staleness check). Searched: both
  `Grounding.ipynb` and both `Search_Grounding.ipynb` files, `Search_grounding_for_research_
  report.ipynb`, `hybrid_file_search_and_google_search.ipynb`. None of them contain a second
  search triggered by anything other than the two conditions above or a new user turn.

## Q3 same shape every time

- Canonical structured-output shape, Interactions API (current default across the repo):
  `quickstarts/JSON_mode.ipynb` cell 21 --
  `client.interactions.create(model=MODEL_ID, input=..., response_format={"type": "text",
  "mime_type": "application/json", "schema": Recipe.model_json_schema()})`, schema built from a
  Pydantic `BaseModel` via `.model_json_schema()`.
- Canonical structured-output shape, `generateContent` (still the shape used wherever a file/image
  is attached): `examples/Pdf_structured_outputs_on_invoices_and_forms.ipynb` cell 17 --
  `response = client.models.generate_content(model=model_id, contents=[prompt, file],
  config={'response_mime_type': 'application/json', 'response_schema': model})` where `model` is a
  Pydantic class; `response.parsed` returns the validated object. REST equivalent:
  `quickstarts/rest/JSON_mode_REST.ipynb` cell 8 -- `"generationConfig": {"response_mime_type":
  "application/json"}` with the schema spelled out inline in the prompt text, not at the API
  level (this REST notebook never demonstrates `response_schema` as a request field, only
  `response_mime_type`; the schema-as-JSON-Schema-object path is SDK-only in this repo).
- Real API-level schema vs. prompt-shaped: both exist. `JSON_mode.ipynb` cell 10 shows the
  weaker "describe the schema in the prompt text + `response_format` type=json" version before
  introducing the real `schema=` field in cell 21 -- the notebook itself frames the schema-object
  version as the recommended one (cell 25: "The Pydantic approach... is the recommended method").
- Enums / required fields / property ordering: `examples/Pdf_structured_outputs_on_invoices_and_
  forms.ipynb` cells 23-24 -- explicit note: **"Gemini 2.0 models require explicit ordering of
  keys in structured output schemas... not Gemini 2.5 or newer"** -- `property_ordering=
  ["invoice_number", "date", "vendor", "total_amount"]` on a `types.Schema`. This is a stated,
  named model-version difference in schema handling (2.0 vs 2.5+), found as a code comment plus
  prose, not inferred.
- **Schema + search tool together, on which model:** not demonstrated by any executed cell in
  this repo. The one statement on this exact question is a documentation pointer, not code:
  `quickstarts/JSON_mode.ipynb` cell 26 ("Next Steps"), verbatim: *"Structured outputs with tools
  (Google Search, Code Execution, etc.) [em dash in original] available with Gemini 3 models"*, linking out to
  `https://ai.google.dev/gemini-api/docs/interactions/structured-output`. No cell in the notebook
  runs this combination -- it is a forward pointer to external docs, not a worked example. Read
  narrowly, this is **weak, partial confirmation of Shin's belief**: the repo asserts schema+tools
  is a Gemini-3-only capability (implying earlier/2.5 models do not support it) but never shows
  the call, the error it throws on 2.5, or a success on 3.x, so it is evidence of a stated version
  gate, not a demonstrated one.
- No validator-and-reject loop exists anywhere for structured output in this repo: every example
  trusts `response.parsed` / `json.loads(result.output_text)` on the first response. Searched
  `JSON_mode.ipynb`, `rest/JSON_mode_REST.ipynb`, `Pdf_structured_outputs_on_invoices_and_
  forms.ipynb` for `retry`, `validate`, `except.*Validation` -- none found; the one mention of
  automatic-retry-on-validation-error is a pointer to the third-party `instructor` library
  (cell 18 markdown), explicitly not used in the notebook's own code.

## Nothing here on

- Media-resolution / token hints (`media_resolution`), thinking-budget, or temperature settings
  alongside an image input specifically -- grepped `Get_started_Generate_Content.ipynb` (the
  broadest single-call reference notebook, 4.8 MB raw / ~52k chars of cell text after stripping
  outputs) for `media_resolution|thinking_budget|PILImage|Image.open|google_search|response_
  schema` and got zero matches; the notebook does not cover vision, search, or schemas at all
  despite its generic name.
- Image cropping or resizing before sending to the model -- not shown in
  `Tag_and_caption_images.ipynb` or `Grounding.ipynb`; images are passed through `PIL.Image.open()`
  or a raw URL unmodified.
- Any citation-verification step that drops an unsupported claim (see Q2).
- Any price/currency/unit/date extraction pattern at all -- none of the notebooks in scope handle
  price data; closest is generic invoice-total extraction in
  `Pdf_structured_outputs_on_invoices_and_forms.ipynb`, which pulls `total_gross_worth: float`
  with no currency field, no unit field, and no staleness/freshness check.

## Dead or unwired

- `quickstarts/Grounding.ipynb` cell 23 and `quickstarts/File_Search.ipynb` cell 44: both cells
  are placeholders that print a string instead of running code -- `print("Grounding source
  display not yet available in Interactions API")` and `print("Grounding metadata not yet
  available in Interactions API")` respectively. The repo has migrated its main quickstarts to a
  newer "Interactions API" (`client.interactions.create`) that, as of this snapshot, does not
  surface `grounding_metadata` at all; the notebooks say to use the older `generateContent` API
  (pointed at an `archive` branch not fetched in this scan) for citation/grounding-metadata work.
  This matters directly for Shin: the citation/grounding-metadata patterns quoted above in Q1/Q2
  from `hybrid_file_search_and_google_search.ipynb` and `Search_grounding_for_research_report.ipynb`
  are only real because those two examples deliberately stayed on `generate_content`/`models.
  generate_content` instead of the new Interactions API -- confirmed in
  `hybrid_file_search_and_google_search.ipynb` cell 4: *"This notebook uses the `generateContent`
  API rather than the newer Interactions API, because `grounding_metadata`... is returned on
  `generateContent` responses."*
