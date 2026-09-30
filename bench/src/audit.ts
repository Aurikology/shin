/**
 * B1 audit: which rows of the key look wrong, and how to measure the key's own
 * error rate by hand.
 *
 * Cleanlab's method flags a label when a model trained without it disagrees
 * with it. The "model" here is the simplest one that cannot see the row: the
 * leave-one-out median of the same product's price at the OTHER shops. A price
 * far from what every other shop charges for the same barcode is either a real
 * outlier or a wrong row (wrong barcode join, a case price, a typo); only a
 * person re-reading the page can say which.
 *
 * THE KEY'S ERROR RATE IS NEVER COMPUTED FROM THE FLAGS. Flags say where to
 * look. The rate comes only from rows a person has re-read, and while no one
 * has, it is reported as "not measured".
 */

import { daysApart, median } from './data.ts';
import type { PredictionItem, SaleItem } from './keys.ts';

/**
 * Flag when a price is more than this many times off its leave-one-out median,
 * either way. DEFAULT, changeable by Jamin. 1.5x is the plan's usefulness bar
 * for an item's own range: a shop further off than that from the others is
 * worth a person's look.
 */
export const DISAGREE_RATIO = 1.5;

/**
 * Only other shops' prices seen within this many days of the row are compared.
 * DEFAULT, changeable by Jamin. 90 days is range.ts's WINDOW_DAYS: prices from
 * different quarters can differ for real (re-price, inflation), not by error.
 */
export const AUDIT_WINDOW_DAYS = 90;

/** At least this many other shops in the window, or the row is not auditable. DEFAULT, changeable by Jamin. */
export const MIN_AUDIT_OTHERS = 2;

export interface AuditRow {
  readonly source: 'prediction' | 'sale';
  readonly key: string | null;
  readonly code: string | null;
  readonly seller: string;
  readonly sellerSku: string;
  readonly shop: string;
  readonly name: string;
  readonly url: string | null;
  readonly seenOn: string;
  readonly cents: number;
  /** What the row was compared against: the leave-one-out median, or the paired regular price. */
  readonly referenceCents: number | null;
  /** |ln(cents / reference)|; 0 when there is no reference. */
  readonly disagreement: number;
  readonly flagged: boolean;
  readonly reason: string;
}

/** Stable identity of an audited row, used to keep hand marks across runs. */
export function rowId(r: { source: string; seller: string; sellerSku: string; seenOn: string; cents: number | string }): string {
  return `${r.source}|${r.seller}|${r.sellerSku}|${r.seenOn}|${r.cents}`;
}

/**
 * Each price against the median of ALL the other shops' prices for the same
 * product seen within AUDIT_WINDOW_DAYS of it. The row itself is never part of
 * its own reference (the point of leave-one-out: a wrong row cannot vouch for
 * itself).
 */
export function auditPredictionKey(items: readonly PredictionItem[], ratio = DISAGREE_RATIO, windowDays = AUDIT_WINDOW_DAYS): AuditRow[] {
  const out: AuditRow[] = [];
  const limit = Math.log(ratio);
  for (const item of items) {
    for (const p of item.points) {
      const others = item.points.filter((q) => q !== p && daysApart(q.seenOn, p.seenOn) <= windowDays).map((q) => q.cents);
      const ref = others.length >= MIN_AUDIT_OTHERS ? median(others) : null;
      const d = ref === null ? 0 : Math.abs(Math.log(p.cents / ref));
      const flagged = d > limit;
      out.push({
        source: 'prediction',
        key: p.key,
        code: p.code,
        seller: p.seller,
        sellerSku: p.sellerSku,
        shop: p.shop,
        name: p.name,
        url: p.url,
        seenOn: p.seenOn,
        cents: p.cents,
        referenceCents: ref,
        disagreement: d,
        flagged,
        reason:
          ref === null
            ? `only ${others.length} other shop(s) within ${windowDays} days; not auditable`
            : flagged
              ? `${(p.cents / ref).toFixed(2)}x the other ${others.length} shops' median`
              : 'within range of other shops',
      });
    }
  }
  return out;
}

/** A sale at or above its own regular price, or below a fifth of it, is suspicious. */
export function auditSaleKey(items: readonly SaleItem[]): AuditRow[] {
  const out: AuditRow[] = [];
  for (const s of items) {
    const ref = s.regularCents;
    let flagged = false;
    let reason = 'no paired regular price; not auditable by pairing';
    let d = 0;
    if (ref !== null) {
      d = Math.abs(Math.log(s.saleCents / ref));
      if (s.saleCents >= ref) {
        flagged = true;
        reason = `sale ${s.saleCents} is not below its regular ${ref}`;
      } else if (s.saleCents < ref / 5) {
        flagged = true;
        reason = `sale is under a fifth of its regular ${ref}`;
      } else reason = 'sale below regular';
    }
    out.push({
      source: 'sale',
      key: s.key,
      code: s.code,
      seller: s.seller,
      sellerSku: s.sellerSku,
      shop: s.shop,
      name: s.name,
      url: s.url,
      seenOn: s.seenOn,
      cents: s.saleCents,
      referenceCents: ref,
      disagreement: d,
      flagged,
      reason,
    });
  }
  return out;
}

/* ------------------------------------------------------ seeded sampling */

/** mulberry32: a small deterministic PRNG, so a sample can be drawn again from the seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampledRow extends AuditRow {
  readonly pickedBecause: 'flagged' | 'random';
}

function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const pool = [...xs];
  const rand = rng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool;
}

/**
 * The hand re-read rows: half drawn at random from ALL rows (flagged ones
 * included, so the error rate it gives is not biased low), then up to the other
 * half from the flagged rows not already drawn, worst first. The random half
 * estimates the key's error rate; the flagged half, how often a flag is right.
 * `exclude` holds ids already on the sheet.
 */
export function sampleForReread(rows: readonly AuditRow[], n = 50, seed = 20260928, exclude: ReadonlySet<string> = new Set()): SampledRow[] {
  const fresh = rows.filter((r) => !exclude.has(rowId(r)));
  const flaggedAll = fresh.filter((r) => r.flagged);
  const wantFlagged = Math.min(flaggedAll.length, Math.floor(n / 2));
  const random = shuffled(fresh, seed).slice(0, n - wantFlagged);
  const taken = new Set(random);
  const flagged = flaggedAll
    .filter((r) => !taken.has(r))
    .sort((a, b) => b.disagreement - a.disagreement)
    .slice(0, n - random.length);
  // Top up with more random rows if the flagged pool ran dry.
  const rest = shuffled(fresh.filter((r) => !taken.has(r) && !flagged.includes(r)), seed + 1).slice(0, Math.max(0, n - random.length - flagged.length));
  return [
    ...flagged.map((r) => ({ ...r, pickedBecause: 'flagged' as const })),
    ...[...random, ...rest].map((r) => ({ ...r, pickedBecause: 'random' as const })),
  ];
}

/* ------------------------------------------------------------------ CSV */

export const CSV_COLUMNS = [
  'row_id',
  'added_on',
  'picked_because',
  'source',
  'flagged',
  'reason',
  'code',
  'seller',
  'seller_sku',
  'shop',
  'name',
  'url',
  'seen_on',
  'price_cents',
  'reference_cents',
  'disagreement',
  'reread_price_cents',
  'reread_verdict',
  'reread_by',
  'reread_on',
  'reread_note',
] as const;

/**
 * Keep this many rows waiting for a person on the sheet. DEFAULT, changeable by
 * Jamin: 50 is the plan's "re-read 50 by hand".
 */
export const SHEET_PENDING_TARGET = 50;

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRecord(r: SampledRow, addedOn: string): Record<string, string> {
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  return {
    row_id: rowId(r),
    added_on: addedOn,
    picked_because: r.pickedBecause,
    source: r.source,
    flagged: r.flagged ? 'yes' : 'no',
    reason: r.reason,
    code: v(r.code),
    seller: r.seller,
    seller_sku: r.sellerSku,
    shop: r.shop,
    name: r.name,
    url: v(r.url),
    seen_on: r.seenOn,
    price_cents: String(r.cents),
    reference_cents: v(r.referenceCents),
    disagreement: r.disagreement.toFixed(3),
    reread_price_cents: '',
    reread_verdict: '',
    reread_by: '',
    reread_on: '',
    reread_note: '',
  };
}

function serialize(records: readonly Record<string, string>[], header: readonly string[]): string {
  return [header.join(','), ...records.map((r) => header.map((h) => esc(r[h] ?? '')).join(','))].join('\n') + '\n';
}

export function toCsv(rows: readonly SampledRow[], addedOn = ''): string {
  return serialize(rows.map((r) => toRecord(r, addedOn)), CSV_COLUMNS);
}

const marked = (r: Record<string, string>) => /^(right|wrong)$/i.test((r.reread_verdict ?? '').trim());

/**
 * The one persistent re-read sheet. Every existing row is kept exactly as it
 * is, hand marks included; new rows are appended only to bring the rows still
 * waiting for a person back up to `pending`. Returns the new text and how many
 * rows were added.
 */
export function mergeSheet(
  existing: string | null,
  rows: readonly AuditRow[],
  addedOn: string,
  pending = SHEET_PENDING_TARGET,
  seed = 20260928,
): { csv: string; added: number; total: number; marked: number } {
  const old = existing ? parseCsv(existing) : [];
  const header = [...CSV_COLUMNS, ...(existing ? Object.keys(old[0] ?? {}).filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h)) : [])];
  const onSheet = new Set(old.map((r) => r.row_id ?? ''));
  const waiting = old.filter((r) => !marked(r)).length;
  const need = Math.max(0, pending - waiting);
  // A new seed per sheet size, so a top-up draws fresh rows rather than repeating the first draw's order.
  const fresh = need > 0 ? sampleForReread(rows, need, seed + old.length, onSheet) : [];
  const records = [...old, ...fresh.map((r) => toRecord(r, addedOn))];
  return { csv: serialize(records, header), added: fresh.length, total: records.length, marked: old.filter(marked).length };
}

export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  const [head, ...body] = records.filter((r) => r.some((f) => f !== ''));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/* --------------------------------------------------- the key's error rate */

/** Wilson 95% interval for k of n. */
export function wilson(k: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { low: Math.max(0, mid - half), high: Math.min(1, mid + half) };
}

export type KeyErrorRate =
  | { readonly status: 'not measured'; readonly reason: string; readonly rowsOnSheet: number }
  | {
      readonly status: 'measured';
      /** From the RANDOM rows only: wrong / re-read. */
      readonly errorRate: number;
      readonly errorRate95: { readonly low: number; readonly high: number };
      readonly randomReread: number;
      readonly randomWrong: number;
      /** From the flagged rows: how often a flag pointed at a wrong row. Null when none re-read. */
      readonly flagPrecision: number | null;
      readonly flaggedReread: number;
    };

/**
 * Reads a filled re-read sheet. A row counts only when `reread_verdict` is
 * `right` or `wrong`. Nothing re-read means "not measured", never zero.
 */
export function keyErrorRate(csv: string | null): KeyErrorRate {
  if (csv === null) return { status: 'not measured', reason: 'no re-read sheet exists', rowsOnSheet: 0 };
  const rows = parseCsv(csv);
  const done = rows.filter((r) => /^(right|wrong)$/i.test((r.reread_verdict ?? '').trim()));
  const random = done.filter((r) => r.picked_because === 'random');
  const flagged = done.filter((r) => r.picked_because === 'flagged');
  if (random.length === 0) {
    return {
      status: 'not measured',
      reason: `${done.length} of ${rows.length} rows re-read, none of them from the random half; the flagged half alone cannot give a rate`,
      rowsOnSheet: rows.length,
    };
  }
  const isWrong = (r: Record<string, string>) => /^wrong$/i.test(r.reread_verdict!.trim());
  const wrong = random.filter(isWrong).length;
  return {
    status: 'measured',
    errorRate: wrong / random.length,
    errorRate95: wilson(wrong, random.length),
    randomReread: random.length,
    randomWrong: wrong,
    flagPrecision: flagged.length ? flagged.filter(isWrong).length / flagged.length : null,
    flaggedReread: flagged.length,
  };
}

/** Rows that disagree, per source, for the summary. */
export function auditSummary(rows: readonly AuditRow[]): { rows: number; flagged: number; bySource: Record<string, { rows: number; flagged: number }> } {
  const bySource: Record<string, { rows: number; flagged: number }> = {};
  for (const r of rows) {
    const s = (bySource[r.source] ??= { rows: 0, flagged: 0 });
    s.rows++;
    if (r.flagged) s.flagged++;
  }
  return { rows: rows.length, flagged: rows.filter((r) => r.flagged).length, bySource };
}
