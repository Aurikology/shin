// mac/nightly-checks.mjs
//
// R16: PRAGMA integrity_check on every database, every night, loud on failure.
// R10 (disk half): the data volume must keep at least SHIN_DISK_MIN_GB free (default 10).
//
//   node mac/nightly-checks.mjs                  run against the databases named in config.env
//   node mac/nightly-checks.mjs --dry-run [f..]  list what it would open, change nothing
//   node mac/nightly-checks.mjs a.db b.db        check exactly these files
//   node mac/nightly-checks.mjs --check-only f.. print results and exit 1 on a bad one; writes NO marker
//
// Run nightly at 03:30 by the com.shin.integrity LaunchDaemon (mac/launchd-daemons/), before
// the 04:00 backup, so a database that went bad is named BEFORE it is copied into 14 nights
// of backups. Reads each database read-only (WAL mode: readers do not block the server).
// A file over 1 GiB (catalogue.db, about 4 GB) gets quick_check: the full check reads every
// page and every index entry and would hold a read snapshot for many minutes.
//
// Results: health markers `integrity` and `disk` (mac/lib/health.mjs). Exit 1 on any failure.

import { existsSync, realpathSync, statSync, statfsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { record } from './lib/health.mjs';

export const DB_ENV_KEYS = [
  'SHIN_SCANS', // scans, quota, device keys, events, ratings
  'SHIN_REPEAT_CACHE',
  'SHIN_PEOPLE_DB',
  'SHIN_PRICES',
  'SHIN_CORRECTIONS',
  'SHIN_GAPS',
  'SHIN_USER_CATALOGUE',
  'SHIN_CATALOGUE',
];

const GIB = 1024 ** 3;

/** One database. Never throws: every failure is a result with ok:false. */
export function checkDb(path, { quickAboveBytes = GIB } = {}) {
  if (!existsSync(path)) return { path, ok: false, mode: null, detail: 'file is missing' };
  let size = 0;
  try {
    size = statSync(path).size;
  } catch (e) {
    return { path, ok: false, mode: null, detail: `cannot stat: ${e.message}` };
  }
  const mode = size > quickAboveBytes ? 'quick_check' : 'integrity_check';
  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 30000');
    const rows = db.prepare(`PRAGMA ${mode}`).all();
    const msgs = rows.map((r) => String(Object.values(r)[0]));
    const ok = msgs.length === 1 && msgs[0] === 'ok';
    return { path, ok, mode, size, detail: ok ? 'ok' : msgs.slice(0, 5).join(' | ') };
  } catch (e) {
    return { path, ok: false, mode, size, detail: `could not run ${mode}: ${String(e.message).slice(0, 200)}` };
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

export function diskFree(dir) {
  const s = statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

/** Runs the checks and writes both markers. Returns { ok, results, disk }. */
export function runNightly({ files, dataDir, env = process.env, now = new Date() }) {
  const results = files.map((f) => checkDb(f));
  const bad = results.filter((r) => !r.ok);
  const integrityOk = bad.length === 0;
  const names = (r) => r.path.split(/[\\/]/).pop();
  record({
    job: 'integrity',
    ok: integrityOk,
    detail: integrityOk
      ? `${results.length} databases ok`
      : bad.map((r) => `${names(r)}: ${r.detail}`).join('; ').slice(0, 1500),
    env,
    now,
  });

  const minGb = Number(env.SHIN_DISK_MIN_GB ?? 10);
  let disk;
  try {
    const free = diskFree(dataDir || env.SHIN_DATA_DIR || '/');
    const freeGb = free / GIB;
    disk = { ok: freeGb >= minGb, freeGb: Math.round(freeGb * 10) / 10, minGb };
  } catch (e) {
    disk = { ok: false, freeGb: null, minGb, error: e.message };
  }
  record({
    job: 'disk',
    ok: disk.ok,
    detail: disk.error ? `cannot read free space: ${disk.error}` : `${disk.freeGb} GB free, minimum ${minGb} GB`,
    env,
    now,
  });
  return { ok: integrityOk && disk.ok, results, disk };
}

function main(argv, env = process.env) {
  const dry = argv.includes('--dry-run');
  let files = argv.filter((a) => !a.startsWith('--'));
  if (!files.length) files = DB_ENV_KEYS.map((k) => env[k]).filter(Boolean);
  if (!files.length) {
    console.error('nightly-checks: no databases named (source mac/config.env, or pass file paths)');
    if (!dry) record({ job: 'integrity', ok: false, detail: 'nightly-checks was given no databases to check (config.env not sourced?)', env });
    return 1;
  }
  if (dry) {
    console.log('nightly-checks: DRY RUN, nothing opened, no marker written. Would check:');
    for (const f of files) {
      let size = 'missing';
      try {
        size = `${statSync(f).size} bytes, ${statSync(f).size > GIB ? 'quick_check' : 'integrity_check'}`;
      } catch {}
      console.log(`  ${f} (${size})`);
    }
    console.log(`  disk: data volume of ${env.SHIN_DATA_DIR || '/'} must keep ${env.SHIN_DISK_MIN_GB ?? 10} GB free`);
    return 0;
  }
  if (argv.includes('--check-only')) {
    // The restore test (mac/15-restore-test.sh) checks a RESTORED copy: it must say pass or fail
    // through its own marker, never overwrite the live `integrity` marker.
    const results = files.map((f) => checkDb(f));
    for (const x of results) console.log(`${x.ok ? 'ok    ' : 'FAILED'} ${x.mode ?? '-'} ${x.path}${x.ok ? '' : ': ' + x.detail}`);
    const good = results.filter((x) => x.ok).length;
    console.log(`nightly-checks: ${good} of ${results.length} databases ok`);
    return good === results.length ? 0 : 1;
  }
  const r = runNightly({ files, env });
  for (const x of r.results) console.log(`${x.ok ? 'ok    ' : 'FAILED'} ${x.mode ?? '-'} ${x.path}${x.ok ? '' : ': ' + x.detail}`);
  console.log(`${r.disk.ok ? 'ok    ' : 'FAILED'} disk ${r.disk.freeGb} GB free (minimum ${r.disk.minGb})`);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
