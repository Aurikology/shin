/**
 * Pexi Plus, the subscription screen (2026-09-21, docs/mvp-plan.md
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
import { shinSay, headingWithFace } from '../shin.js';
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

const numOf = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/**
 * True only when the numbers the screen was handed say the free allowance is
 * gone (D30). The mascot's bubble and the line under it both read this, so
 * neither can say "used" for a visit where nothing was used.
 */
export function limitSpent(params = {}) {
  const limit = numOf(params.limit);
  const used = numOf(params.used);
  const hasLimit = Number.isInteger(limit) && limit > 0;
  return Number.isInteger(used) && hasLimit
    ? used >= limit
    : used === null && (hasLimit || typeof params.resetsAt === 'string');
}

/** The line under the mascot: how many free scans the week had, and when they come back. */
export function limitLine(params = {}) {
  const num = numOf;
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

const PLAN_IDS = Object.freeze(['monthly', 'yearly']);
const usable = (s) => typeof s === 'string' && s.trim() !== '';

/**
 * Reports a fault the way the rest of the client does (track.js: the event
 * queue the server reads, which `window_error` and `unhandled_rejection`
 * already ride), plus the console. RULINGS.md "Errors never go unnoticed": a
 * paywall that cannot draw a price or restore a purchase says so; it never
 * paints a blank or a quiet fallback.
 */
function reportFault(where, err, detail = {}) {
  console.error(`paywall: ${where}`, err, detail);
  try {
    track('paywall_fault', { where, message: err instanceof Error ? err.message : String(err), ...detail });
  } catch (trackErr) {
    console.error('paywall: the fault could not be queued', trackErr);
  }
}

/**
 * One plan row. The billed price is the largest text in it (R-80); the
 * per-month figure sits under the yearly one only, smaller, taken from the
 * store (`perMonthString`), and is left out when the store sent none rather
 * than worked out here.
 */
function planRow(plan, chosen) {
  if (!PLAN_IDS.includes(plan?.id)) throw new Error(`paywall: plan id "${plan?.id}" is not one of ${PLAN_IDS.join(', ')}`);
  if (!usable(plan.priceString)) throw new Error(`paywall: the ${plan.id} plan has no usable store price string (${JSON.stringify(plan.priceString)})`);
  const label = plan.id === 'yearly' ? t('paywall_yearly') : t('paywall_monthly');
  const price = plan.id === 'yearly' ? t('paywall_per_year', { price: plan.priceString }) : t('paywall_per_month', { price: plan.priceString });
  const equiv = plan.id === 'yearly' && usable(plan.perMonthString)
    ? `<span class="pw-equiv" data-pw-equiv>${escapeHtml(t('paywall_equiv', { price: plan.perMonthString }))}</span>`
    : '';
  const on = plan.id === chosen;
  return `<button type="button" class="ilist-row pw-plan${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-plan="${escapeHtml(plan.id)}">
            <span class="ilist-l">${escapeHtml(label)}</span>
            <span class="ilist-v pw-price" data-pw-price>${escapeHtml(price)}</span>
            ${rowCheck()}
            ${equiv}
          </button>`;
}

/** The plan that starts selected: yearly when it is on sale (R-81), else the first. */
export function defaultPlan(plans) {
  return (plans.find((p) => p?.id === 'yearly') ?? plans[0])?.id ?? null;
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
      // The one instruction, once (audit row 38).
      return `<div data-pw-state="web">
          <p class="pw-inapp">${escapeHtml(t('paywall_in_app'))}</p>
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
      const pick = chosen ?? defaultPlan(plans);
      if (!plans.some((p) => p?.id === pick)) throw new Error(`paywall: the chosen plan ${JSON.stringify(pick)} is not on the screen`);
      if (new Set(plans.map((p) => p.id)).size !== plans.length) throw new Error('paywall: the same plan is listed twice');
      // Yearly first: the preselected plan, with monthly right under it on the same screen.
      const shown = [...plans].sort((a, b) => (b?.id === 'yearly') - (a?.id === 'yearly'));
      return `<div data-pw-state="plans">
          <h2 class="sect-h" id="pw-plans-l">${escapeHtml(t('paywall_plans'))}</h2>
          <div class="ilist" role="radiogroup" aria-labelledby="pw-plans-l">
            ${shown.map((p) => planRow(p, pick)).join('')}
          </div>
          <p class="fineprint pw-renews">${escapeHtml(t('paywall_renews'))}</p>
          <button type="button" class="cta" data-act="subscribe">${escapeHtml(t('paywall_subscribe'))}</button>
          ${restore}
          ${note}
        </div>`;
    }
  }
}

/**
 * What the screen says when the week's free scans are spent (R-84): the count
 * in the mono face, what still works, when scans come back. A reset time that
 * is present but unreadable THROWS, because the sentence would otherwise be
 * missing with nobody told; an absent one simply leaves that sentence out.
 */
export function spentLines(params = {}) {
  const limit = numOf(params.limit);
  const used = numOf(params.used);
  const present = params.resetsAt !== undefined && params.resetsAt !== null && params.resetsAt !== '';
  const when = present ? resetDay(params.resetsAt) : null;
  if (present && when === null) throw new Error(`paywall: resetsAt ${JSON.stringify(params.resetsAt)} is not a readable time`);
  const counted = Number.isInteger(limit) && limit > 0 && Number.isInteger(used) && used >= 0;
  const count = counted ? `<p class="pw-count" data-pw-count>${escapeHtml(t('paywall_count', { used: String(Math.min(used, limit)), limit: String(limit) }))}</p>` : '';
  const way = [t('paywall_still_works'), when ? t('paywall_more_scans', { when }) : ''].filter(Boolean).join(' ');
  return `${count}
        <p class="pw-way" data-pw-way>${escapeHtml(way)}</p>
        <p class="pw-buys" data-pw-buys>${escapeHtml(t('paywall_heading'))}</p>`;
}

export default {
  id: 'paywall',
  title: 'Pexi Plus',
  titleKey: 'paywall_title',

  render(root, ctx) {
    const ac = new AbortController();
    const gone = () => ac.signal.aborted;
    const win = ctx.win ?? globalThis.window;
    const params = ctx.params ?? {};
    let plans = [];
    let chosen = null;

    // Built before anything is painted, so an unreadable reset time throws out of render().
    const spent = limitSpent(params);
    const middle = spent
      ? spentLines(params)
      : (() => { const line = limitLine(params); return line ? `<p class="fineprint pw-limit" data-pw-limit>${escapeHtml(line)}</p>` : ''; })();

    root.innerHTML = `
      <div class="page paywall-page" data-paywall>
        <header class="page-head">
          <button type="button" class="pbk pw-close" data-act="close" aria-label="${escapeHtml(t('paywall_close'))}">${CLOSE_ICON}</button>
          ${/* Opened with scans left the mascot sits small beside the heading, saying nothing (audit row 38); spent, it speaks below. */
            spent
              ? `<h1>${escapeHtml(t('paywall_spent_heading'))}</h1>`
              : headingWithFace('idle', `<h1>${escapeHtml(t('paywall_heading'))}</h1>`)}
        </header>
        ${/* Opened with scans left, the heading is the whole offer: the kicker and the
             bubble both said it again (2026-10-10 audit row 38), so neither is drawn;
             the face sits beside the heading instead. Spent, the bubble says when
             the scans come back, which nothing else on the screen says. */
          spent
            ? shinSay('idle', 'paywall_say_spent', { when: params.resetsAt ? resetDay(params.resetsAt) : '' }, { size: 'face-page' })
            : ''}
        ${middle}
        <div class="pw-body" data-pw-body aria-live="polite"></div>
        ${spent ? `<p class="pw-out"><button type="button" class="pw-link" data-act="type-name">${escapeHtml(t('paywall_type_name'))}</button></p>` : ''}
        <p class="pw-legal">
          <a href="${escapeHtml(LEGAL_URLS.terms)}" target="_blank" rel="noopener noreferrer" data-pw-terms>${escapeHtml(t('paywall_terms'))}</a>
          <a href="${escapeHtml(LEGAL_URLS.privacy)}" target="_blank" rel="noopener noreferrer" data-pw-privacy>${escapeHtml(t('paywall_privacy'))}</a>
        </p>
      </div>`;

    const body = root.querySelector('[data-pw-body]');
    const paint = (state, extra = {}) => {
      if (gone()) return;
      try {
        body.innerHTML = paywallBody(state, { plans, chosen, ...extra });
      } catch (err) {
        // A state that cannot be drawn truthfully (bad price, bad plan id) is
        // reported and replaced by the failed state, never left blank.
        reportFault('paint', err, { state });
        body.innerHTML = paywallBody('failed', { message: t('paywall_failed') });
      }
    };

    async function load() {
      if (!purchases.purchasesPlugin(win)) { paint('web'); return; }
      paint('loading');
      try {
        const out = await purchases.loadPlans(win);
        if (gone()) return;
        if (!out.store) { paint('web'); return; }
        plans = out.plans;
        chosen = defaultPlan(plans);
        for (const s of out.skipped ?? []) reportFault('plan_skipped', new Error(`the ${s.id} plan was left off the screen: ${s.reason}`), { plan: s.id });
        paint(plans.length ? 'plans' : 'none');
      } catch (err) {
        reportFault('load_plans', err);
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
      if (!plan) {
        reportFault('subscribe', new Error(`Subscribe was tapped with no plan selected (chosen ${JSON.stringify(chosen)})`));
        paint('plans', { message: t('paywall_buy_failed') });
        return;
      }
      track('paywall_buy', { plan: plan.id, outcome: 'tapped' });
      paint('working');
      try {
        const out = await purchases.subscribe(plan.pkg, win);
        if (gone()) return;
        if (out.plus) { track('paywall_buy', { plan: plan.id, outcome: 'done' }); paint('done'); return; }
        track('paywall_buy', { plan: plan.id, outcome: out.cancelled ? 'cancelled' : 'failed' });
        paint('plans', { message: out.cancelled ? '' : t('paywall_buy_failed') });
      } catch (err) {
        reportFault('subscribe', err, { plan: plan.id });
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
      } catch (err) {
        reportFault('restore', err);
        track('paywall_restore', { outcome: 'failed' });
        paint(back, { message: t('paywall_restore_failed') });
      }
    }

    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="close"]')) { goBack(ctx, 'camera'); return; }
      const plan = e.target.closest('[data-plan]');
      if (plan) {
        const id = plan.dataset.plan;
        if (!plans.some((p) => p.id === id)) {
          reportFault('select_plan', new Error(`a tap named plan ${JSON.stringify(id)}, which is not on the screen`));
          return;
        }
        chosen = id;
        paint('plans');
        return;
      }
      if (e.target.closest('[data-act="type-name"]')) { ctx.go('camera', { open: 'type-name' }); return; }
      if (e.target.closest('[data-act="subscribe"]')) { void buy(); return; }
      if (e.target.closest('[data-act="restore"]')) { void restore(); return; }
      if (e.target.closest('[data-act="retry"]')) void load();
    }, ac.signal);

    void load();
    return () => ac.abort();
  },
};
