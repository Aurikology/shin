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
import * as shops from '../shops.js';
import { escapeHtml, on } from '../lib/dom.js';
import { goBack } from '../lib/pagebar.js';
/*
 * The keypad, from the screen that owns it. This file had its own 3x4 grid
 * and its own `display()`, a verbatim copy of `pricePadDisplay` minus the
 * `whole || '0'` guard -- so typing ".5" here rendered ".50" and on the
 * camera "0.50". One component, two hosts, and the copy was the worse one.
 */
import { keypadHtml, padAmountHtml } from './camera.js';
import { storagePersists } from '../lib/persistence.js';
import { t } from '../ui-strings.js';

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

/**
 * The pad. `⌫` is the only key whose glyph is not its own name, so it is the
 * only one carrying a label -- the camera's identical key already had one and
 * this one did not, which is the same control announcing itself two different
 * ways depending on which screen you reached it from.
 */
/**
 * Why the save button is off, in the order a person fills the screen in.
 *
 * The gate itself is not new -- a price with no seller is unusable as a
 * comparison point later, which is this file's own opening argument. What is
 * new is saying so. A disabled control that will not explain itself is a
 * control a person reads as broken, and at .34 opacity (components.css) it is
 * not even legible enough to guess from. Returns null when the button works,
 * which is also the signal to print nothing.
 */
function gateReason(typed, seller) {
  if (!typed && !seller.trim()) return say('correct_gate_both');
  if (!typed) return say('correct_gate_price');
  if (!seller.trim()) return say('correct_gate_seller');
  return null;
}

export default {
  id: 'correct',
  title: 'Tell Shin the price',
  titleKey: 'correct_title',

  render(root, ctx) {
    let typed = '';
    /**
     * The shop, pre-filled from the one the shopper already confirmed.
     *
     * THE WHOLE OF "instead of them having to input the store they're in
     * multiple times", on the screen that was doing the asking. This field
     * was a blank text box and the gate below refuses to save without it, so
     * every correction cost the shop's name typed out again, every time.
     *
     * It is a PRE-FILL AND NOT A LOCK. The box stays editable, the gate is
     * unchanged, and typing over it is how somebody corrects a price they saw
     * at a different shop from the one they are standing in -- which is a
     * normal thing to do from the past-scans list, where this screen is
     * usually reached from.
     *
     * `shopId` rides beside it as the identity (D-081), and is dropped the
     * moment the text stops matching the shop it came from: an id that no
     * longer names what the box says would count a hand-typed shop as the
     * tapped one, which is the collapse D-081 exists to prevent.
     */
    let seller = shops.chosenName();
    const shopId = shops.chosenId();
    let saved = false;
    let onSale = false;
    const ac = new AbortController();

    const subject = subjectOf(ctx.params);
    const label = subject.label ?? t('cam_this');

    function paint() {
      root.innerHTML = `
        <div class="page page-correct">
          <header class="page-head${saved ? '' : ' ph-with-face'}">
            <p class="kicker">${escapeHtml(t('correct_kicker'))}</p>
            ${saved ? '' : faceBlock('asking', { size: 64 })}
            <h1>${say('correct_ask')}</h1>
          </header>

          ${
            saved
              ? `<div class="saved-note">
                   ${faceBlock('pleased', { size: 64 })}
                   <p>${say('correct_thanks')}</p>
                   <div class="page-foot">
                     <button type="button" class="cta" data-act="back">${escapeHtml(t('done'))}</button>
                   </div>
                 </div>`
              : `
          <div class="amount" role="status" aria-label="${escapeHtml(t('correct_price_typed'))}">
            ${padAmountHtml(typed)}
          </div>

          <label class="seller">
            <span>${escapeHtml(t('correct_which_shop'))}</span>
            <input type="text" inputmode="text" autocomplete="off" placeholder="${escapeHtml(t('correct_shop_placeholder'))}"
                   class="field" value="${escapeHtml(seller)}" data-seller>
          </label>

          <button type="button" class="chip${onSale ? ' chip-on' : ''}" data-act="sale"
                  aria-pressed="${onSale ? 'true' : 'false'}">${escapeHtml(t('correct_on_sale'))}</button>

          <div class="pad">${keypadHtml()}</div>

          <!-- The label and the seller are both text a person typed. say()
               interpolates them into its sentence and the sentence goes to
               innerHTML, so this is a live injection path, not a theoretical
               one: correcting an item to an img tag with an onerror attribute
               and opening this screen ran it. Escaped at the boundary. -->
          <p class="fineprint">${escapeHtml(say('correct_fineprint', { label, seller }))}</p>
          ${
            /*
             * The error state, and the only one this screen can honestly have.
             * `corrections.js` states in its own header that the send is
             * deliberately not awaited and "NOTHING HERE THROWS AT A CALLER",
             * because a correction typed in a supermarket with no signal is
             * already saved locally and goes out later -- so a network error
             * banner here would contradict a recorded decision and turn a
             * working feature into a broken-looking one.
             *
             * What is not covered by that argument is a device that cannot
             * hold the local write either. Then the queue has nowhere to wait
             * and the promise the thank-you screen makes is not true. That is
             * worth saying before the price is typed, not after. See
             * lib/persistence.js.
             */
            storagePersists()
              ? ''
              : `<p class="fineprint" role="status">${escapeHtml(say('storage_not_kept'))}</p>`
          }

          <div class="page-foot">
            <p class="fineprint gate" data-gate role="status">${escapeHtml(gateReason(typed, seller) ?? '')}</p>
            <button type="button" class="cta" data-act="save" ${
              gateReason(typed, seller) ? 'disabled' : ''
            }>${escapeHtml(t('correct_save_it'))}</button>
            <button type="button" class="linky" data-act="back">${escapeHtml(t('correct_not_now'))}</button>
          </div>`
          }
        </div>`;
    }

    paint();

    /** The save gate and the sentence explaining it are one thing, so they move together. */
    function paintGate() {
      const why = gateReason(typed, seller);
      const cta = root.querySelector('[data-act="save"]');
      if (cta) cta.disabled = Boolean(why);
      const gate = root.querySelector('[data-gate]');
      if (gate) gate.textContent = why ?? '';
    }

    on(root, 'input', (e) => {
      if (e.target.matches('[data-seller]')) {
        seller = e.target.value;
        paintGate();
      }
    }, ac.signal);

    on(root, 'click', (e) => {
      const key = e.target.closest('[data-pad]');
      if (key) {
        const k = key.dataset.pad;
        if (k === '⌫') typed = typed.slice(0, -1);
        else if (k === '.') { if (!typed.includes('.') && typed) typed += '.'; }
        else if (typed.includes('.') && typed.split('.')[1].length >= 2) { /* two decimals is a price */ }
        else typed += k;
        const amt = root.querySelector('.amount');
        if (amt) amt.innerHTML = padAmountHtml(typed);
        paintGate();
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
          storeId: seller.trim() === shops.chosenName() ? shopId : null,
          kind: onSale ? 'promotional' : 'regular',
        });
        saved = true;
        paint();
        return;
      }

      // Back, not a fixed destination: this screen is reached from the camera
      // and from a list, and `ctx.go('camera')` dropped a person correcting a
      // saved item somewhere they had not come from. The thank-you state waits
      // for this tap rather than leaving on a timer.
      if (e.target.closest('[data-act="back"]')) goBack(ctx, 'camera');
    }, ac.signal);

    return () => ac.abort();
  },
};
