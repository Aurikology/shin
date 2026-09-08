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

import { PERSONALITIES, setPersonality, personality, say } from '../voice.js';
import { shinSay, updateShinSay } from '../shin.js';
import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { storagePersists } from '../lib/persistence.js';

export default {
  id: 'setup',
  title: 'Pick your Shin',

  render(root, ctx) {
    const current = store.get().personality ?? null;
    // Every listener on this screen goes on the persistent `#screen` element,
    // which outlives the screen. Before this, none of them came off again, so
    // camera -> setup -> camera -> setup left two live setup handlers on one
    // node and every tap ran twice. camera.js:915 is the pattern.
    const ac = new AbortController();

    root.innerHTML = `
      <div class="page">
        <header class="page-head">
          <p class="kicker">One question, then the camera</p>
          <h1>Which Shin do you want?</h1>
        </header>

        <div class="atts atts-row" role="radiogroup" aria-label="Shin's attitude">
          ${PERSONALITIES.map(
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
          Changeable any time. The attitude changes the words and never the number.
        </p>

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
          <button type="button" class="cta" data-act="go">Start scanning</button>
        </div>
      </div>`;

    // The group promised arrow keys in its ARIA and had none, and Tab stopped
    // on all three faces instead of entering the group once. lib/radiogroup.js.
    wireRadioGroup(root.querySelector('[role="radiogroup"]'), { signal: ac.signal });

    on(root, 'click', (e) => {
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
        ctx.replace('camera');
      }
    }, ac.signal);

    return () => ac.abort();
  },
};
