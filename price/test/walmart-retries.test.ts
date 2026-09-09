/**
 * Tests for the SHIN_WALMART_CHALLENGE_RETRIES environment override.
 *
 * When a PerimeterX challenge response is encountered, it is a stub
 * (< 60 kB). The override controls how many times the challenge is retried
 * (independently from 429/403/network retries) to allow rate probes to
 * request one page with exactly one request.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detail, Throttled } from '../src/walmart.ts';

/**
 * Create a mock Response-like object.
 * Defaults to a challenge stub (< 60 kB).
 */
function mockResponse(options: { status?: number; bodySize?: number } = {}): Response {
  const { status = 200, bodySize = 7500 } = options;
  const body = 'x'.repeat(bodySize);
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  } as Response;
}

/**
 * Create a challenge stub response (< 60 kB).
 */
function challengeStub(): Response {
  return mockResponse({ bodySize: 7500 });
}

/**
 * Create a full response (> 60 kB) with embedded JSON.
 */
function fullResponse(): Response {
  // A minimal valid response that will pass embeddedJson and parsing.
  // Must be > 60 kB to not be treated as a challenge.
  const json = JSON.stringify({
    props: {
      pageProps: {
        initialData: {
          data: {
            product: {
              usItemId: 'TEST123',
              name: 'Test Product',
              brand: 'Test Brand',
              upc: '0068100084245',
              priceInfo: {
                currentPrice: { price: 597 },
                wasPrice: { price: 799 },
                unitPrice: { price: 597, priceString: '30 cents per 100 g' },
              },
              imageInfo: { thumbnailUrl: 'https://example.com/image.jpg' },
              availabilityStatus: 'IN_STOCK',
            },
          },
        },
      },
    },
  });
  const padding = 'x'.repeat(61000);
  const html = `<!DOCTYPE html><html><head></head><body><script id="__NEXT_DATA__">${json}${padding}</script></body></html>`;
  return mockResponse({ bodySize: html.length });
}

test('with env unset, a challenge stub is retried 3 times (4 fetches total)', async () => {
  const originalEnv = process.env.SHIN_WALMART_CHALLENGE_RETRIES;
  delete process.env.SHIN_WALMART_CHALLENGE_RETRIES;

  let fetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    return challengeStub();
  };

  try {
    await detail('TEST123');
    assert.fail('Expected Throttled error');
  } catch (err) {
    assert.ok(err instanceof Throttled, `Expected Throttled, got ${err?.constructor.name}`);
    assert.equal(fetchCount, 4, 'Expected 4 fetches (1 initial + 3 retries)');
  } finally {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.SHIN_WALMART_CHALLENGE_RETRIES = originalEnv;
    }
  }
});

test('with SHIN_WALMART_CHALLENGE_RETRIES=0, it throws Throttled after exactly 1 fetch', async () => {
  process.env.SHIN_WALMART_CHALLENGE_RETRIES = '0';

  let fetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    return challengeStub();
  };

  try {
    await detail('TEST123');
    assert.fail('Expected Throttled error');
  } catch (err) {
    assert.ok(err instanceof Throttled, `Expected Throttled, got ${err?.constructor.name}`);
    assert.equal(fetchCount, 1, 'Expected 1 fetch (no retries)');
  } finally {
    global.fetch = originalFetch;
    delete process.env.SHIN_WALMART_CHALLENGE_RETRIES;
  }
});

test('with SHIN_WALMART_CHALLENGE_RETRIES=1, it retries once (2 fetches total)', async () => {
  process.env.SHIN_WALMART_CHALLENGE_RETRIES = '1';

  let fetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    return challengeStub();
  };

  try {
    await detail('TEST123');
    assert.fail('Expected Throttled error');
  } catch (err) {
    assert.ok(err instanceof Throttled, `Expected Throttled, got ${err?.constructor.name}`);
    assert.equal(fetchCount, 2, 'Expected 2 fetches (1 initial + 1 retry)');
  } finally {
    global.fetch = originalFetch;
    delete process.env.SHIN_WALMART_CHALLENGE_RETRIES;
  }
});

test('non-integer SHIN_WALMART_CHALLENGE_RETRIES falls back to default (3 retries, 4 fetches)', async () => {
  process.env.SHIN_WALMART_CHALLENGE_RETRIES = 'not-a-number';

  let fetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    return challengeStub();
  };

  try {
    await detail('TEST123');
    assert.fail('Expected Throttled error');
  } catch (err) {
    assert.ok(err instanceof Throttled, `Expected Throttled, got ${err?.constructor.name}`);
    assert.equal(fetchCount, 4, 'Expected 4 fetches (1 initial + 3 retries)');
  } finally {
    global.fetch = originalFetch;
    delete process.env.SHIN_WALMART_CHALLENGE_RETRIES;
  }
});

test('429 responses still retry independently of challenge retry count', async () => {
  process.env.SHIN_WALMART_CHALLENGE_RETRIES = '0';

  let fetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    if (fetchCount <= 2) {
      // Return 429 for first two attempts
      return mockResponse({ status: 429 });
    }
    // Return challenge stub on third attempt
    return challengeStub();
  };

  try {
    await detail('TEST123');
    assert.fail('Expected Throttled error');
  } catch (err) {
    assert.ok(err instanceof Throttled, `Expected Throttled, got ${err?.constructor.name}`);
    assert.equal(fetchCount, 3, 'Expected 3 fetches (retries on 429, then challenge throws)');
  } finally {
    global.fetch = originalFetch;
    delete process.env.SHIN_WALMART_CHALLENGE_RETRIES;
  }
});
