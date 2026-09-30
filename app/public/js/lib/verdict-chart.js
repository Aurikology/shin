/**
 * THE VERDICT BELL: pure math and markup for the price verdict's distribution
 * chart. No DOM, no clock, no import, so it runs the same in the phone and
 * under `node --test`.
 *
 * RULINGS.md "V1 verdict screen mechanics" (Jamin, 2026-09-30): "for the price
 * verdict, the app will provide an animated normal distribution chart and where
 * their product price falls on it." Built to docs/verdict-distribution-design-
 * 2026-09-30.md, "The response contract": the server sends a `verdict` object
 * (`kind: 'distribution'`) and this file DRAWS it. It never works out a centre
 * or a spread from anything else; price/src/estimate.ts owns that.
 *
 * THE AXIS IS LOG PRICE, as the design says: the bell is fitted on log price,
 * so on a log axis it is an exact normal curve,
 *
 *     mu = ln(centreCents),   y(x) = exp(-((ln x - mu) / sigmaLog)^2 / 2)
 *
 * and p10 / p90 sit at exp(mu -/+ 1.2816 sigmaLog). The contract carries
 * p10Cents and p90Cents too; they are drawn as sent, and worked out from mu and
 * sigmaLog only when an answer lacks them.
 *
 * THE ZONES are his words (RULINGS.md "The verdict speaks his words against the
 * shopper's own thresholds", 2026-09-30): great, good, reasonable, bad, placed
 * by the percent the shopper's price sits from the centre against
 * `verdict.thresholds` (defaults great 30% under, good 20% under, bad 20%
 * over). The server's `shopper.zone` is shown as sent; `shopperFor` below is
 * only for a price the shopper types AFTER the answer arrived (design case 23,
 * "the dot appears when typed"), and it follows the same rules the design
 * gives the server: `beyond` past p1/p99, `suspect` past 4 sigma when a x100 or
 * /100 reading lands inside p10 to p90.
 */

/** The standard normal's 90th percentile: p10/p90 sit this many sigmas from the centre. */
export const Z90 = 1.2815515655446004;
/** The 99th: past it, a shopper's price is `beyond` and pinned at the edge. */
export const Z99 = 2.3263478740408408;
/** Past this many sigmas a price is far enough out to ask whether it was misread. */
export const SUSPECT_SIGMAS = 4;
/** His 2026-09-17 setup numbers, the defaults until a shopper sets their own. */
export const DEFAULT_THRESHOLDS = Object.freeze({ greatPct: 30, goodPct: 20, badPct: 20, fromShopper: false });
export const ZONES = Object.freeze(['great', 'good', 'reasonable', 'bad']);
export const BASES = Object.freeze(['own_prices', 'other_size', 'leaf_category', 'parent_category', 'brand_markup', 'claude_typical', 'category_prior', 'global_prior']);
export const NOTES = Object.freeze(['size_assumed', 'other_region', 'old_prices', 'identity_conflict', 'claude_estimate', 'few_prices']);
/** The contract caps dots at 12. */
export const MAX_DOTS = 12;
/** The axis spans centre -/+ this many sigmas before it widens for the evidence. */
export const AXIS_SIGMAS = 3;
/** And never past this many: a dot beyond it is pinned at the edge rather than squashing the bell. */
export const AXIS_MAX_SIGMAS = 4.5;
/** The narrowest a bell is DRAWN (the server's own floor is 0.05, design "Spread"). */
export const MIN_DRAW_SIGMA = 0.05;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pos = (v) => isNum(v) && v > 0;
const r1 = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------ the contract */

function cleanThresholds(t) {
  const out = { ...DEFAULT_THRESHOLDS };
  if (t && typeof t === 'object') {
    for (const k of ['greatPct', 'goodPct', 'badPct']) if (isNum(t[k]) && t[k] >= 0) out[k] = t[k];
    out.fromShopper = t.fromShopper === true;
  }
  return out;
}

function cleanShopper(s) {
  if (!s || typeof s !== 'object' || !pos(s.cents)) return null;
  const suspect = s.suspect && typeof s.suspect === 'object' && pos(s.suspect.suggestCents) ? { suggestCents: Math.round(s.suspect.suggestCents) } : null;
  return {
    cents: Math.round(s.cents),
    zone: ZONES.includes(s.zone) ? s.zone : null,
    offByPct: isNum(s.offByPct) ? s.offByPct : null,
    beyond: s.beyond === 'low' || s.beyond === 'high' ? s.beyond : null,
    suspect,
  };
}

function cleanDot(d) {
  if (!d || typeof d !== 'object' || !pos(d.cents)) return null;
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    cents: Math.round(d.cents),
    store: str(d.store),
    city: str(d.city),
    seenOn: str(d.seenOn),
    kind: d.kind === 'sale' ? 'sale' : 'regular',
    quantity: str(d.quantity),
  };
}

/**
 * A `verdict` off the wire, cleaned, or null when it cannot be drawn. A verdict
 * with no centre or a negative spread is not drawn at all, never half drawn;
 * everything optional is defaulted (no dots, no shopper, his thresholds).
 */
export function usableVerdict(v) {
  if (!v || typeof v !== 'object' || v.kind !== 'distribution') return null;
  if (!pos(v.centreCents) || !isNum(v.sigmaLog) || v.sigmaLog < 0) return null;
  const mu = Math.log(v.centreCents);
  const p10 = pos(v.p10Cents) ? v.p10Cents : Math.exp(mu - Z90 * v.sigmaLog);
  const p90 = pos(v.p90Cents) ? v.p90Cents : Math.exp(mu + Z90 * v.sigmaLog);
  if (p10 > p90) return null;
  const dots = (Array.isArray(v.dots) ? v.dots : []).map(cleanDot).filter(Boolean).slice(0, MAX_DOTS);
  const bp = v.biggerPack && typeof v.biggerPack === 'object' && pos(v.biggerPack.perUnitCents) ? v.biggerPack : null;
  return {
    kind: 'distribution',
    currency: typeof v.currency === 'string' && v.currency ? v.currency : null,
    centreCents: v.centreCents,
    sigmaLog: v.sigmaLog,
    p10Cents: p10,
    p90Cents: p90,
    basis: BASES.includes(v.basis) ? v.basis : null,
    spreadFrom: typeof v.spreadFrom === 'string' ? v.spreadFrom : null,
    confidence: v.confidence === 'high' || v.confidence === 'medium' ? v.confidence : 'low',
    n: isNum(v.n) && v.n >= 0 ? Math.round(v.n) : null,
    perUnit: v.perUnit && typeof v.perUnit === 'object' && typeof v.perUnit.label === 'string' ? { label: v.perUnit.label, centreCents: pos(v.perUnit.centreCents) ? v.perUnit.centreCents : null } : null,
    scaledTo: typeof v.scaledTo === 'string' && v.scaledTo ? v.scaledTo : null,
    dots,
    biggerPack: bp ? { quantity: typeof bp.quantity === 'string' ? bp.quantity : null, perUnitCents: bp.perUnitCents, store: typeof bp.store === 'string' ? bp.store : null } : null,
    shopper: cleanShopper(v.shopper),
    thresholds: cleanThresholds(v.thresholds),
    notes: (Array.isArray(v.notes) ? v.notes : []).filter((n) => NOTES.includes(n)),
  };
}

/* ---------------------------------------------------------- the shopper dot */

/** Signed percent from the centre: negative is under. */
export function pctFromCentre(cents, centreCents) {
  return ((cents - centreCents) / centreCents) * 100;
}

/**
 * His four zones against the shopper's thresholds. "Good = 20% or more under
 * the centre, great = 30% or more under, bad = 20% or more over, reasonable
 * between" (design, call 4), so every boundary is inclusive on the named side.
 */
export function zoneFor(cents, centreCents, thresholds = DEFAULT_THRESHOLDS) {
  const t = cleanThresholds(thresholds);
  const pct = pctFromCentre(cents, centreCents);
  if (pct <= -t.greatPct) return 'great';
  if (pct <= -t.goodPct) return 'good';
  if (pct >= t.badPct) return 'bad';
  return 'reasonable';
}

/** Standard scores on log price. */
export function zOf(cents, verdict) {
  const s = verdict.sigmaLog > 0 ? verdict.sigmaLog : MIN_DRAW_SIGMA;
  return (Math.log(cents) - Math.log(verdict.centreCents)) / s;
}

/**
 * The `shopper` block for a price typed after the answer arrived, by the rules
 * the design gives the server. A `shopper` the server sent is always preferred
 * (`shopperOf`), because that is the one the scan row recorded.
 */
export function shopperFor(cents, verdict) {
  if (!pos(cents)) return null;
  const c = Math.round(cents);
  const z = zOf(c, verdict);
  let suspect = null;
  if (Math.abs(z) > SUSPECT_SIGMAS) {
    for (const guess of [Math.round(c / 100), c * 100]) {
      if (guess > 0 && guess >= verdict.p10Cents && guess <= verdict.p90Cents) {
        suspect = { suggestCents: guess };
        break;
      }
    }
  }
  return {
    cents: c,
    zone: zoneFor(c, verdict.centreCents, verdict.thresholds),
    offByPct: Math.round(pctFromCentre(c, verdict.centreCents) * 10) / 10,
    beyond: z > Z99 ? 'high' : z < -Z99 ? 'low' : null,
    suspect,
  };
}

/** The shopper block to draw: the server's, with a zone filled in if it sent none. */
export function shopperOf(verdict) {
  const s = verdict.shopper;
  if (!s) return null;
  return s.zone ? s : { ...s, zone: zoneFor(s.cents, verdict.centreCents, verdict.thresholds) };
}

/**
 * The multiple a pinned price is of the typical price, as a short number:
 * "3", "12", "0.3". One decimal under 10, whole above.
 */
export function multipleOf(cents, centreCents) {
  const m = cents / centreCents;
  if (m >= 10) return String(Math.round(m));
  if (m >= 0.1) return String(Math.round(m * 10) / 10);
  return String(Math.round(m * 100) / 100);
}

/** The zone's tier in the colour system (tokens.css binds `data-tier`). */
export const ZONE_TIER = Object.freeze({ great: 'good', good: 'good', reasonable: 'fair', bad: 'walk_away' });

/* ------------------------------------------------------------- geometry */

/** Bell height at `cents`, peak 1: a normal on log price. */
export function bellHeight(cents, mu, sigma) {
  const z = (Math.log(cents) - mu) / sigma;
  return Math.exp(-0.5 * z * z);
}

/**
 * The log-price interval the axis spans: centre -/+ AXIS_SIGMAS sigmas,
 * widened to take p10/p90, every dot and a shopper price that is not `beyond`,
 * but never past AXIS_MAX_SIGMAS. A point outside that is pinned at the edge.
 */
export function logDomain(verdict) {
  const mu = Math.log(verdict.centreCents);
  const s = Math.max(verdict.sigmaLog, MIN_DRAW_SIGMA);
  const minL = mu - AXIS_MAX_SIGMAS * s;
  const maxL = mu + AXIS_MAX_SIGMAS * s;
  let lo = Math.min(mu - AXIS_SIGMAS * s, Math.log(verdict.p10Cents));
  let hi = Math.max(mu + AXIS_SIGMAS * s, Math.log(verdict.p90Cents));
  const take = (cents) => {
    const l = Math.log(cents);
    if (l < minL || l > maxL) return;
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  };
  for (const d of verdict.dots) take(d.cents);
  const sh = verdict.shopper;
  if (sh && !sh.beyond) take(sh.cents);
  const air = (hi - lo) * 0.04;
  return { lo: lo - air, hi: hi + air, mu, sigma: s };
}

/**
 * Greedy label rows: each label goes in the first row where it does not
 * touch the one before it; one that fits in no row is left off the graph (it
 * is still in the list under the chart, and in its dot's <title>).
 */
export function placeLabels(items, { rows = 2, charW = 5.3, gap = 6, width = 340, edge = 4 } = {}) {
  const ends = Array.from({ length: rows }, () => -Infinity);
  const out = [];
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const w = it.text.length * charW;
    const x = Math.min(width - edge - w / 2, Math.max(edge + w / 2, it.x));
    const row = ends.findIndex((end) => x - w / 2 >= end + gap);
    if (row === -1) continue;
    ends[row] = x + w / 2;
    out.push({ ...it, x: r1(x), row });
  }
  return out;
}

/**
 * Everything the SVG needs, in viewBox units.
 */
export function bellGeometry(verdict, { width = 340, height = 196, top = 34, baseY = 124, side = 10, samples = 72 } = {}) {
  const d = logDomain(verdict);
  const span = d.hi - d.lo;
  const plotW = width - 2 * side;
  const xl = (l) => r1(side + ((l - d.lo) / span) * plotW);
  const x = (cents) => xl(Math.log(cents));
  const pinned = (cents) => {
    const l = Math.log(cents);
    return l < d.lo ? 'low' : l > d.hi ? 'high' : null;
  };
  const xPin = (cents) => {
    const p = pinned(cents);
    return p === 'low' ? side : p === 'high' ? width - side : x(cents);
  };
  const plotH = baseY - top;
  const y = (cents) => r1(baseY - bellHeight(cents, d.mu, d.sigma) * plotH);

  const pts = [];
  for (let i = 0; i <= samples; i += 1) {
    const l = d.lo + (span * i) / samples;
    const c = Math.exp(l);
    pts.push(`${xl(l)} ${y(c)}`);
  }
  const curve = `M${pts.join('L')}`;
  const area = `${curve}L${xl(d.hi)} ${baseY}L${xl(d.lo)} ${baseY}Z`;
  const bandPts = [];
  const bl = Math.log(verdict.p10Cents);
  const bh = Math.log(verdict.p90Cents);
  for (let i = 0; i <= 24; i += 1) {
    const l = bl + ((bh - bl) * i) / 24;
    bandPts.push(`${xl(l)} ${y(Math.exp(l))}`);
  }
  const band = `M${xl(bl)} ${baseY}L${bandPts.join('L')}L${xl(bh)} ${baseY}Z`;

  // The zone strip under the axis: great | good | reasonable | bad, at the shopper's thresholds.
  const t = verdict.thresholds;
  const c = verdict.centreCents;
  const cuts = [
    ['great', 0, c * (1 - t.greatPct / 100)],
    ['good', c * (1 - t.greatPct / 100), c * (1 - t.goodPct / 100)],
    ['reasonable', c * (1 - t.goodPct / 100), c * (1 + t.badPct / 100)],
    ['bad', c * (1 + t.badPct / 100), Infinity],
  ];
  const clampX = (cents) => (cents <= 0 ? side : cents === Infinity ? width - side : Math.min(width - side, Math.max(side, x(cents))));
  const zones = cuts
    .map(([zone, a, b]) => ({ zone, x1: clampX(a), x2: clampX(b) }))
    .filter((z) => z.x2 - z.x1 > 0.05);

  const saleY = baseY + 19;
  const dots = verdict.dots.map((dot) => ({
    ...dot,
    x: xPin(dot.cents),
    y: dot.kind === 'sale' ? saleY : baseY,
    pinned: pinned(dot.cents),
  }));

  const sh = verdict.shopper;
  const shopper = sh
    ? {
        ...sh,
        x: sh.beyond === 'low' ? side : sh.beyond === 'high' ? width - side : xPin(sh.cents),
        pinned: sh.beyond ?? pinned(sh.cents),
        curveY: sh.beyond || pinned(sh.cents) ? baseY : y(sh.cents),
      }
    : null;

  return {
    width,
    height,
    top,
    baseY,
    saleY,
    side,
    domain: d,
    x,
    curve,
    area,
    band,
    zones,
    dots,
    shopper,
    centreX: x(c),
    p10X: x(verdict.p10Cents),
    p90X: x(verdict.p90Cents),
    hasSale: dots.some((dt) => dt.kind === 'sale'),
  };
}

/* ------------------------------------------------------------------ markup */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Three axis labels, pushed apart just enough not to overlap and kept inside. */
export function spreadLabels(xs, { minGap = 54, width = 340, edge = 24 } = {}) {
  const out = [...xs];
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 1; i < out.length; i += 1) {
      if (out[i] - out[i - 1] < minGap) {
        const push = (minGap - (out[i] - out[i - 1])) / 2;
        out[i - 1] -= push;
        out[i] += push;
      }
    }
    out[0] = Math.max(edge, out[0]);
    for (let i = 1; i < out.length; i += 1) out[i] = Math.max(out[i], out[i - 1] + minGap);
    out[out.length - 1] = Math.min(width - edge, out[out.length - 1]);
    for (let i = out.length - 2; i >= 0; i -= 1) out[i] = Math.min(out[i], out[i + 1] - minGap);
  }
  return out.map(r1);
}

/**
 * The bell as inline SVG in a `<figure>`. Every word arrives localised:
 * `format` turns cents into money in the reader's language, `alt` says in words
 * where the price falls, `band` is the caption, `saleWord` labels the sale
 * lane, `multiple` is the pinned-price sentence ("3x the typical price") or ''.
 *
 * Motion is CSS only (camera.css, `.vbell`): each part's resting style is its
 * FINAL state and the keyframes say only where it starts, so with
 * prefers-reduced-motion the bell is simply drawn still. The shopper's dot
 * drops onto its own place; it never slides along the axis through prices it
 * never had (DESIGN.md section 6).
 */
export function bellSvg(verdict, { format = (c) => String(c), alt = '', band = '', saleWord = 'Sale', multiple = '', dotLabel = (d) => d.quantity ?? d.store ?? '', geometry = {}, labels: labelsFrom = null } = {}) {
  const g = bellGeometry(verdict, geometry);
  // The words under the axis are always a real answer's numbers, never an in-between frame's.
  const L = labelsFrom ?? verdict;
  const W = g.width;
  const p = [];
  p.push(`<rect class="vb-track" x="${g.side - 2}" y="${g.baseY + 2}" width="${W - 2 * g.side + 4}" height="8" rx="4"/>`);
  for (const z of g.zones) p.push(`<rect class="vb-zone vb-zone-${z.zone}" x="${z.x1}" y="${g.baseY + 3.5}" width="${r1(z.x2 - z.x1)}" height="5"/>`);
  p.push(`<path class="vb-area" d="${g.area}"/>`);
  p.push(`<path class="vb-band" d="${g.band}"/>`);
  p.push(`<path class="vb-curve" d="${g.curve}" pathLength="1"/>`);
  p.push(`<line class="vb-axis" x1="${g.side}" y1="${g.baseY}" x2="${W - g.side}" y2="${g.baseY}"/>`);
  p.push(`<line class="vb-centre" x1="${g.centreX}" y1="${g.top - 4}" x2="${g.centreX}" y2="${g.baseY}"/>`);
  if (g.hasSale) p.push(`<text class="vb-lane" x="${g.side}" y="${g.saleY + 3.5}" text-anchor="start">${esc(saleWord)}</text>`);
  const lblY = g.baseY + (g.hasSale ? 40 : 28);
  const [lx, cx, hx] = spreadLabels([g.p10X, g.centreX, g.p90X], { width: W });
  p.push(`<text class="vb-lbl" x="${lx}" y="${lblY}" text-anchor="middle" data-vb-p10>${esc(format(Math.round(L.p10Cents)))}</text>`);
  p.push(`<text class="vb-lbl vb-lbl-centre" x="${cx}" y="${lblY}" text-anchor="middle" data-vb-centre>${esc(format(Math.round(L.centreCents)))}</text>`);
  p.push(`<text class="vb-lbl" x="${hx}" y="${lblY}" text-anchor="middle" data-vb-p90>${esc(format(Math.round(L.p90Cents)))}</text>`);

  // Store dots, small; sale dots on their own lane under the axis, hollow.
  g.dots.forEach((d, i) => {
    const title = [d.store, d.city, d.quantity, format(d.cents), d.seenOn, d.kind === 'sale' ? saleWord : null].filter(Boolean).join(', ');
    p.push(`<circle class="vb-dot vb-dot-${d.kind}${d.pinned ? ' vb-pinned' : ''}" cx="${d.x}" cy="${d.y}" r="3.6" data-vb-dot="${i}" style="--i:${i}"><title>${esc(title)}</title></circle>`);
  });
  const labels = placeLabels(
    g.dots.map((d, i) => ({ i, x: d.x, text: dotLabel(d) })).filter((l) => l.text),
    { rows: 2, width: W },
  );
  for (const l of labels) {
    p.push(`<text class="vb-dotlbl" x="${l.x}" y="${lblY + 15 + l.row * 12}" text-anchor="middle" data-vb-dotlbl="${l.i}">${esc(l.text)}</text>`);
  }

  // The shopper's price: the large dot, on the axis, with a guide up to the bell.
  if (g.shopper) {
    const s = g.shopper;
    // A pinned price's words run inward from its edge so the multiple is never cut off.
    const anchor = s.pinned === 'high' ? 'end' : s.pinned === 'low' ? 'start' : 'middle';
    const labelX = s.pinned === 'high' ? W - 2 : s.pinned === 'low' ? 2 : Math.min(W - 30, Math.max(30, s.x));
    const lines = [format(s.cents), multiple].filter(Boolean);
    const labelTop = Math.max(12, Math.min(s.curveY, g.baseY) - 12 - (lines.length - 1) * 13);
    p.push(
      `<g class="vb-you${s.pinned ? ' vb-pinned' : ''}" data-vb-you="${s.cents}"${s.pinned ? ` data-vb-pin="${s.pinned}"` : ''}>` +
        `<line class="vb-guide" x1="${s.x}" y1="${s.curveY}" x2="${s.x}" y2="${g.baseY}"/>` +
        `<circle class="vb-youdot" cx="${s.x}" cy="${g.baseY}" r="8"/>` +
        lines.map((txt, k) => `<text class="vb-youlbl${k ? ' vb-mult' : ''}" x="${labelX}" y="${labelTop + k * 13}" text-anchor="${anchor}">${esc(txt)}</text>`).join('') +
        `</g>`,
    );
  }
  const h = lblY + (labels.some((l) => l.row === 1) ? 30 : labels.length ? 18 : 6);
  return `<figure class="vbell" data-verdict-bell data-mu="${r1(g.domain.mu * 1000) / 1000}" data-sigma="${verdict.sigmaLog}">
    <svg viewBox="0 0 ${W} ${Math.round(h)}" width="100%" role="img" aria-label="${esc(alt)}" focusable="false">${p.join('')}</svg>
    ${band ? `<figcaption class="vb-cap">${esc(band)}</figcaption>` : ''}
  </figure>`;
}

/**
 * One frame between two verdicts, for a better answer arriving later (design
 * case 28, "a better one animates the bell into place"). Centre and spread are
 * eased on log price, the band with them; the dots and the shopper are the new
 * answer's from the first frame, so no price is ever drawn that neither answer
 * holds.
 */
export function tweenVerdict(from, to, k) {
  const e = k <= 0 ? 0 : k >= 1 ? 1 : 1 - (1 - k) ** 3;
  const lerp = (a, b) => a + (b - a) * e;
  const mu = lerp(Math.log(from.centreCents), Math.log(to.centreCents));
  return {
    ...to,
    centreCents: Math.exp(mu),
    sigmaLog: lerp(from.sigmaLog, to.sigmaLog),
    p10Cents: Math.exp(lerp(Math.log(from.p10Cents), Math.log(to.p10Cents))),
    p90Cents: Math.exp(lerp(Math.log(from.p90Cents), Math.log(to.p90Cents))),
  };
}
