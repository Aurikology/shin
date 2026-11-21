/**
 * The phone product pack (about 44 MB unpacked, 6.5 MB brotli) answered "cf-cache-status: DYNAMIC",
 * so Cloudflare never kept it and one script could pull it from the home connection all day
 * (2026-11-21 review, blind 8, cost 7). Cloudflare caches by file extension, and `bin` is on its
 * default list, so the pack now also has a versioned address that ends in `.bin`. The old address
 * keeps working for phones already in the field. No network: a real file in a temp folder.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get as httpGet } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packFileName, parsePackFile, packVersion, servePack } from '../src/pack-route.ts';

const dir = mkdtempSync(join(tmpdir(), 'pexi-pack-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = join(dir, 'pack-canada.bin.br');
writeFileSync(file, Buffer.from('not really brotli, but bytes'));

/** One GET that reads only the answer's head, so a stand-in body is never run through a decoder. */
const head = (base: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; headers: IncomingHttpHeaders }>((resolve, reject) => {
    httpGet(base, { headers }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, headers: res.headers });
    }).on('error', reject);
  });

const start = (handler: (req: IncomingMessage, res: ServerResponse) => void) =>
  new Promise<{ base: string; close: () => void }>((resolve) => {
    const s = createServer(handler);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${addr.port}`, close: () => s.close() });
    });
  });

test('the versioned address ends in .bin, the one extension Cloudflare caches by default that fits', () => {
  const name = packFileName('canada', '1763000000000-44143820');
  assert.equal(name, 'canada-1763000000000-44143820.bin');
  assert.match(name, /\.bin$/);
  assert.deepEqual(parsePackFile(`/api/pack/${name}`), { scope: 'canada', version: '1763000000000-44143820' });
  assert.deepEqual(parsePackFile('/api/pack/grocery-1-2.bin'), { scope: 'grocery', version: '1-2' });
});

test('anything that is not a pack file name is not parsed as one', () => {
  for (const bad of ['/api/pack', '/api/pack/', '/api/pack/canada.bin', '/api/pack/canada-1-2.br', '/api/pack/other-1-2.bin', '/api/pack/../canada-1-2.bin', '/api/pack/canada-1-2.bin/x', '/api/pack/canada-a-b.bin']) {
    assert.equal(parsePackFile(bad), null, bad);
  }
});

test('the version answer carries the address to download, built from the same version', async () => {
  const v = await packVersion('canada', file);
  assert.ok(v);
  assert.equal(v.url, `/api/pack/${packFileName('canada', v.version)}`);
  assert.match(v.version, /^\d+-\d+$/, 'the old version string must keep its shape for phones already out');
});

test('the versioned address serves the pack once, brotli as stored, immutable', async () => {
  const v = (await packVersion('canada', file))!;
  const s = await start((req, res) => void servePack(req, res, 'canada', { file, version: v.version }));
  try {
    const r = await head(s.base, { 'accept-encoding': 'br' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-encoding'], 'br');
    assert.match(String(r.headers['cache-control']), /immutable/);
    assert.match(String(r.headers['cache-control']), /public/);
    assert.match(String(r.headers['vary']), /accept-encoding/i);
    assert.equal(r.headers['content-length'], String(v.bytes));
  } finally {
    s.close();
  }
});

test('a version that is no longer the current one is a 404 that is never kept, not the new bytes under the old name', async () => {
  const s = await start((req, res) => void servePack(req, res, 'canada', { file, version: '1-2' }));
  try {
    const r = await head(s.base);
    assert.equal(r.status, 404);
    assert.match(String(r.headers['cache-control']), /no-store/);
  } finally {
    s.close();
  }
});

test('the old address (no version) still answers phones already installed, as before', async () => {
  const s = await start((req, res) => void servePack(req, res, 'canada', { file }));
  try {
    const r = await head(s.base, { 'accept-encoding': 'br' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-encoding'], 'br');
  } finally {
    s.close();
  }
});
