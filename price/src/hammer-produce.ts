/**
 * Loose produce from Project Hammer: the rows that have no barcode because a shopper buys them by the
 * pound or kilogram (bananas, apples, oranges), joined to a PLU (price/src/plu.ts) and stored per lb under
 * the PLU's one key, so a shopper who scans or types a PLU gets a per-lb answer.
 *
 * PRECISION OVER RECALL. A row joins only on one of two strong signals, and a row that fits neither is
 * left out (counted, never guessed):
 *  1. The vendor's own SKU IS a PLU on the list (Metro, Save-On-Foods print it), the row carries a per-weight
 *     price, and the product name agrees with that PLU's list name (every word of the name is in the list name).
 *  2. The vendor marks the row as sold by weight (Loblaws and No Frills `_KG` ids, Voila and Sobeys `KG` ids,
 *     Galleria's `1LB` unit), it carries a per-weight price, and its name, normalised, equals the list name of
 *     exactly ONE code. "Gala Apples" fits several list rows (small, large, two codes each), so it joins nothing.
 * Per-piece prices ("$1.49 /un.", "$2.29/item") are never converted: a piece has no weight to convert by.
 *
 * Prices are stored per lb (the unit Canadian shelf tags show): a per-kg price is divided by 2.20462, a
 * per-100 g price multiplied by 4.5359237.
 */

import { pluList, pluByCode, pluKey, type PluRef } from './plu.ts';
import { canonicalCode } from './bcldb.ts';
import type { ObservationRow } from './store.ts';

/** The parts of a Hammer product and its latest price row this reads (hammer.ts types satisfy them). */
export interface LooseProduct {
  readonly id: string;
  readonly vendor: string;
  readonly name: string;
  readonly units: string;
  readonly url: string;
  readonly sku: string;
  readonly code: string | null;
}
export interface LooseLatest {
  readonly day: string;
  readonly current: string;
  readonly old: string;
  readonly perUnit: string;
  readonly other: string;
}

const KG_PER_LB = 0.45359237;

/** Words that say nothing about WHICH produce it is: pack, count, freshness, origin, units. */
const NOISE = new Set([
  'fresh', 'each', 'bunch', 'bag', 'bagged', 'sold', 'singles', 'single', 'individually', 'count', 'per', 'pack', 'ripe', 'in', 'days',
  'ea', 'un', 'gram', 'grams', 'g', 'kg', 'lb', 'lbs', 'usa', 'canada', 'product', 'of', 'the', 'a', 'and', 'bulk', 'loose', 'about', 'around', 'after',
]);

function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** A name as a set of singular words, sorted into one string; `organic` is read out, never part of the words. */
export function nameWords(name: string, dropNoise: boolean): { words: string[]; organic: boolean } {
  const lowered = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ');
  const organic = /\borganics?\b/.test(lowered);
  const words = lowered
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && w !== 'organic' && w !== 'organics' && !/^\d+$/.test(w))
    .map(singular)
    .filter((w) => !(dropNoise && NOISE.has(w)));
  return { words: [...new Set(words)].sort(), organic };
}

let byName: Map<string, string[]> | null = null;
/** List name (normalised, noise kept the way the list writes it) to every base code carrying it. */
function listByName(): Map<string, string[]> {
  if (byName === null) {
    byName = new Map();
    for (const [code, name] of Object.entries(pluList())) {
      const key = nameWords(name, true).words.join(' ');
      byName.set(key, [...(byName.get(key) ?? []), code]);
    }
  }
  return byName;
}

/** The one PLU base code whose list name equals this product name, or null when none or several do. */
export function uniquePluForName(name: string): { base: string; organic: boolean } | null {
  const { words, organic } = nameWords(name, true);
  if (words.length === 0) return null;
  const hit = listByName().get(words.join(' '));
  return hit && hit.length === 1 ? { base: hit[0], organic } : null;
}

/** A per-weight price text as cents per lb, or null (a per-piece or unreadable price is null). */
export function perLbCentsOf(text: string): number | null {
  const m = /^\$?\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d*(?:\.\d+)?)\s*(kg|kilogram|kilograms|lb|lbs|g|gram|grams)\b/i.exec(text.trim());
  if (!m) return null;
  const price = Number(m[1].replace(',', '.'));
  const qty = m[2] === '' ? 1 : Number(m[2]);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) return null;
  const unit = m[3].toLowerCase();
  const each = price / qty;
  // Per kg: a pound is 0.45359237 kg. Per gram: a pound is 453.59237 g. Per lb: as is.
  const perLb = unit.startsWith('kg') || unit.startsWith('kilogram') ? each * KG_PER_LB : unit.startsWith('lb') ? each : each * 453.59237;
  const cents = Math.round(perLb * 100);
  return cents > 0 ? cents : null;
}

/** A product that could be loose produce, from what the product file alone says (so only these need a price row read). */
export function looseCandidate(p: LooseProduct): boolean {
  if (p.code !== null) return false;
  switch (p.vendor) {
    case 'Metro':
    case 'SaveOnFoods':
      return /^9?[34]\d{3}$/.test(p.sku.trim());
    case 'Loblaws':
    case 'NoFrills':
      return /_KG$/.test(p.sku);
    case 'Voila':
    case 'Sobeys':
      return /\d+KG$/.test(p.sku);
    case 'Galleria':
      return /^1\s*lb$/i.test(p.units.trim());
    default:
      return false;
  }
}

export interface LooseMatch {
  readonly plu: PluRef;
  readonly perLbCents: number;
  /** 'sku': the vendor's own SKU is the PLU; 'name': the name equals exactly one list name. */
  readonly via: 'sku' | 'name';
}

/** Words that describe a size or a colour, not which produce it is ("Large, Fresh, 185 Gram" names nothing). */
const DESCRIPTORS = new Set(['large', 'small', 'medium', 'extra', 'jumbo', 'mini', 'baby', 'regular', 'red', 'green', 'yellow', 'white', 'black', 'purple']);

/**
 * Every word of the product name is a word of the list name (a product named more narrowly than its code is
 * refused), and at least one of them says which produce it is, not only its size or colour.
 */
function nameFitsList(productName: string, listName: string): boolean {
  const mine = nameWords(productName, true).words;
  if (!mine.some((w) => !DESCRIPTORS.has(w))) return false;
  const theirs = new Set(nameWords(listName, true).words);
  return mine.every((w) => theirs.has(w));
}

/** The PLU and per-lb price a loose-produce row stands for, or null. */
export function matchLoose(p: LooseProduct, l: LooseLatest): LooseMatch | null {
  if (!looseCandidate(p)) return null;
  const { organic } = nameWords(p.name, true);
  if (p.vendor === 'Metro' || p.vendor === 'SaveOnFoods') {
    const plu = pluByCode(p.sku.trim());
    if (!plu || !nameFitsList(p.name, plu.listName)) return null;
    // A name that says organic must sit on an organic code, and the other way round.
    if (organic !== plu.organic) return null;
    const perLb = perLbCentsOf(l.perUnit);
    // Metro prints a per-piece price for items sold singly: not a weight price, so nothing is stored.
    if (perLb === null) return null;
    return { plu, perLbCents: perLb, via: 'sku' };
  }
  const found = uniquePluForName(p.name);
  if (!found) return null;
  const plu = pluByCode(found.organic ? `9${found.base}` : found.base);
  if (!plu) return null;
  let perLb: number | null;
  if (p.vendor === 'Galleria') {
    const dollars = Number(l.current.replace(/[$,\s]/g, ''));
    perLb = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
  } else if (p.vendor === 'Sobeys') {
    // Sobeys prints the per-kg price in the price field itself: "6.59/kg".
    perLb = perLbCentsOf(l.current);
  } else {
    perLb = perLbCentsOf(l.perUnit);
  }
  if (perLb === null) return null;
  return { plu, perLbCents: perLb, via: 'name' };
}

/** A store's product name with the pack and shelf words taken off ("Beets - Bulk, Fresh, 170 Gram" -> "Beets"). */
export function cleanStoreName(name: string): string {
  const strip = (t: string): string =>
    t
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b\d+(?:\.\d+)?\s*(?:grams?|g|kg|lbs?|counts?|ct|un|ea)\b/gi, ' ')
      .replace(/\b(?:organic|fresh|bulk|bunch|loose|each|sold individually)\b/gi, ' ')
      .replace(/[,;]/g, ' ')
      .replace(/^[\s-]+|[\s-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  // Save-On-Foods writes "Category - Variety, Size" ("Pears - Asian, Yellow"): variety first, category last.
  const parts = name.split(/\s+-\s+/);
  let s: string;
  if (parts.length === 2) {
    const head = strip(parts[0]);
    const tail = strip(parts[1]);
    if (tail === '') s = head;
    else if (head === '') s = tail;
    else {
      const tailWords = nameWords(tail, false).words;
      s = nameWords(head, false).words.every((w) => tailWords.includes(w)) ? tail : `${tail} ${head}`;
    }
  } else {
    s = strip(parts.join(' '));
  }
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) {
    return s.toLowerCase().replace(/(^|\s)([a-z])/g, (_m, sp: string, c: string) => sp + c.toUpperCase());
  }
  return s;
}

/**
 * The name a shopper reads for each PLU base code: the most common cleaned store name among its matched
 * rows (ties go to the longer name, then the first alphabetically). A store name that covers fewer than
 * half the words of the list name ("Squash" for "Yellow Zucchini/Gold Bar/Yellow Courgette Squash") is
 * ignored: it names the family, not the item. Written to price/src/plu-display.json by hammer.ts.
 */
export function pluDisplayNames(rows: ReadonlyArray<{ base: string; name: string }>): Record<string, string> {
  const votes = new Map<string, Map<string, { text: string; n: number }>>();
  for (const r of rows) {
    const text = cleanStoreName(r.name);
    if (text === '') continue;
    const listWords = nameWords(pluList()[r.base] ?? '', true).words;
    const mine = nameWords(text, true).words;
    if (listWords.length === 0 || mine.length === 0) continue;
    const covered = mine.filter((w) => listWords.includes(w)).length;
    if (covered < mine.length || mine.length * 2 < listWords.length) continue;
    const byText = votes.get(r.base) ?? new Map();
    const key = text.toLowerCase();
    const prev = byText.get(key);
    byText.set(key, { text: prev?.text ?? text, n: (prev?.n ?? 0) + 1 });
    votes.set(r.base, byText);
  }
  const out: Record<string, string> = {};
  for (const base of [...votes.keys()].sort()) {
    const best = [...votes.get(base)!.values()].sort((a, b) => b.n - a.n || b.text.length - a.text.length || a.text.localeCompare(b.text))[0];
    out[base] = best.text;
  }
  return out;
}

/** The observations a loose-produce match turns into: one per-lb price under the PLU's key. */
export function looseObservation(p: LooseProduct, l: LooseLatest, m: LooseMatch, seller: string, vendorName: string): ObservationRow {
  const sale = l.old.trim() !== '' || /sale/i.test(l.other);
  const iso = `${l.day.slice(0, 4)}-${l.day.slice(4, 6)}-${l.day.slice(6, 8)}`;
  return {
    code: canonicalCode(pluKey(m.plu.code)),
    seller,
    sellerSku: p.id,
    sellerName: `${p.name.trim()} 1 lb`,
    sellerBrand: null,
    priceCents: m.perLbCents,
    kind: sale ? 'promotional' : 'regular',
    unitPriceCents: m.perLbCents,
    unitLabel: '$/lb',
    currency: 'CAD',
    country: 'CA',
    region: 'ON',
    joinMethod: 'name',
    seenOn: iso,
    url: p.url || null,
    imageUrl: null,
    inStock: /out of stock/i.test(l.other) ? 0 : null,
    storeName: vendorName,
    storeCity: 'Toronto',
    wasCents: null,
    isSale: sale ? 1 : 0,
  };
}
