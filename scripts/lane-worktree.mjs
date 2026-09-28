#!/usr/bin/env node
/**
 * lane-worktree -- give each parallel lane builder its own real copy of the
 * repo, with its own installed node_modules, at a folder outside the repo.
 *
 * WHY THIS EXISTS. Jamin, 2026-09-28 ("build 1-5"): four builders shared one
 * working folder; one linked the shared node_modules into a temp copy and
 * deleted through the link, wiping every dependency for everyone. `create`
 * makes a `git worktree add` copy (detached at origin/main -- this repo is
 * trunk only, CLAUDE.md GIT "NO BRANCHES", so no branch) and runs a REAL
 * `npm ci --prefer-offline` in every package folder that has its own
 * package-lock.json. Real installs, never a link. `remove` refuses to touch
 * anything that is not a worktree this repo actually registered, and refuses
 * if anything under it (excluding inside node_modules, where npm's own bin
 * shims are legitimately symlinks) is itself a symlink or junction -- the
 * exact shape of the incident this script exists to prevent.
 *
 * HOW A LANE'S WORK COMES BACK. This script only creates and destroys the
 * worktree; it never runs git add/commit/push and never touches a status
 * file (CLAUDE.md "The boss and the lanes": the boss is the only writer of
 * NOW.md/DEFECTS.md/docs/decisions.md/SCOREBOARD.md/QUEUE.md/CLAUDE.md). A
 * lane's work is a commit made INSIDE the worktree (its own `git commit`, on
 * this same trunk, no branch) that the boss then pulls into the main working
 * copy and pushes to origin main -- or, when the lane cannot push itself, a
 * patch (`git -C <worktree> format-patch` / diff) handed to the boss to
 * apply there. CLAUDE.md's "The boss and the lanes" section does not yet say
 * which of the two is the default for THIS repo's lanes; it needs one line
 * added saying so.
 *
 *   node scripts/lane-worktree.mjs create <name> [--lanes-root <dir>] [--remote <name>] [--branch <name>]
 *   node scripts/lane-worktree.mjs remove <name> [--lanes-root <dir>]
 *   node scripts/lane-worktree.mjs list
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A lane name is a bare identifier: no path separators, no traversal, no drive letters. */
export function isValidLaneName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== '.' && name !== '..';
}

/**
 * Where lanes live by default: a folder OUTSIDE the repo, never inside it
 * (an inside-repo copy is exactly the "temp copy near a shared node_modules"
 * shape that caused the incident). Windows: C:\shin-lanes. Everywhere else
 * (the Mac): a `shin-lanes` folder sibling of the repo, `<repo>/../shin-lanes`.
 */
export function defaultLanesRoot(repoRoot = REPO_ROOT, platform = process.platform) {
  return platform === 'win32' ? 'C:\\shin-lanes' : join(dirname(repoRoot), 'shin-lanes');
}

/** Normalize a path for comparison across git's forward-slash output and the OS's own separators. */
function normPath(p) {
  return resolve(p).replace(/\\/g, '/').toLowerCase();
}

/**
 * Every top-level package folder that has its own package-lock.json --
 * "each package installs its own dependencies" (CLAUDE.md REPO MAP). The
 * root itself counts too, if it ever gets a lockfile. node_modules and
 * dotfolders are never candidates.
 */
export function packageFoldersWithLockfiles(root) {
  const found = [];
  if (existsSync(join(root, 'package-lock.json'))) found.push('.');
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    if (existsSync(join(root, entry.name, 'package-lock.json'))) found.push(entry.name);
  }
  return found.sort();
}

/** Parse `git worktree list --porcelain` into [{ path, head, branch, detached }]. */
export function parseWorktreeList(porcelainText) {
  const worktrees = [];
  let cur = null;
  for (const line of porcelainText.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length).trim(), head: null, branch: null, detached: false };
      worktrees.push(cur);
    } else if (line.startsWith('HEAD ') && cur) {
      cur.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ') && cur) {
      cur.branch = line.slice('branch '.length).trim();
    } else if (line === 'detached' && cur) {
      cur.detached = true;
    }
  }
  return worktrees;
}

/** The registered worktrees of the repo at `repoRoot`, via the real `git worktree list`. */
export function listWorktrees(repoRoot = REPO_ROOT) {
  const out = execFileSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  return parseWorktreeList(out);
}

/** Is `targetDir` one of `worktrees` (from parseWorktreeList/listWorktrees)? Pure, for testing. */
export function isRegisteredWorktree(worktrees, targetDir) {
  const norm = normPath(targetDir);
  return worktrees.some((w) => normPath(w.path) === norm);
}

/**
 * Every symlink/junction under `root`, up to `maxDepth` levels deep, WITHOUT
 * descending into node_modules (npm legitimately fills node_modules/.bin
 * with symlinks -- that is not the incident this guards against; a linked
 * node_modules ITSELF, or a link anywhere else in the tree, is). Returns
 * root-relative posix paths, depth 1..maxDepth.
 */
export function findLinks(root, maxDepth = 3) {
  const found = [];
  const walk = (dir, rel, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        found.push(entryRel); // a link is a leaf for this walk either way
        continue;
      }
      if (entry.name === 'node_modules') continue; // never descend inside it
      if (entry.isDirectory() && depth < maxDepth) {
        walk(join(dir, entry.name), entryRel, depth + 1);
      }
    }
  };
  walk(root, '', 1);
  return found;
}

/** Run one command, returning { ok, ms, stdout, stderr }. Never throws. */
function runTimed(command, args, opts) {
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: 'utf8', ...opts });
  const ms = Date.now() - started;
  const ok = result.status === 0 && !result.error;
  return { ok, ms, stdout: result.stdout ?? '', stderr: result.error ? String(result.error) : result.stderr ?? '' };
}

/**
 * create: `git worktree add` a detached-at-<remote>/<branch> copy at
 * `<lanesRoot>/<name>` (never a branch), then a REAL `npm ci --prefer-offline`
 * in every package folder with its own package-lock.json. Real installs,
 * never a link.
 */
export function createLane(name, { repoRoot = REPO_ROOT, lanesRoot, remote = 'origin', branch = 'main' } = {}) {
  if (!isValidLaneName(name)) throw new Error(`refused: "${name}" is not a bare lane name`);
  const root = lanesRoot ?? defaultLanesRoot(repoRoot);
  const targetDir = join(root, name);
  if (existsSync(targetDir)) throw new Error(`refused: ${targetDir} already exists`);
  mkdirSync(root, { recursive: true });

  execFileSync('git', ['-C', repoRoot, 'fetch', remote, branch], { stdio: 'inherit' });
  execFileSync(
    'git',
    ['-C', repoRoot, 'worktree', 'add', '--detach', targetDir, `${remote}/${branch}`],
    { stdio: 'inherit' },
  );

  const installs = [];
  for (const pkg of packageFoldersWithLockfiles(targetDir)) {
    const cwd = join(targetDir, pkg);
    // Node refuses to spawn a .cmd file without a shell on Windows (EINVAL since
    // the 2024 batch-file fix), so run npm's own JS entry with this node instead.
    const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const [cmd, pre] = process.platform === 'win32' ? [process.execPath, [npmCli]] : ['npm', []];
    const r = runTimed(cmd, [...pre, 'ci', '--prefer-offline'], { cwd, stdio: 'pipe' });
    installs.push({ pkg, ms: r.ms, ok: r.ok, stderr: r.ok ? null : r.stderr.slice(-2000) });
    console.log(`${r.ok ? 'OK' : 'FAIL'}  ${pkg}  ${(r.ms / 1000).toFixed(1)}s`);
    if (!r.ok) console.error(r.stderr);
  }
  console.log(`lane "${name}": ${targetDir}`);
  return { name, targetDir, installs };
}

/**
 * remove: refuse unless `<lanesRoot>/<name>` is a worktree THIS repo
 * registered, and refuse if anything inside it (depth 3, never descending
 * into node_modules) is a symlink/junction -- the exact shape of the
 * incident this script exists to prevent. Only then `git worktree remove
 * --force` + `git worktree prune`.
 */
export function removeLane(name, { repoRoot = REPO_ROOT, lanesRoot } = {}) {
  if (!isValidLaneName(name)) throw new Error(`refused: "${name}" is not a bare lane name`);
  const root = lanesRoot ?? defaultLanesRoot(repoRoot);
  const targetDir = join(root, name);

  const worktrees = listWorktrees(repoRoot);
  if (!isRegisteredWorktree(worktrees, targetDir)) {
    throw new Error(`refused: ${targetDir} is not a worktree registered to this repo`);
  }
  if (existsSync(targetDir)) {
    const links = findLinks(targetDir, 3);
    if (links.length > 0) {
      throw new Error(`refused: symlink/junction found, never removing through it: ${links.join(', ')}`);
    }
  }

  execFileSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', targetDir], { stdio: 'inherit' });
  execFileSync('git', ['-C', repoRoot, 'worktree', 'prune'], { stdio: 'inherit' });
  console.log(`removed lane "${name}": ${targetDir}`);
  return { name, targetDir };
}

export function listLanes(repoRoot = REPO_ROOT) {
  const worktrees = listWorktrees(repoRoot);
  for (const w of worktrees) {
    console.log(`${w.path}  ${w.detached ? '(detached ' + (w.head ?? '').slice(0, 12) + ')' : (w.branch ?? '')}`);
  }
  return worktrees;
}

function main() {
  const [cmd, name, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--lanes-root') opts.lanesRoot = rest[++i];
    if (rest[i] === '--remote') opts.remote = rest[++i];
    if (rest[i] === '--branch') opts.branch = rest[++i];
  }
  try {
    if (cmd === 'create') createLane(name, opts);
    else if (cmd === 'remove') removeLane(name, opts);
    else if (cmd === 'list') listLanes();
    else {
      console.error(
        'usage: node scripts/lane-worktree.mjs <create|remove|list> [<name>] [--lanes-root <dir>] [--remote <name>] [--branch <name>]',
      );
      process.exit(2);
    }
  } catch (err) {
    console.error(String(err.message ?? err));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
