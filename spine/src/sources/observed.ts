/**
 * The observed-price source: real seller prices already sitting in
 * `price/data/prices.db`, unread by anything in the app until this file.
 *
 * MEASURED 2026-09-05, straight from the table: 896 rows. 874 from openprices,
 * 22 from walmart.ca. 644 regular, 252 promotional. 782 joined by barcode, 14
 * joined by matching the seller's product name, 100 never joined to a catalogue
 * product at all (`code IS NULL`) and are never returned here. Dates run
 * 2020-02-01 to 2026-09-05.
 *
 * This file never opens the database for writing. A background crawl writes to
 * this same file while the app runs, so every connection here is
 * `{ readOnly: true }`, and every query is a plain SELECT.
 *
 * This file will not average a seller's several prices for one barcode into a
 * single number: `spine.ts` already turns a set of PricePoints into a verdict,
 * with the kind and the date attached, which an average would throw away. It
 * also will not invent a category for a row. `categories` below is
 * `['grocery', 'tech']`, and the note there carries the measurement behind it.
 * An earlier version of this line claimed every row is food, drink or household
 * goods, from a sample that happened to be food; joining all 438 priced codes
 * to the catalogue showed 2 electronics rows, which grocery alone would have
 * made permanently unreachable.
 *
 * THE SELLER-IDENTITY PROBLEM, and why most of this file's complexity is here
 * rather than in the price mapping. openprices rows (874 of 896) carry the
 * literal string "openprices" in `seller`; the actual shop is not there and is
 * not recoverable by normalising anything. `region` holds a bare OpenStreetMap
 * node/way/relation id, ambiguous on its own because those are separate number
 * spaces. CHECKED 2026-09-05 against the live database: `PRAGMA table_info`
 * shows no `store_name`, `store_city`, or `store_osm` column yet. A migration
 * that adds them exists at `price/src/migrate-observation.ts`, owned by
 * another lane, uncommitted and not run. This file does not run it and does
 * not edit it, and treats its own absence as the normal case, not an error.
 *
 * Two named failures if a raw openprices row were ever treated as an ordinary,
 * fully-identified seller:
 *
 *   - Distinct-seller counting collapses. `categories.ts` counts sellers by
 *     `normalizeSeller(p.seller)`; 89 real locations behind the string
 *     "openprices" would count as one, understating exactly the number the
 *     confidence sentence reports.
 *   - Self-exclusion fails silently. The spine drops the shopper's own store
 *     by normalised seller name (`spine.ts`, `askingSellerKey`). A shopper
 *     standing in the store an openprices row came from types their real
 *     store name; the row still says "openprices", the two never match, and
 *     the row is never excluded. The price is compared against itself and can
 *     read as a fair deal that is really just itself.
 *
 * The chosen identity key, once the columns exist, is `store_osm`, NOT
 * `store_name`. A name is not an identity: two branches of the same chain are
 * two different stores, and matching by name would collapse them, which
 * silently drops a genuine competitor from the comparison along with the
 * shopper's own store, the same class of wrongness as never excluding
 * anything. `store_name` is display text only. Until `store_osm` is present
 * and non-null for a row, that row is COMPARISON-ONLY: its price still
 * contributes to the spread and the verdict arithmetic (amounts do not need an
 * identity), but its seller string is a shared, clearly-labelled sentinel that
 * can never collide with a real store name, so it can neither wrongly exclude
 * nor wrongly fail to be recognised as unknown. Rows from `walmart.ca` are
 * exempt from all of this: that crawl is the retailer's own site, so `seller`
 * is already a specific, real merchant with no aliasing risk.
 */

import { DatabaseSync } from 'node:sqlite';
import { PRICES_DB_PATH } from '../../../price/src/store.ts';
import type { CategoryId, PricePoint, ProductIdentity, SpineQuery } from '../contract.ts';
import type { PriceSource, SourceAvailability } from './source.ts';
import { overlap } from './source.ts';

/**
 * `price/src/store.ts` resolves SHIN_PRICES itself and exports the result, so
 * this file does not resolve the path a second time. Reusing that constant
 * means the app and the crawler that fills the table agree on where it is
 * without either package hardcoding a relative path into the other's data
 * directory. This is the only import taken from that file; nothing here opens
 * it, and this file's own connection below is always `{ readOnly: true }`.
 */
const DEFAULT_PATH = PRICES_DB_PATH;

/** How the row's code was attached to a catalogue product. Mirrors `price/src/store.ts`. */
type JoinMethod = 'gtin' | 'name' | 'none';
type Kind = 'regular' | 'promotional';

interface Row {
  readonly code: string | null;
  readonly seller: string;
  readonly seller_name: string;
  readonly seller_brand: string | null;
  readonly price_cents: number;
  readonly kind: Kind;
  readonly unit_price_cents: number | null;
  readonly unit_label: string | null;
  readonly join_method: JoinMethod;
  readonly seen_on: string;
  readonly url: string | null;
  /** Display only, from the not-yet-run migration. Never the identity key. */
  readonly store_name: string | null;
  /** The identity key for a physical shop, e.g. "WAY/120689533". Null until the migration runs and tags it. */
  readonly store_osm: string | null;
}

/** Printed as the seller for an openprices row with no `store_osm` yet. Never a real store's name. */
const UNKNOWN_SHOP_SELLER = 'openprices (shop unknown)';

/** Minimum query-token overlap before a name match counts at all. Same floor `recorded.ts` uses. */
const MATCH_FLOOR = 0.5;

/**
 * Confidence a barcode gives when the observation itself proves it: the seller
 * published this exact code, so the identity is as solid as a scanned tag.
 * Judgment, not measured, chosen to sit just under `bestbuy.ts`'s 0.98 because
 * this comes from a crowdsourced feed rather than a manufacturer catalogue API.
 */
const BARCODE_QUERY_CONFIDENCE = 0.95;

/**
 * Confidence when there is no barcode in the query at all and this file had to
 * guess the product from a listing's own name. Folded against the overlap
 * score below, the same way `recorded.ts` folds its stored identityConfidence
 * against a query's fit. Lower than the barcode path's ceiling because a
 * human never confirmed this row is the right product, unlike every row in
 * `recorded.ts`'s store.
 */
const TEXT_QUERY_BASE_CONFIDENCE = 0.75;

/**
 * Applied when the specific row backing an identity has `join_method = 'name'`
 * rather than `'gtin'`: the code on this row was attached upstream by matching
 * a product name, not because the seller published that literal barcode. That
 * is a weaker link regardless of how the query itself was resolved, so it
 * discounts both the barcode path and the text path.
 */
const NAME_JOIN_PENALTY = 0.85;

function padGtin(gtin: string): string {
  return gtin.padStart(13, '0');
}

/**
 * The brand field on a receipt-feed row is not a brand. It is the upstream
 * `brands` tag, which contributors fill in as a list: the brand, then the
 * retailer that stocks it, sometimes a city, sometimes a flag. Measured on the
 * live table: 215 of the 838 rows carrying a brand hold a bullet-separated list
 * (26%), e.g. "PC • Loblaws", "Your Fresh Market • Walmart Canada",
 * "Que Pasa • Richmond BC \u{1F1E8}\u{1F1E6}". Printed whole it puts a
 * competitor's name and a location inside the product's own title.
 *
 * This only ever REMOVES. The first segment is the brand in every sampled row,
 * so later segments are dropped rather than reordered, and nothing is inferred
 * or added. A row whose brand does not parse keeps its name alone, which is
 * always true, rather than a guess.
 */
function brandOf(row: Row): string | null {
  if (!row.seller_brand) return null;
  const first = row.seller_brand.split(/[•|,]/)[0] ?? '';
  const cleaned = first
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '') // regional-indicator pairs: the flags
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 41 rows in the live table repeat the brand at the head of the name, so
 * prepending unconditionally produced "Green Giant Green Giant Restaurant
 * Sides ...". The name is left alone when it already opens with the brand.
 */
function labelOf(row: Row): string {
  const name = row.seller_name.trim();
  const brand = brandOf(row);
  if (!brand) return name;
  if (name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`.trim();
}

/**
 * The seller string a row is reported under. See the header comment: identity
 * for self-exclusion and distinct-seller counting keys on `store_osm`, never
 * on `store_name`, and an openprices row with no `store_osm` yet is reported
 * under one shared, unmistakably-not-a-real-store sentinel rather than under
 * "openprices" as if that were a merchant.
 */
function sellerOf(row: Row): string {
  if (row.seller !== 'openprices') return row.seller; // walmart.ca: already a real, specific merchant.
  /*
   * KNOWN TENSION, LEFT OPEN ON PURPOSE (DEFECTS.md D-076). The header says the
   * identity is `store_osm` and this returns the display name. Switching it to
   * the OSM id was tried on 2026-09-09 and reverted the same hour: the shopper
   * excludes their own store by the NAME they typed, so a seller keyed on the
   * OSM id stops matching it and the regression-seam test below this file's
   * suite goes red on the exact property it guards. Two branches of one chain
   * collapsing is real and still unsolved; solving it needs a second field,
   * not a different value in this one.
   */
  if (row.store_osm) return row.store_name ?? row.store_osm;
  return UNKNOWN_SHOP_SELLER;
}

/** The join-quality half of a price point's note, or undefined when the row needs no caveat. */
function joinNote(row: Row): string | undefined {
  return row.join_method === 'name'
    ? "this seller's listing was matched to the product by name; the seller did not publish this barcode themselves"
    : undefined;
}

/** The shop-identity half of a price point's note, or undefined when the shop is known. */
function shopNote(row: Row): string | undefined {
  return row.seller === 'openprices' && !row.store_osm
    ? 'the shop behind this price is unknown; comparison-only, never used to exclude a shopper\'s own store'
    : undefined;
}

function combineNotes(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => p !== undefined);
  if (kept.length === 0) return undefined;
  const [first, ...rest] = kept;
  return `${first[0].toUpperCase()}${first.slice(1)}${rest.length ? `; ${rest.join('; ')}` : ''}.`;
}

export class ObservedSource implements PriceSource {
  readonly id = 'observed';
  readonly label = 'Observed retail prices (openprices, walmart.ca)';
  /**
   * MEASURED, not sampled, 2026-09-05. The header used to say every row here is
   * food, drink or household goods and that nothing in this table is tech. That
   * was wrong, and it was wrong in the direction that loses prices silently.
   * Joining all 438 distinct priced codes against the catalogue by source:
   * openfoodfacts 409, openbeautyfacts 16, openproductsfacts 10, icecat 2, and
   * 1 code not in the catalogue at all.
   *
   * `spine.ts` filters sources by this list before it asks any of them anything
   * (`sources.filter((s) => s.categories.includes(query.category))`). So while
   * this said grocery alone, the two icecat rows were prices we hold and would
   * never once have served: a tech query could not reach this source, and the
   * failure would have read as "no price found" rather than as a misrouting.
   *
   * Beauty and general products stay under grocery, which is this app's
   * household bucket. The two electronics rows are why tech is here. Found by
   * another lane noticing a PC game in a table whose comment claimed groceries,
   * which is worth recording: the claim was written from a sample and the
   * sample happened to be food.
   */
  readonly categories: readonly CategoryId[] = ['grocery', 'tech'];
  /**
   * False. This adapter's own read path, against the live database with the
   * seller-identity seam above, has not been run and verified by us the way
   * `recorded.ts`'s data was seen by a person. It joins `bestbuy.ts` as an
   * unverified source rather than `recorded.ts` as a verified one, even
   * though the 896 underlying rows are real: "verified" here is about this
   * adapter's own path, not about whether the numbers it reads are genuine.
   */
  readonly verified = false;

  #db: DatabaseSync | null;
  #openError: string | null = null;
  #path: string;
  #hasStoreOsm = false;
  #hasStoreName = false;
  /** Explains a reduced identity confidence, keyed by the ProductIdentity.id it was set on. */
  #notes = new Map<string, string>();

  constructor(path: string = DEFAULT_PATH) {
    this.#path = path;
    try {
      this.#db = new DatabaseSync(path, { readOnly: true });
      const cols = new Set(
        (this.#db.prepare('PRAGMA table_info(observation)').all() as unknown as { name: string }[]).map(
          (c) => c.name,
        ),
      );
      this.#hasStoreOsm = cols.has('store_osm');
      this.#hasStoreName = cols.has('store_name');
    } catch (e) {
      this.#db = null;
      this.#openError = e instanceof Error ? e.message : String(e);
    }
  }

  available(): SourceAvailability {
    if (this.#db === null) {
      return { ok: false, reason: this.#openError ?? `could not open ${this.#path}` };
    }
    return { ok: true };
  }

  async identify(query: SpineQuery): Promise<ProductIdentity | null> {
    if (this.#db === null) return null;
    if (query.gtin) return this.#identifyByGtin(this.#db, query.gtin, query.category);
    const text = query.text ?? '';
    if (text.trim() === '') return null;
    return this.#identifyByText(this.#db, text, query.category);
  }

  async prices(identity: ProductIdentity): Promise<readonly PricePoint[]> {
    if (this.#db === null || !identity.gtin) return [];
    const rows = this.#db
      .prepare(`SELECT ${this.#selectList()} FROM observation WHERE code = ?`)
      .all(identity.gtin) as unknown as Row[];
    // Defensive, not load-bearing: the query above can only match a non-null
    // code, since `code IS NULL` never equals a string. Point 4 of the brief
    // is enforced here anyway so the rule holds even if the query above changes.
    return rows.filter((r) => r.code !== null).map((r) => this.#toPricePoint(r));
  }

  /** Why a low identity confidence is low, for the refusal text. Wired in `registry.ts`. */
  identityNote(id: string): string | undefined {
    return this.#notes.get(id);
  }

  #selectList(): string {
    const nameCol = this.#hasStoreName ? 'store_name' : 'NULL AS store_name';
    const osmCol = this.#hasStoreOsm ? 'store_osm' : 'NULL AS store_osm';
    return `code, seller, seller_name, seller_brand, price_cents, kind,
             unit_price_cents, unit_label, join_method, seen_on, url,
             ${nameCol}, ${osmCol}`;
  }

  #identifyByGtin(db: DatabaseSync, gtin: string, category: CategoryId | undefined): ProductIdentity | null {
    const padded = padGtin(gtin);
    const rows = db
      .prepare(`SELECT ${this.#selectList()} FROM observation WHERE code = ? OR code = ? ORDER BY seen_on DESC`)
      .all(gtin, padded) as unknown as Row[];
    if (rows.length === 0) return null;
    const code = rows[0].code;
    if (code === null) return null; // unreachable given the WHERE above; kept for point 4.

    const hasBarcodeJoin = rows.some((r) => r.join_method === 'gtin');
    const confidence = hasBarcodeJoin ? BARCODE_QUERY_CONFIDENCE : BARCODE_QUERY_CONFIDENCE * NAME_JOIN_PENALTY;
    const id = `observed:${code}`;
    if (hasBarcodeJoin) {
      this.#notes.delete(id);
    } else {
      this.#notes.set(
        id,
        'Every observation under this barcode was linked to it by matching the seller\'s product name, not because a seller published this barcode themselves.',
      );
    }
    const rep = rows[0];
    return {
      id,
      label: labelOf(rep),
      category: category ?? 'grocery',
      brand: brandOf(rep) ?? undefined,
      gtin: code,
      confidence,
      resolvedBy: this.id,
    };
  }

  #identifyByText(db: DatabaseSync, text: string, category: CategoryId | undefined): ProductIdentity | null {
    const rows = db
      .prepare(`SELECT ${this.#selectList()} FROM observation WHERE code IS NOT NULL`)
      .all() as unknown as Row[];

    let best: Row | null = null;
    let bestScore = 0;
    for (const r of rows) {
      const haystack = `${r.seller_name} ${r.seller_brand ?? ''}`;
      const score = overlap(text, haystack);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (best === null || bestScore < MATCH_FLOOR || best.code === null) return null;

    const nameJoined = best.join_method !== 'gtin';
    const confidence = TEXT_QUERY_BASE_CONFIDENCE * bestScore * (nameJoined ? NAME_JOIN_PENALTY : 1);
    const id = `observed:${best.code}`;
    this.#notes.set(
      id,
      nameJoined
        ? 'Resolved by matching a listing name, not a barcode, and that listing was itself joined to this product by name rather than by a barcode it published.'
        : 'Resolved by matching a listing name to the query text, not by a barcode in the query.',
    );
    return {
      id,
      label: labelOf(best),
      category: category ?? 'grocery',
      brand: brandOf(best) ?? undefined,
      gtin: best.code,
      confidence,
      resolvedBy: this.id,
    };
  }

  #toPricePoint(row: Row): PricePoint {
    const point: PricePoint = {
      seller: sellerOf(row),
      amountCents: row.price_cents,
      currency: 'CAD',
      kind: row.kind,
      observedAt: row.seen_on,
      sourceId: this.id,
      url: row.url ?? undefined,
      note: combineNotes(joinNote(row), shopNote(row)),
    };
    // unit_label is always "$X.XX/100g" or "¢X/100ml" in this table (checked
    // 2026-09-05 against all 14 non-null rows), which is exactly what the
    // contract's unitAmountCents documents. Anything else is left off rather
    // than guessed at, because a wrong base unit is worse than a missing one.
    if (
      row.unit_price_cents !== null &&
      row.unit_label !== null &&
      /\/100(g|ml)$/.test(row.unit_label)
    ) {
      return { ...point, unitAmountCents: row.unit_price_cents };
    }
    return point;
  }
}
