/**
 * The grounded Gemini adapter and the lookup the server holds.
 *
 * NO NETWORK. Every call goes through a recorded fake transport; nothing here
 * can reach generativelanguage.googleapis.com. The reply shapes follow the
 * Interactions OpenAPI spec (https://ai.google.dev/static/api/interactions.openapi.json,
 * read 2026-09-15) and, for the messy parts, what the Gemini website really
 * sent on 2026-09-14 (test/fixtures/gemini-website/piece4-prices-reviews-description.json):
 * markdown-wrapped urls, two JSON blocks in one reply, reviews as one object.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GeminiGroundedLookup,
  GeminiGroundedProvider,
  cleanUrl,
  parseJson,
  priceLineFor,
  pricesReviewsRequest,
  shownOffers,
  shownReviews,
  walkSteps,
  type GroundedTransport,
  type PriceBlock,
  type BarcodeBlock,
} from '../src/providers/gemini-grounded.ts';
import { toWire } from '../src/grounded.ts';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fake(replies: { ok?: boolean; status?: number; text: string }[]): GroundedTransport & { calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return { ok: reply.ok ?? true, status: reply.status ?? 200, text: async () => reply.text };
  }) as GroundedTransport & { calls: Call[] };
  fn.calls = calls;
  return fn;
}

function interaction(text: string | string[], over: Record<string, unknown> = {}): string {
  const parts = (Array.isArray(text) ? text : [text]).map((t) => ({ type: 'text', text: t }));
  return JSON.stringify({
    id: 'v1_abc',
    status: 'completed',
    model: 'gemini-3.5-flash-lite',
    steps: [
      { type: 'google_search_call', arguments: { queries: ['dove men care dry spray 107 g price canada'] } },
      {
        type: 'google_search_result',
        result: [{ search_suggestions: '<div class="container">chips</div>' }],
      },
      { type: 'model_output', content: parts },
    ],
    usage: { total_input_tokens: 900, total_output_tokens: 300, total_thought_tokens: 50, total_tokens: 1250 },
    ...over,
  });
}

const DOVE = {
  offers: [
    { retailer: 'Walmart Canada', price: 8.97, currency: 'CAD', url: '[https://www.walmart.ca/en/ip/dove](https://www.walmart.ca/en/ip/dove)', sizeValue: 107, sizeUnit: 'g', packCount: 1 },
    { retailer: 'Shoppers Drug Mart', price: 9.99, currency: 'CAD', url: null, sizeValue: 107, sizeUnit: 'g', packCount: 1 },
    { retailer: 'Real Canadian Superstore', price: 8.49, currency: 'CAD', url: 'https://www.realcanadiansuperstore.ca/dove', sizeValue: 107, sizeUnit: 'g', packCount: 1 },
    { retailer: 'Rexall', price: 10.49, currency: 'CAD', url: 'javascript:alert(1)', sizeValue: 107, sizeUnit: 'g', packCount: 1 },
  ],
  reviews: { rating: 4.6, count: 4820, summary: 'Dries fast, light scent.', url: '[x](https://www.walmart.ca/reviews/dove)' },
  description: 'A dry spray antiperspirant, 107 g.',
};

const KEY = 'test-key-not-real';

/* ------------------------------------------------------------------ the wire */

test('the grounded body is the shared Interactions body plus tools, with the model translated', async () => {
  const transport = fake([{ text: interaction(JSON.stringify(DOVE)) }]);
  const provider = new GeminiGroundedProvider({ apiKey: KEY, transport, baseUrl: 'https://example.test/v1beta' });
  await provider.fetchGrounded(pricesReviewsRequest({ name: 'Dove Men+Care', gtin: '079400450828' }, 'claude-haiku-4-5', new AbortController().signal));

  const call = transport.calls[0];
  assert.equal(call.url, 'https://example.test/v1beta/interactions');
  assert.equal(call.headers['x-goog-api-key'], KEY);
  assert.deepEqual(Object.keys(call.body).sort(), [
    'generation_config',
    'input',
    'model',
    'response_format',
    'store',
    'system_instruction',
    'tools',
  ]);
  assert.equal(call.body.model, 'gemini-3.5-flash-lite');
  assert.deepEqual(call.body.tools, [{ type: 'google_search' }]);
  assert.equal(call.body.store, false);
  assert.equal(typeof call.body.system_instruction, 'string');
  assert.match(call.body.input as string, /barcode 079400450828/);
  assert.ok(!(call.body.input as string).includes(call.body.system_instruction as string), 'system folded into input again');
  assert.ok(!JSON.stringify(call.body).includes('media_resolution'));
  assert.equal((call.body.response_format as { mime_type: string }).mime_type, 'application/json');
});

test('usage is read from the spec names, not reported as unknown', async () => {
  const transport = fake([{ text: interaction(JSON.stringify(DOVE)) }]);
  const out = await new GeminiGroundedProvider({ apiKey: KEY, transport }).fetchGrounded(
    pricesReviewsRequest({ name: '', gtin: '079400450828' }, 'claude-haiku-4-5', new AbortController().signal),
  );
  assert.equal(out.usage.inputTokens, 900);
  assert.equal(out.model, 'gemini-3.5-flash-lite');
  assert.deepEqual(out.searchQueries, ['dove men care dry spray 107 g price canada']);
});

test('a failed interaction carries Google\'s own error text', async () => {
  const transport = fake([
    { text: JSON.stringify({ status: 'failed', steps: [], errors: [{ code: 'x', message: 'search unavailable' }] }) },
  ]);
  await assert.rejects(
    new GeminiGroundedProvider({ apiKey: KEY, transport }).fetchGrounded(
      pricesReviewsRequest({ name: '', gtin: '1' }, 'claude-haiku-4-5', new AbortController().signal),
    ),
    /status failed: search unavailable/,
  );
});

test('an HTTP error is classified and quoted, not swallowed', async () => {
  const transport = fake([{ ok: false, status: 400, text: '{"error":{"message":"Unknown parameter"}}' }]);
  await assert.rejects(
    new GeminiGroundedProvider({ apiKey: KEY, transport }).fetchGrounded(
      pricesReviewsRequest({ name: '', gtin: '1' }, 'claude-haiku-4-5', new AbortController().signal),
    ),
    /HTTP 400: .*Unknown parameter/,
  );
});

/* ------------------------------------------------------------ reading replies */

test('the answer is every text part of the LAST model_output, joined, with citations shifted by bytes', () => {
  const walked = walkSteps([
    { type: 'model_output', content: [{ type: 'text', text: 'draft' }] },
    {
      type: 'model_output',
      content: [
        { type: 'text', text: 'é{' },
        { type: 'text', text: '"a":1}', annotations: [{ type: 'url_citation', url: 'https://a.test', start_index: 0, end_index: 6 }] },
      ],
    },
  ]);
  assert.equal(walked.text, 'é{"a":1}');
  assert.equal(walked.citations[0].startIndex, 3);
});

test('two JSON blocks in one reply, the first cut off, still parse to the complete one', () => {
  const reply = '```\n{"offers":[{"retailer":"Walmart","price":9.4\n```\nand then\n```json\n{"offers":[],"description":"ok"}\n```';
  assert.deepEqual(parseJson(reply), { offers: [], description: 'ok' });
  assert.equal(parseJson('nothing here'), null);
});

test('urls are unwrapped from markdown and anything not http(s) becomes no link', () => {
  assert.equal(cleanUrl('[https://www.walmart.ca/x](https://www.walmart.ca/x)'), 'https://www.walmart.ca/x');
  assert.equal(cleanUrl('javascript:alert(1)'), null);
  assert.equal(cleanUrl(null), null);
  const offers = shownOffers(DOVE.offers);
  assert.deepEqual(offers.map((o) => o.hasLink), [true, false, true, false]);
  const reviews = shownReviews(DOVE.reviews);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].source, 'walmart.ca');
  assert.equal(reviews[0].hasLink, true);
});

/* ------------------------------------------------------------ the price line */

test('the price line places the shelf price among sized offers', () => {
  const line = priceLineFor({ askingCents: 899, sizeValue: 107, sizeUnit: 'g', packCount: 1 }, shownOffers(DOVE.offers));
  assert.ok(line);
  assert.equal(line.n, 4);
  assert.equal(line.sizeAssumed, false);
  assert.equal(typeof line.shelf.position, 'number');
  assert.ok(['under_your_line', 'middle', 'over_your_line'].includes(line.shelf.zone));
});

test('REQUIREMENT 1: an item with no known size is still graded, from the size the offers share, and says so', () => {
  const line = priceLineFor({ text: 'dove spray', askingCents: 1299 }, shownOffers(DOVE.offers));
  assert.ok(line, 'an unsized photo read got no line at all');
  assert.equal(line.sizeAssumed, true);
  assert.equal(line.shelf.zone, 'over_your_line');
});

test('REQUIREMENT 2: offers with no sizes anywhere are still compared, per item', () => {
  const line = priceLineFor({ askingCents: 500 }, shownOffers([
    { retailer: 'A', price: 6, url: null },
    { retailer: 'B', price: 7, url: null },
  ]));
  assert.ok(line);
  assert.equal(line.sizeAssumed, true);
  assert.equal(line.n, 2);
  assert.equal(line.shelf.zone, 'under_your_line');
});

test('a single offer draws no line, and the offer itself is still shown, D-113', () => {
  /**
   * THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-09-16, under the name "a
   * single offer is still a line, never a refusal". It was written on
   * 2026-09-15 in the commit that turned the grounded search on, one day
   * before anyone measured what a single grounded offer is actually worth.
   *
   * It read rule 6 -- always an answer -- as "always a LINE". Measured, that
   * reading produced a $9.97 Walmart claim against a hand-priced $1.74 and
   * told the shopper they were 83% under the going rate. The answer survives;
   * the line is what goes. The offer, the reviews and the description are all
   * still returned to the caller, which is what rule 6 is protecting.
   */
  const line = priceLineFor({ askingCents: 900 }, shownOffers([{ retailer: 'A', price: 9, url: null }]));
  assert.equal(line, null, 'one price is not a middle');
});

test('no shelf price typed means no line, and the offers are still there to show', () => {
  assert.equal(priceLineFor({ text: 'x' }, shownOffers(DOVE.offers)), null);
});

/* ----------------------------------------------------------------- the lookup */

test('prefetch then lookup is ONE search, and the block reaches its owner unchecked with links flagged', async () => {
  const transport = fake([{ text: interaction('```json\n' + JSON.stringify(DOVE) + '\n```') }]);
  const lookup = new GeminiGroundedLookup({ apiKey: KEY, transport });
  lookup.prefetchPrice({ gtin: '079400450828', text: 'Dove Men+Care' }, 'device-A');
  const box = await lookup.lookupPrice({ gtin: '0079400450828', text: 'Dove Men+Care', askingCents: 899 }, 'device-A');
  assert.equal(transport.calls.length, 1, 'the price search ran twice');
  assert.ok(box);
  const wire = toWire(box, 'device-A');
  const block = wire.block as PriceBlock;
  assert.equal(block.kind, 'prices');
  assert.equal(block.checked, false);
  assert.equal(block.offers.length, 4);
  assert.equal(block.offers[0].url, 'https://www.walmart.ca/en/ip/dove');
  assert.equal(block.reviews[0].rating, 4.6);
  assert.ok(block.verdict);
  assert.equal(wire.suggestionsHtml, '<div class="container">chips</div>');
});

test('a reply with no Search Suggestions is still shown', async () => {
  const transport = fake([
    { text: JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(DOVE) }] }] }) },
  ]);
  const box = await new GeminiGroundedLookup({ apiKey: KEY, transport }).lookupPrice({ text: 'dove', askingCents: 899 }, 'device-A');
  assert.ok(box);
  assert.equal((toWire(box, 'device-A').block as PriceBlock).offers.length, 4);
});

test('a failed search is not kept, so the next ask tries again', async () => {
  const transport = fake([
    { ok: false, status: 503, text: 'busy' },
    { text: interaction(JSON.stringify(DOVE)) },
  ]);
  const lookup = new GeminiGroundedLookup({ apiKey: KEY, transport });
  await assert.rejects(lookup.lookupPrice({ text: 'dove' }, 'device-A'));
  const box = await lookup.lookupPrice({ text: 'dove' }, 'device-A');
  assert.ok(box);
  assert.equal(transport.calls.length, 2);
});

/* ------------------------------------------------------------ rule 1: one call */

const FACTS = {
  name: 'Dove Men+Care Dry Spray Clean Comfort',
  brand: 'Dove',
  size: '107 g',
  sources: { name: '[w](https://www.walmart.ca/dove)', brand: 'https://dove.com', size: null },
};

/** Identity and prices in one answer, which is what the merged schema asks for. */
const NAMED_DOVE = { ...FACTS, ...DOVE };

test('RULE 1: a barcode miss is ONE call -- the identity and the prices come from the same search', async () => {
  const transport = fake([{ text: interaction(JSON.stringify(NAMED_DOVE)) }]);
  const lookup = new GeminiGroundedLookup({ apiKey: KEY, transport });

  const box = await lookup.lookupBarcode('079400450828', 'device-A');
  assert.ok(box);
  assert.equal(transport.calls.length, 1, 'the barcode miss cost more than one grounded call');

  const block = toWire(box, 'device-A').block as BarcodeBlock;
  assert.equal(block.kind, 'barcode');
  assert.equal(block.name, 'Dove Men+Care Dry Spray Clean Comfort');
  assert.deepEqual(block.facts.map((f) => [f.field, f.hasLink]), [['name', true], ['brand', true], ['size', false]]);
  // Identity only: the offers belong to the price block, which owns the line
  // and the missing-link heads-up. See the note on `lookupBarcode`.
  assert.deepEqual(block.offers, []);
  assert.deepEqual(block.reviews, []);

  // The one request asked for both halves at once.
  const asked = JSON.stringify(transport.calls[0].body.response_format);
  assert.ok(asked.includes('offers'), 'the single call did not ask for prices');
  assert.ok(asked.includes('sources'), 'the single call did not ask for the identity sources');

  // `/api/price` picks up that same settled promise. Still one call.
  const priced = await lookup.lookupPrice({ gtin: '079400450828', askingCents: 899 }, 'device-A');
  assert.equal(transport.calls.length, 1, 'the price ask started a second search');
  assert.ok(priced);
  const priceBlock = toWire(priced, 'device-A').block as PriceBlock;
  assert.equal(priceBlock.offers.length, 4);
  assert.ok(priceBlock.verdict);
});

test('the one call is the whole answer: when it fails, the identity fails with the prices', async () => {
  // The real cost of rule 1, asserted rather than discovered on a phone: there
  // is no second search left to carry the name when the search does not land.
  const transport = fake([{ ok: false, status: 503, text: 'busy' }]);
  const lookup = new GeminiGroundedLookup({ apiKey: KEY, transport });
  await assert.rejects(lookup.lookupBarcode('079400450828', 'device-A'), /HTTP 503/);
  assert.equal(transport.calls.length, 1);
});

/* ---------------------------------------------------------- the merged ask */

function askFor(product: { name: string; brand?: string | null; size?: string | null; gtin?: string | null }, reader?: 'en' | 'fr') {
  const req = pricesReviewsRequest(product, 'claude-haiku-4-5', new AbortController().signal, reader);
  return { req, user: req.user as string, system: req.system as string };
}

test('the merged prompt asks for identity, prices, reviews and description in ONE ask, in English', () => {
  const { req, user, system } = askFor({ name: '', gtin: '079400450828' });
  assert.match(user, /identify the product with barcode 079400450828/);
  assert.match(user, /its name, its brand and its size/);
  assert.match(user, /the source link that establishes it/);
  assert.match(user, /current prices at Canadian retailers/);
  assert.match(user, /customer reviews with rating, count/);
  assert.match(user, /a short product description/);
  assert.match(system, /Answer in English/);
  assert.equal(req.schema.name, 'prices_reviews_description');
  // The identity half is three short strings and three urls on top of the prices.
  assert.equal(req.maxOutputTokens, 2600);
});

test('the merged prompt is complete in French too, barcode subject included', () => {
  const { user, system } = askFor({ name: '', gtin: '079400450828' }, 'fr');
  assert.match(user, /identifier le produit portant le code-barres 079400450828/);
  assert.match(user, /son nom, sa marque et son format/);
  assert.match(user, /le lien de la source qui l'etablit/);
  assert.match(user, /les prix actuels chez des detaillants canadiens/);
  assert.match(user, /les avis clients avec la note/);
  assert.match(user, /une courte description du produit/);
  assert.match(system, /Reponds en francais/);
  // Not one English word spliced into the French ask, which is how the old
  // "the product with barcode X" subject reached a French reader.
  assert.ok(!user.includes('the product with barcode'), 'an English subject went out to a French reader');
});

test('a product that already has a name is described by it, with the barcode as the tiebreaker', () => {
  const en = askFor({ name: 'Men+Care Dry Spray', brand: 'Dove', size: '107 g', gtin: '079400450828' }).user;
  assert.match(en, /identify Dove Men\+Care Dry Spray 107 g \(barcode 079400450828\)/);
  const fr = askFor({ name: 'Men+Care Dry Spray', brand: 'Dove', size: '107 g', gtin: '079400450828' }, 'fr').user;
  assert.match(fr, /identifier Dove Men\+Care Dry Spray 107 g \(code-barres 079400450828\)/);
  const noCode = askFor({ name: 'Men+Care Dry Spray', brand: 'Dove' }).user;
  assert.ok(!noCode.includes('barcode'), 'a barcode was invented for a product that has none');
});

test('the merged schema demands the identity fields beside the price fields', () => {
  const schema = pricesReviewsRequest({ name: 'x' }, 'claude-haiku-4-5', new AbortController().signal).schema.schema as {
    required: string[];
    properties: Record<string, { required?: string[] }>;
  };
  assert.deepEqual(schema.required, ['name', 'brand', 'size', 'sources', 'offers', 'reviews', 'description']);
  // Per fact, not one flat list: the heads-up has to name WHICH fact had no source.
  assert.deepEqual(schema.properties.sources.required, ['name', 'brand', 'size']);
  for (const field of ['name', 'brand', 'size', 'offers', 'reviews', 'description']) {
    assert.ok(schema.properties[field], `${field} is not in the merged schema`);
  }
});

test('no key is an error, never a call', async () => {
  const transport = fake([{ text: interaction('{}') }]);
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(new GeminiGroundedLookup({ transport }).lookupPrice({ text: 'x' }, 'device-A'), /No GEMINI_API_KEY/);
    assert.equal(transport.calls.length, 0);
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});
