/**
 * The user's price ranges as a control: a Percentage (%) or Dollar Amount ($)
 * toggle and three rows of choices, great, good and bad. One drawing shared by
 * the setup screen and the You screen, because a second copy is a second copy
 * that goes stale (the same reason LINE_CHOICES lives in the store).
 *
 * `variant` only picks class names: setup draws `.pcts` / `.pct`, You draws the
 * `.seg` / `.btn seg-o` segments its other settings use. Every button carries
 * `data-range-kind` and `data-range-val`; the unit toggle carries `data-range-unit`.
 *
 * The click handler paints in place (no re-render of a page the user may be
 * scrolling), and it repaints all three rows because setting one can move another
 * (great is never below good, see lib/ranges.js `rangePatch`).
 */

import { escapeHtml } from './dom.js';
import { t } from '../ui-strings.js';
import { RANGE_KINDS, choicesFor, rangesOf } from './ranges.js';

const CLASSES = {
  setup: { row: 'pcts', opt: 'pct', sel: '.pct' },
  you: { row: 'seg', opt: 'btn seg-o', sel: '.seg-o' },
};

function valueLabel(unit, n) {
  return t(unit === 'amount' ? 'ranges_amt' : 'ranges_pct', { n: String(n) });
}

function optButton(cls, attrs, chosen, label) {
  return `<button type="button" class="${cls.opt}${chosen ? ' on' : ''}" role="radio" aria-checked="${chosen}" ${attrs}>${escapeHtml(label)}</button>`;
}

function rowOptions(cls, unit, kind, current) {
  /* A value the welcome slider set (a dollar amount such as 4) may not be one of
     the offered buttons; show it as its own option rather than leave nothing chosen. */
  const offered = choicesFor(unit);
  const list = offered.includes(current) ? offered : [...offered, current].sort((a, b) => a - b);
  return list.map((n) => optButton(cls, `data-range-kind="${kind}" data-range-val="${n}"`, n === current, valueLabel(unit, n))).join('');
}

/** The whole control, as HTML. `state` is the store's state. */
export function rangePickerHtml(state, variant = 'setup') {
  const cls = CLASSES[variant] ?? CLASSES.setup;
  const r = rangesOf(state);
  const unitRow = ['percent', 'amount'].map((u) => optButton(
    cls, `data-range-unit="${u}"`, r.unit === u, t(u === 'amount' ? 'ranges_unit_amount' : 'ranges_unit_percent'),
  )).join('');
  const rows = RANGE_KINDS.map((kind) => `
    <p class="line-q" id="range-${kind}-q-${variant}">${escapeHtml(t(`ranges_${kind}_q`))}</p>
    <div class="${cls.row}" role="radiogroup" aria-labelledby="range-${kind}-q-${variant}" data-range-row="${kind}" data-unit="${r.unit}">
      ${rowOptions(cls, r.unit, kind, r[kind])}
    </div>`).join('');
  return `
    <div data-ranges="${variant}">
      <p class="line-q" id="range-unit-q-${variant}">${escapeHtml(t('ranges_unit_q'))}</p>
      <div class="${cls.row}" role="radiogroup" aria-labelledby="range-unit-q-${variant}" data-range-unitrow>${unitRow}</div>
      ${rows}
      <p class="fineprint" data-range-note>${escapeHtml(t(r.unit === 'amount' ? 'ranges_note_amount' : 'ranges_note'))}</p>
    </div>`;
}

/** Repaints the control to match the store. Rebuilds the choices when the unit changed. */
export function paintRanges(root, state, variant = 'setup') {
  const box = root.querySelector('[data-ranges]');
  if (!box) return;
  const cls = CLASSES[variant] ?? CLASSES.setup;
  const r = rangesOf(state);
  for (const el of box.querySelectorAll('[data-range-unit]')) {
    const on = el.dataset.rangeUnit === r.unit;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', String(on));
  }
  for (const kind of RANGE_KINDS) {
    const row = box.querySelector(`[data-range-row="${kind}"]`);
    if (!row) continue;
    if (row.dataset.unit !== r.unit) {
      row.innerHTML = rowOptions(cls, r.unit, kind, r[kind]);
      row.dataset.unit = r.unit;
      continue;
    }
    for (const el of row.querySelectorAll(cls.sel)) {
      const on = Number(el.dataset.rangeVal) === r[kind];
      el.classList.toggle('on', on);
      el.setAttribute('aria-checked', String(on));
    }
  }
  const note = box.querySelector('[data-range-note]');
  if (note) note.textContent = t(r.unit === 'amount' ? 'ranges_note_amount' : 'ranges_note');
}

/**
 * Handles a click inside the control. Returns true when it was one of ours, so the
 * screen's own handler can stop there. `store` is passed in so a test can hand in
 * its own; `track` (optional) records the change.
 */
export function handleRangeClick(e, root, { store, track }, variant = 'setup') {
  const unit = e.target.closest('[data-range-unit]');
  if (unit) {
    store.setRangeUnit(unit.dataset.rangeUnit);
    track?.('price_range_set', { kind: 'unit', value: unit.dataset.rangeUnit });
    paintRanges(root, store.get(), variant);
    return true;
  }
  const opt = e.target.closest('[data-range-kind]');
  if (!opt) return false;
  const kind = opt.dataset.rangeKind;
  const value = Number(opt.dataset.rangeVal);
  store.setRange(kind, value);
  track?.('price_range_set', { kind, value, unit: rangesOf(store.get()).unit });
  paintRanges(root, store.get(), variant);
  return true;
}
