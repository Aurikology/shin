/**
 * The 2026-11-21 readiness review (lane app-small), the two behaviours that need a DOM:
 *
 *   4. business rank 7, gap 45: the weekly free scans left are shown on the answer sheet from 3 left, so the
 *      limit never first appears as a refusal at the shelf. One quiet line, no pop-up, nothing for Plus.
 *   6. legal 7, apple-rules 8, gap 82: "Share usage data" off stops the app sending usage events: nothing
 *      is queued, what was queued is dropped, and the choice survives a relaunch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeDocument, makeStorage, installBrowser, click } from './mini-dom.mjs';

const doc = makeDocument();
const storage = makeStorage();
installBrowser({ doc, storage });

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const { scansLeftLine, mountScansLeft, WARN_AT } = await import('../public/js/scans-left.js');
const usage = await import('../public/js/usage-setting.js');
const { track } = await import('../public/js/track.js');

/* ------------------------------------------------------------------ 4. scans left */

test('4. the line appears from 3 free scans left, and never for Plus or with no limit', () => {
  assert.equal(WARN_AT, 3);
  assert.equal(scansLeftLine({ limit: 10, remaining: 4, plus: false }), '');
  assert.equal(scansLeftLine({ limit: 10, remaining: 3, plus: false }), '3 free scans left this week');
  assert.equal(scansLeftLine({ limit: 10, remaining: 1, plus: false }), '1 free scan left this week');
  assert.equal(scansLeftLine({ limit: 10, remaining: 0, plus: false }), 'No free scans left this week');
  assert.equal(scansLeftLine({ limit: 100, remaining: 2, plus: true }), '', 'Plus is never nudged');
  assert.equal(scansLeftLine({ limit: null, remaining: null, plus: false }), '', 'no limit set, nothing to say');
  assert.equal(scansLeftLine(null), '');
});

test('4. the line sits at the foot of the open answer sheet, once, and its tap opens Plus', () => {
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  assert.equal(mountScansLeft(doc, '3 free scans left this week', () => {}), null, 'no sheet open, nothing drawn');
  const sheet = doc.createElement('section');
  sheet.setAttribute('class', 'sheet verdict');
  host.appendChild(sheet);
  const opened = [];
  const line = mountScansLeft(doc, '3 free scans left this week', () => opened.push('paywall'));
  assert.ok(line, 'drawn on the sheet');
  assert.equal(sheet.querySelectorAll('[data-scans-left]').length, 1);
  assert.match(line.textContent, /3 free scans left this week/);
  assert.match(line.textContent, /Get Pexi Plus/);
  mountScansLeft(doc, '3 free scans left this week', () => opened.push('again'));
  assert.equal(sheet.querySelectorAll('[data-scans-left]').length, 1, 'never twice on one sheet');
  const ev = click(line.querySelector('button'), { stopPropagation() { this.propagationStopped = true; } });
  assert.deepEqual(opened, ['paywall']);
  assert.equal(ev.propagationStopped, true, 'the tap does not also reach the sheet underneath');
});

test('4. a barcode scan that was answered tells the app a scan was counted; a preview and a typed name do not', () => {
  const api = read('../public/js/api.js');
  assert.match(api, /if \(gtin && !preview\) announceCountedScan\(\);/);
  assert.match(api, /new CustomEvent\('pexi:scan-counted'\)/);
  const main = read('../public/js/main.js');
  assert.match(main, /startScansLeft\(/);
});

/* ------------------------------------------------------------------ 6. usage switch */

const queued = () => JSON.parse(storage.getItem('shin.track.queue') ?? '[]');

test('6. usage sharing is on by default and track() queues events', () => {
  assert.equal(usage.usageSharingOn(), true);
  track('probe_on', {});
  assert.ok(queued().some((e) => e.type === 'probe_on'));
});

test('6. switched off: what was queued is dropped and nothing new is queued', () => {
  assert.equal(usage.setUsageSharing(false), false);
  assert.equal(usage.usageSharingOn(), false);
  assert.deepEqual(queued(), [], 'the queue was emptied');
  track('probe_off', {});
  assert.deepEqual(queued(), [], 'an event was queued with sharing off');
  assert.equal(storage.getItem(usage.USAGE_OFF_KEY), '1', 'the choice is remembered');
});

test('6. switched back on, events are queued again', () => {
  assert.equal(usage.setUsageSharing(true), true);
  track('probe_back', {});
  assert.ok(queued().some((e) => e.type === 'probe_back'));
  assert.equal(storage.getItem(usage.USAGE_OFF_KEY), null);
});
