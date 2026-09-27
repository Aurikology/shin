/**
 * ONE place every setting the code reads lives.
 *
 * WHY. Founder, 2026-09-27: "some code is dependent on certain decisions. When
 * a decision is changed, their code is normally not changed, this creates a
 * lot of piled up garbage in the repo." Before this file, the same env var
 * was read from a dozen different spots with a dozen slightly different
 * defaults, and nothing tied a read to the ruling that decided its value.
 * Retiring a ruling should turn the build red until the code that reads its
 * key is gone too; that only works if every read goes through one table.
 *
 * WHAT A KEY IS. Each row below is one environment variable this repo's live
 * code reads, tagged with the exact RULINGS.md `### ` title that decided its
 * value, or the literal string `'operational'` when no ruling decided it (a
 * port, a path, a token, a log file -- plumbing, not a product decision).
 * `scripts/test/settings-rulings.test.mjs` fails the build when a ruling
 * title here is not a real heading in RULINGS.md, or when a `SHIN_*` name on
 * a RULINGS.md `Governs:` line has no row here.
 *
 * HOW A GETTER WORKS. Every getter takes the SAME optional `env` parameter
 * the call sites already used before this module existed
 * (`env: NodeJS.ProcessEnv = process.env`), and returns the RAW value --
 * `undefined` when unset, otherwise exactly what `process.env` held, with no
 * trim and no default applied here. Every trim, default, boolean check or
 * numeric parse that used to sit next to `process.env.X` still sits next to
 * the call to this module's getter, unchanged. That is deliberate: it is what
 * keeps a read-once module-level constant reading once, a read-per-call
 * default parameter reading per call, and a `.trim() || 'off'` check reading
 * exactly the same values it read before -- for every configuration this
 * repo's tests already cover. Moving the literal `process.env.X` into one
 * function per key is the whole change; the parsing around it is not
 * rewritten, because rewriting it is exactly the kind of edit this module
 * exists to make unnecessary next time a ruling changes.
 *
 * SECRETS (`secret: true` below: API keys, tokens) are read through the same
 * getters, but no getter here gives one a default value, and nothing in this
 * module ever logs one. `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` and the rest
 * stay absent-or-present; a caller's own `?? ''` still decides what "absent"
 * means to it, exactly as before.
 *
 * `.env` (repo root, gitignored) is loaded into `process.env` by
 * `identify/src/env.ts`'s `loadDotEnv()`, called once from
 * `identify/src/cap.ts` before the first spend-cap check of a process; that
 * call site is unchanged by this module. A getter below reads whatever
 * `process.env` holds at the time it is called, `.env`-sourced or not.
 */

export interface SettingKey {
  /** The environment variable name, exactly as `process.env` would key it. */
  readonly env: string;
  /** Prose describing the default a caller applies when this is unset (this module applies none). */
  readonly default: string;
  /** The exact RULINGS.md `### ` title that decided this value, or 'operational'. */
  readonly ruling: string;
  /** True for an API key or token: never given a default, never logged, here or anywhere else. */
  readonly secret?: true;
}

/** Every setting this repo's live code reads. One row per environment variable, not per call site. */
export const SETTINGS: readonly SettingKey[] = [
  // -- Gemini switch and model choice -----------------------------------
  { env: 'SHIN_MODEL_PROVIDER', default: "unset -> not 'gemini'", ruling: 'Gemini switch and call architecture' },
  { env: 'SHIN_GEMINI_MODEL', default: 'unset -> per-tier default', ruling: 'Default Gemini model is gemini-3.8-flash' },
  { env: 'SHIN_GEMINI_MODEL_3', default: "'gemini-3.8-flash'", ruling: 'Default Gemini model is gemini-3.8-flash' },
  // -- Barcode answers Shin's own prices too ----------------------------
  { env: 'SHIN_BARCODE_OWN_PRICES', default: "'1' (on)", ruling: "A scanned barcode answers with Shin's own prices too" },
  // -- Caching and cancellation ------------------------------------------
  { env: 'SHIN_REPEAT_CACHE', default: "'data/repeat-cache.db'", ruling: 'Caching and cancellation' },
  // -- Gemini spend cap: the dollar spend cap -----------------------
  { env: 'SHIN_PHOTO_DAILY_CAP_CAD', default: '10 (CAD, soft cap)', ruling: 'Gemini spend cap' },
  { env: 'SHIN_PHOTO_HARD_CAP_CAD', default: '10x the soft cap', ruling: 'Gemini spend cap' },
  { env: 'SHIN_SPEND_CAP_STORE_PATH', default: 'identify/data/spend-cap.json', ruling: 'Gemini spend cap' },
  // -- Shin Plus pricing and free scans ------------------------------------
  { env: 'SHIN_FREE_SCANS_PER_WEEK', default: 'unset/empty/0/NaN -> unlimited (off)', ruling: 'Shin Plus pricing and free scans' },
  // -- Record everything the user does -------------------------------------
  { env: 'SHIN_ACCESS_LOG', default: '<SHIN_DATA_DIR>/access.log', ruling: 'Record everything the user does' },
  { env: 'SHIN_SHUTTER_LOG', default: "on; 'off' disables", ruling: 'Record everything the user does' },
  { env: 'SHIN_SHUTTER_DIR', default: '<SHIN_DATA_DIR>/shutter', ruling: 'Record everything the user does' },
  // -- Server-side guards and limits ----------------------------------------
  { env: 'SHIN_RATE_CODE_PER_10MIN', default: '200', ruling: 'Server-side guards and limits' },
  { env: 'SHIN_RATE_CODE_PER_DAY', default: '1500', ruling: 'Server-side guards and limits' },
  { env: 'SHIN_RATE_IP_PER_10MIN', default: '90', ruling: 'Server-side guards and limits' },
  { env: 'SHIN_RATE_IP_PER_DAY', default: '600', ruling: 'Server-side guards and limits' },
  // -- v1 floor: what the MVP ships ------------------------------------------
  { env: 'SHIN_GEMINI_TIER', default: 'unset -> no photo identification', ruling: 'v1 floor: what the MVP ships, and how photo identification returns' },
  // -- Catalogue first; Gemini is a capped fallback, never the identity -----
  { env: 'SHIN_CATALOGUE_FIRST', default: "off; only '1', 'on' or 'true' turns it on", ruling: 'Catalogue first; Gemini is a capped fallback, never the identity' },
  { env: 'SHIN_RANGE_ASK_MONTHLY_CAP', default: '1000 (asks per UTC month; 0 turns the ask off)', ruling: 'Catalogue first; Gemini is a capped fallback, never the identity' },
  { env: 'SHIN_RANGE_ASK_CEILING_CENTS', default: '2000000 (highest high_cents accepted)', ruling: 'Catalogue first; Gemini is a capped fallback, never the identity' },
  { env: 'SHIN_RANGE_ASK_STORE_PATH', default: 'identify/data/range-ask.json', ruling: 'Catalogue first; Gemini is a capped fallback, never the identity' },

  // -- Operational: plumbing with no product ruling ------------------------
  { env: 'PORT', default: '4173', ruling: 'operational' },
  { env: 'SHIN_CATALOGUE', default: 'data/catalogue.db (repo-relative)', ruling: 'operational' },
  { env: 'SHIN_VECTORS', default: 'unset -> decided from embedded row count', ruling: 'operational' },
  { env: 'SHIN_USER_CATALOGUE', default: 'derived from SHIN_SCANS, or data/user-catalogue.db', ruling: 'operational' },
  { env: 'SHIN_SCANS', default: 'data/scans.db', ruling: 'operational' },
  { env: 'SHIN_PRICES', default: 'price/data/prices.db', ruling: 'operational' },
  { env: 'SHIN_GAPS', default: 'data/gaps.db', ruling: 'operational' },
  { env: 'SHIN_OVERPASS', default: 'https://overpass-api.de/api/interpreter', ruling: 'operational' },
  { env: 'SHIN_MODEL_MIN_INTERVAL_MS', default: '0 (pacing off)', ruling: 'operational' },
  { env: 'SHIN_GEMINI_GROUNDED_BASE_URL', default: 'falls back to SHIN_GEMINI_BASE_URL', ruling: 'operational' },
  { env: 'SHIN_GEMINI_BASE_URL', default: "Google's real Interactions API endpoint", ruling: 'operational' },
  { env: 'GEMINI_API_KEY', default: 'unset -> Gemini path unavailable', ruling: 'operational', secret: true },
  {
    env: 'SHIN_GEMINI_GROUNDED_MODEL',
    default: "'gemini-3.5-flash-lite' (the id 'claude-haiku-4-5' already resolved to)",
    ruling: 'operational',
  },
  { env: 'SHIN_GROUNDED_TIMEOUT_MS', default: '9000', ruling: 'operational' },
  { env: 'SHIN_GEMINI_TIMEOUT_MS', default: '30000', ruling: 'operational' },
  { env: 'SHIN_GEMINI_MEDIA_RESOLUTION', default: "unset -> provider's own per-tier default", ruling: 'operational' },
  { env: 'SHIN_GEMINI_THINKING', default: 'unset -> per-tier default thinking level', ruling: 'operational' },
  { env: 'SHIN_CORRECTIONS', default: 'price/data/corrections.db', ruling: 'operational' },
  { env: 'REVENUECAT_SECRET_KEY', default: "unset -> 'client_trusted' mode (beta only)", ruling: 'operational', secret: true },
  { env: 'SHIN_ADMIN_TOKEN', default: 'unset -> every /api/admin/* path answers 404', ruling: 'operational', secret: true },
  { env: 'SHIN_DATA_DIR', default: 'process.cwd()/data', ruling: 'operational' },
  { env: 'SHIN_PHOTOS', default: '<repo>/app/data/photos/', ruling: 'operational' },
  { env: 'SHIN_PHOTO_RETENTION_DAYS', default: 'null (keep forever)', ruling: 'operational' },
  { env: 'SHIN_PEOPLE_DB', default: '<dataDir>/people.db', ruling: 'operational' },
  { env: 'SHIN_INVITE_CODE', default: 'unset/empty -> no invite code required', ruling: 'operational' },
  { env: 'SHIN_INVITES', default: 'empty string -> no named invites tracked', ruling: 'operational' },
  { env: 'SHIN_REQUIRE_DB', default: 'unset -> no database required at boot', ruling: 'operational' },
  { env: 'VOYAGE_API_KEY', default: 'unset -> falls back to the local embedder', ruling: 'operational', secret: true },
  { env: 'BESTBUY_API_KEY', default: 'unset -> Best Buy source unavailable', ruling: 'operational', secret: true },
  { env: 'BESTBUY_API_BASE', default: "the source's own DEFAULT_BASE", ruling: 'operational' },
  { env: 'EBAY_API_BASE', default: 'production base, or sandbox if EBAY_ENV=sandbox', ruling: 'operational' },
  { env: 'EBAY_ENV', default: "unset -> production base (not 'sandbox')", ruling: 'operational' },
  { env: 'EBAY_CLIENT_ID', default: 'falls back to EBAY_APP_ID', ruling: 'operational', secret: true },
  { env: 'EBAY_APP_ID', default: 'unset -> eBay source unavailable', ruling: 'operational', secret: true },
  { env: 'EBAY_CLIENT_SECRET', default: 'falls back to EBAY_CERT_ID', ruling: 'operational', secret: true },
  { env: 'EBAY_CERT_ID', default: 'unset -> eBay source unavailable', ruling: 'operational', secret: true },
  { env: 'SOLDCOMPS_API_KEY', default: 'unset -> soldcomps source unavailable', ruling: 'operational', secret: true },
  { env: 'SOLDCOMPS_API_BASE', default: "the source's own DEFAULT_BASE", ruling: 'operational' },
];

/**
 * The raw value of one setting: exactly what `env[name]` holds, `undefined`
 * when unset. Every getter below is this, named after its env var, so a
 * caller keeps writing its own `?.trim()`, `?? fallback` or boolean check
 * right where it always did.
 */
function raw(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name];
}

/* eslint-disable @typescript-eslint/naming-convention -- named after the env var on purpose: grep for the var, find the getter, no second name to keep in sync. */

export function SHIN_MODEL_PROVIDER(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_MODEL_PROVIDER');
}
export function SHIN_GEMINI_MODEL(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_MODEL');
}
export function SHIN_GEMINI_MODEL_3(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_MODEL_3');
}
export function SHIN_BARCODE_OWN_PRICES(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_BARCODE_OWN_PRICES');
}
export function SHIN_REPEAT_CACHE(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_REPEAT_CACHE');
}
export function SHIN_PHOTO_DAILY_CAP_CAD(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_PHOTO_DAILY_CAP_CAD');
}
export function SHIN_PHOTO_HARD_CAP_CAD(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_PHOTO_HARD_CAP_CAD');
}
export function SHIN_SPEND_CAP_STORE_PATH(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_SPEND_CAP_STORE_PATH');
}
export function SHIN_FREE_SCANS_PER_WEEK(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_FREE_SCANS_PER_WEEK');
}
export function SHIN_ACCESS_LOG(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_ACCESS_LOG');
}
export function SHIN_SHUTTER_LOG(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_SHUTTER_LOG');
}
export function SHIN_SHUTTER_DIR(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_SHUTTER_DIR');
}
export function SHIN_RATE_CODE_PER_10MIN(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_RATE_CODE_PER_10MIN');
}
export function SHIN_RATE_CODE_PER_DAY(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_RATE_CODE_PER_DAY');
}
export function SHIN_RATE_IP_PER_10MIN(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_RATE_IP_PER_10MIN');
}
export function SHIN_RATE_IP_PER_DAY(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_RATE_IP_PER_DAY');
}
export function SHIN_GEMINI_TIER(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_TIER');
}
export function SHIN_CATALOGUE_FIRST(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_CATALOGUE_FIRST');
}
export function SHIN_RANGE_ASK_MONTHLY_CAP(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_RANGE_ASK_MONTHLY_CAP');
}
export function SHIN_RANGE_ASK_CEILING_CENTS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_RANGE_ASK_CEILING_CENTS');
}
export function SHIN_RANGE_ASK_STORE_PATH(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_RANGE_ASK_STORE_PATH');
}
export function PORT(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'PORT');
}
export function SHIN_CATALOGUE(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_CATALOGUE');
}
export function SHIN_VECTORS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_VECTORS');
}
export function SHIN_USER_CATALOGUE(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_USER_CATALOGUE');
}
export function SHIN_SCANS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_SCANS');
}
export function SHIN_PRICES(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_PRICES');
}
export function SHIN_GAPS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GAPS');
}
export function SHIN_OVERPASS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_OVERPASS');
}
export function SHIN_MODEL_MIN_INTERVAL_MS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_MODEL_MIN_INTERVAL_MS');
}
export function SHIN_GEMINI_GROUNDED_BASE_URL(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_GROUNDED_BASE_URL');
}
export function SHIN_GEMINI_BASE_URL(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_BASE_URL');
}
export function GEMINI_API_KEY(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'GEMINI_API_KEY');
}
export function SHIN_GEMINI_GROUNDED_MODEL(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_GROUNDED_MODEL');
}
export function SHIN_GROUNDED_TIMEOUT_MS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GROUNDED_TIMEOUT_MS');
}
export function SHIN_GEMINI_TIMEOUT_MS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_TIMEOUT_MS');
}
export function SHIN_GEMINI_MEDIA_RESOLUTION(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_MEDIA_RESOLUTION');
}
export function SHIN_GEMINI_THINKING(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_GEMINI_THINKING');
}
export function SHIN_CORRECTIONS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_CORRECTIONS');
}
export function REVENUECAT_SECRET_KEY(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'REVENUECAT_SECRET_KEY');
}
export function SHIN_ADMIN_TOKEN(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_ADMIN_TOKEN');
}
export function SHIN_DATA_DIR(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_DATA_DIR');
}
export function SHIN_PHOTOS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_PHOTOS');
}
export function SHIN_PHOTO_RETENTION_DAYS(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_PHOTO_RETENTION_DAYS');
}
export function SHIN_PEOPLE_DB(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_PEOPLE_DB');
}
export function SHIN_INVITE_CODE(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_INVITE_CODE');
}
export function SHIN_INVITES(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_INVITES');
}
export function SHIN_REQUIRE_DB(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SHIN_REQUIRE_DB');
}
export function VOYAGE_API_KEY(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'VOYAGE_API_KEY');
}
export function BESTBUY_API_KEY(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'BESTBUY_API_KEY');
}
export function BESTBUY_API_BASE(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'BESTBUY_API_BASE');
}
export function EBAY_API_BASE(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'EBAY_API_BASE');
}
export function EBAY_ENV(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'EBAY_ENV');
}
export function EBAY_CLIENT_ID(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'EBAY_CLIENT_ID');
}
export function EBAY_APP_ID(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'EBAY_APP_ID');
}
export function EBAY_CLIENT_SECRET(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'EBAY_CLIENT_SECRET');
}
export function EBAY_CERT_ID(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'EBAY_CERT_ID');
}
export function SOLDCOMPS_API_KEY(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SOLDCOMPS_API_KEY');
}
export function SOLDCOMPS_API_BASE(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return raw(env, 'SOLDCOMPS_API_BASE');
}

/* eslint-enable @typescript-eslint/naming-convention */
