/**
 * The sealed batch against REAL git, in a throwaway repository under the OS
 * temp directory (never this repo). Reproduces the third audit's double-open:
 * open, rerun the same day, `git checkout -- bench/sealed`, open again.
 * Skipped when git is not on PATH.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSealed, guardSealed, logPathFor, realGit } from '../src/sealed.ts';
import { writeResult } from '../src/results.ts';

let hasGit = true;
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  hasGit = false;
}

function repo(fn: (r: { dir: string; path: string; results: string; git: (...a: string[]) => string }) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-sealgit-'));
  try {
    const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q');
    git('config', 'user.email', 'bench-test@example.invalid');
    git('config', 'user.name', 'bench test');
    git('config', 'core.autocrlf', 'false');
    const path = join(dir, 'bench', 'sealed', 'sealed.json');
    const results = join(dir, 'bench', 'results');
    fn({ dir, path, results, git });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const opts = (path: string, results: string, extra: object = {}) => ({ configuredPath: path, resultsDir: results, git: realGit, ...extra });

function sealAndCommit(r: { path: string; git: (...a: string[]) => string }) {
  createSealed(r.path, ['0012345678905', '111'], 'test batch', '2026-10-05', realGit);
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'seal');
}

test('an uncommitted batch cannot be scored against, and deleting it then is not a silent "none"', { skip: !hasGit }, () => {
  repo((r) => {
    createSealed(r.path, ['111'], 'n', '2026-10-05', realGit);
    assert.throws(() => guardSealed(r.path, opts(r.path, r.results)), /not committed/);
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'seal');
    assert.equal(guardSealed(r.path, opts(r.path, r.results)).mode, 'excluded');
    // Deleted after it was committed: git history refuses "none".
    rmSync(r.path);
    rmSync(logPathFor(r.path));
    assert.throws(() => guardSealed(r.path, opts(r.path, r.results)), /git history/);
  });
});

test("the audit's double-open: open, same-day rerun, git checkout -- bench/sealed, open again: refused", { skip: !hasGit }, () => {
  repo((r) => {
    sealAndCommit(r);
    const g = guardSealed(r.path, opts(r.path, r.results, { openSealed: true, write: true }));
    assert.equal(g.mode, 'opened');
    const rec = { sealed: { mode: 'opened', keysSha256: g.mode === 'opened' ? g.keysSha256 : '' } };
    const first = writeResult(r.results, 'sealed-opened', rec);
    // Same-day rerun: a second result file, the first is never overwritten.
    const second = writeResult(r.results, 'baseline', { sealed: { mode: 'excluded' } });
    assert.notEqual(first, second);
    assert.ok(existsSync(first));
    assert.equal(readdirSync(r.results).length, 2);
    // Restore the unopened stamp from git, then try to open again.
    r.git('checkout', '--', 'bench/sealed');
    assert.equal(JSON.parse(readFileSync(r.path, 'utf8')).opened, null);
    assert.throws(() => guardSealed(r.path, opts(r.path, r.results, { openSealed: true, write: true })), /already records opening/);
  });
});

test('a committed "opened" event in git history refuses a second opening even with results/ gone', { skip: !hasGit }, () => {
  repo((r) => {
    sealAndCommit(r);
    guardSealed(r.path, opts(r.path, r.results, { openSealed: true, write: true }));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'open');
    // Put the unopened versions back and commit that too, with no results/ at all.
    r.git('checkout', 'HEAD~1', '--', 'bench/sealed');
    r.git('commit', '-q', '-m', 'revert the stamp');
    rmSync(r.results, { recursive: true, force: true });
    assert.equal(JSON.parse(readFileSync(r.path, 'utf8')).opened, null);
    assert.throws(() => guardSealed(r.path, opts(r.path, r.results, { openSealed: true, write: true })), /committed "opened" event/);
  });
});

test('opening refuses while the batch has uncommitted changes', { skip: !hasGit }, () => {
  repo((r) => {
    sealAndCommit(r);
    // A CRLF rewrite leaves the hash check happy but is still an uncommitted change.
    const text = readFileSync(r.path, 'utf8');
    execFileSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(r.path)}, ${JSON.stringify(text.replace(/\n/g, '\r\n'))})`]);
    assert.throws(() => guardSealed(r.path, opts(r.path, r.results, { openSealed: true, write: true })), /uncommitted changes/);
  });
});

test('result files are never overwritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-results-'));
  try {
    mkdirSync(dir, { recursive: true });
    const now = new Date('2026-10-05T12:00:00');
    const a = writeResult(dir, 'baseline', { x: 1 }, now);
    const b = writeResult(dir, 'baseline', { x: 2 }, now);
    assert.notEqual(a, b);
    assert.deepEqual(JSON.parse(readFileSync(a, 'utf8')), { x: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
