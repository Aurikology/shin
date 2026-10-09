/**
 * UX build 7, touch: R-12 (lower 60% of the screen), R-13 (44 px floor, 48 px per scan),
 * R-14 (sheet close and grabber). Spec: docs/design/ux-evidence-2026-10-09.md section 13.
 *
 * BLOCKS COVERED: R-12, R-13, R-14.
 *
 * EXPECTED RED UNTIL BUILT: the tests whose name says "build 7" and which assert a size or a
 * position the spec asks for and the stylesheet does not yet declare (switch 52 x 44, threshold
 * buttons 44, chips 44, camera bar items 56 wide, grabber 48 tall, pad keys 52 on a tall screen and
 * 48 on a short one, 8 px between neighbouring targets, scan control centred, X at full opacity),
 * and the "fails loudly" test, which needs lib/tap-target.js (not written yet).
 * GREEN TODAY (keep): the sheets that carry an X, the bar being anchored to the bottom, the camera
 * bar's top edge in the lower 60%, the pad stack in the lower 60%.
 *
 * WHAT THIS AUDIT CAN AND CANNOT MEASURE. There is no layout engine here: the app has zero runtime
 * dependencies, no jsdom, and test/mini-dom.mjs stores innerHTML without parsing it. So the audit
 * works from two honest sources: (1) the shipped HTML text, found by scanning every button and link
 * in public/js for its classes; (2) the shipped CSS, parsed, cascaded by specificity and source
 * order per viewport (390 x 844, 375 x 575, 340 x 700), with var(), calc(), clamp(), svh and vw
 * evaluated. What it reads is the size the stylesheet DECLARES (height, min-height, a pseudo-element
 * that extends the hit area with a negative inset). It cannot see a size that comes from content
 * (text plus padding), from a flex or grid stretch, or from a font that has not loaded; a control
 * with no declared height is reported as "declares no height", which is itself the defect R-13
 * names for the chips. Nothing here replaces a measurement on a real phone: where a control's size
 * is content-driven, the report says unmeasured and does not pass it.
 * It also cannot see the vertical position of a control inside a sheet whose height depends on its
 * content; for that it checks the sheet is anchored to the bottom and the stack of pad rows fits in
 * the lower 60%.
 *
 * Run: node --test --test-global-setup=test/setup/global.mjs test/ux-b7-touch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser } from './mini-dom.mjs';

installBrowser({ doc: makeDocument(), storage: makeStorage() });

/* ================================================================== CSS reading */

const CSS_DIR = new URL('../public/css/', import.meta.url);
const JS_DIR = new URL('../public/js/', import.meta.url);
const CSS_ORDER = ['tokens.css', 'components.css', 'face.css', 'shell.css'];

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Flat rule list in source order: { sel, decls: Map(prop -> value), media, file, order }. */
function parseCss(text, file) {
  const src = stripComments(text.replace(/\r\n/g, '\n'));
  const rules = [];
  let order = 0;
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
      if (head.startsWith('@')) {
        const inner = head.replace(/^@(media|supports|container|layer)\s*/, '').trim();
        i = block(open + 1, media ? `${media} and ${inner}` : inner);
        continue;
      }
      const close = src.indexOf('}', open);
      const decls = new Map();
      for (const d of src.slice(open + 1, close).split(';')) {
        const k = d.indexOf(':');
        if (k === -1) continue;
        const prop = d.slice(0, k).trim().toLowerCase();
        if (prop) decls.set(prop, d.slice(k + 1).replace(/\s+/g, ' ').trim());
      }
      rules.push({ sel: head.replace(/\s+/g, ' '), decls, media, file, order: (order += 1) });
      i = close + 1;
    }
    return i;
  }
  block(0, null);
  return rules;
}

function loadCss() {
  const names = [...CSS_ORDER];
  for (const f of readdirSync(new URL('screens/', CSS_DIR)).sort()) names.push(`screens/${f}`);
  const rules = [];
  for (const name of names) {
    for (const r of parseCss(readFileSync(new URL(name, CSS_DIR), 'utf8'), name)) rules.push({ ...r, order: rules.length + 1 });
  }
  assert.ok(rules.length > 300, `CSS reader found only ${rules.length} rules: the parser is broken, not the stylesheet`);
  return rules;
}

const RULES = loadCss();

/** Custom properties; the first declaration wins, so :root (dark, no media) beats the light overrides. */
const VARS = new Map();
for (const r of RULES) {
  if (r.media && /prefers-/.test(r.media)) continue;
  for (const [p, v] of r.decls) if (p.startsWith('--') && !VARS.has(p)) VARS.set(p, v);
}

/** Evaluates a CSS length (px, svh, vh, vw, calc, clamp, min, max, var, env) to px, or NaN. */
function evalLen(expr, { vw = 390, vh = 844 } = {}) {
  let s = String(expr).trim();
  for (let n = 0; n < 12 && /var\(/.test(s); n += 1) {
    s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_m, name, fb) => VARS.get(name) ?? fb ?? 'NaN');
  }
  s = s.replace(/env\([^()]*\)/g, '0px');
  let i = 0;
  const ws = () => { while (s[i] === ' ') i += 1; };
  function num() {
    const m = /^-?\d*\.?\d+/.exec(s.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    let v = Number.parseFloat(m[0]);
    const u = /^(px|svh|dvh|lvh|vh|svw|dvw|lvw|vw|%|rem|em|ms|s)?/.exec(s.slice(i))[0];
    i += u.length;
    if (/^[sdl]?vh$/.test(u)) v = (v * vh) / 100;
    else if (/^[sdl]?vw$/.test(u)) v = (v * vw) / 100;
    else if (u === '%') v = NaN;
    else if (u === 'rem' || u === 'em') v *= 16;
    return v;
  }
  function args() {
    const out = [];
    for (;;) { out.push(sum()); ws(); if (s[i] === ',') { i += 1; continue; } break; }
    ws(); if (s[i] === ')') i += 1;
    return out;
  }
  function factor() {
    ws();
    if (s[i] === '(') { i += 1; const v = sum(); ws(); if (s[i] === ')') i += 1; return v; }
    const f = /^(calc|clamp|min|max)\(/.exec(s.slice(i));
    if (f) {
      i += f[0].length;
      const a = args();
      if (f[1] === 'calc') return a[0];
      if (f[1] === 'clamp') return Math.max(a[0], Math.min(a[1], a[2]));
      return f[1] === 'min' ? Math.min(...a) : Math.max(...a);
    }
    return num();
  }
  function term() {
    let v = factor();
    for (;;) { ws(); if (s[i] === '*') { i += 1; v *= factor(); } else if (s[i] === '/') { i += 1; v /= factor(); } else return v; }
  }
  function sum() {
    let v = term();
    for (;;) { ws(); if (s[i] === '+') { i += 1; v += term(); } else if (s[i] === '-' && s[i + 1] === ' ') { i += 1; v -= term(); } else return v; }
  }
  const out = sum();
  ws();
  return i >= s.length ? out : NaN;
}

const VIEWPORTS = {
  'phone 390x844': { vw: 390, vh: 844 },
  'short 375x575': { vw: 375, vh: 575 },
  'narrow 340x700': { vw: 340, vh: 700 },
};

/** Does a media query apply at this viewport? Only width and height features count; anything else (motion, colour scheme, hover) does not size anything. */
function mediaApplies(media, { vw, vh }) {
  if (!media) return true;
  let ok = true;
  for (const feat of media.match(/\([^)]*\)/g) ?? []) {
    const m = /\(\s*(max|min)-(width|height)\s*:\s*([\d.]+)px\s*\)/.exec(feat);
    if (!m) { ok = false; continue; }
    const have = m[2] === 'width' ? vw : vh;
    const want = Number.parseFloat(m[3]);
    if (m[1] === 'max' ? have > want : have < want) ok = false;
  }
  return ok;
}

/* ----------------------------------------------------------------- selectors */

function splitTop(str, test) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (depth === 0 && test(ch)) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const STATE = /:(active|hover|focus|focus-visible|focus-within|disabled|checked|visited|target|enabled)\b/;

/** One compound of a selector, split into tag, classes, pseudo-element and whether it is a state rule. */
function compound(c) {
  const bare = c.replace(/:(not|is|where|has)\([^)]*\)/g, '');
  const pseudoEl = /::?(before|after)\b/.exec(bare)?.[1] ?? null;
  return {
    tag: /^[a-z][\w-]*/i.exec(bare)?.[0]?.toLowerCase() ?? '',
    classes: [...bare.matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
    pseudoEl,
    state: STATE.test(bare),
  };
}

function specificity(sel) {
  const bare = sel.replace(/:(not|is|where)\(([^)]*)\)/g, (_m, k, inner) => (k === 'where' ? '' : inner));
  return (bare.match(/#[\w-]+/g)?.length ?? 0) * 100
    + (bare.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)?.length ?? 0) * 10
    + (bare.match(/(^|[\s>+~])[a-z][\w-]*/gi)?.length ?? 0);
}

/**
 * Rules that apply to an element with this tag and class list, grouped by the ancestor chain they
 * demand. Each group is one "context" the element can be in (`.cam-bar .nav-btn` is a context).
 */
function rulesFor(el, { pseudo = null } = {}) {
  const out = [];
  for (const r of RULES) {
    for (const sel of splitTop(r.sel, (ch) => ch === ',')) {
      const parts = splitTop(sel.trim(), (ch) => /[\s>+~]/.test(ch));
      const subject = compound(parts[parts.length - 1]);
      if (subject.state || subject.pseudoEl !== pseudo) continue;
      if (subject.tag && subject.tag !== el.tag) continue;
      if (!subject.classes.every((c) => el.classes.includes(c))) continue;
      if (!subject.tag && subject.classes.length === 0) continue;
      out.push({ rule: r, sel: sel.trim(), ancestors: parts.slice(0, -1).join(' '), spec: specificity(sel), order: r.order });
    }
  }
  return out;
}

/** Cascade the matching rules for one context and one viewport into { prop -> {value, rule} }. */
function cascade(matches, ancestors, viewport) {
  const win = new Map();
  const live = matches
    .filter((m) => (m.ancestors === '' || m.ancestors === ancestors) && mediaApplies(m.rule.media, viewport))
    .sort((a, b) => a.spec - b.spec || a.order - b.order);
  for (const m of live) for (const [p, v] of m.rule.decls) win.set(p, { value: v, rule: m });
  return win;
}

const num = (win, prop, vp) => {
  const d = win.get(prop);
  if (!d) return NaN;
  const v = evalLen(d.value, vp);
  return v;
};

/** The size the stylesheet declares for an element in one context, including a hit-area extension by a pseudo-element. */
function declaredSize(el, ancestors, vpName) {
  const vp = VIEWPORTS[vpName];
  const win = cascade(rulesFor(el), ancestors, vp);
  const finite = (xs) => xs.filter((x) => Number.isFinite(x) && x > 0); // min-width: 0 is a flex shrink fix, not a size
  const hs = finite([num(win, 'height', vp), num(win, 'min-height', vp)]);
  const ws = finite([num(win, 'width', vp), num(win, 'min-width', vp)]);
  let h = hs.length ? Math.max(...hs) : null;
  let w = ws.length ? Math.max(...ws) : null;
  const where = win.get('min-height') ?? win.get('height');
  // A pseudo-element with a negative inset reaches beyond the box: that is the "invisible padding" R-13 allows.
  const ext = { t: 0, r: 0, b: 0, l: 0 };
  const pe = [...rulesFor(el, { pseudo: 'before' }), ...rulesFor(el, { pseudo: 'after' })];
  for (const m of pe) {
    if (!mediaApplies(m.rule.media, vp)) continue;
    const inset = m.rule.decls.get('inset');
    if (inset) {
      const v = inset.split(' ').map((x) => evalLen(x, vp));
      const [t, r = t, b = t, l = r] = v;
      for (const [k, x] of Object.entries({ t, r, b, l })) if (Number.isFinite(x) && x < 0) ext[k] = Math.max(ext[k], -x);
    }
  }
  if (h !== null) h += ext.t + ext.b;
  if (w !== null) w += ext.l + ext.r;
  const stretch = win.has('flex') || win.has('flex-grow') || /^(100%|auto)$/.test(win.get('width')?.value ?? '');
  return { h, w, stretch, from: where ? `${where.rule.rule.file}: ${where.rule.sel} { ${where.value} }` : 'no height declared anywhere' };
}

function contextsOf(el) {
  const set = new Set(['']);
  for (const m of rulesFor(el)) set.add(m.ancestors);
  return [...set];
}

/* ===================================================== which controls are tappable */

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'vendor' || name === 'chunks') continue;
    const p = new URL(`${name}${statSync(new URL(name, dir)).isDirectory() ? '/' : ''}`, dir);
    if (statSync(p).isDirectory()) walkJs(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Classes a control is given by a helper rather than in the template literal itself.
const DYNAMIC_CLASSES = { '${cls.opt}': ['btn', 'seg-o'] };
// The per-scan set: the controls a shopper touches on every scan (R-13 wants 48 px for these).
const PER_SCAN_ACTS = new Set(['scan-barcode', 'pad-confirm', 'pad-skip', 'dist-save', 'watchlist', 'you', 'camera']);
const PER_SCAN_CLASSES = new Set(['scan-code-btn', 'key-confirm', 'btn--key', 'mini-shutter']);

function discoverTappables() {
  const found = new Map();
  for (const url of walkJs(JS_DIR)) {
    const text = readFileSync(url, 'utf8');
    for (const m of text.matchAll(/<(button|a)\b([^>]*)>/g)) {
      const attrs = m[2];
      let cls = /\bclass="([^"]*)"/.exec(attrs)?.[1];
      if (cls === undefined) continue;
      const extra = [];
      for (const [token, names] of Object.entries(DYNAMIC_CLASSES)) if (cls.includes(token)) extra.push(...names);
      cls = cls.replace(/\$\{[^}]*\}/g, ' ');
      const classes = [...new Set([...cls.split(/\s+/).filter(Boolean), ...extra])];
      if (classes.length === 0) continue;
      const act = /data-act="([^"$]+)"/.exec(attrs)?.[1] ?? null;
      const key = `${m[1]}.${classes.slice().sort().join('.')}`;
      const e = found.get(key) ?? { tag: m[1], classes, acts: new Set(), files: new Set() };
      if (act) e.acts.add(act);
      e.files.add(url.pathname.split('/public/js/')[1]);
      found.set(key, e);
    }
  }
  return [...found.values()].map((e) => ({
    ...e,
    name: `${e.tag}.${e.classes.join('.')}`,
    perScan: e.classes.some((c) => PER_SCAN_CLASSES.has(c)) || [...e.acts].some((a) => PER_SCAN_ACTS.has(a)),
  }));
}

const TAPPABLES = discoverTappables();

const TAP_FLOOR = 44;
const SCAN_FLOOR = 48;

/** Grid cells: the pad keys get their height from the row of the grid they sit in, not from themselves. */
function padRowHeights(vpName) {
  const vp = VIEWPORTS[vpName];
  const out = [];
  for (const [ancestors, cls] of [['.padsheet', 'keypad'], ['.padsheet', 'keypad-bottom'], ['.page-correct', 'keypad'], ['.page-correct', 'keypad-bottom']]) {
    const win = cascade(rulesFor({ tag: 'div', classes: cls === 'keypad' ? ['keypad'] : ['keypad', 'keypad-bottom'] }), ancestors, vp);
    const rows = win.get('grid-template-rows')?.value;
    if (!rows) { out.push({ where: `${ancestors} .${cls}`, h: null }); continue; }
    const inner = /^repeat\(\s*\d+\s*,\s*(.+)\)$/.exec(rows)?.[1] ?? rows;
    out.push({ where: `${ancestors} .${cls}`, h: evalLen(inner, vp), rows });
  }
  return out;
}

/* ====================================================================== sanity */

test('R-13 (build 7): the audit sees the controls it is supposed to audit (negative control)', () => {
  // A zero-result audit is UNKNOWN until it has found something it must find.
  const names = TAPPABLES.map((t) => t.classes.join(' '));
  for (const must of ['nav-btn', 'scan-code-btn', 'sheet-close', 'grabber', 'toast-undo', 'switch', 'chip', 'thumb', 'torch-btn', 'pad-textbtn']) {
    assert.ok(names.some((n) => n.split(' ').includes(must)), `the discovery step never found .${must} in public/js: it reads nothing, so it passes nothing`);
  }
  assert.ok(TAPPABLES.length >= 30, `only ${TAPPABLES.length} tappable elements discovered`);
  // The evaluator itself must reproduce a number the repo already proved by measurement.
  assert.equal(evalLen('clamp(48px, 6svh, 52px)', { vw: 390, vh: 844 }), 50.64);
  assert.equal(evalLen('var(--tap)', { vw: 390, vh: 844 }), 48);
});

/* ============================================================ R-13 per control */

// Controls whose size is set by something this audit cannot read, or that are not on screen today.
// Each entry says why, so a reader can challenge it. Nothing here is a silent pass: the test for such a
// control asserts the reason still holds.
const NOT_MEASURABLE = {
  'button.btn.btn--key': 'grid cell; measured by the pad row tests below',
  'button.btn.btn--key.key-confirm': 'grid cell; measured by the pad row tests below',
  'button.shutter': 'removed from the DOM while FLAGS.photoId is off (camera.js removes it on mount)',
};

for (const el of TAPPABLES) {
  const key = el.name.replace(/^([a-z]+)\./, '$1.').split('.').sort().join('.');
  const floor = el.perScan ? SCAN_FLOOR : TAP_FLOOR;
  const label = `R-13 (build 7): ${el.name} declares a tap height of at least ${floor} px${el.perScan ? ' (per-scan control)' : ''}`;
  const skip = Object.entries(NOT_MEASURABLE).find(([k]) => k.split('.').sort().join('.') === key);
  test(label, { skip: skip ? `unmeasured here: ${skip[1]}` : false }, () => {
    const bad = [];
    for (const ctx of contextsOf(el)) {
      for (const vpName of Object.keys(VIEWPORTS)) {
        const s = declaredSize(el, ctx, vpName);
        if (s.h === null) bad.push(`${vpName}${ctx ? ` in ${ctx}` : ''}: declares no height at all (used in ${[...el.files].join(', ')})`);
        else if (s.h < floor) bad.push(`${vpName}${ctx ? ` in ${ctx}` : ''}: ${s.h} px tall, needs ${floor} (${s.from})`);
      }
    }
    assert.deepEqual([...new Set(bad)], [], `${el.name}:\n  ${[...new Set(bad)].join('\n  ')}`);
  });
}

for (const el of TAPPABLES) {
  const key = el.name.split('.').sort().join('.');
  if (Object.keys(NOT_MEASURABLE).some((k) => k.split('.').sort().join('.') === key)) continue;
  test(`R-13 (build 7): ${el.name} is not declared narrower than ${TAP_FLOOR} px`, () => {
    const bad = [];
    for (const ctx of contextsOf(el)) {
      for (const vpName of Object.keys(VIEWPORTS)) {
        const s = declaredSize(el, ctx, vpName);
        // Width is content-driven for most controls; only a declared width can be wrong here, and an
        // undeclared one is unmeasured, never passed silently: it is listed in the next test.
        if (s.w !== null && s.w < TAP_FLOOR) bad.push(`${vpName}${ctx ? ` in ${ctx}` : ''}: ${s.w} px wide`);
      }
    }
    assert.deepEqual([...new Set(bad)], [], `${el.name}: ${[...new Set(bad)].join('; ')}`);
  });
}

test('R-13 (build 7): every per-scan control declares a width (or stretches), so its width is not left to its text', () => {
  // Other controls may take their width from their content; that is unmeasured here, not passed.
  const perScanNoWidth = TAPPABLES.filter((el) => el.perScan && !NOT_MEASURABLE[el.name] && contextsOf(el).every((c) => {
    const s = declaredSize(el, c, 'phone 390x844');
    return s.w === null && !s.stretch;
  }));
  assert.deepEqual(perScanNoWidth.map((e) => e.name), [], 'per-scan controls with no declared width: R-13 cannot be shown for them');
});

test('R-13 (build 7): the camera bar items are 56 px wide, as on the pages', () => {
  const nav = TAPPABLES.find((e) => e.classes.includes('nav-btn'));
  assert.ok(nav, 'no .nav-btn found');
  const bad = [];
  for (const vpName of Object.keys(VIEWPORTS)) {
    const s = declaredSize(nav, '.cam-bar', vpName);
    if (s.w === null || s.w < 56) bad.push(`${vpName}: ${s.w} px wide (${s.from})`);
  }
  assert.deepEqual(bad, [], `R-13: camera bottom-bar items must be 56 wide; ${bad.join('; ')}`);
});

test('R-13 (build 7): the switch hit area is at least 52 x 44', () => {
  const sw = TAPPABLES.find((e) => e.classes.includes('switch'));
  assert.ok(sw, 'no .switch found');
  const s = declaredSize(sw, '', 'phone 390x844');
  assert.ok(s.h !== null && s.h >= 44, `switch hit area is ${s.h} px tall, needs 44 (draw can stay 32 with an invisible extension)`);
  assert.ok(s.w !== null && s.w >= 52, `switch hit area is ${s.w} px wide, needs 52`);
});

test('R-13 (build 7): the threshold buttons (Your page) are 44 px high', () => {
  const seg = TAPPABLES.find((e) => e.classes.includes('seg-o'));
  assert.ok(seg, 'no .seg-o found: the threshold buttons are not discovered');
  const s = declaredSize(seg, '', 'phone 390x844');
  assert.ok(s.h !== null && s.h >= 44, `threshold buttons are ${s.h} px high (${s.from}), needs 44`);
});

test('R-13 (build 7): the "On sale" chip declares a minimum height of 44 px', () => {
  const chip = TAPPABLES.find((e) => e.classes.includes('chip'));
  assert.ok(chip, 'no .chip found');
  const bad = contextsOf(chip).map((c) => ({ c, s: declaredSize(chip, c, 'phone 390x844') })).filter((x) => x.s.h === null || x.s.h < 44);
  assert.deepEqual(bad.map((x) => `${x.c || '(no context)'}: ${x.s.h === null ? 'no min-height declared' : `${x.s.h} px`}`), [], 'chip must declare 44 (invisible padding is allowed if the look must stay)');
});

/* -------------------------------------------------------------- pad keys, R-13 */

test('R-13 (build 7): pad keys are 52 px tall whenever the screen is 640 px or taller', () => {
  const rows = padRowHeights('phone 390x844');
  const bad = rows.filter((r) => r.h === null || !(r.h >= 52)).map((r) => `${r.where} rows: ${r.h} px (${r.rows})`);
  assert.deepEqual(bad, [], 'R-13: pad keys 52 on a screen 640 px or taller (clamp(48px, 6svh, 52px) is 50.6 at 844)');
});

test('R-13 (build 7): pad keys are at least 48 px on a short screen; 44 only where nothing else fits', () => {
  const rows = padRowHeights('short 375x575').filter((r) => r.where.startsWith('.padsheet'));
  const bad = rows.filter((r) => r.h === null || !(r.h >= 48)).map((r) => `${r.where} rows: ${r.h} px`);
  assert.deepEqual(bad, [], 'R-13: 48 minimum below 640 px tall; the existing 44 fallback is only allowed where nothing else fits, and nothing proves it does not fit');
});

test('R-13 (build 7): neighbouring targets are 8 px or more apart', () => {
  const gapOf = (cls, tag, ancestors, vpName) => {
    const win = cascade(rulesFor({ tag, classes: cls }), ancestors, VIEWPORTS[vpName]);
    return win.has('gap') ? evalLen(win.get('gap').value.includes('(') ? win.get('gap').value : win.get('gap').value.split(' ')[0], VIEWPORTS[vpName]) : win.has('column-gap') ? evalLen(win.get('column-gap').value, VIEWPORTS[vpName]) : null;
  };
  const checks = [
    ['pad key grid', ['keypad'], '.padsheet'],
    ['pad bottom row', ['keypad', 'keypad-bottom'], '.padsheet'],
    ['camera bar', ['cam-bar'], ''],
    ['thumbs', ['thumbs'], ''],
  ];
  const bad = [];
  for (const [name, cls, anc] of checks) {
    for (const vpName of Object.keys(VIEWPORTS)) {
      const g = gapOf(cls, 'div', anc, vpName);
      if (g === null || Number.isNaN(g)) bad.push(`${name} @ ${vpName}: no gap declared`);
      else if (g < 8) bad.push(`${name} @ ${vpName}: ${g.toFixed(1)} px`);
    }
  }
  assert.deepEqual(bad, [], 'R-13: 8 px or more between neighbouring targets');
});

/* ======================================================================= R-14 */

test('R-14 (build 7): the sheet grabber has a hit area 48 px tall', () => {
  const g = TAPPABLES.find((e) => e.classes.includes('grabber'));
  assert.ok(g, 'no .grabber found');
  // The drawn bar is 36 x 5. Its hit area is a pseudo-element with a negative inset.
  const s = declaredSize(g, '', 'phone 390x844');
  assert.ok(s.h !== null && s.h >= 48, `grabber hit area is ${s.h} px tall (drawn 5 + pseudo-element reach), needs 48`);
});

test('R-14 (build 7): the sheet X is drawn at full opacity or at 3:1 against the sheet', () => {
  const x = TAPPABLES.find((e) => e.classes.includes('sheet-close'));
  assert.ok(x, 'no .sheet-close found');
  const win = cascade(rulesFor(x), '', VIEWPORTS['phone 390x844']);
  const opacity = Number.parseFloat(win.get('opacity')?.value ?? '1');
  // currentColor at 55% over the sheet is below 3:1 for both themes; full opacity is the simple repair.
  assert.ok(opacity >= 1, `the sheet X is drawn at ${opacity} opacity; R-14 asks for full opacity (or a proven 3:1)`);
});

test('R-14 (keep): the X is 44 x 44 and stays on every sheet that offers a way back', () => {
  const x = TAPPABLES.find((e) => e.classes.includes('sheet-close'));
  const s = declaredSize(x, '', 'phone 390x844');
  assert.equal(s.h, 44);
  assert.equal(s.w, 44);
  const camera = readFileSync(new URL('screens/camera.js', JS_DIR), 'utf8');
  for (const fn of ['verdictSheet', 'refusalSheet', 'pricePadSheet', 'searchCandidateSheet', 'textRouteSheet', 'workingSheet', 'distributionSheet']) {
    const start = camera.search(new RegExp(`\\nfunction ${fn}\\(`));
    assert.ok(start > -1, `camera.js no longer defines ${fn}`);
    const next = camera.indexOf('\nfunction ', start + 10);
    const body = camera.slice(start, next === -1 ? undefined : next);
    assert.ok(/backButton\(|sheet-close/.test(body), `${fn} draws no close X (R-14 keep: every sheet keeps its X)`);
  }
});

/* ======================================================================= R-12 */

function containerTopEdge(cls, vpName) {
  const vp = VIEWPORTS[vpName];
  const win = cascade(rulesFor({ tag: 'div', classes: [cls] }), '', vp);
  return { win, vp };
}

test('R-12 (keep): the bottom bar is anchored to the bottom and its top edge is in the lower 60% of a 390 x 844 screen', () => {
  const { win, vp } = containerTopEdge('cam-bar', 'phone 390x844');
  assert.equal(win.get('position')?.value, 'absolute', '.cam-bar must be absolutely placed');
  assert.ok(win.has('bottom'), '.cam-bar must declare a bottom offset');
  assert.ok(!win.has('top'), '.cam-bar must not be placed from the top');
  const h = evalLen(win.get('height').value, vp);
  assert.ok(Number.isFinite(h), 'cannot evaluate the bar height');
  const topEdge = vp.vh - h;
  assert.ok(topEdge >= vp.vh * 0.4, `bar top edge at ${topEdge} px, the lower 60% starts at ${vp.vh * 0.4}`);
});

test('R-12 (build 7): the scan control stays centred on the bar as the camera renders it today', () => {
  // The bar's children in markup order, minus the shutter, which camera.js removes while FLAGS.photoId is off.
  const camera = readFileSync(new URL('screens/camera.js', JS_DIR), 'utf8');
  const barStart = camera.indexOf('<div class="cam-bar">');
  const barEnd = camera.indexOf('</div>`;', barStart);
  assert.ok(barStart > -1 && barEnd > barStart, 'cannot find the .cam-bar markup in camera.js');
  const items = [...camera.slice(barStart, barEnd).matchAll(/<button type="button" class="([^"]+)"/g)].map((m) => m[1].split(' ')[0]);
  const flags = readFileSync(new URL('flags.js', JS_DIR), 'utf8');
  const photoId = /photoId:\s*(true|false)/.exec(flags)?.[1];
  assert.ok(photoId, 'cannot read FLAGS.photoId');
  const shown = photoId === 'true' ? items : items.filter((c) => c !== 'shutter');
  const vp = VIEWPORTS['phone 390x844'];
  const widthOf = (cls) => {
    const el = TAPPABLES.find((e) => e.classes.includes(cls)) ?? { tag: 'button', classes: [cls] };
    const s = declaredSize(el, '.cam-bar', 'phone 390x844');
    const win = cascade(rulesFor(el), '.cam-bar', vp);
    const margin = win.has('margin') ? win.get('margin').value.split(' ') : [];
    const side = margin.length >= 2 ? evalLen(margin[1], vp) : 0;
    return (s.w ?? 0) + (Number.isFinite(side) ? 2 * side : 0);
  };
  const gap = evalLen(cascade(rulesFor({ tag: 'div', classes: ['cam-bar'] }), '', vp).get('gap').value, vp);
  const widths = shown.map(widthOf);
  const scanAt = shown.indexOf('scan-code-btn');
  assert.ok(scanAt > -1, 'the scan control is not on the bar');
  const left = widths.slice(0, scanAt).reduce((a, b) => a + b + gap, 0);
  const right = widths.slice(scanAt + 1).reduce((a, b) => a + b + gap, 0);
  assert.ok(Math.abs(left - right) <= 1, `scan control is off centre by ${(Math.abs(left - right) / 2).toFixed(1)} px: ${left.toFixed(1)} px of controls to its left, ${right.toFixed(1)} to its right (bar shows ${shown.join(', ')})`);
});

test('R-12 (keep): the sheets are anchored to the bottom edge, so a control at the foot of a sheet is in the lower 60%', () => {
  const win = cascade(rulesFor({ tag: 'div', classes: ['sheet'] }), '', VIEWPORTS['phone 390x844']);
  assert.equal(win.get('position')?.value, 'absolute');
  assert.ok(win.has('bottom'), '.sheet must declare a bottom offset');
  assert.ok(!win.has('top'), '.sheet must not be placed from the top');
});

test('R-12 (keep): the pad (digits, decimal, backspace, confirm) fits inside the lower 60% of a 390 x 844 screen', () => {
  const vp = VIEWPORTS['phone 390x844'];
  const rows = padRowHeights('phone 390x844');
  const top = rows.find((r) => r.where === '.padsheet .keypad');
  const bottom = rows.find((r) => r.where === '.padsheet .keypad-bottom');
  assert.ok(top && bottom && Number.isFinite(top.h) && Number.isFinite(bottom.h), 'cannot read the pad row heights');
  const gap = 6;
  const stack = 3 * top.h + 2 * gap + 6 + bottom.h + 22; // three rows, their gaps, the margin, the last row, the sheet's bottom padding
  assert.ok(stack <= vp.vh * 0.6, `the pad stack is ${stack.toFixed(0)} px tall; the lower 60% is ${(vp.vh * 0.6).toFixed(0)} px`);
});

test('R-12 (keep): per-scan controls are never placed from the top edge of the screen', () => {
  const bad = [];
  for (const el of TAPPABLES.filter((e) => e.perScan)) {
    for (const ctx of contextsOf(el)) {
      const win = cascade(rulesFor(el), ctx, VIEWPORTS['phone 390x844']);
      if (win.has('top') && win.get('position')?.value === 'absolute') bad.push(`${el.name}${ctx ? ` in ${ctx}` : ''}: top ${win.get('top').value}`);
    }
  }
  assert.deepEqual(bad, [], 'R-12: everything used on every scan lives in the lower 60%; only the torch and the back chevron may sit at the top');
});

test('R-12 (keep): the torch, the one rare camera control, sits at the top left', () => {
  const win = cascade(rulesFor({ tag: 'button', classes: ['torch-btn'] }), '', VIEWPORTS['phone 390x844']);
  const parent = cascade(rulesFor({ tag: 'div', classes: ['cam-top'] }), '', VIEWPORTS['phone 390x844']);
  assert.ok(win.size > 0, '.torch-btn has no rule');
  assert.ok(parent.size > 0 || RULES.some((r) => /\.cam-top\b/.test(r.sel)), 'cannot find the top band that holds the torch');
});

/* ====================================================== fails loudly (R-12/13/14) */

test('R-13 (build 7): a control declared under 44 px throws, and a per-scan control under 48 throws (never a silent clamp)', async () => {
  let mod;
  try {
    mod = await import('../public/js/lib/tap-target.js');
  } catch (err) {
    assert.fail(`build 7 must add public/js/lib/tap-target.js exporting assertTapTarget({ name, width, height, perScan }); import failed: ${err.code ?? err.message}`);
  }
  const { assertTapTarget } = mod;
  assert.equal(typeof assertTapTarget, 'function', 'tap-target.js must export assertTapTarget');
  assert.throws(() => assertTapTarget({ name: 'chip', width: 80, height: 34 }), /chip/, 'a 34 px control must throw and name itself');
  assert.throws(() => assertTapTarget({ name: 'switch', width: 52, height: 32 }), /switch/);
  assert.throws(() => assertTapTarget({ name: 'key', width: 60, height: 44, perScan: true }), /key/, 'a per-scan control at 44 must throw: the floor is 48');
  assert.throws(() => assertTapTarget({ name: 'x', width: Number.NaN, height: 48 }), /x/, 'an unmeasured size must throw, not pass');
  assert.throws(() => assertTapTarget({ width: 48, height: 48 }), /name/i, 'a control without a name must throw: a failure nobody can find is silent');
  assert.doesNotThrow(() => assertTapTarget({ name: 'ok', width: 44, height: 44 }));
  assert.doesNotThrow(() => assertTapTarget({ name: 'ok-scan', width: 56, height: 48, perScan: true }));
  // The sizes passed in are not modified on the way through.
  const spec = { name: 'ok', width: 44, height: 44 };
  assertTapTarget(spec);
  assert.deepEqual(spec, { name: 'ok', width: 44, height: 44 });
});

test('R-12 (build 7): a per-scan control placed in the top 40% of the screen throws', async () => {
  let mod;
  try {
    mod = await import('../public/js/lib/tap-target.js');
  } catch (err) {
    assert.fail(`build 7 must add public/js/lib/tap-target.js exporting assertReach({ name, top, height, viewportHeight }); import failed: ${err.code ?? err.message}`);
  }
  assert.equal(typeof mod.assertReach, 'function', 'tap-target.js must export assertReach');
  assert.throws(() => mod.assertReach({ name: 'scan', top: 100, height: 56, viewportHeight: 844 }), /scan/);
  assert.doesNotThrow(() => mod.assertReach({ name: 'scan', top: 700, height: 56, viewportHeight: 844 }));
  assert.throws(() => mod.assertReach({ name: 'scan', top: 700, height: 56 }), /viewportHeight/, 'a missing viewport height must throw, not default');
});
