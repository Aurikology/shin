#!/usr/bin/env node
/**
 * DATA FRESHNESS ALARM. Run by the GitHub outage alarm (.github/workflows/server-alarm.yml) beside
 * the phone contract probe. Fails, so GitHub emails Jamin, when the live server's prices have stopped
 * being refreshed.
 *
 * It checks two things. (1) The strict reading `watch` that /api/health carries (app/src/watch.ts):
 * catalogue, scan log, Claude cap and account, RevenueCat, salt, retention, backup age, disk, price
 * sources, deploy checker; any listed problem fails. (2) The weekly Project Hammer refresh (mac/hammer-refresh.sh, scheduled by
 * mac/launchd/com.shin.hammer.plist). Its last step marks the prices file; /api/health reports that
 * mark as `hammerRefreshedAt`. Missing, null, unreadable or older than HAMMER_STALE_DAYS fails. A
 * refresh that failed, hung, or was never scheduled all look the same from here, and all are loud.
 * Jamin, 2026-11-08: "go" (schedule the weekly refresh and make a failure reach him).
 *
 *   node scripts/data-freshness.mjs [--base https://relay.anjiawenda.com]
 *
 * Exit 0 fresh, 1 stale or unknown, 2 server unreachable.
 */

/** A weekly job plus one day of slack for a Mac that slept through Sunday morning. */
export const HAMMER_STALE_DAYS = 8;

/**
 * The verdict on one /api/health body. Pure, so the test can show it fail. `now` in ms.
 * @param {unknown} health
 * @param {number} now
 * @returns {{ ok: boolean, why: string }}
 */
export function judgeFreshness(health, now) {
  if (!health || typeof health !== 'object') return { ok: false, why: 'health answer is not JSON' };
  const at = /** @type {Record<string, unknown>} */ (health).hammerRefreshedAt;
  if (at === undefined) return { ok: false, why: 'the server does not report hammerRefreshedAt (old build, or the field was removed)' };
  if (at === null) return { ok: false, why: 'the weekly Project Hammer refresh has never finished on the live prices file' };
  const t = typeof at === 'string' ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return { ok: false, why: `hammerRefreshedAt is not a date: ${JSON.stringify(at)}` };
  const days = (now - t) / 86_400_000;
  if (days > HAMMER_STALE_DAYS) {
    return { ok: false, why: `the last whole Project Hammer refresh was ${days.toFixed(1)} days ago (${at}); the limit is ${HAMMER_STALE_DAYS}. Check mac/logs/hammer.err.log on the Mac.` };
  }
  return { ok: true, why: `Project Hammer refreshed ${days.toFixed(1)} days ago (${at})` };
}

/**
 * The strict reading (app/src/watch.ts): `/api/health` keeps `ok: true` for the phone, and `watch`
 * is what the alarm reads. Fails when `watch.ok` is not exactly true, when a problem is listed, and
 * when the server is an old build with no `watch` at all (unknown is not a pass). Pure.
 * @param {unknown} health
 * @returns {{ ok: boolean, why: string }}
 */
export function judgeWatch(health) {
  if (!health || typeof health !== 'object') return { ok: false, why: 'health answer is not JSON' };
  const w = /** @type {Record<string, unknown>} */ (health).watch;
  if (!w || typeof w !== 'object') return { ok: false, why: 'the server does not report watch (old build, or the field was removed)' };
  const { ok, problems } = /** @type {{ ok?: unknown, problems?: unknown }} */ (w);
  if (ok === true) return { ok: true, why: 'watch ok, no problems listed' };
  const list = Array.isArray(problems) ? problems : [];
  // Public health (gap 96) lists short non-security codes as strings; the admin body lists { code, why }.
  // A failing watch whose causes are all private (keys, accounts, billing, rate limits) lists nothing.
  if (list.length === 0) return { ok: false, why: `watch.ok is ${JSON.stringify(ok)}; the cause is not one of the publicly named checks (read the admin health body on the Mac)` };
  const lines = list.map((p) => `${p && typeof p === 'object' ? `${p.code}: ${p.why}` : String(p)}`);
  const codes = list.map((p) => (p && typeof p === 'object' ? String(p.code) : String(p)));
  return { ok: false, why: `${list.length} problem(s) on the live server: ${codes.join(', ')}${list.some((p) => p && typeof p === 'object') ? `\n  ${lines.join('\n  ')}` : ''}` };
}

/**
 * The first words of the alarm's failure message, so the email says which kind of failure it is.
 * DOWN: the phone routes failed. DEGRADED: the routes answered but the strict reading names problems
 * (the codes follow). Null when nothing failed. Pure.
 * @param {boolean} routesFailed
 * @param {{ ok: boolean, why: string }} watch  judgeWatch's verdict
 * @param {{ ok: boolean, why: string }} [fresh]  judgeFreshness's verdict
 * @returns {string | null}
 */
export function alarmHeadline(routesFailed, watch, fresh) {
  if (routesFailed) return 'DOWN: the phone routes failed (the probe output above says which)';
  if (watch.ok && (!fresh || fresh.ok)) return null;
  const parts = [];
  if (!watch.ok) parts.push(`watch problems: ${watch.why.replace(/^\d+ problem\(s\) on the live server: /, '').split('\n')[0]}`);
  if (fresh && !fresh.ok) parts.push(`prices: ${fresh.why}`);
  return `DEGRADED (routes fine, ${parts.join('; ')})`;
}

/**
 * GET /api/health, retried so a tunnel blip (HTTP 530, a refused connection) does not email.
 * Gives `{ body, error }`: `body` null with an `error` only after every try failed.
 * @param {string} base
 * @param {{ fetchFn?: typeof fetch, sleepFn?: (ms: number) => Promise<unknown>, tries?: number, waitMs?: number }} [opts]
 */
export async function fetchHealth(base, opts = {}) {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleepFn = opts.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const tries = opts.tries ?? 3;
  const waitMs = opts.waitMs ?? 20_000;
  let error = 'no attempt made';
  for (let n = 1; n <= tries; n++) {
    try {
      const r = await fetchFn(`${base}/api/health`, { headers: { origin: 'capacitor://localhost' }, signal: AbortSignal.timeout(30_000) });
      if (r.status >= 500) error = `HTTP ${r.status}`;
      else {
        const body = await r.json().catch(() => null);
        if (body !== null) return { body, error: null };
        error = `HTTP ${r.status} with a body that is not JSON`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (n < tries) await sleepFn(waitMs);
  }
  return { body: null, error };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = (i >= 0 && args[i + 1] ? args[i + 1] : 'https://relay.anjiawenda.com').replace(/\/+$/, '');
  const { body, error } = await fetchHealth(base);
  if (body === null) {
    console.error(`SERVER UNREACHABLE: ${base}/api/health: ${error}`);
    process.exitCode = 2;
    return;
  }
  // Both checks always run and both are said, so one failure never hides the other.
  const fresh = judgeFreshness(body, Date.now());
  const watch = judgeWatch(body);
  if (fresh.ok) console.log(`FRESH  ${fresh.why}`);
  else console.error(`STALE  ${fresh.why}`);
  if (watch.ok) console.log(`WATCH  ${watch.why}`);
  else console.error(`WATCH FAILED  ${watch.why}`);
  // The headline goes last so it is the line the failed-run email shows. --routes-failed is passed by the
  // workflow when the phone contract probe failed (DOWN); without it a failure here is DEGRADED.
  const headline = alarmHeadline(args.includes('--routes-failed'), watch, fresh);
  if (headline) {
    console.error(headline);
    // GitHub's failed-run email shows annotations, not log lines: make the headline one so the email says it.
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error title=${headline.split(' ')[0]}::${headline}`);
  }
  process.exitCode = fresh.ok && watch.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  await main();
}
