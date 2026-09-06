/**
 * Correcting Shin, which is also how a refusal turns into data.
 *
 * The keypad is the whole screen because typing a price with one hand in an
 * aisle is the entire job. Nothing else competes for the thumb.
 *
 * The seller is recorded with the correction, always. A price with no seller
 * cannot be excluded from its own comparison set later, and the literal string
 * "given" that the engine uses when no store was named is not a seller and must
 * never be stored as one.
 *
 * WHAT THE CORRECTION IS FILED AGAINST. A price with no product is a number
 * nobody can ever look up again, so this screen resolves an identity before it
 * saves anything: the barcode and product key handed in by the camera if there
 * is one, and otherwise the identity from the verdict that was on screen when
 * the person tapped correct, which is the most recent thing in their own
 * history. Only if both are missing does it fall back to the text, which is what
 * happens after a refusal that never resolved anything, and that is still worth
 * keeping.
 *
 * THE ONE EXTRA QUESTION, and why it earns its place on a screen whose whole
 * argument is that nothing competes for the thumb. `spine/src/contract.ts` calls
 * collapsing a sale price into an everyday price "the single most expensive
 * mistake available here"; a shopper reading a promo tag into a field that means
 * regular walks the usual price down for everybody who scans that product next.
 * It is one tap, it defaults to the common case, and it is never required.
 */

import { faceBlock } from '../shin.js';
import { say } from '../voice.js';
import * as store from '../store.js';
import { submitCorrection } from '../corrections.js';

/**
 * The product this correction is about, best available.
 *
 * The camera's own call to this screen passes text and category only, so the
 * identity is recovered here rather than by changing that call: the verdict is
 * written to history the moment it is produced, before any tap, so the newest
 * entry is the thing the person is looking at. A saved verdict is preferred over
 * a saved refusal because only the first carries an identity worth filing under.
 */
function subjectOf(params) {
  const explicit = {
    code: params.gtin ?? params.code ?? null,
    productId: params.productId ?? null,
    label: params.text ?? null,
    category: params.category ?? null,
  };
  if (explicit.code || explicit.productId) return explicit;

  const recent = store.get().history[0];
  const identity = recent?.result?.identity ?? null;
  return {
    code: identity?.gtin ?? null,
    productId: identity?.id ?? null,
    label: params.text ?? identity?.label ?? null,
    category: params.category ?? identity?.category ?? null,
  };
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default {
  id: 'correct',
  title: 'Tell Shin the price',

  render(root, ctx) {
    let typed = '';
    let seller = '';
    let saved = false;
    let onSale = false;

    const subject = subjectOf(ctx.params);
    const label = subject.label ?? 'this';

    function display() {
      if (!typed) return '<span class="ghosted">0.00</span>';
      const [whole, frac] = typed.split('.');
      return frac === undefined
        ? `${whole}<span class="ghosted">.00</span>`
        : `${whole}.${frac}${frac.length === 1 ? '<span class="ghosted">0</span>' : ''}`;
    }

    function paint() {
      root.innerHTML = `
        <div class="page page-correct">
          <header class="page-head${saved ? '' : ' ph-with-face'}">
            <p class="kicker">Teach Shin</p>
            ${saved ? '' : faceBlock('asking', { size: 64 })}
            <h1>${say('correct_ask')}</h1>
          </header>

          ${
            saved
              ? `<div class="saved-note">
                   ${faceBlock('pleased', { size: 64 })}
                   <p>${say('correct_thanks')}</p>
                 </div>`
              : `
          <div class="amount"><span class="amount-cur">$</span>${display()}</div>

          <label class="seller">
            <span>Which shop?</span>
            <input type="text" inputmode="text" autocomplete="off" placeholder="Metro, No Frills, a listing…"
                   value="${seller.replace(/"/g, '&quot;')}" data-seller>
          </label>

          <button type="button" class="chip${onSale ? ' chip-on' : ''}" data-act="sale"
                  aria-pressed="${onSale ? 'true' : 'false'}">On sale</button>

          <div class="keypad">
            ${KEYS.map((k) => `<button type="button" class="key" data-k="${k}">${k}</button>`).join('')}
          </div>

          <p class="fineprint">${say('correct_fineprint', { label, seller })}</p>

          <div class="page-foot">
            <button type="button" class="cta" data-act="save" ${typed && seller ? '' : 'disabled'}>Save it</button>
            <button type="button" class="linky" data-act="back">Not now</button>
          </div>`
          }
        </div>`;
    }

    paint();

    root.addEventListener('input', (e) => {
      if (e.target.matches('[data-seller]')) {
        seller = e.target.value;
        const cta = root.querySelector('[data-act="save"]');
        if (cta) cta.disabled = !(typed && seller.trim());
      }
    });

    root.addEventListener('click', (e) => {
      const key = e.target.closest('[data-k]');
      if (key) {
        const k = key.dataset.k;
        if (k === '⌫') typed = typed.slice(0, -1);
        else if (k === '.') { if (!typed.includes('.') && typed) typed += '.'; }
        else if (typed.includes('.') && typed.split('.')[1].length >= 2) { /* two decimals is a price */ }
        else typed += k;
        const amt = root.querySelector('.amount');
        if (amt) amt.innerHTML = `<span class="amount-cur">$</span>${display()}`;
        const cta = root.querySelector('[data-act="save"]');
        if (cta) cta.disabled = !(typed && seller.trim());
        return;
      }

      if (e.target.closest('[data-act="sale"]')) {
        onSale = !onSale;
        const chip = root.querySelector('[data-act="sale"]');
        if (chip) {
          chip.classList.toggle('chip-on', onSale);
          chip.setAttribute('aria-pressed', onSale ? 'true' : 'false');
        }
        return;
      }

      if (e.target.closest('[data-act="save"]')) {
        const cents = Math.round(Number.parseFloat(typed) * 100);
        if (!Number.isFinite(cents)) return;
        // Saved on this device first, then sent. The thank-you below is about
        // the local write, which cannot fail on a network, so an aisle with no
        // signal produces the same screen as a good connection and the queue
        // sends it later.
        submitCorrection({
          code: subject.code,
          productId: subject.productId,
          label: subject.label,
          category: subject.category,
          amountCents: cents,
          seller: seller.trim(),
          kind: onSale ? 'promotional' : 'regular',
        });
        saved = true;
        paint();
        setTimeout(() => ctx.go('camera'), 1400);
        return;
      }

      if (e.target.closest('[data-act="back"]')) ctx.go('camera');
    });
  },
};
