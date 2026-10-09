/**
 * A shopper's own price, written down and handed back to them.
 *
 * TWO JOBS, ONE FILE, because both are about the same row.
 *
 * `recordShelfPrice` is what `/api/scan-price` runs: the number a shopper typed
 * on the pad at scan time (requirement 5.1, "typed shelf price") goes onto the
 * scan row, and, when a shop is named and the scan resolved a product, becomes
 * an observed price marked as a shopper report (5.2) in the corrections store.
 * Before this, the pad's number was local only: scan 29 in the walkthrough had
 * `typed_price_cents` NULL until a diagnostic post wrote it (D05).
 *
 * `shopperReportFor` is what the next answer for that product carries back: the
 * shopper's own report, with its status. Requirement 5.3 says a lone shopper
 * report counts in a range only once an independent source agrees, so the range
 * does NOT move (D06 is correct behaviour). What was missing was telling the
 * shopper their report exists, so the answer is not silent about it.
 *
 * PRIVACY (5.9). `shopperReportFor` only ever reads rows from the asking
 * device. Another shopper's store-and-time trail never rides on this answer.
 */
import { correctionsFor, recordCorrection, witnessesFor } from '../../price/src/corrections.ts';
import { getScan, updateScan } from './scans.ts';

export type ShopperReportStatus = 'waiting_for_second_source' | 'second_source_agrees';

export interface ShopperReport {
  readonly cents: number;
  readonly store: string;
  readonly seenOn: string;
  readonly status: ShopperReportStatus;
}

/**
 * This device's newest report for a barcode, or null.
 *
 * `status` is `second_source_agrees` only when a DIFFERENT device reported the
 * same product at the same shop inside the corroboration band
 * (`witnessesFor`). That is the part of requirement 5.3's independence rule the
 * corrections store can see; a store page or flyer agreeing is judged
 * elsewhere, so this never claims more than it checked.
 */
export function shopperReportFor(deviceId: string | null | undefined, code: string | null | undefined): ShopperReport | null {
  if (!deviceId || !code) return null;
  let rows;
  try {
    rows = correctionsFor({ code });
  } catch {
    return null;
  }
  const mine = rows.filter((r) => r.device_id === deviceId);
  if (mine.length === 0) return null;
  const newest = mine[0]!; // correctionsFor orders newest first
  const witnesses = witnessesFor(rows).get(newest.id) ?? 1;
  return {
    cents: newest.price_cents,
    store: newest.seller,
    seenOn: newest.seen_on,
    status: witnesses > 1 ? 'second_source_agrees' : 'waiting_for_second_source',
  };
}

/** The answer field, spread into a response: nothing at all when there is no report. */
export function shopperReportField(deviceId: string | null | undefined, code: string | null | undefined): { shopperReport?: ShopperReport } {
  const report = shopperReportFor(deviceId, code);
  return report ? { shopperReport: report } : {};
}

export interface ShelfPriceInput {
  readonly deviceId: string;
  readonly scanId: number;
  readonly priceCents: number;
  readonly storeName: string | null;
  readonly code: string | null;
  readonly today: string;
}

export type ShelfPriceResult =
  | { readonly stored: false; readonly why: string }
  | {
      readonly stored: true;
      /** The number is on the scan row. Always true when `stored` is. */
      readonly onScan: true;
      /** The observed-price row, or why there is none (no shop, no product). */
      readonly report: { readonly stored: true; readonly id: number } | { readonly stored: false; readonly why: string };
    };

export function recordShelfPrice(input: ShelfPriceInput): ShelfPriceResult {
  const scan = Number.isInteger(input.scanId) && input.scanId > 0 ? getScan(input.scanId) : null;
  if (!scan) return { stored: false, why: 'that scan is not one this server recorded' };
  if (scan.device_id !== input.deviceId) return { stored: false, why: 'that scan belongs to another device' };
  const cents = Math.round(input.priceCents);
  if (!Number.isFinite(cents) || cents <= 0) return { stored: false, why: 'the price was not a positive number' };

  // Requirement 5.1: the typed shelf price is part of the scan's own record,
  // whether or not there is a shop to make an observed price of it. So is the
  // shop the shopper typed with it: until 2026-10-09 it went to the corrections
  // store only and the scan row never had it. It is a name the shopper typed,
  // not a position, so location consent does not gate it (5.6 governs the
  // area); the corrections store below already kept it without that consent.
  const shop = input.storeName?.trim().slice(0, 120) ?? '';
  if (!updateScan(scan.id, { typedPriceCents: cents, ...(shop !== '' ? { storeName: shop } : {}) })) {
    return { stored: false, why: 'the price could not be written onto the scan' };
  }

  if (shop === '') {
    return { stored: true, onScan: true, report: { stored: false, why: 'no shop was named, so it stays on the scan only' } };
  }
  const code = input.code?.trim() || scan.resolved_code || null;
  if (code === null) {
    return { stored: true, onScan: true, report: { stored: false, why: 'the scan resolved no product, so there is nothing to file it under' } };
  }

  // One id per scan: a retry of this same call is the same reading, not a second witness.
  const result = recordCorrection({
    clientId: `scan-price:${scan.id}`,
    deviceId: input.deviceId,
    code,
    productId: null,
    label: scan.resolved_label ?? null,
    category: null,
    seller: shop,
    priceCents: cents,
    kind: 'regular',
    seenOn: input.today,
    capture: 'typed',
  });
  return {
    stored: true,
    onScan: true,
    report: result.ok ? { stored: true, id: result.id } : { stored: false, why: result.why },
  };
}
