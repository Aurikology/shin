/**
 * TEXT OFF A PACK, IN; THE THREE PRODUCTS IT MOST LIKELY IS, OUT.
 *
 * The founders' plan of 2026-09-27: "Identify the object, price tag, cereal
 * box, container, all of these things will have text, we take these texts and
 * search it in our catalog, and return the top 3. Passive feature."
 *
 * This module takes TEXT ONLY. Where the text was read (on the phone, on a
 * server, by which OCR engine) is not decided, and nothing here assumes it.
 *
 * It is NOT a second search engine. Retrieval is `Catalogue.search` in
 * search.ts, unchanged. What this file does is the layer in front of it that a
 * typed query never needed, because a shopper types three clean words and a
 * reader hands over thirty noisy lines:
 *
 *   1. read every line once, pulling out the shelf price and the unit price
 *      (reported, never ranked on), and dropping promo, nutrition-panel,
 *      legal and number-only lines;
 *   2. repair the OCR confusions that break word search (0 for O, 1 for l,
 *      5 for s inside words; O for 0 inside numbers; rn for m as a variant);
 *   3. find one pack size ("540 g", "1.89 L", "12 x 355 mL") with the units
 *      table in units.ts;
 *   4. find a brand by asking the catalogue's own `brands` column whether a
 *      run of the text's words is a brand it knows;
 *   5. build a few queries (all the words; each product line; the rn/m
 *      variant), run each through `Catalogue.search`, merge, rerank with the
 *      weights below, dedupe by barcode, and cut to three.
 *
 * The rerank is here rather than in search.ts because search.ts ranks rows for
 * ONE query, and the question here is which row the whole label supports. A row
 * that three queries each put second is better evidence than one that a single
 * noisy query put first, and only a layer that sees every query can say so.
 */

import type { DatabaseSync } from 'node:sqlite';
import { toBaseSize } from './search.ts';
import type { Catalogue, Candidate, SearchQuery } from './search.ts';
import { parseQuantity, toComparison } from './units.ts';

/* ------------------------------------------------------------------------ */
/* Public types                                                             */
/* ------------------------------------------------------------------------ */

/** The one method of `Catalogue` this module calls. A real `Catalogue` satisfies it. */
export type TextSearcher = Pick<Catalogue, 'search'>;

/**
 * Is this run of words a brand the catalogue knows? Returns the catalogue's own
 * spelling of it, or null. `brandLookupFromDb` builds the real one.
 */
export interface BrandLookup {
  find(words: readonly string[]): string | null;
}

export interface TextMatchOptions {
  /** Where retrieval happens. Pass the live `Catalogue`. */
  readonly catalogue: TextSearcher;
  /**
   * How a brand is recognised. Without it no brand is detected and the brand
   * weight never fires; everything else still works.
   */
  readonly brands?: BrandLookup;
  /**
   * RULINGS "Catalogue scope": Canada is a column, filtered at read time.
   * Default true: only rows with sold_in_canada = 1 come back.
   */
  readonly canadaOnly?: boolean;
  /**
   * Whether search.ts may run its vector arm. Default FALSE, because that arm
   * blocks the thread for the length of a full-table scan (see
   * `SearchQuery.vectors`) and a passive feature fires often. Word search
   * covers every product by name.
   */
  readonly vectors?: boolean;
  /** Passed straight through to `SearchQuery.sources`. */
  readonly sources?: readonly string[];
}

export interface TextMatchCandidate {
  /** The catalogue's primary key, `product.code`. */
  readonly productId: string;
  /** The same code when it is a barcode (8 to 14 digits), null otherwise. */
  readonly barcode: string | null;
  readonly name: string;
  readonly brand: string | null;
  /** The row's printed quantity, or its parsed size, or null. */
  readonly size: string | null;
  /** 0..1, the weighted sum described at WEIGHTS. */
  readonly score: number;
  /** Indices into the input `lines` whose words or size this row answers to. */
  readonly supportingLines: readonly number[];
  readonly signals: {
    readonly nameRecall: number;
    readonly textPrecision: number;
    readonly brandAgrees: boolean;
    readonly sizeAgrees: boolean;
    /** 0-based best position this row reached in any one query's results. */
    readonly bestPosition: number;
  };
}

export interface ShelfPriceRead {
  /** Integer cents of the price as printed. For "2 FOR $5.00" this is 500. */
  readonly cents: number;
  /** How many items that price buys. 1 unless a multi-buy was printed. */
  readonly forCount: number;
  /** Exactly the characters it was read from. */
  readonly text: string;
  readonly line: number;
}

export interface UnitPriceRead {
  /** Cents per `per`. Can be fractional, as a unit price often is. */
  readonly cents: number;
  /** The unit the price is per, as printed and normalised: "100 g", "kg", "ea". */
  readonly per: string;
  readonly text: string;
  readonly line: number;
}

export interface SizeRead {
  /** Total size in the base unit: grams or millilitres. 12 x 355 mL is 4260. */
  readonly value: number;
  readonly unit: 'g' | 'ml';
  /** The per-item size when a multipack was printed, else null. */
  readonly each: number | null;
  readonly packCount: number | null;
  readonly text: string;
  readonly line: number;
}

export interface TextMatchResult {
  /** At most three, best first. Empty when the text named no product. */
  readonly candidates: readonly TextMatchCandidate[];
  /** Reported only. Never used to rank. */
  readonly shelfPrice: ShelfPriceRead | null;
  /** Reported only. Never used to rank. */
  readonly unitPrice: UnitPriceRead | null;
  /** What was read off the text, so a caller can see why the answer is what it is. */
  readonly read: {
    readonly brand: string | null;
    readonly brandLine: number | null;
    readonly size: SizeRead | null;
    readonly productLines: readonly number[];
    readonly droppedLines: readonly number[];
    readonly queries: readonly string[];
  };
}

/* ------------------------------------------------------------------------ */
/* Tuning, stated                                                           */
/* ------------------------------------------------------------------------ */

/**
 * THE RERANK WEIGHTS. They sum to 1, so a score is a fraction of the evidence
 * a label could possibly give.
 *
 *   nameRecall     0.40  How much of the ROW'S name is printed on the pack.
 *                        The strongest single signal: a pack almost always
 *                        prints its own product name, and a row whose name is
 *                        all there is very likely the thing. Measured per name
 *                        (name, name_en, name_fr) and the best one kept, so a
 *                        bilingual pack answers to either language.
 *   brand          0.25  The row's brand is one the text named. Brand is what
 *                        separates a Kellogg's Corn Flakes from a store-brand
 *                        Corn Flakes whose NAME is word-for-word the same, and
 *                        word search cannot see that difference on its own.
 *   size           0.15  The row's size is within 5% of the size printed.
 *                        Smaller than brand because packs print per-unit,
 *                        drained and rounded sizes (search.ts pinTier says the
 *                        same thing), so a size miss is weaker evidence.
 *   textPrecision  0.10  How much of the PACK'S product words the row
 *                        explains. Low for every row on a busy box, so it only
 *                        breaks near-ties.
 *   retrieval      0.10  1 / (1 + best 0-based position in any query). Lets
 *                        search.ts's own ordering (BM25, Canada boost, ring
 *                        boost) settle what the label evidence cannot.
 *
 * Brand plus size together (0.40) equal a whole name match, which is the
 * intended trade: a row with the right brand and size and two thirds of its
 * name printed beats a store-brand row whose name is fully printed but whose
 * brand and size are both wrong.
 */
const WEIGHTS = {
  nameRecall: 0.4,
  brand: 0.25,
  size: 0.15,
  textPrecision: 0.1,
  retrieval: 0.1,
} as const;

/**
 * A row is kept only when the label supports its NAME at all. Brand and size
 * alone would return any Kellogg's 540 g box for a Corn Flakes pack, which is
 * garbage dressed as an answer. Half the row's name, or any of it plus an
 * agreeing brand or size.
 */
const MIN_NAME_RECALL_ALONE = 0.5;

/** How many rows each query asks search.ts for, before the Canada filter. */
const PER_QUERY_LIMIT = 20;

/**
 * At most this many searches per scan. Each is a synchronous FTS query that
 * can fall to the OR pass (hundreds of ms on a narrow match, search.ts's
 * measurement), and this runs passively.
 */
const MAX_QUERIES = 4;

/** Words kept for the combined query; beyond this a label is mostly noise. */
const MAX_QUERY_WORDS = 10;

/** Brand probes against the database per scan. */
const MAX_BRAND_PROBES = 40;

const TOP_N = 3;

/* ------------------------------------------------------------------------ */
/* Word lists                                                               */
/* ------------------------------------------------------------------------ */

/** Shelf-tag and flyer words that describe the deal, never the product. English and French. */
const PROMO = new Set([
  'sale', 'solde', 'soldes', 'special', 'speciale', 'save', 'economisez', 'economiser', 'reg',
  'regular', 'regulier', 'was', 'ord', 'rabais', 'prix', 'price', 'each', 'ea', 'chacun', 'ch',
  'for', 'pour', 'bonus', 'new', 'nouveau', 'nouvelle', 'limit', 'limite', 'only', 'seulement',
  'rollback', 'clearance', 'liquidation', 'off', 'buy', 'achetez', 'get', 'obtenez', 'free',
  'gratuit', 'deal', 'offer', 'offre', 'value', 'valeur', 'net', 'wt', 'weight', 'poids', 'format',
  'size', 'club', 'points', 'unit', 'unite', 'per', 'par', 'le', 'la',
]);

/** Function words in both languages. Never a query word on their own. */
const STOP = new Set([
  'and', 'et', 'the', 'les', 'de', 'du', 'des', 'au', 'aux', 'of', 'with', 'avec', 'en', 'in',
  'to', 'or', 'ou', 'a', 'an', 'un', 'une', 'd', 'l', 's', 'x',
]);

/**
 * Words too common to be a brand on their own even if some row somewhere uses
 * one as a brand. A starting list, not a lexicon: it only guards single-word
 * brand guesses; a two- or three-word brand is never checked against it.
 */
const NOT_A_BRAND_ALONE = new Set([
  'original', 'classic', 'natural', 'organic', 'organique', 'biologique', 'cereal', 'cereales',
  'flakes', 'corn', 'milk', 'lait', 'chocolate', 'chocolat', 'whole', 'grain', 'grains', 'wheat',
  'rice', 'riz', 'honey', 'miel', 'sugar', 'sucre', 'salt', 'sel', 'water', 'eau', 'juice', 'jus',
  'cheese', 'fromage', 'bread', 'pain', 'butter', 'beurre', 'peanut', 'creamy', 'smooth', 'crunchy',
  'family', 'pack', 'fresh', 'frais', 'fraiche', 'light', 'diet', 'zero', 'canada', 'product',
  'food', 'foods', 'drink', 'boisson', 'snack', 'snacks', 'oats', 'avoine', 'nuts', 'noix',
]);

/* ------------------------------------------------------------------------ */
/* Text helpers                                                             */
/* ------------------------------------------------------------------------ */

/** Lower case, accents off: "Maïs" and "MAIS" are one word. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The word split FTS's unicode61 tokenizer uses, near enough: letters and digits. */
function words(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * O read for 0 inside a number: "54O g" is 540 g, "5OO mL" is 500 mL. Only
 * where a digit is on one side, so a word with an O in it is never touched.
 */
function repairDigits(s: string): string {
  let prev = '';
  let out = s;
  while (prev !== out) {
    prev = out;
    out = out.replace(/(\d)[Oo](?=[\dOo]|\s*(?:g|kg|ml|l|lb|oz)\b)/gi, '$10').replace(/(\d[.,]?)[Oo](\d)/g, '$10$2');
  }
  return out;
}

/**
 * Digits read for letters inside a word: "C0RN" is corn, "KELL0GG" kellogg,
 * "5UGAR" sugar. Only in a token that is mostly letters and is not shaped like
 * a quantity ("540g", "12x355ml"), so a size or a model number is left alone.
 */
function repairWord(w: string): string {
  if (!/[a-z]/.test(w) || !/\d/.test(w)) return w;
  if (/^\d+(?:[.,]\d+)?[a-z]{1,3}$/.test(w) || /^\d+x\d+/.test(w)) return w;
  const letters = (w.match(/[a-z]/g) ?? []).length;
  const digits = (w.match(/\d/g) ?? []).length;
  if (letters <= digits) return w;
  return w.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's');
}

/**
 * A comparison key that forgives the confusions OCR makes most, so a pack
 * word and a row word can be matched even when neither was repaired: rn and
 * m, vv and w, and the i/l/1 stroke. Both sides go through it.
 */
function ocrKey(w: string): string {
  return w.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[i1]/g, 'l').replace(/0/g, 'o');
}

/** Within one edit, for words long enough that one edit is still the same word. */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenMatches(packWord: string, rowWords: readonly string[]): boolean {
  const k = ocrKey(packWord);
  return rowWords.some((r) => nearlyEqual(k, ocrKey(r)));
}

/** A word worth searching on: not promo, not a function word, not a bare number. */
function isContentWord(w: string): boolean {
  if (w.length < 2) return false;
  if (PROMO.has(w) || STOP.has(w)) return false;
  if (/^\d+$/.test(w)) return false;
  if (/^\d+(?:[.,]\d+)?[a-z]{1,3}$/.test(w)) return false;
  return true;
}

function normalizeBrand(b: string): string {
  return fold(b).replace(/[^a-z0-9]/g, '');
}

/* ------------------------------------------------------------------------ */
/* Prices                                                                   */
/* ------------------------------------------------------------------------ */

const PRICE_CORE = String.raw`\$\s*\d{1,4}(?:[.,]\d{2})?(?!\d)|\d{1,4}[.,]\d{2}\s*\$|\d{1,3}\s*¢`;
const UNIT_WORDS = String.raw`kg|g|mg|lb|oz|ml|l|cl|ea|each|ch|unit|unite`;
const UNIT_PRICE_RE = new RegExp(
  String.raw`(${PRICE_CORE})\s*(?:/|\bper\b|\bpour\b|\ble\b|\bla\b)\s*(\d+(?:[.,]\d+)?)?\s*(${UNIT_WORDS})\b\.?`,
  'gi',
);
const PRICE_RE = new RegExp(PRICE_CORE, 'gi');
/** "2 FOR", "2 POUR", "2/" immediately before a price. */
const MULTI_BUY_RE = /\b(\d{1,2})\s*(?:for|pour|\/)\s*$/i;
/** A regular or former price, printed beside the sale one. */
const REGULAR_RE = /\b(?:reg|regular|was|ord|regulier|avant)\b\.?\s*:?\s*$/i;

/** "$4.99", "4,99 $", "$5", "99¢" to integer cents. Null when it will not parse. */
function moneyCents(text: string): number | null {
  const t = text.replace(/\s+/g, '');
  if (t.includes('¢')) {
    const n = Number(t.replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const m = /(\d{1,4})(?:[.,](\d{1,2}))?/.exec(t);
  if (!m) return null;
  const cents = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return Number(m[1]) * 100 + cents;
}

/* ------------------------------------------------------------------------ */
/* Noise lines                                                              */
/* ------------------------------------------------------------------------ */

/** A heading or legal line that is never the product's name. Matched on folded text. */
const NOISE_HEADER_RE =
  /(nutrition facts|valeur nutritive|daily value|valeur quotidienne|\bcalories\b|\bingredients?\b|\bcontains\b|\bcontient\b|may contain|peut contenir|best before|meilleur avant|product of|produit du|produit de|distributed by|distribue par|www\.|\.com\b|\.ca\b|serving size|per serving|par portion|\bper\s+\d|\bpour\s+\d+\s*(?:tasse|cup|g|ml)\b|% dv|% vq)/;
/** A nutrient word AND an amount: "Fat 2 g", "Sodium 200 mg". "Protein Bar" stays. */
const NUTRIENT_RE =
  /\b(fat|lipides|saturated|satures|trans|cholesterol|sodium|carbohydrates?|glucides|fibre|fiber|fibres|sugars|sucres|protein|proteines|vitamine?|calcium|potassium|iron|fer|energy|energie)\b/;
const AMOUNT_RE = /\d+(?:[.,]\d+)?\s*(?:g|mg|mcg|%|kcal|kj)\b/;

function isNoiseLine(folded: string): boolean {
  if (NOISE_HEADER_RE.test(folded)) return true;
  return NUTRIENT_RE.test(folded) && AMOUNT_RE.test(folded);
}

/* ------------------------------------------------------------------------ */
/* Size                                                                     */
/* ------------------------------------------------------------------------ */

/** mg is left out on purpose: it is a nutrient amount or a dose, never a pack. */
const SIZE_RE =
  /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?|[.,]\d+)\s*(fl\.?\s*oz|kg|g|gr|ml|cl|dl|l|lt|lb|lbs|oz)\b/gi;

function findSize(text: string, line: number): SizeRead | null {
  SIZE_RE.lastIndex = 0;
  for (let m = SIZE_RE.exec(text); m; m = SIZE_RE.exec(text)) {
    const before = fold(text.slice(Math.max(0, m.index - 6), m.index));
    // "per 100 g", "pour 100 g", "/100 g": a unit price's denominator, not the pack.
    if (/(?:\/|\bper|\bpour)\s*$/.test(before)) continue;
    const parsed = parseQuantity(m[0].replace('×', 'x'));
    if (!parsed) continue;
    const cmp = toComparison(parsed.value, parsed.unit);
    if (!cmp || cmp.family === 'count') continue;
    const unit = cmp.baseUnit as 'g' | 'ml';
    const each = parsed.packCount ? cmp.baseValue / parsed.packCount : null;
    return {
      value: round(cmp.baseValue),
      unit,
      each: each === null ? null : round(each),
      packCount: parsed.packCount,
      text: m[0].trim(),
      line,
    };
  }
  return null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------------ */
/* Reading the lines                                                        */
/* ------------------------------------------------------------------------ */

interface ReadLine {
  readonly index: number;
  /** Repaired content words, in order. Empty means the line was dropped. */
  readonly content: string[];
  /** Every repaired word, for brand n-grams (apostrophe halves included). */
  readonly all: string[];
}

interface Reading {
  readonly lines: ReadLine[];
  readonly dropped: number[];
  readonly shelfPrice: ShelfPriceRead | null;
  readonly unitPrice: UnitPriceRead | null;
  readonly size: SizeRead | null;
}

function readLines(lines: readonly string[]): Reading {
  const out: ReadLine[] = [];
  const dropped: number[] = [];
  let unitPrice: UnitPriceRead | null = null;
  const prices: (ShelfPriceRead & { regular: boolean })[] = [];
  let size: SizeRead | null = null;

  lines.forEach((raw, index) => {
    let text = repairDigits(String(raw ?? ''));

    // Unit prices first, so their "$1.10" is never mistaken for the shelf price.
    text = text.replace(UNIT_PRICE_RE, (whole, price: string, qty: string | undefined, unit: string) => {
      const cents = moneyCents(price);
      if (cents !== null && unitPrice === null) {
        const per = qty ? `${qty.replace(',', '.')} ${unit.toLowerCase()}` : unit.toLowerCase();
        unitPrice = { cents, per, text: whole.trim(), line: index };
      }
      return ' ';
    });

    PRICE_RE.lastIndex = 0;
    text = text.replace(PRICE_RE, (whole: string, offset: number, str: string) => {
      const cents = moneyCents(whole);
      if (cents !== null) {
        const before = str.slice(Math.max(0, offset - 12), offset);
        const multi = MULTI_BUY_RE.exec(before);
        prices.push({
          cents,
          forCount: multi ? Number(multi[1]) : 1,
          text: (multi ? multi[0] : '') + whole.trim(),
          line: index,
          regular: REGULAR_RE.test(fold(before)),
        });
      }
      return ' ';
    });

    const folded = fold(text);
    if (isNoiseLine(folded)) {
      dropped.push(index);
      return;
    }

    const found = findSize(text, index);
    if (found && size === null) size = found;
    if (found) {
      SIZE_RE.lastIndex = 0;
      text = text.replace(SIZE_RE, ' ');
    }

    const all = words(text).map(repairWord);
    const content = all.filter(isContentWord);
    if (content.length === 0) {
      dropped.push(index);
      return;
    }
    out.push({ index, content, all });
  });

  // The current price, not the "reg" one beside it; the regular one only when
  // nothing else was printed.
  const current = prices.find((p) => !p.regular) ?? prices[0] ?? null;
  const shelfPrice: ShelfPriceRead | null = current
    ? { cents: current.cents, forCount: current.forCount, text: current.text, line: current.line }
    : null;

  return { lines: out, dropped, shelfPrice, unitPrice, size };
}

/* ------------------------------------------------------------------------ */
/* Brand                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * A brand lookup backed by the catalogue's own FTS index, `brands` column only.
 *
 * A phrase query on one indexed column is a posting-list intersection, not a
 * scan, so it stays cheap on 5.18M rows. A hit is accepted only when the run of
 * words, run together, EQUALS one of the row's brands run together: "kellogg s"
 * is "kelloggs" is "Kellogg's", and "corn" does not become a brand because some
 * brand string somewhere contains the word.
 *
 * Read-only: one SELECT per probe, nothing written.
 */
export function brandLookupFromDb(db: DatabaseSync): BrandLookup {
  const stmt = db.prepare(
    `SELECT DISTINCT p.brands AS brands
       FROM product_fts f JOIN product p ON p.rowid = f.rowid
      WHERE product_fts MATCH ?
      LIMIT 25`,
  );
  return {
    find(ws: readonly string[]): string | null {
      const clean = ws.map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
      if (clean.length === 0) return null;
      const want = clean.join('');
      let rows: { brands: string | null }[];
      try {
        rows = stmt.all(`brands : "${clean.join(' ')}"`) as unknown as { brands: string | null }[];
      } catch {
        return null;
      }
      for (const r of rows) {
        for (const part of (r.brands ?? '').split(',')) {
          if (normalizeBrand(part) === want) return part.trim();
        }
      }
      return null;
    },
  };
}

/**
 * The brands the text names, best first: longer runs of words before shorter
 * ones (a three-word brand is less likely to be an accident), then earlier
 * lines before later ones (packs lead with the brand).
 */
function detectBrands(
  reading: Reading,
  lookup: BrandLookup | undefined,
): { brand: string; line: number; words: string[] }[] {
  if (!lookup) return [];
  const found: { brand: string; line: number; words: string[]; n: number }[] = [];
  const asked = new Map<string, string | null>();
  let probes = 0;
  for (const line of reading.lines) {
    const ws = line.all;
    for (let n = 3; n >= 1; n -= 1) {
      for (let i = 0; i + n <= ws.length; i += 1) {
        const run = ws.slice(i, i + n);
        // A run may not start or end on filler, and a lone word must look like a name.
        // "l oreal" and "d italiano" are elided articles inside a brand, so a
        // lone l or d may open a run; "kellogg s" may close one.
        const opensOnFiller = (STOP.has(run[0]) && !(n > 1 && (run[0] === 'l' || run[0] === 'd'))) || PROMO.has(run[0]);
        const closesOnFiller = n > 1 && STOP.has(run[n - 1]) && run[n - 1] !== 's';
        if (opensOnFiller || closesOnFiller) continue;
        if (run.every((w) => STOP.has(w) || PROMO.has(w) || /^\d+$/.test(w))) continue;
        if (n === 1 && (run[0].length < 3 || NOT_A_BRAND_ALONE.has(run[0]) || /^\d/.test(run[0]))) continue;
        const key = run.join(' ');
        if (!asked.has(key)) {
          if (probes >= MAX_BRAND_PROBES) continue;
          probes += 1;
          asked.set(key, lookup.find(run));
        }
        const brand = asked.get(key);
        if (brand && !found.some((f) => normalizeBrand(f.brand) === normalizeBrand(brand))) {
          found.push({ brand, line: line.index, words: run, n });
        }
      }
    }
  }
  found.sort((a, b) => b.n - a.n || a.line - b.line);
  return found.slice(0, 3);
}

/** Same rule as search.ts's brandAgreesWith, which is not exported. */
function brandAgrees(rowBrands: string | null, brand: string): boolean {
  if (!rowBrands) return false;
  const want = normalizeBrand(brand);
  if (!want) return false;
  return (
    normalizeBrand(rowBrands).includes(want) ||
    want.includes(normalizeBrand(rowBrands.split(',')[0] ?? '') || '\u0000')
  );
}

function sizeAgrees(c: Candidate, size: SizeRead): boolean {
  let row = toBaseSize(c.sizeValue, c.sizeUnit);
  if (!row && c.quantity) {
    const q = parseQuantity(c.quantity);
    const cmp = q ? toComparison(q.value, q.unit) : null;
    if (cmp && cmp.family !== 'count') row = { value: cmp.baseValue, base: cmp.baseUnit as 'g' | 'ml' };
  }
  if (!row || row.base !== size.unit) return false;
  const readings = [size.value, size.each].filter((v): v is number => v !== null && v > 0);
  return readings.some((v) => Math.abs(row!.value - v) / v <= 0.05);
}

/* ------------------------------------------------------------------------ */
/* The entry point                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The top three catalogue products a package's or shelf tag's text supports.
 *
 * `lines` are the raw lines in reading order, noise and all. Nothing here
 * throws on odd input; text naming no product returns no candidates rather
 * than the least-bad guess.
 *
 * Note one side effect that is search.ts's, not this file's: a query that
 * finds nothing is recorded in the miss log (gaps.ts), exactly as a typed
 * search that finds nothing is. Queries are only issued when the text has
 * product words, so a price-only tag never reaches it.
 */
export async function topMatchesFromText(
  lines: readonly string[],
  opts: TextMatchOptions,
): Promise<TextMatchResult> {
  const canadaOnly = opts.canadaOnly ?? true;
  const reading = readLines(lines);
  const brands = detectBrands(reading, opts.brands);
  const brand = brands[0] ?? null;
  const size = reading.size;

  const empty = (queries: string[]): TextMatchResult => ({
    candidates: [],
    shelfPrice: reading.shelfPrice,
    unitPrice: reading.unitPrice,
    read: {
      brand: brand?.brand ?? null,
      brandLine: brand?.line ?? null,
      size,
      productLines: reading.lines.map((l) => l.index),
      droppedLines: reading.dropped,
      queries,
    },
  });

  // Product words are the content words that are not the brand's own.
  const brandWords = new Set(brands.flatMap((b) => b.words));
  const productWords: string[] = [];
  for (const l of reading.lines) {
    for (const w of l.content) if (!brandWords.has(w) && !productWords.includes(w)) productWords.push(w);
  }
  if (productWords.length === 0) return empty([]);

  /* Queries, in priority order, deduped, capped. */
  const queries: string[] = [];
  const add = (q: string) => {
    const t = q.trim();
    if (t && !queries.includes(t) && queries.length < MAX_QUERIES) queries.push(t);
  };
  const brandText = brand ? brand.words.join(' ') : '';
  const combined = `${brandText} ${productWords.slice(0, MAX_QUERY_WORDS).join(' ')}`;
  add(combined);
  // Each product line alone: on a bilingual pack the English line and the French
  // line each match their own row strictly, where the two together match nothing.
  for (const l of reading.lines) {
    const own = l.content.filter((w) => !brandWords.has(w));
    if (own.length > 0) add(own.join(' '));
  }
  // rn read for m: "Crearny" is "Creamy". Asked as its own query so a real "rn"
  // word is never lost from the others, and never at a word's end, where rn is
  // almost always real ("corn", "popcorn", "acorn").
  const rnFixed = combined.replace(/rn(?=[a-z])/g, 'm');
  if (rnFixed !== combined) {
    if (queries.length >= MAX_QUERIES) queries.pop();
    add(rnFixed);
  }

  const base: SearchQuery = {
    limit: PER_QUERY_LIMIT,
    vectors: opts.vectors ?? false,
    ...(brand ? { brand: brand.brand } : {}),
    ...(size
      ? { sizeValue: size.value, sizeUnit: size.unit, ...(size.each !== null ? { sizeValueAlt: size.each } : {}) }
      : {}),
    ...(opts.sources && opts.sources.length > 0 ? { sources: opts.sources } : {}),
  };

  /* Retrieve, merge by barcode, keep each row's best position. */
  const pool = new Map<string, { c: Candidate; best: number }>();
  for (const text of queries) {
    const result = await opts.catalogue.search({ ...base, text });
    const kept = result.candidates.filter((c) => !canadaOnly || c.soldInCanada);
    kept.forEach((c, pos) => {
      const key = c.code.replace(/\D/g, '').replace(/^0+/, '') || c.code;
      const had = pool.get(key);
      if (!had || pos < had.best) pool.set(key, { c, best: pos });
    });
  }

  /* Rerank. */
  const packWords = new Set<string>([...productWords, ...brandWords]);
  const packWordList = [...packWords];
  const scored: TextMatchCandidate[] = [];
  for (const { c, best } of pool.values()) {
    const names = [c.name, c.nameEn, c.nameFr].filter((n): n is string => !!n);
    let nameRecall = 0;
    for (const n of names) {
      const nw = words(n).filter((w) => w.length > 1 && !STOP.has(w));
      if (nw.length === 0) continue;
      const hit = nw.filter((w) => tokenMatches(w, packWordList)).length;
      nameRecall = Math.max(nameRecall, hit / nw.length);
    }
    const rowWords = words([...names, c.genericName ?? '', c.brands ?? ''].join(' '));
    const textPrecision = productWords.filter((w) => tokenMatches(w, rowWords)).length / productWords.length;
    const bAgrees = brands.some((b) => brandAgrees(c.brands, b.brand));
    const sAgrees = size ? sizeAgrees(c, size) : false;

    if (nameRecall === 0) continue;
    if (nameRecall < MIN_NAME_RECALL_ALONE && !bAgrees && !sAgrees) continue;

    const score =
      WEIGHTS.nameRecall * nameRecall +
      WEIGHTS.textPrecision * textPrecision +
      (bAgrees ? WEIGHTS.brand : 0) +
      (sAgrees ? WEIGHTS.size : 0) +
      WEIGHTS.retrieval * (1 / (1 + best));

    const supporting = reading.lines
      .filter((l) => l.content.some((w) => tokenMatches(w, rowWords)))
      .map((l) => l.index);
    if (sAgrees && size && !supporting.includes(size.line)) supporting.push(size.line);
    supporting.sort((a, b) => a - b);

    scored.push({
      productId: c.code,
      barcode: /^\d{8,14}$/.test(c.code) ? c.code : null,
      name: c.nameEn ?? c.name,
      brand: c.brands,
      size: c.quantity ?? (c.sizeValue !== null && c.sizeUnit ? `${c.sizeValue} ${c.sizeUnit}` : null),
      score: Math.round(Math.min(1, score) * 1000) / 1000,
      supportingLines: supporting,
      signals: { nameRecall: round(nameRecall), textPrecision: round(textPrecision), brandAgrees: bAgrees, sizeAgrees: sAgrees, bestPosition: best },
    });
  }

  scored.sort((a, b) => b.score - a.score || a.signals.bestPosition - b.signals.bestPosition);

  // Dedupe by barcode (the pool is keyed on it already; this also folds a row
  // listed twice under the same brand, name and size, as search.ts does).
  const seen = new Set<string>();
  const top: TextMatchCandidate[] = [];
  for (const s of scored) {
    const key = `${normalizeBrand(s.brand ?? '')}|${fold(s.name)}|${fold(s.size ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(s);
    if (top.length === TOP_N) break;
  }

  return { ...empty(queries), candidates: top };
}
