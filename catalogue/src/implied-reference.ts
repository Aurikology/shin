/**
 * A median back-computed from users' own verdicts. Audit row 21.
 *
 * Jamin, 2026-09-17: "afterwards we can compute what the median price ... based on
 * their scale of a good deal and the price they inputted", which he marked "needs
 * further design". This is the minimal version, decided 2026-09-19:
 *
 *   For one product (a `ref`: a catalogue code or a user entry) in one country and
 *   currency, when there are AT LEAST 5 rated scans from AT LEAST 3 devices:
 *     - the median shelf price among scans the user rated good or great, and
 *     - the median shelf price among scans the user rated bad,
 *   are stored as one `implied_reference` row. A 'fair' verdict counts toward the
 *   five and the three, and toward neither median.
 *
 * WHAT IT IS NOT. It is never shown to a user, never used to answer a scan (the
 * server does not check Shin's own product list; the catalogue is fed by scans and
 * not consulted), and never trusted: every row says `source = 'user_derived'` and
 * `trusted = 0`, and nothing here sets trusted to 1. Prices of different currencies
 * or countries are never blended: the group is (ref, country, currency).
 *
 * A KNOWN LIMIT, kept on the row rather than hidden: while the only verdicts are
 * the zone Gemini placed a price in against the user's own lines, the "implied"
 * median is largely Gemini's median read back through the user's thresholds, not an
 * independent measurement. `zone_verdict_scans` counts how many of the rated scans
 * were that kind, so a reader can tell it from a median made of people's own taps.
 *
 * Run it: `npm run implied-reference` from the catalogue package, or
 * `node src/implied-reference.ts [path-to-user-catalogue.db]`.
 */

import { fileURLToPath } from 'node:url';
import { createUserCatalogue, type UserCatalogue } from './user-catalogue.ts';

/** At least this many rated scans, from at least this many devices, before a row is written. */
export const MIN_RATED_SCANS = 5;
export const MIN_DEVICES = 3;

/** The zone Gemini returns against the user's own lines, read as the verdict on their scale. */
export function verdictFromZone(zone: string | null | undefined): 'good' | 'fair' | 'bad' | null {
  if (zone === 'under_your_line') return 'good';
  if (zone === 'middle') return 'fair';
  if (zone === 'over_your_line') return 'bad';
  return null;
}

/** The median of a list, or null when it is empty. The mean of the two middle values for an even count. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface ImpliedReference {
  readonly ref: string;
  readonly country: string;
  readonly currency: string;
  readonly ratedScans: number;
  readonly devices: number;
  readonly goodMedianCents: number | null;
  readonly goodScans: number;
  readonly badMedianCents: number | null;
  readonly badScans: number;
  readonly zoneVerdictScans: number;
}

export interface ComputeResult {
  /** The rows written or rewritten this run. */
  readonly written: readonly ImpliedReference[];
  /** Groups that had rated scans but not enough of them or not from enough devices. */
  readonly tooThin: number;
  /** Set when the catalogue could not be read or written; the run never throws. */
  readonly error: string | null;
}

interface RatedRow {
  ref: string;
  country: string | null;
  currency: string | null;
  price_cents: number;
  device_key: string | null;
  verdict: string;
  verdict_source: string | null;
}

/**
 * Recomputes every implied reference from the observations. Idempotent: a group is
 * rewritten from all of its rated scans each run, and a group that has fallen below
 * the bar keeps no stale row. Never throws.
 */
export function computeImpliedReferences(log: UserCatalogue, now: Date = new Date()): ComputeResult {
  try {
    if (!log.db) throw new Error(log.droppedWhy || 'user catalogue is not open');
    const db = log.db;
    const rows = db
      .prepare(
        `SELECT COALESCE(CASE WHEN product_id IS NOT NULL THEN 'u:' || product_id END, 'c:' || catalogue_code) AS ref,
                country, currency, price_cents, device_key, verdict, verdict_source
           FROM user_observation
          WHERE verdict IS NOT NULL AND price_cents IS NOT NULL AND price_cents > 0
            AND (product_id IS NOT NULL OR catalogue_code IS NOT NULL)`,
      )
      .all() as unknown as RatedRow[];

    const groups = new Map<string, { ref: string; country: string; currency: string; rows: RatedRow[] }>();
    for (const r of rows) {
      const country = r.country ?? '';
      const currency = r.currency ?? '';
      const key = `${r.ref}\u0000${country}\u0000${currency}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { ref: r.ref, country, currency, rows: [] }));
      g.rows.push(r);
    }

    const written: ImpliedReference[] = [];
    let tooThin = 0;
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM implied_reference');
      const insert = db.prepare(
        `INSERT INTO implied_reference (ref, country, currency, rated_scans, devices, good_median_cents, good_scans,
           bad_median_cents, bad_scans, zone_verdict_scans, source, trusted, computed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'user_derived', 0, ?)`,
      );
      for (const g of groups.values()) {
        const devices = new Set(g.rows.map((r) => r.device_key).filter((d): d is string => d !== null)).size;
        if (g.rows.length < MIN_RATED_SCANS || devices < MIN_DEVICES) {
          tooThin += 1;
          continue;
        }
        const good = g.rows.filter((r) => r.verdict === 'good' || r.verdict === 'great').map((r) => r.price_cents);
        const bad = g.rows.filter((r) => r.verdict === 'bad').map((r) => r.price_cents);
        const ref: ImpliedReference = {
          ref: g.ref,
          country: g.country,
          currency: g.currency,
          ratedScans: g.rows.length,
          devices,
          goodMedianCents: median(good),
          goodScans: good.length,
          badMedianCents: median(bad),
          badScans: bad.length,
          zoneVerdictScans: g.rows.filter((r) => r.verdict_source === 'zone').length,
        };
        insert.run(
          ref.ref, ref.country, ref.currency, ref.ratedScans, ref.devices, ref.goodMedianCents, ref.goodScans,
          ref.badMedianCents, ref.badScans, ref.zoneVerdictScans, now.toISOString(),
        );
        written.push(ref);
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* already rolled back */
      }
      throw err;
    }
    return { written, tooThin, error: null };
  } catch (err) {
    return { written: [], tooThin: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The stored rows, for the CLI and tests. Never for a scan path. */
export function impliedReferences(log: UserCatalogue): (ImpliedReference & { source: string; trusted: number })[] {
  if (!log.db) return [];
  const rows = log.db
    .prepare('SELECT * FROM implied_reference ORDER BY ref, country, currency')
    .all() as unknown as Record<string, string | number | null>[];
  return rows.map((r) => ({
    ref: String(r.ref),
    country: String(r.country),
    currency: String(r.currency),
    ratedScans: Number(r.rated_scans),
    devices: Number(r.devices),
    goodMedianCents: r.good_median_cents === null ? null : Number(r.good_median_cents),
    goodScans: Number(r.good_scans),
    badMedianCents: r.bad_median_cents === null ? null : Number(r.bad_median_cents),
    badScans: Number(r.bad_scans),
    zoneVerdictScans: Number(r.zone_verdict_scans),
    source: String(r.source),
    trusted: Number(r.trusted),
  }));
}

function main(): void {
  const path = process.argv[2] ?? process.env.SHIN_USER_CATALOGUE ?? 'data/user-catalogue.db';
  const log = createUserCatalogue(path);
  const result = computeImpliedReferences(log);
  if (result.error) {
    console.error(`Could not compute: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Implied references in ${path}: ${result.written.length} written, ${result.tooThin} group(s) too thin (need ${MIN_RATED_SCANS} rated scans from ${MIN_DEVICES} devices).`);
  for (const r of result.written) {
    console.log(
      `${r.ref} ${r.country || '-'} ${r.currency || '-'}: good/great median ${r.goodMedianCents ?? 'none'} (${r.goodScans}), bad median ${r.badMedianCents ?? 'none'} (${r.badScans}), ${r.devices} devices, ${r.zoneVerdictScans} of ${r.ratedScans} verdicts are zone placements`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
