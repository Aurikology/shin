#!/usr/bin/env node
/**
 * DATA FRESHNESS ALARM. Run by the GitHub outage alarm (.github/workflows/server-alarm.yml) beside
 * the phone contract probe. Fails, so GitHub emails Jamin, when the live server's prices have stopped
 * being refreshed.
 *
 * Today it checks one thing: the weekly Project Hammer refresh (mac/hammer-refresh.sh, scheduled by
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

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = (i >= 0 && args[i + 1] ? args[i + 1] : 'https://relay.anjiawenda.com').replace(/\/+$/, '');
  let body;
  try {
    const r = await fetch(`${base}/api/health`, { headers: { origin: 'capacitor://localhost' }, signal: AbortSignal.timeout(30_000) });
    body = await r.json().catch(() => null);
  } catch (err) {
    console.error(`SERVER UNREACHABLE: ${base}/api/health: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
    return;
  }
  const v = judgeFreshness(body, Date.now());
  if (v.ok) console.log(`FRESH  ${v.why}`);
  else console.error(`STALE  ${v.why}`);
  process.exitCode = v.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  await main();
}
