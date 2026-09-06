/**
 * The three list screens escape everything the user can type.
 *
 * These are not invented payloads. Until 2026-09-06 `pastscans.js` put
 * `h.query.text` -- the name typed on the correction screen or into the
 * camera's text route -- straight into `innerHTML` at line 101, so correcting
 * an item to `<img src=x onerror=alert(1)>` and opening Past scans executed it.
 * `watchlist.js` and `removed.js` interpolated the same stored text the same
 * way, one and two lists further along, including into an `aria-label`
 * attribute built by string concatenation.
 *
 * The row builders are the boundary between stored text and `innerHTML`, which
 * is why they are what is exported and what is asserted on here. They return
 * strings, so this needs no DOM and no dependency.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { row as watchRow, detailModal } from '../public/js/screens/watchlist.js';
import { row as scanRow, detail } from '../public/js/screens/pastscans.js';
import { row as removedRow } from '../public/js/screens/removed.js';

/** The payload that actually ran. */
const HOSTILE = '<img src=x onerror=alert(1)>';
/** The other half of the same hole: breaking out of an attribute value. */
const ATTR_BREAK = '" onfocus="alert(1)';

/**
 * Live markup, as opposed to text that merely mentions it.
 *
 * The escaped form still contains the characters "onerror=", and that is
 * correct and inert: what makes the payload run is the `<` that opens a tag,
 * so that is what is asserted on. The payload must survive as readable text --
 * a row that silently dropped a user's item name would be a different bug.
 */
function assertNoLiveMarkup(markup, label) {
  assert.ok(!markup.includes('<img'), `${label}: an <img> tag survived into the markup`);
  assert.ok(!markup.includes(HOSTILE), `${label}: the raw payload survived unescaped`);
  // Whitespace before the `on`, or `data-conf="thin"` matches its own tail.
  assert.ok(!/\son[a-z]+="/.test(markup), `${label}: an inline event handler attribute survived`);
  assert.ok(
    markup.includes('&lt;img src=x onerror=alert(1)&gt;'),
    `${label}: the payload should still be readable as text`,
  );
}

test('a saved row renders a hostile item name as text', () => {
  const markup = watchRow(
    { id: 'w1', label: HOSTILE, askingSeller: HOSTILE, lastCents: 499, usualCents: 599, savedAt: new Date().toISOString() },
    [],
  );
  assertNoLiveMarkup(markup, 'watchlist row');
});

test('the saved row\'s delete control names the item without an unescaped attribute', () => {
  const markup = watchRow({ id: 'w1', label: ATTR_BREAK, lastCents: 100, savedAt: null }, []);
  // The accessible name is a .sr-only span now, not aria-label="${label}".
  assert.ok(markup.includes('class="sr-only"'), 'the delete control lost its accessible name');
  assert.ok(!markup.includes('onfocus="'), 'the item name broke out of an attribute');
});

test('a saved row id cannot break out of its own attributes', () => {
  const markup = watchRow({ id: ATTR_BREAK, label: 'Milk', lastCents: 100, savedAt: null }, []);
  assert.ok(!markup.includes('onfocus="'), 'the id broke out of data-open or data-fk');
});

test('a past-scan row renders a hostile typed query as text', () => {
  const markup = scanRow({
    id: 'h1',
    at: new Date().toISOString(),
    query: { text: HOSTILE, askingCents: 250 },
    result: { kind: 'refusal', reason: 'no_identity' },
  });
  assertNoLiveMarkup(markup, 'pastscans row');
});

test('the reopened refusal renders a hostile typed query as text', () => {
  // This is the exact line the payload used to run from: pastscans.js:101,
  // `${h.query?.text ?? 'Unknown item'}` inside the modal's meta line.
  const markup = detail({
    id: 'h1',
    at: new Date().toISOString(),
    query: { text: HOSTILE },
    result: { kind: 'refusal', reason: 'no_identity', detail: HOSTILE },
  });
  assertNoLiveMarkup(markup, 'pastscans detail');
});

test('the reopened saved item renders a hostile label as text', () => {
  const markup = detailModal(
    { id: 'w1', label: HOSTILE, askingSeller: HOSTILE, lastCents: 100, savedAt: new Date().toISOString() },
    null,
  );
  assertNoLiveMarkup(markup, 'watchlist detail');
});

test('a removed row renders hostile text as text, for both kinds it holds', () => {
  const removedAt = new Date().toISOString();
  const watch = removedRow({ kind: 'watch', id: 'w1', label: HOSTILE, lastCents: 100, removedAt }, null);
  assertNoLiveMarkup(watch, 'removed row (watch)');

  const scan = removedRow(
    { kind: 'scan', id: 'h1', removedAt, query: { text: HOSTILE, askingCents: 100 }, result: { kind: 'refusal' } },
    null,
  );
  assertNoLiveMarkup(scan, 'removed row (scan)');
});

test('every row carries a focus key, which is what survives a full repaint', () => {
  // The repaint in lib/listscreen.js finds the control the user was on by
  // [data-fk]. A row without one is a row that drops focus to the body when
  // anything else on the screen changes.
  const markup = watchRow({ id: 'w1', label: 'Milk', lastCents: 100, savedAt: null }, []);
  assert.ok(markup.includes('data-fk="open:w1"'));
  assert.ok(markup.includes('data-fk="del:w1"'));
});
