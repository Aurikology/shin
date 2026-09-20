/**
 * Onboarding: Jamin's Welcome screen tab, drawn in Shin's own look.
 *
 * ONE ROUTE, MANY STEPS. The screen id is `onboarding` and the step rides in
 * `?step=`, so the router, the title and the scroll rules treat it as one
 * screen while the order, the visibility rules and the save path live in
 * onboarding-flow.js (no DOM there, so a test can hold them). This file only
 * draws what the flow says and calls what the flow saves.
 *
 * ALL TEXT COMES FROM ui-strings.js (`t('onb_...')`). Every line on these
 * screens is Jamin's own text and none of it is Shin speaking, so it is chrome:
 * no attitude variants, and test/screens-voice.test.mjs holds this file to that.
 *
 * NOTHING HERE BLOCKS THE APP. Every step is left with Continue whether or not
 * anything was chosen, "Skip the rest" is on every step, and the paywall steps
 * record an interest and move on: nothing here grants Pro, checks Pro or waits
 * on a payment, because there is no billing to wait on.
 *
 * EVERY ANSWER IS SAVED THE MOMENT IT IS GIVEN, through the store and the
 * events queue (onboarding-flow.js recordAnswer), not on Continue, so a person
 * who answers and leaves has still answered.
 */

import { faceSvg } from '../shin.js';
import * as store from '../store.js';
import { track } from '../track.js';
import { toggleConsent } from '../consent-actions.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { t, localeTag } from '../ui-strings.js';
import {
  THRESHOLD, MONTHLY, realFigure, stepById, visibleSteps, nextStepId, prevStepId,
  positionOf, recordAnswer, applyThreshold, applyMode, applyAlertStyle, finish, firstScreen, isReplay, endReplay,
} from '../onboarding-flow.js';
import { say } from '../voice.js';

const DEPS = { store, track };

/** The tick marks on the checklist steps: drawn, so they are not a font glyph. */
const TICK = '<svg class="onb-tick" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
  + '<path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" '
  + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

function answersNow() {
  return store.get().onboarding?.answers ?? {};
}

/** One option button. `sub` is the small line under the label, when it has one. */
function optionHtml(step, opt, chosen) {
  const role = step.multi ? 'checkbox' : 'radio';
  const sub = t(`onb_${step.id}_${opt}_sub`);
  const hasSub = !sub.startsWith('onb_');
  return `
    <button type="button" class="onb-opt${chosen ? ' on' : ''}" role="${role}"
            aria-checked="${chosen}" data-opt="${escapeHtml(opt)}">
      <span class="onb-opt-text">
        <b>${escapeHtml(t(`onb_${step.id}_${opt}`))}</b>
        ${hasSub && sub ? `<small>${escapeHtml(sub)}</small>` : ''}
      </span>
      ${TICK}
    </button>`;
}

/** Every choice step's text keys are named for its id: onb_<id>_q and onb_<id>_<option>. */
function questionKey(step) {
  return `onb_${step.id}_q`;
}

function choiceBody(step, answers) {
  const value = answers[step.key];
  const chosen = (opt) => (step.multi ? Array.isArray(value) && value.includes(opt) : value === opt);
  const heading = `<h1 id="onb-q">${escapeHtml(t(questionKey(step)))}</h1>`;
  const hint = step.multi ? `<p class="onb-hint">${escapeHtml(t('onb_multi_hint'))}</p>` : '';
  const optsHtml = step.options.map((o) => optionHtml(step, o, chosen(o))).join('');
  const group = step.multi
    ? `<div class="onb-opts" role="group" aria-labelledby="onb-q">${optsHtml}</div>`
    : `<div class="onb-opts" role="radiogroup" aria-labelledby="onb-q">${optsHtml}</div>`;
  return `${heading}${hint}${group}`;
}

function face(state, size) {
  return `<div class="onb-face" aria-hidden="true">${faceSvg(state, { size })}</div>`;
}

function listBody(step) {
  const items = [];
  for (let i = 1; i <= step.items; i += 1) {
    items.push(`<li>${TICK}<span>${escapeHtml(t(`onb_${step.id}_${i}`))}</span></li>`);
  }
  return `<h1>${escapeHtml(t(`onb_${step.id}_title`))}</h1><ul class="onb-list">${items.join('')}</ul>`;
}

function trendBody(fig) {
  // Two lines over the same months, drawn from the measured points and nothing else.
  const pts = fig.points;
  const max = Math.max(...pts.flatMap((p) => [p.without, p.with]), 1);
  const x = (i) => 10 + (i * 280) / Math.max(pts.length - 1, 1);
  const y = (v) => 110 - (v / max) * 100;
  const line = (k) => pts.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  return `
    <h1>${escapeHtml(t('onb_trend_title'))}</h1>
    <svg class="onb-chart" viewBox="0 0 300 120" role="img" aria-label="${escapeHtml(t('onb_trend_months'))}">
      <polyline class="onb-line-without" points="${line('without')}" fill="none" stroke-width="3"/>
      <polyline class="onb-line-with" points="${line('with')}" fill="none" stroke-width="3"/>
    </svg>
    <p class="onb-key"><span class="onb-dot onb-dot-without"></span>${escapeHtml(t('onb_trend_without'))}</p>
    <p class="onb-key"><span class="onb-dot onb-dot-with"></span>${escapeHtml(t('onb_trend_with'))}</p>
    <p class="fineprint">${escapeHtml(t('onb_trend_months'))}</p>`;
}

function potentialBody(fig) {
  const rows = fig.points.map((p) => `
    <li><b>${escapeHtml(t('onb_potential_days', { n: String(p.days) }))}</b>
        <span>${escapeHtml(t('onb_potential_saved', { n: String(p.saved) }))}</span></li>`).join('');
  return `<h1>${escapeHtml(t('onb_potential_title'))}</h1><ul class="onb-rows">${rows}</ul>`;
}

/** Each line is its own slot: the count, the rating and the reviews show separately. */
function socialBody() {
  const shoppers = realFigure('shoppers');
  const rating = realFigure('rating');
  const reviews = realFigure('reviews');
  const n = shoppers.value.toLocaleString(localeTag());
  const ratingHtml = rating
    ? `<p class="onb-rating">${escapeHtml(t('onb_social_rating', { v: String(rating.value) }))}</p>` : '';
  const reviewsHtml = reviews
    ? `<ul class="onb-reviews">${reviews.items.map((r) => `<li><q>${escapeHtml(r.text)}</q></li>`).join('')}</ul>` : '';
  return `<h1>${escapeHtml(t('onb_social_title', { n }))}</h1>${ratingHtml}${reviewsHtml}`;
}

function progressBody(fig, answers) {
  const target = Number(answers.monthlyGoal) || MONTHLY.start;
  const pct = Math.max(0, Math.min(100, Math.round((fig.saved / target) * 100)));
  return `
    <h1>${escapeHtml(t('onb_progress_title', { n: String(target) }))}</h1>
    <div class="onb-bar onb-bar-wide" role="progressbar" aria-valuemin="0" aria-valuemax="100"
         aria-valuenow="${pct}"><i style="transform:scaleX(${pct / 100})"></i></div>
    <p class="fineprint">${escapeHtml(t('onb_progress_saved', { n: String(fig.saved) }))}</p>`;
}

function figureBody(step, answers) {
  const need = step.needs[0];
  const fig = realFigure(need);
  if (!fig) return '';
  if (need === 'savings_trend') return trendBody(fig);
  if (need === 'savings_timeline') return potentialBody(fig);
  if (need === 'shoppers') return socialBody();
  if (need === 'goal_progress') return progressBody(fig, answers);
  return '';
}

function thresholdBody(answers, replay) {
  const mode = answers.dealThresholdMode === 'amount' ? 'amount' : 'percent';
  const cfg = THRESHOLD[mode];
  // On a replay the slider starts where the person's own line already is (the
  // live setting the price line reads), so walking through changes nothing.
  const line = mode === 'percent' ? store.get().lineUnderPct : store.get().lineAmounts?.good;
  const saved = replay && Number.isFinite(line)
    ? Number(line) : Number(answers.dealThreshold);
  const start = Number.isFinite(saved) && saved >= cfg.min && saved <= cfg.max
    ? saved : (mode === 'percent' ? cfg.recommended : cfg.start);
  return `
    <h1 id="onb-q">${escapeHtml(t('onb_threshold_q'))}</h1>
    <p class="onb-big" data-out="threshold" aria-live="polite">${thresholdLabel(mode, start)}</p>
    <input class="onb-range" type="range" data-range="threshold" min="${cfg.min}" max="${cfg.max}"
           step="${cfg.step}" value="${start}" aria-label="${escapeHtml(t('onb_threshold_label'))}">`;
}

function thresholdLabel(mode, value) {
  const base = escapeHtml(t(mode === 'percent' ? 'onb_threshold_pct' : 'onb_threshold_amt', { n: String(value) }));
  const rec = mode === 'percent' && value === THRESHOLD.percent.recommended
    ? ` <small>${escapeHtml(t('onb_recommended'))}</small>` : '';
  return base + rec;
}

function monthlyBody(answers) {
  const saved = Number(answers.monthlyGoal);
  const value = Number.isFinite(saved) && saved >= MONTHLY.min ? saved : MONTHLY.start;
  const realistic = realFigure('goal_realistic')
    ? `<p class="onb-status">${escapeHtml(t('onb_monthly_realistic'))}</p>` : '';
  return `
    <h1>${escapeHtml(t('onb_monthly_q'))}</h1>
    <div class="onb-stepper">
      <button type="button" class="onb-round" data-step-by="-1" aria-label="${escapeHtml(t('onb_monthly_less'))}">&minus;</button>
      <p class="onb-big" data-out="monthly" data-value="${value}" aria-live="polite">${escapeHtml(t('onb_monthly_amt', { n: String(value) }))}</p>
      <button type="button" class="onb-round" data-step-by="1" aria-label="${escapeHtml(t('onb_monthly_more'))}">+</button>
    </div>
    ${realistic}`;
}

function compareBody() {
  return `
    <h1>${escapeHtml(t('onb_compare_title'))}</h1>
    <div class="onb-compare">
      <div class="onb-card"><b>${escapeHtml(t('onb_compare_without'))}</b><span>${escapeHtml(t('onb_compare_without_sub'))}</span></div>
      <div class="onb-card onb-card-with"><b>${escapeHtml(t('onb_compare_with'))}</b><span>${escapeHtml(t('onb_compare_with_sub'))}</span></div>
    </div>`;
}

/**
 * His screen 31, "Evaluating Deal...": a progress bar and "Comparing prices across
 * local retailers...". It is a demo of the scan wait and states nothing about the
 * product: the bar fills over the wait's own three stage lines (voice.js
 * `working_step1` to `working_step3`, in the neutral voice because the person has
 * not picked an attitude yet), and the only figure on it is the bar's own
 * progress. No price, no saving, no percent saved.
 */
const EVAL_STAGES = ['working_step1', 'working_step2', 'working_step3'];

function evaluatingBody() {
  const rows = EVAL_STAGES.map((k) => `<li data-eval-stage>${TICK}<span>${escapeHtml(say(k, {}, 'deadpan'))}</span></li>`);
  return `
    <h1>${escapeHtml(t('onb_eval_title'))}</h1>
    <div class="onb-bar onb-bar-wide" role="progressbar" aria-valuemin="0" aria-valuemax="100"
         aria-valuenow="0" data-eval-bar aria-label="${escapeHtml(t('onb_eval_title'))}"><i style="transform:scaleX(0)"></i></div>
    <p class="onb-big" data-eval-pct aria-hidden="true">0%</p>
    <p class="onb-status" role="status">${escapeHtml(t('onb_eval_status'))}</p>
    <ul class="onb-list onb-prep">${rows.join('')}</ul>`;
}

const PREPARING = ['discount', 'stores', 'radius', 'history', 'tracker'];

function preparingBody() {
  const items = PREPARING.map((k) => `<li data-prep="${k}">${TICK}<span>${escapeHtml(t(`onb_preparing_${k}`))}</span></li>`);
  return `<h1>${escapeHtml(t('onb_preparing_title'))}</h1><ul class="onb-list onb-prep">${items.join('')}</ul>`;
}

function signinBody() {
  // Reached only when CAPABILITIES.accounts is true. Whoever flips that flag
  // wires these three to a real sign-in; until then this step is skipped.
  const btn = (k) => `<button type="button" class="onb-opt" data-signin="${k}"><span class="onb-opt-text"><b>${escapeHtml(t(`onb_signin_${k}`))}</b></span></button>`;
  return `<h1>${escapeHtml(t('onb_signin_title'))}</h1><div class="onb-opts">${btn('apple')}${btn('google')}${btn('email')}</div>`;
}

function permissionsBody() {
  const row = (k) => `
    <div class="onb-perm">
      <span class="onb-opt-text"><b>${escapeHtml(t(`onb_perm_${k}`))}</b><small>${escapeHtml(t(`onb_perm_${k}_sub`))}</small></span>
      <button type="button" class="onb-switch" role="switch" aria-checked="false" data-perm="${k}"
              aria-label="${escapeHtml(t(`onb_perm_${k}`))}"></button>
    </div>`;
  // Item 19: a demo scan, reachable before camera permission is asked for
  // real (docs/scanner-build-order-2026-09-19.md item 19). `data-demo-slot`
  // is empty until tapped; the render() handler below fills it.
  return `<h1>${escapeHtml(t('onb_perm_title'))}</h1>${row('camera')}${row('location')}
    <p class="fineprint onb-perm-note" role="status" hidden>${escapeHtml(t('onb_perm_camera_denied'))}</p>
    <button type="button" class="onb-demo-link" data-act="see-demo">${escapeHtml(t('onb_see_demo'))}</button>
    <div class="onb-demo-slot" data-demo-slot role="status"></div>`;
}

/**
 * Item 19's own card: a scripted demo answer, always visibly marked as one
 * wherever it carries a price or a verdict. Onboarding's own rule ("Figures
 * show only when real", onboarding-flow.js) governs published marketing
 * figures (shoppers, rating, reviews); a demo scan is a different kind of
 * thing and does not go through that gate at all, because it is never claimed
 * as real in the first place -- the badge is the claim's whole shape.
 *
 * `demo` is whatever `ctx.api.identifyDemo()` resolved to (SEAM: the exact
 * server shape is not yet fixed; see api.js's own comment on `identifyDemo`).
 * Pure and exported so the labelling rule is checked without a DOM.
 */
export function demoResultHtml(demo) {
  const badge = `<span class="onb-demo-badge">${escapeHtml(t('onb_demo_badge'))}</span>`;
  const name = demo?.product?.name ? escapeHtml(String(demo.product.name)) : '';
  const brand = demo?.product?.brand ? escapeHtml(String(demo.product.brand)) : '';
  const label = [brand, name].filter(Boolean).join(' ');
  const priceCents = typeof demo?.askingCents === 'number' ? demo.askingCents : null;
  const price = priceCents !== null ? `$${(priceCents / 100).toFixed(2)}` : null;
  const verdict = demo?.verdictWord ? escapeHtml(String(demo.verdictWord)) : '';
  return `<div class="onb-demo-card" data-demo-result>
    ${badge}
    ${label ? `<p class="onb-demo-item">${label}</p>` : ''}
    ${price !== null ? `<p class="onb-demo-price">${badge} ${escapeHtml(price)}</p>` : ''}
    ${verdict ? `<p class="onb-demo-verdict">${badge} ${verdict}</p>` : ''}
  </div>`;
}

function trialBody() {
  return `${face('delighted', 120)}<h1>${escapeHtml(t('onb_trial_title'))}</h1>
    <p class="onb-note">${escapeHtml(t('onb_trial_note'))}</p>`;
}

function bodyFor(step, answers, replay) {
  switch (step.kind) {
    case 'welcome':
      return `${face('pleased', 168)}<h1 class="onb-brand">${escapeHtml(t('onb_welcome_name'))}<i aria-hidden="true">.</i></h1>`;
    case 'info':
      return step.id === 'thanks'
        ? `${face('proud', 120)}<h1>${escapeHtml(t('onb_thanks_title'))}</h1><p class="onb-sub">${escapeHtml(t('onb_thanks_sub'))}</p>`
        : `${face('idle', 120)}<h1>${escapeHtml(t('onb_promise'))}</h1>`;
    case 'choice': return choiceBody(step, answers);
    case 'threshold': return thresholdBody(answers, replay);
    case 'monthly': return monthlyBody(answers);
    case 'compare': return compareBody();
    case 'figure': return figureBody(step, answers);
    case 'preparing': return preparingBody();
    case 'evaluating': return evaluatingBody();
    case 'signin': return signinBody();
    case 'trial': return trialBody();
    case 'permissions': return permissionsBody();
    case 'plans': return `<h1 id="onb-q">${escapeHtml(t('onb_plans_title'))}</h1>${planOptions(answers)}`;
    case 'list': return listBody(step);
    default: return '';
  }
}

function planOptions(answers) {
  const step = stepById('plans');
  return `<div class="onb-opts" role="radiogroup" aria-labelledby="onb-q">${
    step.options.map((o) => optionHtml(step, o, answers[step.key] === o)).join('')}</div>`;
}

/** The camera prompt, asked here on his word for screen 24, and stopped at once. */
async function askCamera() {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
  if (!md?.getUserMedia) return 'unavailable';
  try {
    const stream = await md.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    for (const tr of stream.getTracks()) tr.stop();
    return 'granted';
  } catch (err) {
    return err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable';
  }
}

export default {
  id: 'onboarding',
  title: 'Welcome',
  titleKey: 'onb_title',

  render(root, ctx) {
    const ac = new AbortController();
    const timers = [];
    const list = visibleSteps();
    const replay = isReplay(ctx.params, store.get());
    // A first run resumes where it stopped; a replay always starts at the first
    // screen and leaves the saved resume point alone.
    const asked = replay ? ctx.params?.step : (ctx.params?.step ?? store.get().onboarding?.step);
    const step = list.find((s) => s.id === asked) ?? list[0];
    const { index, total } = positionOf(step.id);
    const answers = answersNow();
    const last = nextStepId(step.id) === null;

    if (!replay && store.get().onboarding?.step !== step.id) {
      store.update((s) => ({ ...s, onboarding: { ...(s.onboarding ?? {}), step: step.id } }));
    }
    if (replay && step.id === list[0].id && !ctx.params?.step) track('onboarding_replay_start', {});
    track('onboarding_step', replay ? { step: step.id, n: step.n, replay: true } : { step: step.id, n: step.n });

    const pct = Math.round(((index + 1) / total) * 100);
    const ctaLabel = step.kind === 'trial' ? t('onb_trial_try') : t(last ? 'onb_finish' : 'onb_continue');
    const showNotNow = step.kind === 'plans';

    root.innerHTML = `
      <div class="page onb onb-${escapeHtml(step.kind)}" data-step="${escapeHtml(step.id)}">
        <div class="onb-top">
          ${index > 0
            ? `<button type="button" class="onb-back" data-act="back" aria-label="${escapeHtml(t('nav_back'))}">&larr;</button>`
            : '<span class="onb-back-gap"></span>'}
          <div class="onb-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${total}"
               aria-valuenow="${index + 1}" aria-label="${escapeHtml(t('onb_progress', { n: String(index + 1), total: String(total) }))}"><i style="transform:scaleX(${pct / 100})"></i></div>
          <button type="button" class="linky onb-skip" data-act="skip">${escapeHtml(t('onb_skip_all'))}</button>
        </div>
        <div class="onb-body">${bodyFor(step, answers, replay)}</div>
        <div class="page-foot">
          <button type="button" class="cta" data-act="next">${escapeHtml(ctaLabel)}</button>
          ${showNotNow ? `<button type="button" class="linky onb-notnow" data-act="notnow">${escapeHtml(t('onb_not_now'))}</button>` : ''}
        </div>
      </div>`;

    for (const g of root.querySelectorAll('[role="radiogroup"]')) wireRadioGroup(g, { signal: ac.signal });

    /* ---- per-kind state and behaviour ------------------------------------ */
    let touched = false;
    let monthly = Number(root.querySelector('[data-out="monthly"]')?.dataset.value) || MONTHLY.start;

    function leave(nextId) {
      if (nextId) ctx.replace('onboarding', replay ? { step: nextId, replay: 1 } : { step: nextId });
      // The end lands where a normal launch would: the camera for someone who
      // has finished everything, and never a flag flipped back.
      else ctx.replace(firstScreen(store.get()));
    }

    /**
     * What must be on record before this step is left, whatever was tapped.
     * On a replay a step that was only walked through is recorded as an event
     * and writes nothing saved (`eventOnly`); a step the person moved is saved.
     */
    function commit() {
      const eventOnly = replay && !touched;
      if (step.kind === 'threshold') {
        const input = root.querySelector('[data-range="threshold"]');
        const mode = answersNow().dealThresholdMode === 'amount' ? 'amount' : 'percent';
        const value = Number(input.value);
        recordAnswer(DEPS, step.id, 'dealThreshold', value, { mode, touched }, { eventOnly });
        applyThreshold(DEPS, mode, value, touched);
      } else if (step.kind === 'monthly') {
        recordAnswer(DEPS, step.id, 'monthlyGoal', monthly, { touched }, { eventOnly });
      } else if (step.kind === 'trial') {
        recordAnswer(DEPS, step.id, 'trialTapped', true, {}, { eventOnly: replay });
      }
    }

    if (step.kind === 'preparing') {
      const rows = [...root.querySelectorAll('[data-prep]')];
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      rows.forEach((r, i) => {
        if (reduced) r.classList.add('done');
        else timers.push(setTimeout(() => r.classList.add('done'), 500 + i * 550));
      });
    }

    if (step.kind === 'evaluating') {
      const rows = [...root.querySelectorAll('[data-eval-stage]')];
      const bar = root.querySelector('[data-eval-bar]');
      const out = root.querySelector('[data-eval-pct]');
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      /* One stage at a time; the bar is exactly the share of stages done. */
      const paint = (done) => {
        const pct = Math.round((done / rows.length) * 100);
        bar.setAttribute('aria-valuenow', String(pct));
        bar.querySelector('i').style.transform = `scaleX(${pct / 100})`;
        out.textContent = `${pct}%`;
      };
      rows.forEach((r, i) => {
        const finish = () => { r.classList.add('done'); paint(i + 1); };
        if (reduced) finish();
        else timers.push(setTimeout(finish, 700 + i * 800));
      });
    }

    /** Both switches show what is actually on record, never what was last tapped. */
    function paintPermissions() {
      const states = {
        location: store.consent().location === true,
        camera: answersNow().cameraPermission === 'granted',
      };
      for (const [key, isOn] of Object.entries(states)) {
        const el = root.querySelector(`[data-perm="${key}"]`);
        if (!el) continue;
        el.setAttribute('aria-checked', String(isOn));
        el.classList.toggle('on', isOn);
      }
    }
    if (step.kind === 'permissions') paintPermissions();

    /**
     * Item 19: fetches the demo scan and paints it into the permissions
     * step's own slot. `identifyDemo` degrades to `null` when the route is
     * not there yet (api.js's `getSoft`), which is honest rather than
     * something faked to fill the space -- the fallback line says so.
     */
    async function showDemo() {
      const demoSlot = root.querySelector('[data-demo-slot]');
      if (!demoSlot) return;
      const demo = await ctx.api.identifyDemo?.();
      if (ac.signal.aborted) return;
      track('demo_scan_shown', { shown: Boolean(demo) });
      demoSlot.innerHTML = demo ? demoResultHtml(demo) : `<p class="fineprint">${escapeHtml(t('onb_demo_unavailable'))}</p>`;
    }

    on(root, 'input', (e) => {
      const range = e.target.closest('[data-range="threshold"]');
      if (!range) return;
      touched = true;
      const mode = answersNow().dealThresholdMode === 'amount' ? 'amount' : 'percent';
      root.querySelector('[data-out="threshold"]').innerHTML = thresholdLabel(mode, Number(range.value));
    }, ac.signal);

    on(root, 'click', async (e) => {
      const opt = e.target.closest('[data-opt]');
      if (opt && step.options) {
        const id = opt.dataset.opt;
        const group = opt.parentElement;
        if (step.multi) {
          const now = new Set(Array.isArray(answersNow()[step.key]) ? answersNow()[step.key] : []);
          if (now.has(id)) now.delete(id); else now.add(id);
          const next = step.options.filter((o) => now.has(o));
          recordAnswer(DEPS, step.id, step.key, next);
          for (const el of group.querySelectorAll('[data-opt]')) {
            const chosen = next.includes(el.dataset.opt);
            el.classList.toggle('on', chosen);
            el.setAttribute('aria-checked', String(chosen));
          }
        } else {
          recordAnswer(DEPS, step.id, step.key, id);
          /* The Percentage / Dollar toggle and the alert style are settings too
             (lib/ranges.js, store.js `alertStyle`): saved where the app reads them. */
          if (step.key === 'dealThresholdMode') applyMode(DEPS, id);
          if (step.key === 'alertStyle') applyAlertStyle(DEPS, id);
          for (const el of group.querySelectorAll('[data-opt]')) {
            const chosen = el === opt;
            el.classList.toggle('on', chosen);
            el.setAttribute('aria-checked', String(chosen));
          }
        }
        return;
      }

      const by = e.target.closest('[data-step-by]');
      if (by) {
        touched = true;
        monthly = Math.max(MONTHLY.min, Math.min(MONTHLY.max, monthly + Number(by.dataset.stepBy) * MONTHLY.step));
        root.querySelector('[data-out="monthly"]').textContent = t('onb_monthly_amt', { n: String(monthly) });
        return;
      }

      const signin = e.target.closest('[data-signin]');
      if (signin) {
        recordAnswer(DEPS, step.id, 'signinChoice', signin.dataset.signin);
        return;
      }

      const perm = e.target.closest('[data-perm]');
      if (perm) {
        if (perm.dataset.perm === 'location') {
          const after = toggleConsent(ctx.api, 'location');
          recordAnswer(DEPS, step.id, 'locationAllowed', after.location === true);
        } else {
          const result = await askCamera();
          if (ac.signal.aborted) return;
          recordAnswer(DEPS, step.id, 'cameraPermission', result);
          const note = root.querySelector('.onb-perm-note');
          if (note) note.hidden = result === 'granted';
        }
        if (ac.signal.aborted) return;
        paintPermissions();
        return;
      }

      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'next') {
        commit();
        if (nextStepId(step.id) === null) (replay ? endReplay : finish)(DEPS);
        leave(nextStepId(step.id));
      } else if (act === 'back') {
        leave(prevStepId(step.id));
      } else if (act === 'skip') {
        (replay ? endReplay : finish)(DEPS, { skippedAt: step.id });
        leave(null);
      } else if (act === 'notnow') {
        recordAnswer(DEPS, step.id, 'planInterest', 'none', {}, { eventOnly: replay });
        (replay ? endReplay : finish)(DEPS);
        leave(null);
      } else if (act === 'see-demo') {
        await showDemo();
      }
    }, ac.signal);

    return () => {
      ac.abort();
      for (const id of timers) clearTimeout(id);
    };
  },
};
