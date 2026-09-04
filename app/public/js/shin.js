/**
 * Shin himself: the face, the money, and the confidence treatment.
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
 * three verdict tiers; that was wrong, because refusing is a state Shin is in
 * more often than any of them and it needs a face of its own rather than a
 * shrug. AVATAR.md section 2 adds the other seven on top of the six this file
 * already drew, and section 6 is the placeholder contract this file is.
 */

import { personality } from './voice.js';
import { FLAGS } from './flags.js';

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
 * Face geometry, keyed by personality then expression.
 *
 * Deadpan moves least: small eyes, near-flat mouths, brows that barely tilt.
 * Warm is rounder and blinks more. Blunt has the heaviest brow and the biggest
 * mouth deltas. The user picks which one they get, which is a recorded decision
 * and the reason every one of these has three variants.
 */
const GEOM = {
  deadpan: {
    eyeR: 3.8, stroke: 3.2,
    good: { brow: 'M24 31 L38 30M50 30 L64 31', mouth: 'M30 59 Q44 67 58 59' },
    fair: { brow: 'M24 31 L38 31M50 31 L64 31', mouth: 'M30 62 L58 62' },
    walk: { brow: 'M24 27 L38 32M64 27 L50 32', mouth: 'M30 66 Q44 58 58 66' },
    unknown: { brow: 'M25 30 L37 30M51 30 L63 30', mouth: 'M31 63 Q38 59 44 63 Q50 67 57 63' },
    thinking: { brow: 'M24 31 L38 31M50 31 L64 31', mouth: null },
    pleased: { brow: 'M24 30 L38 29M50 29 L64 30', mouth: 'M29 58 Q44 70 59 58' },
    /* --- the seven added states, section 2 --- */
    idle: { brow: 'M25 31 L39 31M49 31 L63 31', mouth: 'M31 61 L57 61' },
    asking: { brow: 'M24 29 L38 32M50 32 L64 29', mouth: 'M40 59 Q44 64 48 59 Q44 62 40 59' },
    delighted: { brow: 'M23 29 L38 27M50 27 L65 29', mouth: 'M28 57 Q44 71 60 57' },
    angry: { brow: 'M23 25 L38 33M65 25 L50 33', mouth: 'M28 68 Q44 56 60 68' },
    nudging: { brow: 'M24 28 L38 31M50 31 L64 28', mouth: 'M32 60 Q44 64 56 60' },
    asleep: { brow: 'M25 33 L37 33M51 33 L63 33', mouth: 'M33 61 L55 61', closedEyes: true },
    proud: { brow: 'M24 30 L38 28M50 28 L64 30', mouth: 'M31 58 Q44 64 57 58' },
  },
  warm: {
    eyeR: 4.6, stroke: 3.4,
    good: { brow: 'M23 30 Q31 25 39 29M49 29 Q57 25 65 30', mouth: 'M27 57 Q44 74 61 57' },
    fair: { brow: 'M23 30 Q31 28 39 30M49 30 Q57 28 65 30', mouth: 'M30 61 Q44 66 58 61' },
    walk: { brow: 'M23 28 Q31 24 39 31M65 28 Q57 24 49 31', mouth: 'M29 67 Q44 57 59 67' },
    unknown: { brow: 'M24 30 Q31 27 38 30M50 30 Q57 27 64 30', mouth: 'M30 63 Q37 58 44 63 Q51 68 58 63' },
    thinking: { brow: 'M23 30 Q31 28 39 30M49 30 Q57 28 65 30', mouth: null },
    pleased: { brow: 'M23 29 Q31 23 39 28M49 28 Q57 23 65 29', mouth: 'M26 56 Q44 78 62 56' },
    /* --- the seven added states, section 2 --- */
    idle: { brow: 'M23 30 Q31 29 39 30M49 30 Q57 29 65 30', mouth: 'M28 60 Q44 63 60 60' },
    asking: { brow: 'M23 27 Q31 22 39 30M49 30 Q57 27 65 26', mouth: 'M39 58 Q44 67 49 58 Q44 63 39 58' },
    delighted: { brow: 'M23 27 Q31 21 39 28M49 28 Q57 21 65 27', mouth: 'M25 55 Q44 80 63 55' },
    angry: { brow: 'M23 26 Q31 21 39 32M65 26 Q57 21 49 32', mouth: 'M27 70 Q44 54 61 70' },
    nudging: { brow: 'M23 28 Q31 24 39 29M49 29 Q57 24 65 28', mouth: 'M29 59 Q44 65 59 59' },
    asleep: { brow: 'M23 31 Q31 30 39 31M49 31 Q57 30 65 31', mouth: 'M30 62 Q44 65 58 62', closedEyes: true },
    proud: { brow: 'M23 28 Q31 24 39 29M49 29 Q57 24 65 28', mouth: 'M27 57 Q44 71 61 57' },
  },
  blunt: {
    eyeR: 4.0, stroke: 4.0,
    good: { brow: 'M23 30 L39 27M49 27 L65 30', mouth: 'M28 58 Q44 70 60 58' },
    fair: { brow: 'M23 29 L39 30M49 30 L65 29', mouth: 'M28 62 L60 62' },
    walk: { brow: 'M22 24 L40 34M66 24 L48 34', mouth: 'M27 69 Q44 55 61 69' },
    unknown: { brow: 'M23 29 L39 29M49 29 L65 29', mouth: 'M30 64 Q37 59 44 64 Q51 69 58 64' },
    thinking: { brow: 'M23 29 L39 30M49 30 L65 29', mouth: null },
    pleased: { brow: 'M22 28 L40 24M48 24 L66 28', mouth: 'M26 57 Q44 74 62 57' },
    /* --- the seven added states, section 2 --- */
    idle: { brow: 'M23 30 L39 30M49 30 L65 30', mouth: 'M28 62 L60 62' },
    asking: { brow: 'M22 26 L40 31M48 31 L66 25', mouth: 'M38 58 Q44 68 50 58 Q44 63 38 58' },
    delighted: { brow: 'M22 27 L40 23M48 23 L66 27', mouth: 'M26 56 Q44 74 62 56' },
    angry: { brow: 'M21 22 L41 34M67 22 L47 34', mouth: 'M25 71 Q44 52 63 71' },
    nudging: { brow: 'M22 25 L40 29M48 29 L66 25', mouth: 'M30 60 Q44 66 58 60' },
    asleep: { brow: 'M23 30 L39 30M49 30 L65 30', mouth: 'M31 63 L57 63', closedEyes: true },
    proud: { brow: 'M22 28 L40 25M48 25 L66 28', mouth: 'M26 57 Q44 72 62 57' },
  },
};

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

/** States that get a natural, un-synchronised random blink: idle and the
 * verdict faces. Not `unknown` -- its only motion is `slow-blink`. Not
 * `thinking`/`nudging`/`asleep`/`proud`/`pleased` -- each of those already owns
 * a dedicated motion of its own. */
const BLINK_EMBER_STATES = new Set(['idle', 'asking', 'good', 'fair', 'walk', 'delighted', 'angry']);

function dotsMarkup(ink) {
  return `<circle cx="33" cy="61" r="2.6" fill="${ink}" stroke="none"/>
       <circle cx="44" cy="61" r="2.6" fill="${ink}" stroke="none"/>
       <circle cx="55" cy="61" r="2.6" fill="${ink}" stroke="none"/>`;
}

function openEyesMarkup(ink, eyeR) {
  return `<circle cx="31" cy="44" r="${eyeR}" fill="${ink}"/>
       <circle cx="57" cy="44" r="${eyeR}" fill="${ink}"/>`;
}

function closedEyesMarkup(ink, stroke) {
  const w = (stroke * 0.75).toFixed(2);
  return `<path d="M27 44 Q31 47.5 35 44" stroke="${ink}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
       <path d="M53 44 Q57 47.5 61 44" stroke="${ink}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
}

/**
 * Shin's face as an SVG string.
 *
 * The xmlns is load-bearing, not decoration. Inline HTML tolerates its absence;
 * a standalone SVG document does not, so without it any screen that rasterises
 * this face onto a canvas gets a silently broken image and throws nothing. That
 * happened once already and the share card shipped a face with no eyebrows.
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
 * @param {string} [opts.ink]     stroke colour, defaults to the current tier
 * @param {string} [opts.who]     personality override, defaults to the user's
 */
export function faceSvg(expression, opts = {}) {
  const who = opts.who ?? personality();
  const set = GEOM[who] ?? GEOM.deadpan;
  // Every one of the thirteen states has its own entry in every personality
  // (checked by scripts/verify-faces used in the build pass). The ?? here is
  // a guard against a typo'd expression name, never a real fallback.
  const g = set[expression] ?? set.fair;
  const size = resolveSize(opts.size);
  const ink = opts.ink ?? 'currentColor';
  const isRefusal = expression === 'unknown';
  const rowSized = size === SIZE_TOKENS['face-row'];

  // Thinking has no mouth path; it has three dots, which reads as waiting
  // rather than as an opinion Shin has not formed yet.
  const mouth = g.mouth ? `<path d="${g.mouth}"/>` : dotsMarkup(ink);

  // Asleep is the one state with its eyes shut. Everything else keeps the
  // filled circles; a closed eye anywhere else would read as a wink, not rest.
  const eyes = g.closedEyes ? closedEyesMarkup(ink, set.stroke) : openEyesMarkup(ink, set.eyeR);

  const animName = rowSized ? null : (DEFAULT_ANIM[expression] ?? null);
  const animAttr = rowSized ? ' data-anim="none"' : (animName ? ` data-anim="${animName}"` : '');
  const staticClass = rowSized ? ' face-static' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="${size}" height="${size}"
       role="img" aria-label="Shin: ${expression}" class="face face-${expression}${staticClass}"
       data-state="${expression}" data-who="${who}"${animAttr} focusable="false">
      <circle class="face-ring" cx="44" cy="44" r="41" fill="none" stroke="${ink}" stroke-width="${set.stroke}"
              ${isRefusal ? 'stroke-dasharray="9 7"' : ''}/>
      <g class="face-features" stroke="${ink}" stroke-width="${set.stroke}" stroke-linecap="round" fill="none">
        <path class="face-brow" d="${g.brow}"/>
        <g class="face-mouth">${mouth}</g>
      </g>
      <g class="face-eyes">${eyes}</g>
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
  if (el.dataset && el.dataset.anim === 'none') return; // face-row: never animates

  if (prefersReducedMotion()) {
    // Reduced motion still records which animation "happened", so CSS's own
    // reduced-motion block (every entry becomes an opacity fade or a static
    // frame, AVATAR.md section 5) can render the right final frame.
    if (el.dataset) el.dataset.anim = name;
    return;
  }

  if (name === 'blink') {
    triggerBlink(el);
    return;
  }

  if (el.dataset) el.dataset.anim = name;
  el.classList.remove('face-anim-run');
  // Force a reflow so re-adding the class restarts the CSS animation even
  // when the name (and therefore the animation-name) did not change.
  void el.offsetWidth;
  el.classList.add('face-anim-run');
}

function triggerBlink(el) {
  el.classList.remove('face-blink-now');
  void el.offsetWidth;
  el.classList.add('face-blink-now');
  window.setTimeout(() => el.classList.remove('face-blink-now'), 200);
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
 * @param {string} [opts.ink]     stroke colour override, defaults to the face's own
 * @param {string} [opts.anim]    animation name to play instead of the target
 *   state's default
 */
export function morphFace(el, fromState, toState, opts = {}) {
  if (!el) return;
  const who = opts.who ?? el.dataset?.who ?? personality();
  const set = GEOM[who] ?? GEOM.deadpan;
  const g = set[toState] ?? set.fair;
  const ink = opts.ink ?? el.getAttribute('stroke') ?? 'currentColor';
  const rowSized = el.dataset && el.dataset.anim === 'none';
  const from = fromState ?? el.dataset?.state;

  if (from) el.classList.remove(`face-${from}`);
  el.classList.add(`face-${toState}`);
  if (el.dataset) el.dataset.state = toState;
  el.setAttribute('aria-label', `Shin: ${toState}`);

  const ring = el.querySelector('.face-ring');
  if (ring) {
    if (toState === 'unknown') ring.setAttribute('stroke-dasharray', '9 7');
    else ring.removeAttribute('stroke-dasharray');
  }

  const brow = el.querySelector('.face-brow');
  const mouth = el.querySelector('.face-mouth');
  const eyes = el.querySelector('.face-eyes');
  const applyBrow = () => { if (brow) brow.setAttribute('d', g.brow); };
  const applyMouthAndEyes = () => {
    if (mouth) mouth.innerHTML = g.mouth ? `<path d="${g.mouth}"/>` : dotsMarkup(ink);
    if (eyes) eyes.innerHTML = g.closedEyes ? closedEyesMarkup(ink, set.stroke) : openEyesMarkup(ink, set.eyeR);
  };

  if (prefersReducedMotion()) {
    applyBrow();
    applyMouthAndEyes();
  } else {
    applyBrow();
    window.setTimeout(applyMouthAndEyes, 40);
  }

  if (rowSized) {
    if (el.dataset) el.dataset.anim = 'none';
    el.classList.add('face-static');
    return;
  }
  animateFace(el, opts.anim ?? DEFAULT_ANIM[toState] ?? 'face-morph');
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
  if (who === 'warm') return [3800, 6200];
  if (who === 'blunt') return [5200, 7600];
  return [6600, 9000]; // deadpan, the default
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

/** Money, from cents, the same way the engine formats it. */
export function cad(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '--';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
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
  if (!result || result.kind !== 'verdict') {
    return { level: 'refuses', dots: 0, label: 'No price to compare' };
  }
  const band = result.confidence?.band;
  // The engine already counted these. Recounting them here would be a second
  // opinion about the same evidence, which is how two numbers start disagreeing.
  const n = result.confidence?.distinctSellers ?? 0;
  const sellers = n === 1 ? '1 seller' : `${n} sellers`;

  if (band === 'high') return { level: 'certain', dots: 4, label: `Certain · ${sellers}` };
  if (band === 'medium') return { level: 'sure', dots: 3, label: `Fairly sure · ${sellers}` };
  return { level: 'thin', dots: 2, label: `Thin · ${sellers}` };
}

/** The four confidence dots, filled left to right. */
export function dotsHtml(dots) {
  return `<span class="dots" aria-hidden="true">${
    [0, 1, 2, 3].map((i) => `<i${i < dots ? '' : ' class="off"'}></i>`).join('')
  }</span>`;
}
