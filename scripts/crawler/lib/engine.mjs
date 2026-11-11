/**
 * The engine: the three jobs a crawl is made of (run, replay, shrink), with coverage folded in after
 * every launch. It runs in the main thread for a small crawl or inside a worker process for a big one;
 * the code is the same, so a result does not depend on which.
 */
import { runOnce } from './world.mjs';
import { chooseStart, makeChooser } from './choose.mjs';
import { makeRng } from './rng.mjs';
import { shrink } from './shrink.mjs';
import { startCoverage, foldCoverage, newAccumulator, packAccumulator } from './coverage.mjs';

export function makeEngine({ coverage = true, routes = null, setup = null, triedSeed = null } = {}) {
  const tried = new Map(triedSeed ? Object.entries(triedSeed) : []);
  let delta = new Map();
  const acc = newAccumulator();
  let launches = 0;
  if (coverage) startCoverage();

  async function launch(args) {
    launches += 1;
    const r = await runOnce({ ...args, routes, setup });
    if (coverage) await foldCoverage(acc);
    return r;
  }

  const slim = (f) => ({ rule: f.rule, severity: f.severity, screen: f.screen, message: f.message, sig: f.sig, cause: f.cause, step: f.step, expectedAt: f.expectedAt });

  return {
    get launches() { return launches; },

    /** One generated run. Everything in the result is plain data, so it can cross a process boundary. */
    async run({ seed, maxSteps, pin = null, plan = null }) {
      const rng = makeRng(seed);
      // `pin` fixes parts of the start state (a test that wants returning users with no faults says so).
      const start = { ...(await chooseStart(rng)), ...(pin ?? {}) };
      const base = makeChooser(rng, tried);
      // Keep the counts this run added, so a parent can fold them into its own.
      const choose = async (ctx) => {
        const step = await base(ctx);
        return step;
      };
      const before = new Map(tried);
      const t0 = Date.now();
      const r = await launch(plan ? { start, seed, maxSteps: plan.length, plan } : { start, seed, maxSteps, choose });
      for (const [k, v] of tried) if (v !== (before.get(k) ?? 0)) delta.set(k, v);
      return {
        seed, start, ms: Date.now() - t0, steps: r.steps, failures: r.failures.map(slim),
        screens: [...r.screens], states: [...r.states], gaps: [...r.gaps], injected: r.injected.length,
      };
    },

    /** Replay explicit steps from a start state. */
    async replay({ start, seed, steps }) {
      const r = await launch({ start, seed, maxSteps: steps.length, plan: steps });
      return { failures: r.failures.map(slim), steps: r.steps };
    },

    /** Shrink one failure. */
    async shrink({ start, seed, steps, cause, atStep, budget }) {
      const replay = async (list) => {
        const r = await launch({ start, seed, maxSteps: list.length, plan: list, cause });
        return { failures: r.failures, steps: r.steps };
      };
      return shrink({ steps, cause, atStep, replay, budget });
    },

    takeTriedDelta() { const d = Object.fromEntries(delta); delta = new Map(); return d; },
    packCoverage() { return coverage ? packAccumulator(acc) : {}; },
    coverageAccumulator: acc,
  };
}
