/**
 * Where this comes from. The data-and-licences screen.
 *
 * Nearly everything in this app is somebody else's open data: the product
 * names, the sizes, the allergens, the prices, and the store names attached to
 * those prices. All of it is published under licences that require credit, and
 * before this screen existed the app gave none, anywhere. That is a licence
 * problem rather than a manners problem, which is why this is a real screen
 * with a real route and not a line of small print nobody can reach.
 *
 * The list is NOT written here. It is fetched from the server, where it lives
 * as a fixed list a person edits deliberately. Two reasons it is not duplicated
 * into this file: a second copy drifts the first time somebody updates one of
 * them, and the copy that would go stale is the one making the legal statement.
 *
 * WHAT THIS SCREEN DOES WHEN THE FETCH FAILS. It says so, and offers to try
 * again, and does not quietly render an empty page. An empty attribution screen
 * looks identical to an app with nothing to attribute, which is the one wrong
 * impression this screen exists to prevent. It cannot fall back to a built-in
 * list, because the whole point of the single source is that there isn't one.
 *
 * THE LOADING AND FAILURE LINES ARE SHIN TALKING. They are first person, and
 * they name what was asked for rather than the state of a network request --
 * matching you.js's coverage block, "Asking the engine…" and "I could not reach
 * my own engine to check.", which is the only other place in the app where a
 * screen has to narrate its own fetch. They live in this file for the same
 * reason you.js's live in that one: voice.js is the verdict voice, one line per
 * state per personality, and a fetch narration is not a verdict. If that call
 * is reversed, both screens move together or neither does.
 *
 * Animation: the rows lift in once, 200ms, staggered 40ms. This screen is seen
 * rarely, usually once, which is the only reason it animates at all. The line
 * on the market screen that leads here does not animate, because that one is
 * seen on every visit.
 */

import * as api from '../api.js';
import { html, raw, on } from '../lib/dom.js';

/* Escaped because these strings come off the wire. Nothing in the list is user
   input today, but a screen that interpolates a fetched string into innerHTML
   without escaping is one data change away from being wrong about that. The
   local `esc` this file carried is now `html` from lib/dom.js, which escapes
   every interpolation by default and makes the opt-out say the word. */
function sourceRow(entry, i) {
  /* `.row` is the component layer's row: the padding, surface, hairline and
     radius the saved, past-scan and removed lists already share. licences.css
     turns it into a stack, because this row is three lines rather than a title
     and a value, and that is the only thing about it that is local. */
  return html`
    <li class="row lic-row" style="--i:${String(i)}">
      <p class="lic-name">${entry.name}</p>
      <p class="lic-what">${entry.what}</p>
      <p class="lic-terms">
        <span class="lic-licence">${entry.licence}</span>
        <a class="lic-link" href="${entry.url}" target="_blank" rel="noopener noreferrer">Open</a>
      </p>
    </li>`;
}

export default {
  id: 'licences',
  title: 'Where this comes from',

  render(root, ctx) {
    function shell(inner) {
      root.innerHTML = html`
        <div class="page page-list">
          <header class="page-head">
            <button type="button" class="btn linky pback" data-act="back">Back</button>
            <p class="kicker">Data and licences</p>
            <h1>Where this comes from</h1>
          </header>
          ${raw(inner)}
        </div>`;
    }

    /* `aria-busy` is what tells a screen reader what the ellipsis tells
       everybody else. The region is `polite` rather than `assertive`: the list
       arriving is not an interruption. */
    function paintLoading() {
      shell(`
        <p class="fineprint lic-state" role="status" aria-busy="true">
          Asking for the list of sources…
        </p>`);
    }

    /* The failure line is deliberately not in --walk, and licences.css says why:
       failing to load a list is not a bad price, and the one red in this app
       means exactly one thing. */
    function paintFailed() {
      shell(`
        <p class="lic-state lic-failed" role="status">
          I could not reach the list of sources to credit them. It is not being
          shown at all rather than shown short.
        </p>
        <p class="fineprint">
          This app is built on open data from Open Food Facts, Open Prices,
          OpenStreetMap and Open Icecat. The full list, with each licence, is what
          failed to load.
        </p>
        <button type="button" class="btn btn--primary lic-retry" data-act="retry">
          Try again
        </button>`);
    }

    function paintList(sources) {
      shell(`
        <p class="lic-intro">
          Product details, prices and store names in this app are open data,
          collected and published by other people. Each source below sets its own
          terms for reuse, and this is the credit those terms ask for.
        </p>

        <ul class="lic-list">
          ${sources.map(sourceRow).join('')}
        </ul>

        <p class="fineprint lic-foot">
          Shin is not affiliated with any of them. Prices are what somebody
          recorded on the day shown beside them, not an offer, and not checked
          with the shop.
        </p>`);
    }

    /*
     * The leak camera.js fixed for itself and nine screens did not. This
     * listener goes on `#screen`, which the router never replaces -- only its
     * innerHTML -- so before this, every visit
     * to the screen left another live handler behind it, and a retry tapped on
     * the fourth visit fired four fetches at once. One AbortController per
     * render, aborted in the cleanup, exactly as camera.js:915 does it. It also
     * stands in for the `dead` flag the in-flight fetch used to check, so there
     * is one answer to "is this render still the current one?" instead of two.
     */
    const listeners = new AbortController();
    const gone = () => listeners.signal.aborted;

    async function load() {
      paintLoading();
      try {
        const res = await api.attribution();
        if (gone()) return;
        const sources = res && Array.isArray(res.sources) ? res.sources : [];
        /* An empty list is a failure, not an answer. The server holds a fixed
           list that is never empty, so zero rows means we did not really get it,
           and rendering "no sources" would state the opposite of the truth. */
        if (sources.length === 0) paintFailed();
        else paintList(sources);
      } catch {
        if (!gone()) paintFailed();
      }
    }

    on(root, 'click', (e) => {
      if (e.target.closest('[data-act="back"]')) { ctx.go('market'); return; }
      if (e.target.closest('[data-act="retry"]')) load();
    }, listeners.signal);

    load();
    return () => listeners.abort();
  },
};
