#!/usr/bin/env node
// scripts/privacy/device-data.mjs
//
// One phone's data: show it (an access request) or erase it (a deletion request).
//
//   node scripts/privacy/device-data.mjs export <deviceId> [--out file.json]
//   node scripts/privacy/device-data.mjs delete <deviceId>           dry run: counts only, changes nothing
//   node scripts/privacy/device-data.mjs delete <deviceId> --yes     does it
//
// Run it on the Mac that runs the server, from the repo folder, with the same SHIN_* variables the
// server runs with (mac/config.env). It finds the databases the way the server does: SHIN_SCANS,
// SHIN_CORRECTIONS, SHIN_USER_CATALOGUE, SHIN_PEOPLE_DB, SHIN_ACCESS_LOG, SHIN_PHOTOS,
// SHIN_SHUTTER_DIR, and SHIN_DATA_DIR where those are unset. Server logs live in mac/logs unless
// SHIN_LOG_DIR (this script's own variable) or --log-dir says otherwise.
//
// What it does NOT reach is printed at the end of every run, because it matters: the nightly backups,
// RevenueCat, and the model providers. docs/privacy/data-requests.md says what to do about each.
//
// Rules the code holds to:
//   - only rows whose device id equals the id given. The id must look like a real one, so "" or a
//     pattern can never match more than one phone.
//   - a store that is not there is reported as "not found" and never created.
//   - delete is a dry run unless --yes is on the line.
//   - any store that cannot be read or written makes the exit code 1. Nothing fails quietly.
//   - it finds every table with a device_id column, so a table added next month is covered with no edit.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as settings from '../../settings/src/index.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;
const CHUNK = 400;

// ---- where everything lives, the way the server finds it -------------------------------------------

function clean(v) {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? undefined : t;
}

export function locations(env = process.env, logDirFlag) {
  const dataDirEnv = clean(settings.SHIN_DATA_DIR(env));
  const dataDir = resolve(dataDirEnv ?? join(REPO, 'app', 'data'));
  const scans = resolve(clean(settings.SHIN_SCANS(env)) ?? join(REPO, 'app', 'data', 'scans.db'));
  const accessEnv = clean(settings.SHIN_ACCESS_LOG(env));
  return {
    scans,
    corrections: resolve(clean(settings.SHIN_CORRECTIONS(env)) ?? join(REPO, 'price', 'data', 'corrections.db')),
    userCatalogue: resolve(
      clean(settings.SHIN_USER_CATALOGUE(env)) ??
        (clean(settings.SHIN_SCANS(env)) ? join(dirname(scans), 'user-catalogue.db') : join(REPO, 'app', 'data', 'user-catalogue.db')),
    ),
    people: resolve(clean(settings.SHIN_PEOPLE_DB(env)) ?? join(dataDir, 'people.db')),
    accessLog: accessEnv && accessEnv.toLowerCase() !== 'off' ? resolve(accessEnv) : join(dataDir, 'access.log'),
    photos: resolve(clean(settings.SHIN_PHOTOS(env)) ?? join(dataDir, 'photos')),
    shutter: resolve(clean(settings.SHIN_SHUTTER_DIR(env)) ?? join(dataDir, 'shutter')),
    logs: resolve(logDirFlag ?? clean(env.SHIN_LOG_DIR) ?? join(REPO, 'mac', 'logs')),
  };
}

/** The catalogue never holds a device id; it holds this one-way key (catalogue/src/user-catalogue.ts deviceKeyOf). */
export function catalogueKeyOf(deviceId) {
  return createHash('sha256').update(deviceId).digest('hex').slice(0, 16);
}

// ---- small helpers ----------------------------------------------------------------------------------

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

function plain(value) {
  if (value instanceof Uint8Array) return `[${value.byteLength} bytes withheld]`;
  if (typeof value === 'bigint') return Number(value);
  return value;
}

function plainRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = plain(v);
  return out;
}

function open(path, readOnly) {
  const db = new DatabaseSync(path, { readOnly });
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

function tablesWith(db, column) {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return names
    .map((r) => r.name)
    .filter((name) => db.prepare(`PRAGMA table_info(${q(name)})`).all().some((c) => c.name === column));
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${q(table)})`).all().some((c) => c.name === column);
}

/**
 * Every table in a scan database that holds this phone's rows: by its own device_id column and, for a
 * table that also (or only) points at a scan, by the phone's scan ids. A table whose device_id may be
 * null (scan_act_outcome) is therefore still reached through its scan.
 */
function scanTables(db) {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  return names
    .filter((n) => hasColumn(db, n, 'device_id') || (n !== 'scan' && hasColumn(db, n, 'scan_id')))
    .map((name) => ({ name, byDevice: hasColumn(db, name, 'device_id'), byScan: name !== 'scan' && hasColumn(db, name, 'scan_id') }));
}

function whereFor(t) {
  const parts = [];
  if (t.byDevice) parts.push('device_id = ?');
  if (t.byScan) parts.push('scan_id IN (SELECT value FROM json_each(?))');
  return parts.join(' OR ');
}

function paramsFor(t, deviceId, scanIdNumbers) {
  const params = [];
  if (t.byDevice) params.push(deviceId);
  if (t.byScan) params.push(JSON.stringify(scanIdNumbers));
  return params;
}

function inChunks(values, fn) {
  for (let i = 0; i < values.length; i += CHUNK) fn(values.slice(i, i + CHUNK));
}

function insideOf(root, candidate) {
  const r = resolve(root);
  const c = resolve(candidate);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

function logFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.log(\.\d+)?$/.test(f))
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile());
}

function readLines(path) {
  const text = readFileSync(path, 'utf8');
  return text === '' ? [] : text.split('\n').filter((l, i, all) => !(i === all.length - 1 && l === ''));
}

// ---- gather: what is held about one phone ------------------------------------------------------------

/**
 * Reads everything held about `deviceId`. The same function feeds export and the delete counts, so
 * "what delete says it will remove" can never differ from "what export says is held".
 */
export function gather(deviceId, loc) {
  const result = {
    databases: { scans: null, corrections: null, userCatalogue: null, people: null },
    scanIds: [],
    photoPaths: [],
    shelfDirs: [],
    shutterDirs: [],
    accessLog: { path: loc.accessLog, found: existsSync(loc.accessLog), lines: [] },
    logs: { dir: loc.logs, files: {} },
    errors: [],
  };

  const byDevice = (key, path) => {
    const entry = { path, found: existsSync(path), tables: {} };
    result.databases[key] = entry;
    if (!entry.found) return null;
    try {
      const db = open(path, true);
      for (const t of tablesWith(db, 'device_id')) {
        entry.tables[t] = db.prepare(`SELECT * FROM ${q(t)} WHERE device_id = ?`).all(deviceId).map(plainRow);
      }
      db.close();
    } catch (err) {
      result.errors.push(`${key}: ${err.message}`);
    }
    return entry;
  };

  const scans = { path: loc.scans, found: existsSync(loc.scans), tables: {} };
  result.databases.scans = scans;
  if (scans.found) {
    try {
      const db = open(loc.scans, true);
      // The scan table first: its ids reach the tables that carry no device id of their own.
      const mine = hasColumn(db, 'scan', 'device_id') ? db.prepare('SELECT * FROM scan WHERE device_id = ?').all(deviceId) : [];
      const ids = mine.map((r) => Number(r.id));
      for (const t of scanTables(db)) {
        scans.tables[t.name] =
          t.name === 'scan'
            ? mine.map(plainRow)
            : db.prepare(`SELECT * FROM ${q(t.name)} WHERE ${whereFor(t)}`).all(...paramsFor(t, deviceId, ids)).map(plainRow);
      }
      result.scanIds = ids.map(String);
      result.photoPaths = mine.map((r) => r.photo_path).filter((p) => typeof p === 'string' && p !== '');
      db.close();
    } catch (err) {
      result.errors.push(`scans: ${err.message}`);
    }
  }
  byDevice('corrections', loc.corrections);
  byDevice('people', loc.people);

  // The catalogue holds a one-way key, and rows tied to this phone's scans.
  const uc = { path: loc.userCatalogue, found: existsSync(loc.userCatalogue), tables: {} };
  result.databases.userCatalogue = uc;
  if (uc.found) {
    try {
      const db = open(loc.userCatalogue, true);
      const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
      if (names.has('user_observation')) {
        uc.tables.user_observation = db
          .prepare('SELECT * FROM user_observation WHERE device_key = ? OR scan_id IN (SELECT value FROM json_each(?))')
          .all(catalogueKeyOf(deviceId), JSON.stringify(result.scanIds))
          .map(plainRow);
      }
      for (const t of ['user_offer', 'user_review']) {
        if (!names.has(t)) continue;
        uc.tables[t] = db
          .prepare(`SELECT * FROM ${t} WHERE scan_id IN (SELECT value FROM json_each(?))`)
          .all(JSON.stringify(result.scanIds))
          .map(plainRow);
      }
      db.close();
    } catch (err) {
      result.errors.push(`userCatalogue: ${err.message}`);
    }
  }

  // Photos: the scan photos the rows point at, and the shelf folder named after the phone.
  result.photoFiles = result.photoPaths.filter((p) => {
    const full = resolve(loc.photos, p);
    return insideOf(loc.photos, full) && existsSync(full);
  });
  const shelfRoot = join(loc.photos, 'shelf');
  if (existsSync(shelfRoot)) {
    for (const day of readdirSync(shelfRoot)) {
      const dir = join(shelfRoot, day, deviceId);
      if (existsSync(dir) && statSync(dir).isDirectory()) result.shelfDirs.push(dir);
    }
  }
  result.shelfFiles = result.shelfDirs.flatMap((d) => readdirSync(d).map((f) => relative(loc.photos, join(d, f))));

  // Shutter log: one folder per press; a folder is this phone's when a file in it names the phone.
  result.shutterFiles = [];
  if (existsSync(loc.shutter)) {
    for (const press of readdirSync(loc.shutter)) {
      const dir = join(loc.shutter, press);
      if (!statSync(dir).isDirectory()) continue;
      const names = readdirSync(dir);
      const mine = names.some((f) => f.endsWith('.json') && readFileSync(join(dir, f), 'utf8').includes(deviceId));
      if (!mine) continue;
      result.shutterDirs.push(dir);
      result.shutterFiles.push(...names.map((f) => relative(loc.shutter, join(dir, f))));
    }
  }

  // Text logs: every line that names the phone.
  if (result.accessLog.found) {
    try {
      result.accessLog.lines = readLines(loc.accessLog).filter((l) => l.includes(deviceId));
    } catch (err) {
      result.errors.push(`access log: ${err.message}`);
    }
  }
  for (const file of logFiles(loc.logs)) {
    try {
      result.logs.files[relative(loc.logs, file)] = readLines(file).filter((l) => l.includes(deviceId));
    } catch (err) {
      result.errors.push(`${file}: ${err.message}`);
    }
  }
  return result;
}

// ---- export -------------------------------------------------------------------------------------------

export function buildExport(deviceId, loc, now = new Date()) {
  const g = gather(deviceId, loc);
  const databases = {};
  for (const [key, entry] of Object.entries(g.databases)) {
    databases[key] = entry.found ? { found: true, tables: entry.tables } : { found: false, tables: {} };
  }
  return {
    deviceId,
    exportedAt: now.toISOString(),
    about:
      'Everything Pexi holds that is tied to this phone. Photos are listed by file name and sent separately. ' +
      'Prices and answers older than 24 months no longer carry the phone and cannot be listed here. ' +
      'The secret the phone proves itself with is stored only as a one-way hash and is withheld.',
    databases,
    accessLog: { lines: g.accessLog.lines },
    photos: { files: g.photoFiles, shelfFiles: g.shelfFiles },
    shutter: { files: g.shutterFiles },
    logs: { files: g.logs.files },
    problems: g.errors,
  };
}

// ---- delete -------------------------------------------------------------------------------------------

function countsOf(g) {
  const rows = [];
  for (const [key, entry] of Object.entries(g.databases)) {
    if (!entry.found) {
      rows.push({ store: key, table: '(store)', n: null, note: `not found at ${entry.path}` });
      continue;
    }
    for (const [t, list] of Object.entries(entry.tables)) rows.push({ store: key, table: t, n: list.length });
  }
  rows.push({ store: 'files', table: 'scan photos', n: g.photoFiles.length });
  rows.push({ store: 'files', table: 'shelf photo folders', n: g.shelfDirs.length });
  rows.push({ store: 'files', table: 'shutter folders', n: g.shutterDirs.length });
  rows.push({ store: 'logs', table: 'access log lines', n: g.accessLog.lines.length });
  for (const [f, lines] of Object.entries(g.logs.files)) rows.push({ store: 'logs', table: f, n: lines.length });
  return rows;
}

function rewriteWithout(path, deviceId) {
  // In place, so a process that has the file open for appending keeps writing to the same file.
  const lines = readLines(path);
  const kept = lines.filter((l) => !l.includes(deviceId));
  if (kept.length === lines.length) return 0;
  writeFileSync(path, kept.length ? `${kept.join('\n')}\n` : '');
  return lines.length - kept.length;
}

function deleteDeviceRows(path, deviceId, order) {
  const db = open(path, false);
  const done = {};
  try {
    db.exec('PRAGMA secure_delete = ON');
    db.exec('BEGIN IMMEDIATE');
    const tables = tablesWith(db, 'device_id');
    // The scan table last: other tables point at its rows.
    const sorted = [...tables.filter((t) => t !== 'scan'), ...tables.filter((t) => t === 'scan')];
    for (const t of order ? order(sorted) : sorted) {
      done[t] = Number(db.prepare(`DELETE FROM ${q(t)} WHERE device_id = ?`).run(deviceId).changes);
    }
    db.exec('COMMIT');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* nothing open */
    }
    throw err;
  } finally {
    db.close();
  }
  return done;
}

function deleteScanRows(path, deviceId) {
  const db = open(path, false);
  try {
    db.exec('PRAGMA secure_delete = ON');
    db.exec('BEGIN IMMEDIATE');
    const ids = db.prepare('SELECT id FROM scan WHERE device_id = ?').all(deviceId).map((r) => Number(r.id));
    const tables = scanTables(db);
    // The scan table last: other tables point at its rows.
    for (const t of [...tables.filter((x) => x.name !== 'scan'), ...tables.filter((x) => x.name === 'scan')]) {
      const where = t.name === 'scan' ? 'device_id = ?' : whereFor(t);
      const params = t.name === 'scan' ? [deviceId] : paramsFor(t, deviceId, ids);
      db.prepare(`DELETE FROM ${q(t.name)} WHERE ${where}`).run(...params);
    }
    db.exec('COMMIT');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* nothing open */
    }
    throw err;
  } finally {
    db.close();
  }
}

/** Erases the phone. `yes` false counts and changes nothing. Returns what it did and what is left. */
export function deleteDevice(deviceId, loc, yes) {
  const before = gather(deviceId, loc);
  const plan = countsOf(before);
  const problems = [...before.errors];
  if (!yes) return { dryRun: true, plan, problems, remaining: null };

  const attempt = (label, fn) => {
    try {
      fn();
    } catch (err) {
      problems.push(`${label}: ${err.message}`);
    }
  };

  // Catalogue first: it needs the scan ids that the scan table is about to lose.
  if (before.databases.userCatalogue.found) {
    attempt('userCatalogue', () => {
      const db = open(loc.userCatalogue, false);
      try {
        db.exec('PRAGMA secure_delete = ON');
        db.exec('BEGIN IMMEDIATE');
        const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
        if (names.has('user_observation')) db.prepare('DELETE FROM user_observation WHERE device_key = ?').run(catalogueKeyOf(deviceId));
        inChunks(before.scanIds, (ids) => {
          const marks = ids.map(() => '?').join(',');
          for (const t of ['user_observation', 'user_offer', 'user_review']) {
            if (names.has(t)) db.prepare(`DELETE FROM ${t} WHERE scan_id IN (${marks})`).run(...ids);
          }
        });
        db.exec('COMMIT');
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* nothing open */
        }
        throw err;
      } finally {
        db.close();
      }
    });
  }
  for (const key of ['corrections', 'people']) {
    if (before.databases[key].found) attempt(key, () => deleteDeviceRows(before.databases[key].path, deviceId));
  }

  // Files, then logs.
  for (const p of before.photoFiles) attempt(`photo ${p}`, () => rmSync(resolve(loc.photos, p), { force: true }));
  for (const d of before.shelfDirs) attempt(`shelf ${d}`, () => rmSync(d, { recursive: true, force: true }));
  for (const d of before.shutterDirs) attempt(`shutter ${d}`, () => rmSync(d, { recursive: true, force: true }));
  if (before.accessLog.found) attempt('access log', () => rewriteWithout(loc.accessLog, deviceId));
  for (const f of Object.keys(before.logs.files)) attempt(f, () => rewriteWithout(join(loc.logs, f), deviceId));

  // The scan database last, so a failure above leaves the scan ids in place for a re-run.
  if (before.databases.scans.found) attempt('scans', () => deleteScanRows(loc.scans, deviceId));

  const after = gather(deviceId, loc);
  const remaining = countsOf(after).filter((r) => r.n);
  for (const r of remaining) problems.push(`still present after delete: ${r.store} ${r.table} (${r.n})`);
  problems.push(...after.errors.filter((e) => !problems.includes(e)));
  return { dryRun: false, plan, problems, remaining };
}

// ---- command line --------------------------------------------------------------------------------------

const NOT_REACHED = [
  'Not reached by this script, and why it matters:',
  '  - Nightly backups (SHIN_BACKUP_DIR) still hold this phone until the newest 14 are all newer than the delete.',
  '    If a backup is ever restored, run this delete again for every request in the log.',
  '  - RevenueCat (purchases): delete the customer in the RevenueCat dashboard (docs/privacy/data-requests.md).',
  '  - Rows older than 24 months were already stripped of the phone and cannot be found by its id.',
];

function pad(s, n) {
  return String(s).padEnd(n, ' ');
}

function printCounts(plan, verb) {
  console.log(`${pad('store', 15)}${pad('table / item', 24)}${verb}`);
  for (const r of plan) console.log(`${pad(r.store, 15)}${pad(r.table, 24)}${r.n === null ? r.note : r.n}`);
}

function usage(code) {
  const text = [
    'usage: node scripts/privacy/device-data.mjs export <deviceId> [--out file.json]',
    '       node scripts/privacy/device-data.mjs delete <deviceId> [--yes]',
    '',
    'delete is a dry run unless --yes is given. Options: --log-dir <folder> (server logs, default mac/logs).',
  ].join('\n');
  (code === 0 ? console.log : console.error)(text);
  process.exit(code);
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, v === undefined || v.startsWith('--') ? 1 : 2);
    return v;
  };
  const yes = args.includes('--yes');
  if (yes) args.splice(args.indexOf('--yes'), 1);
  const out = flag('--out');
  const logDir = flag('--log-dir');
  const [command, deviceId, ...extra] = args;
  if (command === '--help' || command === '-h') usage(0);
  if (!['export', 'delete'].includes(command) || extra.length) usage(2);
  if (typeof deviceId !== 'string' || !ID_SHAPE.test(deviceId)) {
    console.error(`refused: "${deviceId ?? ''}" is not a device id (8 to 64 letters, digits, - or _). Nothing was read or changed.`);
    process.exit(2);
  }
  const loc = locations(process.env, logDir);

  if (command === 'export') {
    const doc = buildExport(deviceId, loc);
    const json = `${JSON.stringify(doc, null, 2)}\n`;
    if (out) {
      writeFileSync(out, json);
      console.error(`wrote ${out}`);
    } else {
      process.stdout.write(json);
    }
    if (doc.problems.length) {
      console.error(`PROBLEMS: ${doc.problems.join('; ')}`);
      process.exit(1);
    }
    return;
  }

  const result = deleteDevice(deviceId, loc, yes);
  if (result.dryRun) {
    console.log(`DRY RUN for ${deviceId}: nothing was changed. Add --yes to delete.`);
    printCounts(result.plan, 'would delete');
  } else {
    console.log(`DELETED for ${deviceId}:`);
    printCounts(result.plan, 'deleted');
  }
  console.log('');
  console.log(NOT_REACHED.join('\n'));
  if (result.problems.length) {
    console.error(`\nPROBLEMS (exit 1):\n  ${result.problems.join('\n  ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
