/**
 * Price history for the Gemini answer sheet (W33), built ONLY from this
 * person's own past scans of the same product. Nothing here is fetched, nothing
 * is estimated, and nothing is drawn unless there are at least two earlier
 * prices the person typed themselves: with fewer there is no chart at all, not
 * an empty one.
 *
 * Pure: takes the store's `history` array and returns numbers or markup. It
 * never touches the network, the DOM or the store.
 *
 * A past scan counts when
 *   - it carried a shelf price the person typed (`query.askingCents`, a whole
 *     positive number of cents; a skipped price is not a price of zero), and
 *   - it is the same product: the same barcode digits, or the same name once
 *     accents, case, punctuation and spacing are taken out.
 * Prices are never converted between currencies; the chart shows the numbers
 * the person typed, formatted by the caller with lib/money.js.
 */

/** A name reduced to what is left when accents, case, punctuation and spacing are ignored. */
export function normaliseName(text) {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The names a history entry is known by: what was scanned or typed, and what the answer called it. */
function namesOf(entry) {
  const out = [];
  const q = entry?.query?.text;
  if (typeof q === 'string') out.push(normaliseName(q));
  const named = entry?.result?.grounded?.block?.name;
  if (typeof named === 'string') out.push(normaliseName(named));
  return out.filter(Boolean);
}

/**
 * The earlier prices of the same product, oldest first: `[{ at, cents }]`.
 * `who` is `{ gtin, names }` for the scan on screen. History is stored newest
 * first; the order out is the order on the chart.
 */
export function priorPrices(history, who = {}) {
  if (!Array.isArray(history)) return [];
  const gtin = typeof who.gtin === 'string' && who.gtin.trim() !== '' ? who.gtin.trim() : '';
  const names = (Array.isArray(who.names) ? who.names : []).map(normaliseName).filter(Boolean);
  const points = [];
  for (const entry of history) {
    const cents = entry?.query?.askingCents;
    if (typeof cents !== 'number' || !Number.isInteger(cents) || cents <= 0) continue;
    const at = typeof entry.at === 'string' ? Date.parse(entry.at) : NaN;
    if (!Number.isFinite(at)) continue;
    const theirGtin = typeof entry.query?.gtin === 'string' ? entry.query.gtin.trim() : '';
    const sameCode = gtin !== '' && theirGtin !== '' && gtin === theirGtin;
    const sameName = namesOf(entry).some((n) => names.includes(n));
    if (sameCode || sameName) points.push({ at, cents });
  }
  return points.sort((a, b) => a.at - b.at);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The chart, as markup, or an empty string when there are fewer than two prior
 * prices. A plain line with a dot per scan and the lowest and highest price
 * written at the ends of the scale. `format` turns cents into the market's own
 * money string; `heading` and `alt` are the already-translated words.
 */
export function historyChartHtml(points, { format, heading, alt } = {}) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const fmt = typeof format === 'function' ? format : (c) => String(c / 100);
  const lo = Math.min(...points.map((p) => p.cents));
  const hi = Math.max(...points.map((p) => p.cents));
  const W = 200;
  const H = 48;
  const PAD = 6;
  const x = (i) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (c) => (hi === lo ? H / 2 : H - PAD - ((c - lo) * (H - 2 * PAD)) / (hi - lo));
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(' ');
  const dots = points
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.cents).toFixed(1)}" r="2.5" data-hist-point="${p.cents}"/>`)
    .join('');
  return `<section class="pricehist" data-price-history aria-label="${esc(alt ?? '')}">
          <h3 class="pricehist-heading">${esc(heading ?? '')}</h3>
          <svg class="pricehist-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(alt ?? '')}">
            <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
            ${dots}
          </svg>
          <p class="pricehist-range"><span data-hist-lo>${esc(fmt(lo))}</span><span data-hist-hi>${esc(fmt(hi))}</span></p>
        </section>`;
}
