/**
 * The Pexi screen crawler.
 *
 *   node scripts/crawler/crawl.mjs --runs 500 --steps 30 --seed 1 [--out dir] [--workers 3]
 *                                  [--no-coverage] [--shrink-budget 100] [--max-shrinks 60]
 *
 * It launches the real app in the fake browser (app/test/ux/ux-b5-harness.test.mjs) thousands of
 * times, taps through it with no AI in the loop, judges the screen after every step against fixed
 * rules, cuts every failure down to the shortest tap list that still fails, and writes
 *   <out>/report.md       the verdict first, then failures, coverage, screens
 *   <out>/failures.jsonl  one line per distinct failure: signature, start state, minimal steps, seed
 *   <out>/coverage.json   per-file line and function coverage
 *
 * Exit 1 when any high-severity failure was found, or when the crawl reached fewer than 3 screens (a
 * crawl that reaches nothing must never look like a pass).
 *
 * It judges whether the screens WORK, not whether a price answer is right: another tool does that.
 */
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hash32 } from './lib/rng.mjs';
import { makeEngine } from './lib/engine.mjs';
import { mergePacked, newAccumulator, summarise } from './lib/coverage.mjs';
import { appInventory, buildReport, buildJsonl } from './lib/report.mjs';

const WORKER = fileURLToPath(new URL('./worker.mjs', import.meta.url));

/* ------------------------------------------------------------------ a pool of jobs */

/** Run jobs on `n` worker processes (n >= 1), or in this process (n = 0). Same job shapes either way. */
function makePool({ workers, coverage, routes, setup }) {
  if (workers === 0) {
    const engine = makeEngine({ coverage, routes, setup });
    const acc = engine.coverageAccumulator;
    return {
      async submit(job) { return { out: await engine[job.t](job) }; },
      async close() { return { coverage: engine.packCoverage(), strays: 0, launches: engine.launches }; },
      accumulator: acc,
    };
  }
  const tried = {};
  const slots = [];
  const queue = [];
  const waiting = new Map();
  let nextId = 1;
  const packs = [];
  let strays = 0;
  let launches = 0;
  let closing = false;

  function spawn() {
    const child = fork(WORKER, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const slot = { child, busy: null, ready: false, dead: false };
    child.on('message', (m) => {
      if (m.t === 'ready') { slot.ready = true; pump(); return; }
      if (m.t === 'done' || m.t === 'crash') {
        const job = slot.busy;
        slot.busy = null;
        if (m.t === 'done') {
          for (const [k, v] of Object.entries(m.tried ?? {})) tried[k] = v;
          if (m.retire) { strays += m.strays; launches += m.launches; }
          if (m.coverage) packs.push(m.coverage);
          waiting.get(m.id)?.resolve({ out: m.out });
          waiting.delete(m.id);
          if (m.retire) { slot.dead = true; replace(slot); }
        } else {
          waiting.get(m.id)?.resolve({ crash: m.error });
          waiting.delete(m.id);
          slot.dead = true;
          replace(slot);
        }
        void job;
        pump();
      }
    });
    child.on('exit', () => {
      if (slot.busy && !closing) {
        // The process died under a job (out of memory, a native crash): report it, never hang.
        waiting.get(slot.busy.id)?.resolve({ crash: 'worker process died' });
        waiting.delete(slot.busy.id);
        slot.busy = null;
        if (!slot.dead) { slot.dead = true; replace(slot); }
        pump();
      }
    });
    child.send({ t: 'init', coverage, tried });
    return slot;
  }
  function replace(old) {
    const i = slots.indexOf(old);
    if (closing) { if (i >= 0) slots.splice(i, 1); return; }
    slots[i] = spawn();
  }
  function pump() {
    for (const s of slots) {
      if (s.busy || !s.ready || s.dead || queue.length === 0) continue;
      const job = queue.shift();
      s.busy = job;
      s.child.send(job);
    }
  }
  for (let i = 0; i < workers; i += 1) slots.push(spawn());
  return {
    submit(job) {
      const id = nextId++;
      return new Promise((resolveJob) => {
        waiting.set(id, { resolve: resolveJob });
        queue.push({ ...job, id });
        pump();
      });
    },
    async close() {
      closing = true;
      for (const s of slots) {
        if (s.dead) continue;
        s.child.removeAllListeners('exit');
      }
      // Ask each live worker for its coverage, then let it go.
      await Promise.all(slots.filter((s) => !s.dead).map((s) => new Promise((res) => {
        const on = (m) => { if (m.t === 'final') { packs.push(m.coverage); strays += m.strays; launches += m.launches; s.child.off('message', on); s.child.kill(); res(); } };
        s.child.on('message', on);
        s.child.send({ t: 'finish' });
      })));
      return { packs, strays, launches };
    },
    packs,
  };
}

/* ------------------------------------------------------------------ the crawl */

export async function crawl(options = {}) {
  const opts = {
    runs: 100, steps: 30, seed: 1, out: null, workers: Math.max(1, Math.min(3, cpus().length - 1)),
    coverage: true, shrinkBudget: 100, maxShrinks: 60, routes: null, log: () => {}, ...options,
  };
  if (opts.routes || opts.setup) opts.workers = 0; // route overrides are functions and cannot cross a process boundary
  const log = opts.log;
  const pool = makePool({ workers: opts.workers, coverage: opts.coverage, routes: opts.routes, setup: opts.setup });

  /* phase 1: runs */
  const t0 = Date.now();
  const results = new Array(opts.runs);
  let done = 0;
  let nextIdx = 0;
  const crashes = [];
  async function runLane() {
    for (;;) {
      const i = nextIdx++;
      if (i >= opts.runs) return;
      const seed = hash32(`${opts.seed}:${i}`);
      const res = await pool.submit({ t: 'run', seed, maxSteps: opts.steps, pin: opts.pin ?? null, plan: opts.plan ?? null });
      if (res.crash) crashes.push(`run ${i}: ${res.crash.split('\n')[0]}`);
      else results[i] = res.out;
      done += 1;
      if (done % 25 === 0) log(`  ${done}/${opts.runs} runs`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.workers) }, runLane));
  const runPhaseSec = (Date.now() - t0) / 1000;

  /* group failures by signature; keep the occurrence cheapest to shrink */
  const groups = new Map();
  const expectedCounts = new Map();
  let stepsTaken = 0;
  const reached = { screens: new Set(), states: new Set() };
  const gaps = new Set();
  const mix = {};
  const bump = (k) => { mix[k] = (mix[k] ?? 0) + 1; };
  for (const r of results) {
    if (!r) continue;
    stepsTaken += r.steps.length;
    r.screens.forEach((s) => reached.screens.add(s));
    r.states.forEach((s) => reached.states.add(s));
    r.gaps.forEach((g) => gaps.add(g));
    bump(r.start.first ? 'first launch' : 'returning');
    bump(r.start.plus ? 'Plus' : 'free');
    bump(r.start.lang === 'fr' ? 'French' : 'English');
    bump(`clock +${r.start.clockDays}d`);
    if (r.start.faults.length) bump('with injected faults'); else bump('no faults');
    for (const f of r.failures) {
      if (f.severity === 'expected') {
        const k = `${f.rule}: ${f.message.replace(/:.*$/s, '').slice(0, 60)} (${f.expectedAt})`;
        expectedCounts.set(k, (expectedCounts.get(k) ?? 0) + 1);
        continue;
      }
      let g = groups.get(f.sig);
      if (!g) { g = { f, count: 0, best: null }; groups.set(f.sig, g); }
      g.count += 1;
      if (!g.best || f.step < g.best.f.step) g.best = { f, run: r };
    }
  }

  /* phase 2: shrink each distinct failure */
  const t1 = Date.now();
  const ordered = [...groups.values()].sort((a, b) => (a.f.severity === 'high' ? 0 : 1) - (b.f.severity === 'high' ? 0 : 1) || b.count - a.count);
  const finals = new Array(ordered.length);
  let shrinkNext = 0;
  async function shrinkLane() {
    for (;;) {
      const i = shrinkNext++;
      if (i >= ordered.length) return;
      const { f, best, count } = ordered[i];
      const base = {
        sig: f.sig, rule: f.rule, severity: f.severity, screen: f.screen, message: f.message, count,
        seed: best.run.seed, start: best.run.start, foundAt: best.f.step, originalSteps: best.run.steps.length,
      };
      if (i >= opts.maxShrinks) {
        finals[i] = { ...base, minimal: best.run.steps.slice(0, Math.max(0, best.f.step + 1)), shrunk: false, reproduced: false, replays: 0 };
        continue;
      }
      log(`  shrinking ${i + 1}/${ordered.length}: ${f.rule} on ${f.screen}`);
      const res = await pool.submit({ t: 'shrink', start: best.run.start, seed: best.run.seed, steps: best.run.steps, cause: best.f.cause, atStep: best.f.step, budget: opts.shrinkBudget });
      if (res.crash) {
        crashes.push(`shrink ${f.sig}: ${res.crash.split('\n')[0]}`);
        finals[i] = { ...base, minimal: best.run.steps.slice(0, Math.max(0, best.f.step + 1)), reproduced: false, replays: 0 };
      } else {
        finals[i] = { ...base, minimal: res.out.steps, reproduced: res.out.reproduced, replays: res.out.replays, exhausted: res.out.exhausted };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.workers) }, shrinkLane));
  const shrinkPhaseSec = (Date.now() - t1) / 1000;

  /* phase 3: coverage */
  const closed = await pool.close();
  const acc = opts.workers === 0 ? pool.accumulator : newAccumulator();
  if (opts.workers !== 0) for (const p of closed.packs) mergePacked(acc, p);
  const cov = summarise(acc);

  const failures = finals.filter(Boolean);
  const inventory = appInventory();
  const reachedOut = { screens: [...reached.screens], states: [...reached.states] };
  const timing = {
    runPhaseSec, shrinkPhaseSec,
    runsPerMin: results.filter(Boolean).length / (runPhaseSec / 60),
    stepsPerSec: stepsTaken / runPhaseSec,
    launches: closed.launches || undefined,
  };
  const realScreens = reachedOut.screens.filter((s) => inventory.screens.includes(s));
  const notes = [...crashes.map((c) => `a worker failed: ${c}`)];
  const high = failures.some((f) => f.severity === 'high');
  const exitCode = high || realScreens.length < 3 ? 1 : 0;
  if (realScreens.length < 3) notes.unshift(`Only ${realScreens.length} screens were reached (fewer than 3): this crawl is not a pass whatever else it says.`);

  const result = {
    opts, runs: results.filter(Boolean).length, stepsTaken, failures, cov, reached: reachedOut, inventory, timing, mix,
    gaps: [...gaps], strays: closed.strays, notes, exitCode, expected: [...expectedCounts].map(([what, count]) => ({ what, count })),
  };
  const reportText = buildReport(result);
  result.reportText = reportText;
  if (opts.out) {
    const dir = resolve(opts.out);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'report.md'), reportText);
    writeFileSync(join(dir, 'failures.jsonl'), buildJsonl(failures));
    writeFileSync(join(dir, 'coverage.json'), JSON.stringify(cov, null, 1));
  }
  return result;
}

/* ------------------------------------------------------------------ command line */

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (k === 'no-coverage') o.coverage = false;
    else if (k === 'runs') o.runs = Number(argv[++i]);
    else if (k === 'steps') o.steps = Number(argv[++i]);
    else if (k === 'seed') o.seed = Number(argv[++i]);
    else if (k === 'out') o.out = argv[++i];
    else if (k === 'workers') o.workers = Number(argv[++i]);
    else if (k === 'shrink-budget') o.shrinkBudget = Number(argv[++i]);
    else if (k === 'max-shrinks') o.maxShrinks = Number(argv[++i]);
    else throw new Error(`unknown option --${k}`);
  }
  return o;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  o.out ??= join(process.cwd(), 'crawl-out');
  o.log = (m) => console.error(m);
  process.on('unhandledRejection', () => {});
  process.on('uncaughtException', () => {});
  const r = await crawl(o);
  console.log(r.reportText.split('\n')[0]);
  console.log(`report: ${join(resolve(o.out), 'report.md')}`);
  process.exit(r.exitCode);
}
