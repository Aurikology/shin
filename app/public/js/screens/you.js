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
 * app actually sends, a report-a-wrong-price row, the legal position, and a
 * build footer.
 *
 * TWO THINGS CHANGED HERE IN THE 2026-09-06 PASS, both from FLAWS.md.
 *
 * The section labels are headings again. FLAWS.md item 6: `.block-h` is 10px
 * mono uppercase, which DESIGN.md section 2 reserves for provenance -- "Mono
 * earns its place because honesty about sources is the product" -- and this
 * screen alone spent that signal ten times on the word "Appearance" and its
 * neighbours. There are four headings now, in Instrument Sans, sentence case,
 * and mono uppercase on this screen means a source or a date again. The six
 * that went were labels over a single row that already said its own name.
 *
 * The three placeholder rows are gone. They said "not written yet" twice and
 * "not decided yet" once, in a dashed box, on a shipping surface. Their
 * replacement is one paragraph that says the same thing as a sentence rather
 * than as three pieces of dead furniture.
 */

import { PERSONALITIES, setPersonality, personality } from '../voice.js';
import { faceSvg, shinSay } from '../shin.js';
import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { storagePersists, NOT_KEPT } from '../lib/persistence.js';

/**
 * The three themes, and the reason this is a radio group and not the cycling
 * button it was.
 *
 * It used to be a `.rowbtn` that advanced system -> light -> dark on each tap
 * and printed the new value on the right. To a screen reader that is a button
 * named "Theme" whose state is a separate text node it has no reason to
 * announce, with no way to know what the other options are or that pressing
 * again does something different -- and no `aria-pressed`, because a three-way
 * cycle is not a two-state toggle and `aria-pressed` would have been a lie.
 * The control has three exclusive options, which is what a radio group is, and
 * the screen already has two of them, so it costs nothing new to learn.
 */
const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export default {
  id: 'you',
  title: 'You',

  render(root, ctx) {
    const market = store.market();
    const weekly = store.weeklyStats();
    const weekProud = store.goodFindThisWeek();
    const weekState = weekProud ? 'proud' : 'fair';
    const weekAnim = weekProud ? 'proud-hold' : 'idle-breath';
    const ac = new AbortController();

    function currentTheme() {
      try { return localStorage.getItem('shin.theme') ?? 'system'; } catch { return 'system'; }
    }
    const theme = currentTheme();

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
          <h2 class="sect-h">Your Shin</h2>
          <div class="atts atts-row" role="radiogroup" aria-label="Shin's attitude">
            ${PERSONALITIES.map(
              (p) => `<button type="button" class="att${p.id === personality() ? ' on' : ''}"
                        role="radio" aria-checked="${p.id === personality()}" data-who="${escapeHtml(p.id)}">
                <span class="att-face">${faceSvg('fair', { size: 'face-row', who: p.id })}</span>
                <span class="att-t"><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.blurb)}</span></span>
              </button>`,
            ).join('')}
          </div>
        </section>

        <section class="block">
          <h2 class="sect-h">What I can actually answer</h2>
          <div class="coverage" data-coverage aria-live="polite" aria-busy="true">
            <p class="fineprint">Asking the engine…</p>
          </div>
        </section>

        <section class="block">
          <h2 class="sect-h">Settings</h2>

          <div class="setting">
            <span class="setting-t" id="you-theme-l">Theme</span>
            <div class="seg" role="radiogroup" aria-labelledby="you-theme-l">
              ${THEMES.map(
                (t) => `<button type="button" class="btn seg-o${t.id === theme ? ' on' : ''}"
                          role="radio" aria-checked="${t.id === theme}" data-theme="${t.id}">${t.label}</button>`,
              ).join('')}
            </div>
          </div>

          <button type="button" class="rowbtn" data-act="buzz" aria-pressed="${store.buzzOn()}">
            <span>Buzz on verdicts</span><span class="rowbtn-v" data-buzz-v></span>
          </button>
          <p class="fineprint">A short buzz when a verdict or a refusal lands, on by default.</p>

          <button type="button" class="rowbtn" data-act="market">
            <span>Market</span>
            <span class="rowbtn-v">${escapeHtml(market.country)}</span>
          </button>
          <p class="fineprint">Price verdicts are judged against typical prices in this market.</p>
        </section>

        <section class="block">
          <h2 class="sect-h">What I do with your data</h2>
          <p class="fineprint">
            Everything stays on this device. Nothing is sent anywhere but the local server that
            answers a scan.
          </p>
          <p class="fineprint">
            No daily limit right now. Nothing is metered in this build; if that changes, the
            allowance will be one number, written once, shown wherever it applies.
          </p>
          <!--
            What used to be three rows here -- "Privacy policy / not written yet",
            "Terms of use / not written yet", "Pricing / not decided yet" -- is now
            this one sentence. FLAWS.md's standing complaint about this screen is
            that it reads like a settings page nobody decided the sections of, and
            three dashed boxes announcing their own emptiness are the clearest case
            of it: a row that exists to say it has no content is worse than no row.
            Pricing in particular could not be fixed by writing better copy for it,
            because docs/decisions.md ("Scans are not metered in v1") means there is
            deliberately nothing to write. That decision is not an embarrassment to
            hide behind a placeholder; said plainly, it is the paragraph above.
          -->
          <p class="fineprint">
            There is no privacy policy page and no terms page. When there is something legal
            worth reading, it will be here; until then the two paragraphs above are the whole
            of what I do.
          </p>
          ${
            /*
             * The one error state this screen can honestly report about itself.
             * The coverage block above already covers the engine; this covers
             * the device. See lib/persistence.js.
             */
            storagePersists() ? '' : `<p class="fineprint" role="status">${escapeHtml(NOT_KEPT)}</p>`
          }
        </section>

        <section class="block">
          <button type="button" class="rowbtn" data-act="report">
            <span>Report a wrong price</span>
            <span class="rowbtn-v">Fastest fix</span>
          </button>
        </section>

        <p class="fineprint buildline">Build ${escapeHtml(
          ctx.build ?? 'unknown',
        )} · hand-set in main.js, not read from a running server.</p>

        <div class="page-foot">
          <button type="button" class="mini-shutter" data-act="camera" aria-label="Scan something"></button>
        </div>
      </div>`;

    function paintBuzz() {
      const row = root.querySelector('[data-act="buzz"]');
      const on = store.buzzOn();
      root.querySelector('[data-buzz-v]').textContent = on ? 'On' : 'Off';
      // The row is a two-state toggle, so `aria-pressed` is the honest thing to
      // say about it -- unlike the theme control above, which has three states
      // and is a radio group for that reason.
      if (row) row.setAttribute('aria-pressed', String(on));
    }
    paintBuzz();

    // Both attitude and theme are radio groups whose ARIA promised arrow keys.
    for (const g of root.querySelectorAll('[role="radiogroup"]')) {
      wireRadioGroup(g, { signal: ac.signal });
    }

    ctx.api.catalogue().then((c) => {
      const box = root.querySelector('[data-coverage]');
      if (!box) return;
      const refused = c.items.length - c.answerableCount;
      box.setAttribute('aria-busy', 'false');
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
                <span>${escapeHtml(i.label)}</span>
                <span class="${i.answerable ? 'yes' : 'no'}">${i.answerable ? 'can answer' : 'refuses'}</span>
              </div>`,
            )
            .join('')}
        </div>`;
    }).catch(() => {
      const box = root.querySelector('[data-coverage]');
      if (!box) return;
      box.setAttribute('aria-busy', 'false');
      box.innerHTML = `<p class="fineprint">I could not reach my own engine to check.</p>`;
    });

    on(root, 'click', (e) => {
      const who = e.target.closest('[data-who]');
      if (who) {
        setPersonality(who.dataset.who);
        for (const el of root.querySelectorAll('.att')) {
          const picked = el === who;
          el.classList.toggle('on', picked);
          el.setAttribute('aria-checked', String(picked));
        }
        return;
      }
      const themeOpt = e.target.closest('[data-theme]');
      if (themeOpt) {
        const next = themeOpt.dataset.theme;
        if (next === 'system') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = next;
        try { localStorage.setItem('shin.theme', next); } catch { /* private window; see lib/persistence.js */ }
        for (const el of root.querySelectorAll('.seg-o')) {
          const picked = el === themeOpt;
          el.classList.toggle('on', picked);
          el.setAttribute('aria-checked', String(picked));
        }
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
    }, ac.signal);

    return () => ac.abort();
  },
};
