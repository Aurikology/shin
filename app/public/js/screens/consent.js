/**
 * Item 6b: the first-launch consent screen. Photos and location are both OFF
 * until answered (RULINGS.md, "Location and photo consent default off until
 * answered"; photos were briefly on by default from 2026-09-19 until D-148
 * was fixed 2026-09-28; see app/src/consent.ts). Each is
 * its own switch with its own explanation right beside it, the photo line
 * saying plainly that it is on and how to turn it off, and a Continue that
 * works whatever the switches say -- the screen must be fully usable and
 * dismissible with either one flipped, because either outcome is a correct
 * outcome of a screen that worked, not a state to be argued out of. No
 * "are you sure", no guilt copy, no extra tap to opt out: the switch is the
 * whole opt-out.
 *
 * WHY THIS IS A SEPARATE SCREEN AND NOT A THIRD QUESTION FOLDED INTO SETUP.
 * `setup.js`'s own header draws a hard line between "which Pexi" (a
 * preference, changeable any time, no consequence either way) and camera
 * permission (asked at the moment it means something). Consent belongs on
 * neither side of that line: it is not a preference and it is not the OS's
 * own permission prompt, it is Pexi's own promise about what it does with
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
import { confirmConsent, toggleConsent } from '../consent-actions.js';
import { backButton } from '../lib/pagebar.js';
import { FLAGS } from '../flags.js';
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
          ${/* FLAGS.onboarding off: this is the first screen, with no setup
               behind it to go back to. */ FLAGS.onboarding ? backButton() : ''}
          <p class="kicker">${escapeHtml(t('consent_kicker'))}</p>
          <h1>${escapeHtml(t('consent_heading'))}</h1>
        </header>

        <p class="fineprint consent-enter">${escapeHtml(say('consent_intro_lean', { photos: FLAGS.photoId, locationSwitch: FLAGS.onboarding }))}</p>

        ${!FLAGS.photoId && !FLAGS.onboarding ? '' : `<div class="ilist consent-list consent-enter">
          ${/* FLAGS.photoId off: no photo is ever kept, so there is no photo switch (D24). */ !FLAGS.photoId ? '' : `<div class="ilist-row consent-row">
            <div class="consent-text">
              <span class="ilist-l">${escapeHtml(t('consent_photos'))}</span>
              <p class="fineprint">${escapeHtml(say('consent_photos_desc'))}</p>
            </div>
            <button type="button" class="switch" data-consent="photos" role="switch"
                    aria-checked="${store.consent().photos}" aria-label="${escapeHtml(t('consent_photos'))}"></button>
          </div>`}
          ${/* FLAGS.onboarding off: the permission screen right before this
               one already asked for location, through the same switch
               (D-139; ruled 2026-09-28, asked once, on the permission screen). */
            FLAGS.onboarding ? `
          <div class="ilist-row consent-row">
            <div class="consent-text">
              <span class="ilist-l">${escapeHtml(t('consent_location'))}</span>
              <p class="fineprint">${escapeHtml(say('consent_location_desc'))}</p>
            </div>
            <button type="button" class="switch" data-consent="location" role="switch"
                    aria-checked="false" aria-label="${escapeHtml(t('consent_location'))}"></button>
          </div>` : ''}
        </div>`}

        <p class="fineprint consent-enter">${escapeHtml(say(FLAGS.photoId ? 'consent_footer' : 'consent_footer_one'))}</p>

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
    // Both start off until this device's own store
    // says otherwise (a re-run of this screen after a reset, say); painted
    // from `store.consent()`, the same values the server's default reads as.
    paint();

    on(root, 'click', (e) => {
      const consentBtn = e.target.closest('[data-consent]');
      if (consentBtn) {
        toggleConsent(ctx.api, consentBtn.dataset.consent);
        paint();
        return;
      }
      if (e.target.closest('[data-act="go"]')) {
        confirmConsent(ctx.api);
        store.setConsentSeen();
        ctx.replace('camera');
        return;
      }
      /*
       * Back to setup, and only that far. `setup.js` advances with
       * `ctx.replace`, so there is no history entry behind this screen and
       * `history.back()` would leave the app: the way back is to put the flag
       * that routes `firstScreen` back the way it was. Nothing is lost doing
       * it -- the attitude and the three ranges are written when they are
       * tapped, not when Continue is pressed, so setup repaints with the
       * person's own picks still selected.
       *
       * Deliberately NOT offered on setup itself. Going back from there means
       * clearing `onboarding.doneAt` and replaying the whole welcome, which
       * throws away answers `recordAnswer` has already put in the store AND in
       * the events queue. Aurik's call, 2026-09-21: the cheap direction only.
       */
      if (e.target.closest('[data-act="back"]') && FLAGS.onboarding) {
        store.update({ seenIntro: false });
        ctx.replace('setup');
      }
    }, ac.signal);

    return () => ac.abort();
  },
};
