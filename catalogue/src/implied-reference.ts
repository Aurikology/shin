/**
 * What users' own ratings say about the shelf prices they typed. Audit row 21.
 *
 * Jamin, 2026-09-17: "afterwards we can compute what the median price ... based on
 * their scale of a good deal and the price they inputted", which he marked "needs
 * further design". Decided 2026-09-19, corrected the same day.
 *
 * WHY THIS WAS REWRITTEN. The first version read a "verdict" that was the zone
 * Gemini placed the price in against the user's own lines. That is Gemini's median
 * read back through the user's thresholds, so the "implied" median was the answer
 * feeding itself. This version reads NOTHING Gemini said: not its zone, not its
 * verdict text, not its median. Its only inputs are (1) the rating the person gave
 * the scan and (2) the shelf price the person typed.
 *
 * WHAT A RATING CAN SAY. A rating (app/src/ratings.ts) is a thumb, up or down, with
 * an optional reason on a thumb-down from a closed list: wrong product, wrong price,
 * no price, too slow. It answers "was that answer any good", NOT "is this a good
 * deal". So this file cannot honestly compute a good-deal or bad-deal price, and it
 * does not pretend to: a thumbs-up on "this is a high price" is a person agreeing the
 * app was right, not a person calling the price good. The deal-opinion median Jamin
 * asked for needs a way for the person to say how the price strikes them on their
 * own scale; when the app has that, this is where it plugs in.
 *
 * WHAT THE NUMBER MEANS. For one product (a `ref`: a catalogue code or a user entry)
 * in one country and currency, when there are AT LEAST 5 rated scans from AT LEAST 3
 * devices (the device that gave the rating), one `implied_reference` row holds:
 *   - `up_median_cents`: the median shelf price the person typed on scans whose
 *     answer they gave a thumbs-up. "The prices typed by people who accepted the
 *     app's answer for this product", so a product match a person confirmed. It is
 *     a typical typed shelf price, not a fair price and not a market median;
 *   - `up_scans`, `down_scans`: how many scans were thumbed up and thumbed down;
 *   - `wrong_product_scans`: thumbs-down scans whose reason was wrong product, a
 *     sign the scan may be attached to the wrong product. These are never in the
 *     median (a thumbs-down carries no median at all).
 * The rating counted is the latest standing one (`scan_rating`): a tap that was
 * undone is not a rating, and a person who tapped up and then down counts as down.
 *
 * WHAT IT IS NOT. It is never shown to a user, never used to answer a scan (the
 * server does not check Shin's own product list; the catalogue is fed by scans and
 * not consulted), and never trusted: every row says `source = 'user_derived'` and
 * `trusted = 0`, and nothing here sets trusted to 1. Prices of different currencies
 * or countries are never blended: the group is (ref, country, currency).
 *
 * Run it: `npm run implied-reference` from the catalogue package, or
 * `node src/implied-reference.ts [path-to-user-catalogue.db] [path-to-scans.db]`
 * (the scan store holds the ratings; default `SHIN_SCANS` or `data/scans.db`).
 */

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createUserCatalogue, deviceKeyOf, type UserCatalogue } from './user-catalogue.ts';

/** At least this many rated scans, from at least this many devices, before a row is written. */
export const MIN_RATED_SCANS = 5;
export const MIN_DEVICES = 3;

/** One person's standing rating of one scan, as `scan_rating` keeps it. */
export interface StandingRating {
  readonly scanId: string;
  readonly deviceId: string;
  readonly rating: 'up' | 'down';
  readonly reason: string | null;
}

/**
 * Reads the standing ratings from a scan store file, read-only. Returns an error string and
 * no ratings when the file cannot be read; never throws.
 */
export function readStandingRatings(scansPath: string): { ratings: StandingRating[]; error: string | null } {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(scansPath, { readOnly: true });
    const rows = db
      .prepare(`SELECT scan_id, device_id, rating, reason FROM scan_rating WHERE rating IN ('up', 'down')`)
      .all() as unknown as { scan_id: number | string; device_id: string; rating: 'up' | 'down'; reason: string | null }[];
    return {
      ratings: rows.map((r) => ({ scanId: String(r.scan_id), deviceId: String(r.device_id), rating: r.rating, reason: r.reason })),
      error: null,
    };
  } catch (err) {
    return { ratings: [], error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      db?.close();
    } catch {
      /* nothing to close */
    }
  }
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
  /** Median typed shelf price over thumbs-up scans; null when none. Not a fair price. */
  readonly upMedianCents: number | null;
  readonly upScans: number;
  readonly downScans: number;
  readonly wrongProductScans: number;
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
  scan_id: string;
}

/** An observation joined to the standing rating of its scan. */
interface JoinedRow extends RatedRow {
  rating: 'up' | 'down';
  reason: string | null;
  /** The one-way key of the device that GAVE the rating. */
  rater: string;
}

/**
 * Recomputes every implied reference from the observations and the standing ratings.
 * Idempotent: a group is rewritten from all of its rated scans each run, and a group
 * that has fallen below the bar keeps no stale row. Never throws.
 *
 * `ratings` are the person's own ratings (see `readStandingRatings`); the observation
 * contributes only the price the person typed and where it was. Nothing Gemini said is
 * read: an observation whose scan has no rating is not a rated scan.
 */
export function computeImpliedReferences(
  log: UserCatalogue,
  ratings: readonly StandingRating[],
  now: Date = new Date(),
): ComputeResult {
  try {
    if (!log.db) throw new Error(log.droppedWhy || 'user catalogue is not open');
    const db = log.db;
    const byScan = new Map<string, StandingRating>();
    for (const r of ratings) byScan.set(r.scanId, r);
    const observed = db
      .prepare(
        `SELECT COALESCE(CASE WHEN product_id IS NOT NULL THEN 'u:' || product_id END, 'c:' || catalogue_code) AS ref,
                country, currency, price_cents, scan_id
           FROM user_observation
          WHERE scan_id IS NOT NULL AND price_cents IS NOT NULL AND price_cents > 0
            AND (product_id IS NOT NULL OR catalogue_code IS NOT NULL)`,
      )
      .all() as unknown as RatedRow[];
    const rows: JoinedRow[] = [];
    for (const o of observed) {
      const rated = byScan.get(String(o.scan_id));
      const rater = rated ? deviceKeyOf(rated.deviceId) : null;
      if (rated && rater) rows.push({ ...o, rating: rated.rating, reason: rated.reason, rater });
    }

    const groups = new Map<string, { ref: string; country: string; currency: string; rows: JoinedRow[] }>();
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
        `INSERT INTO implied_reference (ref, country, currency, rated_scans, devices, up_median_cents, up_scans,
           down_scans, wrong_product_scans, source, trusted, computed_at)
         VALUES (?,?,?,?,?,?,?,?,?, 'user_derived', 0, ?)`,
      );
      for (const g of groups.values()) {
        const devices = new Set(g.rows.map((r) => r.rater)).size;
        if (g.rows.length < MIN_RATED_SCANS || devices < MIN_DEVICES) {
          tooThin += 1;
          continue;
        }
        const up = g.rows.filter((r) => r.rating === 'up').map((r) => r.price_cents);
        const down = g.rows.filter((r) => r.rating === 'down');
        const ref: ImpliedReference = {
          ref: g.ref,
          country: g.country,
          currency: g.currency,
          ratedScans: g.rows.length,
          devices,
          upMedianCents: median(up),
          upScans: up.length,
          downScans: down.length,
          wrongProductScans: down.filter((r) => r.reason === 'wrong_product').length,
        };
        insert.run(
          ref.ref, ref.country, ref.currency, ref.ratedScans, ref.devices, ref.upMedianCents, ref.upScans,
          ref.downScans, ref.wrongProductScans, now.toISOString(),
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
    upMedianCents: r.up_median_cents === null ? null : Number(r.up_median_cents),
    upScans: Number(r.up_scans),
    downScans: Number(r.down_scans),
    wrongProductScans: Number(r.wrong_product_scans),
    source: String(r.source),
    trusted: Number(r.trusted),
  }));
}

function main(): void {
  const path = process.argv[2] ?? process.env.SHIN_USER_CATALOGUE ?? 'data/user-catalogue.db';
  const scansPath = process.argv[3] ?? process.env.SHIN_SCANS ?? 'data/scans.db';
  const log = createUserCatalogue(path);
  const rated = readStandingRatings(scansPath);
  if (rated.error) {
    console.error(`Could not read ratings from ${scansPath}: ${rated.error}`);
    process.exitCode = 1;
    return;
  }
  const result = computeImpliedReferences(log, rated.ratings);
  if (result.error) {
    console.error(`Could not compute: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Implied references in ${path} from ${rated.ratings.length} standing rating(s) in ${scansPath}: ${result.written.length} written, ${result.tooThin} group(s) too thin (need ${MIN_RATED_SCANS} rated scans from ${MIN_DEVICES} devices).`);
  console.log('Each median is the typed shelf price on thumbs-up scans. It is not a good-deal price: a thumb says whether the answer was any good.');
  for (const r of result.written) {
    console.log(
      `${r.ref} ${r.country || '-'} ${r.currency || '-'}: thumbs-up median ${r.upMedianCents ?? 'none'} (${r.upScans} up), ${r.downScans} down (${r.wrongProductScans} wrong product), ${r.devices} devices`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
