/**
 * Fixture `verdict` objects for the price verdict bell, one per case the
 * screen must draw, in the exact shape of docs/verdict-distribution-design-
 * 2026-09-30.md, "The response contract". Hand-built, not produced by
 * price/src/estimate.ts (another lane builds that): each fixture's numbers are
 * worked out below from the contract's own rules (p10/p90 = exp(mu -/+ 1.2816
 * sigmaLog)), so a test that draws one checks the drawing, not the estimator.
 *
 * Used by test/verdict-chart.test.mjs and by the 390 x 844 Playwright walk.
 */

const Z90 = 1.2815515655446004;
const p10 = (centre, s) => Math.round(Math.exp(Math.log(centre) - Z90 * s));
const p90 = (centre, s) => Math.round(Math.exp(Math.log(centre) + Z90 * s));

const THRESHOLDS = { greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false };

function base(over = {}) {
  const centreCents = over.centreCents ?? 599;
  const sigmaLog = over.sigmaLog ?? 0.18;
  return {
    kind: 'distribution',
    currency: 'CAD',
    centreCents,
    sigmaLog,
    p10Cents: p10(centreCents, sigmaLog),
    p90Cents: p90(centreCents, sigmaLog),
    basis: 'own_prices',
    spreadFrom: 'leaf_category',
    confidence: 'high',
    n: 4,
    perUnit: { label: 'per 100 g', centreCents: 60 },
    scaledTo: null,
    dots: [
      { cents: 549, store: 'Save-On-Foods', city: 'Victoria', seenOn: '2026-09-27', kind: 'regular', quantity: '1 kg' },
      { cents: 599, store: 'Walmart', city: 'Toronto', seenOn: '2026-09-25', kind: 'regular', quantity: '1 kg' },
      { cents: 649, store: 'Metro', city: 'Montreal', seenOn: '2026-09-20', kind: 'regular', quantity: '1 kg' },
      { cents: 679, store: 'Sobeys', city: 'Halifax', seenOn: '2026-09-18', kind: 'regular', quantity: '1 kg' },
    ],
    biggerPack: null,
    shopper: null,
    thresholds: THRESHOLDS,
    notes: [],
    ...over,
  };
}

/** Where a shelf price falls, by the contract's own rules, for fixtures that carry one. */
function shopper(cents, v, extra = {}) {
  const pct = ((cents - v.centreCents) / v.centreCents) * 100;
  const zone = pct <= -v.thresholds.greatPct ? 'great' : pct <= -v.thresholds.goodPct ? 'good' : pct >= v.thresholds.badPct ? 'bad' : 'reasonable';
  return { cents, zone, offByPct: Math.round(pct * 10) / 10, beyond: null, suspect: null, ...extra };
}

/** 1 and 14: own prices, high confidence, a shelf price in the good zone. */
export const GOOD = (() => {
  const v = base();
  return { ...v, shopper: shopper(469, v) };
})();

/** 33: the same item, a reasonable price. */
export const REASONABLE = (() => {
  const v = base();
  return { ...v, shopper: shopper(629, v) };
})();

/** 33: a bad price. */
export const BAD = (() => {
  const v = base();
  return { ...v, shopper: shopper(749, v) };
})();

/** Great: 30% or more under. */
export const GREAT = (() => {
  const v = base();
  return { ...v, shopper: shopper(399, v) };
})();

/** 23: no shelf price yet. The bell, no dot; a typed price drops the dot in. */
export const NO_PRICE = base();

/** 24: a likely typo (599 read as 59900): suspect, "Did you mean $5.99?", the chart still shows. */
export const SUSPECT = (() => {
  const v = base();
  return { ...v, shopper: shopper(59900, v, { beyond: 'high', suspect: { suggestCents: 599 } }) };
})();

/** 25: far outside, pinned at the edge with the multiple. */
export const BEYOND_HIGH = (() => {
  const v = base();
  return { ...v, shopper: shopper(1799, v, { beyond: 'high' }) };
})();

export const BEYOND_LOW = (() => {
  const v = base();
  return { ...v, shopper: shopper(119, v, { beyond: 'low' }) };
})();

/** 8 and 27: nothing matched, Claude's typical range, low confidence, wide, with notes. */
export const LOW_CONFIDENCE = (() => {
  const v = base({ centreCents: 1299, sigmaLog: 0.42, basis: 'claude_typical', spreadFrom: 'claude', confidence: 'low', n: 0, dots: [], perUnit: null, notes: ['claude_estimate', 'size_assumed'] });
  return { ...v, shopper: shopper(1599, v) };
})();

/** 14, 17, 18, 11: one own price blended, medium confidence, old and sale dots apart, a bigger pack. */
export const MEDIUM_SALE_BULK = (() => {
  const v = base({
    centreCents: 1149,
    sigmaLog: 0.22,
    basis: 'leaf_category',
    confidence: 'medium',
    n: 1,
    scaledTo: '750 ml',
    perUnit: { label: 'per 100 ml', centreCents: 153 },
    dots: [
      { cents: 1199, store: 'BC Liquor', city: 'Vancouver', seenOn: '2026-09-28', kind: 'regular', quantity: '750 ml' },
      { cents: 999, store: 'BC Liquor', city: 'Victoria', seenOn: '2026-09-21', kind: 'sale', quantity: '750 ml' },
      { cents: 1049, store: 'NB Liquor', city: 'Moncton', seenOn: '2025-08-02', kind: 'regular', quantity: '750 ml' },
    ],
    biggerPack: { quantity: '1.75 L', perUnitCents: 131, store: 'BC Liquor' },
    notes: ['old_prices', 'other_region', 'few_prices'],
  });
  return { ...v, shopper: shopper(1099, v) };
})();

/** 16: every store agreed, the spread at its floor. */
export const FLOOR = (() => {
  const v = base({ sigmaLog: 0.05, dots: [599, 599, 599].map((c, i) => ({ cents: c, store: ['A', 'B', 'C'][i], city: null, seenOn: '2026-09-29', kind: 'regular', quantity: '1 kg' })) });
  return { ...v, shopper: shopper(599, v) };
})();

/** 28: a better answer that arrives later (more prices, a tighter bell, centre moved). */
export const BETTER_LATER = (() => {
  const v = base({ centreCents: 569, sigmaLog: 0.11, n: 9, confidence: 'high' });
  return { ...v, shopper: shopper(469, v) };
})();

/** Twelve dots, the contract's cap, to crowd the labels. */
export const CROWDED = (() => {
  const dots = Array.from({ length: 14 }, (_, i) => ({ cents: 540 + i * 11, store: `Store ${i + 1}`, city: null, seenOn: '2026-09-20', kind: i % 4 === 3 ? 'sale' : 'regular', quantity: '1 kg' }));
  const v = base({ dots });
  return { ...v, shopper: shopper(560, v) };
})();

export const ALL = { GOOD, REASONABLE, BAD, GREAT, NO_PRICE, SUSPECT, BEYOND_HIGH, BEYOND_LOW, LOW_CONFIDENCE, MEDIUM_SALE_BULK, FLOOR, BETTER_LATER, CROWDED };
