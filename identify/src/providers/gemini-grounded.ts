/**
 * Gemini's Google Search grounding, and the code-execution verdict step that
 * sits on top of it. Added 2026-09-14, REWRITTEN the same day onto the
 * Interactions API after corrections arrived mid-build (each preserved
 * verbatim in this repo's session notes; this header states only where they
 * landed).
 *
 * WHY THIS IS A SEPARATE FILE FROM gemini.ts, still. `gemini.ts` implements
 * the vendor-neutral `Provider` interface for the plain vision
 * identification pass (extract/pick), and is used through `makeProvider`.
 * Everything in THIS file needs Google Search grounding, sometimes code
 * execution, and a JSON schema, all in the same request -- a combination
 * `Provider.send` was never shaped for (it has no notion of "tools", only a
 * schema and messages).
 *
 * ============================================================================
 * WHY THE INTERACTIONS API, NOT generateContent
 * ============================================================================
 *
 * The build's first version of this file used `generateContent` and split
 * grounding from structured output into two calls, because
 * github.com/googleapis/python-genai/issues/665 showed `generateContent`
 * refusing `google_search` combined with `responseSchema` on Gemini 2.5. The
 * coordinator then corrected that: Jamin wants the fields chosen IN THE
 * REQUEST, never rewritten after the answer comes back, and pointed at
 * ai.google.dev/gemini-api/docs/structured-output, which (checked live,
 * 2026-09-14) says:
 *
 *   "Preview: This feature is available only to Gemini 3 series models" --
 *   under a section titled "Structured outputs with tools" -- and
 *   ai.google.dev/gemini-api/docs/gemini-3 states the same thing in its own
 *   words: "Gemini 3 models allow you to combine Structured Outputs with
 *   built-in tools, including Grounding with Google Search, URL Context,
 *   Code Execution, and Function Calling."
 *
 * Both pages' own REST examples for that combination hit a DIFFERENT
 * endpoint than `generateContent`:
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   { "model": "...", "input": "...", "tools": [{"type":"google_search"}],
 *     "response_format": { "type": "text", "mime_type": "application/json",
 *                           "schema": { ... } } }
 *
 * confirmed again on ai.google.dev/gemini-api/docs/interactions/google-search
 * and ai.google.dev/gemini-api/docs/interactions/structured-output, and the
 * migration note at ai.google.dev/gemini-api/docs/migrate-to-interactions is
 * what names this new surface as its own API, not a `generateContent`
 * variant. So this file talks to `/v1beta/interactions`, and `gemini.ts`
 * (which has no need for tools) is left on `generateContent` unchanged.
 *
 * KNOWN LIVE BUG, worth naming because it changes nothing here either way:
 * the Gemini API forum (discuss.ai.google.dev, threads on "Grounding
 * metadata... empty when using structured output with google_search tool")
 * reports citations sometimes coming back empty even though a
 * `google_search_call` step shows a real search happened. This file already
 * treats "no citation for this fact" as `hasLink: false` rather than a
 * failure (the terms require showing that heads-up anyway), so that bug
 * degrades to more heads-ups, never a crash or a wrong answer.
 *
 * ============================================================================
 * REQUEST/RESPONSE SHAPE ASSUMED HERE -- never run for real, no key on this
 * machine, so this is what the doc pages above show, not what has been
 * proven to work:
 * ============================================================================
 *
 * 1. Auth: `x-goog-api-key` header, as every interactions doc example shows
 *    (the older `generateContent` docs mix that with a `?key=` query param;
 *    every current interactions example uses only the header).
 * 2. `input` is a single string. No doc page shows a separate `system` or
 *    `instructions` field for the Interactions API, so everything this file
 *    wants said -- task, schema intent restated in words, locale, tone,
 *    "Canadian retailers and CAD only", "keep it short" -- is composed into
 *    one `input` string. This is the most likely-wrong assumption in this
 *    file: if a real `instructions` field exists and this file never sends
 *    one, the model still gets the same words, just in the wrong bucket --
 *    a prompt-quality risk, not a shape-breaking one.
 * 3. `response_format: { type: 'text', mime_type: 'application/json', schema
 *    }` -- verbatim from both structured-output doc pages' REST examples.
 *    The schema is plain JSON Schema (lowercase `type: 'object'`); the
 *    `nullable`-translating `forGeminiSchema` from gemini.ts is NOT reused
 *    here on purpose, because these examples show ordinary JSON Schema
 *    casing, not the `generateContent` dialect.
 * 4. `tools` is an array of `{ type: 'google_search' }` and/or
 *    `{ type: 'code_execution' }`, per ai.google.dev/gemini-api/docs/gemini-3
 *    and ai.google.dev/gemini-api/docs/code-execution respectively; the
 *    latter states "Code execution tool can be combined with Grounding with
 *    Google Search" and "There's no additional charge for enabling code
 *    execution."
 * 5. Response is `{ steps: [ ... ] }`, an ordered list of typed steps:
 *    `thought`, `google_search_call` (`arguments.queries`),
 *    `google_search_result` (`result[].search_suggestions`, the rendered
 *    HTML widget -- named differently from `generateContent`'s
 *    `searchEntryPoint.renderedContent`, same purpose), `code_execution_call`
 *    (`arguments.code`), `code_execution_result` (`result`), and
 *    `model_output` (`content[]`, each a `{type:'text', text, annotations}`
 *    with `annotations` of `{type:'url_citation', url, title, start_index,
 *    end_index}`). The final answer is the LAST `model_output` step's text;
 *    this file never assumes there is only one.
 * 6. Model id: the doc pages disagree with each other on the page itself --
 *    one names `gemini-3.1-pro-preview`, the code-execution page names
 *    `gemini-3.8-flash` -- which reads as illustrative placeholder version
 *    numbers rather than a real, checkable model id, and this file has no
 *    key to resolve that with a live call. `SHIN_GEMINI_GROUNDED_MODEL` is
 *    therefore load-bearing here in a way it was not before: whoever adds
 *    the real key should also set this env var to whatever Gemini 3 preview
 *    id is actually live that day, rather than trust the default below.
 * 7. Paid tier only, unchanged from the first version of this file: Gemini's
 *    pricing page has never listed Search grounding on the free tier for any
 *    3.x model, and this is doubly true for a preview surface.
 *
 * ============================================================================
 * TERMS COMPLIANCE -- ai.google.dev/gemini-api/terms, "Grounding with Google
 * Search". Quoted once here; every function below states which clause it is
 * honouring rather than re-quoting.
 * ============================================================================
 *
 *   "will not ... cache, frame, syndicate, resell, analyze, train on, or
 *   otherwise learn from Grounded Results"
 *   "will not modify, or intersperse any other content with, the Grounded
 *   Results or Search Suggestions"
 *   "you will not track whether those interactions were specifically with a
 *   given Search Suggestion or Grounded Result ... including any specific
 *   Link"
 *
 * Binding rules for every caller of this file, restated as build rules:
 *
 *   (a) `spine`'s own arithmetic verdict is computed ONLY from this app's own
 *       price sources, exactly as before this file existed. It never reads a
 *       `GroundedPriceListing`.
 *   (b) The one place a NUMBER is computed from a grounded price at all is
 *       `groundedVerdict` below, and it is Gemini's own code-execution tool
 *       that does the arithmetic, in the same kind of request that produced
 *       the prices -- this app's server never runs `median()` or a percent
 *       diff, and never computes a screen position, over a grounded price
 *       itself. Jamin's follow-up correction (2026-09-14) extends this to
 *       the on-screen gauge too: `groundedVerdict` asks Gemini's own code
 *       execution for the 0-100 draw positions of every dot and of the two
 *       zone boundaries, so the client draws only numbers Gemini computed,
 *       never numbers this app derived from a grounded price.
 *   (c) Nothing here ever rewrites, trims, translates, or re-voices a
 *       grounded answer's text after it comes back -- any shaping (locale,
 *       tone, currency, brevity) is asked for IN THE REQUEST, and whatever
 *       comes back is shown exactly as returned.
 *   (d) `searchSuggestionsHtml` is carried through byte for byte and must be
 *       rendered unaltered by the client, and any link a grounded answer
 *       gives (including a tap on a gauge dot) opens directly -- no redirect
 *       route, no affiliate tag, no interstitial, no in-app frame, and no
 *       per-tap tracking on it or inside the block that shows it
 *       (screen-level events are fine).
 *   (e) Grounded content may be stored on the one scan record that asked for
 *       it (a user's own history, up to the retention this app already
 *       uses), never in a shared store. THIS FILE NEVER IMPORTS A DATABASE
 *       MODULE OF ANY KIND -- checked by this module's own test reading its
 *       import lines, not by running it, because that is the only way to
 *       prove a negative about what a module does not reach.
 *   (f) The verdict this function computes is displayed as its own labelled
 *       block ("based on N prices found", never "factually" -- Jamin's own
 *       words) beside, never inside, this app's own price section. The same
 *       three-zone gauge component renders this app's OWN arithmetic verdict
 *       too, in that section -- drawn from this app's own numbers directly
 *       (no Gemini call involved there at all), so the two sections look
 *       alike without being the same data.
 */

export interface GroundedTransport {
  (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
  }>;
}

export interface GroundedOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly transport?: GroundedTransport;
  readonly timeoutMs?: number;
  /** BCP-47-ish, only 'en' and 'fr' matter to this app today. Defaults to 'en'. */
  readonly locale?: 'en' | 'fr';
}

export interface GroundedSource {
  readonly url: string;
  readonly title: string | null;
}

export interface GroundingMeta {
  readonly sources: readonly GroundedSource[];
  readonly webSearchQueries: readonly string[];
  /** searchEntryPoint's renderedContent, generateContent's name for the same widget the Interactions API calls `search_suggestions`. Verbatim, never re-rendered. */
  readonly searchSuggestionsHtml: string | null;
}

export interface GroundedBarcodeAnswer extends GroundingMeta {
  readonly name: string | null;
  readonly brand: string | null;
  readonly sizeText: string | null;
  readonly category: string | null;
  readonly canadianRetailers: readonly string[];
  /** False when nothing in this answer carries a link: the client shows the "no link for this" heads-up, but the answer is still used, per the build's own instruction to accept all answers Gemini gives. */
  readonly hasLink: boolean;
}

/**
 * retailer/price/url/size only -- no product description, no advice, per
 * Jamin's 2026-09-14 correction. `price` is a plain CAD number (not a
 * formatted string) because it is fed straight into `groundedVerdict`'s
 * code-execution arithmetic as well as shown to the user (the client
 * formats it, e.g. `$${price.toFixed(2)}`, alongside `sizeValue`/`sizeUnit`
 * -- the display fields are still exactly what Gemini returned, just not
 * pre-stringified). `sizeValue`/`sizeUnit`/`packCount` are Jamin's
 * follow-up size correction, same day: "for each offer: ... size value,
 * size unit, pack count (e.g. 6 x 355 mL)" -- these feed `gauge.ts`'s unit
 * conversion, never this app's own arithmetic.
 */
export interface GroundedPriceListing {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly hasLink: boolean;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly packCount: number | null;
}

export interface GroundedReview {
  readonly source: string;
  readonly rating: number | null;
  readonly count: number | null;
  readonly summary: string;
  readonly url: string | null;
  readonly hasLink: boolean;
}

export interface GroundedPricesAndReviews extends GroundingMeta {
  readonly listings: readonly GroundedPriceListing[];
  readonly reviews: readonly GroundedReview[];
}

export type VerdictLabel = 'good' | 'reasonable' | 'bad';

/** One dot on the three-zone gauge. `position` is 0-100 along the line, computed by Gemini's own code execution -- never by this app. */
export interface GroundedVerdictPoint {
  readonly retailer: string;
  readonly price: string;
  readonly position: number;
  readonly url: string | null;
  readonly hasLink: boolean;
}

/**
 * The refined, code-executed verdict, plus every number the client needs to
 * draw the three-zone gauge, all computed by Gemini so this app never
 * derives a screen position from a grounded price either (Jamin's
 * 2026-09-14 follow-up). `label` deliberately does not reuse `spine`'s own
 * `Tier` vocabulary ('good' | 'fair' | 'walk_away') even though 'good'
 * collides -- this is not this app's verdict, it is Gemini's, shown in its
 * own block, and the mismatched middle/end labels ('reasonable' / 'bad' vs
 * 'fair' / 'walk_away') are left mismatched on purpose so nobody ever
 * mistakes one for the other in a log line or a screenshot.
 */
export interface GroundedVerdict {
  /** As Gemini's own code execution formatted it (e.g. "$4.79"), not reparsed by this app. */
  readonly median: string;
  /** Signed percent the shelf price sits from that median; positive means the shelf price is higher. */
  readonly percent: number;
  readonly label: VerdictLabel;
  /** How many prices the median was computed over. Shown as "based on N prices found". */
  readonly n: number;
  /**
   * Computed by THIS file, not asked of Gemini: a plain count of the
   * `GroundedPriceListing`s passed in that had no url. This is a presence
   * check over data already fully in this app's possession from the prior
   * call, not a re-analysis of grounded content, and it never leaves this
   * return value for anything but the client's own heads-up count.
   */
  readonly noLinkCount: number;
  /** 0-100 position of the large "this one" dot (the photographed item's shelf price). */
  readonly shelfPosition: number;
  /** 0-100 positions of the good/reasonable and reasonable/bad zone boundaries, around the median, from the user's own thresholds. */
  readonly zoneBoundaries: { readonly good: number; readonly bad: number };
  /** One entry per store price, position-matched back to that store's url/hasLink by retailer name -- no arithmetic performed by this app in that match. */
  readonly points: readonly GroundedVerdictPoint[];
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODEL = 'gemini-3-pro-preview';
const DEFAULT_TIMEOUT_MS = 8000;

export function isConfigured(opts?: GroundedOptions): boolean {
  return Boolean((opts?.apiKey ?? process.env.GEMINI_API_KEY)?.trim());
}

function apiKeyOf(opts?: GroundedOptions): string {
  return (opts?.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim();
}

function baseUrlOf(opts?: GroundedOptions): string {
  return opts?.baseUrl ?? process.env.SHIN_GEMINI_BASE_URL ?? DEFAULT_BASE_URL;
}

function modelName(opts?: GroundedOptions): string {
  return opts?.model ?? (process.env.SHIN_GEMINI_GROUNDED_MODEL?.trim() || DEFAULT_MODEL);
}

function localeOf(opts?: GroundedOptions): 'en' | 'fr' {
  return opts?.locale === 'fr' ? 'fr' : 'en';
}

export function isUsableLink(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Pulls JSON out of a model_output text. The Interactions API's own doc
 * examples show the JSON answer as the literal text of the last
 * `model_output` step when `response_format` is set, but this stays
 * tolerant of a fenced ```json block or leading prose in front of it, same
 * as the first version of this file, because "we accept all answers Gemini
 * gives" (the build's own words) includes an answer shaped slightly off
 * from the doc's own example.
 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

interface StepsResponse {
  readonly steps?: ReadonlyArray<Record<string, unknown>>;
}

interface CallResult {
  readonly json: unknown;
  readonly meta: GroundingMeta;
}

/**
 * The one place this file talks to the network. Sends `input` plus whichever
 * `tools` the caller needs (google_search, code_execution, both, or neither)
 * and, when `schema` is given, the `response_format` structured-output
 * block. Reads the LAST `model_output` step as the answer, and pulls
 * grounding extras (citations, search queries, the suggestions widget) out
 * of whichever steps carry them. Never throws on a shape it does not
 * recognise -- an unreadable response is a null answer for the caller, not a
 * crash.
 */
async function callInteractions(
  input: string,
  tools: ReadonlyArray<{ type: 'google_search' | 'code_execution' }>,
  schema: unknown,
  opts?: GroundedOptions,
): Promise<CallResult | null> {
  const apiKey = apiKeyOf(opts);
  if (!apiKey) return null;

  const body: Record<string, unknown> = { model: modelName(opts), input, tools };
  if (schema) {
    body.response_format = { type: 'text', mime_type: 'application/json', schema };
  }

  const transport: GroundedTransport = opts?.transport ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: { ok: boolean; status: number; text(): Promise<string> };
  try {
    res = await transport(baseUrlOf(opts), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    console.error('gemini-grounded: interactions call failed to send', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error(`gemini-grounded: interactions call returned HTTP ${res.status}`);
    return null;
  }

  let parsed: StepsResponse;
  try {
    parsed = JSON.parse(await res.text()) as StepsResponse;
  } catch (err) {
    console.error('gemini-grounded: response body was not JSON', err);
    return null;
  }

  const steps = parsed.steps ?? [];
  const sources: GroundedSource[] = [];
  let webSearchQueries: string[] = [];
  let searchSuggestionsHtml: string | null = null;
  let lastModelText: string | null = null;

  for (const step of steps) {
    const type = step.type;
    if (type === 'google_search_call') {
      const args = step.arguments as { queries?: unknown } | undefined;
      if (Array.isArray(args?.queries)) webSearchQueries = args!.queries.filter((q): q is string => typeof q === 'string');
    } else if (type === 'google_search_result') {
      const result = step.result as unknown;
      if (Array.isArray(result)) {
        for (const item of result) {
          const suggestions = (item as { search_suggestions?: unknown })?.search_suggestions;
          if (typeof suggestions === 'string' && searchSuggestionsHtml === null) searchSuggestionsHtml = suggestions;
        }
      }
    } else if (type === 'model_output') {
      const content = step.content as unknown;
      if (Array.isArray(content)) {
        for (const item of content) {
          const text = (item as { type?: string; text?: unknown })?.text;
          if (typeof text === 'string') lastModelText = text;
          const annotations = (item as { annotations?: unknown })?.annotations;
          if (Array.isArray(annotations)) {
            for (const ann of annotations) {
              const a = ann as { type?: string; url?: unknown; title?: unknown };
              if (a?.type === 'url_citation' && typeof a.url === 'string') {
                sources.push({ url: a.url, title: typeof a.title === 'string' ? a.title : null });
              }
            }
          }
        }
      }
    }
    // 'thought', 'code_execution_call', 'code_execution_result' carry no
    // answer content this file surfaces -- see the header's note (f) on
    // deleting the interim: the code and its raw execution output are read
    // for nothing, only the final model_output text is kept.
  }

  if (lastModelText === null) return null;
  const json = extractJson(lastModelText);
  return { json, meta: { sources, webSearchQueries, searchSuggestionsHtml } };
}

function toneFor(locale: 'en' | 'fr'): string {
  // Reuses the flat, number-first register app/public/js/voice.js documents
  // as Shin's DEFAULT personality ("deadpan": "States the number and stops",
  // sample "Two dollars. It's $1.47.") rather than any of the three
  // user-chosen personalities. A grounded answer is fixed at fetch time
  // while a user's personality can change afterward on the same stored
  // scan, so voicing it as one particular personality would make a stored
  // answer look wrong the moment the user picks a different one; the flat
  // register is also the safer one for facts a search found, not this app,
  // so nothing added here reads as this app's own editorial voice.
  return locale === 'fr'
    ? "Ton : plat, factuel, direct. Donne le chiffre et arrête-toi."
    : 'Tone: flat, factual, direct. State the number and stop.';
}

const BARCODE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    sizeText: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    canadianRetailers: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'brand', 'sizeText', 'category', 'canadianRetailers'],
};

/**
 * A barcode our own catalogue has never seen. Build step 3: ask Gemini,
 * grounded in Google Search, what it is. Rule (c) above: locale and tone are
 * asked for here, in the request, never applied after the fact.
 */
export async function groundedBarcodeLookup(gtin: string, opts?: GroundedOptions): Promise<GroundedBarcodeAnswer | null> {
  if (!isConfigured(opts)) return null;
  const locale = localeOf(opts);
  const input =
    (locale === 'fr'
      ? `Utilise la recherche Google pour identifier le produit portant le code-barres ${gtin}, en priorisant les détaillants canadiens et les prix en CAD. `
      : `Use Google Search to identify the product with barcode (GTIN/UPC) ${gtin}, favouring Canadian retailers and CAD pricing. `) +
    toneFor(locale) +
    ' ' +
    (locale === 'fr'
      ? 'Réponds avec les champs exacts demandés seulement, sans description ni conseil.'
      : 'Answer with exactly the requested fields, no description, no advice.');
  try {
    const result = await callInteractions(input, [{ type: 'google_search' }], BARCODE_SCHEMA, opts);
    if (!result) return null;
    const j = (result.json ?? {}) as Record<string, unknown>;
    const retailers = Array.isArray(j.canadianRetailers) ? j.canadianRetailers.filter((r): r is string => typeof r === 'string') : [];
    return {
      name: typeof j.name === 'string' ? j.name : null,
      brand: typeof j.brand === 'string' ? j.brand : null,
      sizeText: typeof j.sizeText === 'string' ? j.sizeText : null,
      category: typeof j.category === 'string' ? j.category : null,
      canadianRetailers: retailers,
      hasLink: result.meta.sources.some((s) => isUsableLink(s.url)),
      sources: result.meta.sources.filter((s) => isUsableLink(s.url)),
      webSearchQueries: result.meta.webSearchQueries,
      searchSuggestionsHtml: result.meta.searchSuggestionsHtml,
    };
  } catch (err) {
    console.error('groundedBarcodeLookup failed', err);
    return null;
  }
}

const PRICES_REVIEWS_SCHEMA = {
  type: 'object',
  properties: {
    listings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          retailer: { type: 'string' },
          price: { type: 'string' },
          url: { type: ['string', 'null'] },
        },
        required: ['retailer', 'price', 'url'],
      },
    },
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          rating: { type: ['number', 'null'] },
          count: { type: ['number', 'null'] },
          summary: { type: 'string' },
          url: { type: ['string', 'null'] },
        },
        required: ['source', 'rating', 'count', 'summary', 'url'],
      },
    },
  },
  required: ['listings', 'reviews'],
};

/**
 * Canadian store prices and reviews for a product, grounded in Google
 * Search. Jamin's 2026-09-14 correction, verbatim in scope: "Gemini's
 * grounded answer contains ONLY Canadian store prices (retailer, price CAD,
 * url) and the product's reviews (rating, count, short summary, url). No
 * product description, no advice." That sentence is copied into the prompt
 * below almost word for word rather than paraphrased loosely, because this
 * is a request-side constraint (rule (c)) and the model can only honour a
 * limit it was actually given.
 *
 * NEVER FEEDS THIS APP'S OWN VERDICT. `spine`'s arithmetic reads only this
 * app's own price sources, unchanged by this file's existence. The one
 * place a number is derived from what this function returns is
 * `groundedVerdict` below, and that derivation happens inside Gemini's own
 * code execution, not in this app's code -- see that function's comment.
 */
export async function groundedPricesAndReviews(
  product: { name: string; brand?: string | null; sizeText?: string | null },
  opts?: GroundedOptions,
): Promise<GroundedPricesAndReviews | null> {
  if (!isConfigured(opts)) return null;
  const locale = localeOf(opts);
  const desc = [product.brand, product.name, product.sizeText].filter(Boolean).join(' ');
  const input =
    (locale === 'fr'
      ? `Utilise la recherche Google pour trouver les prix actuels en dollars canadiens (CAD) chez des détaillants canadiens pour : ${desc}. Trouve aussi les avis clients.`
      : `Use Google Search to find current Canadian-dollar (CAD) prices at Canadian retailers for: ${desc}. Also find customer reviews.`) +
    ' ' +
    (locale === 'fr'
      ? 'Réponds UNIQUEMENT avec les prix des détaillants et les avis -- aucune description du produit, aucun conseil.'
      : 'Answer with ONLY retailer prices and reviews -- no product description, no advice.') +
    ' ' +
    toneFor(locale);
  try {
    const result = await callInteractions(input, [{ type: 'google_search' }], PRICES_REVIEWS_SCHEMA, opts);
    if (!result) return null;
    const j = (result.json ?? {}) as Record<string, unknown>;
    const rawListings = Array.isArray(j.listings) ? j.listings : [];
    const rawReviews = Array.isArray(j.reviews) ? j.reviews : [];
    const listings: GroundedPriceListing[] = rawListings.map((raw) => {
      const item = raw as Record<string, unknown>;
      const url = typeof item.url === 'string' ? item.url : null;
      return {
        retailer: typeof item.retailer === 'string' ? item.retailer : '',
        price: typeof item.price === 'string' ? item.price : '',
        url,
        hasLink: isUsableLink(url),
      };
    });
    const reviews: GroundedReview[] = rawReviews.map((raw) => {
      const item = raw as Record<string, unknown>;
      const url = typeof item.url === 'string' ? item.url : null;
      return {
        source: typeof item.source === 'string' ? item.source : '',
        rating: typeof item.rating === 'number' ? item.rating : null,
        count: typeof item.count === 'number' ? item.count : null,
        summary: typeof item.summary === 'string' ? item.summary : '',
        url,
        hasLink: isUsableLink(url),
      };
    });
    return { listings, reviews, ...result.meta };
  } catch (err) {
    console.error('groundedPricesAndReviews failed', err);
    return null;
  }
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    median: { type: 'string' },
    percent: { type: 'number' },
    label: { type: 'string', enum: ['good', 'reasonable', 'bad'] },
    n: { type: 'number' },
    shelfPosition: { type: 'number' },
    zoneGoodBoundary: { type: 'number' },
    zoneBadBoundary: { type: 'number' },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          retailer: { type: 'string' },
          position: { type: 'number' },
        },
        required: ['retailer', 'position'],
      },
    },
  },
  required: ['median', 'percent', 'label', 'n', 'shelfPosition', 'zoneGoodBoundary', 'zoneBadBoundary', 'points'],
};

/**
 * The refined verdict, build request from Jamin 2026-09-14, extended the
 * same day to also return the gauge's draw positions. Read the header
 * comment's rule (b) first: this is the terms' own escape hatch, not a
 * workaround of it -- "will not ... analyze ... Grounded Results" is a limit
 * on what THIS APP does with them; asking Gemini's own code_execution tool,
 * in the same kind of request that produced them, to run the arithmetic AND
 * the 0-100 scaling and hand back a small labelled result is Gemini
 * analyzing its own answer, not this app doing so.
 * ai.google.dev/gemini-api/docs/code-execution: "Code execution tool can be
 * combined with Grounding with Google Search... There's no additional
 * charge for enabling code execution", and the same page's own model
 * example is a Gemini 3 Flash id, matching
 * ai.google.dev/gemini-api/docs/gemini-3's "Gemini 3 models allow you to
 * combine Structured Outputs with built-in tools... Code Execution".
 *
 * `listings` passed in should be exactly what `groundedPricesAndReviews`
 * just returned for the same product -- this function does not search
 * again, it resubmits that text (rule (c): reshaping happens in the
 * request) along with the shelf price and the user's own thresholds, and
 * asks Python to compute the median, the percent difference, and every
 * 0-100 draw position the gauge needs, rather than trust a human-typed
 * number or let this app scale anything itself. This app's only post-call
 * work is pairing a returned `{retailer, position}` back to that listing's
 * already-known `url`/`hasLink` by matching retailer name -- a label match,
 * not arithmetic over a price. `noLinkCount` is likewise ours: a plain count
 * of listings with no url, not asked of Gemini and not itself a grounded
 * value.
 *
 * Returns null when Gemini is not configured, the call fails, or there are
 * no listings to reason about (no shelf price is the CALLER's job to check
 * before calling this at all: "no shelf price, no verdict").
 */
export async function groundedVerdict(
  listings: readonly GroundedPriceListing[],
  shelfPriceCad: number,
  thresholds: { goodPct?: number; badPct?: number } = {},
  opts?: GroundedOptions,
): Promise<GroundedVerdict | null> {
  if (!isConfigured(opts)) return null;
  if (listings.length === 0) return null;
  const goodPct = thresholds.goodPct ?? 10;
  const badPct = thresholds.badPct ?? 10;
  const locale = localeOf(opts);
  const listingsText = listings.map((l) => `${l.retailer}: ${l.price}`).join('; ');
  const input =
    (locale === 'fr'
      ? `Voici des prix trouvés par recherche Google : ${listingsText}. Le prix en magasin est ${shelfPriceCad.toFixed(2)} $ CAD. `
      : `Here are prices found by Google Search: ${listingsText}. The shelf price is CAD $${shelfPriceCad.toFixed(2)}. `) +
    (locale === 'fr'
      ? `Écris et exécute du code Python pour : (1) calculer la médiane des prix trouvés ; (2) le pourcentage d'écart du prix en magasin par rapport à cette médiane (positif si plus élevé) ; (3) une étiquette "good" si le prix en magasin est d'au moins ${goodPct}% sous la médiane, "bad" si plus de ${badPct}% au-dessus, sinon "reasonable" ; (4) une position 0-100 pour CHAQUE prix trouvé et pour le prix en magasin, sur une échelle allant du prix le plus bas (0) au plus élevé (100) parmi tous ces prix ; (5) les positions 0-100, sur cette même échelle, des deux limites de zone : la limite basse au prix égal à la médiane réduite de ${goodPct}%, la limite haute au prix égal à la médiane augmentée de ${badPct}%. Retourne la médiane formatée en dollars, le pourcentage, l'étiquette, le nombre de prix utilisés, la position du prix en magasin, les deux limites de zone, et un tableau de {retailer, position} pour chaque magasin.`
      : `Write and run Python code to: (1) compute the median of the found prices; (2) the percent difference of the shelf price from that median (positive if higher); (3) a label of "good" if the shelf price is at least ${goodPct}% below the median, "bad" if more than ${badPct}% above it, otherwise "reasonable"; (4) a 0-100 position for EACH found price and for the shelf price, on a scale from the lowest of all those prices (0) to the highest (100); (5) the 0-100 positions, on that same scale, of the two zone boundaries: the low boundary at the price equal to the median reduced by ${goodPct}%, the high boundary at the price equal to the median increased by ${badPct}%. Return the formatted dollar median, the percent, the label, the count of prices used, the shelf price's position, both zone boundary positions, and an array of {retailer, position} for each store.`);
  try {
    const result = await callInteractions(input, [{ type: 'code_execution' }], VERDICT_SCHEMA, opts);
    if (!result) return null;
    const j = (result.json ?? {}) as Record<string, unknown>;
    const label = j.label === 'good' || j.label === 'reasonable' || j.label === 'bad' ? j.label : null;
    if (
      label === null ||
      typeof j.median !== 'string' ||
      typeof j.percent !== 'number' ||
      typeof j.n !== 'number' ||
      typeof j.shelfPosition !== 'number' ||
      typeof j.zoneGoodBoundary !== 'number' ||
      typeof j.zoneBadBoundary !== 'number' ||
      !Array.isArray(j.points)
    ) {
      return null;
    }
    const byRetailer = new Map(listings.map((l) => [l.retailer, l]));
    const points: GroundedVerdictPoint[] = j.points
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        const retailer = typeof item.retailer === 'string' ? item.retailer : '';
        const position = typeof item.position === 'number' ? item.position : null;
        const matched = byRetailer.get(retailer);
        if (position === null || !matched) return null;
        return { retailer, price: matched.price, position, url: matched.url, hasLink: matched.hasLink };
      })
      .filter((p): p is GroundedVerdictPoint => p !== null);
    return {
      median: j.median,
      percent: j.percent,
      label,
      n: j.n,
      noLinkCount: listings.filter((l) => !l.hasLink).length,
      shelfPosition: j.shelfPosition,
      zoneBoundaries: { good: j.zoneGoodBoundary, bad: j.zoneBadBoundary },
      points,
    };
  } catch (err) {
    console.error('groundedVerdict failed', err);
    return null;
  }
}
