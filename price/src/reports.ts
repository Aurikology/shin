/**
 * Shopper reports turned into weighted price points. Unit F of
 * docs/price-system-build-plan-2026-09-28.md. Pure math over rows the caller
 * reads; the only I/O here is two read helpers that take open handles.
 *
 * WHAT A REPORT IS. A row in `corrections.db` (`corrections.ts`): one device,
 * one product, one shop, one day, one price, plus how it was captured (photo of
 * a tag or typed) and when. The device id is the "account": a random id the
 * phone made, never a person. Nothing here adds a name, email or location.
 *
 * FOUR RULES, each with its constant below:
 *
 *  1. One counted report per device per product per shop per ISO week. Every
 *     row stays stored; the newest in the week counts, the rest are
 *     `superseded`. A person re-reading the same shelf on Monday and Thursday
 *     is one witness, not two.
 *  2. Outliers against neighbouring shops are HELD, never dropped: kept,
 *     flagged, weight 0. (Nigeria food-price study: compare a report with the
 *     same item's price at nearby markets, and reweight rather than delete.)
 *     There is no location on a report by design, so "neighbouring" is every
 *     OTHER shop with a price for the same product within HOLD_PERIOD_DAYS.
 *  3. Each device's weight comes from how often it agrees with evidence it did
 *     not write: verified prices first, then devices that have themselves
 *     agreed with verified prices. One-coin Dawid-Skene with the verified
 *     prices as gold labels and a single peer step (Zheng et al. 2017 call
 *     this truth inference with golden tasks).
 *  4. A report can only become a range point at a shop that has no verified or
 *     crawled price in the window, and only when the devices behind it carry
 *     at least ADMIT_WEIGHT between them. A shop that already has a crawled
 *     price keeps that price; reports there only feed agreement.
 *
 * WHY A NEW DEVICE WEIGHS ZERO. The Waze Sybil paper faked a traffic jam with
 * 15 bots, because every report counted from the moment the account existed.
 * Here the prior is on a device's reliability (Beta(PRIOR_ALPHA, PRIOR_BETA),
 * mean 0.2), and the WEIGHT is only the part of reliability earned above that
 * prior. A device with no checked history sits exactly at the prior and weighs
 * 0, so any number of new devices sum to 0 and cannot outvote one crawled
 * price. Devices agreeing only with each other earn nothing either: the peer
 * step credits agreement only with devices whose weight came from verified
 * prices. The rows are still stored, still counted as witnesses by
 * `witnessesFor`, and still measured.
 *
 * WHAT THIS DOES NOT DEFEND. A patient attacker who first files many true
 * prices at crawled shops earns real weight and can then lie. That is the cost
 * of the rule "weight by agreement"; it is bounded by ADMIT_WEIGHT needing
 * several earned devices at one shop, and by the hold rule.
 */

import type { DatabaseSync } from 'node:sqlite';
import {
  allCorrections,
  sellerKey,
  CORROBORATION_FLOOR_CENTS,
  CORROBORATION_TOLERANCE,
  type CaptureMethod,
  type CorrectionRow,
  type CorrectionStore,
} from './corrections.ts';
import type { ObservationRow } from './store.ts';
import { WINDOW_DAYS } from './range.ts';

/* ------------------------------------------------------------ thresholds */

/**
 * The reliability prior, Beta(1, 4): mean 0.2, worth five reports of evidence.
 * Low on purpose: a shopper-typed price is unchecked until something checks it.
 * Weak on purpose: five agreements with verified prices already outweigh it,
 * so an honest tester earns weight within a week or two of ordinary shopping.
 * Replace from real data with `priorFromAgreement` once enough reports exist.
 */
export const PRIOR_ALPHA = 1;
export const PRIOR_BETA = 4;

/** A report is compared with a verified price at the same shop seen within this many days of it. */
export const AGREEMENT_DAYS = 14;

/**
 * The hold rule. A counted report is held when it is more than 1.5 times, or
 * less than two thirds of, the median price of the same product at other
 * shops within HOLD_PERIOD_DAYS, and at least MIN_NEIGHBOURS such shops exist.
 * Symmetric in ratio (x1.5 and /1.5), because a report of half the price is as
 * wrong as a report of double. 1.5 is wide on purpose: regular prices for one
 * product across Canadian chains rarely differ by half, while a mistyped digit
 * or a wrong product is usually far outside it. With fewer neighbours the
 * report is not judged at all (`unchecked`), never held on thin evidence.
 */
export const HOLD_RATIO_NUM = 3;
export const HOLD_RATIO_DEN = 2;
export const HOLD_PERIOD_DAYS = 28;
export const MIN_NEIGHBOURS = 2;

/**
 * The weight a shop's reports must carry together to become one range point:
 * the weight of one verified price. Two devices with about six verified
 * agreements each clear it; one does not.
 */
export const ADMIT_WEIGHT = 1;

/** Below this many compared reports, `priorFromAgreement` keeps the stated prior. */
export const MIN_COMPARED_TO_SET_PRIOR = 30;

/* ----------------------------------------------------------------- types */

/** A price Shin did not get from a shopper: crawled from a seller, or a verified printout or receipt. */
export interface Anchor {
  readonly productKey: string;
  readonly storeKey: string;
  readonly cents: number;
  readonly seenOn: string;
}

export interface AccountWeight {
  readonly deviceId: string;
  readonly anchoredAgree: number;
  readonly anchoredDisagree: number;
  /** Peer credit is fractional: the weights of the earned devices that agreed, capped at 1 per report. */
  readonly peerAgree: number;
  readonly peerDisagree: number;
  /** Posterior mean of the device's reliability, prior included. */
  readonly reliability: number;
  /** 0 to 1: reliability earned above the prior. */
  readonly weight: number;
}

export type ReportStatus =
  | 'counted'
  | 'superseded'
  | 'held'
  | 'promotional'
  | 'outside_window';

export interface WeightedReport {
  readonly id: number;
  readonly deviceId: string;
  readonly productKey: string;
  readonly storeKey: string;
  readonly seller: string;
  readonly cents: number;
  readonly seenOn: string;
  readonly week: string;
  readonly capture: CaptureMethod | null;
  readonly status: ReportStatus;
  readonly weight: number;
  /** The neighbours the hold rule looked at, or null when there were too few to judge. */
  readonly neighbours: { readonly shops: number; readonly medianCents: number } | null;
}

export interface StorePoint {
  readonly storeKey: string;
  readonly seller: string;
  readonly cents: number;
  readonly seenOn: string;
  readonly weight: number;
  readonly devices: number;
}

export interface AgreementCounts {
  readonly compared: number;
  readonly agreed: number;
}

export interface AgreementMeasure extends AgreementCounts {
  /** Counted regular reports, whether or not a verified price was there to check them. */
  readonly reports: number;
  readonly disagreed: number;
  /** agreed / compared, or null when nothing could be compared. */
  readonly rate: number | null;
  readonly byCapture: {
    readonly photo: AgreementCounts;
    readonly typed: AgreementCounts;
    readonly unknown: AgreementCounts;
  };
}

/* --------------------------------------------------------------- helpers */

function bare(code: string): string {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return d;
  return d.replace(/^0+/, '') || d;
}

/** The key a report and a crawled price for the same product share. */
export function productKeyOf(row: Pick<CorrectionRow, 'code' | 'subject'>): string {
  return row.code ? bare(row.code) : row.subject;
}

const DAY = 86_400_000;

function daysApart(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY);
}

/** ISO 8601 week of a plain date, e.g. "2026-W40". Weeks start Monday; week 1 holds the first Thursday. */
export function isoWeek(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Same band `witnessesFor` uses for "the same tag", measured against the reference price. */
export function agrees(cents: number, reference: number): boolean {
  return Math.abs(cents - reference) <= Math.max(CORROBORATION_FLOOR_CENTS, reference * CORROBORATION_TOLERANCE);
}

function lowerMedian(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}

function anchorIndex(anchors: readonly Anchor[]): Map<string, Anchor[]> {
  const by = new Map<string, Anchor[]>();
  for (const a of anchors) {
    const k = `${a.productKey}|${a.storeKey}`;
    const list = by.get(k);
    if (list) list.push(a);
    else by.set(k, [a]);
  }
  return by;
}

function nearestAnchor(list: readonly Anchor[] | undefined, seenOn: string): Anchor | null {
  let best: Anchor | null = null;
  let gap = Infinity;
  for (const a of list ?? []) {
    const g = daysApart(a.seenOn, seenOn);
    if (g <= AGREEMENT_DAYS && g < gap) {
      best = a;
      gap = g;
    }
  }
  return best;
}

function weightFrom(agree: number, disagree: number): { reliability: number; weight: number } {
  const prior = PRIOR_ALPHA / (PRIOR_ALPHA + PRIOR_BETA);
  const reliability = (PRIOR_ALPHA + agree) / (PRIOR_ALPHA + PRIOR_BETA + agree + disagree);
  return { reliability, weight: Math.min(1, Math.max(0, (reliability - prior) / (1 - prior))) };
}

/* ------------------------------------------------------ rule 1: the week */

/**
 * The ids that count, one per device, product, shop and ISO week: the newest
 * by day, then by write time, then by id. Every other row is superseded.
 */
export function countedIds(rows: readonly CorrectionRow[]): Set<number> {
  const keep = new Map<string, CorrectionRow>();
  for (const r of rows) {
    const k = `${r.device_id}|${productKeyOf(r)}|${sellerKey(r.seller)}|${isoWeek(r.seen_on)}`;
    const have = keep.get(k);
    if (
      !have ||
      r.seen_on > have.seen_on ||
      (r.seen_on === have.seen_on && (r.recorded_at > have.recorded_at || (r.recorded_at === have.recorded_at && r.id > have.id)))
    ) {
      keep.set(k, r);
    }
  }
  return new Set([...keep.values()].map((r) => r.id));
}

/* ---------------------------------------------------- rule 3: the weight */

/**
 * Every device's weight, from every report it has filed across all products.
 *
 * Pass 1 scores each counted regular report against the nearest verified price
 * at the same shop within AGREEMENT_DAYS: a whole agreement or disagreement.
 * Pass 2 scores the reports pass 1 could not check against other devices'
 * reports of the same product, shop and week, crediting only devices whose
 * pass-1 weight is above zero, by that weight, capped at 1 per report. Not
 * iterated further, on purpose: iterating lets a clique of new devices vouch
 * for each other, which is exactly the Sybil hole.
 */
export function accountWeights(rows: readonly CorrectionRow[], anchors: readonly Anchor[]): Map<string, AccountWeight> {
  const counted = countedIds(rows);
  const regular = rows.filter((r) => counted.has(r.id) && r.kind === 'regular');
  const idx = anchorIndex(anchors);

  const tally = new Map<string, { aa: number; ad: number; pa: number; pd: number }>();
  const t = (d: string) => {
    let v = tally.get(d);
    if (!v) tally.set(d, (v = { aa: 0, ad: 0, pa: 0, pd: 0 }));
    return v;
  };

  const unchecked: CorrectionRow[] = [];
  for (const r of regular) {
    const a = nearestAnchor(idx.get(`${productKeyOf(r)}|${sellerKey(r.seller)}`), r.seen_on);
    const v = t(r.device_id);
    if (a === null) unchecked.push(r);
    else if (agrees(r.price_cents, a.cents)) v.aa += 1;
    else v.ad += 1;
  }

  const earned = new Map<string, number>();
  for (const [d, v] of tally) earned.set(d, weightFrom(v.aa, v.ad).weight);

  const byItem = new Map<string, CorrectionRow[]>();
  for (const r of regular) {
    const k = `${productKeyOf(r)}|${sellerKey(r.seller)}|${isoWeek(r.seen_on)}`;
    const list = byItem.get(k);
    if (list) list.push(r);
    else byItem.set(k, [r]);
  }
  for (const r of unchecked) {
    let agreeW = 0;
    let disagreeW = 0;
    for (const o of byItem.get(`${productKeyOf(r)}|${sellerKey(r.seller)}|${isoWeek(r.seen_on)}`) ?? []) {
      if (o.device_id === r.device_id) continue;
      const w = earned.get(o.device_id) ?? 0;
      if (w <= 0) continue;
      if (agrees(r.price_cents, o.price_cents)) agreeW += w;
      else disagreeW += w;
    }
    const v = t(r.device_id);
    v.pa += Math.min(1, agreeW);
    v.pd += Math.min(1, disagreeW);
  }

  const out = new Map<string, AccountWeight>();
  for (const [deviceId, v] of tally) {
    const { reliability, weight } = weightFrom(v.aa + v.pa, v.ad + v.pd);
    out.set(deviceId, {
      deviceId,
      anchoredAgree: v.aa,
      anchoredDisagree: v.ad,
      peerAgree: v.pa,
      peerDisagree: v.pd,
      reliability,
      weight,
    });
  }
  return out;
}

/* ---------------------------------------------- rule 2: hold, per product */

/**
 * Every report of one product with its status and weight, as of `asOf`.
 * `rows` may hold other products' reports; they are used only as neighbours
 * when they share the product key, and otherwise ignored.
 */
export function weighReports(
  productKey: string,
  rows: readonly CorrectionRow[],
  anchors: readonly Anchor[],
  weights: ReadonlyMap<string, AccountWeight>,
  asOf: string,
  windowDays: number = WINDOW_DAYS,
): WeightedReport[] {
  const mine = rows.filter((r) => productKeyOf(r) === productKey);
  const counted = countedIds(mine);
  const myAnchors = anchors.filter((a) => a.productKey === productKey);
  const inWindow = (d: string) => Date.parse(d) <= Date.parse(asOf) + DAY && daysApart(d, asOf) <= windowDays;

  return mine.map((r): WeightedReport => {
    const storeKey = sellerKey(r.seller);
    const base = {
      id: r.id,
      deviceId: r.device_id,
      productKey,
      storeKey,
      seller: r.seller,
      cents: r.price_cents,
      seenOn: r.seen_on,
      week: isoWeek(r.seen_on),
      capture: r.capture ?? null,
    };
    const status = (s: ReportStatus, neighbours: WeightedReport['neighbours'] = null): WeightedReport => ({
      ...base,
      status: s,
      weight: s === 'counted' ? weights.get(r.device_id)?.weight ?? 0 : 0,
      neighbours,
    });
    if (!counted.has(r.id)) return status('superseded');
    if (r.kind !== 'regular') return status('promotional');
    if (!inWindow(r.seen_on)) return status('outside_window');

    // Latest price per OTHER shop in the period: crawled or verified prices,
    // and reports from devices that have earned weight.
    const latest = new Map<string, { seenOn: string; cents: number }>();
    const offer = (shop: string, seenOn: string, cents: number) => {
      if (shop === storeKey || daysApart(seenOn, r.seen_on) > HOLD_PERIOD_DAYS) return;
      const have = latest.get(shop);
      if (!have || seenOn > have.seenOn) latest.set(shop, { seenOn, cents });
    };
    for (const a of myAnchors) offer(a.storeKey, a.seenOn, a.cents);
    for (const o of mine) {
      if (o.kind !== 'regular' || !counted.has(o.id) || o.device_id === r.device_id) continue;
      if ((weights.get(o.device_id)?.weight ?? 0) <= 0) continue;
      offer(sellerKey(o.seller), o.seen_on, o.price_cents);
    }
    if (latest.size < MIN_NEIGHBOURS) return status('counted');
    const median = lowerMedian([...latest.values()].map((v) => v.cents));
    const neighbours = { shops: latest.size, medianCents: median };
    const tooHigh = r.price_cents * HOLD_RATIO_DEN > median * HOLD_RATIO_NUM;
    const tooLow = r.price_cents * HOLD_RATIO_NUM < median * HOLD_RATIO_DEN;
    return status(tooHigh || tooLow ? 'held' : 'counted', neighbours);
  });
}

/* ------------------------------------------ rule 4: which become points */

/**
 * The shop-level points reports are allowed to add: one per shop with no
 * crawled or verified price in the window, whose counted, weighted reports
 * together reach ADMIT_WEIGHT. The price is their weighted median.
 */
export function rangePoints(
  weighed: readonly WeightedReport[],
  anchors: readonly Anchor[],
  asOf: string,
  windowDays: number = WINDOW_DAYS,
): StorePoint[] {
  const anchoredShops = new Set(
    anchors
      .filter((a) => Date.parse(a.seenOn) <= Date.parse(asOf) + DAY && daysApart(a.seenOn, asOf) <= windowDays)
      .map((a) => `${a.productKey}|${a.storeKey}`),
  );
  const byShop = new Map<string, WeightedReport[]>();
  for (const w of weighed) {
    if (w.status !== 'counted' || w.weight <= 0) continue;
    if (anchoredShops.has(`${w.productKey}|${w.storeKey}`)) continue;
    const list = byShop.get(w.storeKey);
    if (list) list.push(w);
    else byShop.set(w.storeKey, [w]);
  }
  const out: StorePoint[] = [];
  for (const [storeKey, list] of byShop) {
    const total = list.reduce((s, w) => s + w.weight, 0);
    if (total < ADMIT_WEIGHT) continue;
    const sorted = [...list].sort((a, b) => a.cents - b.cents);
    let run = 0;
    let cents = sorted[sorted.length - 1]!.cents;
    for (const w of sorted) {
      run += w.weight;
      if (run * 2 >= total) {
        cents = w.cents;
        break;
      }
    }
    const newest = [...list].sort((a, b) => (a.seenOn < b.seenOn ? 1 : a.seenOn > b.seenOn ? -1 : b.id - a.id))[0]!;
    out.push({
      storeKey,
      seller: newest.seller,
      cents,
      seenOn: newest.seenOn,
      weight: total,
      devices: new Set(list.map((w) => w.deviceId)).size,
    });
  }
  return out.sort((a, b) => (a.storeKey < b.storeKey ? -1 : 1));
}

/**
 * The points in `observation` row shape, so a caller can hand them to
 * `priceRangeFor` through a price handle exactly like crawled rows. `seller`
 * is the shop as the shopper typed it; `seller_sku` starting `report:` is what
 * marks the row as a shopper report (join_method is 'gtin': it is joined by barcode).
 */
export function observationRowsFor(code: string, points: readonly StorePoint[], currency = 'CAD'): ObservationRow[] {
  return points.map((p) => ({
    code,
    seller: p.seller,
    sellerSku: `report:${p.storeKey}`,
    sellerName: 'shopper report',
    sellerBrand: null,
    priceCents: p.cents,
    kind: 'regular',
    unitPriceCents: null,
    unitLabel: null,
    currency,
    country: 'CA',
    region: null,
    joinMethod: 'gtin',
    seenOn: p.seenOn,
    url: null,
    imageUrl: null,
    inStock: null,
  }));
}

/* ------------------------------------------------------ the measurement */

/**
 * How often counted regular reports agree with a verified price at the same
 * shop within AGREEMENT_DAYS, split by capture method. This is the number the
 * prior should come from once real reports exist.
 */
export function measureAgreement(rows: readonly CorrectionRow[], anchors: readonly Anchor[]): AgreementMeasure {
  const counted = countedIds(rows);
  const idx = anchorIndex(anchors);
  let reports = 0;
  const cap = { photo: { compared: 0, agreed: 0 }, typed: { compared: 0, agreed: 0 }, unknown: { compared: 0, agreed: 0 } };
  for (const r of rows) {
    if (!counted.has(r.id) || r.kind !== 'regular') continue;
    reports += 1;
    const a = nearestAnchor(idx.get(`${productKeyOf(r)}|${sellerKey(r.seller)}`), r.seen_on);
    if (a === null) continue;
    const bucket = cap[r.capture ?? 'unknown'];
    bucket.compared += 1;
    if (agrees(r.price_cents, a.cents)) bucket.agreed += 1;
  }
  const compared = cap.photo.compared + cap.typed.compared + cap.unknown.compared;
  const agreed = cap.photo.agreed + cap.typed.agreed + cap.unknown.agreed;
  return {
    reports,
    compared,
    agreed,
    disagreed: compared - agreed,
    rate: compared === 0 ? null : agreed / compared,
    byCapture: cap,
  };
}

/**
 * The prior the measured rate implies, at the same strength (five reports) as
 * the stated one. Returns the stated prior until MIN_COMPARED_TO_SET_PRIOR
 * reports have been compared, because a rate from a handful is noise.
 */
export function priorFromAgreement(m: AgreementMeasure): { alpha: number; beta: number; fromData: boolean } {
  const strength = PRIOR_ALPHA + PRIOR_BETA;
  if (m.rate === null || m.compared < MIN_COMPARED_TO_SET_PRIOR) {
    return { alpha: PRIOR_ALPHA, beta: PRIOR_BETA, fromData: false };
  }
  return { alpha: m.rate * strength, beta: (1 - m.rate) * strength, fromData: true };
}

/* ---------------------------------------------------------------- reads */

function reservedHost(url: unknown): boolean {
  if (typeof url !== 'string' || url === '') return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(^|\.)example\.(com|net|org)$/.test(host) || /\.(example|test|invalid|localhost)$/.test(host) || host === 'localhost';
  } catch {
    return false;
  }
}

/**
 * Crawled and verified regular prices for the given barcodes, as anchors.
 * Printout rows count only when price_verified = 1 (store.ts: the rest is
 * training data). Open Prices rows are keyed by the shop they name, since
 * their seller string is the publisher.
 */
export function anchorsFromPrices(db: DatabaseSync, codes: readonly string[], currency = 'CAD'): Anchor[] {
  const keys = [...new Set(codes.map(bare))];
  if (keys.length === 0) return [];
  const spellings = [...new Set(keys.flatMap((k) => [k, k.padStart(12, '0'), k.padStart(13, '0'), k.padStart(14, '0'), k.padStart(8, '0')]))];
  const out: Anchor[] = [];
  for (let i = 0; i < spellings.length; i += 500) {
    const chunk = spellings.slice(i, i + 500);
    const rows = db
      .prepare(
        `SELECT code, seller, store_name, price_cents, seen_on, url, capture_tile_id, price_verified
           FROM observation
          WHERE code IN (${chunk.map(() => '?').join(',')}) AND kind = 'regular' AND currency = ?`,
      )
      .all(...chunk, currency) as Record<string, unknown>[];
    for (const r of rows) {
      if (typeof r.code !== 'string' || typeof r.seller !== 'string' || typeof r.seen_on !== 'string') continue;
      if (typeof r.price_cents !== 'number' || !Number.isInteger(r.price_cents) || r.price_cents <= 0) continue;
      if (r.capture_tile_id !== null && r.capture_tile_id !== undefined && r.price_verified !== 1) continue;
      if (reservedHost(r.url)) continue;
      const shop = r.seller === 'openprices' && typeof r.store_name === 'string' ? r.store_name : r.seller;
      out.push({ productKey: bare(r.code), storeKey: sellerKey(shop), cents: r.price_cents, seenOn: r.seen_on });
    }
  }
  return out;
}

/**
 * What a real caller runs for one product: every report ever filed (weights
 * are learned across products), anchors for every product reported, then the
 * product's weighed reports and the points they may add to its range.
 */
export function reportPointsFor(
  code: string,
  sources: { readonly corrections: CorrectionStore; readonly prices: DatabaseSync },
  asOf: string,
  windowDays: number = WINDOW_DAYS,
): { weighed: WeightedReport[]; points: StorePoint[]; weights: Map<string, AccountWeight> } {
  const rows = allCorrections(sources.corrections);
  const codes = [...new Set([code, ...rows.map((r) => r.code).filter((c): c is string => c !== null)])];
  const anchors = anchorsFromPrices(sources.prices, codes);
  const weights = accountWeights(rows, anchors);
  const key = bare(code);
  const weighed = weighReports(key, rows, anchors, weights, asOf, windowDays);
  return { weighed, points: rangePoints(weighed, anchors, asOf, windowDays), weights };
}
