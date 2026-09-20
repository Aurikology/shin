# shin (this repo, xu826Jamin/shin), the negative control

One line: a hand-rolled `node:http` server (`app/server.ts`) that, on a photo or barcode scan,
sends one raw `fetch` POST to Google's Interactions API with the image (when present) and
`tools: [{ type: 'google_search' }]` on the same request body, asks Gemini to do the price math
itself, and stores a background, never-displayed re-check of that math. An older two-call,
Shin-computes-everything design (Claude identify, separate grounded price/review search, its own
gauge math) still lives in the repo and is provably unimported by the live path.

Read depth: `app/server.ts` (routes `/api/identify`, `/api/identify/photo`, `/api/price`, and the
`completeGeminiScan`/`geminiScanModule` plumbing around lines 860-1420 and 2030-2530);
`identify/src/providers/gemini-scan.ts` in full (1368 lines: prompt assembly, request body,
transport, answer reading, `checkMath`); `identify/src/providers/gemini.ts` (model ids, media
resolution, thinking level, `interactionsUrl`, the older `GeminiProvider`/`interactionBody`);
`identify/src/providers/gemini-grounded.ts` (citations contract, `GeminiGroundedProvider.fetchGrounded`,
`gauge.ts` usage) enough to place it outside the live path; `identify/src/cap.ts` (spend caps) in
full; `Shin_Gemini_Pricing_Engine/response_schema.json` (structure, enum count) and the file list
`loadEngine()` reads; `docs/jamin-gemini-rules.md` and `docs/the-photo-path.md` for the
documents-vs-code check. Did not open: `app/src/eye/*` (client-side capture/crop, upstream of the
request body built here), `spine/src/*` internals beyond confirming `priceIt` is called only from
the `/api/catalogue` "answerable" demo endpoint, `native/*`, `catalogue/*` embeddings, the test
files beyond confirming what they alone import.

## Q1 image plus search

- **Yes, same request.** `identify/src/providers/gemini-scan.ts:378-404` (`buildRequestBody`)
  builds one `RequestBody` with `tools: [{ type: 'google_search' }]` (line 396) and, for a photo
  scan, an `input` array whose first element is `{ type: 'image', data: <base64>, mime_type,
  resolution: mediaResolution() }` (lines 382-388) followed by the text prompt. This single body
  is POSTed once, at `identify/src/providers/gemini-scan.ts:934-939`, to
  `https://generativelanguage.googleapis.com/v1beta/interactions` (default base URL, line 923;
  built by `interactionsUrl()` from `gemini.ts`). Matters because this is exactly the fact
  QUESTIONS.md says nobody has confirmed for the Gemini API: this repo's own comment at
  `gemini-scan.ts:26-29` cites Google's structured-output docs that schema+search together is
  "available only to Gemini 3 series models," and the code honours that split rather than avoiding
  the combination entirely.
- **Image encoding/size.** Raw image bytes, base64-encoded inline (`Buffer.from(input.image.bytes).toString('base64')`,
  `gemini-scan.ts:385`), PNG or JPEG (`imageKind` gate in `app/server.ts:2303-2305`), capped at
  3 MiB body size (`MAX_PHOTO_BODY_BYTES`, enforced at `app/server.ts:2288-2289`). No resize or
  crop happens server-side; the server takes whatever bytes the client posted.
- **Model id.** Chosen per device by a stable hash of `deviceId`, half go to `DEFAULT_GEMINI_25 =
  'gemini-2.5-flash'`, half to `DEFAULT_GEMINI_3 = 'gemini-3.8-flash'`
  (`gemini-scan.ts:56-57,80-89`), overridable by `SHIN_GEMINI_MODEL`/`_25`/`_3` env vars.
- **Schema on the same request only for 3.x.** `gemini-scan.ts:399-402`: `if (choice.family ===
  '3.x') body.response_format = { type: 'text', mime_type: 'application/json', schema:
  loadEngine().schema }` and `generation_config = { thinking_level: thinkingLevel() }`. On 2.5
  neither field is set; instead the JSON shape is spelled out in the prompt text via `skeleton()`
  (`gemini-scan.ts:327-333`).
- **Media resolution / thinking / other knobs.** `mediaResolution()` defaults to `'medium'`
  (`identify/src/providers/gemini.ts:191-194`, env override `SHIN_GEMINI_MEDIA_RESOLUTION`,
  restricted to `low|medium|high|ultra_high`). `thinkingLevel()` defaults to `'low'`
  (`gemini.ts:204-207`, restricted to `minimal|low|medium|high`, only sent for 3.x). No
  temperature is set anywhere in `buildRequestBody`. Timeout defaults to 30,000 ms
  (`DEFAULT_TIMEOUT_MS`, `gemini-scan.ts:826,926`), overridable by `SHIN_GEMINI_TIMEOUT_MS`, enforced
  via `AbortController` (`gemini-scan.ts:927-928`).
- **System instruction and prompt assembly.** System text is `GEMINI_SYSTEM.md` concatenated with
  `PRICING_GUIDE.md`, read fresh from disk once and cached (`loadEngine()`, `gemini-scan.ts:249-259`,
  files in `Shin_Gemini_Pricing_Engine/`). User text is `scan_prompt.md` with `{{PLACEHOLDER}}`
  tokens substituted by `fill()` (`gemini-scan.ts:281-283,337-362`) from the scan's market fields,
  thresholds, shelf price, image note, and the output-format instruction (schema-in-prompt or
  schema-by-API, decided by model family).
- **Not two calls for a photo scan.** Barcode and text scans never carry an image at all
  (`ScanInput.image` only set `if (input.kind === 'photo' && input.image)`, `gemini-scan.ts:381`).
  There is no second Gemini call anywhere in the live path (see Q2); the file's own header says
  "the ONE GEMINI CALL a scan makes" (`gemini-scan.ts:1-2`) and the request is built and sent
  exactly once per `runGeminiScan` invocation (`gemini-scan.ts:846-994`).

## Q2 stopping being wrong

- **Nothing retries or re-asks.** `runGeminiScan` (`gemini-scan.ts:846`) "NEVER THROWS... Makes the
  one call" (doc comment, lines 841-845); a timeout, HTTP error, malformed JSON, or a refused spend
  all return a marked `GeminiRun` with `failure` set and no second attempt. Grep for a retry loop
  on this path: `identify/src/model.ts` and `identify/src/provider.ts` do implement a "retry a
  retryable failure once against the same provider" policy (`provider.ts:186-244`), but neither is
  imported at runtime by `app/server.ts`, only `import type { Tier } from
  '../identify/src/model.ts'` (a type-only import, `app/server.ts:34`), confirmed by `grep -n
  "IdentifyStage\|from '\.\./identify/src/provider\.ts'" app/server.ts` returning only the comment
  line at 881 that names `IdentifyStage` as what the one-call design **replaced**.
- **No confidence gate that blocks an answer.** `confidenceOf()` (`gemini-scan.ts:828-839`) collects
  reasons (`no_product_name`, `identification_confidence_low` below 0.5, `overall_confidence_low`
  below 0.5, `answer_repaired`, `answer_unparsed`) into `lowConfidence`/`confidenceReasons`, which
  are returned to the client as marks, never as a refusal or a second query. Rule 6 in
  `docs/jamin-gemini-rules.md:44-45` ("an answer that is not checked is infinitely better than...
  told the app doesn't know") matches this exactly, so this is intentional, not a gap.
- **A hidden math re-check exists, but only marks, never gates.** `checkMath()`
  (`gemini-scan.ts:1252-1313`) recomputes the median, zone boundaries and shelf position from
  Gemini's own offers and compares them to what Gemini stated, catching rounding vs real
  disagreement (`close()` tolerance, line 1236-1237). It runs in `app/server.ts`'s
  `scheduleMathCheck()` (lines 1096-1125) inside `setImmediate`, **after** the response has already
  gone out ("After the answer has gone out", line 1092-1093; "it can only ever write a mark", line
  1094); the result is written via `markGeminiMath()` to the stored call row and nothing else reads
  it back. Matters for price accuracy: a wrong median or wrong zone reaches the shopper before this
  check even runs.
- **Grounding metadata is stored/displayed, not verified.** `citations`/`searchQueries` are read out
  of the response steps by `walkSteps()` (shared helper in `gemini-grounded.ts:492-554`) and passed
  straight through `runGeminiScan` (`gemini-scan.ts:976-977,989-990`) into the wire response
  (`server.ts` `wireFor`, line 1408) with no comparison against the answer text. The design intent
  is explicit in `gemini-grounded.ts:147-154`: "citations are NOT interspersed into the answer
  text... uses `citations` only to decide whether to show the 'no link for this one' heads-up," i.e.
  display-only, confirmed identically true of the live path's own citation fields (no function in
  `gemini-scan.ts` reads `citations` for anything but pass-through).
- **Caps exist, but they are a dollar budget, not a correctness check.** `identify/src/cap.ts`:
  soft cap defaults to CAD 10/day (`DEFAULT_CAP_CAD`, line 89), hard cap defaults to 10x that
  (`HARD_CAP_MULTIPLE = 10`, line 91). Crossing the soft cap still lets the call go out and marks
  the scan `overCap` (`chargeSpend()`, lines 202-221); only the hard ceiling refuses with
  `spend_cap_reached`, a "kind, retryable" answer (`gemini-scan.ts:816-821`), never a correctness
  signal. A separate per-device photo rate limiter (`photoRateAllows`, `app/server.ts:2315`) and
  `paidCallRefusal` throttle request volume (429s), also unrelated to answer quality.
- **Price number: no independent source, no staleness check.** The price, offers, median and
  verdict are all read straight out of Gemini's own JSON (`readAnswer()`, `gemini-scan.ts:700-760`),
  defensively parsed (`n()`, `s()`, never throws) but never fetched from a second source. Currency
  and unit ride with each offer as Gemini stated them (`currency: s(r.currency)?.toUpperCase()`,
  line 710); there is no date/freshness field read or checked anywhere in `readAnswer` or
  `ReadOffer`. The only "validation" of the price side is the after-the-fact, invisible `checkMath`
  arithmetic re-check above, which checks Gemini's math against Gemini's own inputs, not against
  an outside price source.

## Q3 same shape every time

- **Real API-level schema, but only on 3.x.** `Shin_Gemini_Pricing_Engine/response_schema.json`
  (807 lines) is a genuine JSON Schema with typed properties, `required` arrays (e.g.
  `scan.required: ["scan_type","barcode","market","currency"]`) and six `enum` fields (`kind`,
  `store_type`, `condition`, a nullable pair, and `confidence`). It is sent as
  `response_format.schema` only when `choice.family === '3.x'` (`gemini-scan.ts:399-402`). On 2.5
  the identical schema is walked by `skeleton()` (lines 262-277) into a compact type description
  and pasted into the prompt text (`OUTPUT_FORMAT`, lines 327-333) instead of being an API
  parameter, a shape "described in the prompt text," exactly the distinction QUESTIONS.md asks
  about, on the same model family split as Q1.
- **Schema and search together, confirmed for 3.x, absent for 2.5, both in one code path.** This is
  the direct answer to QUESTIONS.md's belief-check: `gemini-scan.ts:396` sets `google_search`
  unconditionally; `gemini-scan.ts:399-402` adds the schema only when `family === '3.x'`. So on the
  same model id set, 3.x gets schema+search together on one call and 2.5 gets search alone with the
  shape asked for in words. `docs/jamin-gemini-rules.md:237-243` documents the same finding, dated
  2026-09-18, and cites the same upstream doc as the reason.
- **Validator: read-and-repair, not reject-and-reask.** `interpretText()`
  (`gemini-scan.ts:494-514`) tries a direct `JSON.parse`, then a tolerant parser (`parseJson` from
  `gemini-grounded.ts`), then `repairJson()` (`gemini-scan.ts:474-490`, closes unterminated
  strings/arrays/objects and trims trailing fields up to 400 times). None of these paths re-ask
  Gemini; a status of `'failed'`/`'none'` still returns a `GeminiRun` with `answer: null` and a
  `no_product_name`/`answer_unparsed` mark, and the scan still returns HTTP 200 with the marked
  answer (`app/server.ts` catch blocks at 2103-2117 and 2361-2373 only fire on a client/transport
  exception, not on a parse failure).
- **Row-level reading never throws.** `readAnswer()`, `readAlternatives()`, `n()`, `s()`, `b()`
  (`gemini-scan.ts:518-760`) are all defensive: a missing or malformed field becomes `null` or is
  dropped and counted (e.g. `readAlternatives` marks a row `dropped` with a reason rather than
  failing the whole answer, lines 623-671), never a thrown error that would need a catch.
- **Prompt assembly is template file plus inline fill, no few-shot examples found.** `scan_prompt.md`
  is read once and cached, filled by simple `{{TOKEN}}` substitution (`fill()`,
  `gemini-scan.ts:281-283`); grep of `Shin_Gemini_Pricing_Engine/*.md` for example transcripts or
  "few shot" language found none in the files `loadEngine()` reads (`GEMINI_SYSTEM.md`,
  `PRICING_GUIDE.md`, `scan_prompt.md`). Did not find a "transcribe visible text before naming it"
  instruction inside the files `loadEngine()` actually reads; `alternatives_prompt_fragment.md` and
  `market_rules_fragment.md` also exist in `Shin_Gemini_Pricing_Engine/` but are not among the three
  files `loadEngine()` reads and are therefore unwired (see below).

## Nothing here on

- No cross-check of two independent sources against each other on the live path: there is exactly
  one model call, so there is nothing to cross Gemini's answer against, by design (`docs/jamin-gemini-rules.md`
  rule 3, "THE PRICE SHOULD NOT COME FROM US").
- No refusal branch that stops an answer from reaching the user for being low-confidence; the only
  branches that return something other than the model's answer are transport/parse failures and the
  hard spend ceiling, both already covered under Q2.

## Dead or unwired

- **`identify/src/model.ts` and `identify/src/provider.ts`** (retry policy, dollar cap, the
  Claude/xAI provider abstraction, `IdentifyStage`'s dependencies): only type-imported by
  `app/server.ts` (`import type { Tier } from '../identify/src/model.ts'`, line 34) and by two test
  files (`app/test/photo-route.test.ts:44`, `app/test/server-photo-record.test.ts:48`, both
  type-only). `grep -n "IdentifyStage" app/server.ts` returns one hit, a comment at line 881 naming
  it as what the one-call rebuild replaced.
- **`identify/src/providers/gemini-grounded.ts`'s `GeminiGroundedProvider`, `fetchGrounded()`,
  `pricesReviewsRequest()`** (the older two-call "search only" adapter with its own doc comment "THE
  BODY is `interactionBody` from `gemini.ts`... plus `tools`", lines 624-637): `grep -rn
  "GeminiGroundedProvider|fetchGrounded|pricesReviewsRequest" --include=*.ts .` returns matches only
  in `identify/test/gemini-grounded.test.ts` and the defining file itself, no hit in `app/server.ts`
  or `gemini-scan.ts`.
- **`identify/src/providers/gemini.ts`'s `GeminiProvider` class and `interactionBody()`**: `grep -rn
  "GeminiProvider\b" --include=*.ts .` shows every non-defining use inside `identify/test/gemini.test.ts`;
  the live path (`gemini-scan.ts`) builds its `RequestBody` by hand and sends it with a bare `fetch`
  call, never instantiating `GeminiProvider`.
- **`identify/src/gauge.ts`, `gauge-variant.ts`, `confidence.ts`, `describe.ts`, `gtin.ts`**: none are
  imported by `gemini-scan.ts` (`grep -n "from '\.\./confidence\|from '\./gauge\|from '\.\./describe\|from '\.\./gtin'" identify/src/providers/gemini-scan.ts`, no hit). `gauge.ts` is still imported
  by the also-unwired `gemini-grounded.ts` (line 100) and by `gauge-variant.ts` for types only;
  `gauge-variant.ts`, `confidence.ts`, `describe.ts` and `gtin.ts` have no importer outside their
  own tests. These are Shin's own price-gauge/zone-math module, superseded by taking `price_verdict`
  straight out of Gemini's answer.
- **`spine/src/spine.ts`'s `priceIt()`**: still called, but only from `answerable()` in
  `app/server.ts:320-334`, which feeds the informational `/api/catalogue` "how many of these seven
  recorded items can Shin answer for" listing, not from `/api/identify`, `/api/identify/photo`, or
  `/api/price`. The server's own comment says so directly: "Shin's own price engine is not run here
  any more... no median, placement or verdict is computed on this server" (`app/server.ts:2439-2442`).
- **`Shin_Gemini_Pricing_Engine/alternatives_prompt_fragment.md` and `market_rules_fragment.md`**:
  present in the engine's directory but not among the three files `loadEngine()` reads
  (`GEMINI_SYSTEM.md`, `PRICING_GUIDE.md`, `scan_prompt.md`, `gemini-scan.ts:252-256`); whatever
  alternatives/market wording they contain is not part of the live system or user text.

## Documents vs. live code

- **`docs/the-photo-path.md` (written 2026-09-09) describes a completely different, dead design**:
  a two-pass Claude system (`claude-haiku-4-5` basic / `claude-sonnet-5` pro), a catalogue cascade
  with three queries, GTIN checksum validation, an enum confidence of `high|medium|low`, and
  `IdentifyStage`/`spine/src/run.ts` `scan()` as the composition point. The document itself already
  flags its own centerpiece as unwired ("`identify/src/model.ts` + `identify/src/identify.ts`...
  is imported by nothing", line 10-11; "`spine/src/run.ts` `scan()`... is also imported by nothing",
  line 15-16), written before the 2026-09-14/15 Gemini switch this scan traces, and nothing in it
  matches the live one-call path. Treating this file as current would misdescribe every part of Q1
  through Q3.
- **`docs/jamin-gemini-rules.md` (2026-09-15 through 09-19) matches the live code closely**,
  including the exact Gemini-3-only schema+search claim this scan independently verified in
  `gemini-scan.ts:399-402`, the one-call rule, and the background-only math check. No contradiction
  found between this document and the traced code.
