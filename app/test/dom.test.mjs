/**
 * The shared helpers in public/js/lib/dom.js.
 *
 * `escapeHtml` is the one that matters: before 2026-09-06 there was no escape
 * helper anywhere in public/js, and pastscans.js interpolated a user-typed item
 * name straight into innerHTML. These cases are the payloads that reached a
 * rendered screen, not invented ones.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, html, raw, ago, agoDays } from '../public/js/lib/dom.js';

test('escapeHtml neutralises the five characters that matter', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('"'), '&quot;');
  assert.equal(escapeHtml("'"), '&#39;');
});

test('escapeHtml escapes the ampersand first, so entities are not doubled open', () => {
  // If & were escaped last, "&lt;" would come back as "&lt;" and render as "<".
  assert.equal(escapeHtml('&lt;script&gt;'), '&amp;lt;script&amp;gt;');
});

test('escapeHtml is safe in an attribute position', () => {
  const payload = '" onmouseover="alert(1)';
  assert.ok(!`title="${escapeHtml(payload)}"`.includes('onmouseover="'));
});

test('escapeHtml renders nullish as empty rather than as the word', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});

test('the html tag escapes every interpolation', () => {
  const name = '<b>x</b>';
  assert.equal(html`<p>${name}</p>`, '<p>&lt;b&gt;x&lt;/b&gt;</p>');
});

test('raw() is the only way past the html tag', () => {
  assert.equal(html`<p>${raw('<b>ok</b>')}</p>`, '<p><b>ok</b></p>');
});

test('ago falls back rather than printing NaN', () => {
  // watchlist.js's copy returned "NaN min ago" here; pastscans' guard is kept.
  assert.equal(ago('not a date'), 'just now');
  assert.equal(ago(undefined), 'just now');
});

test('ago steps minutes, hours, then days', () => {
  const at = (ms) => new Date(Date.now() - ms).toISOString();
  assert.equal(ago(at(5 * 60000)), '5 min ago');
  assert.equal(ago(at(3 * 3600000)), '3 h ago');
  assert.equal(ago(at(2 * 86400000)), '2 d ago');
});

test('ago never reports a future timestamp as negative', () => {
  assert.equal(ago(new Date(Date.now() + 90000).toISOString()), '0 min ago');
});

test('agoDays counts whole days for the retention window', () => {
  const at = (ms) => new Date(Date.now() - ms).toISOString();
  assert.equal(agoDays(at(3600000)), 'today');
  assert.equal(agoDays(at(86400000 + 1000)), '1 day ago');
  assert.equal(agoDays(at(12 * 86400000)), '12 days ago');
});
