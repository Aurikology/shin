/**
 * The first screen of a new install, and the one screen that cannot be skipped (Jamin's App Store
 * list, 2026-11-05, item 9). ONE screen, ONE action (Jamin, 2026-11-22: "have everything we need under
 * one single: 'i agree to all terms and services' and the only way someone can get into this app is by
 * accepting that"). The button "Agree and continue" covers, in plain lines above it:
 *
 *   - the Terms of Use and the Privacy Policy (both linked). Pexi is for all ages (RULINGS "Pexi is
 *     for all ages", 2026-11-07, which replaced the 18+ checkbox), so there is no age question and
 *     the record carries no age claim;
 *   - recording what the shopper scans and how they use the app, to improve the answers (usage);
 *   - product names going to Anthropic's Claude AI to estimate a price. Apple 5.1.2 needs permission
 *     before sharing with an outside AI, and Quebec Law 25 wants each purpose stated: both are met by
 *     naming the recipient and the purpose on the screen, above the one button that gives the yes.
 *
 * Before 2026-11-22 this was a tick box plus a separate Claude yes/no; AGREEMENT_VERSION went to 2 so
 * every install that answered the old screen sees this one once.
 *
 * THIS IS NOT PART OF THE WELCOME FLOW, because that flow has "Skip the rest" on every step and
 * must never block. main.js sets a router guard (`needsAgreement`) that sends every route here, so
 * a `?s=` link does not walk around it.
 *
 * THE PHONE CARRIES THE ANSWER. `api.js` sends `x-shin-claude: 1` only while `agreement.claude` is
 * true, and the server makes no Claude call without it (server.ts `claudeRangeAsk`), so an older app
 * and a withdrawn yes both fail toward not sharing. The You screen has a switch for Claude
 * (`claude-consent`) and one for usage (`usage-sharing`, usage-setting.js); each turns its own use off
 * without bringing this screen back. The record also goes through the events queue as `agreement`,
 * which survives having no signal.
 */
import * as store from '../store.js';
import { track } from '../track.js';
import { escapeHtml, on } from '../lib/dom.js';
import { t } from '../ui-strings.js';
import { locale } from '../lib/locale.js';
import { legalUrl } from '../plus-config.js';
import { firstScreen } from '../onboarding-flow.js';
import { setUsageSharing } from '../usage-setting.js';

/** Bump when the Terms change enough to ask again. 2: one "Agree and continue" replaced the tick box and the Claude question. */
export const AGREEMENT_VERSION = 2;

/** True until this install has answered the current version of this screen. */
export function needsAgreement(s) {
  return !(s?.agreement?.at && s.agreement.version >= AGREEMENT_VERSION && typeof s.agreement.claude === 'boolean');
}

/**
 * The record to store and send. Pure, so a test can hold it. Agreeing turns both uses on: `claude`
 * is what api.js reads for the header, `usage` is the matching line of the record (the live usage
 * switch is usage-setting.js, set on the same press).
 */
export function agreementRecord(now = new Date()) {
  return { at: now.toISOString(), version: AGREEMENT_VERSION, claude: true, usage: true };
}

export default {
  id: 'agree',
  title: 'Before you start',
  titleKey: 'agree_title',

  render(root, ctx) {
    const lang = locale();

    root.innerHTML = `
      <div class="page consent-page agree-page">
        <header class="page-head">
          <h1>${escapeHtml(t('agree_title'))}</h1>
        </header>

        <p class="fineprint agree-lead">${escapeHtml(t('agree_lead'))}</p>
        <div class="ilist consent-list">
          <div class="ilist-row consent-row">
            <p class="agree-line">${escapeHtml(t('agree_terms_line'))}</p>
          </div>
          <div class="ilist-row agree-links">
            <a href="${escapeHtml(legalUrl('terms', lang))}" target="_blank" rel="noopener noreferrer" data-agree-terms>${escapeHtml(t('agree_terms_link'))}</a>
            <a href="${escapeHtml(legalUrl('privacy', lang))}" target="_blank" rel="noopener noreferrer" data-agree-privacy>${escapeHtml(t('agree_privacy_link'))}</a>
          </div>
          ${/* 2026-11-21: what the skipped "Your data" screen said, at the moment of collection (Quebec P-39.1 s.8). */ ''}
          <div class="ilist-row consent-row" data-agree-data>
            <p class="agree-line">${escapeHtml(t('agree_data_line'))}</p>
          </div>
          <div class="ilist-row consent-row" data-agree-claude>
            <p class="agree-line">${escapeHtml(t('agree_claude_line'))}</p>
          </div>
        </div>
        <p class="fineprint">${escapeHtml(t('agree_change_later'))}</p>

        <div class="page-foot">
          <button type="button" class="cta" data-act="agree-go">${escapeHtml(t('agree_button'))}</button>
        </div>
      </div>`;

    on(root, 'click', (e) => {
      if (!e.target.closest('[data-act="agree-go"]')) return;
      const record = agreementRecord();
      store.update({ agreement: record });
      setUsageSharing(true);
      track('agreement', record);
      ctx.replace(firstScreen(store.get()));
    });
  },
};
