#!/usr/bin/env node
/**
 * desk-check: runs the acceptance checks of a desk pass and says, check by check, whether the
 * work is correct. Saved 2026-11-19 at Aurik's ask: "generate a workflow that gets things done on
 * my computer right now and automatically checks the work to see if its correct".
 *
 * The checks live in a batch file (default notes/desk-checks.mjs), written BEFORE any lane starts,
 * so the builder cannot shape the test to its own work. Each check is either
 *   { id, what, cmd, cwd? }       a shell command, passes on exit 0
 *   { id, what, fn }              async () => ({ ok, evidence }), for checks a command can't say
 *
 * Like scripts/checks.mjs, every run first proves it can see a failure: a check that must fail
 * is run through the same path, and if it is reported green nothing else runs.
 *
 * Usage: node scripts/desk-check.mjs [batch-file] [--only id1,id2]
 * Exit 0 only when every check passed. A check that did not run never passed.
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(',')) : null;
const batchArg = args.find((a, i) => !a.startsWith('--') && i !== onlyAt + 1);
const batchPath = resolve(root, batchArg ?? 'notes/desk-checks.mjs');

async function runOne(c) {
  const t0 = Date.now();
  try {
    if (c.fn) {
      const r = await c.fn({ root });
      return { ok: r.ok === true, evidence: r.evidence ?? '', ms: Date.now() - t0 };
    }
    const r = spawnSync(c.cmd, { cwd: resolve(root, c.cwd ?? '.'), shell: true, encoding: 'utf8', maxBuffer: 64 << 20 });
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' / ');
    return { ok: r.status === 0, evidence: `exit ${r.status}: ${tail}`.slice(0, 300), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, evidence: `threw: ${e.message}`, ms: Date.now() - t0 };
  }
}

const canary = await runOne({ cmd: 'node -e "process.exit(1)"' });
const canaryFn = await runOne({ fn: async () => { throw new Error('canary'); } });
if (canary.ok || canaryFn.ok) {
  console.error('desk-check: the runner reported a known failure as passing; nothing else is trusted.');
  process.exit(2);
}

const { checks } = await import(pathToFileURL(batchPath).href);
const todo = checks.filter((c) => !only || only.has(c.id));
let failed = 0;
for (const c of todo) {
  const r = await runOne(c);
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} ${c.what}`);
  if (!r.ok || process.env.DESK_VERBOSE) console.log(`      ${r.evidence}`);
}
console.log(`\n${todo.length - failed} of ${todo.length} passed (${batchPath.replace(root, '.')})`);
process.exit(failed ? 1 : 0);
