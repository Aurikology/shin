import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePing, runDeadman } from '../deadman-probe.mjs';

// The dead-man switch (readiness R02): the Mac pings an outside service once a minute while the
// server on it is healthy. If the Mac, its power, its internet or the server dies, the pings stop
// and the service emails. A watch problem pings the service's /fail address, so that is emailed too.
const URL = 'https://hc-ping.com/abc-123';

test('a healthy local server pings the success address', () => {
  const d = decidePing({ ok: true, watch: { ok: true, problems: [] } }, null, URL);
  assert.equal(d.url, URL);
  assert.equal(d.failed, false);
});

test('a watch problem pings /fail and carries the problem text', () => {
  const d = decidePing({ ok: true, watch: { ok: false, problems: [{ code: 'disk_low', why: '4.0 GB free' }] } }, null, URL);
  assert.equal(d.url, `${URL}/fail`);
  assert.equal(d.failed, true);
  assert.match(d.body, /disk_low/);
});

test('a server that does not answer pings /fail, never the success address', () => {
  const d = decidePing(null, 'connect ECONNREFUSED 127.0.0.1:4173', URL);
  assert.equal(d.url, `${URL}/fail`);
  assert.match(d.body, /ECONNREFUSED/);
});

test('a build with no watch field is a failure, not a pass', () => {
  assert.equal(decidePing({ ok: true }, null, URL).failed, true);
});

test('a trailing slash on the ping address does not double up', () => {
  assert.equal(decidePing(null, 'x', `${URL}/`).url, `${URL}/fail`);
});

test('runDeadman reads local health, sends exactly one ping, and exits 0 when it was sent', async () => {
  const sent = [];
  const r = await runDeadman({
    pingUrl: URL,
    base: 'http://127.0.0.1:4173',
    fetchFn: async (u, init) => {
      if (String(u).endsWith('/api/health')) return { status: 200, json: async () => ({ ok: true, watch: { ok: true, problems: [] } }) };
      sent.push([String(u), init?.method ?? 'GET']);
      return { status: 200, text: async () => 'OK' };
    },
  });
  assert.equal(r.code, 0);
  assert.deepEqual(sent, [[URL, 'POST']]);
});

test('runDeadman exits non-zero when no ping address is set, and when the ping itself cannot be sent', async () => {
  const none = await runDeadman({ pingUrl: '', base: 'http://127.0.0.1:4173', fetchFn: async () => ({ status: 200, json: async () => ({}) }) });
  assert.notEqual(none.code, 0);
  assert.match(none.message, /SHIN_DEADMAN_URL/);
  const dead = await runDeadman({
    pingUrl: URL,
    base: 'http://127.0.0.1:4173',
    fetchFn: async (u) => {
      if (String(u).endsWith('/api/health')) return { status: 200, json: async () => ({ ok: true, watch: { ok: true, problems: [] } }) };
      throw new Error('getaddrinfo ENOTFOUND hc-ping.com');
    },
  });
  assert.notEqual(dead.code, 0);
  assert.match(dead.message, /ENOTFOUND/);
});
