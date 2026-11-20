/**
 * The app fits above the phone's keyboard (Aurik, 2026-11-20: "when they click the keyboard it
 * crowds the app make it so the screen adjusted to the screens keyboards").
 *
 * On an iPhone the keyboard does not shrink the page: it slides over it, and WebKit pans the whole
 * app up to show the field, so the sheet's heading and the top of the screen are pushed off and
 * the bottom sits under the keys. lib/keyboard-fit.js reads the visual viewport (what is left
 * above the keyboard), writes it to --app-h and marks <html data-keyboard="open">, and shell.css
 * sizes the app frame to it. The sheets are sized in % of that frame, so they follow on their own.
 *
 * Runs against fake windows; a real keyboard on a real iPhone is still owed (needs a build).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyboardHeight, startKeyboardFit, KEYBOARD_MIN_PX } from '../public/js/lib/keyboard-fit.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** An iPhone 13 web view: 844 tall, keyboard closed. `open(px)` slides a keyboard up. */
function fakeWin({ height = 844, visualViewport = true } = {}) {
  const listeners = {};
  const vv = {
    height,
    offsetTop: 0,
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
  };
  const props = new Map();
  const root = {
    clientHeight: height,
    dataset: {},
    style: {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
    },
  };
  const scrolls = [];
  const shown = [];
  const field = { tagName: 'INPUT', scrollIntoView: (o) => shown.push(o) };
  const win = {
    innerHeight: height,
    visualViewport: visualViewport ? vv : undefined,
    document: { documentElement: root, activeElement: null },
    scrollTo: (x, y) => scrolls.push([x, y]),
    requestAnimationFrame: (fn) => fn(),
  };
  const fire = (type) => (listeners[type] ?? []).forEach((fn) => fn());
  return {
    win, root, props, scrolls, shown, field, listeners,
    open(px, { pan = 0 } = {}) {
      vv.height = height - px; vv.offsetTop = pan; win.document.activeElement = field; fire('resize');
    },
    close() { vv.height = height; vv.offsetTop = 0; win.document.activeElement = null; fire('resize'); },
    pan(px) { vv.offsetTop = px; fire('scroll'); },
  };
}

test('the keyboard height is what the visual viewport lost, never below zero', () => {
  assert.equal(keyboardHeight({ layoutHeight: 844, viewportHeight: 508 }), 336);
  assert.equal(keyboardHeight({ layoutHeight: 844, viewportHeight: 844 }), 0);
  assert.equal(keyboardHeight({ layoutHeight: 844, viewportHeight: 900 }), 0);
  assert.equal(keyboardHeight({ layoutHeight: NaN, viewportHeight: 500 }), 0);
});

test('a keyboard opening sizes the app to the space above it and undoes the pan', () => {
  const f = fakeWin();
  startKeyboardFit(f.win);
  assert.equal(f.root.dataset.keyboard, undefined, 'closed at start');
  f.open(336, { pan: 120 });
  assert.equal(f.root.dataset.keyboard, 'open');
  assert.equal(f.props.get('--app-h'), '508px');
  assert.deepEqual(f.scrolls.at(-1), [0, 0], 'the pan WebKit made is put back');
  assert.deepEqual(f.shown.at(-1), { block: 'nearest' }, 'the field being typed in stays in view');
});

test('the pan WebKit makes while typing is put back too', () => {
  const f = fakeWin();
  startKeyboardFit(f.win);
  f.open(336);
  const before = f.scrolls.length;
  f.pan(80);
  assert.ok(f.scrolls.length > before, 'a scroll of the visual viewport is answered');
  assert.deepEqual(f.scrolls.at(-1), [0, 0]);
});

test('the keyboard closing gives the whole screen back', () => {
  const f = fakeWin();
  startKeyboardFit(f.win);
  f.open(336);
  f.close();
  assert.equal(f.root.dataset.keyboard, undefined);
  assert.equal(f.props.has('--app-h'), false);
});

test('a small change (a browser bar, the iOS suggestion strip alone) is not a keyboard', () => {
  const f = fakeWin();
  startKeyboardFit(f.win);
  f.open(KEYBOARD_MIN_PX - 1);
  assert.equal(f.root.dataset.keyboard, undefined);
});

test('a browser with no visual viewport does nothing and throws nothing', () => {
  const f = fakeWin({ visualViewport: false });
  assert.doesNotThrow(() => startKeyboardFit(f.win));
  assert.equal(f.root.dataset.keyboard, undefined);
});

test('the frame, the page bar and the shop list follow the space above the keyboard', () => {
  const css = read('../public/css/shell.css');
  const rule = css.match(/html\[data-keyboard="open"\]\s*\.device\s*\{([^}]*)\}/);
  assert.ok(rule, 'shell.css sizes .device while the keyboard is open');
  assert.match(rule[1], /height:\s*var\(--app-h/);
  assert.match(rule[1], /min-height:\s*0/);
  assert.match(css, /html\[data-keyboard="open"\]\s*\.page-bar\s*\{[^}]*display:\s*none/,
    'the page bar steps aside so the field and its list get the room');
  const cam = read('../public/js/screens/camera.js');
  assert.doesNotMatch(cam, /max-height:42vh/, 'vh ignores the keyboard; the shop list is sized from --app-h');
  assert.match(cam, /max-height:calc\(var\(--app-h, 100dvh\) \* 0\.42\)/);
});

test('the app starts the fit, and the viewport tag stays one Safari understands', () => {
  assert.match(read('../public/js/main.js'), /startKeyboardFit\(\)/);
  // interactive-widget is Chrome-only; WebKit logs it as an error on every load (seen in the
  // WebKit sweep 2026-11-20), and the Android app already resizes for its keyboard.
  assert.doesNotMatch(read('../public/index.html'), /interactive-widget/);
});
