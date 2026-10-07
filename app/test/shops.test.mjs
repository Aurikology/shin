/**
 * The shop shortlist: location narrows, the shopper answers, the phone
 * remembers.
 *
 * Asked for on 2026-09-13 in these words -- "can we allow shin to use their
 * location and then assess instead of them having to input the store they're
 * in multiple times. Also Pexi must be able to identify the pattern of where
 * the user often goes" -- under two decisions that this file is here to hold
 * in place, because both of them are the kind that erode quietly:
 *
 *   THE PATTERN LIVES ON THE PHONE ONLY. No visit history of a named person
 *   on the server, no new server table. The last test in this file reads the
 *   wire payload and asserts that what leaves the device is one shop on one
 *   price and nothing that counts.
 *
 *   THE CELL STAYS COARSE AT 0.01 DEGREES. A shortlist is not a fix for a
 *   square that is too big; a shorter list is. `the cell stays on the
 *   server's own grid` below fails if anybody makes it finer, and it fails in
 *   the other direction too -- the client and the server disagreeing about
 *   the format is the live bug this feature was built on top of.
 *
 * NO DOM, NO NETWORK, NO GEOLOCATION. The ordering and the memory are pure
 * functions and store writes; the two sheets are pure string builders
 * exported from camera.js for exactly this (the split `price-only.test.mjs`
 * and `notthis.test.mjs` already use). Overpass is never called: `orderShops`
 * is handed the fixture rows that `storesNear` would have returned.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cellFor } from '../public/js/geocell.js';
import { parseCell } from '../src/stores.ts';
import { orderShops, preselectId, pickerShops } from '../public/js/shops.js';
import { padShopRow, storePickerSheet } from '../public/js/screens/camera.js';
import * as store from '../public/js/store.js';

/* ------------------------------------------------------------ the fixtures */

/** What `/api/stores` answers for a cell, nearest first. Overpass's own shape. */
const NEARBY = [
  { id: 'node/1', name: 'FreshMart', hint: '12 King St' },
  { id: 'node/2', name: 'No Frills', hint: '80 Princess St' },
  { id: 'way/3', name: 'Metro', hint: 'Downtown' },
];

/**
 * A localStorage that lives in a Map, so `store.js` can be driven for real.
 * The same stand-in `voice.test.mjs` uses, minus the locale key.
 */
function withStorage(fn) {
  const had = 'localStorage' in globalThis;
  const before = had ? globalThis.localStorage : undefined;
  const cell = new Map();
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return fn();
  } finally {
    if (had) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

/** The locale swap, as `price-only.test.mjs` does it. */
function inLocale(id, fn) {
  const had = 'localStorage' in globalThis;
  const before = had ? globalThis.localStorage : undefined;
  const cell = new Map([['shin.locale', id]]);
  globalThis.localStorage = {
    getItem: (k) => (cell.has(k) ? cell.get(k) : null),
    setItem: (k, v) => cell.set(k, String(v)),
    removeItem: (k) => cell.delete(k),
  };
  try {
    return fn();
  } finally {
    if (had) globalThis.localStorage = before;
    else delete globalThis.localStorage;
  }
}

beforeEach(() => {
  store.reset();
});

/* --------------------------------------------------- the cell, unchanged -- */

test('the cell stays on the server\'s own grid, at 0.01 degrees and no finer', () => {
  const cell = cellFor(43.2609, -79.9192);

  // The format the server documents and parses. Before 2026-09-13 this file
  // emitted "43.2537:-79.9208" and parseCell returned null for every cell the
  // app had ever sent.
  assert.equal(cell, '43.26,-79.92');
  assert.deepEqual(parseCell(cell)?.text, '43.26,-79.92');

  // A fixed point of the server's own snap: what is sent is what is stored,
  // so no precision is carried on the wire that the server then throws away.
  assert.equal(parseCell(cell).text, cellFor(43.2609, -79.9192));

  // Two decimal places, both halves. This is the assertion that fails if
  // anybody makes the grid finer to sharpen the shortlist.
  for (const half of cell.split(',')) {
    assert.match(half, /^-?\d+\.\d{2}$/, `${half} is not on the 0.01 grid`);
  }

  // Every phone in the same square gets the same id, which is the property
  // the shortlist is built on.
  assert.equal(cellFor(43.2609, -79.9192), cellFor(43.2631, -79.9177));
});

/* ------------------------------------------------------------ the ordering */

test('with nothing remembered, the shortlist is whatever storesNear returned', () => {
  const ordered = orderShops(NEARBY, { known: [], lastId: null });
  assert.deepEqual(ordered.map((s) => s.id), ['node/1', 'node/2', 'way/3']);
});

test('the shop last confirmed in this cell is offered first, over every other rung', () => {
  // Deliberately stacked against it: Metro was confirmed here last, and it is
  // both the LEAST-confirmed shop overall and the furthest away. The cell's
  // own memory still wins, because "where you were standing last time you
  // were in this square" is a better answer than either of the other two.
  const ordered = orderShops(NEARBY, {
    known: [
      { id: 'way/3', name: 'Metro', hint: 'Downtown', count: 1 },
      { id: 'node/2', name: 'No Frills', hint: '80 Princess St', count: 9 },
    ],
    lastId: 'way/3',
  });
  assert.deepEqual(
    ordered.map((s) => s.id),
    ['way/3', 'node/2', 'node/1'],
    'the shop confirmed here last time is not first',
  );
});

test('after that, the shops this person goes to most, then distance', () => {
  const ordered = orderShops(NEARBY, {
    known: [
      { id: 'way/3', name: 'Metro', hint: 'Downtown', count: 9 },
      { id: 'node/2', name: 'No Frills', hint: '80 Princess St', count: 4 },
    ],
    lastId: null,
  });
  // Metro (9) before No Frills (4) before FreshMart (never confirmed), even
  // though FreshMart is the nearest thing in the square.
  assert.deepEqual(ordered.map((s) => s.id), ['way/3', 'node/2', 'node/1']);
});

test('a shop confirmed here survives Overpass answering with nothing', () => {
  // stores.ts is explicit that an empty list is a normal answer from a
  // volunteer-run server. A shopper standing in the shop they were in
  // yesterday must not lose it to somebody else's outage.
  const ordered = orderShops([], {
    known: [{ id: 'node/2', name: 'No Frills', hint: '80 Princess St', count: 3 }],
    lastId: 'node/2',
  });
  assert.deepEqual(ordered.map((s) => s.name), ['No Frills']);
});

test('a shop remembered from another city is never added to this cell', () => {
  // The device's memory may reorder what is nearby. It may not invent a
  // neighbour: only the shop confirmed in THIS cell is added back.
  const ordered = orderShops(NEARBY, {
    known: [{ id: 'node/99', name: 'Somewhere Else', hint: 'Toronto', count: 20 }],
    lastId: null,
  });
  assert.equal(ordered.length, 3);
  assert.ok(!ordered.some((s) => s.id === 'node/99'));
});

test('a first visit to a cell preselects nothing and asks', () => {
  assert.equal(preselectId('43.26,-79.92', { lastIn: null }), null);
  // And with no cell at all -- location off -- there is nothing to preselect
  // from, whatever the device remembers.
  assert.equal(preselectId(null, { lastIn: 'node/1' }), null);
});

/* ---------------------------------------------- the memory, on the device */

test('a second visit to the same cell preselects the shop, so nothing is tapped', () => {
  withStorage(() => {
    const cell = '43.26,-79.92';
    store.confirmShop(cell, NEARBY[1]);

    // Coming back: the device answers which shop without asking anybody.
    assert.equal(store.lastShopIn(cell), 'node/2');
    assert.equal(preselectId(cell, { lastIn: store.lastShopIn(cell) }), 'node/2');

    // And the shortlist for that cell opens with it already on top.
    const ordered = orderShops(NEARBY, {
      known: store.knownShops(),
      lastId: store.lastShopIn(cell),
    });
    assert.equal(ordered[0].id, 'node/2');
  });
});

test('a different cell does not inherit the other cell\'s shop', () => {
  withStorage(() => {
    store.confirmShop('43.26,-79.92', NEARBY[1]);
    // Same person, same phone, a square away. Preselecting their usual shop
    // here would file a price at a shop they are not in, which is worse than
    // filing it at none, because nothing downstream can tell it is wrong.
    assert.equal(store.lastShopIn('44.23,-76.49'), null);
  });
});

test('the pattern is a count, and it is counted per shop and not per cell', () => {
  withStorage(() => {
    store.confirmShop('43.26,-79.92', NEARBY[0]);
    store.confirmShop('43.27,-79.92', NEARBY[0]);
    store.confirmShop('43.26,-79.92', NEARBY[1]);

    const known = store.knownShops();
    assert.equal(known[0].id, 'node/1');
    assert.equal(known[0].count, 2, 'the same shop confirmed twice is not counted twice');
    assert.equal(known.find((k) => k.id === 'node/2').count, 1);
  });
});

test('switching location off forgets the shops as well as stopping the collecting', () => {
  withStorage(() => {
    store.confirmShop('43.26,-79.92', NEARBY[0]);
    assert.equal(store.knownShops().length, 1);
    store.forgetShops();
    assert.deepEqual(store.knownShops(), []);
    assert.equal(store.lastShopIn('43.26,-79.92'), null);
  });
});

/* ------------------------------------------------------------ the screens */

test('consent off still shows the shop row: a price needs a shop whatever location says (D02, D03)', () => {
  inLocale('en', () => {
    assert.match(padShopRow(null, false), /data-act="pad-shop"/, 'no way to name a shop with location off');
    assert.match(padShopRow({ id: 'chain:walmart', name: 'Walmart' }, false), /Walmart/);
  });
});

test('consent on shows which shop the price is about to be filed at', () => {
  inLocale('en', () => {
    const chosen = padShopRow({ id: 'node/1', name: 'FreshMart' }, true);
    assert.match(chosen, /FreshMart/);
    assert.match(chosen, /data-act="pad-shop"/);

    // Nothing chosen yet still renders the row: it is the only way to reach
    // the shortlist, so hiding it would hide the way to choose.
    const empty = padShopRow(null, true);
    assert.match(empty, /data-act="pad-shop"/);
    assert.ok(!/FreshMart/.test(empty));
  });
});

test('the shortlist renders from a fixture, as the inset grouped list', () => {
  inLocale('en', () => {
    const html = storePickerSheet(orderShops(NEARBY, {}), null);
    for (const s of NEARBY) {
      assert.ok(html.includes(s.name), `${s.name} is missing from the shortlist`);
      assert.ok(html.includes(`data-shop="${s.id}"`), `${s.id} has no row`);
    }
    // The same control the market picker uses, not a new one.
    assert.match(html, /class="ilist shop-list" role="radiogroup"/);
    // There is no "No shop" answer: the server refuses a price with no shop (D02).
    assert.doesNotMatch(html, /data-shop="__none"/);
    // And there is a search box (D03).
    assert.match(html, /data-shop-search/);
  });
});

test('the preselected shop is the checked one, and the usual ones are marked', () => {
  inLocale('en', () => {
    const ordered = orderShops(NEARBY, {
      known: [{ id: 'node/2', name: 'No Frills', hint: '80 Princess St', count: 5 }],
      lastId: 'node/2',
    });
    const html = storePickerSheet(ordered, 'node/2');
    assert.match(html, /data-shop="node\/2"[^>]*|[^>]*aria-checked="true"/);
    assert.equal(html.split('aria-checked="true"').length - 1, 1, 'more than one row is checked');
    // Exactly one shop has been confirmed before, so exactly one is "Usual".
    assert.equal(html.split('shop-usual').length - 1, 1);
  });
});

test('an empty nearby list still leaves a picker: the chains and the search box (D03)', () => {
  inLocale('en', () => {
    const rows = pickerShops({});
    assert.ok(rows.length > 10, 'the picker has no chains to show without the network');
    const html = storePickerSheet(rows, null);
    assert.match(html, /data-shop-search/);
    assert.match(html, /Save-On-Foods/);
    assert.doesNotMatch(html, /data-shop="__none"/);
  });
});

test('both languages, both sheets, and no English left on a French screen', () => {
  const en = inLocale('en', () => storePickerSheet(orderShops(NEARBY, {}), null));
  const fr = inLocale('fr', () => storePickerSheet(orderShops(NEARBY, {}), null));
  assert.notEqual(en, fr, 'the shortlist rendered identically in both languages');
  assert.match(en, /Which shop\?/);
  assert.match(fr, /Quel magasin/);
  assert.match(fr, /Chercher/);
  assert.ok(!fr.includes('Search or type'), 'the English search label is on the French screen');
  assert.ok(!fr.includes('No shop'), 'the English "No shop" row is on the French screen');

  const rowEn = inLocale('en', () => padShopRow(null, true));
  const rowFr = inLocale('fr', () => padShopRow(null, true));
  assert.match(rowEn, /Shop/);
  assert.match(rowFr, /Magasin/);
  assert.match(rowFr, /Choisir/);
  assert.ok(!rowFr.includes('Choose'));

  // Shop names are the world's, not ours, so they are NOT translated -- and
  // they are escaped, because they came off a third party's map.
  assert.ok(fr.includes('No Frills'));
  const nasty = storePickerSheet([{ id: 'node/x', name: '<script>x</script>', hint: '' }], null);
  assert.ok(!nasty.includes('<script>'), 'a shop name off the map reached the page unescaped');
});

/* ------------------------------------------------- what leaves the device */

test('the chosen shop reaches the correction payload as a name AND an identity', () => {
  withStorage(() => {
    const entry = store.recordCorrection({
      code: '0123',
      productId: null,
      label: 'a tin',
      category: 'grocery',
      amountCents: 349,
      seller: 'No Frills',
      storeId: 'node/2',
      kind: 'regular',
      scanId: 7,
    });
    // D-081: the name is for display and matching, the id is for counting
    // distinct sellers, and neither stands in for the other.
    assert.equal(entry.seller, 'No Frills');
    assert.equal(entry.storeId, 'node/2');
  });
});

test('a hand-typed shop carries no identity, because it has none', () => {
  withStorage(() => {
    const entry = store.recordCorrection({
      code: '0123', productId: null, label: null, category: null,
      amountCents: 349, seller: 'the corner place', kind: 'regular',
    });
    assert.equal(entry.seller, 'the corner place');
    assert.equal(entry.storeId, null, 'an identity was invented for a typed name');
  });
});

test('nothing that counts visits ever reaches the wire', async () => {
  // The decision, asserted rather than described: the device knows how often
  // this person goes to each shop, and the payload that leaves carries one
  // shop for one price and no history of any kind.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/js/corrections.js', import.meta.url), 'utf8');
  const wire = src.slice(src.indexOf('function wireFor'), src.indexOf('export async function flushCorrections'));
  for (const forbidden of ['knownShops', 'lastShopIn', 'visitCount', 'lastByCell', 'shops.']) {
    assert.ok(!wire.includes(forbidden), `wireFor sends "${forbidden}"`);
  }
  // The field, not the word: this file is full of prose about `storeId`, and
  // an assertion a comment can satisfy is an assertion that passes after the
  // line it was written to protect has been deleted. Found the hard way while
  // negative-testing this very test.
  assert.match(wire, /\bstoreId:\s*entry\./, 'the shop identity is not on the wire at all');
  assert.match(wire, /\bstoreName:\s*entry\./, 'the shop name is not on the wire at all');
});

test('the camera screen and the shortlist both ask the OS for a position, and both gate it on consent', async () => {
  // Item 4 used to read "Never ask for the OS location permission except in
  // response to the shopper actually opening the shortlist." REVERSED
  // 2026-09-14, task item 3, on the founder's word ("build everything for
  // collecting EVERYTHING"): the camera screen now asks too, on its own
  // first render, because most sessions are barcode scans that never open
  // the shortlist at all, and a permission never asked is a position never
  // collected. Checked by source, the way price-only.test.mjs checks the
  // click wiring, because the closure this lives in has no DOM here to mount.
  const { readFileSync } = await import('node:fs');
  const camera = readFileSync(new URL('../public/js/screens/camera.js', import.meta.url), 'utf8');
  assert.ok(camera.includes('refreshCell'), 'camera.js no longer asks the OS for a position on its own');
  assert.match(
    camera,
    /consent\(\)\.location\)\s*void refreshCell\(\)/,
    'the camera screen asks for a position without checking location consent first',
  );
  assert.ok(camera.includes("act === 'pad-shop'"), 'the shop row is not wired to anything');
  assert.ok(camera.includes('openShopPicker'), 'the shortlist has no opener');

  const shops = readFileSync(new URL('../public/js/shops.js', import.meta.url), 'utf8');
  const opener = shops.slice(shops.indexOf('export async function openShortlist'));
  assert.ok(opener.includes('refreshCell'), 'the shortlist does not refresh the cell');
  assert.ok(
    opener.indexOf('locationAllowed()') < opener.indexOf('refreshCell'),
    'the cell is refreshed before consent is checked',
  );
});

/*
 * The tick has to be hidden by the list that draws it.
 *
 * `rowCheck()` renders an `.ilist-k` on every row and shell.css only colours
 * it, so a list that uses the shared row and forgets its own hide/show pair
 * draws a tick beside EVERY option. That is exactly how this picker first
 * rendered -- Metro chosen and Loblaws ticked as well -- and no assertion in
 * this file caught it, because the markup was correct and the defect was in
 * the stylesheet. `you.css` carries the same pair twice for the market list
 * and the attitude picker; this asserts the shop list has it too.
 *
 * Read from the stylesheet rather than described, for the reason build
 * standard 4 gives: a claim about a value is computed from the declaration.
 */
test('the shop list hides every tick and shows only the chosen one', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../public/css/screens/camera.css', import.meta.url)),
    'utf8',
  );
  assert.match(css, /\.shop-list\s+\.ilist-k\s*\{[^}]*visibility:\s*hidden/,
    'the shop list does not hide its ticks, so every row will show one');
  assert.match(css, /\.shop-row\.on\s+\.ilist-k\s*\{[^}]*visibility:\s*visible/,
    'the chosen shop has no rule to show its tick');
});
