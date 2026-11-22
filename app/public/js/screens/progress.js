/**
 * Progress: where the shopper sees their record grow. Aurik, 2026-11-22, with Cal AI's Progress tab as
 * the reference: "show the users they are saving more than the average person. documenting every
 * purchase. the plus is where they can click to open their camera again."
 *
 * What is on it, top to bottom:
 *   1. Two cards: scans this week (with the all-time count), and the total under the typical price on
 *      the scans the shopper marked Bought.
 *   2. That total as a line over time, 30 days / 6 months / everything.
 *   3. One sentence against the typical shopper: what share less (or more) they paid on their buys.
 *   4. Recent scans, each with a Bought switch: that is how a purchase is documented.
 *   5. Ways on: every past scan, and the saved items.
 * The bar below holds Progress, the + that opens the camera, and Settings.
 *
 * The number's rules (honest spread, sure scans only, never the word "saved") are lib/progress.js's.
 * All text is chrome, t('prog_*'), English and French.
 */

import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { t } from '../ui-strings.js';
import { money } from '../lib/money.js';
import { pageBar } from '../lib/pagebar.js';
import { progressStats, countable, RANGES } from '../lib/progress.js';
import { answerOf, answerWord, answerLook } from '../lib/history-answer.js';
import { track } from '../track.js';

const RANGE_KEY = 'pexi.progress.range';

function savedRange() {
  try {
    const r = localStorage.getItem(RANGE_KEY);
    return Object.hasOwn(RANGES, r) ? r : '30d';
  } catch { return '30d'; }
}

/** The name a row shows. */
function nameOf(h) {
  const a = answerOf(h);
  return (a?.label || h?.query?.name || h?.query?.text || '').trim() || t('cam_unlabelled_item');
}

/** The line chart of the running total, drawn from the points and nothing else. */
export function chartSvg(points, currency) {
  if (points.length === 0) return `<p class="prog-empty">${escapeHtml(t('prog_chart_empty'))}</p>`;
  const W = 320;
  const H = 140;
  const pad = 8;
  const t0 = points[0].t;
  const t1 = points.at(-1).t;
  const max = Math.max(...points.map((p) => p.cents), 1);
  const x = (p) => (t1 === t0 ? W / 2 : pad + ((p.t - t0) / (t1 - t0)) * (W - pad * 2));
  const y = (p) => H - pad - (p.cents / max) * (H - pad * 2);
  const pts = points.length === 1 ? [{ ...points[0], t: t0 - 1 }, points[0]] : points;
  const line = pts.map((p) => `${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const area = `${x(pts[0]).toFixed(1)},${H - pad} ${line} ${x(pts.at(-1)).toFixed(1)},${H - pad}`;
  const last = points.at(-1);
  return `<svg class="prog-chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="${escapeHtml(t('prog_chart_label', { amount: money(last.cents, currency) }))}">
      <polygon class="prog-area" points="${area}"/>
      <polyline class="prog-line" points="${line}" fill="none"/>
      <circle class="prog-dot" cx="${x(last).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4.5"/>
    </svg>
    <div class="prog-axis"><span>${escapeHtml(money(0, currency))}</span><span>${escapeHtml(money(max, currency))}</span></div>`;
}

function vsLine(s) {
  if (!s.buys || s.vsTypicalPct === null) return '';
  const pct = Math.abs(s.vsTypicalPct);
  const key = s.vsTypicalPct < 0 ? 'prog_vs_less' : s.vsTypicalPct > 0 ? 'prog_vs_more' : 'prog_vs_even';
  const tone = s.vsTypicalPct < 0 ? 'good' : s.vsTypicalPct > 0 ? 'bad' : 'even';
  return `<p class="prog-vs prog-vs-${tone}">${escapeHtml(t(key, { pct: String(pct) }))}</p>`;
}

function rowHtml(h) {
  const a = countable(h);
  const any = answerOf(h);
  const word = any ? answerWord(any) : '';
  const tier = any ? answerLook(any).tier : 'unknown';
  const line = a
    ? t('prog_row_vs', { paid: money(a.askingCents, a.currency), typical: money(a.centreCents, a.currency) })
    : t('prog_row_noprice');
  const bought = h.bought === true;
  return `<li class="prog-row" data-row="${escapeHtml(h.id)}">
      <div class="prog-row-t">
        <b>${escapeHtml(nameOf(h))}</b>
        <span>${word ? `<em class="prog-tier prog-tier-${escapeHtml(tier)}">${escapeHtml(word)}</em> · ` : ''}${escapeHtml(line)}</span>
      </div>
      ${a ? `<button type="button" class="prog-bought${bought ? ' on' : ''}" data-bought="${escapeHtml(h.id)}" role="switch"
          aria-checked="${bought}" aria-label="${escapeHtml(t('prog_mark_bought', { name: nameOf(h) }))}">${escapeHtml(t('prog_bought'))}</button>` : ''}
    </li>`;
}

export default {
  id: 'progress',
  title: 'Progress',
  titleKey: 'prog_title',

  render(root, ctx) {
    const ac = new AbortController();
    let range = savedRange();

    function paint() {
      const st = store.get();
      const s = progressStats(st.history, { scanCount: st.scanCount });
      const cur = s.currency ?? (store.market()?.currency || null); // money() prints a bare number with none
      const recent = (st.history ?? []).slice(0, 20);
      root.innerHTML = `
      <div class="page page-list prog-page">
        <header class="page-head"><h1>${escapeHtml(t('prog_title'))}</h1></header>

        <div class="prog-cards">
          <section class="prog-card">
            <p class="prog-card-h">${escapeHtml(t('prog_scans_h'))}</p>
            <p class="prog-big">${s.scansWeek}</p>
            <p class="prog-card-sub">${escapeHtml(t('prog_scans_total', { n: String(s.scansTotal) }))}</p>
          </section>
          <section class="prog-card prog-card-under">
            <p class="prog-card-h">${escapeHtml(t('prog_under_h'))}</p>
            <p class="prog-big">${escapeHtml(money(s.underCents, cur))}</p>
            <p class="prog-card-sub">${escapeHtml(t('prog_under_sub', { n: String(s.buys) }))}</p>
          </section>
        </div>

        <section class="prog-panel">
          <div class="prog-panel-top">
            <h2 class="sect-h">${escapeHtml(t('prog_chart_h'))}</h2>
            ${s.buys ? `<span class="prog-pill">${escapeHtml(t('prog_beat', { beat: String(s.beat), n: String(s.buys) }))}</span>` : ''}
          </div>
          ${chartSvg(s.series(range), cur)}
          <div class="seg prog-ranges" role="radiogroup" aria-label="${escapeHtml(t('prog_chart_h'))}">
            ${Object.keys(RANGES).map((r) => `<button type="button" class="btn seg-o${r === range ? ' on' : ''}" role="radio"
                aria-checked="${r === range}" data-range="${r}">${escapeHtml(t(`prog_range_${r}`))}</button>`).join('')}
          </div>
          ${vsLine(s)}
        </section>

        <section class="block">
          <h2 class="sect-h">${escapeHtml(t('prog_recent_h'))}</h2>
          ${recent.length
            ? `<ul class="prog-list ilist">${recent.map(rowHtml).join('')}</ul>`
            : `<p class="prog-empty">${escapeHtml(t('prog_empty'))}</p>`}
          <div class="ilist prog-links">
            <button type="button" class="ilist-row" data-act="pastscans"><span class="ilist-l">${escapeHtml(t('prog_all_scans'))}</span></button>
            <button type="button" class="ilist-row" data-act="watchlist"><span class="ilist-l">${escapeHtml(t('prog_saved_items'))}</span></button>
          </div>
          <p class="fineprint">${escapeHtml(t('prog_fine'))}</p>
        </section>

        ${pageBar('progress')}
      </div>`;
    }

    paint();

    on(root, 'click', (e) => {
      const b = e.target.closest('[data-bought]');
      if (b) {
        const id = b.dataset.bought;
        const now = b.getAttribute('aria-checked') !== 'true';
        store.setBought(id, now);
        track('purchase_mark', { on: now });
        const keep = root.querySelector('.page')?.scrollTop ?? 0;
        paint();
        const page = root.querySelector('.page');
        if (page) page.scrollTop = keep;
        return;
      }
      const r = e.target.closest('[data-range]');
      if (r && root.contains(r)) {
        range = r.dataset.range;
        try { localStorage.setItem(RANGE_KEY, range); } catch { /* private window */ }
        paint();
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'camera') ctx.go('camera');
      else if (act === 'you') ctx.go('you');
      else if (act === 'pastscans') ctx.go('pastscans');
      else if (act === 'watchlist') ctx.go('watchlist');
    }, ac.signal);

    return () => ac.abort();
  },
};
