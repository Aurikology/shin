/**
 * Barcodes for Project Hammer products that have none, borrowed from the SAME product at another chain.
 *
 * About 112,000 Hammer products carry no UPC (Voila, Walmart, Loblaws, No Frills, T&T, Metro, Sobeys),
 * but most of them are ordinary packaged goods ("Voila | Barilla Spaghettoni Pasta 410 g") that another
 * chain lists WITH a UPC. This finds that twin and hands back its barcode, so the price is stored where a
 * shopper who scans the pack will look.
 *
 * PRECISION OVER RECALL. A twin has to agree on all of:
 *  1. SIZE: parsed from the units column and from the name, converted to grams / millilitres / count, within
 *     1.5 percent. A product with no size, or a size of just "1 each", is never matched.
 *  2. BRAND: when both sides name one (the brand column, or the longest known brand at the start of the
 *     name, which is how Voila and T&T carry it) one must contain the other. When only one side names a
 *     brand, the other's name must contain every word of it.
 *  3. NAME: an idf-weighted overlap of the name words (brand words included, size words removed) of at
 *     least `minScore`.
 * Candidates are grouped by barcode. The best barcode is accepted only when no OTHER barcode is within
 * `margin` of it: a pack with two plausible barcodes gets none.
 *
 * Only products at a DIFFERENT chain are candidates (a chain's own twin would have its own barcode already).
 * Validated by hold-out (hide a with-barcode product's barcode, match it, compare): see
 * price/scripts/hammer-match-eval.ts and the numbers in RULINGS-style notes at the top of that file.
 */

export interface MatchProduct {
  readonly id: string;
  readonly vendor: string;
  readonly name: string;
  readonly units: string;
  readonly brand: string;
  readonly code: string | null;
}

export type SizeFamily = 'mass' | 'volume' | 'count';
export interface Size {
  readonly family: SizeFamily;
  /** Grams, millilitres or pieces. */
  readonly base: number;
}

const UNIT_TABLE: Readonly<Record<string, { family: SizeFamily; factor: number }>> = {
  mg: { family: 'mass', factor: 0.001 },
  g: { family: 'mass', factor: 1 },
  gr: { family: 'mass', factor: 1 },
  gram: { family: 'mass', factor: 1 },
  grams: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  kilo: { family: 'mass', factor: 1000 },
  kilogram: { family: 'mass', factor: 1000 },
  kilograms: { family: 'mass', factor: 1000 },
  oz: { family: 'mass', factor: 28.349523125 },
  ounce: { family: 'mass', factor: 28.349523125 },
  ounces: { family: 'mass', factor: 28.349523125 },
  lb: { family: 'mass', factor: 453.59237 },
  lbs: { family: 'mass', factor: 453.59237 },
  pound: { family: 'mass', factor: 453.59237 },
  pounds: { family: 'mass', factor: 453.59237 },
  ml: { family: 'volume', factor: 1 },
  millilitre: { family: 'volume', factor: 1 },
  millilitres: { family: 'volume', factor: 1 },
  milliliter: { family: 'volume', factor: 1 },
  milliliters: { family: 'volume', factor: 1 },
  cl: { family: 'volume', factor: 10 },
  dl: { family: 'volume', factor: 100 },
  l: { family: 'volume', factor: 1000 },
  lt: { family: 'volume', factor: 1000 },
  litre: { family: 'volume', factor: 1000 },
  litres: { family: 'volume', factor: 1000 },
  liter: { family: 'volume', factor: 1000 },
  liters: { family: 'volume', factor: 1000 },
  floz: { family: 'volume', factor: 29.5735295625 },
  count: { family: 'count', factor: 1 },
  ct: { family: 'count', factor: 1 },
  pk: { family: 'count', factor: 1 },
  pack: { family: 'count', factor: 1 },
  pcs: { family: 'count', factor: 1 },
  pc: { family: 'count', factor: 1 },
  pieces: { family: 'count', factor: 1 },
  piece: { family: 'count', factor: 1 },
  units: { family: 'count', factor: 1 },
  each: { family: 'count', factor: 1 },
  ea: { family: 'count', factor: 1 },
  un: { family: 'count', factor: 1 },
};

const UNIT_WORDS = Object.keys(UNIT_TABLE)
  .filter((u) => u !== 'floz')
  .sort((a, b) => b.length - a.length)
  .join('|');
const NUM = String.raw`\d+(?:[.,]\d+)?|\.\d+`;
/** "6 x 355 ml", "355ml", "3 lb", "12 fl oz", "4 per pack", "0.312kg". Fraction-free on purpose. */
const SIZE_RE = new RegExp(
  String.raw`(?<![a-z0-9.])(?:(\d{1,3})\s*[x×]\s*)?(${NUM})\s*(fl\.?\s*oz|per\s+pack|${UNIT_WORDS})(?![a-z])`,
  'gi',
);

function lowerAscii(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function toNum(s: string): number {
  return Number(s.replace(',', '.'));
}

export interface SizeInfo {
  readonly sizes: Size[];
  /** Pack multiplicities above 1 the text states ("6 x 355 ml" is 6; "355 ml, 24 pack" is 24). */
  readonly packs: number[];
}

/** Every size a product states, in its units column and in its name (totals: "6 x 355 ml" is 2130 ml). */
export function parseSizeInfo(units: string, name: string): SizeInfo {
  const sizes: Size[] = [];
  const seen = new Set<string>();
  const add = (family: SizeFamily, base: number): void => {
    const key = `${family}:${base.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    sizes.push({ family, base });
  };
  const packs = new Set<number>();
  const counts: number[] = []; // counts that may sit beside a weight or volume: "355 mL cans, 24 pack"
  const singles: Array<{ family: SizeFamily; base: number }> = [];
  for (const text of [units, name]) {
    // Galleria writes "473ML*4" for a four-pack: say it the way everyone else does.
    const t = lowerAscii(text).replace(/(\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg|oz|lb))\s*\*\s*(\d{1,3})(?!\d)/g, '$2 x $1');
    for (const m of t.matchAll(SIZE_RE)) {
      const pack = m[1] ? Number(m[1]) : 1;
      const value = toNum(m[2]);
      let unit = m[3].replace(/\./g, '').replace(/\s+/g, '');
      if (unit === 'perpack') unit = 'pack';
      const def = UNIT_TABLE[unit];
      if (!def || !Number.isFinite(value) || value <= 0) continue;
      const base = pack * value * def.factor;
      // One piece says nothing about WHICH product it is.
      if (def.family === 'count' && base <= 1) continue;
      add(def.family, base);
      if (pack > 1) packs.add(pack);
      if (def.family === 'count') counts.push(base);
      else if (pack === 1) singles.push({ family: def.family, base });
    }
  }
  // A weight or volume together with a count: the count is a pack of that many, and the total is another size.
  if (singles.length > 0) {
    for (const n of counts) {
      packs.add(n);
      for (const s of singles) add(s.family, s.base * n);
    }
  }
  return { sizes, packs: [...packs] };
}

export function parseSizes(units: string, name: string): Size[] {
  return parseSizeInfo(units, name).sizes;
}

/** Pack counts agree when neither side states one, or both do and share one. */
export function packsAgree(a: readonly number[], b: readonly number[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length === 0 || b.length === 0) return false;
  return a.some((x) => b.includes(x));
}

export const SIZE_TOLERANCE = 0.015;

export function sizesAgree(a: readonly Size[], b: readonly Size[]): boolean {
  for (const x of a) for (const y of b) {
    if (x.family !== y.family) continue;
    if (Math.abs(x.base - y.base) <= SIZE_TOLERANCE * Math.max(x.base, y.base)) return true;
  }
  return false;
}

const STOP = new Set([
  'and', 'with', 'the', 'of', 'in', 'a', 'an', 'for', 'to', 'by', 'or', 'from', 'on',
  'pack', 'pk', 'bottle', 'bottles', 'can', 'cans', 'bag', 'bags', 'box', 'boxes', 'jar', 'pouch', 'tub', 'each', 'ea', 'un', 'count', 'ct', 'pcs', 'per', 'size',
]);

function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Words of a text: accents, apostrophes, parentheses and size phrases removed; "2%" is one word. */
export function words(text: string): string[] {
  let t = lowerAscii(text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/(?<=[a-z0-9])\.(?=[a-z0-9])/g, '')
    .replace(/&/g, ' and ');
  t = t.replace(SIZE_RE, ' ').replace(/(\d+(?:\.\d+)?)\s*%/g, '$1pct ');
  const out: string[] = [];
  for (const w of t.split(/[^a-z0-9]+/)) {
    if (w === '' || STOP.has(w)) continue;
    out.push(singular(w));
  }
  return out;
}

/** Brand values that are not brands. */
const NOT_A_BRAND = new Set(['out of stock', 'unknown', 'na', 'n a', 'none', 'generic']);

/** Words that describe a product and never name a maker, so "PC Organics" is the brand "pc" and "Organic" alone is no brand. */
const BRAND_NOISE = new Set(['organic', 'natural', 'fresh', 'farm', 'market', 'product', 'quality', 'premium', 'gluten', 'free']);

/** Fresh produce and herbs: packed by whoever grows or packs them, so one name is many barcodes. */
const PRODUCE = new Set([
  'apple', 'orange', 'lemon', 'lime', 'grapefruit', 'clementine', 'mandarin', 'tangerine', 'banana', 'pear', 'peach', 'plum', 'nectarine', 'apricot', 'cherry', 'grape',
  'strawberry', 'blueberry', 'raspberry', 'blackberry', 'cranberry', 'melon', 'cantaloupe', 'watermelon', 'pineapple', 'mango', 'papaya', 'kiwi', 'avocado', 'pomegranate',
  'potato', 'onion', 'garlic', 'ginger', 'carrot', 'celery', 'lettuce', 'spinach', 'kale', 'cabbage', 'broccoli', 'cauliflower', 'cucumber', 'tomato', 'pepper', 'zucchini',
  'squash', 'eggplant', 'mushroom', 'beet', 'radish', 'turnip', 'parsnip', 'asparagus', 'corn', 'bean', 'pea', 'leek', 'shallot', 'cilantro', 'parsley', 'basil', 'thyme',
  'rosemary', 'dill', 'mint', 'sage', 'chive', 'arugula', 'romaine', 'salad', 'sprout', 'yam', 'pumpkin', 'rhubarb', 'fennel', 'jalapeno', 'cactus', 'lychee', 'persimmon',
]);

function brandWordsOf(text: string): string[] {
  const w = words(text).filter((x) => !BRAND_NOISE.has(x));
  if (w.length === 0 || NOT_A_BRAND.has(w.join(' '))) return [];
  if (w.every((x) => PRODUCE.has(x))) return [];
  return w;
}

export interface MatchOptions {
  /** Lowest name overlap (0 to 1) a candidate must reach. */
  readonly minScore: number;
  /** How far the best barcode must lead the next barcode. */
  readonly margin: number;
}
export const DEFAULT_OPTIONS: MatchOptions = { minScore: 0.85, margin: 0.35 };

interface Entry {
  readonly product: MatchProduct;
  readonly code: string;
  readonly sizes: Size[];
  readonly packs: number[];
  readonly toks: number[]; // sorted unique token ids, name + brand
  readonly brand: number[]; // sorted unique token ids of the brand, [] when unknown
  readonly rest: number[]; // name words that are not the brand: what the score compares
}

export interface MatchResult {
  readonly code: string;
  readonly score: number;
  /** The runner-up barcode's score, 0 when there was none. */
  readonly runnerUp: number;
  /** The candidate product that supplied the barcode (best row of that barcode). */
  readonly twin: MatchProduct;
  /** Distinct chains carrying the accepted barcode among the candidates that agreed. */
  readonly chains: number;
  /** Which chains those are. */
  readonly vendors: string[];
}

export type MatchOutcome =
  | { readonly ok: true; readonly result: MatchResult }
  | { readonly ok: false; readonly reason: 'no-size' | 'no-candidate' | 'below-bar' | 'ambiguous' };

/** With no brand on either side, a name needs at least this many words to count as a specific product. */
const GENERIC_WORDS = 4;
const BUCKET =Math.log(1.03);
function bucketOf(family: SizeFamily, base: number): string {
  return `${family}:${Math.round(Math.log(base) / BUCKET)}`;
}

export class HammerMatcher {
  private readonly ids = new Map<string, number>();
  private readonly df: number[] = [];
  private readonly total: number;
  private weights: Float64Array = new Float64Array(0);
  private readonly pool: Entry[] = [];
  private readonly buckets = new Map<string, number[]>();
  private readonly brands = new Map<string, number[]>(); // first word -> brand word-lists, longest first
  readonly options: MatchOptions;
  private readonly groupOf: (vendor: string) => string;

  /** `all` is every Hammer product (idf and the known-brand list come from all of them); those with a barcode form the pool. */
  /** `groupOf` maps a vendor to its corporate group when two vendors should not vouch for each other (default: each vendor alone). */
  constructor(all: readonly MatchProduct[], options: MatchOptions = DEFAULT_OPTIONS, groupOf: (vendor: string) => string = (v) => v) {
    this.groupOf = groupOf;
    this.options = options;
    this.total = all.length;
    this.learnBrands(all);
    const prepared: Array<{ p: MatchProduct; toks: number[]; brand: number[]; rest: number[] }> = [];
    for (const p of all) {
      if (p.code === null) continue;
      const { toks, brand, rest } = this.tokenise(p, true);
      prepared.push({ p, toks, brand, rest });
    }
    // Document frequency over every product, barcoded or not: the words of no-barcode names count too.
    for (const p of all) {
      if (p.code !== null) continue;
      this.tokenise(p, true);
    }
    for (const p of all) this.countDf(p);
    this.weights = new Float64Array(this.df.length);
    for (let i = 0; i < this.df.length; i++) this.weights[i] = Math.log(1 + this.total / Math.max(1, this.df[i]));
    for (const { p, toks, brand, rest } of prepared) {
      const { sizes, packs } = parseSizeInfo(p.units, p.name);
      if (sizes.length === 0) continue;
      const idx = this.pool.length;
      this.pool.push({ product: p, code: p.code!, sizes, packs, toks, brand, rest });
      const seen = new Set<string>();
      for (const s of sizes) {
        const b = bucketOf(s.family, s.base);
        if (seen.has(b)) continue;
        seen.add(b);
        const list = this.buckets.get(b);
        if (list) list.push(idx);
        else this.buckets.set(b, [idx]);
      }
    }
  }

  private idOf(w: string): number {
    let id = this.ids.get(w);
    if (id === undefined) {
      id = this.ids.size;
      this.ids.set(w, id);
      this.df.push(0);
    }
    return id;
  }

  private countDf(p: MatchProduct): void {
    const { toks } = this.tokenise(p, false);
    for (const t of toks) this.df[t]++;
  }

  private learnBrands(all: readonly MatchProduct[]): void {
    const count = new Map<string, number>();
    for (const p of all) {
      const w = brandWordsOf(p.brand);
      if (w.length === 0 || w.length > 4) continue;
      const key = w.join(' ');
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    for (const [key, n] of count) {
      if (n < 3) continue;
      const ws = key.split(' ').map((w) => this.idOf(w));
      const first = key.split(' ')[0];
      const list = this.brandsByWord.get(first) ?? [];
      list.push(ws);
      this.brandsByWord.set(first, list);
    }
    for (const list of this.brandsByWord.values()) list.sort((a, b) => b.length - a.length);
  }
  private readonly brandsByWord = new Map<string, number[][]>();

  /** Word ids of a product's name + brand, and of its brand alone. */
  private tokenise(p: MatchProduct, grow: boolean): { toks: number[]; brand: number[]; rest: number[] } {
    const nameWords = words(p.name);
    let brandWords = brandWordsOf(p.brand);
    if (brandWords.length === 0) {
      const cands = this.brandsByWord.get(nameWords[0] ?? '');
      if (cands) {
        for (const b of cands) {
          let ok = b.length <= nameWords.length;
          for (let i = 0; ok && i < b.length; i++) if (this.ids.get(nameWords[i]) !== b[i]) ok = false;
          if (ok) { brandWords = nameWords.slice(0, b.length); break; }
        }
      }
    }
    const toId = (w: string): number | undefined => (grow ? this.idOf(w) : this.ids.get(w));
    const toks = new Set<number>();
    for (const w of [...nameWords, ...brandWords]) {
      const id = toId(w);
      if (id !== undefined) toks.add(id);
    }
    const brand = new Set<number>();
    for (const w of brandWords) {
      const id = toId(w);
      if (id !== undefined) brand.add(id);
    }
    const rest = [...toks].filter((t) => !brand.has(t));
    return { toks: [...toks].sort((a, b) => a - b), brand: [...brand].sort((a, b) => a - b), rest: rest.sort((a, b) => a - b) };
  }

  private weightOf(id: number): number {
    return id < this.weights.length ? this.weights[id] : Math.log(1 + this.total);
  }

  private score(a: readonly number[], b: readonly number[]): number {
    let inter = 0;
    let union = 0;
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (j >= b.length || (i < a.length && a[i] < b[j])) union += this.weightOf(a[i++]);
      else if (i >= a.length || b[j] < a[i]) union += this.weightOf(b[j++]);
      else { const w = this.weightOf(a[i]); inter += w; union += w; i++; j++; }
    }
    return union === 0 ? 0 : inter / union;
  }

  private produceIds: Set<number> | null = null;
  private isProduce(rest: readonly number[]): boolean {
    if (this.produceIds === null) {
      this.produceIds = new Set();
      for (const w of PRODUCE) {
        const id = this.ids.get(w);
        if (id !== undefined) this.produceIds.add(id);
      }
    }
    return rest.some((t) => this.produceIds!.has(t));
  }

  private static subset(a: readonly number[], b: readonly number[]): boolean {
    const s = new Set(b);
    return a.every((x) => s.has(x));
  }

  private brandsCompatible(q: { toks: number[]; brand: number[] }, c: Entry): boolean {
    if (q.brand.length > 0 && c.brand.length > 0) {
      return HammerMatcher.subset(q.brand, c.brand) || HammerMatcher.subset(c.brand, q.brand);
    }
    if (q.brand.length > 0) return HammerMatcher.subset(q.brand, c.toks);
    if (c.brand.length > 0) return HammerMatcher.subset(c.brand, q.toks);
    return true;
  }

  /** Best and runner-up barcode for `p` before any bar is applied (the eval sweeps the bar over this). */
  rank(p: MatchProduct): RankOutcome {
    const { sizes, packs } = parseSizeInfo(p.units, p.name);
    if (sizes.length === 0) return { ok: false, reason: 'no-size' };
    const q = this.tokenise(p, false);
    const idxs = new Set<number>();
    for (const s of sizes) {
      const b = Math.round(Math.log(s.base) / BUCKET);
      for (const d of [-1, 0, 1]) for (const i of this.buckets.get(`${s.family}:${b + d}`) ?? []) idxs.add(i);
    }
    const byCode = new Map<string, { score: number; entry: Entry; chains: Set<string> }>();
    let any = false;
    for (const i of idxs) {
      const c = this.pool[i];
      if (this.groupOf(c.product.vendor) === this.groupOf(p.vendor)) continue;
      if (!sizesAgree(sizes, c.sizes) || !packsAgree(packs, c.packs)) continue;
      if (!this.brandsCompatible(q, c)) continue;
      // "Blueberry 510 g" at two chains is two packers' fruit, not one product: no brand and a short name says nothing.
      if (q.brand.length === 0 && c.brand.length === 0 && (Math.min(q.rest.length, c.rest.length) < GENERIC_WORDS || this.isProduce(q.rest))) continue;
      any = true;
      const sc = this.score(q.rest, c.rest);
      const cur = byCode.get(c.code);
      if (!cur) byCode.set(c.code, { score: sc, entry: c, chains: new Set([c.product.vendor]) });
      else {
        if (sc > cur.score) { cur.score = sc; cur.entry = c; }
        cur.chains.add(c.product.vendor);
      }
    }
    if (!any) return { ok: false, reason: 'no-candidate' };
    let best: { score: number; entry: Entry; chains: Set<string> } | null = null;
    let second = 0;
    for (const v of byCode.values()) {
      if (best === null || v.score > best.score) { if (best) second = Math.max(second, best.score); best = v; }
      else second = Math.max(second, v.score);
    }
    if (best === null) return { ok: false, reason: 'no-candidate' };
    return { ok: true, best: { code: best.entry.code, score: best.score, twin: best.entry.product, chains: best.chains.size, vendors: [...best.chains] }, runnerUp: second };
  }

  /** The barcode of the unambiguous twin of `p` at another chain, or why there is none. */
  match(p: MatchProduct): MatchOutcome {
    const r = this.rank(p);
    if (!r.ok) return r;
    return decide(r, this.options);
  }
}

export type RankOutcome =
  | { readonly ok: true; readonly best: { code: string; score: number; twin: MatchProduct; chains: number; vendors: string[] }; readonly runnerUp: number }
  | { readonly ok: false; readonly reason: 'no-size' | 'no-candidate' };

/** Apply the bar to a ranking. */
export function decide(r: Extract<RankOutcome, { ok: true }>, o: MatchOptions): MatchOutcome {
  if (r.best.score < o.minScore) return { ok: false, reason: 'below-bar' };
  if (r.runnerUp > r.best.score - o.margin) return { ok: false, reason: 'ambiguous' };
  return { ok: true, result: { code: r.best.code, score: r.best.score, runnerUp: r.runnerUp, twin: r.best.twin, chains: r.best.chains, vendors: r.best.vendors } };
}
