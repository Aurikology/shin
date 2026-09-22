/**
 * The camera-and-location permission panel: the switches, the phone's own
 * camera prompt, the denied note, and item 19's demo scan.
 *
 * WHY IT IS A MODULE AND NOT A SCREEN. It is drawn in two places now. It is
 * step 24 of the welcome flow (`screens/onboarding.js`), and it is also its
 * own registered screen (`screens/permissions.js`), which is what the MVP
 * plan needs: with the welcome flow switched off, the permission ask is the
 * first thing after install, and until 2026-09-21 it could not be, because it
 * only existed as markup and handlers inside onboarding's render. Switching
 * the flow off took the ask with it. So the panel moved here, where both
 * callers import it, rather than being copied into a second screen where the
 * two would drift.
 *
 * The router's rule is that screens never import one another; this is the
 * shape that keeps it, the same one `consent-actions.js` uses for the two
 * places the consent toggles are drawn.
 *
 * WHAT STAYS WITH THE CALLER. The chrome around the panel (the welcome flow's
 * progress bar and Skip, or the standalone screen's heading and Continue),
 * where Continue goes, and what is written down when a switch is tapped. The
 * caller passes `record`, so onboarding keeps recording against its own step
 * id and the standalone screen against its own, and neither has to know about
 * the other.
 *
 * ALL TEXT IS `t('onb_perm_...')` and `t('onb_demo_...')`, the keys the
 * welcome flow already carries in both locales. Shared rather than copied
 * under new names for the reason above: two copies of one sentence drift.
 */

import * as store from './store.js';
import { escapeHtml } from './lib/dom.js';
import { t } from './ui-strings.js';
import { toggleConsent } from './consent-actions.js';

/**
 * The phone's own camera prompt, asked on the owner's word for screen 24, and
 * the stream stopped the moment it is granted: this asks the question, it does
 * not open a viewfinder. The three values it returns are the ones camera.js
 * and voice.js already classify off `err.name`.
 */
export async function askCamera() {
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

/**
 * The panel's markup: a heading, the two switches, the denied note (hidden
 * until the phone says no) and item 19's demo link with its empty slot.
 *
 * `heading` false leaves the `<h1>` out, for a caller that has already drawn
 * one of its own. The welcome flow draws it here; the standalone screen draws
 * its own page head and asks for no second title.
 */
export function panelHtml({ heading = true } = {}) {
  const row = (k) => `
    <div class="onb-perm">
      <span class="onb-opt-text"><b>${escapeHtml(t(`onb_perm_${k}`))}</b><small>${escapeHtml(t(`onb_perm_${k}_sub`))}</small></span>
      <button type="button" class="onb-switch" role="switch" aria-checked="false" data-perm="${k}"
              aria-label="${escapeHtml(t(`onb_perm_${k}`))}"></button>
    </div>`;
  // Item 19: a demo scan, reachable before camera permission is asked for
  // real (docs/scanner-build-order-2026-09-19.md item 19). `data-demo-slot`
  // is empty until tapped; `fillDemoSlot` below fills it.
  return `${heading ? `<h1>${escapeHtml(t('onb_perm_title'))}</h1>` : ''}${row('camera')}${row('location')}
    <p class="fineprint onb-perm-note" role="status" hidden>${escapeHtml(t('onb_perm_camera_denied'))}</p>
    <button type="button" class="onb-demo-link" data-act="see-demo">${escapeHtml(t('onb_see_demo'))}</button>
    <div class="onb-demo-slot" data-demo-slot role="status"></div>`;
}

/** What is on record for each switch. One reader, so the two callers agree. */
export function panelStates() {
  return {
    location: store.consent().location === true,
    camera: store.get().onboarding?.answers?.cameraPermission === 'granted',
  };
}

/** Both switches show what is actually on record, never what was last tapped. */
export function paintPanel(root) {
  for (const [key, isOn] of Object.entries(panelStates())) {
    const el = root.querySelector(`[data-perm="${key}"]`);
    if (!el) continue;
    el.setAttribute('aria-checked', String(isOn));
    el.classList.toggle('on', isOn);
  }
}

/**
 * One tap on one switch, and the record of it.
 *
 * `record(key, value)` is the caller's own write path: the welcome flow's
 * `recordAnswer` against step 24, the standalone screen's against itself.
 * Both land in the same place (`onboarding.answers`), which is what
 * `panelStates` reads, so the camera switch shows the same thing whichever
 * screen asked the question.
 *
 * Returns the camera result when the camera switch was the one tapped, so a
 * caller can act on a refusal; null for the location switch.
 */
export async function tapPermission(root, ctx, key, record) {
  if (key === 'location') {
    const after = toggleConsent(ctx.api, 'location');
    record('locationAllowed', after.location === true);
    return null;
  }
  const result = await askCamera();
  record('cameraPermission', result);
  const note = root.querySelector('.onb-perm-note');
  if (note) note.hidden = result === 'granted';
  return result;
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
  /*
   * The route already sends a written label ("Kraft Dinner Original, 225 g")
   * and it is preferred over rebuilding one, because gluing brand to name
   * printed "Kraft Kraft Dinner Original" on screen: most catalogue names
   * carry the brand already. Brand is only prefixed when the name does not
   * start with it, and only when there is no label to use.
   */
  const rawName = demo?.product?.name ? String(demo.product.name) : '';
  const rawBrand = demo?.product?.brand ? String(demo.product.brand) : '';
  const rawLabel = demo?.product?.label ? String(demo.product.label) : '';
  const joined =
    rawBrand && rawName && !rawName.toLowerCase().startsWith(rawBrand.toLowerCase())
      ? `${rawBrand} ${rawName}`
      : rawName || rawBrand;
  const label = escapeHtml(rawLabel || joined);
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

/**
 * Fetches the demo scan and paints it into the panel's own slot.
 * `identifyDemo` degrades to `null` when the route is not there yet (api.js's
 * `getSoft`), which is honest rather than something faked to fill the space --
 * the fallback line says so.
 *
 * `track` is passed in rather than imported so the caller keeps firing its own
 * events from its own screen.
 */
export async function fillDemoSlot(root, ctx, { signal, track } = {}) {
  const demoSlot = root.querySelector('[data-demo-slot]');
  if (!demoSlot) return;
  const demo = await ctx.api.identifyDemo?.();
  if (signal?.aborted) return;
  track?.('demo_scan_shown', { shown: Boolean(demo) });
  demoSlot.innerHTML = demo ? demoResultHtml(demo) : `<p class="fineprint">${escapeHtml(t('onb_demo_unavailable'))}</p>`;
}
