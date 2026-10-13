/**
 * The answer a scan gave, kept in the shape the lists can draw.
 *
 * D07 (2026-10-06 walkthrough): Past scans stayed at 0 and a Saved item said
 * "No verdict on file", because the catalogue-first answer (the verdict bell,
 * `kind: 'distribution'`) was never written anywhere and the lists only knew the
 * older `verdict` and `gemini` shapes. This module is the one place that turns
 * a bell into a small, self-contained snapshot, and the one place every list
 * and the share card read it back from, so a row can never say a different word
 * than the sheet did (the OLMA row 70 rule, kept).
 *
 * The snapshot holds what the sheet SHOWED: the zone word as it stood against
 * the shopper's own thresholds when the answer landed, the confidence, the
 * centre and the shopper's price. Nothing is recomputed on read.
 *
 * `distFace` and `distWhere` live here (moved out of camera.js) because the
 * Saved list must wear the same face the sheet wore: the face follows the zone
 * word, never the price delta (D20; docs/verdict-distribution-design-2026-09-30.md).
 */

import { t } from '../ui-strings.js';
import { usableVerdict, shopperFor, shopperOf, ZONE_TIER, asShown } from './verdict-chart.js';
import { money } from './money.js';

/** His zone, in the face the tier wears. Great is the intense face only when Pexi is not unsure (AVATAR.md's gate). */
export function distFace(zone, confidence) {
  /* R-72: a confidence this does not know must never fall through to the delighted face, so it
     throws. At low confidence the face is plain for every zone that would smile (the words carry
     the doubt, AVATAR.md section 5); a bad price keeps its walk-away face at any confidence. */
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
    throw new Error(`distFace: unknown confidence ${JSON.stringify(confidence)}; expected high, medium or low`);
  }
  if (zone === 'great') return confidence === 'low' ? 'fair' : 'delighted';
  if (zone === 'good') return confidence === 'low' ? 'fair' : 'good';
  if (zone === 'reasonable') return 'fair';
  if (zone === 'bad') return 'walk';
  return 'idle';
}

/** The contract's confidence, in the fill treatment DESIGN.md section 1 already has. */
export const DIST_CONF = { high: 'certain', medium: 'sure', low: 'thin' };

/** "25% under the typical price", from the shopper block. The sign comes from the prices, the size from `offByPct` when sent. */
export function distWhere(shopper, verdict) {
  const signed = (shopper.cents - verdict.centreCents) / verdict.centreCents * 100;
  const size = Math.round(Math.abs(isFinite(shopper.offByPct) && shopper.offByPct !== null ? shopper.offByPct : signed));
  if (size < 1) return t('vd_where_about');
  return t(signed < 0 ? 'vd_where_under' : 'vd_where_over', { pct: String(size) });
}

/**
 * A bell off the wire, as the snapshot a history row or a saved row keeps, or
 * null when the bell cannot be drawn. `typedCents` is a price typed on the
 * sheet, newer than the server's reading of the tag.
 */
export function answerSnapshot(raw, { key = null, name = '', typedCents = null } = {}) {
  const drawn = usableVerdict(raw);
  if (!drawn) return null;
  // R-42: the copy keeps the rounded estimate the sheet showed, so the word and percent on a saved row match it.
  const base = asShown(drawn);
  const shopper = typedCents ? shopperFor(typedCents, base) : base.shopper ? shopperOf(base) : null;
  const id = key ?? (name ? `name:${name}` : null);
  return {
    kind: 'distribution',
    id,
    label: name,
    zone: shopper?.zone ?? null,
    confidence: base.confidence,
    centreCents: Math.round(base.centreCents),
    p10Cents: Math.round(base.p10Cents),
    p90Cents: Math.round(base.p90Cents),
    currency: base.currency,
    askingCents: shopper?.cents ?? null,
    offByPct: shopper?.offByPct ?? null,
    basis: base.basis,
  };
}

/** True for a stored snapshot this module wrote. */
export function isAnswer(x) {
  return !!x && x.kind === 'distribution' && typeof x.centreCents === 'number';
}

/**
 * The snapshot a history row carries: the row's own result when the answer was
 * the bell, or the `answer` written beside a Gemini row that ended in a bell.
 */
export function answerOf(entry) {
  if (!entry) return null;
  if (isAnswer(entry.result)) return entry.result;
  if (isAnswer(entry.answer)) return entry.answer;
  return null;
}

/** The face, tier id and confidence level a list row wears for a snapshot. */
export function answerLook(a) {
  return {
    face: distFace(a.zone, a.confidence),
    tier: a.zone ? ZONE_TIER[a.zone] : 'unknown',
    level: DIST_CONF[a.confidence] ?? 'thin',
  };
}

/** The headline word: the zone word, or "Answered" when the answer had no shopper price to judge. */
export function answerWord(a) {
  return a.zone ? t(`vd_zone_${a.zone}`) : t('cam_gem_answered_word');
}

/*
 * No doubt sentence and no "prices vary a lot" sentence is kept for the Saved
 * and Past scans copies (2026-10-10 audit rows 3 and 29): the sheet no longer
 * says either, so a reopened answer is its word, its percentage line, the item
 * and the date, never more doubt than the sheet showed and never less.
 */

/** The one sentence under the word, as the sheet said it. */
export function answerLine(a) {
  const centre = money(a.centreCents, a.currency);
  if (a.zone && typeof a.askingCents === 'number') {
    return t('vd_off', { where: distWhere({ cents: a.askingCents, offByPct: a.offByPct }, a), centre });
  }
  return t('vd_typical', { centre });
}
