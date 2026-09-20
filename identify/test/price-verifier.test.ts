/**
 * ITEM 3. The price verifier is a CHECK, never a second model call: it fetches
 * one page, only a host on a fixed allowlist, only a URL Gemini's own grounded
 * search already cited, and reports agreement or mismatch with no model
 * anywhere in the loop. `transport` is injected here exactly as `fakeTransport`
 * stands in for `GeminiTransport` elsewhere, so nothing in this file reaches
 * the real internet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_VERIFIER_HOSTS,
  isAllowedVerifierUrl,
  pickVerifiableOffer,
  priceCentsInHtml,
  verifyPrice,
  type VerifiableOffer,
  type VerifierTransport,
} from '../src/providers/price-verifier.ts';

test('only https, no userinfo, no port, an allowlisted host, and a real path are ever fetched', () => {
  assert.equal(isAllowedVerifierUrl('https://www.walmart.ca/ip/kraft-dinner/12345'), true);
  assert.equal(isAllowedVerifierUrl('http://www.walmart.ca/ip/kraft-dinner/12345'), false, 'plain http was allowed');
  assert.equal(isAllowedVerifierUrl('https://user:pass@www.walmart.ca/ip/12345'), false, 'userinfo was allowed');
  assert.equal(isAllowedVerifierUrl('https://www.walmart.ca:8443/ip/12345'), false, 'an explicit port was allowed');
  assert.equal(isAllowedVerifierUrl('https://www.walmart.ca'), false, 'the bare root was treated as a product page');
  assert.equal(isAllowedVerifierUrl('https://www.walmart.ca/'), false, 'the bare root was treated as a product page');
  assert.equal(isAllowedVerifierUrl('https://example.com/ip/12345'), false, 'a host off the allowlist was fetched');
  assert.equal(isAllowedVerifierUrl('not a url'), false);
  for (const host of ALLOWED_VERIFIER_HOSTS) assert.equal(isAllowedVerifierUrl(`https://${host}/p/1`), true, host);
});

function offer(over: Partial<VerifiableOffer> = {}): VerifiableOffer {
  return { retailer: 'Walmart', url: 'https://www.walmart.ca/ip/kraft-dinner/12345', price: 1.97, ...over };
}

test('the one offer that may be verified must be both cited by the grounded search and on the allowlist', () => {
  const cited = [{ url: 'https://www.walmart.ca/ip/kraft-dinner/12345' }];
  assert.deepEqual(pickVerifiableOffer([offer()], cited), offer());
  assert.equal(pickVerifiableOffer([offer({ url: 'https://example.com/kd' })], cited), null, 'an uncited allowlisted host was picked');
  assert.equal(
    pickVerifiableOffer([offer({ url: 'https://example.com/kd' })], [{ url: 'https://example.com/kd' }]),
    null,
    'a cited URL off the allowlist was picked',
  );
  assert.equal(pickVerifiableOffer([offer({ price: null })], cited), null, 'an offer with no price to check was picked');
  assert.equal(pickVerifiableOffer([], cited), null);
  const second = offer({ retailer: 'Costco', url: 'https://www.costco.ca/kraft-dinner.product.100.html' });
  assert.deepEqual(
    pickVerifiableOffer([offer({ url: 'https://example.com/kd' }), second], [...cited, { url: second.url as string }]),
    second,
    'the first cited, allowlisted offer was not the one picked',
  );
});

const LD_JSON = (price: string | number) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Kraft Dinner',
    offers: { '@type': 'Offer', price, priceCurrency: 'CAD' },
  })}</script></head><body></body></html>`;

test('a price is read from JSON-LD first, and only falls back to a bare price fragment', () => {
  assert.equal(priceCentsInHtml(LD_JSON(1.97)), 197);
  assert.equal(priceCentsInHtml(LD_JSON('1.97')), 197, 'a string price in JSON-LD was not read');
  assert.equal(priceCentsInHtml('<html>no structured data, but "price": "4.49" somewhere in a script</html>'), 449);
  assert.equal(priceCentsInHtml('<html>nothing here at all</html>'), null);
  assert.equal(priceCentsInHtml('<html><script type="application/ld+json">not json</script></html>'), null);
});

function transportOf(reply: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  text?: string;
  hang?: boolean;
  fail?: boolean;
}): VerifierTransport {
  return async (_url, init) => {
    if (reply.fail) throw new Error('network refused');
    if (reply.hang) {
      await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? (reply.contentType ?? 'text/html') : null) },
      async text() {
        return reply.text ?? '';
      },
    };
  };
}

const cited = [{ url: 'https://www.walmart.ca/ip/kraft-dinner/12345' }];

test('a page price that matches Gemini\'s own stated price agrees, and a mismatch is reported, never shown as the price', async () => {
  const agree = await verifyPrice([offer({ price: 1.97 })], cited, { transport: transportOf({ text: LD_JSON(1.97) }) });
  assert.equal(agree.outcome, 'agree');
  assert.equal(agree.pageCents, 197);
  assert.equal(agree.statedCents, 197);

  const mismatch = await verifyPrice([offer({ price: 1.97 })], cited, { transport: transportOf({ text: LD_JSON(2.49) }) });
  assert.equal(mismatch.outcome, 'mismatch');
  assert.equal(mismatch.pageCents, 249);
  assert.equal(mismatch.statedCents, 197, 'the stated price must be reported as Gemini gave it, never overwritten by the page');
});

test('nothing to verify comes back not_verifiable, without ever calling the transport', async () => {
  let called = false;
  const transport: VerifierTransport = async () => {
    called = true;
    return { ok: true, status: 200, headers: { get: () => 'text/html' }, async text() { return LD_JSON(1.97); } };
  };
  const r = await verifyPrice([offer({ url: 'https://example.com/kd' })], [{ url: 'https://example.com/kd' }], { transport });
  assert.equal(r.outcome, 'not_verifiable');
  assert.equal(called, false, 'a URL off the allowlist was fetched');
});

test('a non-OK status, the wrong content type, and a page over the size ceiling are all unavailable, never a guess', async () => {
  const status = await verifyPrice([offer()], cited, { transport: transportOf({ ok: false, status: 404 }) });
  assert.equal(status.outcome, 'unavailable');
  assert.match(status.reason ?? '', /404/);

  const wrongType = await verifyPrice([offer()], cited, { transport: transportOf({ contentType: 'application/json' }) });
  assert.equal(wrongType.outcome, 'unavailable');

  const tooBig = await verifyPrice([offer()], cited, { transport: transportOf({ text: 'x'.repeat(1_500_001) }) });
  assert.equal(tooBig.outcome, 'unavailable');
  assert.match(tooBig.reason ?? '', /too large/);
});

test('a page with no price at all is not_verifiable, and a transport failure or a timeout is unavailable, never a crash', async () => {
  const noPrice = await verifyPrice([offer()], cited, { transport: transportOf({ text: '<html>nothing</html>' }) });
  assert.equal(noPrice.outcome, 'not_verifiable');

  const failed = await verifyPrice([offer()], cited, { transport: transportOf({ fail: true }) });
  assert.equal(failed.outcome, 'unavailable');

  const timedOut = await verifyPrice([offer()], cited, { transport: transportOf({ hang: true }) });
  assert.equal(timedOut.outcome, 'unavailable');
  assert.match(timedOut.reason ?? '', /timed out/);
});
