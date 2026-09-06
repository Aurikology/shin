/**
 * The market picker. OLMA audit rows 9, 10, 11, 78, 80: a verdict without a
 * named basis is unanchored, so this is stored and shown, even though it
 * changes nothing in the engine today. Reached from the market row on You.
 *
 * Country names only, no price or currency figures beyond the code (CAD, USD,
 * GBP), which is not price data, it is what the country uses. The three
 * options and the Canada pre-fill are drawn straight from mockups.html screen
 * 40, not invented here.
 */

import { shinSay } from '../shin.js';
import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { storagePersists, NOT_KEPT } from '../lib/persistence.js';

const MARKETS = [
  { country: 'Canada', currency: 'CAD' },
  { country: 'United States', currency: 'USD' },
  { country: 'United Kingdom', currency: 'GBP' },
];

export default {
  id: 'market',
  title: 'Where do you shop?',

  render(root, ctx) {
    const ac = new AbortController();

    function paint() {
      const current = store.market();

      /*
       * Picking a market repaints the whole screen through the store
       * subscription, which throws away the element the keyboard was standing
       * on. Without this, arrowing from Canada to the United States selected
       * correctly and then dropped focus to the document, so the next arrow key
       * scrolled the page instead of moving to the United Kingdom -- the
       * keyboard path would have been broken by the fix meant to complete it.
       * Remembered before the repaint, restored after.
       */
      const held = document.activeElement?.closest?.('[data-country]') ?? null;
      const heldAt = held
        ? Array.from(root.querySelectorAll('[data-country]')).indexOf(held)
        : -1;

      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head mkt-head">
            <button type="button" class="linky pback" data-act="back">Back</button>
            <p class="kicker">Recorded, not yet part of the comparison</p>
            <div class="mkt-say">${shinSay('asking', 'market_ask', {}, { size: 64 })}</div>
          </header>

          <div class="mkt-list" role="radiogroup" aria-label="Market">
            ${MARKETS.map((m) => `
              <button type="button" class="rowbtn mkt-row${m.country === current.country ? ' on' : ''}"
                      role="radio" aria-checked="${m.country === current.country}"
                      data-country="${escapeHtml(m.country)}" data-currency="${escapeHtml(m.currency)}">
                <span>${escapeHtml(m.country)}</span>
                <span class="rowbtn-v">${m.country === current.country ? 'Current market' : ''}</span>
              </button>`).join('')}
          </div>

          <p class="fineprint mkt-basis">Does not change a verdict yet. Recorded for when it does.</p>
          ${
            /*
             * The error state. This screen fetches nothing -- the three markets
             * are a constant in this file -- so the only way it can fail is by
             * accepting a pick it cannot keep, which store.js's persist()
             * swallows. See lib/persistence.js.
             */
            storagePersists() ? '' : `<p class="fineprint" role="status">${escapeHtml(NOT_KEPT)}</p>`
          }

          <!--
            The attribution line. One line, and it is a real control rather than
            small print: nearly everything this app knows is open data whose
            licence asks for credit, and credit nobody can reach is not credit.
            It sits on this screen because this is where a person is already
            thinking about where their prices come from.

            No animation on it. This line is on screen every time the market
            screen opens, and the screen it leads to is the rare one.
          -->
          <button type="button" class="linky mkt-attrib" data-act="licences">
            Prices and product details come from open data. See the sources and licences.
          </button>
        </div>`;

      // Re-wired on every paint, because the group's elements are new elements.
      // The listeners it adds carry the screen's abort signal, so the ones from
      // the previous paint die with the nodes they were on rather than piling
      // up: a person switching market three times used to be three paints.
      wireRadioGroup(root.querySelector('[role="radiogroup"]'), { signal: ac.signal });

      if (heldAt >= 0) {
        root.querySelectorAll('[data-country]')[heldAt]?.focus();
      }
    }

    paint();
    const unsub = store.subscribe(paint);

    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="back"]')) { ctx.go('you'); return; }
      if (e.target.closest('[data-act="licences"]')) { ctx.go('licences'); return; }
      const row = e.target.closest('[data-country]');
      if (row) store.setMarket(row.dataset.country, row.dataset.currency);
    }, ac.signal);

    return () => {
      unsub();
      ac.abort();
    };
  },
};
