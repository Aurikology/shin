/**
 * The request body cap, DEFECTS.md D-032.
 *
 * RUNS A REAL SERVER, not a handler called by hand. The defect was that bytes
 * accumulated before anything looked at them, and the only place that is true
 * or false is a socket: an in-process call with a fake request would be the
 * test agreeing with the code, which is the shape DEFECTS.md standard 3 says
 * has been green while the product was broken five times now.
 *
 * The cap lives in `server.ts` as `MAX_JSON_BODY_BYTES` and is not exported;
 * this file carries the same number, and the pair of tests around it is what
 * catches the two of them drifting apart. One byte under has to succeed and one
 * byte over has to be refused, because a cap that rejects everything passes the
 * over test on its own.
 *
 * The third case is the one a `content-length` check alone would miss: a client
 * that declares a small body and then streams a large one. That is written with
 * a raw socket rather than fetch, because no HTTP client will lie for you.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

/** Keep in step with MAX_JSON_BODY_BYTES in app/server.ts. */
const CAP = 8 * 1024;

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));

let child;
let port;
let sandbox;

/** A port nobody is on, asked of the OS rather than guessed, because the main
 *  session's server is usually already sitting on 4173. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: p } = probe.address();
      probe.close(() => resolve(p));
    });
  });
}

before(async () => {
  port = await freePort();
  sandbox = mkdtempSync(join(tmpdir(), 'shin-body-cap-'));
  child = spawn(process.execPath, ['server.ts'], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      // Corrections go to a throwaway file: this suite posts corrections and
      // must not write into the real table, which is the one thing in this
      // product that cannot be rebuilt from anything.
      SHIN_CORRECTIONS: join(sandbox, 'corrections.db'),
      // No catalogue. Every route under test answers without one, and
      // attaching the real 9 GB file would make this suite the slowest in the
      // repo for nothing.
      SHIN_CATALOGUE: join(sandbox, 'no-catalogue.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const fail = setTimeout(() => reject(new Error('the server did not come up in 20 seconds')), 20_000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('Shin is running')) {
        clearTimeout(fail);
        resolve();
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`the server exited with ${code} before it listened`)));
  });
});

after(() => {
  child?.kill();
  // Best effort. Windows keeps the sqlite file locked until the child has
  // actually gone, and a temp directory left behind is not worth failing a
  // suite over.
  try {
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /* the OS will take it */
  }
});

/**
 * A correction whose JSON is exactly `bytes` long.
 *
 * The padding rides in a field the route does not read, so the size is the only
 * thing under test. `clientId` is left out on purpose: the route answers a
 * correction it will not store with a 200 and a sentence, which is the
 * behaviour documented above the route, so a 200 here proves the body was read
 * and parsed without this suite writing a row anywhere.
 */
function bodyOfExactly(bytes) {
  const shell = JSON.stringify({ deviceId: 'body-cap-test', pad: '' });
  const padding = 'x'.repeat(bytes - shell.length);
  const body = JSON.stringify({ deviceId: 'body-cap-test', pad: padding });
  assert.equal(Buffer.byteLength(body), bytes, 'the fixture builder itself is off');
  return body;
}

function post(path, body, headers = {}) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

test('a correction one byte under the cap is read and answered', async () => {
  const res = await post('/api/correction', bodyOfExactly(CAP - 1));
  assert.equal(res.status, 200);
  const seen = await res.json();
  // Read and parsed, then declined on its shape rather than its size.
  assert.equal(seen.stored, false);
});

test('a correction one byte over the cap is refused with a 413', async () => {
  const res = await post('/api/correction', bodyOfExactly(CAP + 1));
  assert.equal(res.status, 413);
  const seen = await res.json();
  assert.match(seen.error, /over the \d+ byte limit/);
});

test('the price route is capped too, not just the correction route', async () => {
  const under = await post('/api/price', bodyOfExactly(CAP - 1));
  assert.equal(under.status, 200);
  const over = await post('/api/price', bodyOfExactly(CAP + 1));
  assert.equal(over.status, 413);
});

test('an ordinary small correction still works, so the cap is not simply refusing everything', async () => {
  const res = await post(
    '/api/correction',
    JSON.stringify({
      clientId: `body-cap-${Date.now()}`,
      deviceId: 'body-cap-test',
      label: 'Kraft Dinner',
      category: 'grocery',
      seller: 'Metro',
      priceCents: 199,
      kind: 'regular',
      seenOn: '2026-09-06',
    }),
  );
  assert.equal(res.status, 200);
  const seen = await res.json();
  assert.equal(typeof seen.stored, 'boolean');
});

/**
 * The case `content-length` cannot catch.
 *
 * Chunked, so there is no declared length at all, and a megabyte behind it. If
 * the cap were a header check the whole megabyte would land in memory first.
 * The refusal has to arrive while the client is still sending.
 */
test('a chunked body that never declares its size is cut off at the cap', async () => {
  const status = await new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(
        'POST /api/correction HTTP/1.1\r\n' +
          `Host: 127.0.0.1:${port}\r\n` +
          'Content-Type: application/json\r\n' +
          'Transfer-Encoding: chunked\r\n\r\n',
      );
      const chunk = 'y'.repeat(4096);
      let sent = 0;
      const pump = () => {
        while (sent < 1024 * 1024) {
          sent += chunk.length;
          if (!socket.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`)) return;
        }
        // The terminating chunk. Sending the whole megabyte and then finishing
        // is the honest version of this mistake, a photo posted to a JSON
        // route, and it is the one that has to come away knowing it was
        // refused. A client that never terminates is what the drain's own two
        // second bound is for, and it gets the socket taken away instead.
        socket.write('0\r\n\r\n');
      };
      socket.on('drain', pump);
      pump();
    });
    let seen = '';
    const statusLine = () => (seen ? Number(seen.split(' ')[1]) : 0);
    socket.on('data', (d) => {
      seen += d.toString('utf8');
      if (seen.includes('\r\n\r\n')) {
        resolve(statusLine());
        socket.destroy();
      }
    });
    /*
     * A client that is still sending when the server stops listening gets an
     * ECONNRESET, and node can deliver that error before the response bytes it
     * has already buffered. Reading the status off `seen` the instant the error
     * fires read an empty string and failed a passing server. So the end of the
     * socket only schedules the answer; the queued data events land first.
     */
    const settleSoon = () => setTimeout(() => resolve(statusLine()), 250);
    socket.on('close', settleSoon);
    socket.on('error', settleSoon);
    socket.setTimeout(15_000, () => {
      socket.destroy();
      reject(new Error('the server never answered a body it should have refused'));
    });
  });
  assert.equal(status, 413);
});
