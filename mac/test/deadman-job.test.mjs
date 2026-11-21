// mac/test/deadman-job.test.mjs
// R02 / R03: the dead-man ping has a job. `sh mac/run-job.sh deadman` (what both launchd templates run every 60 s) sources
// config.env, then runs scripts/deadman-probe.mjs. Driven against a local fake server standing in for the Mac's own /api/health
// and for the outside service; nothing leaves this machine.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAC = join(HERE, '..');
const RUN_JOB = join(MAC, 'run-job.sh');
const root = mkdtempSync(join(tmpdir(), 'shin-deadman-job-'));
after(() => rmSync(root, { recursive: true, force: true }));
const posix = (p) => String(p).replace(/\\/g, '/');

function fakeServer(healthBody) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body });
      if (req.url === '/api/health') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(healthBody));
      } else res.end('OK');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}

function runJob(args, config, extraEnv = {}) {
  const cfg = join(root, `config-${Math.random().toString(16).slice(2)}.env`);
  writeFileSync(cfg, config.join('\n') + '\n');
  return new Promise((resolve) => {
    const p = spawn('sh', [posix(RUN_JOB), ...args], {
      cwd: root,
      env: { ...process.env, SHIN_CONFIG_FILE: posix(cfg), SHIN_HEALTH_DIR: posix(join(root, 'health')), SHIN_HEALTH_MAIL: 'off', WORKER_STATEDIR: posix(join(root, 'state')), ...extraEnv },
    });
    let out = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (out += c));
    p.on('close', (status) => resolve({ status, out }));
  });
}

test('healthy server: one ping to the plain address, exit 0', async () => {
  const f = await fakeServer({ ok: true, watch: { ok: true, problems: [] } });
  try {
    const r = await runJob(['deadman'], [`PORT=${f.port}`, `SHIN_DEADMAN_URL=http://127.0.0.1:${f.port}/ping/abc`]);
    assert.equal(r.status, 0, r.out);
    const ping = f.seen.find((s) => s.url.startsWith('/ping'));
    assert.ok(ping, 'a ping arrived');
    assert.equal(ping.url, '/ping/abc');
    assert.equal(ping.method, 'POST');
  } finally {
    f.server.close();
  }
});

test('a problem in watch goes to the /fail address with the problem text', async () => {
  const f = await fakeServer({ ok: true, watch: { ok: false, problems: [{ code: 'client_crash_spike', why: '25 app crash reports in the last hour' }] } });
  try {
    const r = await runJob(['deadman'], [`PORT=${f.port}`, `SHIN_DEADMAN_URL=http://127.0.0.1:${f.port}/ping/abc`]);
    assert.equal(r.status, 0, r.out);
    const ping = f.seen.find((s) => s.url.startsWith('/ping'));
    assert.equal(ping.url, '/ping/abc/fail');
    assert.match(ping.body, /client_crash_spike/);
  } finally {
    f.server.close();
  }
});

test('no SHIN_DEADMAN_URL: exits non-zero and says so, and writes no health marker that would never clear', async () => {
  const r = await runJob(['deadman'], ['PORT=1']);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /SHIN_DEADMAN_URL is not set/);
  assert.equal(existsSync(join(root, 'health')) ? readdirSync(join(root, 'health')).filter((n) => n.startsWith('deadman')).length : 0, 0);
});

test('a missing config.env leaves no health marker for the dead-man job, only a non-zero exit', async () => {
  const r = await new Promise((resolve) => {
    const p = spawn('sh', [posix(RUN_JOB), 'deadman'], { cwd: root, env: { ...process.env, SHIN_CONFIG_FILE: posix(join(root, 'nope.env')), SHIN_HEALTH_DIR: posix(join(root, 'health2')) } });
    let out = '';
    p.stderr.on('data', (c) => (out += c));
    p.on('close', (status) => resolve({ status, out }));
  });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /does not exist/);
  assert.equal(existsSync(join(root, 'health2')), false);
});

test('both launchd templates run the dead-man job every 60 seconds through run-job.sh', () => {
  for (const dir of ['launchd', 'launchd-daemons']) {
    const xml = readFileSync(join(MAC, dir, 'com.shin.deadman.plist'), 'utf8');
    assert.match(xml, /<key>Label<\/key>\s*<string>com\.shin\.deadman<\/string>/, dir);
    assert.match(xml, /<string>__SHIN_REPO_DIR__\/mac\/run-job\.sh<\/string>\s*<string>deadman<\/string>/, dir);
    assert.match(xml, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/, dir);
  }
});
