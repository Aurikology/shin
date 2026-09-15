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
  barcodeLookupRequest,
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
    barcodeLookupRequest('079400450828', 'claude-haiku-4-5', new AbortController().signal),
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
      barcodeLookupRequest('1', 'claude-haiku-4-5', new AbortController().signal),
    ),
    /status failed: search unavailable/,
  );
});

test('an HTTP error is classified and quoted, not swallowed', async () => {
  const transport = fake([{ ok: false, status: 400, text: '{"error":{"message":"Unknown parameter"}}' }]);
  await assert.rejects(
    new GeminiGroundedProvider({ apiKey: KEY, transport }).fetchGrounded(
      barcodeLookupRequest('1', 'claude-haiku-4-5', new AbortController().signal),
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

test('a single offer is still a line, never a refusal', () => {
  const line = priceLineFor({ askingCents: 900 }, shownOffers([{ retailer: 'A', price: 9, url: null }]));
  assert.ok(line);
  assert.equal(line.n, 1);
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

test('a barcode lookup gives per-fact links and starts the price search in parallel', async () => {
  const facts = {
    name: 'Dove Men+Care Dry Spray Clean Comfort',
    brand: 'Dove',
    size: '107 g',
    sources: { name: '[w](https://www.walmart.ca/dove)', brand: 'https://dove.com', size: null },
  };
  // Routed by what was asked, since the two searches go out in either order.
  const calls: Call[] = [];
  const transport = (async (url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body });
    const asksPrices = JSON.stringify(body.response_format).includes('offers');
    const text = interaction(JSON.stringify(asksPrices ? DOVE : facts));
    return { ok: true, status: 200, text: async () => text };
  }) as GroundedTransport & { calls: Call[] };
  transport.calls = calls;
  const lookup = new GeminiGroundedLookup({ apiKey: KEY, transport });
  const box = await lookup.lookupBarcode('079400450828', 'device-A');
  assert.ok(box);
  const block = toWire(box, 'device-A').block as BarcodeBlock;
  assert.equal(block.kind, 'barcode');
  assert.equal(block.name, 'Dove Men+Care Dry Spray Clean Comfort');
  assert.deepEqual(block.facts.map((f) => [f.field, f.hasLink]), [['name', true], ['brand', true], ['size', false]]);
  // Both searches went out without the price one waiting for the barcode one.
  assert.equal(transport.calls.length, 2);
  await lookup.lookupPrice({ gtin: '079400450828', askingCents: 899 }, 'device-A');
  assert.equal(transport.calls.length, 2, 'the price search was not reused');
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
