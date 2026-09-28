/**
 * Where real data lives, and which settings name a place to put data.
 *
 * WHY. Tests have written to real data three times: the real user catalogue
 * (2026-09-23), the real repeat cache (2026-09-20, which put a fake "Kraft
 * Dinner" answer in front of testers) and on 2026-09-28 a test that moved every
 * file out of app/data/photos and deleted the folder. Jamin, 2026-09-28: build
 * it so tests can never touch real data. child.mjs uses `pathSettings` to point
 * every data location of every test process at a temp folder; global.mjs uses
 * `realDataRoots`, `snapshotTree` and `treeDifferences` to fail the run when
 * anything under a real data folder was added, changed or deleted.
 *
 * WHICH SETTINGS ARE PATHS. settings/src/index.ts has no "this is a path" field,
 * so a row counts as a path when its `default` prose names one: a token with a
 * slash in it that ends in a file extension (`data/scans.db`), starts with a
 * placeholder folder (`<SHIN_DATA_DIR>/shutter`) or has a `data` segment
 * (`process.cwd()/data`). URLs and secrets are never paths. The name is NOT used:
 * SHIN_SHUTTER_LOG is an on/off switch, not a log path. A new row whose default
 * is written the same way is covered with no edit here; data-guard.test.mjs
 * fails if one of the known path settings stops being recognised.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Written by mac/run-server.sh before it starts the live server. Its presence means: never test here. */
export const LIVE_MARKER = join(REPO_ROOT, '.shin-live-server');

/** Set by global.mjs to the run's own temp folder; child.mjs replaces anything inside it with a per-process folder. */
export const RUN_TEMP_VAR = 'SHIN_TEST_RUN_TEMP';

/** Every folder the runtime writes (or reads data from) when nothing overrides it. */
export const DEFAULT_DATA_ROOTS = [
  'app/data', // SHIN_DATA_DIR default (cwd app/), scans, gaps, people, repeat cache, user catalogue, access log, shutter, photos (legacyPhotosDir)
  'identify/data', // spend-cap.json, range-ask.json, descriptions.json
  'price/data', // prices.db, corrections.db
  'catalogue/data', // catalogue.db, packs
  'spine/data', // observations.json, corpus.json
  'data', // a tool run from the repo root writes data/gaps.db
].map((p) => join(REPO_ROOT, p));

const EXT = /\.(db|json|jsonl|log|sqlite|bin|br|csv)$/i;
const PATH_TOKEN = /^(<[\w]+>|[\w.()-]+)(\/[\w.-]*)+$/;

/** The path the default prose names, or null when the setting is not a path. */
export function defaultPathToken(row) {
  if (row.secret) return null;
  if (/[a-z]+:\/\//i.test(row.default)) return null;
  const tokens = row.default.split(/[\s'",;]+/).filter((t) => PATH_TOKEN.test(t));
  const paths = tokens.filter((t) => {
    const clean = t.replace(/\/+$/, '');
    return EXT.test(clean) || t.startsWith('<') || clean.split('/').includes('data');
  });
  return paths.length ? paths[paths.length - 1].replace(/\/+$/, '') : null;
}

/** [{ env, name, kind: 'file' | 'dir' }] for every path setting in settings/src/index.ts. */
export async function pathSettings() {
  const url = pathToFileURL(join(REPO_ROOT, 'settings', 'src', 'index.ts')).href;
  const { SETTINGS } = await import(url);
  const out = [];
  for (const row of SETTINGS) {
    const token = defaultPathToken(row);
    if (!token) continue;
    const name = token.split('/').pop();
    out.push({ env: row.env, name, kind: EXT.test(name) ? 'file' : 'dir' });
  }
  return out;
}

export function isInside(path, root) {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The folders to snapshot: the defaults, plus wherever the shell running the
 * suite points a path setting (a Mac with SHIN_DATA_DIR on a backed-up disk).
 * A file setting guards its own folder. Temp folders are left out.
 */
export function realDataRoots(settings, env = process.env) {
  const roots = [...DEFAULT_DATA_ROOTS];
  const temp = resolve(tmpdir());
  for (const s of settings) {
    const v = env[s.env]?.trim();
    if (!v) continue;
    const abs = resolve(v);
    if (isInside(abs, temp)) continue;
    roots.push(s.kind === 'file' ? resolve(abs, '..') : abs);
  }
  // Drop a root that sits inside another: it would be walked twice.
  const uniq = [...new Set(roots.map((r) => resolve(r)))];
  return uniq.filter((r) => !uniq.some((o) => o !== r && isInside(r, o)));
}

/**
 * SQLite's `-shm` file is a shared-memory index, not data: a READ-ONLY open of
 * a WAL database rewrites it (the first run of this guard went red on
 * catalogue/data/catalogue.db-shm from a test that only reads the catalogue).
 * Every real write lands in the database file or its `-wal`, both compared.
 */
const IGNORED = /-shm$/i;

/** path -> 'dir' | 'size:mtime'. Stats only; never opens a file. */
export function snapshotTree(roots) {
  const out = new Map();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    out.set(root, 'dir');
    let entries;
    try {
      entries = readdirSync(root, { recursive: true, withFileTypes: true });
    } catch (err) {
      out.set(root, `unreadable:${err.code ?? err}`);
      continue;
    }
    for (const e of entries) {
      const p = join(e.parentPath ?? e.path, e.name);
      if (IGNORED.test(e.name)) continue;
      if (e.isDirectory()) {
        out.set(p, 'dir');
        continue;
      }
      try {
        const st = statSync(p);
        out.set(p, `${st.size}:${st.mtimeMs}`);
      } catch {
        out.set(p, 'vanished-while-reading');
      }
    }
  }
  return out;
}

/** Human-readable lines, one per path added, deleted or changed. */
export function treeDifferences(before, after) {
  const lines = [];
  for (const [p, v] of before) {
    if (!after.has(p)) lines.push(`deleted: ${p}`);
    else if (after.get(p) !== v) {
      const [s0, m0] = v.split(':');
      const [s1, m1] = after.get(p).split(':');
      lines.push(`changed: ${p} (size ${s0} -> ${s1}${m0 !== m1 ? ', modified time changed' : ''})`);
    }
  }
  for (const p of after.keys()) if (!before.has(p)) lines.push(`added: ${p}`);
  return lines.sort((a, b) => a.split(': ')[1].localeCompare(b.split(': ')[1]));
}


