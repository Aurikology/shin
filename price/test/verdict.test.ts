/**
 * Tests for the four things the price stage must refuse to do.
 *
 * A verdict from one seller, an average anywhere, a sale price folded into the
 * regular range, and a number on screen without its age. Each of those is one
 * short edit away at any time, and each of them makes the product confidently
 * wrong rather than visibly incomplete.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, ageInWords, money, type Observation } from '../src/verdict.ts';

const NOW = new Date('2026-09-04T12:00:00Z');

function o(
  seller: string,
  amountCents: number,
  over: Partial<Observation> = {},
): Observation {
  return {
    seller,
    amountCents,
    kind: 'regular',
    observedAt: '2026-09-03',
    preTax: true,
    ...over,
  };
}

test('one seller gets a going rate and no verdict', () => {
  const v = judge({ shelfCents: 500, observations: [o('Loblaws', 480)], now: NOW });
  assert.equal(v.tier, null);
  assert.match(v.withheldBecause ?? '', /only 1 seller/);
  assert.match(v.line, /Not enough to say/);
});

test('two sellers is enough for a verdict', () => {
  const v = judge({
    shelfCents: 480,
    observations: [o('Loblaws', 470), o('Metro', 620)],
    now: NOW,
  });
  assert.equal(v.tier, 'good');
});

test('no average appears anywhere in the sentence', () => {
  const v = judge({
    shelfCents: 600,
    observations: [o('A', 400), o('B', 500), o('C', 900)],
    now: NOW,
  });
  // The mean of 400, 500 and 900 is 600. If an average leaked in, that number
  // would be presented as what others charge, and no seller charges it.
  assert.ok(!/average|avg|mean|typical price/i.test(v.line), v.line);
  assert.match(v.line, /\$4\.00/);
  assert.match(v.line, /\$9\.00/);
});

test('a sale price never moves the regular range', () => {
  const withoutSale = judge({
    shelfCents: 600,
    observations: [o('A', 500), o('B', 700)],
    now: NOW,
  });
  const withSale = judge({
    shelfCents: 600,
    observations: [o('A', 500), o('B', 700), o('C', 200, { kind: 'promotional' })],
    now: NOW,
  });
  assert.equal(withSale.regular?.cheapestCents, withoutSale.regular?.cheapestCents);
  assert.equal(withSale.tier, withoutSale.tier);
  assert.equal(withSale.promotional?.cheapestCents, 200);
  assert.match(withSale.line, /on sale/);
});

test('a promotional only product still gets its going rate named', () => {
  const v = judge({
    shelfCents: 500,
    observations: [o('A', 300, { kind: 'promotional' })],
    now: NOW,
  });
  assert.equal(v.tier, null);
  assert.match(v.line, /on sale/);
  assert.match(v.withheldBecause ?? '', /no regular price/);
});

test('a post tax number is dropped, not corrected', () => {
  const v = judge({
    shelfCents: 500,
    observations: [o('A', 480), o('B', 900, { preTax: false })],
    now: NOW,
  });
  assert.equal(v.regular?.sellerCount, 1);
  assert.equal(v.tier, null);
});

test('one seller listing a product three times is still one seller', () => {
  const v = judge({
    shelfCents: 500,
    observations: [o('Walmart', 480), o('Walmart', 520), o('Walmart', 610)],
    now: NOW,
  });
  assert.equal(v.regular?.sellerCount, 1);
  assert.equal(v.tier, null);
});

test('the age shown is the oldest contributing number, in words', () => {
  const v = judge({
    shelfCents: 500,
    observations: [
      o('A', 480, { observedAt: '2026-09-04' }),
      o('B', 700, { observedAt: '2026-08-28' }),
    ],
    now: NOW,
  });
  assert.equal(v.oldestObservedAt, '2026-08-28');
  assert.equal(v.ageInWords, 'seen last week');
});

test('an old number is described as old rather than dated', () => {
  assert.equal(ageInWords('2026-09-04', NOW), 'seen today');
  assert.equal(ageInWords('2026-09-03', NOW), 'seen yesterday');
  assert.equal(ageInWords('2026-09-01', NOW), 'seen 3 days ago');
  assert.equal(ageInWords('2026-08-01', NOW), 'over three weeks old');
  assert.equal(ageInWords('2026-01-01', NOW), 'months old');
});

test('the high end and the low end are both reachable', () => {
  const obs = [o('A', 400), o('B', 1000)];
  assert.equal(judge({ shelfCents: 420, observations: obs, now: NOW }).tier, 'good');
  assert.equal(judge({ shelfCents: 700, observations: obs, now: NOW }).tier, 'fair');
  assert.equal(judge({ shelfCents: 980, observations: obs, now: NOW }).tier, 'high');
});

test('every seller charging the same is not a high price', () => {
  const v = judge({
    shelfCents: 500,
    observations: [o('A', 500), o('B', 500)],
    now: NOW,
  });
  assert.equal(v.tier, 'good');
  assert.match(v.line, /too\./);
});

test('unit price is shown whenever both sizes are known', () => {
  const v = judge({
    shelfCents: 800,
    observations: [o('A', 700), o('B', 1100)],
    sizeValue: 500,
    sizeUnit: 'g',
    now: NOW,
  });
  assert.equal(v.regular?.unitCents, 160);
  assert.match(v.line, /\$1\.60 per 100 g/);
});

test('no shelf price means a range and no tier, and it says why', () => {
  const v = judge({
    shelfCents: null,
    observations: [o('A', 400), o('B', 900)],
    now: NOW,
  });
  assert.equal(v.tier, null);
  assert.match(v.withheldBecause ?? '', /shelf tag/);
  assert.match(v.line, /from \$4\.00 at A to \$9\.00 at B/);
});

test('nothing at all is said plainly and is not our fault', () => {
  const v = judge({ shelfCents: 500, observations: [], now: NOW });
  assert.equal(v.tier, null);
  assert.equal(v.ageInWords, null);
  assert.match(v.line, /Nobody we can see/);
});

test('money never rounds a price away', () => {
  assert.equal(money(1), '$0.01');
  assert.equal(money(1999), '$19.99');
});
