/**
 * R09: the app reports its own uncaught errors to Pexi's server, with the build number and with no
 * device id, at most a handful per session and never the same one twice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const { startCrashReports, MAX_REPORTS } = await import('../public/js/crash-report.js');
const { APP_VERSION } = await import('../public/js/version.js');
const api = await import('../public/js/api.js');

function harness() {
  const handlers = {};
  const target = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  const sent = [];
  startCrashReports({ target, send: (r) => { sent.push(r); return Promise.resolve(true); } });
  return { handlers, sent };
}

test('an uncaught error is reported with the build, the message, and where it happened', () => {
  const { handlers, sent } = harness();
  handlers.error({ message: 'x is not a function', filename: 'https://pexi.example/js/screens/camera.js?v=3', lineno: 4812, colno: 9, error: new Error('x is not a function') });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].build, APP_VERSION);
  assert.equal(sent[0].kind, 'error');
  assert.equal(sent[0].message, 'x is not a function');
  assert.equal(sent[0].line, 4812);
  assert.equal(sent[0].col, 9);
  assert.ok(sent[0].stack.includes('x is not a function'));
});

test('the report carries no device id, key, or anything else that names the person', () => {
  const { handlers, sent } = harness();
  handlers.error({ message: 'boom', filename: 'a.js', lineno: 1, colno: 1 });
  assert.deepEqual(Object.keys(sent[0]).sort(), ['build', 'col', 'kind', 'line', 'message', 'source', 'stack']);
});

test('an unhandled promise rejection is reported, as an Error or as plain text', () => {
  const { handlers, sent } = harness();
  handlers.unhandledrejection({ reason: new Error('nope') });
  handlers.unhandledrejection({ reason: 'plain words' });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].kind, 'unhandledrejection');
  assert.equal(sent[0].message, 'nope');
  assert.equal(sent[1].message, 'plain words');
});

test('the same error twice is sent once, and a session sends at most MAX_REPORTS', () => {
  const { handlers, sent } = harness();
  for (let i = 0; i < 3; i += 1) handlers.error({ message: 'same', filename: 'a.js', lineno: 7, colno: 1 });
  assert.equal(sent.length, 1);
  for (let i = 0; i < 40; i += 1) handlers.error({ message: 'different ' + i, filename: 'a.js', lineno: i, colno: 1 });
  assert.equal(sent.length, MAX_REPORTS);
});

test('a browser notice that is not a fault (ResizeObserver loop) is not reported', () => {
  const { handlers, sent } = harness();
  handlers.error({ message: 'ResizeObserver loop completed with undelivered notifications.', filename: '', lineno: 0, colno: 0 });
  assert.equal(sent.length, 0);
});

test('a sender that fails or throws never breaks the page', () => {
  const handlers = {};
  startCrashReports({
    target: { addEventListener: (t, fn) => { handlers[t] = fn; } },
    send: () => { throw new Error('network layer exploded'); },
  });
  assert.doesNotThrow(() => handlers.error({ message: 'boom', filename: 'a.js', lineno: 1, colno: 1 }));
});

test('the real sender posts to /api/client-error with the invite only: no device headers', async () => {
  const prior = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return { ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) }, json: async () => ({ ok: true }) };
  };
  try {
    assert.equal(await api.postClientError({ build: APP_VERSION, kind: 'error', message: 'm', source: '', line: 0, col: 0, stack: '' }), true);
  } finally {
    globalThis.fetch = prior;
  }
  assert.match(seen.url, /\/api\/client-error$/);
  assert.equal(seen.init.method, 'POST');
  const names = Object.keys(seen.init.headers).map((h) => h.toLowerCase());
  assert.ok(!names.includes('x-shin-device'), 'a device id header went with the crash report');
  assert.ok(!names.includes('x-shin-device-key'), 'a device key header went with the crash report');
});

test('a web page answered instead of the server: the report is dropped, not thrown', async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'text/html' : null) }, text: async () => '<html></html>' });
  try {
    assert.equal(await api.postClientError({ build: APP_VERSION, message: 'm' }), false);
  } finally {
    globalThis.fetch = prior;
  }
});
