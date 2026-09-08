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
import { faceSvg, shinSay } from '../shin.js';
import * as store from '../store.js';

export default {
  id: 'you',
  title: 'You',

  render(root, ctx) {
    const market = store.market();
    const weekly = store.weeklyStats();
    const weekProud = store.goodFindThisWeek();
    const weekState = weekProud ? 'proud' : 'fair';
    const weekAnim = weekProud ? 'proud-hold' : 'idle-breath';

    root.innerHTML = `
      <div class="page page-list">
        <header class="page-head">
          <p class="kicker">Settings and honesty</p>
          <h1>You</h1>
        </header>

        <section class="block block-week">
          ${shinSay(weekState, 'you_weekly', { scanned: weekly.scanned, callable: weekly.callable }, { size: 64, anim: weekAnim })}
        </section>

        <section class="block">
          <h2 class="block-h">Your Shin</h2>
          <div class="atts atts-row" role="radiogroup" aria-label="Shin's attitude">
            ${PERSONALITIES.map(
              (p) => `<button type="button" class="att${p.id === personality() ? ' on' : ''}"
                        role="radio" aria-checked="${p.id === personality()}" data-who="${p.id}">
                <span class="att-face">${faceSvg('fair', { size: 'face-row', who: p.id })}</span>
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
          <h2 class="block-h">What I have actually answered</h2>
          <div class="coverage" data-scanlog>
            <p class="fineprint">Reading the scan log…</p>
          </div>
        </section>

        <section class="block">
          <h2 class="block-h">Appearance</h2>
          <button type="button" class="rowbtn" data-act="theme">
            <span>Theme</span><span class="rowbtn-v" data-theme-v></span>
          </button>
        </section>

        <section class="block">
          <h2 class="block-h">Notifications</h2>
          <button type="button" class="rowbtn" data-act="buzz">
            <span>Buzz on verdicts</span><span class="rowbtn-v" data-buzz-v></span>
          </button>
          <p class="fineprint">A short buzz when a verdict or a refusal lands, on by default.</p>
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
            <span class="rowbtn-v placeholder">not written yet</span>
          </div>
          <div class="rowbtn rowbtn-static" aria-disabled="true">
            <span>Terms of use</span>
            <span class="rowbtn-v placeholder">not written yet</span>
          </div>
          <div class="rowbtn rowbtn-static" aria-disabled="true">
            <span>Pricing</span>
            <span class="rowbtn-v placeholder">not decided yet</span>
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

    function paintBuzz() {
      root.querySelector('[data-buzz-v]').textContent = store.buzzOn() ? 'On' : 'Off';
    }
    paintBuzz();

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

    /*
     * The scan log, read back.
     *
     * WHY THIS IS A DIFFERENT NUMBER FROM THE WEEKLY LINE AT THE TOP. That one
     * is this phone's own history out of localStorage: what you saw. This is
     * the server's record of what was asked of the catalogue, across every
     * device that has ever asked. They will not agree and are not meant to, so
     * this block says whose scans it is counting rather than leaving two
     * numbers on one screen to quietly contradict each other.
     *
     * AND WHY EVERY RATE HERE CAN SAY "not yet". A share over no scans is
     * unknown, not zero, and printing 0% for it would be this app claiming a
     * measured failure it has not measured. `null` comes back from the server
     * for exactly that case and `pct` turns it into words, never a number.
     */
    const pct = (r) => (r === null || r === undefined ? null : `${Math.round(r * 100)}%`);
    ctx.api.scans().then((s) => {
      const box = root.querySelector('[data-scanlog]');
      if (!box) return;
      if (s.scans === 0) {
        box.innerHTML = `<p class="fineprint">
          Nothing scanned yet${s.dropped ? `, and the log could not be written: ${s.droppedWhy}` : ''}.
          Every scan from now on is written down, so these numbers start the first time you point
          me at something.
        </p>`;
        return;
      }
      const named = pct(s.namedRate);
      const mine = s.thisDevice;
      box.innerHTML = `
        <p class="cov-big"><b>${named ?? 'not yet'}</b> named</p>
        <p class="fineprint">
          Out of ${s.scans} scan${s.scans === 1 ? '' : 's'} anyone has made, that is how often I
          could say what the thing was. Being able to name it is not the same as being able to
          price it, and this number is the first one, which is the larger of the two.
        </p>
        <div class="covlist">
          ${s.perKind
            .map(
              // No yes/no class on these. Those two mean "can answer" and
              // "refuses" on the coverage list above, and borrowing them here
              // set a percentage in a different size and colour from the
              // percentage on the row under it, which reads as two different
              // kinds of number when it is one kind.
              (k) => `<div class="covrow">
                <span>${k.kind === 'barcode' ? 'Barcode' : k.kind === 'text' ? 'Typed' : 'Photo'}
                  · ${k.scans}</span>
                <span>${pct(k.rate) ?? 'not yet'}</span>
              </div>`,
            )
            .join('')}
          <div class="covrow">
            <span>Corrections per hundred named</span>
            <span>${s.correctionsPerHundred === null ? 'not yet' : Math.round(s.correctionsPerHundred)}</span>
          </div>
          <div class="covrow">
            <span>Back in week two</span>
            <span>${
              s.secondWeekReturn.rate === null
                ? `nobody is two weeks old`
                : `${pct(s.secondWeekReturn.rate)} of ${s.secondWeekReturn.eligible}`
            }</span>
          </div>
          <div class="covrow">
            <span>Yours this week</span>
            <span>${mine ? `${mine.scansThisWeek} scan${mine.scansThisWeek === 1 ? '' : 's'}, ${mine.named} named` : 'unknown'}</span>
          </div>
        </div>
        ${
          s.dropped
            ? `<p class="fineprint">${s.dropped} scan${s.dropped === 1 ? '' : 's'} could not be written down: ${s.droppedWhy}. The numbers above are missing them.</p>`
            : ''
        }`;
    }).catch(() => {
      const box = root.querySelector('[data-scanlog]');
      if (box) box.innerHTML = `<p class="fineprint">I could not read my own scan log.</p>`;
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
      if (e.target.closest('[data-act="buzz"]')) {
        store.setBuzz(!store.buzzOn());
        paintBuzz();
        return;
      }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="market"]')) { ctx.go('market'); return; }
      if (e.target.closest('[data-act="report"]')) ctx.go('correct', {});
    });
  },
};
