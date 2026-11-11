/**
 * Starts the real Pexi server (app/server.ts) inside this process for the answer-key run, with
 * every write pointed at a fresh temp folder and every model call made impossible.
 *
 * WHAT IS SAFE AND HOW IT IS KNOWN (read the code, 2026-11-11):
 *   - The catalogue file is opened only read-only: app/server.ts attachCatalogue ->
 *     openCatalogueReadOnly (catalogue/src/schema.ts), the search worker (catalogue/src/worker.ts)
 *     opens the same way, and nothing else in the server imports a catalogue writer. Misses are
 *     logged to SHIN_GAPS, a separate file, which is a temp file here.
 *   - The prices file is opened read-only too (server.ts 1435, 1660), and this run gives it a TEMP
 *     COPY anyway.
 *   - Every path setting in settings/src/index.ts is pointed into the temp folder (same rule the
 *     test setup uses, app/test/setup/data-paths.mjs), then checked, and the real data folders are
 *     compared by size and modified time before and after the run.
 *   - No model: every provider key is blanked, the range-ask provider is a stub that counts and
 *     throws, and any fetch that leaves this machine is refused and counted.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
export const LIVE_MARKER = join(REPO_ROOT, '.shin-live-server');

/** Every key a model or an embedding service could be called with. Blanked, never read. */
const MODEL_KEYS = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENAI_API_KEY',
  'VOYAGE_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'XAI_API_KEY',
];

const MODEL_HOST = /(anthropic|googleapis|google|openai|voyageai|groq|mistral|x\.ai)/i;

export interface Meter {
  /** Calls into the stubbed range-ask provider (a model call would have been made). */
  providerCalls: number;
  /** Fetches to a model host that the guard refused. */
  modelFetches: number;
  /** Fetches to any other host that the guard refused (for example Open Food Facts). */
  otherOutbound: string[];
}

export interface Running {
  readonly base: string;
  readonly tempDir: string;
  readonly meter: Meter;
  readonly realDataChanges: () => string[];
  stop(): Promise<void>;
}

export interface StartOptions {
  /** A catalogue file to serve from (read-only). Null with `buildInjected` for the synthetic test. */
  cataloguePath: string | null;
  /** A prices file; it is COPIED into the temp folder and the copy is served. */
  pricesPath: string | null;
  /** Builds a synthetic catalogue in-process (the test). Called AFTER every setting is in the environment and BEFORE any repo module is imported, because price/src/store.ts reads SHIN_PRICES at import time. */
  buildInjected?: ((tempDir: string) => Promise<{ catalogue: unknown; db: unknown }>) | null;
}

export async function startAnswerKeyServer(opts: StartOptions): Promise<Running> {
  if (existsSync(LIVE_MARKER)) {
    throw new Error(`refused: ${LIVE_MARKER} exists, so the live Pexi server runs from this folder. Run in a separate copy of the repo.`);
  }
  if (process.cwd() !== REPO_ROOT && existsSync(join(process.cwd(), '.shin-live-server'))) {
    throw new Error(`refused: the current folder holds a .shin-live-server marker (${process.cwd()}).`);
  }

  const dataPaths = (await import(pathToFileURL(join(REPO_ROOT, 'app', 'test', 'setup', 'data-paths.mjs')).href)) as {
    pathSettings(): Promise<{ env: string; name: string; kind: 'file' | 'dir' }[]>;
    realDataRoots(settings: { env: string; name: string; kind: 'file' | 'dir' }[], env: NodeJS.ProcessEnv): string[];
    snapshotTree(roots: string[]): Map<string, string>;
    treeDifferences(a: Map<string, string>, b: Map<string, string>): string[];
    isInside(path: string, root: string): boolean;
  };
  const settings = await dataPaths.pathSettings();

  // The real data folders as they are before anything of ours runs (the shell's own path settings count).
  const roots = dataPaths.realDataRoots(settings, process.env);
  if (opts.cataloguePath) roots.push(resolve(opts.cataloguePath, '..'));
  const before = dataPaths.snapshotTree([...new Set(roots)]);

  const tempDir = mkdtempSync(join(tmpdir(), 'shin-answer-key-'));
  // Windows keeps an open SQLite file locked until the process ends, so stop() may not manage the delete.
  process.once('exit', () => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* the OS will take it */
    }
  });

  // 1. Every path setting into the temp folder. A file setting gets a file name, a folder setting a folder.
  for (const s of settings) {
    const p = join(tempDir, s.name);
    if (s.kind === 'dir') mkdirSync(p, { recursive: true });
    process.env[s.env] = p;
  }
  // The names the brief lists, set explicitly in case a row's default prose stops being recognised.
  const explicit: Record<string, string> = {
    SHIN_DATA_DIR: join(tempDir, 'data'),
    SHIN_SCANS: join(tempDir, 'scans.db'),
    SHIN_REPEAT_CACHE: join(tempDir, 'repeat-cache.db'),
    SHIN_GAPS: join(tempDir, 'gaps.db'),
    SHIN_CORRECTIONS: join(tempDir, 'corrections.db'),
    SHIN_PHOTOS: join(tempDir, 'photos'),
    SHIN_RANGE_ASK_STORE_PATH: join(tempDir, 'range-ask.json'),
    SHIN_USER_CATALOGUE: join(tempDir, 'user-catalogue.db'),
  };
  mkdirSync(explicit.SHIN_DATA_DIR, { recursive: true });
  for (const [k, v] of Object.entries(explicit)) process.env[k] = v;

  // 2. Prices: a temp copy (with its WAL and shared-memory files, so unmerged rows are not lost).
  const pricesCopy = join(tempDir, 'prices.db');
  if (opts.pricesPath) {
    copyFileSync(opts.pricesPath, pricesCopy);
    for (const ext of ['-wal', '-shm']) if (existsSync(opts.pricesPath + ext)) copyFileSync(opts.pricesPath + ext, pricesCopy + ext);
  }
  process.env.SHIN_PRICES = pricesCopy;

  // 3. The catalogue: the given file, or a path that does not exist when a synthetic one is built.
  process.env.SHIN_CATALOGUE = opts.cataloguePath ? resolve(opts.cataloguePath) : join(tempDir, 'no-catalogue.db');

  process.env.PORT = '0';
  process.env.SHIN_CATALOGUE_FIRST = '1';
  for (const k of ['SHIN_INVITE_CODE', 'SHIN_RANGE_ASK_CEILING_CENTS', 'SHIN_FREE_SCANS_PER_WEEK', 'SHIN_REQUIRE_DB']) {
    delete process.env[k];
  }
  // A cap of 0 turns the Claude range ask and the pack read off at the source (identify/src/range-ask.ts
  // reserveMonthlyRangeCall), so the provider stub below is a tripwire that should never be touched.
  process.env.SHIN_RANGE_ASK_MONTHLY_CAP = '0';
  process.env.SHIN_PACK_READ_MONTHLY_CAP = '0';
  // Thousands of asks from one address must not meet the abuse limits (src/rate-limit.ts).
  for (const k of ['SHIN_RATE_CODE_PER_10MIN', 'SHIN_RATE_CODE_PER_DAY', 'SHIN_RATE_IP_PER_10MIN', 'SHIN_RATE_IP_PER_DAY', 'SHIN_RATE_DOOR_IP_PER_10MIN', 'SHIN_RATE_DOOR_IP_PER_DAY', 'SHIN_FREE_SCANS_PER_IP_DAY']) {
    process.env[k] = '100000000';
  }
  // 4. No model: blank every key (a blank is what "unset" reads as), and a placeholder nothing will accept.
  for (const k of MODEL_KEYS) process.env[k] = '';

  // 5. Check the wiring before the server is imported: every path setting is inside the temp folder, but the catalogue.
  for (const s of settings) {
    const v = process.env[s.env] ?? '';
    const ok = dataPaths.isInside(v, tempDir) || (s.env === 'SHIN_CATALOGUE' && opts.cataloguePath !== null);
    if (!ok) throw new Error(`refused: ${s.env}=${v} points outside the temp folder`);
  }

  // 6. Outbound guard: nothing leaves this machine.
  const meter: Meter = { providerCalls: 0, modelFetches: 0, otherOutbound: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String((input as Request).url);
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      /* a relative or malformed URL is not outbound */
    }
    if (host === '127.0.0.1' || host === 'localhost' || host === '') return realFetch(input, init);
    if (MODEL_HOST.test(host)) meter.modelFetches += 1;
    else meter.otherOutbound.push(host);
    return Promise.reject(new Error(`answer-key run: outbound fetch to ${host} refused`));
  }) as typeof fetch;

  // 7. A synthetic catalogue is built now: the environment is complete and no repo module is imported yet.
  const injected = opts.buildInjected ? await opts.buildInjected(tempDir) : null;

  const mod = await import(pathToFileURL(join(REPO_ROOT, 'app', 'server.ts')).href);
  const { server } = mod as { server: import('node:http').Server };

  const stubProvider = {
    name: 'answer-key-model-stub',
    async send(): Promise<never> {
      meter.providerCalls += 1;
      throw new Error('answer-key run: a model call was attempted');
    },
  };
  if (injected) {
    mod.setCatalogueForTests(injected.catalogue);
    mod.setCatalogueFirstForTests({ searcher: injected.catalogue, db: injected.db, rangeAskProvider: stubProvider, packReadProvider: stubProvider });
  } else {
    // db and searcher left undefined: the server uses the catalogue it attached itself (read-only).
    mod.setCatalogueFirstForTests({ rangeAskProvider: stubProvider, packReadProvider: stubProvider });
  }

  if (!server.listening) {
    await Promise.race([
      new Promise<void>((r) => server.once('listening', () => r())),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('server did not start listening within 30 s')), 30_000)),
    ]);
  }
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  if (!injected) {
    // attachCatalogue() runs after the port opens; typed search needs it.
    const t0 = Date.now();
    for (;;) {
      try {
        const h = (await (await realFetch(`${base}/api/health`)).json()) as { catalogueUp?: boolean };
        if (h.catalogueUp) break;
      } catch {
        /* not up yet */
      }
      if (Date.now() - t0 > 120_000) throw new Error('the catalogue did not attach within 120 s');
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return {
    base,
    tempDir,
    meter,
    realDataChanges: () => dataPaths.treeDifferences(before, dataPaths.snapshotTree([...new Set(roots)])),
    async stop() {
      mod.setCatalogueForTests?.(null);
      mod.setCatalogueFirstForTests?.(null);
      globalThis.fetch = realFetch;
      await new Promise<void>((r) => server.close(() => r()));
      server.closeAllConnections?.();
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* a locked file on Windows; the temp folder is left */
      }
    },
  };
}
