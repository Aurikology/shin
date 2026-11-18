/**
 * R17: Cloudflare (or anything else in front of the server) answers an app call with a web page
 * instead of JSON: a bot-protection challenge, a "this site is down" page, a captive portal. The app
 * cannot solve a challenge and used to show either "Pexi hit a problem on its side" (an HTML 403 read
 * as a status) or a JSON parse failure. It now says "Pexi is busy, try again", and the camera tries
 * once more by itself a little later.
 *
 * What is held here:
 *   - an HTML answer, or a Cloudflare challenge header, on any API call becomes a "busy" error;
 *   - a normal JSON answer, a normal JSON server fault, a 429 and a dead network are NOT busy, so the
 *     other sheets keep their meaning;
 *   - the camera has the sheet, in Pexi's voice, with Try again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

const respond = ({ status = 200, type = 'application/json', body = '{}', headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => ({ 'content-type': type, ...headers })[h.toLowerCase()] ?? null },
  json: async () => JSON.parse(body),
  text: async () => body,
});

const api = await import('../public/js/api.js');
const camera = await import('../public/js/screens/camera.js');
const { say } = await import('../public/js/voice.js');
const { LINES_FR } = await import('../public/js/voice-fr.js');

function withFetch(fn, run) {
  const prior = globalThis.fetch;
  globalThis.fetch = fn;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = prior;
  });
}

test('an HTML page where JSON was expected is a "busy" error, whatever the status', async () => {
  for (const status of [200, 403, 503]) {
    await withFetch(async () => respond({ status, type: 'text/html; charset=UTF-8', body: '<html>Just a moment...</html>' }), async () => {
      await assert.rejects(api.identify({ gtin: '0068100084245' }), (err) => err.busy === true && err.name === 'PexiBusy', `status ${status}`);
    });
  }
});

test('a Cloudflare challenge header is busy even when the content type looks like JSON', async () => {
  await withFetch(async () => respond({ status: 403, headers: { 'cf-mitigated': 'challenge' } }), async () => {
    await assert.rejects(api.identify({ gtin: '0068100084245' }), (err) => err.busy === true);
  });
});

test('every API reader and writer in api.js goes through the busy check', async () => {
  const calls = [
    () => api.search({ text: 'milk' }),
    () => api.scans(),
    () => api.catalogue(),
    () => api.identifyPack({ gtin: '0068100084245', frame: 'AAAA' }),
    () => api.matchText(['milk']),
  ];
  for (const call of calls) {
    await withFetch(async () => respond({ status: 200, type: 'text/html', body: '<html></html>' }), async () => {
      await assert.rejects(Promise.resolve().then(call), (err) => err.busy === true, String(call));
    });
  }
});

test('things that are not an edge page are left alone', async () => {
  await withFetch(async () => respond({ status: 200, body: '{"product":null,"catalogueUp":true}' }), async () => {
    const out = await api.identify({ gtin: '0068100084245' });
    assert.equal(out.catalogueUp, true);
  });
  await withFetch(async () => respond({ status: 500, body: '{"error":"x"}' }), async () => {
    await assert.rejects(api.identify({ gtin: '0068100084245' }), (err) => !err.busy && /returned 500/.test(err.message));
  });
  await withFetch(async () => respond({ status: 429, body: '{"error":"slow down","retryAfterSeconds":30}' }), async () => {
    const out = await api.identify({ gtin: '0068100084245' });
    assert.equal(out.failure, 'rate_limited');
  });
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(api.identify({ gtin: '0068100084245' }), (err) => err instanceof TypeError && !err.busy);
  });
});

test('the camera tells a busy error from a fault and from no signal', () => {
  const busy = Object.assign(new Error('x'), { busy: true });
  assert.equal(camera.isBusy(busy), true);
  assert.equal(camera.isBusy(new Error('/api/identify returned 503')), false);
  assert.equal(camera.isBusy(new TypeError('Failed to fetch')), false);
  assert.equal(camera.isBusy(null), false);
  // A busy error must not also read as a server fault: they get different sheets.
  assert.equal(camera.isServerFault(busy), false);
});

test('the busy sheet says Pexi is busy and offers Try again', () => {
  const html = camera.busySheet();
  assert.match(html, /data-busy/);
  assert.match(html, /data-act="lookup-retry"/);
  assert.match(say('cam_server_fault_busy', {}), /busy/i);
  for (const tone of ['deadpan', 'warm', 'blunt']) {
    assert.ok(typeof LINES_FR.cam_server_fault_busy?.[tone] === 'function', `French ${tone} line is missing`);
  }
});

test('the camera retries a busy answer by itself once, later, and gives up quietly', () => {
  assert.equal(typeof camera.BUSY_RETRY_MS, 'number');
  assert.ok(camera.BUSY_RETRY_MS >= 5000 && camera.BUSY_RETRY_MS <= 30000, 'retry wait should be seconds, not instant and not minutes');
  assert.equal(camera.BUSY_RETRIES, 1);
});
