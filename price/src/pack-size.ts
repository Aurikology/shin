/**
 * WHICH PACK A BARCODE'S PRICES ARE FOR (review 2026-11-21, functions: 0067000104022 Coca-Cola, catalogue
 * size "710 ml", answered $6.00 to $7.99, median $7.99, from five Toronto shops; three of them list the
 * barcode as "6x710ml", PriceSmart sells it as a 6-pack at $7.99, one bottle is about $2.75).
 *
 * Why it happened: a shop's own size for a row was never compared with the item's size. The verdict
 * ladder read only the FIRST sized row (design case 9) and the range card read no size at all, so the
 * six-pack rows and the rows that printed only the bottle size were pooled as one price, under the
 * catalogue's "710 ml". The class: any barcode whose shops disagree on the pack (a single and its
 * multipack, a 473 ml can and a 1.75 L jug).
 *
 * The rule, shared by estimate.ts and range.ts so the bell and the range card read shop sizes alike:
 *   1. Rows with a size are grouped by size (within SAME_SIZE).
 *   2. A row that printed only the unit size of a multipack another shop lists for the same barcode, at a
 *      price nearer the pack's than one unit's (above the pack median / sqrt(count)), is that pack: the
 *      shop printed the bottle size and sold the pack.
 *   3. The barcode is the pack most shops sell it as: shops whose rows carry the barcode itself first
 *      (a name-joined row may be another product), then all shops, then the item's own size on a tie.
 *   4. The rows of any other size are another product's prices and are left out. Rows with no size stay.
 * When the pack chosen is not the item's own size, the caller says so (`conflict`).
 */

import { parseQuantity, toComparison, type ComparisonQuantity } from '../../catalogue/src/units.ts';

/** Two sizes within this fraction of each other are one size (design case 9's 5%). */
export const SAME_SIZE = 0.05;

export function sameSize(a: ComparisonQuantity, b: ComparisonQuantity): boolean {
  if (a.family !== b.family) return false;
  const r = a.baseValue / b.baseValue;
  return r >= 1 / (1 + SAME_SIZE) && r <= 1 + SAME_SIZE;
}

/** How many of `unit` make `pack`, when it is a whole number of 2 or more (within SAME_SIZE), else null. */
function packCount(pack: ComparisonQuantity, unit: ComparisonQuantity): number | null {
  if (pack.family !== unit.family) return null;
  const k = pack.baseValue / unit.baseValue;
  const whole = Math.round(k);
  if (whole < 2) return null;
  return Math.abs(k / whole - 1) <= SAME_SIZE ? whole : null;
}

export interface SizedRow {
  readonly size: ComparisonQuantity | null;
  readonly sizeText?: string | null;
  readonly cents: number;
  readonly shop: string;
  readonly sale?: boolean;
  readonly nameJoined?: boolean;
}

export interface PackReading<T> {
  /** The rows that are prices of the pack chosen, plus every row with no size. */
  readonly keep: T[];
  /** The pack chosen, or the reference when no row has a size. */
  readonly size: ComparisonQuantity | null;
  /** The pack as a shop printed it, when the pack chosen came from the rows. */
  readonly sizeText: string | null;
  /** True when the pack chosen is not the reference size. */
  readonly conflict: boolean;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}

/** Which pack the barcode's own rows are prices of, against `reference` (the item's own size), and which rows to keep. */
export function readPacks<T extends SizedRow>(rows: readonly T[], reference: ComparisonQuantity | null): PackReading<T> {
  const groups: { size: ComparisonQuantity; text: string | null; rows: T[] }[] = [];
  // A row sized in another family than the item ("12 ea" for a 355 ml can) is read as having no size.
  const sized = (r: T): boolean => r.size !== null && (!reference || r.size.family === reference.family);
  for (const r of rows) {
    if (!sized(r) || !r.size) continue;
    const g = groups.find((x) => sameSize(x.size, r.size!));
    if (g) {
      g.rows.push(r);
      g.text ??= r.sizeText ?? null;
    } else groups.push({ size: r.size, text: r.sizeText ?? null, rows: [r] });
  }
  if (groups.length === 0) return { keep: [...rows], size: reference, sizeText: null, conflict: false };

  // 2. A row printing a multipack's unit size at the pack's price is the pack.
  for (const big of groups) {
    for (const small of groups) {
      if (small === big) continue;
      const k = packCount(big.size, small.size);
      if (k === null) continue;
      const regular = big.rows.filter((r) => !r.sale).map((r) => r.cents);
      if (regular.length === 0) continue;
      const cut = median(regular) / Math.sqrt(k);
      const moved = small.rows.filter((r) => !r.sale && r.cents > cut);
      if (moved.length === 0) continue;
      small.rows = small.rows.filter((r) => !moved.includes(r));
      big.rows.push(...moved);
    }
  }

  // 3. The pack most shops sell it as.
  const live = groups.filter((g) => g.rows.length > 0);
  // Regular prices vote (a sale tag is a weaker witness of what the shelf sells); sale rows only break a tie.
  const shops = (g: (typeof live)[number], barcodeOnly: boolean, sales: boolean) =>
    new Set(g.rows.filter((r) => (!barcodeOnly || !r.nameJoined) && (sales || !r.sale)).map((r) => r.shop)).size;
  const own = (g: (typeof live)[number]) => (reference && sameSize(g.size, reference) ? 1 : 0);
  live.sort(
    (a, b) =>
      shops(b, true, false) - shops(a, true, false) ||
      shops(b, false, false) - shops(a, false, false) ||
      own(b) - own(a) ||
      shops(b, false, true) - shops(a, false, true),
  );
  const chosen = live[0]!;
  const keep = rows.filter((r) => !sized(r) || chosen.rows.includes(r));
  const conflict = reference !== null && !sameSize(chosen.size, reference);
  return { keep, size: chosen.size, sizeText: chosen.text, conflict };
}

/**
 * A shop row's own size without the catalogue's size-fill module (range.ts is synchronous and must not load
 * it): the parsed size column, else one size printed at the very end of the name ("Coca-Cola 6x710ml").
 * The same end-of-name rule as size-fill.ts `fillFromName`, so both ladders read a row alike.
 */
export function rowSize(parsedSize: string | null | undefined, name: string | null | undefined): { q: ComparisonQuantity; text: string } | null {
  const p = parseQuantity(parsedSize ?? null);
  if (p) {
    const q = toComparison(p.value, p.unit);
    if (q) return { q, text: (parsedSize ?? '').trim() };
  }
  if (!name) return null;
  const lower = name.trim().toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const token = /(?:(\d+)\s*[x*]\s*)?(\d+(?:\.\d+)?|\.\d+)\s*(fl\.?\s*oz|[a-z]+)\b/g;
  const hits: { start: number; end: number; value: number; unit: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = token.exec(lower))) {
    const pack = m[1] ? Number(m[1]) : null;
    if (pack !== null && pack <= 0) continue;
    const each = Number(m[2]);
    if (!toComparison(each, m[3])) continue;
    hits.push({ start: m.index, end: m.index + m[0].length, value: pack !== null ? pack * each : each, unit: m[3]! });
  }
  if (hits.length !== 1) return null;
  const hit = hits[0]!;
  if (/^(mg|milligrams?)$/.test(hit.unit)) return null;
  if (!/^[\s).,;:!]*$/.test(lower.slice(hit.end))) return null;
  const q = toComparison(hit.value, hit.unit);
  if (!q || q.baseValue > 50000) return null;
  return { q, text: name.trim().slice(hit.start, hit.end) };
}
