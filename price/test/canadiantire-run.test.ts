/**
 * Item 17 of the beta build plan: Canadian Tire at scale.
 *
 * NOTHING HERE OPENS THE NETWORK. The runner takes its adapter as an argument
 * and every test passes one made of canned answers, so the loop, the join rule
 * and the attempt logging are all provable without a request to
 * canadiantire.ca and without the 4 GB catalogue.
 *
 * What these tests are actually about is the attempt table. A crawl whose only
 * record is the rows it managed to write reports its successes and forgets its
 * failures, and the coverage figure the whole seller decision rests on is then
 * measured against a denominator nobody kept. So every outcome below is asserted
 * on the row in `crawl_attempt`, not on the return value alone.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPrices, coverage, nameRejoinable } from '../src/store.ts';
import {
  CANADIAN_TIRE,
  DELAY_MS,
  parseArgs,
  priceOne,
  run,
  searchTextFor,
  type Adapter,
  type CatalogueReader,
  type Target,
} from '../src/canadiantire-run.ts';
import { NAME_FLOOR, scoreCandidate } from '../src/name-match.ts';
import type { Candidate, ProductDetail } from '../src/canadiantire.ts';
import { Throttled } from '../src/canadiantire.ts';

const TODAY = '2026-09-11';

let db: DatabaseSync;

beforeEach(() => {
  db = openPrices(':memory:');
});

const TARGET: Target = { code: '0885909950805', name: 'Duracell Coppertop AA 24 Pack', brand: 'Duracell' };

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    sku: '3996591P',
    name: 'Duracell Coppertop AA Alkaline Batteries, 24-pk',
    brand: 'Duracell',
    priceCents: 2499,
    url: 'https://www.canadiantire.ca/en/pdp/3996591P.html',
    imageUrl: null,
    rating: null,
    reviews: null,
    ...over,
  };
}

function detail(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    sku: '3996591P',
    name: 'Duracell Coppertop AA Alkaline Batteries, 24-pk',
    brand: 'Duracell',
    upc: null,
    priceCents: 2499,
    wasPriceCents: null,
    unitPriceCents: null,
    unitLabel: null,
    inStock: true,
    imageUrl: null,
    url: 'https://www.canadiantire.ca/en/pdp/3996591P.html',
    ...over,
  };
}

function adapterOf(
  searchResult: readonly Candidate[] | Error,
  detailResult: ProductDetail | null | Error = detail(),
): Adapter & { searched: string[] } {
  const searched: string[] = [];
  return {
    searched,
    async search(q: string) {
      searched.push(q);
      if (searchResult instanceof Error) throw searchResult;
      return searchResult;
    },
    async detail() {
      if (detailResult instanceof Error) throw detailResult;
      return detailResult;
    },
  };
}

/* Rows come back from node:sqlite with a null prototype, which a strict deep
   equality refuses to match against an object literal. Copied into plain objects
   here so a failure reads as the value that is wrong rather than as a prototype. */
function attempts(): { code: string; outcome: string; candidates: number; note: string | null }[] {
  const rows = db
    .prepare('SELECT code, outcome, candidates, note FROM crawl_attempt WHERE seller = ? ORDER BY code')
    .all(CANADIAN_TIRE) as never as { code: string; outcome: string; candidates: number; note: string | null }[];
  return rows.map((r) => ({ code: r.code, outcome: r.outcome, candidates: r.candidates, note: r.note }));
}

function observations(): { code: string | null; seller_sku: string; price_cents: number; join_method: string }[] {
  const rows = db
    .prepare('SELECT code, seller_sku, price_cents, join_method FROM observation ORDER BY seller_sku')
    .all() as never as { code: string | null; seller_sku: string; price_cents: number; join_method: string }[];
  return rows.map((r) => ({
    code: r.code,
    seller_sku: r.seller_sku,
    price_cents: r.price_cents,
    join_method: r.join_method,
  }));
}

/** A catalogue stand-in, so the loop can be driven without the real 4 GB file. */
function catalogueOf(targets: Target[]): CatalogueReader {
  return {
    available: true,
    targets: (q) => targets.slice(q.offset, q.limit === null ? undefined : q.offset + q.limit),
    count: () => targets.length,
    close: () => {},
  };
}

test('a listing that matches by brand and name is stored as a name join, never as a barcode match', async () => {
  const a = adapterOf([candidate()]);
  const r = await priceOne(db, TARGET, a, TODAY);

  assert.equal(r.outcome, 'named', 'this seller publishes no barcode, so `matched` would be a lie');
  assert.equal(r.priceCents, 2499);
  assert.deepEqual(observations(), [
    { code: TARGET.code, seller_sku: '3996591P', price_cents: 2499, join_method: 'name' },
  ]);
  assert.deepEqual(a.searched, [searchTextFor(TARGET)]);
});

test('a sale price keeps the everyday price beside it under its own key', async () => {
  await priceOne(db, TARGET, adapterOf([candidate()], detail({ priceCents: 1999, wasPriceCents: 2499 })), TODAY);
  assert.deepEqual(observations(), [
    { code: TARGET.code, seller_sku: '3996591P', price_cents: 1999, join_method: 'name' },
    { code: TARGET.code, seller_sku: '3996591P#was', price_cents: 2499, join_method: 'name' },
  ]);
});

test('a different brand with the same words is not this product', async () => {
  // The case the brand guard exists for. "Energizer AA 24 pack" shares almost
  // every word with the target and is a different thing on the shelf.
  const wrong = candidate({ name: 'Energizer Max AA Alkaline Batteries, 24-pk', brand: 'Energizer' });
  const r = await priceOne(db, TARGET, adapterOf([wrong]), TODAY);

  assert.equal(r.outcome, 'no_name_match');
  assert.equal(observations().length, 0, 'a wrong-brand listing was stored against this product');
});

test('a miss where the seller had nothing is a different row from a miss where it had the wrong thing', async () => {
  // Two misses, two outcomes, and the difference is the point: one says Canadian
  // Tire does not stock this and the other says it stocks something we could not
  // confirm is this. Collapsing them would make the second look like the first
  // and understate what a better matcher could still reach.
  await run(db, catalogueOf([TARGET]), adapterOf([]), { delayMs: 0 }, TODAY);
  assert.deepEqual(
    attempts().map((a) => [a.outcome, a.candidates]),
    [['no_candidates', 0]],
  );

  db.exec('DELETE FROM crawl_attempt');
  const wrong = candidate({ brand: 'Energizer', name: 'Energizer Max AA, 24-pk' });
  await run(db, catalogueOf([TARGET]), adapterOf([wrong]), { delayMs: 0 }, TODAY);
  const [miss] = attempts();
  assert.equal(miss.outcome, 'no_name_match');
  assert.equal(miss.candidates, 1, 'the listing count is on the row, so a miss says how close it came');
  assert.match(miss.note ?? '', new RegExp(String(NAME_FLOOR)));
});

test('a throttle is not a zero, and it is not written as one', async () => {
  const r = await priceOne(db, TARGET, adapterOf(new Throttled(429)), TODAY);
  assert.equal(r.outcome, 'throttled');

  await run(db, catalogueOf([TARGET]), adapterOf(new Throttled(429)), { delayMs: 0 }, TODAY);
  const c = coverage(db, CANADIAN_TIRE);
  assert.equal(c.throttled, 1);
  assert.equal(c.attempted, 0, 'a refusal to answer landed in the denominator of a coverage figure');
});

test('every attempt is written down, including the ones that found nothing', async () => {
  const targets: Target[] = [
    TARGET,
    { code: '2', name: 'Nothing Here 500ml', brand: 'Nobody' },
    { code: '3', name: 'Duracell Coppertop AAA 12 Pack', brand: 'Duracell' },
  ];
  const adapter: Adapter = {
    async search(q: string) {
      if (q.includes('Nobody')) return [];
      if (q.includes('AAA')) return [candidate({ name: 'Energizer AAA', brand: 'Energizer' })];
      return [candidate()];
    },
    async detail() {
      return detail();
    },
  };

  const t = await run(db, catalogueOf(targets), adapter, { delayMs: 0 }, TODAY);
  assert.equal(t.asked, 3);
  assert.deepEqual(
    attempts().map((a) => [a.code, a.outcome]),
    [
      [TARGET.code, 'named'],
      ['2', 'no_candidates'],
      ['3', 'no_name_match'],
    ],
  );

  const c = coverage(db, CANADIAN_TIRE);
  assert.deepEqual(
    [c.attempted, c.named, c.noCandidates, c.noNameMatch],
    [3, 1, 1, 1],
    'the coverage figure has to count the misses or it is measured against nothing',
  );
});

test('a resumed run skips what was answered and goes back for what was not', async () => {
  const targets: Target[] = [TARGET, { code: '2', name: 'Duracell Coppertop AA 24 Pack', brand: 'Duracell' }];
  await run(db, catalogueOf(targets), adapterOf([candidate()]), { delayMs: 0, limit: 1 }, TODAY);

  // The second pass sees one answered code and one it has never asked about.
  const second = await run(db, catalogueOf(targets), adapterOf([candidate()]), { delayMs: 0, resume: true }, TODAY);
  assert.equal(second.skipped, 1);
  assert.equal(second.asked, 1);
});

test('a dry run opens nothing at all', async () => {
  const a = adapterOf([candidate()]);
  const t = await run(db, catalogueOf([TARGET]), a, { dryRun: true, delayMs: 0 }, TODAY);
  assert.equal(t.asked, 1);
  assert.deepEqual(a.searched, [], 'a dry run asked the seller a question');
  assert.equal(attempts().length, 0, 'a dry run wrote an attempt row it never attempted');
});

test('an unjoined listing is kept, with no barcode, which is what the nightly name rejoin walks', async () => {
  // The join gate refuses when the catalogue code and the listing disagree. The
  // price is still a real number a seller published, so it is stored unjoined
  // rather than thrown away, exactly as the Walmart discovery leg does.
  const r = await priceOne(
    db,
    { code: '0885909950805', name: 'Duracell Coppertop AA 24 Pack', brand: 'Duracell' },
    adapterOf([candidate()], detail({ priceCents: 2499 })),
    TODAY,
  );
  assert.equal(r.outcome, 'named');

  // And a row the gate did refuse: no brand on the catalogue side at all.
  const noBrand: Target = { code: '999', name: 'Coppertop AA 24 Pack', brand: null };
  const r2 = await priceOne(db, noBrand, adapterOf([candidate({ sku: 'X1' })], detail({ sku: 'X1' })), TODAY);
  assert.equal(r2.outcome, 'no_name_match');
  assert.equal(nameRejoinable(db, CANADIAN_TIRE).length, 0, 'nothing was stored, because nothing was fetched');
});

test('the delay floor is a decision, so a lower one is refused instead of clamped', () => {
  assert.equal(parseArgs([]).delayMs, DELAY_MS);
  assert.equal(parseArgs(['--delay-ms', '9000']).delayMs, 9000);
  assert.throws(() => parseArgs(['--delay-ms', '200']), /floor/);
});

test('the flags a run is started with read the way the header says they do', () => {
  const o = parseArgs(['--limit', '50', '--offset', '10', '--resume', '--dry-run', '--leaf-like', 'en:laptops%']);
  assert.equal(o.limit, 50);
  assert.equal(o.offset, 10);
  assert.equal(o.resume, true);
  assert.equal(o.dryRun, true);
  assert.equal(o.leafLike, 'en:laptops%');
  assert.deepEqual(o.sources, ['icecat']);
  assert.deepEqual(parseArgs(['--sources', 'icecat,openproductsfacts']).sources, ['icecat', 'openproductsfacts']);
});

test('the name rule agrees with the spine"s, because two opinions about a name match is one too many', () => {
  // `price/src/name-match.ts` is a copy of the spine's token overlap, kept here
  // so this package does not depend on the spine. These are the cases that would
  // show the two drifting apart.
  const p = { code: 'c', name: 'POANG armchair', brand: 'IKEA' };
  assert.equal(scoreCandidate(p, { name: 'IKEA POANG Armchair, birch veneer', brand: 'IKEA' }), 1);
  assert.equal(
    scoreCandidate(p, { name: 'IKEA POANG armchair', brand: null }),
    1,
    'the brand may live in the title instead of the brand field',
  );
  assert.equal(
    scoreCandidate(p, { name: 'POANG armchair', brand: null }),
    0,
    'a listing that names no brand anywhere is not evidence about a branded product',
  );
  assert.equal(scoreCandidate(p, { name: 'Some armchair', brand: 'IKEA' }), 0.5);
  assert.ok(scoreCandidate(p, { name: 'Some armchair', brand: 'IKEA' }) >= NAME_FLOOR);
  assert.equal(scoreCandidate(p, { name: 'POANG armchair', brand: 'Wayfair' }), 0, 'no IKEA anywhere is not IKEA');
  assert.equal(
    scoreCandidate({ code: 'c', name: 'Cereales', brand: 'Kellogg' }, { name: 'Kellogg Céréales', brand: null }),
    1,
    'the accent is folded, the way every other matcher in this tree folds it',
  );
});
