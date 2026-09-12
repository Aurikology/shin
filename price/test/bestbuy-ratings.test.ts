/**
 * Item 27 of the beta build plan: Best Buy (US) ratings for tech.
 *
 * There is no API key on this machine and none was asked for. Every test here
 * runs against an in-memory database and a fetcher the test itself supplies; the
 * two that exercise the real fetcher replace `fetch` with a fixture and restore
 * it afterwards, so nothing in this file opens a socket. That is the point of
 * the seam: the storage, the staleness rule and the weekly pass are all provable
 * today, and the hour a key lands the only thing that changes is which fetcher
 * is passed in.
 *
 * The fixture bodies are shaped from the fields `spine/src/sources/bestbuy.ts`
 * already reads off this API plus the two review fields item 27 names. They have
 * not been checked against a live response, and the test named for that says so
 * rather than leaving it implied.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  BESTBUY_US,
  BESTBUY_US_LABEL,
  REFRESH_AFTER_DAYS,
  bestBuyFetcher,
  dueForRefresh,
  ensureRatings,
  isStale,
  putRating,
  ratingFor,
  ratingsAvailable,
  refreshDue,
  storedRating,
  type FetchedRating,
  type RatingFetcher,
  type RatingRow,
} from '../src/bestbuy-ratings.ts';

const XM5 = '0027242924833';
const TODAY = '2026-09-11';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  ensureRatings(db);
});

/** A fetcher that answers from a table and counts how often it was asked. */
function fetcherOver(answers: Record<string, FetchedRating | null>): RatingFetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (gtin: string) => {
    calls.push(gtin);
    return answers[gtin] ?? null;
  }) as RatingFetcher & { calls: string[] };
  f.calls = calls;
  return f;
}

const RATED: FetchedRating = { average: 4.7, count: 1832, url: 'https://www.bestbuy.com/site/6487445.p', outcome: 'rated' };

function row(over: Partial<RatingRow> = {}): RatingRow {
  return {
    code: XM5,
    source: BESTBUY_US,
    average: 4.7,
    count: 1832,
    url: 'https://www.bestbuy.com/site/6487445.p',
    outcome: 'rated',
    fetchedOn: TODAY,
    ...over,
  };
}

test('a barcode we have never asked about is fetched and stored with all four fields', async () => {
  const f = fetcherOver({ [XM5]: RATED });
  const r = await ratingFor(db, XM5, f, TODAY);

  assert.equal(r.status, 'refreshed');
  assert.equal(r.row?.average, 4.7);
  assert.equal(r.row?.count, 1832);
  assert.equal(r.row?.url, 'https://www.bestbuy.com/site/6487445.p');
  assert.equal(r.row?.fetchedOn, TODAY);

  // Stored, not just returned: the next process to open this database finds it.
  assert.deepEqual(storedRating(db, XM5), r.row);
});

test('a rating fetched today is not fetched again today', async () => {
  const f = fetcherOver({ [XM5]: RATED });
  await ratingFor(db, XM5, f, TODAY);
  const again = await ratingFor(db, XM5, f, TODAY);

  assert.equal(again.status, 'kept');
  assert.equal(f.calls.length, 1, 'the same product was asked about twice on one day');
});

test('a week later it is fetched again, and that week is the plan"s week', () => {
  const fresh = row({ fetchedOn: '2026-09-05' });
  assert.equal(isStale(fresh, '2026-09-11'), false, '6 days is inside the week');
  assert.equal(isStale(fresh, '2026-09-12'), true, `${REFRESH_AFTER_DAYS} days is the refresh`);
});

test('the weekly refresh actually re-asks, and writes the new number', async () => {
  putRating(db, row({ average: 4.7, count: 1832, fetchedOn: '2026-09-01' }));
  const f = fetcherOver({ [XM5]: { average: 4.5, count: 1900, url: null, outcome: 'rated' } });

  const r = await ratingFor(db, XM5, f, TODAY);
  assert.equal(r.status, 'refreshed');
  assert.equal(r.row?.average, 4.5);
  assert.equal(storedRating(db, XM5)?.count, 1900);
});

test('a product nobody has reviewed is stored as unrated, never as zero stars', async () => {
  // The whole reason the outcome is a word and not a number. An average of 0
  // and "nobody has said anything" look identical on a screen and mean opposite
  // things to the person reading it.
  const f = fetcherOver({ [XM5]: { average: null, count: 0, url: 'https://www.bestbuy.com/site/1.p', outcome: 'unrated' } });
  const r = await ratingFor(db, XM5, f, TODAY);
  assert.equal(r.row?.outcome, 'unrated');
  assert.equal(r.row?.average, null);
  assert.equal(r.row?.count, 0);
});

test('a barcode Best Buy does not carry is stored as not found, so it is not asked about daily', async () => {
  const f = fetcherOver({ [XM5]: { average: null, count: 0, url: null, outcome: 'not_found' } });
  await ratingFor(db, XM5, f, TODAY);
  const again = await ratingFor(db, XM5, f, TODAY);
  assert.equal(again.status, 'kept');
  assert.equal(again.row?.outcome, 'not_found');
  assert.equal(f.calls.length, 1);
});

test('a fetcher that cannot ask writes nothing and keeps what we already held', async () => {
  // An outage is not a fact about a product. Storing "not found" for a question
  // nobody managed to ask would make a bad afternoon permanent.
  putRating(db, row({ fetchedOn: '2026-08-01' }));
  const dead: RatingFetcher = async () => null;

  const r = await ratingFor(db, XM5, dead, TODAY);
  assert.equal(r.status, 'unreachable');
  assert.equal(r.row?.average, 4.7, 'the stale row is still the answer');
  assert.equal(storedRating(db, XM5)?.fetchedOn, '2026-08-01', 'the stored row was rewritten by an outage');
});

test('with no key at all, nothing is asked and nothing is stored', async () => {
  const can = ratingsAvailable({});
  assert.equal(can.ok, false);
  assert.match(can.reason ?? '', /BESTBUY_API_KEY/);

  const r = await ratingFor(db, XM5, bestBuyFetcher({}), TODAY);
  assert.equal(r.status, 'unreachable');
  assert.equal(storedRating(db, XM5), null);
});

test('the weekly pass walks only what is due, oldest first', async () => {
  putRating(db, row({ code: '1', fetchedOn: '2026-09-01' }));
  putRating(db, row({ code: '2', fetchedOn: '2026-08-20' }));
  putRating(db, row({ code: '3', fetchedOn: TODAY }));

  assert.deepEqual(
    dueForRefresh(db, TODAY).map((r) => r.code),
    ['2', '1'],
    'the freshest row was re-asked, or the order is not by age',
  );

  const f = fetcherOver({ '1': RATED, '2': RATED });
  const t = await refreshDue(db, f, TODAY, { delayMs: 0 });
  assert.deepEqual(t, { considered: 2, refreshed: 2, unreachable: 0 });
  assert.deepEqual(f.calls, ['2', '1']);
});

test('the label a screen has to show is one constant, not a string on each screen', () => {
  assert.equal(BESTBUY_US_LABEL, 'Best Buy (US)');
});

test('the real fetcher reads the published fields off a Best Buy shaped body', async () => {
  /*
   * FIXTURE, NOT A MEASUREMENT. No call to api.bestbuy.com has been made from
   * this repo, so this body is the shape the existing adapter already reads plus
   * the two review fields item 27 names. What this test proves is the parsing
   * and the field mapping, and what it cannot prove is that the live API spells
   * them this way. That check costs one call and belongs in the scoreboard the
   * hour a key exists.
   */
  const body = {
    products: [
      {
        sku: 6487445,
        customerReviewAverage: '4.7',
        customerReviewCount: 1832,
        url: 'https://www.bestbuy.com/site/6487445.p',
      },
    ],
  };
  const real = globalThis.fetch;
  let asked = '';
  globalThis.fetch = (async (url: string) => {
    asked = String(url);
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;

  try {
    const got = await bestBuyFetcher({ BESTBUY_API_KEY: 'k', BESTBUY_API_BASE: 'https://example.invalid/v1' })(XM5);
    assert.equal(got?.outcome, 'rated');
    assert.equal(got?.average, 4.7, 'the average arrives as a string and has to survive it');
    assert.equal(got?.count, 1832);
    assert.equal(got?.url, 'https://www.bestbuy.com/site/6487445.p');
    assert.match(asked, /\(upc=0027242924833\)/, 'the lookup is by barcode, which is item 27b');
  } finally {
    globalThis.fetch = real;
  }
});

test('an empty product list from the real fetcher is not found, and a broken one is unreachable', async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ products: [] }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const empty = await bestBuyFetcher({ BESTBUY_API_KEY: 'k', BESTBUY_API_BASE: 'https://example.invalid/v1' })(XM5);
    assert.equal(empty?.outcome, 'not_found');

    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const broken = await bestBuyFetcher({ BESTBUY_API_KEY: 'k', BESTBUY_API_BASE: 'https://example.invalid/v1' })(XM5);
    assert.equal(broken, null, 'a 500 is "could not ask", never "this product does not exist"');
  } finally {
    globalThis.fetch = real;
  }
});
