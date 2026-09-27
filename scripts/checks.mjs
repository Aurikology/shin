#!/usr/bin/env node
/**
 * checks -- the ONE runner for this repo's fast checks.
 *
 * WHY THIS EXISTS. docs/decisions.md, "Every push is checked by GitLab, and
 * every prompt that reads like a ruling gets recorded" (2026-09-27): this repo
 * had no CI and no git hooks, so a cleanup guard only ran if a session chose to
 * run it. This file is the single place that runs the fast checks, so the
 * pre-push hook (.githooks/pre-push) and the GitLab job (.gitlab-ci.yml) both
 * call the same thing a session would run by hand, and none of the three can
 * drift from what the other two enforce.
 *
 * WHAT COUNTS AS A CHECK, right now:
 *   1. `node --test` over every *.test.mjs under scripts/test/
 *      (as a glob, `scripts/test/**\/*.test.mjs` -- on this Node build a bare
 *      directory positional arg throws MODULE_NOT_FOUND instead of recursing,
 *      so the glob form is what actually runs the suite; verified live both
 *      ways before choosing it)
 *   2. `node .claude/hooks/selftest.mjs`  -- every hook classifier's cases
 *   3. the guard files below exist        -- a deleted guard must show red,
 *                                             not silently stop being checked
 *
 * SELF-TEST. A checks runner that can report a failure as green is worse than
 * no runner: it is a false "all clear". `--self-test` (and every normal run,
 * first) runs a deliberately failing child (`node -e "process.exit(1)"`)
 * through the exact same runChild() the real checks use, and only calls the
 * runner trustworthy if THAT was reported as failed. If it isn't, nothing
 * else runs -- a runner that can't see one known failure can't be trusted to
 * see any other.
 *
 *   node scripts/checks.mjs              # run every check
 *   node scripts/checks.mjs --self-test  # prove the runner reports failure
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A deleted guard file must fail this check, not silently drop out of it. */
const GUARD_FILES = [
  '.githooks/pre-push',
  '.claude/hooks/ruling-capture.mjs',
  '.gitlab-ci.yml',
  'scripts/checks.mjs',
];

/**
 * Runs one check as a child process. This is the ONE place that decides what
 * "failed" means for a child process, so `--self-test` can prove that
 * decision against a check built to fail.
 */
function runChild(name, command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  const failed = result.status !== 0 || result.error != null;
  const detail = failed
    ? `exit ${result.status ?? 'error: ' + (result.error?.message ?? 'unknown')}, rerun: node ${args.join(' ')}`
    : null;
  return { name, failed, detail };
}

/** A missing guard file is a check that fails and names what is missing. */
function guardFilesCheck() {
  const missing = GUARD_FILES.filter((p) => !existsSync(join(root, p)));
  return {
    name: 'guard files present',
    failed: missing.length > 0,
    detail: missing.length > 0 ? `missing: ${missing.join(', ')}` : null,
  };
}

function report(check) {
  const status = check.failed ? 'FAIL' : 'PASS';
  console.log(check.detail ? `${status}  ${check.name}  (${check.detail})` : `${status}  ${check.name}`);
  return check.failed;
}

function runFastChecks() {
  return [
    runChild('node --test scripts/test/', 'node', ['--test', 'scripts/test/**/*.test.mjs']),
    runChild('node .claude/hooks/selftest.mjs', 'node', ['.claude/hooks/selftest.mjs']),
    guardFilesCheck(),
  ];
}

function main() {
  const args = process.argv.slice(2);
  const selfTestOnly = args.includes('--self-test');

  // The self-test path: prove the runner can report a failure as a failure,
  // through the exact function real checks use, before trusting any of them.
  const proof = runChild('self-test (deliberately failing child)', 'node', ['-e', 'process.exit(1)']);
  const runnerTrustworthy = proof.failed === true;

  if (selfTestOnly) {
    report(proof);
    console.log(
      runnerTrustworthy
        ? 'self-test: PASS -- the runner reported the deliberately failing child as failed.'
        : 'self-test: FAIL -- the runner did NOT report a failing child as failed. The runner cannot be trusted.',
    );
    process.exit(runnerTrustworthy ? 0 : 1);
  }

  if (!runnerTrustworthy) {
    report(proof);
    console.log('checks: 0 run, 1 failed');
    console.log('The runner failed its own self-test, so nothing else ran -- see the line above.');
    process.exit(1);
  }

  const checks = runFastChecks();
  let failedCount = 0;
  for (const check of checks) {
    if (report(check)) failedCount += 1;
  }

  const n = checks.length;
  console.log(`checks: ${n} run, ${failedCount} failed`);
  process.exit(failedCount > 0 || n === 0 ? 1 : 0);
}

main();
