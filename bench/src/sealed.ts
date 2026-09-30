/**
 * The sealed batch (B2). A list of product keys collected after tuning stops,
 * kept out of every score until it is opened, and opened ONCE.
 *
 * Borrowed from the backtest-overfitting paper: a hold-out that is looked at
 * repeatedly stops being a hold-out. So:
 *
 *   - every split takes a guard issued here (`guardSealed`), and refuses a
 *     guard that was not; there is no way to split without asking this file;
 *   - without --open-sealed, every sealed key is removed before any split;
 *   - with --open-sealed (which needs results to be written), the file is
 *     stamped `opened` BEFORE anything is scored, and only the sealed keys are
 *     scored;
 *   - a second opening refuses. Re-sealing means a new batch, collected new.
 *
 * TAMPER CHECK. Beside the batch file sits an append-only log
 * (`<file>.log.jsonl`), one line per event (created, opened), each line
 * carrying the sha256 of the batch file after the event and the hash of the
 * line before it. The guard refuses when:
 *   - the chain does not verify (a line edited, removed or reordered);
 *   - the batch file's sha256 is not the one the last event recorded (the
 *     `opened` stamp or the keys were edited by hand);
 *   - the batch file is missing but the log says one was created, or a path
 *     was given explicitly and nothing is there.
 * The sha256 goes into every result, so a result can be tied to the exact
 * batch it excluded or opened.
 *
 * THREAT MODEL (decided 2026-09-28): the bench protects against ACCIDENTS and
 * QUIET REUSE (someone re-running with the batch opened, a deleted file, a
 * hand edit, a different path, a CRLF checkout), not against a malicious
 * insider with write access to the repo, who can rewrite the file, the log and
 * git history together. Concretely:
 *   - at the configured path (bench/sealed/sealed.json), a missing batch is
 *     accepted as "none" only when git history shows no sealed file ever
 *     existed there; if git cannot be asked, only with an explicit --no-sealed;
 *   - any other path is refused while a batch exists (or ever existed, per
 *     git) at the configured path;
 *   - an opening is refused when results/ already records one for the same
 *     keys (results are never overwritten: each run gets its own file name),
 *     or when git history of the log holds a committed "opened" event for this
 *     batch, or while the batch files are untracked or have uncommitted
 *     changes; after opening, the stamp must be committed at once;
 *   - an uncommitted batch cannot be scored against: excluded mode refuses an
 *     untracked batch, and createSealed prints the commit it needs;
 *   - hashes are taken over text with CRLF turned to LF, and bench/.gitattributes
 *     pins *.json and *.jsonl to LF, so a Windows checkout does not false-alarm.
 *
 * File shape: { "created": "2026-10-05", "note": "...", "keys": [...],
 *               "opened": null | { "on": "...", "note": "..." } }
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeKey } from './data.ts';

export interface SealedBatch {
  readonly created: string;
  readonly note: string;
  readonly keys: readonly string[];
  readonly opened: { readonly on: string; readonly note: string } | null;
}

export type SealGuard =
  | { readonly mode: 'none'; readonly sha256: null }
  | { readonly mode: 'excluded'; readonly exclude: ReadonlySet<string>; readonly count: number; readonly sha256: string; readonly keysSha256: string }
  | { readonly mode: 'opened'; readonly only: ReadonlySet<string>; readonly count: number; readonly openedOn: string; readonly sha256: string; readonly keysSha256: string };

/** Guards this module issued. A split refuses anything else, so a hand-built `{ mode: 'none' }` cannot skip the check. */
const issued = new WeakSet<object>();

export function assertIssued(g: SealGuard): void {
  if (!issued.has(g)) throw new Error('sealed guard was not issued by guardSealed(); refusing to split without the sealed-batch check');
}

function issue<T extends SealGuard>(g: T): T {
  issued.add(g);
  return g;
}

export const logPathFor = (path: string) => `${path}.log.jsonl`;

/** sha256 over the text with CRLF turned to LF, so a line-ending conversion is not an edit. */
const sha256 = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

/** The one configured place for the sealed batch. */
export const DEFAULT_SEALED_PATH = fileURLToPath(new URL('../sealed/sealed.json', import.meta.url));

/** Fingerprint of a batch's identity (creation date and keys), recorded in results so an opening cannot be repeated quietly. */
export function keysSha256(b: Pick<SealedBatch, 'created' | 'keys'>): string {
  return sha256(JSON.stringify([b.created, [...b.keys].map(codeKey).sort()]));
}

export type History = 'existed' | 'never' | 'unknown';

/** Whether git history shows a file ever existed at this path. 'unknown' when git or the repo is not available. */
export function gitHistory(path: string): History {
  try {
    let dir = dirname(resolve(path));
    while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const rel = relative(top, resolve(path)).replace(/\\/g, '/');
    if (rel.startsWith('..')) return 'unknown';
    const out = execFileSync('git', ['-C', top, 'log', '--all', '--format=%H', '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim() ? 'existed' : 'never';
  } catch {
    return 'unknown';
  }
}

export type GitStatus = 'clean' | 'dirty' | 'untracked' | 'unknown';

/** The git questions the guard asks. Injectable so tests can run outside a repository. */
export interface GitOps {
  /** Whether a file ever existed at this path in any commit. */
  history(path: string): History;
  /** Whether any commit's version of this log holds an "opened" event chained to one of these line hashes. */
  openedInHistory(logPath: string, chain: readonly string[]): boolean | 'unknown';
  /** Whether these files are tracked and unchanged. */
  status(paths: readonly string[]): GitStatus;
}

function repoOf(path: string): { top: string; rel: (p: string) => string } | null {
  try {
    let dir = dirname(resolve(path));
    while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { top, rel: (p: string) => relative(top, resolve(p)).split('\\').join('/') };
  } catch {
    return null;
  }
}

export const realGit: GitOps = {
  history: (path) => gitHistory(path),
  openedInHistory(logPath, chain) {
    const r = repoOf(logPath);
    if (!r) return 'unknown';
    try {
      const out = execFileSync('git', ['-C', r.top, 'log', '--all', '-p', '--', r.rel(logPath)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
      const want = new Set(chain);
      for (const line of out.split(/\r?\n/)) {
        const i = line.indexOf('{');
        if (i < 0 || !line.includes('"opened"')) continue;
        try {
          const e = JSON.parse(line.slice(i)) as { event?: string; prev?: string };
          if (e.event === 'opened' && e.prev && want.has(e.prev)) return true;
        } catch {
          /* not a log line */
        }
      }
      return false;
    } catch {
      return 'unknown';
    }
  },
  status(paths) {
    const r = repoOf(paths[0]!);
    if (!r) return 'unknown';
    try {
      const rels = paths.map(r.rel);
      const out = execFileSync('git', ['-C', r.top, 'status', '--porcelain', '--', ...rels], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (out.split(/\r?\n/).some((l) => l.startsWith('??'))) return 'untracked';
      if (out.trim()) return 'dirty';
      for (const rel of rels) {
        try {
          execFileSync('git', ['-C', r.top, 'ls-files', '--error-unmatch', '--', rel], { stdio: 'ignore' });
        } catch {
          return 'untracked';
        }
      }
      return 'clean';
    } catch {
      return 'unknown';
    }
  },
};

/** An earlier result that recorded opening this batch, or null. */
function openedInResults(resultsDir: string, fp: string): string | null {
  if (!existsSync(resultsDir)) return null;
  for (const f of readdirSync(resultsDir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(readFileSync(join(resultsDir, f), 'utf8')) as { sealed?: { mode?: string; keysSha256?: string } };
      if (r.sealed?.mode === 'opened' && r.sealed.keysSha256 === fp) return f;
    } catch {
      /* not a result file */
    }
  }
  return null;
}

interface LogEntry {
  readonly event: 'created' | 'opened';
  readonly on: string;
  readonly note: string;
  /** sha256 of the batch file after this event. */
  readonly fileSha256: string;
  /** `hash` of the previous line; null on the first. */
  readonly prev: string | null;
  /** sha256 of this entry's other fields, in this order. */
  readonly hash: string;
}

function entryHash(e: Omit<LogEntry, 'hash'>): string {
  return sha256(JSON.stringify([e.event, e.on, e.note, e.fileSha256, e.prev]));
}

/** The log, verified end to end. Throws on any break in the chain. */
export function readLog(path: string): LogEntry[] {
  const lp = logPathFor(path);
  if (!existsSync(lp)) return [];
  const out: LogEntry[] = [];
  let prev: string | null = null;
  for (const [i, line] of readFileSync(lp, 'utf8').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as LogEntry;
    if (e.prev !== prev || entryHash(e) !== e.hash) throw new Error(`${lp} line ${i + 1} does not verify; the sealed-batch log was edited`);
    out.push(e);
    prev = e.hash;
  }
  return out;
}

function append(path: string, e: Omit<LogEntry, 'hash' | 'prev'>, log: readonly LogEntry[]): void {
  const prev = log.length ? log[log.length - 1]!.hash : null;
  const full = { ...e, prev };
  appendFileSync(logPathFor(path), JSON.stringify({ ...full, hash: entryHash(full) }) + '\n');
}

export function loadSealed(path: string): SealedBatch | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as SealedBatch;
  if (!Array.isArray(raw.keys)) throw new Error(`${path}: "keys" must be a list`);
  return raw;
}

/** Writes a new sealed batch and its first log line. Refuses if a batch was ever created at this path. */
export function createSealed(
  path: string,
  keys: readonly string[],
  note: string,
  created = new Date().toISOString().slice(0, 10),
  git: GitOps = realGit,
): SealedBatch {
  if (existsSync(path)) throw new Error(`${path} already exists; a sealed batch is never replaced in place`);
  const log = readLog(path);
  if (log.length) throw new Error(`a sealed batch was already created at ${path} on ${log[0]!.on}; use a new path for a new batch`);
  const batch: SealedBatch = { created, note, keys: [...new Set(keys.map(codeKey))].sort(), opened: null };
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(batch, null, 2) + '\n';
  writeFileSync(path, text);
  append(path, { event: 'created', on: created, note, fileSha256: sha256(text) }, log);
  // Not finished until committed: the guard refuses an untracked batch, so say exactly what to run.
  if (git.status([path, logPathFor(path)]) !== 'clean') {
    console.error(`SEALED BATCH NOT COMMITTED. Nothing will score until it is: git add "${path}" "${logPathFor(path)}" && git commit -m "[bench] seal batch ${created}"`);
  }
  return batch;
}

export interface GuardOptions {
  readonly openSealed?: boolean;
  /** Whether this run writes its results. Opening a sealed batch without recording the result is refused. */
  readonly write?: boolean;
  /** True when the caller named the path (e.g. --sealed): then a missing file refuses. */
  readonly explicitPath?: boolean;
  readonly note?: string;
  readonly now?: () => string;
  /** The configured batch path. Defaults to bench/sealed/sealed.json; tests point it at a temp dir. */
  readonly configuredPath?: string;
  /** --no-sealed: the caller states there is no batch; needed when git cannot be asked. Never overrides a batch git knows of. */
  readonly noSealed?: boolean;
  /** Where results are written; an opening already recorded there is refused. */
  readonly resultsDir?: string;
  /** Injectable for tests; defaults to asking git. */
  readonly git?: GitOps;
  /** Overrides only git's history answer (kept for callers written against the earlier option). */
  readonly history?: (path: string) => History;
}

/**
 * Decides what a run may score, after checking the batch has not been touched.
 * With `openSealed` it stamps the file and logs the opening first, so a crash
 * mid-score still counts as the one opening.
 */
export function guardSealed(path: string, opts: GuardOptions = {}): SealGuard {
  const open = opts.openSealed === true;
  const configured = resolve(opts.configuredPath ?? DEFAULT_SEALED_PATH);
  const git = opts.git ?? realGit;
  const history = opts.history ?? ((p: string) => git.history(p));

  if (resolve(path) !== configured) {
    if (existsSync(configured) || existsSync(logPathFor(configured))) {
      throw new Error(`a sealed batch exists at the configured path ${configured}; refusing a different path (${path})`);
    }
    if (history(configured) === 'existed') throw new Error(`git history shows a sealed batch at ${configured}; refusing a different path (${path})`);
  }

  const log = readLog(path);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : null;

  if (text === null) {
    if (opts.explicitPath) throw new Error(`sealed batch path ${path} was given but no file is there`);
    if (log.length) throw new Error(`a sealed batch was created at ${path} on ${log[0]!.on} and its file is gone; refusing to score without it`);
    if (open) throw new Error(`--open-sealed given but no sealed batch exists at ${path}`);
    if (resolve(path) === configured) {
      const h = history(path);
      if (h === 'existed') throw new Error(`git history shows a sealed batch at ${path}, and it is gone from the working tree; restore it before scoring`);
      if (h === 'unknown' && !opts.noSealed) throw new Error(`cannot ask git whether a sealed batch ever existed at ${path}; pass --no-sealed to state there is none`);
    }
    return issue({ mode: 'none', sha256: null });
  }

  const sha = sha256(text);
  if (!log.length) throw new Error(`${path} has no log beside it; a sealed batch is made only by createSealed()`);
  const last = log[log.length - 1]!;
  if (last.fileSha256 !== sha) throw new Error(`${path} was edited after its last logged event (${last.event} on ${last.on}); refusing`);
  const batch = JSON.parse(text) as SealedBatch;
  const keys = new Set(batch.keys.map(codeKey));
  const fp = keysSha256(batch);

  const st = git.status([path, logPathFor(path)]);
  if (st === 'untracked' || st === 'unknown') {
    throw new Error(`sealed batch at ${path} is ${st === 'untracked' ? 'not committed' : 'not confirmable as committed (git unavailable)'}; commit it before scoring: git add "${path}" "${logPathFor(path)}" && git commit`);
  }

  if (!open) return issue({ mode: 'excluded', exclude: keys, count: keys.size, sha256: sha, keysSha256: fp });

  if (opts.write === false) throw new Error('--open-sealed with --no-write is refused: the one opening must leave a written result');
  if (st !== 'clean') throw new Error(`sealed batch at ${path} has uncommitted changes; refusing to open. Commit or restore it first.`);
  const committedOpen = git.openedInHistory(logPathFor(path), log.map((e) => e.hash));
  if (committedOpen === true) throw new Error(`git history holds a committed "opened" event for the sealed batch at ${path}; it is opened once. Collect a new batch.`);
  if (committedOpen === 'unknown') throw new Error(`cannot search git history of ${logPathFor(path)} for an earlier opening; refusing to open`);
  const priorOpen = log.find((e) => e.event === 'opened');
  if (priorOpen || batch.opened) {
    throw new Error(`sealed batch at ${path} was already opened on ${priorOpen?.on ?? batch.opened?.on}; it is opened once. Collect a new batch.`);
  }
  const inResults = opts.resultsDir ? openedInResults(opts.resultsDir, fp) : null;
  if (inResults) throw new Error(`results/${inResults} already records opening this sealed batch; it is opened once. Collect a new batch.`);
  const on = (opts.now ?? (() => new Date().toISOString()))();
  const note = opts.note ?? '';
  const stamped = JSON.stringify({ ...batch, opened: { on, note } }, null, 2) + '\n';
  writeFileSync(path, stamped);
  const newSha = sha256(stamped);
  append(path, { event: 'opened', on, note, fileSha256: newSha }, log);
  return issue({ mode: 'opened', only: keys, count: keys.size, openedOn: on, sha256: newSha, keysSha256: fp });
}

/** Apply the guard to anything carrying a product key. Rows with no key are never sealed. */
export function applyGuard<T extends { key: string | null }>(rows: readonly T[], guard: SealGuard): T[] {
  assertIssued(guard);
  if (guard.mode === 'none') return [...rows];
  if (guard.mode === 'excluded') return rows.filter((r) => r.key === null || !guard.exclude.has(r.key));
  return rows.filter((r) => r.key !== null && guard.only.has(r.key));
}
