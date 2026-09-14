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
 * NOT CONSENT-GATED, unlike photos.ts. The founder asked for every press. The
 * switch is SHIN_SHUTTER_LOG=off; the folder is SHIN_SHUTTER_DIR, defaulting
 * to <SHIN_DATA_DIR>/shutter. Nothing here may break a request: every write is
 * wrapped, and a failure is dropped rather than thrown into the route.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const SHUTTER_HEADER = 'x-shin-shutter';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function shutterLogOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SHIN_SHUTTER_LOG?.trim().toLowerCase() !== 'off';
}

export function shutterDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SHIN_SHUTTER_DIR?.trim() || join(env.SHIN_DATA_DIR?.trim() || join(process.cwd(), 'data'), 'shutter');
}

/** The press id on a request, or null when there is none or it is malformed. */
export function shutterIdOf(req: IncomingMessage): string | null {
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

  const sent: Buffer[] = [];
  req.on('data', (c: Buffer) => sent.push(c));

  const returned: Buffer[] = [];
  const write = res.write.bind(res) as (...a: unknown[]) => boolean;
  const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse;
  const keep = (chunk: unknown) => {
    if (typeof chunk === 'string') returned.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) returned.push(Buffer.from(chunk));
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
      if (raw.length > 0) {
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
        response = JSON.parse(out.toString('utf8'));
      } catch {
        response = { bytes: out.length };
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
