/**
 * The permission ask, as a screen of its own.
 *
 * WHY IT EXISTS. It was step 24 of the welcome flow and nothing else, so
 * switching the welcome flow off took the camera and location ask off with
 * it. `docs/mvp-plan.md` asks for the flow off and the permission ask kept,
 * and that is not a flag: it is this extraction, which is why it was called
 * the one blocker in that plan's build order (notes/catch-up.md, 2026-09-21).
 * The panel itself lives in `permissions-panel.js`, drawn here and in the
 * welcome flow from one source, so the two can never say different things.
 *
 * WHAT THIS FILE ADDS ON TOP OF THE PANEL. The page chrome, the once-ever
 * flag, and where Continue goes. Nothing else: the switches, the phone's own
 * prompt, the denied note and item 19's demo card are all the panel's.
 *
 * NOTHING HERE BLOCKS THE APP, the same rule the welcome flow and the consent
 * screen both hold. Continue works with both switches off, there is no
 * "Allow" and no quieter "Not now", and neither switch is a condition of
 * reaching the camera. Camera permission is still asked for real at the first
 * shutter press (main.js's header); this screen asks early because the owner
 * asked for it on screen 24, and an early no is not a refusal to serve.
 *
 * ONCE, EVER. `permissionsSeen` gates whether a launch lands here, the same
 * shape `consentSeen` uses and deliberately not folded into it: they are two
 * different questions and a half-finished first launch has to be able to say
 * which one it reached.
 *
 * ALL TEXT IS CHROME, `t(...)`, no attitude variants, and it is the welcome
 * flow's own `onb_perm_*` keys, shared rather than copied.
 */

import * as store from '../store.js';
import { track } from '../track.js';
import { escapeHtml, on } from '../lib/dom.js';
import { t } from '../ui-strings.js';
import { recordAnswer, firstScreen } from '../onboarding-flow.js';
import { FLAGS } from '../flags.js';
import { panelHtml, paintPanel, tapPermission, fillDemoSlot } from '../permissions-panel.js';

const DEPS = { store, track };

export default {
  id: 'permissions',
  title: 'Permissions',
  titleKey: 'perm_title',

  render(root, ctx) {
    const ac = new AbortController();

    root.innerHTML = `
      <div class="page perm-page">
        <header class="page-head">
          <p class="kicker">${escapeHtml(t('perm_kicker'))}</p>
        </header>
        <div class="onb-body">${panelHtml()}</div>
        <div class="page-foot">
          <button type="button" class="cta" data-act="go">${escapeHtml(t('onb_continue'))}</button>
        </div>
      </div>`;

    paintPanel(root);

    on(root, 'click', async (e) => {
      /* D23: the whole row is the target, not only the small switch inside it. */
      const perm = e.target.closest('[data-perm-row]');
      if (perm) {
        /* Recorded under this screen's own name, into the same
           `onboarding.answers` the welcome flow writes, which is what the
           panel reads back: whichever screen asked, the switch shows the
           same answer. A screen that was left while the phone was still
           deciding records nothing, as step 24 has always behaved. */
        await tapPermission(root, ctx, perm.dataset.permRow, (key, value) => {
          if (!ac.signal.aborted) recordAnswer(DEPS, 'permissions', key, value);
        });
        if (ac.signal.aborted) return;
        paintPanel(root);
        return;
      }

      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'see-demo') {
        await fillDemoSlot(root, ctx, { signal: ac.signal, track });
        return;
      }
      if (act === 'go') {
        store.setPermissionsSeen();
        /* Where a launch would go now that this screen is answered. Asking
           the flow rather than naming a screen keeps the launch order in one
           place (onboarding-flow.js), so consent cannot be skipped by
           arriving here. `onboarding: false` whatever the real flag says:
           this screen is downstream of the welcome flow either way, and
           Continue must never bounce anyone back into it. */
        ctx.replace(firstScreen(store.get(), { ...FLAGS, onboarding: false }));
      }
    }, ac.signal);

    return () => ac.abort();
  },
};
