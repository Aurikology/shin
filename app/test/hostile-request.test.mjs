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
process.env.SHIN_CATALOGUE_FIRST = '0'; // the Gemini path these tests pin; catalogue first is on by default since 2026-09-28

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

/**
 * Is the server still there?
 *
 * THIS USED TO CONFLATE "DEAD" WITH "BUSY", and the whole file's verdict
 * rode on it. It was one `fetch` with a 2,000 ms timeout, and every failure
 * -- refused, timed out, anything -- returned false, which these tests read
 * as "the server died on that request".
 *
 * `node --test` runs test FILES in parallel, and this is the only file in the
 * package that boots a real server and talks to it over a socket. Under the
 * full suite the machine is loaded, a reply takes longer than two seconds,
 * and four tests report a death that never happened. Measured 2026-09-19:
 * five of five pass running this file alone and the whole app suite passes
 * at `--test-concurrency=1`, while the default parallel run fails four.
 *
 * THE TWO STATES ARE DISTINGUISHABLE and the fix is to distinguish them
 * rather than to raise the timeout and hope. A process that is gone REFUSES
 * the connection, at once and every time -- ECONNREFUSED, or ECONNRESET on
 * Windows. A process that is merely busy accepts and answers late. So a
 * refusal is death, and a slow answer is retried inside a budget generous
 * enough that only a real death can exhaust it.
 *
 * A test that fails when the machine is busy is worse than no test: it
 * teaches everyone to read red as noise, and the next real death reads the
 * same as this one did.
 */
const ALIVE_BUDGET_MS = 20_000;
const alive = async () => {
  const deadline = Date.now() + ALIVE_BUDGET_MS;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/categories`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (err) {
      // Nothing is listening: that is the death these tests exist to catch,
      // and it is immediate and permanent, so report it without waiting.
      const code = err?.cause?.code ?? err?.code;
      if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return false;
      // Anything else is 'no answer yet'. Only the budget running out is a
      // verdict, and 20 s of silence from a live server is not a thing a
      // loaded laptop does.
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, 200));
    }
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

test('whitespace is not a query, on identify as it already was not on search', async () => {
  // `?text=%20%20` used to pass the presence guard, run a real search on
  // nothing, and write a refused scan row that dragged the identity rate down.
  const res = await fetch(`http://127.0.0.1:${PORT}/api/identify?text=%20%20%20`);
  assert.equal(res.status, 400);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
});

test('the ordinary request still works, so the guard did not break routing', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/categories`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
});
