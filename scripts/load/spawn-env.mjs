/**
 * The environment of the throwaway server `load-test.mjs --spawn` starts, and the guard against
 * pointing the load test at the live host. Pure functions, so scripts/test/load-test-env.test.mjs
 * can check them without starting a server (gap 99).
 *
 * WHY. mac/config.env is exported on the home Mac, so SHIN_SCANS and its siblings were in the
 * parent's environment and the child inherited them: app/server.ts prefers SHIN_SCANS over
 * SHIN_DATA_DIR, so the "throwaway" server wrote load-test scans into the LIVE scan file.
 * The child now gets every SHIN_* variable removed, then only the ones set on purpose.
 */

/** Read-only settings the child may inherit from the parent: it opens these, it never writes them. */
export const READ_ONLY_PASSTHROUGH = ['SHIN_CATALOGUE', 'SHIN_PRICES'];

export const LIVE_HOSTS = ['relay.anjiawenda.com'];

/**
 * @param {Record<string, string|undefined>} parentEnv  process.env
 * @param {{ writes?: Record<string,string>, dataDir: string, port: number|string, invite?: string, catalogue?: string }} opts
 */
export function buildSpawnEnv(parentEnv, opts) {
  const env = {};
  for (const [k, v] of Object.entries(parentEnv)) {
    if (v === undefined) continue;
    if (k.toUpperCase().startsWith('SHIN_')) continue;
    env[k] = v;
  }
  for (const k of READ_ONLY_PASSTHROUGH) if (parentEnv[k]) env[k] = parentEnv[k];
  if (opts.catalogue) env.SHIN_CATALOGUE = opts.catalogue;
  Object.assign(env, opts.writes ?? {});
  env.PORT = String(opts.port);
  env.SHIN_DATA_DIR = opts.dataDir;
  env.SHIN_RATE_DOOR_IP_PER_10MIN = '100000000';
  env.SHIN_RATE_DOOR_IP_PER_DAY = '100000000';
  env.SHIN_INVITE_CODE = opts.invite ?? '';
  return env;
}

/** An error message when baseUrl is the live host and the run was not told --i-mean-live; else null. */
export function liveHostRefusal(baseUrl, argv) {
  let host = '';
  try { host = new URL(baseUrl).hostname.toLowerCase(); } catch { return null; }
  const live = LIVE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!live || argv.includes('--i-mean-live')) return null;
  return `${host} is the LIVE server. A load test would hammer real shoppers' host; pass --i-mean-live if you truly mean it.`;
}
