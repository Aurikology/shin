/**
 * "Terms, Privacy and Data": the first screen of a new install, and the one screen that cannot be skipped.
 *
 * Jamin, 2026-11-25: "Everything that is not part of the functionality of the app will come in one long
 * document at the beginning of the app, only appearing once, where the user clicks accept term and
 * agreements to continue into the app. The user will then not have the option to turn off send data to
 * Claude or other things like that."
 *
 * So this screen shows the whole document (legal/document.js, the same words as the hosted terms and privacy
 * pages) and one button, "Accept and continue". The press is the answer to everything in it: usage
 * recording, product details going to Anthropic's Claude for estimates, photos and rough location (location
 * still only as far as the phone's own OS permission allows). There is no switch for any of them anywhere
 * in the app any more; the "Your data" consent screen and the "Data and licences" screen were folded in.
 *
 * TWO MODES, ONE SCREEN. Until this install has accepted the current version, the router guard (main.js,
 * `needsAgreement`) sends every route here and the page shows the button. After that, Settings opens this
 * same route to read the document again (Apple 5.1.1(i): the privacy policy stays reachable in the app),
 * with a back control and the tab bar instead of the button.
 *
 * THE PHONE CARRIES THE ANSWER. `api.js` sends `x-shin-claude: 1` while `agreement.claude` is true, and the
 * server makes no Claude call without it (server.ts `claudeRangeAsk`), so a phone that never accepted
 * shares nothing. The press also writes the server's consent row as yes (api.postConsent), which is what
 * `keepPhoto` / `keepLocation` read; a device with no row keeps nothing. The record also goes through the
 * events queue as `agreement`, which survives having no signal.
 *
 * VERSION 3 (2026-11-25): every install that accepted version 2 sees the document once more.
 */
import * as store from '../store.js';
import { track } from '../track.js';
import { escapeHtml, on } from '../lib/dom.js';
import { t } from '../ui-strings.js';
import { locale } from '../lib/locale.js';
import { firstScreen } from '../onboarding-flow.js';
import { getDeviceId } from '../device.js';
import { backButton, pageBar, goBack } from '../lib/pagebar.js';
import { legalDocument, legalBodyHtml, LEGAL_EFFECTIVE } from '../legal/document.js';

/** Bump when the document changes enough to ask again. 3: one document, no off switches (2026-11-25). */
export const AGREEMENT_VERSION = 3;

/** True until this install has accepted the current version of the document. */
export function needsAgreement(s) {
  return !(s?.agreement?.at && s.agreement.version >= AGREEMENT_VERSION && s.agreement.claude === true);
}

/** The record to store and send. Pure, so a test can hold it. Accepting is a yes to every use in the document. */
export function agreementRecord(now = new Date()) {
  return { at: now.toISOString(), version: AGREEMENT_VERSION, document: LEGAL_EFFECTIVE, claude: true, usage: true, photos: true, location: true };
}

/**
 * Everything the press does. Local first (the flags every check in the app reads at once), then the
 * server's consent row, then the event. Exported so a test can run it without a DOM.
 */
export function accept(api, now = new Date()) {
  const record = agreementRecord(now);
  store.update({ agreement: record });
  store.setConsent({ photos: true, location: true });
  void syncAgreement(api);
  track('agreement', record);
  return record;
}

/**
 * Tells the server this device accepted, so `keepPhoto` / `keepLocation` read yes. Marks the record once the
 * server says it is stored; main.js calls this on every launch until then, so an accept pressed with no
 * signal still reaches the server. Never throws.
 */
export async function syncAgreement(api) {
  try {
    const s = store.get();
    if (needsAgreement(s) || s.agreement.serverAt) return false;
    const device = getDeviceId();
    if (!device?.id || !api?.postConsent) return false;
    const res = await api.postConsent({ deviceId: device.id, accepted: true, photos: true, location: true });
    if (res?.stored !== true) return false;
    store.update({ agreement: { ...store.get().agreement, serverAt: new Date().toISOString() } });
    return true;
  } catch {
    return false;
  }
}

export default {
  id: 'agree',
  title: 'Terms, Privacy and Data',
  titleKey: 'legal_title',

  render(root, ctx) {
    const lang = locale();
    const doc = legalDocument(lang);
    const asking = needsAgreement(store.get());

    root.innerHTML = `
      <div class="page legal-page${asking ? ' agree-page' : ''}">
        <header class="page-head">
          ${asking ? '' : backButton()}
          <h1>${escapeHtml(doc.title)}</h1>
        </header>

        <article class="legal-doc" lang="${lang === 'fr' ? 'fr' : 'en'}">
          ${legalBodyHtml(lang)}
        </article>

        ${asking
          ? `<div class="page-foot">
          <button type="button" class="cta" data-act="agree-go">${escapeHtml(t('agree_button'))}</button>
        </div>`
          : pageBar('you')}
      </div>`;

    /* The listener sits on #screen, which the router keeps; aborted on leave so repeat visits add none. */
    const ac = new AbortController();
    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="agree-go"]')) {
        accept(ctx.api);
        ctx.replace(firstScreen(store.get()));
        return;
      }
      if (e.target.closest('[data-act="back"]')) { goBack(ctx, 'you'); return; }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="progress"]')) { ctx.go('progress'); return; }
      if (e.target.closest('[data-act="you"]')) ctx.go('you');
    }, ac.signal);
    return () => ac.abort();
  },
};
