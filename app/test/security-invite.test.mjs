/**
 * Invite code attack tests, V3 (g) of the 2026-11-16 check (app/src/invite.ts). Each test asserts
 * the SAFE behaviour; a failure is a hole. Default limits are in force (door 1200 per ten minutes
 * per address), and requests carry cf-connecting-ip as the tunnel sends it.
 *
 * The gate is a single shared secret in the x-shin-invite header, compared in constant time. The
 * questions are how many wrong guesses one address gets, whether a forged address header gets more,
 * and whether any other place takes the code.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './security-harness.mjs';

const CODE = 'sekrit-invite-9d41c7e2';
const h = await boot({ products: 1, env: { SHIN_INVITE_CODE: CODE } });
after(() => h.close());

const tun = (ip, extra = {}) => ({ 'cf-connecting-ip': ip, ...extra });
const reset = () => h.mod.resetPaidCallLimitersForTests(process.env);

test('g0: control, the right code opens a route and no code or a wrong code is a 401', async () => {
  assert.equal((await h.get('/api/catalogue', tun('198.51.100.1', { 'x-shin-invite': CODE }))).status, 200);
  assert.equal((await h.get('/api/catalogue', tun('198.51.100.1'))).status, 401);
  assert.equal((await h.get('/api/catalogue', tun('198.51.100.1', { 'x-shin-invite': 'wrong' }))).status, 401);
  assert.equal((await h.get('/api/catalogue', tun('198.51.100.1', { 'x-shin-invite': '' }))).status, 401);
});

test('g1: the code is accepted only in the x-shin-invite header, not in the URL, a cookie, the body or another header', async () => {
  for (const [path, headers] of [
    [`/api/catalogue?invite=${CODE}`, {}],
    [`/api/catalogue?code=${CODE}&x-shin-invite=${CODE}`, {}],
    ['/api/catalogue', { cookie: `x-shin-invite=${CODE}; invite=${CODE}` }],
    ['/api/catalogue', { authorization: `Bearer ${CODE}` }],
    ['/api/catalogue', { 'x-invite': CODE }],
    ['/api/catalogue', { 'x-shin-invite-code': CODE }],
  ]) {
    const r = await h.get(path, tun('198.51.100.2', headers));
    assert.equal(r.status, 401, `${path} with ${JSON.stringify(Object.keys(headers))} answered ${r.status}`);
  }
  const post = await h.post('/api/price', { invite: CODE, text: 'x' }, tun('198.51.100.2'));
  assert.equal(post.status, 401);
});

test('g2: near-miss codes are refused (prefix, suffix, case, padded)', async () => {
  for (const v of [CODE.slice(0, -1), `${CODE}x`, CODE.toUpperCase(), `${CODE}${CODE}`, 'null', 'undefined']) {
    const r = await h.get('/api/catalogue', tun('198.51.100.3', { 'x-shin-invite': v }));
    assert.equal(r.status, 401, `${v} answered ${r.status}`);
  }
});

test('g3: every route except the health check is behind the gate, GET and POST', async () => {
  const gets = ['/api/catalogue', '/api/categories', '/api/scenarios', '/api/search?q=cola', '/api/stores?lat=43.6&lon=-79.4', '/api/store-chains', '/api/latency', '/api/attribution', '/api/pack-version', '/api/pack', '/api/quota?deviceId=device-gate-0001', '/api/scans?deviceId=device-gate-0001', '/api/consent?deviceId=device-gate-0001', '/api/admin/tables', '/api/identify?text=cola', '/api/identify/demo', '/api/not-a-route'];
  const posts = ['/api/identify', '/api/identify/pack', '/api/identify/photo', '/api/match-text', '/api/price', '/api/correction', '/api/scan-rating', '/api/scan-rating/delete', '/api/consent', '/api/event', '/api/events/batch', '/api/scan-price', '/api/scan-call', '/api/scan-pick', '/api/scan/1/outcome', '/api/shelf/frame', '/api/shutter/frame', '/api/identify/demo'];
  const open = [];
  for (const p of gets) {
    const r = await h.get(p, tun('198.51.100.4'));
    // With no admin token set the admin routes answer 404, which is as closed as 401.
    if (r.status !== 401 && !(p.startsWith('/api/admin/') && r.status === 404)) open.push(`GET ${p} -> ${r.status}`);
  }
  for (const p of posts) {
    const r = await h.post(p, {}, tun('198.51.100.4'));
    if (r.status !== 401) open.push(`POST ${p} -> ${r.status}`);
  }
  assert.deepEqual(open, [], 'routes answered without the invite code');
});

test('g4: one address gets only a handful of wrong guesses before it is slowed', async (t) => {
  reset();
  let firstRefused = -1;
  for (let i = 0; i < 1300; i += 1) {
    const r = await h.get('/api/catalogue', tun('198.51.100.5', { 'x-shin-invite': `guess-${i}` }));
    await r.arrayBuffer();
    if (r.status === 429) {
      firstRefused = i;
      break;
    }
  }
  t.diagnostic(`measured: wrong invite guesses allowed from one address before the first 429: ${firstRefused}`);
  assert.ok(firstRefused >= 0 && firstRefused <= 30, `one address made ${firstRefused < 0 ? '1300 or more' : firstRefused} wrong guesses before being slowed`);
});

test('g5: guesses from many claimed addresses are limited as a whole, not one per address', async (t) => {
  reset();
  let answered = 0;
  for (let i = 0; i < 400; i += 1) {
    const r = await h.get('/api/catalogue', tun(`203.0.${Math.floor(i / 250)}.${(i % 250) + 1}`, { 'x-shin-invite': `guess-${i}-b` }));
    await r.arrayBuffer();
    if (r.status === 401) answered += 1;
  }
  t.diagnostic(`measured: wrong guesses answered over 400 claimed addresses: ${answered} of 400`);
  assert.ok(answered <= 100, `${answered} of 400 wrong guesses from rotating addresses were all answered as ordinary 401s`);
});

test('g6: the health check is the only open route, and it carries no invite-protected data', async () => {
  const r = await h.get('/api/health', tun('198.51.100.6'));
  assert.equal(r.status, 200);
  const text = JSON.stringify(await r.json());
  assert.ok(!text.includes(CODE));
  assert.ok(!/[A-Za-z]:\\|\/Users\/|\/home\//.test(text), `the health page shows a file path on the server: ${text.match(/.{0,40}([A-Za-z]:\\\\|\/Users\/|\/home\/).{0,40}/)?.[0]}`);
});
