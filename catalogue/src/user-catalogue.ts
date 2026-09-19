/**
 * The catalogue that user scans build. Beta-gaps item 15.
 *
 * Jamin, 2026-09-17: "This data can be used in two ways: 1. (if the product
 * already exists in our catalogue, the data from the user can be attached to that
 * specific product (All data from users should naturally be taken with a grain of
 * salt and not fully trusted. Furthermore, items should not be matched based on
 * quantity and should be converted to the units of comparison used in this app.
 * However, the original units should alos be stored. It can also be considered
 * that the catalogue might have the same product but in two different quantities,
 * this means that whichever quantity the users' item is closer to is the item that
 * the users' data should be attached to.)) 2. (if a product doesn't exist in our
 * catalogue then a user scan will add a new item to the catalogue with all of its
 * information. This new item should also be taken with a grain of salt and not
 * fully trusted, however, the median number many be a more valuable asset towards
 * our catalogue. Our catalogue needs a way to sort similar incoming products as
 * user scans might be slightly different for the same product. )" and: "the same
 * product should also be store with branches" (per store type); "Shin will be
 * available to the entire world and not focused on canada"; "tech products have
 * weight specs but cannot be compared based on that".
 *
 * THE CATALOGUE IS FED BY SCANS AND NOT CONSULTED TO ANSWER ONE. "The server will
 * not check shins own product list for now." Nothing in this file is read on the
 * scan path; it only writes what scans learn.
 *
 * A SEPARATE FILE, FOR THE REASON GAPS.TS IS ONE. The serving connection to the
 * catalogue is read-only on purpose (schema.ts, `openCatalogueReadOnly`), so user
 * data cannot be written there. This is a small standalone SQLite file that only
 * this module opens, read-write always. "Attached to a catalogue product" means an
 * observation row keyed by that product's code; the product row itself is never
 * touched. Every row here says `source = 'user_scan'` and `trusted = 0`, and
 * nothing in this file ever sets trusted to 1.
 *
 * WHAT A SCAN DOES, IN ORDER
 *   1. Matches a catalogue product (barcode, else name and brand) -> the
 *      observation attaches to it; with two sizes of one product it attaches to
 *      the one whose size is closer, compared after conversion to Shin's units.
 *   2. Else it matches an existing user entry -> merged into it (same size), or a
 *      new entry in that entry's GROUP (a different size of a near-duplicate).
 *   3. Else a new entry, in a new group.
 * The same product is kept per store type (`user_branch`): a supermarket's price
 * and a farm's are different rows of one product, never blended.
 *
 * Tech is identified by brand, model and spec, and its weight is never read as a
 * size or a comparison basis.
 *
 * `recordUserScan` never throws, for the same reason `recordGap` never does: a
 * failed write here must not become a failed scan.
 */

import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Market } from './market.ts';
import { UNKNOWN_MARKET } from './market.ts';
import { kindOfSource, normalizeStoreType, type ProductKind, type StoreType } from './product-kind.ts';
import { parseQuantity, sameFamily, toComparison, unitPriceCents, type ComparisonQuantity } from './units.ts';

const IMPLIED_REFERENCE_DDL = `CREATE TABLE IF NOT EXISTS implied_reference (
  ref                 TEXT NOT NULL,
  country             TEXT NOT NULL,
  currency            TEXT NOT NULL,
  rated_scans         INTEGER NOT NULL,
  devices             INTEGER NOT NULL,
  up_median_cents     REAL,
  up_scans            INTEGER NOT NULL,
  down_scans          INTEGER NOT NULL,
  wrong_product_scans INTEGER NOT NULL,
  source              TEXT NOT NULL DEFAULT 'user_derived',
  trusted             INTEGER NOT NULL DEFAULT 0,
  computed_at         TEXT NOT NULL,
  PRIMARY KEY (ref, country, currency)
) STRICT;`;

const DDL = `
CREATE TABLE IF NOT EXISTS user_product (
  id          INTEGER PRIMARY KEY,
  group_key   TEXT NOT NULL,
  brand_key   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  gtin        TEXT,
  name        TEXT NOT NULL,
  brand       TEXT,
  name_key    TEXT NOT NULL,
  model_key   TEXT,
  spec_json   TEXT,
  category    TEXT,
  base_value  REAL,
  base_unit   TEXT,
  orig_value  REAL,
  orig_unit   TEXT,
  source      TEXT NOT NULL DEFAULT 'user_scan',
  trusted     INTEGER NOT NULL DEFAULT 0,
  bare        INTEGER NOT NULL DEFAULT 0,
  scan_count  INTEGER NOT NULL DEFAULT 1,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS user_product_brand ON user_product(brand_key, kind);
CREATE INDEX IF NOT EXISTS user_product_gtin  ON user_product(gtin);
CREATE INDEX IF NOT EXISTS user_product_group ON user_product(group_key);

CREATE TABLE IF NOT EXISTS user_observation (
  id               INTEGER PRIMARY KEY,
  product_id       INTEGER,
  catalogue_code   TEXT,
  store_type       TEXT NOT NULL,
  store_name       TEXT,
  country          TEXT,
  region           TEXT,
  currency         TEXT,
  price_cents      INTEGER,
  orig_value       REAL,
  orig_unit        TEXT,
  base_value       REAL,
  base_unit        TEXT,
  unit_price_cents REAL,
  unit_label       TEXT,
  observed_at      TEXT NOT NULL,
  scan_id          TEXT,
  trusted          INTEGER NOT NULL DEFAULT 0,
  device_key       TEXT,
  verdict          TEXT,
  verdict_source   TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS user_observation_product ON user_observation(product_id);
CREATE INDEX IF NOT EXISTS user_observation_code    ON user_observation(catalogue_code);

CREATE TABLE IF NOT EXISTS user_branch (
  ref              TEXT NOT NULL,
  store_type       TEXT NOT NULL,
  country          TEXT NOT NULL,
  currency         TEXT,
  obs_count        INTEGER NOT NULL DEFAULT 0,
  last_price_cents INTEGER,
  last_seen        TEXT NOT NULL,
  PRIMARY KEY (ref, store_type, country)
) STRICT;

-- The offers and reviews Gemini returned with a scan (audit row 39), kept with
-- the product the scan attached to and the scan that brought them. Untrusted
-- like everything else here; nothing reads them to answer a scan.
CREATE TABLE IF NOT EXISTS user_offer (
  id             INTEGER PRIMARY KEY,
  ref            TEXT NOT NULL,
  product_id     INTEGER,
  catalogue_code TEXT,
  scan_id        TEXT,
  source         TEXT NOT NULL DEFAULT 'gemini_scan',
  trusted        INTEGER NOT NULL DEFAULT 0,
  retailer       TEXT,
  price          REAL,
  unit_price     REAL,
  in_median      INTEGER,
  raw_json       TEXT NOT NULL,
  observed_at    TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS user_offer_ref ON user_offer(ref);
CREATE INDEX IF NOT EXISTS user_offer_scan ON user_offer(scan_id);

CREATE TABLE IF NOT EXISTS user_review (
  id             INTEGER PRIMARY KEY,
  ref            TEXT NOT NULL,
  product_id     INTEGER,
  catalogue_code TEXT,
  scan_id        TEXT,
  source         TEXT NOT NULL DEFAULT 'gemini_scan',
  trusted        INTEGER NOT NULL DEFAULT 0,
  rating         REAL,
  review_count   INTEGER,
  summary        TEXT,
  url            TEXT,
  observed_at    TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS user_review_ref ON user_review(ref);
CREATE INDEX IF NOT EXISTS user_review_scan ON user_review(scan_id);

-- What users' own thumbs say about a product's typed shelf price (audit row 21),
-- computed by implied-reference.ts from the user's rating of the scan and the shelf
-- price they typed, and from nothing Gemini said. Derived from user data, so it is
-- marked source = 'user_derived' and trusted = 0. Never shown, never used to answer
-- a scan. The rating is up or down (was the answer any good), NOT a deal opinion, so
-- nothing here is a good-deal or bad-deal price: see implied-reference.ts.
${IMPLIED_REFERENCE_DDL}
`;

/** Columns added after the first release; a file made before them gets them at open. */
const LATE_COLUMNS: readonly { table: string; column: string; decl: string }[] = [
  { table: 'user_observation', column: 'device_key', decl: 'TEXT' },
  // Legacy, no longer written or read: these held Gemini's zone read back as a "verdict",
  // which made the implied reference circular. Kept only so an old file still opens.
  { table: 'user_observation', column: 'verdict', decl: 'TEXT' },
  { table: 'user_observation', column: 'verdict_source', decl: 'TEXT' },
];

/**
 * The implied_reference table is derived and rebuilt from scratch by every run, so a file
 * that still has the first shape (good and bad medians, zone counts) is dropped and made
 * again in the new one. No observation is touched.
 */
function migrateImpliedReference(db: DatabaseSync): void {
  const have = db.prepare('PRAGMA table_info(implied_reference)').all() as unknown as { name: string }[];
  if (have.some((c) => c.name === 'good_median_cents' || c.name === 'zone_verdict_scans')) {
    db.exec('DROP TABLE implied_reference');
    db.exec(IMPLIED_REFERENCE_DDL);
  }
}

function addLateColumns(db: DatabaseSync): void {
  for (const { table, column, decl } of LATE_COLUMNS) {
    const have = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
    if (!have.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

export interface UserCatalogue {
  readonly path: string;
  readonly db: DatabaseSync | null;
  dropped: number;
  droppedWhy: string;
}

let active: UserCatalogue | null = null;

export function activeUserCatalogue(): UserCatalogue | null {
  return active;
}

/** Opens (creating if needed) the user catalogue and makes it the default target. Never throws. */
export function openUserCatalogue(path: string = process.env.SHIN_USER_CATALOGUE ?? 'data/user-catalogue.db'): UserCatalogue {
  const uc = createUserCatalogue(path);
  active = uc;
  return uc;
}

/**
 * Opens a user catalogue WITHOUT making it the default target, for a caller that
 * owns its own file (the gap log's sibling). Never throws.
 */
export function createUserCatalogue(path: string): UserCatalogue {
  let db: DatabaseSync | null = null;
  let droppedWhy = '';
  try {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(DDL);
    addLateColumns(db);
    migrateImpliedReference(db);
  } catch (err) {
    db = null;
    droppedWhy = err instanceof Error ? err.message : String(err);
  }
  return { path, db, dropped: 0, droppedWhy };
}

// ── Normalisation ────────────────────────────────────────────────────────────

const STOP = new Set(['the', 'and', 'of', 'for', 'with', 'a', 'an', 'de', 'la', 'le', 'les', 'du', 'des', 'et', 'pack']);

const SIZE_TOKEN =
  /\d+(?:[.,]\d+)?\s*(?:x|\*)?\s*\d*(?:[.,]\d+)?\s*(?:mg|kg|g|ml|cl|dl|lt|l|oz|fl\s?oz|lbs?|ct|pcs?|gal|qt|pt)\b/gi;

/** Letters and digits in any script, diacritics folded, size phrases removed. Global, not Latin-only. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

export function nameTokens(name: string): string[] {
  const t = fold(name).replace(SIZE_TOKEN, ' ').split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '' && !STOP.has(w));
  return [...new Set(t)].sort();
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function brandKey(brand: string | null | undefined): string {
  return brand ? fold(brand).replace(/[^\p{L}\p{N}]+/gu, '') : '';
}

function compact(s: string): string {
  return fold(s).replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeGtin(gtin: string | null | undefined): string | null {
  const d = (gtin ?? '').replace(/\D/g, '');
  if (d === '') return null;
  return d.replace(/^0+/, '') || d;
}

/** Spec keys that never identify tech: weight is a spec Jamin ruled out as a comparison basis. */
const IGNORED_SPEC_KEYS = new Set(['weight', 'mass', 'weight_g', 'weight_kg', 'net_weight', 'gross_weight', 'shipping_weight']);

function normalizeSpecs(specs: Readonly<Record<string, string | number>> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(specs ?? {})) {
    const key = fold(k).replace(/[^\p{L}\p{N}]+/gu, '_');
    if (key === '' || IGNORED_SPEC_KEYS.has(key)) continue;
    out[key] = fold(String(v)).replace(/\s+/g, '');
  }
  return out;
}

/** Specs agree when every key BOTH sides state has the same value. A key on one side only is not a disagreement. */
export function specsAgree(a: Record<string, string>, b: Record<string, string>): boolean {
  for (const k of Object.keys(a)) if (k in b && a[k] !== b[k]) return false;
  return true;
}

// ── The scan, and what came of it ────────────────────────────────────────────

export interface UserScanInput {
  readonly gtin?: string | null;
  readonly name?: string | null;
  readonly brand?: string | null;
  /** Printed quantity ("500 g", "6 x 355 ml") or an already-parsed value. Kept as given. */
  readonly quantity?: string | { readonly value: number; readonly unit: string } | null;
  readonly kind?: ProductKind | null;
  /** The catalogue source hint ('icecat' means tech), used when `kind` is not given. */
  readonly source?: string | null;
  readonly model?: string | null;
  readonly specs?: Readonly<Record<string, string | number>> | null;
  readonly category?: string | null;
  /** A type ('supermarket', 'farm') or free text; normalised. */
  readonly storeType?: string | null;
  readonly storeName?: string | null;
  readonly priceCents?: number | null;
  readonly market?: Market | null;
  readonly observedAt?: string | null;
  readonly scanId?: string | null;
  /** True when all Shin has is a barcode or a typed query, with no product details from Gemini. */
  readonly bare?: boolean;
  /** Who scanned. Stored only as a one-way key, so devices can be counted and never named. */
  readonly deviceId?: string | null;
  /** The offers Gemini returned with this scan. Kept untrusted with the scan id (audit row 39). */
  readonly offers?: readonly UserOfferInput[];
  /** The reviews Gemini returned with this scan. Kept untrusted with the scan id. */
  readonly reviews?: readonly UserReviewInput[];
}

export interface UserOfferInput {
  readonly retailer?: string | null;
  readonly price?: number | null;
  readonly unitPrice?: number | null;
  readonly inMedian?: boolean | null;
  /** The offer object as Gemini gave it. */
  readonly raw?: Record<string, unknown> | null;
}

export interface UserReviewInput {
  readonly rating?: number | null;
  readonly count?: number | null;
  readonly summary?: string | null;
  readonly url?: string | null;
}

/** The most offers and reviews kept from one scan, and the longest text kept: a bound, not a judgement. */
const MAX_OFFERS_PER_SCAN = 25;
const MAX_REVIEWS_PER_SCAN = 10;
const MAX_TEXT = 2000;

function clip(s: string | null | undefined): string | null {
  return typeof s === 'string' && s !== '' ? s.slice(0, MAX_TEXT) : null;
}

function finiteOrNull(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** One-way, so the catalogue can count devices without holding anybody's id. */
export function deviceKeyOf(deviceId: string | null | undefined): string | null {
  const id = deviceId?.trim();
  return id ? createHash('sha256').update(id).digest('hex').slice(0, 16) : null;
}

export type UserScanOutcome =
  /** Data attached to a product already in the catalogue. */
  | 'attached'
  /** A new user-sourced entry, in a group of its own. */
  | 'created'
  /** A new entry that is a different size or spec of an existing entry's group. */
  | 'created_in_group'
  /** The same product as an existing user entry, seen again. */
  | 'merged'
  | 'dropped';

export interface UserScanResult {
  readonly outcome: UserScanOutcome;
  readonly source: 'user_scan';
  /** Always false. User data is never fully trusted (Jamin). */
  readonly trusted: false;
  readonly productId: number | null;
  readonly catalogueCode: string | null;
  readonly groupKey: string | null;
  /** The scan had no size and the catalogue holds two or more of the product; the pick is not by quantity. */
  readonly quantityAmbiguous: boolean;
  readonly reason: string | null;
}

/** One catalogue row a probe found. Enough to decide match and closest quantity. */
export interface CatalogueHit {
  readonly code: string;
  readonly name: string;
  readonly brands: string | null;
  readonly sizeValue: number | null;
  readonly sizeUnit: string | null;
  readonly source: string;
}

/** How a scan finds catalogue products. Injected, like PriceLookup, so this file needs no catalogue to load. */
export type CatalogueProbe = (scan: { gtin: string | null; name: string | null; brand: string | null; tokens: string[] }) => CatalogueHit[];

/**
 * The default probe over the read-only catalogue: exact barcode in its padded and
 * stripped forms, else full-text on the name's words. Returns [] on any failure;
 * a probe that cannot run is "no match", never an error.
 */
export function probeCatalogue(db: DatabaseSync): CatalogueProbe {
  return ({ gtin, tokens }) => {
    try {
      const cols = 'p.code, p.name, p.brands, p.size_value, p.size_unit, p.source';
      const map = (r: Record<string, unknown>): CatalogueHit => ({
        code: String(r.code),
        name: String(r.name),
        brands: (r.brands as string | null) ?? null,
        sizeValue: (r.size_value as number | null) ?? null,
        sizeUnit: (r.size_unit as string | null) ?? null,
        source: String(r.source),
      });
      if (gtin) {
        const forms = [...new Set([gtin, gtin.padStart(12, '0'), gtin.padStart(13, '0'), gtin.padStart(14, '0')])];
        const rows = db
          .prepare(`SELECT ${cols} FROM product p WHERE p.code IN (${forms.map(() => '?').join(',')})`)
          .all(...forms) as Record<string, unknown>[];
        if (rows.length > 0) return rows.map(map);
      }
      const words = tokens.filter((t) => /^[\p{L}\p{N}]+$/u.test(t)).slice(0, 6);
      if (words.length < 2) return [];
      const match = words.map((w) => `"${w}"`).join(' AND ');
      const rows = db
        .prepare(
          `SELECT ${cols} FROM product_fts f JOIN product p ON p.rowid = f.rowid WHERE product_fts MATCH ? LIMIT 25`,
        )
        .all(match) as Record<string, unknown>[];
      return rows.map(map);
    } catch {
      return [];
    }
  };
}

export interface RecordUserScanOptions {
  readonly log?: UserCatalogue;
  /** Finds catalogue products. Omitted means the catalogue is not consulted and every unmatched scan becomes a user entry. */
  readonly probe?: CatalogueProbe | null;
}

const NAME_MATCH = 0.75;
/** Two sizes within this ratio are the same size (a printed 500 g against a measured 497 g). */
const SAME_SIZE_RATIO = 1.05;

function toQuantity(q: UserScanInput['quantity']): ComparisonQuantity | null {
  if (q === null || q === undefined) return null;
  if (typeof q === 'string') {
    const p = parseQuantity(q);
    return p ? toComparison(p.value, p.unit) : null;
  }
  return toComparison(q.value, q.unit);
}

function sameSize(a: ComparisonQuantity | null, b: ComparisonQuantity | null): boolean {
  if (a === null || b === null) return true; // one side unstated: cannot tell them apart, do not split on it
  if (!sameFamily(a, b)) return false;
  const r = a.baseValue / b.baseValue;
  return r <= SAME_SIZE_RATIO && r >= 1 / SAME_SIZE_RATIO;
}

function closeness(a: ComparisonQuantity, b: ComparisonQuantity): number {
  return Math.abs(Math.log(a.baseValue / b.baseValue));
}

interface ProductRow {
  id: number;
  group_key: string;
  brand_key: string;
  kind: string;
  gtin: string | null;
  name_key: string;
  model_key: string | null;
  spec_json: string | null;
  base_value: number | null;
  base_unit: string | null;
  orig_value: number | null;
  orig_unit: string | null;
}

function existingQuantity(r: ProductRow): ComparisonQuantity | null {
  return r.orig_value !== null && r.orig_unit !== null ? toComparison(r.orig_value, r.orig_unit) : null;
}

const dropped = (reason: string): UserScanResult => ({
  outcome: 'dropped', source: 'user_scan', trusted: false, productId: null, catalogueCode: null,
  groupKey: null, quantityAmbiguous: false, reason,
});

/**
 * Records one scan into the user catalogue. Never throws. See the file header for
 * the order of the three outcomes.
 */
export function recordUserScan(scan: UserScanInput, opts: RecordUserScanOptions = {}): UserScanResult {
  const log = opts.log ?? active ?? openUserCatalogue();
  try {
    if (!log.db) throw new Error(log.droppedWhy || 'user catalogue is not open');
    const db = log.db;
    const gtin = normalizeGtin(scan.gtin);
    const name = scan.name?.trim() || null;
    if (gtin === null && name === null) return dropped('no barcode and no name');

    const kind: ProductKind = scan.kind ?? (scan.source ? kindOfSource(scan.source) : null) ?? 'other';
    const tech = kind === 'tech';
    const qty = tech ? null : toQuantity(scan.quantity);
    const tokens = nameTokens(name ?? '');
    const bKey = brandKey(scan.brand);
    const specs = tech ? normalizeSpecs(scan.specs) : {};
    const modelKey = tech && scan.model ? compact(scan.model) : null;
    const now = scan.observedAt?.trim() || new Date().toISOString();
    const market = scan.market ?? UNKNOWN_MARKET;
    const storeType: StoreType = normalizeStoreType(scan.storeType ?? scan.storeName ?? null);

    // 1. The catalogue's own product, when there is one.
    const hits = opts.probe ? opts.probe({ gtin, name, brand: scan.brand ?? null, tokens }) : [];
    const attach = chooseCatalogueHit(hits, { gtin, tokens, bKey, qty, tech, modelKey });
    if (attach) {
      recordObservation(db, { ref: `c:${attach.hit.code}`, productId: null, code: attach.hit.code }, {
        scan, qty, storeType, market, now, tech,
      });
      return {
        outcome: 'attached', source: 'user_scan', trusted: false, productId: null,
        catalogueCode: attach.hit.code, groupKey: null, quantityAmbiguous: attach.ambiguous, reason: null,
      };
    }

    // 2. An existing user entry, or 3. a new one.
    const candidates = db
      .prepare('SELECT * FROM user_product WHERE kind = ? AND brand_key = ?')
      .all(kind, bKey) as unknown as ProductRow[];
    let same: ProductRow | null = null;
    let groupOf: ProductRow | null = null;
    for (const c of candidates) {
      if (gtin !== null && c.gtin === gtin) { same = c; break; }
      const cTokens = c.name_key === '' ? [] : c.name_key.split(' ');
      if (tech) {
        const modelHit = modelKey !== null && c.model_key === modelKey;
        const nameHit = modelKey === null && c.model_key === null && jaccard(tokens, cTokens) >= 0.85;
        if (!modelHit && !nameHit) continue;
        const theirs = c.spec_json ? (JSON.parse(c.spec_json) as Record<string, string>) : {};
        if (specsAgree(specs, theirs)) { same = c; break; }
        groupOf ??= c;
      } else {
        if (gtin !== null && c.gtin !== null && c.gtin !== gtin) {
          // Two different barcodes are two products, however alike the names read.
          if (jaccard(tokens, cTokens) >= NAME_MATCH) groupOf ??= c;
          continue;
        }
        if (jaccard(tokens, cTokens) < NAME_MATCH) continue;
        if (sameSize(qty, existingQuantity(c))) { same = c; break; }
        groupOf ??= c;
      }
    }

    if (same) {
      db.prepare(
        `UPDATE user_product SET scan_count = scan_count + 1, last_seen = ?,
           gtin = COALESCE(gtin, ?),
           bare = CASE WHEN ? = 0 THEN 0 ELSE bare END
         WHERE id = ?`,
      ).run(now, gtin, scan.bare ? 1 : 0, same.id);
      recordObservation(db, { ref: `u:${same.id}`, productId: same.id, code: null }, {
        scan, qty, storeType, market, now, tech,
      });
      return {
        outcome: 'merged', source: 'user_scan', trusted: false, productId: same.id,
        catalogueCode: null, groupKey: same.group_key, quantityAmbiguous: false, reason: null,
      };
    }

    const groupKey = groupOf?.group_key ?? (tech && modelKey ? `${bKey}:${modelKey}` : `${bKey}|${tokens.join(' ')}`);
    const res = db
      .prepare(
        `INSERT INTO user_product (group_key, brand_key, kind, gtin, name, brand, name_key, model_key, spec_json,
           category, base_value, base_unit, orig_value, orig_unit, source, trusted, bare, scan_count, first_seen, last_seen)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'user_scan', 0, ?, 1, ?, ?)`,
      )
      .run(
        groupKey, bKey, kind, gtin, name ?? gtin ?? '', scan.brand ?? null, tokens.join(' '), modelKey,
        tech ? JSON.stringify(specs) : null, scan.category ?? null,
        qty?.baseValue ?? null, qty?.baseUnit ?? null, qty?.original.value ?? null, qty?.original.unit ?? null,
        scan.bare ? 1 : 0, now, now,
      );
    const id = Number(res.lastInsertRowid);
    recordObservation(db, { ref: `u:${id}`, productId: id, code: null }, { scan, qty, storeType, market, now, tech });
    return {
      outcome: groupOf ? 'created_in_group' : 'created', source: 'user_scan', trusted: false,
      productId: id, catalogueCode: null, groupKey, quantityAmbiguous: false, reason: null,
    };
  } catch (err) {
    log.dropped += 1;
    log.droppedWhy = err instanceof Error ? err.message : String(err);
    return dropped(log.droppedWhy);
  }
}

function chooseCatalogueHit(
  hits: readonly CatalogueHit[],
  q: { gtin: string | null; tokens: string[]; bKey: string; qty: ComparisonQuantity | null; tech: boolean; modelKey: string | null },
): { hit: CatalogueHit; ambiguous: boolean } | null {
  // A barcode hit is the product. Several rows on one barcode are sizes of it.
  const byGtin = q.gtin === null ? [] : hits.filter((h) => normalizeGtin(h.code) === q.gtin);
  const pool =
    byGtin.length > 0
      ? byGtin
      : hits.filter((h) => {
          const theirBrand = brandKey(h.brands?.split(',')[0]);
          if (q.bKey !== '' && theirBrand !== '' && theirBrand !== q.bKey) return false;
          if (q.tech) return q.modelKey !== null && compact(h.name).includes(q.modelKey);
          return jaccard(q.tokens, nameTokens(h.name)) >= NAME_MATCH;
        });
  if (pool.length === 0) return null;
  if (pool.length === 1) return { hit: pool[0], ambiguous: false };
  // Two or more sizes of the product: the one whose size, converted to Shin's
  // units, is closest to the scan's. No size on the scan means the pick is not by
  // quantity and says so.
  if (q.qty === null || q.tech) return { hit: [...pool].sort((a, b) => a.code.localeCompare(b.code))[0], ambiguous: true };
  let best: { hit: CatalogueHit; d: number } | null = null;
  for (const h of pool) {
    const hq = toComparison(h.sizeValue, h.sizeUnit);
    if (hq === null || !sameFamily(hq, q.qty)) continue;
    const d = closeness(hq, q.qty);
    if (best === null || d < best.d) best = { hit: h, d };
  }
  return best ? { hit: best.hit, ambiguous: false } : { hit: [...pool].sort((a, b) => a.code.localeCompare(b.code))[0], ambiguous: true };
}

function recordObservation(
  db: DatabaseSync,
  target: { ref: string; productId: number | null; code: string | null },
  o: { scan: UserScanInput; qty: ComparisonQuantity | null; storeType: StoreType; market: Market; now: string; tech: boolean },
): void {
  const cents = o.scan.priceCents;
  const price = typeof cents === 'number' && Number.isFinite(cents) && cents > 0 ? Math.round(cents) : null;
  const per = price !== null && !o.tech && o.qty ? unitPriceCents(price, o.qty.original.value, o.qty.original.unit) : null;
  db.prepare(
    `INSERT INTO user_observation (product_id, catalogue_code, store_type, store_name, country, region, currency,
       price_cents, orig_value, orig_unit, base_value, base_unit, unit_price_cents, unit_label, observed_at, scan_id, trusted,
       device_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
  ).run(
    target.productId, target.code, o.storeType, o.scan.storeName ?? null, o.market.country, o.market.region,
    o.market.currency, price, o.qty?.original.value ?? null, o.qty?.original.unit ?? null,
    o.qty?.baseValue ?? null, o.qty?.baseUnit ?? null, per?.unitCents ?? null, per?.label ?? null,
    o.now, o.scan.scanId ?? null,
    deviceKeyOf(o.scan.deviceId),
  );
  // Audit row 39: the offers and reviews Gemini returned ride along, untrusted, with the scan id.
  for (const offer of (o.scan.offers ?? []).slice(0, MAX_OFFERS_PER_SCAN)) {
    db.prepare(
      `INSERT INTO user_offer (ref, product_id, catalogue_code, scan_id, retailer, price, unit_price, in_median, raw_json, observed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      target.ref, target.productId, target.code, o.scan.scanId ?? null, clip(offer.retailer),
      finiteOrNull(offer.price), finiteOrNull(offer.unitPrice),
      offer.inMedian === null || offer.inMedian === undefined ? null : offer.inMedian ? 1 : 0,
      JSON.stringify(offer.raw ?? {}).slice(0, 8000), o.now,
    );
  }
  for (const review of (o.scan.reviews ?? []).slice(0, MAX_REVIEWS_PER_SCAN)) {
    db.prepare(
      `INSERT INTO user_review (ref, product_id, catalogue_code, scan_id, rating, review_count, summary, url, observed_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      target.ref, target.productId, target.code, o.scan.scanId ?? null, finiteOrNull(review.rating),
      finiteOrNull(review.count) === null ? null : Math.round(review.count as number), clip(review.summary), clip(review.url), o.now,
    );
  }
  db.prepare(
    `INSERT INTO user_branch (ref, store_type, country, currency, obs_count, last_price_cents, last_seen)
     VALUES (?,?,?,?,1,?,?)
     ON CONFLICT(ref, store_type, country) DO UPDATE SET
       obs_count = obs_count + 1,
       last_price_cents = COALESCE(excluded.last_price_cents, last_price_cents),
       currency = COALESCE(excluded.currency, currency),
       last_seen = excluded.last_seen`,
  ).run(target.ref, o.storeType, o.market.country ?? '', o.market.currency, price, o.now);
}

/** The branches (store types) one product is held under. Read-only helper for reports and tests. */
export function branchesOf(log: UserCatalogue, ref: string): { storeType: string; country: string; count: number; lastPriceCents: number | null }[] {
  if (!log.db) return [];
  const rows = log.db
    .prepare('SELECT store_type, country, obs_count, last_price_cents FROM user_branch WHERE ref = ? ORDER BY store_type, country')
    .all(ref) as unknown as { store_type: string; country: string; obs_count: number; last_price_cents: number | null }[];
  return rows.map((r) => ({ storeType: r.store_type, country: r.country, count: r.obs_count, lastPriceCents: r.last_price_cents }));
}
