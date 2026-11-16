/**
 * Shared set-up for the route-by-route attack tests (security-*.test.mjs), V3 of the 2026-11-16
 * vulnerability check (docs/security-legal-check-plan-2026-11-16.md).
 *
 * Every attack runs against a server started in THIS test process, on a port the OS picked, with
 * temp databases: global.mjs and child.mjs point every path setting into a temp folder, a test run
 * refuses to start in the live server's folder, and no fetch to Open Food Facts leaves the machine.
 * The fakes below stand in for the three outside services a request can reach (Claude,
 * RevenueCat, Overpass), so nothing here spends money or sends a name anywhere.
 *
 * Each test file calls `boot({...})` first, because the server reads some settings once, when it is
 * first imported, and the files must not share a process.
 *
 * A "tunnel" request is one that carries `cf-connecting-ip`. A request with none is treated as local
 * and is exempt from every per-address limit (src/rate-limit.ts, isLocalRequest), so the limit tests
 * send the header exactly as the Cloudflare tunnel would.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A GTIN-13 with a correct check digit from a 12-digit body. */
export function gtin13(body12) {
  const digits = body12.padStart(12, '0').split('').map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
  return `${body12.padStart(12, '0')}${(10 - (sum % 10)) % 10}`;
}

export async function boot({ env = {}, products = 0, consent = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shin-sec-'));
  mkdirSync(join(dir, 'data'), { recursive: true });
  const set = {
    SHIN_SCANS: join(dir, 'scans.db'),
    SHIN_REPEAT_CACHE: join(dir, 'repeat-cache.db'),
    SHIN_GAPS: join(dir, 'gaps.db'),
    SHIN_CORRECTIONS: join(dir, 'corrections.db'),
    SHIN_PHOTOS: join(dir, 'photos'),
    SHIN_CATALOGUE: join(dir, 'no-catalogue.db'),
    SHIN_PRICES: join(dir, 'prices.db'),
    SHIN_RANGE_ASK_STORE_PATH: join(dir, 'range-ask.json'),
    SHIN_PACK_READ_STORE_PATH: join(dir, 'pack-read.json'),
    SHIN_DATA_DIR: join(dir, 'data'),
    SHIN_ACCESS_LOG: join(dir, 'data', 'access.log'),
    SHIN_SHUTTER_DIR: join(dir, 'data', 'shutter'),
    SHIN_PEOPLE_DB: join(dir, 'data', 'people.db'),
    PORT: '0',
    SHIN_CATALOGUE_FIRST: '1',
  };
  for (const k of [
    'SHIN_INVITE_CODE', 'SHIN_INVITES', 'SHIN_SHUTTER_LOG', 'REVENUECAT_SECRET_KEY', 'SHIN_PLUS_TRUST_CLIENT',
    'SHIN_FREE_SCANS_PER_WEEK', 'SHIN_PLUS_SCANS_PER_WEEK', 'SHIN_ADMIN_TOKEN', 'SHIN_DEVELOPER_DEVICES',
    'SHIN_RANGE_ASK_MONTHLY_CAP', 'SHIN_PACK_READ_MONTHLY_CAP', 'SHIN_FREE_SCANS_PER_IP_DAY', 'ANTHROPIC_API_KEY',
    'SHIN_RATE_IP_PER_10MIN', 'SHIN_RATE_IP_PER_DAY', 'SHIN_RATE_CODE_PER_10MIN', 'SHIN_RATE_CODE_PER_DAY',
    'SHIN_RATE_DOOR_IP_PER_10MIN', 'SHIN_RATE_DOOR_IP_PER_DAY',
  ]) delete process.env[k];
  Object.assign(process.env, set, env);

  const { openCatalogue, rebuildFts } = await import('../../catalogue/src/schema.ts');
  const { rebuildCategoriesFromPaths } = await import('../../catalogue/test/helpers/path-taxonomy.ts');
  const { Catalogue } = await import('../../catalogue/src/search.ts');
  const { openPrices } = await import('../../price/src/store.ts');
  openPrices(process.env.SHIN_PRICES).close();

  const catDb = openCatalogue(':memory:');
  const insert = catDb.prepare(`
    INSERT INTO product (code, name, name_en, name_fr, brands, quantity, size_value,
      size_unit, category_path, leaf_category, allergens, sold_in_canada, source)
    VALUES (?,?,?,NULL,?,?,?,?,?,?,'[]',1,'test')`);
  const path = '["en:beverages","en:sodas","en:colas"]';
  const codes = [];
  for (let i = 0; i < products; i += 1) {
    const code = gtin13(String(627990100000 + i));
    codes.push(code);
    insert.run(code, `Fizzco Cola Number${i}x`, `Fizzco Cola Number${i}x`, 'Fizzco', '2 L', 2000, 'ml', path, 'en:colas');
  }
  rebuildFts(catDb);
  rebuildCategoriesFromPaths(catDb);
  const noEmbedder = {
    id: 'test:none', dim: 384,
    async embedPassages() { throw new Error('vector arm should be off'); },
    async embedQuery() { throw new Error('vector arm should be off'); },
  };
  const catalogue = new Catalogue(catDb, noEmbedder);

  /** Every product name Claude was sent, and every frame it was sent. */
  const claude = { asked: [], frames: 0 };
  const rangeAskProvider = {
    name: 'fake-claude-range',
    async send(req) {
      claude.asked.push(req.user);
      return {
        value: { known: true, low_cents: 199, high_cents: 349, currency: 'CAD', unit: 'each', confidence: 'medium' },
        usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
        provider: 'anthropic',
        model: 'claude-test',
      };
    },
  };
  const packReadProvider = {
    name: 'fake-claude-pack',
    async send() {
      claude.frames += 1;
      return {
        value: { name: 'Fake Cola', brand: 'Fizzco', size: '2 L' },
        usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
        provider: 'anthropic',
        model: 'claude-test',
      };
    },
  };

  const mod = await import('../server.ts');
  const { server } = mod;
  if (!server.listening) await new Promise((r) => server.once('listening', () => r()));
  const port = server.address().port;
  mod.setCatalogueForTests(catalogue);
  mod.setCatalogueFirstForTests({
    searcher: catalogue,
    db: catDb,
    rangeAskProvider,
    packReadProvider,
    requireClaudeConsent: consent,
    claudeWaitMs: 2000,
  });

  const base = `http://127.0.0.1:${port}`;
  const call = (method, path2, { headers = {}, body, raw } = {}) =>
    fetch(`${base}${path2}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
  return {
    dir, base, port, mod, codes, claude, catDb,
    get: (p, headers) => call('GET', p, { headers }),
    post: (p, body, headers) => call('POST', p, { headers, body }),
    postRaw: (p, raw, headers) => call('POST', p, { headers, raw }),
    /** The headers a phone sends: its id and its secret. */
    phone: (id, key) => ({ 'x-shin-device': id, 'x-shin-device-key': key }),
    async close() {
      mod.setCatalogueForTests(null);
      mod.setCatalogueFirstForTests(null);
      await new Promise((r) => server.close(() => r()));
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps the sqlite file locked */ }
    },
  };
}
