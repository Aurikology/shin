#!/usr/bin/env node
/**
 * THE FUNNEL, from data the server already stores (review 2026-11-21: business 9, premortem 22,
 * cost 12). READ-ONLY: it never writes and sends nothing to anyone.
 *
 *   node scripts/funnel-report.mjs --db app/data/scans.db --from 2026-11-22 --to 2026-12-05
 *   SHIN_ADMIN_TOKEN=... node scripts/funnel-report.mjs --live --from 2026-11-22 --to 2026-12-05
 *
 * --db opens a copy of scans.db read-only (on the Mac, or a copy of it). --live asks the beta server's
 * read-only admin route (POST /api/admin/sql, app/src/admin.ts, .claude/skills/beta-data) one question
 * and needs SHIN_ADMIN_TOKEN in your shell, never in the repo; --origin changes the host. Dates are
 * UTC days, `--to` inclusive; the default range is the last 14 days. --json prints the numbers.
 *
 * WHO COUNTS. Every device except `probe-*` (the phone-contract probe and the fix lanes), a device that ever typed a
 * synthetic test name (SYNTHETIC_QUERIES below) and demo
 * scans (is_demo = 1). A "new phone" is a device that opened the app (event app_open) or made a
 * non-demo scan, and whose FIRST event or scan falls inside the range; the steps after it are counted
 * for those phones whenever they happened, up to now. Device ids that only ever sent other usage
 * events (the events route takes any id, so scripts and junk land there) are not phones: they are
 * counted on their own line, "other ids", so a flood is visible without swelling the funnel
 * (fix 2026-11-21: the first live run counted 1,287 "new phones" against about 19 real ones).
 *
 *   new phones        first seen in the range
 *   first answer      of those, phones with at least one answered scan
 *   with shop prices  of those, phones with an answered scan whose price range came from Pexi's own
 *                     shop prices (range_source shin_prices). Not verdict_sellers: that is written only
 *                     when the shopper typed a shelf price and got a verdict (fix 2026-11-21)
 *   hit the limit     of those, phones that got the weekly-limit screen (event scan_limit_hit)
 *   paywall views     of those, phones that opened the paywall screen (screen_view, screen paywall)
 *   tapped Subscribe  of those, phones with a paywall_buy tapped (outcome tapped)
 *   purchases         of those, phones with a paywall_buy done
 *   day-7 return      of those OLD ENOUGH (first seen 7+ days ago), phones that opened the app on
 *                     exactly the 7th day after the day they were first seen (event app_open)
 *   Claude ask rate   of ALL answered scans in the range, the share whose price range came from a
 *                     Claude estimate (range_source claude_typical)
 *   Claude consent    of the new phones that answered the agreement screen, the share whose latest
 *                     answer allowed product names to go to Claude (event agreement, claude true)
 *
 * The falsifier in docs/decisions.md ("under 1 in 10 testers who reach the limit tap Subscribe")
 * reads off "of those that hit the limit, tapped Subscribe", printed on its own line.
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (day, n) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));

/** Validates the range. Every value that reaches the SQL text is a checked date, never free text. */
export function resolveRange({ from, to, now = new Date() }) {
  const today = isoDay(now);
  const end = to ?? today;
  const start = from ?? addDays(end, -13);
  for (const [name, v] of [['--from', start], ['--to', end]]) {
    if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Error(`${name} must be a date like 2026-11-22, got "${v}"`);
  }
  if (start > end) throw new Error(`--from ${start} is after --to ${end}`);
  return { from: start, to: end, toExclusive: addDays(end, 1), today };
}

/**
 * Typed searches that only our own test runs send (scripts/e2e-phone-live.mjs types "zzqxwv", a nonsense
 * name that must answer "no match"). A device that ever sent one is a test phone and is out of every
 * number, as a `probe-*` device is. The e2e run now names its devices `probe-e2e-*`; this catches the
 * rows written before it did (round 3: 22 of 59 typed scans, 12 devices). Lower case, no quotes.
 */
export const SYNTHETIC_QUERIES = ['zzqxwv'];

/** One row of counts. Probes, our own test runs and demo scans are out of every number. */
export function funnelSql({ from, toExclusive, today }) {
  const real = `device_id NOT LIKE 'probe-%' AND device_id NOT IN (SELECT device_id FROM scan WHERE kind = 'text' AND lower(trim(query_text)) IN (${SYNTHETIC_QUERIES.map((q) => `'${q}'`).join(', ')}))`;
  return `
WITH seen AS (
  SELECT device_id, created_at AS t FROM event WHERE ${real}
  UNION ALL
  SELECT device_id, scanned_at AS t FROM scan WHERE ${real} AND is_demo = 0
), phones AS (
  SELECT device_id FROM event WHERE ${real} AND type = 'app_open'
  UNION
  SELECT device_id FROM scan WHERE ${real} AND is_demo = 0
), first AS (
  SELECT device_id, MIN(t) AS first_at FROM seen GROUP BY device_id
), first_in_range AS (
  SELECT device_id, first_at FROM first WHERE first_at >= '${from}' AND first_at < '${toExclusive}'
), cohort AS (
  SELECT device_id, first_at FROM first_in_range WHERE device_id IN (SELECT device_id FROM phones)
), ev AS (
  SELECT device_id, type,
         CASE WHEN json_valid(payload) THEN json_extract(payload, '$.screen') END AS screen,
         CASE WHEN json_valid(payload) THEN json_extract(payload, '$.outcome') END AS outcome,
         CASE WHEN json_valid(payload) THEN json_extract(payload, '$.claude') END AS claude,
         substr(created_at, 1, 10) AS day, created_at, id
  FROM event WHERE ${real}
), latest_agreement AS (
  SELECT e.device_id, e.claude FROM ev e
  WHERE e.type = 'agreement'
    AND e.id = (SELECT x.id FROM ev x WHERE x.device_id = e.device_id AND x.type = 'agreement' ORDER BY x.created_at DESC, x.id DESC LIMIT 1)
)
SELECT
  (SELECT COUNT(*) FROM cohort) AS new_phones,
  (SELECT COUNT(*) FROM first_in_range WHERE device_id NOT IN (SELECT device_id FROM phones)) AS other_ids,
  (SELECT COUNT(DISTINCT s.device_id) FROM scan s JOIN cohort c ON c.device_id = s.device_id
     WHERE s.outcome = 'answered' AND s.is_demo = 0) AS first_answer,
  (SELECT COUNT(DISTINCT s.device_id) FROM scan s JOIN cohort c ON c.device_id = s.device_id
     WHERE s.outcome = 'answered' AND s.is_demo = 0 AND s.range_source = 'shin_prices') AS with_shop_prices,
  (SELECT COUNT(DISTINCT e.device_id) FROM ev e JOIN cohort c ON c.device_id = e.device_id
     WHERE e.type = 'scan_limit_hit') AS hit_limit,
  (SELECT COUNT(DISTINCT e.device_id) FROM ev e JOIN cohort c ON c.device_id = e.device_id
     WHERE e.type = 'screen_view' AND e.screen = 'paywall') AS paywall_views,
  (SELECT COUNT(DISTINCT e.device_id) FROM ev e JOIN cohort c ON c.device_id = e.device_id
     WHERE e.type = 'paywall_buy' AND e.outcome = 'tapped') AS tapped_subscribe,
  (SELECT COUNT(DISTINCT e.device_id) FROM ev e JOIN cohort c ON c.device_id = e.device_id
     WHERE e.type = 'paywall_buy' AND e.outcome = 'done') AS purchases,
  (SELECT COUNT(DISTINCT e.device_id) FROM ev e JOIN cohort c ON c.device_id = e.device_id
     WHERE e.type = 'scan_limit_hit'
       AND EXISTS (SELECT 1 FROM ev t WHERE t.device_id = e.device_id AND t.type = 'paywall_buy' AND t.outcome = 'tapped')) AS hit_limit_and_tapped,
  (SELECT COUNT(*) FROM cohort WHERE date(substr(first_at, 1, 10), '+7 days') <= '${today}') AS day7_eligible,
  (SELECT COUNT(*) FROM cohort c WHERE date(substr(c.first_at, 1, 10), '+7 days') <= '${today}'
     AND EXISTS (SELECT 1 FROM ev e WHERE e.device_id = c.device_id AND e.type = 'app_open'
                   AND e.day = date(substr(c.first_at, 1, 10), '+7 days'))) AS day7_returned,
  (SELECT COUNT(*) FROM scan WHERE ${real} AND is_demo = 0 AND outcome = 'answered'
     AND scanned_at >= '${from}' AND scanned_at < '${toExclusive}') AS answered_scans,
  (SELECT COUNT(*) FROM scan WHERE ${real} AND is_demo = 0 AND outcome = 'answered' AND range_source = 'claude_typical'
     AND scanned_at >= '${from}' AND scanned_at < '${toExclusive}') AS claude_scans,
  (SELECT COUNT(*) FROM latest_agreement a JOIN cohort c ON c.device_id = a.device_id) AS agreed_phones,
  (SELECT COUNT(*) FROM latest_agreement a JOIN cohort c ON c.device_id = a.device_id WHERE a.claude IN (1, 'true')) AS claude_yes_phones
`;
}

const pct = (n, of) => (of > 0 ? `${((100 * n) / of).toFixed(1)}%` : 'n/a');
const line = (label, n, of, note = '') => `  ${label.padEnd(18)}${String(n).padStart(5)}  of ${String(of).padStart(5)}  ${pct(n, of).padStart(6)}${note ? `  ${note}` : ''}`;

export function formatReport(r, range) {
  const c = (k) => Number(r[k] ?? 0);
  const out = [
    `Funnel for phones first seen ${range.from} to ${range.to} (UTC days), as of ${range.today}. Probes and demo scans excluded.`,
    `  new phones        ${String(c('new_phones')).padStart(5)}`,
    line('first answer', c('first_answer'), c('new_phones')),
    line('with shop prices', c('with_shop_prices'), c('new_phones')),
    line('hit the limit', c('hit_limit'), c('new_phones')),
    line('paywall views', c('paywall_views'), c('new_phones')),
    line('tapped Subscribe', c('tapped_subscribe'), c('new_phones')),
    line('purchases', c('purchases'), c('new_phones')),
    line('day-7 return', c('day7_returned'), c('day7_eligible'), 'of phones first seen 7+ days ago'),
    `  other ids         ${String(c('other_ids')).padStart(5)}  usage events only, never opened the app or scanned (not phones)`,
    '',
    'Falsifier (docs/decisions.md: under 1 in 10 who reach the limit tap Subscribe):',
    line('hit limit, tapped', c('hit_limit_and_tapped'), c('hit_limit')),
    '',
    'Claude estimate:',
    line('ask rate', c('claude_scans'), c('answered_scans'), 'of answered scans in the range'),
    line('consent rate', c('claude_yes_phones'), c('agreed_phones'), 'of new phones that answered the agreement'),
  ];
  return out.join('\n');
}

/** Runs the one query through `query(sql) -> rows`. */
export async function runReport(query, opts = {}) {
  const range = resolveRange(opts);
  let rows;
  try {
    rows = await query(funnelSql(range));
  } finally {
    query.close?.();
  }
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('the funnel query did not return one row');
  return { range, numbers: rows[0] };
}

export function fileQuery(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  const q = async (sql) => db.prepare(sql).all();
  q.close = () => db.close();
  return q;
}

export function liveQuery({ origin, token, fetchFn = fetch }) {
  return async (sql) => {
    const res = await fetchFn(`${origin.replace(/\/$/, '')}/api/admin/sql`, { method: 'POST', headers: { 'x-shin-admin': token }, body: sql });
    if (!res.ok) throw new Error(`the admin route answered ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error);
    return body.rows;
  };
}

function parseArgs(argv) {
  const a = { db: null, live: false, origin: 'https://relay.anjiawenda.com', from: undefined, to: undefined, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--live') a.live = true;
    else if (k === '--json') a.json = true;
    else if (['--db', '--origin', '--from', '--to'].includes(k)) {
      if (argv[i + 1] === undefined) throw new Error(`${k} needs a value`);
      a[k.slice(2)] = argv[(i += 1)];
    } else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const a = parseArgs(process.argv.slice(2));
    let query;
    if (a.live) {
      const token = process.env.SHIN_ADMIN_TOKEN?.trim();
      if (!token) throw new Error('--live needs SHIN_ADMIN_TOKEN in your shell');
      query = liveQuery({ origin: a.origin, token });
    } else if (a.db) query = fileQuery(a.db);
    else throw new Error('give --db <scans.db> (a read-only copy) or --live');
    const { range, numbers } = await runReport(query, { from: a.from, to: a.to });
    console.log(a.json ? JSON.stringify({ range, ...numbers }) : formatReport(numbers, range));
  } catch (e) {
    console.error(`funnel-report: ${e.message}`);
    process.exit(1);
  }
}
