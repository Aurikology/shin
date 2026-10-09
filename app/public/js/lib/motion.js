/**
 * The motion registry (UX evidence R-86, R-87).
 *
 * Every named animation in the app is one of three kinds and is registered here with the numbers it
 * runs at, so a curve that is wrong is a thrown error with a name on it and not a stylesheet nobody
 * reads:
 *
 *   enter, exit  ease-out only (fast start, slow finish), a duration a person can sit through.
 *                The sheet rises in 260 ms and goes in 200 ms.
 *   press        a colour tint of 120 ms or less. A press never moves the control: no transform, no
 *                scale, no translate.
 *
 * The CSS is the thing that plays; the table of what it plays is MOTION below, and
 * test/ux/ux-b7-motion.test.mjs reads both and holds them to each other.
 */

const KINDS = ['enter', 'exit', 'press'];
/** The longest an entrance or exit may run. Anything longer is a mistake, not a setting. */
export const MAX_MS = 1200;
export const PRESS_MAX_MS = 120;
const MOVES = /^(transform|scale|translate|rotate|top|left|right|bottom|margin)/i;

/** Ease-out: the named curve, or a cubic-bezier whose first control point rises faster than it runs (y1 above x1). */
export function isEaseOut(curve) {
  const c = String(curve ?? '').replace(/\s+/g, '');
  if (c === 'ease-out') return true;
  const m = /^cubic-bezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)$/.exec(c);
  return m ? Number.parseFloat(m[2]) > Number.parseFloat(m[1]) : false;
}

const registry = new Map();

/**
 * @param {{ name: string, kind: 'enter'|'exit'|'press', durationMs: number, curve: string, property?: string }} spec
 * @returns the spec, unchanged
 */
export function registerAnimation(spec) {
  const { name, kind, durationMs, curve, property } = spec ?? {};
  if (typeof name !== 'string' || name.trim() === '') throw new TypeError('registerAnimation: an animation needs a name');
  if (!KINDS.includes(kind)) throw new TypeError(`registerAnimation "${name}": kind "${kind}" is not one of ${KINDS.join(', ')}`);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_MS) {
    throw new RangeError(`registerAnimation "${name}": duration ${durationMs} is not a number between 1 and ${MAX_MS} ms`);
  }
  if (typeof curve !== 'string' || curve.trim() === '') {
    throw new TypeError(`registerAnimation "${name}": no curve; the browser default is not ease-out`);
  }
  if (kind === 'press') {
    if (property !== undefined && MOVES.test(property)) {
      throw new RangeError(`registerAnimation "${name}": a press must not move the control (property ${property}); tint it instead`);
    }
    if (durationMs > PRESS_MAX_MS) {
      throw new RangeError(`registerAnimation "${name}": a press tint is ${PRESS_MAX_MS} ms at most, not ${durationMs}`);
    }
  } else if (!isEaseOut(curve)) {
    throw new RangeError(`registerAnimation "${name}": ${kind} uses curve ${curve}; enters and exits are ease-out`);
  }
  registry.set(name, spec);
  return spec;
}

/** What the stylesheets play, registered at load so a wrong number fails here and not on a phone. */
export const MOTION = [
  { name: 'sheet-rise', kind: 'enter', durationMs: 260, curve: 'cubic-bezier(.2, .8, .2, 1)' },
  { name: 'sheet-dismiss', kind: 'exit', durationMs: 200, curve: 'cubic-bezier(.2, .8, .2, 1)' },
  { name: 'sheet-position', kind: 'enter', durationMs: 300, curve: 'cubic-bezier(.2, .8, .2, 1)', property: 'max-height' },
  { name: 'press-tint', kind: 'press', durationMs: 120, curve: 'linear', property: 'background-color' },
].map(registerAnimation);

export const registered = () => [...registry.values()];
