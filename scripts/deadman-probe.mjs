#!/usr/bin/env node
/**
 * DEAD-MAN SWITCH PING, run on the Mac every minute (readiness R02).
 *
 * The outside uptime monitor and the GitHub alarm both look at the server from the internet, so
 * neither can tell "the tunnel blipped" from "the Mac is dead" quickly, and neither runs when
 * GitHub delays its schedule. This is the other direction: the Mac tells an outside service
 * (Healthchecks.io, free tier) that it is alive and well, once a minute. When the pings stop,
 * for any reason (power, internet, the server, this job), the service emails. When the server's
 * strict reading (`watch` in /api/health, app/src/watch.ts) lists a problem, the ping goes to the
 * service's /fail address, which emails too, with the problem text in the message.
 *
 *   SHIN_DEADMAN_URL=https://hc-ping.com/<uuid> node scripts/deadman-probe.mjs [--base http://127.0.0.1:4173]
 *
 * SHIN_DEADMAN_URL lives in mac/config.env (the sign-up steps are in docs/readiness/needs-jamin.md).
 * Exit 0: one ping was sent (success or fail address). Non-zero: no address set, or the ping could
 * not be sent, which launchd's error log shows.
 */
import { judgeWatch } from './data-freshness.mjs';

/**
 * Which address to ping, and with what text. Pure.
 * @param {unknown} health the local /api/health body, or null when it did not answer
 * @param {string | null} unreachable why it did not answer
 * @param {string} pingUrl
 * @returns {{ url: string, failed: boolean, body: string }}
 */
export function decidePing(health, unreachable, pingUrl) {
  const root = pingUrl.replace(/\/+$/, '');
  if (health === null) return { url: `${root}/fail`, failed: true, body: `the server on the Mac did not answer: ${unreachable ?? 'unknown'}` };
  const v = judgeWatch(health);
  return v.ok ? { url: root, failed: false, body: 'ok' } : { url: `${root}/fail`, failed: true, body: v.why };
}

/**
 * One run: read the local health, send one ping.
 * @param {{ pingUrl: string, base: string, fetchFn?: typeof fetch }} o
 * @returns {Promise<{ code: number, message: string }>}
 */
export async function runDeadman({ pingUrl, base, fetchFn = fetch }) {
  if (!pingUrl) return { code: 1, message: 'SHIN_DEADMAN_URL is not set: no dead-man ping can be sent' };
  let health = null;
  let unreachable = null;
  try {
    const r = await fetchFn(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) });
    health = await r.json().catch(() => null);
    if (health === null) unreachable = `HTTP ${r.status} with a body that is not JSON`;
  } catch (err) {
    unreachable = err instanceof Error ? err.message : String(err);
  }
  const d = decidePing(health, unreachable, pingUrl);
  try {
    await fetchFn(d.url, { method: 'POST', body: d.body.slice(0, 10_000), signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    return { code: 1, message: `the dead-man ping could not be sent: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { code: 0, message: d.failed ? `pinged FAIL: ${d.body}` : 'pinged ok' };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = (i >= 0 && args[i + 1] ? args[i + 1] : `http://127.0.0.1:${process.env.PORT || '4173'}`).replace(/\/+$/, '');
  const r = await runDeadman({ pingUrl: (process.env.SHIN_DEADMAN_URL || '').trim(), base });
  (r.code === 0 ? console.log : console.error)(r.message);
  process.exitCode = r.code;
}
