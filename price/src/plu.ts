/**
 * Loose-produce PLU codes (the 4 or 5 digit number on the sticker of a banana or an orange), so a
 * shopper who scans or types one gets the product named and a per-lb price instead of "unknown".
 *
 * SOURCE. plu-codes.json is the IFPS PLU list as published by ankane/plu (MIT licence,
 * https://github.com/ankane/plu), read 2026-11-14: 1520 four-digit codes (3000 to 4961) and their
 * names. The same list covers the 5-digit forms: a 9 in front of a 4-digit code means grown
 * organically (94011 = organic bananas), an 8 in front means genetically engineered (a code that is
 * on the list but almost never printed). The file is authored data, so it lives in src, not in the
 * gitignored price/data folder.
 *
 * ONE KEY. A PLU has no barcode, so every part of Pexi keys it the same way: the 4 or 5 digit code
 * left-padded with zeros to 11 digits, then its GS1 mod-10 check digit, 12 digits in all (a UPC-A
 * shape). 3110 is `000000031103`, organic bananas 94011 is `000000940115` (both are computed, not
 * typed: `pluKey`). An observation of a loose price is stored under that key, and a scan, a typed
 * code or a zero-padded GTIN of the same number all resolve to it (`pluFromDigits`).
 *
 * PRECISION. Only a code that is on the list counts. A real short EAN-8 or UPC-E code that happens
 * to strip down to 4 digits is not on the list unless it IS a listed code, so real packaged-goods
 * codes are never stolen; the rule is "the digits left after the check digit and the leading
 * zeros are a listed PLU, and the reading is a bare 4 or 5 digit code or a GTIN whose check digit
 * passes".
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface PluRef {
  /** The code as printed on the sticker: '3110', or '94011' for the organic form. */
  readonly code: string;
  /** The 4-digit base code on the list ('4011' for 94011). */
  readonly base: string;
  /** 'conventional' (4 digits), 'organic' (9 + 4), 'engineered' (8 + 4). */
  readonly variant: 'conventional' | 'organic' | 'engineered';
  readonly organic: boolean;
  /** The list's name for the base code, as written there ("Navel, Cara Cara (Red) Oranges"). */
  readonly listName: string;
  /** The name a shopper reads: the list's name, with "Organic " in front for the organic code. */
  readonly name: string;
  /** The one key (12 digits, see the file header). */
  readonly key: string;
}

let list: Readonly<Record<string, string>> | null = null;

/** The PLU list: base 4-digit code to name. Loaded once. */
export function pluList(): Readonly<Record<string, string>> {
  if (list === null) {
    list = JSON.parse(readFileSync(fileURLToPath(new URL('./plu-codes.json', import.meta.url)), 'utf8')) as Record<string, string>;
  }
  return list;
}

/** The GS1 mod-10 check digit that completes an all-digit body. */
export function gs1CheckDigit(body: string): string {
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) sum += Number(body[i]) * weight;
  return String((10 - (sum % 10)) % 10);
}

/** The 12-digit key for a PLU code ('3110' or '94011'). */
export function pluKey(code: string): string {
  const body = code.padStart(11, '0');
  return body + gs1CheckDigit(body);
}

function refOf(code: string): PluRef | null {
  const l = pluList();
  let base: string;
  let variant: PluRef['variant'];
  if (/^[3-4]\d{3}$/.test(code)) {
    base = code;
    variant = 'conventional';
  } else if (/^9[3-4]\d{3}$/.test(code)) {
    base = code.slice(1);
    variant = 'organic';
  } else if (/^8[3-4]\d{3}$/.test(code)) {
    base = code.slice(1);
    variant = 'engineered';
  } else return null;
  const listName = l[base];
  if (!listName) return null;
  return {
    code,
    base,
    variant,
    organic: variant === 'organic',
    listName,
    name: variant === 'organic' ? `Organic ${listName}` : listName,
    key: pluKey(code),
  };
}

/** The PLU for a printed code ('3110', '94011'), or null when it is not on the list. */
export function pluByCode(code: string): PluRef | null {
  return refOf(code.trim());
}

/**
 * The PLU a reading stands for, or null. A reading counts only as:
 *  - a bare 4-digit code or a bare 5-digit code starting 8 or 9 (nothing in front), or
 *  - a GTIN of 8, 12, 13 or 14 digits whose check digit passes and whose body, once the leading zeros
 *    are taken off, is such a code ("00000000031106", "000000031106").
 * and only when that code is on the list.
 */
export function pluFromDigits(raw: string): PluRef | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 4 || (digits.length === 5 && (digits[0] === '9' || digits[0] === '8'))) return refOf(digits);
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  const body = digits.slice(0, -1);
  if (gs1CheckDigit(body) !== digits[digits.length - 1]) return null;
  return refOf(body.replace(/^0+/, ''));
}

/** The PLU a 12-digit key (or its 13-digit zero-padded twin) stands for, or null. */
export function pluFromKey(key: string): PluRef | null {
  const d = key.replace(/\D/g, '');
  if (d.length !== 12 && !(d.length === 13 && d.startsWith('0'))) return null;
  const twelve = d.length === 13 ? d.slice(1) : d;
  const ref = refOf(twelve.slice(0, 11).replace(/^0+/, ''));
  return ref && ref.key === twelve ? ref : null;
}
