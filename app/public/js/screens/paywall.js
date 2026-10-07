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
import { track } from '../track.js';

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
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const limit = num(params.limit);
  const used = num(params.used);
  const hasLimit = Number.isInteger(limit) && limit > 0;
  /*
   * D30 (2026-10-06): the line said "the free scans for this week are used" on
   * every arrival, including `?s=paywall` opened by hand and a visit where none
   * had been used. It now says so only when the server's own numbers say the
   * allowance is gone (used has reached the limit), or when the camera sent the
   * limit and reset without a count, which only a refused scan does. With the
   * count showing scans left it says how many are left; with nothing at all
   * (no limit, no reset time) it says nothing.
   */
  const spent = Number.isInteger(used) && hasLimit
    ? used >= limit
    : used === null && (hasLimit || typeof params.resetsAt === 'string');
  if (!spent) {
    if (hasLimit && Number.isInteger(used) && used >= 0) {
      return t('you_scans_left', { remaining: String(limit - used), limit: String(limit) });
    }
    return '';
  }
  const head = hasLimit ? t('paywall_limit', { limit: String(limit) }) : t('paywall_limit_bare');
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
        ${(() => { const line = limitLine(ctx.params ?? {}); return line ? `<p class="fineprint pw-limit" data-pw-limit>${escapeHtml(line)}</p>` : ''; })()}
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

    /*
     * The Buy tap and its outcome, tracked so a two-week readout can count
     * "would pay": a tap that never resolves into a subscription is still a
     * fact about intent, not nothing. `plan` is the plan id chosen at the
     * moment of the tap, so a plan switched after a failed attempt does not
     * get credited with the earlier tap.
     */
    async function buy() {
      const plan = plans.find((p) => p.id === chosen);
      if (!plan) return;
      track('paywall_buy', { plan: plan.id, outcome: 'tapped' });
      paint('working');
      try {
        const out = await purchases.subscribe(plan.pkg, win);
        if (gone()) return;
        if (out.plus) { track('paywall_buy', { plan: plan.id, outcome: 'done' }); paint('done'); return; }
        track('paywall_buy', { plan: plan.id, outcome: out.cancelled ? 'cancelled' : 'failed' });
        paint('plans', { message: out.cancelled ? '' : t('paywall_buy_failed') });
      } catch {
        track('paywall_buy', { plan: plan.id, outcome: 'failed' });
        paint('plans', { message: t('paywall_buy_failed') });
      }
    }

    async function restore() {
      const back = plans.length ? 'plans' : 'none';
      track('paywall_restore', { outcome: 'tapped' });
      paint('working');
      try {
        const out = await purchases.restore(win);
        if (gone()) return;
        if (out.plus) { track('paywall_restore', { outcome: 'done' }); paint('done'); return; }
        track('paywall_restore', { outcome: 'failed' });
        paint(back, { message: t('paywall_restore_none') });
      } catch {
        track('paywall_restore', { outcome: 'failed' });
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
