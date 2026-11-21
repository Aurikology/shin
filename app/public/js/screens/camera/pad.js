/**
 * The price pad's markup and how it reads its buffer, moved out of screens/camera.js on
 * 2026-11-21 (Aurik: split the camera screen file). Pure string builders and parsers: no screen
 * state, no DOM. camera.js imports and re-exports them, so every existing import keeps working.
 */
import { t } from '../../ui-strings.js';
import { escapeHtml } from '../../lib/dom.js';
import { locale } from '../../lib/locale.js';
import { money, currencyMark } from '../../lib/money.js';
import { FLAGS } from '../../flags.js';
import { centsOfDigits, centsParts } from '../../lib/pad-cents.js';

/**
 * The typed-price display, shared shape with `correct.js`'s own pad: a ghosted
 * ".00" until it is actually typed, never a placeholder that could be misread
 * as a real number.
 */
function pricePadDisplay(typed) {
  const sep = padSeparator();
  if (!typed) return `<span class="ghosted">0${sep}00</span>`;
  const [whole, frac] = typed.split('.');
  return frac === undefined
    ? `${whole || '0'}<span class="ghosted">${sep}00</span>`
    : `${whole || '0'}${sep}${frac}${frac.length === 1 ? '<span class="ghosted">0</span>' : ''}`;
}

/**
 * The amount line of the cents-first pad (R-26): the buffer is cents, so what is
 * typed is always a whole price ("$0.04", "$4.99"). Ghosted only while nothing has
 * been typed. See lib/pad-cents.js.
 */
function centsPadDisplay(typed) {
  const sep = padSeparator();
  const parts = centsParts(typed ?? '');
  if (!parts) return `<span class="ghosted">0${sep}00</span>`;
  return `${parts.whole}${sep}${parts.frac}`;
}

/**
 * The decimal separator the reader sees. The pad buffer itself always holds
 * "." (parsePadPrice and the key handler never change), because the buffer is
 * a number and the separator is a way of writing one; a French reader typing
 * a price sees the comma every French price on this screen already uses, and
 * the French refusal for an unreadable price can honestly say "virgule".
 */
function padSeparator() {
  return locale() === 'fr' ? ',' : '.';
}

/**
 * The amount line above the keypad, currency mark and digits in the reader's
 * order: "$4.99" in English, "4,99 $" in French, the same order `money()` prints
 * everywhere else. The mark is the user's market currency's own (`currencyMark`);
 * with no market chosen there is no mark and the pad shows the digits alone.
 * Both pad hosts paint it from here so they cannot disagree.
 */
function padAmountHtml(typed, centsFirst = false) {
  const digits = centsFirst ? centsPadDisplay(typed) : pricePadDisplay(typed);
  const mark = escapeHtml(currencyMark());
  if (mark === '') return digits;
  return locale() === 'fr'
    ? `${digits}<span class="amount-cur amount-cur-after">${mark}</span>`
    : `<span class="amount-cur">${mark}</span>${digits}`;
}

/**
 * The keypad, once, for both pads.
 *
 * `camera.css .padsheet .keypad` and `correct.css .keypad` were two
 * implementations of one component, and `pricePadDisplay` above was duplicated
 * verbatim as `display()` inside correct.js. This is the markup half of that
 * duplication removed: the keys come from here and carry Foundation's
 * `.btn .btn--key` (components.css), so the fill, the radius, the display face,
 * the tabular figures and the one focus ring are stated once, and each pad only
 * says what is genuinely its own -- row height, and whether there is a confirm
 * key in the bottom row at all.
 *
 * Deliberately NOT carrying the bare `.key` class any more. `correct.css`
 * declares `.key` and `.keypad` unscoped, so those rules were reaching into the
 * camera's sheet pad -- `.key { background: var(--surface) }` against
 * camera.css's own `--raised`, at equal specificity, settled by nothing but
 * which file screens.css imports last. The camera's keys are addressed as
 * `.padsheet .btn--key` now and the two pads cannot paint each other by
 * accident.
 *
 * The digits are one 3x3 grid and the bottom row is its own, because the confirm
 * key has to read as the keypad's own key (USAGE.md A1 0:13.4) rather than a
 * button underneath it. A pad with no confirm (the correction screen's, whose
 * commit is its page CTA) gets a three-column bottom row instead of four, so it
 * stays the same 3-wide field of keys all the way down.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.confirm=false]           render the confirm key.
 * @param {boolean} [opts.canConfirm=false]        whether that key is enabled.
 * @param {string}  [opts.confirmLabel] its accessible name. Defaults to the
 *   translated "Price it"; read at call time, never at module load, because
 *   the language can change under a running page (the You screen's row).
 * @returns {string} markup: `.keypad` (1-9) followed by `.keypad-bottom`
 *   (`.`, `0`, backspace, and the confirm key when asked for). Every key carries
 *   `data-pad="<char>"`, the char being one of `1`-`9`, `.`, `0`, `⌫`; the
 *   confirm key carries `data-act="pad-confirm"` and `.key-confirm`.
 */
function keypadHtml({ confirm = false, canConfirm = false, confirmLabel = t('cam_price_it'), centsFirst = false } = {}) {
  // `label` is what the key shows; `data-pad` is what the handler reads. They
  // differ for one key only: the decimal, which reads "," in French.
  const key = (char, extra = '', label = char) =>
    `<button type="button" class="btn btn--key" data-pad="${char}"${extra}>${label}</button>`;
  /* R-26: with cents first there is no point key, so the bottom row is 0, delete
     and confirm: three cells, the same width class the confirm-less pad uses. */
  const threeCells = centsFirst || !confirm;
  return `
        <div class="keypad">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => key(k)).join('')}
        </div>
        <div class="keypad keypad-bottom${threeCells ? ' keypad-bottom-3' : ''}">
          ${centsFirst ? '' : key('.', ` aria-label="${escapeHtml(t('cam_decimal_point'))}"`, padSeparator())}
          ${key('0')}
          ${key('⌫', ` aria-label="${escapeHtml(t('cam_delete_last_digit'))}"`)}
          ${confirm
            ? `<button type="button" class="btn btn--key key-confirm" data-act="pad-confirm" aria-label="${confirmLabel}"${canConfirm ? '' : ' disabled'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </button>`
            : ''}
        </div>`;
}

/** The pad buffer, read as cents, or null if it does not parse as a usable
    amount. Shared by the render function (the confirm key's disabled state)
    and the screen (what actually gets priced). */
function padCents(buf) {
  return FLAGS.centsFirstPad ? centsOfDigits(buf) : parsePadPrice(buf);
}

function parsePadPrice(buf) {
  if (!buf) return null;
  const n = Number.parseFloat(buf);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export { pricePadDisplay, centsPadDisplay, padSeparator, padAmountHtml, keypadHtml, padCents, parsePadPrice };
