/**
 * A crawl worker: one child process that takes jobs from the parent, runs them with the engine and
 * answers with plain data. The fake browser loads every app module afresh for each launch and V8
 * keeps all of them (about 15 MB a launch), so a worker retires itself after `LAUNCH_LIMIT` launches,
 * handing back its coverage on the way out; the parent starts a fresh one.
 */
import { makeEngine } from './lib/engine.mjs';

const LAUNCH_LIMIT = Number(process.env.CRAWLER_LAUNCH_LIMIT ?? 30);

// A late callback from a finished run (a delayed answer arriving after its screen is gone) must not
// kill the process; the runs themselves already collect the errors that matter.
let strays = 0;
process.on('unhandledRejection', () => { strays += 1; });
process.on('uncaughtException', () => { strays += 1; });

let engine = null;

process.on('message', async (msg) => {
  try {
    if (msg.t === 'init') {
      engine = makeEngine({ coverage: msg.coverage, triedSeed: msg.tried });
      process.send({ t: 'ready' });
      return;
    }
    if (msg.t === 'finish') {
      process.send({ t: 'final', coverage: engine.packCoverage(), strays, launches: engine.launches });
      return;
    }
    let out;
    if (msg.t === 'run') out = await engine.run(msg);
    else if (msg.t === 'shrink') out = await engine.shrink(msg);
    else throw new Error(`unknown job ${msg.t}`);
    const retire = engine.launches >= LAUNCH_LIMIT || msg.t === 'shrink';
    process.send({ t: 'done', id: msg.id, out, tried: engine.takeTriedDelta(), retire, coverage: retire ? engine.packCoverage() : null, strays, launches: engine.launches }, () => {
      if (retire) process.exit(0);
    });
  } catch (e) {
    process.send({ t: 'crash', id: msg.id, error: String(e?.stack ?? e) }, () => process.exit(1));
  }
});
