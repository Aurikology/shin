/**
 * UX build 7, lists: R-92 (row heights), R-93 (swipe to remove with a visible equivalent),
 * R-94 (undo, 4 s, paused while pressed), R-95 (empty states), R-96 (saved order and a date on every
 * row), R-97 (past scans: face 28 px, never animated), R-98 (the bottom bar: three single-word labels
 * on every page). Spec: docs/design/ux-evidence-2026-10-09.md section 13, build 7.
 *
 * BLOCKS COVERED: R-92, R-93, R-94, R-95, R-96, R-97 (keep), R-98.
 *
 * EXPECTED RED UNTIL BUILT: tests whose name says "build 7". They fail for these reasons: Saved and
 * Past scans rows are 64 px, not 72, and carry no chevron; the price list row declares no height;
 * there is no swipe, no visible Remove on the Saved row and no Remove in the Saved detail view; there
 * is no undo toast module (lib/undo-toast.js); the Saved empty line is "Nothing here yet." and the
 * Removed empty screen still has its "Removed . 0" header; restoring an old item puts it above newer
 * saves; a row with no date prints "just now" instead of throwing; the scan control is called
 * "Scan something" (two words) and the camera bar has a fourth item.
 * GREEN TODAY (keep): 52 px single-line rows, 56 px candidate rows, the hairline inset of 16, the 4 s
 * toast constant in the camera, removal being recoverable 30 days with no confirmation dialog, saves
 * landing newest first, a date on every row, no sort or filter, the 28 px never-animated row face,
 * Past scans and Removed living under Saved.
 *
 * WHAT JSDOM CANNOT MEASURE. No browser is available (zero runtime dependencies; test/mini-dom.mjs
 * keeps innerHTML as text and parses nothing). Screens are rendered by their own render() into that
 * store-only DOM and read as markup text. Not measured: a real swipe gesture (touch events on a
 * laid-out row), the pixel height a row ends up at (only the declared min-height is read), the
 * 4 s timer running against a real finger. The undo timing is tested with node:test mocked timers, which
 * is exact for setTimeout but says nothing about the toast's visual state.
 *
 * Run: node --test --test-global-setup=test/setup/global.mjs test/ux/ux-b7-lists.test.mjs
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser, MiniElement } from '../mini-dom.mjs';

const storage = makeStorage();
const doc = makeDocument();
installBrowser({ doc, storage });

const store = await import('../../public/js/store.js');
const watchlist = await import('../../public/js/screens/watchlist.js');
const pastscans = await import('../../public/js/screens/pastscans.js');
const removed = await import('../../public/js/screens/removed.js');
const pagebar = await import('../../public/js/lib/pagebar.js');
const { say } = await import('../../public/js/voice.js');

const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const JS = new URL('../../public/js/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, JS), 'utf8');

/* ============================================================== CSS reader */

const CSS_DIR = new URL('../../public/css/', import.meta.url);

function parseCss(text, file) {
  const src = text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  function block(start, media) {
    let i = start;
    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i])) i += 1;
      if (i >= src.length) return i;
      if (src[i] === '}') return i + 1;
      const open = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (open === -1) return src.length;
      if (semi !== -1 && semi < open && src[i] === '@') { i = semi + 1; continue; }
      const head = src.slice(i, open).trim();
      if (/^@(-webkit-)?keyframes/.test(head)) {
        let depth = 0; let j = open;
        for (; j < src.length; j += 1) { if (src[j] === '{') depth += 1; else if (src[j] === '}' && --depth === 0) break; }
        i = j + 1; continue;
      }
      if (head.startsWith('@font-face')) { i = src.indexOf('}', open) + 1; continue; }
      if (head.startsWith('@')) { i = block(open + 1, media ? `${media} and ${head}` : head); continue; }
      const close = src.indexOf('}', open);
      const decls = new Map();
      for (const d of src.slice(open + 1, close).split(';')) {
        const k = d.indexOf(':');
        if (k === -1) continue;
        const prop = d.slice(0, k).trim().toLowerCase();
        if (prop) decls.set(prop, d.slice(k + 1).replace(/\s+/g, ' ').trim());
      }
      rules.push({ sel: head.replace(/\s+/g, ' '), decls, media, file });
      i = close + 1;
    }
    return i;
  }
  block(0, null);
  return rules;
}

const FILES = ['tokens.css', 'components.css', 'shell.css', ...readdirSync(new URL('screens/', CSS_DIR)).sort().map((f) => `screens/${f}`)];
const RULES = FILES.flatMap((f) => parseCss(readFileSync(new URL(f, CSS_DIR), 'utf8'), f));
const VARS = new Map();
for (const r of RULES) for (const [p, v] of r.decls) if (p.startsWith('--') && !VARS.has(p)) VARS.set(p, v);

/** The last base (no media) declaration of `prop` among rules whose selector list contains `selector`. */
function declared(selector, prop) {
  const hit = RULES.filter((r) => !r.media && r.decls.has(prop) && r.sel.split(',').map((x) => x.trim()).includes(selector));
  return hit.length ? hit[hit.length - 1].decls.get(prop) : undefined;
}
const px = (v) => {
  if (v === undefined) return null;
  const s = String(v).replace(/var\((--[\w-]+)\)/g, (_m, n) => VARS.get(n) ?? 'NaN');
  const m = /^([\d.]+)px$/.exec(s.trim());
  return m ? Number.parseFloat(m[1]) : null;
};

/* ================================================================ rendering */

/** Fresh store, then a screen rendered into a MiniElement; returns the markup and a cleanup. */
async function renderScreen(mod, params = {}) {
  storage.clear();
  store.reset();
  return paintScreen(mod, params);
}
async function paintScreen(mod, params = {}) {
  const root = new MiniElement('main', doc);
  doc.body.appendChild(root);
  const cleanup = await mod.default.render(root, { go() {}, back() {}, params, query: {} });
  return { root, html: () => root.innerHTMLRaw, text: () => root.innerHTMLRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), cleanup };
}

const WATCH = (over = {}) => ({ id: 'w1', label: 'Kraft Peanut Butter 500 g', askingSeller: 'Metro', lastCents: 349, usualCents: 429, savedAt: iso(2), ...over });
const SCAN = (over = {}) => ({ id: 'h1', at: iso(2), result: { kind: 'refusal', reason: 'no_identity', detail: 'x', identity: null, evidence: [] }, query: { text: 'Kraft Peanut Butter', askingCents: 349 }, ...over });

/* ===================================================================== R-92 */

test('R-92 (build 7): the CSS reader sees the row rules it must audit (negative control)', () => {
  assert.equal(px(declared('.ilist-row', 'min-height')), 52, 'known value: .ilist-row is 52 px');
  assert.equal(declared('.ilist-row + .ilist-row::before', 'left'), '16px', 'known value: hairline inset 16');
});

test('R-92 (keep): single-line rows are 52 px (settings, shop picks) and candidate rows 56 px', () => {
  assert.equal(px(declared('.ilist-row', 'min-height')), 52);
  assert.equal(px(declared('.shop-row', 'min-height')), 52);
  assert.equal(px(declared('.cand', 'min-height')), 56);
});

test('R-92 (build 7): two-line rows (Saved, Past scans, the price list) are 72 px', () => {
  const bad = [];
  for (const sel of ['.wrow-wrap', '.wrow', '.prow', '.prow-wrap', '.vd-dotrow']) {
    const h = px(declared(sel, 'min-height')) ?? px(declared(sel, 'height'));
    if (!(h >= 72)) bad.push(`${sel}: ${h === null ? 'no height declared' : `${h} px`}`);
  }
  assert.deepEqual(bad, [], 'R-92: two-line rows are 72');
});

test('R-92 (keep): the hairline between rows keeps its 16 px inset', () => {
  assert.equal(declared('.ilist-row + .ilist-row::before', 'left'), '16px');
  for (const sel of ['.wrow-wrap + .wrow-wrap::before', '.prow-wrap + .prow-wrap::before', '.rrow-wrap + .rrow-wrap::before']) {
    assert.equal(declared(sel, 'left'), '16px', sel);
  }
});

test('R-92 (build 7): a row that goes somewhere (Saved, Past scans) ends in a 16 px chevron', () => {
  const chevron = /<svg[^>]*width="16"[^>]*height="16"[^>]*>\s*<path d="M9 18l6-6-6-6"/;
  assert.match(pagebar.rowChevron(), chevron, 'the chevron itself is 16 px (keep)');
  assert.match(watchlist.row(WATCH(), []), /ilist-c|M9 18l6-6-6-6/, 'a Saved row opens a detail view and shows no chevron');
  assert.match(pastscans.row(SCAN()), /ilist-c|M9 18l6-6-6-6/, 'a Past scans row opens a detail view and shows no chevron');
});

test('R-92 (keep): the rows that lead to other pages already carry the chevron', async () => {
  const { html, cleanup } = await renderScreen(watchlist);
  assert.match(html(), /data-act="pastscans"[\s\S]*?M9 18l6-6-6-6/);
  assert.match(html(), /data-act="removed"[\s\S]*?M9 18l6-6-6-6/);
  cleanup();
});

/* ===================================================================== R-93 */

test('R-93 (build 7): the Saved row has a swipe-left gesture that reveals Remove', () => {
  const src = [read('screens/watchlist.js'), ...readdirSync(new URL('lib/', JS)).filter((f) => /swipe/.test(f)).map((f) => read(`lib/${f}`))].join('\n');
  assert.match(src, /touchstart|pointerdown/, 'there is no touch or pointer handling for the Saved rows: no swipe exists');
  assert.match(src, /swipe/i, 'the word swipe appears nowhere in the Saved code');
});

test('R-93 (build 7): the revealed action is labelled with visible text and an icon, not colour alone', () => {
  const html = watchlist.row(WATCH(), []);
  const del = /<button[^>]*(?:wrow-del|data-unwatch)[^>]*>([\s\S]*?)<\/button>/.exec(html);
  assert.ok(del, 'the Saved row has no remove control at all');
  const visible = del[1].replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
  assert.match(visible, /Remove/i, `the remove control shows no text label (only an icon and a screen-reader span): "${visible}"`);
  assert.match(del[1], /<svg/, 'the remove control has no icon');
});

test('R-93 (build 7): the same Remove sits in the item\'s detail view', () => {
  const html = watchlist.detailModal(WATCH(), null);
  assert.match(html, /data-unwatch|data-act="remove"/, 'the Saved detail view offers Close only: anyone who never finds the swipe cannot remove');
});

test('R-93 (keep): removal asks no confirmation, because it is undoable', () => {
  const src = read('screens/watchlist.js');
  assert.doesNotMatch(src, /\bconfirm\(|window\.confirm|are you sure/i);
  assert.match(src, /\[data-unwatch\][\s\S]{0,160}store\.toggleWatch/, 'the remove tap no longer calls the store directly');
});

/* ===================================================================== R-94 */

test('R-94 (keep): the camera\'s plain acknowledgements and its undo stay at 4 seconds', () => {
  const camera = read('screens/camera.js');
  const fours = camera.match(/\},\s*4000\)/g) ?? [];
  assert.ok(fours.length >= 2, `expected the toast timers at 4000 ms, found ${fours.length}`);
  const at = camera.indexOf('toastSlot._timer = setTimeout');
  assert.ok(at > -1 && /\},\s*4000\)/.test(camera.slice(at, at + 120)), 'the thumbs toast is no longer 4000 ms');
});

test('R-94 (keep): removal stays recoverable for 30 days', async () => {
  const { cleanup } = await renderScreen(watchlist);
  store.toggleWatch({ id: 'k1', label: 'Milk', lastCents: 100, usualCents: 120 });
  store.toggleWatch({ id: 'k1' });
  const s = store.get();
  assert.equal(s.watchlist.length, 0);
  assert.equal(s.removed.length, 1, 'the removed item is gone, not kept');
  assert.equal(s.removed[0].kind, 'watch');
  assert.ok(Number.isFinite(Date.parse(s.removed[0].removedAt)));
  assert.equal(store.daysLeft(s.removed[0].removedAt), 30);
  assert.match(read('store.js'), /REMOVE_RETENTION_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  cleanup();
});

async function loadUndo() {
  try {
    return await import('../../public/js/lib/undo-toast.js');
  } catch (err) {
    return assert.fail(`build 7 must add public/js/lib/undo-toast.js exporting createUndoToast({ label, restore, durationMs = 4000 }) -> { isOpen, press(), release(), undo(), durationMs }; import failed: ${err.code ?? err.message}`);
  }
}

test('R-94 (build 7): the undo closes after 4 seconds and not before', async () => {
  const { createUndoToast } = await loadUndo();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let restored = 0;
    const toast = createUndoToast({ label: 'Removed', restore: () => { restored += 1; } });
    assert.equal(toast.durationMs, 4000, 'the window is fixed by ruling: four seconds');
    assert.equal(toast.isOpen, true);
    mock.timers.tick(3999);
    assert.equal(toast.isOpen, true, 'closed early');
    mock.timers.tick(1);
    assert.equal(toast.isOpen, false, 'still open after 4000 ms');
    assert.equal(restored, 0, 'closing must not restore');
  } finally { mock.timers.reset(); }
});

test('R-94 (build 7): the 4 seconds stop while the finger is down and resume with what was left', async () => {
  const { createUndoToast } = await loadUndo();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const toast = createUndoToast({ label: 'Removed', restore: () => {} });
    mock.timers.tick(3000);
    toast.press();
    mock.timers.tick(60000);
    assert.equal(toast.isOpen, true, 'the window ran out while the finger was down');
    toast.release();
    mock.timers.tick(999);
    assert.equal(toast.isOpen, true, 'the second after release must be the 1000 ms that were left, not a fresh 4000 and not zero');
    mock.timers.tick(1);
    assert.equal(toast.isOpen, false);
  } finally { mock.timers.reset(); }
});

test('R-94 (build 7): tapping Undo runs the restore once and closes; a second tap throws', async () => {
  const { createUndoToast } = await loadUndo();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let restored = 0;
    const toast = createUndoToast({ label: 'Removed', restore: () => { restored += 1; } });
    toast.undo();
    assert.equal(restored, 1);
    assert.equal(toast.isOpen, false);
    assert.throws(() => toast.undo(), /closed|already/i, 'a second undo must not pass silently');
  } finally { mock.timers.reset(); }
});

test('R-94 (build 7): an undo without a restore function throws, and a failing restore is not swallowed', async () => {
  const { createUndoToast } = await loadUndo();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    assert.throws(() => createUndoToast({ label: 'Removed' }), /restore/, 'a toast that offers Undo and cannot undo is a lie');
    assert.throws(() => createUndoToast({ label: 'Removed', restore: 'nope' }), TypeError);
    assert.throws(() => createUndoToast({ restore: () => {} }), /label/);
    assert.throws(() => createUndoToast({ label: 'x', restore: () => {}, durationMs: 0 }), RangeError, 'a zero window is a silent failure');
    const bad = createUndoToast({ label: 'Removed', restore: () => { throw new Error('store write failed'); } });
    assert.throws(() => bad.undo(), /store write failed/, 'the restore error must reach the caller');
  } finally { mock.timers.reset(); }
});

test('R-94 (build 7): the camera\'s own undo toast also holds its 4 seconds while pressed', () => {
  const camera = read('screens/camera.js');
  const at = camera.indexOf('toastSlot._timer = setTimeout');
  assert.ok(at > -1, 'cannot find the toast timer in camera.js');
  const near = camera.slice(Math.max(0, at - 1500), at + 1500);
  assert.match(near, /pointerdown|touchstart|createUndoToast/, 'nothing pauses the toast timer while the finger is down');
});

/* ===================================================================== R-95 */

test('R-95 (build 7): Saved, empty, says what to do and offers the camera in one tap', async () => {
  const { text, html, cleanup } = await renderScreen(watchlist);
  assert.ok(text().includes('Nothing saved yet. Scan something and tap Save it.'), `Saved empty reads: "${say('watchlist_empty')}"`);
  assert.match(html(), /<button[^>]*data-act="camera"/, 'no button to the camera');
  cleanup();
});

test('R-95 (keep): Past scans, empty, says "Nothing scanned yet."', async () => {
  const { text, cleanup } = await renderScreen(pastscans);
  assert.ok(text().includes('Nothing scanned yet.'));
  cleanup();
});

test('R-95 (build 7): Past scans, empty, offers the same one-tap button to the camera', async () => {
  const { html, cleanup } = await renderScreen(pastscans);
  const body = /<div class="empty">([\s\S]*?)<\/div>/.exec(html());
  assert.ok(body, 'no empty block');
  assert.match(body[1], /<button[^>]*data-act="camera"/, 'the empty Past scans screen has no button to the camera');
  cleanup();
});

test('R-95 (build 7): Removed, empty, is "Nothing removed." alone: no header, no button, no window', async () => {
  const { html, text, cleanup } = await renderScreen(removed);
  assert.ok(text().includes('Nothing removed.'), 'the line is missing');
  const body = /<div class="empty">([\s\S]*?)<\/div>/.exec(html());
  assert.ok(body, 'no empty block');
  assert.doesNotMatch(body[1], /<button/, 'the empty Removed block has a button');
  assert.doesNotMatch(html(), /class="kicker"/, 'a header (kicker) shows over an empty list');
  assert.doesNotMatch(html(), /rheader|30 days|thirty/i, 'the 30-day window is stated with nothing to keep');
  cleanup();
});

test('R-95 (keep): Removed states its window only when there is an item', async () => {
  const { html, cleanup } = await renderScreen(removed);
  assert.doesNotMatch(html(), /rheader/);
  cleanup();
  storage.clear(); store.reset();
  store.toggleWatch({ id: 'r1', label: 'Milk', lastCents: 100, usualCents: 120 });
  store.toggleWatch({ id: 'r1' });
  const again = await paintScreen(removed);
  assert.match(again.html(), /rheader/, 'with an item the window line is missing');
  again.cleanup();
});

/* ===================================================================== R-96 */

test('R-96 (keep): a new save lands at the top, newest first', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-01T12:00:00Z') });
  try {
    storage.clear(); store.reset();
    store.toggleWatch({ id: 'a', label: 'A', lastCents: 100, usualCents: 120 });
    mock.timers.setTime(Date.parse('2026-10-02T12:00:00Z'));
    store.toggleWatch({ id: 'b', label: 'B', lastCents: 100, usualCents: 120 });
    assert.deepEqual(store.get().watchlist.map((w) => w.id), ['b', 'a']);
  } finally { mock.timers.reset(); }
});

test('R-96 (build 7): the list stays newest-saved first after an old item is restored', () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-01T12:00:00Z') });
  try {
    storage.clear(); store.reset();
    store.toggleWatch({ id: 'a', label: 'A', lastCents: 100, usualCents: 120 });
    mock.timers.setTime(Date.parse('2026-10-02T12:00:00Z'));
    store.toggleWatch({ id: 'b', label: 'B', lastCents: 100, usualCents: 120 });
    store.toggleWatch({ id: 'a' });
    mock.timers.setTime(Date.parse('2026-10-03T12:00:00Z'));
    store.restoreRemoved('watch', 'a');
    const ids = store.get().watchlist.map((w) => w.id);
    assert.deepEqual(ids, ['b', 'a'], `restoring A (saved Oct 1) put it above B (saved Oct 2): ${ids.join(', ')}`);
  } finally { mock.timers.reset(); }
});

test('R-96 (keep): every Saved and Past scans row carries a date', () => {
  assert.match(watchlist.row(WATCH(), []).replace(/<[^>]+>/g, ' '), /saved \d+ d ago/);
  assert.match(pastscans.row(SCAN()).replace(/<[^>]+>/g, ' '), /\d+ d ago/);
});

test('R-96 (build 7): a Saved row with no date throws instead of printing "just now"', () => {
  for (const bad of [undefined, null, '', 'not a date']) {
    assert.throws(() => watchlist.row(WATCH({ savedAt: bad }), []), /date|savedAt/i, `savedAt=${JSON.stringify(bad)} rendered silently`);
  }
});

test('R-96 (build 7): a Past scans row with no date throws instead of printing "just now"', () => {
  for (const bad of [undefined, null, '', 'not a date']) {
    assert.throws(() => pastscans.row(SCAN({ at: bad })), /date|at\b/i, `at=${JSON.stringify(bad)} rendered silently`);
  }
});

test('R-96 (build 7): a Removed row with no removal date throws', () => {
  assert.equal(typeof removed.row, 'function', 'removed.js no longer exports row');
  assert.throws(() => removed.row({ ...WATCH(), kind: 'watch', removedAt: undefined }), /date|removedAt/i);
});

test('R-96 (keep): version 1 has no sort and no filter control on Saved', async () => {
  storage.clear(); store.reset();
  store.toggleWatch({ id: 'a', label: 'A', lastCents: 100, usualCents: 120 });
  const page = await paintScreen(watchlist);
  assert.doesNotMatch(page.html(), /data-act="(sort|filter)|class="[^"]*\b(sort|filter)\b|<select/i);
  page.cleanup();
});

/* ===================================================================== R-97 */

test('R-97 (keep): a list row\'s face is 28 px and never animated, and the row keeps its confidence look', () => {
  for (const [name, markup] of [['Saved', watchlist.row(WATCH(), [])], ['Past scans', pastscans.row(SCAN())]]) {
    const face = /<svg[^>]*class="face[^"]*"[^>]*>/.exec(markup);
    assert.ok(face, `${name}: no face on the row`);
    assert.match(face[0], /width="28"/, `${name}: face is not 28 px`);
    assert.match(face[0], /data-anim="none"/, `${name}: the row face animates`);
  }
  assert.match(pastscans.row(SCAN()), /data-conf="/, 'Past scans row lost its confidence look');
  assert.equal(px(VARS.get('--face-row')), 28);
});

/* ===================================================================== R-98 */

const labelsOf = (bar) => ({
  visible: [...bar.matchAll(/<span class="pbar-l">([^<]*)<\/span>/g)].map((m) => m[1].trim()),
  scan: /class="mini-shutter"[^>]*aria-label="([^"]*)"/.exec(bar)?.[1] ?? null,
});

test('R-98 (keep): the page bar has Saved and You as single-word visible labels', () => {
  for (const active of ['watchlist', 'you']) {
    const { visible } = labelsOf(pagebar.pageBar(active));
    assert.deepEqual(visible, ['Saved', 'You']);
  }
});

test('R-98 (build 7): the scan control on the page bar is also a single word', () => {
  const { scan } = labelsOf(pagebar.pageBar('watchlist'));
  assert.ok(scan, 'no scan control on the page bar');
  assert.equal(scan.trim().split(/\s+/).length, 1, `the scan control is named "${scan}": R-98 asks for three single-word labels`);
});

test('R-98 (build 7): the camera bar keeps three items, as the pages do', () => {
  const camera = read('screens/camera.js');
  const start = camera.indexOf('<div class="cam-bar">');
  const end = camera.indexOf('</div>`;', start);
  const buttons = [...camera.slice(start, end).matchAll(/<button type="button" class="([^"]+)"/g)].map((m) => m[1].split(' ')[0]);
  const flags = read('flags.js');
  const live = /photoId:\s*true/.test(flags) ? buttons : buttons.filter((b) => b !== 'shutter');
  assert.equal(live.length, 3, `the camera bar shows ${live.length} items today (${live.join(', ')}); R-98 keeps three (Saved, the scan control, You)`);
});

test('R-98 (keep): the camera bar labels are Saved and You, one word each', () => {
  const camera = read('screens/camera.js');
  const labels = [...camera.matchAll(/class="nav-label"[^>]*>\$\{escapeHtml\(t\('([a-z_]+)'\)\)\}/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['nav_saved', 'nav_you']);
});

test('R-98 (keep): every page with a bar draws the same bar, and Past scans and Removed sit under Saved', async () => {
  for (const [file, active] of [['pastscans.js', 'watchlist'], ['removed.js', 'watchlist'], ['watchlist.js', 'watchlist'], ['licences.js', 'you'], ['savings.js', 'you'], ['you.js', 'you']]) {
    assert.match(read(`screens/${file}`), new RegExp(`pageBar\\('${active}'\\)`), `${file} no longer draws the ${active} bar`);
  }
  const { html, cleanup } = await renderScreen(watchlist);
  assert.match(html(), /data-act="pastscans"/);
  assert.match(html(), /data-act="removed"/);
  cleanup();
  assert.match(read('screens/you.js'), /data-act="licences"/, 'Licences is no longer one tap under You');
});

test('R-98 (build 7): the rendered Saved, Past scans and Removed pages each carry the three-label bar', async () => {
  const bad = [];
  for (const mod of [watchlist, pastscans, removed]) {
    const page = await renderScreen(mod);
    const bar = /<nav class="page-bar"[\s\S]*?<\/nav>/.exec(page.html())?.[0];
    if (!bar) { bad.push(`${mod.default.id}: no bar`); page.cleanup(); continue; }
    const { visible, scan } = labelsOf(bar);
    const all = [visible[0], scan, visible[1]];
    for (const label of all) if (!label || label.trim().split(/\s+/).length !== 1) bad.push(`${mod.default.id}: label "${label}" is not one word`);
    page.cleanup();
  }
  assert.deepEqual(bad, [], 'R-98: three single-word labels on every page');
});
