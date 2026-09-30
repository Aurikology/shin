/**
 * B1. Answer keys: what the bench scores against.
 *
 *   (a) prediction key: products with their own regular prices at 3+ shops.
 *       Each shop's latest price is one truth point.
 *   (b) low/high key: sale prices, paired with the regular price where the
 *       data allows. HOW A SALE IS DETECTED: `observation.kind =
 *       'promotional'` (what the seller's page said), or `is_sale = 1` where
 *       unit A1's column exists. The regular price is, in order: the printed
 *       "was" price (`was_cents`, where the column exists and holds one); the
 *       same listing (seller + seller_sku) on another day; the same seller and
 *       barcode. `base_price_cents` is the pre-tax price, NOT the regular
 *       price, and is not used.
 *       Convenience-store prices (the high side of the check) have no source in
 *       `observation` today: that half is a named empty slot.
 *   (c) matching key: store-page barcodes from the printout matcher
 *       (research/screenshot-matcher-v1/key-truth.jsonl). Loaded and counted
 *       only; matching is paused (build plan, C), so nothing scores against it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { keyExclusion, latestPerShop, type KeyExclusion, type Observation } from './data.ts';

export const MIN_KEY_SHOPS = 3;

export interface TruthPoint {
  readonly key: string;
  readonly code: string;
  readonly shop: string;
  readonly seller: string;
  readonly sellerSku: string;
  readonly name: string;
  readonly url: string | null;
  readonly cents: number;
  readonly seenOn: string;
}

export interface PredictionItem {
  readonly key: string;
  readonly code: string;
  readonly points: readonly TruthPoint[];
}

export type Pairing = 'was_price' | 'same_listing' | 'same_seller_barcode' | 'none';

export interface SaleItem {
  /** Null when the sale row has no barcode: counted, not scorable by a barcode model. */
  readonly key: string | null;
  readonly code: string | null;
  readonly seller: string;
  readonly sellerSku: string;
  readonly shop: string;
  readonly name: string;
  readonly url: string | null;
  readonly saleCents: number;
  readonly seenOn: string;
  readonly regularCents: number | null;
  readonly regularSeenOn: string | null;
  readonly pairing: Pairing;
}

export interface MatchingKey {
  readonly status: 'loaded' | 'missing';
  readonly path: string;
  readonly rows: number;
  readonly withBarcode: number;
  readonly note: string;
}

export function buildPredictionKey(obs: readonly Observation[], minShops = MIN_KEY_SHOPS): PredictionItem[] {
  const byKey = new Map<string, Observation[]>();
  for (const o of obs) {
    if (o.isSale || !o.key || keyExclusion(o)) continue;
    const list = byKey.get(o.key);
    if (list) list.push(o);
    else byKey.set(o.key, [o]);
  }
  const out: PredictionItem[] = [];
  for (const [key, list] of byKey) {
    const shops = latestPerShop(list);
    if (shops.length < minShops) continue;
    out.push({
      key,
      code: list[0]!.code!,
      points: shops
        .map((s) => ({
          key,
          code: s.code!,
          shop: s.shop,
          seller: s.seller,
          sellerSku: s.sellerSku,
          name: s.sellerName,
          url: s.url,
          cents: s.cents,
          seenOn: s.seenOn,
        }))
        .sort((a, b) => (a.shop < b.shop ? -1 : a.shop > b.shop ? 1 : 0)),
    });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** The regular row nearest in date to the sale; on a tie, the earlier one (the price before the sale). */
function nearest(regs: readonly Observation[], seenOn: string): Observation | null {
  let best: Observation | null = null;
  let bestGap = Infinity;
  const t = Date.parse(seenOn);
  for (const r of regs) {
    const gap = Math.abs(Date.parse(r.seenOn) - t);
    if (gap < bestGap || (gap === bestGap && best && r.seenOn < best.seenOn)) {
      best = r;
      bestGap = gap;
    }
  }
  return best;
}

export function buildSaleKey(obs: readonly Observation[]): SaleItem[] {
  const regByListing = new Map<string, Observation[]>();
  const regBySellerKey = new Map<string, Observation[]>();
  for (const o of obs) {
    if (o.isSale || keyExclusion(o)) continue;
    const a = `${o.seller}|${o.sellerSku}`;
    (regByListing.get(a) ?? regByListing.set(a, []).get(a)!).push(o);
    if (o.key) {
      const b = `${o.seller}|${o.key}`;
      (regBySellerKey.get(b) ?? regBySellerKey.set(b, []).get(b)!).push(o);
    }
  }
  const out: SaleItem[] = [];
  for (const o of obs) {
    if (!o.isSale || keyExclusion(o)) continue;
    let pairing: Pairing = 'none';
    let reg: { cents: number; seenOn: string } | null = null;
    if (o.wasCents !== null) {
      reg = { cents: o.wasCents, seenOn: o.seenOn };
      pairing = 'was_price';
    } else {
      reg = nearest(regByListing.get(`${o.seller}|${o.sellerSku}`) ?? [], o.seenOn);
      if (reg) pairing = 'same_listing';
      else if (o.key) {
        reg = nearest(regBySellerKey.get(`${o.seller}|${o.key}`) ?? [], o.seenOn);
        if (reg) pairing = 'same_seller_barcode';
      }
    }
    out.push({
      key: o.key,
      code: o.code,
      seller: o.seller,
      sellerSku: o.sellerSku,
      shop: o.shop,
      name: o.sellerName,
      url: o.url,
      saleCents: o.cents,
      seenOn: o.seenOn,
      regularCents: reg ? reg.cents : null,
      regularSeenOn: reg ? reg.seenOn : null,
      pairing,
    });
  }
  return out;
}

export function loadMatchingKey(path: string): MatchingKey {
  if (!existsSync(path)) {
    return { status: 'missing', path, rows: 0, withBarcode: 0, note: 'file not found; slot left empty' };
  }
  let rows = 0;
  let withBarcode = 0;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as { upc?: unknown; status?: unknown };
      rows++;
      if (typeof r.upc === 'string' && /^\d{8,14}$/.test(r.upc) && (r.status === undefined || r.status === 'ok')) withBarcode++;
    } catch {
      /* a broken line is not a row */
    }
  }
  return {
    status: 'loaded',
    path,
    rows,
    withBarcode,
    note: 'matching key slot: loaded and counted only. Matching is paused (build plan C), so no score is computed against it.',
  };
}

/** Rows kept out of every answer key, by reason (flags, or an unverified printout price). */
export function keyExclusions(obs: readonly Observation[]): Record<KeyExclusion, number> {
  const out: Record<KeyExclusion, number> = { flagged: 0, unverified_printout: 0 };
  for (const o of obs) {
    const why = keyExclusion(o);
    if (why) out[why]++;
  }
  return out;
}

export interface KeySummary {
  readonly prediction: { readonly products: number; readonly truthPoints: number };
  readonly sale: {
    readonly saleRows: number;
    readonly withBarcode: number;
    readonly paired: number;
    readonly byPairing: Readonly<Record<Pairing, number>>;
    readonly detection: string;
  };
  readonly highSide: { readonly status: 'not built'; readonly note: string };
  readonly matching: MatchingKey;
  /** Rows excluded from every key: carrying flags, or printout rows without price_verified = 1. */
  readonly excluded: Readonly<Record<KeyExclusion, number>>;
}

export function summarizeKeys(pred: readonly PredictionItem[], sale: readonly SaleItem[], matching: MatchingKey, excluded: Record<KeyExclusion, number> = { flagged: 0, unverified_printout: 0 }): KeySummary {
  const byPairing: Record<Pairing, number> = { was_price: 0, same_listing: 0, same_seller_barcode: 0, none: 0 };
  for (const s of sale) byPairing[s.pairing]++;
  return {
    prediction: { products: pred.length, truthPoints: pred.reduce((n, p) => n + p.points.length, 0) },
    sale: {
      saleRows: sale.length,
      withBarcode: sale.filter((s) => s.key).length,
      paired: sale.filter((s) => s.regularCents !== null).length,
      byPairing,
      detection:
        "kind = 'promotional' or is_sale = 1 (where that column exists); regular price from was_cents when printed, else the same listing on another day, else the same seller and barcode",
    },
    highSide: { status: 'not built', note: 'convenience-store prices have no source in observation today' },
    matching,
    excluded,
  };
}
