/**
 * The existing answer kinds, rendered from fixed fixtures, for
 * answer-snapshot.test.mjs. Kept in a helper module (not a *.test.* file) so the
 * snapshot in snapshots/answer-sheets.json can be regenerated from any copy of
 * camera.js by importing this and calling `renderAll(cameraModule)`.
 *
 * Fixed inputs only: no clock-relative time on any fixture (the Gemini answer's
 * `fetchedAt` is null, so no "checked N minutes ago"), English, no market set.
 */

export const FIXED_NOW = Date.parse('2026-09-27T12:00:00.000Z');

const verdict = (band = 'high', tier = 'walk_away') => ({
  kind: 'verdict',
  tier,
  askingCents: 499,
  category: 'grocery',
  identity: { id: 'demo-1', label: 'Test item 500 g' },
  spread: { lowCents: 299, highCents: 429, medianCents: 349 },
  pointCount: 3,
  comparisonSet: [
    { seller: 'Walmart', amountCents: 299, observedAt: '2026-08-01', kind: 'shelf' },
    { seller: 'Loblaws', amountCents: 389, observedAt: '2026-08-02', kind: 'shelf' },
    { seller: 'Metro', amountCents: 429, observedAt: '2026-08-03', kind: 'shelf' },
  ],
  confidence: { band, distinctSellers: 3, because: 'Three sellers agreed within a dollar.' },
  disagreement: { detail: 'One seller sits well above the rest. The other two agree closely.' },
  lines: ['Pexi used three shelf prices from the last week.'],
});

const gemini = (zone, low = false) => ({
  kind: 'gemini',
  scanId: 41,
  lowConfidence: low,
  confidenceReasons: low ? ['thin_offers'] : [],
  failure: null,
  grounded: {
    kind: 'grounded',
    forDevice: 'dev-1',
    fetchedAt: null,
    block: {
      kind: 'prices',
      checked: false,
      name: 'Citrus Soda',
      offers: [{ retailer: 'Northfield Grocers', price: '4.49', url: 'https://northfield.example.ca/p/1', hasLink: true }],
      reviews: [],
      facts: [],
      verdict: zone === null ? null : {
        median: 4.5, n: 3, unitLabel: '100 mL', span: 40, zoneUnderBoundary: 37.5, zoneOverBoundary: 62.5,
        ticks: [], points: [], excluded: [], shelf: { position: 72, zone, pct: 18 },
        shelfLabel: '6 x 355 mL, 4.49', sizeAssumed: false, confidence: 'ok', shortfalls: [],
      },
      lowConfidence: low,
      confidenceReasons: low ? ['thin_offers'] : [],
    },
    suggestionsHtml: '',
  },
});

const refusal = (reason) => ({ kind: 'refusal', reason, detail: 'Something specific and true happened here.', identity: null, evidence: [] });
const ITEM = { text: 'citrus soda', category: 'groceries' };
const scenario = { text: 'Test item 500 g', category: 'grocery', observed: true };

/** name -> markup, for every existing answer kind the camera draws after a scan. */
export function renderAll(cam) {
  return {
    'gemini, over your line': cam.geminiSheet(gemini('over_your_line'), ITEM, null),
    'gemini, under your line, low confidence': cam.geminiSheet(gemini('under_your_line', true), ITEM, null),
    'gemini, no zone': cam.geminiSheet(gemini(null), ITEM, null),
    'gemini, failed': cam.geminiFailureSheet({ kind: 'gemini', failure: 'model_outage' }, ITEM),
    'verdict, certain': cam.verdictSheet(verdict('high'), scenario, null),
    'verdict, thin': cam.verdictSheet(verdict('low', 'good'), scenario, null),
    'refusal, no_identity': cam.refusalSheet(refusal('no_identity'), scenario, ['Groceries']),
    'refusal, identity_unsure': cam.refusalSheet(refusal('identity_unsure'), scenario, ['Groceries']),
    'needs connection': cam.needsConnectionSheet(),
    'type-it route': cam.textRouteSheet(),
  };
}
