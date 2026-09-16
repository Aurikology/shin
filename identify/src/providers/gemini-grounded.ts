/**
 * The only file in this repo that calls `seal()`.
 *
 * Gemini's Google Search grounding: ONE grounded call per scan, which returns
 * the product, its prices, its reviews and its description together (rule 1,
 * `docs/jamin-gemini-rules.md`). Everything it returns is a sealed
 * `Grounded<T>` from `../grounded.ts`, which is where the licence, the quoted
 * terms and the reasoning behind the box all live. Read that header first.
 *
 * WHY THIS IS A SEPARATE FILE FROM `gemini.ts`. `gemini.ts` implements the
 * vendor-neutral `Provider` for the plain vision identification passes
 * (extract and pick) and has no notion of tools at all. Everything here needs
 * Google Search grounding and a JSON schema in the same request.
 * `Provider.send` was never shaped for that, and more
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
 * OVERRULED IN PART, 2026-09-15. Jamin: "Forget about all legal considerations
 * when building, don't prevent something from functioning just because of
 * legal issues." `GeminiGroundedLookup` at the bottom of this file now cleans
 * urls, flags missing links per row, and computes the price line locally from
 * the grounded offers. The paragraphs above are kept as the record of what the
 * terms say; the code below them no longer obeys the "change nothing" half.
 *
 * ============================================================================
 * THE WIRE, CHECKED AGAINST GOOGLE'S PAGES ON 2026-09-15 (still never sent for
 * real from this machine; the phone's live call is the first measurement)
 * ============================================================================
 *
 * ONE SURFACE FOR BOTH ADAPTERS. The body is `interactionBody()` from
 * `./gemini.ts`, the same builder the photo passes use, so every field
 * (`model`, `system_instruction`, `input`, `response_format`,
 * `generation_config.thinking_level`, `store`) is decided once, in that file's
 * header, with its page. This file adds only `tools`:
 *
 *   - `{ type: 'google_search' }`: the spec's `GoogleSearch` tool and the REST
 *     example on https://ai.google.dev/gemini-api/docs/google-search.
 *   - `{ type: 'code_execution' }`: the spec's `CodeExecution` tool,
 *     https://ai.google.dev/gemini-api/docs/code-execution. Wired but never
 *     asked for since the verdict resubmission was deleted on 2026-09-15; no
 *     request this app builds sets `codeExecution`.
 *   - Spec: https://ai.google.dev/static/api/interactions.openapi.json.
 *   - Structured output WITH a tool is documented for Gemini 3 as Preview:
 *     https://ai.google.dev/gemini-api/docs/structured-output. All read
 *     2026-09-15.
 *
 * `POST /v1beta/interactions`, auth in the `x-goog-api-key` HEADER.
 *
 * The answer is `{ steps: [...] }`, ordered and typed: `google_search_call`
 * (`arguments.queries`), `google_search_result` (`result[].search_suggestions`,
 * the rendered Search Suggestions widget), `code_execution_call`
 * (`arguments.code`, also seen as `executableCode.code`), `code_execution_result`,
 * and `model_output` (`content[]`, each `{type:'text', text, annotations}` with
 * annotations of `{type:'url_citation', url, title, start_index, end_index}`).
 * The final answer is the LAST `model_output`.
 *
 * BASE URL. `SHIN_GEMINI_GROUNDED_BASE_URL` first, then the ungrounded
 * adapter's `SHIN_GEMINI_BASE_URL`, then Google's. Both go through
 * `interactionsUrl()` from `./gemini.ts`, so either form (version prefix or
 * full `/interactions` path) lands on the same endpoint. The two adapters used
 * to point at different base paths (`generateContent` and `interactions`);
 * since 2026-09-15 they share one.
 */

import {
  ProviderError,
  classifyProviderError,
  type ProviderRequest,
  type ProviderResponse,
  type GroundedProvider,
  type TokenUsage,
} from '../provider.ts';
import { seal, type Grounded } from '../grounded.ts';
import {
  computeGauge,
  type GaugeConfidence,
  type GaugeNoLineReason,
  type GaugeOffer,
  type GaugeShelfItem,
} from '../gauge.ts';
import { geminiModelFor, interactionBody, interactionsUrl, usageOf } from './gemini.ts';

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
 * execution is not grounding: it is a second tool, and putting it in the
 * shared seam would offer it to every ungrounded caller that has no use for
 * it. Nothing sets it today -- the verdict resubmission that did is gone --
 * and it is kept because it is a property of this wire, not of a caller.
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
 *
 * THE LAST EIGHT FIELDS EXIST SO THE GAUGE CAN REFUSE AN OFFER HONESTLY.
 * `../gauge.ts` puts an offer on the line only when it is a price the shopper
 * could actually pay for the thing in their hand, and each of these answers
 * one of the four item rules the founder picked on 2026-09-14: is it in CAD,
 * is it the retailer selling or a seller on the retailer's site, does it need
 * a membership, is it the same store brand, is it organic, is it sold by
 * weight, and is the price advertised per item or per several. Asking for
 * them is shaping the ask, which is allowed; every one of them is a fact the
 * listing itself states, not a judgment of the price.
 *
 * ASKED FOR RATHER THAN INFERRED. This app cannot look at a retailer name and
 * decide "that one is a marketplace" afterwards, because deciding anything
 * about a Grounded Result on our side is the analysis the terms forbid. The
 * question goes in the request or it does not get answered.
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
  /** The currency the price is actually in, as a code. Never converted, by this app or by Gemini. */
  readonly currency: string | null;
  /** A seller on the retailer's site rather than the retailer itself. */
  readonly marketplace: boolean | null;
  /** Needs a paid membership, so it is not a price every shopper can pay. */
  readonly memberOnly: boolean | null;
  /** 'multi_buy', 'bogo' or 'clearance'. An internal name: the word for it grades a price and never reaches a screen. */
  readonly dealKind: string | null;
  /** How many items a multi-item price covers, so 2 in a 2 for $5. */
  readonly dealUnits: number | null;
  /**
   * WHEN THE PRICE WAS SEEN, as the source gives it. NOTHING READS THIS YET
   * and no rule is written against it. It is requested now because a field
   * has to survive the trip before staleness can ever be reasoned about, and
   * because it costs one more key in a request that is already being made --
   * never a second call, which rule 1 forbids.
   */
  readonly observedAt: string | null;
  readonly organic: boolean | null;
  /** The store brand's name, e.g. "President's Choice", or null for a name brand. */
  readonly storeBrand: string | null;
  /** Priced by weight at the till, which is why a total with no weight cannot be placed. */
  readonly soldByWeight: boolean | null;
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

/**
 * The market, asked for as narrowly as the request can put it.
 *
 * THIS IS THE FIRST LINE OF DEFENCE, NOT THE ONLY ONE. `../gauge.ts` still
 * drops anything that comes back in another currency or from a marketplace
 * seller, with the codes `not_cad` and `marketplace`, because a model that
 * was asked for Canadian retailers will still sometimes answer with a US
 * listing and a price that looks like dollars. Asking narrowly here costs
 * nothing and removes most of the work from the second line.
 *
 * "NEVER CONVERT" IS SAID OUT LOUD, to Gemini as well as in our own code. An
 * exchange rate is a guess about a number the shopper would actually be
 * charged, and a converted price that arrived already converted is worse than
 * a US price we can label, because nothing downstream can tell it was a guess.
 */
function market(reader: Reader): string {
  return reader === 'fr'
    ? "Detaillants canadiens seulement, prix en dollars canadiens (CAD) seulement. Pas de vendeurs tiers sur une place de marche, seulement le detaillant lui-meme. Ne convertis JAMAIS un prix d'une autre devise en CAD : donne le prix tel quel avec le code de sa devise."
    : 'Canadian retailers only, prices in Canadian dollars (CAD) only. No third-party marketplace sellers, only the retailer itself. NEVER convert a price from another currency into CAD: give the price as it stands with its own currency code.';
}

function brevity(reader: Reader): string {
  return reader === 'fr'
    ? 'Sois bref : au plus 8 offres, au plus 3 avis, resume d\'au plus 25 mots, description d\'au plus 30 mots. Mets null la ou il n\'y a pas de source.'
    : 'Keep it short: at most 8 offers, at most 3 reviews, each summary at most 25 words, the description at most 30 words. Put null wherever there is no source.';
}

/*
 * ONE SCHEMA, BECAUSE THERE IS ONE CALL (rule 1, Jamin: "one gemini call will
 * return the object, the price, the reviews, etc.").
 *
 * The identity half -- `name`, `brand`, `size` and a source link per fact --
 * used to be a schema of its own, `barcode_facts`, asked for by a second
 * grounded call that ran beside the price search on every catalogue miss.
 * Merged in here 2026-09-15: the model is already searching for this exact
 * product to price it, so naming it costs three short strings and three urls
 * in the same answer rather than a whole second search.
 *
 * `sources` is per fact rather than one flat list for the reason it always
 * was: a flat list cannot say WHICH fact had no source, and the "no link for
 * this one" heads-up is per row.
 */
const PRICES_SCHEMA = {
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
          currency: { type: ['string', 'null'] },
          marketplace: { type: ['boolean', 'null'] },
          memberOnly: { type: ['boolean', 'null'] },
          dealKind: { type: ['string', 'null'], enum: ['multi_buy', 'bogo', 'clearance', null] },
          dealUnits: { type: ['number', 'null'] },
          observedAt: { type: ['string', 'null'] },
          organic: { type: ['boolean', 'null'] },
          storeBrand: { type: ['string', 'null'] },
          soldByWeight: { type: ['boolean', 'null'] },
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
          'currency',
          'marketplace',
          'memberOnly',
          'dealKind',
          'dealUnits',
          'observedAt',
          'organic',
          'storeBrand',
          'soldByWeight',
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
  required: ['name', 'brand', 'size', 'sources', 'offers', 'reviews', 'description'],
};

/**
 * THE ONE GROUNDED CALL A SCAN MAKES.
 *
 * RULE 1, Jamin, `docs/jamin-gemini-rules.md`: "one gemini call will return
 * the object, the price, the reviews, etc." One prompt, never two.
 *
 * WHAT THIS REPLACED. Until 2026-09-15 a catalogue miss cost three grounded
 * searches: `barcodeLookupRequest` asked what the code was, a price search was
 * fired beside it, and `/api/price` awaited a third. All three were the same
 * product being searched for, so the identity ask is now the first clause of
 * this prompt and `GeminiGroundedLookup` derives both the barcode block and
 * the price block from the single answer.
 *
 * THE SUBJECT. With a name, the product is described by brand, name and size,
 * with the barcode appended when there is one: the code is the one detail
 * that cannot match a neighbouring size or flavour by accident. With no name
 * at all -- a catalogue miss, which is the case this merge exists for -- the
 * subject IS the barcode, and clause (1) is what turns it into a product.
 *
 * `maxOutputTokens` is 2600 rather than the price-only 2000: the identity half
 * is three short strings and three urls, and an answer cut off mid-array is an
 * answer with no prices in it.
 */
export function pricesReviewsRequest(
  product: { name: string; brand?: string | null; size?: string | null; gtin?: string | null },
  model: string,
  signal: AbortSignal,
  reader: Reader = 'en',
): GroundedRequest {
  const named = (product.name ?? '').trim() !== '';
  const code = product.gtin ? (reader === 'fr' ? ` (code-barres ${product.gtin})` : ` (barcode ${product.gtin})`) : '';
  const described = [product.brand, product.name, product.size].filter(Boolean).join(' ') + code;
  const subject =
    named || !product.gtin
      ? described
      : reader === 'fr'
        ? `le produit portant le code-barres ${product.gtin}`
        : `the product with barcode ${product.gtin}`;
  const ask =
    reader === 'fr'
      ? `Utilise la recherche Google pour identifier ${subject}, puis trouve, pour ce meme produit -- (1) son nom, sa marque et son format, et pour CHACUN de ces trois faits le lien de la source qui l'etablit (null s'il n'y en a pas) ; (2) les prix actuels chez des detaillants canadiens, avec pour chaque offre le detaillant, le prix (nombre), la devise du prix (code, par exemple CAD ou USD), l'URL, la valeur du format, l'unite du format, le nombre d'unites par paquet, le numero de modele, les specifications et l'etat (neuf, reconditionne, occasion), et aussi : marketplace (vrai si c'est un vendeur tiers sur le site du detaillant plutot que le detaillant), memberOnly (vrai si le prix exige une adhesion payante), dealKind ("multi_buy" pour un prix a plusieurs articles comme 2 pour 5 $, "bogo" pour un achete un recu un, "clearance" pour une liquidation, sinon null) avec dealUnits (le nombre d'articles couverts, donc 2 pour "2 pour 5 $"), organic (vrai si le produit est biologique), storeBrand (le nom de la marque maison, par exemple "President's Choice", sinon null) et soldByWeight (vrai si le prix est au poids), et observedAt (la date a laquelle ce prix a ete publie ou vu pour la derniere fois, au format AAAA-MM-JJ, ou null si la page ne le dit pas). Donne le prix affiche tel quel : pour un "2 pour 5 $", price vaut 5 et dealUnits vaut 2. ; (3) les avis clients avec la note, le nombre d'avis, un resume court et l'URL ; (4) une courte description du produit.`
      : `Use Google Search to identify ${subject}, then find, for that same product -- (1) its name, its brand and its size, and for EACH of those three facts the source link that establishes it (null if there is none); (2) current prices at Canadian retailers, giving for each offer the retailer, the price (a number), the currency of that price (a code, for example CAD or USD), the url, the size value, the size unit, the pack count, the model number, the specs and the condition (new, refurbished, used), and also: marketplace (true when it is a third-party seller on the retailer's site rather than the retailer), memberOnly (true when the price needs a paid membership), dealKind ("multi_buy" for a several-items price such as 2 for $5, "bogo" for buy one get one, "clearance" for a marked-down line, otherwise null) with dealUnits (how many items that price covers, so 2 for a "2 for $5"), organic (true when the product is organic), storeBrand (the store brand's name, for example "President's Choice", otherwise null) and soldByWeight (true when the price is by weight), and observedAt (the date that price was published or last seen, as YYYY-MM-DD, or null when the page does not say). Give the advertised price as it stands: for a "2 for $5", price is 5 and dealUnits is 2. ; (3) customer reviews with rating, count, a short summary and the url; (4) a short product description.`;
  return {
    model,
    images: [],
    system: [voice(reader), market(reader)].join(' '),
    user: [ask, brevity(reader)].join(' '),
    schema: { name: 'prices_reviews_description', schema: PRICES_SCHEMA },
    maxOutputTokens: 2600,
    signal,
    grounding: 'google_search',
  };
}

/*
 * THE SECOND CALL IS GONE, 2026-09-15.
 *
 * `verdictResubmissionRequest`, `VERDICT_SCHEMA`, `loadGauge` and
 * `GeminiGroundedProvider.verdict` used to live here: a code-execution
 * resubmission that handed the grounded prices back to Gemini and asked it to
 * run the fixed Python in `../gauge.ts` over them. Nothing in the app ever
 * called it -- `GeminiGroundedLookup` computes the line locally with
 * `computeGauge` from the same offers, see `priceLineFor` below -- and it was
 * the only code in this repo capable of making a second grounded call for one
 * scan, which rule 1 forbids. `../gauge.ts` itself is untouched and live: the
 * arithmetic was never the dead part, the resubmission was.
 */

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
 * Shapes from the spec's `GoogleSearchCallStep` (`arguments.queries`),
 * `GoogleSearchResultStep` (`result[].search_suggestions`),
 * `CodeExecutionCallStep` (`arguments.code`), `ModelOutputStep`
 * (`content[]`) and `UrlCitation` (`url`, `title`, `start_index`,
 * `end_index`), https://ai.google.dev/static/api/interactions.openapi.json,
 * read 2026-09-15, and the grounding response example on
 * https://ai.google.dev/gemini-api/docs/google-search.
 *
 * THE ANSWER is the LAST `model_output` step, with every text part in it
 * joined in order. Citations are taken from that same step, so their indices
 * point into the text that was kept. `start_index` is documented as a BYTE
 * offset, so a second text part's citations are shifted by the UTF-8 length
 * of the parts before it, not by their character count.
 *
 * Search Suggestions are carried byte for byte: the first non-empty string.
 */
export function walkSteps(steps: readonly Record<string, unknown>[]): Walked {
  const searchQueries: string[] = [];
  let suggestionsHtml: string | null = null;
  let executedCode: string | null = null;
  let lastOutput: Record<string, unknown> | null = null;

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
      // `arguments.code` is the spec's shape. `executableCode.code` is the
      // legacy generateContent name, still read so the gauge check can never
      // pass over a call it could not see.
      const fromArgs = (step.arguments as { code?: unknown } | undefined)?.code;
      const fromExecutable = (step.executableCode as { code?: unknown } | undefined)?.code;
      if (typeof fromArgs === 'string') executedCode = fromArgs;
      else if (typeof fromExecutable === 'string') executedCode = fromExecutable;
    } else if (type === 'model_output') {
      lastOutput = step;
    }
  }

  let text: string | null = null;
  const citations: Citation[] = [];
  const content = lastOutput?.content;
  if (Array.isArray(content)) {
    let byteOffset = 0;
    const parts: string[] = [];
    for (const item of content) {
      const part = item as { type?: unknown; text?: unknown; annotations?: unknown };
      if (typeof part.text !== 'string') continue;
      if (Array.isArray(part.annotations)) {
        for (const raw of part.annotations) {
          const a = raw as { type?: unknown; url?: unknown; title?: unknown; start_index?: unknown; end_index?: unknown };
          if (a.type === 'url_citation' && typeof a.url === 'string') {
            citations.push({
              url: a.url,
              title: typeof a.title === 'string' ? a.title : null,
              startIndex: typeof a.start_index === 'number' ? a.start_index + byteOffset : null,
              endIndex: typeof a.end_index === 'number' ? a.end_index + byteOffset : null,
            });
          }
        }
      }
      parts.push(part.text);
      byteOffset += Buffer.byteLength(part.text, 'utf8');
    }
    if (parts.length > 0) text = parts.join('');
  }

  return { text, citations, searchQueries, suggestionsHtml, executedCode };
}

/**
 * Tolerant of fences, leading prose, and SEVERAL blocks in one reply.
 *
 * The website test of piece 4 (identify/test/fixtures/gemini-website/
 * piece4-prices-reviews-description.json) came back with two JSON blocks, the
 * first cut off mid-object. Structured output on the real API should return
 * one clean object, and that is tried first; the fallbacks are for the day it
 * does not, because a lost answer is worse than a parse that looks twice.
 * Fenced blocks are tried LAST first, since the complete one came second.
 */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]).reverse();
  for (const body of fenced) {
    try {
      return JSON.parse(body);
    } catch {
      /* next */
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/** Everything one grounded call returned, before it is sealed for anybody. */
export interface Fetched<A> {
  readonly answer: A;
  readonly citations: readonly Citation[];
  readonly searchQueries: readonly string[];
  readonly suggestionsHtml: string;
  readonly usage: TokenUsage;
  readonly model: string;
}

export class GeminiGroundedProvider implements GroundedProvider {
  readonly name = 'gemini-grounded';
  readonly #opts: GroundedGeminiOptions;

  constructor(opts: GroundedGeminiOptions = {}) {
    this.#opts = opts;
  }

  #baseUrl(): string {
    return interactionsUrl(
      this.#opts.baseUrl ??
        process.env.SHIN_GEMINI_GROUNDED_BASE_URL ??
        process.env.SHIN_GEMINI_BASE_URL ??
        DEFAULT_BASE_URL,
    );
  }

  #apiKey(): string {
    return (this.#opts.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim();
  }

  /**
   * One grounded call, read and parsed, not yet sealed.
   *
   * THE BODY is `interactionBody` from `gemini.ts`, the same builder the
   * ungrounded adapter sends, plus `tools`. The tool objects are
   * `{type:'google_search'}` and `{type:'code_execution'}`, verbatim from the
   * spec's `GoogleSearch` and `CodeExecution` schemas and the REST example on
   * https://ai.google.dev/gemini-api/docs/google-search (read 2026-09-15).
   * `search_types` is optional and left out, which the same spec says means
   * the default web search. Structured output together with Google Search is
   * documented for Gemini 3 models, marked Preview
   * (https://ai.google.dev/gemini-api/docs/structured-output, "Structured
   * outputs with tools", read 2026-09-15).
   */
  async fetchGrounded<A>(request: ProviderRequest & { readonly grounding: 'google_search' }): Promise<Fetched<A>> {
    const apiKey = this.#apiKey();
    if (apiKey === '') {
      throw new ProviderError('model_client_error', 'No GEMINI_API_KEY, so no grounded call was made.');
    }

    const wantsCode = (request as GroundedRequest).codeExecution === true;
    const model = geminiModelFor(request.model);
    const body = interactionBody(request, model);
    body.tools = [{ type: 'google_search' }];
    if (wantsCode) body.tools.push({ type: 'code_execution' });

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
      if (request.signal?.aborted) {
        throw new ProviderError('model_timeout', 'The grounded call ran out of time.');
      }
      throw new ProviderError('model_outage', 'The grounded call did not reach Gemini: ' + String(err));
    }

    const raw = await res.text();
    if (!res.ok) {
      throw new ProviderError(
        classifyProviderError({ status: res.status, message: raw }),
        `Gemini answered HTTP ${res.status}: ${raw.slice(0, 300)}`,
        res.status,
      );
    }

    let parsed: { steps?: unknown; status?: unknown; errors?: unknown; usage?: Record<string, unknown>; model?: unknown };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new ProviderError('model_malformed', 'The grounded answer was not JSON.');
    }
    const steps = Array.isArray(parsed.steps) ? (parsed.steps as Record<string, unknown>[]) : [];

    const walked = walkSteps(steps);
    if (walked.text === null) {
      const status = typeof parsed.status === 'string' ? parsed.status : 'unknown';
      const errors = Array.isArray(parsed.errors)
        ? (parsed.errors as { message?: unknown }[]).map((e) => String(e?.message ?? '')).filter(Boolean).join('; ')
        : '';
      throw new ProviderError(
        'model_malformed',
        `The grounded answer carried no model output (status ${status}${errors ? `: ${errors}` : ''}).`,
      );
    }

    /*
     * NO GAUGE CHECK HERE ANY MORE, 2026-09-15. It guarded the verdict
     * resubmission, which was the only caller that ever set `codeExecution`
     * and is gone (see "THE SECOND CALL IS GONE" above). The price line is
     * computed locally by `priceLineFor`, from the same offers, with the same
     * `computeGauge`, so nothing downstream lost a check.
     */
    const answer = parseJson(walked.text);
    if (answer === null || typeof answer !== 'object') {
      throw new ProviderError('model_malformed', 'The grounded answer held no JSON object.');
    }

    return {
      answer: answer as A,
      citations: walked.citations,
      searchQueries: walked.searchQueries,
      suggestionsHtml: walked.suggestionsHtml ?? '',
      usage: usageOf(parsed.usage),
      model: typeof parsed.model === 'string' && parsed.model !== '' ? parsed.model : model,
    };
  }

  async sendGrounded<T>(
    request: ProviderRequest & { readonly grounding: 'google_search' },
    forDevice: string,
  ): Promise<ProviderResponse<Grounded<T>>> {
    const fetched = await this.fetchGrounded<unknown>(request);
    const payload = {
      answer: fetched.answer,
      citations: fetched.citations,
      searchQueries: fetched.searchQueries,
    } as unknown as T;
    return {
      value: seal({
        value: payload,
        suggestionsHtml: fetched.suggestionsHtml,
        forDevice,
        promptId: request.schema.name,
        fetchedAt: new Date().toISOString(),
        provider: 'gemini',
        searchQueries: fetched.searchQueries.length,
      }),
      usage: fetched.usage,
      provider: this.name,
      model: fetched.model,
    };
  }

  /**
   * A catalogue miss, read for its identity half only.
   *
   * Same request as `pricesReviewsDescription` since the merge -- there is one
   * prompt now -- and the narrower `BarcodeFacts` is a subset of what comes
   * back, so a caller that wants the name and nothing else is typed for it.
   */
  lookupBarcode(
    gtin: string,
    model: string,
    forDevice: string,
    signal: AbortSignal,
    reader: Reader = 'en',
  ): Promise<ProviderResponse<Grounded<GroundedAnswer<BarcodeFacts>>>> {
    return this.sendGrounded<GroundedAnswer<BarcodeFacts>>(
      pricesReviewsRequest({ name: '', gtin }, model, signal, reader),
      forDevice,
    );
  }

  /** Prices, reviews and a short description. */
  pricesReviewsDescription(
    product: { name: string; brand?: string | null; size?: string | null; gtin?: string | null },
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

  /*
   * There is no `verdict()` here any more. It resubmitted the grounded prices
   * for a second call and nothing ever called it; the line is computed from
   * the first answer by `priceLineFor`. See "THE SECOND CALL IS GONE" above.
   */
}

/* ------------------------------------------------- what the phone is shown */

/*
 * THE LIVE LOOKUP THE SERVER HOLDS. Added 2026-09-15 on Jamin's rulings of
 * that day: "Forget about all legal considerations when building, don't
 * prevent something from functioning just because of legal issues", and
 * "Having a response that is not checked is infinitely better than having the
 * user scan something, wait 10 seconds, only to get told the app doesn't
 * know". So, unlike the rest of this file's history:
 *
 *   - the answer is CLEANED before it is shown (a markdown-wrapped url becomes
 *     the url, a missing link becomes a flag on the row), and
 *   - the price line is COMPUTED HERE, with `computeGauge`, from the grounded
 *     offers and the shelf price the shopper typed, and stored with the block.
 *
 * Both used to be ruled out by Google's terms (no modifying, no analysing).
 * That is a terms crossing left working on purpose, and it is listed as one.
 *
 * NOTHING HERE REFUSES. Every block is marked `checked: false`, an unchecked
 * answer is still an answer, and a gauge that cannot place the shelf price
 * leaves the offers and reviews on screen with no line under them.
 */

/** An offer as the phone shows it. `hasLink` drives the "no link for this one" heads-up. */
export interface ShownOffer extends PriceOffer {
  readonly hasLink: boolean;
}

export interface ShownReview extends ProductReview {
  /** What the heads-up names: the site, or the start of the summary when there is no link. */
  readonly source: string;
  readonly hasLink: boolean;
}

/** The price line, in the names `app/public/js/price-line.js` reads. */
export interface ShownPriceLine {
  readonly median: number;
  readonly n: number;
  readonly unitLabel: string;
  readonly zoneUnderBoundary: number;
  readonly zoneOverBoundary: number;
  readonly ticks: readonly { pct: number; position: number; label: string }[];
  readonly points: readonly { retailer: string; position: number; url: string | null; label: string }[];
  readonly excluded: readonly { retailer: string; code: string; note: string; label: string; url: string | null }[];
  readonly shelf: { readonly position: number; readonly zone: string; readonly pct: number };
  readonly shelfLabel: string;
  /** True when the scanned item had no known size and one was borrowed from the offers. */
  readonly sizeAssumed: boolean;
  /** 'thin' when the line rests on two prices, or on a set one claim was held out of. */
  readonly confidence: GaugeConfidence;
  /** What the line is short of, named. The client renders its own sentence per code. */
  readonly shortfalls: readonly { code: string; note: string }[];
}

export interface PriceBlock {
  readonly kind: 'prices';
  readonly checked: false;
  readonly description: string | null;
  readonly offers: readonly ShownOffer[];
  readonly reviews: readonly ShownReview[];
  readonly verdict: ShownPriceLine | null;
  /**
   * WHY `verdict` is null, when it is. Without this the phone cannot tell
   * "only one price found" from "no size given" from "nothing comparable
   * came back", so it said nothing at all and the shopper was left staring
   * at offers with no explanation.
   */
  readonly noLineReason: GaugeNoLineReason | null;
  readonly searchQueries: readonly string[];
  readonly citations: readonly Citation[];
}

export interface BarcodeBlock {
  readonly kind: 'barcode';
  readonly checked: false;
  readonly name: string | null;
  readonly brand: string | null;
  readonly size: string | null;
  readonly facts: readonly { readonly field: 'name' | 'brand' | 'size'; readonly value: string; readonly url: string | null; readonly hasLink: boolean }[];
  readonly offers: readonly ShownOffer[];
  readonly reviews: readonly ShownReview[];
  readonly searchQueries: readonly string[];
  readonly citations: readonly Citation[];
}

/**
 * A url as returned, or null. Unwraps the `[text](url)` markdown form the
 * website test saw inside JSON strings, and refuses anything that is not
 * http or https, which is what stops a `javascript:` link reaching an href.
 */
export function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  const md = s.match(/^\[[^\]]*\]\((\S+?)\)$/);
  if (md) s = md[1];
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function shownOffers(raw: unknown): ShownOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: ShownOffer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const price = numOrNull(o.price);
    const url = cleanUrl(o.url);
    const retailer = str(o.retailer) ?? hostOf(url);
    // A row with no price and no store is not an offer of anything.
    if (price === null || retailer === null) continue;
    out.push({
      retailer,
      price,
      url,
      sizeValue: numOrNull(o.sizeValue),
      sizeUnit: str(o.sizeUnit),
      packCount: numOrNull(o.packCount),
      modelNumber: str(o.modelNumber),
      specs: str(o.specs),
      condition: str(o.condition),
      currency: str(o.currency),
      marketplace: boolOrNull(o.marketplace),
      memberOnly: boolOrNull(o.memberOnly),
      dealKind: str(o.dealKind),
      dealUnits: numOrNull(o.dealUnits),
      observedAt: str(o.observedAt),
      organic: boolOrNull(o.organic),
      storeBrand: str(o.storeBrand),
      soldByWeight: boolOrNull(o.soldByWeight),
      hasLink: url !== null,
    });
  }
  return out;
}

export function shownReviews(raw: unknown): ShownReview[] {
  // The schema asks for an array; the website test got one object. Both read.
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const out: ShownReview[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const summary = str(r.summary) ?? '';
    const rating = numOrNull(r.rating);
    const count = numOrNull(r.count);
    if (summary === '' && rating === null) continue;
    const url = cleanUrl(r.url);
    out.push({
      rating,
      count,
      summary,
      url,
      source: hostOf(url) ?? (summary.length > 40 ? `${summary.slice(0, 40).trim()}...` : summary || String(rating)),
      hasLink: url !== null,
    });
  }
  return out;
}

/** What the shopper is holding, as far as the server knows it. */
export interface PriceQuery {
  readonly text?: string;
  readonly gtin?: string;
  readonly brand?: string | null;
  /** The shelf price the shopper typed, in cents. No price, no line. */
  readonly askingCents?: number;
  readonly sizeValue?: number | null;
  readonly sizeUnit?: string | null;
  readonly packCount?: number | null;
  /** The shopper's own two percentages; the gauge's defaults when absent. */
  readonly underPct?: number;
  readonly overPct?: number;
}

/**
 * The price line for a shelf price against grounded offers, or null.
 *
 * WHEN THE SCANNED ITEM HAS NO KNOWN SIZE (a photo read with no catalogue
 * row, a typed name), the size is BORROWED from the offers: the size most of
 * them share, which is almost always the product that was searched for. With
 * no sizes anywhere, the shelf price and every offer are compared per item.
 * Either way `sizeAssumed` says so. This is the unchecked answer Jamin asked
 * for instead of no line at all.
 */
export function priceLineFor(query: PriceQuery, offers: readonly ShownOffer[]): ShownPriceLine | null {
  return priceGaugeFor(query, offers).line;
}

/**
 * The line AND, when there is none, the reason there is none.
 *
 * `priceLineFor` above is the older, narrower door and stays because most
 * callers want only the line. This one exists because a null verdict was
 * arriving at the phone carrying nothing, and "no price line" has three
 * genuinely different causes that need three different sentences.
 */
export function priceGaugeFor(
  query: PriceQuery,
  offers: readonly ShownOffer[],
): { line: ShownPriceLine | null; reason: GaugeNoLineReason | null } {
  const cents = query.askingCents;
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return { line: null, reason: 'no_shelf_size' };
  if (offers.length === 0) return { line: null, reason: 'no_offers_on_line' };
  const price = cents / 100;

  let shelf: GaugeShelfItem = {
    price,
    sizeValue: query.sizeValue ?? null,
    sizeUnit: query.sizeUnit ?? null,
    packCount: query.packCount ?? null,
  };
  let gaugeOffers: GaugeOffer[] = offers.map((o) => ({ ...o }));
  let sizeAssumed = false;

  let result = computeGauge(shelf, gaugeOffers, query.underPct ?? 10, query.overPct ?? 10);
  /**
   * BORROWING A SIZE CANNOT CONJURE A SECOND PRICE. The ladder below exists
   * for offers that could not be compared, and re-running it on a lone offer
   * would just spend two more passes arriving at the same refusal -- with the
   * risk that a per-item fallback quietly draws the one-offer line this guard
   * is here to prevent. So the single-offer case leaves immediately.
   */
  if (!result.usable && result.reason === 'single_offer') return { line: null, reason: 'single_offer' };
  if (!result.usable) {
    const sized = offers.filter((o) => o.sizeValue !== null && o.sizeUnit !== null);
    const tally = new Map<string, { count: number; offer: ShownOffer }>();
    for (const o of sized) {
      const key = `${o.sizeValue}|${String(o.sizeUnit).toLowerCase()}|${o.packCount ?? 1}`;
      const seen = tally.get(key);
      if (seen) seen.count += 1;
      else tally.set(key, { count: 1, offer: o });
    }
    const modal = [...tally.values()].sort((a, b) => b.count - a.count)[0];
    if (modal && (query.sizeValue == null || query.sizeUnit == null)) {
      shelf = { price, sizeValue: modal.offer.sizeValue, sizeUnit: modal.offer.sizeUnit, packCount: modal.offer.packCount };
      sizeAssumed = true;
      result = computeGauge(shelf, gaugeOffers, query.underPct ?? 10, query.overPct ?? 10);
    }
    if (!result.usable) {
      // Per item, every offer the same way. Unsized rows are one item each.
      shelf = { price, sizeValue: 1, sizeUnit: 'ea', packCount: null };
      gaugeOffers = offers.map((o) => ({ ...o, sizeValue: 1, sizeUnit: 'ea', packCount: null, soldByWeight: false }));
      sizeAssumed = true;
      result = computeGauge(shelf, gaugeOffers, query.underPct ?? 10, query.overPct ?? 10);
    }
  }
  if (!result.usable) return { line: null, reason: result.reason };

  return {
    line: {
      median: result.median,
      n: result.n,
      unitLabel: result.unitLabel,
      zoneUnderBoundary: result.zoneUnderBoundary,
      zoneOverBoundary: result.zoneOverBoundary,
      ticks: result.ticks,
      points: result.points,
      excluded: result.excluded,
      shelf: { position: result.shelfPosition, zone: result.zone, pct: Math.round(result.percent) },
      shelfLabel: result.shelfLabel,
      sizeAssumed,
      confidence: result.confidence,
      shortfalls: result.shortfalls,
    },
    reason: null,
  };
}

export interface GroundedLookupOptions extends GroundedGeminiOptions {
  /** One grounded call's whole clock. No retries: a second search would push a scan past ten seconds. */
  readonly timeoutMs?: number;
  /** How long a fetched price answer is reused for the same device and product. */
  readonly reuseMs?: number;
  readonly now?: () => number;
}

const GROUNDED_TIMEOUT_MS = 9_000;
const GROUNDED_REUSE_MS = 5 * 60_000;
const GROUNDED_MAX_KEPT = 500;

/** The basic tier, translated by `geminiModelFor`, unless named. */
function groundedModel(): string {
  return process.env.SHIN_GEMINI_GROUNDED_MODEL?.trim() || 'claude-haiku-4-5';
}

function readerFrom(value: unknown): Reader {
  return value === 'fr' ? 'fr' : 'en';
}

/**
 * The object `app/server.ts`'s `groundedOnce()` hands out.
 *
 * ONE SEARCH PER SCAN, HELD AS A PROMISE. `prefetchPrice` starts it the moment
 * a product is named (a catalogue hit, a barcode miss, a photo read) and keeps
 * the promise; `lookupPrice` on `/api/price` picks up that same promise, so
 * the search has usually finished while the shopper was typing the shelf
 * price. The line is computed at that point, because only then is the shelf
 * price known, and it is cheap: the search is not run again.
 *
 * `lookupBarcode` reads the SAME promise for the identity of a code the
 * catalogue does not know. It used to run a search of its own beside the
 * prefetched one, which made a catalogue miss cost three searches of one
 * product; rule 1 says one.
 */
export class GeminiGroundedLookup {
  readonly name = 'gemini';
  readonly #provider: GeminiGroundedProvider;
  readonly #timeoutMs: number;
  readonly #reuseMs: number;
  readonly #now: () => number;
  readonly #prices = new Map<string, { at: number; promise: Promise<Fetched<Record<string, unknown>>> }>();

  constructor(opts: GroundedLookupOptions = {}) {
    this.#provider = new GeminiGroundedProvider(opts);
    const envTimeout = Number(process.env.SHIN_GROUNDED_TIMEOUT_MS);
    this.#timeoutMs = opts.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : GROUNDED_TIMEOUT_MS);
    this.#reuseMs = opts.reuseMs ?? GROUNDED_REUSE_MS;
    this.#now = opts.now ?? Date.now;
  }

  #key(query: PriceQuery, forDevice: string): string | null {
    const gtin = query.gtin?.replace(/\D/g, '').replace(/^0+/, '');
    if (gtin) return `${forDevice}|gtin:${gtin}`;
    const text = query.text?.toLowerCase().replace(/\s+/g, ' ').trim();
    return text ? `${forDevice}|text:${text}` : null;
  }

  async #call<A>(build: (signal: AbortSignal) => GroundedRequest): Promise<Fetched<A>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      return await this.#provider.fetchGrounded<A>(build(controller.signal));
    } finally {
      clearTimeout(timer);
    }
  }

  #pricesPromise(query: PriceQuery, forDevice: string, reader: Reader): Promise<Fetched<Record<string, unknown>>> | null {
    const key = this.#key(query, forDevice);
    if (key === null) return null;
    const now = this.#now();
    const kept = this.#prices.get(key);
    if (kept && now - kept.at < this.#reuseMs) return kept.promise;

    /*
     * An empty name is not a hole to paper over any more: the merged prompt
     * takes the barcode as its subject and identifies the product itself
     * (clause 1), in the reader's own language. The English sentence this used
     * to splice in went out unchanged to a French reader.
     */
    const name = query.text?.trim() ?? '';
    const promise = this.#call<Record<string, unknown>>((signal) =>
      pricesReviewsRequest({ name, brand: query.brand ?? null, gtin: query.gtin ?? null }, groundedModel(), signal, reader),
    );
    // A failed search is not kept: the next ask gets a fresh try.
    promise.catch(() => {
      if (this.#prices.get(key)?.promise === promise) this.#prices.delete(key);
    });
    this.#prices.set(key, { at: now, promise });
    if (this.#prices.size > GROUNDED_MAX_KEPT) {
      for (const [k, v] of this.#prices) {
        if (now - v.at >= this.#reuseMs || this.#prices.size > GROUNDED_MAX_KEPT) this.#prices.delete(k);
        if (this.#prices.size <= GROUNDED_MAX_KEPT) break;
      }
    }
    return promise;
  }

  /** Start the price search now and return at once. Failures surface on `lookupPrice`. */
  prefetchPrice(query: PriceQuery, forDevice: string, reader?: string): void {
    const promise = this.#pricesPromise(query, forDevice, readerFrom(reader));
    promise?.catch(() => undefined);
  }

  /** Prices, reviews, description, and the price line when a shelf price was typed. */
  async lookupPrice(query: PriceQuery, forDevice: string, reader?: string): Promise<Grounded<PriceBlock> | null> {
    const promise = this.#pricesPromise(query, forDevice, readerFrom(reader));
    if (promise === null) return null;
    const fetched = await promise;
    const offers = shownOffers(fetched.answer.offers);
    const gauged = priceGaugeFor(query, offers);
    const block: PriceBlock = {
      kind: 'prices',
      checked: false,
      description: str(fetched.answer.description),
      offers,
      reviews: shownReviews(fetched.answer.reviews),
      verdict: gauged.line,
      noLineReason: gauged.reason,
      searchQueries: fetched.searchQueries,
      citations: fetched.citations,
    };
    return seal({
      value: block,
      suggestionsHtml: fetched.suggestionsHtml,
      forDevice,
      promptId: 'prices_reviews_description',
      fetchedAt: new Date(this.#now()).toISOString(),
      provider: 'gemini',
      searchQueries: fetched.searchQueries.length,
    });
  }

  /**
   * A barcode the catalogue does not know, named by THE SAME ONE CALL that
   * prices it.
   *
   * ONE SEARCH, NOT THREE. This used to fire `prefetchPrice` and then run a
   * second grounded call of its own for the name, and `/api/price` awaited a
   * third promise; a single catalogue miss cost three searches of the same
   * product. Rule 1: "one gemini call will return the object, the price, the
   * reviews, etc." So the identity is read out of `#pricesPromise`'s answer,
   * and `/api/price` later awaits that same cached promise -- by then already
   * settled -- instead of starting anything.
   *
   * WHY THE OFFERS AND REVIEWS ARE NOT COPIED ONTO THIS BLOCK even though
   * they are now sitting in the same answer. `app/public/js/grounded.js`
   * renders `block.offers` and `block.reviews` for ANY block, without looking
   * at `kind`, so a barcode block carrying them would draw the same offer list
   * on the identify answer and again on the verdict sheet's price block. The
   * price block is the one that has to keep them: the price line's points and
   * the "no link for this one" heads-up are computed from exactly that array.
   * So the identity block stays identity, which also leaves its wire shape
   * byte-identical to the one `app/server.ts` already reads. Nothing is lost:
   * the offers reach the screen through `/api/price`, from this same fetch.
   */
  async lookupBarcode(gtin: string, forDevice: string, reader?: string): Promise<Grounded<BarcodeBlock> | null> {
    const r = readerFrom(reader);
    const promise = this.#pricesPromise({ gtin }, forDevice, r);
    if (promise === null) return null;
    const fetched = await promise;
    const a = fetched.answer;
    const sources = (a.sources && typeof a.sources === 'object' ? a.sources : {}) as Record<string, unknown>;
    // The website test got flat `name_source` keys instead of a `sources` object; both read.
    const facts: BarcodeBlock['facts'][number][] = [];
    for (const field of ['name', 'brand', 'size'] as const) {
      const value = str(a[field]);
      if (value === null) continue;
      const url = cleanUrl(sources[field] ?? a[`${field}_source`]);
      facts.push({ field, value, url, hasLink: url !== null });
    }
    const block: BarcodeBlock = {
      kind: 'barcode',
      checked: false,
      name: str(a.name),
      brand: str(a.brand),
      size: str(a.size),
      facts,
      // Deliberately empty. See the note on this method.
      offers: [],
      reviews: [],
      searchQueries: fetched.searchQueries,
      citations: fetched.citations,
    };
    return seal({
      value: block,
      suggestionsHtml: fetched.suggestionsHtml,
      forDevice,
      promptId: 'barcode_facts',
      fetchedAt: new Date(this.#now()).toISOString(),
      provider: 'gemini',
      searchQueries: fetched.searchQueries.length,
    });
  }
}
