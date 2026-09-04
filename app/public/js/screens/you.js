/**
 * You. Settings, and the honest account of what Shin can and cannot do.
 *
 * The coverage number here is measured by asking the engine to price every item
 * it knows, not by counting rows. A shelf count looks like coverage and is not:
 * the app once told people it could answer for seven things when it could answer
 * for two, which is overstating itself by 3.5x.
 *
 * GAMIFICATION.md rules what is on this page: no streak, no badges, no
 * leaderboard, no saved-money tally. The weekly line (mechanic M16) reads the
 * user's own record back to them, computed from `store.js`'s `history`,
 * nothing projected and nothing ranked. OLMA audit rows 76, 77, 80, 82, 84, 85,
 * 86 cover the rest of this page: the market row and its basis, the honest
 * scan allowance (unlimited, meter off), the privacy line adapted to what this
 * app actually sends, a report-a-wrong-price row, legal placeholders that are
 * visibly placeholders, the paywall as a deliberate row rather than an
 * interruption, and a build footer.
 */

import { PERSONALITIES, setPersonality, personality } from '../voice.js';
import { faceSvg } from '../shin.js';
import * as store from '../store.js';

/**
 * GAMIFICATION.md mechanic M16, "N scanned this week, M I could call": both
 * numbers come from `store.weeklyStats()`, which reads `history` and never a
 * saved-money figure. Zero scans this week is stated plainly, not hidden.
 */
function weeklyLine() {
  const { scanned, callable } = store.weeklyStats();
  if (scanned === 0) return 'Nothing scanned this week.';
  return `${scanned} scanned this week. ${callable} I could call.`;
}

export default {
  id: 'you',
  title: 'You',

  render(root, ctx) {
    const market = store.market();

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
                <span class="att-face">${faceSvg('fair', { size: 'face-page', who: p.id })}</span>
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

        <section class="block">
          <h2 class="block-h">This week</h2>
          <div class="weekcard">
            <p>${weeklyLine()}</p>
          </div>
        </section>

        <section class="block">
          <h2 class="block-h">Market</h2>
          <button type="button" class="rowbtn" data-act="market">
            <span>${market.country}</span>
            <span class="rowbtn-v">Change</span>
          </button>
          <p class="fineprint">Price verdicts are judged against typical prices in this market.</p>
        </section>

        <section class="block">
          <h2 class="block-h">Scanning</h2>
          <p class="fineprint">
            No daily limit right now. Nothing is metered in this build; if that changes, the
            allowance will be one number, written once, shown wherever it applies.
          </p>
        </section>

        <section class="block">
          <h2 class="block-h">Privacy</h2>
          <p class="fineprint">
            Everything stays on this device. Nothing is sent anywhere but the local server that
            answers a scan.
          </p>
        </section>

        <section class="block">
          <h2 class="block-h">Get in touch</h2>
          <button type="button" class="rowbtn" data-act="report">
            <span>Report a wrong price</span>
            <span class="rowbtn-v">Fastest fix</span>
          </button>
        </section>

        <section class="block">
          <h2 class="block-h">Legal</h2>
          <div class="rowbtn rowbtn-static" aria-disabled="true">
            <span>Privacy policy</span>
            <span class="rowbtn-v placeholder">Placeholder, not written yet</span>
          </div>
          <div class="rowbtn rowbtn-static" aria-disabled="true">
            <span>Terms of use</span>
            <span class="rowbtn-v placeholder">Placeholder, not written yet</span>
          </div>
          <div class="rowbtn rowbtn-static" aria-disabled="true">
            <span>Pricing</span>
            <span class="rowbtn-v placeholder">Undecided</span>
          </div>
        </section>

        <p class="fineprint buildline">Build ${
          ctx.build ?? 'unknown'
        } · hand-set in main.js, not read from a running server.</p>

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
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="market"]')) { ctx.go('market'); return; }
      if (e.target.closest('[data-act="report"]')) ctx.go('correct', {});
    });
  },
};
