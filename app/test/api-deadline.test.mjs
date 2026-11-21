/**
 * Ops 12 (2026-11-21 review): calls to Pexi's own server had no deadline, so a slow Mac left a spinner
 * until the phone's own network limit. Now each call ends in fetch's own "no connection" error
 * (a TypeError, the path every screen already handles) once its deadline passes. The deadline is long
 * enough that a slow but working typed search (server p95 about 2 s, its Claude step allowed 30 s)
 * is never cut off. Fake clock: nothing waits for real.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

/** A server that accepts the call and never answers, until the caller's own signal gives up. */
const stalls = [];
function stallingFetch(_url, init = {}) {
  return new Promise((_resolve, reject) => {
    stalls.push(init);
    init.signal?.addEventListener('abort', () => reject(init.signal.reason ?? new DOMException('aborted', 'AbortError')));
  });
}

const api = await import('../public/js/api.js');
const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

async function outcomeAfter(call, ms) {
  let state = 'pending';
  let error = null;
  call().then(() => { state = 'answered'; }, (e) => { state = 'failed'; error = e; });
  await settle();
  mock.timers.tick(ms);
  await settle();
  return { state, error };
}

test('a server that never answers a typed search ends in the no-connection error, and not before 30 s', async () => {
  globalThis.fetch = stallingFetch;
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const early = await outcomeAfter(() => api.search({ text: 'cola' }), 30_000);
    assert.equal(early.state, 'pending', 'a typed search was cut off inside 30 s, while the server may still be working on it');
    const late = await outcomeAfter(() => api.search({ text: 'milk' }), 60_000);
    assert.equal(late.state, 'failed', 'a stalled typed search was still spinning after a minute');
    assert.ok(late.error instanceof TypeError, 'the app treats a TypeError as "no connection"; anything else is a new kind of failure');
  } finally {
    mock.timers.reset();
  }
});

test('a quick call (the quota check at start-up) gives up sooner than a search', async () => {
  globalThis.fetch = stallingFetch;
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = await outcomeAfter(() => api.quota(), 20_000);
    assert.equal(r.state, 'answered', 'quota() has its own null-on-failure path and should have returned');
  } finally {
    mock.timers.reset();
  }
});

test('a call that answers in time is untouched, and its deadline timer is cleared', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) }, json: async () => ({ results: [] }) });
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = await outcomeAfter(() => api.search({ text: 'cola' }), 0);
    assert.equal(r.state, 'answered');
    mock.timers.tick(120_000);
  } finally {
    mock.timers.reset();
  }
});

test('a web page in place of an answer is still the "Pexi is busy" error, not a timeout', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403, headers: { get: (h) => (h === 'content-type' ? 'text/html' : null) }, json: async () => ({}) });
  await assert.rejects(() => api.search({ text: 'cola' }), (e) => e?.busy === true);
});
