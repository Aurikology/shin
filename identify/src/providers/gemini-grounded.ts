/**
 * The only file in this repo that calls `seal()`.
 *
 * Gemini's Google Search grounding, plus the code-execution step that refines
 * grounded prices into a verdict. Everything it returns is a sealed
 * `Grounded<T>` from `../grounded.ts`, which is where the licence, the quoted
 * terms and the reasoning behind the box all live. Read that header first.
 *
 * WHY THIS IS A SEPARATE FILE FROM `gemini.ts`. `gemini.ts` implements the
 * vendor-neutral `Provider` for the plain vision identification passes
 * (extract and pick) and has no notion of tools at all. Everything here needs
 * Google Search grounding, sometimes code execution, and a JSON schema, in the
 * same request. `Provider.send` was never shaped for that, and more
 * importantly its answer is a plain `T` that the identification pipeline is
 * free to store: a grounded answer is not, and `GroundedProvider` exists so
 * the compiler keeps the two apart.
 *
 * ============================================================================
 * SHAPING THE ASK IS ALLOWED. EDITING THE ANSWER IS NOT.
 * ============================================================================
 *
 * Every constraint this app wants on a grounded answer is asked for IN THE
 * REQUEST: Shin's flat register, the reader's language, Canadian retailers and
 * CAD only, short lengths, a fixed JSON layout, `null` where there is no
 * source. Nothing that comes back is rewritten, trimmed, translated,
 * re-voiced, reordered or merged with any other content afterwards, because
 * that is the "will not modify, or intersperse any other content with, the
 * Grounded Results" clause. The line is exactly there: before the call, ask
 * for anything; after the call, change nothing.
 *
 * The one thing this file computes over an answer is a PRESENCE check: which
 * citation ranges cover which part of the text, so a specific price or a
 * specific review can be flagged as having no link. That is reading whether a
 * link exists, not analysing what the Grounded Result says, and the terms
 * require that heads-up to be showable at all.
 *
 * ============================================================================
 * THE WIRE, AS THE DOC PAGES SHOW IT (never run for real; no key on this
 * machine, so this is documentation, not measurement)
 * ============================================================================
 *
 * `POST /v1beta/interactions`, auth in the `x-goog-api-key` HEADER, body
 * `{ model, input, tools, response_format }` where `tools` is an array of
 * `{ type: 'google_search' }` and/or `{ type: 'code_execution' }` and
 * `response_format` is `{ type: 'text', mime_type: 'application/json', schema }`
 * with plain JSON Schema casing.
 *
 * The answer is `{ steps: [...] }`, ordered and typed: `google_search_call`
 * (`arguments.queries`), `google_search_result` (`result[].search_suggestions`,
 * the rendered Search Suggestions widget), `code_execution_call`
 * (`arguments.code`, also seen as `executableCode.code`), `code_execution_result`,
 * and `model_output` (`content[]`, each `{type:'text', text, annotations}` with
 * annotations of `{type:'url_citation', url, title, start_index, end_index}`).
 * The final answer is the LAST `model_output`.
 *
 * BASE URL FROM ITS OWN ENV VAR. `SHIN_GEMINI_GROUNDED_BASE_URL`, never
 * `SHIN_GEMINI_BASE_URL`. The ungrounded adapter points that one at
 * `generateContent`, a different base path entirely. An earlier version of
 * this file shared the variable, which meant that pointing either adapter at a
 * recorded fixture or a proxy silently broke the other one, and the breakage
 * would have looked like a model failure rather than a configuration mistake.
 */

import {
  NO_USAGE,
  ProviderError,
  type ProviderRequest,
  type ProviderResponse,
  type GroundedProvider,
} from '../provider.ts';
import { seal, type Grounded } from '../grounded.ts';

/* -------------------------------------------------------------------- wire */

export interface GroundedTransport {
  (
    url: string,
    init: {
      method: 'POST';
      headers: Record<string, string>;
      body: string;
      signal?: AbortSignal;
    },
  ): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

export interface GroundedGeminiOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  /** Injected in tests. Recorded fakes only: nothing here ever opens a socket in a test. */
  readonly transport?: GroundedTransport;
}

/**
 * A grounded request. `ProviderRequest` plus the two things the Interactions
 * API needs that the vendor-neutral request has no word for.
 *
 * `codeExecution` is here rather than on `ProviderRequest` because code
 * execution is not grounding: it is a second tool that only the verdict
 * resubmission turns on, and putting it in the shared seam would offer it to
 * every ungrounded caller that has no use for it.
 */
export interface GroundedRequest extends ProviderRequest {
  readonly grounding: 'google_search';
  readonly codeExecution?: boolean;
}

/** One `url_citation` annotation, as returned. */
export interface Citation {
  readonly url: string;
  readonly title: string | null;
  readonly startIndex: number | null;
  readonly endIndex: number | null;
}

/**
 * What gets sealed: the answer Gemini returned, and the citations that came
 * with it, side by side and neither one altered.
 *
 * The citations are NOT interspersed into the answer text, which is the point
 * of them being a sibling field: the client renders `answer` as returned, and
 * uses `citations` only to decide whether to show the "no link for this one"
 * heads-up beside a specific price or review.
 */
export interface GroundedAnswer<A> {
  readonly answer: A;
  readonly citations: readonly Citation[];
  readonly searchQueries: readonly string[];
}

/* ------------------------------------------------------------- the answers */

export interface BarcodeFacts {
  readonly name: string | null;
  readonly brand: string | null;
  readonly size: string | null;
  /** Per fact, not one flat list: a flat list cannot say WHICH fact had no source. */
  readonly sources: {
    readonly name: string | null;
    readonly brand: string | null;
    readonly size: string | null;
  };
}

/**
 * One store's offer.
 *
 * `price` is a number in CAD rather than a formatted string because the
 * verdict step resubmits it as a number, and a string would have to be parsed
 * by this app, which is arithmetic over a Grounded Result. The size fields are
 * here because unit scaling has nothing to run on without them: an earlier
 * version of this file asked for retailer, price and url only, which made
 * every comparison of a 6 x 355 mL against a 2 L a comparison of two unrelated
 * numbers.
 */
export interface PriceOffer {
  readonly retailer: string;
  readonly price: number;
  readonly url: string | null;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly packCount: number | null;
  readonly modelNumber: string | null;
  readonly specs: string | null;
  readonly condition: string | null;
}

export interface ProductReview {
  readonly rating: number | null;
  readonly count: number | null;
  readonly summary: string;
  readonly url: string | null;
}

export interface PricesReviewsDescription {
  readonly offers: readonly PriceOffer[];
  readonly reviews: readonly ProductReview[];
  readonly description: string | null;
}

/**
 * The refined verdict, every number of it computed by Gemini's own code
 * execution running the FIXED function in `gauge.ts`.
 *
 * This app never runs a median or a percent difference over a grounded price.
 * That is the refinement carve-out being used as written: Gemini analyses its
 * own Grounded Result in a subsequent prompt to produce a refined Grounded
 * Result for the same end user.
 */
export interface VerdictFigures {
  readonly median: number;
  readonly percent: number;
  readonly label: 'good' | 'fair' | 'high';
  readonly n: number;
  readonly shelfPosition: number;
  readonly zoneBoundaries: { readonly good: number; readonly high: number };
  readonly points: readonly { readonly retailer: string; readonly position: number }[];
}

/* --------------------------------------------------------------- the asks */

export type Reader = 'en' | 'fr';

/**
 * Shin's register, asked for rather than applied afterwards.
 *
 * The flat, number-first default from `app/public/js/voice.js`, not one of the
 * three user-chosen personalities: a grounded answer is fixed at fetch time
 * while a personality can change on the same stored scan afterwards, so voicing
 * it as one personality would make a stored answer read wrong the moment the
 * user picks another.
 */
function voice(reader: Reader): string {
  return reader === 'fr'
    ? 'Ton : plat, factuel, direct. Donne le chiffre et arrete-toi. Reponds en francais.'
    : 'Tone: flat, factual, direct. State the number and stop. Answer in English.';
}

function market(reader: Reader): string {
  return reader === 'fr'
    ? 'Detaillants canadiens seulement, prix en dollars canadiens (CAD) seulement.'
    : 'Canadian retailers only, prices in Canadian dollars (CAD) only.';
}

function brevity(reader: Reader): string {
  return reader === 'fr'
    ? 'Sois bref : au plus 8 offres, au plus 3 avis, resume d\'au plus 25 mots, description d\'au plus 30 mots. Mets null la ou il n\'y a pas de source.'
    : 'Keep it short: at most 8 offers, at most 3 reviews, each summary at most 25 words, the description at most 30 words. Put null wherever there is no source.';
}

const BARCODE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    size: { type: ['string', 'null'] },
    sources: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        brand: { type: ['string', 'null'] },
        size: { type: ['string', 'null'] },
      },
      required: ['name', 'brand', 'size'],
    },
  },
  required: ['name', 'brand', 'size', 'sources'],
};

const PRICES_SCHEMA = {
  type: 'object',
  properties: {
    offers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          retailer: { type: 'string' },
          price: { type: 'number' },
          url: { type: ['string', 'null'] },
          sizeValue: { type: ['number', 'null'] },
          sizeUnit: { type: ['string', 'null'] },
          packCount: { type: ['number', 'null'] },
          modelNumber: { type: ['string', 'null'] },
          specs: { type: ['string', 'null'] },
          condition: { type: ['string', 'null'] },
        },
        required: [
          'retailer',
          'price',
          'url',
          'sizeValue',
          'sizeUnit',
          'packCount',
          'modelNumber',
          'specs',
          'condition',
        ],
      },
    },
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rating: { type: ['number', 'null'] },
          count: { type: ['number', 'null'] },
          summary: { type: 'string' },
          url: { type: ['string', 'null'] },
        },
        required: ['rating', 'count', 'summary', 'url'],
      },
    },
    description: { type: ['string', 'null'] },
  },
  required: ['offers', 'reviews', 'description'],
};

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    median: { type: 'number' },
    percent: { type: 'number' },
    label: { type: 'string', enum: ['good', 'fair', 'high'] },
    n: { type: 'number' },
    shelfPosition: { type: 'number' },
    zoneBoundaries: {
      type: 'object',
      properties: { good: { type: 'number' }, high: { type: 'number' } },
      required: ['good', 'high'],
    },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: { retailer: { type: 'string' }, position: { type: 'number' } },
        required: ['retailer', 'position'],
      },
    },
  },
  required: ['median', 'percent', 'label', 'n', 'shelfPosition', 'zoneBoundaries', 'points'],
};

/** A catalogue miss: we have the code and nothing else. */
export function barcodeLookupRequest(
  gtin: string,
  model: string,
  signal: AbortSignal,
  reader: Reader = 'en',
): GroundedRequest {
  const ask =
    reader === 'fr'
      ? `Utilise la recherche Google pour identifier le produit portant le code-barres ${gtin}. Donne son nom, sa marque et son format, et pour CHACUN de ces trois faits le lien de la source qui l'etablit (null s'il n'y en a pas).`
      : `Use Google Search to identify the product with barcode ${gtin}. Give its name, its brand and its size, and for EACH of those three facts the source link that establishes it (null if there is none).`;
  return {
    model,
    images: [],
    system: [voice(reader), market(reader)].join(' '),
    user: [ask, brevity(reader)].join(' '),
    schema: { name: 'barcode_facts', schema: BARCODE_SCHEMA },
    maxOutputTokens: 800,
    signal,
    grounding: 'google_search',
  };
}

/** Prices, reviews and a short description for a product we can already name. */
export function pricesReviewsRequest(
  product: { name: string; brand?: string | null; size?: string | null },
  model: string,
  signal: AbortSignal,
  reader: Reader = 'en',
): GroundedRequest {
  const described = [product.brand, product.name, product.size].filter(Boolean).join(' ');
  const ask =
    reader === 'fr'
      ? `Utilise la recherche Google pour trouver, pour : ${described} -- (1) les prix actuels chez des detaillants canadiens, avec pour chaque offre le detaillant, le prix (nombre, CAD), l'URL, la valeur du format, l'unite du format, le nombre d'unites par paquet, le numero de modele, les specifications et l'etat (neuf, reconditionne, occasion) ; (2) les avis clients avec la note, le nombre d'avis, un resume court et l'URL ; (3) une courte description du produit.`
      : `Use Google Search to find, for: ${described} -- (1) current prices at Canadian retailers, giving for each offer the retailer, the price (a number, CAD), the url, the size value, the size unit, the pack count, the model number, the specs and the condition (new, refurbished, used); (2) customer reviews with rating, count, a short summary and the url; (3) a short product description.`;
  return {
    model,
    images: [],
    system: [voice(reader), market(reader)].join(' '),
    user: [ask, brevity(reader)].join(' '),
    schema: { name: 'prices_reviews_description', schema: PRICES_SCHEMA },
    maxOutputTokens: 2000,
    signal,
    grounding: 'google_search',
  };
}

/**
 * THE GAUGE, WHICH THIS FILE DOES NOT WRITE.
 *
 * `../gauge.ts` exports `GAUGE_PYTHON_SOURCE` and `codeMatchesGauge`, and it
 * belongs to another lane. Asking Gemini to write its own Python on every call
 * was the defect in the earlier version of this file: there was nothing fixed
 * to check the executed code against, so "the model did the arithmetic" and
 * "the model did some arithmetic" were the same observation.
 *
 * WHY THE SPECIFIER IS IN A CONSTANT rather than written inline. A literal
 * `import('../gauge.ts')` is resolved by the compiler, so this package would
 * not typecheck at all until that file lands, and this lane would then be
 * blocked on another lane's file or tempted to invent its own Python, which is
 * the exact defect above. Held in a variable, the specifier is loaded at
 * runtime and the name is still written here once, literally, so the day
 * `gauge.ts` appears this works with no edit. Until then `loadGauge` returns
 * null and the verdict request REFUSES to be built. It never falls back to
 * asking Gemini to improvise.
 */
const GAUGE_MODULE = '../gauge.ts';

interface GaugeModule {
  readonly GAUGE_PYTHON_SOURCE: string;
  codeMatchesGauge(code: string): boolean;
}

let gaugeCache: GaugeModule | null | undefined;

export async function loadGauge(): Promise<GaugeModule | null> {
  if (gaugeCache !== undefined) return gaugeCache;
  try {
    const loaded = (await import(GAUGE_MODULE)) as Partial<GaugeModule>;
    gaugeCache =
      typeof loaded.GAUGE_PYTHON_SOURCE === 'string' && typeof loaded.codeMatchesGauge === 'function'
        ? (loaded as GaugeModule)
        : null;
  } catch {
    gaugeCache = null;
  }
  return gaugeCache;
}

/**
 * The verdict resubmission: the refinement carve-out, used as written.
 *
 * It resubmits the grounded prices (via `resubmitText` on the caller's side,
 * which is the only legal way that text leaves its box), the shelf price the
 * user typed and the user's own two percentages, with `code_execution` on, and
 * asks Gemini to run the FIXED function from `gauge.ts` rather than any code it
 * writes itself. `sendGrounded` then checks what it actually ran.
 */
export async function verdictResubmissionRequest(
  groundedPricesText: string,
  shelfPriceCad: number,
  thresholds: { goodPct: number; highPct: number },
  model: string,
  signal: AbortSignal,
  reader: Reader = 'en',
): Promise<GroundedRequest> {
  const gauge = await loadGauge();
  if (!gauge) {
    throw new ProviderError(
      'model_client_error',
      'The fixed gauge function (identify/src/gauge.ts) is not present, so there is no verified ' +
        'code for Gemini to run. No verdict is asked for: prices and reviews are shown alone.',
    );
  }
  const ask =
    reader === 'fr'
      ? `Voici des prix trouves par recherche Google : ${groundedPricesText}. Le prix en magasin est ${shelfPriceCad} CAD. Les seuils de l'utilisateur sont ${thresholds.goodPct} % et ${thresholds.highPct} %. Execute EXACTEMENT la fonction Python ci-dessous, sans la modifier, et appelle-la avec ces valeurs. Retourne son resultat.`
      : `Here are prices found by Google Search: ${groundedPricesText}. The shelf price is ${shelfPriceCad} CAD. The user's thresholds are ${thresholds.goodPct}% and ${thresholds.highPct}%. Run EXACTLY the Python function below, unmodified, and call it with those values. Return its result.`;
  return {
    model,
    images: [],
    system: [voice(reader), market(reader)].join(' '),
    user: [ask, gauge.GAUGE_PYTHON_SOURCE].join('\n\n'),
    schema: { name: 'verdict_figures', schema: VERDICT_SCHEMA },
    maxOutputTokens: 1200,
    signal,
    grounding: 'google_search',
    codeExecution: true,
  };
}

/* ------------------------------------------------------------- the adapter */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

interface Walked {
  readonly text: string | null;
  readonly citations: Citation[];
  readonly searchQueries: string[];
  readonly suggestionsHtml: string | null;
  readonly executedCode: string | null;
}

/**
 * Reads the ordered steps once.
 *
 * Search Suggestions are carried byte for byte: the first non-empty
 * `search_suggestions` string is taken exactly as it arrived and is never
 * trimmed, re-encoded or re-rendered, because it must be displayed unaltered
 * alongside the answer.
 */
export function walkSteps(steps: readonly Record<string, unknown>[]): Walked {
  const citations: Citation[] = [];
  const searchQueries: string[] = [];
  let suggestionsHtml: string | null = null;
  let executedCode: string | null = null;
  let text: string | null = null;

  for (const step of steps) {
    const type = step.type;
    if (type === 'google_search_call') {
      const queries = (step.arguments as { queries?: unknown } | undefined)?.queries;
      if (Array.isArray(queries)) {
        for (const q of queries) if (typeof q === 'string') searchQueries.push(q);
      }
    } else if (type === 'google_search_result') {
      const result = step.result;
      if (Array.isArray(result)) {
        for (const item of result) {
          const s = (item as { search_suggestions?: unknown }).search_suggestions;
          if (suggestionsHtml === null && typeof s === 'string' && s !== '') suggestionsHtml = s;
        }
      }
    } else if (type === 'code_execution_call') {
      // Both shapes are read because the doc pages disagree with each other:
      // the interactions pages show `arguments.code`, the code-execution page
      // shows `executableCode.code`. Reading one and not the other would mean
      // the gauge check silently passed over a call it could not see.
      const fromArgs = (step.arguments as { code?: unknown } | undefined)?.code;
      const fromExecutable = (step.executableCode as { code?: unknown } | undefined)?.code;
      if (typeof fromArgs === 'string') executedCode = fromArgs;
      else if (typeof fromExecutable === 'string') executedCode = fromExecutable;
    } else if (type === 'model_output') {
      const content = step.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          const part = item as { text?: unknown; annotations?: unknown };
          if (typeof part.text === 'string') text = part.text;
          if (Array.isArray(part.annotations)) {
            for (const raw of part.annotations) {
              const a = raw as {
                type?: unknown;
                url?: unknown;
                title?: unknown;
                start_index?: unknown;
                end_index?: unknown;
              };
              if (a.type === 'url_citation' && typeof a.url === 'string') {
                citations.push({
                  url: a.url,
                  title: typeof a.title === 'string' ? a.title : null,
                  startIndex: typeof a.start_index === 'number' ? a.start_index : null,
                  endIndex: typeof a.end_index === 'number' ? a.end_index : null,
                });
              }
            }
          }
        }
      }
    }
  }

  return { text, citations, searchQueries, suggestionsHtml, executedCode };
}

/** Tolerant of a fenced block or leading prose in front of the JSON. */
function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export class GeminiGroundedProvider implements GroundedProvider {
  readonly name = 'gemini-grounded';
  readonly #opts: GroundedGeminiOptions;

  constructor(opts: GroundedGeminiOptions = {}) {
    this.#opts = opts;
  }

  #baseUrl(): string {
    // Its OWN variable. See the header: sharing SHIN_GEMINI_BASE_URL with the
    // ungrounded adapter pointed two different base paths at one setting.
    return this.#opts.baseUrl ?? process.env.SHIN_GEMINI_GROUNDED_BASE_URL ?? DEFAULT_BASE_URL;
  }

  #apiKey(): string {
    return (this.#opts.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim();
  }

  async sendGrounded<T>(
    request: ProviderRequest & { readonly grounding: 'google_search' },
    forDevice: string,
  ): Promise<ProviderResponse<Grounded<T>>> {
    const apiKey = this.#apiKey();
    if (apiKey === '') {
      throw new ProviderError('model_client_error', 'No GEMINI_API_KEY, so no grounded call was made.');
    }

    const wantsCode = (request as GroundedRequest).codeExecution === true;
    const tools: { type: string }[] = [{ type: 'google_search' }];
    if (wantsCode) tools.push({ type: 'code_execution' });

    const body = {
      model: request.model,
      // One `input` string: no Interactions doc page shows a separate system
      // field, so the register, the market and the ask are composed in the
      // order they would have been sent as system then user.
      input: request.system + '\n\n' + request.user,
      tools,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: request.schema.schema,
      },
    };

    const transport: GroundedTransport =
      this.#opts.transport ?? ((url, init) => fetch(url, init) as ReturnType<GroundedTransport>);

    let res: { ok: boolean; status: number; text(): Promise<string> };
    try {
      res = await transport(this.#baseUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (err) {
      throw new ProviderError('model_outage', 'The grounded call did not reach Gemini: ' + String(err));
    }

    if (!res.ok) {
      const failure =
        res.status === 429
          ? 'model_rate_limited'
          : res.status >= 500
            ? 'model_outage'
            : 'model_client_error';
      throw new ProviderError(failure, 'Gemini answered HTTP ' + res.status, res.status);
    }

    let steps: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(await res.text()) as { steps?: unknown };
      steps = Array.isArray(parsed.steps) ? (parsed.steps as Record<string, unknown>[]) : [];
    } catch {
      throw new ProviderError('model_malformed', 'The grounded answer was not JSON.');
    }

    const walked = walkSteps(steps);
    if (walked.text === null) {
      throw new ProviderError('model_malformed', 'The grounded answer carried no model output.');
    }

    /*
     * THE GAUGE CHECK. A mismatch means NO VERDICT: prices and reviews are
     * shown alone. It is not a softer verdict or a warning beside one, because
     * the whole reason the verdict step is legal is that Gemini ran a function
     * this repo can name; code we cannot recognise is arithmetic of unknown
     * provenance wearing the same label.
     */
    if (wantsCode) {
      const gauge = await loadGauge();
      if (!gauge || walked.executedCode === null || !gauge.codeMatchesGauge(walked.executedCode)) {
        throw new ProviderError(
          'model_malformed',
          'Gemini did not run the fixed gauge function, so there is no verdict. Prices and ' +
            'reviews are shown alone.',
        );
      }
    }

    const answer = parseJson(walked.text);
    if (answer === null) {
      throw new ProviderError('model_malformed', 'The grounded answer held no JSON object.');
    }

    /*
     * The one cast in this file, and what it means. `sendGrounded` is generic
     * in `T` by its interface, and what is actually sealed is a
     * `GroundedAnswer<A>`: the answer plus the citations that arrived with it,
     * side by side. Every caller instantiates `T` as
     * `GroundedAnswer<BarcodeFacts>` and so on (see the three methods below),
     * so the cast is where an untyped JSON parse becomes the shape the caller
     * asked the schema for, which is the same place every provider adapter in
     * this repo puts it.
     */
    const payload = {
      answer,
      citations: walked.citations,
      searchQueries: walked.searchQueries,
    } as unknown as T;

    return {
      // `seal` refuses an anonymous owner and an answer with no Search
      // Suggestions, and it is the refusal, not this line, that is the
      // guarantee. Nothing here checks first and skips the seal.
      value: seal({
        value: payload,
        suggestionsHtml: walked.suggestionsHtml ?? '',
        forDevice,
        promptId: request.schema.name,
        fetchedAt: new Date().toISOString(),
        provider: 'gemini',
        searchQueries: walked.searchQueries.length,
      }),
      // Usage is not reported by the interactions steps this file reads, and a
      // zero would be a measurement nobody made. See `provider.ts`'s TokenUsage.
      usage: NO_USAGE,
      provider: this.name,
      model: request.model,
    };
  }

  /** A catalogue miss. */
  lookupBarcode(
    gtin: string,
    model: string,
    forDevice: string,
    signal: AbortSignal,
    reader: Reader = 'en',
  ): Promise<ProviderResponse<Grounded<GroundedAnswer<BarcodeFacts>>>> {
    return this.sendGrounded<GroundedAnswer<BarcodeFacts>>(
      barcodeLookupRequest(gtin, model, signal, reader),
      forDevice,
    );
  }

  /** Prices, reviews and a short description. */
  pricesReviewsDescription(
    product: { name: string; brand?: string | null; size?: string | null },
    model: string,
    forDevice: string,
    signal: AbortSignal,
    reader: Reader = 'en',
  ): Promise<ProviderResponse<Grounded<GroundedAnswer<PricesReviewsDescription>>>> {
    return this.sendGrounded<GroundedAnswer<PricesReviewsDescription>>(
      pricesReviewsRequest(product, model, signal, reader),
      forDevice,
    );
  }

  /**
   * The verdict. `groundedPricesText` must come from `resubmitText` on the box
   * the previous call returned, never from anything this app reshaped.
   */
  async verdict(
    groundedPricesText: string,
    shelfPriceCad: number,
    thresholds: { goodPct: number; highPct: number },
    model: string,
    forDevice: string,
    signal: AbortSignal,
    reader: Reader = 'en',
  ): Promise<ProviderResponse<Grounded<GroundedAnswer<VerdictFigures>>>> {
    const request = await verdictResubmissionRequest(
      groundedPricesText,
      shelfPriceCad,
      thresholds,
      model,
      signal,
      reader,
    );
    return this.sendGrounded<GroundedAnswer<VerdictFigures>>(request, forDevice);
  }
}
