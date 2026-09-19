/**
 * The one place the client turns cents into a price a person reads.
 *
 * Global (beta-gaps rule 8, audit row 34): nothing here is Canadian. The
 * currency is the one the thing being shown carries, else the one the user's
 * chosen market holds (`store.market().currency`). Nothing is ever converted:
 * the digits are the stored cents divided by a hundred and only the mark and
 * the punctuation around them change. With no currency known the plain number
 * is shown with no symbol, because a wrong symbol on a right number is worse
 * than none.
 *
 * Order follows the reader's language. For the dollar currencies the app has
 * always written (CAD and USD) that is `$4.99` in English and `4,99 $` in
 * French, the mark after the amount behind a no-break space so a line never
 * wraps between them. Every other currency goes through Intl in the reader's
 * language (`€4.99` and `4,99 €`, `£4.99`, `JPY 10`).
 *
 * `--` for anything that is not a finite number: a formatter is never the
 * thing that throws.
 */
import { market } from '../store.js';
import { localeTag } from './locale.js';

const BARE_DOLLAR = new Set(['CAD', 'USD']);

/** A currency argument to an upper-case code, or '' when it is not three letters. */
function codeOf(currency) {
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

/** The stored market's currency, or '' when none is chosen or storage is unreadable. */
function marketCurrency() {
  try {
    return market().currency || '';
  } catch {
    return '';
  }
}

/**
 * The mark alone (`$`, `€`, `CHF`), for a screen that paints it apart from
 * the digits, such as the price pad while a number is being typed. Same rules
 * as `money`: the dollar for CAD and USD, Intl's own mark for the rest, and ''
 * when no currency is known, so the pad shows just the digits.
 *
 * @param {string | null} [currency] left out or null, the user's market decides.
 * @param {string} [tag] a BCP 47 tag; defaults to the app's current language.
 */
export function currencyMark(currency, tag) {
  const code = codeOf(currency == null ? marketCurrency() : currency);
  if (code === '') return '';
  if (BARE_DOLLAR.has(code)) return '$';
  let lang = tag;
  if (!lang) {
    try {
      lang = localeTag();
    } catch {
      lang = 'en-CA';
    }
  }
  try {
    const parts = new Intl.NumberFormat(lang, { style: 'currency', currency: code }).formatToParts(1);
    return parts.find((p) => p.type === 'currency')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * @param {number} cents
 * @param {string | null} [currency] the currency the answer or offer carries.
 *   Left out (or null) the user's market decides; an empty string means
 *   "unknown" and shows the plain number.
 * @param {string} [tag] a BCP 47 tag; defaults to the app's current language.
 */
export function money(cents, currency, tag) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '--';
  let lang = tag;
  if (!lang) {
    try {
      lang = localeTag();
    } catch {
      lang = 'en-CA';
    }
  }
  const code = codeOf(currency == null ? marketCurrency() : currency);
  const sign = cents < 0 ? '-' : '';
  const amount = Math.abs(Math.round(cents)) / 100;

  if (code !== '' && !BARE_DOLLAR.has(code)) {
    try {
      return new Intl.NumberFormat(lang, { style: 'currency', currency: code }).format(cents < 0 ? -amount : amount);
    } catch {
      /* Intl does not know the code: fall through to the plain number */
    }
  }

  const digits = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  if (!BARE_DOLLAR.has(code)) return `${sign}${digits}`;
  return String(lang).toLowerCase().startsWith('fr') ? `${sign}${digits} $` : `${sign}$${digits}`;
}
