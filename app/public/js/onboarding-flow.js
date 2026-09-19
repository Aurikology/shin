/**
 * The onboarding flow as data, and the rules that decide what is in it.
 *
 * WHAT THIS IS. Jamin's "Welcome screen UI" tab (docs/walkthrough/jamin-notes-
 * 2026-09-17.md, screens 1 to 33): Cal AI's welcome pages with his replacement
 * text on each, in his order, built in Shin's own look. `n` on each step below
 * is his line number in that tab, so the order can be checked against his page
 * by anyone. Screens 30, 32 and 33 (the viewfinder, the savings dashboard, the
 * verdict page) are Cal AI's own product screens, not welcome pages; in Shin
 * those are the camera, the Savings Overview (screens/savings.js, reached from
 * You) and the verdict sheet. Screen 31, "Evaluating Deal...", is drawn here as a
 * demo of the scan wait (step `evaluating`), so the flow ends at 31.
 *
 * NO DOM HERE. This file is the order, the visibility rules and the save path,
 * pure enough for test/onboarding.test.mjs to run in Node. The screen
 * (screens/onboarding.js) only draws what this says and calls what this saves.
 *
 * THREE RULES THAT ARE THE POINT OF THE FILE.
 *
 * 1. His order. `STEPS` is the order. `nextStepId` and `visibleSteps` never
 *    reorder, they only skip.
 *
 * 2. Figures show only when real (CLAUDE.md hard rule 2, and his decision of
 *    2026-09-18 in docs/beta-gaps-2026-09-19.md item 17). The "10,000 smart
 *    shoppers", the 4.8 rating, the reviews, every savings figure and the
 *    "goal is realistic" line are claims about the product's performance, and
 *    none has been measured. Each is a slot: `realFigure(name)` returns the
 *    number only when `PUBLISHED_FIGURES` holds it WITH a `source` and a
 *    `measuredAt`, and returns null otherwise, and the default is empty. A
 *    step whose whole content is a figure is skipped while its figure is
 *    hidden, rather than shown empty. To publish a real number, add it to
 *    `PUBLISHED_FIGURES` with where it was measured; nothing else changes.
 *
 * 3. Only what exists. A screen whose function is not built is skipped, not
 *    faked: sign-in (there are no accounts, store.js says so) is gated on
 *    `CAPABILITIES.accounts`. The paywall screens are shown with his text and
 *    his prices, and they never gate the app: nothing here grants or checks
 *    Pro, and the flow finishes whatever was tapped.
 */

import { rangePatch, unitPatch } from './lib/ranges.js';

/** What the app can actually do today. Flip a flag when the thing is built. */
export const CAPABILITIES = Object.freeze({
  /** Sign in with Apple, Google or email. No account system exists. */
  accounts: false,
});

/**
 * Measured figures, and nothing else. Empty on purpose: as of 2026-09-19 no
 * shopper count, rating, review or savings figure has been measured. Each entry
 * needs `source` (where it was measured) and `measuredAt` (a date string) or
 * `realFigure` refuses it, so a number typed in without provenance stays hidden.
 *
 * Shapes:
 *   shoppers          { value, source, measuredAt }             value: whole number above 0
 *   rating            { value, count, source, measuredAt }      0 < value <= 5, count above 0
 *   reviews           { items: [{ text, source }], source, measuredAt }
 *   savings_trend     { points: [{ month, without, with }], source, measuredAt }   two or more
 *   savings_timeline  { points: [{ days, saved }], source, measuredAt }            one or more
 *   goal_progress     { saved, source, measuredAt }
 *   goal_realistic    { value: true, source, measuredAt }
 *   total_saved       { saved, source, measuredAt }             the Savings Overview's Total Saved
 */
export const PUBLISHED_FIGURES = {};

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Per-figure shape checks. A figure is real only if its own check passes. */
const SHAPES = {
  shoppers: (f) => Number.isInteger(f.value) && f.value > 0,
  rating: (f) => isNum(f.value) && f.value > 0 && f.value <= 5 && Number.isInteger(f.count) && f.count > 0,
  reviews: (f) => Array.isArray(f.items) && f.items.length > 0
    && f.items.every((r) => r && isText(r.text) && isText(r.source)),
  savings_trend: (f) => Array.isArray(f.points) && f.points.length >= 2
    && f.points.every((p) => p && isNum(p.month) && isNum(p.without) && isNum(p.with)),
  savings_timeline: (f) => Array.isArray(f.points) && f.points.length >= 1
    && f.points.every((p) => p && isNum(p.days) && isNum(p.saved)),
  goal_progress: (f) => isNum(f.saved) && f.saved >= 0,
  goal_realistic: (f) => f.value === true,
  total_saved: (f) => isNum(f.saved) && f.saved >= 0,
};

/**
 * The figure if it is real, else null. Default source is the published set;
 * tests pass their own.
 */
export function realFigure(name, published = PUBLISHED_FIGURES) {
  const f = published?.[name];
  const check = SHAPES[name];
  if (!f || typeof f !== 'object' || !check) return null;
  if (!isText(f.source) || !isText(f.measuredAt)) return null;
  return check(f) ? f : null;
}

/**
 * The steps, in his order. `kind` picks the drawing; `key` is the answer's name
 * in `store.get().onboarding.answers`; `needs` are figures the step is made of.
 */
export const STEPS = Object.freeze([
  { n: 1, id: 'welcome', kind: 'welcome' },
  { n: 2, id: 'promise', kind: 'info' },
  { n: 3, id: 'shops', kind: 'choice', key: 'shopTypes', multi: true,
    options: ['supermarkets', 'bigbox', 'pharmacies', 'other'] },
  { n: 4, id: 'frequency', kind: 'choice', key: 'shopsPerWeek',
    options: ['occasional', 'regular', 'frequent'] },
  { n: 5, id: 'priority', kind: 'choice', key: 'priority',
    options: ['lowest', 'clearance', 'balance', 'quick'] },
  { n: 6, id: 'heard', kind: 'choice', key: 'heardFrom',
    options: ['tv', 'google', 'tiktok', 'instagram', 'friend', 'facebook', 'x'] },
  { n: 7, id: 'tried', kind: 'choice', key: 'triedOtherApps', options: ['yes', 'no'] },
  { n: 8, id: 'trend', kind: 'figure', needs: ['savings_trend'] },
  { n: 9, id: 'mode', kind: 'choice', key: 'dealThresholdMode', options: ['percent', 'amount'] },
  { n: 10, id: 'threshold', kind: 'threshold' },
  { n: 11, id: 'loyalty', kind: 'choice', key: 'usesLoyalty', options: ['yes', 'no'] },
  { n: 12, id: 'goal', kind: 'choice', key: 'primaryGoal',
    options: ['groceries', 'checkout', 'history'] },
  { n: 13, id: 'monthly', kind: 'monthly' },
  { n: 14, id: 'alerts', kind: 'choice', key: 'alertStyle',
    options: ['conservative', 'recommended', 'aggressive'] },
  { n: 15, id: 'compare', kind: 'compare' },
  { n: 16, id: 'frustration', kind: 'choice', key: 'frustration',
    options: ['fake', 'history', 'units', 'clearance', 'impulse'] },
  { n: 17, id: 'potential', kind: 'figure', needs: ['savings_timeline'] },
  { n: 18, id: 'thanks', kind: 'info' },
  { n: 19, id: 'social', kind: 'figure', needs: ['shoppers'] },
  { n: 20, id: 'preparing', kind: 'preparing' },
  { n: 21, id: 'progress', kind: 'figure', needs: ['goal_progress'] },
  { n: 22, id: 'signin', kind: 'signin', requires: 'accounts' },
  { n: 23, id: 'trial', kind: 'trial' },
  { n: 24, id: 'permissions', kind: 'permissions' },
  { n: 25, id: 'plans', kind: 'plans', key: 'planInterest', options: ['annual', 'monthly'] },
  { n: 26, id: 'tip_scan', kind: 'list', items: 3 },
  { n: 27, id: 'tip_eval', kind: 'list', items: 3 },
  { n: 28, id: 'tip_fix', kind: 'list', items: 3 },
  { n: 29, id: 'tip_accuracy', kind: 'list', items: 3 },
  /* His 31 (30 is the camera, which the flow hands over to): a demo of the scan
     wait. The bar fills over the wait's own stage lines; it states no saving. */
  { n: 31, id: 'evaluating', kind: 'evaluating', stages: 3 },
]);

/** Whether a step is in the flow right now. */
export function isVisible(step, { figures = PUBLISHED_FIGURES, capabilities = CAPABILITIES } = {}) {
  if (step.requires && !capabilities[step.requires]) return false;
  if (step.needs && !step.needs.every((name) => realFigure(name, figures))) return false;

  return true;
}

/** The steps a user will actually walk, in his order. */
export function visibleSteps(opts = {}) {
  return STEPS.filter((s) => isVisible(s, opts));
}

export function stepById(id) {
  return STEPS.find((s) => s.id === id) ?? null;
}

/** The id after `id` among visible steps, or null at the end. An unknown id starts over. */
export function nextStepId(id, opts = {}) {
  const list = visibleSteps(opts);
  const i = list.findIndex((s) => s.id === id);
  if (i === -1) return list[0]?.id ?? null;
  return list[i + 1]?.id ?? null;
}

/** The id before `id` among visible steps, or null at the start. */
export function prevStepId(id, opts = {}) {
  const list = visibleSteps(opts);
  const i = list.findIndex((s) => s.id === id);
  return i > 0 ? list[i - 1].id : null;
}

/** 0-based position of a step among the visible ones, and how many there are. */
export function positionOf(id, opts = {}) {
  const list = visibleSteps(opts);
  return { index: list.findIndex((s) => s.id === id), total: list.length };
}

/** Which slider values each mode offers, and the recommended one (his: 20% OFF).
    Up to 30, so his "Conservative 30%+" is a value a person can pick. */
export const THRESHOLD = Object.freeze({
  percent: { min: 5, max: 30, step: 5, recommended: 20 },
  /* His notes give no dollar default and no "recommended" for this mode, so
     none is claimed: the slider simply starts at 5. */
  amount: { min: 1, max: 20, step: 1, start: 5 },
});

/** His "$100.00 / month" target and the step the stepper moves it by. */
export const MONTHLY = Object.freeze({ start: 100, min: 10, max: 1000, step: 10 });

/**
 * The first screen a launch lands on. The order the app is used in:
 * onboarding once, then the attitude and two lines (setup), then consent, then
 * the camera. Extracted from main.js so a test can hold the order.
 */
export function firstScreen(s) {
  if (!s.onboarding?.doneAt) return 'onboarding';
  if (!s.seenIntro) return 'setup';
  if (!s.consentSeen) return 'consent';
  return 'camera';
}

/**
 * Saves one answer. Through the store (the device's own record, and the one the
 * rest of the app reads) AND through the events queue (which reaches the
 * server), so nothing a person answers here exists in only one place. Rule 7:
 * an answer that is not recorded is a defect in the data collection.
 *
 * @param deps   { store, track } injected so a test can watch both
 * @param extra  anything worth keeping beside the value (mode, touched)
 */
export function recordAnswer({ store, track }, stepId, key, value, extra = {}, { eventOnly = false } = {}) {
  const at = new Date().toISOString();
  if (!eventOnly) {
    store.update((s) => ({
      ...s,
      onboarding: {
        ...(s.onboarding ?? {}),
        answers: { ...(s.onboarding?.answers ?? {}), [key]: value },
        updatedAt: at,
      },
    }));
  }
  track('onboarding_answer', { step: stepId, key, value, ...extra, ...(eventOnly ? { kept: true } : {}) });
}

/**
 * REPLAY. "Watch the welcome again" (You screen) and `?onboarding=1` run the
 * whole flow again, from the first screen, in the same order and text, as many
 * times as the person likes. Three promises, each held by a line below and each
 * with a test:
 *
 *   1. It wipes nothing. Choices come back prefilled from what is saved, and a
 *      step the person only walks through writes nothing (`eventOnly`): the
 *      event is recorded like a first run's (rule 7) but the saved answer, the
 *      user's own price line, the consent and the ratings are left as they were.
 *      Only something the person actually changes is saved.
 *   2. It re-triggers nothing one-time. It never calls `finish()` (which stamps
 *      `doneAt`), never touches `seenIntro` or `consentSeen`, and grants nothing.
 *      There is no billing, so the paywall steps only record that they were
 *      viewed and tapped.
 *   3. It is opt-in. First-run behaviour is `firstScreen()` and is unchanged; a
 *      replay request from someone who has not finished the first run is
 *      treated as their first run, so nobody can skip setup and consent by
 *      adding a parameter.
 */
export function isReplay(params, state) {
  const asked = params?.replay === '1' || params?.replay === 1 || params?.onboarding === '1';
  return asked && Boolean(state?.onboarding?.doneAt);
}

/** Whether a URL query string asks for a replay (`?onboarding=1`). */
export function wantsReplay(search) {
  try {
    return new URLSearchParams(search).get('onboarding') === '1';
  } catch {
    return false;
  }
}

/**
 * The URL to show for `?onboarding=1`, or null when it should not act. It acts
 * only for someone who has finished the first run, and it swaps the switch for
 * a replay URL, so opening the link replays once: a reload mid-replay continues
 * it, and a reload after it ends does not start another.
 */
export function replayUrlFor(search, state) {
  if (!wantsReplay(search) || !state?.onboarding?.doneAt) return null;
  return '?s=onboarding&replay=1';
}

/** Ends a replay: on record, no flag touched. Lands where a normal launch would. */
export function endReplay({ track }, { skippedAt = null } = {}) {
  track(skippedAt ? 'onboarding_replay_skip' : 'onboarding_replay_done', skippedAt ? { step: skippedAt } : {});
}

/**
 * The number a person chose is their GOOD range ("what minimum discount makes an
 * item a Good Deal for you"), in the unit they chose: a percent goes to
 * `lineUnderPct`, a dollar amount to `lineAmounts.good`, and the unit is saved
 * with it, so the next scan is judged on the scale they picked (lib/ranges.js).
 * Only when they touched the slider: an untouched default is not their choice and
 * must not overwrite the app's own default.
 */
export function applyThreshold({ store }, mode, value, touched) {
  if (!touched || !Number.isFinite(value)) return false;
  const unit = mode === 'amount' ? 'amount' : 'percent';
  if (unit === 'amount') {
    if (value < THRESHOLD.amount.min || value > THRESHOLD.amount.max) return false;
  } else if (!store.LINE_CHOICES.includes(value)) {
    return false;
  }
  const s = { ...store.get(), lineUnit: unit };
  store.update({ ...unitPatch(unit), ...rangePatch(s, 'good', value) });
  return true;
}

/** His Percentage (%) / Dollar Amount ($) toggle, saved the moment it is tapped. */
export function applyMode({ store }, mode) {
  store.update(unitPatch(mode === 'amount' ? 'amount' : 'percent'));
}

/**
 * W14, how aggressive deal alerts should be. Stored as a setting and nothing
 * more: there is no alert system, so nothing reads it yet. The number is the one
 * his option names (Conservative 30%+, Recommended 20%+, Aggressive 10%+).
 */
export const ALERT_MIN_PCT = Object.freeze({ conservative: 30, recommended: 20, aggressive: 10 });

export function applyAlertStyle({ store }, style) {
  if (!Object.hasOwn(ALERT_MIN_PCT, style)) return false;
  store.update({ alertStyle: style, alertMinPct: ALERT_MIN_PCT[style] });
  return true;
}

/** Marks the flow finished, or skipped, and says which, so both are on record. */
export function finish({ store, track }, { skippedAt = null } = {}) {
  const at = new Date().toISOString();
  store.update((s) => ({
    ...s,
    onboarding: { ...(s.onboarding ?? {}), doneAt: at, skippedAt },
  }));
  track(skippedAt ? 'onboarding_skip' : 'onboarding_done', skippedAt ? { step: skippedAt } : {});
}
