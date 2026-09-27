/**
 * A recorded Gemini, for tests. Nothing here opens a socket and nothing needs a
 * key (Jamin's rule 8: the key is for live phone testing only).
 *
 * `fakeTransport` is what `setGeminiTransportForTests` and `runGeminiScan`
 * take. It records every request body it is handed, so a test can count calls
 * (one per scan) and read the exact prompt and the model id that went out.
 */
import type { GroundedTransport } from '../../identify/src/providers/gemini-grounded.ts';

export interface Offer {
  retailer: string;
  price: number;
  unit_price: number | null;
  in_median?: boolean;
  pct_vs_median?: number | null;
  position?: number | null;
}

/**
 * A full, self-consistent answer in the engine's schema. Unit prices 2, 3 and 4 give a median of 3; with the default 10/10 lines the span is 35, so the positions and zone boundaries below are exactly what the prompt's PRICE MATH gives. No shelf price, so `shelf` is null.
 */
export function goodAnswer(over: Record<string, unknown> = {}): Record<string, unknown> {
  const offers: Offer[] = [
    { retailer: 'Alpha Market', price: 2, unit_price: 2, pct_vs_median: -33.3333, position: 2.381 },
    { retailer: 'Beta Foods', price: 3, unit_price: 3, pct_vs_median: 0, position: 50 },
    { retailer: 'Gamma Grocer', price: 4, unit_price: 4, pct_vs_median: 33.3333, position: 97.619 },
  ];
  return {
    scan: { scan_type: 'barcode', barcode: '0068100084245', market: 'CA', currency: 'CAD' },
    product: {
      name: 'Kraft Dinner Original',
      brand: 'Kraft',
      model: null,
      variant: 'Original',
      size: '225 g',
      pack_count: 1,
      description: 'Boxed macaroni and cheese.',
      identification_confidence: 0.92,
      identification_evidence: ['barcode'],
      sources: { name: 'https://example.com/kd', brand: null, size: null },
    },
    condition: { classification: 'new', confidence: 0.9, evidence: [] },
    offers: offers.map((o) => ({
      retailer: o.retailer,
      price: o.price,
      currency: 'CAD',
      url: `https://example.com/${o.retailer.split(' ')[0].toLowerCase()}`,
      advertised_price_text: `$${o.price}`,
      size: '100 g',
      size_value: 100,
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
      unit_price: o.unit_price,
      in_median: o.in_median ?? true,
      exclusion_reason: null,
      pct_vs_median: o.pct_vs_median ?? null,
      position: o.position ?? null,
    })),
    reviews: [{ rating: 4.5, review_count: 120, summary: 'Liked.', url: 'https://example.com/r' }],
    pricing_summary: { shelf_price: null, shelf_currency: null, observed_low: 2, observed_high: 4, relevant_offer_count: 3, notes: [] },
    uncertainty: { overall_confidence: 0.9, missing_information: [], conflicts: [] },
    price_verdict: {
      verdict_available: true,
      no_verdict_reason: null,
      comparison_unit: '100 g',
      median_unit_price: 3,
      offers_in_median: 3,
      span_pct: 35,
      zone_under_boundary: 35.714,
      zone_over_boundary: 64.286,
      shelf: null,
      thresholds_used: { under_pct: 10, over_pct: 10 },
      confidence: 'ok',
      size_assumed: false,
    },
    ...over,
  };
}

export function httpBody(text: string, opts: { queries?: string[]; model?: string } = {}): string {
  return JSON.stringify({
    model: opts.model,
    steps: [
      { type: 'google_search_call', arguments: { queries: opts.queries ?? ['kraft dinner price'] } },
      // Google's terms want its rendered Search Suggestions shown with the result; the real path seals only with them.
      { type: 'google_search_result', result: [{ search_suggestions: '<div class="container">kraft dinner price</div>' }] },
      { type: 'model_output', content: [{ type: 'text', text }] },
    ],
    usage: { total_input_tokens: 1000, total_output_tokens: 400 },
  });
}

export interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** Answers every request with `reply(call)`, and records it. Default reply is `goodAnswer()`. */
export function fakeTransport(
  reply: (call: Call, n: number) => { status?: number; text: string } = () => ({ text: httpBody(JSON.stringify(goodAnswer())) }),
): { transport: GroundedTransport; calls: Call[] } {
  const calls: Call[] = [];
  const transport: GroundedTransport = async (url, init) => {
    const call: Call = { url, body: JSON.parse(init.body) as Record<string, unknown> };
    calls.push(call);
    const r = reply(call, calls.length);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => r.text };
  };
  return { transport, calls };
}
