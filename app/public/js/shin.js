/**
 * Pexi himself: the face, the money, and the confidence treatment.
 *
 * The face is the verdict, not a decoration in the corner of a card. It is drawn
 * rather than loaded, so there is no asset to go missing and it stays crisp at
 * any size on a share card.
 *
 * THE ONE RULE, from the repo constitution: the aggression points at the price,
 * the store, or the brand, and never at the user. Groceries are non-discretionary
 * and the person scanning did not set the price.
 *
 * Thirteen expressions, not three. The old file had three because there were
 * three verdict tiers; that was wrong, because refusing is a state Pexi is in
 * more often than any of them and it needs a face of its own rather than a
 * shrug. AVATAR.md section 2 adds the other seven on top of the six this file
 * already drew, and section 6 is the placeholder contract this file is.
 */

import { personality, say } from './voice.js';
import { FLAGS } from './flags.js';
import { escapeHtml } from './lib/dom.js';
import { t } from './ui-strings.js';
import { FACE_SETS, faceInner, faceParts } from './face-art.js';

/**
 * Six size tokens, docs/design/AVATAR.md section 3. Never below 28px anywhere,
 * which is `face-row`, the smallest of the six.
 */
export const SIZE_TOKENS = {
  'face-verdict': 96,
  'face-working': 76,
  'face-ack': 62,
  'face-page': 48,
  'face-row': 28,
  'face-share': 220,
};

const MIN_FACE_PX = SIZE_TOKENS['face-row'];

/** A token name or a raw px number, resolved to px, never under the floor. */
function resolveSize(size) {
  const px = typeof size === 'string' ? SIZE_TOKENS[size] : size;
  const n = typeof px === 'number' && Number.isFinite(px) ? px : SIZE_TOKENS['face-verdict'];
  return Math.max(MIN_FACE_PX, n);
}

export const TIERS = {
  good: { id: 'good', face: 'good' },
  fair: { id: 'fair', face: 'fair' },
  walk_away: { id: 'walk_away', face: 'walk' },
  unknown: { id: 'unknown', face: 'unknown' },
};

export function tierOf(tierId) {
  return TIERS[tierId] ?? TIERS.unknown;
}

/**
 * The face art lives in `face-art.js`: the character (head and upper body on
 * a circle) and the thirteen states, each as a set of swappable parts. Only
 * the Deadpan treatment is drawn so far; Warm and Blunt fall back to it, so
 * the attitude picker's three faces differ in voice but not yet in face.
 * `data-who` still records the personality asked for, so nothing has to
 * change at the call sites when those two sets land.
 */
function artWho(who) {
  return FACE_SETS[who] ? who : 'deadpan';
}

/** The thirteen state names, docs/design/AVATAR.md section 6, list 1. */
export const STATES = [
  'idle', 'thinking', 'asking', 'good', 'delighted', 'fair', 'walk', 'angry',
  'unknown', 'pleased', 'nudging', 'asleep', 'proud',
];

/** The thirteen animation names, docs/design/AVATAR.md section 5, list 3. */
export const ANIMATIONS = [
  'face-morph', 'idle-breath', 'blink', 'slow-blink', 'think-dots', 'step-swap',
  'verdict-land', 'intense-hold', 'pleased-nod', 'sleep-breath', 'wake',
  'nudge-arrive', 'proud-hold',
];
const ANIMATION_SET = new Set(ANIMATIONS);

/**
 * The default (resting) animation for each of the thirteen states,
 * `docs/design/AVATAR.md` section 5. This is what `data-anim` carries on the
 * SVG a screen never touches directly; a screen that wants a *different* named
 * animation for one moment (`step-swap` on the working surface, `wake` when an
 * empty list gains its first row, `verdict-land` explicitly before a state that
 * defaults elsewhere) calls `animateFace(el, name)` with that name instead.
 *
 * `unknown` maps to `slow-blink` and nothing else: "the refusal's only motion
 * is slow-blink" (section 5's rules, and CLAUDE.md's motion rule repeats it).
 * `verdict-land` still happens for a refusal (340ms, per row 36-39 of the
 * per-screen table) but it is triggered explicitly by whoever mounts the face,
 * via `animateFace(el, 'verdict-land')` followed by the slow blink; it is not
 * this state's steady default because a refusal that sat there re-landing
 * every re-render would be the "face re-morphs on a drag" bug section 5 rules
 * out, in a different guise.
 */
export const DEFAULT_ANIM = {
  idle: 'idle-breath',
  thinking: 'think-dots',
  asking: 'face-morph',
  good: 'verdict-land',
  delighted: 'intense-hold',
  fair: 'verdict-land',
  walk: 'verdict-land',
  angry: 'intense-hold',
  unknown: 'slow-blink',
  pleased: 'pleased-nod',
  nudging: 'nudge-arrive',
  asleep: 'sleep-breath',
  proud: 'proud-hold',
};

/** States that get a natural, un-synchronised random blink: `idle` and
 * `asking`, exactly the two AVATAR.md section 5 row 3 names. Not the verdict
 * faces: once a verdict has landed the expression is fixed until a new scan
 * (section 5's rules), and a blink on a landed verdict is motion under the
 * reader. Not `unknown` -- its only motion is `slow-blink`. Not
 * `thinking`/`nudging`/`asleep`/`proud`/`pleased` -- each already owns a
 * dedicated motion of its own. */
const BLINK_EMBER_STATES = new Set(['idle', 'asking']);

/** How far behind the eyes and brow the mouth lands, per animation, in ms.
 * `face-morph` is the 40ms of section 5 row 1; `intense-hold` widens it to
 * 60 (row 8); `verdict-land` is 0 because the expression must already be set
 * before the rise (row 7). face.css delays the mouth's own fade by the same
 * amount, so the DOM swap and the fade agree. Anything else: 40. */
const MOUTH_STAGGER_MS = { 'face-morph': 40, 'intense-hold': 60, 'verdict-land': 0 };

/** `proud-hold` grows a 28px row face to 40px (section 5 row 13). On a
 * bigger face the same 12px of growth is kept, not the same ratio, so a 64px
 * face does not balloon to 91px. */
function proudPeakFor(el) {
  const px = Number(el.getAttribute?.('width')) || el.clientWidth || SIZE_TOKENS['face-row'];
  return ((px + 12) / px).toFixed(4);
}

/** The label a `step-swap` crossfades: the current working step beside the
 * face, or failing that the speech-bubble line. Never the face. */
function labelBeside(el) {
  const host = el.closest?.('.working-peek, .sheet, .shin-say') ?? el.parentElement;
  return host?.querySelector?.('.wstep.now') ?? host?.querySelector?.('.bubble-text') ?? null;
}

/** Restart a one-shot CSS animation on any element by toggling a class off
 * and on across a forced reflow, then drop the class once it has played.
 * Exported so a screen can crossfade a line of its own (`step-swap-run`,
 * 160ms; `line-fade-run`, 260ms) without reaching into the face. */
export function runClassAnimation(el, className, ms) {
  if (!el) return;
  el.classList.remove(className);
  forceStyle(el);
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), ms + 40);
}

/**
 * Pexi's face as an SVG string.
 *
 * The xmlns is load-bearing, not decoration. Inline HTML tolerates its absence;
 * a standalone SVG document does not, so without it any screen that rasterises
 * this face onto a canvas gets a silently broken image and throws nothing. That
 * happened once already and the share card shipped a face with no eyebrows.
 *
 * The outline, brows and mouth are drawn in `currentColor`. Inline, that is
 * whatever `color` the face inherits (the tier hue on a verdict, `ink-faint`
 * on a row). For a rasterised export there is no cascade, so `opts.ink` is
 * written as a `color` attribute on the root and `currentColor` resolves to
 * it inside the <img>.
 *
 * The face also carries `data-anim`, the default animation for this state
 * (`docs/design/AVATAR.md` section 5), and `data-state`/`data-who`, which
 * `animateFace` and `morphFace` (below) use to update a mounted face without
 * replacing the node, and which the auto-blink scheduler uses to find and
 * schedule the faces that are allowed to blink on their own. A face rendered
 * at `face-row` (28px, "rows, chips, hint pills, toasts") never animates --
 * `data-anim="none"` plus the `face-static` class are the marker, per section
 * 3's "row faces never animate" and section 5's reduced-motion rule taken to
 * its logical size.
 *
 * @param {string} expression  one of the thirteen states in STATES, above
 * @param {object} [opts]
 * @param {number|string} [opts.size]  a token name (`'face-page'`) or a raw px
 *   number. Defaults to `face-verdict` (96) and is never rendered under 28px.
 * @param {string} [opts.ink]     outline colour for a standalone render;
 *   inline faces inherit `color` instead
 * @param {string} [opts.who]     personality override, defaults to the user's
 */
export function faceSvg(expression, opts = {}) {
  const who = opts.who ?? personality();
  // Every one of the thirteen states is drawn (test/faces.test.mjs checks the
  // list against the contract). A typo'd name falls back to `fair` inside
  // faceInner, never to a blank.
  const state = STATES.includes(expression) ? expression : 'fair';
  const size = resolveSize(opts.size);
  const colorAttr = opts.ink ? ` color="${opts.ink}"` : '';
  const rowSized = size === SIZE_TOKENS['face-row'];

  const animName = rowSized ? null : (DEFAULT_ANIM[state] ?? null);
  const animAttr = rowSized ? ' data-anim="none"' : (animName ? ` data-anim="${animName}"` : '');
  const staticClass = rowSized ? ' face-static' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="${size}" height="${size}"
       role="img" aria-label="${escapeHtml(t('face_label', { state: t(`face_state_${state}`) }))}" class="face face-${state}${staticClass}"
       data-state="${state}" data-who="${who}"${animAttr}${colorAttr} focusable="false">
  ${faceInner(artWho(who), state)}
    </svg>`;
}

/**
 * Restart (or start) one of the thirteen named animations on a mounted face,
 * without touching anything but that element. Used both for the default
 * animation a face already carries (a re-render can call this to replay it)
 * and for a one-off name a screen's own logic decides on: `step-swap` when the
 * working label changes, `wake` when a list goes from empty to one row,
 * `verdict-land` on a refusal before its `slow-blink`.
 *
 * A name outside the thirteen, or a face with no `data-anim` slot (a
 * `face-row`, which never animates), is a no-op.
 *
 * @param {SVGElement|HTMLElement} el  the `.face` element `faceSvg` returned,
 *   already in the DOM
 * @param {string} name  one of ANIMATIONS
 */
export function animateFace(el, name) {
  if (!el || !ANIMATION_SET.has(name)) return;
  const rowSized = el.dataset && el.dataset.anim === 'none';

  // step-swap is a label crossfade and nothing else (section 5 row 6): the
  // face does not move and its steady animation (think-dots) is left
  // running. It never touches `data-anim`.
  if (name === 'step-swap') {
    runClassAnimation(labelBeside(el), 'step-swap-run', 160);
    return;
  }

  /* Row faces never animate, with one contract-named exception: proud-hold is
     written *at* 28px ("the row face grows from 28px to 40px", row 13), so an
     explicit call lifts the gate for exactly its 400ms and puts it back.
     Nothing automatic reaches this branch; a scrolling list never does.

     Nothing at all reaches it, in fact. you.js mounts `proud` at 64px, which
     takes the ordinary path below, and no screen calls animateFace with this
     name. It belongs with nudge-arrive and the drop card: a contract row that
     is implemented and unreachable in v1, rather than one that is missing.

     Exercised by hand 2026-09-07 rather than assumed, because a branch nobody
     has run is not the same as a branch that works. Mounted a face-row proud
     face and called it: face-static comes off, data-anim becomes proud-hold,
     the animation runs, and 440ms later both are put back. Note that the
     --proud-peak written here is only ever face.css's own fallback at 28px,
     since (28 + 12) / 28 is exactly 1.4286, so the custom property earns its
     keep only if a second row size ever exists. */
  if (rowSized) {
    if (name !== 'proud-hold') return;
    el.classList.remove('face-static');
    el.style.setProperty('--proud-peak', proudPeakFor(el));
    restartAnim(el, name);
    window.setTimeout(() => {
      el.dataset.anim = 'none';
      el.classList.add('face-static');
      el.style.removeProperty('--proud-peak');
    }, 440);
    return;
  }

  if (name === 'blink') {
    // Under reduced motion the eyes stay open (row 3): face.css kills the
    // class's animation, so toggling it is harmless, but skip the work.
    if (!prefersReducedMotion()) triggerBlink(el);
    return;
  }

  // slow-blink layers on the eyes as a class, the way blink does, so calling
  // it 340ms into a refusal's verdict-land does not cut the landing short by
  // rewriting `data-anim` under it. A freshly mounted `unknown` face still
  // blinks once from its own `data-anim="slow-blink"` default.
  if (name === 'slow-blink') {
    runClassAnimation(el, 'face-slow-blink-now', 520);
    return;
  }

  if (name === 'proud-hold') el.style.setProperty('--proud-peak', proudPeakFor(el));
  restartAnim(el, name);
}

/**
 * Write `data-anim` so that the CSS animation restarts even when the name did
 * not change (asking -> asking on a repeated hint, a second verdict-land on
 * the same face). Every rule in face.css keys off `data-anim`, on the face and
 * on its groups alike, so clearing it across a forced reflow resets all of
 * them at once. Reduced motion takes the same path: the CSS block decides
 * whether the result is a fade or a static frame, not this function.
 */
function restartAnim(el, name) {
  if (!el.dataset) return;
  const same = el.dataset.anim === name;
  if (same) {
    el.dataset.anim = '';
    forceStyle(el);
  }
  el.dataset.anim = name;
}

/** Force a style flush so a removed-then-re-added animation actually restarts.
 * `offsetWidth` is the usual trick but an <svg> element has none (it is
 * undefined, and reading it flushes nothing); `getBoundingClientRect` works
 * on SVG and HTML alike. */
function forceStyle(el) {
  if (typeof el.getBoundingClientRect === 'function') void el.getBoundingClientRect();
  else void el.offsetWidth;
}

function triggerBlink(el) {
  runClassAnimation(el, 'face-blink-now', 140);
}

/**
 * Morph a mounted face from one state to another **in place**: the paths and
 * eyes inside the existing `<svg>` are swapped, the element itself is never
 * replaced. This is what row 32 needs (the verdict face becomes `pleased`
 * without moving or popping) and what `face-morph` means everywhere else --
 * "the expression changed", not "a new face appeared".
 *
 * Eyes and brow update first, mouth 40ms behind (`face-morph`'s own timing,
 * AVATAR.md section 5 item 1), unless the viewer has asked for reduced
 * motion, in which case both apply at once and nothing travels.
 *
 * After the geometry is swapped, the target state's own default animation
 * plays (`opts.anim` to override, e.g. `pleased-nod` for an acknowledgement),
 * unless the face is `face-row` sized, which never animates.
 *
 * @param {SVGElement} el         the mounted `.face` element
 * @param {string} fromState      the state it currently shows (for the class swap)
 * @param {string} toState        the state to morph into
 * @param {object} [opts]
 * @param {string} [opts.who]     personality override, defaults to the face's own
 * @param {string} [opts.ink]     outline colour override, written as the root's
 *   `color` attribute; omit to keep inheriting
 * @param {string} [opts.anim]    animation name to play instead of the target
 *   state's default
 */
export function morphFace(el, fromState, toState, opts = {}) {
  if (!el) return;
  const who = opts.who ?? el.dataset?.who ?? personality();
  const state = STATES.includes(toState) ? toState : 'fair';
  const parts = faceParts(artWho(who), state);
  const rowSized = el.dataset && el.dataset.anim === 'none';
  const from = fromState ?? el.dataset?.state;

  if (from) el.classList.remove(`face-${from}`);
  el.classList.add(`face-${state}`);
  if (el.dataset) el.dataset.state = state;
  if (opts.who && el.dataset) el.dataset.who = opts.who;
  // The SAME label the render path writes, and it has to be looked up the same
  // way. This is a live swap: the face element is built once and mutated as
  // Pexi changes state, so a localised `aria-label` from `faceSvg` survives
  // exactly until the first state change, after which this line replaces it.
  // That is why the rendered markup can be right and the running app wrong --
  // no unit test that renders a face catches it, because the defect is in the
  // UPDATE, not the render.
  el.setAttribute('aria-label', t('face_label', { state: t(`face_state_${state}`) }));
  if (opts.ink) el.setAttribute('color', opts.ink);
  const anim = opts.anim ?? DEFAULT_ANIM[state] ?? 'face-morph';

  const head = el.querySelector('.face-head');
  const swap = (selector, markup) => {
    const g = el.querySelector(selector);
    if (g) g.innerHTML = markup;
  };
  const replace = (selector, markup) => {
    const g = el.querySelector(selector);
    if (g) g.outerHTML = markup;
  };
  // Eyes first: brows, eyes and the head's tilt move together.
  const applyEyes = () => {
    if (head) {
      if (parts.pose) head.setAttribute('transform', parts.pose);
      else head.removeAttribute('transform');
    }
    swap('.face-brows', parts.brows);
    swap('.face-eyes', parts.eyes);
  };
  // Mouth 40ms behind, and everything that is not the face rides with it.
  const applyMouth = () => {
    swap('.face-mouth', parts.mouth);
    swap('.face-extras', parts.extras);
    replace('.face-hat', parts.hat);
    replace('.face-body', parts.body);
  };

  // The stagger is the animation's own (40 / 60 / 0), not the viewer's:
  // under reduced motion the mouth still lands behind, as an opacity fade
  // rather than a move. Row faces never animate, so they swap at once.
  const stagger = rowSized ? 0 : (MOUTH_STAGGER_MS[anim] ?? MOUTH_STAGGER_MS['face-morph']);
  applyEyes();
  if (stagger > 0) window.setTimeout(applyMouth, stagger);
  else applyMouth();

  if (rowSized) {
    if (el.dataset) el.dataset.anim = 'none';
    el.classList.add('face-static');
    return;
  }
  animateFace(el, anim);
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Warm blinks at the short end, Deadpan at the long, Blunt between: the
 * personality's own blink cadence (AVATAR.md section 5 row 3, DESIGN.md
 * section 3). Recomputed on every cycle so the interval is irregular rather
 * than a fixed loop, and never shared between elements, so two faces on one
 * screen (the attitude picker has three) never blink together.
 */
function blinkRangeMs(who) {
  // Section 5 row 3: "every 4 to 9 seconds". Three bands inside that window,
  // never below 4000 and never above 9000.
  if (who === 'warm') return [4000, 5600];
  if (who === 'blunt') return [5400, 7400];
  return [7200, 9000]; // deadpan, the default
}

function scheduleBlink(el) {
  if (!el || !el.isConnected || prefersReducedMotion()) return;
  const [min, max] = blinkRangeMs(el.dataset?.who);
  const delay = min + Math.random() * (max - min);
  window.setTimeout(() => {
    if (!el.isConnected || el.dataset?.anim === 'none') return;
    if (!BLINK_EMBER_STATES.has(el.dataset?.state)) return;
    animateFace(el, 'blink');
    scheduleBlink(el);
  }, delay);
}

/**
 * Auto-attach the random blink to every eligible face that lands in the DOM,
 * so a screen that just does `container.innerHTML = faceSvg(...)` gets it for
 * free, with no per-screen wiring. Guarded for the Node verification harness,
 * which imports this module with no `document`.
 */
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const scheduled = new WeakSet();
  const scan = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const candidates = [];
    if (root.matches && root.matches('.face')) candidates.push(root);
    candidates.push(...root.querySelectorAll('.face'));
    for (const el of candidates) {
      if (scheduled.has(el)) continue;
      // A freshly mounted proud-hold face needs its 12px growth peak written
      // before the CSS animation reads it (`--proud-peak`, face.css row 13).
      if (el.dataset?.anim === 'proud-hold' && !el.style.getPropertyValue('--proud-peak')) {
        el.style.setProperty('--proud-peak', proudPeakFor(el));
      }
      if (el.dataset?.anim === 'none') continue;
      if (!BLINK_EMBER_STATES.has(el.dataset?.state)) continue;
      scheduled.add(el);
      scheduleBlink(el);
    }
  };
  const start = () => {
    if (!document.body) return;
    new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); });
    }).observe(document.body, { childList: true, subtree: true });
    scan(document.body);
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}

/**
 * The placeholder's other half: the state name in mono under the face,
 * AVATAR.md section 6. Behind one flag, default on; the artist landing real
 * art is this flag going false and nothing else.
 */
export function faceLabel(expression) {
  if (!FLAGS.placeholderLabels) return '';
  return `<span class="face-label">${expression}</span>`;
}

/**
 * A face plus its placeholder label, stacked, for a screen's own face slot.
 *
 * Not for a rasterised export (the share card draws `faceSvg` straight into a
 * canvas via an <img>, and a shipped share image is not a placeholder). Use
 * `faceSvg` directly wherever the face sits inline beside text in a row too
 * narrow to carry a second line.
 */
export function faceBlock(expression, opts = {}) {
  return `<span class="face-block">${faceSvg(expression, opts)}${faceLabel(expression)}</span>`;
}

/**
 * The shared unit: a face and a speech bubble, one component every screen
 * uses instead of composing its own pill, toast or header line. The bubble
 * always carries `say(key, facts)` from voice.js, so no screen ever writes
 * a Pexi line of its own.
 *
 * Face-left, bubble-right by default; `opts.side: 'right'` flips it to
 * face-right, bubble-left. Never below 48px: a bubble is always present, and
 * `face-row` (28px) is reserved for faces that stand alone in a row.
 *
 * @param {string} state   one of STATES, the face's expression
 * @param {string} key     a key in voice.js's LINES, passed to `say`
 * @param {object} [facts] already-formatted facts, passed straight to `say`
 * @param {object} [opts]
 * @param {number|string} [opts.size]  a SIZE_TOKENS name or a raw px number;
 *   resolved and then floored at 48 regardless (the bubble floor, not
 *   `faceSvg`'s own 28px row floor)
 * @param {string} [opts.who]   personality override, defaults to the user's
 *   own pick; governs both the face drawn and which personality's line
 *   `say` returns (the attitude picker's three faces each need their own
 *   voice, not the currently-picked one)
 * @param {string} [opts.anim]  animation name to play instead of the state's
 *   default (`DEFAULT_ANIM`), applied to the mounted face's `data-anim`. Also
 *   accepts the literal `'none'`, the same sentinel `faceSvg` writes for a
 *   `face-row` (28px) face: at any larger size a face otherwise always gets
 *   *some* default animation (idle-breath for `idle`, verdict-land for a
 *   tier, and so on), and a caller that genuinely wants a still face at 48px
 *   or above (AVATAR.md's own "none" rows, e.g. "Recently removed") needs a
 *   way to say so that is not "make the face 28px."
 * @param {'left'|'right'} [opts.side]  default `'left'` (face-left,
 *   bubble-right); `'right'` flips the layout
 * @param {string} [opts.tier]  when given, written as `data-tier` on the
 *   root so the bubble border picks up the tier tint from tokens.css
 * @returns {string} an HTML string: `.shin-say` root, `.face-block` >
 *   `.face` (plus the placeholder label when the flag is on), `.bubble` >
 *   `.bubble-text`
 */
export function shinSay(state, key, facts, opts = {}) {
  const who = opts.who ?? personality();
  const px = Math.max(SIZE_TOKENS['face-page'], resolveSize(opts.size ?? 'face-page'));
  let faceHtml = faceSvg(state, { size: px, who });
  if (opts.anim && (opts.anim === 'none' || ANIMATION_SET.has(opts.anim))) {
    // faceSvg already wrote the state's default data-anim; a caller-chosen
    // opts.anim overrides it in the same string, so the face never has to
    // be re-rendered just to change which animation it opens with.
    faceHtml = faceHtml.replace(/data-anim="[^"]*"/, `data-anim="${opts.anim}"`);
  }
  const side = opts.side === 'right' ? 'right' : 'left';
  const tierAttr = opts.tier ? ` data-tier="${opts.tier}"` : '';
  // opts.who governs both the face drawn and the personality that speaks:
  // a face shown in someone else's style saying the current user's line
  // would be the bug the attitude picker exists to avoid.
  const line = say(key, facts, who);

  return `<div class="shin-say" data-state="${state}" data-side="${side}"${tierAttr}>
    <span class="face-block">${faceHtml}${faceLabel(state)}</span>
    <div class="bubble">
      <!-- The line is escaped here rather than by each caller. Every screen
           interpolates into innerHTML, and voice.js lines carry facts that
           can be a user-typed item name or a seller they wrote down, so this
           is the last point before markup where the whole class of problem
           can be closed once. Callers must NOT escape on the way in:
           escapeHtml is not idempotent and "Tom & Jerry" would come back as
           "Tom &amp;amp; Jerry". voice.js holds no markup, so nothing is lost. -->
      <p class="bubble-text">${escapeHtml(line)}</p>
    </div>
  </div>`;
}

/**
 * Update a mounted `shinSay` root in place: morph the face to `state` (via
 * `morphFace`, which also plays `anim` or `state`'s own default animation),
 * and swap the bubble's line to `say(key, facts)`. No screen has to
 * re-render itself just to change what Pexi is saying.
 *
 * @param {HTMLElement} el     the mounted `.shin-say` root `shinSay` returned
 * @param {string} state       the face's new expression
 * @param {string} key         a key in voice.js's LINES, passed to `say`
 * @param {object} [facts]     already-formatted facts, passed straight to `say`
 * @param {string} [anim]      animation name to play instead of `state`'s
 *   default; forwarded to `morphFace`'s own `opts.anim`
 * @param {string} [who]       personality override, forwarded to both
 *   `morphFace` (which face geometry draws) and `say` (which voice speaks).
 *   Only for a mounted face that is locked to one personality regardless of
 *   the user's own pick (the attitude picker's three faces); every other
 *   caller omits it and gets the same behaviour as before this parameter
 *   existed.
 * @returns {void}
 */
export function updateShinSay(el, state, key, facts, anim, who) {
  if (!el) return;
  const face = el.querySelector('.face');
  const fromState = face?.dataset?.state ?? el.dataset.state ?? null;

  if (face) morphFace(face, fromState, state, { anim, who });
  el.dataset.state = state;

  const label = el.querySelector('.face-label');
  if (label) label.textContent = FLAGS.placeholderLabels ? state : '';

  const bubbleText = el.querySelector('.bubble-text');
  if (bubbleText) {
    bubbleText.textContent = say(key, facts, who);
    // pleased-nod (section 5 row 9): the acknowledgement line crossfades over
    // the nod's own 260ms, and under reduced motion that fade is the whole
    // animation ("opacity fade of the acknowledgement line only").
    if ((anim ?? DEFAULT_ANIM[state]) === 'pleased-nod') runClassAnimation(bubbleText, 'line-fade-run', 260);
  }
}

/**
 * The seller a verdict's asking price came from, or null.
 *
 * The engine writes the literal string "given" into askingSource when the caller
 * named no store. It is a placeholder, and it must never reach a screen ("at
 * given") or a saved record, where it would later look like a real seller and be
 * excluded from its own comparison set. One definition, so it cannot be missed
 * in one of the four places that ask.
 */
export function sellerOf(result) {
  const s = result?.askingSource;
  return typeof s === 'string' && s && s !== 'given' ? s : null;
}

/**
 * Confidence, as a fill treatment rather than a sentence at the bottom.
 *
 * This is the design's second law and the most important visual rule in the
 * product: same hue, four fills. A hollow verdict and a solid verdict must never
 * be mistaken for one another at arm's length.
 *
 * The bands come from the engine's own confidence object, so this function reads
 * a judgement and never makes one.
 */
export function confidenceOf(result) {
  /* A Gemini answer carries no seller count to draw dots from, so it gets the
     model's own mark and no dots: "not fully confident" when it said so, and a
     plain solid fill when it did not. A failed answer is the refusal band. */
  if (result && result.kind === 'gemini' && !result.failure && result.reason === undefined) {
    return result.lowConfidence === true
      ? { level: 'thin', dots: 0, label: t('cam_gem_not_confident') }
      : { level: 'sure', dots: 0, label: '' };
  }
  if (!result || result.kind !== 'verdict') {
    return { level: 'refuses', dots: 0, label: t('conf_no_price') };
  }
  const band = result.confidence?.band;
  // The engine already counted these. Recounting them here would be a second
  // opinion about the same evidence, which is how two numbers start disagreeing.
  const n = result.confidence?.distinctSellers ?? 0;
  /*
   * The count and the word beside it go out together, through one chrome key,
   * rather than being concatenated here. `level` and `dots` stay exactly what
   * they were: they are the machine-readable half, they drive a CSS attribute
   * and a fill, and a level that moved with the language would break every
   * stylesheet rule keyed on it.
   */
  const sellers = t('conf_sellers', { n: String(n) });

  if (band === 'high') return { level: 'certain', dots: 4, label: t('conf_certain', { sellers }) };
  if (band === 'medium') return { level: 'sure', dots: 3, label: t('conf_sure', { sellers }) };
  return { level: 'thin', dots: 2, label: t('conf_thin', { sellers }) };
}

const ZONE_WORD_KEY = {
  under_your_line: 'priceline_zone_under',
  middle: 'priceline_zone_middle',
  over_your_line: 'priceline_zone_over',
};

/**
 * The word for a history row whose answer was Gemini's, in the same words the
 * sheet headlined it with. `zone` and `answered` were copied onto the row's
 * `query` when the answer landed (Gemini's own code, never worked out here), so
 * this reads two stored fields and the wire itself is never opened.
 */
export function geminiWordFor(entry) {
  const zone = entry && entry.query ? entry.query.zone : null;
  if (typeof zone === 'string' && ZONE_WORD_KEY[zone]) return t(ZONE_WORD_KEY[zone]);
  return entry && entry.query && entry.query.answered === true ? t('cam_gem_answered_word') : t('cam_gem_failed_word');
}

/** The four confidence dots, filled left to right. */
export function dotsHtml(dots) {
  return `<span class="dots" aria-hidden="true">${
    [0, 1, 2, 3].map((i) => `<i${i < dots ? '' : ' class="off"'}></i>`).join('')
  }</span>`;
}
