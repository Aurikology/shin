# The photo path — a picture becomes an identity, and nothing less

*Written 2026-09-09 by the boss lane after reading the tree and a Gemini Pro research pass. The
decision that opens this is "Live photo recognition is load-bearing" in `docs/decisions.md`.
State lives in `NOW.md`; this file is the design and the lane contract.*

## 0. What is true today

- The ladder is barcode → catalogue-by-text → model reads the picture → (web, cut). Attempts one
  and two run. Attempt three, `identify/src/model.ts` + `identify/src/identify.ts` (removed 2026-09-19, d3e4f0b), has been
  written and tested since 2026-09-05 and is imported by nothing (D-024, D-047).
- The eye already produces the right input: a burst-scored, object-cropped, 1568 px long-edge
  **PNG** (`app/src/eye/capture.ts` `cropTo`, decision 12), handed to `camera.js` as `lastCrop`
  and never sent.
- `spine/src/run.ts` `scan()` is the composition point with `BUDGET_MS.photo = 4_000` and a
  `CALL_CAP_MS = 8_000`; it is also imported by nothing.
- `app/src/scans.ts` already allows `kind = 'photo'` and carries `failure_class`.
- The model call has a 1,800 ms clock, one retry on 429/5xx/network, a 2,000/day cap, and a
  `FailureClass` that survives into the scan log. Models: basic `claude-haiku-4-5`, pro
  `claude-sonnet-5`.
- The first pass asks for brand/name/variant/size/category/visible_text and pins brand and size
  into one catalogue search, `limit: 5`. Confidence is six weighted signals. No barcode digits
  are read from the picture, no second pass exists, no eval set exists, and no photo has ever
  gone through the real API (no key on this machine).

## 1. What the research says, and what we take from it

Gemini Pro, 2026-09-09 (no citations were returned; treat the numbers as practitioner claims):

- Single-pass "what is this?" from a vision model lands around 60–70 % exact-SKU; a cascade of
  barcode → retrieval → **vision model picks from the top-N catalogue rows** reaches 85–92 %.
- **Verbatim text first.** Make the model transcribe the front-of-pack text before it fills
  brand and name; brand hallucination drops.
- Structured JSON with an enum confidence, not a free number.
- The shelf tag is a separate crop and a separate read; general vision models fail on warped,
  glossy tags.
- Open Food Facts front images keyed by GTIN are the eval set and, later, the embedding index.
- Failure modes to design for: size variants that look identical, multipack vs single, store
  brands that mimic the leader, and French-face packaging against an English-indexed catalogue.

Taken: the two-pass shape, verbatim transcription, barcode digits read off the pack as a first
try, an eval set from Open Food Facts images. Parked (decision entry): SigLIP/CLIP embeddings
over catalogue photos, a YOLO detector for tags, web search on a miss. They come back only if
the measured top-1 says the text path cannot get there.

## 2. The pipeline as it will run

```
crop.png (1568 px, from the eye)                              barcode? → catalogue by gtin → done
   │
   ▼  pass 1, EXTRACT (one vision call, structured)
   {front_text[], barcode_digits, brand, name, variant, size_value, size_unit,
    count (multipack), category, language_seen, self_confidence: high|medium|low, uncertainty}
   │
   ├─ barcode_digits valid GTIN checksum → catalogue by gtin → if hit, done (fact beats opinion)
   │
   ▼  catalogue cascade (existing hybrid search, more than one query)
   q1 brand+name+variant, brand pinned, size pinned
   q2 brand+name, brand pinned, no size            (size variants come back as siblings)
   q3 name + front_text words, nothing pinned      (store brand / brand misread)
   union, dedupe by code, keep signals, top 10
   │
   ├─ band confident AND lead clear → done, confidence from the six signals
   │
   ▼  pass 2, PICK (one vision call: same image + the 10 rows as JSON)
   {chosen_index | null, confidence: high|medium|low, why, size_question?: [indexes]}
   │
   ├─ chosen → identified (confidence fused: pick confidence caps the six-signal score)
   ├─ size_question → identified with sizeQuestion (decision 19: ask, do not guess)
   └─ null → not_in_catalogue with the ring, or identity_unsure with the candidates
```

Clocks: extract ≤ 3,500 ms, pick ≤ 3,000 ms, both overridable; `BUDGET_MS.photo` moves to
7,000 inside the 8,000 cap. The 1,800 ms clock was set from a 2 s p99 bar with no measurement
behind it; two vision calls cannot fit it. Re-measured once a key exists, and the decision
entry carries the reverses-if.

## 3. The lane contract (interfaces that do not move during the build)

- `IdentifyStage` constructor `(lookup: CatalogueLookup, model = new Identifier())` and
  `fromCrop(productPng: Uint8Array, tagPng: Uint8Array | null, tier: Tier, sharpness: number):
  Promise<IdentifyOutcome>` keep their signatures. `fromBarcode(gtin, tier)` unchanged.
- `CatalogueLookup`'s query gains optional `gtin?: string` and optional `limit` up to 10.
  `CatalogueResult` unchanged: `{ band, candidates, ring, matchedBy }`.
- `IdentifyOutcome` `'identified'` keeps `chosen`, `alternates`, `confidence`, `sizeQuestion`,
  `reading`, `tier`; gains optional `passes: 1 | 2` and `pick?: { why: string }`.
  `'not_in_catalogue'` and `'unreadable'` unchanged. A new `'unsure'` arm is NOT added; unsure
  is expressed as `'identified'` with `confidence.band === 'low'` and `alternates` non-empty,
  and the route maps that to the `identity_unsure` refusal with candidates.
- Route: `POST /api/identify/photo`, body JSON `{ image: <base64 png>, sharpness?: number,
  tier?: 'basic'|'pro', deviceId?: string }`, cap 3 MiB through the existing `readBody(req,
  limit)`; 413 over the cap via the existing `TOO_LARGE` path; 400 on a non-PNG/JPEG payload.
  Response: the same `Identified` shape `/api/identify` returns today plus `passes`, `failure`
  (a `FailureClass` or null) and `candidates` (up to 5, code/brand/name/size) when unsure.
  One scan row per call, `kind: 'photo'`, `failure_class` from the outcome.
- Client: `api.identifyPhoto(blob, { sharpness, deviceId })` in `app/public/js/api.js`;
  `camera.js` sends `lastCrop` on capture, paints the `looking at the photo` step, then the
  existing verdict flow on identity, `searchCandidateSheet` on unsure, the refusal sheet on
  unreadable. `startCaptureQueue` gets its caller (D-026).
- Eval: `identify/eval/manifest.json` (`[{ code, file, brand, name, size }]`),
  `identify/eval/photos/*.jpg`, `node identify/eval/run.ts` prints top-1, top-3, pass-2 rate,
  p50/p95 ms and cost, against the local catalogue and the real API. Runs only with a key.

## 4. Lanes

| Lane | Model | Files | Delivers |
|---|---|---|---|
| A identify | Opus | `identify/src/*`, `identify/test/*` | extract v2 schema and prompt, GTIN checksum → gtin lookup, cascade lookup, pick pass, confidence fusion, new clocks, fake-model tests |
| B route | Opus | `app/server.ts`, `app/src/scans.ts`, `app/test/photo-route.test.*` | the door, wired to `IdentifyStage` with the routed catalogue lookup, scan row, HTTP-edge test with a fake model |
| C screen | Sonnet | `app/public/js/**`, `app/test/photo-screen.test.mjs` | send the crop, the four screens, capture queue start |
| D eval | Sonnet | `identify/eval/**` | 40 Open Food Facts front images for codes in the local catalogue, manifest, runner |
| boss | Fable | `spine/src/run.ts` budget, status files, decisions, merge, consumer checks | |

## 5. What "done" means

- `npm test` + typecheck clean in identify, app, spine.
- A PNG posted to `/api/identify/photo` on the running server with a fake model returns an
  identity, and with the real key returns an identity for at least one real photo.
- `node identify/eval/run.ts` prints a top-1 number. That number, not this document, decides
  whether the parked items come back.

