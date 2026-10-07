/**
 * Savings Overview: his welcome screen 32, "PEXI Savings Overview showing: Total
 * Saved, Monthly Goal Progress, and Recently Scanned Item". Reached from the You
 * screen.
 *
 * DATA-DRIVEN, AND NOTHING INVENTED (CLAUDE.md hard rule 2: no savings claim until
 * it has been measured). His mock shows "$150" and a "Great Deal!" tag; neither is
 * drawn here as a fixed thing.
 *
 *   Recently Scanned  the user's own history (store.js `history`), newest first:
 *                     the name, the price they were asked, when. No verdict word:
 *                     the row states what was scanned, and the verdict sheet is
 *                     where a verdict lives.
 *   Total Saved       shown only when `realFigure('total_saved')` returns a
 *                     measured figure (onboarding-flow.js). None exists today, so
 *                     it stays hidden, by the same mechanism as the welcome
 *                     screens built from figures.
 *   Monthly Goal      shown only when `realFigure('goal_progress')` is measured
 *                     and the user set a monthly goal on the welcome screen.
 *
 * `savingsView` is pure so test/savings.test.mjs can run it in Node.
 */

import { money } from '../lib/money.js';
import * as store from '../store.js';
import { escapeHtml, ago, on } from '../lib/dom.js';
import { pageBar, backButton, goBack } from '../lib/pagebar.js';
import { t } from '../ui-strings.js';
import { realFigure, MONTHLY } from '../onboarding-flow.js';

const RECENT = 5;

function labelOf(h) {
  const v = h?.result?.kind === 'verdict' ? h.result.identity?.label : h?.result?.identity?.label;
  return v || h?.query?.text || t('past_scans_unknown_item');
}

function priceOf(h) {
  const c = h?.result?.kind === 'verdict' ? h.result.askingCents : h?.query?.askingCents;
  return typeof c === 'number' && c > 0 ? c : null;
}

/**
 * What the screen shows, from the state and the published figures. `totalSaved`
 * and `goal` are null unless a measured figure backs them.
 */
export function savingsView(state, figures) {
  const recent = (Array.isArray(state?.history) ? state.history : [])
    .filter((h) => h && typeof h === 'object')
    .slice(0, RECENT)
    .map((h) => ({ id: h.id, label: labelOf(h), cents: priceOf(h), at: h.at }));
  const total = realFigure('total_saved', figures);
  const prog = realFigure('goal_progress', figures);
  const asked = Number(state?.onboarding?.answers?.monthlyGoal);
  const target = Number.isFinite(asked) && asked > 0 ? asked : MONTHLY.start;
  const goal = prog
    ? { saved: prog.saved, target, pct: Math.max(0, Math.min(100, Math.round((prog.saved / target) * 100))) }
    : null;
  /* N06: stored data that could not be read is a fault, never "Nothing scanned yet". */
  return { recent, totalSaved: total ? total.saved : null, goal, fault: Boolean(state?.__fault) };
}

/** The screen's body as HTML, for a test and for `render`. */
export function savingsHtml(view) {
  const totals = [];
  if (view.totalSaved !== null) {
    totals.push(`<div class="ilist-row"><span class="ilist-l">${escapeHtml(t('savings_total'))}</span>
      <span class="ilist-v" data-savings="total">${escapeHtml(t('savings_amt', { n: String(view.totalSaved) }))}</span></div>`);
  }
  if (view.goal) {
    totals.push(`<div class="ilist-row"><span class="ilist-l">${escapeHtml(t('savings_goal'))}</span>
      <span class="ilist-v" data-savings="goal">${escapeHtml(t('savings_goal_of', { saved: String(view.goal.saved), target: String(view.goal.target) }))}</span></div>
      <div class="onb-bar onb-bar-wide" role="progressbar" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${view.goal.pct}" aria-label="${escapeHtml(t('savings_goal'))}"><i style="transform:scaleX(${view.goal.pct / 100})"></i></div>`);
  }
  const top = totals.length
    ? `<section class="block"><div class="ilist">${totals.join('')}</div></section>`
    : `<p class="fineprint" data-savings="pending">${escapeHtml(t('savings_pending'))}</p>`;
  const recent = view.fault
    ? `<div class="list-state" data-savings="fault">
        <p class="fineprint">${escapeHtml(t('savings_unreadable'))}</p>
        <button type="button" class="linky" data-act="retry">${escapeHtml(t('try_again'))}</button>
      </div>`
    : view.recent.length
      ? `<div class="ilist">${view.recent.map((r) => `
        <div class="ilist-row" data-savings-row>
          <span class="ilist-l">${escapeHtml(r.label)}<br><small>${escapeHtml(ago(r.at) ?? '')}</small></span>
          <span class="ilist-v">${escapeHtml(r.cents === null ? t('past_scans_no_price') : money(r.cents))}</span>
        </div>`).join('')}</div>`
      : `<p class="fineprint" data-savings="empty">${escapeHtml(t('savings_recent_empty'))}</p>`;
  return `${top}
    <section class="block">
      <h2 class="sect-h">${escapeHtml(t('savings_recent'))}</h2>
      ${recent}
    </section>`;
}

export default {
  id: 'savings',
  title: 'Savings Overview',
  titleKey: 'savings_title',

  render(root, ctx) {
    const ac = new AbortController();
    const paint = () => {
      root.innerHTML = `
        <div class="page page-list" data-savings-screen>
          <header class="page-head">
            ${backButton()}
            <h1>${escapeHtml(t('savings_title'))}</h1>
          </header>
          ${savingsHtml(savingsView({ ...store.get(), __fault: Boolean(store.loadFault()) }, undefined))}
          ${pageBar('you')}
        </div>`;
    };
    paint();
    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="retry"]')) { store.reload(); paint(); return; }
      if (e.target.closest('[data-act="back"]')) { goBack(ctx, 'you'); return; }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="watchlist"]')) { ctx.go('watchlist'); return; }
      if (e.target.closest('[data-act="you"]')) { ctx.go('you'); return; }
    }, ac.signal);
    const unsub = store.subscribe(() => paint());
    return () => { unsub(); ac.abort(); };
  },
};
