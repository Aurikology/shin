/**
 * The amount a shopper sets on an answer for produce sold by weight (comms
 * 2026-11-14, "Amount for things sold by weight"): "$1.58 per lb" stays the
 * verdict, and beside it the shopper sets how much they will buy (lb, with a kg
 * switch) and reads the total for that amount.
 *
 * Pure: no DOM, no store. The sheet (camera.js `distributionSheet`) draws it and
 * its click handler calls these to move the amount.
 */

/** Pounds in one kilogram. */
export const LB_PER_KG = 2.20462262;
/** One tap of "more" or "less", in the unit on screen. */
export const AMOUNT_STEP = 0.25;
export const AMOUNT_MIN = 0.25;
export const AMOUNT_MAX = 25;
export const AMOUNT_UNITS = ['lb', 'kg'];
export const AMOUNT_DEFAULT = { qty: 1, unit: 'lb' };

/** True when the answer's own unit says the shelf price is a weight price. */
export function soldByWeight(unit) {
  return unit === 'lb';
}

const round2 = (n) => Math.round(n * 100) / 100;

/** A clean amount: a unit we know, a quantity inside the limits and at two decimals at most. */
export function cleanAmount(a) {
  const unit = a && AMOUNT_UNITS.includes(a.unit) ? a.unit : AMOUNT_DEFAULT.unit;
  const raw = Number(a?.qty);
  const qty = Number.isFinite(raw) && raw > 0 ? Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, round2(raw))) : AMOUNT_DEFAULT.qty;
  return { qty, unit };
}

/** The amount in pounds, whichever unit the shopper set it in. */
export function amountInLb(a) {
  const c = cleanAmount(a);
  return c.unit === 'kg' ? c.qty * LB_PER_KG : c.qty;
}

/**
 * What the amount costs at a price per pound, in whole cents. Null when there is
 * no price to scale. The price per pound is never changed by the unit shown.
 */
export function totalCents(perLbCents, a) {
  if (!(typeof perLbCents === 'number' && Number.isFinite(perLbCents) && perLbCents > 0)) return null;
  return Math.round(perLbCents * amountInLb(a));
}

/** One tap of more (+1) or less (-1). Stops at the limits instead of wrapping. */
export function stepAmount(a, dir) {
  const c = cleanAmount(a);
  const next = round2(c.qty + (dir < 0 ? -AMOUNT_STEP : AMOUNT_STEP));
  return { qty: Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, next)), unit: c.unit };
}

/** The same weight in the other unit ("1 lb" becomes "0.45 kg"), so the total does not move on a switch. */
export function switchUnit(a, unit) {
  const c = cleanAmount(a);
  if (!AMOUNT_UNITS.includes(unit) || unit === c.unit) return c;
  const qty = unit === 'kg' ? c.qty / LB_PER_KG : c.qty * LB_PER_KG;
  return { qty: Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, round2(qty))), unit };
}
