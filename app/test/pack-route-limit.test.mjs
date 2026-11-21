/**
 * The pack route had no limit of its own: one script on one address could pull the pack all day
 * (blind 8). A tunnel address now gets a few pulls per ten minutes and per day on BOTH pack
 * addresses together; a request this machine makes to itself is not counted. Cloudflare answering
 * from its own copy never reaches the server, so honest phones do not use this up.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './security-harness.mjs';

const h = await boot({ products: 1 });
after(() => h.close());
const tun = (ip) => ({ 'cf-connecting-ip': ip });

test('one address that keeps pulling the pack, on either address of it, is slowed with a Retry-After', async () => {
  h.mod.resetPaidCallLimitersForTests(process.env);
  let firstRefused = -1;
  let retryAfter = null;
  for (let i = 0; i < 200; i += 1) {
    const path = i % 2 === 0 ? '/api/pack?scope=canada' : '/api/pack/canada-1-2.bin';
    const r = await h.get(path, tun('203.0.113.7'));
    await r.arrayBuffer();
    if (r.status === 429) {
      firstRefused = i;
      retryAfter = r.headers.get('retry-after');
      break;
    }
  }
  assert.ok(firstRefused >= 0 && firstRefused <= 40, `the pack was pulled ${firstRefused < 0 ? '200 or more' : firstRefused} times from one address before a 429`);
  assert.ok(Number(retryAfter) >= 1, 'the refusal carried no Retry-After');
});

test('another address is not affected, and the machine itself is never counted', async () => {
  h.mod.resetPaidCallLimitersForTests(process.env);
  for (let i = 0; i < 60; i += 1) {
    const r = await h.get('/api/pack?scope=canada', tun('203.0.113.7'));
    await r.arrayBuffer();
  }
  const other = await h.get('/api/pack?scope=canada', tun('203.0.113.99'));
  assert.notEqual(other.status, 429);
  await other.arrayBuffer();
  for (let i = 0; i < 60; i += 1) {
    const r = await h.get('/api/pack?scope=canada');
    assert.notEqual(r.status, 429, `a local request was refused on try ${i}`);
    await r.arrayBuffer();
  }
});
