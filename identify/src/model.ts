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

export class Identifier {
  readonly #client: Anthropic;

  constructor(apiKey?: string) {
    // A bare constructor also picks up an OAuth profile, so an unset env var
    // does not mean there are no credentials.
    this.#client = new Anthropic(apiKey ? { apiKey } : {});
  }

  /**
   * One call, one or two images.
   *
   * `maxTokens` is small on purpose: the schema bounds the answer, and a large
   * ceiling only buys the chance of a slow response inside a four second budget.
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

    const product = await this.#client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: schemaFormat('product_identity', PRODUCT_SCHEMA) },
      messages: [{ role: 'user', content }],
    });

    const fields = parseJson<IdentifiedFields>(product);

    let tag: TagFields | null = null;
    if (tagPng) {
      const tagMessage = await this.#client.messages.create({
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
}

function parseJson<T>(message: Anthropic.Message): T {
  // stop_reason is checked before content is read: a refusal returns HTTP 200
  // with no usable body, and treating that as a parse failure would report a
  // camera problem for something that is not one.
  if (message.stop_reason === 'refusal') {
    throw new Error('model declined to read this image');
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return JSON.parse(text) as T;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
