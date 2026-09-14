/**
 * Item 6b: the first-launch consent screen. Photos and location, ON by
 * default since 2026-09-14 (the founder's word, "build everything for
 * collecting EVERYTHING"), each its own explanation right beside its own
 * switch, and a Continue that works whether either is left on or switched
 * off -- the screen must be fully usable and dismissible either way, because
 * turning one off is a correct outcome of a screen that worked, not a state
 * to be argued out of. This is a notice with switches now, not an opt-in
 * form: the words above the switches say what is already being kept, and the
 * switches are how someone holds either one back.
 *
 * WHY THIS IS A SEPARATE SCREEN AND NOT A THIRD QUESTION FOLDED INTO SETUP.
 * `setup.js`'s own header draws a hard line between "which Shin" (a
 * preference, changeable any time, no consequence either way) and camera
 * permission (asked at the moment it means something). Consent belongs on
 * neither side of that line: it is not a preference and it is not the OS's
 * own permission prompt, it is Shin's own promise about what it does with
 * what it is handed, and it earns its own screen for the same reason the
 * plan calls it out as its own item rather than a line on another one.
 *
 * NO ACCEPT AND NO DECLINE BUTTON. There is only Continue, and it means
 * nothing about either toggle -- both stay exactly where the person left
 * them. A screen with an "Allow" and a quieter "Not now" is the dark pattern
 * this design deliberately does not build: accepting and declining are not
 * choices this screen frames as a decision to weigh, they are two
 * independent switches a person can leave alone.
 *
 * ONCE, EVER. `store.consentSeen()` gates whether main.js routes here at
 * all; `setup.js` sends a first launch here on its way to the camera, and
 * every launch after that goes straight past this file. The You screen
 * (screens/you.js) is where the same two toggles live afterward, sharing this
 * screen's own description keys (voice.js's `consent_photos_desc` and
 * `consent_location_desc`) and the same write path (`consent-actions.js`), so
 * the sentence explaining a toggle can never say something different in the
 * two places it appears.
 */

import { say } from '../voice.js';
import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { storagePersists } from '../lib/persistence.js';
import { toggleConsent } from '../consent-actions.js';
import { t } from '../ui-strings.js';

export default {
  id: 'consent',
  title: 'Your data',
  titleKey: 'consent_title',

  render(root, ctx) {
    const ac = new AbortController();

    root.innerHTML = `
      <div class="page consent-page">
        <header class="page-head">
          <p class="kicker">${escapeHtml(t('consent_kicker'))}</p>
          <h1>${escapeHtml(t('consent_heading'))}</h1>
        </header>

        <p class="fineprint consent-enter">${escapeHtml(say('consent_intro'))}</p>

        <div class="ilist consent-list consent-enter">
          <div class="ilist-row consent-row">
            <div class="consent-text">
              <span class="ilist-l">${escapeHtml(t('consent_photos'))}</span>
              <p class="fineprint">${escapeHtml(say('consent_photos_desc'))}</p>
            </div>
            <button type="button" class="switch" data-consent="photos" role="switch"
                    aria-checked="true" aria-label="${escapeHtml(t('consent_photos'))}"></button>
          </div>
          <div class="ilist-row consent-row">
            <div class="consent-text">
              <span class="ilist-l">${escapeHtml(t('consent_location'))}</span>
              <p class="fineprint">${escapeHtml(say('consent_location_desc'))}</p>
            </div>
            <button type="button" class="switch" data-consent="location" role="switch"
                    aria-checked="true" aria-label="${escapeHtml(t('consent_location'))}"></button>
          </div>
        </div>

        <p class="fineprint consent-enter">${escapeHtml(say('consent_footer'))}</p>

        ${
          storagePersists()
            ? ''
            : `<p class="fineprint" role="status">${escapeHtml(say('storage_not_kept'))}</p>`
        }

        <div class="page-foot">
          <button type="button" class="cta" data-act="go">${escapeHtml(t('consent_continue'))}</button>
        </div>
      </div>`;

    function paint() {
      const c = store.consent();
      for (const key of ['photos', 'location']) {
        const btn = root.querySelector(`[data-consent="${key}"]`);
        if (!btn) continue;
        btn.setAttribute('aria-checked', String(c[key]));
        btn.classList.toggle('on', c[key]);
      }
    }
    // Both toggles start ON and stay on until this device's own store says
    // otherwise; painted from `store.consent()` rather than trusted to the
    // `true` written into the markup above, which is only ever the honest
    // first-launch default (2026-09-14) and never the last word for a device
    // that has actually touched a switch since.
    paint();

    on(root, 'click', (e) => {
      const consentBtn = e.target.closest('[data-consent]');
      if (consentBtn) {
        toggleConsent(ctx.api, consentBtn.dataset.consent);
        paint();
        return;
      }
      if (e.target.closest('[data-act="go"]')) {
        store.setConsentSeen();
        ctx.replace('camera');
      }
    }, ac.signal);

    return () => ac.abort();
  },
};
