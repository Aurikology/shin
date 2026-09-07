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
 *
 * The hub is a navy fill and not `currentColor`, for the same reason the irises
 * are: it sits on the orange blade, and an ink that follows the verdict hue put
 * a green dot in the middle of an orange propeller on a good verdict while the
 * blade around it stayed orange. Navy is only ever a fill, so this keeps the
 * colour rule at the top of the file.
 *
 * @param {{ prop?: number }} o  `prop` tilts the propeller in degrees (drooped when angry, tipped when asleep)
 */
function hat({ prop = 0 } = {}) {
  const spin = prop ? ` transform="rotate(${prop} 44 10.5)"` : '';
  return `<g class="face-hat">
  <path d="M24 29.5 C26 19 35 14.5 44 14.5 C53 14.5 62 19 64 29.5 C57 27 31 27 24 29.5 Z" fill="${ACCENT}" stroke="currentColor" stroke-width="${W.body}" stroke-linejoin="round"/>
  <path d="M44 14.5 L44 10.5" stroke="currentColor" stroke-width="${W.body}" stroke-linecap="round"/>
  <g${spin}>
    <path d="M34.5 9.5 Q44 5.5 53.5 9.5 Q44 13.5 34.5 9.5 Z" fill="${ACCENT}" stroke="currentColor" stroke-width="${W.small}" stroke-linejoin="round"/>
    <circle cx="44" cy="9.5" r="1.5" fill="${IRIS}"/>
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

/**
 * Every entry takes its shape parameters with defaults that reproduce the
 * Deadpan drawing byte for byte, because the thirteen Deadpan files are
 * committed and `build-faces.mjs --check` compares against them. Warm and
 * Blunt pass arguments; Deadpan calls the same functions bare and gets the
 * same string it always got. Widening a mouth is the single strongest signal
 * that survives 28px, where a 14 unit mouth is 4.5 device px and a 6 unit one
 * is 1.9 - a difference the eye reads before it reads a brow angle.
 */
const MOUTH = {
  flat: (w = 12, y = 64) => `<path d="M${44 - w / 2} ${y} L${44 + w / 2} ${y}" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  /**
   * A closed smile with one tooth under the lip line.
   *
   * The tooth is centred on the mouth's own centre and tucked so the lip stroke
   * covers its top edge. It used to be a fixed rect at x 43.4, which put its
   * centre on 45.3 while the lip's centre was 44, and it sat low enough that
   * almost none of it was behind the lip; at 300px it read as a detached white
   * block beside the mouth rather than as a tooth in it. Both numbers now come
   * from the lip, so a deeper smile keeps the tooth seated.
   */
  smile: (depth = 2.2, tooth = true) => `${tooth ? `<rect x="42.3" y="${(62 + depth - 0.9).toFixed(2)}" width="3.4" height="3.6" rx=".8" fill="${WHITE}" stroke="currentColor" stroke-width="1.6"/>` : ''}
    <path d="M38 62 Q44 ${62 + depth * 2} 50 62" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  /**
   * An open smile, the mouth interior in ink, the tooth inside it. `halfW`
   * widens it, `drop` deepens it, and the tooth is derived from both. It used
   * to be a rect fixed at x 39.8 while the mouth width was a parameter, so
   * Warm's `grin(10.5, 15)` drew its tooth a third of the way in from the left
   * corner of a mouth 2.5 units wider than the one the number was fitted to.
   */
  grin: (halfW = 8, drop = 12) => `<path d="M${44 - halfW} 60 Q44 ${60 + drop} ${44 + halfW} 60 Z" fill="currentColor" stroke="currentColor" stroke-width="${W.mouth}" stroke-linejoin="round"/>
    <rect x="${(44 - halfW * 0.2625).toFixed(2)}" y="${(60 + drop * 0.05).toFixed(2)}" width="${(halfW * 0.525).toFixed(2)}" height="${(drop * 0.283).toFixed(2)}" rx=".8" fill="${WHITE}"/>`,
  frown: (w = 10, depth = 4, y = 66.5) => `<path d="M${44 - w / 2} ${y} Q44 ${y - depth} ${44 + w / 2} ${y}" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  o: (r = 2.8, y = 64.5) => `<circle cx="44" cy="${y}" r="${r}" fill="none" stroke="currentColor" stroke-width="${W.mouth}"/>`,
  /** Pulled to one side: a flat line with a lift at the right end. */
  aside: () => `<path d="M37 65 L49 63" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  /**
   * Blunt's approval: `aside` with the tilt pushed far enough to read as a
   * decision rather than as a slack mouth. Centred on 44 unlike `aside`, which
   * sits a unit to the left; that asymmetry is Deadpan's and is left alone.
   */
  smirk: (w = 10, tilt = 3, y = 64) => `<path d="M${44 - w / 2} ${y + tilt / 2} L${44 + w / 2} ${y - tilt / 2}" stroke="currentColor" stroke-width="${W.mouth}" stroke-linecap="round" fill="none"/>`,
  /** Three dots for `thinking`; `face.css`'s think-dots keys on these circles, so all three sets keep exactly three. */
  dots: (gap = 6, r = 2.2, y = 64) => `<circle cx="${44 - gap}" cy="${y}" r="${r}" fill="currentColor"/>
    <circle cx="44" cy="${y}" r="${r}" fill="currentColor"/>
    <circle cx="${44 + gap}" cy="${y}" r="${r}" fill="currentColor"/>`,
};

/* ----------------------------------------------------- the thirteen states */

/**
 * Each state names its parts. `pose` is a transform on the whole head group,
 * so the features ride the tilt; `bodyLift` raises the chest; `prop` tilts
 * the propeller; `extras` is anything drawn outside the head (the sleeping z).
 *
 * Deadpan treatment: the smallest eye movement, near-flat mouths, one brow
 * moving at a time. It is the default and the reference: `WARM` and `BLUNT`
 * below are written as departures from these thirteen records, and the thirteen
 * committed `faces/deadpan/*.svg` files hold this table byte for byte, so
 * nothing here may change without regenerating them.
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

/* ------------------------------------------------------------------- warm */

/**
 * Warm, from `voice.js`: "On your side about it."
 *
 * The three sets have to be tellable apart at `face-row`, 28px, where the whole
 * 88 unit viewBox is 28 device px and one user unit is 0.318 px. That kills
 * most of the vocabulary an illustrator would reach for: a 1 unit brow lift is
 * a third of a pixel and is simply not there. Three things do survive the
 * reduction, and all three are used here rather than a pile of small ones.
 *
 * 1. **Eye aspect.** The eye is the largest feature, so its silhouette reads
 *    even when nothing inside it does. Warm is 8.8 by 10.4 against Deadpan's
 *    8.5 by 9: taller than wide, which is the shape a face makes when it is
 *    open rather than appraising. The iris goes 4.6 to 5.4, so the dark mass
 *    inside the white grows 38% in area and reads as pupil dilation at a size
 *    where the pupil itself is 1.7px. `rx` stops at 8.8 and not higher because
 *    the eyes sit at cx 33.5 and 54.5: at 8.8 the gap between them is 3.4
 *    units, the same clearance Deadpan has, and past 9.5 the two 2.4-weight
 *    outlines merge into one dark bar at row size.
 * 2. **Brow weight and length**, and NOT brow height. Raising the brow is the
 *    obvious way to draw an open face and it was drawn that way first, at y 29
 *    to 31 against Deadpan's 33. Rendering it showed why that cannot work: the
 *    beanie's brim runs from (24, 29.5) through a dip to about y 27.6 at the
 *    centre and back to (64, 29.5), and with its 3 unit stroke its lower edge
 *    is at y 30.8 at x 27 and y 29.1 at x 40. A brow whose 3 unit stroke starts
 *    above that does not read as a raised brow, it reads as a thicker hat, and
 *    at 96px half the Warm set came out looking browless. The floor is
 *    therefore y 32.3 at the outer ends and y 30.6 at the inner, which is
 *    Deadpan's own band, so height is spent and cannot be a lever.
 *    What is left is the brow's own drawing: Warm's are weight 3 and 13 units
 *    long against Deadpan's 3.6 and 14 and Blunt's 4.6 and 12. Thinner, shorter,
 *    and more bare forehead around them. The three weights are 1.0, 1.1 and
 *    1.5 device px at 28px, which is the one place a stroke-weight difference
 *    is directly visible rather than inferred.
 * 3. **Mouth shape.** Warm answers a Deadpan flat line with a curve nearly
 *    everywhere: `idle` and `fair` are small closed smiles where Deadpan is a
 *    dash. This is the difference that carries the set at 28px.
 *
 * One rule governs the brow angles. Raising the *inner* ends (smaller y at x 40
 * and x 48) is the sympathetic brow, and it is used hardest on `walk`,
 * `unknown` and `angry`, where Warm is on the user's side against a number. The
 * positive states use the same direction at a third of the travel, 1.2 to 1.6
 * units rather than 2.8: enough to arch, not enough to worry.
 *
 * `bodyLift` is Warm's alone. Deadpan lifts the chest only on `proud`; Warm
 * lifts it on every positive state, 1.5 to 3.5 units, which moves the shoulders
 * and the lanyard together and is visible at 28px as a change in the silhouette
 * below the head rather than a change in the face.
 */
const warmEyes = (o = {}) => eyesOpen({ rx: 8.8, ry: 10.8, iris: 6, ...o });

export const WARM = {
  idle: {
    // A readier mouth than Deadpan's dash: the smallest smile in the set,
    // shallow enough that it is still "waiting" and not "pleased".
    brows: brows([27, 33, 40, 31.6], [48, 31.6, 61, 33], 3),
    eyes: warmEyes(),
    mouth: MOUTH.smile(1.2, false),
  },
  thinking: {
    // Same up-and-right glance as Deadpan, because that is what looking
    // something up looks like; the brows go asymmetric and high instead of
    // asymmetric and level.
    brows: brows([27, 32.6, 40, 31.2], [48, 31.8, 61, 33.4], 3),
    eyes: warmEyes({ dx: 2.4, dy: -2.8 }),
    mouth: MOUTH.dots(6.6),
  },
  asking: {
    // Deadpan tilts 8 degrees. Warm tilts 11 and lifts the outer end of the
    // leading brow: leaning in is the posture, and at 28px a 3 degree tilt
    // delta on the whole head is worth more than any feature edit.
    pose: 'rotate(-11 44 50)',
    brows: brows([27, 33.4, 40, 31], [48, 31.8, 61, 33], 3),
    eyes: warmEyes(),
    mouth: MOUTH.o(3.4),
  },
  good: {
    bodyLift: 1.5,
    brows: brows([27, 32.8, 40, 31.2], [48, 31.2, 61, 32.8], 3),
    eyes: warmEyes(),
    mouth: MOUTH.smile(3, true),
  },
  delighted: {
    // The intense form is more, not louder (AVATAR.md section 5, intense-hold):
    // eyes at their largest in the whole file, the star highlight, a grin two
    // and a half units wider and three deeper than Deadpan's, and the chest up.
    pose: 'translate(0 -1)',
    bodyLift: 3,
    brows: brows([27, 32.4, 40, 30.8], [48, 30.8, 61, 32.4], 3),
    eyes: warmEyes({ ry: 11.4, iris: 6.4, shine: 'star' }),
    mouth: MOUTH.grin(10.5, 15),
  },
  fair: {
    // "You are fine" rather than "that is the number": Deadpan's widest flat
    // line becomes a small closed smile at the same width.
    brows: brows([27, 32.8, 40, 32], [48, 32, 61, 32.8], 3),
    eyes: warmEyes(),
    mouth: MOUTH.smile(1.6, false),
  },
  walk: {
    // The sympathetic brow: inner ends 3.5 units above the outer, which is the
    // only brow shape in the set that reads as concern rather than judgement.
    // Deadpan half-lids here; Warm keeps the eyes wide, because narrowing them
    // at someone standing in front of a bad price looks like appraisal of the
    // person. Hard rule 4: the frown is at the price.
    pose: 'rotate(-5 44 50)',
    brows: brows([27, 33.6, 40, 30.8], [48, 30.8, 61, 33.6], 3),
    eyes: warmEyes({ dy: 0.6 }),
    mouth: MOUTH.frown(12, 3.5),
  },
  angry: {
    // Indignant on the user's behalf, which is not the same face as contempt.
    // The brows come down at the inner ends like Deadpan's, but 1.5 units less
    // steeply and at weight 4 rather than 4.2, and crucially the eyes stay
    // large (ry 8.6, iris 5) instead of narrowing to a slit. A wide eye over a
    // deep frown reads "no, that is not a price"; a slit over a frown reads at
    // the person holding the phone.
    prop: -14,
    brows: brows([25, 30.5, 41, 36.5], [63, 30.5, 47, 36.5], 4),
    eyes: warmEyes({ ry: 8.6, iris: 5.4, shine: null }),
    mouth: MOUTH.frown(11, 4.5),
  },
  unknown: {
    // The most important state in the file (AVATAR.md section 2): a
    // professional declining to guess, and for Warm, one that minds. The lid
    // comes to 0.32 rather than Deadpan's 0.5 and the highlight stays, so the
    // eye is soft rather than shuttered, and the mouth is a 1.6 unit dip -
    // barely down, an apology and not a refusal to help.
    brows: brows([27, 33.2, 40, 30.8], [48, 30.8, 61, 33.2], 3),
    eyes: warmEyes({ lid: 0.32 }),
    mouth: MOUTH.frown(10, 1.6),
  },
  pleased: {
    // Deadpan's pleased is a closed eye and a 1.6 smile with no tooth. Warm
    // takes the same closed arcs - they are the shape of "that landed" and no
    // personality owns them - and doubles the mouth, adds the tooth, and puts
    // the chest up 2.
    bodyLift: 2,
    brows: brows([27, 32.8, 40, 31.6], [48, 31.6, 61, 32.8], 3),
    eyes: eyesClosed(true),
    mouth: MOUTH.smile(3, true),
  },
  nudging: {
    // A watched price moved, and nothing else may ever trigger this. Warm
    // leans 8 degrees where Deadpan leans 6, glances toward the card it is
    // announcing, and smiles about it, because the news is good by definition:
    // the only reportable movement is one the user asked to be told about. No
    // tooth here: on a head rotated 8 degrees the tooth rect does not rotate
    // into the lip convincingly and rendered as a loose white chip on the jaw.
    pose: 'translate(0 1) rotate(8 44 50)',
    brows: brows([27, 33, 40, 32.6], [48, 30.8, 61, 33.4], 3),
    eyes: warmEyes({ dx: -1.6 }),
    mouth: MOUTH.smile(2.4, false),
  },
  asleep: {
    // A soft open mouth instead of Deadpan's pressed line. Same drooping
    // closed eyes and same tipped propeller, because those are what asleep is;
    // the z is identical for all three sets for the same reason.
    // The mouth is at y 63.5 rather than the usual 64.5: the whole head is
    // translated down 3 here, and at 65.5 the drawn mouth landed at 68.5 in
    // disc space, on top of the collar, where it read as a mark on the lanyard
    // rather than as a mouth. Blunt's asleep is raised for the same reason.
    pose: 'translate(0 3) rotate(6 44 50)',
    prop: 22,
    brows: brows([27, 34.5, 40, 33.6], [48, 33.6, 61, 34.5], 3),
    eyes: eyesClosed(false),
    mouth: MOUTH.o(2.4, 63.5),
    extras: `<path d="M64 21 L71 21 L64 28 L71 28" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  },
  proud: {
    // Dark in v1. The largest bodyLift in the set: proud is the one state whose
    // whole content is posture, so it is carried by the chest rather than by
    // the mouth, which stays a closed smile. The head rises 3 against the
    // chest's 3.5, because lifting the chest alone closes the gap under the
    // chin and the smile ends up sitting on the collar.
    pose: 'translate(0 -3)',
    bodyLift: 3.5,
    brows: brows([27, 32.6, 40, 31.4], [48, 31.4, 61, 32.6], 3),
    eyes: eyesClosed(true),
    mouth: MOUTH.smile(3.2, true),
  },
};

/* ------------------------------------------------------------------ blunt */

/**
 * Blunt, from `voice.js`: "Short, and a bit rude."
 *
 * Blunt is built on the same three surviving-at-28px levers as Warm, pushed
 * the other way.
 *
 * 1. **Eye aspect.** 8.6 by 6.2 against Deadpan's 8.5 by 9: wider than tall.
 *    That is a 31% shorter eye, the largest silhouette delta in the file, and
 *    it is the thing that makes a Blunt row face identifiable at 28px before
 *    any detail resolves. The iris drops to 4.4 and the white highlight is off
 *    by default - the shine is what makes the Deadpan and Warm eyes look wet,
 *    and removing it is the cheapest way to look unimpressed without narrowing
 *    the eye so far that it becomes a glare aimed at the reader.
 * 2. **Brow height and weight.** Brows sit at y 34 to 36, one to three units
 *    BELOW Deadpan's 33 and five below Warm's, at weight 4.6 against 3.6.
 *    Heavier and lower is the whole shape: at 28px a 4.6 unit stroke is 1.5px
 *    and a 3.6 is 1.1, so the brow is the one feature whose weight difference
 *    is directly visible. They are also 12 units long against 14, because
 *    Blunt is economical and a shorter brow leaves more bare forehead.
 *    Clearance is checked: brow at 35 with half-weight 2.3 ends at 37.3, the
 *    eye top is 47 - 6.2 = 40.8, so nothing collides.
 * 3. **Mouth shape.** Short. `idle` is a 6 unit dash where Deadpan is 8 and
 *    Warm is a smile; approval is `smirk`, a single tilted line, never a tooth.
 *
 * Hard rule 4 governs this set more than any other. The aggression points at
 * the price, the store, or the brand, never at the user, and a face has no
 * sentence to aim itself with - it is aimed by its geometry. Two things follow,
 * and they are why `angry` here is not the obvious drawing:
 *
 *   - **`angry` is unimpressed, not furious.** The brows are steep and the eyes
 *     narrow, but the mouth is a hard FLAT line rather than a frown or a bared
 *     grimace. A pressed flat mouth reads as a verdict on a number. A snarl
 *     reads as directed at whoever is being looked at, and the only person
 *     being looked at is holding the phone.
 *   - **`delighted` is symmetric.** Every other Blunt positive uses the
 *     one-sided `smirk`, which is the set's signature, but a smirk on a steal
 *     reads as sarcasm about the find. So `delighted` gets both brows raised
 *     level and a centred grin: pleased, in Blunt's economy, is still pleased.
 *
 * `bodyLift` is near zero throughout: Blunt does not get bodily about it. Even
 * `proud` lifts 1.5 against Warm's 3.5.
 */
const bluntEyes = (o = {}) => eyesOpen({ rx: 8.6, ry: 6.2, iris: 4.4, shine: null, ...o });
const BLUNT_L = [27, 35, 39, 35];
const BLUNT_R = [49, 35, 61, 35];

export const BLUNT = {
  idle: {
    brows: brows(BLUNT_L, BLUNT_R, 4.6),
    eyes: bluntEyes(),
    mouth: MOUTH.flat(6),
  },
  thinking: {
    // Tighter dot spacing than either other set, 5 units against 6 and 6.6,
    // and a fatter dot: the same think-dots animation, said in less space.
    brows: brows([27, 34, 39, 35.6], [49, 35.6, 61, 34], 4.6),
    eyes: bluntEyes({ dx: 2.6, dy: -1.4 }),
    mouth: MOUTH.dots(5, 2.4),
  },
  asking: {
    // Deadpan tilts 8 degrees, Warm 11, Blunt 5. Leaning in is interest and
    // Blunt is asking because it needs the input, not because it is curious.
    // One brow up, the other flat, is the whole expression.
    pose: 'rotate(-5 44 50)',
    brows: brows([27, 32.2, 39, 35], BLUNT_R, 4.6),
    eyes: bluntEyes({ ry: 7 }),
    mouth: MOUTH.o(2.2),
  },
  good: {
    // "Take it before they notice." One-sided approval, no tooth, no lift.
    brows: brows([27, 34.6, 39, 33.4], [49, 33.4, 61, 34.6], 4.6),
    eyes: bluntEyes(),
    mouth: MOUTH.smirk(10, 3.4),
  },
  delighted: {
    // Symmetric on purpose - see the note above. The eye opens back up to 8.4
    // and gets its highlight back, which is the only place in the Blunt set
    // where the shine returns, so the state that has to read as genuinely
    // pleased is also the only one that looks it.
    bodyLift: 1,
    brows: brows([27, 31, 39, 30], [49, 30, 61, 31], 4.6),
    eyes: bluntEyes({ ry: 8.4, iris: 4.8, shine: 'dot' }),
    mouth: MOUTH.grin(),
  },
  fair: {
    // "Fine. Whatever." A shrug: the longest flat mouth Blunt draws, over
    // half-lidded eyes. The lid is doing the shrugging, not the mouth.
    brows: brows(BLUNT_L, BLUNT_R, 4.6),
    eyes: bluntEyes({ lid: 0.3 }),
    mouth: MOUTH.flat(11),
  },
  walk: {
    // Narrowed further, brows down at the inner ends, a short shallow frown.
    // Deadpan pulls the mouth aside here and Warm frowns wide and soft; Blunt's
    // is 9 units and 2.2 deep, the most economical negative in the file.
    brows: brows([27, 32.4, 39, 36], [61, 32.4, 49, 36], 4.6),
    eyes: bluntEyes({ ry: 5.6, iris: 4 }),
    mouth: MOUTH.frown(9, 2.2),
  },
  angry: {
    // The rip-off face, and the one hard rule 4 constrains hardest. Brows at
    // weight 5, the heaviest stroke in the file, dropping 7.5 units across
    // their length; eyes down to ry 4.6, the narrowest; propeller drooped 22
    // degrees against Deadpan's 18. The mouth is a flat pressed line at y 66.5,
    // NOT a frown: this face is unimpressed with a number, and a mouth that
    // curves down turns a judgement about a price into a reaction to a person.
    prop: -22,
    brows: brows([25, 30, 41, 37.5], [63, 30, 47, 37.5], 5),
    eyes: bluntEyes({ ry: 4.6, iris: 3.6 }),
    mouth: MOUTH.flat(11, 66.5),
  },
  unknown: {
    // "Not enough. I am not guessing." Level heavy brows, the lid nearly half
    // down, and a 7 unit mouth. Not an apology and not a shrug: a stop.
    brows: brows(BLUNT_L, BLUNT_R, 4.6),
    eyes: bluntEyes({ lid: 0.45 }),
    mouth: MOUTH.flat(7, 64.5),
  },
  pleased: {
    // The one place Blunt departs from both other sets structurally: Deadpan
    // and Warm close the eyes into contented arcs, and Blunt keeps them open
    // and narrow with a smirk. Closing the eyes is a moment of enjoyment; Blunt
    // acknowledges and moves on. It still reads as pleased because the mouth is
    // up and the brows are off their low baseline.
    brows: brows([27, 33.4, 39, 32.6], [49, 32.6, 61, 33.4], 4.6),
    eyes: bluntEyes({ ry: 5.4 }),
    mouth: MOUTH.smirk(9, 3),
  },
  nudging: {
    // One brow hard up, 5.5 units of travel across 12, which is the steepest
    // single-brow move in the file. The head barely leans, 4 degrees against
    // Warm's 8: Blunt points, it does not lean over.
    pose: 'translate(0 1) rotate(4 44 50)',
    brows: brows(BLUNT_L, [49, 34, 61, 29.5], 4.6),
    eyes: bluntEyes({ dx: -1.4 }),
    mouth: MOUTH.flat(7, 64),
  },
  asleep: {
    // The smallest mouth in the file, and raised to y 63.5 to clear the collar
    // once the head's translate(0 3) is applied. Same closed drooping eyes,
    // same tipped propeller and same z as the other two sets, because asleep is
    // a physical fact and not an attitude.
    pose: 'translate(0 3) rotate(4 44 50)',
    prop: 22,
    brows: brows([27, 36.5, 39, 36.5], [49, 36.5, 61, 36.5], 4.6),
    eyes: eyesClosed(false),
    mouth: MOUTH.flat(5, 63.5),
    extras: `<path d="M64 21 L71 21 L64 28 L71 28" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  },
  proud: {
    // Dark in v1. Warm lifts 3.5 and floats the head up 2; Blunt lifts 1.5 and
    // does not move the head at all. Eyes stay open, mouth stays a smirk: the
    // posture changed and the face did not.
    bodyLift: 1.5,
    brows: brows([27, 32.6, 39, 32], [49, 32, 61, 32.6], 4.6),
    eyes: bluntEyes({ ry: 5 }),
    mouth: MOUTH.smirk(10, 3.2),
  },
};

export const FACE_SETS = { deadpan: DEADPAN, warm: WARM, blunt: BLUNT };

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
