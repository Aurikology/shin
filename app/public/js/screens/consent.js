/**
 * Item 6b: the first-launch consent screen. Photos and location, off by
 * default, each its own opt-in with its own explanation right beside it, and
 * a Continue that works whether or not either is turned on -- the screen
 * must be fully usable and dismissible with both left off, because leaving
 * them off is a correct outcome of a screen that worked, not a state to be
 * argued out of.
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

export default {
  id: 'consent',
  title: 'Your data',

  render(root, ctx) {
    const ac = new AbortController();

    root.innerHTML = `
      <div class="page consent-page">
        <header class="page-head">
          <p class="kicker">Before your first scan</p>
          <h1>What Shin does with your data</h1>
        </header>

        <p class="fineprint consent-enter">${escapeHtml(say('consent_intro'))}</p>

        <div class="ilist consent-list consent-enter">
          <div class="ilist-row consent-row">
            <div class="consent-text">
              <span class="ilist-l">Photos</span>
              <p class="fineprint">${escapeHtml(say('consent_photos_desc'))}</p>
            </div>
            <button type="button" class="switch" data-consent="photos" role="switch"
                    aria-checked="false" aria-label="Photos"></button>
          </div>
          <div class="ilist-row consent-row">
            <div class="consent-text">
              <span class="ilist-l">Location</span>
              <p class="fineprint">${escapeHtml(say('consent_location_desc'))}</p>
            </div>
            <button type="button" class="switch" data-consent="location" role="switch"
                    aria-checked="false" aria-label="Location"></button>
          </div>
        </div>

        <p class="fineprint consent-enter">${escapeHtml(say('consent_footer'))}</p>

        ${
          storagePersists()
            ? ''
            : `<p class="fineprint" role="status">${escapeHtml(say('storage_not_kept'))}</p>`
        }

        <div class="page-foot">
          <button type="button" class="cta" data-act="go">Continue</button>
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
    // Both toggles start off and stay off until this device's own store says
    // otherwise (a re-run of this screen after a reset, say); painted from
    // `store.consent()` rather than trusted to the `false` written into the
    // markup above, which is only ever the honest first-launch default.
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
