/**
 * Serves the offline barcode pack that catalogue/src/export-pack.ts writes,
 * plus a version check cheap enough to poll on every app open without ever
 * pulling the file itself.
 *
 * NOT WIRED IN. server.ts is held by another session right now; registering
 * this is meant to be two lines dropped into its routing, in its own style:
 *
 *   if (url.pathname === '/api/pack-version') {
 *     const scope = packScope(url.searchParams.get('scope'));
 *     if (!scope) return json(400, { error: 'scope must be grocery or canada' });
 *     return json(200, await packVersion(scope));
 *   }
 *   if (url.pathname === '/api/pack') {
 *     const scope = packScope(url.searchParams.get('scope'));
 *     if (!scope) return json(400, { error: 'scope must be grocery or canada' });
 *     return servePack(req, res, scope);
 *   }
 *
 * The exact path and query shape belongs to server.ts's existing routing
 * conventions, not to this file; packScope() is exported so whoever wires
 * it in does not have to re-invent the validation.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type PackScope = 'grocery' | 'canada';

const PACK_PATH: Record<PackScope, string> = {
  grocery: fileURLToPath(new URL('../../catalogue/data/pack-grocery.bin.br', import.meta.url)),
  canada: fileURLToPath(new URL('../../catalogue/data/pack-canada.bin.br', import.meta.url)),
};

export function packScope(raw: string | null | undefined): PackScope | null {
  return raw === 'grocery' || raw === 'canada' ? raw : null;
}

/**
 * One stat() call, no file content read, which is what "cheap" means here:
 * a phone can call this on every app open without it costing anything close
 * to what re-downloading 1.5 to 6.5 MB would. mtimeMs plus size is not a
 * cryptographic guarantee two different exports never collide, but
 * export-pack.ts always rewrites the whole file, so both change together on
 * every real rebuild; if that ever stops being true, hash the file instead
 * and pay the read once at export time rather than on every request.
 */
export async function packVersion(
  scope: PackScope,
): Promise<{ scope: PackScope; version: string; bytes: number }> {
  const info = await stat(PACK_PATH[scope]);
  return { scope, version: `${Math.trunc(info.mtimeMs)}-${info.size}`, bytes: info.size };
}

/**
 * Streams the already-brotli file straight through with content-encoding
 * set, so nothing here decompresses or recompresses it. The cache header is
 * a full year and marked immutable: that is only correct because the
 * version check above lets a client notice a rebuild and re-fetch under a
 * new query string (e.g. ?v=<version>) rather than trusting this same URL
 * to go stale on its own -- an immutable cache on a URL that silently
 * changes content is the bug pack.js's checkForUpdate exists to avoid.
 */
export async function servePack(
  req: IncomingMessage,
  res: ServerResponse,
  scope: PackScope,
): Promise<void> {
  const path = PACK_PATH[scope];
  let info;
  try {
    info = await stat(path);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('pack not built');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('GET only');
    return;
  }
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-encoding': 'br',
    'content-length': String(info.size),
    'cache-control': 'public, max-age=31536000, immutable',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(path).pipe(res);
}
