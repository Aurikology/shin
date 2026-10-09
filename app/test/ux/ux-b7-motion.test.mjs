/**
 * UX build 7, motion: R-86 (sheet rise 260 ms, dismiss 200 ms, ease-out both ways, position change 300 ms),
 * R-87 (no movement on pad keys and bar taps), R-88 (confidence dots at once), R-89 (first draw with the
 * sheet, bell morph 400 ms or less, never a counting number), R-90 (the 900 ms sweep gone), R-91 (the
 * reduced-motion table), R-17 (keep: reduced motion honoured, no loop near 5 s). Spec:
 * docs/design/ux-evidence-2026-10-09.md section 13, build 7.
 *
 * BLOCKS COVERED: R-86, R-87, R-88, R-89, R-90, R-91, R-17.
 *
 * EXPECTED RED UNTIL BUILT: the sheet rises in 420 ms not 260; there is no 200 ms dismiss; position
 * changes take 320 ms; press feedback still scales the nav buttons and the scan control; the bell
 * morph is 620 ms; the chart draws over about 1.5 s, not with the sheet; the 900 ms sweep is still in
 * camera.css; under reduced motion the sheet appears with no fade and the scan control still scales;
 * the registry that throws on an ease-in curve (lib/motion.js) does not exist.
 * GREEN TODAY (keep): the rise and the position change already use ease-out curves; every other enter
 * or exit curve; confidence dots carry no sequence; the bell morph never counts through numbers; the
 * stylesheets named by R-17 honour reduced motion; the face loops stop.
 * RED DEFECT IN A KEEP BLOCK: R-17 "no loop has a period near 5 s": camera.css runs camEyeGlance at
 * 5200 ms, infinite, with ease-in-out. See the test of that name.
 *
 * WHAT JSDOM CANNOT MEASURE. No browser, no compositor: there is no frame to time. The durations and
 * curves are READ from the stylesheets and from the animation code (the cascade is approximated by
 * source order and exact selector, which is enough for the durations asserted here), not observed. The
 * bell morph is the exception: camera.js morphBell is run for real against a fake requestAnimationFrame
 * clock, so its length and its numbers are observed. Not measured: dropped frames, whether 260 ms
 * "feels" like a snap (R-86 says to change the curve then, not the duration), the reduced-motion media
 * query as a browser evaluates it.
 *
 * Run: node --test --test-global-setup=test/setup/global.mjs test/ux/ux-b7-motion.test.mjs
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { makeDocument, makeStorage, installBrowser, MiniElement } from '../mini-dom.mjs';

const doc = makeDocument();
installBrowser({ doc, storage: makeStorage() });

const F = await import('../verdict-fixtures.mjs');
const camera = await import('../../public/js/screens/camera.js');
const shin = await import('../../public/js/shin.js');

/* ============================================================== CSS reading */

const CSS_DIR = new URL('../../public/css/', import.meta.url);

function parseCss(text, file) {
  const src = text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const keyframes = new Map();
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
        const name = head.split(/\s+/)[1];
        keyframes.set(name, { name, body: src.slice(open + 1, j).replace(/\s+/g, ' '), file, media });
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
  return { rules, keyframes };
}

const FILES = ['tokens.css', 'components.css', 'face.css', 'shell.css', ...readdirSync(new URL('screens/', CSS_DIR)).sort().map((f) => `screens/${f}`)];
const PARSED = FILES.map((f) => ({ file: f, ...parseCss(readFileSync(new URL(f, CSS_DIR), 'utf8'), f) }));
const RULES = PARSED.flatMap((p) => p.rules);
const KEYFRAMES = new Map(PARSED.flatMap((p) => [...p.keyframes]));
const VARS = new Map();
for (const r of RULES) {
  if (r.media && /prefers-/.test(r.media)) continue;
  for (const [p, v] of r.decls) if (p.startsWith('--') && !VARS.has(p)) VARS.set(p, v);
}

const isReduce = (r) => /prefers-reduced-motion:\s*reduce/.test(r.media ?? '');
const isNoPref = (r) => /prefers-reduced-motion:\s*no-preference/.test(r.media ?? '');
// Right-to-left variants (`:dir(rtl) .x`) are the same element as `.x` for every question asked here.
const selectorsOf = (r) => r.sel.split(',').map((s) => s.trim().replace(/^:dir\(\w+\)\s*/, ''));

/** var(--x) and var(--x, fallback) replaced by the token's value; the fallback may itself hold parentheses. */
function resolveVars(value) {
  let s = String(value);
  for (let n = 0; n < 12; n += 1) {
    const at = s.indexOf('var(');
    if (at === -1) break;
    let depth = 0; let end = at + 3;
    for (; end < s.length; end += 1) { if (s[end] === '(') depth += 1; else if (s[end] === ')' && --depth === 0) break; }
    const inner = s.slice(at + 4, end);
    const comma = inner.indexOf(',');
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? 'NaN' : inner.slice(comma + 1).trim();
    s = s.slice(0, at) + (VARS.get(name) ?? fallback) + s.slice(end + 1);
  }
  return s.trim();
}

function splitTop(str, sepTest) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of str) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0 && sepTest(ch)) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const TIME = /^(-?[\d.]+)(ms|s)$/;
const toMs = (tok) => { const m = TIME.exec(tok); return m ? Number.parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : null; };
const CURVE_WORDS = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end']);
const isCurve = (tok) => CURVE_WORDS.has(tok) || /^(cubic-bezier|steps)\(/.test(tok);
const ANIM_WORDS = new Set(['infinite', 'both', 'forwards', 'backwards', 'none', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'running', 'paused']);

/** One animation from a shorthand item, or from the longhands of a rule. */
function parseAnimationItem(item) {
  const out = { name: null, durationMs: null, delayMs: 0, curve: 'ease', iterations: 1 };
  let timeSeen = 0;
  for (const tok of splitTop(item.trim(), (ch) => /\s/.test(ch))) {
    if (TIME.test(tok)) { if (timeSeen === 0) out.durationMs = toMs(tok); else out.delayMs = toMs(tok); timeSeen += 1; } else if (isCurve(tok)) out.curve = tok.replace(/\s+/g, '');
    else if (tok === 'infinite') out.iterations = Infinity;
    else if (/^\d+(\.\d+)?$/.test(tok)) out.iterations = Number.parseFloat(tok);
    else if (!ANIM_WORDS.has(tok)) out.name = tok;
  }
  return out;
}

function animationsOf(rule) {
  const out = [];
  const short = rule.decls.get('animation');
  if (short !== undefined) {
    const list = splitTop(resolveVars(short), (ch) => ch === ',');
    for (const it of list) { const a = parseAnimationItem(it); if (a.name) out.push({ ...a, rule }); }
  }
  if (rule.decls.has('animation-name')) {
    const a = parseAnimationItem('');
    a.name = resolveVars(rule.decls.get('animation-name'));
    const dur = rule.decls.get('animation-duration'); if (dur) a.durationMs = toMs(resolveVars(dur));
    const del = rule.decls.get('animation-delay'); if (del) a.delayMs = toMs(resolveVars(del));
    const fn = rule.decls.get('animation-timing-function'); if (fn) a.curve = resolveVars(fn).replace(/\s+/g, '');
    const it = rule.decls.get('animation-iteration-count'); if (it) a.iterations = it === 'infinite' ? Infinity : Number.parseFloat(it);
    if (a.name !== 'none') out.push({ ...a, rule });
  }
  return out;
}

function transitionsOf(rule) {
  const short = rule.decls.get('transition');
  if (short === undefined) return [];
  const out = [];
  for (const item of splitTop(resolveVars(short), (ch) => ch === ',')) {
    const toks = splitTop(item.trim(), (ch) => /\s/.test(ch));
    const t = { prop: toks[0], durationMs: null, delayMs: 0, curve: 'ease', rule };
    let seen = 0;
    for (const tok of toks.slice(1)) {
      if (TIME.test(tok)) { if (seen === 0) t.durationMs = toMs(tok); else t.delayMs = toMs(tok); seen += 1; } else if (isCurve(tok)) t.curve = tok.replace(/\s+/g, '');
    }
    if (t.prop && t.prop !== 'none') out.push(t);
  }
  return out;
}

/** Ease-out: a named ease-out, or a cubic-bezier whose first control point rises faster than it runs (y1 > x1). */
function isEaseOut(curve) {
  const c = resolveVars(curve).replace(/\s+/g, '');
  if (c === 'ease-out') return true;
  const m = /^cubic-bezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)$/.exec(c);
  return m ? Number.parseFloat(m[2]) > Number.parseFloat(m[1]) : false;
}

const where = (rule) => `${rule.file}: ${rule.sel.slice(0, 70)}`;

/* ---------------------------------------------------------------- negative controls */

test('R-86 (build 7): the motion reader and the ease-out rule are right before anything is judged on them (negative control)', () => {
  for (const good of ['ease-out', 'cubic-bezier(.2,.8,.2,1)', 'cubic-bezier(.32, .72, 0, 1)', 'cubic-bezier(.23,1,.32,1)', 'var(--ease-land)']) assert.ok(isEaseOut(good), `${good} is ease-out`);
  for (const bad of ['ease-in', 'ease-in-out', 'linear', 'ease', 'cubic-bezier(.4,0,1,1)', 'cubic-bezier(.42,0,.58,1)']) assert.ok(!isEaseOut(bad), `${bad} is not ease-out`);
  const sheet = RULES.find((r) => r.sel === '.sheet' && r.decls.has('animation'));
  assert.ok(sheet, 'cannot find the .sheet rule: the reader is broken');
  const [a] = animationsOf(sheet);
  assert.equal(a.name, 'rise');
  assert.ok(Number.isFinite(a.durationMs), 'cannot read the sheet duration');
  assert.ok(KEYFRAMES.has('rise') && KEYFRAMES.size > 15, `read ${KEYFRAMES.size} keyframes`);
  // The control used to be "shutterSweep is 900 ms". Build 7 (R-90) deletes that animation, which is what the file asks
  // for, so the known value moves to the other animation this build touched: the eye glance, 6400 ms after D-228 moved it
  // off the 5 s band (it was 5200). Same job: a number the reader must reproduce from a shorthand before it is trusted.
  const glance = RULES.find((r) => r.decls.get('animation')?.includes('camEyeGlance'));
  assert.ok(glance, 'cannot find the camEyeGlance rule: the reader is broken');
  assert.equal(animationsOf(glance)[0].durationMs, 6400, 'known value: camEyeGlance is 6400 ms');
});

/* ===================================================================== R-86 */

const sheetRule = () => RULES.find((r) => r.sel === '.sheet' && r.decls.has('animation'));

test('R-86 (build 7): the sheet rises in 260 ms', () => {
  const [a] = animationsOf(sheetRule());
  assert.equal(a.durationMs, 260, `the sheet rise is ${a.durationMs} ms (${where(sheetRule())})`);
});

test('R-86 (keep): the sheet rise already uses an ease-out curve', () => {
  const [a] = animationsOf(sheetRule());
  assert.ok(isEaseOut(a.curve), `rise curve ${a.curve} is not ease-out`);
});

test('R-86 (build 7): the sheet has a 200 ms dismiss, and it is ease-out', () => {
  const exits = [];
  for (const r of RULES.filter((x) => !isReduce(x))) {
    if (!selectorsOf(r).some((s) => /\.sheet\b/.test(s) && /closing|leaving|dismiss|exiting|\.out\b|is-out|\[data-leaving|\[data-closing|\[data-state="(closing|out)"/.test(s))) continue;
    for (const a of animationsOf(r)) exits.push({ ms: a.durationMs, curve: a.curve, from: where(r) });
    for (const t of transitionsOf(r)) exits.push({ ms: t.durationMs, curve: t.curve, from: where(r) });
  }
  assert.ok(exits.length > 0, 'no CSS rule gives the sheet a dismiss animation: it is removed from the page with no exit');
  assert.ok(exits.some((e) => e.ms === 200 && isEaseOut(e.curve)), `no 200 ms ease-out dismiss among: ${JSON.stringify(exits)}`);
});

test('R-86 (build 7): a sheet position change takes 300 ms', () => {
  const t = transitionsOf(sheetRule()).find((x) => x.prop === 'max-height');
  assert.ok(t, 'the sheet no longer transitions its height');
  assert.equal(t.durationMs, 300, `position change is ${t.durationMs} ms`);
});

test('R-86 (keep): the position change already uses an ease-out curve', () => {
  const t = transitionsOf(sheetRule()).find((x) => x.prop === 'max-height');
  assert.ok(isEaseOut(t.curve), `${t.curve} is not ease-out`);
});

// Entrances and exits: an animation that starts hidden or displaced, or ends that way, and does not loop; plus transitions of
// transform or height that are not a pressed state. Tints, blinks and loops are other things and are judged elsewhere.
function enterExitAnimations() {
  const out = [];
  for (const r of RULES.filter((x) => !isReduce(x))) {
    for (const a of animationsOf(r)) {
      if (a.iterations === Infinity) continue;
      if (a.durationMs === null) continue; // a rule that only swaps the keyframes name (the right-to-left variants) inherits timing from the rule it overrides
      const kf = KEYFRAMES.get(a.name);
      if (!kf) continue;
      const first = /(?:from|0%)\s*\{([^}]*)\}/.exec(kf.body)?.[1] ?? '';
      const last = /(?:to|100%)\s*\{([^}]*)\}/.exec(kf.body)?.[1] ?? '';
      const hiddenStart = /opacity:\s*0\b|translate[XY]?\(|scale\(\s*0?\.\d+\s*\)|stroke-dashoffset/.test(first);
      const hiddenEnd = /opacity:\s*0\b|translate[XY]?\(\s*-?1[0-9]{2}%/.test(last);
      if (hiddenStart || hiddenEnd) out.push({ kind: hiddenEnd ? 'exit' : 'enter', name: a.name, curve: a.curve, ms: a.durationMs, rule: r });
    }
    for (const t of transitionsOf(r)) {
      if (!['transform', 'max-height', 'translate'].includes(t.prop)) continue;
      if (selectorsOf(r).some((s) => /:active|:hover/.test(s))) continue;
      if ((t.durationMs ?? 0) <= 120) continue; // press feedback is R-87's, not an enter or an exit
      out.push({ kind: 'move', name: t.prop, curve: t.curve, ms: t.durationMs, rule: r });
    }
  }
  return out;
}

test('R-86 (keep): every enter and exit in the stylesheets uses an ease-out curve', () => {
  const all = enterExitAnimations();
  assert.ok(all.length >= 8, `only ${all.length} enters and exits recognised: the classifier reads too little`);
  const bad = all.filter((x) => !isEaseOut(x.curve)).map((x) => `${x.kind} ${x.name} ${x.ms} ms ${x.curve} (${where(x.rule)})`);
  assert.deepEqual(bad, [], 'R-86: ease-out (fast start, slow finish) for every enter and exit');
});

/* ===================================================================== R-87 */

const PRESS_CLASSES = ['btn--key', 'nav-btn', 'pbar-i', 'mini-shutter', 'scan-code-btn', 'key-confirm', 'type-btn'];

test('R-87 (build 7): pad keys and bar taps move nothing: no scale, translate or sound on press', () => {
  const bad = [];
  for (const r of RULES.filter((x) => !isReduce(x) && !(x.media && /hover/.test(x.media)))) {
    for (const sel of selectorsOf(r)) {
      if (!/:active/.test(sel)) continue;
      const subject = sel.split(/[\s>+~]+/).pop();
      const hits = PRESS_CLASSES.filter((c) => new RegExp(`\\.${c}(?![\\w-])`).test(subject));
      // `.btn:active` also moves every pad key, because the keys are .btn .btn--key.
      const viaBtn = /^\.btn(?::|$)/.test(subject);
      if (!hits.length && !viaBtn) continue;
      const tf = r.decls.get('transform') ?? r.decls.get('scale') ?? r.decls.get('translate');
      if (tf && !/^none$/.test(tf)) bad.push(`${sel} { ${tf} }  (${where(r)})`);
    }
  }
  assert.deepEqual(bad, [], 'R-87: instant colour tint of 120 ms or less and no movement on pad keys and bar taps');
});

test('R-87 (build 7): a press tint takes 120 ms or less and is not eased through a transform', () => {
  const bad = [];
  for (const cls of PRESS_CLASSES) {
    for (const r of RULES.filter((x) => !isReduce(x) && selectorsOf(x).some((s) => s.split(/[\s>+~]+/).pop().replace(/:[\w-]+(\([^)]*\))?/g, '') === `.${cls}`))) {
      for (const t of transitionsOf(r)) {
        if (t.prop === 'transform') bad.push(`.${cls} transitions transform ${t.durationMs} ms (${where(r)})`);
        else if ((t.durationMs ?? 0) > 120 && /color|background|opacity/.test(t.prop)) bad.push(`.${cls} tints over ${t.durationMs} ms (${where(r)})`);
      }
    }
  }
  assert.deepEqual(bad, [], 'R-87: tint of 120 ms or less, no movement');
});

/* ===================================================================== R-88 */

test('R-88 (keep): the confidence dots and the word arrive with the verdict, with no sequence', () => {
  const dotRules = RULES.filter((r) => selectorsOf(r).some((s) => /(^|[\s>])\.dots(\s|$|[ .:>])|\.dots\s+i\b/.test(s)));
  assert.ok(dotRules.length >= 2, 'cannot find the .dots rules');
  for (const r of dotRules) {
    assert.ok(!r.decls.has('animation') && !r.decls.has('animation-delay') && !r.decls.has('transition-delay'), `a delay or animation on the dots: ${where(r)}`);
  }
  const markup = shin.dotsHtml(4);
  assert.doesNotMatch(markup, /animation|delay|style=/i, 'the dot markup carries a delay');
});

/* ===================================================================== R-89 */

function makeRaf() {
  const state = { clock: 0, queue: [] };
  globalThis.requestAnimationFrame = (fn) => { state.queue.push(fn); return state.queue.length; };
  globalThis.cancelAnimationFrame = () => { state.queue.length = 0; };
  mock.method(globalThis.performance, 'now', () => state.clock);
  state.step = (dt) => { state.clock += dt; const q = state.queue.splice(0); for (const fn of q) fn(state.clock); };
  state.restore = () => { delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; mock.restoreAll(); };
  return state;
}

function runMorph(options = {}) {
  const raf = makeRaf();
  try {
    const host = new MiniElement('div', doc);
    camera.morphBell(host, F.GOOD, F.BAD, { reduced: false, ...options });
    const frames = [{ t: 0, html: host.innerHTMLRaw, morphing: host.classList.contains('vd-morphing') }];
    for (let t = 0; t < 1500; t += 20) {
      raf.step(20);
      frames.push({ t: raf.clock, html: host.innerHTMLRaw, morphing: host.classList.contains('vd-morphing') });
      if (!host.classList.contains('vd-morphing') && raf.queue.length === 0) break;
    }
    return frames;
  } finally { raf.restore(); }
}

test('R-89 (build 7): a better answer moves the bell in at most 400 ms', () => {
  const frames = runMorph();
  const done = frames.find((f) => f.t > 0 && !f.morphing);
  assert.ok(done, 'the morph never finished within 1.5 s');
  assert.ok(done.t <= 400, `the bell morph runs ${done.t} ms; R-89 allows 400`);
});

test('R-89 (keep): the morph is drawn still under reduced motion', () => {
  const raf = makeRaf();
  try {
    const host = new MiniElement('div', doc);
    camera.morphBell(host, F.GOOD, F.BAD, { reduced: true });
    assert.equal(raf.queue.length, 0, 'a frame was queued under reduced motion');
    assert.ok(host.innerHTMLRaw.length > 100, 'nothing was drawn');
    assert.ok(!host.classList.contains('vd-morphing'));
  } finally { raf.restore(); }
});

test('R-89 (keep): numbers appear once and never count through other values while the bell moves', () => {
  const frames = runMorph();
  assert.ok(frames.length > 5, 'too few frames to judge');
  // The first frame is the host before the first animation frame has run (empty); every drawn frame is compared.
  const texts = frames.map((f) => f.html.replace(/<(style|defs)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  assert.ok(texts.length > 5, 'too few drawn frames');
  const distinct = [...new Set(texts)];
  assert.equal(distinct.length, 1, `the visible text changes during the morph (a counting number): ${distinct.slice(0, 3).join(' | ')}`);
});

test('R-89 (build 7): the first draw of the chart is complete within 260 ms, with the sheet', () => {
  const ends = [];
  for (const r of RULES.filter((x) => !isReduce(x) && !isNoPref(x))) {
    if (!selectorsOf(r).some((s) => /\.vb-/.test(s))) continue;
    for (const a of animationsOf(r)) if (Number.isFinite(a.durationMs) && a.iterations !== Infinity) ends.push({ end: a.durationMs + a.delayMs, name: a.name, from: where(r) });
  }
  assert.ok(ends.length > 3, 'cannot find the chart animations');
  const longest = ends.reduce((a, b) => (b.end > a.end ? b : a));
  assert.ok(longest.end <= 260, `the chart finishes drawing at ${longest.end} ms (${longest.name}, ${longest.from}); R-89 asks for 260 with the sheet`);
});

/* ===================================================================== R-90 */

test('R-90 (build 7): the 900 ms shutter sweep is gone (cut to 300 ms or deleted)', () => {
  const sweeps = [];
  for (const r of RULES) for (const a of animationsOf(r)) if (/sweep/i.test(a.name)) sweeps.push({ ms: a.durationMs, from: where(r) });
  assert.deepEqual(sweeps.filter((s) => s.ms > 300), [], 'R-90: cut to 300 ms or remove; the shutter is not even on the screen');
  const css = readFileSync(new URL('screens/camera.css', CSS_DIR), 'utf8');
  if (!/shutterSweep/.test(css)) return;
  assert.ok(sweeps.every((s) => s.ms <= 300), 'a sweep survives');
});

/* ===================================================================== R-91 */

test('R-91 (build 7): under reduced motion the sheet fades in place over the same duration, it does not just appear', () => {
  const r = RULES.filter(isReduce).find((x) => selectorsOf(x).includes('.sheet') && (x.decls.has('animation') || x.decls.has('animation-name')));
  assert.ok(r, 'no reduced-motion rule for .sheet');
  const [a] = animationsOf(r);
  assert.ok(a, `reduced motion sets the sheet to "${r.decls.get('animation')}": no fade, it appears`);
  const kf = KEYFRAMES.get(a.name);
  assert.ok(kf, `no keyframes ${a.name}`);
  assert.doesNotMatch(kf.body, /transform|translate|scale/, 'the reduced sheet still travels');
  assert.match(kf.body, /opacity/);
  assert.equal(a.durationMs, 260, 'the fade keeps the sheet\'s duration');
});

test('R-91 (build 7): the scan control\'s scale-to-0.92 becomes a tint under reduced motion', () => {
  const css = RULES.filter(isReduce).filter((x) => selectorsOf(x).some((s) => /scan-code-btn:active|\.shutter:active/.test(s)));
  assert.ok(css.length > 0, 'no reduced-motion rule changes the scan control press: the scale still plays');
  assert.ok(css.some((x) => /^none$/.test(x.decls.get('transform') ?? '') && (x.decls.has('background') || x.decls.has('background-color') || x.decls.has('box-shadow') || x.decls.has('filter'))), 'the press is not replaced by a tint');
});

test('R-91 (keep): under reduced motion no animation of travel or scale is left on the screens', () => {
  // Every keyframes set that moves or scales must have a reduced-motion override for each rule that plays it.
  const bad = [];
  for (const r of RULES.filter((x) => !isReduce(x))) {
    for (const a of animationsOf(r)) {
      const kf = KEYFRAMES.get(a.name);
      if (!kf || a.iterations === Infinity || !/translate|scale|rotate/.test(kf.body)) continue;
      const covered = RULES.filter(isReduce).some((x) => selectorsOf(x).some((s) => selectorsOf(r).includes(s)) && (x.decls.has('animation') || x.decls.has('animation-name') || x.decls.has('animation-duration')))
        || RULES.some((x) => isReduce(x) && x.decls.has('animation') && /^none$/.test(x.decls.get('animation')) && selectorsOf(x).some((s) => selectorsOf(r).includes(s)));
      const wrapped = isNoPref(r); // only plays when the user has no preference
      if (!covered && !wrapped) bad.push(`${a.name} on ${where(r)}`);
    }
  }
  assert.deepEqual(bad, [], 'R-91: every moment in the table becomes a fade with no travel or scale');
});

test('R-91 (keep): no spring bounce remains under reduced motion', () => {
  const springs = [];
  for (const r of RULES.filter((x) => !isReduce(x))) {
    for (const a of animationsOf(r)) {
      const m = /cubic-bezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(a.curve);
      if (m && (Number.parseFloat(m[2]) > 1 || Number.parseFloat(m[4]) > 1 || Number.parseFloat(m[2]) < 0 || Number.parseFloat(m[4]) < 0)) springs.push({ a, r });
    }
  }
  assert.ok(springs.length > 0, 'the classifier found no overshoot curve; vb-settle (cubic-bezier(.34,1.56,.64,1)) must be found');
  for (const { a, r } of springs) {
    const off = RULES.some((x) => isReduce(x) && /^none$/.test(x.decls.get('animation') ?? '') && selectorsOf(x).some((s) => selectorsOf(r).includes(s) || r.sel.includes(s)));
    assert.ok(off, `a spring (${a.curve}) is left under reduced motion: ${where(r)}`);
  }
});

test('R-91 (keep): the reticle appears without contracting under reduced motion', () => {
  const r = RULES.filter(isReduce).find((x) => selectorsOf(x).includes('.reticle'));
  assert.ok(r, 'no reduced-motion rule for .reticle');
  assert.equal(r.decls.get('transition'), 'none');
});

/* ===================================================================== R-17 */

test('R-17 (keep): the stylesheets that animate honour reduced motion', () => {
  const missing = [];
  for (const f of ['screens/camera.css', 'face.css', 'screens/correct.css', 'screens/licences.css', 'screens/onboarding.css', 'screens/watchlist.css', 'screens/you.css', 'shell.css']) {
    if (!/prefers-reduced-motion/.test(readFileSync(new URL(f, CSS_DIR), 'utf8'))) missing.push(f);
  }
  assert.deepEqual(missing, []);
});

test('R-17 (keep): every looping animation is stopped under reduced motion', () => {
  const loops = [];
  for (const r of RULES.filter((x) => !isReduce(x))) for (const a of animationsOf(r)) if (a.iterations === Infinity) loops.push({ a, r });
  assert.ok(loops.length >= 3, `only ${loops.length} loops found`);
  const bad = [];
  for (const { a, r } of loops) {
    const stopped = RULES.some((x) => isReduce(x) && (/^none/.test(x.decls.get('animation') ?? '') || x.decls.has('animation-name') || /^none/.test(x.decls.get('animation-name') ?? ''))
      && selectorsOf(x).some((s) => selectorsOf(r).some((t) => s === t || s.replace(/^\.face\s+/, '') === t.replace(/^\.face\s+/, ''))))
      || a.name === 'think-dot-1' || RULES.some((x) => isReduce(x) && /think-dots/.test(x.sel) && /^none/.test(x.decls.get('animation') ?? ''));
    if (!stopped) bad.push(`${a.name} ${a.durationMs} ms on ${where(r)}`);
  }
  assert.deepEqual(bad, [], 'a loop keeps running under reduced motion');
});

test('R-17 (keep): no loop has a period near 5 s', () => {
  const near = [];
  for (const r of RULES.filter((x) => !isReduce(x))) {
    for (const a of animationsOf(r)) {
      if (a.iterations === Infinity && a.durationMs >= 4500 && a.durationMs <= 5500) near.push(`${a.name}: ${a.durationMs} ms, ${a.curve}, delay ${a.delayMs} ms (${where(r)})`);
    }
  }
  assert.deepEqual(near, [], 'R-17: no loop with a period near 5 s');
});

/* ======================================================= fails loudly (R-86/87) */

async function loadMotion() {
  try {
    return await import('../../public/js/lib/motion.js');
  } catch (err) {
    return assert.fail(`build 7 must add public/js/lib/motion.js exporting registerAnimation({ name, kind, durationMs, curve, property }) -> the registered spec; import failed: ${err.code ?? err.message}`);
  }
}

test('R-86 (build 7): an animation registered with an ease-in curve throws, for every enter and exit kind', async () => {
  const { registerAnimation } = await loadMotion();
  assert.equal(typeof registerAnimation, 'function');
  for (const kind of ['enter', 'exit']) {
    for (const curve of ['ease-in', 'ease-in-out', 'linear', 'ease', 'cubic-bezier(0.4, 0, 1, 1)']) {
      assert.throws(() => registerAnimation({ name: `t-${kind}`, kind, durationMs: 200, curve }), /ease-out|curve/i, `${kind} with ${curve} registered silently`);
    }
    assert.doesNotThrow(() => registerAnimation({ name: `ok-${kind}`, kind, durationMs: 200, curve: 'cubic-bezier(.2, .8, .2, 1)' }));
    assert.doesNotThrow(() => registerAnimation({ name: `ok2-${kind}`, kind, durationMs: 200, curve: 'ease-out' }));
  }
});

test('R-86 (build 7): the registry refuses a missing name, a bad kind and a duration that is not a number, and never clamps one', async () => {
  const { registerAnimation } = await loadMotion();
  assert.throws(() => registerAnimation({ kind: 'enter', durationMs: 260, curve: 'ease-out' }), /name/i);
  assert.throws(() => registerAnimation({ name: 'x', kind: 'sideways', durationMs: 260, curve: 'ease-out' }), /kind/i);
  assert.throws(() => registerAnimation({ name: 'x', kind: 'enter', durationMs: Number.NaN, curve: 'ease-out' }), /duration/i);
  assert.throws(() => registerAnimation({ name: 'x', kind: 'enter', durationMs: -5, curve: 'ease-out' }), /duration/i);
  assert.throws(() => registerAnimation({ name: 'x', kind: 'enter', durationMs: 5000, curve: 'ease-out' }), /duration/i, 'a 5 s entrance is a mistake, not a setting');
  assert.throws(() => registerAnimation({ name: 'x', kind: 'enter', durationMs: 260 }), /curve/i, 'no curve means the browser default, which is not ease-out');
  const spec = registerAnimation({ name: 'sheet-rise', kind: 'enter', durationMs: 260, curve: 'cubic-bezier(.2, .8, .2, 1)' });
  assert.equal(spec.durationMs, 260, 'the registered duration was changed on the way through');
});

test('R-87 (build 7): a press that moves the control throws', async () => {
  const { registerAnimation } = await loadMotion();
  assert.throws(() => registerAnimation({ name: 'key-press', kind: 'press', durationMs: 120, curve: 'linear', property: 'transform' }), /press|move|transform/i);
  assert.throws(() => registerAnimation({ name: 'key-press', kind: 'press', durationMs: 200, curve: 'linear', property: 'background-color' }), /120/, 'a press tint over 120 ms must throw');
  assert.doesNotThrow(() => registerAnimation({ name: 'key-tint', kind: 'press', durationMs: 120, curve: 'linear', property: 'background-color' }));
});
