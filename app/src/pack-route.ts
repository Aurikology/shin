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

/*
 * THE VERSIONED ADDRESS, /api/pack/<scope>-<version>.bin (2026-11-21, blind 8 and cost 7).
 *
 * Cloudflare answered the old address, /api/pack?scope=canada, "cf-cache-status: DYNAMIC": it never
 * kept it, so every phone and every script pulled the 6.5 MB from the home connection. Cloudflare's
 * default cache behaviour (developers.cloudflare.com/cache/concepts/default-cache-behavior/, read
 * 2026-11-21) is: "Cloudflare only caches based on file extension and not by MIME type", it does not
 * cache HTML or JSON by default, and it caches when Cache-Control is public with max-age above 0. The
 * default list includes BIN, so a path that ends in .bin, sent with `public, max-age=31536000,
 * immutable`, is kept at the edge with no dashboard change. The version is in the path, so a rebuilt
 * pack is a new address and can never be answered with old bytes; a request for any version but the
 * current one is a 404 that is never kept. The old address stays for phones already installed.
 */
const PACK_FILE = /^\/api\/pack\/(grocery|canada)-(\d+-\d+)\.bin$/;

/** The file name of one scope's pack at one version, the last part of the versioned address. */
export function packFileName(scope: PackScope, version: string): string {
  return `${scope}-${version}.bin`;
}

/** The scope and version a versioned pack address names, or null when the path is anything else. */
export function parsePackFile(pathname: string): { scope: PackScope; version: string } | null {
  const m = PACK_FILE.exec(pathname);
  return m ? { scope: m[1] as PackScope, version: m[2]! } : null;
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
  /** TEST ONLY: a pack file other than the real one. */
  file: string = PACK_PATH[scope],
): Promise<{ scope: PackScope; version: string; bytes: number; url: string } | null> {
  /*
   * NULL WHEN THE PACK IS NOT BUILT, rather than a throw, and the reason is
   * that `servePack` twenty lines down has always said so and this function
   * never did. Two functions over the same file disagreeing about whether its
   * absence is an error is the kind of seam somebody debugs twice.
   *
   * Before this, a missing pack threw ENOENT out of `stat` and landed in the
   * server's catch-all, which is written for missing STATIC FILES: the client
   * got `text/plain: not found`, from a JSON endpoint, with nothing in it
   * naming the pack. Observed as a 404 on every page load on a checkout with
   * no pack built, which is every fresh checkout, since the pack is a
   * gitignored artifact (D-043).
   *
   * The caller is opportunistic and swallows failures either way, so this
   * changes no behaviour a shopper sees. It changes what the person looking at
   * the network tab is told, which is the only audience a version endpoint
   * has.
   */
  try {
    const info = await stat(file);
    const version = `${Math.trunc(info.mtimeMs)}-${info.size}`;
    // `url` is new (2026-11-21): the cacheable address. Phones already out ignore it and keep using the old one.
    return { scope, version, bytes: info.size, url: `/api/pack/${packFileName(scope, version)}` };
  } catch {
    return null;
  }
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
  /**
   * `version`: set on the versioned address, which answers only while it names the current pack.
   * `file`: TEST ONLY, a pack file other than the real one.
   */
  opts: { version?: string; file?: string } = {},
): Promise<void> {
  const path = opts.file ?? PACK_PATH[scope];
  let info;
  try {
    info = await stat(path);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('pack not built');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('GET only');
    return;
  }
  if (opts.version !== undefined && opts.version !== `${Math.trunc(info.mtimeMs)}-${info.size}`) {
    // A rebuilt pack is a new address. Never the new bytes under the old name, and never kept by anyone.
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('that pack version is no longer current; ask /api/pack-version for the address');
    return;
  }
  /*
   * ALWAYS THE BROTLI FILE AS STORED, never an uncompressed body from this machine. The 44 MB a script
   * sees when it asks without accepting compression is Cloudflare unpacking the 6.5 MB at its own edge
   * (checked live 2026-11-21: with accept-encoding gzip or identity the answer arrives chunked, with
   * br it arrives with the stored length); the home connection sends 6.5 MB either way, and once the
   * edge holds the .bin address it sends it once. `vary` keeps any cache from handing the brotli bytes
   * to a client that cannot read them.
   */
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-encoding': 'br',
    'content-length': String(info.size),
    'cache-control': 'public, max-age=31536000, immutable',
    vary: 'accept-encoding',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  /*
   * `pipe` does not forward the source's errors, and an unhandled 'error' on a
   * ReadStream throws out of the event loop -- outside the request handler's
   * try, so it kills the process the same way D-055 did. The window is between
   * the `stat` above and the open: the pack rewritten by export-pack.ts while a
   * phone is mid-download, or the path resolving to a directory (stat succeeds,
   * open gives EISDIR). Headers are already out by then, so the only honest
   * answer is to end the socket: a truncated body fails the client's own
   * parse, which pack.js treats as "no pack", the normal starting state.
   */
  const stream = createReadStream(path);
  stream.on('error', (err) => {
    console.error('pack stream failed:', err);
    res.destroy();
  });
  // A phone that walks out of signal mid-download leaves a stream reading a
  // file nobody is receiving. Close it when the response closes.
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
