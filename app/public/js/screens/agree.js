/**
 * The first screen of a new install, and the one screen that cannot be skipped (Jamin's App Store
 * list, 2026-11-05, item 9). Two answers, neither made for the person:
 *
 *   - "I agree to the Terms of Use and the Privacy Policy". Pexi is for all ages (RULINGS "Pexi is
 *     for all ages", 2026-11-07, which replaced the 18+ checkbox), so there is no age question and
 *     the record carries no age claim. Nothing else in the app opens until it is ticked.
 *   - Whether product names may go to Anthropic's Claude for a price estimate. Apple 5.1.2 needs
 *     permission before sharing with an outside AI, so nothing is preselected. "No" is a whole
 *     answer: Pexi still answers every scan, with a broad-guess range when it has no price.
 *
 * THIS IS NOT PART OF THE WELCOME FLOW, because that flow has "Skip the rest" on every step and
 * must never block. main.js sets a router guard (`needsAgreement`) that sends every route here, so
 * a `?s=` link does not walk around it.
 *
 * THE PHONE CARRIES THE ANSWER. `api.js` sends `x-shin-claude: 1` only with a yes, and the server
 * makes no Claude call without it (server.ts `claudeRangeAsk`), so an older app, an unanswered
 * screen and a withdrawn yes all fail toward not sharing. The answer also goes through the events
 * queue as `agreement`, which is the record of it and survives having no signal. The You screen is
 * where it is changed later (`claude-consent` there).
 */
import * as store from '../store.js';
import { track } from '../track.js';
import { escapeHtml, on } from '../lib/dom.js';
import { t } from '../ui-strings.js';
import { locale } from '../lib/locale.js';
import { legalUrl } from '../plus-config.js';
import { firstScreen } from '../onboarding-flow.js';

/** Bump when the Terms change enough to ask again. */
export const AGREEMENT_VERSION = 1;

/** True until this install has answered the current version of this screen. */
/**
 * D-268 G32 (2026-11-11 walk): Continue sat grey with no word on why. What is
 * still missing, said under it; empty once both are answered (a no is an answer).
 */
export function agreeHint(ticked, claude) {
  if (!ticked && claude === null) return t('agree_hint_both');
  if (!ticked) return t('agree_hint_terms');
  if (claude === null) return t('agree_hint_claude');
  return '';
}

export function needsAgreement(s) {
  return !(s?.agreement?.at && s.agreement.version >= AGREEMENT_VERSION && typeof s.agreement.claude === 'boolean');
}

/** The record to store and send. Pure, so a test can hold it. */
export function agreementRecord(claude, now = new Date()) {
  return { at: now.toISOString(), version: AGREEMENT_VERSION, claude: claude === true };
}

export default {
  id: 'agree',
  title: 'Before you start',
  titleKey: 'agree_title',

  render(root, ctx) {
    let ticked = false;
    let claude = null;
    const lang = locale();

    root.innerHTML = `
      <div class="page consent-page agree-page">
        <header class="page-head">
          <h1>${escapeHtml(t('agree_title'))}</h1>
        </header>

        <div class="ilist consent-list">
          <div class="ilist-row consent-row">
            <label class="agree-tick">
              <input type="checkbox" data-agree-tick>
              <span>${escapeHtml(t('agree_terms_line'))}</span>
            </label>
          </div>
          <div class="ilist-row agree-links">
            <a href="${escapeHtml(legalUrl('terms', lang))}" target="_blank" rel="noopener noreferrer" data-agree-terms>${escapeHtml(t('agree_terms_link'))}</a>
            <a href="${escapeHtml(legalUrl('privacy', lang))}" target="_blank" rel="noopener noreferrer" data-agree-privacy>${escapeHtml(t('agree_privacy_link'))}</a>
          </div>
        </div>

        <h2 class="sect-h" id="agree-claude-q">${escapeHtml(t('agree_claude_q'))}</h2>
        <p class="fineprint">${escapeHtml(t('agree_claude_what'))}</p>
        <div class="ilist consent-list" role="radiogroup" aria-labelledby="agree-claude-q">
          <div class="ilist-row consent-row">
            <label class="agree-tick">
              <input type="radio" name="agree-claude" value="yes" data-agree-claude>
              <span>${escapeHtml(t('agree_claude_yes'))}</span>
            </label>
          </div>
          <div class="ilist-row consent-row">
            <label class="agree-tick">
              <input type="radio" name="agree-claude" value="no" data-agree-claude>
              <span>${escapeHtml(t('agree_claude_no'))}</span>
            </label>
          </div>
        </div>
        <p class="fineprint">${escapeHtml(t('agree_change_later'))}</p>

        <div class="page-foot">
          <button type="button" class="cta" data-act="agree-go" disabled>${escapeHtml(t('consent_continue'))}</button>
          <p class="fineprint gate" data-agree-hint role="status">${escapeHtml(agreeHint(false, null))}</p>
        </div>
      </div>`;

    const go = root.querySelector('[data-act="agree-go"]');
    const hint = root.querySelector('[data-agree-hint]');
    const paint = () => {
      go.disabled = !(ticked && claude !== null);
      hint.textContent = agreeHint(ticked, claude);
    };

    on(root, 'change', (e) => {
      if (e.target.matches('[data-agree-tick]')) ticked = e.target.checked;
      if (e.target.matches('[data-agree-claude]')) claude = e.target.value === 'yes';
      paint();
    });
    on(root, 'click', (e) => {
      if (!e.target.closest('[data-act="agree-go"]') || !ticked || claude === null) return;
      const record = agreementRecord(claude);
      store.update({ agreement: record });
      track('agreement', record);
      ctx.replace(firstScreen(store.get()));
    });
  },
};
