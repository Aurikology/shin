/**
 * The server survives a request that is not well formed.
 *
 * One HTTP request killed this process until 2026-09-08. The URL was built by
 * interpolating `req.headers.host` into a base, on the first line of an async
 * handler, outside the try that answers everything else. `Host: [zzz` does not
 * parse as an authority, so `new URL` threw ERR_INVALID_URL as an unhandled
 * rejection, and Node 24 exits on those. No body, no credentials, no second
 * packet: the server was gone for everybody.
 *
 * This suite speaks to a real socket rather than calling the handler, because
 * the whole class lives between the socket and the handler. A unit test of the
 * route would have passed throughout.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const PORT = 4179; // Not 4173: a dev server may be running while tests do.
let server;

const raw = (lines) =>
  new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1', () => socket.write(lines));
    let reply = '';
    socket.on('data', (d) => { reply += d.toString(); });
    socket.on('error', () => resolve({ reply, errored: true }));
    socket.on('close', () => resolve({ reply, errored: false }));
    setTimeout(() => { socket.destroy(); resolve({ reply, errored: false }); }, 2000);
  });

const alive = async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/categories`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
};

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('../server.ts', import.meta.url))], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    if (await alive()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('the server never came up');
});

after(() => server?.kill());

test('a Host header that is not an authority does not kill the server', async () => {
  await raw('GET /api/categories HTTP/1.1\r\nHost: [zzz\r\n\r\n');
  assert.ok(await alive(), 'the server died on a malformed Host header');
});

test('and neither do the other shapes of the same trick', async () => {
  for (const host of ['http://x', ':::::', '[', 'a b c', '%%%', '']) {
    await raw(`GET /api/categories HTTP/1.1\r\nHost: ${host}\r\n\r\n`);
    assert.ok(await alive(), `the server died on Host: ${JSON.stringify(host)}`);
  }
});

test('a path that cannot be parsed is answered, not thrown', async () => {
  // Percent-encodings that decode to nothing valid, and a request target that
  // is not a path at all. Either an answer or a clean close is fine; dying is
  // not.
  for (const target of ['/%', '/%zz', '//', '/..%2f..%2f', '*']) {
    await raw(`GET ${target} HTTP/1.1\r\nHost: localhost\r\n\r\n`);
    assert.ok(await alive(), `the server died on target ${target}`);
  }
});

test('the ordinary request still works, so the guard did not break routing', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/categories`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
});
