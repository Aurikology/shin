/**
 * The scenario check: which data states can a shopper land in, how often does each end in no result or a bad one,
 * and which rung of the price ladder answers.
 *
 *   node scripts/scenarios/scenario-check.mts --catalogue <catalogue.db> --prices <prices.db> [--scans <scans.db>]
 *        [--corrections <corrections.db>] [--n 10] [--seed 7] [--out <dir>] [--previous <summary.json>]
 *
 * Pexi's central goal (RULINGS.md, first entry): barcodes with price ranges for as many US and Canadian items as
 * possible. No result is the worst outcome, a bad result (wrong product, wrong size, misleading range, wrong
 * currency) the second. This tool reports NUMBERS per scenario (scenarios.ts lists them, core.ts finds up to --n real
 * examples of each in the two files and judges each answer); only true breakages fail the run: a wrong product,
 * a converted or mismatched currency, a 5xx or timeout, the 12- and 13-digit forms disagreeing.
 *
 * Each example is asked of the real server (app/server.ts, started in this process) the way the phone asks:
 * GET /api/identify with the scan context api.js sends (market, currency, countryCode, region, language, knows,
 * deviceId), a barcode in gtin or a typed name in text.
 *
 * SAFE TO POINT AT THE REAL FILES, same harness as the answer key (scripts/answer-key/server.ts): the catalogue is
 * opened read-only, the prices file is COPIED to a temp folder, every writable store (scans, corrections, repeat
 * cache, gaps, the range-ask store) is a fresh temp file, nothing leaves the machine, and the Claude range ask is a
 * stub this file controls (zero model calls: any fetch to a model host is refused and counted, and counts as a
 * broken run). The live scan log is never opened for writing. --scans and --corrections are copied to temp, then read.
 *
 * Exit 0 no breakages, 1 breakages, 2 the run itself broke (bad arguments, no example anywhere, the server did not
 * start, a model call, a real data file that changed).
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { rng } from '../answer-key/run.mts';
import { REPO_ROOT, startAnswerKeyServer } from '../answer-key/server.ts';
import {
  buildScenarios, findExamples, judge, loadAgg, loadTraffic, renderMarkdown, summarise, trafficShare, isoDay,
  type AskResult, type Example, type FinderCtx, type Row, type Scenario, type ScenarioSummary,
} from './core.ts';

const ASK_TIMEOUT_MS = 25_000;
/** How long an answer waits for a slow Claude in the claude_slow scenario; the stub takes longer than this. */
const SLOW_WAIT_MS = 300;
const SLOW_STUB_MS = 1500;

export interface ScenarioCheckOptions {
  cataloguePath: string;
  pricesPath: string;
  scansPath?: string | null;
  correctionsPath?: string | null;
  n?: number;
  seed?: number;
  outDir?: string | null;
  previousPath?: string | null;
  quiet?: boolean;
  /** Only these scenario ids (tests). */
  only?: readonly string[];
  /**
   * Running on the machine that also runs the live server (--live-machine): the live server and its
   * jobs write the real data folder all the time (access.log, checker.json), so a change there is
   * reported as a note, not a run problem. The input files themselves must still not change.
   */
  liveMachine?: boolean;
}

export interface ScenarioCheckResult {
  exitCode: 0 | 1 | 2;
  failures: string[];
  summary: { asOf: string; scenarios: ScenarioSummary[]; totals: { examples: number; breakages: number } } | null;
  rows: Row[];
  modelCalls: number;
  stubCalls: number;
  realDataChanges: string[];
}

const stamp = (p: string): string => {
  try {
    const s = statSync(p);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return 'absent';
  }
};

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The query the phone builds for one scan (api.js identify() with scanContext()), minus nothing the server reads. */
export function phonePath(kind: 'barcode' | 'text', value: string, market: Scenario['market'], device: string): string {
  const p = new URLSearchParams();
  if (kind === 'barcode') p.set('gtin', value);
  else p.set('text', value);
  if (market === 'CA') {
    p.set('market', 'Canada'); p.set('currency', 'CAD'); p.set('countryCode', 'CA'); p.set('region', 'British Columbia');
  } else if (market === 'US') {
    p.set('market', 'United States'); p.set('currency', 'USD'); p.set('countryCode', 'US'); p.set('region', 'California');
  }
  p.set('language', 'en-CA');
  p.set('knows', 'national_average');
  p.set('deviceId', device);
  return `/api/identify?${p.toString()}`;
}

async function ask(base: string, path: string): Promise<AskResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
    const text = await res.text();
    let json: Record<string, any> | null = null;
    try {
      const j = JSON.parse(text);
      if (j && typeof j === 'object' && !Array.isArray(j)) json = j;
    } catch {
      json = null;
    }
    return { status: res.status, json, ms: performance.now() - t0, error: res.status === 200 ? (json ? null : 'not json') : `http ${res.status}` };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { status: null, json: null, ms: performance.now() - t0, error: name === 'TimeoutError' || name === 'AbortError' ? `timeout ${ASK_TIMEOUT_MS} ms` : `no answer: ${String((err as Error)?.message ?? err)}` };
  }
}

const copyWithSidecars = (from: string, to: string): void => {
  copyFileSync(from, to);
  for (const ext of ['-wal', '-shm']) if (existsSync(from + ext)) copyFileSync(from + ext, to + ext);
};

export async function runScenarioCheck(opts: ScenarioCheckOptions): Promise<ScenarioCheckResult> {
  const n = opts.n ?? 10;
  const seed = opts.seed ?? 7;
  const failures: string[] = [];
  const rows: Row[] = [];
  const log = (s: string): void => {
    if (!opts.quiet) process.stderr.write(s + '\n');
  };
  const inputs = [opts.cataloguePath, opts.pricesPath, opts.scansPath, opts.correctionsPath].filter((p): p is string => !!p);
  // The main files only: a read-only open of a WAL database may touch its -shm sidecar without changing the data.
  const before = new Map(inputs.map((p) => [p, stamp(p)] as const));
  let running: Awaited<ReturnType<typeof startAnswerKeyServer>> | null = null;
  let cat: DatabaseSync | null = null;
  let prices: DatabaseSync | null = null;
  let corrections: DatabaseSync | null = null;
  let scans: DatabaseSync | null = null;
  const work = mkdtempSync(join(tmpdir(), 'shin-scenario-'));
  let summary: ScenarioCheckResult['summary'] = null;
  let stubCalls = 0;
  let modelCalls = 0;
  let realDataChanges: string[] = [];
  try {
    for (const p of [opts.cataloguePath, opts.pricesPath]) if (!existsSync(p)) throw new Error(`file not found: ${p}`);
    const asOf = isoDay(new Date());
    cat = new DatabaseSync(opts.cataloguePath, { readOnly: true });
    prices = new DatabaseSync(opts.pricesPath, { readOnly: true });
    if (opts.correctionsPath) {
      copyWithSidecars(opts.correctionsPath, join(work, 'corrections-read.db'));
      corrections = new DatabaseSync(join(work, 'corrections-read.db'), { readOnly: true });
    }

    // 1. Scenarios and their real examples.
    const { scenarios: all, dropped } = buildScenarios();
    const scenarios = opts.only ? all.filter((s) => opts.only!.includes(s.id)) : all;
    const ctx: FinderCtx = { cat, prices, corrections, asOf, rand: rng(seed), agg: loadAgg(prices, asOf) };
    const found = new Map<string, Example[]>();
    for (const s of scenarios) {
      ctx.rand = rng((seed ^ hash(s.id)) >>> 0);
      found.set(s.id, findExamples(s, ctx, n));
    }
    const total = [...found.values()].reduce((t, xs) => t + xs.length, 0);
    log(`${scenarios.length} scenarios, ${total} examples (${[...found.values()].filter((x) => x.length === 0).length} scenarios with none)`);
    if (total === 0) throw new Error('no scenario has an example in these files, so nothing was asked');

    // 2. Real traffic weights, where --scans was given.
    let traffic: ReturnType<typeof loadTraffic> | null = null;
    let scansNote = 'No --scans file given: shares of real traffic are not estimated, every scenario is reported unweighted.';
    if (opts.scansPath) {
      if (!existsSync(opts.scansPath)) throw new Error(`file not found: ${opts.scansPath}`);
      copyWithSidecars(opts.scansPath, join(work, 'scans-read.db'));
      scans = new DatabaseSync(join(work, 'scans-read.db'), { readOnly: true });
      const funnel = (await import(pathToFileURL(join(REPO_ROOT, 'scripts', 'funnel-report.mjs')).href)) as { SYNTHETIC_QUERIES: string[]; TEST_DEVICES: string[] };
      traffic = loadTraffic(scans, funnel.TEST_DEVICES, funnel.SYNTHETIC_QUERIES);
      scansNote = `Traffic share is the share of ${traffic.total} real scans (no probe, test or demo devices, no load_test devices) in the scenario's cell of input group x market x price rung${traffic.hasMarket ? '' : ' (this scans file has no country column, so only Canada is estimated)'}; cells are not additive, and n/a means the scan columns cannot tell.`;
    }
    const shares = new Map<string, number | null>(scenarios.map((s) => [s.id, trafficShare(s, traffic)]));

    // 3. The server, with a stub for the Claude range ask.
    running = await startAnswerKeyServer({
      cataloguePath: opts.cataloguePath,
      pricesPath: opts.pricesPath,
      seedTemp: opts.correctionsPath ? (dir) => copyWithSidecars(opts.correctionsPath!, join(dir, 'corrections.db')) : null,
    });
    const meter = running.meter;
    const mod = (await import(pathToFileURL(join(REPO_ROOT, 'app', 'server.ts')).href)) as { setCatalogueFirstForTests(f: unknown): void };
    let mode: 'ok' | 'down' | 'slow' = 'ok';
    const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
      new Promise((res) => {
        const t = setTimeout(res, ms);
        signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
      });
    const claudeStub = {
      name: 'scenario-check-claude-stub',
      async send(req: { user?: string; signal?: AbortSignal }): Promise<unknown> {
        stubCalls += 1;
        if (mode === 'down') throw new Error('scenario stub: Claude is down (connection refused)');
        if (mode === 'slow') await sleep(SLOW_STUB_MS, req.signal);
        const currency = /Currency: ([A-Z]{3})/.exec(req.user ?? '')?.[1] ?? 'CAD';
        return {
          value: { known: true, low_cents: 199, high_cents: 499, currency, unit: 'each', confidence: 'medium' },
          usage: { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
          provider: 'scenario-stub',
          model: 'scenario-stub',
        };
      },
    };
    const tripwire = { name: 'scenario-check-tripwire', async send(): Promise<never> { meter.providerCalls += 1; throw new Error('scenario check: a model call was attempted'); } };
    const setServer = (m: 'ok' | 'down' | 'slow'): void => {
      mode = m;
      mod.setCatalogueFirstForTests({ rangeAskProvider: claudeStub, packReadProvider: tripwire, ...(m === 'slow' ? { claudeWaitMs: SLOW_WAIT_MS } : {}) });
    };
    const rangeStore = process.env.SHIN_RANGE_ASK_STORE_PATH ?? join(running.tempDir, 'range-ask.json');
    const pricesFile = join(running.tempDir, 'prices.db');

    // 4. Ask.
    let device = 0;
    for (const s of scenarios) {
      const examples = found.get(s.id) ?? [];
      if (examples.length === 0) {
        rows.push({ scenario: s, example: null, outcome: null });
        continue;
      }
      try {
        rmSync(rangeStore, { force: true });
      } catch {
        /* a fresh store is the aim; a locked one only means a cached answer */
      }
      process.env.SHIN_RANGE_ASK_MONTHLY_CAP = s.failure === 'claude_cap' ? '0' : '1000000';
      setServer(s.failure === 'claude_down' ? 'down' : s.failure === 'claude_slow' ? 'slow' : 'ok');
      let away = false;
      if (s.failure === 'prices_unavailable') {
        renameSync(pricesFile, pricesFile + '.away');
        away = true;
      }
      try {
        for (const ex of examples) {
          device += 1;
          const dev = `probe-scenario-${seed}-${device}`;
          const calls0 = stubCalls;
          const a = await ask(running.base, phonePath(ex.kind, ex.value, s.market, dev));
          const twin = ex.altValue ? await ask(running.base, phonePath(ex.kind, ex.altValue, s.market, `${dev}-b`)) : null;
          rows.push({ scenario: s, example: ex, outcome: judge(ex, s, a, twin, stubCalls - calls0) });
        }
      } finally {
        if (away) renameSync(pricesFile + '.away', pricesFile);
      }
      log(`  ${s.id}: ${examples.length}`);
    }
    modelCalls = meter.providerCalls + meter.modelFetches;
    if (modelCalls > 0) failures.push(`a real model call was attempted or refused (${meter.providerCalls} provider, ${meter.modelFetches} fetch)`);
    if (meter.otherOutbound.length > 0) log(`outbound fetches refused: ${[...new Set(meter.otherOutbound)].join(', ')}`);

    // 5. Summary.
    let previous: { scenarios?: ScenarioSummary[] } | null = null;
    if (opts.previousPath) {
      try {
        previous = JSON.parse(readFileSync(opts.previousPath, 'utf8')) as { scenarios?: ScenarioSummary[] };
      } catch (err) {
        failures.push(`--previous could not be read: ${(err as Error).message}`);
      }
    }
    const rowsSummary = summarise(scenarios, rows, shares, previous);
    const breakages = rowsSummary.reduce((t, r) => t + r.breakages, 0);
    const benchLine = `cd bench && node src/run.ts --db ${resolve(opts.pricesPath)} --catalogue ${resolve(opts.cataloguePath)} --no-write`;
    summary = { asOf, scenarios: rowsSummary, totals: { examples: total, breakages } };
    if (opts.outDir) {
      const out = resolve(opts.outDir);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'summary.md'), renderMarkdown({ asOf, seed, n, weighted: traffic !== null, scansNote, benchLine, previous: previous !== null, dropped }, rowsSummary));
      writeFileSync(join(out, 'summary.json'), JSON.stringify({ asOf, seed, n, weighted: traffic !== null, files: { catalogue: resolve(opts.cataloguePath), prices: resolve(opts.pricesPath), scans: opts.scansPath ? resolve(opts.scansPath) : null }, benchCommand: benchLine, dropped, totals: { ...summary.totals, modelCalls, stubbedClaudeAsks: stubCalls }, scenarios: rowsSummary }, null, 2));
      writeFileSync(
        join(out, 'findings.jsonl'),
        rows.map((r) => JSON.stringify(r.example ? { scenario: r.scenario.id, example: r.example, outcome: r.outcome } : { scenario: r.scenario.id, example: null, note: "no example in today's data" })).join('\n') + '\n',
      );
    }
    realDataChanges = running.realDataChanges();
    if (realDataChanges.length > 0) {
      const what = `a real data folder changed: ${realDataChanges.slice(0, 5).join('; ')}`;
      if (opts.liveMachine) log(`NOTE (--live-machine, other processes write here): ${what}`);
      else failures.push(what);
    }
  } catch (err) {
    failures.push(String((err as Error)?.message ?? err));
  } finally {
    for (const d of [cat, prices, corrections, scans]) {
      try {
        d?.close();
      } catch {
        /* closed */
      }
    }
    if (running) await running.stop();
    for (const [p, was] of before) if (stamp(p) !== was) failures.push(`an input file changed during the run: ${p}`);
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      /* the OS will take it */
    }
  }
  const exitCode = failures.length > 0 || !summary ? 2 : summary.totals.breakages > 0 ? 1 : 0;
  return { exitCode, failures, summary, rows, modelCalls, stubCalls, realDataChanges };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      catalogue: { type: 'string' }, prices: { type: 'string' }, scans: { type: 'string' }, corrections: { type: 'string' },
      n: { type: 'string', default: '10' }, seed: { type: 'string', default: '7' }, out: { type: 'string' }, previous: { type: 'string' },
      'live-machine': { type: 'boolean', default: false },
    },
  });
  if (!values.catalogue || !values.prices) {
    process.stderr.write('usage: node scripts/scenarios/scenario-check.mts --catalogue <db> --prices <db> [--scans <db>] [--corrections <db>] [--n 10] [--seed 7] [--out <dir>] [--previous <summary.json>] [--live-machine]\n');
    process.exit(2);
  }
  const n = Number(values.n);
  const seed = Number(values.seed);
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(seed)) {
    process.stderr.write('--n must be a positive whole number and --seed a whole number\n');
    process.exit(2);
  }
  const r = await runScenarioCheck({
    cataloguePath: values.catalogue, pricesPath: values.prices, scansPath: values.scans ?? null, correctionsPath: values.corrections ?? null,
    n, seed, outDir: values.out ?? 'scenario-check-out', previousPath: values.previous ?? null, liveMachine: values['live-machine'] === true,
  });
  for (const f of r.failures) process.stderr.write(`RUN PROBLEM: ${f}\n`);
  if (r.summary) {
    const bad = r.summary.scenarios.filter((s) => s.breakages > 0);
    process.stderr.write(`${r.summary.scenarios.length} scenarios, ${r.summary.totals.examples} examples, ${r.summary.totals.breakages} breakages in ${bad.length} scenarios, ${r.stubCalls} stubbed Claude asks, ${r.modelCalls} real model calls\n`);
    for (const s of bad) process.stderr.write(`  ${s.id}: ${Object.entries(s.breakageKinds).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
  }
  process.exit(r.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`scenario-check broke: ${String(err?.stack ?? err)}\n`);
    process.exit(2);
  });
}
