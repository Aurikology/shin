/**
 * The market picker. OLMA audit rows 9, 10, 11, 78, 80, and Google Doc audit
 * rows 14, 15, 34: a verdict without a named basis is unanchored, so the
 * country (and, where it changes prices, the region) is stored, shown, and sent
 * with every scan. Reached from the market row on You.
 *
 * Every country in the world, alphabetised in the reader's language, filtered
 * as they type, each with its ISO 3166 code and currency code (not price data:
 * it is what the country uses). Nothing is pre-selected: a fresh user has no
 * country, and a country is never assumed.
 */

import { shinSay } from '../shin.js';
import * as store from '../store.js';
import { escapeHtml, on } from '../lib/dom.js';
import { wireRadioGroup } from '../lib/radiogroup.js';
import { storagePersists } from '../lib/persistence.js';
import { say } from '../voice.js';
import { pageBar, backButton, goBack, rowCheck } from '../lib/pagebar.js';
import { t } from '../ui-strings.js';
import { locale } from '../lib/locale.js';
import {
  findCountry, countryName, countryInPhrase, searchCountries, regionsOf, findRegion, regionLabel,
} from '../lib/countries.js';

/**
 * Every country in the world (`lib/countries.js`), not three. `country` is the
 * STORED value and stays English in every language: it is what `store.market()`
 * writes, what the You screen's market row reads back, and what a server
 * comparison keys on, so translating it would silently fork the data on the
 * language the person happened to be using when they picked. What a reader sees
 * is the name in their own language, worked out from it here. That split is the
 * same one the screen titles make (`title` English, `titleKey` translated).
 */

/** The reader's language as `lib/countries.js` names it: 'fr' or 'en'. */
function lang() {
  return locale() === 'fr' ? 'fr' : 'en';
}

/**
 * A stored country value, as it should read on screen. A value the table does
 * not know is shown as stored, never hidden or replaced.
 */
export function countryLabel(country) {
  const found = findCountry(country);
  return found ? countryName(found, lang()) : country;
}

/**
 * The same country, in the form that follows "in" / the French preposition:
 * "in Canada", "au Canada", "aux États-Unis", "en France".
 *
 * A whole phrase per country rather than a name plus a preposition glued in
 * front of it, because French contracts the preposition with the article and the
 * contraction depends on the country's own gender and number ("au Canada",
 * "aux États-Unis", "en France"). The preposition is data in the table, so no
 * call site assembles it and none can get it wrong.
 */
export function countryIn(country) {
  const found = findCountry(country);
  return found ? countryInPhrase(found, lang()) : country;
}

/** A stored region (English name) as it reads in the reader's language. */
export function regionText(market) {
  return market?.region ? regionLabel(findCountry(market.code || market.country)?.code, market.region, lang()) : '';
}

export default {
  id: 'market',
  title: 'Where do you shop?',
  titleKey: 'market_title',

  render(root, ctx) {
    const ac = new AbortController();

    /** What the person has typed in the search box. Kept across repaints. */
    let query = '';

    /*
     * The screen is built ONCE, and only the two lists inside it are repainted.
     * The search box lives in the shell, so a repaint on every store change (a
     * pick, a region) never throws away the element the person is typing in.
     * The lists are repainted in place and keep the keyboard where it was: the
     * arrow-key path used to break when a pick rebuilt the row it stood on.
     */
    function shell() {
      root.innerHTML = `
        <div class="page page-list">
          <header class="page-head mkt-head">
            ${backButton()}
            <p class="kicker">${escapeHtml(t('market_kicker'))}</p>
            <div class="mkt-say">${shinSay('asking', 'market_ask', {}, { size: 64 })}</div>
          </header>

          <label class="mkt-search">
            <span class="sr-only">${escapeHtml(t('market_search'))}</span>
            <input type="search" class="field mkt-q" data-q autocomplete="off" autocapitalize="off"
                   spellcheck="false" enterkeyhint="search"
                   placeholder="${escapeHtml(t('market_search'))}" value="${escapeHtml(query)}">
          </label>
          <p class="fineprint mkt-now" data-now role="status"></p>

          <div class="mkt-list ilist" role="radiogroup" data-list aria-label="${escapeHtml(t('you_market'))}"></div>
          <p class="fineprint mkt-none" data-none role="status" hidden>${escapeHtml(t('market_none'))}</p>

          <section class="mkt-regions" data-regions hidden>
            <p class="kicker">${escapeHtml(t('market_region_kicker'))}</p>
            <div class="mkt-list ilist" role="radiogroup" data-region-list aria-label="${escapeHtml(t('market_region_kicker'))}"></div>
            <p class="fineprint">${escapeHtml(t('market_region_caption'))}</p>
          </section>

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

    }

    /** Rows for a list, and the keyboard put back where it was after the repaint. */
    function fill(group, rows, attr, sync) {
      const held = document.activeElement?.closest?.(`[${attr}]`) ?? null;
      const heldValue = held && group.contains(held) ? held.getAttribute(attr) : null;
      group.innerHTML = rows;
      sync();
      if (heldValue !== null) {
        Array.from(group.querySelectorAll(`[${attr}]`)).find((el) => el.getAttribute(attr) === heldValue)?.focus();
      }
    }

    let syncCountries = () => {};
    let syncRegions = () => {};

    /** The country list, filtered by what was typed, alphabetised in the reader's language. */
    function paintCountries() {
      const current = store.market();
      const chosen = findCountry(current.code || current.country);
      const list = searchCountries(query, lang());
      const group = root.querySelector('[data-list]');
      fill(group, list.map((c) => {
        const on = chosen?.code === c.code;
        return `
          <button type="button" class="ilist-row mkt-row${on ? ' on' : ''}"
                  role="radio" aria-checked="${on}"
                  data-country="${escapeHtml(c.en)}" data-currency="${escapeHtml(c.currency)}" data-code="${escapeHtml(c.code)}">
            <span class="ilist-l">${escapeHtml(countryName(c, lang()))}</span>
            <span class="ilist-v">${escapeHtml(c.code)} &middot; ${escapeHtml(c.currency)}</span>
            ${rowCheck()}
          </button>`;
      }).join(''), 'data-code', syncCountries);
      root.querySelector('[data-none]').hidden = list.length > 0;
      // The person's own pick, always in view: with 240 rows the tick can be far down.
      const now = root.querySelector('[data-now]');
      now.textContent = chosen
        ? `${countryName(chosen, lang())} (${chosen.code}, ${chosen.currency})${regionText(current) ? `, ${regionText(current)}` : ''}`
        : t('you_market_unset');
    }

    /** The optional region step, present only for a chosen country that has regions to name. */
    function paintRegions() {
      const current = store.market();
      const chosen = findCountry(current.code || current.country);
      const regions = chosen ? regionsOf(chosen.code) : [];
      const section = root.querySelector('[data-regions]');
      section.hidden = regions.length === 0;
      if (regions.length === 0) return;
      const has = findRegion(chosen.code, current.region);
      const sorted = regions.slice().sort((a, b) => regionLabel(chosen.code, a.en, lang()).localeCompare(regionLabel(chosen.code, b.en, lang()), lang()));
      const row = (value, label, on) => `
        <button type="button" class="ilist-row mkt-row${on ? ' on' : ''}" role="radio" aria-checked="${on}"
                data-region="${escapeHtml(value)}">
          <span class="ilist-l">${escapeHtml(label)}</span>
          ${rowCheck()}
        </button>`;
      fill(
        root.querySelector('[data-region-list]'),
        row('', t('market_region_none'), !has) + sorted.map((r) => row(r.en, lang() === 'fr' ? r.fr : r.en, has?.code === r.code)).join(''),
        'data-region',
        syncRegions,
      );
    }

    function paint() {
      paintCountries();
      paintRegions();
    }

    shell();
    syncCountries = wireRadioGroup(root.querySelector('[data-list]'), { signal: ac.signal });
    syncRegions = wireRadioGroup(root.querySelector('[data-region-list]'), { signal: ac.signal });
    paint();
    const unsub = store.subscribe(paint);

    on(root, 'input', (e) => {
      if (!e.target.matches('[data-q]')) return;
      query = e.target.value;
      paintCountries();
    }, ac.signal);

    on(root, 'click', (e) => {
      // You is the only way in, so the browser's own back already lands there.
      if (e.target.closest('[data-act="back"]')) { goBack(ctx, 'you'); return; }
      if (e.target.closest('[data-act="camera"]')) { ctx.go('camera'); return; }
      if (e.target.closest('[data-act="watchlist"]')) { ctx.go('watchlist'); return; }
      if (e.target.closest('[data-act="you"]')) { ctx.go('you'); return; }
      if (e.target.closest('[data-act="licences"]')) { ctx.go('licences'); return; }
      const region = e.target.closest('[data-region]');
      if (region) { store.setRegion(region.dataset.region); return; }
      const row = e.target.closest('[data-country]');
      if (row) store.setMarket(row.dataset.country, row.dataset.currency, row.dataset.code);
    }, ac.signal);

    return () => {
      unsub();
      ac.abort();
    };
  },
};
