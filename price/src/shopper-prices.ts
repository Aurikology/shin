/**
 * SHOPPER PRICES: a price a shopper typed for a product Pexi already identified becomes a price the next
 * shopper benefits from. Decided 2026-11-15 (docs/decisions.md, "Shopper prices").
 *
 * WHERE THEY LIVE. A `shopper_price` table in the corrections database (price/data/corrections.db, the one
 * file nothing else rewrites), not in prices.db. prices.db is crawled data the app opens read-only and the
 * estimate caches by the file's size and time: one shopper write there would make the next scan re-read about
 * 99,000 rows (about 2.5 s). The table is made on first use, so a file made before it gains it, and a test
 * that points SHIN_CORRECTIONS at a temp file never touches a real one.
 *
 * THE TRUST RULE (every line is a test in price/test/shopper-prices.test.ts):
 *   1. at most one price per device per product per day: the first stands, a repeat is ignored;
 *   2. when the product already has a centre (the answer the shopper just saw was built on prices for it),
 *      a price below x0.33 or above x3 of that centre is ignored as a typo;
 *   3. developer and probe devices (id starts "probe") are never recorded;
 *   4. ALL shoppers' prices for a product are ONE voice: the median of each device's newest price in the last
 *      180 days. The estimate (price/src/estimate.ts `shopperVoice`) takes that voice as one shop, only while
 *      the product has fewer than 2 shop prices. So a shopper price never weighs more than one shop's price,
 *      and never lifts a verdict above low confidence: one shop plus one voice is 2 prices, and the estimate
 *      marks fewer than 3 prices low confidence. Shopper prices alone (one device or many) are low too.
 *   5. (security finding F1, 2026-11-16) THE VOICE NEEDS AGREEMENT. Making a device id costs nothing, so one
 *      fake phone could set a price. The voice exists only when at least 3 different devices from at least 2
 *      different networks have prices within x1.5 of the median of all of them; its price is the median of
 *      those agreeing prices. Below that bar `shopperVoiceFor` answers null and the shown price does not
 *      move. A device whose network is unknown (a price saved before the network was kept) is not evidence.
 *      A network is a salted hash of the IPv4 /24 or IPv6 /48 (never the address), kept on the row and taken
 *      off by the same retention sweep that takes the device id off.
 *
 * Never throws: a missing or broken store is a price not saved, said in `why`.
 */
import { createHmac } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const SHOPPER_MIN_RATIO = 0.33;
export const SHOPPER_MAX_RATIO = 3;
/** The voice is built from prices seen in this many days. */
export const SHOPPER_VOICE_DAYS = 180;
/** The estimate takes the voice only while the product has fewer shop prices than this. */
export const SHOPPER_VOICE_BELOW_SHOPS = 2;
/** Security finding F2: a shop price younger than this many days puts a floor under the typed voice... */
export const SHOPPER_VOICE_FLOOR_FRESH_DAYS = 90;
/** ...at this fraction of that shop price. */
export const SHOPPER_VOICE_FLOOR_RATIO = 0.8;
/** The voice needs this many agreeing devices... */
export const SHOPPER_VOICE_MIN_DEVICES = 3;
/** ...from at least this many different networks... */
export const SHOPPER_VOICE_MIN_NETWORKS = 2;
/** ...each within this ratio of the median of all the devices' prices. */
export const SHOPPER_VOICE_AGREE_RATIO = 1.5;

const DDL = `
CREATE TABLE IF NOT EXISTS shopper_price (
  id          INTEGER PRIMARY KEY,
  device_id   TEXT NOT NULL,
  code        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  region      TEXT,
  store       TEXT,
  seen_on     TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  centre_cents INTEGER,
  net_hash    TEXT
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS shopper_price_one_per_day ON shopper_price(device_id, code, seen_on);
CREATE INDEX IF NOT EXISTS shopper_price_code ON shopper_price(code, seen_on);
CREATE INDEX IF NOT EXISTS shopper_price_device ON shopper_price(device_id);
`;

const made = new WeakSet<DatabaseSync>();

function ensure(db: DatabaseSync): void {
  if (made.has(db)) return;
  db.exec(DDL);
  // A table made before the network was kept gains the column.
  const have = db.prepare('PRAGMA table_info(shopper_price)').all() as unknown as { name: string }[];
  if (!have.some((c) => c.name === 'net_hash')) db.exec('ALTER TABLE shopper_price ADD COLUMN net_hash TEXT');
  made.add(db);
}

/**
 * The network a client address sits in, as text: an IPv4 /24 ("203.0.113.0/24") or an IPv6 /48
 * ("2001:db8:1::/48"). Null for anything that is not an address. An IPv4-mapped IPv6 address is read as IPv4.
 */
export function networkPrefix(address: string | null | undefined): string | null {
  const a = (address ?? '').trim().toLowerCase();
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (v4) {
    const parts = [v4[1]!, v4[2]!, v4[3]!, v4[4]!].map(Number);
    if (parts.some((n) => n > 255)) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (!/^[0-9a-f:]+$/.test(a) || !a.includes(':')) return null;
  const halves = a.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const tail = halves.length === 2 && halves[1] !== '' ? halves[1]!.split(':') : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const groups = halves.length === 2 ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/48`;
}

/**
 * A salted hash of the client's network (see `networkPrefix`), never the address. The salt is a server-side
 * secret: without it the 16 million IPv4 networks could be hashed back. Null when the address is not one or
 * there is no salt, which counts as no evidence of a network.
 */
export function networkHash(address: string | null | undefined, salt: string | null | undefined): string | null {
  const net = networkPrefix(address);
  if (net === null || !salt) return null;
  return createHmac('sha256', salt).update(net).digest('hex').slice(0, 24);
}

/** The code as the estimate keys it: digits without their zero padding. */
export function shopperCodeKey(code: string): string {
  const d = code.trim();
  if (!/^\d+$/.test(d)) return d;
  return d.replace(/^0+/, '') || d;
}

/** Developer and probe devices (scripts' ids start "probe-"): never recorded. */
export function isProbeDevice(deviceId: string): boolean {
  return deviceId.trim().toLowerCase().startsWith('probe');
}

export interface ShopperPriceInput {
  readonly deviceId: string;
  readonly code: string;
  readonly priceCents: number;
  readonly region: string | null;
  readonly store: string | null;
  /** ISO day the price was typed. */
  readonly seenOn: string;
  /** The product's centre in the answer the shopper saw, or null when it had none. The typo guard's reference. */
  readonly centreCents: number | null;
  /** `networkHash` of the request's client address, or null/absent when it could not be made. Never the address. */
  readonly networkHash?: string | null;
}

export type SaveResult =
  | { readonly ok: true; readonly id: number }
  | { readonly ok: false; readonly why: 'probe_device' | 'bad_price' | 'already_today' | 'typo_guard' | 'store_unavailable' };

export function saveShopperPrice(db: DatabaseSync | null, input: ShopperPriceInput, now: Date = new Date()): SaveResult {
  if (isProbeDevice(input.deviceId)) return { ok: false, why: 'probe_device' };
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) return { ok: false, why: 'bad_price' };
  if (!db) return { ok: false, why: 'store_unavailable' };
  const centre = input.centreCents;
  if (typeof centre === 'number' && Number.isFinite(centre) && centre > 0) {
    if (input.priceCents < centre * SHOPPER_MIN_RATIO || input.priceCents > centre * SHOPPER_MAX_RATIO) {
      return { ok: false, why: 'typo_guard' };
    }
  }
  try {
    ensure(db);
    const r = db
      .prepare(
        `INSERT OR IGNORE INTO shopper_price (device_id, code, price_cents, region, store, seen_on, recorded_at, centre_cents, net_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.deviceId,
        shopperCodeKey(input.code),
        input.priceCents,
        input.region?.trim().slice(0, 80) || null,
        input.store?.trim().slice(0, 120) || null,
        input.seenOn,
        now.toISOString(),
        typeof centre === 'number' && centre > 0 ? Math.round(centre) : null,
        input.networkHash?.trim().slice(0, 64) || null,
      );
    if (Number(r.changes) === 0) return { ok: false, why: 'already_today' };
    return { ok: true, id: Number(r.lastInsertRowid) };
  } catch (err) {
    console.error(`[shopper-price-fault] save_failed ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, why: 'store_unavailable' };
  }
}

/** How many prices this device has saved for other shoppers. 0 for a missing store. */
export function shopperPriceCount(db: DatabaseSync | null, deviceId: string): number {
  if (!db) return 0;
  try {
    ensure(db);
    return (db.prepare('SELECT COUNT(*) AS n FROM shopper_price WHERE device_id = ?').get(deviceId) as { n: number }).n;
  } catch (err) {
    console.error(`[shopper-price-fault] count_failed ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

export interface ShopperVoice {
  /** The median of each device's newest price. */
  readonly cents: number;
  readonly seenOn: string;
  /** The region of the newest reading, or null. */
  readonly region: string | null;
  /** How many agreeing devices stand behind the price (at least 3). */
  readonly devices: number;
  /** How many different networks those devices come from (at least 2). */
  readonly networks: number;
}

/** The one voice for a product: see rules 4 and 5 above. Null when no price is in the window or too few agree. */
export function shopperVoiceFor(db: DatabaseSync | null, code: string, asOf: string): ShopperVoice | null {
  if (!db) return null;
  try {
    ensure(db);
    const since = new Date(Date.parse(`${asOf}T00:00:00Z`) - SHOPPER_VOICE_DAYS * 86_400_000).toISOString().slice(0, 10);
    const rows = db
      .prepare(
        `SELECT device_id, price_cents, region, seen_on, net_hash FROM shopper_price
          WHERE code = ? AND seen_on >= ? AND seen_on <= ?
          ORDER BY seen_on DESC, id DESC`,
      )
      .all(shopperCodeKey(code), since, asOf) as { device_id: string; price_cents: number; region: string | null; seen_on: string; net_hash: string | null }[];
    if (rows.length === 0) return null;
    const newestPerDevice = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!newestPerDevice.has(r.device_id)) newestPerDevice.set(r.device_id, r);
    // A device whose network is not known is not evidence (rule 5).
    const known = [...newestPerDevice.values()].filter((r) => r.net_hash !== null);
    if (known.length < SHOPPER_VOICE_MIN_DEVICES) return null;
    const median = (list: number[]) => {
      const sorted = [...list].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    };
    const centre = median(known.map((r) => r.price_cents));
    const agreeing = known.filter(
      (r) => r.price_cents <= centre * SHOPPER_VOICE_AGREE_RATIO && r.price_cents * SHOPPER_VOICE_AGREE_RATIO >= centre,
    );
    const networks = new Set(agreeing.map((r) => r.net_hash));
    if (agreeing.length < SHOPPER_VOICE_MIN_DEVICES || networks.size < SHOPPER_VOICE_MIN_NETWORKS) return null;
    const cents = Math.round(median(agreeing.map((r) => r.price_cents)));
    const newest = agreeing.reduce((a, r) => (r.seen_on > a.seen_on ? r : a), agreeing[0]!);
    return { cents, seenOn: newest.seen_on, region: newest.region, devices: agreeing.length, networks: networks.size };
  } catch (err) {
    console.error(`[shopper-price-fault] voice_failed ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Any shopper price on file for the product, of any age. The name preview's "Pexi has a price". */
export function hasShopperPrice(db: DatabaseSync | null, code: string): boolean {
  if (!db) return false;
  try {
    ensure(db);
    return db.prepare('SELECT 1 FROM shopper_price WHERE code = ? LIMIT 1').get(shopperCodeKey(code)) !== undefined;
  } catch (err) {
    console.error(`[shopper-price-fault] has_failed ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function spellings(code: string): string[] {
  const bare = shopperCodeKey(code);
  if (!/^\d+$/.test(bare)) return [bare];
  const out = [code.trim(), bare, bare.padStart(12, '0'), bare.padStart(13, '0'), bare.padStart(14, '0')];
  if (bare.length <= 8) out.push(bare.padStart(8, '0'));
  return [...new Set(out)];
}

/**
 * Whether a shop (crawled seller) has a price for the product: two indexed reads of prices.db's
 * `observation`, no row scan, so the name preview stays fast. A file with no observation table, or none
 * at all, is "no".
 */
export function hasShopPrice(prices: DatabaseSync | null, code: string): boolean {
  if (!prices) return false;
  try {
    const keys = spellings(code);
    const marks = keys.map(() => '?').join(',');
    for (const col of ['code', 'page_gtin']) {
      try {
        const hit = prices.prepare(`SELECT 1 FROM observation WHERE ${col} IN (${marks}) AND price_cents > 0 LIMIT 1`).get(...keys);
        if (hit !== undefined) return true;
      } catch {
        /* a file without that column: the other one may still answer */
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Takes the device id off every price recorded before `cutoffIso` (the retention sweep), and the network hash with
 * it. The price stays. Returns the count.
 */
export function removeOldShopperDeviceIds(db: DatabaseSync | null, cutoffIso: string, prefix: string): number {
  if (!db) return 0;
  ensure(db);
  const r = db
    .prepare(`UPDATE shopper_price SET device_id = ? || id, net_hash = NULL WHERE recorded_at < ? AND device_id NOT LIKE ? || '%'`)
    .run(prefix, cutoffIso, prefix);
  return Number(r.changes);
}

/**
 * Takes one product's typed prices out (the owner's tool for a poisoned price, scripts/security/remove-shopper-input.mjs).
 * `dryRun` only counts. Returns how many rows matched.
 */
export function removeShopperPricesFor(db: DatabaseSync | null, code: string, dryRun: boolean): number {
  if (!db) return 0;
  ensure(db);
  const key = shopperCodeKey(code);
  if (dryRun) return (db.prepare('SELECT COUNT(*) AS n FROM shopper_price WHERE code = ?').get(key) as { n: number }).n;
  return Number(db.prepare('DELETE FROM shopper_price WHERE code = ?').run(key).changes);
}
