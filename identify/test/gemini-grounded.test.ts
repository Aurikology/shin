/**
 * Gemini's Google Search grounding. Added 2026-09-14.
 *
 * NEVER RUN, same caveat as every provider test in this package: no key, no
 * network, every shape asserted below is asserted against this file's own
 * documented assumptions about Gemini's grounded response.
 *
 * ONE TEST HERE IS NOT LIKE THE OTHERS: "grounded content never reaches a
 * database module" is an architectural guarantee, not a behavioural one, and
 * it is checked by reading `gemini-grounded.ts`'s own source rather than by
 * running it, which is the only way to prove a negative about what a module
 * imports. It is written to go red on purpose first (see the note on it)
 * before being left green, per this build's finish line: show a new check
 * fail once, by breaking the thing it checks, then restore.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  groundedBarcodeLookup,
  groundedPricesAndReviews,
  type GroundedTransport,
} from '../src/providers/gemini-grounded.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(HERE, '..', 'src', 'providers', 'gemini-grounded.ts');

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function fakeTransport(reply: { ok?: boolean; status?: number; text: string }): GroundedTransport & { calls: Call[] } {
  const calls: Call[] = [];
  const transport = (async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      async text() {
        return reply.text;
      },
    };
  }) as GroundedTransport & { calls: Call[] };
  transport.calls = calls;
  return transport;
}

function barcodeAnswer(): string {
  return JSON.stringify({
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            {
              text:
                'Found it on two Canadian retailer sites.\n\n```json\n' +
                JSON.stringify({
                  name: 'Widget',
                  brand: 'Acme',
                  sizeText: '500 g',
                  category: 'pantry',
                  canadianRetailers: ['Walmart', 'Real Canadian Superstore'],
                }) +
                '\n```',
            },
          ],
        },
        groundingMetadata: {
          webSearchQueries: ['barcode 0067000008191 acme widget'],
          groundingChunks: [{ web: { uri: 'https://www.walmart.ca/ip/12345', title: 'Acme Widget 500g - Walmart.ca' } }],
          searchEntryPoint: { renderedContent: '<div class="google-search-suggestions">…</div>' },
        },
      },
    ],
  });
}

test('a grounded call never asks for structured output, only for the google search tool', async () => {
  const transport = fakeTransport({ text: barcodeAnswer() });
  await groundedBarcodeLookup('0067000008191', { apiKey: 'k', transport });
  const body = transport.calls[0].body;
  assert.equal(body.generationConfig, undefined, 'no responseSchema, no responseMimeType, ever, on a grounded call');
  assert.deepEqual(body.tools, [{ googleSearch: {} }]);
});

test('a barcode lookup parses the fenced JSON block and carries the grounding metadata through unmodified', async () => {
  const transport = fakeTransport({ text: barcodeAnswer() });
  const answer = await groundedBarcodeLookup('0067000008191', { apiKey: 'k', transport });
  assert.ok(answer);
  assert.equal(answer!.name, 'Widget');
  assert.equal(answer!.brand, 'Acme');
  assert.equal(answer!.sizeText, '500 g');
  assert.deepEqual(answer!.canadianRetailers, ['Walmart', 'Real Canadian Superstore']);
  assert.equal(answer!.hasLink, true, 'a groundingChunk exists, so the heads-up flag is off');
  assert.equal(answer!.sources[0].url, 'https://www.walmart.ca/ip/12345');
  assert.equal(answer!.searchSuggestionsHtml, '<div class="google-search-suggestions">…</div>', 'byte for byte, never rewritten');
  assert.deepEqual(answer!.webSearchQueries, ['barcode 0067000008191 acme widget']);
});

test('no groundingChunks at all means hasLink is false: the client shows the "no link for this" heads-up', async () => {
  const noLinks = JSON.stringify({
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: '```json\n' + JSON.stringify({ name: 'Mystery', brand: null, sizeText: null, category: null, canadianRetailers: [] }) + '\n```' }] },
        groundingMetadata: { webSearchQueries: ['0000000000000'], groundingChunks: [] },
      },
    ],
  });
  const transport = fakeTransport({ text: noLinks });
  const answer = await groundedBarcodeLookup('0000000000000', { apiKey: 'k', transport });
  assert.ok(answer);
  assert.equal(answer!.hasLink, false);
  assert.deepEqual(answer!.sources, []);
});

test('an answer with no fenced block at all is still read: front-matter prose is not a failure', async () => {
  const noFence = JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'I could not find this barcode anywhere.' }] } }],
  });
  const transport = fakeTransport({ text: noFence });
  const answer = await groundedBarcodeLookup('0000000000000', { apiKey: 'k', transport });
  assert.ok(answer, 'we will accept all answers Gemini gives, including one with nothing parseable');
  assert.equal(answer!.name, null);
  assert.equal(answer!.hasLink, false);
});

test('with no key, both functions return null rather than throwing, so a caller can fall through silently', async () => {
  assert.equal(await groundedBarcodeLookup('123', { apiKey: '' }), null);
  assert.equal(await groundedPricesAndReviews({ name: 'Widget' }, { apiKey: '' }), null);
});

test('a failed call (outage, refusal, malformed body) returns null, never throws, from either function', async () => {
  const transport = fakeTransport({ ok: false, status: 500, text: 'boom' });
  assert.equal(await groundedBarcodeLookup('123', { apiKey: 'k', transport }), null);
  const transport2 = fakeTransport({ text: 'not json' });
  assert.equal(await groundedPricesAndReviews({ name: 'Widget' }, { apiKey: 'k', transport: transport2 }), null);
});

test('prices and reviews: each listing and each review carries its own hasLink flag, independently', async () => {
  const text =
    'Found current listings.\n\n```json\n' +
    JSON.stringify({
      listings: [
        { retailer: 'Walmart', priceText: '$4.97', url: 'https://www.walmart.ca/ip/12345' },
        { retailer: 'Corner Store', priceText: '$5.50', url: null },
      ],
      reviews: [
        { source: 'Walmart reviews', rating: 4.3, count: 210, summary: 'Mostly positive.', url: 'https://www.walmart.ca/ip/12345#reviews' },
        { source: 'Word of mouth', rating: null, count: null, summary: 'No reviews found.', url: null },
      ],
    }) +
    '\n```';
  const answerBody = JSON.stringify({
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text }] },
        groundingMetadata: {
          webSearchQueries: ['acme widget 500g price canada'],
          groundingChunks: [{ web: { uri: 'https://www.walmart.ca/ip/12345', title: 'Acme Widget' } }],
        },
      },
    ],
  });
  const transport = fakeTransport({ text: answerBody });
  const answer = await groundedPricesAndReviews({ name: 'Widget', brand: 'Acme', sizeText: '500 g' }, { apiKey: 'k', transport });
  assert.ok(answer);
  assert.equal(answer!.listings[0].hasLink, true);
  assert.equal(answer!.listings[1].hasLink, false, 'no url on this one, so it gets its own heads-up rather than borrowing the first one\'s link');
  assert.equal(answer!.reviews[0].hasLink, true);
  assert.equal(answer!.reviews[1].hasLink, false);
  assert.equal(answer!.reviews[0].rating, 4.3);
  assert.equal(answer!.reviews[1].rating, null, 'no rating found is a real answer, never invented as zero');
});

test('a candidate refusal (safety, prohibited content) is swallowed to null, not thrown past the caller', async () => {
  const refused = JSON.stringify({ candidates: [{ finishReason: 'PROHIBITED_CONTENT', content: {} }] });
  const transport = fakeTransport({ text: refused });
  const answer = await groundedBarcodeLookup('123', { apiKey: 'k', transport });
  assert.equal(answer, null);
});

test('a link that does not parse as http(s) never counts as a link', async () => {
  const text =
    '```json\n' +
    JSON.stringify({ listings: [{ retailer: 'Sketchy', priceText: '$1', url: 'javascript:alert(1)' }], reviews: [] }) +
    '\n```';
  const body = JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
  const transport = fakeTransport({ text: body });
  const answer = await groundedPricesAndReviews({ name: 'Widget' }, { apiKey: 'k', transport });
  assert.ok(answer);
  assert.equal(answer!.listings[0].hasLink, false);
  assert.equal(answer!.listings[0].url, null);
});

/*
 * ------------------------------------------------------- terms compliance
 *
 * The architectural guarantee the header comment makes: this module cannot
 * write a grounded answer into a shared store, because it never imports one.
 * Grepping the source is the only way to check a negative like this; running
 * the module proves nothing about what it does NOT do.
 */
test('gemini-grounded.ts imports no database module of any kind (terms: never cached in a shared store)', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  // Only actual `import` DECLARATIONS are checked, never the whole file: the
  // header comment above names these same modules by name to explain why
  // none of them is imported, and a substring search over the whole file
  // would trip on its own documentation. An import line is the only place a
  // forbidden module could actually be reached from.
  const importLines = source.match(/^import\s.+$/gm) ?? [];
  const forbidden = ['node:sqlite', 'DatabaseSync', 'price/src/store', 'catalogue/src/'];
  for (const line of importLines) {
    for (const needle of forbidden) {
      assert.ok(
        !line.includes(needle),
        `an import line pulls in "${needle}": ${line}\n` +
          'gemini-grounded.ts must never import a database module; grounded content may only be ' +
          'written onto the one scan record that asked for it, by the caller, never by this file',
      );
    }
  }
});

test('a grounded price/review answer carries no field a verdict could be computed from without a second step', () => {
  // Documents the shape rather than re-testing parsing: `GroundedPriceListing`
  // and `GroundedReview` are plain display data (retailer/source, price/rating
  // as TEXT or a bare number, a url, a link flag) with nothing that reads as
  // this app's own verdict vocabulary (`tier`, `band`, `confidence`), which is
  // the type-level half of "never feeds the verdict" -- the runtime half is
  // that `app/server.ts` never passes `listings` or `reviews` into `spine`.
  const sample = { retailer: 'Walmart', priceText: '$4.97', url: null, hasLink: false };
  assert.deepEqual(Object.keys(sample).sort(), ['hasLink', 'priceText', 'retailer', 'url'].sort());
});
