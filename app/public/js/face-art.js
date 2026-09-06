/**
 * Shin's face, drawn: the head and upper body on a circle, one 88 by 88
 * viewBox, flat vector, no gradients, no filters, no clip paths.
 *
 * This file is the single source for the in-app face set. `shin.js` reads it
 * to render a face inline and to morph one in place; `scripts/build-faces.mjs`
 * reads it to write the standalone files under `public/faces/<who>/<state>.svg`,
 * which are the deliverable form the contract in docs/design/AVATAR.md
 * section 6 names. If hand-drawn art ever replaces those files, this module
 * is what gets regenerated from them, not the other way round.
 *
 * The character, decided 2026-09-05 from a reference image: rounded egg body
 * in bright cyan, thick dark navy outline, large glossy eyes with dark irises
 * and a white highlight, thick dark brows, a small mouth with one tooth when
 * smiling, an orange propeller beanie, an orange lanyard with a barcode badge.
 * The sneakers are below the crop and do not appear here.
 *
 * Colour rules:
 *   - The OUTLINE, brows and mouth are `currentColor`, so the build sets the
 *     ink at render time (the verdict hue on a verdict, the on-tier ink on a
 *     filled row, navy when nothing overrides it). The standalone files carry
 *     `color="#12233A"` on the root so they read as navy when opened alone.
 *   - The irises (and the badge's barcode print) stay navy no matter what,
 *     or a white ink on a dark theme would erase them against the whites.
 *     Navy is only ever a fill; every stroke is currentColor.
 *   - The body cyan and the orange accents never change.
 *
 * Every feature is sized to survive 28px: nothing thinner than 2 user units
 * carries meaning, and the eyes are a third of the head's width.
 */

export const INK_DEFAULT = '#12233A';
export const BODY = '#2BB5F0';
export const ACCENT = '#F26B1D';
export const DISC = '#DDF1FA';
const IRIS = '#12233A';
const WHITE = '#FFFFFF';

/** Outline weights, in user units on the 88 viewBox. */
const W = { body: 3, eye: 2.4, brow: 3.6, mouth: 2.8, small: 2 };

/* ------------------------------------------------------------------ parts */

function disc() {
  return `<circle class="face-disc" cx="44" cy="44" r="40.5" fill="${DISC}"/>`;
}

function ring() {
  return `<circle class="face-ring" cx="44" cy="44" r="40.5" fill="none" stroke="currentColor" stroke-width="${W.body}"/>`;
}

/**
 * Shoulders and lanyard. The lower edge is the disc's own arc, so nothing
 * needs clipping; the ring drawn last hides the seam.
 * @param {{ lift?: number }} o  `lift` raises the chest (proud)
 */
function body({ lift = 0 } = {}) {
  const t = lift ? ` transform="translate(0 ${-lift})"` : '';
  return `<g class="face-body"${t}>
  <path d="M32 67 C27 70 22 73 19.2 76 A40.5 40.5 0 0 0 68.8 76 C66 73 61 70 56 67 Z" fill="${BODY}" stroke="currentColor" stroke-width="${W.body}" stroke-linejoin="round"/>
  <path d="M38.5 70 L41 77 M49.5 70 L47 77" stroke="currentColor" stroke-width="4.6" stroke-linecap="round" fill="none"/>
  <path d="M38.5 70 L41 77 M49.5 70 L47 77" stroke="${ACCENT}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <rect x="38.5" y="75.5" width="11" height="7" rx="1.5" fill="${WHITE}" stroke="currentColor" stroke-width="${W.small}"/>
  <path d="M40.6 77.5 h1.3 v3 h-1.3 Z M43 77.5 h1.3 v3 h-1.3 Z M45.4 77.5 h1.3 v3 h-1.3 Z" fill="${IRIS}"/>
</g>`;
}

/** The egg. Narrower at the top, rounder at the jaw. */
function skull() {
  return `<path class="face-skull" d="M44 17 C59 17 68 30 68 46 C68 61 57 70 44 70 C31 70 20 61 20 46 C20 30 29 17 44 17 Z" fill="${BODY}" stroke="currentColor" stroke-width="${W.body}"/>`;
}

/**
 * The propeller beanie.
 * @param {{ prop?: number }} o  `prop` tilts the propeller in degrees (drooped when angry, tipped when asleep)
 */
function hat({ prop = 0 } = {}) {
  const spin = prop ? ` transform="rotate(${prop} 44 10.5)"` : '';
  return `<g class="face-hat">
  <path d="M24 29.5 C26 19 35 14.5 44 14.5 C53 14.5 62 19 64 29.5 C57 27 31 27 24 29.5 Z" fill="${ACCENT}" stroke="currentColor" stroke-width="${W.body}" stroke-linejoin="round"/>
  <path d="M44 14.5 L44 10.5" stroke="currentColor" stroke-width="${W.body}" stroke-linecap="round"/>
  <g${spin}>
    <path d="M34.5 9.5 Q44 5.5 53.5 9.5 Q44 13.5 34.5 9.5 Z" fill="${ACCENT}" stroke="currentColor" stroke-width="${W.small}" stroke-linejoin="round"/>
    <circle cx="44" cy="9.5" r="1.5" fill="currentColor"/>
  </g>
</g>`;
}

/**
 * One eye, built in layers so a lid at any height needs no clipPath:
 * white, iris, highlight, then a body-coloured lid over the top part, its
 * lower edge stroked, then the eye's own outline stroked on top of all of it.
 *
 * @param {object} o
 * @param {number} o.cx  centre x
 * @param {number} o.cy  centre y
 * @param {number} [o.rx]  half width, default 8.5
 * @param {number} [o.ry]  half height, default 9
 * @param {number} [o.iris]  iris radius, default 4.6
 * @param {number} [o.dx]  iris offset x (a glance)
 * @param {number} [o.dy]  iris offset y
 * @param {number} [o.lid]  0 to 1, how much of the eye the upper lid covers
 * @param {'dot'|'star'|null} [o.shine]  highlight shape, default 'dot'
 */
function eye({ cx, cy, rx = 8.5, ry = 9, iris = 4.6, dx = 0, dy = 0, lid = 0, shine = 'dot' }) {
  const parts = [];
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${WHITE}"/>`);
  parts.push(`<circle cx="${cx + dx}" cy="${cy + dy}" r="${iris}" fill="${IRIS}"/>`);
  if (shine === 'dot') {
    parts.push(`<circle cx="${cx + dx + 1.6}" cy="${cy + dy - 1.6}" r="1.6" fill="${WHITE}"/>`);
  } else if (shine === 'star') {
    const sx = cx + dx + 1.2, sy = cy + dy - 1.2;
    parts.push(`<path d="M${sx} ${sy - 3} L${sx + 0.9} ${sy - 0.9} L${sx + 3} ${sy} L${sx + 0.9} ${sy + 0.9} L${sx} ${sy + 3} L${sx - 0.9} ${sy + 0.9} L${sx - 3} ${sy} L${sx - 0.9} ${sy - 0.9} Z" fill="${WHITE}"/>`);
  }
  if (lid > 0) {
    const yc = cy - ry + 2 * ry * lid;
    const k = (yc - cy) / ry;
    const hw = rx * Math.sqrt(Math.max(0, 1 - k * k));
    const large = lid > 0.5 ? 1 : 0;
    const x0 = (cx - hw).toFixed(2), x1 = (cx + hw).toFixed(2), y = yc.toFixed(2);
    parts.push(`<path d="M${x0} ${y} A${rx} ${ry} 0 ${large} 1 ${x1} ${y} Z" fill="${BODY}"/>`);
    parts.push(`<path d="M${x0} ${y} L${x1} ${y}" stroke="currentColor" stroke-width="${W.eye}" stroke-linecap="round" fill="none"/>`);
  }
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="currentColor" stroke-width="${W.eye}"/>`);
  return parts.join('\n    ');
}

/** A closed eye: `up` arches like a contented smile, otherwise it sags like sleep. */
function closedEye(cx, cy, up) {
  const d = up ? `M${cx - 7} ${cy + 1} Q${cx} ${cy - 7} ${cx + 7} ${cy + 1}` : `M${cx - 7} ${cy - 1} Q${cx} ${cy + 5} ${cx + 7} ${cy - 1}`;
  return `<path d="${d}" stroke="currentColor" stroke-width="${W.brow}" stroke-linecap="round" fill="none"/>`;
}

function eyesOpen(o = {}) {
  return `${eye({ cx: 33.5, cy: 47, ...o })}\n    ${eye({ cx: 54.5, cy: 47, ...o })}`;
}

function eyesClosed(up) {
  return `${closedEye(33.5, 47, up)}\n    ${closedEye(54.5, 47, up)}`;
}

/** Brows as two segments, each [x0, y0, x1, y1], drawn heavy. */
function brows(left, right, weight = W.brow) {
  const seg = ([x0, y0, x1, y1]) => `M${x0} ${y0} L${x1} ${y1}`;
  return `<path d="${seg(left)} ${seg(right)}" stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" fill="none"/>`;
}

const MOUTH = {
  flat: (w = 12, y = 64) => `<path d="M${44 - w / 2} ${y} L${44 + w / 2} ${y}" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  /** A closed smile with one tooth hanging under the lip line. The tooth is drawn first so the lip covers its top edge. */
  smile: (depth = 2.2, tooth = true) => `${tooth ? `<rect x="43.4" y="${(62 + depth * 0.93 - 0.6).toFixed(2)}" width="3.8" height="4.6" rx="1" fill="${WHITE}" stroke="currentColor" stroke-width="1.6"/>` : ''}
    <path d="M38 62 Q44 ${62 + depth * 2} 50 62" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  /** An open smile, the mouth interior in ink, the tooth inside it. */
  grin: () => `<path d="M36 60 Q44 72 52 60 Z" fill="currentColor" stroke="currentColor" stroke-width="${W.mouth}" stroke-linejoin="round"/>
    <rect x="39.8" y="60.6" width="4.2" height="3.4" rx=".8" fill="${WHITE}"/>`,
  frown: () => `<path d="M39 66.5 Q44 62.5 49 66.5" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  o: () => `<circle cx="44" cy="64.5" r="2.8" fill="none" stroke="currentColor" stroke-width="${W.mouth}"/>`,
  /** Pulled to one side: a flat line with a lift at the right end. */
  aside: () => `<path d="M37 65 L49 63" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  /** Three dots for `thinking`; `face.css`'s think-dots keys on these circles. */
  dots: () => `<circle cx="38" cy="64" r="2.2" fill="currentColor"/>
    <circle cx="44" cy="64" r="2.2" fill="currentColor"/>
    <circle cx="50" cy="64" r="2.2" fill="currentColor"/>`,
};

/* ----------------------------------------------------- the thirteen states */

/**
 * Each state names its parts. `pose` is a transform on the whole head group,
 * so the features ride the tilt; `bodyLift` raises the chest; `prop` tilts
 * the propeller; `extras` is anything drawn outside the head (the sleeping z).
 *
 * Deadpan treatment: the smallest eye movement, near-flat mouths, one brow
 * moving at a time. Warm and Blunt do not exist yet and fall back to this.
 */
const LEVEL_L = [26, 34, 40, 34];
const LEVEL_R = [48, 34, 62, 34];

export const DEADPAN = {
  idle: {
    brows: brows([26, 33, 40, 33], [48, 33, 62, 33]),
    eyes: eyesOpen(),
    mouth: MOUTH.flat(8),
  },
  thinking: {
    brows: brows([26, 32, 40, 33], [48, 33, 62, 32]),
    eyes: eyesOpen({ dx: 2.4, dy: -2.8 }),
    mouth: MOUTH.dots(),
  },
  asking: {
    pose: 'rotate(-8 44 50)',
    brows: brows([26, 29.5, 40, 32], LEVEL_R),
    eyes: eyesOpen(),
    mouth: MOUTH.o(),
  },
  good: {
    brows: brows([26, 33.5, 40, 32.5], [48, 32.5, 62, 33.5]),
    eyes: eyesOpen(),
    mouth: MOUTH.smile(2.2),
  },
  delighted: {
    brows: brows([26, 31, 40, 29.5], [48, 29.5, 62, 31]),
    eyes: eyesOpen({ rx: 8.6, ry: 10, iris: 5.2, shine: 'star' }),
    mouth: MOUTH.grin(),
  },
  fair: {
    brows: brows(LEVEL_L, LEVEL_R),
    eyes: eyesOpen(),
    mouth: MOUTH.flat(12),
  },
  walk: {
    brows: brows([26, 33, 40, 36], LEVEL_R),
    eyes: eyesOpen({ lid: 0.42 }),
    mouth: MOUTH.aside(),
  },
  angry: {
    prop: -18,
    brows: brows([25, 30.5, 41, 37], [63, 30.5, 47, 37], 4.2),
    eyes: eyesOpen({ rx: 8, ry: 5, iris: 3.8, shine: null }),
    mouth: MOUTH.frown(),
  },
  unknown: {
    brows: brows(LEVEL_L, LEVEL_R),
    eyes: eyesOpen({ lid: 0.5, shine: null }),
    mouth: MOUTH.flat(9),
  },
  pleased: {
    brows: brows([26, 32.5, 40, 32], [48, 32, 62, 32.5]),
    eyes: eyesClosed(true),
    mouth: MOUTH.smile(1.6, false),
  },
  nudging: {
    pose: 'translate(0 1) rotate(6 44 50)',
    brows: brows(LEVEL_L, [48, 32, 62, 29.5]),
    eyes: eyesOpen({ dx: -1.2 }),
    mouth: MOUTH.flat(9, 64),
  },
  asleep: {
    pose: 'translate(0 3) rotate(4 44 50)',
    prop: 22,
    brows: brows([26, 36, 40, 36], [48, 36, 62, 36]),
    eyes: eyesClosed(false),
    mouth: MOUTH.flat(7, 65),
    extras: `<path d="M64 21 L71 21 L64 28 L71 28" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  },
  proud: {
    pose: 'translate(0 -1.5)',
    bodyLift: 2.5,
    brows: brows([26, 32, 40, 31], [48, 31, 62, 32]),
    eyes: eyesClosed(true),
    mouth: MOUTH.smile(2, true),
  },
};

export const FACE_SETS = { deadpan: DEADPAN };

/** The thirteen state names, in the contract's order. */
export const FACE_STATES = Object.keys(DEADPAN);

/**
 * The parts of one face, as markup strings, keyed so `shin.js` can swap them
 * one group at a time (eyes and brows first, mouth 40ms behind).
 */
export function faceParts(who, state) {
  const set = FACE_SETS[who] ?? DEADPAN;
  const s = set[state] ?? DEADPAN.fair;
  return {
    pose: s.pose ?? '',
    body: body({ lift: s.bodyLift ?? 0 }),
    hat: hat({ prop: s.prop ?? 0 }),
    brows: s.brows,
    eyes: s.eyes,
    mouth: s.mouth,
    extras: s.extras ?? '',
  };
}

/**
 * Everything inside the `<svg>`: disc, body, head with its features, ring.
 * The root element is the caller's, so the same markup serves an inline face
 * with the app's classes and data attributes and a standalone file.
 */
export function faceInner(who, state) {
  const p = faceParts(who, state);
  const poseAttr = p.pose ? ` transform="${p.pose}"` : '';
  return `${disc()}
  ${p.body}
  <g class="face-head"${poseAttr}>
    ${skull()}
    ${p.hat}
    <g class="face-brows">${p.brows}</g>
    <g class="face-eyes">${p.eyes}</g>
    <g class="face-mouth">${p.mouth}</g>
  </g>
  <g class="face-extras">${p.extras}</g>
  ${ring()}`;
}

/**
 * A standalone SVG document for one state: xmlns, the 88 viewBox, and a
 * default navy ink on the root so `currentColor` resolves when the file is
 * opened on its own. This is exactly what `scripts/build-faces.mjs` writes.
 */
export function standaloneSvg(who, state) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="88" height="88" color="${INK_DEFAULT}" role="img" aria-label="Shin: ${state}">
  ${faceInner(who, state)}
</svg>
`;
}
