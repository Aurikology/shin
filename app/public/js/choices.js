/**
 * The shopper's two optional choices, kept apart from the screens so Settings and the first screen read and
 * write the same answer without one screen importing the other (screens/agree.js pulls in the event queue,
 * which a bare test harness has no browser for).
 *
 * Legal review 2026-11-26, A G1 to G3 (Apple 5.1.1(ii) and 5.1.2(i), Quebec P-39.1 s.14):
 *   - `improve`: "Help improve Pexi", usage recording beyond what answering a scan needs. Off until turned on.
 *   - `aiText`: whether typed words may go to Anthropic's Claude. Asked once, by the notice below; "Not now"
 *     still answers from Pexi's own data.
 * Each answer is kept on the phone (what the screens read) and posted to the server with its time (what
 * enforces it: server.ts and src/consent.ts). A post that did not land is retried on a later launch.
 */
import * as store from './store.js';
import { escapeHtml } from './lib/dom.js';
import { t } from './ui-strings.js';
import { getDeviceId } from './device.js';
import { postConsent as sendConsent, setTextNotice } from './api.js';

/** True when the shopper has "Help improve Pexi" on. Off for anyone who never turned it on. */
export function improveOn(s = store.get()) {
  return s?.agreement?.improve === true;
}

/** The shopper's answer to the typed-words notice: 'yes', 'no' (Not now), or null when never asked. */
export function aiTextAnswer(s = store.get()) {
  const v = s?.agreement?.aiText;
  return v === 'yes' || v === 'no' ? v : null;
}

/**
 * Records one or both optional choices: locally at once, then on the server with the time. `patch` is
 * `{ improve?: boolean, aiText?: boolean }`. Resolves to whether the server stored it; a miss is retried on
 * the next launch by `syncChoices`. Never throws.
 */
export async function setChoice(api, patch) {
  try {
    const at = new Date().toISOString();
    const a = { ...(store.get().agreement ?? {}) };
    if (typeof patch.improve === 'boolean') { a.improve = patch.improve; a.usage = patch.improve; }
    if (typeof patch.aiText === 'boolean') a.aiText = patch.aiText ? 'yes' : 'no';
    a.choicesAt = at;
    delete a.choicesServerAt;
    store.update({ agreement: a });
    return await syncChoices(api);
  } catch {
    return false;
  }
}

/** Sends the choices on file to the server when it has not yet stored them. Never throws. */
export async function syncChoices(api = { postConsent: sendConsent }) {
  try {
    const a = store.get().agreement;
    if (!a?.choicesAt || a.choicesServerAt === a.choicesAt) return true;
    const device = getDeviceId();
    if (!device?.id || !api?.postConsent) return false;
    const body = { deviceId: device.id };
    if (typeof a.improve === 'boolean') body.improve = a.improve;
    if (a.aiText === 'yes' || a.aiText === 'no') body.aiText = a.aiText === 'yes';
    const res = await api.postConsent(body);
    if (res?.stored !== true) return false;
    const now = store.get().agreement;
    if (now?.choicesAt === a.choicesAt) store.update({ agreement: { ...now, choicesServerAt: a.choicesAt } });
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- typed words to Claude */

let noticeOpen = null;

/**
 * The one-time notice before a shopper's typed words first go to Anthropic's Claude (Apple 5.1.2(i)). Plain
 * words, two equal choices. Resolves once the shopper has answered and the answer has gone to the server;
 * resolves at once when there is already an answer, and where there is no page to show it on. The camera's
 * typed-search path waits on this through api.js `setTextNotice`, so no typed word leaves the phone first.
 */
export async function askAiText(api = { postConsent: sendConsent }) {
  if (aiTextAnswer() !== null) return aiTextAnswer();
  const host = typeof document === 'undefined' ? null : document.querySelector('#screen');
  if (!host) return null; // no page to show it on (the badge watches #screen, so the notice mounts there)
  if (noticeOpen) return noticeOpen;
  noticeOpen = new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'pmodal ai-notice';
    wrap.dataset.pmodal = 'ai-notice';
    wrap.innerHTML = `
      <div class="pmodal-card" role="dialog" aria-modal="true" aria-labelledby="ai-notice-h" tabindex="-1">
        <h2 id="ai-notice-h">${escapeHtml(t('ai_notice_title'))}</h2>
        <p class="said">${escapeHtml(t('ai_notice_body'))}</p>
        <button type="button" class="cta" data-ai="yes">${escapeHtml(t('ai_notice_allow'))}</button>
        <button type="button" class="btn btn--ghost" data-ai="no">${escapeHtml(t('ai_notice_not_now'))}</button>
        <p class="pmodal-meta">${escapeHtml(t('ai_notice_foot'))}</p>
      </div>`;
    const page = document.querySelector('#screen .page');
    if (page) page.inert = true;
    host.appendChild(wrap);
    wrap.querySelector('[data-ai="yes"]')?.focus?.({ preventScroll: true });
    /* A screen that repaints itself wipes the notice with it. Never leave a search waiting on a notice that is
       gone: it ends unanswered (the server reads that as no, so Pexi's own data answers) and is asked again. */
    const watch = setInterval(() => {
      if (wrap.isConnected) return;
      clearInterval(watch);
      noticeOpen = null;
      resolve(null);
    }, 250);
    wrap.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-ai]')?.dataset.ai;
      if (!pick) return;
      clearInterval(watch);
      wrap.remove();
      if (page) page.inert = false;
      await setChoice(api, { aiText: pick === 'yes' });
      noticeOpen = null;
      resolve(aiTextAnswer());
    });
  });
  return noticeOpen;
}

setTextNotice(() => askAiText());
