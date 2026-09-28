/**
 * ITEM 3, wired: after a scan comes back, the one cited, allowlisted retailer
 * page (if any) is fetched and checked against the price Gemini stated
 * (ruling 3, docs/decisions.md "Nine rulings so the competitor-survey build
 * could start", 2026-09-19). A CHECK, never a second model call, and it can
 * only ever write a mark on the stored `gemini_call` row -- never on the
 * `scan` row a phone was already shown, which is ruling 3's whole point and
 * the test below named for it.
 *
 * Nothing reaches Google or a real retailer: the Gemini transport is a
 * recorded double (Jamin's rule 8), and the retailer-page fetch goes through
 * its own stub via `setVerifierTransportForTests`, exactly the same way
 * `setGeminiTransportForTests` keeps Gemini out of every other test here.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { fakeTransport, goodAnswer } from './gemini-double.ts';
import type { VerifierTransport } from '../../identify/src/providers/price-verifier.ts';

const dir = mkdtempSync(join(tmpdir(), 'shin-price-verify-'));
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28
process.env.SHIN_SCANS = join(dir, 'scans.db');
process.env.SHIN_REPEAT_CACHE = join(dir, 'repeat-cache.db');
process.env.SHIN_GAPS = join(dir, 'gaps.db');
process.env.SHIN_CORRECTIONS = join(dir, 'corrections.db');
process.env.SHIN_PHOTOS = join(dir, 'photos');
process.env.SHIN_CATALOGUE = join(dir, 'no-catalogue.db');
process.env.PORT = '0';
process.env.GEMINI_API_KEY = 'test-key-never-sent-anywhere';
delete process.env.SHIN_INVITE_CODE;
delete process.env.SHIN_GEMINI_MODEL;
delete process.env.SHIN_MODEL_PROVIDER;

const { server, setGeminiTransportForTests, setSpendGuardForTests, setVerifierTransportForTests, settleBackgroundChecks } =
  await import('../server.ts');
const { geminiCallsForScan, openScanStore } = await import('../src/scans.ts');
const { clearRepeatCacheForTests } = await import('../src/repeat-cache.ts');

let port = 0;
const base = () => `http://127.0.0.1:${port}`;
const identify = (q: string) =>
  fetch(`${base()}/api/identify?${q}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));

before(async () => {
  if (!server.listening) await new Promise<void>((r) => server.once('listening', () => r()));
  port = (server.address() as AddressInfo).port;
  openScanStore(process.env.SHIN_SCANS);
});
beforeEach(() => {
  setSpendGuardForTests(null);
  clearRepeatCacheForTests();
});
after(async () => {
  setGeminiTransportForTests(null);
  setVerifierTransportForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the scan database is still open on Windows; the OS will take the temp dir */
  }
});

/** A retailer host the verifier's own allowlist carries, so a fetch is worth trying at all. */
const ALLOWED_URL = 'https://www.walmart.ca/ip/kraft-dinner-original/10112130';
/** A host the allowlist has never heard of, cited all the same. */
const DISALLOWED_URL = 'https://not-on-the-allowlist.example.com/kraft-dinner';

/**
 * `goodAnswer` with exactly one offer, at `url`, priced at `priceDollars` --
 * simple enough that the only thing a test has to reason about is whether the
 * verifier's mark changed, never whether some other offer confused it.
 */
function answerWithOneOffer(url: string, priceDollars: number): Record<string, unknown> {
  return goodAnswer({
    offers: [
      {
        retailer: 'Walmart',
        price: priceDollars,
        currency: 'CAD',
        url,
        advertised_price_text: `$${priceDollars}`,
        size: '225 g',
        size_value: 225,
        size_unit: 'g',
        pack_count: 1,
        quantity_covered: 1,
        model_number: null,
        specs: [],
        condition: 'new',
        marketplace_status: 'direct_retailer',
        membership_required: false,
        multi_buy: false,
        bogo: false,
        organic: false,
        store_brand: false,
        sold_by_weight: false,
        price_unit: 'item',
        source_support: 'page',
        unit_price: priceDollars,
        in_median: true,
        exclusion_reason: null,
        pct_vs_median: 0,
        position: 50,
      },
    ],
    price_verdict: {
      verdict_available: true,
      no_verdict_reason: null,
      comparison_unit: '100 g',
      median_unit_price: priceDollars,
      offers_in_median: 1,
      span_pct: 0,
      zone_under_boundary: 0,
      zone_over_boundary: 0,
      shelf: null,
      thresholds_used: { under_pct: 10, over_pct: 10 },
      confidence: 'ok',
      size_assumed: false,
    },
  });
}

/**
 * A reply in the grounded transport's own step shape, WITH a `url_citation`
 * annotation on the model's text for each of `citationUrls` -- `httpBody`
 * (gemini-double.ts) never adds one, because none of its own callers needed
 * a citation before this file. This is what `walkSteps` (gemini-grounded.ts)
 * reads `run.citations` out of.
 */
function bodyWithCitations(answer: Record<string, unknown>, citationUrls: readonly string[]): string {
  const text = JSON.stringify(answer);
  return JSON.stringify({
    steps: [
      { type: 'google_search_call', arguments: { queries: ['kraft dinner price'] } },
      { type: 'google_search_result', result: [{ search_suggestions: '<div class="container">kraft dinner price</div>' }] },
      {
        type: 'model_output',
        content: [
          {
            type: 'text',
            text,
            annotations: citationUrls.map((url) => ({ type: 'url_citation', url, title: null, start_index: 0, end_index: text.length })),
          },
        ],
      },
    ],
    usage: { total_input_tokens: 1000, total_output_tokens: 400 },
  });
}

/** A page whose JSON-LD offer states `cents`, the same structured data `priceCentsInHtml` reads. */
function pageAt(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    offers: { '@type': 'Offer', price: dollars, priceCurrency: 'CAD' },
  })}</script></head><body></body></html>`;
}

function stubTransport(handler: () => { status?: number; contentType?: string; html?: string } | never): VerifierTransport {
  return async () => {
    const r = handler();
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? (r.contentType ?? 'text/html') : null) },
      text: async () => r.html ?? '',
    };
  };
}

function install(reply: Parameters<typeof fakeTransport>[0]) {
  setGeminiTransportForTests(fakeTransport(reply).transport);
}

test('an agreeing page marks the call agree, with the page and stated prices recorded', async () => {
  install(() => ({ text: bodyWithCitations(answerWithOneOffer(ALLOWED_URL, 4.99), [ALLOWED_URL]) }));
  setVerifierTransportForTests(stubTransport(() => ({ html: pageAt(499) })));
  const { status, body } = await identify('gtin=0068100084245&deviceId=verify-agree');
  assert.equal(status, 200);
  await settleBackgroundChecks();
  const row = geminiCallsForScan(body.scanId)[0];
  assert.equal(row.price_verify_check, 'agree');
  assert.equal(row.price_verify_retailer, 'Walmart');
  assert.equal(row.price_verify_url, ALLOWED_URL);
  assert.equal(row.price_verify_page_cents, 499);
  assert.equal(row.price_verify_stated_cents, 499);
  assert.equal(row.price_verify_reason, null);
  assert.notEqual(row.price_verify_checked_at, null);
});

test('a mismatching page marks the call mismatch, never agree', async () => {
  install(() => ({ text: bodyWithCitations(answerWithOneOffer(ALLOWED_URL, 4.99), [ALLOWED_URL]) }));
  setVerifierTransportForTests(stubTransport(() => ({ html: pageAt(699) })));
  const { body } = await identify('gtin=0068100084245&deviceId=verify-mismatch');
  await settleBackgroundChecks();
  const row = geminiCallsForScan(body.scanId)[0];
  assert.equal(row.price_verify_check, 'mismatch');
  assert.equal(row.price_verify_page_cents, 699);
  assert.equal(row.price_verify_stated_cents, 499);
});

test('ruling 3: the price shown to the phone never changes, whether the page agreed or not', async () => {
  // Same device id both times (`modelForScan` hashes the model choice off it), so
  // the only reason the two Gemini replies could ever differ is the retailer
  // page's own answer -- which is exactly what this test is checking never
  // reaches the phone.
  const device = 'verify-shown-same-device';

  install(() => ({ text: bodyWithCitations(answerWithOneOffer(ALLOWED_URL, 4.99), [ALLOWED_URL]) }));
  setVerifierTransportForTests(stubTransport(() => ({ html: pageAt(499) })));
  const agree = await identify(`gtin=0068100084245&deviceId=${device}`);
  await settleBackgroundChecks();
  assert.equal(geminiCallsForScan(agree.body.scanId)[0].price_verify_check, 'agree');

  clearRepeatCacheForTests();
  install(() => ({ text: bodyWithCitations(answerWithOneOffer(ALLOWED_URL, 4.99), [ALLOWED_URL]) }));
  setVerifierTransportForTests(stubTransport(() => ({ html: pageAt(699) })));
  const mismatch = await identify(`gtin=0068100084245&deviceId=${device}`);
  await settleBackgroundChecks();
  assert.equal(geminiCallsForScan(mismatch.body.scanId)[0].price_verify_check, 'mismatch');

  // `scanId`, the call's own elapsed `ms`, and `grounded.fetchedAt` are the only
  // fields two independent calls could ever legitimately differ on; strip those
  // three and the two shown answers must be byte-identical JSON, even though one
  // row now reads 'agree' and the other 'mismatch'.
  const strip = (b: any) => {
    const clone = { ...b, grounded: { ...b.grounded, fetchedAt: null } };
    delete clone.scanId;
    delete clone.ms;
    return JSON.stringify(clone);
  };
  assert.equal(strip(agree.body), strip(mismatch.body), 'the verifier\'s outcome leaked into the shown answer');
});

test('an offer cited but off the allowlist is marked not_verifiable, and never fetched', async () => {
  install(() => ({ text: bodyWithCitations(answerWithOneOffer(DISALLOWED_URL, 4.99), [DISALLOWED_URL]) }));
  let calls = 0;
  setVerifierTransportForTests(async () => {
    calls += 1;
    throw new Error('the allowlist should have stopped this fetch before it started');
  });
  const { body } = await identify('gtin=0068100084245&deviceId=verify-off-allowlist');
  await settleBackgroundChecks();
  assert.equal(calls, 0, 'a host off the allowlist was fetched');
  const row = geminiCallsForScan(body.scanId)[0];
  assert.equal(row.price_verify_check, 'not_verifiable');
  assert.equal(row.price_verify_page_cents, null);
});

test('a fetch that fails is recorded as unavailable, and the scan still answers', async () => {
  install(() => ({ text: bodyWithCitations(answerWithOneOffer(ALLOWED_URL, 4.99), [ALLOWED_URL]) }));
  setVerifierTransportForTests(async () => {
    throw new Error('network is down');
  });
  const { status, body } = await identify('gtin=0068100084245&deviceId=verify-fetch-fails');
  assert.equal(status, 200, 'a failing verifier fetch must never fail the scan itself');
  await settleBackgroundChecks();
  const row = geminiCallsForScan(body.scanId)[0];
  assert.equal(row.price_verify_check, 'unavailable');
  assert.match(String(row.price_verify_reason), /network is down/);
});
