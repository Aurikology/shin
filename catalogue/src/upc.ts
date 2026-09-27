/**
 * UPC-E <-> UPC-A, pure arithmetic over a string, no imports.
 *
 * Moved out of `search.ts` verbatim (2026-09-27) so `app/src/barcode.ts` can
 * use them without loading `search.ts`, which pulls the native sqlite-vec
 * module in at import time. `search.ts` re-exports both under the same names.
 */

/**
 * The eight-digit UPC-E form of a twelve-digit UPC-A, or null when the code
 * has none. Number system 0 or 1 only; the four standard zero-suppression
 * patterns. Exported for the test that pins the Coke Zero can.
 */
export function upcEOf(upca: string): string | null {
  if (!/^[01]\d{11}$/.test(upca)) return null;
  const ns = upca[0];
  const m = upca.slice(1, 6);
  const p = upca.slice(6, 11);
  const check = upca[11];
  let body: string | null = null;
  if (/^\d\d[012]00$/.test(m) && /^00\d{3}$/.test(p)) body = m.slice(0, 2) + p.slice(2) + m[2];
  else if (/^\d{3}00$/.test(m) && /^000\d\d$/.test(p)) body = m.slice(0, 3) + p.slice(3) + '3';
  else if (/^\d{4}0$/.test(m) && /^0000\d$/.test(p)) body = m.slice(0, 4) + p[4] + '4';
  else if (/^0000[5-9]$/.test(p)) body = m + p[4];
  return body ? ns + body + check : null;
}

/** The twelve-digit UPC-A a printed eight-digit UPC-E stands for, or null. */
export function upcAOf(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const [ns, d, check] = [upce[0], upce.slice(1, 7), upce[7]];
  const last = Number(d[5]);
  let body: string;
  if (last <= 2) body = d.slice(0, 2) + d[5] + '0000' + d.slice(2, 5);
  else if (last === 3) body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === 4) body = d.slice(0, 4) + '00000' + d[4];
  else body = d.slice(0, 5) + '0000' + d[5];
  return ns + body + check;
}
