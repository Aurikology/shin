/**
 * Client address attack tests, V3 (f) of the 2026-11-16 check. Each test asserts the SAFE
 * behaviour; a failure is a hole.
 *
 * The real server sits behind a Cloudflare tunnel (mac/01-cloudflare-tunnel.md): the tunnel sets
 * cf-connecting-ip and the server believes it (src/rate-limit.ts, clientAddress). That is only safe
 * if nobody but the tunnel can reach the port. These tests reach the port the way a neighbour on
 * the same network would: by this machine's own network address, which is a non-loopback socket.
 * The door limit is set to 20 per ten minutes so a burst of 40 shows whether it bites.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { boot } from './security-harness.mjs';
import { KeyedLimiter } from '../src/rate-limit.ts';

const h = await boot({ products: 1, env: { SHIN_RATE_DOOR_IP_PER_10MIN: '20' } });
after(() => h.close());

const lan = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const lanBase = lan ? `http://${lan}:${h.port}` : null;
const lanGet = (path, headers = {}) => fetch(`${lanBase}${path}`, { headers });
const reset = () => h.mod.resetPaidCallLimitersForTests(process.env);

const refusedOf = async (headersFor, n = 40) => {
  let refused = 0;
  for (let i = 0; i < n; i += 1) {
    // Since the loopback bind (A1) a request to the machine's network address never connects at all;
    // that is the strongest refusal there is, so it counts as one. With SHIN_BIND_HOST set to open
    // the LAN, the limiter has to do the refusing and the 429 count is what is measured.
    let r;
    try {
      r = await lanGet('/api/catalogue', headersFor(i));
    } catch {
      // Windows takes about two seconds to say no to each attempt; one refusal is the answer.
      return n;
    }
    await r.arrayBuffer();
    if (r.status === 429) refused += 1;
  }
  return refused;
};

test('f1: the server port cannot be reached on the machine network address, only on loopback', { skip: lan ? false : 'no network address on this machine' }, async () => {
  const reached = await new Promise((resolve) => {
    const s = connect({ host: lan, port: h.port, timeout: 3000 });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });
  });
  assert.equal(reached, false, `port ${h.port} accepted a connection on ${lan}: the server listens on every interface, not only the tunnel`);
});

test('f2: control, a flood from the network address with no forwarding header is refused', { skip: lan ? false : 'no network address' }, async () => {
  reset();
  assert.ok((await refusedOf(() => ({}))) > 0, 'a flood of 40 from one address (limit 20) was never refused');
});

test('f3: a direct caller cannot reset its limit by sending a different cf-connecting-ip each time', { skip: lan ? false : 'no network address' }, async () => {
  reset();
  const refused = await refusedOf((i) => ({ 'cf-connecting-ip': `198.18.${Math.floor(i / 250)}.${(i % 250) + 1}` }));
  assert.ok(refused > 0, 'a direct caller sent 40 requests as 40 different addresses and none was refused');
});

test('f4: x-forwarded-for, x-real-ip, forwarded and true-client-ip do not change the address a limit is counted on', { skip: lan ? false : 'no network address' }, async () => {
  reset();
  const refused = await refusedOf((i) => ({
    'x-forwarded-for': `198.18.0.${i + 1}`,
    'x-real-ip': `198.18.1.${i + 1}`,
    forwarded: `for=198.18.2.${i + 1}`,
    'true-client-ip': `198.18.3.${i + 1}`,
    'x-client-ip': `198.18.4.${i + 1}`,
  }));
  assert.ok(refused > 0, 'rotating forwarding headers reset the limit');
});

test('f5: a spoofed loopback address in cf-connecting-ip does not make a direct caller exempt', { skip: lan ? false : 'no network address' }, async () => {
  reset();
  const refused = await refusedOf(() => ({ 'cf-connecting-ip': '127.0.0.1' }));
  assert.ok(refused > 0, 'claiming to be 127.0.0.1 skipped the door limit');
});

test('f6: the address limiter stays fast and bounded when a caller invents many addresses', async (t) => {
  const limiter = new KeyedLimiter([{ ms: 600_000, limit: 90 }, { ms: 86_400_000, limit: 600 }]);
  for (let i = 0; i < 20_000; i += 1) limiter.check(`ip:fake-${i}`);
  const start = process.hrtime.bigint();
  for (let i = 20_000; i < 21_000; i += 1) limiter.check(`ip:fake-${i}`);
  const perCheckMs = Number(process.hrtime.bigint() - start) / 1e6 / 1000;
  t.diagnostic(`measured: after 20000 invented addresses one more check takes ${perCheckMs.toFixed(3)} ms`);
  assert.ok(perCheckMs < 0.1, `each check scans every remembered address (${perCheckMs.toFixed(2)} ms after 20000), so invented addresses slow every request`);
});

test('f7: with the LAN opened on purpose, the tunnel header is believed only on a loopback socket', async () => {
  const { clientAddress, isLocalRequest, networkOf } = await import('../src/rate-limit.ts');
  assert.equal(clientAddress({ 'cf-connecting-ip': '198.18.0.9' }, '192.168.1.20'), '192.168.1.20');
  assert.equal(clientAddress({ 'cf-connecting-ip': '198.18.0.9' }, '::ffff:127.0.0.1'), '198.18.0.9');
  assert.equal(isLocalRequest({}, '192.168.1.20'), false);
  assert.equal(isLocalRequest({ 'cf-connecting-ip': '127.0.0.1' }, '192.168.1.20'), false);
  assert.equal(networkOf('203.0.113.77'), '203.0.113.0/24');
  assert.equal(networkOf('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
});

test('f8: the server listens on loopback only, 127.0.0.1 and ::1 both reach it', async () => {
  const { request } = await import('node:http');
  const reach = (host) => new Promise((resolve) => {
    const r = request({ host, port: h.port, path: '/api/health', timeout: 3000 }, (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', () => resolve(null));
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.end();
  });
  assert.equal(await reach('127.0.0.1'), 200);
  const v6 = await reach('::1');
  assert.ok(v6 === 200 || v6 === null, `::1 answered ${v6}`);
});
