/**
 * The audit for requirement 5.2 (docs/price-category-requirements-2026-10-01.md):
 * "Turn a typed shelf price into an observed price, marked as a shopper report.
 * Pass: 100% of typed prices stored that way." Plan 5.2's falsifier is "a typed
 * price stored any other way", diagnosed by this audit.
 *
 * WHERE A TYPED PRICE IS STORED, enumerated 2026-10-09 over every writer:
 *   - the corrections store (price/data/corrections.db, `correction`): the
 *     shopper-report store. `/api/scan-price` and `/api/correction` both write
 *     here through `fileTypedReport` (shopper-report.ts), which marks the row
 *     `capture = 'typed'`. A row with no mark is a failure (`unmarkedReports`).
 *     `photo` is the other mark the store allows (a photographed tag) and is
 *     not a failure; no app route writes it today.
 *   - the scan row (app/data/scans.db, `scan.typed_price_cents`): the scan's
 *     own record of what was typed (5.1). With a shop named and a product
 *     resolved it should also be a shopper report; when no report exists for
 *     that device and product, it is a failure (`typedNotReported`). With no
 *     shop or no product there is nothing an observed price can be filed under
 *     (the corrections store needs both), so it is counted, not failed
 *     (`keptOnScanOnly`).
 *   - the user catalogue (app/data/user-catalogue.db, `user_observation`): the
 *     pad price that rides on an identify request is written there by
 *     `recordUserScan` (catalogue/src/user-catalogue.ts, called from
 *     server.ts's catalogue feed), with no shopper-report mark, and it is read
 *     into others' answers as a 5+ shopper pool (own-prices.ts). Every priced
 *     row there is a typed price stored outside the shopper-report store, and
 *     counted as a failure (`outsideReportStore`).
 *
 * The scan-to-report match is by device and product (codes compared without
 * their zero padding), not by scan: `/api/correction` rows carry the phone's own
 * client id, so an earlier report of the same product by the same phone also
 * counts as filed. The audit can under-count a lost report in that one case;
 * it never over-counts.
 *
 * Read-only, never throws: every file is opened `readOnly`, and a missing or
 * unreadable one is named in `unavailable` rather than read as a pass.
 *
 * Run against copies, never the live files:
 *   node src/typed-price-audit.ts --corrections <db> --scans <db> --user-catalogue <db>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface TypedPriceAuditPaths {
  readonly corrections?: string | null;
  readonly scans?: string | null;
  readonly userCatalogue?: string | null;
}

export interface TypedPriceAudit {
  readonly checked: { readonly reports: number; readonly scanPrices: number; readonly userCataloguePrices: number };
  /** Shopper reports stored with no mark (capture NULL, or a value the store does not define). */
  readonly unmarkedReports: number;
  /** Typed prices on a scan with a shop and a product, and no shopper report for that device and product. */
  readonly typedNotReported: number;
  /** Typed prices stored as priced user-catalogue rows, outside the shopper-report store. */
  readonly outsideReportStore: number;
  /** Not a failure: typed prices with no shop or no product, which stay on the scan row. */
  readonly keptOnScanOnly: number;
  /** The three failure counts, summed. 0 is the pass. */
  readonly failing: number;
  readonly unavailable: readonly string[];
}

const MARKS = new Set(['typed', 'photo']);

function open(path: string | null | undefined): DatabaseSync | null {
  if (!path || !existsSync(path)) return null;
  return new DatabaseSync(path, { readOnly: true });
}

function bareCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const t = code.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? t.replace(/^0+/, '') || '0' : t;
}

function hasTable(db: DatabaseSync, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

export function auditTypedPrices(paths: TypedPriceAuditPaths): TypedPriceAudit {
  const unavailable: string[] = [];
  let reports = 0;
  let unmarkedReports = 0;
  let scanPrices = 0;
  let typedNotReported = 0;
  let keptOnScanOnly = 0;
  let userCataloguePrices = 0;
  let unmarkedUserPrices = 0;
  const filed = new Set<string>(); // `${device}|${bare code}` for every shopper report

  const read = (name: string, path: string | null | undefined, fn: (db: DatabaseSync) => void): void => {
    if (path === null || path === undefined) return; // not asked for
    let db: DatabaseSync | null = null;
    try {
      db = open(path);
      if (!db) throw new Error('missing');
      fn(db);
    } catch {
      unavailable.push(name);
    } finally {
      try {
        db?.close();
      } catch {
        /* already closed */
      }
    }
  };

  read('corrections', paths.corrections, (db) => {
    if (!hasTable(db, 'correction')) throw new Error('no correction table');
    const rows = db.prepare('SELECT device_id, code, capture FROM correction').all() as Record<string, unknown>[];
    for (const r of rows) {
      reports += 1;
      if (typeof r.capture !== 'string' || !MARKS.has(r.capture)) unmarkedReports += 1;
      const code = bareCode(r.code);
      if (code !== null) filed.add(`${String(r.device_id)}|${code}`);
    }
  });

  read('scans', paths.scans, (db) => {
    if (!hasTable(db, 'scan')) throw new Error('no scan table');
    const rows = db
      .prepare('SELECT device_id, store_name, resolved_code FROM scan WHERE typed_price_cents IS NOT NULL')
      .all() as Record<string, unknown>[];
    for (const r of rows) {
      scanPrices += 1;
      const code = bareCode(r.resolved_code);
      if (code !== null && filed.has(`${String(r.device_id)}|${code}`)) continue;
      const shop = typeof r.store_name === 'string' ? r.store_name.trim() : '';
      if (shop !== '' && code !== null) typedNotReported += 1;
      else keptOnScanOnly += 1;
    }
  });

  read('user_catalogue', paths.userCatalogue, (db) => {
    if (!hasTable(db, 'user_observation')) throw new Error('no user_observation table');
    const row = db.prepare('SELECT COUNT(*) AS n FROM user_observation WHERE price_cents IS NOT NULL').get() as { n: number };
    userCataloguePrices = Number(row.n);
    // catalogue/src/user-catalogue.ts sets `capture` = 'typed' on every priced row it writes (5.2).
    // A file from before that column existed has no mark at all, so every priced row in it fails.
    const marked = (db.prepare('PRAGMA table_info(user_observation)').all() as { name: string }[]).some((c) => c.name === 'capture');
    unmarkedUserPrices = marked
      ? Number(
          (db.prepare("SELECT COUNT(*) AS n FROM user_observation WHERE price_cents IS NOT NULL AND capture IS NOT 'typed'").get() as { n: number }).n,
        )
      : userCataloguePrices;
  });

  const outsideReportStore = unmarkedUserPrices;
  return {
    checked: { reports, scanPrices, userCataloguePrices },
    unmarkedReports,
    typedNotReported,
    outsideReportStore,
    keptOnScanOnly,
    failing: unmarkedReports + typedNotReported + outsideReportStore,
    unavailable,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? (process.argv[i + 1] ?? null) : null;
  };
  const audit = auditTypedPrices({
    corrections: arg('--corrections'),
    scans: arg('--scans'),
    userCatalogue: arg('--user-catalogue'),
  });
  console.log(JSON.stringify(audit, null, 2));
  process.exitCode = audit.failing === 0 && audit.unavailable.length === 0 ? 0 : 1;
}
