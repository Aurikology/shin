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

import { PERSONALITIES, setPersonality, personality } from '../voice.js';
import { faceSvg } from '../shin.js';
import * as store from '../store.js';

export default {
  id: 'setup',
  title: 'Pick your Shin',

  render(root, ctx) {
    const current = store.get().personality ?? null;

    root.innerHTML = `
      <div class="page">
        <header class="page-head">
          <p class="kicker">One question, then the camera</p>
          <h1>Which Shin do you want?</h1>
        </header>

        <div class="atts" role="radiogroup" aria-label="Shin's attitude">
          ${PERSONALITIES.map(
            (p) => `
            <button type="button" class="att${p.id === (current ?? 'deadpan') ? ' on' : ''}"
                    role="radio" aria-checked="${p.id === (current ?? 'deadpan')}" data-who="${p.id}">
              <span class="att-face">${faceSvg(p.id === 'blunt' ? 'walk' : p.id === 'warm' ? 'good' : 'fair', {
                size: 46,
                who: p.id,
              })}</span>
              <span class="att-t">
                <b>${p.name}</b>
                <span>${p.sample}</span>
              </span>
            </button>`,
          ).join('')}
        </div>

        <p class="fineprint">
          Changeable any time. The attitude changes the words and never the number.
        </p>

        <div class="page-foot">
          <button type="button" class="cta" data-act="go">Start scanning</button>
        </div>
      </div>`;

    root.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-who]');
      if (pick) {
        setPersonality(pick.dataset.who);
        for (const el of root.querySelectorAll('.att')) {
          const on = el === pick;
          el.classList.toggle('on', on);
          el.setAttribute('aria-checked', String(on));
          // Repaint the faces so the choice is shown in the face it changes,
          // not only in the label next to it.
          const who = el.dataset.who;
          el.querySelector('.att-face').innerHTML = faceSvg(
            who === 'blunt' ? 'walk' : who === 'warm' ? 'good' : 'fair',
            { size: 46, who },
          );
        }
        return;
      }
      if (e.target.closest('[data-act="go"]')) {
        if (!store.get().personality) setPersonality('deadpan');
        store.update({ seenIntro: true });
        ctx.replace('camera');
      }
    });
  },
};
