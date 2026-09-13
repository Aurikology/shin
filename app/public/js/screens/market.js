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
import { storagePersists } from '../lib/persistence.js';
import { say } from '../voice.js';
import { pageBar, backButton, goBack, rowCheck } from '../lib/pagebar.js';
import { t } from '../ui-strings.js';

/**
 * The three markets. `country` is the STORED value and stays English in every
 * language: it is what `store.market()` writes, what the You screen's market
 * row reads back, and what a future server comparison would key on, so
 * translating it would silently fork the data on the language the person
 * happened to be using when they picked. `key` is how the row is labelled on
 * screen, which is the half a reader sees. That split is the same one the
 * screen titles make (`title` English, `titleKey` translated).
 */
const MARKETS = [
  { country: 'Canada', currency: 'CAD', key: 'country_ca' },
  { country: 'United States', currency: 'USD', key: 'country_us' },
  { country: 'United Kingdom', currency: 'GBP', key: 'country_gb' },
];

/** A stored country value, as it should read on screen. */
export function countryLabel(country) {
  const row = MARKETS.find((m) => m.country === country);
  return row ? t(row.key) : country;
}

/**
 * The same country, in the form that follows "in" / the French preposition.
 *
 * Two keys per country rather than a name plus a preposition glued in front of
 * it, because French contracts the preposition with the article and the
 * contraction depends on the country's own gender and number: "au Canada" but
 * "aux Etats-Unis". A sentence assembled as `${prep} ${name}` is wrong for one
 * of the three, and which one it is wrong for is invisible from the call site.
 * Whole phrases cannot be wrong that way.
 */
export function countryIn(country) {
  const row = MARKETS.find((m) => m.country === country);
  return row ? t(`${row.key}_in`) : country;
}

export default {
  id: 'market',
  title: 'Where do you shop?',
  titleKey: 'market_title',

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
            ${backButton()}
            <p class="kicker">${escapeHtml(t('market_kicker'))}</p>
            <div class="mkt-say">${shinSay('asking', 'market_ask', {}, { size: 64 })}</div>
          </header>

          <div class="mkt-list ilist" role="radiogroup" aria-label="${escapeHtml(t('you_market'))}">
            ${MARKETS.map((m) => `
              <button type="button" class="ilist-row mkt-row${m.country === current.country ? ' on' : ''}"
                      role="radio" aria-checked="${m.country === current.country}"
                      data-country="${escapeHtml(m.country)}" data-currency="${escapeHtml(m.currency)}">
                <span class="ilist-l">${escapeHtml(t(m.key))}</span>
                ${rowCheck()}
              </button>`).join('')}
          </div>

          <p class="fineprint mkt-basis">${escapeHtml(t('market_caption'))}</p>
          ${
            /*
             * The error state. This screen fetches nothing -- the three markets
             * are a constant in this file -- so the only way it can fail is by
             * accepting a pick it cannot keep, which store.js's persist()
             * swallows. See lib/persistence.js.
             */
            storagePersists() ? '' : `<p class="fineprint" role="status">${escapeHtml(say('storage_not_kept'))}</p>`
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
            ${escapeHtml(t('market_sources_button'))}
          </button>

          ${pageBar('you')}
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
      // You is the only way in, so the browser's own back already lands there.
      if (e.target.closest('[data-act="back"]')) { goBack(ctx, 'you'); return; }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="watchlist"]')) { ctx.go('watchlist'); return; }
      if (e.target.closest('[data-act="you"]')) { ctx.go('you'); return; }
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
