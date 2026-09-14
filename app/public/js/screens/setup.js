/**
 * Setup, and the only question the app asks before the camera.
 *
 * Which Shin you get is the user's call. That is a recorded decision, and it
 * replaced a much worse plan in which we picked the tone for everybody and hoped.
 * It costs three variants of every string forever, which is real, and what it
 * buys is that the riskiest thing in the product stops being a guess.
 *
 * Camera permission is NOT asked here. It is asked at the first shutter press,
 * at the moment the user has decided to scan something, which is the only moment
 * the request makes sense to them.
 */

import { PERSONALITIES, personalityCopy, setPersonality, personality, say } from '../voice.js';
import { shinSay, updateShinSay } from '../shin.js';
import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { storagePersists } from '../lib/persistence.js';
import { t } from '../ui-strings.js';

/** The four offered percentages. Defined in store.js, beside the two defaults. */
const PCT_CHOICES = store.LINE_CHOICES;

function pctButton(side, n, chosen) {
  const on = n === chosen;
  return `
    <button type="button" class="pct${on ? ' on' : ''}" role="radio"
            aria-checked="${on}" data-line="${side}" data-pct="${n}">
      ${escapeHtml(t('setup_lines_percent', { n: String(n) }))}
    </button>`;
}

export default {
  id: 'setup',
  title: 'Pick your Shin',
  titleKey: 'setup_title',

  render(root, ctx) {
    const current = store.get().personality ?? null;
    const underPct = store.get().lineUnderPct ?? 10;
    const overPct = store.get().lineOverPct ?? 10;
    // Every listener on this screen goes on the persistent `#screen` element,
    // which outlives the screen. Before this, none of them came off again, so
    // camera -> setup -> camera -> setup left two live setup handlers on one
    // node and every tap ran twice. camera.js:915 is the pattern.
    const ac = new AbortController();

    root.innerHTML = `
      <div class="page">
        <header class="page-head">
          <p class="kicker">${escapeHtml(t('setup_kicker'))}</p>
          <h1>${escapeHtml(t('setup_heading'))}</h1>
        </header>

        <div class="atts atts-row" role="radiogroup" aria-label="${escapeHtml(t('you_attitude_group'))}">
          ${PERSONALITIES.map((q) => personalityCopy(q.id)).map(
            (p) => `
            <button type="button" class="att${p.id === (current ?? 'deadpan') ? ' on' : ''}"
                    role="radio" aria-checked="${p.id === (current ?? 'deadpan')}" data-who="${escapeHtml(p.id)}">
              <span class="att-say" style="flex:1 1 auto;min-width:0">
                ${shinSay('fair', 'attitude_sample', {}, { size: 'face-verdict', who: p.id })}
              </span>
              <span class="att-t"><b>${escapeHtml(p.name)}</b></span>
            </button>`,
          ).join('')}
        </div>

        <p class="fineprint">
          ${escapeHtml(t('setup_promise'))}
        </p>

        ${/*
           * The user's two lines, asked here because they are what the price
           * line's three zones are NAMED after and a zone with no number
           * behind it is a zone Shin picked. The founder's ask, 2026-09-14:
           * how far below the middle of what was found is worth it, and how
           * far above is past what they will pay. Ten and ten to start, so
           * skipping this screen is a complete answer rather than a blank.
           *
           * Same shape as the attitude picker above, deliberately: a
           * radiogroup, `wireRadioGroup` for arrow keys, the chosen button
           * carrying `.on` and `aria-checked`. A second interaction pattern
           * on the one screen the user meets first is a cost with nothing on
           * the other side of it.
           *
           * The QUESTIONS avoid "under the usual" and "over the usual", and
           * the French avoids "au-dessus du prix", because all three are on
           * the grading-word ban list that guards hard rule 2. The strings
           * and the reasoning are in ui-strings.js beside them.
           */ ''}
        <section class="lines">
          <h2>${escapeHtml(t('setup_lines_heading'))}</h2>

          <p class="line-q" id="line-under-q">${escapeHtml(t('setup_lines_under_q'))}</p>
          <div class="pcts" role="radiogroup" aria-labelledby="line-under-q"
               aria-label="${escapeHtml(t('setup_lines_under_group'))}">
            ${PCT_CHOICES.map((n) => pctButton('under', n, underPct)).join('')}
          </div>

          <p class="line-q" id="line-over-q">${escapeHtml(t('setup_lines_over_q'))}</p>
          <div class="pcts" role="radiogroup" aria-labelledby="line-over-q"
               aria-label="${escapeHtml(t('setup_lines_over_group'))}">
            ${PCT_CHOICES.map((n) => pctButton('over', n, overPct)).join('')}
          </div>

          <p class="fineprint">${escapeHtml(t('setup_lines_note'))}</p>
        </section>

        ${
          /*
           * The error state this screen was missing, and the only one it can
           * honestly have: nothing here is fetched, so there is nothing to be
           * loading. What there is, is a write that store.js swallows on
           * failure -- so in a private window this screen used to accept the
           * choice, paint it, and lose it. See lib/persistence.js.
           */
          storagePersists()
            ? ''
            : `<p class="fineprint" role="status">${escapeHtml(say('storage_not_kept'))}</p>`
        }

        <div class="page-foot">
          <button type="button" class="cta" data-act="go">${escapeHtml(t('setup_start'))}</button>
        </div>
      </div>`;

    // The group promised arrow keys in its ARIA and had none, and Tab stopped
    // on all three faces instead of entering the group once. lib/radiogroup.js.
    // Every group on this screen, not just the first. Before the two lines
    // were added there was exactly one radiogroup and `querySelector` was the
    // same thing as `querySelectorAll`; it stopped being, silently, and the
    // two new groups would have promised arrow keys in their ARIA and had
    // none. Same bug lib/radiogroup.js was written to fix in the first place.
    for (const group of root.querySelectorAll('[role="radiogroup"]')) {
      wireRadioGroup(group, { signal: ac.signal });
    }

    on(root, 'click', (e) => {
      const pct = e.target.closest('[data-pct]');
      if (pct) {
        const n = Number(pct.dataset.pct);
        // Stored under the name the price line reads, so the zone the user
        // just moved is the zone they see on the next scan. Nothing else on
        // this screen changes; there is no preview here because there is no
        // scan yet to preview against.
        store.update(pct.dataset.line === 'under' ? { lineUnderPct: n } : { lineOverPct: n });
        const row = pct.closest('[role="radiogroup"]');
        for (const el of row.querySelectorAll('.pct')) {
          const chosen = el === pct;
          el.classList.toggle('on', chosen);
          el.setAttribute('aria-checked', String(chosen));
        }
        return;
      }
      const pick = e.target.closest('[data-who]');
      if (pick) {
        setPersonality(pick.dataset.who);
        // Each button carries its own shinSay, locked to its own
        // personality's face and voice regardless of the global pick
        // (opts.who / updateShinSay's who). Choosing one morphs that one
        // button's face to `pleased` with its own pick line; every other
        // button morphs (or stays) at `fair` with its own sample line, so
        // hearing the difference before choosing still works after choosing.
        for (const el of root.querySelectorAll('.att')) {
          const on = el === pick;
          el.classList.toggle('on', on);
          el.setAttribute('aria-checked', String(on));
          const say = el.querySelector('.shin-say');
          const who = el.dataset.who;
          if (say) {
            if (on) updateShinSay(say, 'pleased', 'attitude_pick', {}, undefined, who);
            else updateShinSay(say, 'fair', 'attitude_sample', {}, undefined, who);
          }
        }
        return;
      }
      if (e.target.closest('[data-act="go"]')) {
        if (!store.get().personality) setPersonality('deadpan');
        store.update({ seenIntro: true });
        // Item 6b: the consent screen sits between this one and the camera,
        // once, ever. `main.js`'s own `firstScreen()` makes the same check on
        // a cold start; this is the warm-start version of it, taken the
        // instant setup finishes rather than on the next reload.
        ctx.replace(store.get().consentSeen ? 'camera' : 'consent');
      }
    }, ac.signal);

    return () => ac.abort();
  },
};
