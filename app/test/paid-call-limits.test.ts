/**
 * Limits on the calls that cost money: per invite code and per network address (`src/rate-limit.ts`,
 * which the Claude range ask and pack read still sit behind), and what the daily dollar cap charges
 * for one grounded scan. Each test is written to fail if the behaviour it names is removed.
 *
 *   - the limiter refuses the N+1th call and does not count a refused call
 *   - keys are independent, and the daily window binds when the short one does not
 *   - the client address is the tunnel header when there is one
 *   - the cap charges the search fee, not just the tokens
 *
 * The route-level cases (a code over its ceiling gets a 429, no model call, no charge) went with the
 * Gemini scan they were written against (RULINGS.md, "Pexi uses Gemini for nothing").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyedLimiter, clientAddress } from '../src/rate-limit.ts';
import { groundedScanCapChargeUsdCents } from '../src/model-cost.ts';
import { usdCentsToCad } from '../../identify/src/cap.ts';

test('limiter: the N+1th call inside the window is refused, and a refused call is not counted', () => {
  const l = new KeyedLimiter([{ ms: 1000, limit: 2 }]);
  assert.equal(l.check('k', 0).allowed, true);
  assert.equal(l.check('k', 100).allowed, true);
  const refused = l.check('k', 200);
  assert.equal(refused.allowed, false);
  assert.equal(refused.retryAfterSeconds, 1);
  // Hammering while refused must not push the release time out: at t=1000 the first call has left.
  for (let t = 300; t < 1000; t += 100) assert.equal(l.check('k', t).allowed, false);
  assert.equal(l.check('k', 1000).allowed, true, 'refused calls were counted against the caller');
});

test('limiter: keys are independent, and the daily window binds when the short one does not', () => {
  const l = new KeyedLimiter([
    { ms: 1000, limit: 100 },
    { ms: 10_000, limit: 3 },
  ]);
  assert.equal(l.check('a', 0).allowed, true);
  assert.equal(l.check('a', 2000).allowed, true);
  assert.equal(l.check('a', 4000).allowed, true);
  assert.equal(l.check('a', 6000).allowed, false, 'the long window did not bind');
  assert.equal(l.check('b', 6000).allowed, true, 'one key spent another key`s allowance');
  assert.equal(l.check('a', 10_001).allowed, true, 'the long window never released');
});

test('clientAddress: the tunnel header wins, and with none it is the socket address', () => {
  assert.equal(clientAddress({ 'cf-connecting-ip': '203.0.113.9' }, '127.0.0.1'), '203.0.113.9');
  assert.equal(clientAddress({}, '127.0.0.1'), '127.0.0.1');
  assert.equal(clientAddress({ 'cf-connecting-ip': '   ' }, '127.0.0.1'), '127.0.0.1');
  assert.equal(clientAddress({}, undefined), 'unknown');
});

test('the cap charges the search fee: about 5.82 US cents a scan, not the old 0.68', () => {
  const cents = groundedScanCapChargeUsdCents();
  assert.ok(Math.abs(cents - 5.8238) < 1e-9, `charged ${cents}`);
  assert.ok(cents > 0.68 * 8, 'the charge is not eight times the old flat figure');
  assert.ok(Math.abs(usdCentsToCad(100) - 1.35) < 1e-9);
});
