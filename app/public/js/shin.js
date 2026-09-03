/**
 * Shin himself: the three faces, and the voice.
 *
 * The face is the output token. Yuka's real asset was the score, not the scan,
 * and this is the equivalent: the thing that survives being screenshotted into
 * someone else's group chat.
 *
 * THE ONE RULE, and it is a hard rule in the repo constitution: the aggression
 * points at the price, the store, or the brand, and never at the user. Groceries
 * are non-discretionary and the person scanning did not set the price.
 */

export const TIERS = {
  good: {
    id: 'good',
    word: 'Good price',
    face: 'good',
    ink: 'var(--tier-good-ink)',
    bg: 'var(--tier-good-bg)',
  },
  fair: {
    id: 'fair',
    word: 'About right',
    face: 'fair',
    ink: 'var(--tier-fair-ink)',
    bg: 'var(--tier-fair-bg)',
  },
  walk_away: {
    id: 'walk_away',
    word: 'Walk away',
    face: 'walk',
    ink: 'var(--tier-walk-ink)',
    bg: 'var(--tier-walk-bg)',
  },
};

export function tierOf(tierId) {
  return TIERS[tierId] ?? TIERS.fair;
}

/**
 * Shin's face, drawn rather than loaded, so there is no asset to go missing and
 * it stays crisp on a share card at any size.
 *
 * Three expressions and no more. A fourth face is a fourth verdict tier, and the
 * whole design rests on there being three.
 */
export function faceSvg(tierId, size = 96) {
  const t = tierOf(tierId);
  const mouth = {
    good: 'M28 58 Q44 72 60 58',
    fair: 'M29 62 L59 62',
    walk: 'M28 68 Q44 54 60 68',
  }[t.face];
  const brow = {
    good: '<path d="M24 30 Q31 26 38 29" /><path d="M50 29 Q57 26 64 30" />',
    fair: '<path d="M24 31 L38 31" /><path d="M50 31 L64 31" />',
    walk: '<path d="M24 26 L38 33" /><path d="M64 26 L50 33" />',
  }[t.face];
  return `
    <!-- The xmlns is load-bearing, not decoration. Inline HTML tolerates its
         absence; a standalone SVG document does not, so without it any screen
         that rasterises this face to a canvas gets a silently broken image. -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="${size}" height="${size}" role="img"
         aria-label="Shin looks ${t.word.toLowerCase()}" class="shin-face shin-face-${t.face}">
      <circle cx="44" cy="44" r="41" fill="${t.bg}" stroke="${t.ink}" stroke-width="2.5"/>
      <g stroke="${t.ink}" stroke-width="3.2" stroke-linecap="round" fill="none">
        ${brow}
        <path d="${mouth}"/>
      </g>
      <circle cx="31" cy="43" r="4.2" fill="${t.ink}"/>
      <circle cx="57" cy="43" r="4.2" fill="${t.ink}"/>
    </svg>`;
}

/** Money, from cents, the same way the engine formats it. */
export function cad(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '--';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Confidence, said out loud rather than hidden behind a number.
 *
 * The walkthrough is explicit that this has to be visible and that it can be
 * charming. What it must never be is silent: an app that is equally sure of
 * everything is an app that is lying about one of them.
 */
export function confidenceLine(confidence) {
  if (!confidence) return '';
  const lead = {
    high: 'Shin is sure about this one.',
    medium: 'Shin is fairly sure.',
    low: 'Shin is going out on a limb here.',
  }[confidence.band] ?? '';
  return `${lead} ${confidence.because}`.trim();
}
