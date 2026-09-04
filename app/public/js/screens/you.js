/**
 * You. Settings, and the honest account of what Shin can and cannot do.
 *
 * The coverage number here is measured by asking the engine to price every item
 * it knows, not by counting rows. A shelf count looks like coverage and is not:
 * the app once told people it could answer for seven things when it could answer
 * for two, which is overstating itself by 3.5x.
 */

import { PERSONALITIES, setPersonality, personality } from '../voice.js';
import { faceSvg } from '../shin.js';

export default {
  id: 'you',
  title: 'You',

  render(root, ctx) {
    root.innerHTML = `
      <div class="page page-list">
        <header class="page-head">
          <p class="kicker">Settings and honesty</p>
          <h1>You</h1>
        </header>

        <section class="block">
          <h2 class="block-h">Your Shin</h2>
          <div class="atts atts-row" role="radiogroup" aria-label="Shin's attitude">
            ${PERSONALITIES.map(
              (p) => `<button type="button" class="att${p.id === personality() ? ' on' : ''}"
                        role="radio" aria-checked="${p.id === personality()}" data-who="${p.id}">
                <span class="att-face">${faceSvg(p.id === 'blunt' ? 'walk' : p.id === 'warm' ? 'good' : 'fair', {
                  size: 40, who: p.id,
                })}</span>
                <span class="att-t"><b>${p.name}</b><span>${p.blurb}</span></span>
              </button>`,
            ).join('')}
          </div>
        </section>

        <section class="block">
          <h2 class="block-h">What I can actually answer</h2>
          <div class="coverage" data-coverage>
            <p class="fineprint">Asking the engine…</p>
          </div>
        </section>

        <section class="block">
          <h2 class="block-h">Appearance</h2>
          <button type="button" class="rowbtn" data-act="theme">
            <span>Theme</span><span class="rowbtn-v" data-theme-v></span>
          </button>
        </section>

        <div class="page-foot">
          <button type="button" class="mini-shutter" data-act="camera" aria-label="Scan something"></button>
        </div>
      </div>`;

    const THEMES = ['system', 'light', 'dark'];
    function currentTheme() {
      try { return localStorage.getItem('shin.theme') ?? 'system'; } catch { return 'system'; }
    }
    function paintTheme() {
      root.querySelector('[data-theme-v]').textContent = currentTheme();
    }
    paintTheme();

    ctx.api.catalogue().then((c) => {
      const box = root.querySelector('[data-coverage]');
      if (!box) return;
      const refused = c.items.length - c.answerableCount;
      box.innerHTML = `
        <p class="cov-big"><b>${c.answerableCount}</b> of ${c.items.length}</p>
        <p class="fineprint">
          ${refused} of the things I know about, I will refuse on, because the evidence behind them
          is not enough to call. That is measured by pricing every one of them, not counted off a list.
        </p>
        <div class="covlist">
          ${c.items
            .map(
              (i) => `<div class="covrow">
                <span>${i.label}</span>
                <span class="${i.answerable ? 'yes' : 'no'}">${i.answerable ? 'can answer' : 'refuses'}</span>
              </div>`,
            )
            .join('')}
        </div>`;
    }).catch(() => {
      const box = root.querySelector('[data-coverage]');
      if (box) box.innerHTML = `<p class="fineprint">I could not reach my own engine to check.</p>`;
    });

    root.addEventListener('click', (e) => {
      const who = e.target.closest('[data-who]');
      if (who) {
        setPersonality(who.dataset.who);
        for (const el of root.querySelectorAll('.att')) {
          const on = el === who;
          el.classList.toggle('on', on);
          el.setAttribute('aria-checked', String(on));
        }
        return;
      }
      if (e.target.closest('[data-act="theme"]')) {
        const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
        if (next === 'system') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = next;
        try { localStorage.setItem('shin.theme', next); } catch { /* private window */ }
        paintTheme();
        return;
      }
      if (e.target.closest('[data-act="camera"]')) ctx.go('camera');
    });
  },
};
