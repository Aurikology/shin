/**
 * Every request the server answers, one JSON line each, in
 * <SHIN_DATA_DIR>/access.log.
 *
 * Added 2026-09-14 because a phone on the family beta sent about 120 requests
 * through the tunnel and left nothing behind: no scan, no photo, no shutter
 * frame. The tunnel counts requests by status code and nothing more, so there
 * was no way to tell a phone refused at the invite gate from a phone running a
 * stale copy of the app from one that never pressed anything. This answers
 * that: which path, which status, how long, which phone, and whether it
 * carried the invite at all (never the code itself).
 *
 * NEVER THROWS, same contract as the scan log: a line that cannot be written
 * is dropped rather than costing the shopper the answer.
 */
import * as settings from '../../settings/src/index.ts';
import { appendFile } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { inviteWho } from './invite.ts';
import { notePerson } from './admin.ts';
import { POSITION_KEYS } from './migrations.ts';
import { parseCell } from './stores.ts';
import { customerDataFault } from './customer-data-faults.ts';

const URL_PRECISE_PAIR = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/;
const URL_POSITION_KEYS: ReadonlySet<string> = new Set(POSITION_KEYS);

/**
 * Requirement 5.6 (docs/price-category-requirements-2026-10-01.md, "0 exact
 * positions stored") for this file, which until 2026-10-09 kept the full URL:
 * an old client's `lat=`/`lon=`/`accuracy=`/`locatedAt=` and an over-precise
 * `cell=` were written here whole, consent or not. A query parameter whose name
 * is a position (`POSITION_KEYS`, migrations.ts) is dropped; a value holding a
 * precise "lat,lon" pair is snapped to the kilometre cell. Every other part of
 * the URL is left byte for byte as it came. Each scrub is a
 * `[customer-data-fault] exact_position_dropped`: a client sending one is a bug.
 */
export function scrubUrlPosition(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hashAt = url.indexOf('#', q);
  const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  let scrubbed = 0;
  const kept: string[] = [];
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    const rawName = eq < 0 ? part : part.slice(0, eq);
    let name = rawName;
    let value = eq < 0 ? '' : part.slice(eq + 1);
    try {
      name = decodeURIComponent(rawName.replace(/\+/g, ' '));
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      /* a malformed escape is kept as it came; the pair check still runs on it */
    }
    if (URL_POSITION_KEYS.has(name.toLowerCase().replace(/[_\-\s]/g, ''))) {
      scrubbed += 1;
      continue;
    }
    const pair = value.match(URL_PRECISE_PAIR);
    if (pair) {
      scrubbed += 1;
      const snapped = parseCell(pair[0].replace(/\s+/g, ''))?.text ?? '';
      kept.push(`${rawName}=${encodeURIComponent(value.replace(URL_PRECISE_PAIR, snapped))}`);
      continue;
    }
    kept.push(part);
  }
  if (scrubbed === 0) return url;
  customerDataFault('exact_position_dropped', `access log: ${scrubbed} position parameter(s) dropped or snapped on ${url.slice(0, q)}`);
  return `${url.slice(0, q)}${kept.length ? `?${kept.join('&')}` : ''}${hashAt < 0 ? '' : url.slice(hashAt)}`;
}

export function accessLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return settings.SHIN_ACCESS_LOG(env)?.trim() || join(settings.SHIN_DATA_DIR(env)?.trim() || join(process.cwd(), 'data'), 'access.log');
}

export function recordAccess(req: IncomingMessage, res: ServerResponse, env: NodeJS.ProcessEnv = process.env): void {
  if (settings.SHIN_ACCESS_LOG(env)?.trim().toLowerCase() === 'off') return;
  const started = Date.now();
  res.on('finish', () => {
    try {
      const h = req.headers;
      const line = JSON.stringify({
        at: new Date(started).toISOString(),
        ms: Date.now() - started,
        method: req.method,
        // The invite never travels in the URL, but strip a hash-like query value anyway.
        // Requirement 5.6: no exact position in the log either (`scrubUrlPosition`).
        url: scrubUrlPosition(req.url ?? '').replace(/(invite=)[^&]*/gi, '$1…'),
        status: res.statusCode,
        ip: h['cf-connecting-ip'] ?? req.socket.remoteAddress ?? null,
        country: h['cf-ipcountry'] ?? null,
        ua: h['user-agent'] ?? null,
        invite: Boolean(h['x-shin-invite']),
        who: inviteWho(h['x-shin-invite'], env),
        shutter: h['x-shin-shutter'] ?? null,
        referer: h.referer ?? null,
        // Item 18, ruling 8 (docs/decisions.md, "Nine rulings", 2026-09-19): a
        // missing Origin is allowed and marked, never refused (a native
        // wrapper may legitimately send none); the mark is this field. A
        // present-and-mismatched Origin is refused outright at the route
        // (server.ts), and the refused request still lands here with its own
        // status code.
        origin: h.origin ?? null,
      });
      appendFile(accessLogPath(env), line + '\n', (err) => {
        if (err) console.warn(`[access-log-fault] line not written: ${err.message}`);
      });
      const deviceId = new URL(req.url ?? '/', 'http://x').searchParams.get('deviceId');
      notePerson(deviceId, inviteWho(h['x-shin-invite'], env), env);
    } catch (err) {
      // Never thrown (the request was answered), but never silent either (RULINGS.md "Errors never go unnoticed").
      console.warn(`[access-log-fault] line not written: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
