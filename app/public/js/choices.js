/**
 * The shopper's two optional choices, kept apart from the screens so Settings and the first screen read and
 * write the same answer without one screen importing the other (screens/agree.js pulls in the event queue,
 * which a bare test harness has no browser for).
 *
 * Legal review 2026-11-26, A G1 to G3 (Apple 5.1.1(ii) and 5.1.2(i), Quebec P-39.1 s.14):
 *   - `improve`: "Help improve Pexi", usage recording beyond what answering a scan needs. Ticked on the first
 *     screen, switched off any time in Settings.
 *   - `aiText`: whether typed words may go to Anthropic's Claude. Yes when the shopper accepts (the line above
 *     the Accept button says so), switched off any time in Settings; off still answers from Pexi's own data.
 * Each answer is kept on the phone (what the screens read) and posted to the server with its time (what
 * enforces it: server.ts and src/consent.ts). A post that did not land is retried on a later launch.
 */
import * as store from './store.js';
import { getDeviceId } from './device.js';
import { postConsent as sendConsent } from './api.js';

/** True when the shopper has "Help improve Pexi" on. Off for anyone who never turned it on. */
export function improveOn(s = store.get()) {
  return s?.agreement?.improve === true;
}

/** The shopper's answer on typed searches going to Claude: 'yes', 'no' (switched off), or null when never answered. */
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
    if (typeof patch.improve === 'boolean') { a.improve = patch.improve; a.usage = patch.improve; a.improveAt = at; }
    if (typeof patch.aiText === 'boolean') { a.aiText = patch.aiText ? 'yes' : 'no'; a.aiTextAt = at; }
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
