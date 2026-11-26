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
 *
 * VERSION 4 (2026-11-26, legal review A G1 to G3, Apple 5.1.1(ii) and 5.1.2(i), Quebec P-39.1 s.14): what the
 * service does not need to answer a scan became the shopper's own choice. The one acceptance still covers what
 * the service needs. Two things moved out of it: (1) "Help improve Pexi", one optional switch on this screen,
 * OFF until turned on, changeable any time in Settings (you.js); it covers usage recording beyond answering and
 * use of it to improve Pexi. (2) Typed words going to Anthropic's Claude: a one-time plain notice, Allow or Not
 * now, shown the first time a shopper types a search (`askAiText`). Not now still answers from Pexi's own data.
 * Both are stored on the server with their times (api.postConsent), and the SERVER enforces them: no Claude
 * call with typed words and no usage event is kept without the stored yes (server.ts, src/consent.ts).
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
import { improveOn, aiTextAnswer, setChoice, syncChoices, askAiText } from '../choices.js';

/* The choices live in choices.js so Settings can use them without importing this screen. */
export { improveOn, aiTextAnswer, setChoice, syncChoices, askAiText };

/**
 * Bump when the document changes enough to ask again. 3: one document, no off switches (2026-11-25).
 * 4: the optional "Help improve Pexi" choice and the cross-border and recipient wording (2026-11-26).
 */
export const AGREEMENT_VERSION = 4;

/** True until this install has accepted the current version of the document. */
export function needsAgreement(s) {
  return !(s?.agreement?.at && s.agreement.version >= AGREEMENT_VERSION && s.agreement.claude === true);
}

/**
 * The record to store and send. Pure, so a test can hold it. Accepting is a yes to what the service needs
 * (product names to Claude for estimates, the photo and rough location the shopper's phone allows). Usage
 * recording beyond that is the separate `improve` choice: false unless the shopper turned it on.
 */
export function agreementRecord(now = new Date(), { improve = false } = {}) {
  const on = improve === true;
  return {
    at: now.toISOString(), version: AGREEMENT_VERSION, document: LEGAL_EFFECTIVE,
    claude: true, usage: on, improve: on, photos: true, location: true,
    choicesAt: now.toISOString(),
  };
}

/**
 * Everything the press does. Local first (the flags every check in the app reads at once), then the
 * server's consent row, then the event. Exported so a test can run it without a DOM.
 */
export function accept(api, now = new Date(), choices = {}) {
  const record = agreementRecord(now, choices);
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
    if (needsAgreement(s)) return false;
    if (s.agreement.serverAt) return await syncChoices(api);
    const device = getDeviceId();
    if (!device?.id || !api?.postConsent) return false;
    const a = s.agreement;
    const res = await api.postConsent({
      deviceId: device.id, accepted: true, photos: true, location: true,
      ...(typeof a.improve === 'boolean' ? { improve: a.improve } : {}),
    });
    if (res?.stored !== true) return false;
    const after = store.get().agreement;
    store.update({
      agreement: {
        ...after,
        serverAt: new Date().toISOString(),
        ...(after.choicesAt === a.choicesAt ? { choicesServerAt: a.choicesAt } : {}),
      },
    });
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
    let improve = false; // "Help improve Pexi" starts off; only the shopper's own press turns it on

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
          <div class="ilist consent-list">
            <div class="ilist-row consent-row">
              <div class="consent-text">
                <span class="ilist-l" id="agree-improve-l">${escapeHtml(t('improve_title'))}</span>
                <p class="fineprint">${escapeHtml(t('improve_body'))} ${escapeHtml(t('improve_change'))}</p>
              </div>
              <button type="button" class="switch" data-act="improve" role="switch"
                      aria-checked="false" aria-labelledby="agree-improve-l"></button>
            </div>
          </div>
          <button type="button" class="cta" data-act="agree-go">${escapeHtml(t('agree_button'))}</button>
        </div>`
          : pageBar('you')}
      </div>`;

    /* The listener sits on #screen, which the router keeps; aborted on leave so repeat visits add none. */
    const ac = new AbortController();
    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="improve"]')) {
        improve = !improve;
        const sw = root.querySelector('[data-act="improve"]');
        sw?.setAttribute('aria-checked', String(improve));
        sw?.classList.toggle('on', improve);
        return;
      }
      if (e.target.closest('[data-act="agree-go"]')) {
        accept(ctx.api, new Date(), { improve });
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
