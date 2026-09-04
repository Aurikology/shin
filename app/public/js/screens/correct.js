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
 */

import { faceBlock } from '../shin.js';
import { say } from '../voice.js';
import * as store from '../store.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default {
  id: 'correct',
  title: 'Tell Shin the price',

  render(root, ctx) {
    let typed = '';
    let seller = '';
    let saved = false;

    const label = ctx.params.text ?? 'this';

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

      if (e.target.closest('[data-act="save"]')) {
        const cents = Math.round(Number.parseFloat(typed) * 100);
        if (!Number.isFinite(cents)) return;
        store.update((s) => ({
          ...s,
          corrections: [
            {
              at: new Date().toISOString(),
              text: ctx.params.text ?? null,
              category: ctx.params.category ?? null,
              amountCents: cents,
              // Never the string "given". A correction with no real seller is
              // not usable as a comparison point later.
              seller: seller.trim(),
            },
            ...s.corrections,
          ],
        }));
        saved = true;
        paint();
        setTimeout(() => ctx.go('camera'), 1400);
        return;
      }

      if (e.target.closest('[data-act="back"]')) ctx.go('camera');
    });
  },
};
