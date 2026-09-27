/**
 * Pick one of 3 (public/js/text-match.js): lines read off a pack go to
 * `POST /api/match-text`, and up to three catalogue candidates come back as
 * rows the shopper taps.
 *
 * What this file holds shut:
 *   - at most one request in flight, and never two sent closer than 1.5 s;
 *   - lines unchanged since the last send are not sent again;
 *   - a 404 (the server setting is off) turns the feature off for the session,
 *     with no message and no second request;
 *   - a tapped candidate hands its barcode to the camera, which runs the
 *     ordinary barcode scan with it;
 *   - zero candidates offers the one type-the-name action, the camera's own
 *     Manual Search, and never a second typed-search flow;
 *   - with no native reader and no `?textmatch=dev`, nothing mounts at all.
 *
 * NOT VERIFIED HERE: a real text reader (none exists yet), and layout.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createTextMatcher, mountTextMatch, pickReader, devReader, textMatchHtml, cleanLines, candidateLabel,
  resetTextMatchSession, textMatchOff, NO_READER, MIN_INTERVAL_MS, MAX_CANDIDATES, nativeTextReader,
} from '../public/js/text-match.js';
import { t } from '../public/js/ui-strings.js';
import { escapeHtml } from '../public/js/lib/dom.js';
import { makeDocument, click } from './mini-dom.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

beforeEach(() => resetTextMatchSession());

/** A clock and timers the test moves by hand. */
function fakeTime() {
  let now = 0;
  const timers = new Map();
  let id = 0;
  return {
    now: () => now,
    setTimer: (fn, ms) => { id += 1; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer: (i) => { timers.delete(i); },
    /** Move the clock and fire whatever is due, in order. */
    advance(ms) {
      now += ms;
      for (const [i, tm] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (tm.at <= now) { timers.delete(i); tm.fn(); }
      }
    },
    pending: () => timers.size,
  };
}

/** A send whose answers the test releases one at a time. */
function heldSend() {
  const calls = [];
  const send = (lines) => new Promise((resolve) => { calls.push({ lines, resolve }); });
  return { calls, send };
}

function fakeReader() {
  const r = { kind: 'native', started: 0, stopped: 0, emit: null };
  r.start = (fn) => { r.started += 1; r.emit = fn; };
  r.stop = () => { r.stopped += 1; };
  return r;
}

const flush = () => new Promise((r) => setImmediate(r));

const ANSWER = (candidates) => ({ kind: 'text_match', catalogueUp: true, candidates, shelfPrice: null, ms: 4 });
const C = (barcode, name, brand = null, size = null) => ({ barcode, productId: `p-${barcode}`, name, brand, size, score: 0.9 });

/* ============================================================ throttling == */

test('at most one request in flight, and none sooner than 1.5 s after the last', async () => {
  const time = fakeTime();
  const { calls, send } = heldSend();
  const reader = fakeReader();
  const results = [];
  const m = createTextMatcher({ reader, send, onResult: (c) => results.push(c), ...time });
  assert.equal(m.start(), true);

  reader.emit(['KRAFT', 'PEANUT BUTTER']);
  assert.equal(calls.length, 1, 'the first read was not sent');
  reader.emit(['KRAFT', 'PEANUT BUTTER', 'CRUNCHY']);
  reader.emit(['KRAFT', 'PEANUT BUTTER', 'CRUNCHY', '1 KG']);
  assert.equal(calls.length, 1, 'a second request went out while the first was in flight');

  time.advance(200);
  calls[0].resolve(ANSWER([C('1', 'Peanut Butter', 'Kraft')]));
  await flush();
  assert.equal(results.length, 1);
  assert.equal(calls.length, 1, 'the next request went out 200 ms after the last, inside the 1.5 s floor');

  time.advance(MIN_INTERVAL_MS - 201);
  assert.equal(calls.length, 1, 'sent a millisecond early');
  time.advance(1);
  assert.equal(calls.length, 2, 'the newest read was never sent once the floor passed');
  // Only the NEWEST read went; the one in between was superseded, not queued.
  assert.deepEqual(calls[1].lines, ['KRAFT', 'PEANUT BUTTER', 'CRUNCHY', '1 KG']);
});

test('lines unchanged since the last send are not sent again, whitespace included', async () => {
  const time = fakeTime();
  const { calls, send } = heldSend();
  const reader = fakeReader();
  const m = createTextMatcher({ reader, send, onResult: () => {}, ...time });
  m.start();
  reader.emit(['Kraft', 'Peanut Butter']);
  calls[0].resolve(ANSWER([]));
  await flush();
  time.advance(5000);
  reader.emit(['Kraft', 'Peanut Butter']);
  reader.emit(['  Kraft ', '', 'Peanut   Butter']);
  assert.equal(calls.length, 1, 'the same lines were sent twice');
  reader.emit(['Kraft', 'Peanut Butter', 'Smooth']);
  assert.equal(calls.length, 2, 'new lines were not sent');
  // Nothing to read is nothing to send.
  calls[1].resolve(ANSWER([]));
  await flush();
  time.advance(5000);
  reader.emit(['', '   ']);
  assert.equal(calls.length, 2);
});

test('a failed or throttled request lets the same lines through again later', async () => {
  const time = fakeTime();
  let n = 0;
  const sent = [];
  const send = async (lines) => { sent.push(lines); n += 1; if (n === 1) throw new Error('offline'); if (n === 2) return { rateLimited: true }; return ANSWER([]); };
  const reader = fakeReader();
  const m = createTextMatcher({ reader, send, onResult: () => {}, ...time });
  m.start();
  reader.emit(['Kraft']);
  await m.settled(); await flush();
  time.advance(MIN_INTERVAL_MS);
  reader.emit(['Kraft']);
  await m.settled(); await flush();
  time.advance(MIN_INTERVAL_MS);
  reader.emit(['Kraft']);
  await m.settled(); await flush();
  assert.equal(sent.length, 3);
  time.advance(MIN_INTERVAL_MS);
  reader.emit(['Kraft']);
  assert.equal(sent.length, 3, 'after a real answer the same lines are skipped again');
});

test('while a sheet is up nothing is sent, and a waiting read is dropped', async () => {
  const time = fakeTime();
  const { calls, send } = heldSend();
  const reader = fakeReader();
  const m = createTextMatcher({ reader, send, onResult: () => {}, ...time });
  m.start();
  m.setActive(false);
  reader.emit(['Kraft']);
  assert.equal(calls.length, 0);
  m.setActive(true);
  reader.emit(['Kraft']);
  assert.equal(calls.length, 1);
});

/* ================================================================== 404 == */

test('a 404 turns the feature off for the session, silently, and stops the reader', async () => {
  const time = fakeTime();
  const sent = [];
  const send = async (lines) => { sent.push(lines); return { disabled: true }; };
  const reader = fakeReader();
  const results = [];
  const m = createTextMatcher({ reader, send, onResult: (c) => results.push(c), ...time });
  m.start();
  reader.emit(['Kraft']);
  await m.settled(); await flush();
  assert.equal(textMatchOff(), true);
  assert.equal(reader.stopped, 1, 'the reader kept running after the route said it does not exist');
  assert.deepEqual(results, [], 'a 404 painted something');
  time.advance(10_000);
  reader.emit(['Something else']);
  assert.equal(sent.length, 1, 'asked again after a 404');
  // The session: a second camera mount in the same page load does not ask either.
  const again = createTextMatcher({ reader: fakeReader(), send, onResult: () => {}, ...time });
  assert.equal(again.start(), false);
  assert.equal(mountTextMatch({ host: makeDocument().createElement('div'), send, onPick: () => {}, native: fakeReader() }), null);
});

test('api.js matchText reads a 404 as "off", a 429 as "throttled", and sends the lines', async () => {
  const src = read('../public/js/api.js');
  const fn = src.slice(src.indexOf('export async function matchText('), src.indexOf('export async function matchText(') + 900);
  assert.match(fn, /`\$\{BASE\}\/api\/match-text`/);
  assert.match(fn, /method: 'POST'/);
  assert.match(fn, /if \(res\.status === 404\) return \{ disabled: true \};/);
  assert.match(fn, /if \(res\.status === 429\) return \{ rateLimited: true \};/);
  assert.match(fn, /lines,/);
});

/* ============================================================ the rows == */

test('up to three candidates, each a tappable row with name, brand and size', () => {
  const html = textMatchHtml([
    C('0068100084245', 'Crunchy Peanut Butter', 'Kraft', '1 kg'),
    C('0068100084246', 'Kraft Smooth Peanut Butter', 'Kraft', '500 g'),
    C('0068100084247', 'Natural Peanut Butter', 'Kraft', null),
    C('0068100084248', 'A fourth one', 'Kraft', null),
  ]);
  const rows = [...html.matchAll(/<button type="button" class="cand" data-tm-barcode="(\d+)">/g)].map((m) => m[1]);
  assert.deepEqual(rows, ['0068100084245', '0068100084246', '0068100084247'], 'not the first three, in order');
  assert.equal(MAX_CANDIDATES, 3);
  assert.match(html, /Kraft Crunchy Peanut Butter 1 kg/);
  // The name already leads with the brand: said once, brand moves to the meta line.
  assert.match(html, /<span class="cand-name">Kraft Smooth Peanut Butter 500 g<\/span>\s*<span class="cand-meta">Kraft<\/span>/);
  assert.ok(html.includes(escapeHtml(t('tm_heading'))));
  assert.doesNotMatch(html, /data-act="manual-search"/, 'the type-it action shows beside real candidates');
  assert.deepEqual(candidateLabel({ name: 'Häagen-Dazs Vanilla', brand: 'HAAGEN-DAZS', size: '450 ml' }), { label: 'Häagen-Dazs Vanilla 450 ml', meta: 'HAAGEN-DAZS' });
});

test('zero candidates shows the one type-the-name action, which is the camera\'s own Manual Search', () => {
  const html = textMatchHtml([]);
  assert.match(html, /data-tm-empty/);
  assert.ok(html.includes(escapeHtml(t('tm_none'))));
  const actions = [...html.matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(actions, ['manual-search'], 'the empty state must offer exactly the existing typed-name route');
  assert.match(html, new RegExp(`>${t('cat_type_name')}</button>`));
  // And the camera answers that act with the field it already had.
  const cam = read('../public/js/screens/camera.js');
  assert.match(cam, /if \(act === 'manual-search'\) \{ openManualSearch\(\); return; \}/);
});

test('a candidate without a barcode is not offered: it could not run a barcode scan', async () => {
  const reader = fakeReader();
  const results = [];
  const m = createTextMatcher({ reader, send: async () => ANSWER([C(null, 'No code'), C('123', 'Has code')]), onResult: (c) => results.push(c) });
  m.start();
  reader.emit(['x']);
  await m.settled(); await flush();
  assert.deepEqual(results[0].map((c) => c.barcode), ['123']);
});

/* ============================================================ the tap == */

test('tapping a candidate hands its barcode to the camera, and the rows clear', async () => {
  const doc = makeDocument();
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const reader = fakeReader();
  const picked = [];
  const tm = mountTextMatch({
    host,
    doc,
    native: reader,
    send: async () => ANSWER([C('0068100084245', 'Crunchy Peanut Butter', 'Kraft', '1 kg')]),
    onPick: (code) => picked.push(code),
  });
  assert.ok(tm, 'nothing mounted with a reader present');
  tm.setActive(true);
  reader.emit(['KRAFT', 'CRUNCHY']);
  await tm.matcher.settled(); await flush();
  const rows = host.querySelector('[data-tm-rows]');
  assert.match(rows.innerHTML, /data-tm-barcode="0068100084245"/, 'the candidate was never painted');
  // mini-dom stores innerHTML without parsing it, so the row is built as the
  // browser would have built it, inside the rows the module painted.
  const row = doc.createElement('button');
  row.setAttribute('data-tm-barcode', '0068100084245');
  const label = doc.createElement('span');
  row.appendChild(label);
  rows.appendChild(row);
  click(label);
  assert.deepEqual(picked, ['0068100084245']);
  assert.equal(rows.innerHTML, '', 'the rows stayed up under the scan they started');
});

test('the camera runs the ordinary barcode scan with the picked barcode', () => {
  const cam = read('../public/js/screens/camera.js');
  const wire = cam.slice(cam.indexOf('textMatch = mountTextMatch({'), cam.indexOf('textMatch = mountTextMatch({') + 600);
  assert.match(wire, /send: \(lines\) => ctx\.api\.matchText\(lines\)/);
  assert.match(wire, /onPick: \(code\) => \{\s*if \(dead \|\| cam\.dataset\.state !== 'idle'\) return;/);
  assert.match(wire, /void onBarcode\(\{ value: code, format: 'text_match', frames: 0 \}\);/);
  // onBarcode is the barcode button's own path: it asks the shelf price, then resolveBarcode.
  const onBarcode = cam.slice(cam.indexOf('async function onBarcode(read)'), cam.indexOf('function askPriceFirst('));
  assert.match(onBarcode, /askPriceFirst\(\{ kind: 'barcode', code: read\.value \}\);/);
  // Listening only at idle, and torn down with the screen.
  assert.match(cam, /textMatch\?\.setActive\(next === 'idle'\);/);
  assert.match(cam, /textMatch\?\.stop\(\);/);
});

/* ============================================================ readers == */

test('no native reader and no ?textmatch=dev: nothing mounts and the camera is unchanged', () => {
  assert.equal(nativeTextReader(), null, 'a native reader appeared; the camera would start sending text');
  assert.equal(pickReader({ search: '', native: null }), NO_READER);
  assert.equal(pickReader({ search: '?textmatch=1', native: null }), NO_READER);
  const host = makeDocument().createElement('div');
  let sent = 0;
  assert.equal(mountTextMatch({ host, search: '', native: null, send: async () => { sent += 1; }, onPick: () => {} }), null);
  assert.equal(host.childNodes.length, 0, 'the host was written to with no reader');
  assert.equal(sent, 0);
});

test('?textmatch=dev gives the development reader: a textarea whose lines are sent', () => {
  const doc = makeDocument();
  const host = doc.createElement('div');
  const reader = pickReader({ search: '?textmatch=dev', doc, host, native: null });
  assert.equal(reader.kind, 'dev');
  const got = [];
  reader.start((lines) => got.push(lines));
  const area = host.querySelector('[data-tm-dev]');
  assert.ok(area, 'no textarea');
  area.value = 'KRAFT\r\nPEANUT BUTTER';
  for (const l of area.listeners) if (l.type === 'input') l.fn({});
  assert.deepEqual(got, [['KRAFT', 'PEANUT BUTTER']]);
  // A native reader wins over the query parameter.
  const native = fakeReader();
  assert.equal(pickReader({ search: '?textmatch=dev', doc, host, native }), native);
  assert.equal(devReader({ doc, host }).kind, 'dev');
});

test('lines are trimmed and capped the way the server caps them (60 lines of 200)', () => {
  const many = Array.from({ length: 80 }, (_, i) => `line ${i} ${'x'.repeat(300)}`);
  const out = cleanLines(many);
  assert.equal(out.length, 60);
  assert.ok(out.every((l) => l.length <= 200));
  assert.deepEqual(cleanLines(['  a  b ', '', null, 3, 'c']), ['a b', 'c']);
  assert.deepEqual(cleanLines('not an array'), []);
});

test('the native reader plugs in at one named place', () => {
  const src = read('../public/js/text-match.js');
  assert.equal((src.match(/THE NATIVE TEXT READER PLUGS IN HERE/g) ?? []).length, 1);
  assert.match(src, /export function nativeTextReader\(\) \{\s*return null;\s*\}/);
  assert.match(src, /native = nativeTextReader\(\)/, 'pickReader does not consult the plug point');
});
