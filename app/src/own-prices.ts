/**
 * A typed product name, answered from Shin's own data and nothing else.
 *
 * Jamin, 2026-09-23: "typing a product should only search our catalogue and
 * only return when we have both the item and price." No model, no web search,
 * no network: every read here is a local SQLite file, opened read-only.
 *
 * WHERE SHIN HOLDS PRODUCTS WITH PRICES, enumerated 2026-09-23 over every .db
 * file in the repo:
 *   - price/data/prices.db, `observation`: crawled seller prices and Open
 *     Prices crowd receipts. Each row carries the product's own name, a store,
 *     an amount, a currency and the day it was seen. USED.
 *   - app/data/user-catalogue.db: `user_product` (what scans named), with
 *     prices in `user_offer` (the offers a scan's answer carried, currency and
 *     link inside `raw_json`) and `user_observation` (a shelf price a shopper
 *     typed, with the store when they gave one). USED. Every row is untrusted
 *     user data (`trusted = 0`) and is marked so on the way out.
 *   - catalogue/data/catalogue.db: 5 million products and no price column.
 *     Used only to NAME a product by its code when the caller hands in a probe;
 *     a catalogue product counts only when one of the two stores above has a
 *     price for its code.
 *   - Not used: price/data/corrections.db (one row, no currency column),
 *     app/data/repeat-cache.db and scans.db (stored Gemini answers, whose
 *     offers the user catalogue already keeps), gaps.db and people.db (no prices).
 *
 * A product-only match is not an answer. `match` is null unless a product
 * matched the typed words AND at least one dated price with a currency exists.
 *
 * Never throws. A missing or unreadable file is a source that contributed
 * nothing, named in `unavailable`, and the answer degrades to "no match".
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nameTokens, type CatalogueProbe } from '../../catalogue/src/user-catalogue.ts';
import { parseQuantity, toComparison, type ComparisonQuantity } from '../../catalogue/src/units.ts';

export const OWN_DATA_SOURCE = 'shin_own_data' as const;

export interface OwnPrice {
  /** The shop, as the source named it. */
  readonly store: string;
  /** In major units (4.99), as a price is shown. */
  readonly amount: number;
  readonly currency: string;
  /** When this price was seen: an ISO date or date-time, exactly as stored. */
  readonly observedAt: string;
  readonly url: string | null;
  readonly kind: 'regular' | 'promotional' | null;
  /** Which of Shin's stores holds it. */
  readonly from: 'prices' | 'user_offer' | 'user_shelf_price';
  /** User data is never fully trusted (Jamin, 2026-09-17); crawled and crowd rows are not checked either. */
  readonly trusted: false;
}

export interface OwnMatch {
  readonly name: string;
  readonly brand: string | null;
  /** The size as the source printed it, or null. */
  readonly size: string | null;
  readonly code: string | null;
  /** 0 to 1: how much of the product's name the typed words covered. */
  readonly score: number;
  /** Latest price per store, cheapest first. Never empty. */
  readonly prices: readonly OwnPrice[];
}

export interface OwnLookupSources {
  readonly pricesDbPath?: string | null;
  /** An already open user catalogue (the server's own handle), read before the path. */
  readonly userCatalogueDb?: DatabaseSync | null;
  readonly userCataloguePath?: string | null;
  /** Names catalogue products from the typed words. Optional; the catalogue has no prices of its own. */
  readonly catalogueProbe?: CatalogueProbe | null;
}

export interface OwnLookup {
  readonly match: OwnMatch | null;
  /** The stores that were read. */
  readonly searched: readonly string[];
  /** The stores that could not be read (missing file, bad schema). */
  readonly unavailable: readonly string[];
}

export function defaultPricesPath(): string {
  return process.env.SHIN_PRICES ?? fileURLToPath(new URL('../../price/data/prices.db', import.meta.url));
}

/* ------------------------------------------------------------- matching */

/** "chips" and "chip" are one word to a shopper. Short words and "-ss" words are left alone. */
function stem(t: string): string {
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t;
}

function tokensOf(s: string | null | undefined): string[] {
  return [...new Set(nameTokens(s ?? '').map(stem))];
}

/** Every typed word the product carries, and the typed words cover at least half of its name. */
const MIN_NAME_COVER = 0.5;
/** Two sizes within 5% are one size (the user catalogue's own rule). */
const SAME_SIZE_RATIO = 1.05;

function scoreOf(q: readonly string[], nameT: readonly string[], brandT: readonly string[]): number | null {
  if (q.length === 0 || nameT.length === 0) return null;
  const all = new Set([...nameT, ...brandT]);
  if (q.some((t) => !all.has(t))) return null;
  const name = new Set(nameT);
  const covered = q.filter((t) => name.has(t)).length;
  if (covered / name.size < MIN_NAME_COVER) return null;
  return q.length / new Set([...q, ...nameT]).size;
}

function sizeFrom(text: string | null | undefined): ComparisonQuantity | null {
  const p = parseQuantity(text);
  return p ? toComparison(p.value, p.unit) : null;
}

function sameSize(a: ComparisonQuantity, b: ComparisonQuantity): boolean {
  if (a.baseUnit !== b.baseUnit) return false;
  const r = a.baseValue / b.baseValue;
  return r <= SAME_SIZE_RATIO && r >= 1 / SAME_SIZE_RATIO;
}

/* --------------------------------------------------------------- prices */

/**
 * Hosts reserved for documentation and tests (RFC 2606 and RFC 6761). A price
 * whose link points there came from a test double, never from a shop: the
 * test suite has written such rows into the live user catalogue.
 */
function reservedHost(url: string | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    /(^|\.)example\.(com|net|org)$/.test(host) ||
    /\.(example|test|invalid|localhost)$/.test(host) ||
    host === 'localhost'
  );
}

function money(amount: unknown): number | null {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function padForms(code: string): string[] {
  const d = code.replace(/\D/g, '');
  const bare = d.replace(/^0+/, '') || d;
  return [...new Set([d, bare, bare.padStart(12, '0'), bare.padStart(13, '0'), bare.padStart(14, '0')])];
}

function pricesRows(db: DatabaseSync, where: string, args: string[]): OwnPrice[] {
  const rows = db
    .prepare(
      `SELECT seller, store_name, store_city, price_cents, currency, seen_on, url, kind
         FROM observation WHERE ${where}`,
    )
    .all(...args) as Record<string, unknown>[];
  const out: OwnPrice[] = [];
  for (const r of rows) {
    const cents = money(r.price_cents);
    const currency = text(r.currency);
    const seen = text(r.seen_on);
    const url = text(r.url);
    if (cents === null || currency === null || seen === null || reservedHost(url)) continue;
    const storeName = text(r.store_name);
    const city = text(r.store_city);
    const store = storeName ? (city ? `${storeName} (${city})` : storeName) : text(r.seller);
    if (store === null) continue;
    const kind = r.kind === 'promotional' ? 'promotional' : r.kind === 'regular' ? 'regular' : null;
    out.push({ store, amount: cents / 100, currency, observedAt: seen, url, kind, from: 'prices', trusted: false });
  }
  return out;
}

/** Offers and shelf prices the user catalogue holds under one ref ('u:<id>' or 'c:<code>'). */
function userRows(db: DatabaseSync, ref: string, productId: number | null, code: string | null): OwnPrice[] {
  const out: OwnPrice[] = [];
  // Latest per retailer and link, in SQL: one product has held 13,000 offer rows.
  const offers = db
    .prepare(
      `SELECT retailer, price, json_extract(raw_json, '$.currency') AS currency,
              json_extract(raw_json, '$.url') AS url, MAX(observed_at) AS observed_at
         FROM user_offer WHERE ref = ? AND price IS NOT NULL AND retailer IS NOT NULL
        GROUP BY lower(trim(retailer)), json_extract(raw_json, '$.url')`,
    )
    .all(ref) as Record<string, unknown>[];
  for (const r of offers) {
    const amount = money(r.price);
    const currency = text(r.currency);
    const seen = text(r.observed_at);
    const store = text(r.retailer);
    const url = text(r.url);
    if (amount === null || currency === null || seen === null || store === null || reservedHost(url)) continue;
    out.push({ store, amount, currency, observedAt: seen, url, kind: null, from: 'user_offer', trusted: false });
  }
  const shelf = db
    .prepare(
      `SELECT store_name, currency, price_cents, MAX(observed_at) AS observed_at
         FROM user_observation
        WHERE ${productId !== null ? 'product_id = ?' : 'catalogue_code = ?'}
          AND price_cents IS NOT NULL AND store_name IS NOT NULL AND currency IS NOT NULL
        GROUP BY lower(trim(store_name))`,
    )
    .all(productId !== null ? productId : (code ?? '')) as Record<string, unknown>[];
  for (const r of shelf) {
    const cents = money(r.price_cents);
    const currency = text(r.currency);
    const seen = text(r.observed_at);
    const store = text(r.store_name);
    if (cents === null || currency === null || seen === null || store === null) continue;
    out.push({ store, amount: cents / 100, currency, observedAt: seen, url: null, kind: null, from: 'user_shelf_price', trusted: false });
  }
  return out;
}

/** One price per store: the latest; on the same day, the lower one (what a shopper paid that day). */
function latestPerStore(all: readonly OwnPrice[]): OwnPrice[] {
  const by = new Map<string, OwnPrice>();
  for (const p of all) {
    const key = p.store.toLowerCase().replace(/\s+/g, ' ').trim();
    const have = by.get(key);
    if (
      !have ||
      p.observedAt > have.observedAt ||
      (p.observedAt === have.observedAt && p.amount < have.amount)
    ) {
      by.set(key, p);
    }
  }
  return [...by.values()].sort((a, b) => a.amount - b.amount || a.store.localeCompare(b.store));
}

/* ------------------------------------------------------------ candidates */

interface Candidate {
  readonly name: string;
  readonly brand: string | null;
  readonly sizeText: string | null;
  readonly size: ComparisonQuantity | null;
  readonly code: string | null;
  readonly score: number;
  /** Same words and same size: two rows for one product, merged. */
  readonly identity: string;
  readonly prices: () => OwnPrice[];
}

function openReadOnly(path: string | null | undefined): DatabaseSync | null {
  if (!path || !existsSync(path)) return null;
  return new DatabaseSync(path, { readOnly: true });
}

/** A LIKE prefilter on the longest plain-ASCII typed word, so a big table is not read whole. */
function likeWord(q: readonly string[]): string | null {
  const plain = q.filter((t) => /^[a-z0-9]+$/.test(t)).sort((a, b) => b.length - a.length);
  return plain.length ? `%${plain[0]}%` : null;
}

export function lookupOwnPrices(typed: string, sources: OwnLookupSources = {}): OwnLookup {
  const searched: string[] = [];
  const unavailable: string[] = [];
  const q = tokensOf(typed);
  const qSize = sizeFrom(typed);
  if (!q.some((t) => t.length >= 3)) return { match: null, searched, unavailable };
  const like = likeWord(q);
  const candidates: Candidate[] = [];
  const identityOf = (nameT: string[], brandT: string[], size: ComparisonQuantity | null) =>
    `${[...new Set([...nameT, ...brandT])].sort().join(' ')}|${size ? `${Math.round(size.baseValue)}${size.baseUnit}` : ''}`;

  const consider = (c: Omit<Candidate, 'score' | 'identity' | 'size'> & { size?: ComparisonQuantity | null }) => {
    const nameT = tokensOf(c.name);
    const brandT = tokensOf(c.brand?.split(',')[0]);
    const score = scoreOf(q, nameT, brandT);
    if (score === null) return;
    const size = c.size ?? sizeFrom(c.sizeText ?? c.name);
    if (qSize && size && !sameSize(qSize, size)) return;
    candidates.push({ ...c, size, score, identity: identityOf(nameT, brandT, size) });
  };

  let prices: DatabaseSync | null = null;
  let user: DatabaseSync | null = null;
  let ownUser = false;
  try {
    // 1. The crawled and crowd prices file.
    try {
      prices = openReadOnly(sources.pricesDbPath ?? defaultPricesPath());
      if (!prices) throw new Error('missing');
      const rows = prices
        .prepare(
          `SELECT DISTINCT code, seller, seller_sku, seller_name, seller_brand FROM observation
            WHERE seller_name <> '(unnamed)'${like ? " AND lower(seller_name || ' ' || coalesce(seller_brand, '')) LIKE ?" : ''}`,
        )
        .all(...(like ? [like] : [])) as Record<string, unknown>[];
      const db = prices;
      for (const r of rows) {
        const code = text(r.code);
        const seller = String(r.seller);
        const sku = String(r.seller_sku);
        consider({
          name: String(r.seller_name),
          brand: text(r.seller_brand),
          sizeText: null,
          code,
          prices: () =>
            code
              ? pricesRows(db, `code IN (${padForms(code).map(() => '?').join(',')})`, padForms(code))
              : pricesRows(db, 'seller = ? AND seller_sku = ?', [seller, sku]),
        });
      }
      searched.push('prices');
    } catch {
      unavailable.push('prices');
    }

    // 2. The user catalogue.
    try {
      user = sources.userCatalogueDb ?? null;
      if (!user) {
        user = openReadOnly(sources.userCataloguePath);
        ownUser = user !== null;
      }
      if (!user) throw new Error('missing');
      const rows = user
        .prepare(
          `SELECT id, name, brand, orig_value, orig_unit FROM user_product
            ${like ? "WHERE lower(name || ' ' || coalesce(brand, '')) LIKE ?" : ''}`,
        )
        .all(...(like ? [like] : [])) as Record<string, unknown>[];
      const db = user;
      for (const r of rows) {
        const id = Number(r.id);
        const origValue = typeof r.orig_value === 'number' ? r.orig_value : null;
        const origUnit = text(r.orig_unit);
        consider({
          name: String(r.name),
          brand: text(r.brand),
          sizeText: origValue !== null && origUnit ? `${origValue} ${origUnit}` : null,
          size: toComparison(origValue, origUnit),
          code: null,
          prices: () => userRows(db, `u:${id}`, id, null),
        });
      }
      searched.push('user_catalogue');
    } catch {
      unavailable.push('user_catalogue');
    }

    // 3. The big catalogue, for names only: its products are priced by code from the two stores above.
    if (sources.catalogueProbe) {
      try {
        const hits = sources.catalogueProbe({ gtin: null, name: typed, brand: null, tokens: nameTokens(typed) });
        for (const h of hits) {
          consider({
            name: h.name,
            brand: h.brands,
            sizeText: null,
            size: toComparison(h.sizeValue, h.sizeUnit),
            code: h.code,
            prices: () => [
              ...(prices ? pricesRows(prices, `code IN (${padForms(h.code).map(() => '?').join(',')})`, padForms(h.code)) : []),
              ...(user ? userRows(user, `c:${h.code}`, null, h.code) : []),
            ],
          });
        }
        searched.push('catalogue');
      } catch {
        unavailable.push('catalogue');
      }
    }

    // Best first; only a candidate with at least one price can answer.
    candidates.sort((a, b) => b.score - a.score);
    const priced = new Map<Candidate, OwnPrice[]>();
    const pricesFor = (c: Candidate): OwnPrice[] => {
      let got = priced.get(c);
      if (!got) {
        try {
          got = c.prices();
        } catch {
          got = [];
        }
        priced.set(c, got);
      }
      return got;
    };
    const best = candidates.find((c) => pricesFor(c).length > 0);
    if (!best) return { match: null, searched, unavailable };
    const all = candidates.filter((c) => c.identity === best.identity).flatMap((c) => pricesFor(c));
    const list = latestPerStore(all);
    if (list.length === 0) return { match: null, searched, unavailable };
    return {
      match: {
        name: best.name,
        brand: best.brand,
        size: best.sizeText ?? (best.size ? `${best.size.original.value} ${best.size.original.unit}` : null),
        code: best.code,
        score: Math.round(best.score * 1000) / 1000,
        prices: list,
      },
      searched,
      unavailable,
    };
  } catch {
    return { match: null, searched, unavailable };
  } finally {
    try {
      prices?.close();
    } catch {
      /* already closed */
    }
    if (ownUser) {
      try {
        user?.close();
      } catch {
        /* already closed */
      }
    }
  }
}
