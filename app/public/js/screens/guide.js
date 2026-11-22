/**
 * How Pexi works: the walkthrough a new shopper sees once, before the first camera.
 *
 * Aurik, 2026-11-22: "set up the app walk through for new users". The 30-step welcome flow stays
 * switched off (Jamin, 2026-09-21, flags.js `onboarding`): it asks shopping habits, and this asks
 * nothing. Four cards say what the app does, in the order a scan happens: scan the barcode, add the
 * shelf price, read the verdict, and what to do when the barcode will not read. The fourth carries
 * what the early access banner says (early-access.js), so finishing here also dismisses that banner
 * and a new shopper is not told the same thing twice on their first minute.
 *
 * NOTHING HERE BLOCKS THE APP (the rule permissions.js and the welcome flow hold): Skip is on every
 * card, and Skip and Start both mark the walkthrough seen. RULINGS "Localization and onboarding":
 * onboarding pages must be watchable more than once, so You has a "How Pexi works" row that opens
 * this again with `?replay=1`, and a replay ends by going back to You, not to the camera.
 *
 * ONCE, EVER, remembered in localStorage like the early access banner. Storage that throws shows the
 * walkthrough again next launch, which is harmless; it never blocks.
 *
 * ALL TEXT IS CHROME, t('guide_*'), in English and French (ui-strings.js).
 */

import { escapeHtml, on } from '../lib/dom.js';
import { t } from '../ui-strings.js';
import { faceSvg } from '../shin.js';
import { track } from '../track.js';
import { dismissEarlyAccess } from '../early-access.js';
import { markGuideSeen } from '../guide-state.js';

/** The cards, in the order a scan happens. `face` is the mascot state drawn above each. */
export const GUIDE_CARDS = Object.freeze([
  Object.freeze({ id: 1, face: 'idle', art: 'barcode' }),
  Object.freeze({ id: 2, face: 'asking', art: 'tag' }),
  Object.freeze({ id: 3, face: 'delighted', art: 'verdict' }),
  Object.freeze({ id: 4, face: 'pleased', art: 'search' }),
]);

/* Simple line drawings, one per card, in currentColor so both themes draw them. */
const ART = {
  barcode: '<path d="M10 18v-6h8M46 12h8v6M54 46v6h-8M18 52h-8v-6"/><path d="M20 22v20M25 22v20M31 22v20M35 22v20M41 22v20M45 22v20" stroke-width="2.4"/><path class="guide-art-accent" d="M14 32h36"/>',
  tag: '<path d="M34 10h18v18L30 50a3 3 0 0 1-4 0L14 38a3 3 0 0 1 0-4z"/><circle cx="44" cy="18" r="3"/><path class="guide-art-accent" d="M24 34l8-8M27 38l9-9"/>',
  verdict: '<path d="M12 44a20 20 0 0 1 40 0"/><path class="guide-art-accent" d="M32 44l10-12"/><circle cx="32" cy="44" r="3"/><path d="M14 52h36"/>',
  search: '<circle cx="28" cy="28" r="12"/><path d="M37 37l13 13"/><path class="guide-art-accent" d="M22 28h12"/>',
};

function artSvg(kind) {
  return `<svg class="guide-art" viewBox="0 0 64 64" width="88" height="88" fill="none" stroke="currentColor"
    stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ART[kind]}</svg>`;
}

export default {
  id: 'guide',
  title: 'How Pexi works',
  titleKey: 'guide_title',

  render(root, ctx) {
    const ac = new AbortController();
    const replay = ctx.params?.replay === '1' || ctx.params?.replay === 1;
    const total = GUIDE_CARDS.length;
    let at = 0;

    function paint() {
      const card = GUIDE_CARDS[at];
      const last = at === total - 1;
      root.innerHTML = `
        <div class="page guide-page">
          <header class="guide-top">
            ${at > 0
              ? `<button type="button" class="linky guide-back" data-act="back">${escapeHtml(t('guide_back'))}</button>`
              : '<span class="guide-back-gap"></span>'}
            <p class="kicker">${escapeHtml(t('guide_title'))}</p>
            ${last ? '<span class="guide-back-gap"></span>'
              : `<button type="button" class="linky guide-skip" data-act="skip">${escapeHtml(t('guide_skip'))}</button>`}
          </header>
          <section class="guide-card" aria-live="polite" data-card="${card.id}">
            <div class="guide-visual">
              <div class="guide-face" aria-hidden="true">${faceSvg(card.face, { size: 72 })}</div>
              ${artSvg(card.art)}
            </div>
            <p class="guide-step">${escapeHtml(t('guide_step', { n: String(at + 1), total: String(total) }))}</p>
            <h1 tabindex="-1">${escapeHtml(t(`guide_${card.id}_title`))}</h1>
            <p class="guide-body">${escapeHtml(t(`guide_${card.id}_body`))}</p>
          </section>
          <div class="guide-dots" aria-hidden="true">
            ${GUIDE_CARDS.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('')}
          </div>
          <div class="page-foot">
            <button type="button" class="cta" data-act="${last ? 'done' : 'next'}">${escapeHtml(t(last ? (replay ? 'guide_done' : 'guide_start') : 'guide_next'))}</button>
          </div>
        </div>`;
    }

    function finish(how) {
      markGuideSeen();
      dismissEarlyAccess();
      track(how === 'skip' ? 'guide_skip' : 'guide_done', { card: at + 1, replay });
      if (replay && globalThis.history?.length > 1) globalThis.history.back();
      else ctx.replace('camera');
    }

    function step(by) {
      const next = Math.min(total - 1, Math.max(0, at + by));
      if (next === at) return;
      at = next;
      paint();
      root.querySelector('.guide-card h1')?.focus?.({ preventScroll: true });
    }

    paint();

    on(root, 'click', (e) => {
      const act = e.target.closest?.('[data-act]')?.dataset.act;
      if (act === 'next') step(1);
      else if (act === 'back') step(-1);
      else if (act === 'skip') finish('skip');
      else if (act === 'done') finish('done');
    }, ac.signal);

    /* A swipe moves between cards, as people expect of a set of cards. */
    let startX = null;
    on(root, 'touchstart', (e) => { startX = e.touches?.[0]?.clientX ?? null; }, ac.signal, { passive: true });
    on(root, 'touchend', (e) => {
      if (startX === null) return;
      const dx = (e.changedTouches?.[0]?.clientX ?? startX) - startX;
      startX = null;
      if (Math.abs(dx) >= 50) step(dx < 0 ? 1 : -1);
    }, ac.signal, { passive: true });

    return () => ac.abort();
  },
};
