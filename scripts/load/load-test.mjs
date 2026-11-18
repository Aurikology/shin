#!/usr/bin/env node
/**
 * R12: how many requests a second does one Pexi server take, and where does it break?
 *
 *   node scripts/load/load-test.mjs --spawn                 # starts a throwaway local server, tests it, stops it
 *   node scripts/load/load-test.mjs --url http://127.0.0.1:4173   # tests a server that is already running
 *
 * Options:
 *   --steps 1,4,16,64,128,256   concurrent users, one step each, in order
 *   --seconds 6                 length of each step
 *   --mix search=5,status=3,health=1,events=1   weights of the request types (see MIX below)
 *   --invite CODE               the x-shin-invite code, when the server has SHIN_INVITE_CODE set
 *   --port 4199                 (--spawn) the port for the throwaway server
 *   --keep                      (--spawn) leave the throwaway data directory behind
 *
 * WHAT IT SENDS. Only routes that cost nothing and cannot spend money: typed-name search, the app
 * status check, health, and a ten-event usage batch from a made-up device. Never an identify or
 * price call (those reach Gemini and are paid), never a purchase route.
 *
 * WHAT "BREAKS" MEANS. A step is broken when any of these is true, and the first broken step is
 * the answer to "where does it break":
 *   - more than 1% of requests failed (a non-2xx answer other than a rate-limit one, a timeout, or a reset),
 *   - the 95th-percentile answer time is over 1500 ms,
 *   - requests a second FELL more than 15% below the best step so far while the 95th percentile is over 250 ms
 *     (the server is saturated and wasting work).
 *
 * THE RATE LIMITER IS NOT A BREAK, BUT IT CAN HIDE ONE. Pexi refuses an address that makes more than
 * 1,200 requests in ten minutes (SHIN_RATE_DOOR_IP_PER_10MIN). Requests from this same machine
 * (127.0.0.1) are exempt, so a local run is not limited; a run over the LAN or a tunnel is. With
 * --spawn the throwaway server is also started with that limit lifted. Against a server you started
 * yourself and reach by a non-local address, a 429 is counted on its own line and the run says it is
 * INCONCLUSIVE past that point: restart the server with SHIN_RATE_DOOR_IP_PER_10MIN=100000000 and
 * SHIN_RATE_DOOR_IP_PER_DAY=100000000 to test beyond it.
 *
 * Fails loudly (exit code and a line on stderr):
 *   2 bad options, 3 the server never answered /api/health, 4 the first step got no good answers.
 *   0 means the test ran; a break it found is the result, printed, not a failure of the script.
 *
 * Numbers depend on the machine and the disk. The first line prints the machine; quote it with them.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus, platform, release } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, '..', '..', 'app');

function fail(code, message) {
  console.error(`load-test: ${message}`);
  process.exit(code);
}

/* ------------------------------------------------------------------ options */
function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const spawnIt = process.argv.includes('--spawn');
const keep = process.argv.includes('--keep');
const port = Number(option('port', 4199));
const seconds = Number(option('seconds', 6));
const invite = typeof option('invite', '') === 'string' ? option('invite', '') : '';
const steps = String(option('steps', '1,4,16,64,128,256')).split(',').map(Number);
const mixSpec = String(option('mix', 'search=5,status=3,health=1,events=1'));
const baseUrl = String(spawnIt ? `http://127.0.0.1:${port}` : option('url', 'http://127.0.0.1:4173')).replace(/\/$/, '');

if (!spawnIt && process.argv.indexOf('--url') < 0) {
  fail(2, 'say what to test: --spawn (a throwaway local server) or --url http://127.0.0.1:4173');
}
if (!Number.isFinite(seconds) || seconds < 1) fail(2, '--seconds must be a number of at least 1');
if (steps.length === 0 || steps.some((n) => !Number.isInteger(n) || n < 1)) fail(2, '--steps must be whole numbers, e.g. 1,4,16');
if (!/^https?:\/\//.test(baseUrl)) fail(2, '--url must start with http:// or https://');

const WEIGHTS = {};
for (const part of mixSpec.split(',')) {
  const [k, v] = part.split('=');
  const n = Number(v);
  if (!['search', 'status', 'health', 'events'].includes(k) || !Number.isFinite(n) || n < 0) {
    fail(2, `--mix item "${part}" is not one of search, status, health, events with a number`);
  }
  WEIGHTS[k] = n;
}
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (TOTAL_WEIGHT <= 0) fail(2, '--mix has no weight');

/* ------------------------------------------------------------------ requests */
const QUERIES = ['milk', 'neilson milk 2 L', 'butter', 'cheddar cheese', 'orange juice', 'tomato sauce', 'bread', 'ground beef', 'kraft dinner', 'yogurt'];
const agent = new http.Agent({ keepAlive: true, maxSockets: 100_000 });
const target = new URL(baseUrl);

function once(kind, user) {
  let path;
  let method = 'GET';
  let body = null;
  if (kind === 'search') path = `/api/search?q=${encodeURIComponent(QUERIES[Math.floor(Math.random() * QUERIES.length)])}&limit=3`;
  else if (kind === 'status') path = '/api/app-status';
  else if (kind === 'health') path = '/api/health';
  else {
    method = 'POST';
    path = '/api/events/batch';
    const events = Array.from({ length: 10 }, (_, i) => ({
      deviceId: user.id, type: 'load_test', payload: { n: i }, createdAt: new Date().toISOString(),
    }));
    body = JSON.stringify({ events });
  }
  const headers = { 'x-shin-device': user.id, 'x-shin-device-key': user.key };
  if (invite) headers['x-shin-invite'] = invite;
  if (body !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(body); }
  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;
    const done = (status, why) => {
      if (settled) return;
      settled = true;
      resolve({ kind, status, ms: performance.now() - started, why });
    };
    const req = http.request(
      { host: target.hostname, port: target.port || 80, path, method, headers, agent },
      (res) => { res.resume(); res.on('end', () => done(res.statusCode ?? 0)); res.on('error', () => done(0, 'reset')); },
    );
    req.setTimeout(10_000, () => { req.destroy(); done(0, 'timeout'); });
    req.on('error', (e) => done(0, e.code ?? 'error'));
    if (body !== null) req.write(body);
    req.end();
  });
}

function pick() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [k, w] of Object.entries(WEIGHTS)) { r -= w; if (r < 0) return k; }
  return 'health';
}

function pct(sorted, p) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function runStep(users) {
  const results = [];
  const stopAt = performance.now() + seconds * 1000;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: users }, async () => {
    const user = { id: randomUUID(), key: randomUUID().replace(/-/g, '') };
    while (performance.now() < stopAt) results.push(await once(pick(), user));
  }));
  const elapsed = (performance.now() - t0) / 1000;
  const ok = results.filter((r) => r.status >= 200 && r.status < 300);
  const limited = results.filter((r) => r.status === 429);
  const bad = results.filter((r) => !(r.status >= 200 && r.status < 300) && r.status !== 429);
  const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
  const byKind = {};
  for (const r of ok) (byKind[r.kind] ??= []).push(r.ms);
  for (const k of Object.keys(byKind)) byKind[k].sort((a, b) => a - b);
  const reasons = {};
  for (const r of bad) { const k = r.status === 0 ? r.why : `HTTP ${r.status}`; reasons[k] = (reasons[k] ?? 0) + 1; }
  return {
    users, total: results.length, ok: ok.length, limited: limited.length, bad: bad.length, reasons,
    rps: ok.length / elapsed, p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), byKind,
  };
}

/* ------------------------------------------------------------------ the server */
let child = null;
let dataDir = null;
const stderrTail = [];

async function waitHealthy(limitMs) {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    if (child && child.exitCode !== null) return false;
    const r = await once('health', { id: 'probe', key: 'probe' });
    if (r.status === 200) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

function stopServer() {
  if (child && child.exitCode === null) child.kill();
  if (dataDir && !keep) { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir */ } }
}
process.on('exit', stopServer);

console.log(`machine: ${platform()} ${release()} ${cpus()[0]?.model ?? '?'} x${cpus().length}, node ${process.version}`);
console.log(`target: ${baseUrl}${spawnIt ? ' (throwaway server, rate limits lifted)' : ''}; mix ${mixSpec}; ${seconds}s per step`);

if (spawnIt) {
  dataDir = mkdtempSync(join(tmpdir(), 'pexi-load-'));
  child = spawn(process.execPath, ['server.ts'], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      SHIN_DATA_DIR: dataDir,
      SHIN_RATE_DOOR_IP_PER_10MIN: '100000000',
      SHIN_RATE_DOOR_IP_PER_DAY: '100000000',
      SHIN_INVITE_CODE: invite,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim()) { stderrTail.push(l); if (stderrTail.length > 8) stderrTail.shift(); } });
}

if (!(await waitHealthy(spawnIt ? 90_000 : 10_000))) {
  fail(3, `the server at ${baseUrl} did not answer /api/health${spawnIt ? ` (last server output: ${stderrTail.join(' | ') || 'none'})` : '; is it running?'}`);
}

/* Say whether search has a catalogue behind it: with none, a search answers "no match" at once and its
   numbers say nothing about real searches. */
async function catalogueUp() {
  return new Promise((resolve) => {
    http.get({ host: target.hostname, port: target.port || 80, path: '/api/health', agent }, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => { try { resolve(JSON.parse(text).catalogueUp === true); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}
const hasCatalogue = await catalogueUp();
if (hasCatalogue !== true && WEIGHTS.search > 0) {
  console.log(`WARNING: this server has ${hasCatalogue === false ? 'NO catalogue loaded' : 'an unreadable health answer'}, so "search" requests are answered as "no match" without a lookup. Search numbers below are a floor, not the real cost. With --spawn, point SHIN_CATALOGUE=<path to catalogue.db> in the environment to test with one.`);
}

/* ------------------------------------------------------------------ the run */
const out = [];

let breakAt = null;
let limitedSomewhere = false;
console.log('\nusers   ok/s    p50ms   p95ms   p99ms   ok      429     failed   verdict');
for (const users of steps) {
  const s = await runStep(users);
  if (out.length === 0 && s.ok === 0) {
    fail(4, `the first step (${users} users) got no good answers: ${JSON.stringify(s.reasons)} and ${s.limited} rate-limited. Check the address and --invite.`);
  }
  const failRate = s.total === 0 ? 1 : s.bad / s.total;
  const why = [];
  if (failRate > 0.01) why.push(`${(failRate * 100).toFixed(1)}% failed ${JSON.stringify(s.reasons)}`);
  if (s.p95 > 1500) why.push(`p95 ${s.p95.toFixed(0)} ms`);
  const best = out.reduce((a, b) => Math.max(a, b.rps), 0);
  if (best > 0 && s.rps < best * 0.85 && s.p95 > 250) why.push(`throughput fell to ${s.rps.toFixed(0)}/s from a peak of ${best.toFixed(0)}/s`);
  if (s.limited > 0) limitedSomewhere = true;
  const verdict = why.length > 0 ? `BROKE: ${why.join('; ')}` : s.limited > 0 ? 'rate limited (inconclusive)' : 'ok';
  const f = (n) => (Number.isFinite(n) ? n.toFixed(0) : 'n/a').padStart(6);
  console.log(`${String(users).padStart(5)} ${s.rps.toFixed(0).padStart(7)} ${f(s.p50)}  ${f(s.p95)}  ${f(s.p99)}  ${String(s.ok).padStart(6)}  ${String(s.limited).padStart(6)}  ${String(s.bad).padStart(7)}   ${verdict}`);
  out.push(s);
  if (why.length > 0 && !breakAt) breakAt = { users, why };
  if (breakAt && !process.argv.includes('--past-break')) break;
}

const peak = out.reduce((a, b) => (b.rps > a.rps ? b : a), out[0]);
console.log(`\npeak: ${peak.rps.toFixed(0)} good requests a second at ${peak.users} users (p95 ${peak.p95.toFixed(0)} ms).`);
const last = out[out.length - 1];
const perKind = Object.entries(last.byKind).map(([k, v]) => `${k} p95 ${pct(v, 95).toFixed(0)} ms`).join(', ');
if (perKind) console.log(`by request type at ${last.users} users: ${perKind}`);
console.log(breakAt ? `breaks at ${breakAt.users} users: ${breakAt.why.join('; ')}` : `did not break up to ${steps[steps.length - 1]} users.`);
if (limitedSomewhere) {
  console.log('NOTE: the server rate-limited this address (HTTP 429), so numbers past that point are not capacity. Restart it with SHIN_RATE_DOOR_IP_PER_10MIN=100000000 SHIN_RATE_DOOR_IP_PER_DAY=100000000, or use --spawn.');
}
if (spawnIt) console.log(`throwaway data: ${keep ? dataDir : 'deleted'}`);
process.exit(0);
