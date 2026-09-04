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

import { faceBlock } from '../shin.js';
import { say } from '../voice.js';
import * as store from '../store.js';

const MARKETS = [
  { country: 'Canada', currency: 'CAD' },
  { country: 'United States', currency: 'USD' },
  { country: 'United Kingdom', currency: 'GBP' },
];

export default {
  id: 'market',
  title: 'Where do you shop?',

  render(root, ctx) {
    function paint() {
      const current = store.market();

      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head mkt-head">
            <button type="button" class="linky pback" data-act="back">Back</button>
            ${faceBlock('asking', { size: 'face-page' })}
            <p class="kicker">Every verdict is measured against this</p>
            <h1>${say('market_ask')}</h1>
          </header>

          <div class="mkt-list" role="radiogroup" aria-label="Market">
            ${MARKETS.map((m) => `
              <button type="button" class="rowbtn mkt-row${m.country === current.country ? ' on' : ''}"
                      role="radio" aria-checked="${m.country === current.country}"
                      data-country="${m.country}" data-currency="${m.currency}">
                <span>${m.country}</span>
                <span class="rowbtn-v">${m.country === current.country ? 'Current market' : ''}</span>
              </button>`).join('')}
          </div>

          <p class="fineprint mkt-basis">Price verdicts are judged against typical prices in this market.</p>
        </div>`;
    }

    paint();
    const unsub = store.subscribe(paint);

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) { ctx.go('you'); return; }
      const row = e.target.closest('[data-country]');
      if (row) store.setMarket(row.dataset.country, row.dataset.currency);
    });

    return unsub;
  },
};
