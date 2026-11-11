/**
 * The server the crawler's fake browser talks to: a route table with a normal answer for every
 * route the real server has, plus a fault plan that makes some answers fail.
 *
 * WHAT "A ROUTE THE SERVER DOES NOT HAVE" MEANS. The list of real routes is read out of
 * app/server.ts at start-up (every `url.pathname === '/api/...'`), so it cannot drift from the
 * server. A request to a path in that list that this table forgot to answer is the crawler's own
 * gap (reported as a warning, never a failure). A request to a path NOT in that list is the app
 * calling something that does not exist, and that is a failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { identifyRoute, status, verdictAt, CODE, KD } from '../../../app/test/ux/ux-b5-harness.test.mjs';
import { streamFor, hash32 } from './rng.mjs';
import { KNOWN_CODES } from './data.mjs';

const SERVER_TS = fileURLToPath(new URL('../../../app/server.ts', import.meta.url));

let cachedPaths = null;
/** Every path the real server answers, read from its source. */
export function realServerPaths() {
  if (cachedPaths) return cachedPaths;
  const src = readFileSync(SERVER_TS, 'utf8');
  const exact = new Set();
  for (const m of src.matchAll(/url\.pathname === '(\/[^']+)'/g)) exact.add(m[1]);
  cachedPaths = { exact, patterns: [/^\/api\/scan\/\d+\/outcome$/] };
  return cachedPaths;
}

/** Whether the real server has this path. Non-API paths are static files and always exist. */
export function serverHasPath(path) {
  if (!path.startsWith('/api/')) return true;
  const { exact, patterns } = realServerPaths();
  return exact.has(path) || patterns.some((p) => p.test(path));
}

const KD2 = { name: 'Kraft Dinner Spirals', brand: 'Kraft', size: '200 g', barcode: KNOWN_CODES[1], category: { tag: 'en:pasta', name: 'Pasta' } };
const IDENTITIES = new Map([[KD.barcode, KD], [KD2.barcode, KD2]]);

const SEARCH_ROWS = [
  { code: CODE, name: 'Kraft Dinner Original', brands: 'Kraft', quantity: '225 g' },
  { code: KD2.barcode, name: 'Kraft Dinner Spirals', brands: 'Kraft', quantity: '200 g' },
  { code: '0068100084247', name: 'Kraft Dinner Cheesy', brands: 'Kraft', quantity: '175 g' },
];

/** The not-in-catalogue answer, field for field what the server's emptyAnswer sends. */
const missAnswer = (barcode) => ({
  kind: 'catalogue', outcome: 'not_in_catalogue', offerManualEntry: true, catalogueUp: true, barcode,
  identity: null, range: null, rangeSource: null, rangeAskedAt: null, noRangeReason: null, shelfPrice: null,
  verdict: null, storeIdentity: null, scanId: 42,
});

/** The catalogue answer: a known code or a typed name gets a verdict; anything else is a miss. */
function identifyAnswer() {
  const hit = identifyRoute({ identity: KD });
  const hit2 = identifyRoute({ identity: KD2 });
  return async (call) => {
    const gtin = call.query.gtin;
    if (gtin && IDENTITIES.has(gtin)) return gtin === KD2.barcode ? hit2(call) : hit(call);
    if (!gtin && String(call.query.text ?? '').trim().length >= 3) return hit(call);
    return missAnswer(gtin ?? '');
  };
}

/**
 * The price route answers in several shapes, and each shape draws a different sheet (a grounded price
 * block, a verdict, a refusal, the chart). One answer for every call would leave all but one of those
 * sheets unreachable. The shapes are the ones the app's own fixtures use (test/answer-snapshot-fixtures.mjs);
 * which one a call gets depends only on that call's own text, so a replay gets the same answer.
 */
const geminiAnswer = (zone, low = false) => ({
  kind: 'gemini', scanId: 41, lowConfidence: low, confidenceReasons: low ? ['thin_offers'] : [], failure: null,
  grounded: {
    kind: 'grounded', forDevice: 'crawler', fetchedAt: null,
    block: {
      kind: 'prices', checked: false, name: 'Citrus Soda',
      offers: [{ retailer: 'Northfield Grocers', price: '4.49', url: 'https://northfield.example.ca/p/1', hasLink: true }],
      reviews: [], facts: [],
      verdict: zone === null ? null : {
        median: 4.5, n: 3, unitLabel: '100 mL', span: 40, zoneUnderBoundary: 37.5, zoneOverBoundary: 62.5,
        ticks: [], points: [], excluded: [], shelf: { position: 72, zone, pct: 18 },
        shelfLabel: '6 x 355 mL, 4.49', sizeAssumed: false, confidence: 'ok', shortfalls: [],
      },
      lowConfidence: low, confidenceReasons: low ? ['thin_offers'] : [],
    },
    suggestionsHtml: '',
  },
});
const verdictAnswer = (band, tier) => ({
  kind: 'verdict', tier, askingCents: 499, category: 'grocery', identity: { id: 'demo-1', label: 'Test item 500 g' },
  spread: { lowCents: 299, highCents: 429, medianCents: 349 }, pointCount: 3,
  comparisonSet: [
    { seller: 'Walmart', amountCents: 299, observedAt: '2026-08-01', kind: 'regular' },
    { seller: 'Loblaws', amountCents: 389, observedAt: '2026-08-02', kind: 'regular' },
    { seller: 'Metro', amountCents: 429, observedAt: '2026-08-03', kind: 'regular' },
  ],
  confidence: { band, distinctSellers: 3, because: 'Three sellers agreed within a dollar.' },
  disagreement: { detail: 'One seller sits well above the rest. The other two agree closely.' },
  lines: ['Pexi used three shelf prices from the last week.'],
});
const refusalAnswer = (reason) => ({ kind: 'refusal', reason, detail: 'Something specific and true happened here.', identity: null, evidence: [] });

function priceAnswer() {
  const variants = [
    () => geminiAnswer('over_your_line'),
    () => geminiAnswer('under_your_line', true),
    () => geminiAnswer(null),
    () => ({ kind: 'gemini', failure: 'model_outage' }),
    () => verdictAnswer('high', 'walk_away'),
    () => verdictAnswer('low', 'good'),
    () => refusalAnswer('no_identity'),
    () => refusalAnswer('identity_unsure'),
    () => ({ kind: 'refusal', reason: 'no_asking_price', detail: 'No price was given.', identity: null, evidence: [] }),
    () => ({ ownData: true, found: false, kind: 'text_match' }),
    () => ({ kind: 'gemini', reason: 'nothing_to_price', lowConfidence: true, confidenceReasons: ['no_query'] }),
  ];
  return async (call) => {
    const asked = JSON.stringify({ q: call.query, b: call.body });
    const pick = hash32(asked.replace(/"(deviceId|appVersion)":"[^"]*"/g, '')) % (variants.length + 1);
    // One call in twelve is the drawable chart verdict the catalogue route also returns.
    if (pick === variants.length) return { kind: 'verdict_chart', verdict: await verdictAt(Number(call.body?.askingCents ?? call.query?.askingCents ?? 499) || 499) };
    return variants[pick]();
  };
}

/** Normal answers for every real route. Shapes follow what server.ts sends and what api.js reads. */
export function normalRoutes() {
  return {
    '/api/identify': identifyAnswer(),
    '/api/identify/pack': (call) => identifyAnswer()({ ...call, query: { gtin: call.body?.gtin ?? '', ...(call.query ?? {}) } }),
    '/api/identify/photo': { kind: 'catalogue', outcome: 'not_in_catalogue', offerManualEntry: true, catalogueUp: true, barcode: '', identity: null, range: null, verdict: null, scanId: 43 },
    '/api/identify/demo': { items: [] },
    '/api/match-text': { kind: 'text_match', candidates: [], shelfPrice: null },
    '/api/search': (call) => ({ candidates: String(call.query.q ?? '').trim().length >= 3 ? SEARCH_ROWS : [] }),
    '/api/price': priceAnswer(),
    '/api/scans': { thisDevice: { deviceId: 'crawler', scansThisWeek: 2, named: 2 }, rated: { up: 0, down: 0 } },
    '/api/scan-rating': { stored: true },
    '/api/scan-rating/delete': { stored: true },
    '/api/scan/*': { stored: true },
    '/api/scan-price': { stored: true },
    '/api/scan-call': { stored: true },
    '/api/scan-pick': { stored: true },
    '/api/correction': { stored: true },
    '/api/consent': { photos: false, location: false, updatedAt: null },
    '/api/event': { stored: true },
    '/api/events/batch': { stored: true },
    '/api/stores': { stores: ['Loblaws', 'No Frills', 'Metro'].map((name, i) => ({ id: `node/${i + 1}`, name, hint: `${i + 1} km` })) },
    '/api/store-chains': { chains: [] },
    '/api/catalogue': { items: [] },
    '/api/categories': [],
    '/api/scenarios': { items: [] },
    '/api/quota': { used: 1, limit: 10, remaining: 9, resetsAt: null },
    '/api/attribution': { sources: [{ name: 'Open Food Facts', licence: 'ODbL', url: 'https://world.openfoodfacts.org' }] },
    '/api/health': { ok: true },
    '/api/latency': { days: 7, latency: [] },
    '/api/pack-version': { scope: 'grocery', version: 1 },
    '/api/pack': { items: [] },
    '/api/shutter/frame': { stored: true },
    '/api/shelf/frame': { stored: true },
  };
}

/** Paths a fault may be aimed at (the ones whose failure a shopper can see), plus null for "any". */
const FAULT_TARGETS = ['/api/identify', '/api/search', '/api/price', '/api/stores', '/api/quota', '/api/consent', '/api/correction', '/api/scans', '/api/identify/pack'];
export const FAULT_KINDS = ['500', 'delay', 'malformed', 'network'];
/** The delay a "5 s delay" fault stands for, in the app's own clock (the crawler warps timers by `warp`). */
export const DELAY_MS = 5000;

/** Pick the faults for a run: 0 to 2 of them, each aimed at one path or at every path. */
export function planFaults(rng) {
  if (rng.chance(0.4)) return [];
  const n = rng.chance(0.3) ? 2 : 1;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      kind: rng.pick(FAULT_KINDS),
      path: rng.chance(0.25) ? null : rng.pick(FAULT_TARGETS),
      rate: rng.pick([0.3, 0.6, 1]),
    });
  }
  return out;
}

/**
 * Wrap a route table so the planned faults fire. Whether call N to a path fails depends on
 * (seed, path, N-th call to that path) and nothing else, so a replay with some steps removed still
 * fails the same calls where the same calls are made.
 *
 * `onFault` is told every fault that fires, so the observer knows a step ran under one.
 */
export function withFaults(table, { faults, seed, warp, onFault, sleep }) {
  const counts = new Map();
  const wrapped = {};
  for (const [key, handler] of Object.entries(table)) {
    wrapped[key] = async (call) => {
      const n = (counts.get(call.path) ?? 0) + 1;
      counts.set(call.path, n);
      for (let i = 0; i < faults.length; i += 1) {
        const f = faults[i];
        if (f.path !== null && f.path !== call.path) continue;
        if (!streamFor(seed, `fault:${i}:${call.path}:${n}`).chance(f.rate)) continue;
        onFault?.({ kind: f.kind, path: call.path });
        if (f.kind === '500') return status(500, { error: 'injected' });
        if (f.kind === 'network') throw new TypeError('Failed to fetch');
        if (f.kind === 'malformed') return { __raw: '{"ok": tru' };
        if (f.kind === 'delay') await sleep(DELAY_MS / warp);
      }
      return typeof handler === 'function' ? handler(call) : handler;
    };
  }
  return wrapped;
}
