/**
 * Turning a crop into fields. Decisions 16, 21 and, for the tag, 10.
 *
 * WHY FIELDS AND NOT PROSE (decision 16). A sentence has to be parsed, and a
 * parser over model prose is a second thing that can be wrong, silently, on the
 * inputs nobody tested. Worse, prose hides ambiguity: "looks like a jar of Kraft
 * peanut butter, possibly the smooth one" collapses into one string, and the
 * doubt in it is gone by the time anything downstream reads it. Structured
 * output makes the doubt a field.
 *
 * WHY BOTH CROPS IN ONE CALL (decision 10). The product and its shelf tag are
 * two crops of one moment. Sent together, the model can use each to read the
 * other -- a size on the tag confirms the size on the box -- and it costs one
 * round trip instead of two, which is most of decision 48's latency budget.
 *
 * WHY THE TIERS SHARE EVERYTHING BUT THE MODEL (decision 21). Same schema, same
 * prompt, same handling. Basic is not a cut-down experience, it is the same
 * experience with a smaller model behind it. A tier that feels broken does not
 * sell an upgrade; it teaches people the product does not work.
 */

import Anthropic from '@anthropic-ai/sdk';
import { loadDotEnv } from './env.ts';

export type Tier = 'basic' | 'pro';

/*
 * Decision 21: the only difference between the tiers.
 *
 * Pro was Opus 5 until 2026-09-05. Priced out at the crop this app actually
 * sends (1568px long edge, so 2,459 image tokens), one Opus identification cost
 * $0.0169 against Sonnet's $0.0068, and at 20 scans a week that is $17.58 a year
 * of inference per user against a subscription the whole category prices at $10
 * to $20. Reading a brand and a size off a label is not the kind of problem the
 * top tier is for. Opus is worth spending on the hard fallback after a cheaper
 * model comes back unsure, which is a different call than a default.
 */
const MODEL: Record<Tier, string> = {
  basic: 'claude-haiku-4-5',
  pro: 'claude-sonnet-5',
};

/**
 * WHAT WENT WRONG, AS A FIELD RATHER THAN A SENTENCE (added 2026-09-08).
 *
 * The beta readiness audit found every failure on this path reaching the user
 * as one sentence: the photo could not be read. That sentence is fine for the
 * person holding the phone and useless to us, because an outage on our side
 * and a genuinely dark photo then become the same row in the scan log. A beta
 * run inside an outage would read back as a beta full of bad photographers.
 *
 * So the class is a field, kept separate from the copy. The copy may stay
 * identical for every model failure (hard rule 3: nothing is aimed at the
 * user, and "our rate limit is full" is not a repair anybody can perform)
 * while the log gets the distinction the copy deliberately does not carry.
 *
 * `unreadable_photo` is the only member here that is about the photograph.
 * Every other member is about us or about the wire.
 */
export type FailureClass =
  | 'unreadable_photo'
  | 'model_timeout'
  | 'model_rate_limited'
  | 'model_outage'
  | 'model_malformed'
  | 'model_client_error'
  | 'spend_cap_reached';

/** Every throw out of `read()` is one of these, so a caller never has to guess. */
export class ModelCallError extends Error {
  readonly failure: FailureClass;
  /** How many API calls were actually spent before giving up. */
  readonly attempts: number;

  constructor(failure: FailureClass, message: string, attempts = 0) {
    super(message);
    this.name = 'ModelCallError';
    this.failure = failure;
    this.attempts = attempts;
  }
}

/** The class of anything thrown, whether or not it came from this file. */
export function failureOf(err: unknown): FailureClass {
  return err instanceof ModelCallError ? err.failure : classify(err);
}

/*
 * THE PER-CALL TIMEOUT, 2026-09-08.
 *
 * docs/the-moonshot.md section 1 item 8 sets the cold path, the one with no
 * tag and no barcode where this file is nearly the whole cost, at under 1
 * second p50 and 2 seconds p99, and quotes his own words for the bar: results
 * return in 1 second. Everything downstream of this call is small and
 * measured: a catalogue lookup at 24 to 113 ms and verdict arithmetic under
 * 20 ms. So the model call owns the budget. A call still open at 1.8 seconds
 * has already lost the p99 bar, and continuing to wait on it only decides how
 * long the screen goes on implying it is still working.
 *
 * WIDENED TO 3,500 ms, 2026-09-09 (docs/the-photo-path.md section 2).
 *
 * The 1,800 figure had no measurement behind it. It was arithmetic off a 2
 * second p99 bar that was itself an aspiration, and no photograph has ever gone
 * through the real API from this machine, so nothing in this repo has ever
 * observed how long the call actually takes.
 *
 * What changed is that the path is now two vision calls, not one: an extract
 * pass and, when pass one does not settle it, a pick pass over the catalogue
 * rows. Two calls cannot both fit inside a clock that was already a guess.
 * 3,500 for the extract and 3,000 for the pick sit inside the 8,000 ms call cap
 * with the photo budget at 7,000.
 *
 * REVERSES IF: a real key exists and a measured p95 comes in under this. The
 * number is a placeholder until then and should be re-measured, not defended.
 *
 * Read from the environment on each call rather than captured at import, so a
 * deployment can widen it without a rebuild and a test can shorten it without
 * mocking a clock.
 */
const TIMEOUT_MS = 3_500;

/*
 * The pick pass has its own clock, and its own model.
 *
 * Its own clock because it is a different question with a different answer
 * size: the extract pass transcribes a label, the pick pass returns an index
 * and a sentence. Sharing one number would have meant the smaller call
 * inheriting the larger call's allowance for no reason.
 *
 * Its own model because the pick is where the precision comes from. It runs at
 * most once per scan, only on the scans that did not settle on pass one, and it
 * is the call that turns a ranked guess into a chosen row, so both tiers get
 * Sonnet 5 for it rather than the tier's own model.
 */
const PICK_MODEL = 'claude-sonnet-5';
const PICK_TIMEOUT_MS = 3_000;

/*
 * THE RETRY POLICY, 2026-09-08.
 *
 * Two attempts, not three. A retry costs a whole second attempt inside a two
 * second bar, so there is room for exactly one, and the backoff has to be
 * shorter than anything a person would experience as a wait.
 *
 * Retried: 429, 5xx, and a network error carrying no status at all (a reset
 * socket, a DNS failure, a TLS handshake). Those are the three shapes where
 * the identical request sent again can succeed.
 *
 * NOT retried, deliberately:
 *   - a 4xx other than 429. The request is wrong; sending it again spends
 *     money to be told so twice.
 *   - a malformed response. The model answered, and it answered badly. The
 *     same prompt again is not a fix, it is a coin flip billed twice.
 *   - a timeout. This is the one that looks transient and is not affordable:
 *     the first attempt has already spent the entire p99 budget, so a second
 *     would be answering a screen the person stopped looking at.
 *
 * The SDK ships its own retry loop, maxRetries defaulting to 2. It is switched
 * off in the constructor and again at every call site, because two retry
 * policies stacked means the visible one is not the one that runs.
 */
const MAX_ATTEMPTS = 2;
const BACKOFF_MS = 200;
const BACKOFF_CAP_MS = 400;

/*
 * THE SPENDING CAP, 2026-09-08.
 *
 * Also the audit's finding: nothing anywhere refused to keep calling. The
 * thing this guards against is not a busy day, it is a loop -- a retry storm,
 * a stuck client, a script left pointed at the endpoint -- and the difference
 * between the two is that a loop does not stop on its own.
 *
 * A per-process count over a UTC day is the cheap version that needs no shared
 * state. A real per-account ceiling lives at the billing account and is not
 * this file's to enforce; this one exists so a single runaway process cannot
 * be the way we find out.
 *
 * The number is a ceiling, not a forecast. Decision 21's own costing puts a
 * pro identification at $0.0068, so 2,000 calls is roughly $14 of inference in
 * a day out of one process: far above anything one server should legitimately
 * be doing here, and far below a number anybody would rather learn from a bill.
 */
const DAILY_CALL_CAP = 2_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const spend = { day: '', calls: 0 };

/** The UTC day the cap resets on. Not local: two machines have to agree. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Charges one call against the day's cap, or refuses.
 *
 * Charged per attempt rather than per `read()`, because a retry is a real
 * request that a real invoice will show, and a cap counting only first
 * attempts would be wrong by exactly the factor a retry storm multiplies by.
 */
function reserveCall(): boolean {
  const day = today();
  if (spend.day !== day) {
    spend.day = day;
    spend.calls = 0;
  }
  if (spend.calls >= envInt('SHIN_MODEL_DAILY_CALLS', DAILY_CALL_CAP)) return false;
  spend.calls += 1;
  return true;
}

/** What has been spent in the current window. For a health endpoint, and for tests. */
export function modelSpend(): { day: string; calls: number; cap: number } {
  return { day: spend.day, calls: spend.calls, cap: envInt('SHIN_MODEL_DAILY_CALLS', DAILY_CALL_CAP) };
}

/** Starts a fresh window. A test uses this; a long-lived process never needs to. */
export function resetModelSpend(): void {
  spend.day = '';
  spend.calls = 0;
}

/** Maps anything thrown by the SDK or by the wire onto the vocabulary above. */
function classify(err: unknown): FailureClass {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    if (status === 429) return 'model_rate_limited';
    if (status >= 500) return 'model_outage';
    if (status >= 400) return 'model_client_error';
  }
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return 'model_timeout';
  // No credentials at all is our misconfiguration, not the wire. The SDK
  // throws this before a socket opens and with no status, so without this
  // branch a missing key reads as an outage, which is exactly the "an outage
  // looks like bad photos" confusion the class exists to prevent. Found
  // 2026-09-09 by posting a real PNG to the running route on a machine with
  // no key. Not retried: the second attempt has the same empty environment.
  const message = String((err as { message?: unknown } | null)?.message ?? '');
  if (name === 'AuthenticationError' || /api key|apiKey|ANTHROPIC_API_KEY|auth(entication)? token/i.test(message)) {
    return 'model_client_error';
  }
  // No status at all is the wire, not the service: a reset socket, a DNS
  // failure, a TLS error. Treated as a 5xx is, because the same second attempt
  // is the thing that might work.
  return 'model_outage';
}

const RETRYABLE: ReadonlySet<FailureClass> = new Set<FailureClass>([
  'model_rate_limited',
  'model_outage',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The model's own view of itself, as a word.
 *
 * An enum and not a number, changed 2026-09-09. Asked for a number, a model
 * produces one that looks like a probability and is not one; the digits after
 * the decimal point are invented and they invite arithmetic that means nothing.
 * Three words is the resolution the thing actually has. Decision 18 still
 * treats it as one signal out of six either way, so the loss of imaginary
 * precision costs nothing downstream.
 */
export type SelfConfidence = 'high' | 'medium' | 'low';

/**
 * The enum turned back into the number the six-signal score expects.
 *
 * Kept at this boundary on purpose. `confidence.ts` weighs a 0..1 self-report
 * against five independent signals and has no business knowing that the model
 * now answers in words, so the translation happens once, here, where the words
 * come in. The numbers are the middles of the three thirds, not measurements.
 */
export function selfConfidenceNumber(value: unknown): number {
  // A number that arrives anyway is honoured rather than discarded: an older
  // fixture, or a model that ignored the enum, should not silently score zero.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  if (value === 'high') return 0.9;
  if (value === 'medium') return 0.6;
  if (value === 'low') return 0.3;
  return 0.3;
}

export interface IdentifiedFields {
  /**
   * TRANSCRIPTION BEFORE INTERPRETATION (2026-09-09).
   *
   * Every line legible on the front of the pack, verbatim, in reading order,
   * before any field below is filled. The research pass was blunt about this:
   * a model asked for a brand straight away supplies a plausible one, and a
   * model made to write down what it can actually see first supplies fewer.
   * It is also the raw material the third catalogue query runs on, which is the
   * query that survives the brand being read wrong.
   */
  front_text: string[];
  /**
   * Digits legible under a barcode, and only that. Never inferred, never
   * completed from memory. Checked against the GS1 check digit before it is
   * believed; see `gtin.ts`.
   */
  barcode_digits: string | null;
  /** Null when the model genuinely cannot tell, which is a real answer. */
  brand: string | null;
  /** The product line as printed, without the brand and without the size. */
  name: string | null;
  /** Flavour, variant, formulation: the word that separates two identical boxes. */
  variant: string | null;
  size_value: number | null;
  size_unit: 'g' | 'kg' | 'ml' | 'l' | 'ea' | null;
  /**
   * How many are in the pack when it is a multipack, null when it is one item.
   * A six pack judged against single-unit prices reads "walk away" every time,
   * which is the same failure decision 19 already caught for sizes.
   */
  count: number | null;
  category: string | null;
  /** Which language the front of the pack was actually read in. */
  language_seen: 'en' | 'fr' | 'both' | null;
  /** Other readings it considered. Decision 17 needs these to exist. */
  alternates: { name: string; why: string }[];
  /** The model's own view. Decision 18 treats this as ONE signal, never the answer. */
  self_confidence: SelfConfidence;
  /** Why it is unsure, in the user's words, for the ambiguous screen. */
  uncertainty: string | null;
}

export interface TagFields {
  /** Everyday shelf price in cents. */
  regular_cents: number | null;
  /** Time-boxed promotion in cents. */
  promotional_cents: number | null;
  /** Loyalty or member price in cents, which is neither of the above. */
  member_cents: number | null;
  /** As printed, e.g. "$1.29 / 100 g". Not recomputed. */
  unit_price_text: string | null;
  /** "limit 4", when the tag caps it. */
  limit: string | null;
  currency: string | null;
}

export interface ModelReading {
  readonly product: IdentifiedFields;
  readonly tag: TagFields | null;
  readonly model: string;
  readonly ms: number;
  /**
   * Set by the identify stage when `barcode_digits` passed its check digit and
   * the catalogue answered on it. It says the code came off the photograph
   * rather than off a scanner, which is the difference between a fact we read
   * and a fact we were handed, and the scan log wants to be able to tell them
   * apart later when the top-1 number is being explained.
   */
  readonly barcodeFromPhoto?: string;
}

/**
 * One catalogue row as the pick pass sees it.
 *
 * Compact on purpose: the row goes into a prompt alongside a 2,459 token image,
 * and allergens, category paths and retrieval signals are not things a model
 * looking at a photograph can check. Only what is printed on a pack is sent,
 * because only that is checkable against the picture.
 */
export interface PickCandidateRow {
  readonly index: number;
  readonly code: string;
  readonly brand: string | null;
  readonly name: string;
  readonly size: string | null;
  readonly category: string | null;
}

export interface PickFields {
  chosen_index: number | null;
  confidence: SelfConfidence;
  why: string;
  /** Decision 19: the indexes that are the same product in different sizes. */
  size_question: number[] | null;
}

export interface PickReading {
  readonly pick: PickFields;
  readonly model: string;
  readonly ms: number;
}

/**
 * The schema, written out rather than generated.
 *
 * Every field is required and nullable rather than optional. An optional field
 * lets the model omit what it is unsure about, which reads downstream as "not
 * applicable" instead of "did not know" -- and those two need different screens.
 */
const PRODUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // ORDER IS THE POINT (2026-09-09). A structured answer is generated in the
  // order the schema lists it, so putting the transcription first is not
  // presentation: it makes the model write down what it can see before it is
  // asked what it thinks, and every interpreted field below is then conditioned
  // on text it has already committed to rather than on the picture alone.
  required: [
    'front_text', 'barcode_digits',
    'brand', 'name', 'variant', 'size_value', 'size_unit', 'count',
    'category', 'language_seen', 'self_confidence', 'alternates', 'uncertainty',
  ],
  properties: {
    front_text: { type: 'array', maxItems: 12, items: { type: 'string' } },
    barcode_digits: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    variant: { type: ['string', 'null'] },
    size_value: { type: ['number', 'null'] },
    size_unit: { type: ['string', 'null'], enum: ['g', 'kg', 'ml', 'l', 'ea', null] },
    count: { type: ['integer', 'null'] },
    category: { type: ['string', 'null'] },
    language_seen: { type: ['string', 'null'], enum: ['en', 'fr', 'both', null] },
    self_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    alternates: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why'],
        properties: { name: { type: 'string' }, why: { type: 'string' } },
      },
    },
    uncertainty: { type: ['string', 'null'] },
  },
} as const;

const TAG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['regular_cents', 'promotional_cents', 'member_cents', 'unit_price_text', 'limit', 'currency'],
  properties: {
    regular_cents: { type: ['integer', 'null'] },
    promotional_cents: { type: ['integer', 'null'] },
    member_cents: { type: ['integer', 'null'] },
    unit_price_text: { type: ['string', 'null'] },
    limit: { type: ['string', 'null'] },
    currency: { type: ['string', 'null'] },
  },
} as const;

const SYSTEM = `You read photographs of retail products and Canadian shelf tags.

Transcribe first, reason second. Fill front_text before anything else: every line
of text legible on the front of the pack, verbatim, in reading order, exactly as
printed and without translating or tidying it. Up to twelve lines. Then, and only
then, fill the interpreted fields, and fill them from the lines you just wrote
down rather than from what the packaging looks like.

barcode_digits is for digits you can actually read printed under a barcode. Read
them left to right and report them as one run of digits. If any digit is not
legible, or there is no barcode in frame, barcode_digits is null. Never infer,
complete, or recall a barcode number: a guessed one is worse than none, because
it will be believed.

Report only what is legible in the image. If the brand is not readable, brand is
null; do not infer it from the packaging style. If you cannot separate two
readings, put both in alternates and say why in uncertainty.

Size is part of what the product IS: a 500 ml and a 1 L of the same thing are
different products. Read the declared net quantity as printed and report its own
unit: g, kg, ml, l, or "ea" for a countable item. Do not convert between them.
If the pack is a multipack, count is how many units are inside and size_value is
the size of one unit; count is null for a single item.

Canadian packaging is bilingual. Read whichever language is clearer and report the
product name in English when both are present. Say in language_seen which you
actually read: en, fr, or both.

self_confidence is one of high, medium or low, and it is about the identification
as a whole, not about any single field.

Shelf tags in Canada often carry several prices at once: an everyday price, a
time-boxed sale price, and a loyalty-card price. These are three different
numbers and must never be merged. Report each only if it is actually printed.`;

/**
 * Pass two, and the reason the cascade above is allowed to be generous.
 *
 * The retrieval half of this path is tuned to recall: three queries, a union,
 * ten rows. That is deliberately more than one answer, and something has to
 * choose. A vision model choosing between ten concrete rows while looking at
 * the packaging is a much easier question than the open one pass one asked, and
 * it is the step the research pass credits for most of the gap between a
 * single-pass 60-70 % and a cascade's 85-92 %.
 *
 * It is allowed to answer null. A pick that cannot refuse is a ranker with
 * extra steps, and the null is what separates "the catalogue does not have
 * this" from "the catalogue has it and here it is".
 */
const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chosen_index', 'confidence', 'why', 'size_question'],
  properties: {
    chosen_index: { type: ['integer', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    why: { type: 'string' },
    size_question: { type: ['array', 'null'], maxItems: 4, items: { type: 'integer' } },
  },
} as const;

const PICK_SYSTEM = `You are shown a photograph of a retail product and a numbered
list of candidate rows from a product catalogue. Choose the row that IS the
product in the photograph.

Choose a row only if the text printed on the packaging matches that row. Matching
packaging style, category, or general appearance is not a match. If no row
matches the printed text, chosen_index is null. Answering null is a correct and
expected answer; a wrong row is worse than no row.

When more than one row could be the product, prefer the row whose size matches
the net quantity printed on the pack.

If two or more rows are the same product in different sizes and the size printed
on the pack is not legible, do not choose between them: put their indexes in
size_question and leave chosen_index null. The person holding the phone will be
asked which one it is.

why is one short sentence naming the printed text that decided it.`;

function schemaFormat(name: string, schema: unknown) {
  return { type: 'json_schema' as const, name, schema: schema as Record<string, unknown> };
}

/**
 * The one thing this file needs from a client, so a test can supply it.
 *
 * Structural rather than the SDK class: a test that wants to prove the retry
 * policy has to be able to hand back a 429 and then a success, and it should
 * not have to construct an Anthropic instance, an API key, or a socket to do
 * it. The real client satisfies this shape.
 */
export interface MessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal; maxRetries?: number },
    ): Promise<Anthropic.Message>;
  };
}

export class Identifier {
  readonly #client: MessagesClient;

  constructor(apiKey?: string, client?: MessagesClient) {
    // A bare constructor also picks up an OAuth profile, so an unset env var
    // does not mean there are no credentials. And a repo-root .env is read
    // first (env.ts), so a founder can drop the key in a file the repo
    // already ignores.
    if (!apiKey && !client) loadDotEnv();
    //
    // maxRetries: 0 added 2026-09-08. The SDK retries twice by default, which
    // would sit underneath the policy above and make the real behaviour four
    // attempts with a backoff nothing in this file chose.
    this.#client =
      client ??
      (new Anthropic(apiKey ? { apiKey, maxRetries: 0 } : { maxRetries: 0 }) as unknown as MessagesClient);
  }

  /**
   * One call, one or two images.
   *
   * `maxTokens` is small on purpose: the schema bounds the answer, and a large
   * ceiling only buys the chance of a slow response inside a four second budget.
   *
   * Throws `ModelCallError` and nothing else. Added 2026-09-08: before this,
   * whatever the SDK threw travelled up unclassified and the caller turned all
   * of it into one sentence about the photo.
   */
  async read(
    productPng: Uint8Array,
    tagPng: Uint8Array | null,
    tier: Tier,
  ): Promise<ModelReading> {
    const started = Date.now();
    const model = MODEL[tier];

    const content: Anthropic.ContentBlockParam[] = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaTypeOf(productPng), data: toBase64(productPng) },
      },
      { type: 'text', text: 'Identify this product.' },
    ];

    const product = await this.#send({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: schemaFormat('product_identity', PRODUCT_SCHEMA) },
      messages: [{ role: 'user', content }],
    });

    const fields = parseJson<IdentifiedFields>(product);

    let tag: TagFields | null = null;
    if (tagPng) {
      const tagMessage = await this.#send({
        model,
        max_tokens: 512,
        system: SYSTEM,
        output_config: { format: schemaFormat('shelf_tag', TAG_SCHEMA) },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaTypeOf(tagPng), data: toBase64(tagPng) },
              },
              { type: 'text', text: 'Read every price printed on this shelf tag.' },
            ],
          },
        ],
      });
      tag = parseJson<TagFields>(tagMessage);
    }

    return { product: fields, tag, model, ms: Date.now() - started };
  }

  /**
   * Pass two: the same image again, plus the rows the cascade found.
   *
   * Same image and not a second photograph. The person took one picture and the
   * cost of re-sending it is cache-friendly tokens, where the cost of asking
   * for another is the scan.
   *
   * Sonnet 5 on both tiers (`SHIN_MODEL_PICK` overrides). It runs only on the
   * scans pass one did not settle, so it is a fraction of a call per scan on
   * average, and it is the call the accuracy actually comes from. It is charged
   * against the same daily cap as every other call, because the invoice does
   * not care which pass a request belonged to.
   *
   * Throws `ModelCallError` and nothing else, exactly like `read()`.
   */
  async pick(
    productPng: Uint8Array,
    candidates: readonly PickCandidateRow[],
    tier: Tier,
  ): Promise<PickReading> {
    const started = Date.now();
    const model = process.env.SHIN_MODEL_PICK?.trim() || PICK_MODEL;
    // `tier` is accepted and deliberately unused for the model choice: the
    // signature says the pick is a tiered operation so a later tier split needs
    // no caller change, and decision 21 says basic is the same experience with
    // a smaller model, not a worse pick.
    void tier;

    const rows = candidates.map((c) => ({
      index: c.index,
      code: c.code,
      brand: c.brand,
      name: c.name,
      size: c.size,
      category: c.category,
    }));

    const message = await this.#send(
      {
        model,
        max_tokens: 512,
        system: PICK_SYSTEM,
        output_config: { format: schemaFormat('catalogue_pick', PICK_SCHEMA) },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaTypeOf(productPng), data: toBase64(productPng) },
              },
              {
                type: 'text',
                text: `Candidate rows:\n${JSON.stringify(rows)}\n\nWhich row is the product in the photograph?`,
              },
            ],
          },
        ],
      },
      envInt('SHIN_MODEL_PICK_TIMEOUT_MS', PICK_TIMEOUT_MS),
    );

    return { pick: parseJson<PickFields>(message), model, ms: Date.now() - started };
  }

  /**
   * The whole call policy in one place: cap, timeout, classify, retry once.
   *
   * In that order on purpose. The cap is checked before the socket is opened,
   * because a cap that refuses after the request went out is a log line rather
   * than a cap.
   *
   * The clock is a parameter with a default rather than a constant, because the
   * two passes are different sizes of question and each reads its own env var.
   */
  async #send(
    body: Anthropic.MessageCreateParamsNonStreaming,
    clockMs = envInt('SHIN_MODEL_TIMEOUT_MS', TIMEOUT_MS),
  ): Promise<Anthropic.Message> {
    const attempts = Math.max(1, envInt('SHIN_MODEL_ATTEMPTS', MAX_ATTEMPTS));
    const timeoutMs = clockMs;
    let spent = 0;
    let last: ModelCallError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (!reserveCall()) {
        // Out of budget on the first attempt is a refusal of its own class.
        // Out of budget mid-retry is not: the thing that actually went wrong
        // is the transient failure we were retrying, and relabelling it would
        // hide an outage behind a billing message.
        if (last) break;
        throw new ModelCallError(
          'spend_cap_reached',
          `daily model call cap reached (${modelSpend().calls} calls on ${modelSpend().day})`,
          spent,
        );
      }
      spent += 1;

      try {
        return await withTimeout(this.#client, body, timeoutMs);
      } catch (err) {
        const failure = failureOf(err);
        last = new ModelCallError(failure, err instanceof Error ? err.message : String(err), spent);
        if (!RETRYABLE.has(failure) || attempt === attempts) break;
        await sleep(Math.min(BACKOFF_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS));
      }
    }

    throw last ?? new ModelCallError('model_outage', 'the model call made no attempt', spent);
  }
}

/**
 * One attempt, with the clock on it.
 *
 * Both halves are used: the abort signal so a client that honours it stops
 * spending a socket, and the race so the caller is freed on time even when it
 * does not. A client that ignores the signal would otherwise hold the screen
 * for as long as it liked while this file claimed to have a timeout.
 */
async function withTimeout(
  client: MessagesClient,
  body: Anthropic.MessageCreateParamsNonStreaming,
  ms: number,
): Promise<Anthropic.Message> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelCallError('model_timeout', `no answer from the model in ${ms} ms`, 1));
    }, ms);
  });

  try {
    return await Promise.race([
      client.messages.create(body, { signal: controller.signal, maxRetries: 0 }),
      expired,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function parseJson<T>(message: Anthropic.Message): T {
  // stop_reason is checked before content is read: a refusal returns HTTP 200
  // with no usable body, and treating that as a parse failure would report a
  // camera problem for something that is not one.
  if (message.stop_reason === 'refusal') {
    throw new ModelCallError('unreadable_photo', 'model declined to read this image');
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  // 2026-09-08: an answer that will not parse is its own class. It is the one
  // failure here that is neither the photograph nor the wire, and reading it
  // as either would have been the audit's point exactly.
  if (text.trim() === '') {
    throw new ModelCallError('model_malformed', 'the model returned no text block');
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ModelCallError(
      'model_malformed',
      `the model returned text that is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/*
 * The eye sends PNG (decision 12) and the route also admits JPEG by its
 * magic bytes, as do the eval photos from Open Food Facts. The media type
 * on the wire has to say which, or the API rejects the block. Sniffed here
 * rather than passed in, so no caller can lie about it. Added 2026-09-09
 * when lane D noticed the eval set is JPEG and this said PNG for everything.
 */
export function mediaTypeOf(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'image/png';
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
