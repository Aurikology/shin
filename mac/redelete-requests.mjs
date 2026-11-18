// mac/redelete-requests.mjs
//
// R58. A restore brings back every row that existed on the backup night, including phones
// whose owners had since asked for deletion. docs/privacy/data-requests.md section 6 says: after
// any restore, run the delete again for every request in the log that is less than 45 days old.
// This is that step, done by script, against the RESTORED copy (never the live data).
//
//   node mac/redelete-requests.mjs --target <restored dir> [--log <csv>] [--days 45] [--dry-run]
//
// The request log is ~/shin-privacy/request-log.csv (outside git, header row, columns named in
// data-requests.md section 8: received, from, kind, device_id, check, export_sent, deleted_on, ...).
// A row is re-run when kind is delete or both, device_id is not blank, and deleted_on is a date
// no more than --days ago. Rows whose id was already blanked (older than 45 days) are, by design,
// out of reach: the backups that could hold them have aged out as well.
//
// Each deletion is scripts/privacy/device-data.mjs delete <id> --yes, with every store pointed
// at the restored folder (file names are the ones 07-backup.sh writes). The server's own log
// folder is pointed at an empty path, so live logs are never touched.
//
// Loud failure: a missing log, an unreadable log, or any deletion that exits non-zero ends with
// exit 1 and "REDELETE FAILED". Restore is not "done" until this exits 0.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Small RFC 4180 reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const DAY = 86400e3;

/** rows[0] is the header. Returns { ids, skippedNotYetDeleted, considered }. */
export function dueDeletions(rows, { today = new Date(), days = 45 } = {}) {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iKind = col('kind');
  const iId = col('device_id');
  const iDeleted = col('deleted_on');
  if (iKind < 0 || iId < 0 || iDeleted < 0) {
    throw new Error('request log header must name the columns kind, device_id and deleted_on (docs/privacy/data-requests.md section 8)');
  }
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ids = [];
  let skippedNotYetDeleted = 0;
  for (const r of rows.slice(1)) {
    const kind = (r[iKind] ?? '').trim().toLowerCase();
    if (kind !== 'delete' && kind !== 'both') continue;
    const id = (r[iId] ?? '').trim();
    const when = (r[iDeleted] ?? '').trim();
    if (!id) continue; // already blanked after 45 days
    if (!when) {
      skippedNotYetDeleted++;
      continue;
    }
    const d = Date.parse(`${when.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d)) {
      skippedNotYetDeleted++;
      continue;
    }
    if (t0 - d > days * DAY) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids, skippedNotYetDeleted };
}

/** The environment that points device-data.mjs at a restored folder (file names as 07-backup.sh writes them). */
export function restoredEnv(target, base = process.env) {
  const t = resolve(target);
  return {
    ...base,
    SHIN_DATA_DIR: t,
    SHIN_SCANS: join(t, 'scans.db'),
    SHIN_CORRECTIONS: join(t, 'corrections.db'),
    SHIN_USER_CATALOGUE: join(t, 'user-catalogue.db'),
    SHIN_PEOPLE_DB: join(t, 'people.db'),
    SHIN_ACCESS_LOG: join(t, 'access.log'),
    SHIN_PHOTOS: join(t, 'photos'),
    SHIN_SHUTTER_DIR: join(t, 'shutter'),
    SHIN_LOG_DIR: join(t, '.no-server-logs-here'),
  };
}

function main(argv) {
  const arg = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  const target = arg('--target');
  const logPath = arg('--log', process.env.SHIN_REQUEST_LOG || join(homedir(), 'shin-privacy', 'request-log.csv'));
  const days = Number(arg('--days', 45));
  const dry = argv.includes('--dry-run');
  if (!target) {
    console.error('usage: redelete-requests.mjs --target <restored dir> [--log <csv>] [--days 45] [--dry-run]');
    return 2;
  }
  if (!existsSync(logPath)) {
    console.error(`REDELETE FAILED: NO REQUEST LOG at ${logPath}.`);
    console.error('  Without it nobody can say which shoppers asked for deletion. Restore ~/shin-privacy from the');
    console.error('  encrypted off-machine copy (mac/14-offsite-backup.sh includes it), or, if there truly never was a');
    console.error('  request, create the file with just the header row from docs/privacy/data-requests.md section 8.');
    return 1;
  }
  let due;
  try {
    due = dueDeletions(parseCsv(readFileSync(logPath, 'utf8')), { days });
  } catch (e) {
    console.error(`REDELETE FAILED: cannot read the request log: ${e.message}`);
    return 1;
  }
  if (due.skippedNotYetDeleted) {
    console.error(`redelete: ${due.skippedNotYetDeleted} delete request(s) in the log have no deleted_on date yet (not done before the restore): handle them by hand per data-requests.md.`);
  }
  if (!due.ids.length) {
    console.log(`redelete: no deletions inside the last ${days} days in ${logPath}; nothing to re-run`);
    return 0;
  }
  const device = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'privacy', 'device-data.mjs');
  if (dry) {
    console.log(`redelete: DRY RUN, nothing changed. Would re-run ${due.ids.length} deletion(s) against ${resolve(target)}:`);
    for (const id of due.ids) console.log(`  delete ${id.slice(0, 4)}... (${id.length} chars)`);
    return 0;
  }
  let failed = 0;
  for (const id of due.ids) {
    const r = spawnSync(process.execPath, ['--no-warnings', device, 'delete', id, '--yes'], { env: restoredEnv(target), encoding: 'utf8' });
    if (r.status === 0) console.log(`redelete: ${id.slice(0, 4)}... deleted from the restored copy`);
    else {
      failed++;
      console.error(`redelete: ${id.slice(0, 4)}... FAILED (exit ${r.status})\n${(r.stdout ?? '') + (r.stderr ?? '')}`);
    }
  }
  if (failed) {
    console.error(`REDELETE FAILED: ${failed} of ${due.ids.length} deletion(s) did not complete. Do NOT move this restore into place.`);
    return 1;
  }
  console.log(`redelete: re-ran ${due.ids.length} deletion(s) against ${resolve(target)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
