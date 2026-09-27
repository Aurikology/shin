/**
 * Read-only access to the beta's data from outside the Mac.
 *
 * Added 2026-09-14 on the founder's ask: "if aurik is working on the app and
 * testing features, how can he access the analytics from his claude". The
 * scans, events, photos, shutter frames and access log live on one Mac; a
 * Claude session on Aurik's machine can reach that Mac only through the public
 * hostname. So this is a handful of routes under /api/admin/, behind a token
 * that is not the invite code:
 *
 *   GET  /api/admin/tables                 every table and its columns
 *   POST /api/admin/sql      body: SQL     rows as JSON, read-only, at most 5000
 *   GET  /api/admin/people                 which device came through whose link
 *   GET  /api/admin/access?since=&limit=   access log lines, newest last
 *   GET  /api/admin/shutter?limit=         shutter presses, newest first
 *   GET  /api/admin/file?path=             any file under the data folder
 *                                          (a frame, a photo), as bytes
 *
 * READ-ONLY BY CONSTRUCTION, not by checking the SQL. The database is opened
 * with `readOnly: true`, so an UPDATE or a DROP fails in SQLite itself, and a
 * test proves it. Nothing here writes anywhere.
 *
 * OFF UNLESS `SHIN_ADMIN_TOKEN` IS SET. Unset, every admin path answers 404,
 * the same as a route that does not exist. The token travels in
 * `x-shin-admin`, compared in constant time, and never in a URL.
 *
 * WHOSE LINK. `notePerson` records, for every request that names a device and
 * carries a named invite, which person's link that device came through. Kept
 * in its own small file (people.db) beside the scan store so it needs no
 * migration of the scan database; `/api/admin/sql` attaches it as `people`.
 */
import { timingSafeEqual } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as settings from '../../settings/src/index.ts';
import { accessLogPath } from './access-log.ts';
import { shutterDir } from './shutter-log.ts';

const ADMIN_HEADER = 'x-shin-admin';
const MAX_ROWS = 5000;
const MAX_SQL_BYTES = 64 * 1024;

function dataDir(env: NodeJS.ProcessEnv): string {
  return resolve(settings.SHIN_DATA_DIR(env)?.trim() || join(process.cwd(), 'data'));
}

function scansPath(env: NodeJS.ProcessEnv): string {
  return resolve(settings.SHIN_SCANS(env)?.trim() || join(dataDir(env), 'scans.db'));
}

function peoplePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(settings.SHIN_PEOPLE_DB(env)?.trim() || join(dataDir(env), 'people.db'));
}

function adminAllows(sent: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const token = settings.SHIN_ADMIN_TOKEN(env)?.trim();
  if (!token || typeof sent !== 'string') return false;
  const a = Buffer.from(sent.trim(), 'utf8');
  const b = Buffer.from(token, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

let people: DatabaseSync | null = null;
let peopleAt: string | null = null;

/** Remembers whose link a device came through. Never throws. */
export function notePerson(deviceId: string | null, who: string | null, env: NodeJS.ProcessEnv = process.env): void {
  if (!deviceId || !who) return;
  try {
    const path = peoplePath(env);
    if (!people || peopleAt !== path) {
      people?.close();
      people = new DatabaseSync(path);
      people.exec(`CREATE TABLE IF NOT EXISTS device_person (
        device_id TEXT NOT NULL, person TEXT NOT NULL,
        first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
        PRIMARY KEY (device_id, person))`);
      peopleAt = path;
    }
    const now = new Date().toISOString();
    people
      .prepare(`INSERT INTO device_person (device_id, person, first_seen, last_seen) VALUES (?, ?, ?, ?)
        ON CONFLICT (device_id, person) DO UPDATE SET last_seen = excluded.last_seen`)
      .run(deviceId, who, now, now);
  } catch {
    // Dropped, never thrown: this must not cost a shopper the answer.
  }
}

function readOnlyDb(env: NodeJS.ProcessEnv): DatabaseSync {
  const db = new DatabaseSync(scansPath(env), { readOnly: true });
  const p = peoplePath(env);
  if (existsSync(p)) db.exec(`ATTACH DATABASE 'file:${p.replace(/'/g, "''")}?mode=ro' AS people`);
  return db;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

async function readText(req: IncomingMessage, cap: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > cap) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json',
  '.log': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

/**
 * Answers an /api/admin/ request. Call before the invite check: these routes
 * take the admin token instead.
 */
export async function handleAdmin(req: IncomingMessage, res: ServerResponse, url: URL, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!settings.SHIN_ADMIN_TOKEN(env)?.trim()) return send(res, 404, { error: 'not found' });
  if (!adminAllows(req.headers[ADMIN_HEADER], env)) return send(res, 401, { error: `admin routes need the ${ADMIN_HEADER} header` });
  const route = url.pathname.slice('/api/admin/'.length);
  try {
    if (route === 'tables') {
      const db = readOnlyDb(env);
      try {
        const out: Record<string, string[]> = {};
        for (const schema of ['main', 'people']) {
          let tables: { name: string }[] = [];
          try {
            tables = db.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[];
          } catch { continue; }
          for (const { name } of tables) {
            const cols = db.prepare(`PRAGMA ${schema}.table_info("${name.replace(/"/g, '""')}")`).all() as { name: string; type: string }[];
            out[schema === 'main' ? name : `people.${name}`] = cols.map((c) => `${c.name} ${c.type}`.trim());
          }
        }
        return send(res, 200, out);
      } finally { db.close(); }
    }
    if (route === 'sql') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST the SQL as the body' });
      const sql = await readText(req, MAX_SQL_BYTES);
      if (sql === null) return send(res, 413, { error: `SQL is at most ${MAX_SQL_BYTES} bytes` });
      const db = readOnlyDb(env);
      try {
        const rows: unknown[] = [];
        let truncated = false;
        for (const row of db.prepare(sql).iterate()) {
          if (rows.length >= MAX_ROWS) { truncated = true; break; }
          rows.push(row);
        }
        return send(res, 200, { rows, count: rows.length, truncated });
      } catch (err) {
        return send(res, 400, { error: String((err as Error).message ?? err) });
      } finally { db.close(); }
    }
    if (route === 'people') {
      if (!existsSync(peoplePath(env))) return send(res, 200, { rows: [] });
      const db = new DatabaseSync(peoplePath(env), { readOnly: true });
      try {
        return send(res, 200, { rows: db.prepare('SELECT * FROM device_person ORDER BY last_seen DESC').all() });
      } finally { db.close(); }
    }
    if (route === 'access') {
      const since = url.searchParams.get('since') ?? '';
      const limit = Math.min(Number(url.searchParams.get('limit')) || 500, MAX_ROWS);
      const path = accessLogPath(env);
      const lines = existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n') : [];
      const picked = lines.filter((l) => !since || l.slice(7, 31) >= since).slice(-limit);
      return send(res, 200, { lines: picked.map((l) => { try { return JSON.parse(l); } catch { return l; } }) });
    }
    if (route === 'shutter') {
      const dir = shutterDir(env);
      const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 1000);
      const presses = existsSync(dir)
        ? readdirSync(dir)
            .map((id) => ({ id, at: statSync(join(dir, id)).mtime.toISOString(), files: readdirSync(join(dir, id)) }))
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, limit)
        : [];
      return send(res, 200, { presses, fileRoute: '/api/admin/file?path=shutter/<id>/<file>' });
    }
    if (route === 'file') {
      const root = dataDir(env);
      const wanted = resolve(root, url.searchParams.get('path') ?? '');
      if (wanted !== root && !wanted.startsWith(root + sep)) return send(res, 400, { error: 'path must stay inside the data folder' });
      if (!existsSync(wanted) || !statSync(wanted).isFile()) return send(res, 404, { error: 'no such file' });
      res.writeHead(200, { 'content-type': TYPES[extname(wanted).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(wanted));
      return;
    }
    return send(res, 404, { error: 'unknown admin route', routes: ['tables', 'sql', 'people', 'access', 'shutter', 'file'] });
  } catch (err) {
    return send(res, 500, { error: String((err as Error).message ?? err) });
  }
}
