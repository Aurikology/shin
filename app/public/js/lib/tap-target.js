/**
 * The touch floor, as a function that throws (UX evidence R-12, R-13, R-14).
 *
 * Every tappable element is 44 px tall at least; the controls a shopper touches on every scan
 * (the scan control, the pad keys, Save) are 48 px, and they live in the lower 60% of the screen,
 * where a thumb holding a phone in a shop can reach. A size that falls short is not clamped up
 * here: clamping would hide the stylesheet that is wrong. It throws, and the message names the
 * control, because "a failure nobody can find is silent" (RULINGS.md, errors never go unnoticed).
 *
 * Nothing calls this on a hot path. It is the contract a layout check, a dev-mode audit and a test
 * can share, so the numbers (44, 48, the lower 60%) are written down once.
 */

export const TAP_FLOOR = 44;
export const SCAN_FLOOR = 48;
/** A per-scan control may not start in the top 40% of the viewport. */
export const REACH_FROM = 0.4;

function need(name, what) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`${what}: the control has no name (a failure nobody can find is silent)`);
  }
}

/**
 * @param {{ name: string, width: number, height: number, perScan?: boolean }} spec  sizes in px
 * @returns {{ name: string, width: number, height: number, perScan?: boolean }} the spec, unchanged
 */
export function assertTapTarget(spec) {
  need(spec?.name, 'assertTapTarget');
  const { name, width, height, perScan = false } = spec;
  const floor = perScan ? SCAN_FLOOR : TAP_FLOOR;
  for (const [axis, v] of [['width', width], ['height', height]]) {
    if (!Number.isFinite(v)) throw new RangeError(`tap target "${name}": ${axis} is ${v}, an unmeasured size is not a pass`);
    if (v < floor) {
      throw new RangeError(`tap target "${name}": ${axis} is ${v} px, the floor is ${floor} px${perScan ? ' (a control used on every scan)' : ''}`);
    }
  }
  return spec;
}

/**
 * A control used on every scan sits in the lower 60% of the screen.
 *
 * @param {{ name: string, top: number, height: number, viewportHeight: number }} spec  px from the top edge
 */
export function assertReach(spec) {
  need(spec?.name, 'assertReach');
  const { name, top, height, viewportHeight } = spec;
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new RangeError(`reach "${name}": viewportHeight is ${viewportHeight}; it is required, there is no default screen`);
  }
  if (!Number.isFinite(top) || !Number.isFinite(height)) {
    throw new RangeError(`reach "${name}": top (${top}) and height (${height}) must be measured numbers`);
  }
  if (top < viewportHeight * REACH_FROM) {
    throw new RangeError(`reach "${name}": starts ${top} px from the top of a ${viewportHeight} px screen; per-scan controls belong below ${Math.round(viewportHeight * REACH_FROM)} px (the lower 60%)`);
  }
  return spec;
}
