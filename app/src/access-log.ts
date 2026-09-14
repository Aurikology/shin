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
import { appendFile } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { inviteWho } from './invite.ts';
import { notePerson } from './admin.ts';

export function accessLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.SHIN_ACCESS_LOG?.trim() || join(env.SHIN_DATA_DIR?.trim() || join(process.cwd(), 'data'), 'access.log');
}

export function recordAccess(req: IncomingMessage, res: ServerResponse, env: NodeJS.ProcessEnv = process.env): void {
  if (env.SHIN_ACCESS_LOG?.trim().toLowerCase() === 'off') return;
  const started = Date.now();
  res.on('finish', () => {
    try {
      const h = req.headers;
      const line = JSON.stringify({
        at: new Date(started).toISOString(),
        ms: Date.now() - started,
        method: req.method,
        // The invite never travels in the URL, but strip a hash-like query value anyway.
        url: (req.url ?? '').replace(/(invite=)[^&]*/gi, '$1…'),
        status: res.statusCode,
        ip: h['cf-connecting-ip'] ?? req.socket.remoteAddress ?? null,
        country: h['cf-ipcountry'] ?? null,
        ua: h['user-agent'] ?? null,
        invite: Boolean(h['x-shin-invite']),
        who: inviteWho(h['x-shin-invite'], env),
        shutter: h['x-shin-shutter'] ?? null,
        referer: h.referer ?? null,
      });
      appendFile(accessLogPath(env), line + '\n', () => {});
      const deviceId = new URL(req.url ?? '/', 'http://x').searchParams.get('deviceId');
      notePerson(deviceId, inviteWho(h['x-shin-invite'], env), env);
    } catch {
      // Dropped, never thrown.
    }
  });
}
