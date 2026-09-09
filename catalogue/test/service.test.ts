/**
 * The worker service's timeout, pinned by source.
 *
 * Three comment blocks in app/server.ts described a five-second ceiling on the
 * catalogue worker, and one described why /api/alternatives is exempt from it.
 * `send` had no timer: a worker that stopped answering left the request
 * awaiting forever. A hang cannot be fabricated in a test without a worker
 * built to hang, so this asserts the guard's presence and shape, and the row in
 * DEFECTS.md says the behaviour was verified by reading.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SEARCH_TIMEOUT_MS } from '../src/service.ts';

const src = readFileSync(new URL('../src/service.ts', import.meta.url), 'utf8');
const send = src.slice(src.indexOf('function send<T>'), src.indexOf('worker.postMessage({ id, job });'));

test('the timeout is the five seconds the comments promised', () => {
  assert.equal(SEARCH_TIMEOUT_MS, 5000);
});

test('every send arms a timer that rejects and drops the pending entry', () => {
  assert.match(send, /setTimeout\(\(\) => \{/);
  assert.match(send, /pending\.delete\(id\);/);
  assert.match(send, /reject\(new Error\(`catalogue worker did not answer/);
  assert.match(send, /\}, SEARCH_TIMEOUT_MS\);/);
});

test('the timer is cleared on settle in both directions, so a fast answer costs nothing', () => {
  assert.match(send, /resolve: \(v: unknown\) => \{ clearTimeout\(timer\);/);
  assert.match(send, /reject: \(e: Error\) => \{ clearTimeout\(timer\);/);
});

test('the timer does not hold the process open', () => {
  assert.match(send, /timer\.unref\(\);/);
});
