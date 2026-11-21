/**
 * Deploys drain instead of killing. `launchctl kickstart -k` sends SIGTERM; the server used to die on
 * it, cutting any request in flight. Now it stops accepting, lets requests in flight finish (up to
 * 8 seconds), closes its databases and exits 0.
 *
 * Three layers: the drain logic against a real in-process http server (runs everywhere); the real
 * server as a child process receiving a real SIGTERM (POSIX only: on Windows Node turns a "SIGTERM"
 * into an unconditional kill, so that test skips there and runs on the Mac); and the plist, which
 * must give launchd longer than the drain before it sends SIGKILL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect, createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShutdown } from '../src/shutdown.ts';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(APP_DIR, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listening(handler) {
  const s = createServer(handler);
  return new Promise((resolve) => s.listen(0, '127.0.0.1', () => resolve(s)));
}

test('drain: a slow request in flight finishes after the signal, new connections are refused, then it exits 0', async () => {
  const s = await listening((req, res) => setTimeout(() => res.end('finished'), 400));
  const port = s.address().port;
  const exits = [];
  let closed = 0;
  const shutdown = createShutdown({ servers: [s], graceMs: 5000, closers: [() => { closed += 1; }], exit: (c) => exits.push(c) });
  const slow = fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
  await sleep(100);
  const draining = shutdown('SIGTERM');
  await sleep(100);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`), 'a new connection must be refused while draining');
  assert.equal(await slow, 'finished', 'the request that was in flight completed');
  await draining;
  assert.deepEqual(exits, [0]);
  assert.equal(closed, 1, 'the databases were closed once');
});

test('drain: a request that outlasts the grace period is cut, and the exit still happens', async () => {
  const s = await listening(() => { /* never answers */ });
  const port = s.address().port;
  const exits = [];
  const shutdown = createShutdown({ servers: [s], graceMs: 300, closers: [], exit: (c) => exits.push(c) });
  const hung = fetch(`http://127.0.0.1:${port}/`).then(() => 'answered', () => 'cut');
  await sleep(100);
  const t0 = Date.now();
  await shutdown('SIGTERM');
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(await hung, 'cut');
  assert.deepEqual(exits, [0]);
});

test('drain: a failing closer does not stop the others or the exit, and a second signal does nothing', async () => {
  const s = await listening((req, res) => res.end('x'));
  const exits = [];
  const ran = [];
  const shutdown = createShutdown({
    servers: [s],
    graceMs: 1000,
    closers: [() => { throw new Error('locked'); }, () => ran.push('second')],
    exit: (c) => exits.push(c),
  });
  await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
  assert.deepEqual(ran, ['second']);
  assert.deepEqual(exits, [0]);
});

test('server.ts wires SIGTERM and SIGINT to the drain with an 8 second grace', () => {
  const src = readFileSync(join(APP_DIR, 'server.ts'), 'utf8');
  assert.match(src, /createShutdown\(/);
  assert.match(src, /graceMs:\s*8_?000/);
  assert.match(src, /'SIGTERM'/);
  assert.match(src, /'SIGINT'/);
});

test('launchd gives the server longer than the drain before SIGKILL (ExitTimeOut 15)', () => {
  for (const f of ['mac/launchd/com.shin.server.plist', 'mac/launchd-daemons/com.shin.server.plist']) {
    const text = readFileSync(join(REPO, f), 'utf8');
    const m = /<key>ExitTimeOut<\/key>\s*<integer>(\d+)<\/integer>/.exec(text);
    assert.ok(m, `${f} has no ExitTimeOut`);
    assert.ok(Number(m[1]) >= 15, `${f} ExitTimeOut is ${m[1]}, under the 8 s drain plus close time`);
  }
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

test('the real server: a request mid-body when SIGTERM arrives is answered, then the process exits 0',
  { skip: process.platform === 'win32' ? 'Windows turns SIGTERM into an unconditional kill; runs on the Mac' : false },
  async () => {
    const port = await freePort();
    const sandbox = mkdtempSync(join(tmpdir(), 'shin-drain-'));
    mkdirSync(join(sandbox, 'data'), { recursive: true });
    const child = spawn(process.execPath, ['server.ts'], {
      cwd: APP_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        SHIN_SCANS: join(sandbox, 'scans.db'),
        SHIN_REPEAT_CACHE: join(sandbox, 'repeat-cache.db'),
        SHIN_GAPS: join(sandbox, 'gaps.db'),
        SHIN_CORRECTIONS: join(sandbox, 'corrections.db'),
        SHIN_PHOTOS: join(sandbox, 'photos'),
        SHIN_CATALOGUE: join(sandbox, 'no-catalogue.db'),
        SHIN_PRICES: join(sandbox, 'prices.db'),
        SHIN_DATA_DIR: join(sandbox, 'data'),
        SHIN_PEOPLE_DB: join(sandbox, 'data', 'people.db'),
        SHIN_ACCESS_LOG: join(sandbox, 'data', 'access.log'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      await new Promise((resolve, reject) => {
        const fail = setTimeout(() => reject(new Error('the server did not come up in 30 seconds')), 30_000);
        child.stdout.on('data', (d) => { if (String(d).includes('Pexi is running')) { clearTimeout(fail); resolve(); } });
        child.on('exit', (code) => reject(new Error(`exited ${code} before listening`)));
      });
      const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
      const body = JSON.stringify({ deviceId: 'drain-test', clientId: 'drain-test-1' });
      const half = Math.floor(body.length / 2);
      const sock = connect(port, '127.0.0.1');
      let reply = '';
      sock.on('data', (d) => { reply += String(d); });
      await new Promise((r) => sock.on('connect', r));
      sock.write(`POST /api/correction HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body.slice(0, half)}`);
      await sleep(300);
      child.kill('SIGTERM');
      await sleep(500);
      assert.equal(child.exitCode, null, 'the server is still alive: it is waiting for the request in flight');
      sock.write(body.slice(half));
      await new Promise((r) => sock.on('close', r));
      assert.match(reply, /^HTTP\/1\.1 200/, `the request in flight was answered: ${reply.slice(0, 80)}`);
      const { code } = await exited;
      assert.equal(code, 0);
    } finally {
      child.kill('SIGKILL');
      try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* temp */ }
    }
  });
