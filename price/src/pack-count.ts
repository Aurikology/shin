/**
 * PACK COUNTS: how many units a printed name or size says one buyable pack holds, and the pack's TOTAL quantity.
 *
 * Why (probe B, Mac, 2026-11-25, the other_size rung's first scoring): the worst misses were a single compared
 * with a multipack, or a multipack whose size column printed one unit while its price was for the whole pack
 * (energy bars $6.99 answered $44.79 to $102.24; lemonade $3.49 answered $16.33 to $37.27; a Lindt bunny $18.49
 * answered $4.08 to $9.31; a milk $3.19 answered $4.44 to $10.12). A price scaled by size is only a price of that
 * size when the size is the whole pack's.
 *
 * Shapes read: "12 x 1.4 oz", "12x355mL", "355 ml x 12" (a count times a unit size: the total is multiplied out),
 * and a bare count beside a size in the SAME text: "6-pack", "6 pk", "4 ct", "pack of 8", "24 bottles",
 * French "paquet de 6", "6 x" ("Bar 1.4 oz 12 ct" is 12 bars of 1.4 oz: 16.8 oz). A count with no size in its own
 * text ("Lemonade 6 pack" beside a catalogue size "2.13 L") has a count but no total: the size may be one unit's or
 * the pack's and nothing here guesses which. The unit size parser is catalogue/src/units.ts's, not a second one.
 *
 * `pairable` is the rule the other_size rung applies: when either side names a count above 1, both sides must
 * have a count AND a total, else the two are not compared (a single and its multipack are different products).
 */

import { toComparison, type ComparisonQuantity } from '../../catalogue/src/units.ts';

const NOT_AFTER_DIGIT = '(?<![\\d.])';
/** A count beside a unit size, `12 x 1.4 oz`, `12x355ml`: the same token catalogue/src/units.ts reads. */
const MULTIPLIED = /(?<![\d.])(\d+)\s*[x*]\s*(\d+(?:\.\d+)?|\.\d+)\s*(fl\.?\s*oz|[a-z]+)\b/g;
/** The reverse order, `355 ml x 12`, only when the count ends the phrase. */
const MULTIPLIED_AFTER = /(?<![\d.])(\d+(?:\.\d+)?|\.\d+)\s*(fl\.?\s*oz|[a-z]+)\s*[x*]\s*(\d+)\b(?!\s*[.\d]*\s*[a-z])/g;
/** A bare unit size, with no count in front of it. */
const SIZE_TOKEN = /(?<![\d.])(\d+(?:\.\d+)?|\.\d+)\s*(fl\.?\s*oz|[a-z]+)\b/g;

interface CountWord {
  readonly re: RegExp;
  /** A count word that is itself a count-family size ("4 ct"): with no other size beside it, the total is the count. */
  readonly isCountSize: boolean;
}

const COUNT_WORDS: readonly CountWord[] = [
  { re: new RegExp(`\\bpack of (\\d+)\\b`, 'g'), isCountSize: false },
  { re: new RegExp(`\\bpaquet de (\\d+)\\b`, 'g'), isCountSize: false },
  { re: new RegExp(`\\b(?:case|box|caisse|boite|emballage|lot|set) (?:of|de) (\\d+)\\b`, 'g'), isCountSize: false },
  { re: new RegExp(`${NOT_AFTER_DIGIT}(\\d+)\\s*-?\\s*(?:packs?|pks?|pkt|pak)\\b`, 'g'), isCountSize: false },
  { re: new RegExp(`${NOT_AFTER_DIGIT}(\\d+)\\s*(?:ct|count|pcs?|pieces?)\\b`, 'g'), isCountSize: true },
  {
    re: new RegExp(`${NOT_AFTER_DIGIT}(\\d+)\\s*(?:bottles?|btls?|bouteilles?|cans?|canettes?|bars?|barres?|pouches?|sachets?|jars?|tubs?)\\b`, 'g'),
    isCountSize: false,
  },
  // "6 x" with no size after it.
  { re: new RegExp(`${NOT_AFTER_DIGIT}(\\d+)\\s*x\\b(?!\\s*[.\\d])`, 'g'), isCountSize: false },
];

export interface PackReading {
  /** The pack count the text names (1 or more); null when it names none or names two different ones. */
  readonly count: number | null;
  /** True when the text names a count above 1, or names conflicting counts. */
  readonly multi: boolean;
  /** The whole pack's quantity when the text fixes it; null when it does not. */
  readonly total: ComparisonQuantity | null;
}

function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2');
}

function validCount(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 1000;
}

interface TextReading {
  readonly counts: Set<number>;
  readonly total: ComparisonQuantity | null;
}

function readText(raw: string): TextReading {
  const lower = normalise(raw);
  const counts = new Set<number>();
  const totals: ComparisonQuantity[] = [];
  const spans: [number, number][] = [];
  const claim = (start: number, end: number) => spans.push([start, end]);

  // A count times a size: the total is multiplied out.
  for (const m of lower.matchAll(MULTIPLIED)) {
    const n = Number(m[1]);
    const q = validCount(n) ? toComparison(n * Number(m[2]), m[3]) : null;
    if (!q) continue;
    counts.add(n);
    totals.push(q);
    claim(m.index, m.index + m[0].length);
  }
  for (const m of lower.matchAll(MULTIPLIED_AFTER)) {
    const n = Number(m[3]);
    const q = validCount(n) ? toComparison(n * Number(m[1]), m[2]) : null;
    if (!q) continue;
    counts.add(n);
    totals.push(q);
    claim(m.index, m.index + m[0].length);
  }

  // A bare count word: a count, and a total when the same text prints a unit size beside it.
  const wordCounts: { n: number; isCountSize: boolean }[] = [];
  for (const w of COUNT_WORDS) {
    for (const m of lower.matchAll(w.re)) {
      const n = Number(m[1]);
      if (!validCount(n)) continue;
      if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue;
      wordCounts.push({ n, isCountSize: w.isCountSize });
    }
  }
  for (const w of wordCounts) counts.add(w.n);
  if (totals.length === 0 && wordCounts.length > 0 && new Set(wordCounts.map((w) => w.n)).size === 1) {
    const n = wordCounts[0]!.n;
    const sizes: ComparisonQuantity[] = [];
    for (const m of lower.matchAll(SIZE_TOKEN)) {
      const q = toComparison(Number(m[1]), m[2]);
      if (q && q.family !== 'count') sizes.push(q);
    }
    if (sizes.length === 1) {
      const one = sizes[0]!;
      const q = toComparison(one.baseValue * n, one.baseUnit);
      if (q) totals.push(q);
    } else if (sizes.length === 0 && wordCounts.some((w) => w.isCountSize)) {
      const q = toComparison(n, 'ct');
      if (q) totals.push(q);
    }
  }

  const sameTotal = totals.length > 0 && totals.every((t) => t.family === totals[0]!.family && Math.abs(t.baseValue / totals[0]!.baseValue - 1) < 1e-9);
  return { counts, total: sameTotal ? totals[0]! : null };
}

/** What the printed name and the printed size say about the pack. Either may be null. */
export function readPackCount(name: string | null | undefined, sizeText?: string | null): PackReading {
  const parts = [name, sizeText].filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(readText);
  const counts = new Set<number>();
  for (const p of parts) for (const n of p.counts) counts.add(n);
  const totals = parts.map((p) => p.total).filter((t): t is ComparisonQuantity => t !== null);
  const conflict = counts.size > 1;
  const count = counts.size === 1 ? [...counts][0]! : null;
  const agree = totals.length > 0 && totals.every((t) => t.family === totals[0]!.family && Math.abs(t.baseValue / totals[0]!.baseValue - 1) < 1e-9);
  return {
    count,
    multi: conflict || (count !== null && count > 1),
    total: conflict || !agree ? null : totals[0]!,
  };
}

/** The text with its pack-count phrases removed, so a 6-pack and a 12-pack of one product share a name stem. */
export function stripPackCounts(text: string): string {
  let out = normalise(text);
  for (const w of COUNT_WORDS) out = out.replace(w.re, ' ');
  return out;
}

export interface PackSide {
  readonly count: number | null;
  readonly multi: boolean;
  /** The pack's whole quantity: from the text when it names a count, else the plain size; null when undetermined. */
  readonly total: ComparisonQuantity | null;
}

/** One side of a pairing: the name and size text it printed, and the size the system holds for it. */
export function packSide(name: string | null | undefined, sizeText: string | null | undefined, size: ComparisonQuantity | null): PackSide {
  const r = readPackCount(name, sizeText);
  const single = !r.multi && (r.count === null || r.count === 1);
  return { count: r.count, multi: r.multi, total: r.total ?? (single ? size : null) };
}

/**
 * May these two be compared by size at all? Both need a total. When either names a count above 1, both must name
 * a count: a multipack is compared with another multipack, never with a bare size that might be one unit or a pack.
 */
export function pairable(a: PackSide, b: PackSide): boolean {
  if (!a.total || !b.total || a.total.family !== b.total.family) return false;
  if ((a.multi || b.multi) && (a.count === null || b.count === null)) return false;
  return true;
}
