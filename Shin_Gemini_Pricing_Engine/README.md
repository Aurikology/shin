# Shin Gemini Pricing Engine

## Files
- GEMINI_SYSTEM.md — permanent Gemini behavior and identification rules.
- PRICING_GUIDE.md — pricing methodology.
- scan_prompt.md — dynamic per-scan prompt template.
- response_schema.json — structured output schema.

## Recommended request
1. Load GEMINI_SYSTEM.md as the Gemini system instruction.
2. Include PRICING_GUIDE.md as reusable domain context.
3. Fill scan_prompt.md with the current scan's dynamic values.
4. Send barcode and/or cropped image as multimodal content.
5. Enable Google Search grounding when live research is required.
6. On Gemini 3.x request application/json using response_schema.json. On Gemini 2.5 a schema cannot be combined with Google Search: ask for the JSON in the prompt text (the server does this) and parse it, repairing or marking a malformed answer.
7. Validate the returned object server-side.
8. Apply only processing permitted by the applicable Gemini API and
   grounding terms.

Important: do not assume grounded/search-derived output can automatically
be persisted, analyzed, ranked, blended, or reused for arbitrary purposes.
Check the current Google/Gemini terms for the exact API and grounding
configuration Shin uses.

Validate the schema against the exact Gemini model and SDK/API version
before production deployment because Structured Outputs support can vary
by model/version.

## Price math
The median, each price's placement and the verdict against the user's thresholds come back inside the one answer (`price_verdict` and the per-offer `unit_price`, `in_median`, `pct_vs_median`, `position`). Shin never computes or shows its own; it only re-checks in the background and marks a scan whose numbers disagree.
