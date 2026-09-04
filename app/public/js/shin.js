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
 * Six expressions, not three. The old file had three because there were three
 * verdict tiers; that was wrong, because refusing is a state Shin is in more
 * often than any of them and it needs a face of its own rather than a shrug.
 */

import { personality } from './voice.js';

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
  },
  warm: {
    eyeR: 4.6, stroke: 3.4,
    good: { brow: 'M23 30 Q31 25 39 29M49 29 Q57 25 65 30', mouth: 'M27 57 Q44 74 61 57' },
    fair: { brow: 'M23 30 Q31 28 39 30M49 30 Q57 28 65 30', mouth: 'M30 61 Q44 66 58 61' },
    walk: { brow: 'M23 28 Q31 24 39 31M65 28 Q57 24 49 31', mouth: 'M29 67 Q44 57 59 67' },
    unknown: { brow: 'M24 30 Q31 27 38 30M50 30 Q57 27 64 30', mouth: 'M30 63 Q37 58 44 63 Q51 68 58 63' },
    thinking: { brow: 'M23 30 Q31 28 39 30M49 30 Q57 28 65 30', mouth: null },
    pleased: { brow: 'M23 29 Q31 23 39 28M49 28 Q57 23 65 29', mouth: 'M26 56 Q44 78 62 56' },
  },
  blunt: {
    eyeR: 4.0, stroke: 4.0,
    good: { brow: 'M23 30 L39 27M49 27 L65 30', mouth: 'M28 58 Q44 70 60 58' },
    fair: { brow: 'M23 29 L39 30M49 30 L65 29', mouth: 'M28 62 L60 62' },
    walk: { brow: 'M22 24 L40 34M66 24 L48 34', mouth: 'M27 69 Q44 55 61 69' },
    unknown: { brow: 'M23 29 L39 29M49 29 L65 29', mouth: 'M30 64 Q37 59 44 64 Q51 69 58 64' },
    thinking: { brow: 'M23 29 L39 30M49 30 L65 29', mouth: null },
    pleased: { brow: 'M22 28 L40 24M48 24 L66 28', mouth: 'M26 57 Q44 74 62 57' },
  },
};

/**
 * Shin's face as an SVG string.
 *
 * The xmlns is load-bearing, not decoration. Inline HTML tolerates its absence;
 * a standalone SVG document does not, so without it any screen that rasterises
 * this face onto a canvas gets a silently broken image and throws nothing. That
 * happened once already and the share card shipped a face with no eyebrows.
 *
 * @param {string} expression  good | fair | walk | unknown | thinking | pleased
 * @param {object} [opts]
 * @param {number} [opts.size]    rendered px, minimum 96 on the verdict surface
 * @param {string} [opts.ink]     stroke colour, defaults to the current tier
 * @param {string} [opts.who]     personality override, defaults to the user's
 */
export function faceSvg(expression, opts = {}) {
  const who = opts.who ?? personality();
  const set = GEOM[who] ?? GEOM.deadpan;
  const g = set[expression] ?? set.fair;
  const size = opts.size ?? 96;
  const ink = opts.ink ?? 'currentColor';
  const isRefusal = expression === 'unknown';

  // Thinking has no mouth path; it has three dots, which reads as waiting
  // rather than as an opinion Shin has not formed yet.
  const mouth = g.mouth
    ? `<path d="${g.mouth}"/>`
    : `<circle cx="33" cy="61" r="2.6" fill="${ink}" stroke="none"/>
       <circle cx="44" cy="61" r="2.6" fill="${ink}" stroke="none"/>
       <circle cx="55" cy="61" r="2.6" fill="${ink}" stroke="none"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="${size}" height="${size}"
       role="img" aria-label="Shin: ${expression}" class="face face-${expression}" focusable="false">
      <circle cx="44" cy="44" r="41" fill="none" stroke="${ink}" stroke-width="${set.stroke}"
              ${isRefusal ? 'stroke-dasharray="9 7"' : ''}/>
      <g stroke="${ink}" stroke-width="${set.stroke}" stroke-linecap="round" fill="none">
        <path d="${g.brow}"/>
        ${mouth}
      </g>
      <circle cx="31" cy="44" r="${set.eyeR}" fill="${ink}"/>
      <circle cx="57" cy="44" r="${set.eyeR}" fill="${ink}"/>
    </svg>`;
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
