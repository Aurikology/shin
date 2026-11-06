/**
 * The shutter log: every shutter press, what the camera saw and what the
 * server said back. Added 2026-09-13 on the founder's word for the family
 * beta: "every time i press the shutter, the server receives exactly what the
 * camera sees and what it returns".
 *
 * One folder per press, named by the id the phone makes at the press:
 *   frame.jpg            the whole camera frame at the moment of the press
 *   frame.json           its size and when it was taken
 *   <time>-<route>.json  every API request the phone sent under that id, the
 *                        body it sent and the exact body the server returned
 *   <time>-sent.<ext>    any image inside such a request (the crop the photo
 *                        route reads), saved as a file rather than base64
 *
 * OFF UNLESS SHIN_SHUTTER_LOG=on (Jamin's App Store list, 2026-11-05, item 2).
 * It was on by default for the family beta, and with the invite gate off that
 * let anyone buffer and write a whole request body to the Mac's disk with one
 * header. When it is on, what one request can make it keep and how many requests
 * it keeps in a day are both capped below. The folder is SHIN_SHUTTER_DIR,
 * defaulting to <SHIN_DATA_DIR>/shutter. Nothing here may break a request: every
 * write is wrapped, and a failure is dropped rather than thrown into the route.
 */
import * as settings from '../../settings/src/index.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SHUTTER_HEADER = 'x-shin-shutter';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The most of one direction of one request this log holds; past it the bytes are counted, not kept. */
export const SHUTTER_MAX_KEPT_BYTES = 4 * 1024 * 1024;
/** Requests logged in a UTC day, across every device. Device ids are invented, so a per-device count would not hold. */
export const SHUTTER_REQUESTS_PER_DAY = 3000;

let countedDay = '';
let countedToday = 0;

/** Counts one logged request against today, or says today is full. */
function roomToday(now: Date): boolean {
  const day = now.toISOString().slice(0, 10);
  if (day !== countedDay) {
    countedDay = day;
    countedToday = 0;
  }
  if (countedToday >= SHUTTER_REQUESTS_PER_DAY) return false;
  countedToday += 1;
  return true;
}

export function resetShutterRequestCountForTests(): void {
  countedDay = '';
  countedToday = 0;
}

export function shutterLogOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return settings.SHIN_SHUTTER_LOG(env)?.trim().toLowerCase() === 'on';
}

export function shutterDir(env: NodeJS.ProcessEnv = process.env): string {
  return settings.SHIN_SHUTTER_DIR(env)?.trim() || join(settings.SHIN_DATA_DIR(env)?.trim() || join(process.cwd(), 'data'), 'shutter');
}

/** The press id on a request, or null when there is none or it is malformed. */
function shutterIdOf(req: IncomingMessage): string | null {
  const raw = req.headers[SHUTTER_HEADER];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' && ID.test(id) ? id : null;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function imageExt(bytes: Buffer): 'jpg' | 'png' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

/**
 * Start recording one API request that carries a press id. Call before any
 * route reads the body: it listens to the same stream the route reads, and
 * copies what the route writes back, then saves both when the response ends.
 */
export function recordShutterRequest(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  // The frame upload saves itself as frame.jpg; logging its request too would
  // store the same picture a second time as base64 text.
  if (!shutterLogOn(env) || !path.startsWith('/api/') || path === '/api/shutter/frame') return;
  const id = shutterIdOf(req);
  if (!id) return;
  if (!roomToday(new Date())) return;

  const sent: Buffer[] = [];
  let sentBytes = 0;
  req.on('data', (c: Buffer) => {
    sentBytes += c.length;
    if (sentBytes <= SHUTTER_MAX_KEPT_BYTES) sent.push(c);
  });

  const returned: Buffer[] = [];
  let returnedBytes = 0;
  const write = res.write.bind(res) as (...a: unknown[]) => boolean;
  const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse;
  const keep = (chunk: unknown) => {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk instanceof Uint8Array ? Buffer.from(chunk) : null;
    if (!bytes) return;
    returnedBytes += bytes.length;
    if (returnedBytes <= SHUTTER_MAX_KEPT_BYTES) returned.push(bytes);
  };
  (res as { write: unknown }).write = (...a: unknown[]) => {
    keep(a[0]);
    return write(...a);
  };
  (res as { end: unknown }).end = (...a: unknown[]) => {
    if (typeof a[0] !== 'function') keep(a[0]);
    return end(...a);
  };

  const startedAt = new Date().toISOString();
  res.on('finish', () => {
    try {
      const dir = join(shutterDir(env), id);
      mkdirSync(dir, { recursive: true });
      const at = stamp();
      const route = path.replace(/^\/api\//, '').replace(/[^a-z0-9]+/gi, '-');
      let body: unknown = null;
      const raw = Buffer.concat(sent);
      if (sentBytes > SHUTTER_MAX_KEPT_BYTES) {
        body = { overCapBytes: sentBytes };
      } else if (raw.length > 0) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          body = { unparsedBytes: raw.length };
        }
      }
      if (body && typeof body === 'object' && typeof (body as { image?: unknown }).image === 'string') {
        const bytes = Buffer.from((body as { image: string }).image, 'base64');
        const ext = imageExt(bytes);
        const file = `${at}-sent.${ext ?? 'bin'}`;
        writeFileSync(join(dir, file), bytes);
        body = { ...(body as object), image: { savedAs: file, bytes: bytes.length } };
      }
      const out = Buffer.concat(returned);
      let response: unknown;
      try {
        if (returnedBytes > SHUTTER_MAX_KEPT_BYTES) throw new Error('over the cap');
        response = JSON.parse(out.toString('utf8'));
      } catch {
        response = { bytes: returnedBytes };
      }
      writeFileSync(
        join(dir, `${at}-${route}.json`),
        JSON.stringify(
          { startedAt, finishedAt: new Date().toISOString(), method: req.method, url: req.url, status: res.statusCode, sent: body, returned: response },
          null,
          2,
        ),
      );
    } catch {
      // A log that cannot be written must never cost the shopper the answer.
    }
  });
}

/**
 * Save the whole camera frame for a press. Answers the HTTP status to send:
 * 204 saved, 400 malformed, 404 when the log is switched off.
 */
export function saveShutterFrame(body: unknown, env: NodeJS.ProcessEnv = process.env): number {
  if (!shutterLogOn(env)) return 404;
  if (!body || typeof body !== 'object') return 400;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !ID.test(b.id) || typeof b.frame !== 'string') return 400;
  const bytes = Buffer.from(b.frame, 'base64');
  const ext = imageExt(bytes);
  if (!ext) return 400;
  try {
    const dir = join(shutterDir(env), b.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `frame.${ext}`), bytes);
    writeFileSync(
      join(dir, 'frame.json'),
      JSON.stringify(
        { receivedAt: new Date().toISOString(), takenAt: b.takenAt ?? null, width: b.width ?? null, height: b.height ?? null, bytes: bytes.length },
        null,
        2,
      ),
    );
    return 204;
  } catch {
    return 500;
  }
}
