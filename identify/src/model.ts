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
 * 1,800 ms leaves the rest of the cold path its measured couple of hundred
 * milliseconds inside 2 seconds, and two of them still sit inside decision
 * 48's four second photo budget, which matters because a scan with a shelf tag
 * makes this call twice.
 *
 * Read from the environment on each call rather than captured at import, so a
 * deployment can widen it without a rebuild and a test can shorten it without
 * mocking a clock.
 */
const TIMEOUT_MS = 1_800;

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

export interface IdentifiedFields {
  /** Null when the model genuinely cannot tell, which is a real answer. */
  brand: string | null;
  /** The product line as printed, without the brand and without the size. */
  name: string | null;
  /** Flavour, variant, formulation: the word that separates two identical boxes. */
  variant: string | null;
  size_value: number | null;
  size_unit: 'g' | 'ml' | 'ea' | null;
  category: string | null;
  /** Text the model actually read off the packaging, for the text search. */
  visible_text: string | null;
  /** Other readings it considered. Decision 17 needs these to exist. */
  alternates: { name: string; why: string }[];
  /** The model's own view. Decision 18 treats this as ONE signal, never the answer. */
  self_confidence: number;
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
  required: [
    'brand', 'name', 'variant', 'size_value', 'size_unit',
    'category', 'visible_text', 'alternates', 'self_confidence', 'uncertainty',
  ],
  properties: {
    brand: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    variant: { type: ['string', 'null'] },
    size_value: { type: ['number', 'null'] },
    size_unit: { type: ['string', 'null'], enum: ['g', 'ml', 'ea', null] },
    category: { type: ['string', 'null'] },
    visible_text: { type: ['string', 'null'] },
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
    self_confidence: { type: 'number', minimum: 0, maximum: 1 },
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

Report only what is legible in the image. If the brand is not readable, brand is
null; do not infer it from the packaging style. If you cannot separate two
readings, put both in alternates and say why in uncertainty.

Size is part of what the product IS: a 500 ml and a 1 L of the same thing are
different products. Read the declared net quantity and convert to grams for solid
weight, millilitres for liquid volume, or "ea" for a countable item.

Canadian packaging is bilingual. Read whichever language is clearer and report the
product name in English when both are present.

Shelf tags in Canada often carry several prices at once: an everyday price, a
time-boxed sale price, and a loyalty-card price. These are three different
numbers and must never be merged. Report each only if it is actually printed.`;

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
    // does not mean there are no credentials.
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
        source: { type: 'base64', media_type: 'image/png', data: toBase64(productPng) },
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
                source: { type: 'base64', media_type: 'image/png', data: toBase64(tagPng) },
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
   * The whole call policy in one place: cap, timeout, classify, retry once.
   *
   * In that order on purpose. The cap is checked before the socket is opened,
   * because a cap that refuses after the request went out is a log line rather
   * than a cap.
   */
  async #send(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    const attempts = Math.max(1, envInt('SHIN_MODEL_ATTEMPTS', MAX_ATTEMPTS));
    const timeoutMs = envInt('SHIN_MODEL_TIMEOUT_MS', TIMEOUT_MS);
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

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
