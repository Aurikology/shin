import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isValidLaneName,
  defaultLanesRoot,
  packageFoldersWithLockfiles,
  parseWorktreeList,
  isRegisteredWorktree,
  findLinks,
} from '../lane-worktree.mjs';

test('isValidLaneName accepts a bare identifier', () => {
  assert.equal(isValidLaneName('zz-selftest'), true);
  assert.equal(isValidLaneName('lane_1'), true);
});

test('isValidLaneName refuses path separators and traversal', () => {
  assert.equal(isValidLaneName('../escape'), false);
  assert.equal(isValidLaneName('a/b'), false);
  assert.equal(isValidLaneName('a\\b'), false);
  assert.equal(isValidLaneName('.'), false);
  assert.equal(isValidLaneName('..'), false);
  assert.equal(isValidLaneName(''), false);
});

test('defaultLanesRoot: C:\\shin-lanes on win32, a sibling shin-lanes folder elsewhere', () => {
  assert.equal(defaultLanesRoot('C:\\shin', 'win32'), 'C:\\shin-lanes');
  assert.equal(defaultLanesRoot('/Users/j/shin', 'darwin'), join('/Users/j', 'shin-lanes'));
});

test('packageFoldersWithLockfiles finds only folders with their own package-lock.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'lane-pkgs-'));
  try {
    mkdirSync(join(root, 'app'));
    writeFileSync(join(root, 'app', 'package-lock.json'), '{}');
    mkdirSync(join(root, 'catalogue'));
    writeFileSync(join(root, 'catalogue', 'package-lock.json'), '{}');
    mkdirSync(join(root, 'no-lockfile'));
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'node_modules', 'package-lock.json'), '{}'); // must never count
    mkdirSync(join(root, '.git'));
    assert.deepEqual(packageFoldersWithLockfiles(root), ['app', 'catalogue']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parseWorktreeList reads worktree/HEAD/branch/detached from porcelain output', () => {
  const text = [
    'worktree C:/shin',
    'HEAD a83aba06ff2900b4cecd5f25e94b5a7b9dc41b96',
    'branch refs/heads/main',
    '',
    'worktree C:/shin-lanes/zz-selftest',
    'HEAD 1111111111111111111111111111111111111111',
    'detached',
    '',
  ].join('\n');
  const worktrees = parseWorktreeList(text);
  assert.equal(worktrees.length, 2);
  assert.equal(worktrees[0].path, 'C:/shin');
  assert.equal(worktrees[0].branch, 'refs/heads/main');
  assert.equal(worktrees[0].detached, false);
  assert.equal(worktrees[1].path, 'C:/shin-lanes/zz-selftest');
  assert.equal(worktrees[1].detached, true);
});

test('isRegisteredWorktree: refusal case -- a folder git never registered is not a worktree', () => {
  const worktrees = parseWorktreeList('worktree C:/shin\nHEAD abc\nbranch refs/heads/main\n');
  assert.equal(isRegisteredWorktree(worktrees, 'C:/shin-lanes/never-created'), false);
});

test('isRegisteredWorktree matches a registered path across slash/case differences', () => {
  const worktrees = parseWorktreeList('worktree C:/shin-lanes/zz-selftest\nHEAD abc\ndetached\n');
  assert.equal(isRegisteredWorktree(worktrees, 'C:\\shin-lanes\\zz-selftest'), true);
  assert.equal(isRegisteredWorktree(worktrees, 'C:\\SHIN-LANES\\ZZ-SELFTEST'), true);
});

// findLinks: built entirely inside an OS temp folder created for this test,
// never near this repo's real node_modules (the incident this script exists
// to prevent started with exactly that link).
test('findLinks: refusal case -- a junction/symlink inside the tree is found', () => {
  const root = mkdtempSync(join(tmpdir(), 'lane-links-'));
  try {
    const real = join(root, 'real-target');
    mkdirSync(real);
    writeFileSync(join(real, 'file.txt'), 'x');
    const linkPath = join(root, 'app', 'linked-dir');
    mkdirSync(join(root, 'app'));
    symlinkSync(real, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    const links = findLinks(root, 3);
    assert.deepEqual(links, ['app/linked-dir']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLinks: a plain tree with no links reports none', () => {
  const root = mkdtempSync(join(tmpdir(), 'lane-links-clean-'));
  try {
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    writeFileSync(join(root, 'a', 'b', 'file.txt'), 'x');
    assert.deepEqual(findLinks(root, 3), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLinks: a symlinked node_modules ITSELF is still found (the actual incident shape)', () => {
  const root = mkdtempSync(join(tmpdir(), 'lane-links-nm-'));
  try {
    const real = join(root, 'shared-modules');
    mkdirSync(real);
    const linkPath = join(root, 'app', 'node_modules');
    mkdirSync(join(root, 'app'));
    symlinkSync(real, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    assert.deepEqual(findLinks(root, 3), ['app/node_modules']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLinks: never descends INSIDE a real (non-linked) node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'lane-links-inside-nm-'));
  try {
    const nm = join(root, 'app', 'node_modules', '.bin');
    mkdirSync(nm, { recursive: true });
    const real = join(root, 'app', 'somewhere-else');
    mkdirSync(real);
    // A link that legitimately lives inside node_modules/.bin must never be reported.
    symlinkSync(real, join(nm, 'a-bin-shim'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(findLinks(root, 3), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLinks respects maxDepth', () => {
  const root = mkdtempSync(join(tmpdir(), 'lane-links-depth-'));
  try {
    const real = join(root, 'real-target');
    mkdirSync(real);
    const deepDir = join(root, 'a', 'b', 'c');
    mkdirSync(deepDir, { recursive: true });
    // depth 4 from root: a(1)/b(2)/c(3)/link(4) -- beyond maxDepth 3, must not be found.
    symlinkSync(real, join(deepDir, 'too-deep-link'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(findLinks(root, 3), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
