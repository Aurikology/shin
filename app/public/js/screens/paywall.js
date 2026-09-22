/**
 * Shin Plus, the subscription screen (2026-09-21, docs/mvp-plan.md
 * "Subscription").
 *
 * Opened by the camera when `/api/identify` answers 402 `scan_limit` (the
 * scan after the weekly free ones), with `{ limit, used, resetsAt }` as its
 * params. Also reachable as `?s=paywall` for a check by hand.
 *
 * WHAT IS ON IT, and why each thing is: the mascot (his call, the mascot stays
 * everywhere); what Plus gives, in one line; the two plans with the store's own
 * price strings; Subscribe; Restore purchases; Terms and Privacy; a close
 * button. Apple rejects a subscription screen without restore and those links.
 *
 * NO PRICE IS WRITTEN HERE. Each plan's price is `priceString` from the
 * RevenueCat offering, read when the screen opens (purchases.js `loadPlans`).
 *
 * HARD RULE 2: no savings claim of any kind. Nothing here says what Plus pays
 * back, what a scan is worth, or how much anybody saves. HARD RULE 3: the
 * limit is stated as a fact about the week; nothing is aimed at the person.
 *
 * IN A PLAIN BROWSER there is nothing to buy with: the screen says "Subscribe
 * in the app" and offers no button that could only fail.
 *
 * NO MOTION. It is not seen every scan, but nothing here needs to move to be
 * understood, so nothing does.
 */

import { escapeHtml, on } from '../lib/dom.js';
import { shinSay } from '../shin.js';
import { t } from '../ui-strings.js';
import { localeTag } from '../lib/locale.js';
import { goBack, rowCheck } from '../lib/pagebar.js';
import { LEGAL_URLS } from '../plus-config.js';
import * as purchases from '../purchases.js';

const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** "Monday, September 28", in the language in force, or null for a time nobody can read. */
export function resetDay(iso, tag = localeTag()) {
  if (typeof iso !== 'string') return null;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  try {
    return at.toLocaleDateString(tag, { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return null;
  }
}

/** The line under the mascot: how many free scans the week had, and when they come back. */
export function limitLine(params = {}) {
  const limit = Number(params.limit);
  const head = Number.isInteger(limit) && limit > 0 ? t('paywall_limit', { limit: String(limit) }) : t('paywall_limit_bare');
  const when = resetDay(params.resetsAt);
  return when ? `${head} ${t('paywall_resets', { when })}` : head;
}

function planRow(plan, chosen) {
  const label = plan.id === 'yearly' ? t('paywall_yearly') : t('paywall_monthly');
  const price = plan.id === 'yearly' ? t('paywall_per_year', { price: plan.priceString }) : t('paywall_per_month', { price: plan.priceString });
  const on = plan.id === chosen;
  return `<button type="button" class="ilist-row pw-plan${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-plan="${escapeHtml(plan.id)}">
            <span class="ilist-l">${escapeHtml(label)}</span>
            <span class="ilist-v" data-pw-price>${escapeHtml(price)}</span>
            ${rowCheck()}
          </button>`;
}

/**
 * The body of the screen for one state. Pure, so a test can render each one.
 *
 *   loading | web | failed | none | plans | working | done
 *
 * `restore` is offered wherever a store exists, including when the plans did
 * not load: somebody who already paid must never be stuck behind a list that
 * failed to arrive.
 */
export function paywallBody(state, { plans = [], chosen = null, message = '' } = {}) {
  const restore = `<button type="button" class="btn--ghost pw-restore" data-act="restore">${escapeHtml(t('paywall_restore'))}</button>`;
  const note = message ? `<p class="fineprint pw-msg" role="status" data-pw-msg>${escapeHtml(message)}</p>` : '';
  switch (state) {
    case 'loading':
      return `<p class="fineprint" role="status" aria-busy="true" data-pw-state="loading">${escapeHtml(t('paywall_loading'))}</p>`;
    case 'web':
      return `<div data-pw-state="web">
          <p class="pw-inapp">${escapeHtml(t('paywall_in_app'))}</p>
          <p class="fineprint">${escapeHtml(t('paywall_in_app_detail'))}</p>
        </div>`;
    case 'failed':
    case 'none':
      return `<div data-pw-state="${state}">
          <p class="fineprint" role="status">${escapeHtml(t(state === 'failed' ? 'paywall_failed' : 'paywall_none'))}</p>
          <button type="button" class="cta" data-act="retry">${escapeHtml(t('try_again'))}</button>
          ${restore}
          ${note}
        </div>`;
    case 'working':
      return `<p class="fineprint" role="status" aria-busy="true" data-pw-state="working">${escapeHtml(t('paywall_working'))}</p>`;
    case 'done':
      return `<div data-pw-state="done">
          <p class="pw-inapp" role="status">${escapeHtml(t('paywall_done'))}</p>
          <button type="button" class="cta" data-act="close">${escapeHtml(t('paywall_close'))}</button>
        </div>`;
    default: {
      const pick = chosen ?? plans[0]?.id ?? null;
      return `<div data-pw-state="plans">
          <h2 class="sect-h" id="pw-plans-l">${escapeHtml(t('paywall_plans'))}</h2>
          <div class="ilist" role="radiogroup" aria-labelledby="pw-plans-l">
            ${plans.map((p) => planRow(p, pick)).join('')}
          </div>
          <p class="fineprint pw-renews">${escapeHtml(t('paywall_renews'))}</p>
          <button type="button" class="cta" data-act="subscribe">${escapeHtml(t('paywall_subscribe'))}</button>
          ${restore}
          ${note}
        </div>`;
    }
  }
}

export default {
  id: 'paywall',
  title: 'Shin Plus',
  titleKey: 'paywall_title',

  render(root, ctx) {
    const ac = new AbortController();
    const gone = () => ac.signal.aborted;
    const win = ctx.win ?? globalThis.window;
    let plans = [];
    let chosen = null;

    root.innerHTML = `
      <div class="page paywall-page" data-paywall>
        <header class="page-head">
          <button type="button" class="pbk pw-close" data-act="close" aria-label="${escapeHtml(t('paywall_close'))}">${CLOSE_ICON}</button>
          <p class="kicker">${escapeHtml(t('paywall_title'))}</p>
          <h1>${escapeHtml(t('paywall_heading'))}</h1>
        </header>
        ${shinSay('idle', 'paywall_say', {}, { size: 'face-page' })}
        <p class="fineprint pw-limit" data-pw-limit>${escapeHtml(limitLine(ctx.params ?? {}))}</p>
        <div class="pw-body" data-pw-body aria-live="polite"></div>
        <p class="pw-legal">
          <a href="${escapeHtml(LEGAL_URLS.terms)}" target="_blank" rel="noopener noreferrer" data-pw-terms>${escapeHtml(t('paywall_terms'))}</a>
          <a href="${escapeHtml(LEGAL_URLS.privacy)}" target="_blank" rel="noopener noreferrer" data-pw-privacy>${escapeHtml(t('paywall_privacy'))}</a>
        </p>
      </div>`;

    const body = root.querySelector('[data-pw-body]');
    const paint = (state, extra = {}) => {
      if (gone()) return;
      body.innerHTML = paywallBody(state, { plans, chosen, ...extra });
    };

    async function load() {
      if (!purchases.purchasesPlugin(win)) { paint('web'); return; }
      paint('loading');
      try {
        const out = await purchases.loadPlans(win);
        if (gone()) return;
        if (!out.store) { paint('web'); return; }
        plans = out.plans;
        chosen = plans[0]?.id ?? null;
        paint(plans.length ? 'plans' : 'none');
      } catch {
        paint('failed');
      }
    }

    async function buy() {
      const plan = plans.find((p) => p.id === chosen);
      if (!plan) return;
      paint('working');
      try {
        const out = await purchases.subscribe(plan.pkg, win);
        if (gone()) return;
        if (out.plus) { paint('done'); return; }
        paint('plans', { message: out.cancelled ? '' : t('paywall_buy_failed') });
      } catch {
        paint('plans', { message: t('paywall_buy_failed') });
      }
    }

    async function restore() {
      const back = plans.length ? 'plans' : 'none';
      paint('working');
      try {
        const out = await purchases.restore(win);
        if (gone()) return;
        if (out.plus) { paint('done'); return; }
        paint(back, { message: t('paywall_restore_none') });
      } catch {
        paint(back, { message: t('paywall_failed') });
      }
    }

    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="close"]')) { goBack(ctx, 'camera'); return; }
      const plan = e.target.closest('[data-plan]');
      if (plan) {
        chosen = plan.dataset.plan;
        paint('plans');
        return;
      }
      if (e.target.closest('[data-act="subscribe"]')) { void buy(); return; }
      if (e.target.closest('[data-act="restore"]')) { void restore(); return; }
      if (e.target.closest('[data-act="retry"]')) void load();
    }, ac.signal);

    void load();
    return () => ac.abort();
  },
};
